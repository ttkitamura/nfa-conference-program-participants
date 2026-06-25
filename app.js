const STORAGE_FAV = "nfa_favorites_typhoon_v1";

let sessions = [];
let currentView = "timetable";
let deferredPrompt = null;

const appView = document.getElementById("appView");
const installBtn = document.getElementById("installBtn");
const mainContent = document.getElementById("mainContent");
const dayFilter = document.getElementById("dayFilter");
const slotFilter = document.getElementById("slotFilter");
const languageFilter = document.getElementById("languageFilter");
const searchInput = document.getElementById("searchInput");

const SLOT_ORDER = {
  "PM1 (12:00–13:30)": 10,
  "Special (12:00–15:00)": 15,
  "PM2 (13:50–15:20)": 20,
  "PM3 (15:40–17:10)": 30,
  "PM4 (17:20–17:50)": 40
};

function norm(x) {
  return (x ?? "").toString().trim();
}

function escapeHtml(x) {
  return norm(x)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function roomNumber(room) {
  const m = norm(room).match(/Room\s+(\d+)/i);
  return m ? parseInt(m[1], 10) : 999;
}

function slotRank(slot) {
  return SLOT_ORDER[norm(slot)] ?? 999;
}

function sessionSort(a, b) {
  return slotRank(a.slot) - slotRank(b.slot)
    || roomNumber(a.room) - roomNumber(b.room)
    || norm(a.room).localeCompare(norm(b.room), "en", { numeric: true })
    || Number(a.session_no || 0) - Number(b.session_no || 0)
    || norm(a.session_title).localeCompare(norm(b.session_title));
}

function favorites() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_FAV) || "[]"));
  } catch {
    return new Set();
  }
}

function saveFavorites(setObj) {
  localStorage.setItem(STORAGE_FAV, JSON.stringify([...setObj]));
}

function sessionKey(s) {
  return `${s.day}__${s.slot}__${s.room}__${s.session_no}__${s.session_title}`;
}


function groupedValues(key) {
  return [...new Set(sessions.map(s => norm(s[key])).filter(Boolean))];
}

function optionHtml(value) {
  return `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`;
}

function populateFilters() {
  const days = groupedValues("day").sort();
  const slots = groupedValues("slot").sort((a, b) => slotRank(a) - slotRank(b));

  dayFilter.innerHTML = `<option value="ALL">All Days</option>` + days.map(optionHtml).join("");
  slotFilter.innerHTML = `<option value="ALL">All Slots</option>` + slots.map(optionHtml).join("");
}

function filteredSessions() {
  const q = norm(searchInput.value).toLowerCase();

  return sessions.filter(s => {
    if (dayFilter.value !== "ALL" && s.day !== dayFilter.value) return false;
    if (slotFilter.value !== "ALL" && s.slot !== slotFilter.value) return false;
    if (languageFilter.value !== "ALL" && s.language !== languageFilter.value) return false;

    if (!q) return true;

    const bag = [
      s.day,
      s.slot,
      s.room,
      s.session_title,
      s.language,
      s.chair,
      s.session_no,
      s.notice,
      ...(s.papers || []).flatMap(p => [
        p.paper_title,
        p.presenter,
        p.affiliation,
        p.coauthors,
        p.discussant,
        p.paper_id
      ])
    ].map(norm).join(" ").toLowerCase();

    return bag.includes(q);
  });
}

function render() {
  const data = filteredSessions().sort(sessionSort);

  if (currentView === "timetable") renderTimetable(data);
  else if (currentView === "sessions") renderSessions(data);
  else if (currentView === "rooms") renderRooms(data);
  else if (currentView === "maps") renderMaps();
  else if (currentView === "favorites") renderFavorites(data);
}

function makeSessionCard(s) {
  const tpl = document.getElementById("sessionCardTemplate");
  const node = tpl.content.cloneNode(true);
  const favs = favorites();
  const key = sessionKey(s);

  const idLabel = s.session_no ? `Session ID: ${escapeHtml(s.session_no)} | ` : "";
  node.querySelector(".session-meta").innerHTML =
    `${idLabel}${escapeHtml(s.day)} | ${escapeHtml(s.slot)} | ${escapeHtml(s.room)}`;

  node.querySelector(".session-title").textContent =
    s.session_title || `Session ${s.session_no}`;

  const typePill = s.session_type && s.session_type !== "research"
    ? `<span class="pill special-pill">${escapeHtml(s.session_type)}</span>`
    : "";

  node.querySelector(".session-submeta").innerHTML =
    `${typePill}<span class="pill">${escapeHtml(s.language || "")}</span><span class="pill">Chair: ${escapeHtml(s.chair || "")}</span>`
    + (s.notice ? `<div class="session-notice">${escapeHtml(s.notice)}</div>` : "");

  const btn = node.querySelector(".favorite-btn");
  if (favs.has(key)) {
    btn.classList.add("active");
    btn.textContent = "★";
  }

  btn.addEventListener("click", () => {
    const current = favorites();
    if (current.has(key)) current.delete(key);
    else current.add(key);
    saveFavorites(current);
    render();
  });

  const papersDiv = node.querySelector(".papers");

  (s.papers || []).forEach(p => {
    const paper = document.createElement("div");
    paper.className = "paper";

    const titleText = escapeHtml(p.paper_title || "");
    const title = p.pdf_link
      ? `<a href="${escapeHtml(p.pdf_link)}" target="_blank" rel="noopener noreferrer">${titleText}</a>`
      : titleText;

    const prefixParts = [];
    if (p.paper_no !== undefined && p.paper_no !== null && norm(p.paper_no) !== "") prefixParts.push(`${escapeHtml(p.paper_no)}.`);
    if (p.paper_id) prefixParts.push(`[Paper ID: ${escapeHtml(p.paper_id)}]`);

    const presenterLine = p.presenter
      ? `Presenter: ${escapeHtml(p.presenter)}${p.affiliation ? ` (${escapeHtml(p.affiliation).replaceAll("\n", "<br>")})` : ""}<br>`
      : (p.affiliation ? `${escapeHtml(p.affiliation).replaceAll("\n", "<br>")}<br>` : "");

    paper.innerHTML = `
      <div class="paper-title">${prefixParts.join(" ")} ${title}</div>
      <div class="paper-meta">
        ${presenterLine}
        ${p.coauthors ? `Coauthors: ${escapeHtml(p.coauthors)}<br>` : ""}
        ${p.discussant ? `Discussant: ${escapeHtml(p.discussant)}` : ""}
      </div>
    `;

    papersDiv.appendChild(paper);
  });

  return node;
}

function renderSessions(data) {
  mainContent.innerHTML = "";

  if (!data.length) {
    mainContent.innerHTML = `<div class="session-card">No sessions found.</div>`;
    return;
  }

  data.forEach(s => mainContent.appendChild(makeSessionCard(s)));
}

function renderFavorites(data) {
  const favs = favorites();
  const favData = data.filter(s => favs.has(sessionKey(s)));
  renderSessions(favData);
}

function renderRooms(data) {
  mainContent.innerHTML = "";
  const rooms = [...new Set(data.map(x => x.room))]
    .sort((a, b) => roomNumber(a) - roomNumber(b) || norm(a).localeCompare(norm(b), "en", { numeric: true }));

  if (!rooms.length) {
    mainContent.innerHTML = `<div class="session-card">No rooms found.</div>`;
    return;
  }

  rooms.forEach(room => {
    const wrap = document.createElement("section");
    wrap.className = "slot-block";

    const h = document.createElement("div");
    h.className = "list-header";
    h.textContent = room;
    wrap.appendChild(h);

    data
      .filter(s => s.room === room)
      .sort(sessionSort)
      .forEach(s => wrap.appendChild(makeSessionCard(s)));

    mainContent.appendChild(wrap);
  });
}

function renderTimetable(data) {
  mainContent.innerHTML = "";
  const grouped = {};

  data.forEach(s => {
    const key = `${s.day}__${s.slot}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  });

  const outer = document.createElement("div");
  outer.className = "timetable-grid";

  Object.keys(grouped)
    .sort((a, b) => {
      const [, slotA] = a.split("__");
      const [, slotB] = b.split("__");
      return slotRank(slotA) - slotRank(slotB) || a.localeCompare(b);
    })
    .forEach(key => {
      const [day, slot] = key.split("__");

      const block = document.createElement("section");
      block.className = "slot-block";
      block.innerHTML = `<div class="slot-title">${escapeHtml(day)} | ${escapeHtml(slot)}</div>`;

      const grid = document.createElement("div");
      grid.className = "room-grid";

      grouped[key]
        .sort(sessionSort)
        .forEach(s => {
          const cell = document.createElement("div");
          cell.className = "room-cell";

          const type = s.session_type && s.session_type !== "research" ? `<span class="pill special-pill">${escapeHtml(s.session_type)}</span>` : "";

          cell.innerHTML = `
            <div class="room-name">${escapeHtml(s.room)}</div>
            <div><strong>Session ID: ${escapeHtml(s.session_no)} — ${escapeHtml(s.session_title)}</strong></div>
            <div class="paper-meta">${type} ${escapeHtml(s.language || "")} | Chair: ${escapeHtml(s.chair || "")}</div>
          `;

          cell.addEventListener("click", () => {
            currentView = "sessions";
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelector('[data-view="sessions"]').classList.add("active");
            searchInput.value = s.session_title;
            render();
            window.scrollTo({ top: 0, behavior: "smooth" });
          });

          grid.appendChild(cell);
        });

      block.appendChild(grid);
      outer.appendChild(block);
    });

  mainContent.appendChild(outer);
}

function renderMaps() {
  mainContent.innerHTML = `
    <section class="session-card maps-card">
      <h2>Maps / 会場案内図</h2>
      <p class="muted">Campus map, Building 8 venue map, and Building 6 room map for the typhoon-response shortened program.</p>
      <div class="map-list">
        <figure>
          <figcaption>Campus Map / キャンパス案内図</figcaption>
          <img src="campus_map_typhoon.png" alt="Campus map" class="map-img">
        </figure>
        <figure>
          <figcaption>Building 8 Venue Map / 8号館会場案内図</figcaption>
          <img src="venue_map_building8_typhoon.png" alt="Building 8 venue map" class="map-img">
        </figure>
        <figure>
          <figcaption>Building 6 Room Map / 6号館案内図</figcaption>
          <img src="building6_map_typhoon.png" alt="Building 6 room map" class="map-img narrow-map">
        </figure>
      </div>
    </section>
  `;
}

function attachEvents() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentView = btn.dataset.view;
      render();
    });
  });

  [dayFilter, slotFilter, languageFilter, searchInput].forEach(el => {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.classList.remove("hidden");
  });

  installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.classList.add("hidden");
  });
}

async function loadProgram() {
  const res = await fetch("program_detailed.json", { cache: "no-store" });
  sessions = await res.json();
  populateFilters();
  render();
}

function showApp() {
  appView.classList.remove("hidden");
  loadProgram();
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js");
  });
}

attachEvents();
showApp();
