import os
import json
import time
import threading
from datetime import datetime

DEFAULT_SLIDES = [
    {
        "id": 1,
        "title": "AI-Based Authorized Gesture Controlled Presentation System",
        "subtitle": "Next-Generation Touchless Human-Computer Interaction",
        "badge": "AI & Computer Vision",
        "content_type": "hero",
        "author": "Daruniga",
        "highlights": [
            "Real-time Facial Biometric Authorization",
            "Multi-gesture MediaPipe 3D Hand Tracking",
            "Sub-50ms Low-Latency Touchless Presentation Control",
            "Bilingual AI Voice Control (English & தமிழ்)",
            "Interactive Optical Laser Pointer & Pinch-to-Zoom"
        ],
        "meta": "Slide 1 of 6"
    },
    {
        "id": 2,
        "title": "System Architecture & AI Pipeline",
        "subtitle": "Modular Dual-Engine Vision Stack",
        "badge": "Architecture",
        "content_type": "architecture",
        "cards": [
            {"icon": "fa-video", "title": "Webcam Feed", "desc": "Real-time OpenCV video stream with frame buffering and DirectShow capture."},
            {"icon": "fa-shield-halved", "title": "Face Authorization", "desc": "Facial landmark & biometric verification permitting only the authorized presenter."},
            {"icon": "fa-hand", "title": "MediaPipe Hands", "desc": "21 3D hand landmarks tracking finger joints, flexion, and spatial orientation."},
            {"icon": "fa-bolt", "title": "Gesture Engine", "desc": "Classification state machine with cooldown debounce and continuous tracking."}
        ],
        "meta": "Slide 2 of 6"
    },
    {
        "id": 3,
        "title": "Predefined Gesture Command Matrix",
        "subtitle": "Intuitive Gestures Mapped to Presentation Operations",
        "badge": "Gesture Mapping",
        "content_type": "gestures_table",
        "gestures": [
            {"icon": "👍", "name": "Thumb Up", "action": "Next Slide", "trigger": "Advances presentation forward"},
            {"icon": "👎", "name": "Thumb Down", "action": "Previous Slide", "trigger": "Returns to previous slide"},
            {"icon": "✋", "name": "Open Palm", "action": "Start Presentation", "trigger": "Initializes slideshow playback"},
            {"icon": "✊", "name": "Closed Fist", "action": "Pause / Hold", "trigger": "Freezes presentation & video"},
            {"icon": "☝️", "name": "Index Finger", "action": "Pointer Mode", "trigger": "Directs live laser reticle"},
            {"icon": "✌️", "name": "Two Fingers", "action": "Zoom In", "trigger": "Magnifies slide viewport (+0.25x)"},
            {"icon": "3️⃣", "name": "Three Fingers", "action": "Zoom Out", "trigger": "Reduces slide viewport (-0.25x)"}
        ],
        "meta": "Slide 3 of 6"
    },
    {
        "id": 4,
        "title": "Facial Biometrics & Security Verification",
        "subtitle": "Zero-Trust Touchless Presenter Authorization",
        "badge": "Security Protocol",
        "content_type": "security",
        "points": [
            {"title": "Identity Verification", "desc": "Verifies presenter face before delegating slide execution rights."},
            {"title": "Unauthorized Gesture Blocking", "desc": "Discards hand movements if unauthorized persons appear in camera frame."},
            {"title": "Autonomous Hand-off & Hold", "desc": "Automatically pauses presentation when presenter steps away."},
            {"title": "Anti-Jitter Debounce", "desc": "1.2s adaptive cooldown window prevents accidental slide skipping."}
        ],
        "meta": "Slide 4 of 6"
    },
    {
        "id": 5,
        "title": "Live Interactive Features & Performance",
        "subtitle": "Ultra-Responsive Optical Laser & Spatial Pinch Zoom",
        "badge": "Interactive Engine",
        "content_type": "performance",
        "metrics": [
            {"val": "30 FPS", "label": "Stream Framerate"},
            {"val": "< 45 ms", "label": "Gesture Latency"},
            {"val": "21 Points", "label": "3D Landmarks"},
            {"val": "99.2%", "label": "Detection Accuracy"}
        ],
        "features": [
            "Dynamic Optical Laser Pointer following index fingertip normalized coordinates (x, y)",
            "Pinch-to-zoom scaling slide deck smoothly from 0.8x to 2.5x",
            "Multi-tab synchronized state via REST and SSE endpoints"
        ],
        "meta": "Slide 5 of 6"
    },
    {
        "id": 6,
        "title": "Conclusion & Future Horizons",
        "subtitle": "Empowering Natural User Interfaces (NUI) for Education & Industry",
        "badge": "Summary",
        "content_type": "conclusion",
        "takeaways": [
            "Seamless presenter empowerment without physical clickers or wireless remotes.",
            "Complete end-to-end integration: OpenCV + MediaPipe + Flask + Vanilla Frontend.",
            "Future expansion: Multi-presenter collaboration, 3D hologram slides, and spatial air-drawing."
        ],
        "author": "Daruniga",
        "meta": "Slide 6 of 6"
    }
]

class PresentationController:
    def __init__(self, history_file=None):
        self.history_file = history_file or os.path.join(os.path.dirname(__file__), "history.json")
        self.slides = list(DEFAULT_SLIDES)
        self.current_slide_index = 0
        self.is_presenting = False
        self.is_paused = False
        self.zoom_level = 1.0
        self.pointer_mode = False
        self.pointer_coords = {"x": 0.5, "y": 0.5}
        self.laser_color = "#FF0055"
        self.last_action = "None"
        self.last_action_timestamp = ""
        self.presenter_name = "Presenter"
        self.deck_name = "AI Presentation System (Default)"
        self.state_version = 1
        self.pointer_version = 1

    def set_presenter(self, name):
        if name and str(name).strip():
            self.presenter_name = str(name).strip()
            for slide in self.slides:
                if "author" in slide:
                    slide["author"] = self.presenter_name
            self.state_version += 1

    def set_custom_slides(self, slides, deck_name="Custom Deck"):
        if slides and len(slides) > 0:
            self.slides = list(slides)
            self.current_slide_index = 0
            self.deck_name = deck_name
            self.is_presenting = True
            self.is_paused = False
            self.last_action = f"Loaded Deck: {deck_name}"
            self.last_action_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            self.state_version += 1
            self.log_history("Presentation Uploaded", f"Successfully loaded '{deck_name}' ({len(slides)} slides)", "Success", "fa-file-powerpoint")
            return True
        return False

    def reset_to_default_slides(self):
        self.slides = list(DEFAULT_SLIDES)
        self.current_slide_index = 0
        self.deck_name = "AI Presentation System (Default)"
        self.is_presenting = False
        self.is_paused = False
        self.last_action = "Reset to Default Slides"
        self.last_action_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self.state_version += 1
        self.log_history("Deck Reset", "Reverted to standard AI Presentation slides", "Success", "fa-rotate-left")
        return True

    def get_state(self, include_all_slides=True):
        total = len(self.slides)
        cur_slide = self.slides[self.current_slide_index] if 0 <= self.current_slide_index < total else None
        if cur_slide and "author" in cur_slide:
            cur_slide = dict(cur_slide)
            cur_slide["author"] = self.presenter_name

        state = {
            "version": self.state_version,
            "pointer_version": self.pointer_version,
            "current_slide_index": self.current_slide_index,
            "current_slide_number": self.current_slide_index + 1,
            "total_slides": total,
            "is_presenting": self.is_presenting,
            "is_paused": self.is_paused,
            "zoom_level": round(self.zoom_level, 2),
            "pointer_mode": self.pointer_mode,
            "pointer_coords": self.pointer_coords,
            "laser_color": self.laser_color,
            "slide_data": cur_slide,
            "presenter_name": self.presenter_name,
            "deck_name": getattr(self, "deck_name", "AI Presentation System (Default)"),
            "last_action": self.last_action,
            "last_action_timestamp": self.last_action_timestamp
        }
        if include_all_slides:
            state["all_slides"] = self.slides
        return state

    def next_slide(self, source="Gesture"):
        self.is_presenting = True
        self.is_paused = False
        if self.current_slide_index < len(self.slides) - 1:
            self.current_slide_index += 1
            self.last_action = "Next Slide"
            self.last_action_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            self.state_version += 1
            icon = "fa-microphone" if "Voice" in source else "fa-chevron-right"
            log_title = f"{source}: Next Slide" if "Voice" in source else "Next Slide"
            self.log_history(log_title,
                             f"Next slide detected (Slide {self.current_slide_index} -> Slide {self.current_slide_index + 1})",
                             "Success", icon)
            return True
        return False

    def prev_slide(self, source="Gesture"):
        self.is_presenting = True
        self.is_paused = False
        if self.current_slide_index > 0:
            self.current_slide_index -= 1
            self.last_action = "Previous Slide"
            self.last_action_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            self.state_version += 1
            icon = "fa-microphone" if "Voice" in source else "fa-chevron-left"
            log_title = f"{source}: Previous Slide" if "Voice" in source else "Previous Slide"
            self.log_history(log_title,
                             f"Previous slide detected (Slide {self.current_slide_index + 2} -> Slide {self.current_slide_index + 1})",
                             "Success", icon)
            return True
        return False

    def goto_slide(self, slide_num, source="Voice"):
        self.is_presenting = True
        self.is_paused = False
        try:
            target_idx = int(slide_num) - 1
            if 0 <= target_idx < len(self.slides):
                self.current_slide_index = target_idx
                self.last_action = f"Jump to Slide {target_idx + 1}"
                self.last_action_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                self.state_version += 1
                icon = "fa-microphone" if "Voice" in source else "fa-arrow-right-to-bracket"
                log_title = f"{source}: Slide {target_idx + 1}" if "Voice" in source else f"Slide {target_idx + 1}"
                self.log_history(log_title,
                                 f"Jumped to Slide {target_idx + 1} ({self.slides[target_idx].get('title', '')})",
                                 "Success", icon)
                return True
        except Exception:
            pass
        return False

    def start_presentation(self, source="Gesture"):
        self.is_presenting = True
        self.is_paused = False
        self.last_action = "Start Presentation"
        self.last_action_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self.state_version += 1
        icon = "fa-microphone" if "Voice" in source else "fa-play"
        log_title = f"{source}: Start" if "Voice" in source else ("Open Palm" if source == "Gesture" else "Manual")
        self.log_history(log_title,
                         "Presentation started", "Active", icon)
        return True

    def pause_presentation(self, source="Gesture"):
        self.is_paused = not self.is_paused
        status = "Paused" if self.is_paused else "Resumed"
        self.last_action = f"Presentation {status}"
        self.last_action_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self.state_version += 1
        icon = "fa-microphone" if "Voice" in source else ("fa-pause" if self.is_paused else "fa-play")
        log_title = f"{source}: {status}" if "Voice" in source else ("Closed Fist" if source == "Gesture" else "Manual")
        self.log_history(log_title,
                         f"Presentation {status.lower()}", status, icon)
        return self.is_paused

    def set_zoom(self, zoom_val=None, delta=None):
        if delta is not None:
            self.zoom_level = round(max(0.8, min(2.5, self.zoom_level + delta)), 2)
        elif zoom_val is not None:
            self.zoom_level = round(max(0.8, min(2.5, float(zoom_val))), 2)
        self.state_version += 1
        return self.zoom_level

    def zoom_in(self, delta=0.25):
        self.zoom_level = round(min(2.5, self.zoom_level + delta), 2)
        self.last_action = f"Zoom In ({self.zoom_level}x)"
        self.last_action_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self.state_version += 1
        self.log_history("Two Fingers (✌️)", f"Zoom In (+0.25x) -> {self.zoom_level}x", "Success", "fa-magnifying-glass-plus")
        return self.zoom_level

    def zoom_out(self, delta=0.25):
        self.zoom_level = round(max(0.8, self.zoom_level - delta), 2)
        self.last_action = f"Zoom Out ({self.zoom_level}x)"
        self.last_action_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self.state_version += 1
        self.log_history("Three Fingers (3️⃣)", f"Zoom Out (-0.25x) -> {self.zoom_level}x", "Success", "fa-magnifying-glass-minus")
        return self.zoom_level

    def set_pointer(self, x, y, active=True):
        self.pointer_mode = active
        self.pointer_coords = {"x": round(float(x), 3), "y": round(float(y), 3)}
        self.pointer_version += 1

    def reset_presentation(self):
        self.current_slide_index = 0
        self.is_presenting = False
        self.is_paused = False
        self.zoom_level = 1.0
        self.pointer_mode = False
        self.state_version += 1

    def _save_history_file(self, history_data):
        try:
            with open(self.history_file, "w", encoding="utf-8") as f:
                json.dump(history_data, f, indent=2)
        except Exception as e:
            print(f"[PresentationController] Error writing history: {e}")

    def log_history(self, gesture, action, status="Success", icon="fa-bolt"):
        # Rate-limit repetitive security alerts to prevent freezing/lag
        now_ts = time.time()
        if gesture == "Security Alert":
            if (now_ts - getattr(self, "_last_alert_time", 0)) < 4.0:
                return
            self._last_alert_time = now_ts

        try:
            history = list(self.get_history())
            new_id = (history[-1]["id"] + 1) if history and "id" in history[-1] else 1
            entry = {
                "id": new_id,
                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "gesture": gesture,
                "action": action,
                "status": status,
                "icon": icon
            }
            history.append(entry)
            # Keep history trimmed to latest 100 entries for fast performance
            if len(history) > 100:
                history = history[-100:]
            self._history_cache = history

            # Asynchronously save to disk so video broadcaster thread NEVER blocks or lags
            threading.Thread(target=self._save_history_file, args=(list(history),), daemon=True).start()
        except Exception as e:
            print(f"[PresentationController] Error in log_history: {e}")

    def get_history(self):
        if getattr(self, "_history_cache", None) is not None:
            return self._history_cache
        try:
            if os.path.exists(self.history_file):
                with open(self.history_file, "r", encoding="utf-8") as f:
                    self._history_cache = json.load(f)
                    return self._history_cache
        except Exception:
            pass
        self._history_cache = []
        return self._history_cache

    def clear_history(self):
        self._history_cache = []
        try:
            with open(self.history_file, "w", encoding="utf-8") as f:
                json.dump([], f, indent=2)
            return True
        except Exception:
            return False

presentation_controller = PresentationController()
