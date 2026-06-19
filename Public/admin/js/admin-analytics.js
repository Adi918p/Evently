let eventChart = null;
let activityChart = null;

async function loadAnalytics() {
    try {

        const token = localStorage.getItem("token");

        const res = await fetch("/api/admin/stats", {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const data = await res.json();

        if (!data.success) {
            console.error(data.message);
            return;
        }

        // ===== CARDS =====

        document.getElementById("totalUsers").textContent =
            data.stats.totalUsers || 0;

        document.getElementById("totalOrganizers").textContent =
            data.stats.totalOrganizers || 0;

        document.getElementById("totalEvents").textContent =
            data.stats.totalEvents || 0;

        document.getElementById("totalInterested").textContent =
            data.stats.totalInterested || 0;

        document.getElementById("ticketsSold").textContent =
            data.stats.totalTicketsSold || 0;

        // ===== RECENT EVENTS =====

        document.getElementById("recentEvents").innerHTML =
            data.recentEvents?.length
                ? data.recentEvents.map(event => `
                    <div class="activity-item">
                        <span>${event.title}</span>
                        <span>${new Date(event.createdAt).toLocaleDateString()}</span>
                    </div>
                `).join("")
                : `<div class="activity-item">
                        <span>No events found</span>
                   </div>`;

        // ===== TOP ORGANIZERS =====

        document.getElementById("topOrganizers").innerHTML =
            data.topOrganizers?.length
                ? data.topOrganizers.map(org => `
                    <div class="activity-item">
                        <span>${org.name}</span>
                        <span>${org.eventCount} Events</span>
                    </div>
                `).join("")
                : `<div class="activity-item">
                        <span>No organizers found</span>
                   </div>`;

        // ===== CHART 1 =====

        const eventChartData = [
            data.stats.totalUsers || 0,
            data.stats.totalOrganizers || 0,
            data.stats.totalAdmins || 0
        ];

        if (!eventChart) {

            eventChart = new Chart(
                document.getElementById("eventStatusChart"),
                {
                    type: "doughnut",
                    data: {
                        labels: [
                            "Users",
                            "Organizers",
                            "Admins"
                        ],
                        datasets: [{
                            label: "Platform Users",
                            data: eventChartData
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false
                    }
                }
            );

        } else {

            eventChart.data.datasets[0].data =
                eventChartData;

            eventChart.update();
        }

        // ===== CHART 2 =====

        const activityData = [
            data.stats.totalEvents || 0,
            data.stats.totalInterested || 0,
            data.stats.totalTicketsSold || 0
        ];

        if (!activityChart) {

            activityChart = new Chart(
                document.getElementById("userGrowthChart"),
                {
                    type: "bar",
                    data: {
                        labels: [
                            "Events",
                            "Interested",
                            "Tickets Sold"
                        ],
                        datasets: [{
                            label: "Platform Activity",
                            data: activityData
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false
                    }
                }
            );

        } else {

            activityChart.data.datasets[0].data =
                activityData;

            activityChart.update();
        }

    } catch (err) {
        console.error("Analytics Error:", err);
    }
}

// Initial Load
loadAnalytics();

// Auto Refresh Every 30 Seconds
setInterval(loadAnalytics, 30000);