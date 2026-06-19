
if (!token) {
    window.location.href = "../login.html";
}

loadDashboard();

async function loadDashboard() {

    try {

        const response = await fetch(
            "/api/admin/dashboard",
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const data = await response.json();

        if (!data.success) {
            alert("Access Denied");
            return;
        }

        document.getElementById("users").textContent =
            data.stats.users;

        document.getElementById("events").textContent =
            data.stats.events;

        document.getElementById("tickets").textContent =
            data.stats.ticketsSold;

        document.getElementById("revenue").textContent =
            "₹" + data.stats.revenue.toLocaleString();

    } catch (err) {

        console.error(err);

    }

}   
