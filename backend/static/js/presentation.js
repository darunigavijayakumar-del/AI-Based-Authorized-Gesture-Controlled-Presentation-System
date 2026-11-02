document.addEventListener("DOMContentLoaded", () => {
    const slideViewport = document.getElementById("slideViewport");
    const slideContent = document.getElementById("slideContent");
    const laserPointerDot = document.getElementById("laserPointerDot");
    const slideCounterDisplay = document.getElementById("slideCounterDisplay");
    const presStatusLabel = document.getElementById("presStatusLabel");
    const presStatusBadge = document.getElementById("presStatusBadge");
    const playPauseIcon = document.getElementById("playPauseIcon");
    const pointerToggleBtn = document.getElementById("pointerToggleBtn");
    const zoomIndicator = document.getElementById("zoomIndicator");
    const pipGestureTag = document.getElementById("pipGestureTag");
    const stageContainer = document.getElementById("stageContainer");

    const prevSlideBtn = document.getElementById("prevSlideBtn");
    const nextSlideBtn = document.getElementById("nextSlideBtn");
    const playPauseBtn = document.getElementById("playPauseBtn");
    const resetSlideBtn = document.getElementById("resetSlideBtn");
    const zoomInBtn = document.getElementById("zoomInBtn");
    const zoomOutBtn = document.getElementById("zoomOutBtn");
    const fullscreenBtn = document.getElementById("fullscreenBtn");

    // PPT / PDF Presentation Upload Elements
    const openUploadModalBtn = document.getElementById("openUploadModalBtn");
    const toolbarUploadBtn = document.getElementById("toolbarUploadBtn");
    const headerResetDeckBtn = document.getElementById("headerResetDeckBtn");
    const uploadPresentationModal = document.getElementById("uploadPresentationModal");
    const closeUploadModalBtn = document.getElementById("closeUploadModalBtn");
    const pptDropZone = document.getElementById("pptDropZone");
    const pptFileInput = document.getElementById("pptFileInput");
    const browsePptFileBtn = document.getElementById("browsePptFileBtn");
    const uploadStatusBox = document.getElementById("uploadStatusBox");
    const uploadStatusText = document.getElementById("uploadStatusText");
    const resetToDefaultDeckBtn = document.getElementById("resetToDefaultDeckBtn");

    let currentSlideIndex = 0;
    let totalSlides = 6;
    let isPresenting = false;
    let isPaused = false;
    let currentZoom = 1.0;
    let isPointerActive = false;
    let lastRenderedSlideIndex = -1;
    let lastRenderedDeckName = null;
    let cachedSlides = [];

    // Fluid 60 FPS Laser Pointer Lerp State
    let targetPointerX = 0.5;
    let targetPointerY = 0.5;
    let currentPointerX = 0.5;
    let currentPointerY = 0.5;
    let pointerAnimRunning = false;

    function animatePointer() {
        if (!isPointerActive) {
            pointerAnimRunning = false;
            laserPointerDot.style.display = "none";
            pointerToggleBtn.classList.remove("active");
            return;
        }

        // Fluid linear interpolation (Lerp) for silky 60 FPS motion without jitter
        currentPointerX += (targetPointerX - currentPointerX) * 0.40;
        currentPointerY += (targetPointerY - currentPointerY) * 0.40;

        const rect = slideViewport.getBoundingClientRect();
        const posX = Math.max(10, Math.min(rect.width - 10, currentPointerX * rect.width));
        const posY = Math.max(10, Math.min(rect.height - 10, currentPointerY * rect.height));

        laserPointerDot.style.left = `${posX}px`;
        laserPointerDot.style.top = `${posY}px`;

        requestAnimationFrame(animatePointer);
    }

    function startPointerAnimation() {
        if (!pointerAnimRunning && isPointerActive) {
            pointerAnimRunning = true;
            requestAnimationFrame(animatePointer);
        }
    }

    // Preload slide images in browser cache so slide transitions never hang or stutter
    function preloadDeckImages(slides) {
        if (!slides || !Array.isArray(slides)) return;
        slides.forEach(s => {
            if (s && s.image_url) {
                const img = new Image();
                img.src = s.image_url;
            }
        });
    }

    // Send Presentation Action to Backend
    async function sendAction(action, payload = {}) {
        try {
            const res = await fetch("/api/presentation/action", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, ...payload })
            });
            if (res.ok) {
                const data = await res.json();
                renderPresentationState(data);
            }
        } catch (e) {
            console.error("Action error:", e);
        }
    }

    // Optimistic UI updates for zero click-to-render latency
    function optimisticNext() {
        if (currentSlideIndex < totalSlides - 1) {
            currentSlideIndex++;
            slideCounterDisplay.textContent = `Slide ${currentSlideIndex + 1} of ${totalSlides}`;
            if (cachedSlides && cachedSlides[currentSlideIndex]) {
                renderSlide(cachedSlides[currentSlideIndex], currentSlideIndex, totalSlides);
                lastRenderedSlideIndex = currentSlideIndex;
            }
        }
        sendAction("next");
    }

    function optimisticPrev() {
        if (currentSlideIndex > 0) {
            currentSlideIndex--;
            slideCounterDisplay.textContent = `Slide ${currentSlideIndex + 1} of ${totalSlides}`;
            if (cachedSlides && cachedSlides[currentSlideIndex]) {
                renderSlide(cachedSlides[currentSlideIndex], currentSlideIndex, totalSlides);
                lastRenderedSlideIndex = currentSlideIndex;
            }
        }
        sendAction("prev");
    }

    // Render Slide HTML dynamically based on slide data
    function renderSlide(slide, index, total) {
        if (!slide) return;

        // Smooth subtle slide transition
        slideContent.classList.remove("slide-content-anim");
        void slideContent.offsetWidth; // Trigger reflow
        slideContent.classList.add("slide-content-anim");

        // Custom Full-Scale Slide Images (PDF / PPTX converted images / PNG / JPG)
        if (slide.content_type === "image") {
            slideContent.innerHTML = `
                <div class="slide-image-viewport">
                    <div class="slide-image-container">
                        <img src="${slide.image_url}" alt="${slide.title || 'Slide'}" class="slide-custom-image">
                    </div>
                    <div class="slide-image-footer">
                        <span>Presenter: <strong style="color: #fff;">${activePresenterName}</strong></span>
                        <span class="slide-meta-tag">Slide ${index + 1} of ${total}</span>
                    </div>
                </div>
            `;
            return;
        }

        // Custom Extracted PPTX Text Slide
        if (slide.content_type === "pptx_text") {
            const points = (slide.points || []).map(p => `
                <div class="hero-highlight-item" style="padding: 12px 18px; margin-bottom: 8px;">
                    <i class="fa-solid fa-angle-right" style="color: var(--secondary);"></i>
                    <span style="font-size: 14px; color: #E2E8F0;">${p}</span>
                </div>
            `).join("");
            slideContent.innerHTML = `
                <div class="slide-header">
                    <div>
                        <span class="slide-badge">${slide.badge || 'Presentation'}</span>
                        <h2 class="slide-title">${slide.title || 'Slide Title'}</h2>
                        <p class="slide-subtitle">${slide.subtitle || ''}</p>
                    </div>
                </div>
                <div class="slide-body">
                    <div class="hero-highlights" style="grid-template-columns: 1fr;">${points}</div>
                </div>
                <div class="slide-footer">
                    <span>Presenter: <strong style="color: #fff;">${activePresenterName}</strong></span>
                    <span class="slide-meta-tag">Slide ${index + 1} of ${total}</span>
                </div>
            `;
            return;
        }

        let bodyHTML = "";

        if (slide.content_type === "hero") {
            const highlights = (slide.highlights || []).map(h => `
                <div class="hero-highlight-item">
                    <i class="fa-solid fa-circle-check"></i>
                    <span>${h}</span>
                </div>
            `).join("");
            bodyHTML = `<div class="hero-highlights">${highlights}</div>`;
        } else if (slide.content_type === "architecture") {
            const cards = (slide.cards || []).map(c => `
                <div class="slide-card-block">
                    <i class="fa-solid ${c.icon || 'fa-microchip'}"></i>
                    <h4>${c.title}</h4>
                    <p>${c.desc}</p>
                </div>
            `).join("");
            bodyHTML = `<div class="slide-cards-grid">${cards}</div>`;
        } else if (slide.content_type === "gestures_table") {
            const gestures = (slide.gestures || []).map(g => `
                <div class="slide-gesture-card">
                    <div class="emoji">${g.icon}</div>
                    <h5>${g.name}</h5>
                    <p>${g.action}</p>
                </div>
            `).join("");
            bodyHTML = `<div class="slide-gestures-grid">${gestures}</div>`;
        } else if (slide.content_type === "security") {
            const points = (slide.points || []).map(p => `
                <div class="hero-highlight-item" style="padding: 12px 16px;">
                    <i class="fa-solid fa-lock" style="color: var(--secondary);"></i>
                    <div>
                        <strong style="color:#fff; display:block; font-size:14px;">${p.title}</strong>
                        <span style="font-size:12px; color:var(--text-muted);">${p.desc}</span>
                    </div>
                </div>
            `).join("");
            bodyHTML = `<div class="hero-highlights">${points}</div>`;
        } else if (slide.content_type === "performance") {
            const metrics = (slide.metrics || []).map(m => `
                <div class="slide-gesture-card">
                    <div style="font-size: 22px; font-weight: 800; color: var(--secondary); margin-bottom: 2px;">${m.val}</div>
                    <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase;">${m.label}</div>
                </div>
            `).join("");
            const feats = (slide.features || []).map(f => `
                <li style="margin-bottom: 6px; font-size: 13px; color: #E2E8F0;"><i class="fa-solid fa-bolt" style="color:var(--success); margin-right: 8px;"></i>${f}</li>
            `).join("");
            bodyHTML = `
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 18px;">
                    ${metrics}
                </div>
                <ul style="list-style: none; padding-left: 4px;">
                    ${feats}
                </ul>
            `;
        } else if (slide.content_type === "conclusion") {
            const takeaways = (slide.takeaways || []).map(t => `
                <div class="hero-highlight-item">
                    <i class="fa-solid fa-award" style="color: var(--warning);"></i>
                    <span>${t}</span>
                </div>
            `).join("");
            bodyHTML = `<div class="hero-highlights" style="grid-template-columns: 1fr;">${takeaways}</div>`;
        }

        slideContent.innerHTML = `
            <div class="slide-header">
                <div>
                    <span class="slide-badge">${slide.badge || 'Presentation'}</span>
                    <h2 class="slide-title">${slide.title || 'Slide Title'}</h2>
                    <p class="slide-subtitle">${slide.subtitle || ''}</p>
                </div>
            </div>
            <div class="slide-body">
                ${bodyHTML}
            </div>
            <div class="slide-footer">
                <span>Presenter: <strong style="color: #fff;">${slide.author || activePresenterName}</strong></span>
                <span class="slide-meta-tag">Slide ${index + 1} of ${total}</span>
            </div>
        `;
    }

    let activePresenterName = "Presenter";

    // Render Full Presentation State
    function renderPresentationState(state) {
        if (!state) return;

        // Cache all slides if provided on initial load or deck change
        if (state.all_slides && Array.isArray(state.all_slides) && state.all_slides.length > 0) {
            cachedSlides = state.all_slides;
            preloadDeckImages(cachedSlides);
        }

        if (state.presenter_name) {
            activePresenterName = state.presenter_name;
            const sName = document.querySelector(".presenter-name");
            const sAvatar = document.querySelector(".presenter-avatar");
            if (sName) sName.textContent = state.presenter_name;
            if (sAvatar) sAvatar.textContent = (state.presenter_name[0] || 'P').toUpperCase();
        }

        // Toggle Reset Deck button if custom deck is active
        if (headerResetDeckBtn) {
            if (state.deck_name && state.deck_name !== "Default AI Deck" && state.deck_name !== "AI Presentation System (Default)") {
                headerResetDeckBtn.style.display = "inline-flex";
                headerResetDeckBtn.title = `Current deck: ${state.deck_name}. Click to revert to AI Deck`;
            } else {
                headerResetDeckBtn.style.display = "none";
            }
        }

        currentSlideIndex = state.current_slide_index;
        totalSlides = state.total_slides;
        isPresenting = state.is_presenting;
        isPaused = state.is_paused;
        currentZoom = state.zoom_level || 1.0;

        slideCounterDisplay.textContent = `Slide ${currentSlideIndex + 1} of ${totalSlides}`;
        zoomIndicator.textContent = `${currentZoom.toFixed(1)}x`;

        // Update Zoom Scale on Slide Viewport
        slideViewport.style.transform = `scale(${currentZoom})`;

        // Update Play/Pause Button
        if (isPresenting && !isPaused) {
            playPauseIcon.className = "fa-solid fa-pause";
            presStatusLabel.textContent = "Presenting (Playing)";
            presStatusBadge.className = "badge-live";
        } else if (isPaused) {
            playPauseIcon.className = "fa-solid fa-play";
            presStatusLabel.textContent = "Presentation Paused";
            presStatusBadge.className = "badge-live";
        } else {
            playPauseIcon.className = "fa-solid fa-play";
            presStatusLabel.textContent = "Ready to Start";
        }

        // Render current slide only if changed (prevents DOM thrashing and UI stutter)
        if (state.slide_data && (currentSlideIndex !== lastRenderedSlideIndex || state.deck_name !== lastRenderedDeckName)) {
            renderSlide(state.slide_data, currentSlideIndex, totalSlides);
            lastRenderedSlideIndex = currentSlideIndex;
            lastRenderedDeckName = state.deck_name || "";
        }

        // Fluid 60 FPS Laser Pointer Position tracking
        if (state.pointer_mode && state.pointer_coords) {
            isPointerActive = true;
            targetPointerX = state.pointer_coords.x;
            targetPointerY = state.pointer_coords.y;
            laserPointerDot.style.display = "block";
            pointerToggleBtn.classList.add("active");

            if (state.laser_color) {
                laserPointerDot.style.background = state.laser_color;
                laserPointerDot.style.boxShadow = `0 0 20px ${state.laser_color}, 0 0 40px ${state.laser_color}`;
            }
            startPointerAnimation();
        } else {
            isPointerActive = false;
            laserPointerDot.style.display = "none";
            pointerToggleBtn.classList.remove("active");
        }
    }

    // Update HUD gesture badge on PIP Camera
    function updateGestureTag(gData) {
        if (!gData) return;
        const isAuth = !!gData.is_authorized;
        const isReg = !!gData.is_registered;

        const presFaceWarningBanner = document.getElementById("presFaceWarningBanner");
        if (presFaceWarningBanner) {
            presFaceWarningBanner.style.display = isReg ? "none" : "flex";
        }

        if (!isReg) {
            pipGestureTag.innerHTML = '<span style="color:#FBBF24;"><i class="fa-solid fa-triangle-exclamation"></i> Not Enrolled</span>';
        } else if (!isAuth) {
            pipGestureTag.innerHTML = '<span style="color:#FF477E;"><i class="fa-solid fa-lock"></i> Locked</span>';
        } else if (gData.gesture && gData.gesture !== "None") {
            pipGestureTag.innerHTML = `<span style="color:#00FF88;"><i class="fa-solid fa-bolt"></i> ${gData.gesture}</span>`;
        } else {
            pipGestureTag.innerHTML = `<span style="color:#38BDF8;"><i class="fa-solid fa-shield-check"></i> ${gData.presenter || 'Authorized'}</span>`;
        }
    }

    // Connect to real-time Server-Sent Events (SSE) Stream for sub-20ms instant responsiveness
    let eventSource = null;
    function connectEventStream() {
        if (!window.EventSource) return;
        try {
            if (eventSource) {
                eventSource.close();
            }
            eventSource = new EventSource("/api/presentation/stream");

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    renderPresentationState(data);
                    updateGestureTag(data);
                } catch (e) {
                    console.error("SSE parse error:", e);
                }
            };

            eventSource.onerror = () => {
                // EventSource will automatically reconnect
            };
        } catch (e) {
            console.warn("EventSource setup notice:", e);
        }
    }

    // Lightweight heartbeat sync (every 1.5s as background fallback)
    let isSyncing = false;
    async function syncPresentation(forceFull = false) {
        if (isSyncing) return;
        isSyncing = true;
        try {
            const url = forceFull ? "/api/presentation/state" : "/api/presentation/state?light=1";
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                renderPresentationState(data);
            }

            // Sync gesture HUD tag if SSE is not active
            if (!eventSource || eventSource.readyState !== EventSource.OPEN) {
                const gRes = await fetch("/api/current_gesture");
                if (gRes.ok) {
                    const gData = await gRes.json();
                    updateGestureTag(gData);
                }
            }
        } catch (e) {
            console.error("Sync error:", e);
        } finally {
            isSyncing = false;
        }
    }

    // ==========================================
    // VOICE CONTROL MODULE (Real-Time Web Speech & Audio Visualizer)
    // ============================================================
    const voiceControlBtn = document.getElementById("voiceControlBtn");
    const voiceMicIcon = document.getElementById("voiceMicIcon");
    const voiceLangToggleBtn = document.getElementById("voiceLangToggleBtn");
    const voiceLangLabel = document.getElementById("voiceLangLabel");
    const voiceHelpBtn = document.getElementById("voiceHelpBtn");
    const voiceHelpModal = document.getElementById("voiceHelpModal");
    const closeVoiceModalBtn = document.getElementById("closeVoiceModalBtn");
    const voiceCommandHud = document.getElementById("voiceCommandHud");
    const voiceHudText = document.getElementById("voiceHudText");
    const voiceHudBadge = document.getElementById("voiceHudBadge");

    let isVoiceActive = false;
    let recognition = null;
    let audioCtx = null;
    let micStream = null;
    let analyserNode = null;
    let animFrameId = null;
    let currentVoiceLang = 'en-US'; // 'en-US' or 'ta-IN'
    let lastVoiceActionTime = 0;
    const VOICE_DEBOUNCE_MS = 1000;

    // Pleasant audio feedback chime
    function playAudioChime(freq = 840, type = 'sine', duration = 0.12) {
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + duration);
        } catch (e) {
            // Audio context not allowed or failed silently
        }
    }

    // Connect microphone to live equalizer animation bars
    function startAudioVisualizer(stream) {
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();
            const source = audioCtx.createMediaStreamSource(stream);
            analyserNode = audioCtx.createAnalyser();
            analyserNode.fftSize = 64;
            source.connect(analyserNode);

            const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
            const vbars = document.querySelectorAll("#voiceWaves .vbar");

            function updateMeter() {
                if (!isVoiceActive) return;
                analyserNode.getByteFrequencyData(dataArray);
                if (vbars.length >= 4) {
                    const h1 = Math.min(22, Math.max(4, (dataArray[2] / 255) * 24));
                    const h2 = Math.min(24, Math.max(4, (dataArray[5] / 255) * 28));
                    const h3 = Math.min(20, Math.max(4, (dataArray[8] / 255) * 22));
                    const h4 = Math.min(18, Math.max(4, (dataArray[12] / 255) * 20));
                    vbars[0].style.height = `${h1}px`;
                    vbars[1].style.height = `${h2}px`;
                    vbars[2].style.height = `${h3}px`;
                    vbars[3].style.height = `${h4}px`;
                }
                animFrameId = requestAnimationFrame(updateMeter);
            }
            updateMeter();
        } catch (e) {
            console.log("[VoiceControl] Audio visualizer error:", e);
        }
    }

    function showVoiceHudError(msg) {
        if (voiceCommandHud) {
            voiceCommandHud.className = "voice-command-hud voice-hud-error";
        }
        if (voiceHudBadge) {
            voiceHudBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Error';
        }
        if (voiceHudText) {
            voiceHudText.innerHTML = msg;
        }
        setTimeout(() => {
            if (!isVoiceActive && voiceCommandHud) {
                voiceCommandHud.className = "voice-command-hud voice-hud-idle";
                if (voiceHudBadge) voiceHudBadge.innerHTML = '<i class="fa-solid fa-microphone-slash"></i> Voice OFF';
                if (voiceHudText) voiceHudText.innerHTML = "🎤 Voice Control: Click to Start (or press 'V')";
            }
        }, 5000);
    }

    // Number word mapping for slide jumps (English + Tanglish + Tamil)
    const numberWords = {
        "one": 1, "first": 1, "1": 1, "onnu": 1, "ondru": 1, "ஒன்று": 1, "ஒன்னு": 1, "முதல்": 1, "mudhal": 1,
        "two": 2, "second": 2, "2": 2, "rendu": 2, "rendavathu": 2, "இரண்டு": 2, "ரெண்டு": 2,
        "three": 3, "third": 3, "3": 3, "moonu": 3, "moonavathu": 3, "மூன்று": 3, "மூணு": 3,
        "four": 4, "fourth": 4, "4": 4, "naalu": 4, "naalavathu": 4, "நான்கு": 4, "நாலு": 4,
        "five": 5, "fifth": 5, "5": 5, "anji": 5, "ainthu": 5, "anjavathu": 5, "ஐந்து": 5, "அஞ்சு": 5,
        "six": 6, "sixth": 6, "6": 6, "aaru": 6, "aaravathu": 6, "ஆறு": 6
    };

    function processVoiceCommand(rawTranscript) {
        if (!rawTranscript) return false;
        const now = Date.now();
        if (now - lastVoiceActionTime < VOICE_DEBOUNCE_MS) {
            return false;
        }

        const transcript = rawTranscript.trim().toLowerCase();
        let recognizedAction = null;
        let feedbackText = "";

        // 1. Navigation Commands (English + Tanglish + Tamil)
        if (/\b(next|advance|forward|front|nex|necks|net|adutha|aduthu|aduthathu|munnadi|munadi|right)\b/i.test(transcript) || /(அடுத்த|அடுத்து|முன்னோக்கி)/i.test(rawTranscript)) {
            recognizedAction = () => sendAction("next", { source: "Voice ('Next')" });
            feedbackText = "Next Slide ⏩";
        } else if (/\b(previous|prev|back|bag|pack|pinnadi|pinadi|pinnaadi|munthaiya|left)\b/i.test(transcript) || /(முந்தைய|பின்னாடி|பின்)/i.test(rawTranscript)) {
            recognizedAction = () => sendAction("prev", { source: "Voice ('Back')" });
            feedbackText = "Previous Slide ⏪";
        } else if (/\b(first slide|beginning|start slide|one slide|first)\b/i.test(transcript) || /(முதல் ஸ்லைடு|ஆரம்ப ஸ்லைடு)/i.test(rawTranscript)) {
            recognizedAction = () => sendAction("goto", { slide: 1, source: "Voice ('First Slide')" });
            feedbackText = "Jumped to Slide 1 📄";
        } else if (/\b(last slide|end slide|final slide|last)\b/i.test(transcript) || /(கடைசி ஸ்லைடு|முடிவு)/i.test(rawTranscript)) {
            recognizedAction = () => sendAction("goto", { slide: totalSlides, source: "Voice ('Last Slide')" });
            feedbackText = `Jumped to Slide ${totalSlides} 📄`;
        } else if (/\b(slide|page|slid|slay|பக்கம்|ஸ்லைடு)\b/i.test(transcript) || /(ஸ்லைடு|பக்கம்)/i.test(rawTranscript)) {
            for (const [word, num] of Object.entries(numberWords)) {
                if (transcript.includes(word) || rawTranscript.includes(word)) {
                    recognizedAction = () => sendAction("goto", { slide: num, source: `Voice ('Slide ${num}')` });
                    feedbackText = `Jumped to Slide ${num} 🎯`;
                    break;
                }
            }
        }
        // 2. Playback & Presentation Flow
        else if (/\b(start|play|run|begin|resume|continue|aarambi|aarambikalam|thodangu)\b/i.test(transcript) || /(ஆரம்பி|தொடங்கு|ப்ளே)/i.test(rawTranscript)) {
            recognizedAction = () => sendAction("start", { source: "Voice ('Start')" });
            feedbackText = "Presentation Started ▶️";
        } else if (/\b(pause|stop|freeze|wait|hold|nirutthu|niruthu|nillu|poru)\b/i.test(transcript) || /(நிறுத்து|பாஸ்|நில்)/i.test(rawTranscript)) {
            recognizedAction = () => sendAction("pause", { source: "Voice ('Pause')" });
            feedbackText = "Presentation Paused ⏸️";
        } else if (/\b(reset|restart)\b/i.test(transcript) || /(மீட்டமை|ரீசெட்)/i.test(rawTranscript)) {
            recognizedAction = () => sendAction("reset", { source: "Voice ('Reset')" });
            feedbackText = "Presentation Reset 🔄";
        }
        // 3. View & Zoom Controls
        else if (/\b(zoom in|magnify|perisa)\b/i.test(transcript) || /(பெரிதாக்கு|பெரிது|ஜூம் இன்)/i.test(rawTranscript)) {
            recognizedAction = () => sendAction("zoom", { delta: 0.25, source: "Voice ('Zoom In')" });
            feedbackText = "Zoom In (+0.25x) 🔍";
        } else if (/\b(zoom out|chinna)\b/i.test(transcript) || /(சிறிதாக்கு|சிறிது|ஜூம் அவுட்)/i.test(rawTranscript)) {
            recognizedAction = () => sendAction("zoom", { delta: -0.25, source: "Voice ('Zoom Out')" });
            feedbackText = "Zoom Out (-0.25x) 🔍";
        } else if (/\b(reset zoom|normal view|default zoom)\b/i.test(transcript) || /(இயல்பு நிலை|ரீசெட் ஜூம்)/i.test(rawTranscript)) {
            recognizedAction = () => sendAction("reset_zoom", { source: "Voice ('Reset Zoom')" });
            feedbackText = "Zoom Reset (1.0x) 🔍";
        } else if (/\b(pointer|laser|point)\b/i.test(transcript) || /(பாயிண்டர்|லேசர்)/i.test(rawTranscript)) {
            recognizedAction = () => sendAction("pointer", { active: !isPointerActive, x: 0.5, y: 0.5, source: "Voice ('Pointer')" });
            feedbackText = !isPointerActive ? "Laser Pointer Active 🔴" : "Laser Pointer Off ⚪";
        } else if (/\b(full screen|fullscreen)\b/i.test(transcript) || /(முழு திரை|ஃபுல் ஸ்கிரீன்)/i.test(rawTranscript)) {
            if (!document.fullscreenElement) {
                stageContainer.requestFullscreen().catch(() => {});
                feedbackText = "Fullscreen Mode 🖥️";
            } else {
                document.exitFullscreen().catch(() => {});
                feedbackText = "Exited Fullscreen 🖥️";
            }
            recognizedAction = () => {};
        }

        if (recognizedAction) {
            lastVoiceActionTime = now;
            playAudioChime(950, 'sine', 0.15);
            if (voiceCommandHud && voiceHudText) {
                voiceCommandHud.classList.add("recognized");
                voiceHudText.innerHTML = `<span style="color: #00FF88;"><i class="fa-solid fa-circle-check"></i> Heard: "${rawTranscript}" &rarr; <strong>${feedbackText}</strong></span>`;
                setTimeout(() => {
                    if (voiceCommandHud) voiceCommandHud.classList.remove("recognized");
                    if (isVoiceActive && voiceHudText) {
                        voiceHudText.textContent = currentVoiceLang === 'ta-IN' 
                            ? "குரல் கட்டளைக்கு காத்திருக்கிறது... ('அடுத்த', 'பின்னாடி', 'ஸ்லைடு 2')"
                            : "Listening... Speak now ('Next', 'Back', 'Slide 3')";
                    }
                }, 2000);
            }
            recognizedAction();
            return true;
        }
        return false;
    }

    function initSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            showVoiceHudError("Voice recognition not supported in this browser. Please use Chrome or Edge!");
            return null;
        }

        const recog = new SpeechRecognition();
        recog.continuous = true;
        recog.interimResults = true; // Enables instant sub-300ms speech reaction!
        recog.lang = currentVoiceLang;
        recog.maxAlternatives = 3;

        recog.onstart = () => {
            isVoiceActive = true;
            if (voiceControlBtn) {
                voiceControlBtn.classList.add("listening");
                voiceControlBtn.title = "Voice Control Active (Click to mute, hotkey 'V')";
            }
            if (voiceMicIcon) {
                voiceMicIcon.className = "fa-solid fa-microphone";
            }
            if (voiceCommandHud) {
                voiceCommandHud.className = "voice-command-hud voice-hud-listening";
            }
            if (voiceHudBadge) {
                voiceHudBadge.innerHTML = `<i class="fa-solid fa-microphone"></i> Listening (${currentVoiceLang === 'ta-IN' ? 'தமிழ்' : 'EN'})`;
            }
            if (voiceHudText) {
                voiceHudText.textContent = currentVoiceLang === 'ta-IN'
                    ? "குரல் கட்டளைக்கு காத்திருக்கிறது... ('அடுத்த', 'பின்னாடி', 'ஸ்லைடு 2')"
                    : "Listening... Speak now ('Next', 'Back', 'Slide 3')";
            }
            playAudioChime(700, 'triangle', 0.1);
        };

        recog.onresult = (event) => {
            let transcript = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                transcript += event.results[i][0].transcript;
            }
            transcript = transcript.trim();
            if (!transcript) return;

            console.log("[VoiceControl] Live transcript:", transcript);
            if (voiceHudText && voiceCommandHud && !voiceCommandHud.classList.contains("recognized")) {
                voiceHudText.innerHTML = `<span style="color: #FBBF24;"><i class="fa-solid fa-ear-listen"></i> Hearing: "${transcript}"</span>`;
            }
            processVoiceCommand(transcript);
        };

        recog.onerror = (event) => {
            console.warn("[VoiceControl] Speech error:", event.error);
            if (event.error === 'no-speech') {
                return; // Harmless silence event in Chrome
            }
            if (event.error === 'not-allowed') {
                isVoiceActive = false;
                showVoiceHudError("Microphone permission denied! Click the Lock / Mic icon in the address bar & choose 'Allow'.");
                stopVoiceControl();
            } else if (event.error === 'service-not-allowed') {
                isVoiceActive = false;
                showVoiceHudError("Speech service not allowed. Please use Google Chrome or Microsoft Edge.");
                stopVoiceControl();
            } else if (event.error === 'network') {
                showVoiceHudError("Voice network error. Please verify your internet connection.");
            } else if (event.error === 'audio-capture') {
                isVoiceActive = false;
                showVoiceHudError("No microphone found or mic is currently being used by another app.");
                stopVoiceControl();
            }
        };

        recog.onend = () => {
            if (isVoiceActive) {
                setTimeout(() => {
                    if (isVoiceActive) {
                        try {
                            if (recognition) {
                                recognition.start();
                            } else {
                                recognition = initSpeechRecognition();
                                if (recognition) recognition.start();
                            }
                        } catch (e) {
                            console.log("[VoiceControl] Auto-restart notice:", e.message);
                            try {
                                recognition = initSpeechRecognition();
                                if (recognition) recognition.start();
                            } catch (e2) {}
                        }
                    }
                }, 200);
            }
        };

        return recog;
    }

    async function startVoiceControl() {
        try {
            // 1. Initialize Speech Recognition first (never blocked by audio visualizer)
            if (!recognition) {
                recognition = initSpeechRecognition();
            }
            if (!recognition) return;

            isVoiceActive = true;
            try {
                recognition.start();
                console.log("[VoiceControl] Speech recognition started");
            } catch (e) {
                console.log("[VoiceControl] Start notice:", e.message);
                recognition = initSpeechRecognition();
                if (recognition) {
                    try { recognition.start(); } catch (e2) {}
                }
            }

            // 2. Audio Visualizer (non-blocking progressive enhancement)
            if (!micStream && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                navigator.mediaDevices.getUserMedia({ audio: true })
                    .then(stream => {
                        micStream = stream;
                        startAudioVisualizer(stream);
                    })
                    .catch(micErr => {
                        console.warn("[VoiceControl] Audio visualizer stream skipped:", micErr);
                        // SpeechRecognition will still work fine!
                    });
            }
        } catch (err) {
            console.error("Start voice error:", err);
            showVoiceHudError("Could not start microphone: " + err.message);
        }
    }

    function stopVoiceControl() {
        isVoiceActive = false;
        if (recognition) {
            try { recognition.abort(); } catch (e) {}
            try { recognition.stop(); } catch (e) {}
            recognition = null;
        }
        if (micStream) {
            try {
                micStream.getTracks().forEach(t => t.stop());
            } catch (e) {}
            micStream = null;
        }
        if (animFrameId) {
            cancelAnimationFrame(animFrameId);
            animFrameId = null;
        }
        const vbars = document.querySelectorAll("#voiceWaves .vbar");
        vbars.forEach(b => { b.style.height = "4px"; });

        if (voiceControlBtn) {
            voiceControlBtn.classList.remove("listening");
            voiceControlBtn.title = "Voice Control (Click to activate, hotkey 'V')";
        }
        if (voiceMicIcon) {
            voiceMicIcon.className = "fa-solid fa-microphone-slash";
        }
        if (voiceCommandHud) {
            voiceCommandHud.className = "voice-command-hud voice-hud-idle";
        }
        if (voiceHudBadge) {
            voiceHudBadge.innerHTML = '<i class="fa-solid fa-microphone-slash"></i> Voice OFF';
        }
        if (voiceHudText) {
            voiceHudText.textContent = "🎤 Voice Control: Click to Start (or press 'V')";
        }
        playAudioChime(440, 'sine', 0.1);
    }

    function toggleVoiceControl() {
        if (isVoiceActive) {
            stopVoiceControl();
        } else {
            startVoiceControl();
        }
    }

    if (voiceControlBtn) {
        voiceControlBtn.addEventListener("click", toggleVoiceControl);
    }
    if (voiceCommandHud) {
        voiceCommandHud.addEventListener("click", toggleVoiceControl);
    }
    if (voiceLangToggleBtn) {
        voiceLangToggleBtn.addEventListener("click", () => {
            if (currentVoiceLang === 'en-US') {
                currentVoiceLang = 'ta-IN';
                if (voiceLangLabel) voiceLangLabel.textContent = 'தமிழ்';
                if (voiceHudText && isVoiceActive) {
                    voiceHudText.textContent = "குரல் கட்டளைக்கு காத்திருக்கிறது... ('அடுத்த', 'பின்னாடி', 'ஸ்லைடு 2')";
                }
            } else {
                currentVoiceLang = 'en-US';
                if (voiceLangLabel) voiceLangLabel.textContent = 'EN';
                if (voiceHudText && isVoiceActive) {
                    voiceHudText.textContent = "Listening... Speak now ('Next', 'Back', 'Slide 3')";
                }
            }
            if (recognition) {
                try {
                    recognition.stop();
                } catch (e) {}
                recognition.lang = currentVoiceLang;
                if (isVoiceActive) {
                    setTimeout(() => {
                        try { recognition.start(); } catch (e) {}
                    }, 200);
                }
            }
            playAudioChime(600, 'sine', 0.08);
        });
    }
    if (voiceHelpBtn && voiceHelpModal) {
        voiceHelpBtn.addEventListener("click", () => {
            voiceHelpModal.style.display = "flex";
        });
    }
    if (closeVoiceModalBtn && voiceHelpModal) {
        closeVoiceModalBtn.addEventListener("click", () => {
            voiceHelpModal.style.display = "none";
        });
    }
    if (voiceHelpModal) {
        voiceHelpModal.addEventListener("click", (e) => {
            if (e.target === voiceHelpModal) {
                voiceHelpModal.style.display = "none";
            }
        });
    }

    // Modal Open/Close & File Upload Handlers
    function openUploadModal() {
        if (uploadPresentationModal) {
            uploadPresentationModal.style.display = "flex";
            if (uploadStatusBox) uploadStatusBox.style.display = "none";
        }
    }

    function closeUploadModal() {
        if (uploadPresentationModal) {
            uploadPresentationModal.style.display = "none";
        }
    }

    async function handlePresentationUpload(file) {
        if (!file) return;

        const validExts = [".pptx", ".ppt", ".pdf", ".png", ".jpg", ".jpeg"];
        const lowerName = file.name.toLowerCase();
        const isValid = validExts.some(ext => lowerName.endsWith(ext));
        if (!isValid) {
            alert("Please choose a supported file: PowerPoint (.pptx, .ppt), PDF (.pdf), or Image (.png, .jpg)");
            return;
        }

        if (uploadStatusBox && uploadStatusText) {
            uploadStatusBox.style.display = "block";
            uploadStatusBox.style.background = "rgba(56, 189, 248, 0.12)";
            uploadStatusBox.style.border = "1px solid rgba(56, 189, 248, 0.35)";
            uploadStatusText.innerHTML = `
                <i class="fa-solid fa-spinner fa-spin" style="color: var(--secondary); font-size: 18px;"></i>
                <span style="color: #fff; font-weight: 500;">Converting "<strong>${file.name}</strong>" for AI presentation...</span>
            `;
        }

        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch("/api/presentation/upload", {
                method: "POST",
                body: formData
            });
            const data = await res.json();
            if (res.ok && data.success) {
                if (uploadStatusBox && uploadStatusText) {
                    uploadStatusBox.style.background = "rgba(16, 185, 129, 0.15)";
                    uploadStatusBox.style.border = "1px solid rgba(16, 185, 129, 0.4)";
                    uploadStatusText.innerHTML = `
                        <i class="fa-solid fa-circle-check" style="color: #10B981; font-size: 18px;"></i>
                        <span style="color: #fff; font-weight: 600;">Presentation Ready! (${data.total_slides} slides loaded)</span>
                    `;
                }
                setTimeout(() => {
                    closeUploadModal();
                    if (data.state) {
                        renderPresentationState(data.state);
                    }
                }, 800);
            } else {
                throw new Error(data.error || "Failed to convert presentation");
            }
        } catch (err) {
            console.error("Presentation upload error:", err);
            if (uploadStatusBox && uploadStatusText) {
                uploadStatusBox.style.background = "rgba(239, 68, 68, 0.15)";
                uploadStatusBox.style.border = "1px solid rgba(239, 68, 68, 0.4)";
                uploadStatusText.innerHTML = `
                    <i class="fa-solid fa-triangle-exclamation" style="color: #EF4444; font-size: 18px;"></i>
                    <span style="color: #fff;">Error: ${err.message}</span>
                `;
            }
        }
    }

    async function revertToDefaultDeck() {
        try {
            const res = await fetch("/api/presentation/reset_deck", {
                method: "POST",
                headers: { "Content-Type": "application/json" }
            });
            const data = await res.json();
            if (res.ok && data.success) {
                renderPresentationState(data.state);
                closeUploadModal();
            }
        } catch (err) {
            console.error("Revert deck error:", err);
        }
    }

    // Bind Upload Modal Events
    if (openUploadModalBtn) openUploadModalBtn.addEventListener("click", openUploadModal);
    if (toolbarUploadBtn) toolbarUploadBtn.addEventListener("click", openUploadModal);
    if (closeUploadModalBtn) closeUploadModalBtn.addEventListener("click", closeUploadModal);
    if (uploadPresentationModal) {
        uploadPresentationModal.addEventListener("click", (e) => {
            if (e.target === uploadPresentationModal) closeUploadModal();
        });
    }

    if (browsePptFileBtn && pptFileInput) {
        browsePptFileBtn.addEventListener("click", () => pptFileInput.click());
    }
    if (pptFileInput) {
        pptFileInput.addEventListener("change", (e) => {
            if (e.target.files && e.target.files.length > 0) {
                handlePresentationUpload(e.target.files[0]);
                e.target.value = "";
            }
        });
    }

    if (pptDropZone) {
        ['dragenter', 'dragover'].forEach(eventName => {
            pptDropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                pptDropZone.classList.add("dragover");
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            pptDropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                pptDropZone.classList.remove("dragover");
            }, false);
        });

        pptDropZone.addEventListener("drop", (e) => {
            const dt = e.dataTransfer;
            if (dt && dt.files && dt.files.length > 0) {
                handlePresentationUpload(dt.files[0]);
            }
        });
    }

    if (resetToDefaultDeckBtn) resetToDefaultDeckBtn.addEventListener("click", revertToDefaultDeck);
    if (headerResetDeckBtn) headerResetDeckBtn.addEventListener("click", revertToDefaultDeck);

    // Event Listeners for Toolbar Buttons (with optimistic immediate rendering)
    nextSlideBtn.addEventListener("click", optimisticNext);
    prevSlideBtn.addEventListener("click", optimisticPrev);
    playPauseBtn.addEventListener("click", () => {
        if (!isPresenting) {
            sendAction("start");
        } else {
            sendAction("pause");
        }
    });
    resetSlideBtn.addEventListener("click", () => sendAction("reset"));
    zoomInBtn.addEventListener("click", () => sendAction("zoom", { delta: 0.2 }));
    zoomOutBtn.addEventListener("click", () => sendAction("zoom", { delta: -0.2 }));
    pointerToggleBtn.addEventListener("click", () => {
        sendAction("pointer", { active: !isPointerActive, x: 0.5, y: 0.5 });
    });

    fullscreenBtn.addEventListener("click", () => {
        if (!document.fullscreenElement) {
            stageContainer.requestFullscreen().catch(err => {
                console.error("Fullscreen error:", err);
            });
        } else {
            document.exitFullscreen();
        }
    });

    // Keyboard Shortcuts (Arrow keys with optimistic zero-delay rendering, Space/P, F, V)
    document.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight" || e.key === "PageDown") {
            optimisticNext();
        } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
            optimisticPrev();
        } else if (e.key === " " || e.key === "p") {
            if (!isPresenting) sendAction("start");
            else sendAction("pause");
        } else if (e.key === "f" || e.key === "F") {
            fullscreenBtn.click();
        } else if (e.key === "v" || e.key === "V") {
            // Toggle Voice Control with hotkey 'V'
            toggleVoiceControl();
        }
    });

    // 1. Initial full fetch to get slide definitions and preload images
    syncPresentation(true);

    // 2. Connect high-speed SSE real-time event stream (sub-20ms response!)
    connectEventStream();

    // 3. Fallback heartbeat poll (only lightweight sync every 1500ms)
    const intervalId = setInterval(() => syncPresentation(false), 1500);

    window.addEventListener("beforeunload", () => {
        clearInterval(intervalId);
        if (eventSource) {
            try { eventSource.close(); } catch (e) {}
        }
        if (recognition) {
            try { recognition.stop(); } catch (e) {}
        }
    });
});
