const PASSWORD = "nfa2026";
const STORAGE_AUTH = "nfa_auth_ok";
const STORAGE_FAV = "nfa_favorites_v1";

let sessions = [];
let currentView = "timetable";
let deferredPrompt = null;

const loginView = document.getElementById("loginView");
const appView = document.getElementById("appView");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const passwordInput = document.getElementById("passwordInput");
const loginError = document.getElementById("loginError");
const installBtn = document.getElementById("installBtn");
const mainContent = document.getElementById("mainContent");
const dayFilter = document.getElementById("dayFilter");
const slotFilter = document.getElementById("slotFilter");
const languageFilter = document.getElementById("languageFilter");
const searchInput = document.getElementById("searchInput");

function norm(x) {
  return (x ?? "").toString().trim();
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
  return `${s.day}__${s.slot}__${s.room}__${s.session_no}`;
}

function isAuthenticated() {
  return localStorage.getItem(STORAGE_AUTH) === "1";
}

function setAuthenticated(v) {
  if (v) localStorage.setItem(STORAGE_AUTH, "1");
  else localStorage.removeItem(STORAGE_AUTH);
}

function groupedValues(key) {
  return [...new Set(sessions.map(s => norm(s[key])).filter(Boolean))];
}

function populateFilters() {
  dayFilter.innerHTML =
    `<option value="ALL">All Days</option>` +
    groupedValues("day").map(v => `<option value="${v}">${v}</option>`).join("");

  slotFilter.innerHTML =
    `<option value="ALL">All Slots</option>` +
    groupedValues("slot").map(v => `<option value="${v}">${v}</option>`).join("");
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
  const data = filteredSessions();

  if (currentView === "timetable") renderTimetable(data);
  else if (currentView === "sessions") renderSessions(data);
  else if (currentView === "rooms") renderRooms(data);
  else if (currentView === "favorites") renderFavorites(data);
}

function makeSessionCard(s) {
  const tpl = document.getElementById("sessionCardTemplate");
  const node = tpl.content.cloneNode(true);
  const favs = favorites();
  const key = sessionKey(s);

  node.querySelector(".session-meta").textContent =
    `Session ID: ${s.session_no} | ${s.day} | ${s.slot} | ${s.room}`;

  node.querySelector(".session-title").textContent =
    s.session_title || `Session ${s.session_no}`;

  node.querySelector(".session-submeta").innerHTML =
    `<span class="pill">${s.language || ""}</span><span class="pill">Chair: ${s.chair || ""}</span>`;

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

    const title = p.pdf_link
      ? `<a href="${p.pdf_link}" target="_blank" rel="noopener noreferrer">${p.paper_title}</a>`
      : `${p.paper_title}`;

    paper.innerHTML = `
      <div class="paper-title">${p.paper_no}. [Paper ID: ${p.paper_id || ""}] ${title}</div>
      <div class="paper-meta">
        Presenter: ${p.presenter || ""}${p.affiliation ? ` (${p.affiliation})` : ""}<br>
        ${p.coauthors ? `Coauthors: ${p.coauthors}<br>` : ""}
        ${p.discussant ? `Discussant: ${p.discussant}` : ""}
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
  const rooms = [...new Set(data.map(x => x.room))].sort();

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
      .sort((a, b) => `${a.day}${a.slot}`.localeCompare(`${b.day}${b.slot}`))
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

  Object.keys(grouped).sort().forEach(key => {
    const [day, slot] = key.split("__");

    const block = document.createElement("section");
    block.className = "slot-block";
    block.innerHTML = `<div class="slot-title">${day} | ${slot}</div>`;

    const grid = document.createElement("div");
    grid.className = "room-grid";

    grouped[key]
      .sort((a, b) => a.room.localeCompare(b.room))
      .forEach(s => {
        const cell = document.createElement("div");
        cell.className = "room-cell";

        cell.innerHTML = `
          <div class="room-name">${s.room}</div>
          <div><strong>Session ID: ${s.session_no} — ${s.session_title}</strong></div>
          <div class="paper-meta">${s.language} | Chair: ${s.chair || ""}</div>
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

function attachEvents() {
  loginBtn.addEventListener("click", () => {
    if (passwordInput.value === PASSWORD) {
      setAuthenticated(true);
      loginError.classList.add("hidden");
      showApp();
    } else {
      loginError.classList.remove("hidden");
    }
  });

  passwordInput.addEventListener("keydown", e => {
    if (e.key === "Enter") loginBtn.click();
  });

  logoutBtn.addEventListener("click", () => {
    setAuthenticated(false);
    appView.classList.add("hidden");
    loginView.classList.remove("hidden");
    passwordInput.value = "";
  });

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
  const res = await fetch("program_detailed.json");
  sessions = await res.json();
  populateFilters();
  render();
}

function showApp() {
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
  loadProgram();
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js");
  });
}

attachEvents();

if (isAuthenticated()) {
  showApp();
}