"use strict";

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "studybuddy-state";
const TASK_LIMIT = 3;
const MAX_XP = 50;
const MAX_HP = 50;
const tauri = window.__TAURI__;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function createDefaultState() {
  return {
    version: 2,
    pet: { hp: MAX_HP, maxHp: MAX_HP, xp: 0, xpNext: MAX_XP, level: 1, coins: 0 },
    study: {
      tasks: [],
      activeId: null,
      running: false,
      endAt: 0,
      remainingMs: 0,
      started: false,
      streak: 0,
      mascotDeployed: false,
      koPaused: false,
      reviveNonce: 0,
      lastFinishEmptiedAt: 0,
    },
    settings: { enabled: true, paused: false, speed: 1.5, size: 100, darkMode: false },
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
        coins: 0,
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
  const duration = activeTask ? activeTask.minutes * 60_000 : 0;
  const remainingMs = clamp(finite(saved.study?.remainingMs, duration), 0, duration);
  const petHp = clamp(finite(saved.pet?.hp, MAX_HP), 0, MAX_HP);
  const timerWasRunning = Boolean(saved.study?.running && activeTask);
  const koPaused = Boolean(saved.study?.koPaused || (timerWasRunning && petHp <= 0));
  const savedEndAt = finite(saved.study?.endAt, Date.now());
  const running = Boolean(timerWasRunning && petHp > 0 && remainingMs > 0);
  const endAt = running ? Math.max(Date.now(), savedEndAt) : 0;
  const pausedRemainingMs = timerWasRunning && petHp <= 0
    ? clamp(savedEndAt - Date.now(), 0, duration)
    : remainingMs;
  const petXp = Math.max(0, Math.floor(finite(saved.pet?.xp, 0)));
  const petLevel = Math.max(1, Math.floor(finite(saved.pet?.level, 1)));
  const totalXp = (petLevel - 1) * MAX_XP + petXp;

  return {
    version: 2,
    pet: {
      hp: petHp,
      maxHp: MAX_HP,
      xp: totalXp % MAX_XP,
      xpNext: MAX_XP,
      level: Math.floor(totalXp / MAX_XP) + 1,
      coins: Math.max(0, Math.floor(finite(saved.pet?.coins, 0))),
    },
    study: {
      tasks,
      activeId,
      running,
      endAt,
      remainingMs: running ? remainingMs : clamp(pausedRemainingMs, 0, duration),
      started: Boolean(saved.study?.started && activeTask),
      streak: Math.max(0, Math.floor(finite(saved.study?.streak, 0))),
      mascotDeployed: Boolean(tasks.length && (saved.study?.mascotDeployed
        ?? (saved.study?.started || saved.study?.running))),
      koPaused,
      reviveNonce: Math.max(0, finite(saved.study?.reviveNonce, 0)),
      lastFinishEmptiedAt: Math.max(0, finite(saved.study?.lastFinishEmptiedAt, 0)),
    },
    settings: {
      enabled: saved.settings?.enabled !== false,
      paused: Boolean(saved.settings?.paused),
      speed: clamp(finite(saved.settings?.speed, 1.5), 0.4, 5),
      size: clamp(finite(saved.settings?.size, 100), 40, 150),
      darkMode: Boolean(saved.settings?.darkMode),
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
let pointerTaskDrag = null;
let lastRenderedLevel = null;

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
    visible: (state.study.mascotDeployed || state.study.koPaused)
      && state.settings.enabled && !state.hiddenForSession,
    mascotDeployed: state.study.mascotDeployed,
    koPaused: state.study.koPaused,
    lastFinishEmptiedAt: state.study.lastFinishEmptiedAt,
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
  const leveledUp = lastRenderedLevel !== null && state.pet.level > lastRenderedLevel;
  lastRenderedLevel = state.pet.level;
  $("hp-fill").style.width = `${100 * hp / Math.max(maxHp, 1)}%`;
  $("hp-fill").parentElement.setAttribute("aria-valuenow", String(hp));
  $("pet-condition").textContent = hp <= 0 ? "KO" : hp < 15 ? "LOW" : "HEALTHY";
  $("xp-fill").style.width = `${100 * xp / MAX_XP}%`;
  $("xp-fill").parentElement.setAttribute("aria-valuenow", String(xp));
  $("level-label").textContent = `LEVEL ${level}`;
  $("coin-count").textContent = String(state.pet.coins);
  if (leveledUp) {
    const wallet = $("coin-count").parentElement;
    wallet.classList.remove("level-up");
    void wallet.offsetWidth;
    wallet.classList.add("level-up");
    setTimeout(() => wallet.classList.remove("level-up"), 900);
  }
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
    const canDrag = state.study.tasks.length > 1
      && !(state.study.started && task.id === state.study.activeId);
    item.dataset.taskId = task.id;
    if (canDrag) {
      item.classList.add("reorderable");
      item.title = "Drag the handle to change task order";
      item.setAttribute("aria-label", `Drag to reorder ${task.title}`);
      const grip = document.createElement("span");
      grip.className = "drag-grip";
      grip.textContent = "⠿";
      grip.setAttribute("aria-hidden", "true");
      grip.title = "Drag to change task order";
      grip.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        pointerTaskDrag = {
          id: task.id,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          active: false,
          x: event.clientX,
          y: event.clientY,
        };
        grip.setPointerCapture(event.pointerId);
      });
      grip.addEventListener("pointermove", (event) => {
        if (!pointerTaskDrag || pointerTaskDrag.pointerId !== event.pointerId) return;
        pointerTaskDrag.x = event.clientX;
        pointerTaskDrag.y = event.clientY;
        const distance = Math.hypot(
          event.clientX - pointerTaskDrag.startX,
          event.clientY - pointerTaskDrag.startY,
        );
        if (!pointerTaskDrag.active && distance < 5) return;
        pointerTaskDrag.active = true;
        item.classList.add("dragging");
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("#task-list li");
        document.querySelectorAll("#task-list li").forEach((row) => {
          row.classList.toggle("drag-target", row === target && row.dataset.taskId !== task.id);
        });
      });
      const finishPointerDrag = (event, commitOrder) => {
        if (!pointerTaskDrag || pointerTaskDrag.pointerId !== event.pointerId) return;
        const drag = pointerTaskDrag;
        pointerTaskDrag = null;
        document.querySelectorAll("#task-list li").forEach((row) => {
          row.classList.remove("dragging", "drag-target");
        });
        if (!commitOrder || !drag.active) return;
        const target = document.elementFromPoint(drag.x, drag.y)?.closest("#task-list li");
        const ids = state.study.tasks.map((queuedTask) => queuedTask.id);
        const from = ids.indexOf(drag.id);
        const targetIndex = target ? ids.indexOf(target.dataset.taskId) : -1;
        if (from < 0 || targetIndex < 0 || from === targetIndex) return;
        if (state.study.started && target.dataset.taskId === state.study.activeId) return;
        const rect = target.getBoundingClientRect();
        const insertAfter = drag.y >= rect.top + rect.height / 2;
        const [moved] = ids.splice(from, 1);
        let destination = targetIndex + (insertAfter ? 1 : 0);
        if (from < destination) destination--;
        ids.splice(destination, 0, moved);
        reorderTasks(ids);
      };
      grip.addEventListener("pointerup", (event) => finishPointerDrag(event, true));
      grip.addEventListener("pointercancel", (event) => finishPointerDrag(event, false));
      grip.addEventListener("lostpointercapture", (event) => finishPointerDrag(event, false));
      item.prepend(grip);
    }
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

function renderStudy(updateQueue = true) {
  const task = currentTask();
  const duration = task ? task.minutes * 60_000 : 0;
  const remaining = task ? remainingTime() : 0;
  const seconds = Math.ceil(remaining / 1000);
  $("timer").textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const progress = task ? clamp(100 * (1 - remaining / duration), 0, 100) : 0;
  $("progress").style.width = `${progress}%`;
  $("progress").parentElement.setAttribute("aria-valuenow", String(Math.round(progress)));
  $("quest-name").textContent = task?.title ?? "Add a task to begin";
  $("session-label").textContent = task ? `${task.minutes} MIN FOCUS SESSION` : "NO TASK SELECTED";
  $("streak").textContent = `STREAK ${String(state.study.streak).padStart(2, "0")}`;
  const status = state.study.running
    ? "LOCKED IN"
    : state.study.koPaused
    ? "KO — PAUSED"
    : task && remaining === 0
      ? "TIME UP"
      : task && remaining < duration
        ? "PAUSED"
        : "READY";
  $("status-chip").textContent = status;
  $("status-chip").classList.toggle("active", state.study.running);
  $("status-chip").classList.toggle("ko", state.study.koPaused);
  $("start").disabled = state.study.running || !task;
  $("pause").disabled = !state.study.running;
  $("finish").disabled = !task || !state.study.started || (!state.study.running && remaining > 0);
  if (updateQueue) renderQueue();
  renderMood();
}

function renderSettings() {
  $("darkMode").checked = state.settings.darkMode;
  document.documentElement.dataset.theme = state.settings.darkMode ? "dark" : "light";
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
    state.study.remainingMs = (state.study.tasks[0]?.minutes ?? 0) * 60_000;
    state.study.started = false;
  }
  if (!state.study.tasks.length) state.study.mascotDeployed = false;
  commit();
}

function reorderTasks(ids) {
  const existingIds = state.study.tasks.map((task) => task.id);
  if (ids.length !== existingIds.length || new Set(ids).size !== ids.length
      || ids.some((id) => !existingIds.includes(id))) {
    showMessage("Task order is invalid. Refresh the queue and try again.", true);
    return;
  }
  if (state.study.started && ids[0] !== state.study.activeId) {
    showMessage("The active task must stay first after it has started.", true);
    return;
  }
  const tasksById = new Map(state.study.tasks.map((task) => [task.id, task]));
  state.study.tasks = ids.map((id) => tasksById.get(id));
  if (!state.study.started) {
    state.study.activeId = state.study.tasks[0]?.id ?? null;
    state.study.remainingMs = (state.study.tasks[0]?.minutes ?? 0) * 60_000;
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
  if (state.study.koPaused || state.pet.hp <= 0) {
    state.pet.hp = state.pet.maxHp;
    state.study.koPaused = false;
    state.study.reviveNonce = Date.now();
  }
  const currentIndex = state.study.tasks.findIndex((queuedTask) => queuedTask.id === task.id);
  if (currentIndex > 0) {
    state.study.tasks = [task, ...state.study.tasks.filter((queuedTask) => queuedTask.id !== task.id)];
  }
  if (state.study.remainingMs <= 0) state.study.remainingMs = task.minutes * 60_000;
  state.study.running = true;
  state.study.started = true;
  state.study.mascotDeployed = true;
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
  if (state.pet.hp <= 0) state.study.koPaused = true;
  clearHealthClocks();
  commit("Paused quest: -10 HP and your focus streak reset.");
}

function penalizeInterruptedTask() {
  state.pet.hp = Math.max(0, state.pet.hp - 10);
  state.study.streak = 0;
}

function grantXp(amount) {
  const total = state.pet.xp + amount;
  const levelsGained = Math.floor(total / MAX_XP);
  state.pet.level += levelsGained;
  state.pet.coins += levelsGained;
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
  state.study.remainingMs = (state.study.tasks[0]?.minutes ?? 0) * 60_000;
  state.study.started = false;
  state.study.running = false;
  state.study.endAt = 0;
  state.study.streak += 1;
  grantXp(25);
  if (!state.study.tasks.length) {
    state.study.mascotDeployed = false;
    state.study.lastFinishEmptiedAt = Date.now();
  }
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

async function askBuddy(text) {
  const response = await fetch("http://127.0.0.1:8000/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: text }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.detail || "AI request failed.");
  if (typeof result.reply !== "string" || !result.reply.trim()) {
    throw new Error("The AI service returned an empty reply.");
  }
  return result.reply;
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
    state.pet.hp = Math.max(0, state.pet.hp - loss * 2);
    if (state.pet.hp <= 0) {
      state.study.remainingMs = Math.max(0, state.study.endAt - Date.now());
      state.study.running = false;
      state.study.endAt = 0;
      state.study.koPaused = true;
      clearHealthClocks();
    }
    renderPet();
    renderStudy();
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
  if (!expireStudy()) renderStudy(false);
}

function expireStudy() {
  if (!state.study.running || state.study.endAt > Date.now()) return false;
  state.study.running = false;
  state.study.endAt = 0;
  state.study.remainingMs = 0;
  penalizeInterruptedTask();
  if (state.pet.hp <= 0) state.study.koPaused = true;
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
$("darkMode").addEventListener("change", (event) => {
  state.settings.darkMode = event.target.checked;
  document.documentElement.dataset.theme = state.settings.darkMode ? "dark" : "light";
  saveState();
});
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
  if (state.study.koPaused) {
    state.study.koPaused = false;
    state.study.reviveNonce = Date.now();
  }
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
$("chat-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = $("chat-input").value.trim();
  if (!text) return;
  addMessage("You", text, "you");
  $("chat-input").value = "";
  const submitButton = $("chat-form").querySelector("button");
  submitButton.disabled = true;
  const thinking = document.createElement("p");
  thinking.className = "buddy thinking";
  thinking.textContent = "Buddy Thinking...";
  $("chat-log").append(thinking);
  $("chat-log").scrollTop = $("chat-log").scrollHeight;
  try {
    const reply = await askBuddy(text);
    thinking.remove();
    addMessage("Buddy", reply);
  } catch (error) {
    thinking.remove();
    const message = error instanceof TypeError
      ? "I cannot reach the AI server. Start the local StudyBuddy server and try again."
      : `The AI service returned an error: ${error.message}`;
    addMessage("Buddy", message);
    console.error("Buddy chat request failed.", error);
  } finally {
    submitButton.disabled = false;
  }
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
