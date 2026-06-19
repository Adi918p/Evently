const content = document.getElementById("content");
const trending = document.getElementById('trending');
const catsec = document.querySelector('.catsec');
const cblock = document.querySelectorAll('.catblocks');
const sover = document.getElementById('searchover');
const logbox = document.getElementById('logbox');
const signbox = document.getElementById('signbox');


if (content) {
    content.style.display = 'none';
    content.style.opacity = 0;
    content.style.transition = 'all 2s ease-in-out';
}


const startupcon = document.createElement('div');
const startup = document.createElement('video');
startupcon.classList.add('introcon')
startup.classList.add('intro')
startup.src = '/Media/upview.mp4';
startup.autoplay = true;
startup.muted = true;
startup.preload = "auto";
startup.playsInline = true
startupcon.style.transition = 'opacity 2s ease-in-out';
startupcon.appendChild(startup)


var start = () => {
    document.body.append(startupcon);
    function resizeVideo() {
        const viewportHeight = window.visualViewport
            ? window.visualViewport.height
            : window.innerHeight;

        startupcon.style.width = '100vw';
        startupcon.style.height = viewportHeight + 'px';
    }

    window.addEventListener('resize', resizeVideo);
    window.addEventListener('orientationchange', resizeVideo);
    window.visualViewport?.addEventListener('resize', resizeVideo);

    // Initial resize
    setTimeout(resizeVideo, 100);
};

document.addEventListener("DOMContentLoaded", () => {
    updateAuthUI();
    const btn = document.getElementById("dropdownBtn");
    const menu = document.getElementById("dropdownMenu");

    btn?.addEventListener("click", () => {
        menu.classList.toggle("hidden");
    });

    // close when clicking outside
    document.addEventListener("click", (e) => {
        if (!e.target.closest(".user-dropdown")) {
            menu?.classList.add("hidden");
        }
    });
});




document.addEventListener("DOMContentLoaded", () => {

    if (sessionStorage.getItem("introPlayed")) {
        content.style.display = "block";
        content.style.opacity = "1";
        return;
    }

    start();

    startup.addEventListener("canplaythrough", () => {
        startup.play();
    });

    setTimeout(() => {
        startupcon.style.opacity = "0";
        // startup.style.transform = "translateY(-50px)";

        setTimeout(() => {
            startup.style.display = "none";
            content.style.display = "block";
            content.style.opacity = "1";

            sessionStorage.setItem("introPlayed", "true");

        }, 1000);
    }, 4000);

});


// MAIN PAGE FUNCTIONS
var change = (id) => {
    if (!logbox || !signbox) return;
    if (id == 0) {
        logbox.style.display = 'none';
        signbox.style.display = 'block';
    }
    else {
        signbox.style.display = 'none';
        logbox.style.display = 'block';

    }
};
function updateAuthUI() {

    const user = getUserFromToken();
    const logsec = document.getElementById("logw");

    const dropdown = document.getElementById("userDropdown");
    const username = document.getElementById("username");

    if (user) {

        // hide login/signup
        if (logsec) logsec.style.display = "none";

        // show dropdown
        dropdown?.classList.remove("hidden");

        if (username) username.innerText = user.name;

    } else {

        if (logsec) logsec.style.display = "flex";
        dropdown?.classList.add("hidden");
    }
}


function getUserFromToken() {
    const token = localStorage.getItem("token");
    if (!token) return null;

    try {
        return JSON.parse(atob(token.split(".")[1]));
    } catch {
        return null;
    }
}

document.getElementById("logoutBtn")?.addEventListener("click", () => {
    localStorage.removeItem("token");
    location.reload();
});


const user = getUserFromToken();

const dashboardItem =
    document.getElementById("dashboardItem");

if (user &&
    (user.role === "admin" ||
        user.role === "organizer")) {

    if (dashboardItem) dashboardItem.style.display = "block";

} else {

    if (dashboardItem) dashboardItem.style.display = "none";

}



var cat = (id) => {
    var active = `active${id}`
    if (cblock[id - 1].classList.contains(active)) {
        cblock[id - 1].classList.remove(active);

        catsec.classList.remove('show');
        setTimeout(() => {
            trending.style.height = '';
            catsec.style.display = 'none';
        }, 500);

        return;
    }
    trending.style.height = 'auto';
    catsec.style.display = 'flex';
    requestAnimationFrame(() => {
        catsec.classList.add('show');
    });

    cblock.forEach(card => {
        card.classList.remove('active1', 'active2', 'active3');
    });

    catsec.classList.remove('active1', 'active2', 'active3');
    cblock[id - 1].classList.add(active);
    catsec.classList.add(active);
};






// LOGIN-MODULE FUNCTIONS
const params = new URLSearchParams(window.location.search);
if (params.get("mode") === "signup") {
    change(0);
}
else {
    change(1);

}


//SEARCH FUNCTION
var ldata = document.getElementById('location');
var cdata = document.getElementById('category');
var ddata = document.getElementById('date');
var loc = document.getElementById('sloc');
var category = document.getElementById('scat');
var date = document.getElementById('sdate');

var search = () => {
    sover.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
        sover.classList.add('show');
    });
};

var process = () => {
    category.innerText = cdata.value;
    loc.innerText = ldata.value;
    date.innerText = ddata.value;
    sover.classList.remove('show');
    setTimeout(() => {
        sover.style.display = 'none';
        document.body.style.overflow = 'auto';
        // hide hero and featured sections to focus on results
        const hero = document.getElementById('hero');
        const locsec = document.getElementById('loc');
        if (hero) hero.style.display = 'none';
        if (locsec) locsec.style.display = 'none';
        // update heading
        const htrending = document.getElementById('htrending');
        if (htrending) htrending.innerText = 'Search Results';
        // filter and render events
        const filtered = filterEvents(ldata.value, cdata.value, ddata.value);
        renderEvents(filtered);
        // scroll to results
        document.getElementById('trending')?.scrollIntoView({behavior:'smooth'});
    }, 500);
};


//EVENTS-PAGE FUNCTIONS
var opevent = (id) => {
    window.location.href = `/event.html?id=${id}`
};


// Experience Function
function toggleEvent(element) {

    const card = element.parentElement;

    document.querySelectorAll('.event-card').forEach(item => {
        if (item !== card) {
            item.classList.remove('active');
        }
    });

    card.classList.toggle('active');
}



// CLUB FUNCTION
var opclub = (id) => {
    window.location.href = `/club.html?id=${id}`
};

//fetching data from mongodb
let eventsData = [];

async function getEvents() {
    try {
        const response = await fetch('/api/events');
        eventsData = await response.json();
        renderEvents(eventsData);
    } catch (err) {
        console.log(err);
    }
}

function renderEvents(list) {
    const container = document.getElementById('trendsec');
    container.innerHTML = '';
    if (!list || list.length === 0) {
        container.innerHTML = '<p style="padding:20px">No events found.</p>';
        return;
    }

    list.forEach(event => {
        container.innerHTML += `
            <div class="card" onclick="opevent('${event._id}')">

                <img src="${event.banner}" alt="">

                <div class="text">

                    <h1>${event.title}</h1>

                    <div class="cinfo">
                        <img src="/Media/Png/calendar.png" class="cpic">
                        <p>${new Date(event.date).toLocaleDateString()}</p>
                    </div>

                    <div class="cinfo">
                        <img src="/Media/Png/location.png" class="cpic">
                        <p>${event.venue}</p>
                    </div>

                </div>

                <div class="cbottom">
                    <p class="rate">₹${event.price}</p>
                </div>

            </div>
        `;
    });
}

function filterEvents(locVal, catVal, dateVal) {
    if (!eventsData) return [];
    let filtered = eventsData.slice();

    // Location: match against explicit location field or venue/address
    if (locVal && locVal.trim() !== '') {
        const v = locVal.toLowerCase();
        filtered = filtered.filter(e =>
            (e.location && e.location.toLowerCase().includes(v)) ||
            (e.venue && e.venue.toLowerCase().includes(v))
        );
    }

    // Category: model may not have a category field; try multiple fallbacks
    if (catVal && catVal.trim() !== '') {
        const c = catVal.toLowerCase();
        filtered = filtered.filter(e => {
            return (
                (e.category || '').toLowerCase().includes(c) ||
                (e.title || '').toLowerCase().includes(c) ||
                (e.description || '').toLowerCase().includes(c) ||
                (e.about || '').toLowerCase().includes(c)
            );
        });
    }

    // Date exact match
    if (dateVal && dateVal.trim() !== '') {
        const sel = new Date(dateVal).toDateString();
        filtered = filtered.filter(e => new Date(e.date).toDateString() === sel);
    }

    return filtered;
}

getEvents();
