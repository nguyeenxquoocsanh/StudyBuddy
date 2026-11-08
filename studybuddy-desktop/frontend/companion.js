"use strict";

const $ = (id) => document.getElementById(id);
const api = window.__TAURI__;
const SPRITES = {
  idle: Array.from({ length: 4 }, (_, index) => `sprites/idle_${index}.png`),
  walk_left: Array.from({ length: 4 }, (_, index) => `sprites/walk_left_${index}.png`),
  walk_right: Array.from({ length: 4 }, (_, index) => `sprites/walk_right_${index}.png`),
  dead: ["sprites/dead_0.png"],
};
const WINDOW_WIDTH = 300;
const WINDOW_HEIGHT = 340;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let bounds;
let state = null;
let behavior = "idle";
let frame = 0;
let x = 0;
let y = 0;
let direction = Math.random() < 0.5 ? -1 : 1;
let nextDecision = Date.now() + 1500;
let dragging = false;
let dragOffset = { x: 0, y: 0 };
let reactionUntil = 0;
let hidden = true;
let lastPositionAt = 0;
let lastAnimationAt = 0;
let lastFrameAt = 0;
let moving = false;
let movePending = false;
let lastActivityAt = 0;
let firstActivityAt = 0;
let lastActivityEventAt = 0;
let activityEvents = 0;
let lastResetRequest = null;
let lastFinishEmptiedAt = 0;
let fadeTimer = 0;
let lastLevel = null;
let effectTimer = 0;

function showError(error) {
  console.error(error);
  $("overlay-error").hidden = false;
  $("overlay-error").textContent = "Companion update failed.";
}

async function invoke(name, args) {
  try {
    return await api.core.invoke(name, args);
  } catch (error) {
    showError(error);
    throw error;
  }
}

async function emit(name, payload) {
  try {
    await api.event.emit(name, payload);
  } catch (error) {
    showError(error);
    throw error;
  }
}

function scale() {
  return (state?.settings?.size ?? 100) / 100;
}

function spriteState() {
  if ((state?.pet?.hp ?? 50) <= 0) return "dead";
  return behavior;
}

function setSprite() {
  const images = SPRITES[spriteState()];
  $("sprite").src = images[frame % images.length];
}

function renderBars() {
  const pet = state?.pet;
  if (!pet) return;
  $("hp-fill").style.width = `${100 * pet.hp / Math.max(1, pet.maxHp)}%`;
  $("hp-fill").parentElement.setAttribute("aria-valuenow", String(pet.hp));
  $("xp-fill").style.width = `${100 * pet.xp / Math.max(1, pet.xpNext)}%`;
  $("xp-fill").parentElement.setAttribute("aria-valuenow", String(pet.xp));
  const level = Math.max(1, Number(pet.level) || 1);
  $("level-badge").textContent = `LV.${level}`;
  if (lastLevel !== null && level > lastLevel) {
    const effect = $("level-effect");
    effect.classList.remove("show");
    void effect.offsetWidth;
    effect.classList.add("show");
    clearTimeout(effectTimer);
    effectTimer = setTimeout(() => effect.classList.remove("show"), 1100);
  }
  lastLevel = level;
}

function maxX() {
  return Math.max(0, bounds.width / bounds.scale - WINDOW_WIDTH);
}

function maxY() {
  return Math.max(0, bounds.height / bounds.scale - WINDOW_HEIGHT);
}

function setTransform() {
  $("pet").style.transform = `scale(${scale()})`;
}

function resetPosition() {
  x = maxX() / 2;
  y = maxY();
  behavior = "idle";
  frame = 0;
  direction = Math.random() < 0.5 ? -1 : 1;
  nextDecision = Date.now() + 1500;
  setSprite();
  moveWindow();
}

async function moveWindow() {
  if (!bounds) return;
  if (moving) {
    movePending = true;
    return;
  }
  const physicalX = Math.round(bounds.x + x * bounds.scale);
  const physicalY = Math.round(bounds.y + y * bounds.scale);
  moving = true;
  try {
    await invoke("set_companion_position", { x: physicalX, y: physicalY });
  } catch {
    return;
  } finally {
    moving = false;
  }
  if (movePending) {
    movePending = false;
    await moveWindow();
  }
}

function updateVisibility(fadeOut = false) {
  const visible = Boolean(state?.visible);
  const stage = $("stage");
  if (visible) {
    clearTimeout(fadeTimer);
    stage.style.transition = "";
    stage.style.opacity = "";
    if (hidden) {
      hidden = false;
      invoke("set_companion_visible", { visible: true }).catch(() => {});
    }
    return;
  }
  if (fadeOut && !hidden) {
    clearTimeout(fadeTimer);
    stage.style.transition = "opacity 650ms ease";
    requestAnimationFrame(() => { stage.style.opacity = "0"; });
    fadeTimer = setTimeout(() => {
      stage.style.transition = "";
      stage.style.opacity = "";
      if (!state?.visible && !hidden) {
        hidden = true;
        invoke("set_companion_visible", { visible: false }).catch(() => {});
      }
    }, 650);
    return;
  }
  if (!hidden) {
    hidden = true;
    invoke("set_companion_visible", { visible: false }).catch(() => {});
  }
}

function applyState(next) {
  const wasDeployed = Boolean(state?.mascotDeployed);
  const finishTimestamp = Number(next.lastFinishEmptiedAt) || 0;
  const finishedLast = wasDeployed && !next.mascotDeployed
    && finishTimestamp > 0 && finishTimestamp !== lastFinishEmptiedAt;
  state = next;
  document.documentElement.dataset.theme = state.settings.darkMode ? "dark" : "light";
  lastFinishEmptiedAt = finishTimestamp;
  renderBars();
  setTransform();
  if (state.resetRequest !== lastResetRequest) {
    lastResetRequest = state.resetRequest;
    resetPosition();
  } else if (state.mascotDeployed && !wasDeployed) {
    resetPosition();
  }
  if (state.endAt <= Date.now()) {
    state.running = false;
  }
  if (state.pet.hp <= 0) {
    behavior = "dead";
    frame = 0;
    dragging = false;
    $("pet").classList.remove("drag");
    setSprite();
  } else if (behavior === "dead") {
    behavior = "idle";
    frame = 0;
    setSprite();
  }
  updateVisibility(finishedLast);
}

function selectBehavior() {
  if (Math.random() < 0.3) {
    behavior = "idle";
    nextDecision = Date.now() + 5000 + Math.random() * 20_000;
  } else {
    direction = Math.random() < 0.5 ? -1 : 1;
    behavior = direction > 0 ? "walk_right" : "walk_left";
    nextDecision = Date.now() + 1500 + Math.random() * 2500;
  }
  frame = 0;
  setSprite();
}

function animate() {
  if (!state?.mascotDeployed || !state?.settings?.enabled || state.hiddenForSession
      || state.settings.paused || dragging || state.pet.hp <= 0) {
    if (state?.pet?.hp <= 0 && spriteState() !== "dead") setSprite();
    behavior = state?.pet?.hp <= 0 ? "dead" : "idle";
    return;
  }
  if (reducedMotion.matches) {
    behavior = "idle";
    frame = 0;
    setSprite();
    return;
  }
  const now = Date.now();
  const frameScale = lastAnimationAt
    ? Math.min(2, (now - lastAnimationAt) / (1000 / 60))
    : 1;
  lastAnimationAt = now;
  if (now >= nextDecision) selectBehavior();
  if (behavior !== "idle") {
    x += state.settings.speed * frameScale * direction;
    if (x <= 0) {
      x = 0;
      direction = 1;
      behavior = "walk_right";
      nextDecision = now + 1500 + Math.random() * 2500;
      setSprite();
    } else if (x >= maxX()) {
      x = maxX();
      direction = -1;
      behavior = "walk_left";
      nextDecision = now + 1500 + Math.random() * 2500;
      setSprite();
    }
  }
  if (reactionUntil && now < reactionUntil) {
    behavior = "idle";
    frame = 2;
    setSprite();
  } else if (now - lastFrameAt >= 150) {
    reactionUntil = 0;
    frame = (frame + 1) % SPRITES[behavior].length;
    lastFrameAt = now;
    setSprite();
  }
}

async function reportBehavior() {
  if (!state?.running || state.endAt <= Date.now() || !state?.settings?.enabled || state.hiddenForSession) return;
  try {
    const idleMs = await invoke("get_last_input_idle_ms");
    const now = Date.now();
    if (idleMs < 1500) {
      if (now - lastActivityEventAt > 2000) {
        firstActivityAt = now;
        activityEvents = 0;
      }
      lastActivityEventAt = now;
      lastActivityAt = now;
      activityEvents += 1;
    }
    const activity = now - lastActivityAt < 1500
      && activityEvents >= 2
      && firstActivityAt > 0
      && state.pet.hp > 0;
    await emit("companion-behavior", {
      behavior: behavior === "dead" || dragging || reactionUntil > now ? "active" : behavior,
      visible: true,
      activity,
    });
  } catch (error) {
    console.error("Could not report desktop activity.", error);
  }
}

function pointOnDesktop(event) {
  return {
    x: event.screenX - dragOffset.x,
    y: event.screenY - dragOffset.y,
  };
}

$("pet").addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || !state?.mascotDeployed || (state.pet.hp ?? 0) <= 0) return;
  event.preventDefault();
  $("menu").hidden = true;
  dragging = true;
  behavior = "idle";
  dragOffset = {
    x: event.screenX - (bounds.x / bounds.scale + x),
    y: event.screenY - (bounds.y / bounds.scale + y),
  };
  $("pet").classList.add("drag");
  $("pet").setPointerCapture(event.pointerId);
});

$("pet").addEventListener("pointermove", (event) => {
  if (!dragging) return;
  const point = pointOnDesktop(event);
  x = clamp(point.x - bounds.x / bounds.scale, 0, maxX());
  y = clamp(point.y - bounds.y / bounds.scale, 0, maxY());
  moveWindow();
  event.preventDefault();
});

function endDrag(event) {
  if (!dragging) return;
  if ($("pet").hasPointerCapture(event.pointerId)) $("pet").releasePointerCapture(event.pointerId);
  dragging = false;
  $("pet").classList.remove("drag");
  frame = 2;
  reactionUntil = Date.now() + 850;
  nextDecision = Date.now() + 1200;
  setSprite();
}

$("pet").addEventListener("pointerup", endDrag);
$("pet").addEventListener("pointercancel", endDrag);
$("pet").addEventListener("contextmenu", (event) => {
  event.preventDefault();
  $("menu").style.left = `${Math.max(0, Math.min(event.clientX + 8, 120))}px`;
  $("menu").style.top = `${Math.max(0, Math.min(event.clientY + 5, 210))}px`;
  $("menu").hidden = false;
});

$("menu").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  $("menu").hidden = true;
  emit("companion-action", { action }).catch(() => {});
});

document.addEventListener("pointerdown", (event) => {
  if (!event.target.closest("#menu") && !event.target.closest("#pet")) $("menu").hidden = true;
}, { passive: true });

async function initialize() {
  if (!api?.core?.invoke || !api?.event?.listen) {
    showError(new Error("Tauri desktop APIs are unavailable."));
    return;
  }
  try {
    bounds = await invoke("get_desktop_bounds");
    x = maxX() / 2;
    y = maxY();
    await api.event.listen("companion-state", (event) => applyState(event.payload));
    await emit("companion-ready", {});
    setTransform();
    setSprite();
    await moveWindow();
    setInterval(() => {
      animate();
      const now = Date.now();
      if (now - lastPositionAt >= 33) {
        lastPositionAt = now;
        if (state?.mascotDeployed && !hidden && !state.settings.paused) moveWindow();
      }
    }, 16);
    setInterval(() => {
      if (state?.running && state.endAt <= Date.now()) {
        state.running = false;
        updateVisibility();
      }
      reportBehavior();
    }, 1000);
  } catch (error) {
    showError(error);
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

initialize();
