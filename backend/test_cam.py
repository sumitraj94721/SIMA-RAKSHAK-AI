import cv2

# Windows DirectShow backend forces the camera to open
cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)

if not cap.isOpened():
    print("Trying camera index 1...")
    cap = cv2.VideoCapture(1, cv2.CAP_DSHOW)

print("Starting camera feed... Press 'q' on your keyboard to close.")

while True:
    ret, frame = cap.read()
    if not ret:
        print("Camera read failed. Check permissions or close other apps.")
        break

    cv2.putText(frame, "SIH BORDER CAM - OPERATIONAL", (20, 40), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
    
    cv2.imshow("Camera Verification Test", frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()