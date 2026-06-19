let allEvents = [];

async function loadEvents() {

    const response = await fetch(
            "/api/admin/events",
        {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );

    const data = await response.json();

    allEvents = data.events;
    renderEvents(allEvents);
}
function renderEvents(events) {

    const container =
        document.getElementById("eventsContainer");

    container.innerHTML = "";

    events.forEach(event => {

        container.innerHTML += `
<div class="event-card">

    <h3>${event.title}</h3>

    <p><strong>Date:</strong>
${new Date(event.date).toLocaleDateString()}
</p>

<p><strong>Venue:</strong>
${event.venue}
</p>

<p><strong>Organizer:</strong>
${event.organizer?.name}
</p>

<p><strong>Price:</strong>
₹${event.price}
</p>

<p><strong>Tickets Sold:</strong>
${event.ticketsSold}
</p>
<p>
<strong>Status:</strong>
<span class="status-badge ${event.status}">
    ${event.status}
</span>
</p>
    
    <div class="btn-group">

    <button
        class="edit-btn"
        data-id="${event._id}">
        Edit
    </button>

    <button
        class="delete-btn"
        data-id="${event._id}">
        Delete
    </button>

    ${event.status === "pending"
                ?
                `
        <button
            class="approve-btn"
            data-id="${event._id}">
            Approve
        </button>

        <button
            class="reject-btn"
            data-id="${event._id}">
            Reject
        </button>
        `
                :
                ""
            }

</div>
    
</div>
`;
    });

    attachDeleteListeners();
    attachEditListeners();
    attachApproveListeners();
    attachRejectListeners();
}
function attachDeleteListeners() {

    document
        .querySelectorAll(".delete-btn")
        .forEach(button => {

            button.addEventListener(
                "click",
                async () => {

                    const eventId =
                        button.dataset.id;

                    const confirmed =
                        confirm(
                            "Delete this event?"
                        );

                    if (!confirmed) return;

                    try {

                        const response =
                            await fetch(
                                `/api/admin/events/${eventId}`,
                                {
                                    method: "DELETE",
                                    headers: {
                                        Authorization:
                                            `Bearer ${token}`
                                    }
                                }
                            );

                        const data =
                            await response.json();

                        if (data.success) {

                            alert(
                                "Event deleted successfully"
                            );

                            loadEvents();

                        } else {

                            alert(data.message);

                        }

                    } catch (err) {

                        console.error(err);

                    }

                }
            );

        });

}
function attachEditListeners() {

    document
        .querySelectorAll(".edit-btn")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const eventId =
                        button.dataset.id;

                    window.location.href =
                        `/edit-event.html?id=${eventId}`;

                }
            );

        });

}
function attachApproveListeners() {

    document
        .querySelectorAll(".approve-btn")
        .forEach(button => {

            button.addEventListener(
                "click",
                async () => {

                    const eventId =
                        button.dataset.id;

                    try {

                        const response =
                            await fetch(
                                `/api/admin/events/${eventId}/approve`,
                                {
                                    method: "PATCH",
                                    headers: {
                                        Authorization:
                                            `Bearer ${token}`
                                    }
                                }
                            );

                        const data =
                            await response.json();

                        if (data.success) {

                            alert(
                                "Event Approved"
                            );

                            loadEvents();
                        }

                    } catch (err) {

                        console.log(err);

                    }

                }
            );

        });

}
function attachRejectListeners() {

    document
        .querySelectorAll(".reject-btn")
        .forEach(button => {

            button.addEventListener(
                "click",
                async () => {

                    const eventId =
                        button.dataset.id;

                    try {

                        const response =
                            await fetch(
                                `/api/admin/events/${eventId}/reject`,
                                {
                                    method: "PATCH",
                                    headers: {
                                        Authorization:
                                            `Bearer ${token}`
                                    }
                                }
                            );

                        const data =
                            await response.json();

                        if (data.success) {

                            alert(
                                "Event Rejected"
                            );

                            loadEvents();
                        }

                    } catch (err) {

                        console.log(err);

                    }

                }
            );

        });

}
document.getElementById("search").addEventListener("input", e => {

    const value =
        e.target.value.toLowerCase();

    const filtered =
        allEvents.filter(event =>
            event.title
                .toLowerCase()
                .includes(value)
        );

    renderEvents(filtered);

    attachDeleteListeners();
    attachEditListeners();

});
loadEvents();
