import{initializeApp}from'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import{getAuth,signInWithEmailAndPassword,onAuthStateChanged,signOut,setPersistence,browserLocalPersistence}from'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import{getFirestore,collection,getDocs,query,where,orderBy,limit,Timestamp}from'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import{firebaseConfig,OWNER_UID}from'./firebase-config.js';import{pageLabel}from'./sites.js';
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),$=s=>document.querySelector(s);let current='summary',events=[];setPersistence(auth,browserLocalPersistence).catch(()=>{});
$('#loginForm').onsubmit=async e=>{e.preventDefault();$('#loginError').textContent='';try{const c=await signInWithEmailAndPassword(auth,$('#email').value.trim(),$('#password').value);if(c.user.uid!==OWNER_UID){await signOut(auth);throw Error('Този профил няма достъп.')}}catch(x){$('#loginError').textContent=x.code==='auth/invalid-credential'?'Грешен имейл или парола.':x.message}};
$('#logoutBtn').onclick=()=>signOut(auth);$('#mobileMenu').onclick=()=>$('#sidebar').classList.toggle('open');document.querySelectorAll('.nav button').forEach(b=>b.onclick=()=>{current=b.dataset.view;document.querySelectorAll('.nav button').forEach(x=>x.classList.toggle('active',x===b));$('#sidebar').classList.remove('open');render()});$('#siteFilter').onchange=render;$('#periodFilter').onchange=()=>{let c=$('#periodFilter').value==='custom';$('#dateFrom').classList.toggle('hidden',!c);$('#dateTo').classList.toggle('hidden',!c);if(!c)load()};$('#dateFrom').onchange=load;$('#dateTo').onchange=load;$('#refreshBtn').onclick=load;
onAuthStateChanged(auth,u=>{const ok=u&&u.uid===OWNER_UID;$('#loginScreen').classList.toggle('hidden',ok);$('#app').classList.toggle('hidden',!ok);if(ok){$('#userEmail').textContent=u.email||'';load()}});
function range(){let n=new Date(),s=new Date(n),e=new Date(n);e.setHours(23,59,59,999);let p=$('#periodFilter').value;if(p==='today')s.setHours(0,0,0,0);if(p==='yesterday'){s.setDate(s.getDate()-1);s.setHours(0,0,0,0);e.setDate(e.getDate()-1)}if(p==='7d'){s.setDate(s.getDate()-6);s.setHours(0,0,0,0)}if(p==='30d'){s.setDate(s.getDate()-29);s.setHours(0,0,0,0)}if(p==='month'){s.setDate(1);s.setHours(0,0,0,0)}if(p==='custom'){if($('#dateFrom').value)s=new Date($('#dateFrom').value+'T00:00:00');if($('#dateTo').value)e=new Date($('#dateTo').value+'T23:59:59')}return{s,e}}
async function load(){$('#view').innerHTML='<div class="card empty">Зареждане...</div>';try{let{x:s}= {x:range().s},r=range();const q=query(collection(db,'analytics_events'),where('timestamp','>=',Timestamp.fromDate(r.s)),where('timestamp','<=',Timestamp.fromDate(r.e)),orderBy('timestamp','desc'),limit(10000)),snap=await getDocs(q);events=snap.docs.map(d=>({id:d.id,...d.data(),date:d.data().timestamp?.toDate?.()||new Date()}));render()}catch(x){$('#view').innerHTML=`<div class="card"><h2>Няма достъп до данните</h2><p class="error">${esc(x.message)}</p></div>`}}
function data(){let s=$('#siteFilter').value;return s==='all'?events:events.filter(e=>e.site===s)}const by=(a,t)=>a.filter(e=>e.eventType===t),uniq=(a,k)=>new Set(a.map(x=>x[k]).filter(Boolean)).size,esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])),time=n=>{n=Math.round(n||0);return n<60?n+' сек.':`${Math.floor(n/60)}:${String(n%60).padStart(2,'0')} мин.`},pct=(a,b)=>b?((a/b)*100).toFixed(1)+'%':'0%';
function sum(a){let p=by(a,'page_view'),ss=uniq(a,'sessionId'),ph=by(a,'phone_click').length,v=by(a,'viber_click').length,f=by(a,'form_submit').length,d=by(a,'session_end').map(x=>+x.activeSeconds||0),avg=d.length?d.reduce((x,y)=>x+y,0)/d.length:0;return{pages:p.length,sessions:ss,phone:ph,viber:v,forms:f,actions:ph+v+f,avg,conv:pct(ph+v+f,ss)}}function group(a,key){let m=new Map;a.forEach(e=>{let k=typeof key==='function'?key(e):(e[key]||'Неизвестно');m.set(k,(m.get(k)||[]).concat(e))});return[...m.entries()]}
const metric=(l,v,s='')=>`<div class="card"><div class="metric-label">${l}</div><div class="metric-value">${v}</div><div class="metric-sub">${s}</div></div>`,head=(t,s)=>`<h1>${t}</h1><p class="subtitle">${s}</p>`,table=(h,r)=>`<div class="table-wrap"><table><thead><tr>${h.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${r.length?r.join(''):`<tr><td colspan="${h.length}" class="empty">Няма данни.</td></tr>`}</tbody></table></div>`;
function render(){let a=data(),s=sum(a),map={summary,visits,results,pages,sources,audience,behavior,compare,status,settings};$('#view').innerHTML=map[current](a,s);requestAnimationFrame(()=>{chart();bindDeviceControls()})}
function summary(a,s){let pr=group(by(a,'page_view'),e=>e.pagePath).map(([k,v])=>({k,s:sum(a.filter(e=>e.pagePath===k))})).sort((x,y)=>y.s.actions-x.s.actions||y.s.pages-x.s.pages).slice(0,10).map(x=>`<tr><td>${esc(pageLabel(x.k))}</td><td>${x.s.pages}</td><td>${x.s.actions}</td><td>${x.s.conv}</td></tr>`),sr=group(by(a,'page_view'),e=>e.source||'direct').map(([k,v])=>`<tr><td>${esc(k)}</td><td>${uniq(v,'sessionId')}</td><td>${sum(a.filter(e=>(e.source||'direct')===k)).actions}</td></tr>`);return head('Обобщение','Най-важното за трафика и запитванията.')+`<div class="cards">${metric('Сесии',s.sessions)}${metric('Страници',s.pages)}${metric('Средно време',time(s.avg))}${metric('Общо действия',s.actions)}${metric('Телефон',s.phone)}${metric('Viber',s.viber)}${metric('Форми',s.forms)}${metric('Конверсия',s.conv)}</div><div class="grid-2"><div class="card"><h2>Посещения по дни</h2><div class="chart-wrap"><canvas id="mainChart"></canvas></div></div><div class="card"><h2>Източници</h2>${table(['Източник','Сесии','Действия'],sr)}</div></div><div class="card" style="margin-top:14px"><h2>Най-силни страници</h2>${table(['Страница','Отваряния','Действия','Конверсия'],pr)}</div>`}
function visits(a,s){return head('Посещения','Обем и активно време.')+`<div class="cards">${metric('Сесии',s.sessions)}${metric('Страници',s.pages)}${metric('Страници / сесия',s.sessions?(s.pages/s.sessions).toFixed(2):0)}${metric('Средно време',time(s.avg))}</div><div class="card" style="margin-top:14px"><h2>Посещения по дни</h2><div class="chart-wrap"><canvas id="mainChart"></canvas></div></div>`}
function results(a,s){let r=a.filter(e=>['phone_click','viber_click','form_submit'].includes(e.eventType)).map(e=>`<tr><td>${e.date.toLocaleString('bg-BG')}</td><td>${label(e.eventType)}</td><td>${esc(pageLabel(e.pagePath))}</td><td>${esc(e.source||'direct')}</td><td>${esc(e.device||'')}</td></tr>`);return head('Резултати','Телефон, Viber и форми.')+`<div class="cards">${metric('Телефон',s.phone)}${metric('Viber',s.viber)}${metric('Форми',s.forms)}${metric('Конверсия',s.conv)}</div><div class="card" style="margin-top:14px">${table(['Дата','Действие','Страница','Източник','Устройство'],r)}</div>`}
function pages(a){let r=group(a,e=>e.pagePath||'/').map(([k,v])=>({k,s:sum(v)})).sort((x,y)=>y.s.pages-x.s.pages).map(x=>`<tr><td>${esc(pageLabel(x.k))}</td><td>${x.s.sessions}</td><td>${x.s.pages}</td><td>${time(x.s.avg)}</td><td>${x.s.actions}</td><td>${x.s.conv}</td></tr>`);return head('Страници','Коя страница работи най-добре.')+`<div class="card">${table(['Страница','Сесии','Отваряния','Време','Действия','Конверсия'],r)}</div>`}
function sources(a){let r=group(by(a,'page_view'),e=>e.source||'direct').map(([k,v])=>{let s=sum(a.filter(e=>(e.source||'direct')===k));return`<tr><td>${esc(k)}</td><td>${s.sessions}</td><td>${s.pages}</td><td>${s.actions}</td><td>${s.conv}</td></tr>`});return head('Източници','Откъде идват посетителите.')+`<div class="card">${table(['Източник','Сесии','Страници','Действия','Конверсия'],r)}</div>`}
function audience(a){let rows=k=>group(by(a,'page_view'),e=>e[k]||'Неизвестно').map(([x,v])=>`<tr><td>${esc(x)}</td><td>${uniq(v,'sessionId')}</td></tr>`);return head('Аудитория','Обобщена техническа статистика.')+`<div class="grid-3"><div class="card"><h2>Държави</h2>${table(['Държава','Сесии'],rows('country'))}</div><div class="card"><h2>Устройства</h2>${table(['Устройство','Сесии'],rows('device'))}</div><div class="card"><h2>Браузъри</h2>${table(['Браузър','Сесии'],rows('browser'))}</div></div>`}
function behavior(a){let sr=[25,50,75,90].map(n=>`<tr><td>${n}%</td><td>${a.filter(e=>e.eventType==='scroll'&&+e.scrollDepth===n).length}</td></tr>`);return head('Поведение','Скрол и взаимодействия.')+`<div class="card">${table(['Скрол','Събития'],sr)}</div>`}
function compare(a){let r=group(a,e=>e.site||'other').map(([k,v])=>{let s=sum(v);return`<tr><td>${esc(k)}</td><td>${s.sessions}</td><td>${s.pages}</td><td>${s.actions}</td><td>${s.conv}</td></tr>`});return head('Сравнения','София, Лом, Монтана и езикови версии.')+`<div class="card">${table(['Сайт','Сесии','Страници','Действия','Конверсия'],r)}</div>`}
function status(a){let r=['sofia','lom','montana','lom-en','lom-de'].map(k=>{let e=a.filter(x=>x.site===k).sort((x,y)=>y.date-x.date)[0];return`<tr><td>${k}</td><td>${e?e.date.toLocaleString('bg-BG'):'Няма данни'}</td></tr>`});return head('Системен статус','Последно събитие по сайт.')+`<div class="card">${table(['Сайт','Последно събитие'],r)}</div>`}
function settings(){return head('Настройки','Памет, поверителност и изключване на собствените устройства.')+`<div class="grid-2"><div class="card"><h2>Моите устройства</h2><p>Изключи посещенията си от статистиката на всички страници в ivanov-remonti.com.</p><div id="deviceStatusBox" class="device-status unknown"><strong>Статус:</strong> <span id="deviceStatusText">Натисни „Провери статуса“.</span></div><div class="notice">Настройката се прави по веднъж на всеки телефон, компютър и браузър. След изчистване на данните на браузъра трябва да се направи отново.</div><div class="settings-action"><button id="excludeDeviceBtn" class="action-primary" type="button">Изключи това устройство</button><button id="checkDeviceBtn" class="action-secondary" type="button">Провери статуса</button><button id="includeDeviceBtn" class="action-secondary" type="button">Включи отново</button></div><p id="deviceActionMessage" class="device-action-message" aria-live="polite"></p></div><div class="card"><h2>Памет</h2><p>Подробни събития: 90 дни</p><p>Дневни обобщения: 24 месеца</p><p>Месечни обобщения: 5 години</p></div><div class="card"><h2>Поверителност</h2><p>Без име, телефон, пълен IP адрес и fingerprint.</p><p>Временни сесии само за обща статистика.</p></div></div>`}

const DEVICE_STATE_KEY='ivanov_dashboard_device_state';
const SITE_ORIGIN='https://ivanov-remonti.com';

function savedDeviceState(){
  try{return localStorage.getItem(DEVICE_STATE_KEY)||'unknown'}catch(e){return'unknown'}
}
function saveDeviceState(value){
  try{localStorage.setItem(DEVICE_STATE_KEY,value)}catch(e){}
}
function showDeviceState(value,message=''){
  const box=$('#deviceStatusBox'),text=$('#deviceStatusText'),note=$('#deviceActionMessage');
  if(!box||!text)return;
  box.classList.remove('excluded','included','unknown');
  box.classList.add(value==='excluded'?'excluded':value==='included'?'included':'unknown');
  text.textContent=value==='excluded'
    ?'Изключено — този браузър не се отчита.'
    :value==='included'
      ?'Включено — този браузър се отчита.'
      :'Статусът още не е проверен.';
  if(note)note.textContent=message;
}
function openDeviceAction(action){
  const url=`${SITE_ORIGIN}/?ivanov_device_action=${encodeURIComponent(action)}&t=${Date.now()}`;
  const popup=window.open(url,'ivanovDeviceAction','popup=yes,width=560,height=650');
  const note=$('#deviceActionMessage');
  if(note)note.textContent=action==='status'?'Проверявам статуса…':'Изпълнявам настройката…';
  if(!popup&&note)note.textContent='Браузърът блокира прозореца. Разреши изскачащите прозорци и натисни отново.';
}
function bindDeviceControls(){
  if(current!=='settings')return;
  showDeviceState(savedDeviceState());
  const exclude=$('#excludeDeviceBtn'),include=$('#includeDeviceBtn'),check=$('#checkDeviceBtn');
  if(exclude)exclude.onclick=()=>openDeviceAction('exclude');
  if(include)include.onclick=()=>openDeviceAction('include');
  if(check)check.onclick=()=>openDeviceAction('status');
}
window.addEventListener('message',event=>{
  if(event.origin!==SITE_ORIGIN)return;
  const data=event.data;
  if(!data||data.type!=='ivanov-analytics-device-status')return;
  const state=data.excluded?'excluded':'included';
  saveDeviceState(state);
  showDeviceState(state,data.excluded?'Готово — твоите посещения няма да се записват.':'Готово — отчитането е включено.');
});

function label(t){return({phone_click:'Телефон',viber_click:'Viber',form_submit:'Форма'})[t]||t}
function chart(){let c=$('#mainChart');if(!c)return;let a=by(data(),'page_view'),g=group(a,e=>e.date.toISOString().slice(0,10)).sort((x,y)=>x[0].localeCompare(y[0])),vals=g.map(x=>x[1].length),labs=g.map(x=>x[0].slice(5)),r=c.getBoundingClientRect(),d=devicePixelRatio||1;c.width=r.width*d;c.height=r.height*d;let x=c.getContext('2d');x.scale(d,d);let w=r.width,h=r.height,p=34,m=Math.max(...vals,1);x.clearRect(0,0,w,h);x.strokeStyle='#dbe4ee';for(let i=0;i<5;i++){let y=p+(h-2*p)*i/4;x.beginPath();x.moveTo(p,y);x.lineTo(w-p,y);x.stroke()}if(!vals.length){x.fillStyle='#6e7f93';x.fillText('Няма данни',p,h/2);return}x.strokeStyle='#d7a43b';x.lineWidth=3;x.beginPath();vals.forEach((v,i)=>{let xx=p+(w-2*p)*(vals.length===1?.5:i/(vals.length-1)),yy=h-p-(h-2*p)*v/m;i?x.lineTo(xx,yy):x.moveTo(xx,yy)});x.stroke();x.fillStyle='#6e7f93';x.font='11px system-ui';labs.forEach((l,i)=>{if(labs.length>10&&i%Math.ceil(labs.length/8))return;let xx=p+(w-2*p)*(labs.length===1?.5:i/(labs.length-1));x.fillText(l,xx-10,h-10)})}
