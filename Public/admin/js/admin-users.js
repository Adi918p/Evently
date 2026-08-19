(() => {
    const token = localStorage.getItem("token");
    const container = document.getElementById("usersContainer");
    const search = document.getElementById("searchUser");
    const count = document.getElementById("userCount");
    const feedback = document.getElementById("usersFeedback");
    let allUsers = [];
    const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
    const setFeedback = (message = "", type = "") => { if (feedback) { feedback.textContent = message; feedback.className = `admin-feedback ${type}`.trim(); } };
    async function request(url, options = {}) {
        const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success === false) throw new Error(data.message || "Request failed");
        return data;
    }
    function renderUsers(users) {
        if (!container) return;
        if (!users.length) { container.innerHTML = '<div class="admin-empty"><strong>No users found</strong><span>Try a different search.</span></div>'; if (count) count.textContent = "0 users"; return; }
        container.innerHTML = users.map((user) => {
            const initials = escapeHtml((user.name || "U").trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase());
            return `<article class="user-card"><div class="user-identity"><div class="user-avatar">${initials}</div><div><h3>${escapeHtml(user.name || "Unnamed user")}</h3><p>${escapeHtml(user.email)}</p><small>Joined ${new Date(user.createdAt).toLocaleDateString()}</small></div></div><div class="user-actions"><label>Role<select class="role-select" data-id="${escapeHtml(user._id)}"><option value="user" ${user.role === "user" ? "selected" : ""}>User</option><option value="organizer" ${user.role === "organizer" ? "selected" : ""}>Organizer</option><option value="admin" ${user.role === "admin" ? "selected" : ""}>Admin</option></select></label><label>Status<select class="status-select" data-id="${escapeHtml(user._id)}"><option value="active" ${user.status === "active" ? "selected" : ""}>Active</option><option value="suspended" ${user.status === "suspended" ? "selected" : ""}>Suspended</option><option value="banned" ${user.status === "banned" ? "selected" : ""}>Banned</option></select></label></div></article>`;
        }).join("");
        if (count) count.textContent = `${users.length} ${users.length === 1 ? "user" : "users"}`;
    }
    async function loadUsers() {
        if (!token || !container) return;
        container.innerHTML = '<div class="admin-loading">Loading users...</div>';
        try { const data = await request("/api/admin/users"); allUsers = Array.isArray(data.users) ? data.users : []; renderUsers(allUsers); setFeedback(""); }
        catch (error) { container.innerHTML = '<div class="admin-empty"><strong>Users could not be loaded</strong><span>Check the database connection and try again.</span></div>'; setFeedback(error.message, "error"); }
    }
    async function updateUser(url, body, select) {
        select.disabled = true;
        try { await request(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); setFeedback("User updated", "success"); }
        catch (error) { setFeedback(error.message, "error"); await loadUsers(); }
        finally { select.disabled = false; }
    }
    search?.addEventListener("input", () => { const query = search.value.trim().toLowerCase(); renderUsers(allUsers.filter((user) => `${user.name} ${user.email} ${user.role} ${user.status}`.toLowerCase().includes(query))); });
    container?.addEventListener("change", (event) => { const select = event.target; if (select.matches(".role-select")) updateUser(`/api/admin/users/${select.dataset.id}/role`, { role: select.value }, select); if (select.matches(".status-select")) updateUser(`/api/admin/users/${select.dataset.id}/status`, { status: select.value }, select); });
    document.getElementById("refreshUsers")?.addEventListener("click", loadUsers);
    loadUsers();
})();
