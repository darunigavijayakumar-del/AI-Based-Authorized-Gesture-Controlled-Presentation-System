document.addEventListener("DOMContentLoaded", () => {
    const cameraSelect = document.getElementById("cameraSelect");
    const sensitivitySelect = document.getElementById("sensitivitySelect");
    const cooldownSlider = document.getElementById("cooldownSlider");
    const cooldownValDisplay = document.getElementById("cooldownValDisplay");
    const presenterNameInput = document.getElementById("presenterNameInput");
    const sidebarPresenterName = document.getElementById("sidebarPresenterName");
    const saveSettingsBtn = document.getElementById("saveSettingsBtn");
    const resetDefaultsBtn = document.getElementById("resetDefaultsBtn");
    const colorOptions = document.querySelectorAll(".color-option");

    // Face Biometric Profile Elements in Settings
    const settingsFaceThumb = document.getElementById("settingsFaceThumb");
    const settingsFaceIcon = document.getElementById("settingsFaceIcon");
    const settingsFaceStatusTitle = document.getElementById("settingsFaceStatusTitle");
    const settingsFaceStatusSub = document.getElementById("settingsFaceStatusSub");
    const settingsRegisterFaceBtn = document.getElementById("settingsRegisterFaceBtn");
    const settingsResetFaceBtn = document.getElementById("settingsResetFaceBtn");

    // Modal Elements
    const faceRegisterModal = document.getElementById("faceRegisterModal");
    const closeFaceModalBtn = document.getElementById("closeFaceModalBtn");
    const modalPresenterNameInput = document.getElementById("modalPresenterNameInput");
    const startModalRegisterBtn = document.getElementById("startModalRegisterBtn");
    const scanProgressWrapper = document.getElementById("scanProgressWrapper");
    const scanProgressFill = document.getElementById("scanProgressFill");
    const scanStatusMsg = document.getElementById("scanStatusMsg");

    let selectedLaserColor = "#FF0055";

    // Load Face Profile Status
    async function checkFaceProfile() {
        try {
            const res = await fetch("/api/auth/profile");
            if (res.ok) {
                const data = await res.json();
                if (data.is_registered) {
                    if (settingsFaceStatusTitle) settingsFaceStatusTitle.textContent = `Enrolled: ${data.presenter_name}`;
                    if (settingsFaceStatusSub) {
                        settingsFaceStatusSub.innerHTML = '<span style="color:#10B981;"><i class="fa-solid fa-circle-check"></i> Active & Verified for Gesture Controls</span>';
                    }
                    if (settingsRegisterFaceBtn) {
                        settingsRegisterFaceBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Re-Enroll Face';
                    }
                    if (settingsFaceThumb && data.has_photo) {
                        settingsFaceThumb.src = `/static/registered_face.jpg?t=${Date.now()}`;
                        settingsFaceThumb.style.display = "block";
                        if (settingsFaceIcon) settingsFaceIcon.style.display = "none";
                    }
                } else {
                    if (settingsFaceStatusTitle) settingsFaceStatusTitle.textContent = "No Face Enrolled";
                    if (settingsFaceStatusSub) {
                        settingsFaceStatusSub.innerHTML = '<span style="color:#FBBF24;"><i class="fa-solid fa-triangle-exclamation"></i> Gestures locked until face is registered</span>';
                    }
                    if (settingsRegisterFaceBtn) {
                        settingsRegisterFaceBtn.innerHTML = '<i class="fa-solid fa-camera"></i> Register Face';
                    }
                    if (settingsFaceThumb) settingsFaceThumb.style.display = "none";
                    if (settingsFaceIcon) settingsFaceIcon.style.display = "block";
                }
            }
        } catch (e) {
            console.error("Profile check error:", e);
        }
    }

    // Modal open / close
    function openModal() {
        if (faceRegisterModal) {
            faceRegisterModal.classList.add("active");
            const modalCamFeed = document.getElementById("modalCamFeed");
            if (modalCamFeed && modalCamFeed.dataset.src) {
                modalCamFeed.src = modalCamFeed.dataset.src;
            }
            if (modalPresenterNameInput && presenterNameInput) {
                modalPresenterNameInput.value = presenterNameInput.value.trim() || "Presenter";
            }
            if (scanProgressWrapper) scanProgressWrapper.style.display = "none";
            if (scanProgressFill) scanProgressFill.style.width = "0%";
            if (startModalRegisterBtn) {
                startModalRegisterBtn.disabled = false;
                startModalRegisterBtn.innerHTML = '<i class="fa-solid fa-camera-retro"></i> Capture & Register Face Profile';
                startModalRegisterBtn.style.background = "";
            }
        }
    }

    function closeModal() {
        if (faceRegisterModal) {
            faceRegisterModal.classList.remove("active");
            const modalCamFeed = document.getElementById("modalCamFeed");
            if (modalCamFeed) {
                modalCamFeed.src = "";
            }
        }
    }

    if (settingsRegisterFaceBtn) {
        settingsRegisterFaceBtn.addEventListener("click", openModal);
    }
    if (closeFaceModalBtn) {
        closeFaceModalBtn.addEventListener("click", closeModal);
    }
    if (faceRegisterModal) {
        faceRegisterModal.addEventListener("click", (e) => {
            if (e.target === faceRegisterModal) closeModal();
        });
    }

    // Register Face Action in Modal
    if (startModalRegisterBtn) {
        startModalRegisterBtn.addEventListener("click", async () => {
            const name = modalPresenterNameInput ? (modalPresenterNameInput.value.trim() || "Presenter") : "Presenter";
            startModalRegisterBtn.disabled = true;
            startModalRegisterBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Scanning Face Samples...';

            if (scanProgressWrapper) scanProgressWrapper.style.display = "flex";
            if (scanProgressFill) scanProgressFill.style.width = "15%";
            if (scanStatusMsg) scanStatusMsg.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Collecting face samples from camera... Look directly at screen.</span>';

            let prog = 15;
            const progressTimer = setInterval(() => {
                if (prog < 88) {
                    prog += 12;
                    if (scanProgressFill) scanProgressFill.style.width = `${prog}%`;
                    if (scanStatusMsg) scanStatusMsg.innerHTML = `<i class="fa-solid fa-camera fa-beat"></i> <span>Analyzing landmarks & building profile... (${prog}%)</span>`;
                }
            }, 300);

            try {
                const res = await fetch("/api/auth/register", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ presenter_name: name })
                });
                clearInterval(progressTimer);

                const data = await res.json();
                if (res.ok && data.success) {
                    if (scanProgressFill) scanProgressFill.style.width = "100%";
                    if (scanStatusMsg) scanStatusMsg.innerHTML = `<i class="fa-solid fa-circle-check" style="color: #10B981;"></i> <span style="color: #10B981;">Biometric model trained for ${data.presenter}!</span>`;

                    startModalRegisterBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Face Profile Registered!';
                    startModalRegisterBtn.style.background = "linear-gradient(135deg, #10B981, #059669)";

                    if (presenterNameInput) presenterNameInput.value = data.presenter;
                    checkFaceProfile();

                    setTimeout(() => {
                        closeModal();
                    }, 1800);
                } else {
                    if (scanStatusMsg) scanStatusMsg.innerHTML = `<i class="fa-solid fa-circle-xmark" style="color: #EF4444;"></i> <span style="color: #EF4444;">${data.message || 'Registration failed'}</span>`;
                    startModalRegisterBtn.disabled = false;
                    startModalRegisterBtn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Try Again';
                }
            } catch (err) {
                clearInterval(progressTimer);
                console.error("Registration error:", err);
                if (scanStatusMsg) scanStatusMsg.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color: #EF4444;"></i> <span style="color: #EF4444;">Network error during enrollment</span>';
                startModalRegisterBtn.disabled = false;
                startModalRegisterBtn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Try Again';
            }
        });
    }

    // Reset Biometric Face Profile
    if (settingsResetFaceBtn) {
        settingsResetFaceBtn.addEventListener("click", async () => {
            if (confirm("Reset registered biometric face profile? All hand gestures will be locked until a new face is enrolled.")) {
                try {
                    const res = await fetch("/api/auth/reset", { method: "POST" });
                    if (res.ok) {
                        checkFaceProfile();
                        alert("Biometric face profile cleared. Gestures are now locked.");
                    }
                } catch (e) {
                    console.error("Reset error:", e);
                }
            }
        });
    }

    // Handle Cooldown Slider live display
    if (cooldownSlider && cooldownValDisplay) {
        cooldownSlider.addEventListener("input", (e) => {
            cooldownValDisplay.textContent = `${parseFloat(e.target.value).toFixed(1)}s`;
        });
    }

    // Handle Laser Pointer Color Options
    colorOptions.forEach(opt => {
        if (opt.classList.contains("active")) {
            selectedLaserColor = opt.getAttribute("data-color");
        }
        opt.addEventListener("click", () => {
            colorOptions.forEach(o => o.classList.remove("active"));
            opt.classList.add("active");
            selectedLaserColor = opt.getAttribute("data-color");
        });
    });

    const enforceFaceAuthSelect = document.getElementById("enforceFaceAuthSelect");

    // Save Settings
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener("click", async () => {
            const payload = {
                camera_index: parseInt(cameraSelect.value),
                sensitivity: sensitivitySelect.value,
                cooldown: parseFloat(cooldownSlider.value),
                presenter_name: presenterNameInput.value.trim() || "Presenter",
                laser_color: selectedLaserColor,
                enforce_face_auth: enforceFaceAuthSelect ? (enforceFaceAuthSelect.value === "true") : false
            };

            saveSettingsBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
            saveSettingsBtn.disabled = true;

            try {
                const res = await fetch("/api/settings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    saveSettingsBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Saved!';
                    saveSettingsBtn.style.background = "linear-gradient(135deg, #10B981, #059669)";
                    if (sidebarPresenterName) {
                        sidebarPresenterName.textContent = payload.presenter_name;
                    }
                    const sidebarAvatar = document.querySelector(".presenter-avatar");
                    if (sidebarAvatar) {
                        sidebarAvatar.textContent = (payload.presenter_name[0] || 'P').toUpperCase();
                    }
                    setTimeout(() => {
                        saveSettingsBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Settings';
                        saveSettingsBtn.style.background = "";
                        saveSettingsBtn.disabled = false;
                    }, 2000);
                }
            } catch (e) {
                console.error("Save settings error:", e);
                saveSettingsBtn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Error';
                saveSettingsBtn.disabled = false;
            }
        });
    }

    // Reset Defaults
    if (resetDefaultsBtn) {
        resetDefaultsBtn.addEventListener("click", async () => {
            if (confirm("Reset all settings to default values?")) {
                cameraSelect.value = "0";
                sensitivitySelect.value = "High";
                cooldownSlider.value = "0.8";
                cooldownValDisplay.textContent = "0.8s";
                presenterNameInput.value = "Daruniga";
                if (enforceFaceAuthSelect) enforceFaceAuthSelect.value = "false";

                colorOptions.forEach(o => {
                    o.classList.remove("active");
                    if (o.getAttribute("data-color") === "#FF0055") {
                        o.classList.add("active");
                    }
                });
                selectedLaserColor = "#FF0055";

                if (saveSettingsBtn) {
                    saveSettingsBtn.click();
                }
            }
        });
    }

    // Initial load
    checkFaceProfile();
});
