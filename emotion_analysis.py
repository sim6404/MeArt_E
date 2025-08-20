import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')
import os
import json
import numpy as np
import cv2
import onnxruntime as ort
import gc  # 메모리 관리용

FERPLUS_EMOTIONS = [
    "neutral", "happiness", "surprise", "sadness",
    "anger", "disgust", "fear", "contempt"
]

ONNX_MODEL = os.path.join("models", "emotion-ferplus-8.onnx")

def softmax(x):
    e_x = np.exp(x - np.max(x))
    return e_x / e_x.sum()

def preprocess_face(image_path):
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError("이미지 파일을 열 수 없습니다.")
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    faces = face_cascade.detectMultiScale(gray, 1.1, 4)
    if len(faces) == 0:
        h, w = gray.shape
        ch, cw = 64, 64
        y1 = max(0, (h - ch) // 2)
        x1 = max(0, (w - cw) // 2)
        crop = gray[y1:y1+ch, x1:x1+cw]
    else:
        (x, y, w, h) = max(faces, key=lambda rect: rect[2]*rect[3])
        size = max(w, h)
        cx, cy = x + w // 2, y + h // 2
        x1 = max(0, cx - size // 2)
        y1 = max(0, cy - size // 2)
        x2 = min(gray.shape[1], x1 + size)
        y2 = min(gray.shape[0], y1 + size)
        crop = gray[y1:y2, x1:x2]
    crop = cv2.equalizeHist(crop)
    crop = cv2.resize(crop, (64, 64))
    arr = crop.astype(np.float32)
    arr = arr[np.newaxis, np.newaxis, :, :]
    return arr

def analyze_emotion(image_path):
    try:
        print(f"감정 분석 시작: {image_path}")
        print(f"모델 경로: {ONNX_MODEL}")
        print(f"모델 파일 존재: {os.path.exists(ONNX_MODEL)}")
        
        arr = preprocess_face(image_path)
        print(f"전처리 완료, 배열 형태: {arr.shape}")
        
        session = ort.InferenceSession(ONNX_MODEL, providers=["CPUExecutionProvider"])
        input_name = session.get_inputs()[0].name
        print(f"모델 로드 완료, 입력 이름: {input_name}")
        
        outputs = session.run(None, {input_name: arr})
        scores = outputs[0][0]
        probs = softmax(scores)
        top_idx = probs.argsort()[-3:][::-1]
        top_emotions = [
            {
                "emotion": FERPLUS_EMOTIONS[i],
                "probability": float(probs[i]),
                "percentage": float(probs[i] * 100)
            }
            for i in top_idx
        ]
        # angry/neutral 확률이 비슷하면 angry로 보정
        main_idx = int(np.argmax(probs))
        angry_idx = 4
        neutral_idx = 0
        if main_idx == neutral_idx and angry_idx in top_idx:
            if abs(probs[neutral_idx] - probs[angry_idx]) < 0.18 and probs[angry_idx] > 0.35:
                main_idx = angry_idx
        result = {
            "top_emotions": top_emotions,
            "emotion": FERPLUS_EMOTIONS[main_idx],
            "confidence": float(probs[main_idx])
        }
        print(f"감정 분석 완료: {result['emotion']}")
        
        # 메모리 정리 (Render 환경 최적화)
        del img_array, probs, session
        gc.collect()
        
        return result
    except Exception as e:
        print(f"감정 분석 중 오류 발생: {e}", file=sys.stderr)
        gc.collect()  # 오류 시에도 메모리 정리
        return {"emotion": "neutral", "confidence": 0.0, "error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) > 1:
        image_path = sys.argv[1]
        analysis_result = analyze_emotion(image_path)
        print(json.dumps(analysis_result, ensure_ascii=False))
    else:
        print("사용법: python emotion_analysis.py <이미지_경로>")