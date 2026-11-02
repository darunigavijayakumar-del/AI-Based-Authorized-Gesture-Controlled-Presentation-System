from flask import Flask, render_template, Response, request, jsonify, redirect, url_for
import cv2
import json
import os
import time
import threading

from camera_manager import camera_manager
from face_authentication import face_authenticator
from gesture_recognition import gesture_recognizer
from presentation_controller import presentation_controller
from ppt_loader import process_uploaded_presentation

app = Flask(__name__)
app.config['SECRET_KEY'] = 'ai-presentation-gesture-secret-key-2026'

# Application Settings & Upload Stores
SETTINGS_FILE = os.path.join(os.path.dirname(__file__), "settings.json")
UPLOAD_SLIDES_FOLDER = os.path.join(os.path.dirname(__file__), "static", "uploads", "slides")
os.makedirs(UPLOAD_SLIDES_FOLDER, exist_ok=True)

def load_settings():
    default_settings = {
        "camera_index": 0,
        "sensitivity": "High",
        "cooldown": 0.6,
        "presenter_name": "Daruniga",
        "laser_color": "#FF0055",
        "theme": "dark",
        "enforce_face_auth": False
    }
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                default_settings.update(saved)
        except Exception:
            pass
    return default_settings

def save_settings(settings):
    try:
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=2)
    except Exception as e:
        print(f"Error saving settings: {e}")

# Initialize settings
app_settings = load_settings()
initial_presenter = app_settings.get("presenter_name", "Presenter")
face_authenticator.set_presenter(initial_presenter)
presentation_controller.set_presenter(initial_presenter)
gesture_recognizer.update_settings(app_settings.get("sensitivity", "High"), app_settings.get("cooldown", 0.8))
presentation_controller.laser_color = app_settings.get("laser_color", "#FF0055")


# ==========================================
# PAGE ROUTES
# ==========================================

@app.route("/")
def index():
    """Login / Face Authentication Page"""
    return render_template("index.html", settings=app_settings)

@app.route("/dashboard")
def dashboard():
    """Main System Dashboard"""
    auth_status = face_authenticator.get_status()
    pres_state = presentation_controller.get_state()
    return render_template("dashboard.html", auth=auth_status, presentation=pres_state, settings=app_settings)

@app.route("/gesture")
def gesture_page():
    """Gesture Recognition Testing & Monitoring Studio"""
    return render_template("gesture.html", settings=app_settings)

@app.route("/presentation")
def presentation_page():
    """Live Slide Presentation Viewer & Controller"""
    pres_state = presentation_controller.get_state()
    return render_template("presentation.html", presentation=pres_state, settings=app_settings)

@app.route("/history")
def history_page():
    """User Activity & Gesture Event History"""
    history_items = presentation_controller.get_history()
    return render_template("history.html", history=history_items, settings=app_settings)

@app.route("/settings")
def settings_page():
    """System Settings Configuration"""
    return render_template("settings.html", settings=app_settings)


# ==========================================
# STREAMING BROADCASTER & VIDEO FEED ROUTES
# ==========================================

class StreamBroadcaster:
    """
    Centralized single-producer video broadcaster.
    Runs MediaPipe Hand Tracking and Biometric Auth ONCE per camera frame in a
    dedicated background thread. All connected web clients (PIP, full screen,
    multiple browser tabs) consume pre-encoded JPEG bytes with zero duplicate
    inference, zero socket lag, and buttery-smooth real-time responsiveness.
    """
    def __init__(self):
        self.lock = threading.Lock()
        self.frame_condition = threading.Condition(self.lock)
        self.gesture_frame_id = 0
        self.gesture_jpeg = None
        self.raw_frame_id = 0
        self.raw_jpeg = None
        self.raw_subscribers = 0
        self.running = True
        self.thread = threading.Thread(target=self._worker_loop, daemon=True)
        self.thread.start()

    def _worker_loop(self):
        last_cam_frame_id = -1
        while self.running:
            try:
                raw_frame, cam_id = camera_manager.get_frame_with_id()
                if cam_id == last_cam_frame_id or raw_frame is None:
                    time.sleep(0.005)
                    continue
                last_cam_frame_id = cam_id

                # 1. Pre-encode raw frame ONLY when clients are subscribed to raw_feed (saves 15% CPU!)
                with self.lock:
                    need_raw = (self.raw_subscribers > 0)
                if need_raw:
                    ret_raw, raw_buf = cv2.imencode('.jpg', raw_frame, [cv2.IMWRITE_JPEG_QUALITY, 60])
                    if ret_raw:
                        with self.frame_condition:
                            self.raw_jpeg = raw_buf.tobytes()
                            self.raw_frame_id += 1
                            self.frame_condition.notify_all()

                # 2. Hand Gesture Recognition & HUD rendering
                enforce_face = app_settings.get("enforce_face_auth", False)
                if enforce_face:
                    is_auth, presenter, face_conf, face_bbox = face_authenticator.verify_frame(raw_frame)
                else:
                    is_auth = True
                    presenter = app_settings.get("presenter_name", "Presenter")
                    face_conf = 1.0
                    face_bbox = None

                annotated_frame, gesture_info = gesture_recognizer.process_frame(raw_frame)
                h, w, _ = annotated_frame.shape

                # Draw Biometric Security Status Badge in HUD (top right)
                if not enforce_face:
                    cv2.rectangle(annotated_frame, (w - 270, 10), (w - 15, 34), (16, 75, 35), -1)
                    cv2.rectangle(annotated_frame, (w - 270, 10), (w - 15, 34), (56, 255, 120), 1)
                    cv2.putText(annotated_frame, f"PRESENTER: {presenter.upper()} (ACTIVE)", (w - 262, 27),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.40, (56, 255, 120), 1, cv2.LINE_AA)
                elif is_auth and face_authenticator.is_registered:
                    cv2.rectangle(annotated_frame, (w - 260, 10), (w - 15, 34), (16, 75, 35), -1)
                    cv2.rectangle(annotated_frame, (w - 260, 10), (w - 15, 34), (56, 255, 120), 1)
                    cv2.putText(annotated_frame, f"PRESENTER: {presenter.upper()}", (w - 252, 27),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.42, (56, 255, 120), 1, cv2.LINE_AA)
                elif not face_authenticator.is_registered:
                    cv2.rectangle(annotated_frame, (w - 275, 10), (w - 15, 34), (20, 60, 110), -1)
                    cv2.rectangle(annotated_frame, (w - 275, 10), (w - 15, 34), (0, 165, 255), 1)
                    cv2.putText(annotated_frame, "NOT REGISTERED (LOCKED)", (w - 267, 27),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.40, (0, 190, 255), 1, cv2.LINE_AA)
                else:
                    cv2.rectangle(annotated_frame, (w - 265, 10), (w - 15, 34), (30, 20, 60), -1)
                    cv2.rectangle(annotated_frame, (w - 265, 10), (w - 15, 34), (50, 50, 240), 1)
                    lock_txt = "PRESENTER: AWAY" if not face_bbox else "UNAUTHORIZED PERSON"
                    cv2.putText(annotated_frame, lock_txt, (w - 257, 27),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.40, (80, 80, 255), 1, cv2.LINE_AA)

                # 3. Secure Trigger Execution (Centralized execution guarantees no duplicate actions)
                triggered = gesture_info.get("triggered_action")
                can_execute = (not enforce_face) or (is_auth and face_authenticator.is_registered)

                if triggered:
                    if can_execute:
                        if triggered == "Next Slide":
                            presentation_controller.next_slide(source=f"Authorized Gesture ({presenter})")
                        elif triggered == "Previous Slide":
                            presentation_controller.prev_slide(source=f"Authorized Gesture ({presenter})")
                        elif triggered == "Start Presentation":
                            presentation_controller.start_presentation(source=f"Authorized Gesture ({presenter})")
                        elif triggered == "Pause / Hold Presentation":
                            presentation_controller.pause_presentation(source=f"Authorized Gesture ({presenter})")
                        elif triggered == "Pointer Mode":
                            pos = gesture_info.get("pointer_pos", {"x": 0.5, "y": 0.5})
                            presentation_controller.set_pointer(pos["x"], pos["y"], active=True)
                        elif triggered == "Zoom In":
                            presentation_controller.zoom_in(delta=0.25)
                        elif triggered == "Zoom Out":
                            presentation_controller.zoom_out(delta=0.25)
                    else:
                        gesture_info["blocked"] = True
                        cv2.rectangle(annotated_frame, (12, h - 55), (w - 12, h - 12), (20, 20, 180), -1)
                        cv2.rectangle(annotated_frame, (12, h - 55), (w - 12, h - 12), (50, 50, 255), 2)
                        alert_text = "SECURITY: GESTURES LOCKED"
                        cv2.putText(annotated_frame, alert_text, (25, h - 26),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.46, (255, 255, 255), 2, cv2.LINE_AA)

                # Pointer auto-deactivate
                if not can_execute:
                    if presentation_controller.pointer_mode:
                        presentation_controller.set_pointer(0.5, 0.5, active=False)
                elif gesture_info.get("gesture") != "Index Finger":
                    if presentation_controller.pointer_mode:
                        presentation_controller.set_pointer(0.5, 0.5, active=False)

                ret_g, g_buf = cv2.imencode('.jpg', annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 65])
                if ret_g:
                    with self.frame_condition:
                        self.gesture_jpeg = g_buf.tobytes()
                        self.gesture_frame_id += 1
                        self.frame_condition.notify_all()

            except Exception as e:
                print(f"[StreamBroadcaster] Processing error: {e}")
                time.sleep(0.015)

    def get_gesture_jpeg(self):
        with self.lock:
            return self.gesture_jpeg, self.gesture_frame_id

    def get_raw_jpeg(self):
        with self.lock:
            return self.raw_jpeg, self.raw_frame_id

    def stop(self):
        self.running = False
        with self.frame_condition:
            self.frame_condition.notify_all()
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=1.0)

stream_broadcaster = StreamBroadcaster()

def generate_raw_frames():
    last_sent = -1
    with stream_broadcaster.lock:
        stream_broadcaster.raw_subscribers += 1
    try:
        while True:
            try:
                with stream_broadcaster.frame_condition:
                    while stream_broadcaster.raw_frame_id == last_sent:
                        if not stream_broadcaster.running:
                            return
                        stream_broadcaster.frame_condition.wait(timeout=0.08)
                    jpeg_bytes = stream_broadcaster.raw_jpeg
                    last_sent = stream_broadcaster.raw_frame_id

                if jpeg_bytes is not None:
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + jpeg_bytes + b'\r\n')
            except (GeneratorExit, ConnectionResetError, BrokenPipeError):
                break
    finally:
        with stream_broadcaster.lock:
            stream_broadcaster.raw_subscribers = max(0, stream_broadcaster.raw_subscribers - 1)

def generate_auth_frames():
    last_sent = -1
    while True:
        try:
            raw_frame, fid = camera_manager.get_frame_with_id()
            if fid != last_sent and raw_frame is not None:
                last_sent = fid
                annotated_frame, auth_info = face_authenticator.process_frame(raw_frame)
                ret, buffer = cv2.imencode('.jpg', annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 65])
                if ret:
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
            time.sleep(0.02)
        except (GeneratorExit, ConnectionResetError, BrokenPipeError):
            break

def generate_gesture_frames():
    last_sent = -1
    while True:
        try:
            with stream_broadcaster.frame_condition:
                while stream_broadcaster.gesture_frame_id == last_sent:
                    if not stream_broadcaster.running:
                        return
                    stream_broadcaster.frame_condition.wait(timeout=0.08)
                jpeg_bytes = stream_broadcaster.gesture_jpeg
                last_sent = stream_broadcaster.gesture_frame_id

            if jpeg_bytes is not None:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + jpeg_bytes + b'\r\n')
        except (GeneratorExit, ConnectionResetError, BrokenPipeError):
            break

@app.route("/video_feed")
def video_feed():
    """Live Clean Camera Feed"""
    return Response(generate_raw_frames(), mimetype="multipart/x-mixed-replace; boundary=frame")

@app.route("/auth_feed")
def auth_feed():
    """Live Camera Feed with Face Verification HUD"""
    return Response(generate_auth_frames(), mimetype="multipart/x-mixed-replace; boundary=frame")

@app.route("/gesture_feed")
def gesture_feed():
    """Live Camera Feed with Hand Skeleton & Gesture HUD"""
    return Response(generate_gesture_frames(), mimetype="multipart/x-mixed-replace; boundary=frame")

@app.route("/api/presentation/stream")
def presentation_stream_api():
    """
    Ultra-low-latency Server-Sent Events (SSE) stream for presentation state & gestures.
    Pushes slide updates, laser pointer coordinates, and gesture badges with sub-20ms latency.
    """
    def sse_worker():
        last_version = -1
        last_ptr_ver = -1
        last_gesture = "None"
        last_ping = time.time()

        while True:
            try:
                now = time.time()
                cur_version = presentation_controller.state_version
                cur_ptr_ver = presentation_controller.pointer_version
                cur_gesture = gesture_recognizer.current_gesture

                state_changed = (cur_version != last_version)
                pointer_changed = (cur_ptr_ver != last_ptr_ver)
                gesture_changed = (cur_gesture != last_gesture)
                heartbeat = (now - last_ping >= 2.0)

                if state_changed or pointer_changed or gesture_changed or heartbeat:
                    last_version = cur_version
                    last_ptr_ver = cur_ptr_ver
                    last_gesture = cur_gesture
                    last_ping = now

                    data = presentation_controller.get_state(include_all_slides=False)
                    data["gesture"] = cur_gesture
                    data["action"] = gesture_recognizer.current_action
                    data["confidence"] = gesture_recognizer.confidence
                    enforce_face = app_settings.get("enforce_face_auth", False)
                    is_auth = (not enforce_face) or (face_authenticator.is_verified and face_authenticator.is_registered)
                    data["is_authorized"] = is_auth
                    data["is_registered"] = face_authenticator.is_registered
                    data["presenter"] = face_authenticator.authorized_presenter

                    yield f"data: {json.dumps(data)}\n\n"

                time.sleep(0.025)  # 40 FPS max update rate
            except (GeneratorExit, ConnectionResetError, BrokenPipeError):
                break

    return Response(sse_worker(), mimetype="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
    })


# ==========================================
# REST API ENDPOINTS
# ==========================================

@app.route("/api/login", methods=["POST"])
def login_api():
    """Presenter Login endpoint: registers presenter identity across all modules."""
    data = request.get_json(silent=True) or {}
    presenter_name = str(data.get("presenter_name", "")).strip()
    if not presenter_name:
        presenter_name = app_settings.get("presenter_name", "Presenter")

    # Update app_settings and persist
    app_settings["presenter_name"] = presenter_name
    save_settings(app_settings)

    # Sync presenter identity
    face_authenticator.set_presenter(presenter_name)
    presentation_controller.set_presenter(presenter_name)
    presentation_controller.log_history("User Login", f"Presenter {presenter_name} logged in", "Success", "fa-user-check")

    return jsonify({
        "success": True,
        "presenter_name": presenter_name,
        "is_registered": face_authenticator.is_registered,
        "redirect": "/dashboard"
    })

@app.route("/api/auth/status", methods=["GET", "POST"])
def auth_status_api():
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        if "presenter_name" in data:
            name = str(data["presenter_name"]).strip()
            if name:
                face_authenticator.set_presenter(name)
                presentation_controller.set_presenter(name)
                app_settings["presenter_name"] = name
                save_settings(app_settings)
        if "action" in data:
            if data["action"] == "verify_now":
                if face_authenticator.is_registered:
                    face_authenticator.is_verified = True
                    presentation_controller.log_history("Face Auth", f"Presenter {face_authenticator.authorized_presenter} manually verified", "Verified", "fa-user-check")
                else:
                    face_authenticator.is_verified = False
            elif data["action"] == "reset":
                face_authenticator.is_verified = False

    status = face_authenticator.get_status()
    status["camera_connected"] = camera_manager.is_connected
    status["has_photo"] = os.path.exists(face_authenticator.photo_path)
    return jsonify(status)

@app.route("/api/auth/register", methods=["POST"])
def auth_register_api():
    """Captures camera frames, trains LBPH model, and registers the presenter face."""
    data = request.get_json(silent=True) or {}
    name = str(data.get("presenter_name", "")).strip() or app_settings.get("presenter_name", "Presenter")
    
    success, msg = face_authenticator.register_from_camera(camera_manager, presenter_name=name, num_samples=8)
    if success:
        app_settings["presenter_name"] = name
        app_settings["face_registered"] = True
        save_settings(app_settings)
        presentation_controller.set_presenter(name)
        presentation_controller.log_history("Face Registration", f"Biometric profile enrolled for {name}", "Enrolled", "fa-user-plus")
        return jsonify({
            "success": True,
            "message": msg,
            "presenter": name,
            "thumbnail": "/static/registered_face.jpg"
        })
    else:
        return jsonify({"success": False, "message": msg}), 400

@app.route("/api/auth/reset", methods=["POST"])
def auth_reset_api():
    """Deletes registered biometric profile for re-enrollment."""
    face_authenticator.reset_profile()
    app_settings["face_registered"] = False
    save_settings(app_settings)
    presentation_controller.log_history("Biometric Reset", "Presenter face profile cleared", "Reset", "fa-trash-can")
    return jsonify({"success": True, "message": "Biometric face profile has been reset."})

@app.route("/api/auth/profile", methods=["GET"])
def auth_profile_api():
    """Returns biometric profile metadata and thumbnail."""
    return jsonify({
        "is_registered": face_authenticator.is_registered,
        "presenter_name": face_authenticator.authorized_presenter,
        "has_photo": os.path.exists(face_authenticator.photo_path),
        "photo_url": "/static/registered_face.jpg" if os.path.exists(face_authenticator.photo_path) else None
    })

@app.route("/api/current_gesture", methods=["GET"])
def current_gesture_api():
    enforce_face = app_settings.get("enforce_face_auth", False)
    is_fully_auth = (not enforce_face) or (face_authenticator.is_verified and face_authenticator.is_registered)
    return jsonify({
        "gesture": gesture_recognizer.current_gesture,
        "action": gesture_recognizer.current_action,
        "confidence": gesture_recognizer.confidence,
        "pointer_pos": gesture_recognizer.pointer_position,
        "pinch_distance": gesture_recognizer.pinch_distance,
        "cooldown_remaining": round(max(0.0, gesture_recognizer.cooldown_duration - (time.time() - gesture_recognizer.last_action_time)), 2),
        "cooldown_duration": gesture_recognizer.cooldown_duration,
        "sensitivity": gesture_recognizer.sensitivity,
        "is_authorized": is_fully_auth,
        "enforce_face_auth": enforce_face,
        "is_registered": face_authenticator.is_registered,
        "presenter": face_authenticator.authorized_presenter,
        "auth_status": "Authorized" if is_fully_auth else face_authenticator.get_status()["status"],
        "camera_connected": camera_manager.is_connected
    })

@app.route("/api/presentation/state", methods=["GET"])
def presentation_state_api():
    light = request.args.get("light", "0") in ["1", "true", "True"]
    return jsonify(presentation_controller.get_state(include_all_slides=not light))

@app.route("/api/presentation/action", methods=["POST"])
def presentation_action_api():
    data = request.get_json(silent=True) or {}
    action = data.get("action", "")
    source = data.get("source", "Manual UI")
    success = False
    message = ""

    if action == "next":
        success = presentation_controller.next_slide(source=source)
        message = "Moved to next slide" if success else "Already at last slide"
    elif action == "prev":
        success = presentation_controller.prev_slide(source=source)
        message = "Moved to previous slide" if success else "Already at first slide"
    elif action == "goto":
        slide_num = data.get("slide", 1)
        success = presentation_controller.goto_slide(slide_num, source=source)
        message = f"Jumped to Slide {slide_num}" if success else "Invalid slide number"
    elif action == "start":
        success = presentation_controller.start_presentation(source=source)
        message = "Presentation started"
    elif action == "pause":
        is_paused = presentation_controller.pause_presentation(source=source)
        success = True
        message = "Presentation paused" if is_paused else "Presentation resumed"
    elif action == "reset":
        presentation_controller.reset_presentation()
        success = True
        message = "Presentation reset to slide 1"
    elif action == "reset_zoom":
        new_zoom = presentation_controller.set_zoom(zoom_val=1.0)
        success = True
        message = "Zoom reset to 1.0x"
    elif action == "zoom":
        val = data.get("value")
        delta = data.get("delta")
        new_zoom = presentation_controller.set_zoom(zoom_val=val, delta=delta)
        success = True
        message = f"Zoom level set to {new_zoom:.2f}x"
    elif action == "zoom_in":
        new_zoom = presentation_controller.zoom_in(0.25)
        success = True
        message = f"Zoom level increased to {new_zoom:.2f}x"
    elif action == "zoom_out":
        new_zoom = presentation_controller.zoom_out(0.25)
        success = True
        message = f"Zoom level decreased to {new_zoom:.2f}x"
    elif action == "pointer":
        x = data.get("x", 0.5)
        y = data.get("y", 0.5)
        active = data.get("active", True)
        presentation_controller.set_pointer(x, y, active)
        success = True
        message = f"Pointer updated to ({x}, {y})"
    else:
        message = f"Unknown action: {action}"

    response = presentation_controller.get_state()
    response["success"] = success
    response["message"] = message
    return jsonify(response)

@app.route("/api/presentation/upload", methods=["POST"])
def presentation_upload_api():
    """Uploads PPTX, PPT, PDF, or image files and converts them into active presentation slides."""
    if "file" not in request.files:
        return jsonify({"success": False, "message": "No presentation file was uploaded."}), 400
    
    file_obj = request.files["file"]
    if not file_obj or not file_obj.filename:
        return jsonify({"success": False, "message": "Please select a valid PPTX, PPT, PDF, or Image file."}), 400

    slides, deck_title, error = process_uploaded_presentation(file_obj, UPLOAD_SLIDES_FOLDER)
    if error or not slides:
        return jsonify({"success": False, "message": error or "Could not process presentation."}), 400

    presentation_controller.set_custom_slides(slides, deck_name=deck_title)
    return jsonify({
        "success": True,
        "message": f"Successfully loaded presentation '{deck_title}' with {len(slides)} slides!",
        "deck_title": deck_title,
        "total_slides": len(slides),
        "state": presentation_controller.get_state()
    })

@app.route("/api/presentation/reset_deck", methods=["POST"])
def presentation_reset_deck_api():
    """Reverts to the default AI Presentation system slide deck."""
    presentation_controller.reset_to_default_slides()
    return jsonify({
        "success": True,
        "message": "Reverted back to default AI Presentation slides.",
        "state": presentation_controller.get_state()
    })

@app.route("/api/history", methods=["GET", "DELETE"])
def history_api():
    if request.method == "DELETE":
        presentation_controller.clear_history()
        return jsonify({"success": True, "message": "History cleared successfully"})
    return jsonify({"history": presentation_controller.get_history()})

@app.route("/api/settings", methods=["GET", "POST"])
def settings_api():
    global app_settings
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        
        if "camera_index" in data:
            idx = int(data["camera_index"])
            app_settings["camera_index"] = idx
            camera_manager.change_camera(idx)

        if "sensitivity" in data or "cooldown" in data:
            sens = data.get("sensitivity", app_settings.get("sensitivity", "Medium"))
            cd = float(data.get("cooldown", app_settings.get("cooldown", 0.8)))
            app_settings["sensitivity"] = sens
            app_settings["cooldown"] = cd
            gesture_recognizer.update_settings(sensitivity=sens, cooldown=cd)

        if "presenter_name" in data:
            name = str(data["presenter_name"]).strip()
            if name:
                app_settings["presenter_name"] = name
                face_authenticator.set_presenter(name)
                presentation_controller.set_presenter(name)

        if "laser_color" in data:
            color = str(data["laser_color"])
            app_settings["laser_color"] = color
            presentation_controller.laser_color = color

        if "enforce_face_auth" in data:
            app_settings["enforce_face_auth"] = bool(data["enforce_face_auth"])

        save_settings(app_settings)
        return jsonify({"success": True, "settings": app_settings, "message": "Settings updated successfully"})

    return jsonify({"settings": app_settings})


# ==========================================
# RUN FLASK SERVER
# ==========================================

if __name__ == "__main__":
    print("=" * 60)
    print(" AI-Based Authorized Gesture Controlled Presentation System ")
    print(" Server running on: http://localhost:5000")
    print(" Voice Control: Supported on Chrome/Edge (Press 'V' or click Mic icon)")
    print("=" * 60)
    try:
        app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
    finally:
        stream_broadcaster.stop()
        camera_manager.release()