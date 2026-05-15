const KEY='brivviant_channels_platform_v5_same_ui_github_sync';
const CONFIG = window.BRIVVIANT_CONFIG || {};
let remoteSha = null;
let state = JSON.parse(localStorage.getItem(KEY)||'null') || {
  channels: SEED_DATA.channels,
  people: SEED_DATA.people,
  statuses: SEED_DATA.statuses,
  tasks: [],
  uploads: [],
  logs: []
};
state.people = state.people || SEED_DATA.people || [];
state.statuses = state.statuses || SEED_DATA.statuses || [];
state.tasks = state.tasks || [];
state.uploads = state.uploads || [];
state.logs = state.logs || [];
state.users = Array.isArray(state.users) ? state.users : [];
state.notifications = Array.isArray(state.notifications) ? state.notifications : [];
state.chats = Array.isArray(state.chats) ? state.chats : [];
const DEFAULT_ADMIN = { name:'Brivviant', username:'Brivviant', password:'Brivviant@123456', role:'admin', isActive:true };
const roleLabel=r=>(r==='admin'?'Admin':'Staff');
const normalizeRole=r=>(String(r||'standard').toLowerCase()==='admin'?'admin':'standard');
function generatePassword(len=10){ const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#'; let out=''; for(let i=0;i<len;i++) out+=chars[Math.floor(Math.random()*chars.length)]; return out; }
const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
const today=()=>new Date().toISOString().slice(0,10);
const monthNow=()=>new Date().toISOString().slice(0,7);
const isDone=t=>t && t.status==='تم التسليم';
const isLate=t=>!!t?.due && t.due < today() && !isDone(t);
const isDueToday=t=>!!t?.due && t.due === today() && !isDone(t);
const isArchived=t=>!!t?.archivedFromTasks;
const activeTasks=()=>state.tasks.filter(t=>!isArchived(t));
const safe=v=>String(v??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[m]));
const safeAttr=safe;
const AUTH_KEY = 'brivviant_auth_session_v2';
function personName(p){ return typeof p === 'string' ? p : (p?.name || p?.username || ''); }
function getPeopleNames(){ return (state.people||[]).map(personName).filter(Boolean); }
function getUserByName(name){ const n=normalizeUsers(state.users); const idx=n.findIndex(u=>u.name===name || u.username===name); if(idx<0) return null; const real=(state.users||[]).find(u=>(u.name||u.username)===(n[idx].name||n[idx].username)); return real || n[idx]; }
function getSession(){ try { return JSON.parse(localStorage.getItem(AUTH_KEY)||'null'); } catch(e){ return null; } }
function setSession(s){ localStorage.setItem(AUTH_KEY, JSON.stringify(s)); }
function clearSession(){ localStorage.removeItem(AUTH_KEY); }
function currentSession(){ return getSession(); }
function currentUser(){ const ss=currentSession(); return ss ? normalizeUsers(state.users).find(u=>u.username===ss.username) || ss : null; }
function isAdmin(){ return (currentUser()?.role || currentSession()?.role) === 'admin'; }

function adminUsers(){ return normalizeUsers(state.users).filter(u=>u.role==='admin' && u.isActive!==false); }
function getUserNamesExceptMe(){ const me=currentUser(); return normalizeUsers(state.users).filter(u=>u.isActive!==false && u.name!==me?.name).map(u=>u.name); }
function notifyUser(to, type, title, body='', taskId=''){
  if(!to) return;
  state.notifications = Array.isArray(state.notifications) ? state.notifications : [];
  state.notifications.unshift({id:crypto.randomUUID?.()||String(Date.now()+Math.random()),to,type,title,body,taskId,read:false,createdAt:new Date().toISOString(),createdAtText:new Date().toLocaleString('ar-EG')});
  state.notifications = state.notifications.slice(0,500);
  localSave();
  renderNotifications?.();
}
function notifyAdmins(type,title,body='',taskId=''){
  adminUsers().forEach(u=>notifyUser(u.name,type,title,body,taskId));
}
function myNotifications(){ const me=currentUser(); if(!me) return []; return (state.notifications||[]).filter(n=>n.to===me.name || n.to===me.username); }
function unreadNotifications(){ return myNotifications().filter(n=>!n.read); }
function renderNotifications(){
  const count=unreadNotifications().length;
  const badge=$('#notifBadge'); if(badge){ badge.textContent=count; badge.classList.toggle('hidden',!count); }
  const list=$('#notificationsList'); if(!list) return;
  const arr=myNotifications();
  list.innerHTML=arr.length?arr.map(n=>{
    const t=n.taskId ? state.tasks.find(x=>x.id===n.taskId) : null;
    const issueBtn=(t && t.issue && t.issue.status!=='resolved') ? `<button class="notification-issue-btn" data-action="open-issue" data-id="${safeAttr(t.id)}" title="عرض مشكلة Rise Hand">✋</button>` : '';
    return `<div class="notification-card ${n.read?'read':''}"><div class="notification-row"><div><b>${safe(n.title||'إشعار')}</b><small>${safe(n.createdAtText||'')}</small></div>${issueBtn}</div><p>${safe(n.body||'')}</p>${n.taskId?`<button data-action="open-notification-task" data-id="${safeAttr(n.taskId)}">فتح التاسك</button>`:''}</div>`;
  }).join(''):'<div class="panel">لا توجد إشعارات.</div>';
}
function openNotifications(){ (state.notifications||[]).forEach(n=>{ const me=currentUser(); if(me && (n.to===me.name || n.to===me.username)) n.read=true; }); localSave(); renderNotifications(); $('#notificationDialog')?.showModal(); }
function chatUnreadCount(){ const me=currentUser(); if(!me) return 0; return (state.chats||[]).filter(m=>m.to===me.name && !m.read).length; }
function renderChatBadge(){ const b=$('#chatBadge'); if(!b) return; const c=chatUnreadCount(); b.textContent=c; b.classList.toggle('hidden',!c); }
let activeChatWith='';
function chatBetween(name){ const me=currentUser(); if(!me || !name) return []; return (state.chats||[]).filter(m=>(m.from===me.name&&m.to===name)||(m.from===name&&m.to===me.name)).sort((a,b)=>(a.createdAt||'').localeCompare(b.createdAt||'')); }
function renderChat(){
  const me=currentUser(); if(!me) return;
  const users=normalizeUsers(state.users).filter(u=>u.isActive!==false && u.name!==me.name);
  $('#chatUsers').innerHTML=users.map(u=>{const unread=(state.chats||[]).filter(m=>m.from===u.name&&m.to===me.name&&!m.read).length;return `<button class="chat-user ${activeChatWith===u.name?'active':''}" data-action="select-chat" data-name="${safeAttr(u.name)}"><span>${safe(u.nickname||u.name)}</span>${unread?`<em>${unread}</em>`:''}</button>`}).join('')||'<div class="panel">لا توجد حسابات.</div>';
  $('#chatRoomTitle').textContent=activeChatWith?`محادثة مع ${activeChatWith}`:'اختر حساب للمحادثة';
  if(activeChatWith){ (state.chats||[]).forEach(m=>{ if(m.from===activeChatWith && m.to===me.name) m.read=true; }); localSave(); }
  const msgs=activeChatWith?chatBetween(activeChatWith):[];
  $('#chatMessages').innerHTML=msgs.map(m=>`<div class="chat-msg ${m.from===me.name?'mine':'theirs'}"><b>${safe(m.from)}</b><p>${safe(m.text)}</p><small>${safe(m.createdAtText||'')}</small></div>`).join('') || '<div class="muted chat-empty">لا توجد رسائل بعد.</div>';
  renderChatBadge();
}
function openChat(){ renderChat(); $('#chatDialog')?.showModal(); }
async function sendChat(){ const me=currentUser(); const text=($('#chatInput')?.value||'').trim(); if(!me || !activeChatWith || !text) return; state.chats=Array.isArray(state.chats)?state.chats:[]; const msg={id:crypto.randomUUID?.()||String(Date.now()+Math.random()),from:me.name,to:activeChatWith,text,read:false,createdAt:new Date().toISOString(),createdAtText:new Date().toLocaleString('ar-EG')}; state.chats.push(msg); $('#chatInput').value=''; notifyUser(activeChatWith,'CHAT','رسالة شات جديدة',`${me.name}: ${text}`,''); await logAction('CHAT_MESSAGE',`رسالة شات من ${me.name} إلى ${activeChatWith}`,activeChatWith); await save(); renderChat(); }
function userCanHandover(t){ const me=currentUser(); return !!t && (isAdmin() || t.owner===me?.name); }
function userCanRaiseIssue(t){ const me=currentUser(); return !!t && (isAdmin() || t.owner===me?.name); }

function canEditDelayReason(t){
  if(!t || !isLate(t)) return false;
  const me=currentUser() || currentSession() || {};
  const owner=String(t.owner||'').trim().toLowerCase();
  const names=[me.name, me.username, me.nickname, me.email].filter(Boolean).map(v=>String(v).trim().toLowerCase());
  return !!owner && names.includes(owner);
}
function nowIso(){ return new Date().toISOString(); }
function nowText(){ return new Date().toLocaleString('ar-EG', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}); }
function getActorSnapshot(fallback={}){
  const me=currentUser() || currentSession() || fallback || {};
  return {
    actorName: me.name || fallback.name || fallback.username || 'Unknown',
    actorUsername: me.username || fallback.username || '',
    actorRole: me.role || fallback.role || 'unknown'
  };
}
async function logAction(action, details='', target='', fallbackActor={}){
  try{
    state.logs = Array.isArray(state.logs) ? state.logs : [];
    const actor=getActorSnapshot(fallbackActor);
    const item={
      id: (crypto.randomUUID?.() || String(Date.now()+Math.random())),
      action,
      details: String(details||''),
      target: String(target||''),
      actorName: actor.actorName,
      actorUsername: actor.actorUsername,
      actorRole: actor.actorRole,
      createdAt: nowIso(),
      createdAtText: nowText()
    };
    state.logs=[item, ...state.logs].slice(0,1000);
    localSave();
    renderLogs?.();
    if(hasGithubConfig()){
      apiPost('activity_logs', uiLogToDb(item), 'return=minimal').catch(()=>{});
    }
    return item;
  }catch(e){ console.warn('logAction failed', e); }
}
function dbLogToUi(l){
  return {id:l.id, action:l.action||'', details:l.details||'', target:l.target||'', actorName:l.actor_name||'', actorUsername:l.actor_username||'', actorRole:l.actor_role||'', createdAt:l.created_at||'', createdAtText:l.created_at?new Date(l.created_at).toLocaleString('ar-EG',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}):''};
}
function uiLogToDb(l){
  return {id:l.id, action:l.action||'', details:l.details||'', target:l.target||'', actor_name:l.actorName||'', actor_username:l.actorUsername||'', actor_role:l.actorRole||'', created_at:l.createdAt||new Date().toISOString()};
}
async function hashPassword(password){ return String(password||''); }
async function ensureDefaultAdmin(){
  state.users = Array.isArray(state.users) ? state.users : [];
state.notifications = Array.isArray(state.notifications) ? state.notifications : [];
state.chats = Array.isArray(state.chats) ? state.chats : [];
  let admin = state.users.find(u=>u.username===DEFAULT_ADMIN.username || u.name===DEFAULT_ADMIN.name);
  if(!admin){
    admin = {...DEFAULT_ADMIN, id:crypto.randomUUID?.()||String(Date.now()), nickname:'Main Admin', email:'', role:'admin', password:DEFAULT_ADMIN.password};
    state.users.push(admin);
  }
  admin.name = admin.name || DEFAULT_ADMIN.name;
  admin.username = DEFAULT_ADMIN.username;
  admin.password = admin.password || admin.passwordHash || admin.password_hash || DEFAULT_ADMIN.password;
  admin.role = 'admin';
  admin.isActive = true;
  delete admin.passwordHash; delete admin.password_hash;
  state.people = getPeopleNames();
  if(!state.people.includes(admin.name)) state.people.unshift(admin.name);
  localSave();
}
function normalizeUsers(users){
  return (Array.isArray(users)?users:[]).map(u=>({
    id:u.id||crypto.randomUUID?.()||String(Date.now()+Math.random()),
    name:u.name||u.full_name||u.username||'',
    username:u.username||u.name||'',
    password:u.password||u.password_plain||u.passwordHash||u.password_hash||'',
    nickname:u.nickname||u.nick_name||u.name||u.username||'',
    email:u.email||'',
    avatar:u.avatar||u.profile_image||u.profileImage||'',
    role:normalizeRole(u.role),
    isActive:u.isActive!==false && u.is_active!==false,
    createdAt:u.createdAt||u.created_at||new Date().toISOString()
  })).filter(u=>u.name && u.username);
}
function syncPeopleFromUsers(){
  const userNames=normalizeUsers(state.users).filter(u=>u.isActive).map(u=>u.name);
  const oldNames=getPeopleNames();
  state.people=[...new Set([...userNames,...oldNames])];
}
function setSync(msg){ const el=$('#syncState'); if(el) el.textContent=msg; }
function localSave(){ localStorage.setItem(KEY,JSON.stringify(state)); }

function hasGithubConfig(){ return !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY); }
function apiBase(){ return CONFIG.SUPABASE_URL.replace(/\/$/,'') + '/rest/v1/'; }
function apiHeaders(extra={}){
  return Object.assign({
    'apikey': CONFIG.SUPABASE_ANON_KEY,
    'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }, extra || {});
}
async function apiGet(table, query=''){
  const res=await fetch(apiBase()+table+query,{headers:apiHeaders(),cache:'no-store'});
  if(!res.ok) throw new Error(table+' GET '+res.status+': '+await res.text());
  return await res.json();
}
async function apiPost(table, payload, prefer='return=representation'){
  const res=await fetch(apiBase()+table,{method:'POST',headers:apiHeaders({'Prefer':prefer}),body:JSON.stringify(payload)});
  if(!res.ok) throw new Error(table+' POST '+res.status+': '+await res.text());
  return await res.json().catch(()=>[]);
}

async function apiUpsertPeople(payload){
  const res=await fetch(apiBase()+'people?on_conflict=name',{
    method:'POST',
    headers:apiHeaders({'Prefer':'resolution=merge-duplicates,return=representation'}),
    body:JSON.stringify(payload)
  });
  if(!res.ok) throw new Error('people UPSERT '+res.status+': '+await res.text());
  return await res.json().catch(()=>[]);
}
async function apiDeleteAll(table){
  const res=await fetch(apiBase()+table+'?id=not.is.null',{method:'DELETE',headers:apiHeaders()});
  if(!res.ok) throw new Error(table+' DELETE '+res.status+': '+await res.text());
}
async function initOnline(){
  if(!hasGithubConfig()){ setSync('Local Ready — Supabase Config Missing'); renderAll(); return; }
  setSync('Loading Supabase Tables...');
  await loadOnline();
}
async function loadOnline(){
  if(!hasGithubConfig()) return;
  try{
    await seedBaseTables();
    const channels=await apiGet('channels','?select=*&order=sort_order.asc');
    const programs=await apiGet('programs','?select=*&order=sort_order.asc');
    const people=await apiGet('people','?select=*&is_active=eq.true&order=name.asc');
    const statuses=await apiGet('statuses','?select=*&order=sort_order.asc');
    const tasks=await apiGet('tasks','?select=*&order=due.asc');
    const uploads=await apiGet('uploads','?select=*&order=created_at.desc');
    let logs=[];
    try{ logs=await apiGet('activity_logs','?select=*&order=created_at.desc&limit=500'); }catch(logErr){ console.warn('activity_logs table not ready', logErr); }
    state.channels=channels.map(c=>({id:c.id,name:c.name,programs:programs.filter(p=>p.channel_id===c.id).map(p=>p.name)}));
    state.users=normalizeUsers(people.map(p=>({id:p.id,name:p.name,username:p.username||p.name,password:p.password||p.password_plain||p.password_hash||'',nickname:p.nickname||p.name,email:p.email||'',avatar:p.profile_image||p.avatar||'',role:p.role||'standard',isActive:p.is_active,createdAt:p.created_at})));
    state.people=people.map(p=>p.name);
    state.statuses=statuses.map(s=>s.name);
    state.tasks=tasks.map(dbTaskToUi);
    state.uploads=uploads.map(dbUploadToUi);
    state.logs=logs.map(dbLogToUi);
    localSave();
    setSync('Loaded From Supabase Tables');
    renderAll();
  }catch(e){
    console.error(e);
    setSync('Supabase Load Failed — Local Mode');
    alert('فشل تحميل Supabase Tables:\n'+e.message);
    renderAll();
  }
}
async function seedBaseTables(){
  const ch=await apiGet('channels','?select=id&limit=1');
  if(!ch.length){
    const channels=SEED_DATA.channels.map((c,i)=>({id:c.id,name:c.name,sort_order:i+1}));
    await apiPost('channels',channels,'resolution=merge-duplicates,return=representation');
    const programs=[];
    SEED_DATA.channels.forEach((c)=>c.programs.forEach((p,i)=>programs.push({channel_id:c.id,name:p,sort_order:i+1})));
    await apiPost('programs',programs,'resolution=merge-duplicates,return=representation');
  }
  const pe=await apiGet('people','?select=id&limit=1');
  if(!pe.length){
    await apiUpsertPeople([{name:'Brivviant',username:'Brivviant',password:DEFAULT_ADMIN.password,nickname:'Main Admin',email:'',role:'admin',profile_image:'',is_active:true}, ...SEED_DATA.people.map(name=>({name:name,username:name,password:generatePassword(),nickname:name,email:'',role:'standard',profile_image:'',is_active:true}))]);
  }
  const st=await apiGet('statuses','?select=id&limit=1');
  if(!st.length) await apiPost('statuses',SEED_DATA.statuses.map((name,i)=>({name,sort_order:i+1})),'resolution=merge-duplicates,return=representation');
}
async function saveOnline(){
  if(!hasGithubConfig()){ setSync('Local Saved — Supabase Config Missing'); return; }
  try{
    setSync('Saving To Supabase Tables...');
    const current=normalizeState(state);

    await syncPeople(current.people);
    await apiDeleteAll('uploads');
    await apiDeleteAll('tasks');

    const taskRows=current.tasks.map(uiTaskToDb);
    if(taskRows.length) await apiPost('tasks',taskRows,'return=representation');
    const uploadRows=current.uploads.map(uiUploadToDb);
    if(uploadRows.length) await apiPost('uploads',uploadRows,'return=representation');

    setSync('Saved To Supabase Tables');
  }catch(e){
    console.error(e);
    setSync('Supabase Save Failed — Local Saved');
    alert('الحفظ في Supabase Tables فشل:\n'+e.message);
  }
}
async function syncPeople(names){
  const existing=await apiGet('people','?select=*');
  const users=normalizeUsers(state.users);
  const activeNames=[...new Set([...names, ...users.filter(u=>u.isActive).map(u=>u.name)])];
  for(const p of existing){
    if(!activeNames.includes(p.name)){
      await fetch(apiBase()+'people?id=eq.'+encodeURIComponent(p.id),{method:'PATCH',headers:apiHeaders(),body:JSON.stringify({is_active:false})});
    }
  }
  for(const name of activeNames){
    const u=users.find(x=>x.name===name) || {name, username:name, password:generatePassword(), nickname:name, email:'', role:'standard', isActive:true};
    await apiUpsertPeople([{name:u.name,username:u.username,password:u.password||'',nickname:u.nickname||u.name,email:u.email||'',role:u.role||'standard',profile_image:u.avatar||'',is_active:u.isActive!==false}]);
  }
}
async function save(){ localSave(); renderAll(); await saveOnline(); }

function normalizeState(s){
  s=s||{};
  const out = {channels:Array.isArray(s.channels)?s.channels:SEED_DATA.channels,people:Array.isArray(s.people)?s.people:SEED_DATA.people,statuses:Array.isArray(s.statuses)?s.statuses:SEED_DATA.statuses,tasks:Array.isArray(s.tasks)?s.tasks:[],uploads:Array.isArray(s.uploads)?s.uploads:[],logs:Array.isArray(s.logs)?s.logs:[],notifications:Array.isArray(s.notifications)?s.notifications:[],chats:Array.isArray(s.chats)?s.chats:[],users:normalizeUsers(s.users)};
  out.people=out.people.map(personName).filter(Boolean);
  return out;
}
function dbTaskToUi(t){
  return {id:t.id,channel:t.channel_name||'',program:t.program_name||'',episodeName:t.episode_name||'',episodeNumber:t.episode_number||'',title:t.title||'',owner:t.owner_name||'',status:t.status||'لم يبدأ',due:t.due||'',priority:t.priority||'Normal',notes:t.notes||'',delayReason:t.delay_reason||'',archivedFromTasks:!!t.archived_from_tasks,archivedAt:t.archived_at||'',deliveredAt:t.delivered_at||'',deliveredBy:t.delivered_by||'',deliveredUploadId:t.delivered_upload_id||'',updatedAt:t.updated_at||'',createdAt:t.created_at||'',issue:t.issue||null,handoverHistory:t.handover_history||[]};
}
function uiTaskToDb(t){
  return {id:t.id,channel_name:t.channel||'',program_name:t.program||'',episode_name:t.episodeName||'',episode_number:t.episodeNumber||'',title:t.title||'',owner_name:t.owner||'',status:t.status||'لم يبدأ',due:t.due||null,priority:t.priority||'Normal',notes:t.notes||'',delay_reason:t.delayReason||'',archived_from_tasks:!!t.archivedFromTasks,archived_at:t.archivedAt||null,delivered_at:t.deliveredAt||null,delivered_by:t.deliveredBy||'',delivered_upload_id:null,updated_at:new Date().toISOString(),issue:t.issue||null,handover_history:Array.isArray(t.handoverHistory)?t.handoverHistory:[]};
}
function dbUploadToUi(u){
  return {id:u.id,name:u.name||'',channel:u.channel_name||'',program:u.program_name||'',episode:u.episode||'',by:u.by_name||'',taskId:u.task_id||'',taskTitle:u.task_title||'',link:u.link||'',githubPath:u.github_path||'',fileName:u.file_name||'',fileType:u.file_type||'',fileData:u.file_data||'',fileSize:u.file_size||0,notes:u.notes||'',createdAt:u.created_at||'',createdAtText:u.created_at?new Date(u.created_at).toLocaleString('ar-EG'):''};
}
function uiUploadToDb(u){
  return {id:u.id,name:u.name||'',channel_name:u.channel||'',program_name:u.program||'',episode:u.episode||'',by_name:u.by||'',task_id:u.taskId||null,task_title:u.taskTitle||'',link:u.link||'',github_path:u.githubPath||'',file_name:u.fileName||'',file_type:u.fileType||'',file_data:u.fileData||'',file_size:u.fileSize||0,notes:u.notes||'',created_at:u.createdAt||new Date().toISOString()};
}
async function fileToBase64(file){
  if(!file) return null;
  return await new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onload=()=>resolve(r.result);
    r.onerror=()=>reject(r.error||new Error('File read failed'));
    r.readAsDataURL(file);
  });
}
async function uploadFileDirectToGithub(file, meta){ return null; }
function taskProgress(channel,program){let t=activeTasks().filter(x=>x.channel===channel&&x.program===program); if(!t.length)return 0; return Math.round(t.filter(x=>isDone(x)).length/t.length*100)}
function slug(s){return btoa(unescape(encodeURIComponent(s))).replaceAll('=','').replaceAll('/','_')}
function fillSelects(){
  ['taskOwner','filterPerson','uploadBy'].forEach(id=>{let el=$('#'+id); if(!el)return; let first=id==='filterPerson'?'<option value="">كل الفريق</option>':'';el.innerHTML=first+getPeopleNames().map(p=>`<option>${safe(p)}</option>`).join('')});
  ['taskStatus','filterStatus'].forEach(id=>{let el=$('#'+id); if(!el)return; let first=id==='filterStatus'?'<option value="">كل الحالات</option>':'';el.innerHTML=first+state.statuses.map(s=>`<option>${safe(s)}</option>`).join('')});
  const chSel=$('#uploadChannel'); if(chSel){ chSel.innerHTML=state.channels.map(c=>`<option>${safe(c.name)}</option>`).join(''); updateUploadPrograms(); }
  const flow=$('#flowFilter'); if(flow){ flow.innerHTML='<option value="">كل القنوات</option>'+state.channels.map(c=>`<option>${safe(c.name)}</option>`).join(''); }
}
function updateUploadPrograms(){
  const ch=$('#uploadChannel')?.value; const pr=$('#uploadProgram'); if(!pr)return;
  const found=state.channels.find(c=>c.name===ch); pr.innerHTML=(found?.programs||[]).map(p=>`<option>${safe(p)}</option>`).join('');
  updateUploadTasks();
}
function updateUploadTasks(){
  const sel=$('#uploadTask'); if(!sel)return;
  const ch=$('#uploadChannel')?.value || '';
  const pr=$('#uploadProgram')?.value || '';
  const ep=($('#uploadEpisode')?.value || '').trim();
  let arr=state.tasks.filter(t=>t.channel===ch && t.program===pr);
  if(ep) arr=arr.filter(t=>String(t.episodeNumber||'').includes(ep) || String(t.episodeName||'').includes(ep));
  sel.innerHTML='<option value="">اختياري — اختر التاسك الذي تم رفعه</option>'+arr.map(t=>`<option value="${safeAttr(t.id)}">${safe(t.title)} — حلقة ${safe(t.episodeNumber||'-')} ${safe(t.episodeName||'')} — ${safe(t.owner)} — ${safe(t.status)}</option>`).join('');
}
function renderChannels(){
  let grid=$('#channelGrid'); if(!grid)return; grid.innerHTML='';
  state.channels.forEach(ch=>{let d=document.createElement('div'); d.className='channel-card';
    const tasksCount=activeTasks().filter(t=>t.channel===ch.name).length;
    d.innerHTML=`<h2>${safe(ch.name)}</h2><p>${ch.programs.length} برامج / ${tasksCount} تاسكات</p>${ch.programs.slice(0,4).map(p=>`<span class="pill">${safe(p)}</span>`).join('')}`;
    d.dataset.action='open-channel'; d.dataset.channel=ch.name; grid.appendChild(d);
  });
}
function openChannel(chName){
  const ch=state.channels.find(c=>c.name===chName); if(!ch)return;
  let p=$('#programPanel'); p.classList.remove('hidden');
  p.innerHTML=`<h2>${safe(ch.name)}</h2><div class="programs">${ch.programs.map(pr=>{let prog=taskProgress(ch.name,pr);let count=activeTasks().filter(t=>t.channel===ch.name&&t.program===pr).length;return `<div class="program-card"><h3>${safe(pr)}</h3><div class="progress"><span style="width:${prog}%"></span></div><p>${prog}% إنجاز • ${count} تاسكات</p><button data-action="open-task-dialog" data-channel="${safeAttr(ch.name)}" data-program="${safeAttr(pr)}">+ إضافة تاسك</button><button data-action="show-program-tasks" data-channel="${safeAttr(ch.name)}" data-program="${safeAttr(pr)}">عرض التاسكات</button><div id="tasks-${slug(ch.name+pr)}" class="task-list"></div></div>`}).join('')}</div>`;
  p.scrollIntoView({behavior:'smooth'});
}
function showProgramTasks(ch,pr){let box=$(`#tasks-${slug(ch+pr)}`); if(!box)return; let tasks=activeTasks().filter(t=>t.channel===ch&&t.program===pr).sort((a,b)=>(a.due||'').localeCompare(b.due||''));box.innerHTML=tasks.length?tasks.map(taskHtml).join(''):'<p class="muted">لا توجد تاسكات بعد.</p>'}
function taskHtml(t, opts={}){
  const done=isDone(t), late=isLate(t), dueNow=isDueToday(t);
  const dueLabel=t.due ? new Date(t.due+'T00:00:00').toLocaleDateString('ar-EG') : '-';
  const delivered=t.deliveredAt?`<div class="task-delivered">✓ تم رفع التسليم بواسطة ${safe(t.deliveredBy||t.owner)} — ${safe(new Date(t.deliveredAt).toLocaleString('ar-EG',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}))}</div>`:'';
  const handovers=Array.isArray(t.handoverHistory)?t.handoverHistory:[];
  const lastHandover=handovers[0];
  const handoverInfo=lastHandover?`<div class="handover-trace"><b>مسار التسليم:</b> ${safe(lastHandover.to)} استلم من ${safe(lastHandover.from)} <span>في مرحلة: ${safe(lastHandover.stage||t.status||'-')}</span><small>${safe(lastHandover.atText||'')}${lastHandover.note?' — '+safe(lastHandover.note):''}</small></div>`:'';
  const canEditDelay=canEditDelayReason(t);
  const isMineView=!!opts.myTasks;
  const delay=late ? `<div class="delay-note locked-delay">سبب التأخير الحالي: ${safe(t.delayReason||'لم يتم كتابة سبب التأخير بعد')}</div>` : '';
  const myControls = isMineView ? `<div class="mytask-controls">
    <label>تغيير حالة التاسك<select data-my-status-for="${safeAttr(t.id)}">${(state.statuses||[]).map(st=>`<option ${st===t.status?'selected':''}>${safe(st)}</option>`).join('')}</select></label>
    <label>سبب التأخير<textarea data-delay-for="${safeAttr(t.id)}" placeholder="اكتب سبب التأخير هنا لو التاسك متأخر...">${safe(t.delayReason||'')}</textarea></label>
    <button class="delay-save-btn" data-action="save-mytask" data-id="${safeAttr(t.id)}">حفظ حالة التاسك / سبب التأخير</button>
  </div>` : '';
  const flags=`${late?'<span class="status late-flag">متأخر</span>':''}${dueNow?'<span class="status today-flag">تسليم اليوم</span>':''}${isArchived(t)?'<span class="status archived-flag">محفوظ في الكالندر</span>':''}`;
  const hideBtn = isArchived(t) ? '' : `<button class="archive-btn" data-action="archive-task" data-id="${safeAttr(t.id)}">إخفاء من التاسكات</button>`;
  return `<div class="task-card pro-task ${done?'done-task':''} ${late?'late-task':''} ${dueNow?'today-task':''} ${isArchived(t)?'archived-task':''}">
    <div class="task-main">
      <div class="task-headline">
        <div class="task-title-wrap"><b>${done?'✓ ':''}${safe(t.title)}</b><small>${safe(t.channel)} / ${safe(t.program)}</small></div>
        <span class="status s-${safe(t.status)}">${safe(t.status)}</span>
      </div>
      <div class="task-meta pro-meta">
        <span><em>Owner</em>${safe(t.owner||'-')}</span>
        <span><em>Episode</em>${safe(t.episodeNumber||'-')} ${safe(t.episodeName||'')}</span>
        <span><em>Due</em>${safe(dueLabel)}</span>
        <span><em>Priority</em>${safe(t.priority||'-')}</span>
        ${flags}
      </div>
      ${t.notes?`<div class="task-notes">${safe(t.notes)}</div>`:''}${handoverInfo}${delay}${myControls}${delivered}
    </div>
    <div class="task-actions"><button data-action="edit-task" data-id="${safeAttr(t.id)}">تعديل</button><button class="done-btn" data-action="mark-done" data-id="${safeAttr(t.id)}">${done?'تم التسليم ✓':'علّم كمنتهي ✓'}</button><button class="handover-btn" data-action="open-handover" data-id="${safeAttr(t.id)}">تسليم التاسك</button><button class="rise-hand-btn ${t.issue&&t.issue.status!=='resolved'?'active':''}" data-action="open-issue" data-id="${safeAttr(t.id)}">✋ Rise Hand</button>${hideBtn}</div>
  </div>`
}

async function markTaskDone(id){ const t=state.tasks.find(x=>x.id===id); if(!t)return; const me=currentUser(); if(!isAdmin() && t.owner!==me?.name){ await logAction('TASK_DONE_DENIED','محاولة غير مصرح بها لتغيير حالة تاسك ليس مخصصًا للحساب الحالي',t.title); return alert('تغيير حالة التاسك متاح فقط لصاحب التاسك من My Tasks.'); } const oldStatus=t.status; t.status='تم التسليم'; t.deliveredAt=t.deliveredAt||new Date().toISOString(); t.deliveredBy=t.deliveredBy||me?.name||t.owner; t.delayReason=''; t.updatedAt=new Date().toISOString(); await logAction('TASK_DONE', `تغيير الحالة من ${oldStatus} إلى تم التسليم`, t.title); await save(); }
async function archiveTaskFromLists(id){ const t=state.tasks.find(x=>x.id===id); if(!t)return; if(!confirm('إخفاء التاسك من قوائم التاسكات؟ سيظل محفوظًا وظاهرًا داخل الكالندر.')) return; t.archivedFromTasks=true; t.archivedAt=new Date().toISOString(); t.updatedAt=new Date().toISOString(); await logAction('TASK_ARCHIVE', 'إخفاء التاسك من قوائم التاسكات مع بقائه في الكالندر', t.title); await save(); }
async function deleteTaskFromCalendar(id){ const t=state.tasks.find(x=>x.id===id); if(!t)return; if(!confirm('حذف نهائي من الكالندر والبيانات؟ لا يمكن الرجوع إلا من نسخة JSON احتياطية.')) return; await logAction('TASK_DELETE', 'حذف نهائي من الكالندر والبيانات', t.title); state.tasks=state.tasks.filter(x=>x.id!==id); state.uploads=(state.uploads||[]).map(u=>u.taskId===id?{...u, taskId:'', taskTitle:(u.taskTitle||'')+' — التاسك محذوف من الكالندر'}:u); await save(); }
async function saveDelayReasonFromCard(btn,id){
  return saveMyTaskUpdate(btn,id);
}
async function saveMyTaskUpdate(btn,id){
  const t=state.tasks.find(x=>x.id===id);
  if(!t) return;
  if(!canEditDelayReason({...t, due:t.due}) && t.owner!==currentUser()?.name){
    await logAction('MYTASK_UPDATE_DENIED', 'محاولة غير مصرح بها لتعديل تاسك من My Tasks', t.title);
    return alert('تعديل الحالة وسبب التأخير متاح فقط لصاحب التاسك من My Tasks.');
  }
  const card=btn.closest('.task-card');
  const statusSel=card?.querySelector(`select[data-my-status-for="${id}"]`);
  const textarea=card?.querySelector(`textarea[data-delay-for="${id}"]`);
  const oldStatus=t.status||'';
  const oldDelay=t.delayReason||'';
  const newStatus=statusSel?.value || oldStatus;
  const newDelay=(textarea?.value||'').trim();
  if(newStatus==='متأخر' && !newDelay){
    return alert('لازم تكتب سبب التأخير قبل حفظ التاسك كمتأخر.');
  }
  t.status=newStatus;
  t.delayReason=newStatus==='متأخر' || isLate(t) ? newDelay : '';
  if(newStatus==='تم التسليم'){
    t.deliveredAt=t.deliveredAt||new Date().toISOString();
    t.deliveredBy=t.deliveredBy||currentUser()?.name||t.owner;
  }
  t.updatedAt=new Date().toISOString();
  await logAction('MYTASK_UPDATE', `تعديل My Tasks — الحالة من ${oldStatus||'-'} إلى ${t.status||'-'} — سبب التأخير من: ${oldDelay||'-'} إلى: ${t.delayReason||'-'}`, t.title);
  await save();
}
function openTaskDialog(ch,pr){fillSelects();$('#taskForm').reset();$('#taskId').value='';$('#taskChannel').value=ch;$('#taskProgram').value=pr;$('#deleteTask').classList.add('hidden');$('#deleteTask').textContent='إخفاء من التاسكات';$('#dialogTitle').textContent=`إضافة تاسك — ${pr}`;$('#taskDue').value=today();$('#taskDialog').showModal()}
function editTask(id){let t=state.tasks.find(x=>x.id===id); if(!t)return; fillSelects();$('#taskId').value=t.id;$('#taskChannel').value=t.channel;$('#taskProgram').value=t.program;$('#taskEpisodeName').value=t.episodeName||'';$('#taskEpisodeNumber').value=t.episodeNumber||'';$('#taskTitle').value=t.title;$('#taskOwner').value=t.owner;$('#taskStatus').value=t.status;$('#taskDue').value=t.due;$('#taskPriority').value=t.priority;$('#taskNotes').value=t.notes||'';$('#taskDelayReason').value=t.delayReason||''; const canDelay=canEditDelayReason(t); $('#taskDelayReason').readOnly=!canDelay; $('#taskDelayReason').title=canDelay?'':'سبب التأخير يتعدل فقط من حساب الشخص المسؤول عن التاسك'; $('#deleteTask').classList.remove('hidden');$('#deleteTask').textContent=isArchived(t)?'مخفي من التاسكات':'إخفاء من التاسكات';$('#deleteTask').disabled=isArchived(t);$('#dialogTitle').textContent='تعديل تاسك';$('#taskDialog').showModal()}
async function saveTaskForm(e){e.preventDefault(); if(!isAdmin()) return alert('إنشاء أو تعديل التاسكات متاح للأدمن فقط.'); let id=$('#taskId').value||crypto.randomUUID();let old=state.tasks.find(x=>x.id===id)||{}; const isNew=!old.id; const formDelay=($('#taskDelayReason')?.value||'').trim(); let t={...old,id,channel:$('#taskChannel').value,program:$('#taskProgram').value,episodeName:$('#taskEpisodeName').value,episodeNumber:$('#taskEpisodeNumber').value,title:$('#taskTitle').value,owner:$('#taskOwner').value,status:$('#taskStatus').value,due:$('#taskDue').value,priority:$('#taskPriority').value,notes:$('#taskNotes').value,delayReason:(isNew ? '' : (canEditDelayReason(old) ? formDelay : (old.delayReason||''))),updatedAt:new Date().toISOString(),createdAt:old.createdAt||new Date().toISOString()};state.tasks=state.tasks.filter(x=>x.id!==id).concat(t); await logAction(isNew?'TASK_CREATE':'TASK_UPDATE', `${isNew?'إنشاء':'تعديل'} تاسك — المسؤول: ${t.owner} — التسليم: ${t.due} — الحالة: ${t.status}`, t.title); $('#taskDialog').close();await save()}
async function archiveFromDialog(){ if(!isAdmin()) return alert('حذف التاسكات متاح للأدمن فقط.'); let id=$('#taskId').value;let t=state.tasks.find(x=>x.id===id);if(t){t.archivedFromTasks=true;t.archivedAt=new Date().toISOString();t.updatedAt=new Date().toISOString(); await logAction('TASK_ARCHIVE','إخفاء من نافذة تعديل التاسك', t.title);}$('#taskDialog').close();await save()}

function openHandover(id){ const t=state.tasks.find(x=>x.id===id); if(!t) return; if(!userCanHandover(t)) return alert('تسليم التاسك متاح لصاحب التاسك أو الأدمن فقط.'); fillSelects(); $('#handoverTaskId').value=id; const names=getPeopleNames().filter(n=>n!==t.owner); $('#handoverTo').innerHTML=names.map(n=>`<option>${safe(n)}</option>`).join(''); $('#handoverNote').value=''; $('#handoverDialog').showModal(); }
async function saveHandover(e){ e.preventDefault(); const id=$('#handoverTaskId').value; const t=state.tasks.find(x=>x.id===id); if(!t) return; if(!userCanHandover(t)) return alert('تسليم التاسك متاح لصاحب التاسك أو الأدمن فقط.'); const from=t.owner; const to=$('#handoverTo').value; const note=($('#handoverNote').value||'').trim(); if(!to || to===from) return alert('اختار حساب مختلف للتسليم.'); t.handoverHistory=Array.isArray(t.handoverHistory)?t.handoverHistory:[]; t.handoverHistory.unshift({from,to,note,stage:t.status||'غير محدد',by:currentUser()?.name||'Unknown',at:new Date().toISOString(),atText:new Date().toLocaleString('ar-EG')}); t.owner=to; t.updatedAt=new Date().toISOString(); notifyUser(to,'HANDOVER','تم تسليم تاسك لك',`${from} سلّم لك التاسك: ${t.title}${note?' — '+note:''}`,t.id); notifyAdmins('HANDOVER_ADMIN','تسليم تاسك',`${from} سلّم ${t.title} إلى ${to}`,t.id); await logAction('TASK_HANDOVER',`تسليم التاسك من ${from} إلى ${to}${note?' — '+note:''}`,t.title); $('#handoverDialog').close(); await save(); }
function canViewIssue(t){ const me=currentUser(); if(!t) return false; if(isAdmin()) return true; if(t.owner===me?.name) return true; if(t.issue && t.issue.by===me?.name) return true; return false; }
function canEditIssue(t){ const me=currentUser(); if(!t) return false; if(isAdmin()) return true; if(!t.issue) return t.owner===me?.name; return t.issue.by===me?.name; }
function openIssue(id){
  const t=state.tasks.find(x=>x.id===id); if(!t) return;
  if(t.issue && !canViewIssue(t)) return alert('عرض المشكلة متاح لصاحب المشكلة وصاحب التاسك والأدمن فقط.');
  if(!t.issue && !userCanRaiseIssue(t)) return alert('Rise Hand متاح لصاحب التاسك أو الأدمن فقط.');
  $('#issueTaskId').value=id; const issue=t.issue||null; const editable=canEditIssue(t);
  $('#issueText').value=issue?.text||'';
  $('#issueText').disabled=!editable;
  $('#saveIssue').classList.toggle('hidden',!editable);
  $('#issueCurrent').classList.toggle('hidden',!issue);
  $('#issueCurrent').innerHTML=issue?`<b>المشكلة المرفوعة:</b><p>${safe(issue.text||'')}</p><small>كتبها: ${safe(issue.by||'')} — ${safe(issue.atText||'')}</small><br><small>الحالة: ${safe(issue.status||'open')}</small>`:'';
  $('#resolveIssue').classList.toggle('hidden',!(isAdmin() && issue && issue.status!=='resolved'));
  $('#issueDialog').showModal();
}
async function saveIssue(e){
  e.preventDefault(); const id=$('#issueTaskId').value; const t=state.tasks.find(x=>x.id===id); if(!t) return;
  if(!canEditIssue(t)) return alert('تعديل مشكلة Rise Hand متاح فقط للشخص اللي كتبها أو الأدمن.');
  const text=($('#issueText').value||'').trim(); if(!text) return alert('اكتب المشكلة أولًا.');
  const me=currentUser(); const oldBy=t.issue?.by; const isNew=!t.issue;
  t.issue={...(t.issue||{}),text,by:oldBy||me?.name||'Unknown',status:'open',at:t.issue?.at||new Date().toISOString(),atText:t.issue?.atText||new Date().toLocaleString('ar-EG'),updatedAt:new Date().toISOString(),updatedBy:me?.name||'Unknown'};
  t.updatedAt=new Date().toISOString();
  if(isNew) notifyAdmins('ISSUE_RAISED','تم رفع مشكلة في تاسك',`${t.issue.by} كتب مشكلة في ${t.title}: ${text}`,t.id);
  else notifyAdmins('ISSUE_UPDATED','تم تعديل مشكلة في تاسك',`${me?.name||'Unknown'} عدّل مشكلة ${t.title}: ${text}`,t.id);
  await logAction(isNew?'TASK_ISSUE_RAISED':'TASK_ISSUE_UPDATED',`Rise Hand — ${text}`,t.title); $('#issueDialog').close(); await save();
}
async function resolveIssue(){ const id=$('#issueTaskId').value; const t=state.tasks.find(x=>x.id===id); if(!t || !isAdmin()) return; if(t.issue){ t.issue.status='resolved'; t.issue.resolvedAt=new Date().toISOString(); t.issue.resolvedBy=currentUser()?.name||'Admin'; notifyUser(t.owner,'ISSUE_RESOLVED','تم إغلاق مشكلة التاسك',`تم إغلاق مشكلة: ${t.title}`,t.id); await logAction('TASK_ISSUE_RESOLVED','إغلاق مشكلة Rise Hand',t.title); } $('#issueDialog').close(); await save(); }
function renderDaily(){let date=$('#dailyDate')?.value;let arr=activeTasks().filter(t=>t.due===date).sort((a,b)=>a.owner.localeCompare(b.owner));$('#dailyList').innerHTML=arr.length?arr.map(taskHtml).join(''):'<div class="panel">لا توجد تسليمات في هذا اليوم.</div>'}
function renderCalendar(){ const wrap=$('#calendarGrid'); if(!wrap)return; const val=$('#calendarMonth').value||monthNow(); const [y,m]=val.split('-').map(Number); const first=new Date(y,m-1,1); const last=new Date(y,m,0); const startDay=(first.getDay()+6)%7; let html=''; for(let i=0;i<startDay;i++) html+='<div class="calendar-day empty"></div>'; for(let d=1; d<=last.getDate(); d++){ const date=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; const arr=state.tasks.filter(t=>t.due===date); html+=`<div class="calendar-day"><div class="day-number">${d}</div>${arr.map(t=>`<span class="mini-task ${isArchived(t)?'mini-archived':''}"><span data-action="edit-task" data-id="${safeAttr(t.id)}"><strong>${safe(t.title)}</strong>${safe(t.owner)} • ح${safe(t.episodeNumber||'-')} ${isArchived(t)?'• محفوظ بالكالندر':''}</span><button class="calendar-delete-btn" data-action="delete-calendar" data-id="${safeAttr(t.id)}" title="حذف نهائي من الكالندر">×</button></span>`).join('')}</div>`; } wrap.innerHTML=html; }
function renderFlow(){ const box=$('#flowChart'); if(!box)return; const filter=$('#flowFilter').value; let channels=state.channels.filter(c=>!filter||c.name===filter); box.innerHTML=channels.map(ch=>`<div class="flow-channel"><h2>${safe(ch.name)}</h2><div class="flow-programs">${ch.programs.map(pr=>{const tasks=activeTasks().filter(t=>t.channel===ch.name&&t.program===pr); const episodes={}; tasks.forEach(t=>{const key=(t.episodeNumber||'-')+' — '+(t.episodeName||'بدون اسم حلقة'); episodes[key]??=[]; episodes[key].push(t);}); return `<div class="flow-program"><h3>${safe(pr)}</h3>${Object.keys(episodes).length?Object.keys(episodes).map(ep=>`<div class="flow-episode"><b>${safe(ep)}</b>${episodes[ep].map(t=>`<div class="flow-task">${safe(t.title)} → ${safe(t.owner)} • ${safe(t.status)}</div>`).join('')}</div>`).join(''):'<p class="muted">لا توجد حلقات/تاسكات بعد.</p>'}</div>`}).join('')}</div></div>`).join('') || '<div class="panel">لا توجد بيانات.</div>'; }
function renderDrawer(){let p=$('#filterPerson')?.value||'',s=$('#filterStatus')?.value||'',q=$('#searchInput')?.value.trim()||'';let arr=activeTasks().filter(t=>(!p||t.owner===p)&&(!s||t.status===s)&&(!q||JSON.stringify(t).includes(q))).sort((a,b)=>(a.due||'').localeCompare(b.due||''));$('#drawerTasks').innerHTML=arr.length?arr.map(taskHtml).join(''):'<p>لا توجد نتائج.</p>'}
function renderDeliveryAlerts(){
  const box=$('#deliveryAlerts'); if(!box)return; const names=getPeopleNames();
  if(!names.length){ box.innerHTML='<div class="alert-card green">لا يوجد أعضاء فريق بعد.</div>'; return; }
  box.innerHTML=names.map(p=>{
    const tasks=activeTasks().filter(t=>t.owner===p); const todayTasks=tasks.filter(isDueToday); const lateTasks=tasks.filter(isLate);
    const issueTasks=tasks.filter(t=>t.issue && t.issue.status!=='resolved');
    const cls=lateTasks.length?'red':(todayTasks.length?'orange':'green');
    const reason=lateTasks.slice(0,2).map(t=>`${safe(t.title)}: ${safe(t.delayReason||'لم يكتب سبب التأخير')}`).join('<br>');
    const issueIcons=issueTasks.map(t=>`<button class="delivery-issue-icon" data-action="open-issue" data-id="${safeAttr(t.id)}" title="Rise Hand: ${safeAttr(t.title)}">✋</button>`).join('');
    return `<div class="alert-card ${cls}"><div class="alert-name alert-name-row"><span>${safe(p)}</span>${issueIcons?`<span class="alert-issue-icons">${issueIcons}</span>`:''}</div><div class="alert-counts"><span>اليوم: ${todayTasks.length}</span><span>متأخر: ${lateTasks.length}</span></div>${lateTasks.length?`<small>${reason}</small>`:'<small>لا توجد مشاكل تسليم.</small>'}</div>`;
  }).join('');
}

function renderTeam(){
  const grid=$('#teamGrid'); if(!grid)return;
  const users=normalizeUsers(state.users).filter(u=>u.isActive!==false);
  const names=[...new Set([...users.map(u=>u.name), ...getPeopleNames()])];
  grid.innerHTML=names.map(name=>{
    const u=users.find(x=>x.name===name) || {name, username:name, password:generatePassword(), nickname:name, email:'', role:'standard'};
    let tasks=activeTasks().filter(t=>t.owner===name);
    let cls=tasks.filter(isLate).length?'red':(tasks.filter(isDueToday).length?'orange':'green');
    return `<div class="person-card team-status-card ${cls}"><h3>${safe(u.nickname||name)}</h3><p>${safe(name)} • ${tasks.length} تاسكات</p><span class="pill">UserName: ${safe(u.username||'-')}</span><span class="pill">Password: ${safe(u.password||'-')}</span><span class="pill">Nickname: ${safe(u.nickname||'-')}</span><span class="pill">Email: ${safe(u.email||'-')}</span><span class="pill">Role: ${safe(roleLabel(u.role))}</span><span class="pill">${tasks.filter(isDone).length} تم</span><span class="pill">${tasks.filter(isDueToday).length} تسليم اليوم</span><span class="pill">${tasks.filter(isLate).length} متأخر</span><div class="person-actions"><button data-action="edit-account" data-name="${safeAttr(name)}">تعديل الحساب</button><button class="danger small-danger" data-action="remove-person" data-name="${safeAttr(name)}">حذف</button></div></div>`
  }).join('') || '<div class="panel">لا يوجد أعضاء فريق بعد.</div>';
}
function openAccountDialog(name=''){
  if(!isAdmin()) return alert('إدارة الحسابات متاحة للأدمن فقط.');
  const user=name ? getUserByName(name) : null;
  $('#accountDialogTitle').textContent = user ? 'تعديل حساب' : 'إضافة حساب جديد';
  $('#accountOldName').value = user?.name || '';
  $('#accountName').value = user?.name || '';
  $('#accountUsername').value = user?.username || '';
  $('#accountPassword').value = user?.password || (user?'':generatePassword());
  $('#accountNickname').value = user?.nickname || user?.name || '';
  $('#accountEmail').value = user?.email || '';
  $('#accountRole').value = user?.role || 'standard';
  $('#accountDialog').showModal();
}
async function addPerson(){ openAccountDialog(''); }
async function saveAccountForm(e){
  e.preventDefault();
  if(!isAdmin()) return alert('إدارة الحسابات متاحة للأدمن فقط.');
  const oldName=$('#accountOldName').value;
  const name=($('#accountName').value||'').trim();
  const username=($('#accountUsername').value||'').trim();
  const password=$('#accountPassword').value||'';
  const nickname=($('#accountNickname').value||'').trim() || name;
  const email=($('#accountEmail').value||'').trim();
  const role=normalizeRole($('#accountRole').value);
  if(!name || !username || !password){ return alert('لازم تدخل Name و UserName و Password.'); }
  const dup=normalizeUsers(state.users).some(u=>(u.username===username || u.name===name) && u.name!==oldName);
  if(dup) return alert('الاسم أو UserName مستخدم بالفعل.');
  let user=oldName ? getUserByName(oldName) : null;
  if(user){ Object.assign(user,{name,username,password,nickname,email,role,isActive:true}); await logAction('ACCOUNT_UPDATE', `تعديل حساب ${name} — Username: ${username} — Role: ${roleLabel(role)}`, name); }
  else { await logAction('ACCOUNT_CREATE', `إنشاء حساب ${name} — Username: ${username} — Role: ${roleLabel(role)}`, name); state.users.push({id:crypto.randomUUID(),name,username,password,nickname,email,role,isActive:true,createdAt:new Date().toISOString()}); }
  if(oldName && oldName!==name){
    state.people=getPeopleNames().map(p=>p===oldName?name:p);
    state.tasks.forEach(t=>{ if(t.owner===oldName) t.owner=name; if(t.deliveredBy===oldName) t.deliveredBy=name; });
    state.uploads.forEach(u=>{ if(u.by===oldName) u.by=name; });
  }
  syncPeopleFromUsers();
  $('#accountDialog').close();
  await save();
}
async function renamePerson(oldName){ openAccountDialog(oldName); }
async function removePerson(name){
  if(!isAdmin()) return alert('حذف الأشخاص متاح للأدمن فقط.');
  if(name===DEFAULT_ADMIN.name) return alert('لا يمكن حذف حساب الأدمن الأساسي.');
  const assigned=state.tasks.filter(t=>t.owner===name && !isDone(t)).length;
  if(assigned && !confirm(`${name} عليه ${assigned} تاسك غير منتهي. هل تريد إيقاف الحساب مع ترك التاسكات باسمه؟`)) return;
  if(!assigned && !confirm(`حذف / إيقاف ${name} من الفريق؟`)) return;
  state.people=getPeopleNames().filter(p=>p!==name);
  state.users=(state.users||[]).map(u=>u.name===name?{...u,isActive:false}:u);
  await logAction('ACCOUNT_DISABLE', `إيقاف / حذف عضو من الفريق: ${name}`, name);
  await save();
}
function renderStats(){let t=activeTasks();$('#statTasks').textContent=t.length;$('#statDone').textContent=t.filter(isDone).length;$('#statLate').textContent=t.filter(isLate).length}
function renderUploads(){
  const list=$('#uploadsList'); if(!list)return;
  list.innerHTML=(state.uploads||[]).map(u=>{
    const isImg=String(u.fileType||'').startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(u.fileName||u.link||'');
    const fileUrl=u.fileData || u.link || '';
    const preview=(isImg && fileUrl) ? `<a href="${safeAttr(fileUrl)}" download="${safeAttr(u.fileName||u.name||'upload')}" class="upload-preview-link"><img class="upload-preview" src="${safeAttr(fileUrl)}" alt="${safeAttr(u.fileName||u.name)}"></a>` : '';
    const download=(u.fileData||u.link) ? `<a class="download-btn" href="${safeAttr(fileUrl)}" ${u.fileData?'download="'+safeAttr(u.fileName||u.name||'upload')+'"':'target="_blank"'}>تحميل / فتح الملف</a>` : '';
    const adminDelete=isAdmin()?`<button class="danger delete-upload-btn" data-action="delete-upload" data-id="${safeAttr(u.id)}">حذف المرفوع</button>`:'';
    return `<div class="upload-card pro-upload-card">${preview}<div class="upload-body"><h3>${safe(u.name)}</h3><div class="upload-meta"><span>${safe(u.channel)}</span><span>${safe(u.program)}</span><span>حلقة: ${safe(u.episode||'-')}</span><span>رفع: ${safe(u.by)}</span><span>${safe(u.createdAtText||'')}</span>${u.taskTitle?`<span>تاسك: ${safe(u.taskTitle)}</span>`:''}${u.fileName?`<span>File: ${safe(u.fileName)}</span>`:''}</div>${download}${u.githubPath?`<p class="muted">GitHub: ${safe(u.githubPath)}</p>`:''}${u.notes?`<small>${safe(u.notes)}</small>`:''}</div><div class="upload-actions">${adminDelete}</div></div>`;
  }).join('') || '<div class="panel">لا توجد مرفوعات بعد.</div>';
}
async function deleteUpload(id){
  if(!isAdmin()) return alert('حذف المرفوعات متاح للأدمن فقط.');
  const u=(state.uploads||[]).find(x=>x.id===id); if(!u) return;
  if(!confirm('حذف المرفوع نهائيًا من النظام؟')) return;
  state.uploads=(state.uploads||[]).filter(x=>x.id!==id);
  await logAction('UPLOAD_DELETE', `حذف مرفوع: ${u.name}`, u.name);
  await save();
}
function renderLogs(){
  const box=$('#logsList'); if(!box) return;
  if(!isAdmin()){ box.innerHTML=''; return; }
  const typeSel=$('#logTypeFilter');
  const logs=Array.isArray(state.logs)?state.logs:[];
  if(typeSel){
    const current=typeSel.value;
    const types=[...new Set(logs.map(l=>l.action).filter(Boolean))].sort();
    typeSel.innerHTML='<option value="">كل العمليات</option>'+types.map(t=>`<option value="${safeAttr(t)}">${safe(t)}</option>`).join('');
    typeSel.value=current;
  }
  const q=($('#logSearch')?.value||'').trim().toLowerCase();
  const type=($('#logTypeFilter')?.value||'');
  const arr=logs.filter(l=>(!type||l.action===type)&&(!q||JSON.stringify(l).toLowerCase().includes(q))).slice(0,500);
  box.innerHTML=arr.length?arr.map(l=>`<div class="log-card"><div><b>${safe(l.action)}</b><small>${safe(l.createdAtText || (l.createdAt?new Date(l.createdAt).toLocaleString('ar-EG'):''))}</small></div><div class="log-meta"><span>Account: ${safe(l.actorName||'-')}</span><span>@${safe(l.actorUsername||'-')}</span><span>${safe(roleLabel(l.actorRole))}</span></div><p>${safe(l.details||'')}</p>${l.target?`<small class="log-target">Target: ${safe(l.target)}</small>`:''}</div>`).join(''):'<div class="panel">لا توجد عمليات مسجلة بعد.</div>';
}
function renderMyTasks(){
  const box=$('#myTasksList'); if(!box)return;
  const me=currentUser();
  if(!me){ box.innerHTML='<div class="panel">سجل الدخول أولاً.</div>'; return; }
  const arr=activeTasks().filter(t=>t.owner===me.name).sort((a,b)=>(a.due||'').localeCompare(b.due||''));
  box.innerHTML=arr.length?arr.map(t=>taskHtml(t,{myTasks:true})).join(''):'<div class="panel">لا توجد تاسكات مخصصة لحسابك.</div>'; 
}
function openUploadDialog(){ fillSelects(); $('#uploadForm').reset(); updateUploadPrograms(); const me=currentUser(); if(me && !isAdmin()){ $('#uploadBy').value=me.name; $('#uploadBy').disabled=true; } $('#uploadDialog').showModal(); }
async function saveUploadForm(e){
  e.preventDefault();
  const file=$('#uploadFile').files[0]; let github=null; let fileData='', fileName='', fileType='', fileSize=0; const linkedTaskId=$('#uploadTask').value; const linkedTask=state.tasks.find(t=>t.id===linkedTaskId);
  const me=currentUser();
  if(!isAdmin() && linkedTask && linkedTask.owner!==me?.name) return alert('يمكنك رفع ملفات لتاسكاتك فقط.');
  const meta={channel:$('#uploadChannel').value,program:$('#uploadProgram').value,episode:$('#uploadEpisode').value,name:$('#uploadName').value};
  try{
    if(file){ fileData=await fileToBase64(file); fileName=file.name; fileType=file.type||''; fileSize=file.size||0; }
    github=await uploadFileDirectToGithub(file,meta);
  }catch(err){console.error(err);alert('تم حفظ السجل، لكن قراءة/رفع الملف لم تكتمل.')}
  const byName=(!isAdmin() && me)?me.name:$('#uploadBy').value;
  const item={id:crypto.randomUUID(),name:$('#uploadName').value,channel:$('#uploadChannel').value,program:$('#uploadProgram').value,episode:$('#uploadEpisode').value,by:byName,taskId:linkedTaskId,taskTitle:linkedTask?.title||'',link:$('#uploadLink').value || github?.url || '',githubPath:github?.path || '',fileName,fileType,fileData,fileSize,notes:$('#uploadNotes').value,createdAt:new Date().toISOString(),createdAtText:new Date().toLocaleString('ar-EG')};
  state.uploads=[item,...(state.uploads||[])];
  if(linkedTask){ linkedTask.status='تم التسليم'; linkedTask.deliveredAt=item.createdAt; linkedTask.deliveredBy=item.by; linkedTask.deliveredUploadId=item.id; linkedTask.updatedAt=item.createdAt; linkedTask.delayReason=''; }
  await logAction('UPLOAD_CREATE', `رفع ملف/رابط بواسطة ${item.by}${linkedTask?` وربطه بتاسك: ${linkedTask.title}`:''}`, item.name);
  $('#uploadDialog').close(); await save();
}
function renderAll(){state=normalizeState(state);syncPeopleFromUsers();renderChannels();fillSelects();renderDaily();renderCalendar();renderFlow();renderDrawer();renderTeam();renderStats();renderUploads();renderDeliveryAlerts();renderMyTasks();renderLogs();renderNotifications();renderChatBadge();applyRolePermissions();}
function bindEvents(){
  $$('.nav-btn').forEach(b=>b.addEventListener('click',()=>{$$('.nav-btn').forEach(x=>x.classList.remove('active'));b.classList.add('active');$$('.tab').forEach(t=>t.classList.remove('active'));$('#'+b.dataset.tab).classList.add('active');$('#pageTitle').textContent=b.textContent;renderAll()}));
  $('#indexBtn')?.addEventListener('click',()=>$('#drawer').classList.add('open'));
  $('#chatBtn')?.addEventListener('click',openChat);
  $('#closeChat')?.addEventListener('click',()=>$('#chatDialog')?.close());
  $('#sendChatBtn')?.addEventListener('click',sendChat);
  $('#chatInput')?.addEventListener('keydown',e=>{ if(e.key==='Enter') sendChat(); });
  $('#closeNotifications')?.addEventListener('click',()=>$('#notificationDialog')?.close());
  $('#cancelHandover')?.addEventListener('click',()=>$('#handoverDialog')?.close());
  $('#saveHandover')?.addEventListener('click',saveHandover);
  $('#cancelIssue')?.addEventListener('click',()=>$('#issueDialog')?.close());
  $('#saveIssue')?.addEventListener('click',saveIssue);
  $('#resolveIssue')?.addEventListener('click',resolveIssue);
  $('#closeDrawer')?.addEventListener('click',()=>$('#drawer').classList.remove('open'));
  ['filterPerson','filterStatus','searchInput','dailyDate','calendarMonth','flowFilter','logSearch','logTypeFilter'].forEach(id=>$('#'+id)?.addEventListener('input',renderAll));
  $('#todayBtn')?.addEventListener('click',()=>{$('#calendarMonth').value=monthNow();renderCalendar()});
  $('#exportBtn')?.addEventListener('click',()=>{ if(!isAdmin()) return alert('Export متاح للأدمن فقط.'); logAction('EXPORT_JSON','تصدير نسخة JSON من بيانات النظام','JSON Export'); let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));a.download='brivviant-platform-data.json';a.click()});
  $('#importInput')?.addEventListener('change',e=>{ if(!isAdmin()) return alert('Import متاح للأدمن فقط.'); let f=e.target.files[0];if(!f)return;let r=new FileReader();r.onload=async()=>{state=normalizeState(JSON.parse(r.result));await ensureDefaultAdmin();await logAction('IMPORT_JSON','استيراد بيانات JSON إلى النظام','JSON Import');await save()};r.readAsText(f)});
  $('#saveTask')?.addEventListener('click',saveTaskForm);
  $('#deleteTask')?.addEventListener('click',archiveFromDialog);
  $('#cancelTask')?.addEventListener('click',()=>$('#taskDialog').close());
  $('#addPersonBtn')?.addEventListener('click',addPerson);
  $('#saveAccount')?.addEventListener('click',saveAccountForm);
  $('#cancelAccount')?.addEventListener('click',()=>$('#accountDialog').close());
  $('#generatePasswordBtn')?.addEventListener('click',()=>{$('#accountPassword').value=generatePassword();});
  $('#logoutBtn')?.addEventListener('click',logout);
  $('#openUploadDialog')?.addEventListener('click',openUploadDialog);
  $('#cancelUpload')?.addEventListener('click',()=>$('#uploadDialog').close());
  $('#uploadChannel')?.addEventListener('change',updateUploadPrograms);
  $('#uploadProgram')?.addEventListener('change',updateUploadTasks);
  $('#uploadEpisode')?.addEventListener('input',updateUploadTasks);
  $('#saveUpload')?.addEventListener('click',saveUploadForm);
  $('#cancelProfile')?.addEventListener('click',()=>$('#profileDialog').close());
  $('#saveProfile')?.addEventListener('click',saveProfileForm);
  $('#profileAvatarFile')?.addEventListener('change', async e=>{ const f=e.target.files?.[0]; if(f){ const data=await fileToBase64(f); $('#profileAvatarPreview').innerHTML=`<img src="${safeAttr(data)}" alt="Profile">`; } });
  document.addEventListener('click',async e=>{
    const el=e.target.closest('[data-action]'); if(!el)return;
    const a=el.dataset.action;
    if((a==='open-task-dialog'||a==='edit-task'||a==='archive-task'||a==='delete-calendar'||a==='rename-person'||a==='edit-account'||a==='remove-person') && !isAdmin()){
      return alert('هذا الإجراء متاح للأدمن فقط.');
    }
    if(a==='open-channel') openChannel(el.dataset.channel);
    if(a==='open-task-dialog') openTaskDialog(el.dataset.channel,el.dataset.program);
    if(a==='show-program-tasks') showProgramTasks(el.dataset.channel,el.dataset.program);
    if(a==='edit-task') editTask(el.dataset.id);
    if(a==='mark-done') await markTaskDone(el.dataset.id);
    if(a==='archive-task') await archiveTaskFromLists(el.dataset.id);
    if(a==='delete-calendar') { e.stopPropagation(); await deleteTaskFromCalendar(el.dataset.id); }
    if(a==='save-delay') await saveDelayReasonFromCard(el,el.dataset.id);
    if(a==='save-mytask') await saveMyTaskUpdate(el,el.dataset.id);
    if(a==='rename-person') await renamePerson(el.dataset.name);
    if(a==='edit-account') openAccountDialog(el.dataset.name);
    if(a==='remove-person') await removePerson(el.dataset.name);
    if(a==='delete-upload') await deleteUpload(el.dataset.id);
    if(a==='open-profile') openProfileDialog();
    if(a==='open-notifications') openNotifications();
    if(a==='open-notification-task'){ $('#notificationDialog')?.close(); editTask(el.dataset.id); }
    if(a==='open-handover') openHandover(el.dataset.id);
    if(a==='open-issue') openIssue(el.dataset.id);
    if(a==='select-chat'){ activeChatWith=el.dataset.name; renderChat(); }
  });
}

function applyRolePermissions(){
  const admin=isAdmin();
  document.body.classList.toggle('is-admin', admin);
  document.body.classList.toggle('is-standard', !admin);

  // ADMIN ONLY NAVIGATION — Staff must not see Team or Calendar at all.
  const adminOnlyTabs = ['team','calendar','logs'];
  adminOnlyTabs.forEach(tabName=>{
    document.querySelector(`.nav-btn[data-tab="${tabName}"]`)?.classList.toggle('restricted', !admin);
    document.querySelector(`#${tabName}`)?.classList.toggle('restricted', !admin);
  });

  // If a Staff user somehow lands on an admin-only tab, move him back to My Tasks safely.
  const activeBtn = document.querySelector('.nav-btn.active');
  if(!admin && activeBtn && adminOnlyTabs.includes(activeBtn.dataset.tab)){
    activeBtn.classList.remove('active');
    const myBtn = document.querySelector('.nav-btn[data-tab="mytasks"]');
    myBtn?.classList.add('active');
    $$('.tab').forEach(t=>t.classList.remove('active'));
    $('#mytasks')?.classList.add('active');
    if($('#pageTitle')) $('#pageTitle').textContent = myBtn?.textContent || 'My Tasks';
  }

  $$('[data-action="open-task-dialog"], #addPersonBtn, [data-action="rename-person"], [data-action="remove-person"], [data-action="archive-task"], .calendar-delete-btn').forEach(el=>{ el.classList.toggle('restricted', !admin); });
  $$('[data-action="edit-task"]').forEach(el=>{ el.classList.toggle('restricted', !admin); });
  const me=currentUser();
  $('#exportBtn')?.classList.toggle('restricted', !admin);
  document.querySelector('.importLabel')?.classList.toggle('restricted', !admin);
  updateProfileBox();
  if($('#uploadBy') && me && !admin){ $('#uploadBy').value=me.name; $('#uploadBy').disabled=true; } else if($('#uploadBy')) $('#uploadBy').disabled=false;
}
async function login(){
  await ensureDefaultAdmin();
  state.users=normalizeUsers(state.users);
  const err=$('#loginError'); if(err) err.textContent='';
  const username=($('#loginUsername')?.value||'').trim();
  const password=$('#loginPassword')?.value||'';
  if(!username || !password){ if(err) err.textContent='لازم تدخل UserName و Password.'; await logAction('LOGIN_MISSING','محاولة دخول بدون UserName أو Password','Login',{username:username||'Unknown',name:username||'Unknown',role:'unknown'}); return; }
  const user=normalizeUsers(state.users).find(u=>u.username===username && u.isActive!==false);
  if(!user || String(user.password||'') !== String(password)){
    if(err) err.textContent='UserName أو Password غلط. اكتب البيانات صح.';
    await logAction('LOGIN_FAILED', `فشل تسجيل الدخول للـ UserName: ${username}`, 'Login', {username, name:username, role:'unknown'});
    return;
  }
  setSession({username:user.username,name:user.name,role:user.role});
  await logAction('LOGIN_SUCCESS', `تسجيل دخول ناجح للحساب ${user.name}`, 'Login', user);
  $('#loginOverlay').style.display='none';
  updateProfileBox();
  applyRolePermissions(); renderAll();
}
async function logout(){ const me=currentUser(); await logAction('LOGOUT', `تسجيل خروج للحساب ${me?.name||''}`, 'Logout', me||{}); clearSession(); $('#loginUsername').value=''; $('#loginPassword').value=''; $('#loginOverlay').style.display='flex'; updateProfileBox(); }
function updateProfileBar(){
  const bar=$('#profileBar'); if(!bar) return;
  const me=currentUser();
  if(!me){ bar.innerHTML=''; return; }
  const avatar=me.avatar?`<img src="${safeAttr(me.avatar)}" alt="Profile">`:`<span>${safe((me.nickname||me.name||'?').slice(0,1))}</span>`;
  bar.innerHTML=`<button class="notif-btn" data-action="open-notifications" title="الإشعارات">🔔<span id="notifBadge" class="mini-badge hidden">0</span></button><button class="profile-bar-btn" data-action="open-profile" title="Edit Profile"><div class="profile-avatar">${avatar}</div><div><b>${safe(me.nickname||me.name)}</b><small>@${safe(me.username)} • ${safe(roleLabel(me.role))}</small></div></button>`; renderNotifications();
}
function openProfileDialog(){
  const me=currentUser(); if(!me) return;
  $('#profileName').value=me.name||'';
  $('#profileNickname').value=me.nickname||me.name||'';
  $('#profileEmail').value=me.email||'';
  $('#profileUsernameView').value=me.username||'';
  $('#profileAvatarPreview').innerHTML=me.avatar?`<img src="${safeAttr(me.avatar)}" alt="Profile">`:'لا توجد صورة';
  $('#profileAvatarFile').value='';
  $('#profileDialog').showModal();
}
async function saveProfileForm(e){
  e.preventDefault();
  const me=currentUser(); if(!me) return;
  const user=getUserByName(me.name)||state.users.find(u=>u.username===me.username); if(!user) return;
  const oldName=user.name;
  const name=($('#profileName').value||'').trim();
  const nickname=($('#profileNickname').value||'').trim()||name;
  const email=($('#profileEmail').value||'').trim();
  if(!name) return alert('لازم تدخل الاسم.');
  const dup=normalizeUsers(state.users).some(u=>u.name===name && u.username!==user.username);
  if(dup) return alert('الاسم مستخدم لحساب آخر.');
  const file=$('#profileAvatarFile')?.files?.[0];
  if(file){ user.avatar=await fileToBase64(file); }
  Object.assign(user,{name,nickname,email});
  if(oldName!==name){
    state.people=getPeopleNames().map(p=>p===oldName?name:p);
    state.tasks.forEach(t=>{ if(t.owner===oldName) t.owner=name; if(t.deliveredBy===oldName) t.deliveredBy=name; });
    state.uploads.forEach(u=>{ if(u.by===oldName) u.by=name; });
  }
  setSession({username:user.username,name:user.name,role:user.role});
  await logAction('PROFILE_UPDATE', `تعديل البروفايل للحساب ${user.name}`, user.name, user);
  $('#profileDialog').close();
  await save();
}
function updateProfileBox(){
  const box=$('#profileBox'); if(!box) return;
  const me=currentUser();
  if(!me){ box.innerHTML='<small>Not logged in</small>'; updateProfileBar(); return; }
  updateProfileBar();
  box.innerHTML=`<div class="profile-name">${safe(me.nickname||me.name)}</div><small>@${safe(me.username)} • ${safe(roleLabel(me.role))}</small><small>${safe(me.email||'')}</small>`;
}
function showForgotPassword(){
  const panel=$('#passwordChangePanel');
  panel?.classList.toggle('hidden');
  if(panel && !panel.classList.contains('hidden')){
    $('#changeUsername').value=$('#loginUsername')?.value || '';
    $('#changeCurrentPassword').value='';
    $('#changeNewPassword').value='';
    $('#changeConfirmPassword').value='';
    $('#passwordChangeError').textContent='';
  }
}
async function savePasswordChange(){
  await ensureDefaultAdmin();
  const err=$('#passwordChangeError'); if(err) err.textContent='';
  const username=($('#changeUsername')?.value||'').trim();
  const current=$('#changeCurrentPassword')?.value||'';
  const next=$('#changeNewPassword')?.value||'';
  const confirmPass=$('#changeConfirmPassword')?.value||'';
  if(!username || !current || !next || !confirmPass){ if(err) err.textContent='لازم تملأ كل البيانات.'; return; }
  const user=(state.users||[]).find(u=>u.username===username && u.isActive!==false);
  if(!user){ if(err) err.textContent='الحساب غير موجود.'; return; }
  if(String(user.password||user.passwordHash||user.password_hash||'') !== String(current)){ if(err) err.textContent='كلمة المرور الحالية غير صحيحة.'; return; }
  if(next.length < 6){ if(err) err.textContent='كلمة المرور الجديدة لازم تكون 6 حروف/أرقام على الأقل.'; return; }
  if(next!==confirmPass){ if(err) err.textContent='كلمتا المرور غير متطابقتين.'; return; }
  user.password=next; delete user.passwordHash; delete user.password_hash;
  await logAction('PASSWORD_CHANGE', `تغيير كلمة مرور الحساب ${user.name}`, user.name, user);
  await save();
  $('#passwordChangePanel')?.classList.add('hidden');
  if($('#loginPassword')) $('#loginPassword').value='';
  if($('#loginError')) $('#loginError').textContent='تم تغيير كلمة المرور. سجل الدخول بالكلمة الجديدة.';
}
async function boot(){
  await ensureDefaultAdmin();
  $('#dailyDate').value=today(); $('#calendarMonth').value=monthNow();
  bindEvents();
  $('#loginForm')?.addEventListener('submit',e=>{ e.preventDefault(); login(); });
  $('#loginBtn')?.addEventListener('click',e=>{ e.preventDefault(); login(); });
  $('#loginPassword')?.addEventListener('keydown',e=>{ if(e.key==='Enter') login(); });
  $('#forgotPasswordBtn')?.addEventListener('click',showForgotPassword);
  $('#savePasswordChangeBtn')?.addEventListener('click',savePasswordChange);
  $('#cancelPasswordChangeBtn')?.addEventListener('click',()=>$('#passwordChangePanel')?.classList.add('hidden'));
  await initOnline();
  await ensureDefaultAdmin();
  const session=currentSession();
  if(session && normalizeUsers(state.users).some(u=>u.username===session.username && u.isActive!==false)) $('#loginOverlay').style.display='none';
  else $('#loginOverlay').style.display='flex';
  applyRolePermissions(); renderAll();
}
boot();
