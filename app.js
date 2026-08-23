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
    .map(
      (b) => `
      <li class="bean-card" data-id="${escapeHtml(b.id)}" tabindex="0" role="button" aria-label="Edit ${escapeHtml(b.name)}">
        <div class="bean-info">
          <h2 class="bean-name">${b.favorite ? '<span aria-label="favorite">❤️</span>' : ""}${escapeHtml(b.name)}</h2>
          <p class="bean-roaster">${escapeHtml(b.roaster || "")}</p>
          <p class="bean-added-by">Added by ${escapeHtml(b.added_by_name || "Anonymous")}</p>
        </div>
        <div class="bean-stars" aria-label="${b.rating || 0} out of 5">
          ${starsHtml(b.rating)}
        </div>
      </li>`
    )
    .join("");

  list.querySelectorAll(".bean-card").forEach((card) => {
    const id = card.getAttribute("data-id");
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

// The bean currently open on the edit page, or null when adding a new one.
// Module-level so the form handlers stay correct across re-renders (e.g. when
// the visitor changes their display name mid-edit).
let currentBean = null;

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

  // A display name is only needed to *add* a bean, so it can be attributed.
  // Editing an existing bean keeps whoever added it, so no name is required.
  if (!currentUser && !beanId) {
    gate.hidden = false;
    form.hidden = true;
    document.getElementById("gateLoginBtn").addEventListener("click", () => promptForName(refreshPage));
    document.getElementById("pageTitle").textContent = "Add Bean";
    return;
  }

  gate.hidden = true;
  form.hidden = false;

  currentBean = null;
  if (beanId) {
    currentBean = await fetchBeanById(beanId);
    if (!currentBean) {
      showToast("Bean not found");
      window.location.href = backHref;
      return;
    }
  }

  document.getElementById("pageTitle").textContent = currentBean ? "Edit Bean" : "Add Bean";

  const deleteBtn = document.getElementById("deleteBtn");
  deleteBtn.hidden = !currentBean;

  if (currentBean) {
    document.getElementById("name").value = currentBean.name || "";
    document.getElementById("roaster").value = currentBean.roaster || "";
    document.getElementById("roastType").value = currentBean.roast_type || "";
    document.getElementById("notes").value = currentBean.notes || "";
    document.getElementById("favorite").checked = !!currentBean.favorite;
    setRating(Number(currentBean.rating) || 0);
  }

  bindFormHandlers(form, deleteBtn, backHref);
}

// Bind once per page load: initEditPage re-runs whenever the display name
// changes, and re-binding would fire every save/delete twice.
function bindFormHandlers(form, deleteBtn, backHref) {
  if (form.dataset.bound === "1") return;
  form.dataset.bound = "1";

  document.querySelectorAll(".star-btn").forEach((btn) => {
    btn.addEventListener("click", () => setRating(Number(btn.getAttribute("data-value"))));
  });

  deleteBtn.addEventListener("click", async () => {
    if (!currentBean) return;
    if (!confirm(`Delete "${currentBean.name}"?`)) return;
    try {
      await api(`/api/beans/${encodeURIComponent(currentBean.id)}`, { method: "DELETE" });
    } catch (error) {
      console.error("delete failed", error);
      showToast("Couldn't delete bean");
      return;
    }
    window.location.href = backHref;
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("name").value.trim();
    if (!name) {
      document.getElementById("name").focus();
      return;
    }

    const details = {
      name,
      roaster: document.getElementById("roaster").value.trim() || null,
      rating: Number(document.getElementById("rating").value) || 0,
      roast_type: document.getElementById("roastType").value || null,
      notes: document.getElementById("notes").value.trim() || null,
      favorite: document.getElementById("favorite").checked,
    };

    try {
      if (currentBean) {
        // Leave collection_id/added_by/added_by_name off the payload so the
        // original contributor keeps the credit for the bean.
        await api(`/api/beans/${encodeURIComponent(currentBean.id)}`, {
          method: "PATCH",
          body: JSON.stringify(details),
        });
      } else {
        await api("/api/beans", {
          method: "POST",
          body: JSON.stringify({
            ...details,
            collection_id: currentUser.id,
            added_by: currentUser.id,
            added_by_name: currentUser.name,
          }),
        });
      }
    } catch (error) {
      console.error("save failed", error);
      showToast("Couldn't save bean");
      return;
    }
    window.location.href = backHref;
  });
}
