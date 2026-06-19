let allUsers = [];

loadUsers();

async function loadUsers() {

    const response =
        await fetch(
            "/api/admin/users",
            {
                headers: {
                    Authorization:
                        `Bearer ${token}`
                }
            }
        );

    const data = await response.json();

    allUsers = data.users;

    renderUsers(allUsers);
}
function renderUsers(users) {

    const container =
        document.getElementById(
            "usersContainer"
        );

    container.innerHTML = "";

    users.forEach(user => {

        container.innerHTML += `

<div class="user-card">

    <div>

        <h3>${user.name}</h3>

        <p>${user.email}</p>

    </div>

    <div class="user-actions">

        <select
            class="role-select"
            data-id="${user._id}"
        >
            <option value="user"
                ${user.role === "user" ? "selected" : ""}>
                User
            </option>

            <option value="organizer"
                ${user.role === "organizer" ? "selected" : ""}>
                Organizer
            </option>

            <option value="admin"
                ${user.role === "admin" ? "selected" : ""}>
                Admin
            </option>

        </select>

        <select
            class="status-select"
            data-id="${user._id}"
        >
            <option value="active"
                ${user.status === "active" ? "selected" : ""}>
                Active
            </option>

            <option value="suspended"
                ${user.status === "suspended" ? "selected" : ""}>
                Suspended
            </option>

            <option value="banned"
                ${user.status === "banned" ? "selected" : ""}>
                Banned
            </option>

        </select>

        <button
            class="delete-btn"
            data-id="${user._id}">
            Delete
        </button>

    </div>

</div>

`;

    });
    attachListeners();
}
async function updateRole(id, role) {

    await fetch(
        `/api/admin/users/${id}/role`,
        {
            method: "PATCH",

            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },

            body: JSON.stringify({ role })
        }
    );

    loadUsers();
}
async function updateStatus(id, status) {
    await fetch(
        `/api/admin/users/${id}/status`,
        {
            method: "PATCH",

            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },

            body: JSON.stringify({
                status
            })
        }
    );

    loadUsers();
}
function attachListeners() {

    document.querySelectorAll(".promote-btn").forEach(btn => {

        btn.addEventListener("click", () => {

            updateRole(
                btn.dataset.id,
                "organizer"
            );

        });

    });

    document.querySelectorAll(".demote-btn").forEach(btn => {

        btn.addEventListener("click", () => {

            updateRole(
                btn.dataset.id,
                "user"
            );

        });

    });

    document.querySelectorAll(".activate-btn").forEach(btn => {

        btn.addEventListener("click", () => {

            updateStatus(
                btn.dataset.id,
                "active"
            );

        });

    });

    document.querySelectorAll(".suspend-btn").forEach(btn => {

        btn.addEventListener("click", () => {

            updateStatus(
                btn.dataset.id,
                "suspended"
            );

        });

    });

    document.querySelectorAll(".ban-btn").forEach(btn => {

        btn.addEventListener("click", () => {

            updateStatus(
                btn.dataset.id,
                "banned"
            );

        });

    });
    document.querySelectorAll(".role-select").forEach(select => {

            select.addEventListener(
                "change",
                () => {

                    updateRole(
                        select.dataset.id,
                        select.value
                    );

                }
            );

    });

    document.querySelectorAll(".status-select").forEach(select => {

            select.addEventListener(
                "change",
                () => {

                    updateStatus(
                        select.dataset.id,
                        select.value
                    );

                }
            );

    });

}

