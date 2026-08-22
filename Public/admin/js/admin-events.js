(() => {
  const container = document.getElementById("eventsContainer");
  const search = document.getElementById("search");
  const refresh = document.getElementById("refreshEvents");
  const filters = [...document.querySelectorAll(".status-filter")];
  const state = { events: [], query: "", status: "all", busy: false };
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "/login.html?mode=login";
    return;
  }

  const escapeHtml = (value = "") => String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;").replace(/'/g, "&#039;");

  const formatDate = (value) => {
    if (!value) return "Date TBA";
    const date = new Date(value);
    return Number.isNaN(date.valueOf())
      ? "Date TBA"
      : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date);
  };

  const showNotice = (message, tone = "info") => {
    let notice = document.getElementById("adminNotice");
    if (!notice) {
      notice = document.createElement("div");
      notice.id = "adminNotice";
      document.body.appendChild(notice);
    }
    notice.className = `notice-${tone}`;
    notice.textContent = message;
    clearTimeout(showNotice.timer);
    requestAnimationFrame(() => notice.classList.add("is-visible"));
    showNotice.timer = setTimeout(() => notice.classList.remove("is-visible"), 3000);
  };

  const request = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) throw new Error(data.message || "Something went wrong");
    return data;
  };

  const updateCounts = () => {
    const counts = state.events.reduce((acc, event) => { acc[event.status] = (acc[event.status] || 0) + 1; return acc; }, {});
    [["allCount", state.events.length], ["pendingCount", counts.pending || 0], ["approvedCount", counts.approved || 0], ["rejectedCount", counts.rejected || 0]]
      .forEach(([id, value]) => { const node = document.getElementById(id); if (node) node.textContent = value; });
  };

  const visibleEvents = () => state.events.filter((event) => {
    const matchesStatus = state.status === "all" || event.status === state.status;
    const haystack = [event.title, event.venue, event.location, event.organizer?.name, event.organizer?.email].join(" ").toLowerCase();
    return matchesStatus && (!state.query || haystack.includes(state.query));
  });

  const renderEvents = () => {
    const events = visibleEvents();
    const count = document.getElementById("eventCount");
    if (count) count.textContent = `${events.length} ${events.length === 1 ? "event" : "events"} shown`;
    updateCounts();
    if (!events.length) {
      const hasEvents = state.events.length > 0;
      container.innerHTML = `<div class="admin-empty"><span>${hasEvents ? "⌕" : "✦"}</span><h2>${hasEvents ? "No matching events" : "No events here yet"}</h2><p>${hasEvents ? "Try another search or status filter." : "Create a listing to start building the catalogue."}</p>${hasEvents ? "" : "<a class=\"admin-primary\" href=\"/create-event.html?from=admin\">Create event <span aria-hidden=\"true\">↗</span></a>"}</div>`;
      return;
    }
    container.innerHTML = events.map((event) => {
      const seatsLeft = Math.max(0, Number(event.seats || 0) - Number(event.ticketsSold || 0));
      const status = escapeHtml(event.status || "pending");
      const actionButtons = event.status === "pending"
        ? `<button class="action-btn approve-btn" data-action="approve" data-id="${event._id}">Approve</button><button class="action-btn reject-btn" data-action="reject" data-id="${event._id}">Reject</button>`
        : "";
      return `<article class="admin-event-card">
        <div class="admin-event-media"><img src="${escapeHtml(event.banner || "/Media/Png/no-event.jpg")}" alt="${escapeHtml(event.title)}" loading="lazy"><span class="status-badge ${status}">${status}</span></div>
        <div class="admin-event-body">
          <div class="admin-event-heading"><div><p class="event-kicker">${escapeHtml(event.location || "Evently listing")}</p><h2>${escapeHtml(event.title)}</h2></div><span class="event-price">₹${Number(event.price || 0).toLocaleString("en-IN")}</span></div>
          <div class="admin-event-meta"><span>◷ ${formatDate(event.date)}${event.time ? ` · ${escapeHtml(event.time)}` : ""}</span><span>⌖ ${escapeHtml(event.venue || "Venue TBA")}</span><span>◎ ${escapeHtml(event.organizer?.name || "Unassigned")}</span></div>
          <div class="event-health"><span><strong>${Number(event.ticketsSold || 0)}</strong> sold</span><span><strong>${seatsLeft}</strong> seats left</span><span><strong>${escapeHtml(event.agelim || "All ages")}</strong></span></div>
          <div class="event-actions"><button class="action-btn edit-btn" data-action="edit" data-id="${event._id}">Edit details</button><button class="action-btn delete-btn" data-action="delete" data-id="${event._id}">Delete</button>${actionButtons}</div>
        </div>
      </article>`;
    }).join("");
  };

  const loadEvents = async () => {
    if (!container || state.busy) return;
    state.busy = true;
    refresh?.classList.add("is-loading");
    container.innerHTML = `<div class="admin-loading"><span class="loader"></span><p>Loading event queue…</p></div>`;
    try {
      const data = await request("/api/admin/events");
      state.events = Array.isArray(data.events) ? data.events : [];
      renderEvents();
    } catch (error) {
      container.innerHTML = `<div class="admin-empty"><span>!</span><h2>Could not load events</h2><p>${escapeHtml(error.message)}</p><button class="admin-primary" id="retryEvents" type="button">Try again</button></div>`;
      document.getElementById("retryEvents")?.addEventListener("click", loadEvents);
    } finally {
      state.busy = false;
      refresh?.classList.remove("is-loading");
    }
  };

  const updateEventStatus = async (id, status) => {
    const button = document.querySelector(`[data-action="${status === "approved" ? "approve" : "reject"}"][data-id="${id}"]`);
    button?.classList.add("is-loading");
    try {
      await request(`/api/admin/events/${id}/${status === "approved" ? "approve" : "reject"}`, { method: "PATCH" });
      const event = state.events.find(item => item._id === id);
      if (event) event.status = status;
      renderEvents();
      showNotice(`Event ${status}.`, "success");
    } catch (error) { showNotice(error.message, "error"); button?.classList.remove("is-loading"); }
  };

  container?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const id = button.dataset.id;
    const action = button.dataset.action;
    if (action === "edit") {
      const destination = `/edit-event.html?id=${encodeURIComponent(id)}&from=admin`;
      if (window.EventlyTransition?.navigate) window.EventlyTransition.navigate(destination);
      else window.location.href = destination;
      return;
    }
    if (action === "approve" || action === "reject") { await updateEventStatus(id, action === "approve" ? "approved" : "rejected"); return; }
    if (action === "delete") {
      const eventData = state.events.find(item => item._id === id);
      if (!window.confirm(`Delete “${eventData?.title || "this event"}”? This cannot be undone.`)) return;
      button.classList.add("is-loading");
      try {
        await request(`/api/admin/events/${id}`, { method: "DELETE" });
        state.events = state.events.filter(item => item._id !== id);
        renderEvents();
        showNotice("Event deleted.", "success");
      } catch (error) { button.classList.remove("is-loading"); showNotice(error.message, "error"); }
    }
  });

  search?.addEventListener("input", (event) => { state.query = event.target.value.trim().toLowerCase(); renderEvents(); });
  filters.forEach((filter) => filter.addEventListener("click", () => {
    state.status = filter.dataset.status;
    filters.forEach(item => {
      const active = item === filter;
      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    renderEvents();
  }));
  refresh?.addEventListener("click", loadEvents);
  loadEvents();
})();
