document.addEventListener("DOMContentLoaded", () => {
    const authStatusBar = document.getElementById("authStatusBar");
    const authStatusIcon = document.getElementById("authStatusIcon");
    const authStatusText = document.getElementById("authStatusText");
    const loginForm = document.getElementById("loginForm");
    const loginBtn = document.getElementById("loginBtn");
    const registerFaceBtn = document.getElementById("registerFaceBtn");
    const resetFaceBtn = document.getElementById("resetFaceBtn");
    const presenterNameInput = document.getElementById("presenterNameInput");
    const clearNameBtn = document.getElementById("clearNameBtn");
    const bypassVerifyBtn = document.getElementById("bypassVerifyBtn");
    const confBadge = document.getElementById("confBadge");
    const presenterNameDisplay = document.getElementById("presenterNameDisplay");
    const enrollmentStatus = document.getElementById("enrollmentStatus");

    let isFaceVerified = false;
    let isProfileRegistered = false;

    // Toggle clear button on input
    function updateClearBtn() {
        if (clearNameBtn && presenterNameInput) {
            clearNameBtn.style.display = presenterNameInput.value.trim() ? "inline-block" : "none";
        }
    }

    if (presenterNameInput) {
        updateClearBtn();
        presenterNameInput.addEventListener("input", () => {
            updateClearBtn();
            const currentName = presenterNameInput.value.trim() || "Presenter";
            if (presenterNameDisplay) {
                presenterNameDisplay.textContent = currentName;
            }
            if (isFaceVerified) {
                authStatusText.textContent = `Authorized Presenter: ${currentName}`;
            }
        });
    }

    if (clearNameBtn && presenterNameInput) {
        clearNameBtn.addEventListener("click", () => {
            presenterNameInput.value = "";
            presenterNameInput.focus();
            updateClearBtn();
            if (presenterNameDisplay) {
                presenterNameDisplay.textContent = "Presenter";
            }
        });
    }

    // Check Face Authentication Status regularly (ultra-fast 350ms interval)
    async function checkAuthStatus() {
        try {
            const res = await fetch("/api/auth/status");
            if (!res.ok) return;
            const data = await res.json();

            isProfileRegistered = !!data.is_registered;
            const currentTypedName = presenterNameInput ? (presenterNameInput.value.trim() || data.presenter || "Presenter") : (data.presenter || "Presenter");

            // Update enrollment status chip
            if (enrollmentStatus) {
                if (isProfileRegistered) {
                    enrollmentStatus.className = "enroll-badge";
                    enrollmentStatus.innerHTML = '<i class="fa-solid fa-shield"></i> Enrolled';
                } else {
                    enrollmentStatus.className = "enroll-badge not-enrolled";
                    enrollmentStatus.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Not Enrolled';
                }
            }

            // Update confidence match badge
            if (confBadge) {
                if (data.confidence && data.confidence > 0) {
                    confBadge.innerHTML = `<i class="fa-solid fa-chart-simple"></i> Match: ${Math.round(data.confidence * 100)}%`;
                } else if (data.verified) {
                    confBadge.innerHTML = `<i class="fa-solid fa-chart-simple"></i> Match: 95%`;
                } else {
                    confBadge.innerHTML = `<i class="fa-solid fa-chart-simple"></i> Scanning...`;
                }
            }

            if (data.verified) {
                isFaceVerified = true;
                authStatusBar.className = "auth-status-bar";
                authStatusIcon.className = "fa-solid fa-circle-check";
                authStatusText.textContent = `Authorized Presenter: ${currentTypedName}`;
                if (loginBtn) {
                    loginBtn.classList.add("pulse");
                }
            } else if (!isProfileRegistered) {
                isFaceVerified = false;
                authStatusBar.className = "auth-status-bar pending";
                authStatusIcon.className = "fa-solid fa-triangle-exclamation";
                authStatusText.textContent = "No Face Registered — Click 'Instant Face Scan'";
                if (loginBtn) {
                    loginBtn.classList.remove("pulse");
                }
            } else {
                isFaceVerified = false;
                authStatusBar.className = "auth-status-bar unverified";
                authStatusIcon.className = "fa-solid fa-user-xmark";
                authStatusText.textContent = `Face Unrecognized — Waiting for ${currentTypedName}...`;
                if (loginBtn) {
                    loginBtn.classList.remove("pulse");
                }
            }
        } catch (err) {
            console.error("Auth check failed:", err);
        }
    }

    // Capture & Register Face Profile (Fast ~0.5s sub-second scan)
    if (registerFaceBtn) {
        registerFaceBtn.addEventListener("click", async () => {
            const presenterName = presenterNameInput ? (presenterNameInput.value.trim() || "Presenter") : "Presenter";
            registerFaceBtn.disabled = true;
            const originalText = registerFaceBtn.innerHTML;

            registerFaceBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Rapid Face Scanning...';
            authStatusBar.className = "auth-status-bar scanning";
            authStatusIcon.className = "fa-solid fa-camera fa-beat";
            authStatusText.textContent = "Scanning face from camera... Hold still";

            try {
                const res = await fetch("/api/auth/register", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ presenter_name: presenterName })
                });

                const data = await res.json();
                if (res.ok && data.success) {
                    isFaceVerified = true;
                    isProfileRegistered = true;
                    registerFaceBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Face Profile Enrolled!';
                    registerFaceBtn.style.background = "linear-gradient(135deg, #10B981, #059669)";

                    authStatusBar.className = "auth-status-bar";
                    authStatusIcon.className = "fa-solid fa-circle-check";
                    authStatusText.textContent = `Biometric Profile Enrolled: ${data.presenter}`;

                    if (presenterNameDisplay) {
                        presenterNameDisplay.textContent = data.presenter;
                    }
                    if (enrollmentStatus) {
                        enrollmentStatus.className = "enroll-badge";
                        enrollmentStatus.innerHTML = '<i class="fa-solid fa-shield"></i> Enrolled';
                    }
                    if (loginBtn) {
                        loginBtn.classList.add("pulse");
                    }

                    setTimeout(() => {
                        registerFaceBtn.disabled = false;
                        registerFaceBtn.innerHTML = originalText;
                        registerFaceBtn.style.background = "";
                    }, 3000);
                } else {
                    registerFaceBtn.disabled = false;
                    registerFaceBtn.innerHTML = originalText;
                    authStatusBar.className = "auth-status-bar unverified";
                    authStatusIcon.className = "fa-solid fa-circle-xmark";
                    authStatusText.textContent = data.message || "Registration failed. Ensure face is clearly visible.";
                }
            } catch (err) {
                console.error("Registration error:", err);
                registerFaceBtn.disabled = false;
                registerFaceBtn.innerHTML = originalText;
                authStatusText.textContent = "Network error during face registration.";
            }
        });
    }

    // Reset Biometric Profile
    if (resetFaceBtn) {
        resetFaceBtn.addEventListener("click", async () => {
            if (confirm("Reset registered biometric face profile? You will need to enroll a new face.")) {
                try {
                    const res = await fetch("/api/auth/reset", { method: "POST" });
                    if (res.ok) {
                        isFaceVerified = false;
                        isProfileRegistered = false;
                        checkAuthStatus();
                    }
                } catch (e) {
                    console.error("Reset error:", e);
                }
            }
        });
    }

    // Perform Login
    async function handleLogin(e) {
        if (e) e.preventDefault();

        const presenterName = presenterNameInput ? (presenterNameInput.value.trim() || "Presenter") : "Presenter";

        loginBtn.disabled = true;
        const originalHtml = loginBtn.innerHTML;
        loginBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...';

        try {
            const res = await fetch("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ presenter_name: presenterName })
            });

            if (res.ok) {
                const data = await res.json();
                authStatusBar.className = "auth-status-bar";
                authStatusIcon.className = "fa-solid fa-circle-check";
                authStatusText.textContent = `Welcome, ${data.presenter_name}! Entering Dashboard...`;

                setTimeout(() => {
                    window.location.href = data.redirect || "/dashboard";
                }, 300);
            } else {
                loginBtn.disabled = false;
                loginBtn.innerHTML = originalHtml;
                alert("Login could not be processed. Please try again.");
            }
        } catch (err) {
            console.error("Login error:", err);
            loginBtn.disabled = false;
            loginBtn.innerHTML = originalHtml;
        }
    }

    if (loginForm) {
        loginForm.addEventListener("submit", handleLogin);
    } else if (loginBtn) {
        loginBtn.addEventListener("click", handleLogin);
    }

    // Quick verification trigger for immediate demo access
    if (bypassVerifyBtn) {
        bypassVerifyBtn.addEventListener("click", async () => {
            const currentTypedName = presenterNameInput ? (presenterNameInput.value.trim() || "Presenter") : "Presenter";
            try {
                authStatusText.textContent = `Quick authorizing ${currentTypedName}...`;
                authStatusIcon.className = "fa-solid fa-spinner fa-spin";

                const res = await fetch("/api/auth/status", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        presenter_name: currentTypedName,
                        action: "verify_now"
                    })
                });
                const data = await res.json();
                if (data.verified) {
                    checkAuthStatus();
                }
            } catch (e) {
                console.error("Bypass error:", e);
            }
        });
    }

    // Initial check and ultra-responsive polling (350ms interval)
    checkAuthStatus();
    const intervalId = setInterval(checkAuthStatus, 350);

    window.addEventListener("beforeunload", () => {
        clearInterval(intervalId);
    });
});