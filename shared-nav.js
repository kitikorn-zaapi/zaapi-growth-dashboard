const FOREX_STORAGE_KEY = "zaapi_forex_rate";
const FALLBACK_FOREX = 34;

function parseRate(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getStoredRate() {
  return parseRate(localStorage.getItem(FOREX_STORAGE_KEY));
}

function applyActiveNav() {
  const file = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
  document.querySelectorAll(".nav-btn").forEach((link) => {
    const href = (link.getAttribute("href") || "").toLowerCase();
    const isActive = href === file || (file === "" && href === "index.html");
    link.classList.toggle("active", isActive);
    if (isActive) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

function notifyRate(rate) {
  window.dispatchEvent(new CustomEvent("zaapi:forex-change", { detail: { rate } }));
}

async function initSharedNav() {
  let data = {};
  try {
    const res = await fetch("data.json");
    data = await res.json();
  } catch (_e) {
    data = {};
  }

  const weekLabel = document.getElementById("week-label");
  if (weekLabel) weekLabel.textContent = data.week || "—";

  applyActiveNav();

  const input = document.getElementById("forex-rate");
  if (!input) return;

  const fallbackRate = parseRate(data.forex_rate) || FALLBACK_FOREX;
  const initialRate = getStoredRate() || fallbackRate;
  input.value = String(initialRate);
  localStorage.setItem(FOREX_STORAGE_KEY, String(initialRate));
  notifyRate(initialRate);

  input.addEventListener("input", () => {
    const nextRate = parseRate(input.value) || fallbackRate;
    localStorage.setItem(FOREX_STORAGE_KEY, String(nextRate));
    notifyRate(nextRate);
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== FOREX_STORAGE_KEY) return;
    const syncedRate = parseRate(event.newValue) || fallbackRate;
    input.value = String(syncedRate);
    notifyRate(syncedRate);
  });
}

document.addEventListener("DOMContentLoaded", initSharedNav);
