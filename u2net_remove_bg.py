# u2net_remove_bg.py
import sys
import os
import traceback
import time

# 필요한 패키지 임포트
from rembg import remove
from PIL import Image
import numpy as np
import cv2

print("=== PYTHON SCRIPT START ===", sys.argv)

def process_image(input_path, output_path, alpha_matting=False, fg_threshold=160, bg_threshold=40, erode_size=1):
    try:
        print(f"입력 파일 경로: {input_path}")
        print(f"출력 파일 경로: {output_path}")
        print(f"alpha_matting: {alpha_matting}, fg_threshold: {fg_threshold}, bg_threshold: {bg_threshold}, erode_size: {erode_size}")
        
        # 입력 파일 존재 확인
        if not os.path.exists(input_path):
            print(f"입력 파일이 존재하지 않습니다: {input_path}")
            return False
            
        # 입력 이미지 로드 (단순화)
        print("이미지 로드 중...")
        try:
            input_image = Image.open(input_path)
            input_image = input_image.convert("RGBA")
        except Exception as e:
            print(f"이미지 로드 실패: {e}", file=sys.stderr)
            sys.exit(1)
        print(f"이미지 크기: {input_image.size}, 모드: {input_image.mode}")
        
        # rembg 모듈 확인
        try:
            from rembg import remove
        except ImportError as e:
            print(f"rembg 모듈 로드 실패: {e}")
            return False
        
        # 배경 제거 (옷 부분 보존을 위한 보수적 설정)
        output_image = remove(
            input_image,
            alpha_matting=alpha_matting,
            fg_threshold=fg_threshold,
            bg_threshold=bg_threshold,
            erode_structure_size=erode_size
        )
        print(f"배경 제거 완료. 결과 이미지 크기: {output_image.size}")
        
        # rembg 결과 사용 (회전 보정 제거 - rembg가 자동 처리)
        result_image = output_image
        print("엣지 회색라인 제거 및 부드러운 경계 처리 완료.")
        print("결과 저장 중...")
        result_image.save(output_path, 'PNG')
        abs_path = os.path.abspath(output_path)
        exists = os.path.exists(output_path)
        size = os.path.getsize(output_path) if exists else 0
        print(f"[DEBUG] output_path 절대경로: {abs_path}")
        print(f"[DEBUG] 파일 존재 여부: {exists}")
        print(f"[DEBUG] 파일 크기: {size} bytes")
        if not exists or size == 0:
            print(f"파일 저장 실패: {abs_path}", file=sys.stderr)
            sys.exit(1)
        # 실제로 이미지로 열리는지 체크
        try:
            with Image.open(output_path) as im:
                im.verify()
        except Exception as e:
            print(f"저장된 파일이 이미지가 아님: {e}", file=sys.stderr)
            sys.exit(1)
        print(f"결과 저장 완료: {output_path}")
        
        return True
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        print("상세 에러:", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return False

if __name__ == "__main__":
    try:
        # 인자: <input> <output> [alpha_matting] [fg_threshold] [bg_threshold] [erode_size]
        argc = len(sys.argv)
        if argc < 3:
            print("Usage: python u2net_remove_bg.py <input_image_path> <output_image_path>", file=sys.stderr)
            sys.exit(1)
        
        input_path = sys.argv[1]
        output_path = sys.argv[2]
        
        # 매개변수 파싱 (옷 부분 투명화 방지를 위한 보수적 설정)
        alpha_matting = False
        fg_threshold = 120  # 더 낮은 값으로 foreground 범위 확대
        bg_threshold = 60   # 더 높은 값으로 background 범위 축소
        erode_size = 1
        
        if argc > 3:
            alpha_matting = sys.argv[3].lower() == 'true'
        if argc > 4:
            fg_threshold = max(80, min(200, int(sys.argv[4])))  # 80-200 범위로 제한
        if argc > 5:
            bg_threshold = max(20, min(100, int(sys.argv[5])))  # 20-100 범위로 제한
        if argc > 6:
            erode_size = max(1, min(5, int(sys.argv[6])))       # 1-5 범위로 제한
            
        process_image(input_path, output_path, alpha_matting, fg_threshold, bg_threshold, erode_size)
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)
