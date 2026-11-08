"use strict";

// Shared health, EXP, focus timer and task queue. All mutations are serialized.
const PET_KEY = "petStatsV2";    // retain existing saved health and experience
const STUDY_KEY = "studyBuddyV2"; // new version: a session can only run with a queued task
const TASK_LIMIT = 3;
const MAX_XP = 50;
const HP_MAX = 50;
const DEFAULT_MINUTES = 25;
const BASE_PET = {hp:50,maxHp:HP_MAX,xp:0,xpNext:MAX_XP,level:1,coins:0};
let serialized = Promise.resolve();
let idleOwner = null, idleSince = 0, idleReport = 0, idleTicks = 0;
let activeOwner = null, activeSince = 0, activeReport = 0, healedTicks = 0;

const finite = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const clamp = (v,a,b) => Math.min(b, Math.max(a,v));
function enqueue(task) {
  const p = serialized.then(task, task);
  serialized = p.catch(e => console.error("StudyBuddy update failed", e));
  return p;
}
function cleanPet(raw) {
  const x = raw && typeof raw === "object" ? raw : {};
  // Normalize old XP progress (formerly 100 per level) to the new 50-EXP cap.
  // Preserve accumulated EXP rather than wiping a previous save.
  const oldNext = finite(x.xpNext, MAX_XP);
  const oldLevel = Math.max(1, Math.floor(finite(x.level,1)));
  const oldXp = Math.max(0, finite(x.xp,0));
  // Older builds stored cumulative XP, newer builds store progress within a level.
  const total = oldNext > MAX_XP ? oldXp : (oldLevel-1)*MAX_XP + oldXp;
  return {hp:clamp(finite(x.hp,50),0,HP_MAX),maxHp:HP_MAX,
    xp:total % MAX_XP, xpNext:MAX_XP,level:Math.floor(total/MAX_XP)+1,
    coins:Math.max(0, Math.floor(finite(x.coins,0)))};
}
async function readPet() {
  const data = await chrome.storage.local.get(PET_KEY);
  return cleanPet(data[PET_KEY]);
}
async function writePet(pet) {
  const result = cleanPet(pet);
  await chrome.storage.local.set({[PET_KEY]:result});
  return result;
}
function grantXp(stats, amount) {
  // XP in storage is progress within the current level, not lifetime XP.
  const total = stats.xp + amount;
  const levelsGained = Math.floor(total / MAX_XP);
  stats.level += levelsGained;
  stats.coins = Math.max(0, Math.floor(finite(stats.coins,0))) + levelsGained;
  stats.xp = total % MAX_XP;
  stats.xpNext = MAX_XP;
  return stats;
}
function cleanTask(t) {
  if (!t || typeof t !== 'object') return null;
  const title = typeof t.title === 'string' ? t.title.trim().slice(0,120) : '';
  const minutes = Math.floor(finite(t.minutes,DEFAULT_MINUTES));
  if (!title || minutes < 1 || minutes > 240) return null;
  return {id:String(t.id || ''),title,minutes};
}
function cleanStudy(raw) {
  const x = raw && typeof raw === 'object' ? raw : {};
  const tasks = Array.isArray(x.tasks) ? x.tasks.map(cleanTask).filter(Boolean).slice(0,TASK_LIMIT) : [];
  const activeId = tasks.some(t=>t.id===x.activeId) ? x.activeId : (tasks[0]?.id ?? null);
  const active = tasks.find(t=>t.id===activeId);
  const sessionMs = active ? active.minutes*60000 : 0;
  const rem = clamp(finite(x.remainingMs,sessionMs),0,sessionMs);
  return {tasks,activeId,running:!!x.running && !!active && rem > 0,
    endAt:Math.max(0,finite(x.endAt,0)),remainingMs:rem,
    started:!!x.started && !!active,
    // Once a quest has begun, the mascot stays deployed while any tasks remain.
    // Migrate earlier saves that lack the deployed flag.
    mascotDeployed: tasks.length > 0 && (x.mascotDeployed === true ||
      (x.mascotDeployed == null && (x.started === true || x.running === true))),
    // Used only to trigger a fade after the final task is completed.
    lastFinishEmptiedAt: Math.max(0,finite(x.lastFinishEmptiedAt,0)),
    streak:Math.max(0,Math.floor(finite(x.streak,0)))};
}
async function readStudy() {
  const data=await chrome.storage.local.get(STUDY_KEY);
  return cleanStudy(data[STUDY_KEY]);
}
async function writeStudy(s) {
  const study=cleanStudy(s);
  await chrome.storage.local.set({[STUDY_KEY]:study});
  return study;
}
function clearHealthClocks() {
  idleOwner=null;idleSince=0;idleReport=0;idleTicks=0;
  activeOwner=null;activeSince=0;activeReport=0;healedTicks=0;
}
async function syncAlarm(study) {
  if(study.running && study.endAt > Date.now()) {
    await chrome.alarms.create('studyComplete',{when:study.endAt});
  } else {
    await chrome.alarms.clear('studyComplete');
  }
}
async function reconcile() {
  let study=await readStudy();
  let completedTimer=false;
  if(study.running && study.endAt <= Date.now()) {
    // Timer completed; task remains queued until Finished is explicitly clicked.
    study.running=false;
    study.endAt=0;
    study.remainingMs=0;
    study=await writeStudy(study);
    clearHealthClocks();
    completedTimer=true;
  }
  return {study,completedTimer};
}
function send(promise, callback) {
  promise.then(callback, e=>callback({ok:false,error:String(e)}));
  return true;
}
async function isForegroundTab(tabId) {
  const tabs=await chrome.tabs.query({active:true,lastFocusedWindow:true});
  return tabs.some(t=>t.id===tabId);
}

chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
  if(!msg || typeof msg !== 'object') return;
  if(msg.type==='study:read' || msg.type==='pet:read') {
    return send(enqueue(async()=>{
      const {study,completedTimer}=await reconcile();
      return {ok:true,study,stats:await readPet(),completedTimer};
    }),reply);
  }
  if(msg.type==='pet:restore') {
    return send(enqueue(async()=>{
      const pet=await readPet();
      pet.hp=pet.maxHp;
      clearHealthClocks();
      return {ok:true,stats:await writePet(pet)};
    }),reply);
  }
  if(msg.type==='study:add' || msg.type==='study:remove' || msg.type==='study:start' ||
     msg.type==='study:pause' || msg.type==='study:finish' || msg.type==='study:reorder') {
    return send(enqueue(async()=>{
      let {study}=await reconcile();
      let stats=await readPet();
      let success=true, error='',finished=false;
      if(msg.type==='study:add') {
        const title=String(msg.title || '').trim().slice(0,120);
        const minutes=Math.floor(Number(msg.minutes));
        if(study.tasks.length>=TASK_LIMIT) {success=false;error='The queue is full (3 tasks).';}
        else if(!title || !Number.isFinite(minutes) || minutes<1 || minutes>240) {
          success=false;error='Enter a task and a duration from 1 to 240 minutes.';
        } else {
          const id=crypto.randomUUID();
          const item={id,title,minutes};
          study.tasks.push(item);
          if(!study.activeId){study.activeId=id;study.remainingMs=minutes*60000;study.started=false;}
        }
      } else if(msg.type==='study:reorder') {
        const ids = Array.isArray(msg.ids) ? msg.ids.map(String) : [];
        const existingIds = study.tasks.map(task => task.id);
        const valid = ids.length === existingIds.length
          && new Set(ids).size === ids.length
          && ids.every(id => existingIds.includes(id));
        if (!valid) {
          success=false; error='Invalid task order.';
        } else if (study.started && ids[0] !== study.activeId) {
          // A started or paused quest keeps its timer and first place.
          success=false; error='Finish or remove the current quest before moving it.';
        } else {
          const taskById = new Map(study.tasks.map(task => [task.id, task]));
          study.tasks = ids.map(id => taskById.get(id));
          if (!study.started) {
            study.activeId = study.tasks[0]?.id ?? null;
            study.remainingMs = (study.tasks[0]?.minutes ?? 0)*60000;
          }
        }
      } else if(msg.type==='study:remove') {
        const taskId=String(msg.id||'');
        if(study.running && study.activeId===taskId){success=false;error='Pause this task before removing it.';}
        else {
          const before=study.tasks.length;
          study.tasks=study.tasks.filter(t=>t.id!==taskId);
          if(before===study.tasks.length){success=false;error='Task not found.';}
          if(study.activeId===taskId){
            study.activeId=study.tasks[0]?.id??null;
            study.remainingMs=(study.tasks[0]?.minutes??0)*60000;
            study.started=false;
          }
          if(study.tasks.length===0) study.mascotDeployed=false;
        }
      } else if(msg.type==='study:start') {
        const current=study.tasks.find(t=>t.id===study.activeId);
        if(!current){success=false;error='Add a task first.';}
        else if(!study.running) {
          if(study.remainingMs<=0) study.remainingMs=current.minutes*60000;
          study.running=true;
          study.started=true;
          study.mascotDeployed=true;
          study.endAt=Date.now()+study.remainingMs;
          clearHealthClocks();
        }
      } else if(msg.type==='study:pause') {
        if(study.running){
          study.remainingMs=Math.max(0,study.endAt-Date.now());
          study.running=false;study.endAt=0;
          clearHealthClocks();
        }
      } else if(msg.type==='study:finish') {
        const current=study.tasks.find(t=>t.id===study.activeId);
        if(!current){success=false;error='No task to finish.';}
        else if(!study.started || (!study.running && study.remainingMs>0)) {
          success=false;error='Start your quest before marking it Finished.';
        } else {
          study.tasks=study.tasks.filter(t=>t.id!==current.id);
          study.activeId=study.tasks[0]?.id??null;
          study.remainingMs=(study.tasks[0]?.minutes??0)*60000;
          study.started=false;
          study.running=false;study.endAt=0;
          study.streak+=1;
          // Keep the existing mascot on screen between queued quests.
          // Only completing the final quest ends its visit.
          if(study.tasks.length===0){
            study.mascotDeployed=false;
            study.lastFinishEmptiedAt=Date.now();
          }
          stats=await writePet(grantXp(stats,25));
          clearHealthClocks();
          finished=true;
        }
      }
      if(success){study=await writeStudy(study);await syncAlarm(study);}
      return {ok:success,error,study,stats,finished};
    }),reply);
  }
  if(msg.type==='pet:behavior'){
    if(!sender.tab || sender.frameId!==0){reply({ok:false});return;}
    return send(enqueue(async()=>{
      const {study}=await reconcile();
      // Authoritative gate: even queued reports cannot alter HP when paused/finished.
      if(!study.running){clearHealthClocks();return {ok:true};}
      const tabId=sender.tab.id;
      if(!(await isForegroundTab(tabId)) || msg.visible!==true){
        if(idleOwner===tabId || activeOwner===tabId)clearHealthClocks();
        return {ok:true};
      }
      const stats=await readPet();
      if(stats.hp<=0){clearHealthClocks();return {ok:true,stats};}
      const now=Date.now();
      if(msg.activity===true){
        idleOwner=null;idleSince=0;idleReport=0;idleTicks=0;
        if(activeOwner!==tabId || !activeSince || now-activeReport>2500){
          activeOwner=tabId;activeSince=now;healedTicks=0;
        }
        activeReport=now;
        const due=Math.max(0,Math.floor((now-activeSince-5000)/3000));
        const gain=Math.max(0,due-healedTicks);healedTicks=due;
        if(gain && stats.hp<stats.maxHp){stats.hp=Math.min(stats.maxHp,stats.hp+gain);await writePet(stats);}
      } else {
        activeOwner=null;activeSince=0;activeReport=0;healedTicks=0;
        if(msg.behavior!=='idle'){idleOwner=null;idleSince=0;idleReport=0;idleTicks=0;return {ok:true};}
        if(idleOwner!==tabId || !idleSince || now-idleReport>2500){idleOwner=tabId;idleSince=now;idleTicks=0;}
        idleReport=now;
        const due=Math.max(0,Math.floor((now-idleSince-15000)/3000));
        const loss=Math.max(0,due-idleTicks);idleTicks=due;
        if(loss){stats.hp=Math.max(0,stats.hp-loss*2);await writePet(stats);}
      }
      return {ok:true,stats};
    }),reply);
  }
});

chrome.tabs.onActivated.addListener(clearHealthClocks);
chrome.windows.onFocusChanged.addListener(clearHealthClocks);
chrome.alarms.onAlarm.addListener(alarm=>{
  if(alarm.name==='studyComplete') enqueue(reconcile).catch(console.error);
});
chrome.runtime.onInstalled.addListener(()=>{
  enqueue(async()=>{
    const data=await chrome.storage.local.get([PET_KEY,STUDY_KEY]);
    if(!data[PET_KEY])await writePet(BASE_PET);
    if(!data[STUDY_KEY])await writeStudy({tasks:[],activeId:null,remainingMs:0,running:false,endAt:0,streak:0});
  });
});
