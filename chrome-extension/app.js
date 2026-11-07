"use strict";
const $ = id => document.getElementById(id);
const defaults = {enabled:true, paused:false, speed:1.5, size:100};
const SESSION_MS = 25*60*1000;
let currentStats = {hp:50,maxHp:50,xp:0,xpNext:50,level:1};
let study = {tasks:[],activeId:null,remainingMs:SESSION_MS,running:false,endAt:0,streak:0};
let mascotFrame = 0;
let settingsOpen = false;
let completedNotice = false;
const send = (type, extra={}) => chrome.runtime.sendMessage({type,...extra});
function renderSettings() {
  $('speedVal').textContent = Number($('speed').value).toFixed(1);
  $('sizeVal').textContent = `${$('size').value}%`;
}
function setSettingsView(open) {
  settingsOpen = open;
  $('dashboard').hidden = open;
  $('settings-panel').hidden = !open;
  $('settings-toggle').setAttribute('aria-expanded',String(open));
  $('settings-toggle').title = open ? 'Back to dashboard' : 'Settings';
  $('settings-toggle').setAttribute('aria-label',open ? 'Back to dashboard' : 'Open settings');
}
$('settings-toggle').addEventListener('click',()=>setSettingsView(!settingsOpen));
$('back-to-dashboard').addEventListener('click',()=>setSettingsView(false));
chrome.storage.local.get(defaults).then(saved=>{
  for(const key of Object.keys(defaults)) {
    const control=$(key);
    if (control.type==='checkbox') control.checked=Boolean(saved[key]);
    else control.value=saved[key];
  }
  renderSettings();
});
for (const key of Object.keys(defaults)) {
  const control = $(key);
  control.addEventListener(control.type==='checkbox'?'change':'input',()=>{
    const value=control.type==='checkbox'?control.checked:Number(control.value);
    chrome.storage.local.set({[key]:value});
    renderSettings();
  });
}
$('reset').addEventListener('click',()=>chrome.storage.local.set({resetRequest:Date.now()}));
$('showNow').addEventListener('click', async()=>{
  await chrome.storage.local.set({enabled:true,paused:false,resetRequest:Date.now()});
  $('enabled').checked=true; $('paused').checked=false;
});
$('restoreHp').addEventListener('click',async()=>{
  const result=await send('pet:restore').catch(()=>null);
  if (result?.stats) renderPet(result.stats);
});
function renderPet(stats) {
  currentStats=stats;
  $('hp-fill').style.width=`${100*Math.max(0,stats.hp)/Math.max(stats.maxHp,1)}%`;
  $('pet-condition').textContent=stats.hp<=0?'KO':stats.hp<15?'LOW':'HEALTHY';
  $('mood').textContent=stats.hp<=0?'KO':study.running?'FOCUSED':'READY';
  $('xp-fill').style.width=`${100*Math.max(0,stats.xp)/50}%`;
  $('level-label').textContent=`LEVEL ${stats.level}`;
  if(stats.hp<=0) $('mascot-preview').src='sprites/dead_0.png';
}
function renderQueue(){
  const list=$('task-list');list.replaceChildren();
  $('queue-count').textContent=`${study.tasks.length} / 3`;
  $('add-task').disabled=study.tasks.length>=3;
  if(!study.tasks.length){
    const item=document.createElement('li');item.className='empty-queue';
    item.textContent='Your quest list is empty. Add up to 3 tasks.';list.append(item);
    return;
  }
  study.tasks.forEach((task,i)=>{
    const li=document.createElement('li');
    if(task.id===study.activeId)li.classList.add('current');
    const num=document.createElement('span');num.className='task-number';num.textContent=`${String(i+1).padStart(2,'0')}`;
    const details=document.createElement('span');details.className='task-details';
    const title=document.createElement('strong');title.textContent=task.title;
    const duration=document.createElement('small');duration.textContent=`${task.minutes} min${task.id===study.activeId?' • CURRENT':''}`;
    details.append(title,duration);
    const remove=document.createElement('button');remove.type='button';remove.className='task-remove';
    remove.textContent='×';remove.title=`Remove ${task.title}`;remove.setAttribute('aria-label',`Remove ${task.title}`);
    remove.disabled=study.running && task.id===study.activeId;
    remove.addEventListener('click',()=>action('study:remove',{id:task.id}));
    li.append(num,details,remove);list.append(li);
  });
}
function renderStudy(s) {
  study={...study,...s};
  const task=study.tasks.find(t=>t.id===study.activeId);
  const duration=(task?.minutes||25)*60000;
  const remaining=study.running?Math.max(0,study.endAt-Date.now()):Math.max(0,study.remainingMs);
  const seconds=Math.ceil(remaining/1000);
  $('timer').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  $('progress').style.width=`${Math.max(0,Math.min(100,100*(1-remaining/duration)))}%`;
  $('quest-name').textContent=task?.title||'Add a task to begin';
  $('session-label').textContent=`${task?.minutes||25} MIN FOCUS SESSION`;
  $('streak').textContent=`STREAK ${String(study.streak).padStart(2,'0')}`;
  $('status-chip').textContent=study.running?'LOCKED IN':task&&remaining===0?'TIME UP':task&&remaining<duration?'PAUSED':'READY';
  $('status-chip').classList.toggle('active',study.running);
  $('mood').textContent=currentStats.hp<=0?'KO':study.running?'FOCUSED':'READY';
  $('start').disabled=study.running||!task;
  $('pause').disabled=!study.running;
  $('finish').disabled=!task||!study.started||(!study.running&&remaining>0);
  renderQueue();
}
async function action(type,extra={}){
  const result=await send(type,extra).catch(error=>{console.error(error);return null;});
  if(!result?.ok){$('queue-message').textContent=result?.error||'Unable to update quest.';return;}
  $('queue-message').textContent='';
  if(result.stats)renderPet(result.stats);
  if(result.study)renderStudy(result.study);
  if(result.finished)addMessage('Buddy','Quest finished! You earned +25 EXP. Your next task is ready.');
}
$('start').addEventListener('click',()=>action('study:start'));
$('pause').addEventListener('click',()=>action('study:pause'));
$('finish').addEventListener('click',()=>action('study:finish'));
$('task-form').addEventListener('submit',event=>{
  event.preventDefault();
  const title=$('task-title').value.trim();
  const minutes=Number($('task-minutes').value);
  if(!title)return;
  action('study:add',{title,minutes}).then(()=>{
    if(!$('queue-message').textContent)$('task-title').value='';
  });
});
function addMessage(author,text,classname='') {
  const p=document.createElement('p');p.className=classname;
  const b=document.createElement('b');b.textContent=author;
  p.append(b,document.createTextNode(` ${text}`));
  $('chat-log').append(p);
  $('chat-log').scrollTop=$('chat-log').scrollHeight;
}
function respond(text){
  const lower=text.toLowerCase();
  if(lower.includes('plan')) return 'Try 20 minutes reading, 5 minutes recall, then a short break.';
  if(lower.includes('tired')||lower.includes('break'))return 'A short rest, water, and a stretch may help you refocus.';
  if(lower.includes('study')||lower.includes('focus'))return 'Choose one specific task. Start the timer, then work on that task only.';
  return 'Pick one small next step and give it a try.';
}
$('chat-form').addEventListener('submit',event=>{
  event.preventDefault();const text=$('chat-input').value.trim();if(!text)return;
  addMessage('You',text,'you');$('chat-input').value='';addMessage('Buddy',respond(text));
});
document.addEventListener('keydown',event=>{
  if(event.code!=='Space'||event.target.closest('input,button,textarea')||settingsOpen)return;
  event.preventDefault();action(study.running?'study:pause':'study:start');
});
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area!=='local')return;
  if(changes.petStatsV2)renderPet(changes.petStatsV2.newValue);
  if(changes.studyBuddyV2)renderStudy(changes.studyBuddyV2.newValue);
});
async function refresh(){
  const result=await send('study:read').catch(()=>null);
  if(result?.stats)renderPet(result.stats);
  if(result?.study)renderStudy(result.study);
  if(result?.completedTimer&&!completedNotice){completedNotice=true;addMessage('Buddy','Time is up! You lost 10 HP and your focus streak reset. Start the task again when you are ready.');}
}
refresh();
setInterval(()=>{
  renderStudy(study);
  if(study.running&&study.endAt<=Date.now())refresh();
},1000);
setInterval(()=>{
  if(currentStats.hp>0&&!settingsOpen){
    mascotFrame=(mascotFrame+1)%4;
    $('mascot-preview').src=`sprites/idle_${mascotFrame}.png`;
  }
},210);
