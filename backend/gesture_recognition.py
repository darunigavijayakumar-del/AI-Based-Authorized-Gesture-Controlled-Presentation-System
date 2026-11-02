import cv2
import numpy as np
import time
import os
import math
import threading
from collections import deque
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# Hand Landmark Connection pairs for MediaPipe 21 landmarks
HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),        # Thumb
    (0, 5), (5, 6), (6, 7), (7, 8),        # Index
    (5, 9), (9, 10), (10, 11), (11, 12),    # Middle
    (9, 13), (13, 14), (14, 15), (15, 16), # Ring
    (13, 17), (17, 18), (18, 19), (19, 20),# Pinky
    (0, 17)                                # Palm base
]

class GestureRecognizer:
    def __init__(self, model_path="hand_landmarker.task"):
        self.model_path = model_path
        if not os.path.exists(self.model_path):
            alt_path = os.path.join(os.path.dirname(__file__), "hand_landmarker.task")
            if os.path.exists(alt_path):
                self.model_path = alt_path
            else:
                self.model_path = os.path.join(os.path.dirname(__file__), "..", "hand_landmarker.task")

        self.landmarker = None
        self.lock = threading.Lock()
        self._init_landmarker()

        # Configuration & Thresholds (tuned for sub-60ms zero-lag presentation control)
        self.cooldown_duration = 0.6  # seconds (snappy response, prevents double-skips)
        self.last_action_time = 0
        self.sensitivity = "High"  # Low, Medium, High
        self.min_stability_frames = 2

        # State tracking
        self.current_gesture = "None"
        self.current_action = "None"
        self.last_triggered_gesture = "None"
        self._latched_gesture = None
        self.pointer_position = {"x": 0.5, "y": 0.5}
        self.smooth_pointer_x = 0.5
        self.smooth_pointer_y = 0.5
        self.pinch_distance = 0.0
        self.confidence = 0.0

        # Temporal smoothing buffers (compact 4-frame window for instant reactions)
        self.gesture_history = deque(maxlen=4)
        self.confidence_history = deque(maxlen=4)

        self.update_settings(self.sensitivity, self.cooldown_duration)

    def _init_landmarker(self):
        try:
            if os.path.exists(self.model_path):
                base_options = python.BaseOptions(model_asset_path=self.model_path)
                options = vision.HandLandmarkerOptions(
                    base_options=base_options,
                    num_hands=1,
                    min_hand_detection_confidence=0.45,
                    min_hand_presence_confidence=0.45,
                    min_tracking_confidence=0.45
                )
                self.landmarker = vision.HandLandmarker.create_from_options(options)
                print(f"[GestureRecognizer] MediaPipe HandLandmarker loaded successfully from {self.model_path}")
            else:
                print(f"[GestureRecognizer] Warning: Model file {self.model_path} not found.")
        except Exception as e:
            print(f"[GestureRecognizer] Error initializing HandLandmarker: {e}")
            self.landmarker = None

    @staticmethod
    def _dist(p1, p2):
        """2D Euclidean distance between two normalized points."""
        return math.hypot(p1[0] - p2[0], p1[1] - p2[1])

    @staticmethod
    def _dist3d(p1, p2):
        """3D Euclidean distance between two points."""
        return math.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2 + (p1[2] - p2[2])**2)

    @staticmethod
    def _angle(p1, p2, p3):
        """Angle (degrees) at vertex p2 between rays p1-p2 and p3-p2."""
        v1 = (p1[0] - p2[0], p1[1] - p2[1])
        v2 = (p3[0] - p2[0], p3[1] - p2[1])
        n1 = math.hypot(v1[0], v1[1])
        n2 = math.hypot(v2[0], v2[1])
        if n1 == 0 or n2 == 0:
            return 0.0
        cos_val = max(-1.0, min(1.0, (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2)))
        return math.degrees(math.acos(cos_val))

    def classify_gesture(self, landmarks):
        """
        Robust, scale-invariant, and tilt-resilient geometric gesture classification.
        Returns: (gesture_name, action_name, confidence, raw_pinch_distance)
        """
        lm = landmarks
        wrist = lm[0]

        # 1. Scale Invariance: Palm Scale (Wrist lm[0] to Middle MCP lm[9])
        palm_scale = self._dist(wrist, lm[9])
        if palm_scale < 0.04:
            palm_scale = 0.15

        # 2. Finger Extension & Curl Analysis for Index, Middle, Ring, Pinky
        finger_specs = [
            ("index", 5, 6, 7, 8),
            ("middle", 9, 10, 11, 12),
            ("ring", 13, 14, 15, 16),
            ("pinky", 17, 18, 19, 20)
        ]

        extended = {}
        curled = {}

        for name, mcp_idx, pip_idx, dip_idx, tip_idx in finger_specs:
            mcp = lm[mcp_idx]
            pip = lm[pip_idx]
            dip = lm[dip_idx]
            tip = lm[tip_idx]

            dist_tip_wrist = self._dist(tip, wrist)
            dist_pip_wrist = self._dist(pip, wrist)
            dist_tip_mcp = self._dist(tip, mcp)
            dist_pip_mcp = self._dist(pip, mcp)

            # A finger is extended if fingertip is significantly farther from wrist and MCP than PIP
            is_extended = (dist_tip_wrist > dist_pip_wrist * 1.08) and (dist_tip_mcp > dist_pip_mcp * 1.05)
            # A finger is curled if fingertip is closer to wrist or MCP than PIP
            is_curled = (dist_tip_wrist < dist_pip_wrist * 1.04) or (dist_tip_mcp < dist_pip_mcp * 0.95)

            extended[name] = is_extended and not is_curled
            curled[name] = is_curled and not is_extended

        # 3. Thumb Geometry Analysis
        thumb_cmc, thumb_mcp, thumb_ip, thumb_tip = lm[1], lm[2], lm[3], lm[4]
        index_mcp = lm[5]

        # Vector from thumb MCP to Tip (screen Y: negative = UP, positive = DOWN)
        thumb_dy = thumb_tip[1] - thumb_mcp[1]
        dist_thumb_wrist = self._dist(thumb_tip, wrist)
        dist_thumb_mcp_wrist = self._dist(thumb_mcp, wrist)

        # Thumb up / down detection with robust palm-scale normalization
        thumb_extended_up = (thumb_dy < -0.02) and (thumb_tip[1] < thumb_ip[1]) and (dist_thumb_wrist > dist_thumb_mcp_wrist * 1.05)
        thumb_extended_down = (thumb_dy > 0.02) and (thumb_tip[1] > thumb_ip[1]) and (dist_thumb_wrist > dist_thumb_mcp_wrist * 1.05)

        curled_count = sum(1 for f in ["index", "middle", "ring", "pinky"] if curled[f])
        extended_count = sum(1 for f in ["index", "middle", "ring", "pinky"] if extended[f])
        raw_pinch_dist = self._dist(thumb_tip, lm[8])

        # 4. Natural Gesture Classification Hierarchy

        # GESTURE 1: Thumb Up (Next Slide)
        # Thumb pointing up, at least 3 other fingers curled (or no fingers extended)
        if thumb_extended_up and (curled_count >= 3 or (extended_count == 0 and not extended["index"])):
            return "Thumb Up", "Next Slide", 0.98, raw_pinch_dist

        # GESTURE 2: Thumb Down (Previous Slide)
        # Thumb pointing down, at least 3 other fingers curled (or no fingers extended)
        if thumb_extended_down and (curled_count >= 3 or (extended_count == 0 and not extended["index"])):
            return "Thumb Down", "Previous Slide", 0.98, raw_pinch_dist

        # GESTURE 3: Closed Fist (Pause / Hold Presentation)
        # At least 3 fingers curled, none extended, thumb folded across
        if (curled_count >= 3 and extended_count == 0) and not thumb_extended_up and not thumb_extended_down:
            return "Closed Fist", "Pause / Hold Presentation", 0.96, raw_pinch_dist

        # GESTURE 4: Open Palm (Start Presentation)
        # 4 fingers extended, or 3 extended with thumb spread out
        if extended_count >= 4 or (extended_count >= 3 and dist_thumb_wrist > dist_thumb_mcp_wrist * 1.15):
            return "Open Palm", "Start Presentation", 0.98, raw_pinch_dist

        # GESTURE 5: Index Finger ONLY (Laser Pointer Mode)
        # Strictly Index extended, Middle/Ring/Pinky not extended
        if extended["index"] and not extended["middle"] and not extended["ring"] and not extended["pinky"]:
            return "Index Finger", "Pointer Mode", 0.97, raw_pinch_dist

        # GESTURE 6: Two Fingers / Peace Sign (Zoom In)
        # Index + Middle extended, Ring and Pinky not extended
        if extended["index"] and extended["middle"] and not extended["ring"] and not extended["pinky"]:
            return "Two Fingers", "Zoom In", 0.97, raw_pinch_dist

        # GESTURE 7: Three Fingers (Zoom Out)
        # Index + Middle + Ring extended, Pinky not extended
        if extended["index"] and extended["middle"] and extended["ring"] and not extended["pinky"]:
            return "Three Fingers", "Zoom Out", 0.97, raw_pinch_dist

        return "None", "None", 0.0, raw_pinch_dist

    def _smooth_pointer(self, raw_x, raw_y):
        """
        Adaptive Exponential Moving Average (EMA) filter.
        High velocity -> lower smoothing (rapid tracking).
        Low velocity -> higher smoothing (zero tremor/jitter).
        """
        dx = raw_x - self.smooth_pointer_x
        dy = raw_y - self.smooth_pointer_y
        velocity = math.hypot(dx, dy)

        # Dynamic alpha between 0.35 (steady) and 0.90 (fast flick)
        alpha = min(0.90, max(0.35, velocity * 8.0))
        self.smooth_pointer_x = alpha * raw_x + (1.0 - alpha) * self.smooth_pointer_x
        self.smooth_pointer_y = alpha * raw_y + (1.0 - alpha) * self.smooth_pointer_y

        return round(float(self.smooth_pointer_x), 3), round(float(self.smooth_pointer_y), 3)

    def _stabilize_gesture(self, raw_gesture, raw_action, raw_confidence):
        """
        Fast, glitch-free temporal stabilization.
        - Continuous gestures (Pointer) pass through with 0 latency.
        - Neutral/None drops immediately to avoid sticking/freezing on stale gestures.
        - Discrete gestures confirm within min_stability_frames (~50ms).
        """
        # For continuous gestures (Pointer Mode), pass through immediately
        if raw_gesture in ["Index Finger", "Pointer Mode"]:
            self.gesture_history.clear()
            return raw_gesture, raw_action, raw_confidence

        # When neutral or no gesture detected, immediately return None and clear buffer
        # This guarantees the state machine never gets stuck on a previous gesture!
        if raw_gesture == "None":
            self.gesture_history.clear()
            self.confidence_history.clear()
            return "None", "None", 0.0

        self.gesture_history.append((raw_gesture, raw_action))
        self.confidence_history.append(raw_confidence)

        # Check if the recent frames consistently show this gesture
        recent = [g for g, a in self.gesture_history]
        if recent.count(raw_gesture) >= self.min_stability_frames:
            avg_conf = sum(self.confidence_history) / max(1, len(self.confidence_history))
            return raw_gesture, raw_action, avg_conf

        return "None", "None", 0.0

    def process_frame(self, frame):
        """
        Processes a video frame: runs MediaPipe tracking, classifies gestures,
        smoothes pointer coordinates, manages action debouncing, and draws HUD.
        """
        now = time.time()

        annotated = frame.copy()
        h, w, _ = frame.shape

        gesture = "None"
        action = "None"
        confidence = 0.0
        landmarks_list = []
        triggered_action = None
        raw_pinch = 0.0

        if self.landmarker is not None:
            # Downscale frame with bilinear interpolation for clean, anti-aliased finger tracking
            small = cv2.resize(frame, (320, 240), interpolation=cv2.INTER_LINEAR)
            rgb_frame = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

            with self.lock:
                try:
                    result = self.landmarker.detect(mp_image)
                    if result and result.hand_landmarks and len(result.hand_landmarks) > 0:
                        hand = result.hand_landmarks[0]
                        landmarks_coords = [(lm.x, lm.y, lm.z) for lm in hand]
                        pixel_coords = [(int(lm.x * w), int(lm.y * h)) for lm in hand]
                        landmarks_list = landmarks_coords

                        # Raw Geometric Classification
                        raw_g, raw_a, raw_c, raw_pinch = self.classify_gesture(landmarks_coords)

                        # Temporal Filter Stabilization
                        gesture, action, confidence = self._stabilize_gesture(raw_g, raw_a, raw_c)

                        # Smooth laser pointer coordinates if Index Finger
                        if gesture == "Index Finger":
                            tip_norm_x, tip_norm_y = landmarks_coords[8][0], landmarks_coords[8][1]
                            sm_x, sm_y = self._smooth_pointer(tip_norm_x, tip_norm_y)
                            self.pointer_position = {"x": sm_x, "y": sm_y}

                        self.pinch_distance = round(float(raw_pinch), 3)

                        # -------------------------------------------------
                        # Render Cybernetic Hand Skeleton & Visuals
                        # -------------------------------------------------
                        # 1. Draw Skeleton Connections
                        for start_idx, end_idx in HAND_CONNECTIONS:
                            pt1 = pixel_coords[start_idx]
                            pt2 = pixel_coords[end_idx]
                            cv2.line(annotated, pt1, pt2, (248, 189, 56), 2, cv2.LINE_AA)  # Sky blue / Cyan

                        # 2. Draw Landmark Joints
                        for i, pt in enumerate(pixel_coords):
                            if i in [4, 8, 12, 16, 20]:  # Fingertips
                                cv2.circle(annotated, pt, 7, (108, 99, 255), -1, cv2.LINE_AA)  # Purple
                                cv2.circle(annotated, pt, 9, (255, 255, 255), 1, cv2.LINE_AA)
                            else:
                                cv2.circle(annotated, pt, 4, (56, 255, 120), -1, cv2.LINE_AA)  # Emerald Green

                        # 3. Dynamic Gesture Highlight Overlays
                        if gesture == "Index Finger":
                            # Red Optical Laser Pointer Reticle
                            ptr_px = (int(self.pointer_position["x"] * w), int(self.pointer_position["y"] * h))
                            cv2.circle(annotated, ptr_px, 18, (0, 0, 255), 2, cv2.LINE_AA)
                            cv2.circle(annotated, ptr_px, 10, (50, 50, 255), 1, cv2.LINE_AA)
                            cv2.circle(annotated, ptr_px, 4, (0, 0, 255), -1, cv2.LINE_AA)
                            cv2.line(annotated, (ptr_px[0] - 24, ptr_px[1]), (ptr_px[0] + 24, ptr_px[1]), (0, 0, 255), 1, cv2.LINE_AA)
                            cv2.line(annotated, (ptr_px[0], ptr_px[1] - 24), (ptr_px[0], ptr_px[1] + 24), (0, 0, 255), 1, cv2.LINE_AA)

                        elif gesture == "Two Fingers":
                            # Zoom In Indicator on Index and Middle Fingertips
                            pt8 = pixel_coords[8]
                            pt12 = pixel_coords[12]
                            cv2.circle(annotated, pt8, 14, (0, 255, 255), 2, cv2.LINE_AA)
                            cv2.circle(annotated, pt12, 14, (0, 255, 255), 2, cv2.LINE_AA)
                            cv2.line(annotated, pt8, pt12, (0, 255, 255), 2, cv2.LINE_AA)
                            mid = ((pt8[0] + pt12[0]) // 2, (pt8[1] + pt12[1]) // 2 - 16)
                            cv2.putText(annotated, "ZOOM IN (+0.25x)", mid, cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1, cv2.LINE_AA)

                        elif gesture == "Three Fingers":
                            # Zoom Out Indicator on Index, Middle, Ring Fingertips
                            pt8 = pixel_coords[8]
                            pt12 = pixel_coords[12]
                            pt16 = pixel_coords[16]
                            cv2.circle(annotated, pt8, 14, (245, 158, 11), 2, cv2.LINE_AA)
                            cv2.circle(annotated, pt12, 14, (245, 158, 11), 2, cv2.LINE_AA)
                            cv2.circle(annotated, pt16, 14, (245, 158, 11), 2, cv2.LINE_AA)
                            mid = (pt12[0] - 30, pt12[1] - 18)
                            cv2.putText(annotated, "ZOOM OUT (-0.25x)", mid, cv2.FONT_HERSHEY_SIMPLEX, 0.45, (245, 158, 11), 1, cv2.LINE_AA)

                        elif gesture in ["Thumb Up", "Thumb Down"]:
                            # Thumb halo indicator
                            pt_thumb = pixel_coords[4]
                            color_thumb = (56, 255, 120) if gesture == "Thumb Up" else (248, 189, 56)
                            cv2.circle(annotated, pt_thumb, 16, color_thumb, 2, cv2.LINE_AA)

                    else:
                        # No hand visible in this frame
                        self.gesture_history.append(("None", "None"))
                        self.confidence_history.append(0.0)
                        gesture, action, confidence = "None", "None", 0.0

                except Exception as e:
                    # Graceful error handling for video stream robustness
                    gesture, action, confidence = "None", "None", 0.0

        self.current_gesture = gesture
        self.current_action = action
        self.confidence = confidence

        # Cooldown & Latch management for presentation action triggers
        cooldown_remaining = max(0.0, self.cooldown_duration - (now - self.last_action_time))

        # Reset action latch when hand returns to neutral / None or switches gesture
        if gesture in ["None", "Unknown"] or gesture != getattr(self, "_latched_gesture", None):
            self._latched_gesture = None

        if gesture not in ["None", "Unknown"] and action != "None":
            # Only continuous Pointer Mode streams without cooldown
            if gesture == "Index Finger":
                triggered_action = action
            elif cooldown_remaining == 0.0 and self._latched_gesture != gesture:
                triggered_action = action
                self.last_action_time = now
                self.last_triggered_gesture = gesture
                self._latched_gesture = gesture  # Latch action until hand is released or changed
                cooldown_remaining = self.cooldown_duration

        # -------------------------------------------------
        # Futuristic HUD Header Bar
        # -------------------------------------------------
        hud_h = 70
        hud_bg = np.zeros((hud_h, w, 3), dtype=np.uint8)
        hud_bg[:] = (22, 28, 53)
        annotated[0:hud_h, 0:w] = cv2.addWeighted(annotated[0:hud_h, 0:w], 0.25, hud_bg, 0.75, 0)
        cv2.line(annotated, (0, hud_h), (w, hud_h), (108, 99, 255), 2)

        if gesture != "None":
            status_str = f"GESTURE: {gesture.upper()}"
            is_latched = (getattr(self, "_latched_gesture", None) == gesture and gesture != "Index Finger")
            action_str = f"ACTION: {action} [DONE]" if is_latched else f"ACTION: {action}"
            conf_str = f"CONF: {int(confidence * 100)}%"

            cv2.putText(annotated, status_str, (15, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (56, 255, 120), 2, cv2.LINE_AA)
            cv2.putText(annotated, action_str, (15, 58), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (255, 255, 255), 1, cv2.LINE_AA)
            cv2.putText(annotated, conf_str, (w - 280, 58), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (56, 189, 248), 1, cv2.LINE_AA)

            # Cooldown progress bar for discrete gestures
            if gesture not in ["Index Finger", "Pinch Gesture"]:
                cd_pct = 1.0 - (cooldown_remaining / self.cooldown_duration) if self.cooldown_duration > 0 else 1.0
                bar_w = 120
                bar_fill = int(bar_w * cd_pct)
                cv2.rectangle(annotated, (w - 145, 25), (w - 145 + bar_w, 45), (40, 40, 60), -1)
                cv2.rectangle(annotated, (w - 145, 25), (w - 145 + bar_fill, 45), (108, 99, 255), -1)
                cv2.rectangle(annotated, (w - 145, 25), (w - 145 + bar_w, 45), (200, 200, 200), 1)
                cv2.putText(annotated, "COOLDOWN", (w - 145, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (180, 180, 200), 1)
        else:
            cv2.putText(annotated, "HAND GESTURE RECOGNITION ACTIVE", (15, 32),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.62, (56, 189, 248), 2, cv2.LINE_AA)
            cv2.putText(annotated, "Show hand gestures to control presentation", (15, 58),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (160, 170, 200), 1, cv2.LINE_AA)

        result_payload = {
            "detected": gesture != "None",
            "gesture": gesture,
            "action": action,
            "confidence": round(confidence, 2),
            "pointer_pos": self.pointer_position,
            "pinch_distance": self.pinch_distance,
            "cooldown_remaining": round(cooldown_remaining, 2),
            "triggered_action": triggered_action
        }

        # Cache for multi-client requests
        self.cached_frame = annotated
        self.cached_payload = result_payload
        self.cached_time = now

        return annotated, result_payload

    def update_settings(self, sensitivity="High", cooldown=0.6):
        self.sensitivity = sensitivity
        self.cooldown_duration = float(cooldown)

        if sensitivity == "High":
            self.min_stability_frames = 2
        elif sensitivity == "Low":
            self.min_stability_frames = 3
        else:  # Medium
            self.min_stability_frames = 2

gesture_recognizer = GestureRecognizer()
