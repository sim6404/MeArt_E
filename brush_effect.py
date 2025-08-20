#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Neural Style Transfer 기반 브러쉬(유화) 효과 적용 스크립트
참고: https://github.com/tensorflow/docs/blob/master/site/en/tutorials/generative/style_transfer.ipynb
필요 패키지: tensorflow, tensorflow_hub, numpy, pillow
설치: pip install tensorflow tensorflow_hub numpy pillow
사용법: python brush_effect.py <input_path> <output_path> [<style_path>]
- input_path: 배경 제거된 인물 PNG
- output_path: 스타일 트랜스퍼 결과 PNG
- style_path: (선택) 유화 스타일 이미지 경로 (없으면 기본값)
"""
import sys
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance
import os
import gc

# TensorFlow 관련 import 및 초기화 (오류 처리 포함)
try:
    import tensorflow as tf
    import tensorflow_hub as hub
    
    # TensorFlow 메모리 최적화 설정 (조건부)
    gpus = tf.config.list_physical_devices('GPU')
    if gpus:
        try:
            tf.config.experimental.set_memory_growth(gpus[0], True)
        except RuntimeError:
            pass
    
    TENSORFLOW_AVAILABLE = True
    print("TensorFlow 및 TensorFlow Hub 로드 완료")
except ImportError as e:
    print(f"TensorFlow 로드 실패: {e}")
    print("PIL 기반 브러시 효과로 대체됩니다.")
    TENSORFLOW_AVAILABLE = False

# 전역 변수로 모델 캐시
_hub_model = None

def get_hub_model():
    """모델을 한 번만 로드하고 캐시 (네트워크 오류 처리 포함)"""
    global _hub_model
    if _hub_model is None:
        try:
            print("TensorFlow Hub 모델 다운로드 중... (최초 실행 시 시간이 걸릴 수 있습니다)")
            _hub_model = hub.load('https://tfhub.dev/google/magenta/arbitrary-image-stylization-v1-256/2')
            print("TensorFlow Hub 모델 로드 완료")
        except Exception as e:
            print(f"TensorFlow Hub 모델 로드 실패: {e}")
            print("네트워크 연결을 확인하거나 PIL 기반 효과로 대체됩니다.")
            raise e
    return _hub_model

def load_img(path, max_dim=512):  # 최대 크기를 512로 증가하여 해상도 향상
    img = Image.open(path).convert('RGB')
    img = np.array(img)
    h, w = img.shape[:2]
    scale = max_dim / max(h, w)
    new_shape = (int(h * scale), int(w * scale))
    img = Image.fromarray(img).resize((new_shape[1], new_shape[0]), Image.LANCZOS)
    img = np.array(img).astype(np.float32) / 255.0
    img = np.expand_dims(img, axis=0)
    return img

def tensor_to_image(tensor):
    tensor = tensor * 255
    tensor = np.array(tensor, dtype=np.uint8)
    if np.ndim(tensor) > 3:
        tensor = tensor[0]
    return Image.fromarray(tensor)

def apply_advanced_brush_effect_pil(image):
    """고품질 PIL 기반 브러시 효과 (TensorFlow 대체용) - 알파 채널 보존"""
    print("고급 PIL 브러시 효과 적용 중...")
    
    # 0. 알파 채널 보존을 위해 RGBA로 변환
    has_alpha = image.mode == 'RGBA'
    if has_alpha:
        alpha_channel = image.split()[-1]  # 알파 채널 저장
    image = image.convert('RGB')  # RGB로 변환하여 처리
    
    # 1. 이미지 크기 조정 (모바일 최적화된 처리 속도 향상)
    original_size = image.size
    max_dimension = max(original_size)
    
    # 모바일 최적화: 더 작은 크기로 처리하여 성능 향상
    # 원본이 매우 큰 경우 더 적극적으로 축소
    if max_dimension > 2048:
        # 대형 이미지: 1024px로 축소
        target_size = 1024
    elif max_dimension > 1024:
        # 중형 이미지: 800px로 축소 (모바일 최적화)
        target_size = 800
    else:
        # 소형 이미지: 그대로 사용
        target_size = max_dimension
    
    if max_dimension > target_size:
        scale_factor = target_size / max_dimension
        new_size = (int(original_size[0] * scale_factor), int(original_size[1] * scale_factor))
        image = image.resize(new_size, Image.LANCZOS)
        if has_alpha:
            alpha_channel = alpha_channel.resize(new_size, Image.LANCZOS)
        print(f"모바일 최적화 크기 조정: {original_size} → {new_size} (target: {target_size}px)")
    
    # 2. 부드러운 블러 효과 (더 자연스러운 유화 느낌)
    image = image.filter(ImageFilter.GaussianBlur(radius=1.5))  # 1.0 → 1.5로 증가
    
    # 2-1. 미세한 추가 블러 레이어 (부드러운 유화 효과)
    soft_blur = image.filter(ImageFilter.GaussianBlur(radius=2.5))  # 2.0 → 2.5로 증가
    image = Image.blend(image, soft_blur, 0.45)  # 35% → 45% 블렌딩으로 증가
    
    # 2-2. 추가 스무딩 레이어 (얼룩덜룩함 방지)
    smooth_layer = image.filter(ImageFilter.GaussianBlur(radius=1.8))  # 1.2 → 1.8로 증가
    image = Image.blend(image, smooth_layer, 0.25)  # 15% → 25% 추가 블렌딩
    
    # 3. 색상 강화 및 조정 (극도로 부드럽게)
    enhancer = ImageEnhance.Color(image)
    image = enhancer.enhance(1.05)  # 색상 강화 (1.08 → 1.05로 더 감소)
    
    # 4. 대비 강화 (극도로 부드럽게)
    enhancer = ImageEnhance.Contrast(image)
    image = enhancer.enhance(1.05)  # 대비 강화 (1.1 → 1.05로 더 감소)
    
    # 5. 밝기 미세 조정 (자연스럽게)
    enhancer = ImageEnhance.Brightness(image)
    image = enhancer.enhance(1.01)  # 밝기 증가 (1.03 → 1.01로 더 감소)
    
    # 6. 선명도 조정 (극도로 부드럽게)
    enhancer = ImageEnhance.Sharpness(image)
    image = enhancer.enhance(0.6)  # 극도로 부드럽게 (0.7 → 0.6으로 더 감소)
    
    # 7. 고급 노이즈 효과 (유화 브러시 터치 느낌)
    img_array = np.array(image)
    
    # 노이즈 패턴 생성 (극도로 미세한 유화 느낌, 얼룩덜룩함 최소화)
    noise_pattern = np.random.normal(0, 0.4, img_array.shape[:2])  # 0.8 → 0.4로 대폭 감소
    noise_pattern = np.clip(noise_pattern, -1, 1)  # -2,2 → -1,1로 대폭 감소
    
    # RGB 채널별로 노이즈 적용
    for i in range(3):
        img_array[:, :, i] = np.clip(img_array[:, :, i] + noise_pattern, 0, 255)
    
    # 8. 피부톤 강화 색상 조정 (자연스러운 피부톤)
    img_array = img_array.astype(np.float32)
    
    # 피부톤을 위한 따뜻한 색감 강화
    img_array[:, :, 0] = np.clip(img_array[:, :, 0] * 1.05, 0, 255)  # 빨강 증가 (피부톤)
    img_array[:, :, 1] = np.clip(img_array[:, :, 1] * 1.02, 0, 255)  # 녹색 미세 증가 (자연스러운 피부톤)
    img_array[:, :, 2] = np.clip(img_array[:, :, 2] * 0.95, 0, 255)  # 파랑 감소 (따뜻한 톤)
    img_array = img_array.astype(np.uint8)
    
    image = Image.fromarray(img_array)
    
    # 9. 최종 미세 조정 (매우 자연스럽게)
    enhancer = ImageEnhance.Color(image)
    image = enhancer.enhance(1.02)  # 최종 색상 조정 (1.05 → 1.02로 더 감소)
    
    # 9-1. 최종 부드러움 처리 (얼룩덜룩함 완전 제거)
    final_smooth = image.filter(ImageFilter.GaussianBlur(radius=1.2))  # 0.8 → 1.2로 증가
    image = Image.blend(image, final_smooth, 0.35)  # 20% → 35% 최종 스무딩으로 증가
    
    # 9-2. 추가 부드러움 레이어 (완벽한 유화 질감)
    ultra_smooth = image.filter(ImageFilter.GaussianBlur(radius=2.0))
    image = Image.blend(image, ultra_smooth, 0.15)  # 추가 15% 초부드러움
    
    # 10. 원본 크기로 복원
    if image.size != original_size:
        image = image.resize(original_size, Image.LANCZOS)
        if has_alpha:
            alpha_channel = alpha_channel.resize(original_size, Image.LANCZOS)
        print(f"원본 크기로 복원: {image.size}")
    
    # 11. 알파 채널 복원
    if has_alpha:
        image = image.convert('RGBA')
        image.putalpha(alpha_channel)
    
    print("고급 PIL 브러시 효과 완료!")
    return image

def main():
    if len(sys.argv) < 3:
        print('사용법: python brush_effect.py <input_path> <output_path> [<style_path>]')
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    
    # 스타일 경로 설정 (TensorFlow 사용 시에만)
    style_path = None
    if TENSORFLOW_AVAILABLE:
        if len(sys.argv) >= 4:
            style_path = sys.argv[3]
        else:
            # 기본 스타일 이미지 (BG_image 폴더 내 임의의 유화 이미지)
            style_path = os.path.join(os.path.dirname(__file__), 'BG_image', 'the_bathers_1951.5.1.jpg')
            if not os.path.exists(style_path):
                print('기본 스타일 이미지가 없습니다. PIL 기반 효과로 대체됩니다.')
                style_path = None
    
    try:
        # 이미지 로드 (알파 채널 보존)
        orig_img = Image.open(input_path).convert('RGBA')
        
        # TensorFlow Neural Style Transfer 시도
        if TENSORFLOW_AVAILABLE and style_path and os.path.exists(style_path):
            try:
                print("Neural Style Transfer 시도 중...")
                content_image = load_img(input_path)
                style_image = load_img(style_path)
                
                # 캐시된 모델 사용
                hub_model = get_hub_model()
                
                # 스타일 트랜스퍼 실행
                stylized_image = hub_model(tf.constant(content_image), tf.constant(style_image))[0]
                
                # 결과 저장
                out_img = tensor_to_image(stylized_image)
                print("Neural Style Transfer 완료!")
                
            except Exception as e:
                print(f"Neural Style Transfer 실패: {e}")
                print("PIL 기반 브러시 효과로 대체됩니다...")
                out_img = apply_advanced_brush_effect_pil(orig_img)
        else:
            # PIL 기반 브러시 효과 사용
            print("PIL 기반 브러시 효과 사용...")
            out_img = apply_advanced_brush_effect_pil(orig_img)
        
        # 알파 채널(투명도) 보존 및 투명 영역 보호
        orig = Image.open(input_path).convert('RGBA')
        
        # 원본 크기로 리사이즈 (해상도 보존)
        if out_img.size != orig.size:
            out_img = out_img.resize(orig.size, Image.LANCZOS)
            print(f"이미지 크기 조정: {out_img.size} → {orig.size}")
        
        # 브러시 효과 이미지를 RGBA로 변환
        out_img = out_img.convert('RGBA')
        
        # 명도, 채도, 대비 조정 (인물 부분에만 적용)
        enhanced_img = ImageEnhance.Brightness(out_img).enhance(1.08)  # 밝기 8% 증가
        enhanced_img = ImageEnhance.Color(enhanced_img).enhance(1.10)   # 채도 10% 증가
        enhanced_img = ImageEnhance.Contrast(enhanced_img).enhance(1.40) # 대비 40% 증가
        
        # 알파 마스크를 사용하여 투명한 부분은 완전히 투명하게, 불투명한 부분만 브러시 효과 적용
        alpha_mask = orig.split()[-1]  # 원본 알파 채널 추출
        
        # 브러시 효과가 적용된 이미지에 원본 알파 채널 적용
        enhanced_img.putalpha(alpha_mask)
        
        out_img = enhanced_img
        
        out_img.save(output_path)
        print('브러시 효과 완료:', output_path)
        
        # 메모리 정리
        del orig_img, out_img, orig
        if 'content_image' in locals():
            del content_image, style_image, stylized_image
        gc.collect()
        
    except Exception as e:
        print(f'오류 발생: {e}')
        sys.exit(1)

if __name__ == '__main__':
    main() 