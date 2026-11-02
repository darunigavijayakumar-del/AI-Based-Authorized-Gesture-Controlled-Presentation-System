document.addEventListener("DOMContentLoaded", () => {
    const detectedGestureText = document.getElementById("detectedGestureText");
    const detectedActionText = document.getElementById("detectedActionText");
    const gestureIndicator = document.getElementById("gestureIndicator");
    const cooldownBar = document.getElementById("cooldownBar");
    const cooldownLabel = document.getElementById("cooldownLabel");
    const metricConfidence = document.getElementById("metricConfidence");
    const metricTriggers = document.getElementById("metricTriggers");

    let totalTriggers = 0;
    let lastGesture = "None";

    const gestureCardMap = {
        "Thumb Up": "card-Thumb-Up",
        "Thumb Down": "card-Thumb-Down",
        "Open Palm": "card-Open-Palm",
        "Closed Fist": "card-Closed-Fist",
        "Index Finger": "card-Index-Finger",
        "Two Fingers": "card-Two-Fingers",
        "Three Fingers": "card-Three-Fingers"
    };

    function clearCardHighlights() {
        document.querySelectorAll(".gesture-matrix-card").forEach(card => {
            card.classList.remove("active");
        });
    }

    async function pollGesture() {
        try {
            const res = await fetch("/api/current_gesture");
            if (!res.ok) return;
            const data = await res.json();

            const gesture = data.gesture;
            const action = data.action;
            const confidence = data.confidence;
            const cooldown = data.cooldown_remaining;

            // Clear previous active states
            clearCardHighlights();

            if (gesture && gesture !== "None") {
                detectedGestureText.textContent = `Gesture: ${gesture}`;
                detectedActionText.textContent = `Mapped Action: ${action}`;
                gestureIndicator.style.background = "var(--success)";
                gestureIndicator.style.boxShadow = "0 0 15px var(--success)";

                // Highlight corresponding card
                const cardId = gestureCardMap[gesture];
                if (cardId) {
                    const cardElem = document.getElementById(cardId);
                    if (cardElem) cardElem.classList.add("active");
                }

                if (gesture !== lastGesture) {
                    totalTriggers++;
                    metricTriggers.textContent = totalTriggers;
                    lastGesture = gesture;
                }

                metricConfidence.textContent = `${Math.round(confidence * 100)}%`;
            } else {
                detectedGestureText.textContent = "Scanning for Hands...";
                detectedActionText.textContent = "Position hand within camera viewport";
                gestureIndicator.style.background = "var(--secondary)";
                gestureIndicator.style.boxShadow = "0 0 8px var(--secondary)";
                lastGesture = "None";
                metricConfidence.textContent = "0%";
            }

            // Cooldown progress update
            const totalCd = data.cooldown_duration || 1.2;
            if (cooldown > 0) {
                const pct = Math.max(0, Math.min(100, (1 - cooldown / totalCd) * 100));
                cooldownBar.style.width = `${pct}%`;
                cooldownLabel.textContent = `Cooldown: ${cooldown.toFixed(1)}s`;
            } else {
                cooldownBar.style.width = "100%";
                cooldownLabel.textContent = "Cooldown: Ready";
            }
        } catch (e) {
            console.error("Gesture poll error:", e);
        }
    }

    const intervalId = setInterval(pollGesture, 200);

    window.addEventListener("beforeunload", () => {
        clearInterval(intervalId);
    });
});
