"use strict";

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "studybuddy-state";
const SESSION_MS = 25 * 60 * 1000;
const TASK_LIMIT = 3;
const MAX_XP = 50;
const MAX_HP = 50;
const tauri = window.__TAURI__;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function createDefaultState() {
  return {
    version: 2,
    pet: { hp: MAX_HP, maxHp: MAX_HP, xp: 0, xpNext: MAX_XP, level: 1 },
    study: {
      tasks: [],
      activeId: null,
      running: false,
      endAt: 0,
      remainingMs: SESSION_MS,
      started: false,
      streak: 0,
    },
    settings: { enabled: true, paused: false, speed: 1.5, size: 100 },
    hiddenForSession: false,
    resetRequest: 0,
  };
}

function finite(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cleanTask(task) {
  if (!task || typeof task !== "object") return null;
  const title = typeof task.title === "string" ? task.title.trim().slice(0, 120) : "";
  const minutes = Math.floor(finite(task.minutes, 0));
  if (!title || minutes < 1 || minutes > 240) return null;
  return { id: String(task.id || crypto.randomUUID()), title, minutes };
}

function normalizeState(saved) {
  const defaults = createDefaultState();
  if (!saved || typeof saved !== "object") return defaults;

  if (saved.version !== 2) {
    const legacyXp = Math.max(0, finite(saved.xp, 0));
    const totalXp = Math.floor(legacyXp);
    return {
      ...defaults,
      pet: {
        hp: Math.round(clamp(finite(saved.energy, 100), 0, 100) / 2),
        maxHp: MAX_HP,
        xp: totalXp % MAX_XP,
        xpNext: MAX_XP,
        level: Math.floor(totalXp / MAX_XP) + 1,
      },
    };
  }

  const tasks = Array.isArray(saved.study?.tasks)
    ? saved.study.tasks.map(cleanTask).filter(Boolean).slice(0, TASK_LIMIT)
    : [];
  const activeId = tasks.some((task) => task.id === saved.study?.activeId)
    ? saved.study.activeId
    : (tasks[0]?.id ?? null);
  const activeTask = tasks.find((task) => task.id === activeId);
  const duration = (activeTask?.minutes ?? 25) * 60_000;
  const remainingMs = clamp(finite(saved.study?.remainingMs, duration), 0, duration);
  const running = Boolean(saved.study?.running && activeTask && remainingMs > 0);
  const endAt = running ? Math.max(Date.now(), finite(saved.study?.endAt, Date.now())) : 0;
  const petXp = Math.max(0, Math.floor(finite(saved.pet?.xp, 0)));
  const petLevel = Math.max(1, Math.floor(finite(saved.pet?.level, 1)));
  const totalXp = (petLevel - 1) * MAX_XP + petXp;

  return {
    version: 2,
    pet: {
      hp: clamp(finite(saved.pet?.hp, MAX_HP), 0, MAX_HP),
      maxHp: MAX_HP,
      xp: totalXp % MAX_XP,
      xpNext: MAX_XP,
      level: Math.floor(totalXp / MAX_XP) + 1,
    },
    study: {
      tasks,
      activeId,
      running,
      endAt,
      remainingMs: running ? remainingMs : clamp(remainingMs, 0, duration),
      started: Boolean(saved.study?.started && activeTask),
      streak: Math.max(0, Math.floor(finite(saved.study?.streak, 0))),
    },
    settings: {
      enabled: saved.settings?.enabled !== false,
      paused: Boolean(saved.settings?.paused),
      speed: clamp(finite(saved.settings?.speed, 1.5), 0.4, 5),
      size: clamp(finite(saved.settings?.size, 100), 40, 150),
    },
    hiddenForSession: Boolean(saved.hiddenForSession),
    resetRequest: Math.max(0, finite(saved.resetRequest, 0)),
  };
}

let state = createDefaultState();
let settingsOpen = false;
let companionReady = false;
let idleSince = 0;
let idleReport = 0;
let idleTicks = 0;
let activeSince = 0;
let activeReport = 0;
let healedTicks = 0;
let lastBehaviorReport = 0;
let lastActivityAt = 0;
let firstActivityAt = 0;
let lastActivityEventAt = 0;
let activityEvents = 0;
let lastPetMood = "";

function showMessage(message, isError = false) {
  const element = $("queue-message");
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function clearHealthClocks() {
  idleSince = 0;
  idleReport = 0;
  idleTicks = 0;
  activeSince = 0;
  activeReport = 0;
  healedTicks = 0;
}

function companionState() {
  return {
    running: state.study.running,
    endAt: state.study.endAt,
    visible: state.study.running && state.settings.enabled && !state.hiddenForSession,
    pet: state.pet,
    settings: state.settings,
    hiddenForSession: state.hiddenForSession,
    resetRequest: state.resetRequest,
  };
}

function publishCompanionState() {
  if (!tauri?.event?.emit) {
    showMessage("The desktop companion bridge is unavailable.", true);
    return;
  }
  tauri.event.emit("companion-state", companionState()).catch((error) => {
    console.error("Could not update the desktop companion.", error);
    showMessage("Could not update the desktop companion.", true);
  });
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Could not save StudyBuddy state.", error);
    showMessage("Could not save your StudyBuddy progress.", true);
    return false;
  }
  publishCompanionState();
  return true;
}

function loadState() {
  let savedText;
  try {
    savedText = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.error("Could not read StudyBuddy state.", error);
    showMessage("Could not read your saved progress.", true);
    return;
  }
  if (!savedText) {
    state = createDefaultState();
    saveState();
    return;
  }
  try {
    const saved = JSON.parse(savedText);
    state = normalizeState(saved);
    if (!saved || saved.version !== 2) saveState();
  } catch (error) {
    console.error("Could not parse StudyBuddy state.", error);
    state = createDefaultState();
    showMessage("Saved progress could not be read; your existing save was left untouched.", true);
  }
}

function renderPet() {
  const { hp, maxHp, xp, level } = state.pet;
  $("hp-fill").style.width = `${100 * hp / Math.max(maxHp, 1)}%`;
  $("hp-fill").parentElement.setAttribute("aria-valuenow", String(hp));
  $("pet-condition").textContent = hp <= 0 ? "KO" : hp < 15 ? "LOW" : "HEALTHY";
  $("xp-fill").style.width = `${100 * xp / MAX_XP}%`;
  $("xp-fill").parentElement.setAttribute("aria-valuenow", String(xp));
  $("level-label").textContent = `LEVEL ${level}`;
  if (hp <= 0) {
    $("mascot-preview").src = "sprites/dead_0.png";
  } else {
    const frame = Math.floor(Date.now() / 210) % 4;
    $("mascot-preview").src = `sprites/idle_${frame}.png`;
  }
  renderMood();
}

function renderMood() {
  const mood = state.pet.hp <= 0 ? "KO" : state.study.running ? "FOCUSED" : "READY";
  $("mood").textContent = mood;
  if (mood !== lastPetMood && $("mascot-preview")) {
    lastPetMood = mood;
    if (mood !== "KO") $("mascot-preview").src = "sprites/idle_0.png";
  }
}

function renderQueue() {
  const list = $("task-list");
  list.replaceChildren();
  $("queue-count").textContent = `${state.study.tasks.length} / ${TASK_LIMIT}`;
  $("add-task").disabled = state.study.tasks.length >= TASK_LIMIT;
  if (!state.study.tasks.length) {
    const item = document.createElement("li");
    item.className = "empty-queue";
    item.textContent = "Your quest list is empty. Add up to 3 tasks.";
    list.append(item);
    return;
  }
  state.study.tasks.forEach((task, index) => {
    const item = document.createElement("li");
    if (task.id === state.study.activeId) item.classList.add("current");
    const number = document.createElement("span");
    number.className = "task-number";
    number.textContent = String(index + 1).padStart(2, "0");
    const details = document.createElement("span");
    details.className = "task-details";
    const title = document.createElement("strong");
    title.textContent = task.title;
    const duration = document.createElement("small");
    duration.textContent = `${task.minutes} min${task.id === state.study.activeId ? " • CURRENT" : ""}`;
    details.append(title, duration);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "task-remove";
    remove.textContent = "×";
    remove.title = `Remove ${task.title}`;
    remove.setAttribute("aria-label", `Remove ${task.title}`);
    remove.disabled = state.study.running && task.id === state.study.activeId;
    remove.addEventListener("click", () => removeTask(task.id));
    item.append(number, details, remove);
    list.append(item);
  });
}

function currentTask() {
  return state.study.tasks.find((task) => task.id === state.study.activeId);
}

function remainingTime() {
  return state.study.running
    ? Math.max(0, state.study.endAt - Date.now())
    : Math.max(0, state.study.remainingMs);
}

function renderStudy() {
  const task = currentTask();
  const duration = (task?.minutes ?? 25) * 60_000;
  const remaining = remainingTime();
  const seconds = Math.ceil(remaining / 1000);
  $("timer").textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const progress = clamp(100 * (1 - remaining / duration), 0, 100);
  $("progress").style.width = `${progress}%`;
  $("progress").parentElement.setAttribute("aria-valuenow", String(Math.round(progress)));
  $("quest-name").textContent = task?.title ?? "Add a task to begin";
  $("session-label").textContent = `${task?.minutes ?? 25} MIN FOCUS SESSION`;
  $("streak").textContent = `STREAK ${String(state.study.streak).padStart(2, "0")}`;
  const status = state.study.running
    ? "LOCKED IN"
    : task && remaining === 0
      ? "TIME UP"
      : task && remaining < duration
        ? "PAUSED"
        : "READY";
  $("status-chip").textContent = status;
  $("status-chip").classList.toggle("active", state.study.running);
  $("start").disabled = state.study.running || !task;
  $("pause").disabled = !state.study.running;
  $("finish").disabled = !task || !state.study.started || (!state.study.running && remaining > 0);
  renderQueue();
  renderMood();
}

function renderSettings() {
  $("enabled").checked = state.settings.enabled;
  $("paused").checked = state.settings.paused;
  $("speed").value = String(state.settings.speed);
  $("size").value = String(state.settings.size);
  $("speedVal").textContent = state.settings.speed.toFixed(1);
  $("sizeVal").textContent = `${state.settings.size}%`;
}

function render() {
  renderPet();
  renderStudy();
  renderSettings();
}

function setSettingsView(open) {
  settingsOpen = open;
  $("dashboard").hidden = open;
  $("settings-panel").hidden = !open;
  $("settings-toggle").setAttribute("aria-expanded", String(open));
  $("settings-toggle").title = open ? "Back to dashboard" : "Settings";
  $("settings-toggle").setAttribute("aria-label", open ? "Back to dashboard" : "Open settings");
}

function commit(message = "") {
  showMessage(message);
  render();
  saveState();
}

function addTask(title, minutes) {
  const cleanTitle = title.trim().slice(0, 120);
  const duration = Math.floor(Number(minutes));
  if (state.study.tasks.length >= TASK_LIMIT) {
    showMessage("The queue is full (3 tasks).", true);
    return false;
  }
  if (!cleanTitle || !Number.isFinite(duration) || duration < 1 || duration > 240) {
    showMessage("Enter a task and a duration from 1 to 240 minutes.", true);
    return false;
  }
  const task = { id: crypto.randomUUID(), title: cleanTitle, minutes: duration };
  state.study.tasks.push(task);
  if (!state.study.activeId) {
    state.study.activeId = task.id;
    state.study.remainingMs = duration * 60_000;
    state.study.started = false;
  }
  commit();
  return true;
}

function removeTask(id) {
  if (state.study.running && state.study.activeId === id) {
    showMessage("Pause this task before removing it.", true);
    return;
  }
  const before = state.study.tasks.length;
  state.study.tasks = state.study.tasks.filter((task) => task.id !== id);
  if (before === state.study.tasks.length) {
    showMessage("Task not found.", true);
    return;
  }
  if (state.study.activeId === id) {
    state.study.activeId = state.study.tasks[0]?.id ?? null;
    state.study.remainingMs = (state.study.tasks[0]?.minutes ?? 25) * 60_000;
    state.study.started = false;
  }
  commit();
}

function startStudy() {
  expireStudy();
  const task = currentTask();
  if (!task) {
    showMessage("Add a task first.", true);
    return;
  }
  if (state.study.running) return;
  if (state.study.remainingMs <= 0) state.study.remainingMs = task.minutes * 60_000;
  state.study.running = true;
  state.study.started = true;
  state.study.endAt = Date.now() + state.study.remainingMs;
  state.hiddenForSession = false;
  clearHealthClocks();
  commit();
}

function pauseStudy() {
  if (expireStudy()) return;
  if (!state.study.running) return;
  state.study.remainingMs = Math.max(0, state.study.endAt - Date.now());
  state.study.running = false;
  state.study.endAt = 0;
  penalizeInterruptedTask();
  clearHealthClocks();
  commit("Paused quest: -10 HP and your focus streak reset.");
}

function penalizeInterruptedTask() {
  state.pet.hp = Math.max(0, state.pet.hp - 10);
  state.study.streak = 0;
}

function grantXp(amount) {
  const total = state.pet.xp + amount;
  state.pet.level += Math.floor(total / MAX_XP);
  state.pet.xp = total % MAX_XP;
}

function finishTask() {
  expireStudy();
  const task = currentTask();
  if (!task) {
    showMessage("No task to finish.", true);
    return;
  }
  if (!state.study.started || (!state.study.running && remainingTime() > 0)) {
    showMessage("Start your quest before marking it Finished.", true);
    return;
  }
  if (!state.study.running && state.study.remainingMs === 0) {
    showMessage("This task timed out. Start it again to earn credit.", true);
    return;
  }
  state.study.tasks = state.study.tasks.filter((item) => item.id !== task.id);
  state.study.activeId = state.study.tasks[0]?.id ?? null;
  state.study.remainingMs = (state.study.tasks[0]?.minutes ?? 25) * 60_000;
  state.study.started = false;
  state.study.running = false;
  state.study.endAt = 0;
  state.study.streak += 1;
  grantXp(25);
  state.hiddenForSession = false;
  clearHealthClocks();
  commit("Quest finished! You earned +25 EXP. Your next task is ready.");
}

function setSetting(name, value) {
  state.settings[name] = value;
  commit();
}

function addMessage(author, text, className = "") {
  const paragraph = document.createElement("p");
  paragraph.className = className;
  const name = document.createElement("b");
  name.textContent = author;
  paragraph.append(name, document.createTextNode(` ${text}`));
  $("chat-log").append(paragraph);
  $("chat-log").scrollTop = $("chat-log").scrollHeight;
}

function respond(text) {
  const lower = text.toLowerCase();
  if (lower.includes("plan")) return "Try 20 minutes reading, 5 minutes recall, then a short break.";
  if (lower.includes("tired") || lower.includes("break")) return "A short rest, water, and a stretch may help you refocus.";
  if (lower.includes("study") || lower.includes("focus")) return "Choose one specific task. Start the timer, then work on that task only.";
  return "Pick one small next step and give it a try.";
}

function handleBehavior(payload) {
  const now = Date.now();
  if (!state.study.running || !state.settings.enabled || state.settings.paused
      || state.hiddenForSession || payload.visible !== true || state.pet.hp <= 0) {
    clearHealthClocks();
    return;
  }
  if (now - lastBehaviorReport > 2500) clearHealthClocks();
  lastBehaviorReport = now;
  if (payload.activity === true) {
    idleSince = 0;
    idleReport = 0;
    idleTicks = 0;
    if (!activeSince || now - activeReport > 2500) {
      activeSince = now;
      healedTicks = 0;
    }
    activeReport = now;
    const due = Math.max(0, Math.floor((now - activeSince - 5000) / 3000));
    const gain = Math.max(0, due - healedTicks);
    healedTicks = due;
    if (gain && state.pet.hp < MAX_HP) {
      state.pet.hp = Math.min(MAX_HP, state.pet.hp + gain);
      renderPet();
      saveState();
    }
    return;
  }
  activeSince = 0;
  activeReport = 0;
  healedTicks = 0;
  if (payload.behavior !== "idle") {
    idleSince = 0;
    idleReport = 0;
    idleTicks = 0;
    return;
  }
  if (!idleSince || now - idleReport > 2500) {
    idleSince = now;
    idleTicks = 0;
  }
  idleReport = now;
  const due = Math.max(0, Math.floor((now - idleSince - 15_000) / 3000));
  const loss = Math.max(0, due - idleTicks);
  idleTicks = due;
  if (loss) {
    state.pet.hp = Math.max(0, state.pet.hp - loss);
    renderPet();
    saveState();
  }
}

function handleCompanionAction(payload) {
  if (payload.action === "pause-walking") {
    setSetting("paused", !state.settings.paused);
  } else if (payload.action === "reset") {
    state.resetRequest += 1;
    commit();
  } else if (payload.action === "hide") {
    state.hiddenForSession = true;
    commit();
  }
}

async function connectCompanion() {
  if (!tauri?.event?.listen) {
    showMessage("Tauri desktop APIs are unavailable; the companion cannot be started.", true);
    return;
  }
  try {
    await tauri.event.listen("companion-behavior", (event) => handleBehavior(event.payload));
    await tauri.event.listen("companion-action", (event) => handleCompanionAction(event.payload));
    await tauri.event.listen("companion-ready", () => {
      companionReady = true;
      publishCompanionState();
    });
    publishCompanionState();
    let attempts = 0;
    const syncInterval = setInterval(() => {
      if (companionReady || attempts++ >= 20) {
        clearInterval(syncInterval);
        return;
      }
      publishCompanionState();
    }, 250);
  } catch (error) {
    console.error("Could not connect to the desktop companion.", error);
    showMessage("Could not connect to the desktop companion.", true);
  }
}

function tick() {
  if (!expireStudy()) renderStudy();
}

function expireStudy() {
  if (!state.study.running || state.study.endAt > Date.now()) return false;
  state.study.running = false;
  state.study.endAt = 0;
  state.study.remainingMs = 0;
  penalizeInterruptedTask();
  clearHealthClocks();
  addMessage("Buddy", "Time is up! You lost 10 HP and your focus streak reset. Start the task again when you are ready.");
  commit("Time is up: -10 HP and your focus streak reset.");
  return true;
}

$("settings-toggle").addEventListener("click", () => setSettingsView(!settingsOpen));
$("back-to-dashboard").addEventListener("click", () => setSettingsView(false));
$("task-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const title = $("task-title").value;
  const added = addTask(title, $("task-minutes").value);
  if (added) $("task-title").value = "";
});
$("start").addEventListener("click", startStudy);
$("pause").addEventListener("click", pauseStudy);
$("finish").addEventListener("click", finishTask);
$("enabled").addEventListener("change", (event) => setSetting("enabled", event.target.checked));
$("paused").addEventListener("change", (event) => {
  clearHealthClocks();
  setSetting("paused", event.target.checked);
});
$("speed").addEventListener("input", (event) => {
  state.settings.speed = clamp(Number(event.target.value), 0.4, 5);
  $("speedVal").textContent = state.settings.speed.toFixed(1);
  saveState();
});
$("size").addEventListener("input", (event) => {
  state.settings.size = clamp(Number(event.target.value), 40, 150);
  $("sizeVal").textContent = `${state.settings.size}%`;
  saveState();
});
$("restoreHp").addEventListener("click", () => {
  state.pet.hp = MAX_HP;
  clearHealthClocks();
  commit("Health restored.");
});
$("reset").addEventListener("click", () => {
  state.resetRequest += 1;
  commit("Companion position reset.");
});
$("showNow").addEventListener("click", () => {
  state.settings.enabled = true;
  state.hiddenForSession = false;
  commit();
});
$("chat-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = $("chat-input").value.trim();
  if (!text) return;
  addMessage("You", text, "you");
  $("chat-input").value = "";
  addMessage("Buddy", respond(text));
});
document.addEventListener("keydown", (event) => {
  if (event.code !== "Space" || event.target.closest("input,button,textarea") || settingsOpen) return;
  event.preventDefault();
  state.study.running ? pauseStudy() : startStudy();
});

loadState();
render();
connectCompanion();
setInterval(tick, 1000);
setInterval(() => {
  if (!settingsOpen && state.pet.hp > 0 && !reducedMotion.matches) {
    const frame = Math.floor(Date.now() / 210) % 4;
    $("mascot-preview").src = `sprites/idle_${frame}.png`;
  }
}, 210);
