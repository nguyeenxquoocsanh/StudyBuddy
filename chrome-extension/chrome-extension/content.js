(() => {
  "use strict";
  if (window.__webCompanionInjected) return;
  window.__webCompanionInjected = true;

  const W = 144;
  const H = 156;
  const STEP = 1000 / 60;
  const GRAVITY = 0.45;
  const TERMINAL_VELOCITY = 15;
  const FRAMES = 4;
  const defaults = { enabled: true, speed: 1.5, size: 100, paused: false };
  let settings = { ...defaults };
  let state = "idle";
  let frame = 0;
  let direction = Math.random() < 0.5 ? -1 : 1;
  let x = window.innerWidth * 0.5 - W * 0.5;
  let y = 18;
  let vy = 0;
  let dragging = false;
  let press = null;
  let movedByUser = false;
  let dragDelta = { x: 0, y: 0 };
  let ticks = 0;
  let nextDecision = 90;
  let reactionUntil = 0;
  let lastTick = performance.now();
  let accrued = 0;
  let animationId = 0;
  let hiddenForTab = false;
  const statsKey = "petStatsV2";
  const studyKey = "studyBuddyV2";
  let sessionRunning = false;
  let mascotDeployed = false;
  let fadingOut = false;
  let fadeTimer = 0;
  let lastFinishEmptiedAt = 0;
  let petStats = { hp: 50, maxHp: 50, xp: 0, xpNext: 50, level: 1 };
  let lastBehaviorReport = 0;
  let lastActivityAt = 0;
  let firstActivityAt = 0;
  let lastActivityEventAt = 0;
  let activityEvents = 0;
  let isKo = false;
  let statsInitialized = false;
  let effectTimeout = 0;
  const ACTIVE_RECENT_MS = 1500;
  const ACTIVITY_GAP_MS = 2000;
  function observeActivity(event) {
    if (!document.hasFocus() || document.visibilityState !== "visible") return;
    const now = Date.now();
    // Ignore synthetic events and mouse jitter; require actual user interaction.
    if (!event.isTrusted) return;
    if (event.type === "mousemove" && event.movementX === 0 && event.movementY === 0) return;
    if (now - lastActivityEventAt > ACTIVITY_GAP_MS) {
      firstActivityAt = now;
      activityEvents = 0;
    }
    lastActivityEventAt = now;
    lastActivityAt = now;
    activityEvents += 1;
  }
  for (const name of ["mousemove", "mousedown", "keydown", "wheel", "touchmove"]) {
    window.addEventListener(name, observeActivity, { capture: true, passive: true });
  }
  window.addEventListener("blur", () => { firstActivityAt = 0; activityEvents = 0; });
  document.addEventListener("visibilitychange", () => {
    firstActivityAt = 0; activityEvents = 0;
  });


  const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const clamp = (v, low, high) => Math.min(Math.max(v, low), Math.max(low, high));
  const scale = () => settings.size / 100;
  const width = () => W * scale();
  const height = () => H * scale();
  const groundY = () => Math.max(0, window.innerHeight - height());
  const maxX = () => Math.max(0, window.innerWidth - width());
  const resource = (s, index) => chrome.runtime.getURL(`sprites/${s}_${index}.png`);
  const uiResource = (name) => chrome.runtime.getURL(`ui/${name}.png`);

  const host = document.createElement("div");
  host.id = "__desktop_companion_host";
  host.setAttribute("aria-label", "Animated desktop companion");
  host.style.cssText = [
    "all:initial", "position:fixed", "left:0", "top:0", "width:100vw", "height:100vh",
    "pointer-events:none", "z-index:2147483647", "display:block", "overflow:visible",
    "transform:none", "isolation:isolate", "visibility:visible", "opacity:1"
  ].join(";");
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    :host { display: block; }
    #pet { position:absolute;left:0;top:0;width:144px;height:156px;
      user-select:none;-webkit-user-select:none;touch-action:none;cursor:grab;
      pointer-events:auto;transform-origin:top left;contain:layout;overflow:visible;
      -webkit-user-drag:none; }
    #pet.drag { cursor:grabbing; }
    #sprite { width:144px;height:156px;display:block;object-fit:contain;
      user-select:none;-webkit-user-select:none;pointer-events:none;
      -webkit-user-drag:none; }
    /* Bars are 30% shorter than v3.4.7: 180px -> 126px, centered with level label. */
    #hud { position:absolute;top:-26px;left:50%;transform:translateX(-50%);
      display:grid;grid-template-columns:126px auto;align-items:center;column-gap:6px;
      width:max-content;pointer-events:none;overflow:visible; }
    #barStack { display:flex;flex-direction:column;gap:4px;width:126px;min-width:0; }
    .meter { position:relative;width:100%;height:7px;box-sizing:border-box;
      overflow:hidden;border:1px solid #10151a;border-radius:999px;
      background:#161b22;box-shadow:0 1px 2px #0008; }
    .meter > div { height:100%;transition:width .2s ease-out;border-radius:999px; }
    #hpFill { background:linear-gradient(90deg,#b9333d,#f3646e); }
    #xpFill { background:linear-gradient(90deg,#2979a6,#59c3ff); }
    #levelArea { display:flex;align-items:center;position:relative; }
    #levelBadge { min-width:30px;height:18px;padding:0 6px;display:grid;place-items:center;
      border:1px solid #10151a;border-radius:999px;background:rgba(10,14,18,.82);color:#d5e6ee;
      box-shadow:0 1px 2px #0008;font:700 9px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
      letter-spacing:.02em;white-space:nowrap; }
    /* Reward graphics appear in a single centered row ABOVE the HP and EXP bars. */
    #rewardEffects { position:absolute;bottom:calc(100% + 7px);left:0;width:126px;
      display:flex;align-items:flex-end;justify-content:center;gap:9px;
      pointer-events:none;overflow:visible; }
    #coinFx { display:block;width:27px;height:32px;object-fit:contain;opacity:0;
      filter:drop-shadow(0 2px 3px rgba(0,0,0,.45)); }
    #levelUpFx { display:block;width:84px;height:43px;object-fit:contain;opacity:0;
      filter:drop-shadow(0 2px 3px rgba(0,0,0,.45)); }
    .fx-show-level #levelUpFx { animation: levelUpFlash 1000ms ease forwards; }
    .fx-show-coin #coinFx { animation: coinPop 1000ms ease forwards; }
    @keyframes levelUpFlash {
      0% { opacity:0; transform:translateY(7px) scale(.9); }
      18% { opacity:1; transform:translateY(0) scale(1); }
      70% { opacity:1; transform:translateY(0) scale(1); }
      100% { opacity:0; transform:translateY(-7px) scale(.98); }
    }
    @keyframes coinPop {
      0% { opacity:0; transform:translateY(13px) scale(.7); }
      18% { opacity:1; transform:translateY(0) scale(1); }
      70% { opacity:1; transform:translateY(-8px) scale(1.03); }
      100% { opacity:0; transform:translateY(-18px) scale(.9); }
    }
    #menu { position:absolute;z-index:1;min-width:160px;padding:5px;
      border:1px solid #bbc2cc;border-radius:10px;background:#fff;color:#222;
      box-shadow:0 8px 30px #0005;font:13px/1.35 system-ui,sans-serif;
      pointer-events:auto; }
    #menu[hidden] { display:none; }
    #menu button { display:block;width:100%;box-sizing:border-box;border:0;border-radius:6px;
      padding:9px 10px;text-align:left;cursor:pointer;background:transparent;
      font:inherit;color:#222; }
    #menu button:hover,#menu button:focus-visible { background:#e9f0ff;outline:none; }
  `;
  const pet = document.createElement("div");
  pet.id = "pet";
  pet.title = "Drag me • Right-click for options";
  const sprite = document.createElement("img");
  sprite.id = "sprite";
  sprite.alt = "";
  sprite.draggable = false;
  const hud = document.createElement("div");
  hud.id = "hud";
  hud.setAttribute("aria-label", "Companion health and experience");
  const barStack = document.createElement("div");
  barStack.id = "barStack";
  const hpBar = document.createElement("div");
  hpBar.className = "meter";
  hpBar.setAttribute("aria-label", "Health");
  const hpFill = document.createElement("div");
  hpFill.id = "hpFill";
  hpBar.append(hpFill);
  const xpBar = document.createElement("div");
  xpBar.className = "meter";
  xpBar.setAttribute("aria-label", "Experience");
  const xpFill = document.createElement("div");
  xpFill.id = "xpFill";
  xpBar.append(xpFill);
  barStack.append(hpBar, xpBar);
  const levelArea = document.createElement("div");
  levelArea.id = "levelArea";
  const levelBadge = document.createElement("div");
  levelBadge.id = "levelBadge";
  levelBadge.textContent = "LV.1";
  const levelUpFx = document.createElement("img");
  levelUpFx.id = "levelUpFx";
  levelUpFx.alt = "";
  levelUpFx.src = uiResource("level_up");
  levelUpFx.draggable = false;
  levelArea.append(levelBadge);
  const coinFx = document.createElement("img");
  coinFx.id = "coinFx";
  coinFx.alt = "";
  coinFx.src = uiResource("coin");
  coinFx.draggable = false;
  const rewardEffects = document.createElement("div");
  rewardEffects.id = "rewardEffects";
  rewardEffects.append(coinFx, levelUpFx);
  hud.append(barStack, levelArea, rewardEffects);
  pet.append(sprite, hud);
  const menu = document.createElement("div");
  menu.id = "menu";
  menu.hidden = true;
  const actions = [
    ["pause", "Pause / resume"],
    ["reset", "Reset position"],
    ["hide", "Hide on this page"]
  ];
  for (const [key, label] of actions) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.action = key;
    b.textContent = label;
    menu.append(b);
  }
  shadow.append(style, pet, menu);
  function attachHost() {
    if (!host.isConnected && document.documentElement) document.documentElement.appendChild(host);
  }
  attachHost();
  // Some sites replace their document root during navigation or client-side routing.
  window.addEventListener("pageshow", attachHost);
  // Observe direct children of <html> only, to avoid costly reactions to page content changes.
  if (document.documentElement) {
    const rootObserver = new MutationObserver(() => {
      if (!host.isConnected) attachHost();
    });
    rootObserver.observe(document.documentElement, { childList: true });
  }

  // Explicit preload makes transitions reliable without external requests.
  const deadPreload = new Image(); deadPreload.src = resource("dead", 0);
  const coinPreload = new Image(); coinPreload.src = uiResource("coin");
  const levelUpPreload = new Image(); levelUpPreload.src = uiResource("level_up");
  const frames = {};
  for (const s of ["idle", "walk_left", "walk_right"]) {
    frames[s] = [];
    for (let i = 0; i < FRAMES; i++) {
      const url = resource(s, i);
      const image = new Image();
      image.src = url;
      frames[s].push(url);
    }
  }


  function triggerLevelEffects() {
    pet.classList.remove("fx-show-level", "fx-show-coin");
    void pet.offsetWidth;
    pet.classList.add("fx-show-level", "fx-show-coin");
    clearTimeout(effectTimeout);
    effectTimeout = setTimeout(() => {
      pet.classList.remove("fx-show-level", "fx-show-coin");
    }, 1000);
  }

  function renderBars() {
    hpFill.style.width = `${100 * petStats.hp / Math.max(1, petStats.maxHp)}%`;
    xpFill.style.width = `${100 * petStats.xp / Math.max(1, petStats.xpNext)}%`;
    levelBadge.textContent = `LV.${Math.max(1, Number(petStats.level) || 1)}`;
  }
  function acceptStats(stats) {
    if (!stats) return;
    const prevLevel = Number(petStats.level) || 1;
    petStats = { ...petStats, ...stats };
    const nextLevel = Number(petStats.level) || 1;
    if (statsInitialized && nextLevel > prevLevel) triggerLevelEffects();
    statsInitialized = true;
    const nowKo = petStats.hp <= 0;
    if (nowKo !== isKo) {
      isKo = nowKo;
      if (isKo) {
        state = "dead";
        frame = 0;
        dragging = false;
        press = null;
        vy = 0;
        pet.classList.remove("drag");
      } else {
        state = "idle";
        frame = 0;
        nextDecision = ticks + 90;
      }
      setSprite();
    }
    renderBars();
  }
  function sendBehavior(now) {
    if (now - lastBehaviorReport < 1000) return;
    lastBehaviorReport = now;
    const visible = document.visibilityState === "visible" && document.hasFocus() && settings.enabled && !settings.paused && !hiddenForTab && sessionRunning;
    const continuousActivity = document.hasFocus() && Date.now() - lastActivityAt < ACTIVE_RECENT_MS
      && activityEvents >= 2 && firstActivityAt > 0
      && !isKo;
    const behavior = state === "idle" && !dragging && !(reactionUntil && ticks < reactionUntil) ? "idle" : "active";
    chrome.runtime.sendMessage({ type: "pet:behavior", behavior, visible, activity: continuousActivity })
      .then(response => { if (response?.stats) acceptStats(response.stats); })
      .catch(() => {}); // Extension reloads may briefly disconnect content scripts.
  }
  function setSprite() {
    const s = isKo ? resource("dead", 0) : (frames[state]?.[frame] || frames.idle[0]);
    if (sprite.src !== s) sprite.src = s;
  }
  function reposition() {
    pet.style.transform = `translate3d(${Math.round(x)}px,${Math.round(y)}px,0) scale(${scale()})`;
  }
  function cancelFade() {
    if (fadeTimer) clearTimeout(fadeTimer);
    fadeTimer=0;
    fadingOut=false;
    pet.style.transition="";
    pet.style.opacity="1";
  }
  function fadeAway() {
    if(fadingOut) return;
    fadingOut=true;
    // Allow the existing 1-second level-up/coin effect to be seen first.
    pet.style.display="block";
    pet.style.opacity="1";
    menu.hidden=true;
    fadeTimer=setTimeout(()=>{
      pet.style.transition="opacity 650ms ease-in-out";
      requestAnimationFrame(()=>{pet.style.opacity="0";});
      fadeTimer=setTimeout(()=>{
        fadingOut=false;
        fadeTimer=0;
        pet.style.transition="";
        pet.style.display="none";
        pet.style.opacity="1";
        applyVisibility();
      },700);
    },950);
  }
  function applyVisibility() {
    if(fadingOut) return;
    // Pausing a quest freezes motion and health, but does not dismiss the mascot.
    const visible = settings.enabled && !hiddenForTab && mascotDeployed;
    pet.style.display = visible ? "block" : "none";
    if (!visible) menu.hidden = true;
  }
  function updateStudyVisibility(record, initial=false) {
    const nextRunning=Boolean(record?.running && record?.endAt>Date.now());
    const queued=Array.isArray(record?.tasks) && record.tasks.length>0;
    const deployed=queued && Boolean(record?.mascotDeployed ?? (record?.started || record?.running));
    const wasDeployed=mascotDeployed;
    const fadeAt=Number(record?.lastFinishEmptiedAt)||0;
    const finishedLast= !initial && wasDeployed && !queued &&
      fadeAt>0 && fadeAt!==lastFinishEmptiedAt;

    // Starting/resuming another queued task must NEVER reset the mascot.
    // Drop from the top only when the first quest deploys the mascot.
    // A newly opened tab inherits an already-deployed mascot on the ground.
    if(deployed && !wasDeployed) {
      if(initial) {
        x = clamp(x, 0, maxX());
        y = groundY();
        vy = 0;
        reposition();
        setSprite();
      } else {
        reset(); // First start after the previous task queue was emptied.
      }
    }
    if(!nextRunning && sessionRunning) {
      dragging=false;
      press=null;
      pet.classList.remove("drag");
      menu.hidden=true;
    }
    sessionRunning=nextRunning;
    mascotDeployed=deployed;
    lastFinishEmptiedAt=fadeAt;

    if(finishedLast && settings.enabled && !hiddenForTab) fadeAway();
    else {
      if(mascotDeployed && fadingOut) cancelFade();
      applyVisibility();
    }
  }
  function reset() {
    x = clamp((window.innerWidth - width()) / 2, 0, maxX());
    y = 20;
    vy = 0;
    frame = 0;
    state = isKo ? "dead" : "idle";
    nextDecision = ticks + 90;
    reposition();
    setSprite();
  }
  function selectBehavior() {
    if (Math.random() < 0.30) {
      state = "idle";
      // Some natural rests last beyond 15 seconds so the HP rule can activate.
      nextDecision = ticks + randInt(300, 1500);
    } else {
      direction = Math.random() < 0.5 ? -1 : 1;
      state = direction > 0 ? "walk_right" : "walk_left";
      nextDecision = ticks + randInt(90, 240);
    }
    frame = 0;
  }
  function tick() {
    ticks++;
    if (isKo || dragging || settings.paused || !settings.enabled || hiddenForTab || !mascotDeployed) return;
    // Lock to viewport ground, independent of scrolling and page layout.
    const ground = groundY();
    if (y < ground) {
      vy = Math.min(vy + GRAVITY, TERMINAL_VELOCITY);
      y = Math.min(y + vy, ground);
    } else {
      y = ground;
      vy = 0;
    }
    if (ticks >= nextDecision) selectBehavior();
    if (state !== "idle" && y >= ground) {
      x += settings.speed * direction;
      if (x <= 0) {
        x = 0; direction = 1; state = "walk_right";
        nextDecision = ticks + randInt(90, 200);
      } else if (x >= maxX()) {
        x = maxX(); direction = -1; state = "walk_left";
        nextDecision = ticks + randInt(90, 200);
      }
    }
    if (reactionUntil && ticks < reactionUntil) {
      state = "idle";
      frame = 2;
    } else if (ticks % 9 === 0) {
      reactionUntil = 0;
      frame = (frame + 1) % FRAMES;
    }
    reposition();
    setSprite();
  }
  function animate(now) {
    if (!host.isConnected) attachHost();
    const elapsed = Math.min(100, now - lastTick);
    lastTick = now;
    if (document.visibilityState === "visible") {
      accrued += elapsed;
      let steps = 0;
      while (accrued >= STEP && steps++ < 6) {
        tick();
        accrued -= STEP;
      }
    } else {
      accrued = 0;
    }
    if (document.visibilityState === "visible") sendBehavior(now);
    animationId = requestAnimationFrame(animate);
  }
  function point(event) { return { x: event.clientX, y: event.clientY }; }
  function down(event) {
    if (isKo || event.button !== 0 || !settings.enabled || settings.paused || !mascotDeployed) return;
    event.preventDefault();
    menu.hidden = true;
    const p = point(event);
    press = p;
    dragging = true;
    movedByUser = false;
    dragDelta = { x: p.x - x, y: p.y - y };
    pet.classList.add("drag");
    pet.setPointerCapture(event.pointerId);
    vy = 0;
  }
  function move(event) {
    if (!dragging) return;
    const p = point(event);
    movedByUser ||= Math.abs(p.x - press.x) + Math.abs(p.y - press.y) > 8;
    x = clamp(p.x - dragDelta.x, 0, maxX());
    y = clamp(p.y - dragDelta.y, 0, groundY());
    reposition();
    event.preventDefault();
  }
  function up(event) {
    if (!dragging) return;
    if (pet.hasPointerCapture(event.pointerId)) pet.releasePointerCapture(event.pointerId);
    dragging = false;
    pet.classList.remove("drag");
    vy = 0;
    state = "idle";
    frame = movedByUser ? 0 : 2;
    reactionUntil = movedByUser ? 0 : ticks + 52;
    nextDecision = ticks + (movedByUser ? 45 : 70);
    press = null;
    setSprite();
  }
  pet.addEventListener("pointerdown", down);
  pet.addEventListener("pointermove", move);
  pet.addEventListener("pointerup", up);
  pet.addEventListener("pointercancel", up);
  pet.addEventListener("contextmenu", event => {
    event.preventDefault();
    const left = clamp(event.clientX + 8, 0, window.innerWidth - 180);
    const top = clamp(event.clientY + 5, 0, window.innerHeight - 140);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.hidden = false;
  });
  menu.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "pause") {
      settings.paused = !settings.paused;
      chrome.storage.local.set({ paused: settings.paused });
    } else if (button.dataset.action === "reset") {
      reset();
    } else if (button.dataset.action === "hide") {
      hiddenForTab = true;
      applyVisibility();
    }
    menu.hidden = true;
  });
  document.addEventListener("pointerdown", event => {
    if (event.target !== host) menu.hidden = true;
  }, { passive: true });
  window.addEventListener("resize", () => {
    x = clamp(x, 0, maxX());
    y = clamp(y, 0, groundY());
    reposition();
  }, { passive: true });

  chrome.storage.local.get(defaults).then(result => {
    settings = { ...defaults, ...result };
    settings.speed = clamp(Number(settings.speed) || 1.5, 0.4, 5);
    settings.size = clamp(Number(settings.size) || 100, 40, 150);
    x = clamp(x, 0, maxX());
    y = clamp(y, 0, groundY());
    reposition();
    applyVisibility();
  }).catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const key of Object.keys(defaults)) {
      if (changes[key]) settings[key] = changes[key].newValue;
    }
    if (changes.resetRequest) reset();
    if (changes[statsKey]) acceptStats(changes[statsKey].newValue);
    if (changes[studyKey]) updateStudyVisibility(changes[studyKey].newValue);
    x = clamp(x, 0, maxX());
    y = clamp(y, 0, groundY());
    applyVisibility();
    reposition();
  });
  chrome.runtime.sendMessage({ type: "pet:read" })
    .then(response => { if (response?.stats) acceptStats(response.stats); })
    .catch(() => {});
  chrome.storage.local.get(studyKey).then(data=>{
    updateStudyVisibility(data[studyKey], true);
  }).catch(()=>{});
  // Guard against stale running state if the timer expires while the popup is closed.
  setInterval(()=>{
    chrome.storage.local.get(studyKey).then(data=>{
      updateStudyVisibility(data[studyKey]);
    }).catch(()=>{});
  },2000);
  renderBars();
  applyVisibility();
  reset();
  console.info("[Desktop Companion] Content script active; mascot created.");
  animationId = requestAnimationFrame(animate);
})();
