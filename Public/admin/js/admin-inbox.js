(() => {
    const token = localStorage.getItem("token");
    const container = document.getElementById("messagesContainer");
    const count = document.getElementById("messageCount");
    const feedback = document.getElementById("inboxFeedback");
    const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
    const setFeedback = (message = "", type = "") => { if (feedback) { feedback.textContent = message; feedback.className = `admin-feedback ${type}`.trim(); } };
    async function loadMessages() {
        if (!token || !container) return;
        container.innerHTML = '<div class="admin-loading">Loading messages...</div>';
        try {
            const response = await fetch("/api/admin/messages", { headers: { Authorization: `Bearer ${token}` } });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.success === false) throw new Error(data.message || "Messages could not be loaded");
            const messages = Array.isArray(data.messages) ? data.messages : [];
            if (count) count.textContent = `${messages.length} ${messages.length === 1 ? "message" : "messages"}`;
            container.innerHTML = messages.length ? messages.map((message) => `<article class="message-card"><div class="message-header"><div><span class="message-kicker">Contact request</span><h3>${escapeHtml(message.subject || "No subject")}</h3></div><time>${new Date(message.createdAt).toLocaleString()}</time></div><div class="sender"><strong>${escapeHtml(message.name)}</strong><span>${escapeHtml(message.email)}</span></div><p class="message-body">${escapeHtml(message.message)}</p><div class="message-actions"><a class="reply-btn" href="mailto:${encodeURIComponent(message.email || "")}?subject=${encodeURIComponent(`Re: ${message.subject || "Evently message"}`)}">Reply</a><button class="delete-btni" type="button" data-id="${escapeHtml(message._id)}">Delete</button></div></article>`).join("") : '<div class="admin-empty"><strong>Your inbox is clear</strong><span>New contact requests will appear here.</span></div>';
            setFeedback("");
        } catch (error) { container.innerHTML = '<div class="admin-empty"><strong>Inbox unavailable</strong><span>Try again after checking the server.</span></div>'; setFeedback(error.message, "error"); }
    }
    container?.addEventListener("click", async (event) => {
        const button = event.target.closest(".delete-btni"); if (!button) return;
        if (!window.confirm("Delete this message?")) return; button.disabled = true;
        try { const response = await fetch(`/api/admin/messages/${button.dataset.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }); const data = await response.json().catch(() => ({})); if (!response.ok || data.success === false) throw new Error(data.message || "Message could not be deleted"); await loadMessages(); }
        catch (error) { button.disabled = false; setFeedback(error.message, "error"); }
    });
    document.getElementById("refreshInbox")?.addEventListener("click", loadMessages);
    loadMessages();
})();
