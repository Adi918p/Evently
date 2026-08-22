(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = { events: [], filters: { query: "", location: "", category: "", date: "" } };
  const categoryLabels = {
    networking: "Networking", club: "Club", music: "Music", workshop: "Workshop",
    sports: "Sports", arts: "Arts", food: "Food & drinks", comedy: "Comedy",
    festival: "Festival", tech: "Tech", gaming: "Gaming", other: "Other"
  };
  const categoryOrder = ["networking", "club", "music", "workshop", "sports", "arts", "food", "comedy", "festival", "tech", "gaming", "other"];

  const escapeHtml = (value = "") => String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;").replace(/'/g, "&#039;");

  const decodeToken = () => {
    const token = localStorage.getItem("token");
    if (!token) return null;
    try {
      const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const user = JSON.parse(atob(payload));
      if (user.exp && user.exp * 1000 < Date.now()) { localStorage.removeItem("token"); return null; }
      return user;
    } catch { localStorage.removeItem("token"); return null; }
  };

  const formatDate = (date) => {
    if (!date) return "Date TBA";
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? "Date TBA" : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(parsed);
  };

  const showToast = (message, type = "info") => {
    let toast = $("#eventlyToast");
    if (!toast) { toast = document.createElement("div"); toast.id = "eventlyToast"; document.body.appendChild(toast); }
    toast.className = `toast-${type}`;
    toast.textContent = message;
    clearTimeout(showToast.timer);
    requestAnimationFrame(() => toast.classList.add("is-visible"));
    showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 3200);
  };

  const updateAuthUI = () => {
    const user = decodeToken();
    const logsec = $("#logw");
    const dropdown = $("#userDropdown");
    const username = $("#username");
    const dashboard = $("#dashboardItem");
    if (!dropdown) return user;
    if (user) {
      logsec?.classList.add("hidden"); dropdown.classList.remove("hidden");
      if (username) username.textContent = user.name || "Member";
      if (dashboard) dashboard.style.display = ["admin", "organizer"].includes(user.role) ? "block" : "none";
    } else { logsec?.classList.remove("hidden"); dropdown.classList.add("hidden"); }
    return user;
  };

  const setupDropdown = () => {
    const button = $("#dropdownBtn");
    const menu = $("#dropdownMenu");
    button?.addEventListener("click", (event) => { event.stopPropagation(); menu?.classList.toggle("hidden"); });
    document.addEventListener("click", (event) => { if (!event.target.closest(".user-dropdown")) menu?.classList.add("hidden"); });
    $("#logoutBtn")?.addEventListener("click", () => { localStorage.removeItem("token"); window.location.reload(); });
  };

  const inferCategory = (event) => {
    const stored = String(event?.category || "").toLowerCase();
    if (categoryLabels[stored]) return stored;
    const haystack = [event?.title, event?.description, event?.about, event?.venue, event?.location].join(" ").toLowerCase();
    if (/network|meetup|community/.test(haystack)) return "networking";
    if (/club|nightlife|dj|party/.test(haystack)) return "club";
    if (/music|concert|live set/.test(haystack)) return "music";
    return "other";
  };

  const filteredEvents = () => state.events.filter((event) => {
    const haystack = [event.title, event.description, event.about, event.venue, event.location, event.category].join(" ").toLowerCase();
    const queryMatches = !state.filters.query || haystack.includes(state.filters.query.toLowerCase());
    const locationMatches = !state.filters.location || [event.location, event.venue].join(" ").toLowerCase().includes(state.filters.location.toLowerCase());
    const categoryMatches = !state.filters.category || inferCategory(event) === state.filters.category.toLowerCase();
    const parsedDate = event.date ? new Date(event.date) : null;
    const dateMatches = !state.filters.date || (parsedDate && !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === state.filters.date);
    return queryMatches && locationMatches && categoryMatches && dateMatches;
  });

  const eventCard = (event) => {
    const storedImage = /^\/(?:uploads|Media)\//i.test(String(event.banner || ""));
    const image = storedImage ? event.banner : "/Media/Png/no-event.jpg";
    const category = inferCategory(event);
    const seatsLeft = Math.max(0, Number(event.seats || 0) - Number(event.ticketsSold || 0));
    return `<article class="card event-card" data-event-id="${escapeHtml(event._id)}" tabindex="0" role="link">
      <div class="card-media"><img src="${escapeHtml(image)}" alt="${escapeHtml(event.title)}" loading="lazy"><span class="event-pill">${seatsLeft ? `${seatsLeft} spots left` : "Sold out"}</span></div>
      <div class="text"><div class="event-type">${escapeHtml(categoryLabels[category])} / ${escapeHtml(event.location || "Evently original")}</div><h2>${escapeHtml(event.title)}</h2>
        <div class="cinfo"><img src="/Media/Png/calendar.png" class="cpic" alt=""><p>${formatDate(event.date)}${event.time ? ` / ${escapeHtml(event.time)}` : ""}</p></div>
        <div class="cinfo"><img src="/Media/Png/location.png" class="cpic" alt=""><p>${escapeHtml(event.venue || event.location || "Venue TBA")}</p></div>
      </div><div class="cbottom"><p class="rate">INR ${Number(event.price || 0).toLocaleString("en-IN")}</p><span class="card-arrow" aria-hidden="true">-&gt;</span></div>
    </article>`;
  };

  const renderEvents = () => {
    const container = $("#trendsec");
    if (!container) return;
    const events = filteredEvents();
    const groups = categoryOrder.map(category => [category, events.filter(event => inferCategory(event) === category)]).filter(([, items]) => items.length);
    container.innerHTML = events.length
      ? groups.map(([category, items]) => `<section class="event-category-group"><div class="event-category-heading"><div><span class="category-kicker">Explore by type</span><h2>${escapeHtml(categoryLabels[category])}</h2></div><span>${items.length} ${items.length === 1 ? "event" : "events"}</span></div><div class="event-category-grid">${items.slice(0, 6).map(eventCard).join("")}</div></section>`).join("")
      : `<div class="empty-state"><span class="empty-icon">*</span><h3>No events match those filters</h3><p>Try another city, category, or date.</p><button class="btn ghost-btn" id="clearFilters">Clear filters</button></div>`;
    $$(".event-card", container).forEach((card) => {
      const open = () => window.opevent(card.dataset.eventId);
      card.addEventListener("click", open);
      card.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } });
    });
    $("#clearFilters")?.addEventListener("click", () => {
      state.filters = { query: "", location: "", category: "", date: "" };
      ["query", "location", "category", "date"].forEach((id) => { const field = $(`#${id}`); if (field) field.value = ""; });
      updateSearchSummary(); loadEvents();
    });
    const count = $("#eventCount");
    if (count) count.textContent = `${events.length} ${events.length === 1 ? "event" : "events"}`;
  };

  const updateSearchSummary = () => {
    [["#sloc", state.filters.location || "Any city"], ["#scat", categoryLabels[state.filters.category] || "All categories"], ["#sdate", state.filters.date ? formatDate(state.filters.date) : "Any date"]]
      .forEach(([selector, value]) => { const node = $(selector); if (node) node.textContent = value; });
  };

  const closeSearch = () => {
    const overlay = $("#searchover"); overlay?.classList.remove("show");
    setTimeout(() => { if (overlay) overlay.style.display = "none"; }, 250);
    document.body.classList.remove("modal-open");
  };

  const setupSearch = () => {
    const overlay = $("#searchover");
    $("#bsearch")?.addEventListener("click", () => {
      if (!overlay) return;
      $("#query").value = state.filters.query;
      $("#location").value = state.filters.location;
      $("#category").value = state.filters.category;
      $("#date").value = state.filters.date;
      overlay.style.display = "flex"; document.body.classList.add("modal-open"); requestAnimationFrame(() => overlay.classList.add("show"));
    });
    $("#searchClose")?.addEventListener("click", closeSearch);
    overlay?.addEventListener("click", (event) => { if (event.target === overlay) closeSearch(); });
    $("#searchForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      state.filters = { query: $("#query")?.value.trim() || "", location: $("#location")?.value.trim() || "", category: $("#category")?.value || "", date: $("#date")?.value || "" };
      updateSearchSummary(); closeSearch();
      loadEvents().then(() => { $("#trending")?.scrollIntoView({ behavior: "smooth", block: "start" }); showToast(`${filteredEvents().length} matching events`, "success"); });
    });
  };

  const loadEvents = async () => {
    const container = $("#trendsec");
    if (!container) return;
    container.innerHTML = `<div class="loading-state"><span class="loader"></span><p>Finding the best events near you...</p></div>`;
    try {
      const params = new URLSearchParams();
      if (state.filters.query) params.set("q", state.filters.query);
      if (state.filters.location) params.set("city", state.filters.location);
      if (state.filters.category) params.set("category", state.filters.category);
      if (state.filters.date) params.set("date", state.filters.date);
      const query = params.toString();
      const response = await fetch(`/api/events${query ? `?${query}` : ""}`);
      if (!response.ok) throw new Error("Unable to load events");
      const data = await response.json();
      state.events = Array.isArray(data) ? data : (data.events || []);
      renderEvents();
    } catch {
      container.innerHTML = `<div class="empty-state"><span class="empty-icon">!</span><h3>Events are taking a moment</h3><p>Check your connection and try again.</p><button class="btn ghost-btn" id="retryEvents">Retry</button></div>`;
      $("#retryEvents")?.addEventListener("click", loadEvents);
    }
  };

  const setupIntro = () => {
    const content = $("#content");
    if (!content || sessionStorage.getItem("introPlayed")) return;
    const video = document.createElement("video");
    video.src = "/Media/upview.mp4"; video.muted = true; video.autoplay = true; video.playsInline = true; video.className = "intro-video";
    document.body.appendChild(video);
    const finish = () => { video.classList.add("is-hidden"); content.classList.add("is-visible"); sessionStorage.setItem("introPlayed", "true"); setTimeout(() => video.remove(), 650); };
    video.addEventListener("ended", finish, { once: true }); setTimeout(finish, 2200);
  };

  window.getUserFromToken = decodeToken;
  window.updateAuthUI = updateAuthUI;
  window.opevent = (id) => { if (id) window.location.href = `/event.html?id=${encodeURIComponent(id)}`; };
  window.opclub = (id) => { window.location.href = `/club.html?id=${encodeURIComponent(id)}`; };
  window.cat = (id) => { const category = ({ 1: "music", 2: "club", 3: "networking" })[id] || ""; state.filters.category = state.filters.category === category ? "" : category; updateSearchSummary(); renderEvents(); $("#trending")?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  window.change = (id) => { const login = $("#logbox"); const signup = $("#signbox"); if (!login || !signup) return; login.style.display = id === 0 ? "none" : "block"; signup.style.display = id === 0 ? "block" : "none"; };
  window.search = () => $("#bsearch")?.click();
  window.process = () => $("#searchForm")?.requestSubmit();

  document.addEventListener("DOMContentLoaded", () => { setupIntro(); setupDropdown(); updateAuthUI(); updateSearchSummary(); setupSearch(); loadEvents(); });
})();
