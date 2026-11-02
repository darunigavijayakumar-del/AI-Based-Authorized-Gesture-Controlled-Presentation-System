document.addEventListener("DOMContentLoaded", () => {
    const statusFace = document.getElementById("statusFace");
    const statusCam = document.getElementById("statusCam");
    const statusGesture = document.getElementById("statusGesture");
    const statusPres = document.getElementById("statusPres");
    const recentActivityList = document.getElementById("recentActivityList");

    // Dynamic Auth Banner Elements
    const dashboardAuthBanner = document.getElementById("dashboardAuthBanner");
    const authBannerIcon = document.getElementById("authBannerIcon");
    const authBannerTitle = document.getElementById("authBannerTitle");
    const authBannerSubtitle = document.getElementById("authBannerSubtitle");
    const quickRegisterFaceBtn = document.getElementById("quickRegisterFaceBtn");

    // Modal Elements
    const faceRegisterModal = document.getElementById("faceRegisterModal");
    const closeFaceModalBtn = document.getElementById("closeFaceModalBtn");
    const modalPresenterNameInput = document.getElementById("modalPresenterNameInput");
    const startModalRegisterBtn = document.getElementById("startModalRegisterBtn");
    const scanProgressWrapper = document.getElementById("scanProgressWrapper");
    const scanProgressFill = document.getElementById("scanProgressFill");
    const scanStatusMsg = document.getElementById("scanStatusMsg");

    let isProfileRegistered = false;

    // Open Face Registration Modal
    function openModal() {
        if (faceRegisterModal) {
            faceRegisterModal.classList.add("active");
            const modalCamFeed = document.getElementById("modalCamFeed");
            if (modalCamFeed && modalCamFeed.dataset.src) {
                modalCamFeed.src = modalCamFeed.dataset.src;
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

    if (quickRegisterFaceBtn) {
        quickRegisterFaceBtn.addEventListener("click", openModal);
    }
    if (closeFaceModalBtn) {
        closeFaceModalBtn.addEventListener("click", closeModal);
    }
    if (faceRegisterModal) {
        faceRegisterModal.addEventListener("click", (e) => {
            if (e.target === faceRegisterModal) closeModal();
        });
    }

    // Handle Live Face Registration from Modal
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

                    isProfileRegistered = true;
                    updateDashboardState();

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

    async function updateDashboardState() {
        try {
            // Update Auth Status
            const authRes = await fetch("/api/auth/status");
            if (authRes.ok) {
                const authData = await authRes.json();
                isProfileRegistered = !!authData.is_registered;

                if (authData.presenter) {
                    const sName = document.querySelector(".presenter-name");
                    const sAvatar = document.querySelector(".presenter-avatar");
                    const dName = document.getElementById("dashboardPresenterName");
                    if (sName) sName.textContent = authData.presenter;
                    if (sAvatar) sAvatar.textContent = (authData.presenter[0] || 'P').toUpperCase();
                    if (dName) dName.textContent = authData.presenter;
                }

                // Update Camera Status Pill
                if (authData.camera_connected !== false) {
                    statusCam.textContent = "Connected";
                    statusCam.className = "status-pill success";
                } else {
                    statusCam.textContent = "Connecting";
                    statusCam.className = "status-pill primary";
                }

                // Update Face Auth Banner & Pill based on strict registration status
                if (!isProfileRegistered) {
                    statusFace.textContent = "Not Registered";
                    statusFace.className = "status-pill warning";

                    if (dashboardAuthBanner) {
                        dashboardAuthBanner.style.background = "rgba(245, 158, 11, 0.12)";
                        dashboardAuthBanner.style.borderColor = "rgba(245, 158, 11, 0.4)";
                    }
                    if (authBannerIcon) {
                        authBannerIcon.className = "fa-solid fa-triangle-exclamation";
                        authBannerIcon.style.color = "#FBBF24";
                    }
                    if (authBannerTitle) {
                        authBannerTitle.textContent = "No Face Registered";
                        authBannerTitle.style.color = "#FCD34D";
                    }
                    if (authBannerSubtitle) {
                        authBannerSubtitle.textContent = "Hand gestures are locked. Register your face to enable slide control.";
                    }
                    if (quickRegisterFaceBtn) {
                        quickRegisterFaceBtn.innerHTML = '<i class="fa-solid fa-camera"></i> Register Face Now';
                        quickRegisterFaceBtn.style.background = "linear-gradient(135deg, #0284C7, #0EA5E9)";
                    }

                } else if (authData.verified) {
                    statusFace.textContent = "Verified";
                    statusFace.className = "status-pill success";

                    if (dashboardAuthBanner) {
                        dashboardAuthBanner.style.background = "rgba(16, 185, 129, 0.12)";
                        dashboardAuthBanner.style.borderColor = "rgba(16, 185, 129, 0.4)";
                    }
                    if (authBannerIcon) {
                        authBannerIcon.className = "fa-solid fa-circle-check";
                        authBannerIcon.style.color = "#10B981";
                    }
                    if (authBannerTitle) {
                        authBannerTitle.textContent = `Authorized: ${authData.presenter}`;
                        authBannerTitle.style.color = "#fff";
                    }
                    if (authBannerSubtitle) {
                        authBannerSubtitle.textContent = "Face recognized & verified. Hand gestures actively control slides.";
                    }
                    if (quickRegisterFaceBtn) {
                        quickRegisterFaceBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Re-Enroll Face';
                        quickRegisterFaceBtn.style.background = "rgba(255, 255, 255, 0.08)";
                    }

                } else {
                    statusFace.textContent = "Locked";
                    statusFace.className = "status-pill danger";

                    if (dashboardAuthBanner) {
                        dashboardAuthBanner.style.background = "rgba(239, 68, 68, 0.12)";
                        dashboardAuthBanner.style.borderColor = "rgba(239, 68, 68, 0.4)";
                    }
                    if (authBannerIcon) {
                        authBannerIcon.className = "fa-solid fa-user-xmark";
                        authBannerIcon.style.color = "#EF4444";
                    }
                    if (authBannerTitle) {
                        authBannerTitle.textContent = "Presenter Not In View / Stranger";
                        authBannerTitle.style.color = "#F87171";
                    }
                    if (authBannerSubtitle) {
                        authBannerSubtitle.textContent = `Gestures locked. Standing in front of the camera as ${authData.presenter} is required.`;
                    }
                    if (quickRegisterFaceBtn) {
                        quickRegisterFaceBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Re-Enroll Face';
                        quickRegisterFaceBtn.style.background = "rgba(255, 255, 255, 0.08)";
                    }
                }
            }

            // Update Gesture State
            const gestureRes = await fetch("/api/current_gesture");
            if (gestureRes.ok) {
                const gestureData = await gestureRes.json();
                if (!gestureData.is_registered) {
                    statusGesture.textContent = "Locked (No Face)";
                    statusGesture.className = "status-pill warning";
                } else if (!gestureData.is_authorized) {
                    statusGesture.textContent = "Locked (Unverified)";
                    statusGesture.className = "status-pill danger";
                } else if (gestureData.gesture && gestureData.gesture !== "None") {
                    statusGesture.textContent = gestureData.gesture;
                    statusGesture.className = "status-pill success";
                } else {
                    statusGesture.textContent = "Active";
                    statusGesture.className = "status-pill success";
                }
            }

            // Update Presentation State
            const presRes = await fetch("/api/presentation/state");
            if (presRes.ok) {
                const presData = await presRes.json();
                if (presData.is_presenting) {
                    statusPres.textContent = `Slide ${presData.current_slide_number}/${presData.total_slides}`;
                    statusPres.className = "status-pill success";
                } else {
                    statusPres.textContent = "Ready";
                    statusPres.className = "status-pill primary";
                }
            }

            // Update Recent Activity
            const histRes = await fetch("/api/history");
            if (histRes.ok) {
                const histData = await histRes.json();
                if (histData.history && histData.history.length > 0) {
                    const recent = histData.history.slice(-4).reverse();
                    recentActivityList.innerHTML = recent.map(item => `
                        <li class="activity-item">
                            <i class="fa-solid ${item.icon || 'fa-bolt'}"></i>
                            <span>${item.action}</span>
                            <span class="time-ago">${item.timestamp.split(' ')[1] || 'recent'}</span>
                        </li>
                    `).join("");
                }
            }
        } catch (e) {
            console.error("Dashboard update failed:", e);
        }
    }

    updateDashboardState();
    const intervalId = setInterval(updateDashboardState, 1400);

    window.addEventListener("beforeunload", () => {
        clearInterval(intervalId);
    });
});