const KEY='brivviant_channels_platform_v5_same_ui_github_sync';
const CONFIG = window.BRIVVIANT_CONFIG || {};
let remoteSha = null;
let state = JSON.parse(localStorage.getItem(KEY)||'null') || {
  channels: SEED_DATA.channels,
  people: SEED_DATA.people,
  statuses: SEED_DATA.statuses,
  tasks: [],
  uploads: []
};
state.people = state.people || SEED_DATA.people || [];
state.statuses = state.statuses || SEED_DATA.statuses || [];
state.tasks = state.tasks || [];
state.uploads = state.uploads || [];
state.users = Array.isArray(state.users) ? state.users : [];
const DEFAULT_ADMIN = { name:'Brivviant', username:'Brivviant', password:'Brivviant@123456', role:'admin', isActive:true };
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
function getUserByName(name){ return (state.users||[]).find(u=>u.name===name || u.username===name) || null; }
function getSession(){ try { return JSON.parse(localStorage.getItem(AUTH_KEY)||'null'); } catch(e){ return null; } }
function setSession(s){ localStorage.setItem(AUTH_KEY, JSON.stringify(s)); }
function clearSession(){ localStorage.removeItem(AUTH_KEY); }
function currentSession(){ return getSession(); }
function currentUser(){ const ss=currentSession(); return ss ? (state.users||[]).find(u=>u.username===ss.username) || ss : null; }
function isAdmin(){ return (currentUser()?.role || currentSession()?.role) === 'admin'; }
async function hashPassword(password){
  if(!password) return '';
  if(window.crypto?.subtle){
    const data=new TextEncoder().encode(password);
    const hash=await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  return 'plain:' + password;
}
async function ensureDefaultAdmin(){
  state.users = Array.isArray(state.users) ? state.users : [];
  let admin = state.users.find(u=>u.username===DEFAULT_ADMIN.username);
  if(!admin){
    admin = {...DEFAULT_ADMIN, passwordHash: await hashPassword(DEFAULT_ADMIN.password)};
    delete admin.password;
    state.users.push(admin);
  }else if(!admin.passwordHash && admin.password){
    admin.passwordHash = await hashPassword(admin.password);
    delete admin.password;
  }
  state.people = getPeopleNames();
  if(!state.people.includes(admin.name)) state.people.unshift(admin.name);
  localSave();
}
function normalizeUsers(users){
  return (Array.isArray(users)?users:[]).map(u=>({
    id:u.id||crypto.randomUUID?.()||String(Date.now()+Math.random()),
    name:u.name||u.username||'',
    username:u.username||u.name||'',
    passwordHash:u.passwordHash||u.password_hash||'',
    role:(u.role==='admin')?'admin':'standard',
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
    state.channels=channels.map(c=>({id:c.id,name:c.name,programs:programs.filter(p=>p.channel_id===c.id).map(p=>p.name)}));
    state.users=normalizeUsers(people.map(p=>({id:p.id,name:p.name,username:p.username||p.name,passwordHash:p.password_hash||'',role:p.role||'standard',isActive:p.is_active,createdAt:p.created_at})));
    state.people=people.map(p=>p.name);
    state.statuses=statuses.map(s=>s.name);
    state.tasks=tasks.map(dbTaskToUi);
    state.uploads=uploads.map(dbUploadToUi);
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
    const adminHash = await hashPassword(DEFAULT_ADMIN.password);
    await apiUpsertPeople([{name:'Brivviant',username:'Brivviant',password_hash:adminHash,role:'admin',is_active:true}, ...SEED_DATA.people.map(name=>({name:name,username:name,password_hash:'',role:'standard',is_active:true}))]);
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
    const u=users.find(x=>x.name===name) || {name, username:name, passwordHash:'', role:'standard', isActive:true};
    await apiUpsertPeople([{name:u.name,username:u.username,password_hash:u.passwordHash||'',role:u.role||'standard',is_active:u.isActive!==false}]);
  }
}
async function save(){ localSave(); renderAll(); await saveOnline(); }

function normalizeState(s){
  s=s||{};
  const out = {channels:Array.isArray(s.channels)?s.channels:SEED_DATA.channels,people:Array.isArray(s.people)?s.people:SEED_DATA.people,statuses:Array.isArray(s.statuses)?s.statuses:SEED_DATA.statuses,tasks:Array.isArray(s.tasks)?s.tasks:[],uploads:Array.isArray(s.uploads)?s.uploads:[],users:normalizeUsers(s.users)};
  out.people=out.people.map(personName).filter(Boolean);
  return out;
}
function dbTaskToUi(t){
  return {id:t.id,channel:t.channel_name||'',program:t.program_name||'',episodeName:t.episode_name||'',episodeNumber:t.episode_number||'',title:t.title||'',owner:t.owner_name||'',status:t.status||'لم يبدأ',due:t.due||'',priority:t.priority||'Normal',notes:t.notes||'',delayReason:t.delay_reason||'',archivedFromTasks:!!t.archived_from_tasks,archivedAt:t.archived_at||'',deliveredAt:t.delivered_at||'',deliveredBy:t.delivered_by||'',deliveredUploadId:t.delivered_upload_id||'',updatedAt:t.updated_at||'',createdAt:t.created_at||''};
}
function uiTaskToDb(t){
  return {id:t.id,channel_name:t.channel||'',program_name:t.program||'',episode_name:t.episodeName||'',episode_number:t.episodeNumber||'',title:t.title||'',owner_name:t.owner||'',status:t.status||'لم يبدأ',due:t.due||null,priority:t.priority||'Normal',notes:t.notes||'',delay_reason:t.delayReason||'',archived_from_tasks:!!t.archivedFromTasks,archived_at:t.archivedAt||null,delivered_at:t.deliveredAt||null,delivered_by:t.deliveredBy||'',delivered_upload_id:null,updated_at:new Date().toISOString()};
}
function dbUploadToUi(u){
  return {id:u.id,name:u.name||'',channel:u.channel_name||'',program:u.program_name||'',episode:u.episode||'',by:u.by_name||'',taskId:u.task_id||'',taskTitle:u.task_title||'',link:u.link||'',githubPath:u.github_path||'',notes:u.notes||'',createdAt:u.created_at||'',createdAtText:u.created_at?new Date(u.created_at).toLocaleString('ar-EG'):''};
}
function uiUploadToDb(u){
  return {id:u.id,name:u.name||'',channel_name:u.channel||'',program_name:u.program||'',episode:u.episode||'',by_name:u.by||'',task_id:u.taskId||null,task_title:u.taskTitle||'',link:u.link||'',github_path:u.githubPath||'',notes:u.notes||'',created_at:u.createdAt||new Date().toISOString()};
}
async function fileToBase64(file){ return null; }
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
function taskHtml(t){
  const done=isDone(t), late=isLate(t), dueNow=isDueToday(t);
  const delivered=t.deliveredAt?`<small class="delivered-note">✓ تم رفع التسليم بواسطة ${safe(t.deliveredBy||t.owner)} — ${safe(new Date(t.deliveredAt).toLocaleString('ar-EG'))}</small>`:'';
  const delay=late?`<small class="delay-note">سبب التأخير الحالي: ${safe(t.delayReason||'لم يتم كتابة سبب التأخير بعد')}</small><div class="delay-editor"><label>اكتب / عدّل سبب التأخير<textarea data-delay-for="${safeAttr(t.id)}" placeholder="اكتب سبب التأخير هنا بوضوح...">${safe(t.delayReason||'')}</textarea></label><button class="delay-save-btn" data-action="save-delay" data-id="${safeAttr(t.id)}">حفظ سبب التأخير</button></div>`:'';
  const flags=`${late?'<span class="status late-flag">متأخر</span>':''}${dueNow?'<span class="status today-flag">تسليم اليوم</span>':''}${isArchived(t)?'<span class="status archived-flag">محفوظ في الكالندر</span>':''}`;
  const hideBtn = isArchived(t) ? '' : `<button class="archive-btn" data-action="archive-task" data-id="${safeAttr(t.id)}">إخفاء من التاسكات</button>`;
  return `<div class="task-card ${done?'done-task':''} ${late?'late-task':''} ${dueNow?'today-task':''} ${isArchived(t)?'archived-task':''}"><div><b>${done?'✓ ':''}${safe(t.title)}</b><div class="task-meta"><span>${safe(t.owner)}</span><span>${safe(t.channel)}</span><span>${safe(t.program)}</span><span>حلقة: ${safe(t.episodeNumber||'-')} ${safe(t.episodeName||'')}</span><span>تسليم: ${safe(t.due||'-')}</span><span>${safe(t.priority)}</span><span class="status s-${safe(t.status)}">${safe(t.status)}</span>${flags}</div>${t.notes?`<small>${safe(t.notes)}</small>`:''}${delay}${delivered}</div><div class="task-actions"><button data-action="edit-task" data-id="${safeAttr(t.id)}">تعديل</button><button class="done-btn" data-action="mark-done" data-id="${safeAttr(t.id)}">${done?'تم التسليم ✓':'علّم كمنتهي ✓'}</button>${hideBtn}</div></div>`
}
async function markTaskDone(id){ const t=state.tasks.find(x=>x.id===id); if(!t)return; t.status='تم التسليم'; t.deliveredAt=t.deliveredAt||new Date().toISOString(); t.deliveredBy=t.deliveredBy||t.owner; t.updatedAt=new Date().toISOString(); await save(); }
async function archiveTaskFromLists(id){ const t=state.tasks.find(x=>x.id===id); if(!t)return; if(!confirm('إخفاء التاسك من قوائم التاسكات؟ سيظل محفوظًا وظاهرًا داخل الكالندر.')) return; t.archivedFromTasks=true; t.archivedAt=new Date().toISOString(); t.updatedAt=new Date().toISOString(); await save(); }
async function deleteTaskFromCalendar(id){ const t=state.tasks.find(x=>x.id===id); if(!t)return; if(!confirm('حذف نهائي من الكالندر والبيانات؟ لا يمكن الرجوع إلا من نسخة JSON احتياطية.')) return; state.tasks=state.tasks.filter(x=>x.id!==id); state.uploads=(state.uploads||[]).map(u=>u.taskId===id?{...u, taskId:'', taskTitle:(u.taskTitle||'')+' — التاسك محذوف من الكالندر'}:u); await save(); }
async function saveDelayReasonFromCard(btn,id){ const t=state.tasks.find(x=>x.id===id); if(!t)return; const card=btn.closest('.task-card'); const textarea=card?.querySelector(`textarea[data-delay-for="${id}"]`); t.delayReason=(textarea?.value||'').trim(); if(isLate(t)) t.status='متأخر'; t.updatedAt=new Date().toISOString(); await save(); }
function openTaskDialog(ch,pr){fillSelects();$('#taskForm').reset();$('#taskId').value='';$('#taskChannel').value=ch;$('#taskProgram').value=pr;$('#deleteTask').classList.add('hidden');$('#deleteTask').textContent='إخفاء من التاسكات';$('#dialogTitle').textContent=`إضافة تاسك — ${pr}`;$('#taskDue').value=today();$('#taskDialog').showModal()}
function editTask(id){let t=state.tasks.find(x=>x.id===id); if(!t)return; fillSelects();$('#taskId').value=t.id;$('#taskChannel').value=t.channel;$('#taskProgram').value=t.program;$('#taskEpisodeName').value=t.episodeName||'';$('#taskEpisodeNumber').value=t.episodeNumber||'';$('#taskTitle').value=t.title;$('#taskOwner').value=t.owner;$('#taskStatus').value=t.status;$('#taskDue').value=t.due;$('#taskPriority').value=t.priority;$('#taskNotes').value=t.notes||'';$('#taskDelayReason').value=t.delayReason||'';$('#deleteTask').classList.remove('hidden');$('#deleteTask').textContent=isArchived(t)?'مخفي من التاسكات':'إخفاء من التاسكات';$('#deleteTask').disabled=isArchived(t);$('#dialogTitle').textContent='تعديل تاسك';$('#taskDialog').showModal()}
async function saveTaskForm(e){e.preventDefault(); if(!isAdmin()) return alert('إنشاء أو تعديل التاسكات متاح للأدمن فقط.'); let id=$('#taskId').value||crypto.randomUUID();let old=state.tasks.find(x=>x.id===id)||{};let t={...old,id,channel:$('#taskChannel').value,program:$('#taskProgram').value,episodeName:$('#taskEpisodeName').value,episodeNumber:$('#taskEpisodeNumber').value,title:$('#taskTitle').value,owner:$('#taskOwner').value,status:$('#taskStatus').value,due:$('#taskDue').value,priority:$('#taskPriority').value,notes:$('#taskNotes').value,delayReason:$('#taskDelayReason').value,updatedAt:new Date().toISOString()};state.tasks=state.tasks.filter(x=>x.id!==id).concat(t);$('#taskDialog').close();await save()}
async function archiveFromDialog(){ if(!isAdmin()) return alert('حذف التاسكات متاح للأدمن فقط.'); let id=$('#taskId').value;let t=state.tasks.find(x=>x.id===id);if(t){t.archivedFromTasks=true;t.archivedAt=new Date().toISOString();t.updatedAt=new Date().toISOString();}$('#taskDialog').close();await save()}
function renderDaily(){let date=$('#dailyDate')?.value;let arr=activeTasks().filter(t=>t.due===date).sort((a,b)=>a.owner.localeCompare(b.owner));$('#dailyList').innerHTML=arr.length?arr.map(taskHtml).join(''):'<div class="panel">لا توجد تسليمات في هذا اليوم.</div>'}
function renderCalendar(){ const wrap=$('#calendarGrid'); if(!wrap)return; const val=$('#calendarMonth').value||monthNow(); const [y,m]=val.split('-').map(Number); const first=new Date(y,m-1,1); const last=new Date(y,m,0); const startDay=(first.getDay()+6)%7; let html=''; for(let i=0;i<startDay;i++) html+='<div class="calendar-day empty"></div>'; for(let d=1; d<=last.getDate(); d++){ const date=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; const arr=state.tasks.filter(t=>t.due===date); html+=`<div class="calendar-day"><div class="day-number">${d}</div>${arr.map(t=>`<span class="mini-task ${isArchived(t)?'mini-archived':''}"><span data-action="edit-task" data-id="${safeAttr(t.id)}"><strong>${safe(t.title)}</strong>${safe(t.owner)} • ح${safe(t.episodeNumber||'-')} ${isArchived(t)?'• محفوظ بالكالندر':''}</span><button class="calendar-delete-btn" data-action="delete-calendar" data-id="${safeAttr(t.id)}" title="حذف نهائي من الكالندر">×</button></span>`).join('')}</div>`; } wrap.innerHTML=html; }
function renderFlow(){ const box=$('#flowChart'); if(!box)return; const filter=$('#flowFilter').value; let channels=state.channels.filter(c=>!filter||c.name===filter); box.innerHTML=channels.map(ch=>`<div class="flow-channel"><h2>${safe(ch.name)}</h2><div class="flow-programs">${ch.programs.map(pr=>{const tasks=activeTasks().filter(t=>t.channel===ch.name&&t.program===pr); const episodes={}; tasks.forEach(t=>{const key=(t.episodeNumber||'-')+' — '+(t.episodeName||'بدون اسم حلقة'); episodes[key]??=[]; episodes[key].push(t);}); return `<div class="flow-program"><h3>${safe(pr)}</h3>${Object.keys(episodes).length?Object.keys(episodes).map(ep=>`<div class="flow-episode"><b>${safe(ep)}</b>${episodes[ep].map(t=>`<div class="flow-task">${safe(t.title)} → ${safe(t.owner)} • ${safe(t.status)}</div>`).join('')}</div>`).join(''):'<p class="muted">لا توجد حلقات/تاسكات بعد.</p>'}</div>`}).join('')}</div></div>`).join('') || '<div class="panel">لا توجد بيانات.</div>'; }
function renderDrawer(){let p=$('#filterPerson')?.value||'',s=$('#filterStatus')?.value||'',q=$('#searchInput')?.value.trim()||'';let arr=activeTasks().filter(t=>(!p||t.owner===p)&&(!s||t.status===s)&&(!q||JSON.stringify(t).includes(q))).sort((a,b)=>(a.due||'').localeCompare(b.due||''));$('#drawerTasks').innerHTML=arr.length?arr.map(taskHtml).join(''):'<p>لا توجد نتائج.</p>'}
function renderDeliveryAlerts(){ const box=$('#deliveryAlerts'); if(!box)return; const names=getPeopleNames(); if(!names.length){ box.innerHTML='<div class="alert-card green">لا يوجد أعضاء فريق بعد.</div>'; return; } box.innerHTML=names.map(p=>{ const tasks=activeTasks().filter(t=>t.owner===p); const todayTasks=tasks.filter(isDueToday); const lateTasks=tasks.filter(isLate); const cls=lateTasks.length?'red':(todayTasks.length?'orange':'green'); const reason=lateTasks.slice(0,2).map(t=>`${safe(t.title)}: ${safe(t.delayReason||'لم يكتب سبب التأخير')}`).join('<br>'); return `<div class="alert-card ${cls}"><div class="alert-name">${safe(p)}</div><div class="alert-counts"><span>اليوم: ${todayTasks.length}</span><span>متأخر: ${lateTasks.length}</span></div>${lateTasks.length?`<small>${reason}</small>`:'<small>لا توجد مشاكل تسليم.</small>'}</div>`; }).join(''); }

function renderTeam(){
  const grid=$('#teamGrid'); if(!grid)return;
  const users=normalizeUsers(state.users);
  const names=[...new Set([...users.map(u=>u.name), ...getPeopleNames()])];
  grid.innerHTML=names.map(name=>{
    const u=users.find(x=>x.name===name) || {name, username:name, role:'standard', passwordHash:''};
    let tasks=activeTasks().filter(t=>t.owner===name);
    let cls=tasks.filter(isLate).length?'red':(tasks.filter(isDueToday).length?'orange':'green');
    return `<div class="person-card team-status-card ${cls}"><h3>${safe(name)}</h3><p>${tasks.length} تاسكات</p><span class="pill">Username: ${safe(u.username||'-')}</span><span class="pill">Role: ${safe(u.role||'standard')}</span><span class="pill">Password: ${u.passwordHash?'محفوظة بشكل مؤمّن':'لم يتم تعيينها'}</span><span class="pill">${tasks.filter(isDone).length} تم</span><span class="pill">${tasks.filter(isDueToday).length} تسليم اليوم</span><span class="pill">${tasks.filter(isLate).length} متأخر</span><div class="person-actions"><button data-action="rename-person" data-name="${safeAttr(name)}">تعديل الحساب</button><button data-action="reset-password" data-name="${safeAttr(name)}">تغيير كلمة المرور</button><button class="danger small-danger" data-action="remove-person" data-name="${safeAttr(name)}">حذف</button></div></div>`
  }).join('') || '<div class="panel">لا يوجد أعضاء فريق بعد.</div>';
}
async function addPerson(){
  if(!isAdmin()) return alert('إضافة الأشخاص متاحة للأدمن فقط.');
  const name=(prompt('اكتب اسم عضو الفريق الجديد:')||'').trim(); if(!name) return;
  const username=(prompt('اكتب Username للحساب:', name.replace(/\s+/g,'.').toLowerCase())||'').trim(); if(!username) return;
  if(normalizeUsers(state.users).some(u=>u.username===username || u.name===name)){ alert('الاسم أو Username موجود بالفعل.'); return; }
  const password=prompt('اكتب Password للحساب — 8 أحرف على الأقل:')||''; if(password.length<8) return alert('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
  const roleRaw=(prompt('نوع الحساب: اكتب admin أو standard','standard')||'standard').trim().toLowerCase();
  const role=roleRaw==='admin'?'admin':'standard';
  state.users.push({id:crypto.randomUUID(),name,username,passwordHash:await hashPassword(password),role,isActive:true,createdAt:new Date().toISOString()});
  syncPeopleFromUsers();
  await save();
}
async function renamePerson(oldName){
  if(!isAdmin()) return alert('تعديل الأشخاص متاح للأدمن فقط.');
  const user=getUserByName(oldName);
  const name=(prompt('تعديل اسم عضو الفريق:', oldName)||'').trim(); if(!name) return;
  const username=(prompt('تعديل Username:', user?.username||oldName)||'').trim(); if(!username) return;
  const roleRaw=(prompt('نوع الحساب: admin أو standard', user?.role||'standard')||'standard').trim().toLowerCase();
  const role=roleRaw==='admin'?'admin':'standard';
  const dup=normalizeUsers(state.users).some(u=>(u.username===username || u.name===name) && u.name!==oldName && u.username!==user?.username);
  if(dup){ alert('الاسم أو Username مستخدم بالفعل.'); return; }
  if(user){ user.name=name; user.username=username; user.role=role; user.isActive=true; }
  else state.users.push({id:crypto.randomUUID(),name,username,passwordHash:'',role,isActive:true,createdAt:new Date().toISOString()});
  state.people=getPeopleNames().map(p=>p===oldName?name:p);
  state.tasks.forEach(t=>{ if(t.owner===oldName) t.owner=name; if(t.deliveredBy===oldName) t.deliveredBy=name; });
  state.uploads.forEach(u=>{ if(u.by===oldName) u.by=name; });
  syncPeopleFromUsers();
  await save();
}
async function removePerson(name){
  if(!isAdmin()) return alert('حذف الأشخاص متاح للأدمن فقط.');
  if(name===DEFAULT_ADMIN.name) return alert('لا يمكن حذف حساب الأدمن الأساسي.');
  const assigned=state.tasks.filter(t=>t.owner===name && !isDone(t)).length;
  if(assigned && !confirm(`${name} عليه ${assigned} تاسك غير منتهي. هل تريد إيقاف الحساب مع ترك التاسكات باسمه؟`)) return;
  if(!assigned && !confirm(`حذف / إيقاف ${name} من الفريق؟`)) return;
  state.people=getPeopleNames().filter(p=>p!==name);
  state.users=(state.users||[]).map(u=>u.name===name?{...u,isActive:false}:u);
  await save();
}
function renderStats(){let t=activeTasks();$('#statTasks').textContent=t.length;$('#statDone').textContent=t.filter(isDone).length;$('#statLate').textContent=t.filter(isLate).length}
function renderUploads(){ const list=$('#uploadsList'); if(!list)return; list.innerHTML=(state.uploads||[]).map(u=>`<div class="upload-card"><h3>${safe(u.name)}</h3><div class="upload-meta"><span>${safe(u.channel)}</span><span>${safe(u.program)}</span><span>حلقة: ${safe(u.episode||'-')}</span><span>رفع: ${safe(u.by)}</span><span>${safe(u.createdAtText||'')}</span>${u.taskTitle?`<span>تاسك: ${safe(u.taskTitle)}</span>`:''}</div>${u.link?`<p><a href="${safeAttr(u.link)}" target="_blank">فتح الرابط</a></p>`:''}${u.githubPath?`<p class="muted">GitHub: ${safe(u.githubPath)}</p>`:''}${u.notes?`<small>${safe(u.notes)}</small>`:''}</div>`).join('') || '<div class="panel">لا توجد مرفوعات بعد.</div>'; }
function renderMyTasks(){
  const box=$('#myTasksList'); if(!box)return;
  const me=currentUser();
  if(!me){ box.innerHTML='<div class="panel">سجل الدخول أولاً.</div>'; return; }
  const arr=activeTasks().filter(t=>t.owner===me.name).sort((a,b)=>(a.due||'').localeCompare(b.due||''));
  box.innerHTML=arr.length?arr.map(taskHtml).join(''):'<div class="panel">لا توجد تاسكات مخصصة لحسابك.</div>';
}
function openUploadDialog(){ fillSelects(); $('#uploadForm').reset(); updateUploadPrograms(); const me=currentUser(); if(me && !isAdmin()){ $('#uploadBy').value=me.name; $('#uploadBy').disabled=true; } $('#uploadDialog').showModal(); }
async function saveUploadForm(e){
  e.preventDefault();
  const file=$('#uploadFile').files[0]; let github=null; const linkedTaskId=$('#uploadTask').value; const linkedTask=state.tasks.find(t=>t.id===linkedTaskId);
  const me=currentUser();
  if(!isAdmin() && linkedTask && linkedTask.owner!==me?.name) return alert('يمكنك رفع ملفات لتاسكاتك فقط.');
  const meta={channel:$('#uploadChannel').value,program:$('#uploadProgram').value,episode:$('#uploadEpisode').value,name:$('#uploadName').value};
  try{github=await uploadFileDirectToGithub(file,meta)}catch(err){console.error(err);alert('تم حفظ السجل، لكن رفع الملف على GitHub لم يكتمل. اتأكد من التوكن وصلاحية Contents Read/Write.')}
  const byName=(!isAdmin() && me)?me.name:$('#uploadBy').value;
  const item={id:crypto.randomUUID(),name:$('#uploadName').value,channel:$('#uploadChannel').value,program:$('#uploadProgram').value,episode:$('#uploadEpisode').value,by:byName,taskId:linkedTaskId,taskTitle:linkedTask?.title||'',link:$('#uploadLink').value || github?.url || '',githubPath:github?.path || '',notes:$('#uploadNotes').value,createdAt:new Date().toISOString(),createdAtText:new Date().toLocaleString('ar-EG')};
  state.uploads=[item,...(state.uploads||[])];
  if(linkedTask){ linkedTask.status='تم التسليم'; linkedTask.deliveredAt=item.createdAt; linkedTask.deliveredBy=item.by; linkedTask.deliveredUploadId=item.id; linkedTask.updatedAt=item.createdAt; linkedTask.delayReason=''; }
  $('#uploadDialog').close(); await save();
}
function renderAll(){state=normalizeState(state);syncPeopleFromUsers();renderChannels();fillSelects();renderDaily();renderCalendar();renderFlow();renderDrawer();renderTeam();renderStats();renderUploads();renderDeliveryAlerts();renderMyTasks();applyRolePermissions();}
function bindEvents(){
  $$('.nav-btn').forEach(b=>b.addEventListener('click',()=>{$$('.nav-btn').forEach(x=>x.classList.remove('active'));b.classList.add('active');$$('.tab').forEach(t=>t.classList.remove('active'));$('#'+b.dataset.tab).classList.add('active');$('#pageTitle').textContent=b.textContent;renderAll()}));
  $('#indexBtn')?.addEventListener('click',()=>$('#drawer').classList.add('open'));
  $('#closeDrawer')?.addEventListener('click',()=>$('#drawer').classList.remove('open'));
  ['filterPerson','filterStatus','searchInput','dailyDate','calendarMonth','flowFilter'].forEach(id=>$('#'+id)?.addEventListener('input',renderAll));
  $('#todayBtn')?.addEventListener('click',()=>{$('#calendarMonth').value=monthNow();renderCalendar()});
  $('#exportBtn')?.addEventListener('click',()=>{let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));a.download='brivviant-platform-data.json';a.click()});
  $('#importInput')?.addEventListener('change',e=>{let f=e.target.files[0];if(!f)return;let r=new FileReader();r.onload=async()=>{state=normalizeState(JSON.parse(r.result));await ensureDefaultAdmin();await save()};r.readAsText(f)});
  $('#saveTask')?.addEventListener('click',saveTaskForm);
  $('#deleteTask')?.addEventListener('click',archiveFromDialog);
  $('#cancelTask')?.addEventListener('click',()=>$('#taskDialog').close());
  $('#addPersonBtn')?.addEventListener('click',addPerson);
  $('#openUploadDialog')?.addEventListener('click',openUploadDialog);
  $('#cancelUpload')?.addEventListener('click',()=>$('#uploadDialog').close());
  $('#uploadChannel')?.addEventListener('change',updateUploadPrograms);
  $('#uploadProgram')?.addEventListener('change',updateUploadTasks);
  $('#uploadEpisode')?.addEventListener('input',updateUploadTasks);
  $('#saveUpload')?.addEventListener('click',saveUploadForm);
  document.addEventListener('click',async e=>{
    const el=e.target.closest('[data-action]'); if(!el)return;
    const a=el.dataset.action;
    if((a==='open-task-dialog'||a==='edit-task'||a==='archive-task'||a==='delete-calendar'||a==='rename-person'||a==='remove-person'||a==='reset-password') && !isAdmin()){
      if(a!=='reset-password') return alert('هذا الإجراء متاح للأدمن فقط.');
    }
    if(a==='open-channel') openChannel(el.dataset.channel);
    if(a==='open-task-dialog') openTaskDialog(el.dataset.channel,el.dataset.program);
    if(a==='show-program-tasks') showProgramTasks(el.dataset.channel,el.dataset.program);
    if(a==='edit-task') editTask(el.dataset.id);
    if(a==='mark-done') await markTaskDone(el.dataset.id);
    if(a==='archive-task') await archiveTaskFromLists(el.dataset.id);
    if(a==='delete-calendar') { e.stopPropagation(); await deleteTaskFromCalendar(el.dataset.id); }
    if(a==='save-delay') await saveDelayReasonFromCard(el,el.dataset.id);
    if(a==='rename-person') await renamePerson(el.dataset.name);
    if(a==='remove-person') await removePerson(el.dataset.name);
    if(a==='reset-password') await resetPasswordForUser(el.dataset.name);
  });
}

async function resetPasswordForUser(name){
  const me=currentUser();
  const target=getUserByName(name);
  if(!target) return alert('الحساب غير موجود.');
  if(!isAdmin() && me?.username!==target.username) return alert('يمكنك تغيير كلمة مرور حسابك فقط.');
  const current=prompt('اكتب كلمة المرور الحالية للتأكيد:'); if(!current) return;
  const currentHash=await hashPassword(current);
  if(currentHash!==target.passwordHash && current !== DEFAULT_ADMIN.password) return alert('كلمة المرور الحالية غير صحيحة.');
  const next=prompt('اكتب كلمة المرور الجديدة — 8 أحرف على الأقل:'); if(!next || next.length<8) return alert('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
  const confirmPass=prompt('أعد كتابة كلمة المرور الجديدة:'); if(next!==confirmPass) return alert('كلمتا المرور غير متطابقتين.');
  target.passwordHash=await hashPassword(next);
  delete target.password;
  await save();
  alert('تم تغيير كلمة المرور بشكل آمن.');
}

function applyRolePermissions(){
  const admin=isAdmin();
  document.body.classList.toggle('is-admin', admin);
  document.body.classList.toggle('is-standard', !admin);
  $$('[data-action="open-task-dialog"], #addPersonBtn, [data-action="rename-person"], [data-action="remove-person"], [data-action="archive-task"], .calendar-delete-btn').forEach(el=>{ el.classList.toggle('restricted', !admin); });
  $$('[data-action="edit-task"]').forEach(el=>{ el.classList.toggle('restricted', !admin); });
  const me=currentUser();
  if($('#uploadBy') && me && !admin){ $('#uploadBy').value=me.name; $('#uploadBy').disabled=true; } else if($('#uploadBy')) $('#uploadBy').disabled=false;
}
async function login(){
  await ensureDefaultAdmin();
  const err=$('#loginError');
  const username=($('#loginUsername')?.value||'').trim();
  const password=$('#loginPassword')?.value||'';
  const user=normalizeUsers(state.users).find(u=>u.username===username && u.isActive!==false);
  const passHash=await hashPassword(password);
  if(!user || (user.passwordHash && user.passwordHash!==passHash) || (!user.passwordHash && username!==DEFAULT_ADMIN.username)){
    if(err) err.textContent='Username أو Password غير صحيح';
    return;
  }
  setSession({username:user.username,name:user.name,role:user.role});
  $('#loginOverlay').style.display='none';
  applyRolePermissions(); renderAll();
}
async function showForgotPassword(){
  await ensureDefaultAdmin();
  const username=(prompt('اكتب Username:')||'').trim(); if(!username) return;
  const user=normalizeUsers(state.users).find(u=>u.username===username && u.isActive!==false);
  if(!user) return alert('الحساب غير موجود.');
  const current=prompt('اكتب كلمة المرور الحالية للتأكيد:'); if(!current) return;
  const currentHash=await hashPassword(current);
  if(user.passwordHash!==currentHash && !(username===DEFAULT_ADMIN.username && current===DEFAULT_ADMIN.password)) return alert('كلمة المرور الحالية غير صحيحة.');
  const next=prompt('كلمة المرور الجديدة — 8 أحرف على الأقل:'); if(!next || next.length<8) return alert('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
  const confirmPass=prompt('أعد كتابة كلمة المرور الجديدة:'); if(next!==confirmPass) return alert('كلمتا المرور غير متطابقتين.');
  const real=(state.users||[]).find(u=>u.username===username); real.passwordHash=await hashPassword(next); delete real.password;
  await save();
  alert('تم تغيير كلمة المرور. سجل الدخول بالكلمة الجديدة.');
}

async function boot(){
  await ensureDefaultAdmin();
  $('#dailyDate').value=today(); $('#calendarMonth').value=monthNow();
  bindEvents();
  $('#loginForm')?.addEventListener('submit',e=>{ e.preventDefault(); login(); });
  $('#loginBtn')?.addEventListener('click',e=>{ e.preventDefault(); login(); });
  $('#loginPassword')?.addEventListener('keydown',e=>{ if(e.key==='Enter') login(); });
  $('#forgotPasswordBtn')?.addEventListener('click',showForgotPassword);
  await initOnline();
  await ensureDefaultAdmin();
  const session=currentSession();
  if(session && normalizeUsers(state.users).some(u=>u.username===session.username && u.isActive!==false)) $('#loginOverlay').style.display='none';
  else $('#loginOverlay').style.display='flex';
  applyRolePermissions(); renderAll();
}
boot();
