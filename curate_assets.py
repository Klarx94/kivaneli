import os
import shutil
import glob
from PIL import Image

base_dir = r"C:\Users\karc0\OneDrive\Desktop\kivaneli"
assets_dir = os.path.join(base_dir, "assets")
img_dir = os.path.join(assets_dir, "images")
vid_dir = os.path.join(assets_dir, "videos")

os.makedirs(img_dir, exist_ok=True)
os.makedirs(vid_dir, exist_ok=True)

# Copy and rename videos with clean web slugs
shutil.copyfile(os.path.join(base_dir, "Producto 1.mp4"), os.path.join(vid_dir, "adeus_tratamiento.mp4"))
shutil.copyfile(os.path.join(base_dir, "Producto 2 base upsell strella.mp4"), os.path.join(vid_dir, "kormesic_patches.mp4"))
shutil.copyfile(os.path.join(base_dir, "Producto 3 upsell complemento.mp4"), os.path.join(vid_dir, "kojic_soap.mp4"))

# Map best extracted frames to curated marketing assets
frame_dir = os.path.join(base_dir, "extracted_frames")

asset_map = {
    "Producto 1_frame_1.jpg": "adeus_jar_botanicals.jpg",
    "Producto 1_frame_2.jpg": "adeus_application_legs.jpg",
    "Producto 1_frame_3.jpg": "adeus_spa_massage.jpg",
    "Producto 1_frame_6.jpg": "adeus_ugc_phone.jpg",
    "Producto 2 base upsell strella_frame_1.jpg": "kormesic_jar_purple.jpg",
    "Producto 2 base upsell strella_frame_4.jpg": "kormesic_patch_face.jpg",
    "Producto 3 upsell complemento_frame_1.jpg": "kojic_soap_box.jpg",
    "Producto 3 upsell complemento_frame_5.jpg": "kojic_soap_application.jpg"
}

for src_name, dst_name in asset_map.items():
    src_path = os.path.join(frame_dir, src_name)
    if os.path.exists(src_path):
        img = Image.open(src_path)
        dst_path = os.path.join(img_dir, dst_name)
        img.save(dst_path, quality=90)
        print(f"Saved asset: {dst_name} ({img.size})")

print("Asset curation complete!")
