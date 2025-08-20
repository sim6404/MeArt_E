import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

import cv2
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance
import json

def apply_artistic_effect(input_path, output_path):
    """
    TensorFlow 없이 OpenCV와 PIL을 사용한 경량 브러시 효과
    """
    try:
        print("경량 브러시 효과 시작...")
        
        # 이미지 로드
        img = cv2.imread(input_path, cv2.IMREAD_UNCHANGED)
        if img is None:
            raise ValueError(f"이미지를 로드할 수 없습니다: {input_path}")
        
        print(f"이미지 크기: {img.shape}")
        
        # BGR을 RGB로 변환
        if len(img.shape) == 4:  # RGBA
            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGRA2RGB)
            alpha = img[:, :, 3]
        else:  # RGB
            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            alpha = None
        
        # PIL 이미지로 변환
        pil_img = Image.fromarray(img_rgb)
        
        # 1. 유화 효과 (Oil Painting Effect)
        # 색상 팔레트 감소
        img_array = np.array(pil_img)
        img_array = img_array // 16 * 16  # 색상 양자화
        
        # 2. 블러 효과로 브러시 스트로크 시뮬레이션
        pil_img = Image.fromarray(img_array)
        pil_img = pil_img.filter(ImageFilter.GaussianBlur(radius=1.5))
        
        # 3. 에지 강화 (붓질 경계 강조)
        enhancer = ImageEnhance.Sharpness(pil_img)
        pil_img = enhancer.enhance(1.5)
        
        # 4. 색상 대비 향상
        enhancer = ImageEnhance.Contrast(pil_img)
        pil_img = enhancer.enhance(1.2)
        
        # 5. 채도 약간 증가
        enhancer = ImageEnhance.Color(pil_img)
        pil_img = enhancer.enhance(1.1)
        
        # OpenCV로 다시 변환하여 추가 효과
        result_array = np.array(pil_img)
        
        # 6. 브러시 텍스처 효과 (bilateral filter)
        result_array = cv2.bilateralFilter(result_array, 15, 80, 80)
        
        # 7. 약간의 노이즈 추가 (캔버스 텍스처)
        noise = np.random.normal(0, 3, result_array.shape).astype(np.int16)
        result_array = np.clip(result_array.astype(np.int16) + noise, 0, 255).astype(np.uint8)
        
        # 알파 채널 복원
        if alpha is not None:
            result_bgra = cv2.cvtColor(result_array, cv2.COLOR_RGB2BGRA)
            result_bgra[:, :, 3] = alpha
            result_array = result_bgra
        else:
            result_array = cv2.cvtColor(result_array, cv2.COLOR_RGB2BGR)
        
        # 결과 저장
        success = cv2.imwrite(output_path, result_array)
        if not success:
            raise ValueError(f"이미지 저장 실패: {output_path}")
        
        print(f"경량 브러시 효과 완료: {output_path}")
        
        return {
            "success": True,
            "message": "경량 브러시 효과 적용 완료",
            "output_path": output_path
        }
        
    except Exception as e:
        error_msg = f"브러시 효과 처리 중 오류: {str(e)}"
        print(error_msg, file=sys.stderr)
        return {
            "success": False,
            "error": error_msg
        }

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("사용법: python brush_effect_light.py <입력_이미지> <출력_이미지>")
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    
    result = apply_artistic_effect(input_path, output_path)
    print(json.dumps(result, ensure_ascii=False))
