
import cv2
cap = cv2.VideoCapture(r"C:/Users/karc0/OneDrive/Desktop/kivaneli/assets/videos/adeus_tratamiento.mp4")
ret, frame = cap.read()
if ret:
    cv2.imwrite(r"C:/Users/karc0/OneDrive/Desktop/kivaneli/assets/images/adeus_hero_frame1.jpg", frame)
    print("Python extracted frame 1 successfully!")
cap.release()
