const config = window.GROUNDS_CONFIG || {};
const sb = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);

const LOCAL_USER_KEY = "grounds.user.v1";

let currentUser = null;
let currentCollectionId = null;

function getQueryParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

function hasEditFlag() {
  return getQueryParam("edit") === "1";
}

function buildHref(base, { collection, edit, id } = {}) {
  const params = new URLSearchParams();
  if (id) params.set("id", id);
  if (collection) params.set("collection", collection);
  if (edit) params.set("edit", "1");
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
  const urlCollection = getQueryParam("collection");
  currentCollectionId = urlCollection || (currentUser ? currentUser.id : null);
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
  if (!currentCollectionId) return [];
  const { data, error } = await sb
    .from("beans")
    .select("*")
    .eq("collection_id", currentCollectionId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("fetchBeans failed", error);
    showToast("Couldn't load beans");
    return [];
  }
  return data || [];
}

async function renderList() {
  loadSession();
  renderAuthBox();

  const list = document.getElementById("beanList");
  const count = document.getElementById("count");
  const empty = document.getElementById("empty");
  const emptyMsg = document.getElementById("emptyMessage");
  const label = document.getElementById("collectionLabel");
  const addLink = document.getElementById("addLink");
  const addFab = document.getElementById("addFab");
  if (!list) return;

  const collectionParam = getQueryParam("collection");
  const canEdit = hasEditFlag();
  const viewingOwn = currentUser && (!collectionParam || collectionParam === currentUser.id);

  if (collectionParam && !viewingOwn) {
    const suffix = canEdit ? " — edit access" : "";
    label.hidden = false;
    label.textContent = currentUser
      ? `Viewing a shared collection${suffix}`
      : `Viewing a shared collection${suffix} — set a name to contribute`;
  } else if (currentUser) {
    label.hidden = false;
    label.textContent = "Your collection · share the URL to invite others";
  } else {
    label.hidden = true;
  }

  const editHref = buildHref("edit.html", { collection: collectionParam, edit: canEdit });
  if (addLink) addLink.href = editHref;
  if (addFab) addFab.href = editHref;

  if (!currentCollectionId) {
    count.textContent = "0 BEANS";
    list.innerHTML = "";
    empty.hidden = false;
    emptyMsg.textContent = "Set a name to start your collection.";
    return;
  }

  const beans = await fetchBeans();
  count.textContent = `${beans.length} ${beans.length === 1 ? "BEAN" : "BEANS"}`;

  if (beans.length === 0) {
    list.innerHTML = "";
    empty.hidden = false;
    emptyMsg.textContent = currentUser
      ? "No beans yet. Tap the + button to add your first."
      : "This collection is empty.";
    return;
  }
  empty.hidden = true;

  list.innerHTML = beans
    .map((b) => {
      const ownedByMe = currentUser && b.added_by === currentUser.id;
      const editable = currentUser && (ownedByMe || canEdit);
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
    const href = buildHref("edit.html", { id, collection: collectionParam, edit: canEdit });
    card.addEventListener("click", () => { window.location.href = href; });
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        window.location.href = href;
      }
    });
  });

  const shareBtn = document.getElementById("shareBtn");
  if (shareBtn) {
    shareBtn.addEventListener("click", async () => {
      if (!currentUser) {
        promptForName(refreshPage);
        return;
      }
      const grantEdit = window.confirm(
        "Share with edit access?\n\nOK = others can add, edit, and delete beans in your collection.\nCancel = view-only link."
      );
      const url = `${window.location.origin}${window.location.pathname}` +
        buildHref("", { collection: currentUser.id, edit: grantEdit });
      const title = grantEdit
        ? "My Jack's Coffee Beans collection (edit access)"
        : "My Jack's Coffee Beans collection";
      if (navigator.share) {
        try { await navigator.share({ title, url }); return; } catch { /* cancelled */ }
      }
      try {
        await navigator.clipboard.writeText(url);
        showToast(grantEdit ? "Edit link copied to clipboard" : "Share link copied to clipboard");
      } catch {
        showToast(url);
      }
    });
  }
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
  const { data, error } = await sb.from("beans").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("fetchBeanById failed", error);
    return null;
  }
  return data;
}

async function initEditPage() {
  loadSession();
  renderAuthBox();

  const form = document.getElementById("beanForm");
  const gate = document.getElementById("authGate");
  if (!form) return;

  const beanId = getQueryParam("id");
  const collectionParam = getQueryParam("collection");
  const canEdit = hasEditFlag();
  const backHref = buildHref("index.html", { collection: collectionParam, edit: canEdit });
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
    if (existing.added_by !== currentUser.id && !canEdit) {
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
      const { error } = await sb.from("beans").delete().eq("id", existing.id);
      if (error) {
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

    const targetCollection = existing
      ? existing.collection_id
      : (collectionParam || currentUser.id);

    const payload = {
      collection_id: targetCollection,
      added_by: currentUser.id,
      added_by_name: currentUser.name,
      name,
      roaster: document.getElementById("roaster").value.trim() || null,
      rating: Number(document.getElementById("rating").value) || 0,
      roast_type: document.getElementById("roastType").value || null,
      notes: document.getElementById("notes").value.trim() || null,
      favorite: document.getElementById("favorite").checked,
    };

    let error;
    if (existing) {
      ({ error } = await sb.from("beans").update(payload).eq("id", existing.id));
    } else {
      ({ error } = await sb.from("beans").insert(payload));
    }
    if (error) {
      console.error("save failed", error);
      showToast("Couldn't save bean");
      return;
    }
    window.location.href = backHref;
  });
}
