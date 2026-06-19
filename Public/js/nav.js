(function () {
    function initMobileNav() {
        const nav = document.getElementById("nav");
        if (!nav || nav.dataset.navReady === "true") return;
        nav.dataset.navReady = "true";

        let menu = nav.querySelector(".nav-menu");
        if (!menu) {
            const navbar = nav.querySelector(".navbar");
            const logsec = nav.querySelector("#logw") || nav.querySelector(".logsec");
            const userDropdown = nav.querySelector("#userDropdown");

            menu = document.createElement("div");
            menu.className = "nav-menu";
            menu.id = "navMenu";

            if (navbar) menu.appendChild(navbar);
            if (logsec) menu.appendChild(logsec);
            if (userDropdown) menu.appendChild(userDropdown);

            nav.appendChild(menu);
        }

        let toggle = nav.querySelector(".nav-toggle");
        if (!toggle) {
            toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = "nav-toggle";
            toggle.id = "navToggle";
            toggle.setAttribute("aria-label", "Open menu");
            toggle.setAttribute("aria-expanded", "false");
            toggle.innerHTML =
                "<span class=\"nav-toggle-bar\"></span><span class=\"nav-toggle-bar\"></span><span class=\"nav-toggle-bar\"></span>";

            const logoLink = nav.querySelector("a");
            if (logoLink) logoLink.after(toggle);
            else nav.prepend(toggle);
        }

        const closeNav = () => {
            nav.classList.remove("nav-open");
            toggle.classList.remove("active");
            toggle.setAttribute("aria-expanded", "false");
            document.body.classList.remove("nav-lock");
        };

        toggle.addEventListener("click", (e) => {
            e.stopPropagation();
            const isOpen = !nav.classList.contains("nav-open");
            nav.classList.toggle("nav-open", isOpen);
            toggle.classList.toggle("active", isOpen);
            toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
            document.body.classList.toggle("nav-lock", isOpen);
        });

        menu.querySelectorAll("a").forEach((link) => {
            link.addEventListener("click", closeNav);
        });

        document.addEventListener("click", (e) => {
            if (nav.classList.contains("nav-open") && !nav.contains(e.target)) {
                closeNav();
            }
        });

        window.addEventListener("resize", () => {
            if (window.innerWidth > 768) closeNav();
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initMobileNav);
    } else {
        initMobileNav();
    }
})();
