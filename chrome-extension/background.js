"use strict";
// Single source of truth for pet stats across every tab of this Chrome profile.
// Use local storage for durable cross-tab data, and a service worker to serialize changes.
const BASE = Object.freeze({ hp: 50, maxHp: 50, xp: 0, xpNext: 100, level: 1 });
const STORAGE_KEY = "petStatsV2";
let serialized = Promise.resolve();
let ownerTab = null;
let idleStartAt = 0;
let lastIdleReportAt = 0;
let drainedTicks = 0;
let activeOwnerTab = null;
let activeStartAt = 0;
let lastActiveReportAt = 0;
let healedTicks = 0;

const number = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
function normalized(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    hp: Math.max(0, Math.min(50, number(source.hp, 50))),
    maxHp: 50,
    xp: Math.max(0, number(source.xp, 0)),
    xpNext: Math.max(1, number(source.xpNext, 100)),
    level: Math.max(1, Math.floor(number(source.level, 1)))
  };
}
async function readStats() {
  const values = await chrome.storage.local.get(STORAGE_KEY);
  return normalized(values[STORAGE_KEY]);
}
async function writeStats(stats) {
  await chrome.storage.local.set({ [STORAGE_KEY]: normalized(stats) });
}
// One promise queue prevents lost HP updates when multiple tabs send messages.
function enqueue(task) {
  const next = serialized.then(task, task);
  serialized = next.catch(err => console.error('Pet stat update failed', err));
  return next;
}
function clearActivity() {
  activeOwnerTab = null;
  activeStartAt = 0;
  lastActiveReportAt = 0;
  healedTicks = 0;
}
function clearIdle() {
  ownerTab = null;
  idleStartAt = 0;
  lastIdleReportAt = 0;
  drainedTicks = 0;
}
async function isActiveTab(tabId) {
  const active = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return active.some(tab => tab.id === tabId);
}
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'pet:read') {
    enqueue(readStats).then(stats => sendResponse({ ok: true, stats }),
      e => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg.type === 'pet:restore') {
    enqueue(async () => {
      clearIdle();
      clearActivity();
      const stats = await readStats();
      stats.hp = stats.maxHp;
      await writeStats(stats);
      return stats;
    }).then(stats => sendResponse({ ok: true, stats }),
      e => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg.type !== 'pet:behavior') return;
  if (!sender.tab || sender.frameId !== 0) {
    sendResponse({ok:false}); return;
  }
  const tabId = sender.tab.id;
  // Only the active tab in the focused browser window can advance the health clock.
  enqueue(async () => {
    if (!(await isActiveTab(tabId))) {
      if (ownerTab === tabId) clearIdle();
      if (activeOwnerTab === tabId) clearActivity();
      return null;
    }
    const now = Date.now();
    const stats = await readStats();
    // A 0-HP mascot stays KO until restored explicitly in the popup.
    if (stats.hp <= 0) {
      clearIdle(); clearActivity();
      return stats;
    }
    // Only recent ongoing activity can establish an active streak.
    // Each activity report comes from the active, visible tab, at most once/second.
    if (msg.activity === true && msg.visible === true) {
      clearIdle();
      if (activeOwnerTab !== tabId || !activeStartAt || now - lastActiveReportAt > 2500) {
        activeOwnerTab = tabId;
        activeStartAt = now;
        healedTicks = 0;
      }
      lastActiveReportAt = now;
      // 5 seconds of activity, then +1 HP at 8s, 11s, 14s, ...
      const due = Math.max(0, Math.floor((now - activeStartAt - 5000) / 3000));
      const gain = Math.max(0, due - healedTicks);
      healedTicks = due;
      if (gain > 0 && stats.hp < stats.maxHp) {
        stats.hp = Math.min(stats.maxHp, stats.hp + gain);
        await writeStats(stats);
      }
      return stats;
    }
    clearActivity();
    if (msg.behavior !== 'idle' || !msg.visible) {
      clearIdle();
      return null;
    }
    if (ownerTab !== tabId || !idleStartAt || now - lastIdleReportAt > 2500) {
      ownerTab = tabId;
      idleStartAt = now;
      drainedTicks = 0;
    }
    lastIdleReportAt = now;
    // 15-second idle grace period, then -1 at 18s, 21s, 24s...
    const due = Math.max(0, Math.floor((now - idleStartAt - 15000) / 3000));
    const loss = Math.max(0, due - drainedTicks);
    drainedTicks = due;
    if (loss > 0) {
      stats.hp = Math.max(0, stats.hp - loss);
      await writeStats(stats);
    }
    return stats;
  }).then(stats => sendResponse({ok:true, stats}),
    e => sendResponse({ok:false,error:String(e)}));
  return true;
});

chrome.tabs.onActivated.addListener(() => { clearIdle(); clearActivity(); });
chrome.windows.onFocusChanged.addListener(() => { clearIdle(); clearActivity(); });
chrome.runtime.onInstalled.addListener(() => {
  enqueue(async () => {
    const saved = await chrome.storage.local.get(STORAGE_KEY);
    if (!saved[STORAGE_KEY]) await writeStats(BASE);
  });
});
