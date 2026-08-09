/* =====================================================================
   toast.js — Lightweight, self-dismissing notifications.
   ===================================================================== */

const container = () => document.getElementById("toasts");

const ICONS = { success: "✓", info: "i", error: "!", working: "…" };

export function toast(message, type = "success", duration = 3200) {
  const host = container();
  if (!host) return;

  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `
    <span class="toast__icon">${ICONS[type] || "✓"}</span>
    <span class="toast__msg"></span>
  `;
  el.querySelector(".toast__msg").textContent = message;
  host.appendChild(el);

  // Animate in.
  requestAnimationFrame(() => el.classList.add("is-show"));

  const remove = () => {
    el.classList.remove("is-show");
    setTimeout(() => el.remove(), 280);
  };

  if (duration > 0) setTimeout(remove, duration);
  el.addEventListener("click", remove);
  return remove;
}
