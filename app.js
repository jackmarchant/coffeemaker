const STORAGE_KEY = "grounds.beans.v2";

function loadBeans() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedIfEmpty();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveBeans(beans) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(beans));
}

function seedIfEmpty() {
  const seeded = [
    {
      id: "seed-ethiopia",
      name: "Ethiopia Yirgacheffe",
      roaster: "Blue Bottle",
      rating: 5,
      roastType: "Medium-Light",
      notes: "",
      favorite: true,
    },
    {
      id: "seed-colombia",
      name: "Colombia Huila",
      roaster: "Onyx",
      rating: 4,
      roastType: "Medium",
      notes: "",
      favorite: false,
    },
  ];
  saveBeans(seeded);
  return seeded;
}

function uid() {
  return "b_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
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

function renderList() {
  const beans = loadBeans();
  const list = document.getElementById("beanList");
  const count = document.getElementById("count");
  const empty = document.getElementById("empty");
  if (!list) return;

  count.textContent = `${beans.length} ${beans.length === 1 ? "BEAN" : "BEANS"}`;

  if (beans.length === 0) {
    list.innerHTML = "";
    empty.hidden = false;
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
        </div>
        <div class="bean-stars" aria-label="${b.rating || 0} out of 5">
          ${starsHtml(b.rating)}
        </div>
      </li>`
    )
    .join("");

  list.querySelectorAll(".bean-card").forEach((card) => {
    const id = card.getAttribute("data-id");
    card.addEventListener("click", () => {
      window.location.href = `edit.html?id=${encodeURIComponent(id)}`;
    });
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        window.location.href = `edit.html?id=${encodeURIComponent(id)}`;
      }
    });
  });

  const shareBtn = document.getElementById("shareBtn");
  if (shareBtn) {
    shareBtn.addEventListener("click", async () => {
      const lines = beans.map((b) => `${b.favorite ? "❤️ " : ""}${b.name} — ${b.roaster || "Unknown"} (${b.rating || 0}★)`);
      const text = `My Grounds:\n${lines.join("\n")}`;
      if (navigator.share) {
        try { await navigator.share({ title: "My Grounds", text }); return; } catch { /* user cancelled */ }
      }
      try {
        await navigator.clipboard.writeText(text);
        showToast("Copied bean list to clipboard");
      } catch {
        showToast("Sharing not supported");
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

function getQueryId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

function setRating(value) {
  const ratingInput = document.getElementById("rating");
  ratingInput.value = String(value);
  document.querySelectorAll(".star-btn").forEach((btn) => {
    const v = Number(btn.getAttribute("data-value"));
    btn.classList.toggle("active", v <= value);
  });
}

function initEditPage() {
  const form = document.getElementById("beanForm");
  if (!form) return;

  const id = getQueryId();
  const beans = loadBeans();
  const existing = id ? beans.find((b) => b.id === id) : null;

  document.getElementById("pageTitle").textContent = existing ? "Edit Bean" : "Add Bean";

  document.querySelectorAll(".star-btn").forEach((btn) => {
    btn.addEventListener("click", () => setRating(Number(btn.getAttribute("data-value"))));
  });

  if (existing) {
    document.getElementById("name").value = existing.name || "";
    document.getElementById("roaster").value = existing.roaster || "";
    document.getElementById("roastType").value = existing.roastType || "";
    document.getElementById("notes").value = existing.notes || "";
    document.getElementById("favorite").checked = !!existing.favorite;
    setRating(Number(existing.rating) || 0);

    const deleteBtn = document.getElementById("deleteBtn");
    deleteBtn.hidden = false;
    deleteBtn.addEventListener("click", () => {
      if (!confirm(`Delete "${existing.name}"?`)) return;
      const next = loadBeans().filter((b) => b.id !== existing.id);
      saveBeans(next);
      window.location.href = "index.html";
    });
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("name").value.trim();
    if (!name) {
      document.getElementById("name").focus();
      return;
    }
    const data = {
      id: existing?.id || uid(),
      name,
      roaster: document.getElementById("roaster").value.trim(),
      rating: Number(document.getElementById("rating").value) || 0,
      roastType: document.getElementById("roastType").value,
      notes: document.getElementById("notes").value.trim(),
      favorite: document.getElementById("favorite").checked,
    };
    const all = loadBeans();
    const idx = all.findIndex((b) => b.id === data.id);
    if (idx >= 0) all[idx] = data;
    else all.unshift(data);
    saveBeans(all);
    window.location.href = "index.html";
  });
}
