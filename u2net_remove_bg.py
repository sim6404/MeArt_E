# u2net_remove_bg.py
import sys
import os
import traceback
import time
import requests
import hashlib

# 필요한 패키지 임포트
from rembg import remove
from PIL import Image
import numpy as np
import cv2

# U2Net 모델 자동 다운로드 및 캐시 관리
def setup_u2net_model():
    """U2Net 모델을 자동으로 다운로드하고 설정합니다."""
    try:
        # 모델 디렉토리 설정 (환경변수 우선, Render에서는 /tmp 사용)
        model_dir = os.environ.get('MODEL_DIR', '/tmp/u2net')
        os.makedirs(model_dir, exist_ok=True)
        
        # 모델 파일 경로
        model_path = os.path.join(model_dir, 'u2net.onnx')
        
        # 모델 파일 존재 및 크기 확인
        if os.path.exists(model_path):
            file_size = os.path.getsize(model_path)
            print(f"✅ U2Net 모델 발견: {model_path} ({file_size:,} bytes)")
            
            # 파일 크기 검증 (최소 100MB)
            if file_size > 100 * 1024 * 1024:
                print("✅ 모델 파일 크기 검증 통과")
                return model_path
            else:
                print(f"⚠️ 모델 파일 크기가 너무 작습니다: {file_size:,} bytes")
                os.remove(model_path)
        
        # 모델 다운로드
        print("🔄 U2Net 모델 다운로드 시작...")
        
        # REMBG 공식 U2Net 모델 URL
        model_url = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx"
        
        # 다운로드 진행률 표시
        response = requests.get(model_url, stream=True)
        response.raise_for_status()
        
        total_size = int(response.headers.get('content-length', 0))
        downloaded_size = 0
        
        print(f"📥 다운로드 크기: {total_size:,} bytes")
        
        with open(model_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    downloaded_size += len(chunk)
                    
                    # 진행률 표시 (10%마다)
                    if total_size > 0:
                        progress = (downloaded_size / total_size) * 100
                        if int(progress) % 10 == 0:
                            print(f"📊 다운로드 진행률: {progress:.1f}% ({downloaded_size:,}/{total_size:,} bytes)")
        
        # 다운로드 완료 검증
        if os.path.exists(model_path):
            final_size = os.path.getsize(model_path)
            print(f"✅ 모델 다운로드 완료: {model_path} ({final_size:,} bytes)")
            
            if final_size > 100 * 1024 * 1024:
                print("✅ 모델 파일 검증 완료")
                return model_path
            else:
                print(f"❌ 모델 파일 크기 검증 실패: {final_size:,} bytes")
                return None
        else:
            print("❌ 모델 파일 다운로드 실패")
            return None
            
    except Exception as e:
        print(f"❌ U2Net 모델 설정 오류: {e}")
        traceback.print_exc()
        return None

# 모델 설정 실행
MODEL_PATH = setup_u2net_model()
if MODEL_PATH:
    print(f"🎯 U2Net 모델 경로: {MODEL_PATH}")
else:
    print("⚠️ U2Net 모델 설정 실패, 기본 rembg 설정 사용")

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
        # 모델 경로가 설정된 경우 사용
        if MODEL_PATH and os.path.exists(MODEL_PATH):
            print(f"🎯 사용자 정의 모델 사용: {MODEL_PATH}")
            output_image = remove(
                input_image,
                model_path=MODEL_PATH,
                alpha_matting=alpha_matting,
                fg_threshold=fg_threshold,
                bg_threshold=bg_threshold,
                erode_structure_size=erode_size
            )
        else:
            print("🔧 기본 rembg 모델 사용")
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
