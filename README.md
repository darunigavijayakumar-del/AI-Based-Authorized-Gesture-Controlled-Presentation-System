# AI-Based Authorized Gesture-Controlled Presentation System

![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)
![Flask](https://img.shields.io/badge/Flask-3.0%2B-black.svg)
![MediaPipe](https://img.shields.io/badge/MediaPipe-0.10%2B-orange.svg)
![OpenCV](https://img.shields.io/badge/OpenCV-LBPH%20%26%20Vision-red.svg)
![License](https://img.shields.io/badge/License-MIT-green.svg)

An intelligent, contactless presentation control system powered by Computer Vision, Deep Learning, and Biometrics. Control presentations naturally using real-time hand gestures with sub-60ms latency, protected by biometric face authentication to ensure only authorized presenters have control.

---

## 🌟 Key Features

- **🔐 Biometric Face Authentication**
  - Uses OpenCV Haar Cascades and LBPH (Local Binary Patterns Histograms) Face Recognizer.
  - Locks gesture commands if an unrecognized user is in front of the camera.
  - Dynamic scanning HUD overlay with real-time confidence scores and occlusion grace period.
  - Can be toggled on/off in settings according to preference.

- **✋ Real-Time Gesture Recognition**
  - Powered by Google MediaPipe HandLandmarker (21 3D hand landmarks).
  - Scale-invariant, tilt-resilient geometric heuristics.
  - Sub-60ms recognition latency with fast temporal glitch filtering.
  - **Dynamic Laser Pointer**: Real-time laser pointer mode tracked from your index finger with Exponential Moving Average (EMA) jitter smoothing.

- **📊 Dynamic Presentation Engine**
  - Supports PowerPoint (`.pptx`) and PDF (`.pdf`) formats.
  - Automatically parses slides and renders crisp, high-resolution slide decks.
  - Smooth slide transitions, real-time zoom & pan, and custom laser pointer styling.

- **🎙️ Voice Control Support**
  - Integrated Web Speech API for hands-free voice commands (*"next slide"*, *"previous slide"*, *"start presentation"*, *"zoom in"*, *"zoom out"*, etc.).

- **💻 Modern Cyberpunk & Glassmorphic Dashboard**
  - Live webcam feed HUD with landmark overlays and biometric verification badges.
  - Interactive gesture guide with visual hand diagrams.
  - Real-time presentation view with full-screen support.
  - Comprehensive activity history and presentation analytics.
  - Settings panel for camera selection, sensitivity, cooldown, laser color, theme, and security modes.

---

## 🖐️ Gesture Reference Guide

| Gesture | Action | Description |
| :--- | :--- | :--- |
| 👍 **Thumb Up** | **Next Slide** | Move to the next slide smoothly |
| 👎 **Thumb Down** | **Previous Slide** | Return to the previous slide |
| ☝️ **Index Finger** | **Laser Pointer** | Real-time on-screen laser pointer tracking |
| ✌️ **Two Fingers** (Peace) | **Zoom In** | Zoom into the current slide area |
| 🤟 **Three Fingers** | **Zoom Out** | Reset or zoom out of the slide |
| ✊ **Closed Fist** | **Pause / Hold** | Freeze presentation state / hold slide |
| ✋ **Open Palm** | **Start Presentation** | Launch presentation mode |

---

## 🏗️ System Architecture

```
                                  +-------------------+
                                  |   Webcam Stream   |
                                  +---------+---------+
                                            |
                         +------------------+------------------+
                         |                                     |
                         v                                     v
           +---------------------------+         +---------------------------+
           |    Face Authentication    |         |    Gesture Recognition    |
           |   (Haar Cascade + LBPH)   |         | (MediaPipe HandLandmarker)|
           +-------------+-------------+         +-------------+-------------+
                         |                                     |
                         | Presenter Verified?                 | 21 Landmarks Analyzed
                         +------------------+------------------+
                                            |
                                            v
                             +-----------------------------+
                             |   Presentation Controller   |
                             |   - Action Dispatcher       |
                             |   - Cooldown & Debounce     |
                             |   - Laser Pointer Smoothing |
                             +--------------+--------------+
                                            |
                                            v
                             +-----------------------------+
                             |      Flask Web Engine       |
                             |  (WebSocket / SSE / REST)   |
                             +--------------+--------------+
                                            |
                                            v
                             +-----------------------------+
                             |   Interactive Frontend UI   |
                             |  - Presentation Slides View |
                             |  - Live HUD & Analytics     |
                             +-----------------------------+
```

---

## 📂 Project Structure

```
AI-Presentation-System/
├── backend/
│   ├── app.py                      # Flask backend entry point & REST APIs
│   ├── camera_manager.py           # Thread-safe multi-threaded camera pipeline
│   ├── face_authentication.py      # Face detection & LBPH biometric verification
│   ├── gesture_recognition.py      # MediaPipe hand tracking & gesture classifier
│   ├── presentation_controller.py  # Presentation state, navigation & laser tracking
│   ├── ppt_loader.py               # PPTX & PDF document parser and slide generator
│   ├── camera.py                   # Camera utility helpers
│   ├── haarcascade_frontalface_default.xml # Pre-trained face detector model
│   ├── hand_landmarker.task        # MediaPipe hand landmarks model asset
│   ├── settings.json               # Persisted user settings and configuration
│   ├── history.json                # Activity history log
│   ├── templates/                  # Frontend HTML templates (Jinja2)
│   │   ├── index.html              # Landing page
│   │   ├── dashboard.html          # Main control hub
│   │   ├── presentation.html       # Full-screen presentation display
│   │   ├── gesture.html            # Interactive gesture guide
│   │   ├── history.html            # Session audit log
│   │   └── settings.html           # System configuration
│   └── static/                     # CSS, JS, and media assets
│       ├── css/                    # Glassmorphism dark/light themes
│       ├── js/                     # Client-side controllers and event handlers
│       └── uploads/                # Slide decks & presentation data
├── hand_landmarker.task            # Root model asset
├── requirements.txt                # Python project dependencies
├── run.bat                         # Quick-start script for Windows
└── README.md                       # Documentation
```

---

## 🚀 Getting Started

### 1. Prerequisites
- Python 3.10, 3.11, or 3.12 recommended.
- A functional webcam.
- Windows, macOS, or Linux.

### 2. Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/darunigavijayakumar-del/AI-Based-Authorized-Gesture-Controlled-Presentation-System.git
   cd AI-Based-Authorized-Gesture-Controlled-Presentation-System
   ```

2. **Create and activate a virtual environment:**
   - **Windows:**
     ```bash
     python -m venv venv
     venv\Scripts\activate
     ```
   - **Linux / macOS:**
     ```bash
     python3 -m venv venv
     source venv/bin/activate
     ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

---

## 🎬 Running the Application

### Option A: Using the Windows batch script
Simply double-click `run.bat` or run:
```cmd
run.bat
```

### Option B: Running via Python
```bash
cd backend
python app.py
```

Open your browser and navigate to:
```
http://localhost:5000
```

---

## ⚙️ Configuration & Customization

Through the **Settings** page (`/settings`), you can configure:
- **Camera Index**: Switch between primary webcam and external USB cameras.
- **Gesture Sensitivity**: Adjust detection sensitivity (`Low`, `Medium`, `High`).
- **Cooldown Window**: Adjust interval between consecutive actions to prevent double-skips.
- **Laser Pointer Color**: Customize the color of the on-screen laser pointer dot.
- **Biometric Enforcement**: Require facial authorization before executing slide actions.
- **Theme**: Toggle between Dark cyberpunk and Light modern interfaces.

---

## 🛡️ Security & Privacy Note
- Biometric facial models (`registered_face.yml`) and captured presenter images are processed and stored locally on your machine and are excluded from version control.
- Presentation slide uploads and sessions remain strictly on your local server.

---

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).
