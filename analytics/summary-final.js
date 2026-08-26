import{getApp}from'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import{getFirestore,collection,getDocsFromCache,query,where,orderBy,limit,Timestamp}from'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const view=document.querySelector('#view');
const db=getFirestore(getApp());
const SELF_SOURCE=/^(www\.)?ivanov-remonti\.com$/i;
const BUSINESS=new Set(['phone_click','viber_click','form_success']);
const INTEREST=new Set(['gallery_open','video_play','faq_open','price_open','contact_open']);
const ACTIONS={gallery_open:'Галерия',video_play:'Видео',price_open:'Цени',faq_open:'FAQ',contact_open:'Контакти'};
let token=0,last=null,pageNames=new Map();

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const percent=(a,b)=>b?a/b*100:0;
const percentText=v=>`${v.toFixed(1)}%`;
const dayKey=d=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Sofia',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const shortDay=d=>new Intl.DateTimeFormat('bg-BG',{timeZone:'Europe/Sofia',day:'2-digit',month:'2-digit'}).format(d);
const hour=d=>+new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Sofia',hour:'2-digit',hourCycle:'h23'}).format(d);

function normalizePath(value){
  let path=String(value||'/').split('?')[0].split('#')[0]||'/';
  if(!path.startsWith('/'))path='/'+path;
  while(path.includes('//'))path=path.replace('//','/');
  return path;
}

function currentRange(){
  const now=new Date(),start=new Date(now),end=new Date(now);end.setHours(23,59,59,999);
  const period=document.querySelector('#periodFilter')?.value||'7d';
  if(period==='today')start.setHours(0,0,0,0);
  if(period==='yesterday'){start.setDate(start.getDate()-1);start.setHours(0,0,0,0);end.setDate(end.getDate()-1)}
  if(period==='7d'){start.setDate(start.getDate()-6);start.setHours(0,0,0,0)}
  if(period==='30d'){start.setDate(start.getDate()-29);start.setHours(0,0,0,0)}
  if(period==='month'){start.setDate(1);start.setHours(0,0,0,0)}
  if(period==='custom'){
    const from=document.querySelector('#dateFrom')?.value,to=document.querySelector('#dateTo')?.value;
    if(from)start.setTime(new Date(from+'T00:00:00').getTime());
    if(to)end.setTime(new Date(to+'T23:59:59.999').getTime());
  }
  return{start,end};
}
function previousRange(r){const duration=r.end-r.start+1,end=new Date(r.start.getTime()-1);return{start:new Date(end.getTime()-duration+1),end}}
async function cachedEvents(r){
  const q=query(collection(db,'analytics_events'),where('timestamp','>=',Timestamp.fromDate(r.start)),where('timestamp','<=',Timestamp.fromDate(r.end)),orderBy('timestamp','desc'),limit(10000));
  const snap=await getDocsFromCache(q);
  return snap.docs.map(doc=>{const x=doc.data();return{id:doc.id,...x,pagePath:normalizePath(x.pagePath||'/'),date:x.timestamp?.toDate?.()||new Date()}});
}

function sessionsFrom(items){
  const grouped=new Map();
  items.forEach(e=>{const id=e.sessionId||e.id;if(!grouped.has(id))grouped.set(id,[]);grouped.get(id).push(e)});
  return[...grouped.entries()].map(([id,raw])=>{
    const events=[...raw].sort((a,b)=>a.date-b.date),views=events.filter(e=>e.eventType==='page_view');
    const external=views.find(e=>e.source&&!SELF_SOURCE.test(e.source)),first=external||views[0]||events[0],geo=events.find(e=>e.eventType==='session_geo'&&e.country&&e.country!=='unknown');
    const business=events.filter(e=>BUSINESS.has(e.eventType)),interest=events.filter(e=>INTEREST.has(e.eventType));
    const active=Math.max(0,...events.filter(e=>e.eventType==='engagement'||e.eventType==='session_end').map(e=>+e.activeSeconds||0));
    const scroll=Math.max(0,...events.filter(e=>e.eventType==='scroll').map(e=>+e.scrollDepth||0));
    const pages=[...new Set(views.map(e=>e.pagePath).filter(Boolean))],span=views.length>1?views[views.length-1].date-views[0].date:0;
    const source=first?.source&&!SELF_SOURCE.test(first.source)?String(first.source):'direct',medium=String(first?.medium||'').toLowerCase();
    const browser=first?.browser||'Неизвестно',os=first?.os||'Неизвестно';
    const technical=views.length>=4&&pages.length>=3&&span<=30000&&!business.length&&!interest.length&&active<10&&scroll<25&&(String(os).toLowerCase()==='other'||String(browser).toLowerCase()==='other');
    return{id,events,views,pages,business,interest,engaged:active>=30||scroll>=50,source,medium,city:geo?.city||'unknown',country:geo?.country||'unknown',browser,os,technical,opened:(views[0]||events[0])?.date||new Date()};
  });
}
function siteFiltered(sessions){const site=document.querySelector('#siteFilter')?.value||'all';return site==='all'?sessions:sessions.filter(s=>s.events.some(e=>e.site===site))}
function stats(sessions){const client=sessions.filter(s=>s.business.length).length,interested=sessions.filter(s=>s.interest.length).length,engaged=sessions.filter(s=>s.engaged).length;return{sessions:sessions.length,engaged,interested,client,conversion:percent(client,sessions.length)}}
function trend(now,old){if(!old&&now)return{cls:'up',text:'↑ ново'};if(!old&&!now)return{cls:'flat',text:'— без промяна'};const d=(now-old)/old*100;if(Math.abs(d)<.05)return{cls:'flat',text:'— без промяна'};return{cls:d>0?'up':'down',text:`${d>0?'↑':'↓'} ${Math.abs(d).toFixed(1)}%`}}
function info(text){return`<button class="summary-info" type="button" aria-label="Пояснение" data-info="${esc(text)}">i</button>`}
function kpi(label,value,now,old,help,sub=''){const t=trend(now,old);return`<article class="card summary-kpi"><div class="summary-kpi-label">${esc(label)} ${info(help)}</div><div class="summary-kpi-value">${esc(value)}</div><div class="summary-kpi-foot"><span class="summary-trend ${t.cls}">${t.text}</span>${sub?`<small>${esc(sub)}</small>`:''}</div></article>`}

function sourceName(s){const source=String(s.source||'direct').toLowerCase();if(source==='google'&&s.medium==='cpc')return'Google Ads';if(source==='google')return'Google търсене';if(source==='direct')return'Директно посещение';if(source.includes('facebook')||source==='fb'||source.includes('l.facebook'))return'Facebook';return'Други източници'}
function cacheNames(){pageNames=new Map();document.querySelectorAll('[data-page]').forEach(n=>{const p=normalizePath(n.dataset.page||'');const label=n.textContent?.trim();if(p&&label&&!pageNames.has(p))pageNames.set(p,label)})}
function pageName(path){if(pageNames.has(path))return pageNames.get(path);if(path==='/'||path==='/index.html')return'Начална страница';return path.split('/').pop().replace('.html','').split('-').join(' ').split('_').join(' ')||'Страница'}
function pageRows(sessions){const m=new Map();sessions.forEach(s=>s.pages.forEach(path=>{if(!m.has(path))m.set(path,{path,sessions:new Set(),interest:new Set(),client:new Set()});const r=m.get(path);r.sessions.add(s.id);if(s.interest.length)r.interest.add(s.id);if(s.business.length)r.client.add(s.id)}));return[...m.values()].sort((a,b)=>b.client.size-a.client.size||b.interest.size-a.interest.size||b.sessions.size-a.sessions.size).slice(0,5)}
function sourceRows(sessions){const order=['Google Ads','Google търсене','Директно посещение','Facebook','Други източници'],m=new Map(order.map(x=>[x,[]]));sessions.forEach(s=>m.get(sourceName(s)).push(s));return order.map(label=>({label,sessions:m.get(label)})).filter(r=>r.sessions.length)}
function actionLeadsToClient(s,type){const action=s.events.find(e=>e.eventType===type);return!!action&&s.business.some(e=>e.date>=action.date)}
function actionRows(sessions){return Object.entries(ACTIONS).map(([type,label])=>{const matched=sessions.filter(s=>s.events.some(e=>e.eventType===type));return{type,label,sessions:matched.length,clients:matched.filter(s=>actionLeadsToClient(s,type)).length}})}
function geoRows(sessions){const m=new Map();sessions.filter(s=>!s.technical&&s.country!=='unknown').forEach(s=>{const key=(s.city||'unknown')+'|'+(s.country||'unknown');m.set(key,(m.get(key)||0)+1)});const all=[...m.entries()].map(([key,count])=>{const parts=key.split('|');return{city:parts[0]==='unknown'?'Неизвестен град':parts[0],country:parts[1],count}}).sort((a,b)=>b.count-a.count),rows=all.slice(0,3),other=all.slice(3).reduce((n,r)=>n+r.count,0);if(other)rows.push({city:'Други',country:'',count:other});return{rows,technical:sessions.filter(s=>s.technical).length}}
function hourRows(sessions){const buckets=[['00–06',0,6],['06–09',6,9],['09–12',9,12],['12–15',12,15],['15–18',15,18],['18–21',18,21],['21–24',21,24]];return buckets.map(([label,from,to])=>{const list=sessions.filter(s=>{const h=hour(s.opened);return h>=from&&h<to}),clients=list.filter(s=>s.business.length).length;return{label,sessions:list.length,clients,conversion:percent(clients,list.length)}}).sort((a,b)=>b.clients-a.clients||b.sessions-a.sessions).slice(0,3)}
function siteRows(sessions){const names={sofia:'София',lom:'Лом',montana:'Монтана','lom-en':'Лом EN','lom-de':'Лом DE'},m=new Map();sessions.forEach(s=>[...new Set(s.events.map(e=>e.site).filter(Boolean))].forEach(site=>{if(!m.has(site))m.set(site,{site,sessions:new Set(),clients:new Set()});m.get(site).sessions.add(s.id);if(s.business.length)m.get(site).clients.add(s.id)}));return[...m.values()].map(r=>({...r,label:names[r.site]||r.site})).sort((a,b)=>b.clients.size-a.clients.size||b.sessions.size-a.sessions.size)}

function renderChart(sessions){
  const canvas=document.querySelector('#summaryChart');if(!canvas)return;const m=new Map();sessions.forEach(s=>{const key=dayKey(s.opened);if(!m.has(key))m.set(key,{date:s.opened,sessions:0,clients:0,engaged:0,interest:0});const r=m.get(key);r.sessions++;if(s.business.length)r.clients++;if(s.engaged)r.engaged++;if(s.interest.length)r.interest++});
  const rows=[...m.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(x=>x[1]),rect=canvas.getBoundingClientRect(),dpr=devicePixelRatio||1;canvas.width=Math.max(1,rect.width*dpr);canvas.height=Math.max(1,rect.height*dpr);const c=canvas.getContext('2d');c.scale(dpr,dpr);const w=rect.width,h=rect.height,p=34;c.clearRect(0,0,w,h);c.strokeStyle='#dbe4ee';for(let i=0;i<5;i++){const y=p+(h-2*p)*i/4;c.beginPath();c.moveTo(p,y);c.lineTo(w-p,y);c.stroke()}if(!rows.length){c.fillStyle='#6e7f93';c.fillText('Няма данни',p,h/2);return}
  const max=Math.max(1,...rows.map(r=>r.sessions)),x=i=>p+(w-2*p)*(rows.length===1?.5:i/(rows.length-1)),y=v=>h-p-(h-2*p)*v/max,draw=(key,color,width)=>{c.strokeStyle=color;c.lineWidth=width;c.beginPath();rows.forEach((r,i)=>i?c.lineTo(x(i),y(r[key])):c.moveTo(x(i),y(r[key])));c.stroke()};draw('sessions','#d7a43b',3);draw('clients','#145a8d',2.5);c.fillStyle='#6e7f93';c.font='11px system-ui';rows.forEach((r,i)=>{if(rows.length>10&&i%Math.ceil(rows.length/8))return;c.fillText(shortDay(r.date),x(i)-10,h-10)});
  canvas.onclick=e=>{const px=e.clientX-canvas.getBoundingClientRect().left;let best=0,distance=Infinity;rows.forEach((r,i)=>{const d=Math.abs(x(i)-px);if(d<distance){distance=d;best=i}});const r=rows[best];popover(e.clientX,e.clientY,`<strong>${esc(shortDay(r.date))}</strong><span>${r.sessions} сесии</span><span>${r.engaged} ангажирани</span><span>${r.interest} проявили интерес</span><span>${r.clients} клиентски сесии</span><span>${percentText(percent(r.clients,r.sessions))} конверсия</span>`)};
}

function renderSummary(sessions,previous){
  const a=stats(sessions),b=stats(previous),pages=pageRows(sessions),sources=sourceRows(sessions),actions=actionRows(sessions),geo=geoRows(sessions),hours=hourRows(sessions),sites=siteRows(sessions);last={sessions,previous,pages,sources,actions,geo,hours,sites};
  view.innerHTML=`<div class="view-heading"><div><h1>Обобщение</h1><p class="subtitle">Най-важното за бизнеса за избрания период.</p></div><div class="heading-actions"><button id="summaryExport" class="action-secondary" type="button">Експорт JSON</button></div></div><div class="summary-shell" data-summary-final>
  <div class="summary-kpis">${kpi('Сесии',a.sessions,a.sessions,b.sessions,'Брой отделни посещения на сайта за избрания период.')}${kpi('Ангажирани',a.engaged,a.engaged,b.engaged,'Сесии с поне 30 секунди активно време или поне 50% скрол.')}${kpi('Проявили интерес',a.interested,a.interested,b.interested,'Сесии с действие като галерия, видео, цени, FAQ или контакти.')}${kpi('Клиентски сесии',a.client,a.client,b.client,'Уникални сесии с телефон, Viber или успешно изпратена форма. Повторни действия в една сесия не увеличават броя.')}${kpi('Конверсия',percentText(a.conversion),a.conversion,b.conversion,'Делът на всички сесии, които са стигнали до клиентско действие.',`${a.client} от ${a.sessions} сесии`)}</div>
  <section class="card summary-chart-card"><div class="summary-section-heading"><div><h2>Трафик и клиентски резултат ${info('Сравнява всички сесии с клиентските сесии по дни. Ако трафикът расте, а клиентските сесии не растат, качеството на трафика или страниците може да изискват внимание.')}</h2><p class="card-note">Сесии и клиентски сесии по дни</p></div><div class="summary-legend"><span class="all">Сесии</span><span class="client">Клиентски сесии</span></div></div><div class="chart-wrap"><canvas id="summaryChart"></canvas></div></section>
  <div class="summary-grid">
  <section class="card summary-section wide"><div class="summary-section-heading"><h2>Най-силни страници ${info('Подреждането е по клиентски сесии, след това по проявен интерес и накрая по сесии. Целта е да показва бизнес резултат, не само посещаемост.')}</h2></div><div class="summary-page-list">${pages.length?pages.map(r=>`<article class="summary-page-row"><div class="summary-page-main"><strong>${esc(pageName(r.path))}</strong><span>${r.interest.size} с интерес · ${r.client.size} клиентски сесии</span></div><div class="summary-page-sessions"><strong>${r.sessions.size}</strong><span>сесии</span></div><button class="action-secondary compact" data-open-page="${esc(r.path)}">Отвори статистика</button></article>`).join(''):'<div class="summary-empty">Няма данни за периода.</div>'}</div></section>
  <section class="card summary-section"><div class="summary-section-heading"><h2>Откъде идват посетителите ${info('Показва първоначалния разпознаваем източник за сесията. „Директно посещение“ може да означава и че надежден външен източник не е наличен.')}</h2></div><div class="summary-source-list">${sources.map(r=>`<button class="summary-source-row" data-source="${esc(r.label)}"><span><strong>${esc(r.label)}</strong><small>${r.sessions.filter(s=>s.business.length).length} клиентски сесии</small></span><b>${r.sessions.length}</b></button>`).join('')||'<div class="summary-empty">Няма данни.</div>'}</div></section>
  <section class="card summary-section wide"><div class="summary-section-heading"><h2>Какво правят посетителите ${info('Показва уникални сесии, в които е използвана съответната част на сайта. Повторните действия в една и съща сесия не увеличават броя.')}</h2></div><div class="summary-action-grid">${actions.map(r=>`<button class="summary-action-chip" data-action="${r.type}"><span>${esc(r.label)}</span><strong>${r.sessions}</strong><small>${r.clients} → клиентско действие</small></button>`).join('')}</div></section>
  <section class="card summary-section"><div class="summary-section-heading"><h2>Къде са посетителите ${info('Приблизително местоположение по мрежова информация. Градът може да е неточен при VPN, proxy, мобилен оператор или друга мрежова услуга.')}</h2></div><div class="summary-geo-list">${geo.rows.map(r=>`<button class="summary-geo-row" data-geo="${esc(r.city)}|${esc(r.country)}"><span><strong>${esc(r.city)}</strong><small>${esc(r.country)}</small></span><b>${r.count}</b></button>`).join('')}${geo.technical?`<button class="summary-geo-row technical" data-technical><span><strong>Вероятно технически трафик</strong><small>по поведение, не по държава</small></span><b>${geo.technical}</b></button>`:''}</div></section>
  <section class="card summary-section"><div class="summary-section-heading"><h2>Най-силни часове ${info('Показва часовите интервали по Europe/Sofia с най-много клиентски сесии.')}</h2></div><div class="summary-mini-list">${hours.map(r=>`<button class="summary-mini-row" data-hours><span><strong>${r.label}</strong><small>${r.sessions} сесии · ${percentText(r.conversion)} конверсия</small></span><b>${r.clients}</b></button>`).join('')}</div></section>
  <section class="card summary-section"><div class="summary-section-heading"><h2>Сайтове ${info('Сравнява сайтовете по сесии и клиентски сесии. Натисни сайт, за да филтрираш цялото табло само за него.')}</h2></div><div class="summary-mini-list">${sites.slice(0,4).map(r=>`<button class="summary-mini-row" data-site="${esc(r.site)}"><span><strong>${esc(r.label)}</strong><small>${r.clients.size} клиентски сесии</small></span><b>${r.sessions.size}</b></button>`).join('')}</div></section>
  </div></div>`;
  bind();requestAnimationFrame(()=>renderChart(sessions));
}

function bind(){
  view.querySelector('#summaryExport')?.addEventListener('click',exportJson);
  view.querySelectorAll('.summary-info').forEach(b=>b.onclick=e=>{e.stopPropagation();const r=b.getBoundingClientRect();popover(r.left+r.width/2,r.bottom,`<span>${esc(b.dataset.info)}</span>`)});
  view.querySelectorAll('[data-open-page]').forEach(b=>b.onclick=()=>openPage(b.dataset.openPage));
  view.querySelectorAll('[data-source]').forEach(b=>b.onclick=()=>openSources(b.dataset.source));
  view.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>actionDetail(b.dataset.action));
  view.querySelectorAll('[data-geo]').forEach(b=>b.onclick=()=>geoDetail(b.dataset.geo));
  view.querySelector('[data-technical]')?.addEventListener('click',technicalDetail);
  view.querySelectorAll('[data-hours]').forEach(b=>b.onclick=hoursDetail);
  view.querySelectorAll('[data-site]').forEach(b=>b.onclick=()=>{const s=document.querySelector('#siteFilter');if(s){s.value=b.dataset.site;s.dispatchEvent(new Event('change',{bubbles:true}))}});
}
function exportJson(){if(!last)return;const seen=new Set(),events=[];last.sessions.forEach(s=>s.events.forEach(e=>{const key=e.id||s.id+'|'+e.eventType+'|'+e.date?.getTime?.();if(seen.has(key))return;seen.add(key);const x={...e,date:e.date?.toISOString?.()||null};delete x.timestamp;events.push(x)}));const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),period:document.querySelector('#periodFilter')?.selectedOptions?.[0]?.textContent||'',site:document.querySelector('#siteFilter')?.value||'all',eventCount:events.length,events},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ivanov-analytics-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function openPage(path){document.querySelector('.nav button[data-view="pages"]')?.click();setTimeout(()=>[...document.querySelectorAll('[data-page]')].find(b=>normalizePath(b.dataset.page)===normalizePath(path))?.click(),0)}
function openSources(label){document.querySelector('.nav button[data-view="sources"]')?.click();setTimeout(()=>{const rows=[...document.querySelectorAll('tbody tr')],match=rows.find(r=>{const raw=r.querySelector('td')?.textContent?.trim()?.toLowerCase()||'';if(label==='Google Ads')return raw==='google';if(label==='Google търсене')return raw==='google';if(label==='Директно посещение')return raw==='direct';if(label==='Facebook')return raw.includes('facebook')||raw==='fb';return false});if(match){match.classList.add('summary-highlight');match.scrollIntoView({block:'center',behavior:'smooth'});setTimeout(()=>match.classList.remove('summary-highlight'),2200)}},50)}
function actionDetail(type){if(!last)return;const matched=last.sessions.filter(s=>s.events.some(e=>e.eventType===type)),pages=new Map(),sources=new Map();matched.forEach(s=>{s.pages.forEach(p=>pages.set(p,(pages.get(p)||0)+1));const src=sourceName(s);sources.set(src,(sources.get(src)||0)+1)});const client=matched.filter(s=>actionLeadsToClient(s,type)).length;modal(ACTIONS[type]||type,`<div class="modal-kpis"><div><strong>${matched.length}</strong><span>сесии</span></div><div><strong>${client}</strong><span>стигнали след това до клиентско действие</span></div></div><h3>Най-често на страници</h3>${detail([...pages.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([p,n])=>[pageName(p),n]))}<h3>Откъде са дошли</h3>${detail([...sources.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5))}`)}
function geoDetail(key){if(!last)return;const parts=key.split('|'),city=parts[0],country=parts[1],matched=last.sessions.filter(s=>!s.technical&&(city==='Други'||(s.city===city&&s.country===country)));modal('Местоположение',`<div class="modal-kpis"><div><strong>${matched.length}</strong><span>сесии</span></div><div><strong>${matched.filter(s=>s.business.length).length}</strong><span>клиентски сесии</span></div></div><h3>Най-силни страници</h3>${detail(pageRows(matched).map(r=>[pageName(r.path),r.sessions.size]))}`)}
function technicalDetail(){if(!last)return;const matched=last.sessions.filter(s=>s.technical);modal('Вероятно технически трафик',`<p class="card-note">Маркира се по комбинация от много различни страници за кратко време и липса на нормални сигнали за взаимодействие. Данните не се изтриват.</p>${detail(matched.slice(0,20).map(s=>[(s.city==='unknown'?'Неизвестен град':s.city)+', '+(s.country==='unknown'?'—':s.country)+' · '+s.pages.length+' страници',shortDay(s.opened)]))}`)}
function hoursDetail(){if(!last)return;const buckets=[['00–06',0,6],['06–09',6,9],['09–12',9,12],['12–15',12,15],['15–18',15,18],['18–21',18,21],['21–24',21,24]].map(([label,from,to])=>{const list=last.sessions.filter(s=>{const h=hour(s.opened);return h>=from&&h<to}),clients=list.filter(s=>s.business.length).length;return[label,`${list.length} сесии · ${clients} клиентски · ${percentText(percent(clients,list.length))}`]});modal('Анализ по часове',detail(buckets))}
function detail(rows){return`<div class="summary-detail-list">${rows.length?rows.map(([l,v])=>`<div><span>${esc(l)}</span><strong>${esc(v)}</strong></div>`).join(''):'<p class="summary-empty">Няма данни.</p>'}</div>`}
function modal(title,body){document.querySelector('.summary-modal')?.remove();const m=document.createElement('div');m.className='summary-modal';m.innerHTML=`<div class="summary-modal-card"><div class="summary-modal-head"><h2>${esc(title)}</h2><button type="button" aria-label="Затвори">×</button></div>${body}</div>`;document.body.appendChild(m);m.onclick=e=>{if(e.target===m||e.target.closest('.summary-modal-head button'))m.remove()}}
function popover(x,y,html){document.querySelector('.summary-popover')?.remove();const p=document.createElement('div');p.className='summary-popover';p.innerHTML=html;document.body.appendChild(p);const w=p.offsetWidth,h=p.offsetHeight;p.style.left=Math.max(8,Math.min(innerWidth-w-8,x-w/2))+'px';p.style.top=Math.max(8,Math.min(innerHeight-h-8,y+8))+'px';setTimeout(()=>document.addEventListener('click',()=>p.remove(),{once:true}),0)}

async function enhance(){
  const h=view?.querySelector('.view-heading h1');if(!h||h.textContent.trim()!=='Обобщение'||view.querySelector('[data-summary-final]'))return;
  const id=++token;cacheNames();
  try{const r=currentRange(),data=await Promise.all([cachedEvents(r),cachedEvents(previousRange(r))]);if(id!==token)return;renderSummary(siteFiltered(sessionsFrom(data[0])),siteFiltered(sessionsFrom(data[1])))}catch(error){console.warn('Final summary cache renderer unavailable; base summary remains active.',error)}
}
const observer=new MutationObserver(enhance);if(view)observer.observe(view,{childList:true,subtree:true});enhance();
