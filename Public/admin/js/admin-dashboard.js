(() => {
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "../login.html";
    return;
  }

  const setText = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = value; };
  const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

  const loadDashboard = async () => {
    try {
      const response = await fetch("/api/admin/dashboard", { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to load dashboard");
      setText("users", data.stats.users);
      setText("events", data.stats.events);
      setText("tickets", data.stats.ticketsSold);
      setText("revenue", money(data.stats.revenue));
    } catch (error) {
      ["users", "events", "tickets"].forEach(id => setText(id, "—"));
      setText("revenue", "Unavailable");
      const state = document.getElementById("dashboardState");
      if (state) state.textContent = error.message;
    }
  };

  loadDashboard();
})();
