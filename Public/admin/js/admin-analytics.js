(() => {
    let userChart; let activityChart;
    const token = localStorage.getItem("token");
    const feedback = document.getElementById("analyticsFeedback");
    const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
    const setFeedback = (message = "", type = "") => { if (feedback) { feedback.textContent = message; feedback.className = `admin-feedback ${type}`.trim(); } };
    const value = (id, number) => { const node = document.getElementById(id); if (node) node.textContent = Number(number || 0).toLocaleString(); };
    function renderList(id, items, empty) { const node = document.getElementById(id); if (!node) return; node.innerHTML = items?.length ? items.map((item) => `<div class="activity-item"><span>${escapeHtml(item.title || item.name)}</span><strong>${escapeHtml(item.eventCount ? `${item.eventCount} events` : new Date(item.createdAt).toLocaleDateString())}</strong></div>`).join("") : `<div class="admin-empty"><span>${empty}</span></div>`; }
    function renderCharts(stats) {
        if (!window.Chart) return;
        const userData = [stats.totalUsers || 0, stats.totalOrganizers || 0, stats.totalAdmins || 0]; const activityData = [stats.totalEvents || 0, stats.totalInterested || 0, stats.totalTicketsSold || 0];
        if (!userChart) userChart = new Chart(document.getElementById("eventStatusChart"), { type: "doughnut", data: { labels: ["Users", "Organizers", "Admins"], datasets: [{ data: userData, backgroundColor: ["#6d5dfc", "#22c55e", "#f59e0b"], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } } }); else { userChart.data.datasets[0].data = userData; userChart.update(); }
        if (!activityChart) activityChart = new Chart(document.getElementById("userGrowthChart"), { type: "bar", data: { labels: ["Events", "Interested", "Tickets sold"], datasets: [{ data: activityData, backgroundColor: "#ef5da8", borderRadius: 8, maxBarThickness: 42 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } }); else { activityChart.data.datasets[0].data = activityData; activityChart.update(); }
    }
    async function loadAnalytics() {
        try { const response = await fetch("/api/admin/stats", { headers: { Authorization: `Bearer ${token}` } }); const data = await response.json().catch(() => ({})); if (!response.ok || data.success === false) throw new Error(data.message || "Analytics could not be loaded"); const stats = data.stats || {}; value("totalUsers", stats.totalUsers); value("totalOrganizers", stats.totalOrganizers); value("totalEvents", stats.totalEvents); value("totalInterested", stats.totalInterested); value("ticketsSold", stats.totalTicketsSold); renderList("recentEvents", data.recentEvents, "No events yet."); renderList("topOrganizers", data.topOrganizers, "No organizer activity yet."); renderCharts(stats); setFeedback(""); }
        catch (error) { setFeedback(error.message, "error"); }
    }
    document.getElementById("refreshAnalytics")?.addEventListener("click", loadAnalytics); loadAnalytics(); setInterval(loadAnalytics, 30000);
})();
