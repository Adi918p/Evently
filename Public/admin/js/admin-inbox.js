loadMessages();

async function loadMessages() {

    try {

        const response =
            await fetch(
                "/api/admin/messages",
                {
                    headers: {
                        Authorization:
                            `Bearer ${token}`
                    }
                }
            );

        const data =
            await response.json();

        renderMessages(data.messages);

    } catch (err) {

        console.error(err);

    }

}

function renderMessages(messages) {

    const container =
        document.getElementById(
            "messagesContainer"
        );

    container.innerHTML = "";

    messages.forEach(message => {

        container.innerHTML += `
<div class="message-card">

    <div class="message-header">

        <div class="message-subject">
            ${message.subject}
        </div>

        <div class="message-date">
            ${new Date(
            message.createdAt
        ).toLocaleString()}
        </div>

    </div>

    <div class="sender">

        <strong>${message.name}</strong>

        •

        ${message.email}

    </div>

    <div class="message-body">

        ${message.message}

    </div>

    <div class="message-actions">

        <a
            class="reply-btn"
            href="mailto:${message.email}?subject=Re:${message.subject}"
        >
            Reply
        </a>

        <button
            class="delete-btni"
            onclick="attachDeleteListeners()"
            data-id="${message._id}"
        >
            Delete
        </button>

    </div>

</div>
`;
    });
    document.getElementById("messageCount")
.textContent = messages.length;

}

function attachDeleteListeners() {

    document
        .querySelectorAll(".delete-btni")
        .forEach(button => {

            button.addEventListener("click", async () => {

                const id = button.dataset.id;

                const response =
                    await fetch(
                        `/api/admin/messages/${id}`,
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

                    loadMessages();

                }

            });

        });

}
attachDeleteListeners()

