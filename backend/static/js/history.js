document.addEventListener("DOMContentLoaded", () => {
    const historyTableBody = document.getElementById("historyTableBody");
    const historySearchInput = document.getElementById("historySearchInput");
    const refreshHistoryBtn = document.getElementById("refreshHistoryBtn");
    const clearHistoryBtn = document.getElementById("clearHistoryBtn");
    const exportCsvBtn = document.getElementById("exportCsvBtn");

    let historyRecords = [];

    async function loadHistory() {
        try {
            const res = await fetch("/api/history");
            if (!res.ok) return;
            const data = await res.json();
            historyRecords = data.history || [];
            renderHistoryTable(historyRecords);
        } catch (e) {
            console.error("Load history error:", e);
        }
    }

    function renderHistoryTable(records) {
        if (!records || records.length === 0) {
            historyTableBody.innerHTML = `
                <tr>
                    <td colspan="5">
                        <div class="empty-history-state">
                            <i class="fa-solid fa-inbox"></i>
                            <h3>No activity logged</h3>
                            <p>Perform gestures or run presentations to populate the audit history.</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        historyTableBody.innerHTML = records.slice().reverse().map(item => `
            <tr>
                <td style="color: var(--text-dim);">#${item.id}</td>
                <td style="font-size: 13px; color: var(--text-muted);">${item.timestamp}</td>
                <td>
                    <div class="gesture-cell">
                        <i class="fa-solid ${item.icon || 'fa-bolt'}"></i>
                        <span>${item.gesture}</span>
                    </div>
                </td>
                <td>${item.action}</td>
                <td>
                    <span class="badge-status ${(item.status || 'success').toLowerCase()}">${item.status}</span>
                </td>
            </tr>
        `).join("");
    }

    // Filter History records on search input
    if (historySearchInput) {
        historySearchInput.addEventListener("input", (e) => {
            const q = e.target.value.toLowerCase().trim();
            if (!q) {
                renderHistoryTable(historyRecords);
                return;
            }
            const filtered = historyRecords.filter(item =>
                (item.gesture && item.gesture.toLowerCase().includes(q)) ||
                (item.action && item.action.toLowerCase().includes(q)) ||
                (item.timestamp && item.timestamp.toLowerCase().includes(q)) ||
                (item.status && item.status.toLowerCase().includes(q))
            );
            renderHistoryTable(filtered);
        });
    }

    // Refresh button
    if (refreshHistoryBtn) {
        refreshHistoryBtn.addEventListener("click", () => {
            loadHistory();
        });
    }

    // Clear history
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener("click", async () => {
            if (confirm("Are you sure you want to clear the entire activity history?")) {
                try {
                    const res = await fetch("/api/history", { method: "DELETE" });
                    if (res.ok) {
                        historyRecords = [];
                        renderHistoryTable([]);
                    }
                } catch (e) {
                    console.error("Clear error:", e);
                }
            }
        });
    }

    // Export CSV
    if (exportCsvBtn) {
        exportCsvBtn.addEventListener("click", () => {
            if (historyRecords.length === 0) {
                alert("No records to export.");
                return;
            }
            let csvContent = "data:text/csv;charset=utf-8,ID,Timestamp,Gesture,Action,Status\n";
            historyRecords.forEach(r => {
                csvContent += `${r.id},"${r.timestamp}","${r.gesture}","${r.action}","${r.status}"\n`;
            });
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `presentation_activity_log_${Date.now()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    loadHistory();
});
