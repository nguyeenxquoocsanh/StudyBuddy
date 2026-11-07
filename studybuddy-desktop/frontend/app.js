const SESSION_LENGTH = 25 * 60;
const STORAGE_KEY = "studybuddy-state";
const timerElement = document.querySelector("#timer");
const progressElement = document.querySelector("#progress");
const statusElement = document.querySelector("#status-chip");
const moodElement = document.querySelector("#mood");
const energyElement = document.querySelector("#energy");
const xpElement = document.querySelector("#xp");
const treatsElement = document.querySelector("#treats");
const startButton = document.querySelector("#start");
const pauseButton = document.querySelector("#pause");
const feedButton = document.querySelector("#feed");
const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const chatLog = document.querySelector("#chat-log");
const buildLabel = document.querySelector("#build-label");

let remaining = SESSION_LENGTH;
let xp = 24;
let energy = 72;
let treats = 3;
let timerId = null;

function load() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch (error) {
    console.error("Could not read saved StudyBuddy state.", error);
    return;
  }
  if (!saved) return;
  xp = Number.isFinite(saved.xp) ? saved.xp : xp;
  energy = Number.isFinite(saved.energy) ? saved.energy : energy;
  treats = Number.isFinite(saved.treats) ? saved.treats : treats;
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ xp, energy, treats }));
}

function render() {
  const minutes = Math.floor(remaining / 60).toString().padStart(2, "0");
  const seconds = (remaining % 60).toString().padStart(2, "0");
  timerElement.textContent = `${minutes}:${seconds}`;
  progressElement.style.width = `${((SESSION_LENGTH - remaining) / SESSION_LENGTH) * 100}%`;
  energyElement.textContent = energy;
  xpElement.textContent = xp.toString().padStart(3, "0");
  treatsElement.textContent = treats.toString().padStart(2, "0");
  feedButton.disabled = treats === 0;
}

function setSessionState(active) {
  statusElement.textContent = active ? "LOCKED IN" : "READY";
  statusElement.classList.toggle("active", active);
  moodElement.textContent = active ? "FOCUSED" : "PAUSED";
}

function completeSession() {
  clearInterval(timerId);
  timerId = null;
  remaining = SESSION_LENGTH;
  xp += 25;
  energy = Math.max(0, energy - 8);
  statusElement.textContent = "COMPLETE";
  moodElement.textContent = "PROUD";
  addMessage("Buddy", "Quest complete! You earned +25 XP. Take a quick stretch.");
  save();
  render();
}

function start() {
  if (timerId) return;
  setSessionState(true);
  timerId = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) completeSession();
    render();
  }, 1000);
}

function pause() {
  clearInterval(timerId);
  timerId = null;
  setSessionState(false);
  render();
}

function addMessage(author, text, className = "") {
  const message = document.createElement("p");
  const authorElement = document.createElement("b");
  authorElement.textContent = author;
  message.className = className;
  message.append(authorElement, document.createTextNode(` ${text}`));
  chatLog.append(message);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function respond(text) {
  const lower = text.toLowerCase();
  if (lower.includes("plan")) return "Try 20 minutes reading, 5 minutes recall, then one tiny reward.";
  if (lower.includes("tired") || lower.includes("break")) return "Good call. Finish this checkpoint, then take a 5-minute water break.";
  return "You’re not studying alone. Pick one small next step and I’ll stay with you.";
}

startButton.addEventListener("click", start);
pauseButton.addEventListener("click", pause);
feedButton.addEventListener("click", () => {
  if (!treats) return;
  treats -= 1;
  energy = Math.min(100, energy + 20);
  xp += 5;
  moodElement.textContent = "HAPPY";
  addMessage("Buddy", "Crunch crunch! Thanks for the snack. +5 XP.");
  save();
  render();
});
chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  addMessage("You", text, "you");
  chatInput.value = "";
  window.setTimeout(() => addMessage("Buddy", respond(text)), 350);
});
document.addEventListener("keydown", (event) => {
  if (event.code !== "Space" || event.target === chatInput) return;
  event.preventDefault();
  timerId ? pause() : start();
});

buildLabel.textContent = "v0.1 // TAURI DESKTOP";
load();
render();
