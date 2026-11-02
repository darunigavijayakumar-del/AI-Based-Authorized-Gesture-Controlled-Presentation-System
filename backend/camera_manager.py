import cv2
import threading
import time
import numpy as np

class CameraManager:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(CameraManager, cls).__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self, camera_index=0):
        if self._initialized:
            return
        self.camera_index = camera_index
        self.cap = None
        self.running = False
        self.thread = None
        self.current_frame = None
        self.frame_id = 0
        self.consecutive_drops = 0
        self.frame_lock = threading.Lock()
        self.is_connected = False
        self.last_frame_time = 0
        self.error_message = ""
        self._initialized = True
        self.start()

    def start(self):
        if self.running:
            return
        self.running = True
        self.thread = threading.Thread(target=self._capture_loop, daemon=True)
        self.thread.start()

    def _open_camera(self):
        try:
            if self.cap is not None:
                try:
                    self.cap.release()
                except Exception:
                    pass
            
            # Use DirectShow on Windows for fast webcam init
            self.cap = cv2.VideoCapture(self.camera_index, cv2.CAP_DSHOW)
            if not self.cap.isOpened():
                # Fallback to default backend
                self.cap = cv2.VideoCapture(self.camera_index)
            
            if self.cap.isOpened():
                self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                self.cap.set(cv2.CAP_PROP_FPS, 30)
                try:
                    self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                except Exception:
                    pass
                self.is_connected = True
                self.error_message = ""
                self.consecutive_drops = 0
                return True
            else:
                self.is_connected = False
                self.error_message = f"Camera index {self.camera_index} could not be opened."
                return False
        except Exception as e:
            self.is_connected = False
            self.error_message = str(e)
            return False

    def _capture_loop(self):
        self._open_camera()
        tick = 0
        while self.running:
            frame_captured = False
            if self.cap and self.cap.isOpened():
                success, frame = self.cap.read()
                if success and frame is not None and frame.size > 0:
                    self.consecutive_drops = 0
                    # Flip frame horizontally for mirror selfie view
                    frame = cv2.flip(frame, 1)
                    with self.frame_lock:
                        self.current_frame = frame
                        self.last_frame_time = time.time()
                        self.frame_id += 1
                        self.is_connected = True
                    frame_captured = True
                else:
                    self.consecutive_drops += 1
            else:
                self.consecutive_drops += 1

            if not frame_captured:
                # Keep showing last good frame for temporary dropouts (up to ~15 drops = 0.5s)
                if self.consecutive_drops < 15 and self.current_frame is not None:
                    time.sleep(0.01)
                    continue

                # Camera genuinely offline / unavailable -> show high-tech fallback graphic
                self.is_connected = False
                tick += 1
                fallback_frame = self._generate_fallback_frame(tick)
                with self.frame_lock:
                    self.current_frame = fallback_frame
                    self.last_frame_time = time.time()
                    self.frame_id += 1
                time.sleep(0.04)

                # Periodically attempt reconnect if offline
                if tick % 60 == 0:
                    self._open_camera()

    def _generate_fallback_frame(self, tick):
        h, w = 480, 640
        frame = np.zeros((h, w, 3), dtype=np.uint8)
        # Background dark blue-purple
        frame[:] = (35, 22, 16)

        # Draw grid
        grid_color = (60, 40, 30)
        for x in range(0, w, 40):
            cv2.line(frame, (x, 0), (x, h), grid_color, 1)
        for y in range(0, h, 40):
            cv2.line(frame, (0, y), (w, y), grid_color, 1)

        # Glowing animated circle
        radius = int(50 + 15 * np.sin(tick * 0.1))
        cv2.circle(frame, (w // 2, h // 2 - 20), radius, (255, 99, 108), 2)
        cv2.circle(frame, (w // 2, h // 2 - 20), max(5, radius - 15), (248, 189, 56), 1)

        # Text banner
        title = "AI PRESENTATION CAMERA"
        cv2.putText(frame, title, (w // 2 - 140, h // 2 - 100), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        
        status_text = "WEBCAM CONNECTING / SIMULATED FEED"
        cv2.putText(frame, status_text, (w // 2 - 190, h // 2 + 70), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (56, 189, 248), 1)

        time_str = time.strftime("%H:%M:%S")
        cv2.putText(frame, f"System Active: {time_str}", (w // 2 - 90, h // 2 + 105), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (180, 180, 220), 1)

        return frame

    def get_frame(self):
        with self.frame_lock:
            if self.current_frame is not None:
                return self.current_frame.copy()
            return self._generate_fallback_frame(0)

    def get_frame_with_id(self):
        with self.frame_lock:
            if self.current_frame is not None:
                return self.current_frame.copy(), self.frame_id
            return self._generate_fallback_frame(0), 0

    def change_camera(self, new_index):
        if self.camera_index != new_index:
            self.camera_index = new_index
            self._open_camera()
            return True
        return False

    def release(self):
        self.running = False
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=1.0)
        if self.cap and self.cap.isOpened():
            self.cap.release()
        self.is_connected = False

camera_manager = CameraManager()
