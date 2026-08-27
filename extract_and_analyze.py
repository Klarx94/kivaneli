import cv2
import os
import glob
import json
from PIL import Image

video_dir = r"C:\Users\karc0\OneDrive\Desktop\kivaneli"
out_dir = os.path.join(video_dir, "extracted_frames")
os.makedirs(out_dir, exist_ok=True)

videos = glob.glob(os.path.join(video_dir, "*.mp4"))
print(f"Found {len(videos)} videos")

results = {}

for vpath in videos:
    vname = os.path.basename(vpath)
    cap = cv2.VideoCapture(vpath)
    
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    print(f"\n--- Analyzing: {vname} ---")
    print(f"Resolution: {width}x{height}, FPS: {fps:.2f}, Duration: {duration:.2f}s, Total Frames: {total_frames}")
    
    # Extract 6 evenly spaced keyframes
    step = max(1, total_frames // 6)
    extracted = []
    
    for i in range(6):
        frame_idx = min(i * step + 15, total_frames - 1)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        if ret:
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            img = Image.fromarray(frame_rgb)
            img_name = f"{os.path.splitext(vname)[0]}_frame_{i+1}.jpg"
            img_path = os.path.join(out_dir, img_name)
            img.save(img_path, quality=85)
            extracted.append(img_path)
            
    cap.release()
    results[vname] = {
        "duration_sec": duration,
        "resolution": f"{width}x{height}",
        "frames": extracted
    }

print("\n=== EXTRACTION COMPLETE ===")
with open(os.path.join(video_dir, "video_analysis.json"), "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2)
print("Analysis saved to video_analysis.json")
