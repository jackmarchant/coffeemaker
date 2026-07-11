const config = window.GROUNDS_CONFIG || {};
// API base for the self-hosted backend. Defaults to same origin so the app
// works wherever it's served from; override with API_BASE in config.js if the
// API lives elsewhere.
const API_BASE = (config.API_BASE || "").replace(/\/$/, "");

async function api(path, options) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  if (res.status === 204) return null;
  return res.json();
}

const LOCAL_USER_KEY = "grounds.user.v1";

let currentUser = null;

function getQueryParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

function buildHref(base, { id } = {}) {
  const params = new URLSearchParams();
  if (id) params.set("id", id);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

function loadLocalUser() {
  try {
    const raw = localStorage.getItem(LOCAL_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.id && parsed.name) return parsed;
  } catch {}
  return null;
}

function saveLocalUser(user) {
  localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(user));
}

function loadSession() {
  currentUser = loadLocalUser();
}

function promptForName(onSet) {
  const current = currentUser?.name || "";
  const input = window.prompt("Display name (shown next to beans you add):", current);
  if (input === null) return;
  const name = input.trim();
  if (!name) return;
  if (currentUser) {
    currentUser.name = name;
  } else {
    currentUser = { id: crypto.randomUUID(), name };
  }
  saveLocalUser(currentUser);
  if (typeof onSet === "function") onSet();
}

function renderAuthBox() {
  const box = document.getElementById("authBox");
  if (!box) return;
  if (currentUser) {
    box.innerHTML = `<button class="pill user-chip" type="button" id="renameBtn" title="Click to change your display name">${escapeHtml(currentUser.name)}</button>`;
    document.getElementById("renameBtn").addEventListener("click", () => promptForName(refreshPage));
  } else {
    box.innerHTML = `<button class="pill" type="button" id="setNameBtn">Set name</button>`;
    document.getElementById("setNameBtn").addEventListener("click", () => promptForName(refreshPage));
  }
}

function refreshPage() {
  if (document.getElementById("beanList")) {
    renderList();
  } else if (document.getElementById("beanForm")) {
    initEditPage();
  }
}

function starsHtml(rating) {
  const r = Math.max(0, Math.min(5, Number(rating) || 0));
  let html = "";
  for (let i = 1; i <= 5; i++) {
    html += i <= r
      ? '<span aria-hidden="true">★</span>'
      : '<span class="star-empty" aria-hidden="true">★</span>';
  }
  return html;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

async function fetchBeans() {
  try {
    return await api("/api/beans");
  } catch (error) {
    console.error("fetchBeans failed", error);
    showToast("Couldn't load beans");
    return [];
  }
}

async function renderList() {
  loadSession();
  renderAuthBox();

  const list = document.getElementById("beanList");
  const count = document.getElementById("count");
  const empty = document.getElementById("empty");
  const emptyMsg = document.getElementById("emptyMessage");
  const addLink = document.getElementById("addLink");
  const addFab = document.getElementById("addFab");
  const loading = document.getElementById("loading");
  if (!list) return;

  const editHref = buildHref("edit.html");
  if (addLink) addLink.href = editHref;
  if (addFab) addFab.href = editHref;

  list.innerHTML = "";
  empty.hidden = true;
  count.textContent = "";
  if (loading) loading.hidden = false;

  const beans = await fetchBeans();

  if (loading) loading.hidden = true;
  count.textContent = `${beans.length} ${beans.length === 1 ? "BEAN" : "BEANS"}`;

  if (beans.length === 0) {
    list.innerHTML = "";
    empty.hidden = false;
    emptyMsg.textContent = currentUser
      ? "No beans yet. Tap the + button to add your first."
      : "No beans yet.";
    return;
  }
  empty.hidden = true;

  list.innerHTML = beans
    .map((b) => {
      const editable = currentUser && b.added_by === currentUser.id;
      return `
      <li class="bean-card${editable ? "" : " bean-card-readonly"}" data-id="${escapeHtml(b.id)}" data-editable="${editable ? "1" : "0"}" tabindex="0" role="button" aria-label="${editable ? "Edit" : "View"} ${escapeHtml(b.name)}">
        <div class="bean-info">
          <h2 class="bean-name">${b.favorite ? '<span aria-label="favorite">❤️</span>' : ""}${escapeHtml(b.name)}</h2>
          <p class="bean-roaster">${escapeHtml(b.roaster || "")}</p>
          <p class="bean-added-by">Added by ${escapeHtml(b.added_by_name || "Anonymous")}</p>
        </div>
        <div class="bean-stars" aria-label="${b.rating || 0} out of 5">
          ${starsHtml(b.rating)}
        </div>
      </li>`;
    })
    .join("");

  list.querySelectorAll(".bean-card").forEach((card) => {
    const id = card.getAttribute("data-id");
    const editable = card.getAttribute("data-editable") === "1";
    if (!editable) return;
    const href = buildHref("edit.html", { id });
    card.addEventListener("click", () => { window.location.href = href; });
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        window.location.href = href;
      }
    });
  });
}

function showToast(message) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => toast.classList.remove("show"), 1800);
}

function setRating(value) {
  const ratingInput = document.getElementById("rating");
  ratingInput.value = String(value);
  document.querySelectorAll(".star-btn").forEach((btn) => {
    const v = Number(btn.getAttribute("data-value"));
    btn.classList.toggle("active", v <= value);
  });
}

async function fetchBeanById(id) {
  try {
    return await api(`/api/beans/${encodeURIComponent(id)}`);
  } catch (error) {
    console.error("fetchBeanById failed", error);
    return null;
  }
}

async function initEditPage() {
  loadSession();
  renderAuthBox();

  const form = document.getElementById("beanForm");
  const gate = document.getElementById("authGate");
  if (!form) return;

  const beanId = getQueryParam("id");
  const backHref = buildHref("index.html");
  document.getElementById("backLink").href = backHref;
  document.getElementById("cancelLink").href = backHref;

  if (!currentUser) {
    gate.hidden = false;
    form.hidden = true;
    document.getElementById("gateLoginBtn").addEventListener("click", () => promptForName(refreshPage));
    document.getElementById("pageTitle").textContent = beanId ? "Edit Bean" : "Add Bean";
    return;
  }

  gate.hidden = true;
  form.hidden = false;

  let existing = null;
  if (beanId) {
    existing = await fetchBeanById(beanId);
    if (!existing) {
      showToast("Bean not found");
      window.location.href = backHref;
      return;
    }
    if (existing.added_by !== currentUser.id) {
      showToast("You can only edit beans you added");
      window.location.href = backHref;
      return;
    }
  }

  document.getElementById("pageTitle").textContent = existing ? "Edit Bean" : "Add Bean";

  document.querySelectorAll(".star-btn").forEach((btn) => {
    btn.addEventListener("click", () => setRating(Number(btn.getAttribute("data-value"))));
  });

  if (existing) {
    document.getElementById("name").value = existing.name || "";
    document.getElementById("roaster").value = existing.roaster || "";
    document.getElementById("roastType").value = existing.roast_type || "";
    document.getElementById("notes").value = existing.notes || "";
    document.getElementById("favorite").checked = !!existing.favorite;
    setRating(Number(existing.rating) || 0);

    const deleteBtn = document.getElementById("deleteBtn");
    deleteBtn.hidden = false;
    deleteBtn.addEventListener("click", async () => {
      if (!confirm(`Delete "${existing.name}"?`)) return;
      try {
        await api(`/api/beans/${encodeURIComponent(existing.id)}`, { method: "DELETE" });
      } catch (error) {
        console.error("delete failed", error);
        showToast("Couldn't delete bean");
        return;
      }
      window.location.href = backHref;
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("name").value.trim();
    if (!name) {
      document.getElementById("name").focus();
      return;
    }

    const payload = {
      collection_id: currentUser.id,
      added_by: currentUser.id,
      added_by_name: currentUser.name,
      name,
      roaster: document.getElementById("roaster").value.trim() || null,
      rating: Number(document.getElementById("rating").value) || 0,
      roast_type: document.getElementById("roastType").value || null,
      notes: document.getElementById("notes").value.trim() || null,
      favorite: document.getElementById("favorite").checked,
    };

    try {
      if (existing) {
        await api(`/api/beans/${encodeURIComponent(existing.id)}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/api/beans", { method: "POST", body: JSON.stringify(payload) });
      }
    } catch (error) {
      console.error("save failed", error);
      showToast("Couldn't save bean");
      return;
    }
    window.location.href = backHref;
  });
}
