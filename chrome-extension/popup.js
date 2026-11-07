"use strict";
const defaults = { enabled: true, paused: false, speed: 1.5, size: 100 };
const controls = Object.fromEntries(Object.keys(defaults).map(key => [key, document.getElementById(key)]));
const speedVal = document.getElementById("speedVal");
const sizeVal = document.getElementById("sizeVal");
function updateLabels() {
  speedVal.textContent = Number(controls.speed.value).toFixed(1);
  sizeVal.textContent = `${controls.size.value}%`;
}
chrome.storage.local.get(defaults).then(saved => {
  for (const [key, value] of Object.entries(saved)) {
    if (key in controls) {
      if (controls[key].type === "checkbox") controls[key].checked = Boolean(value);
      else controls[key].value = value;
    }
  }
  updateLabels();
});
for (const [key, input] of Object.entries(controls)) {
  input.addEventListener(input.type === "checkbox" ? "change" : "input", () => {
    const value = input.type === "checkbox" ? input.checked : Number(input.value);
    chrome.storage.local.set({ [key]: value });
    updateLabels();
  });
}
document.getElementById("reset").addEventListener("click", () => {
  chrome.storage.local.set({ resetRequest: Date.now() });
});

const hpFill = document.getElementById("popupHpFill");
const xpFill = document.getElementById("popupXpFill");
const levelLabel = document.getElementById("levelLabel");
function renderStats(stats) {
  if (!stats) return;
  hpFill.style.width = `${100 * stats.hp / Math.max(stats.maxHp, 1)}%`;
  xpFill.style.width = `${100 * stats.xp / Math.max(stats.xpNext, 1)}%`;
  levelLabel.textContent = `Level ${stats.level}`;
}
chrome.runtime.sendMessage({ type: "pet:read" })
  .then(result => renderStats(result?.stats)).catch(() => {});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.petStatsV2) renderStats(changes.petStatsV2.newValue);
});
document.getElementById("restoreHp").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "pet:restore" })
    .then(result => renderStats(result?.stats)).catch(() => {});
});

// A one-click recovery control if a previous session saved the pet as hidden.
document.getElementById("showNow").addEventListener("click", async () => {
  await chrome.storage.local.set({ enabled: true, paused: false, resetRequest: Date.now() });
  controls.enabled.checked = true;
  controls.paused.checked = false;
});
