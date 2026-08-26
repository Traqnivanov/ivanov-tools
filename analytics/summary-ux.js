import{getApp}from'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import{getFirestore,collection,getDocsFromCache,query,where,orderBy,limit,Timestamp}from'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const view=document.querySelector('#view');
const db=getFirestore(getApp());
const SELF_SOURCE=/^(www\.)?ivanov-remonti\.com$/i;
const BUSINESS_TYPES=new Set(['phone_click','viber_click','form_success']);
const INTEREST_TYPES=new Set(['gallery_open','video_play','faq_open','price_open','contact_open']);
const ACTION_LABELS={gallery_open:'Галерия',video_play:'Видео',price_open:'Цени',faq_open:'FAQ',contact_open:'Контакти'};
let renderToken=0;
let lastPayload=null;

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const pct=(value,total)=>total?value/total*100:0;
const pctText=value=>`${value.toFixed(1)}%`;
const unique=(items,key='sessionId')=>new Set(items.map(item=>item[key]).filter(Boolean)).size;
const localDay=date=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Sofia',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
const shortDay=date=>new Intl.DateTimeFormat('bg-BG',{timeZone:'Europe/Sofia',day:'2-digit',month:'2-digit'}).format(date);
const localHour=date=>+new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Sofia',hour:'2-digit',hourCycle:'h23'}).format(date);

function range(){
  const now=new Date();
  const start=new Date(now);
  const end=new Date(now);
  end.setHours(23,59,59,999);
  const period=document.querySelector('#periodFilter')?.value||'7d';
  if(period==='today')start.setHours(0,0,0,0);
  if(period==='yesterday'){
    start.setDate(start.getDate()-1);start.setHours(0,0,0,0);end.setDate(end.getDate()-1);
  }
  if(period==='7d'){start.setDate(start.getDate()-6);start.setHours(0,0,0,0)}
  if(period==='30d'){start.setDate(start.getDate()-29);start.setHours(0,0,0,0)}
  if(period==='month'){start.setDate(1);start.setHours(0,0,0,0)}
  if(period==='custom'){
    const from=document.querySelector('#dateFrom')?.value;
    const to=document.querySelector('#dateTo')?.value;
    if(from)start.setTime(new Date(`${from}T00:00:00`).getTime());
    if(to)end.setTime(new Date(`${to}T23:59:59.999`).getTime());
  }
  return{start,end};
}

function previousRange(current){
  const duration=current.end-current.start+1;
  const end=new Date(current.start.getTime()-1);
  return{start:new Date(end.getTime()-duration+1),end};
}

async function cachedEvents(timeRange){
  const q=query(collection(db,'analytics_events'),where('timestamp','>=',Timestamp.fromDate(timeRange.start)),where('timestamp','<=',Timestamp.fromDate(timeRange.end)),orderBy('timestamp','desc'),limit(10000));
  const snap=await getDocsFromCache(q);
  return snap.docs.map(doc=>{
    const data=doc.data();
    return{id:doc.id,...data,pagePath:normalizePath(data.pagePath||'/'),date:data.timestamp?.toDate?.()||new Date()};
  });
}

function normalizePath(value){
  let path=String(value||'/').split('?')[0].split('#')[0]||'/';
  if(!path.startsWith('/'))path=`/${path}`;
  return path.replace(/\/+/g,'/');
}

function sessionsFrom(items){
  const map=new Map();
  items.forEach(event=>{
    const id=event.sessionId||event.id;
    if(!map.has(id))map.set(id,[]);
    map.get(id).push(event);
  });
  return[...map.entries()].map(([id,sessionEvents])=>{
    const ordered=[...sessionEvents].sort((a,b)=>a.date-b.date);
    const views=ordered.filter(event=>event.eventType==='page_view');
    const external=views.find(event=>event.source&&!SELF_SOURCE.test(event.source));
    const first=external||views[0]||ordered[0];
    const geo=ordered.find(event=>event.eventType==='session_geo'&&event.country&&event.country!=='unknown');
    const business=ordered.filter(event=>BUSINESS_TYPES.has(event.eventType));
    const interest=ordered.filter(event=>INTEREST_TYPES.has(event.eventType));
    const maxActive=Math.max(0,...ordered.filter(event=>['engagement','session_end'].includes(event.eventType)).map(event=>+event.activeSeconds||0));
    const maxScroll=Math.max(0,...ordered.filter(event=>event.eventType==='scroll').map(event=>+event.scrollDepth||0));
    const source=first?.source&&!SELF_SOURCE.test(first.source)?String(first.source):'direct';
    const medium=String(first?.medium||'').toLowerCase();
    const pages=[...new Set(views.map(event=>event.pagePath).filter(Boolean))];
    const duration=views.length>1?views[views.length-1].date-views[0].date:0;
    const device=first?.device||'Неизвестно';
    const browser=first?.browser||'Неизвестно';
    const os=first?.os||'Неизвестно';
    const city=geo?.city||'unknown';
    const country=geo?.country||'unknown';
    const engaged=maxActive>=30||maxScroll>=50;
    const technical=views.length>=4&&pages.length>=3&&duration<=30000&&!business.length&&!interest.length&&maxActive<10&&maxScroll<25&&(String(os).toLowerCase()==='other'||String(device).toLowerCase()==='desktop');
    return{id,events:ordered,views,pages,source,medium,city,country,device,browser,os,business,interest,maxActive,maxScroll,engaged,technical,opened:(views[0]||ordered[0])?.date||new Date()};
  });
}

function siteFilterSessions(sessions){
  const site=document.querySelector('#siteFilter')?.value||'all';
  if(site==='all')return sessions;
  return sessions.filter(session=>session.events.some(event=>event.site===site));
}

function metricStats(sessions){
  const client=sessions.filter(session=>session.business.length);
  const interested=sessions.filter(session=>session.interest.length);
  const engaged=sessions.filter(session=>session.engaged);
  return{sessions:sessions.length,engaged:engaged.length,interested:interested.length,client:client.length,conversion:pct(client.length,sessions.length)};
}

function trend(current,previous){
  if(!previous&&current)return{cls:'up',text:'↑ ново'};
  if(!previous&&!current)return{cls:'flat',text:'— без промяна'};
  const change=(current-previous)/previous*100;
  if(Math.abs(change)<.05)return{cls:'flat',text:'— без промяна'};
  return{cls:change>0?'up':'down',text:`${change>0?'↑':'↓'} ${Math.abs(change).toFixed(1)}%`};
}

function infoButton(text){return`<button class="summary-info" type="button" aria-label="Пояснение" data-info="${esc(text)}">i</button>`}

function kpi(label,value,current,previous,info,sub=''){
  const t=trend(current,previous);
  return`<article class="card summary-kpi"><div class="summary-kpi-label">${esc(label)} ${infoButton(info)}</div><div class="summary-kpi-value">${esc(value)}</div><div class="summary-kpi-foot"><span class="summary-trend ${t.cls}">${t.text}</span>${sub?`<small>${esc(sub)}</small>`:''}</div></article>`;
}

function sourceCategory(session){
  const source=String(session.source||'direct').toLowerCase();
  if(source==='google'&&session.medium==='cpc')return'Google Ads';
  if(source==='google')return'Google търсене';
  if(source==='direct')return'Директно посещение';
  if(source.includes('facebook')||source==='fb'||source.includes('l.facebook'))return'Facebook';
  return'Други източници';
}

function pageLabel(path){
  const exact=document.querySelector(`[data-page="${CSS.escape(path)}"]`)?.textContent?.trim();
  if(exact)return exact;
  if(path==='/'||path==='/index.html')return'Начална страница';
  return path.replace(/^\//,'').replace(/\.html$/,'').replace(/[-_]+/g,' ')||'Страница';
}

function pageRows(sessions){
  const map=new Map();
  sessions.forEach(session=>session.pages.forEach(path=>{
    if(!map.has(path))map.set(path,{path,sessions:new Set(),interest:new Set(),client:new Set()});
    const row=map.get(path);row.sessions.add(session.id);if(session.interest.length)row.interest.add(session.id);if(session.business.length)row.client.add(session.id);
  }));
  return[...map.values()].sort((a,b)=>b.client.size-a.client.size||b.interest.size-a.interest.size||b.sessions.size-a.sessions.size).slice(0,5);
}

function sourceRows(sessions){
  const order=['Google Ads','Google търсене','Директно посещение','Facebook','Други източници'];
  const map=new Map(order.map(label=>[label,[]]));
  sessions.forEach(session=>map.get(sourceCategory(session)).push(session));
  return order.map(label=>({label,sessions:map.get(label)})).filter(row=>row.sessions.length);
}

function actionRows(sessions){
  return Object.entries(ACTION_LABELS).map(([type,label])=>{
    const matched=sessions.filter(session=>session.events.some(event=>event.eventType===type));
    const clients=matched.filter(session=>session.business.length);
    return{type,label,sessions:matched.length,clients:clients.length};
  });
}

function geoRows(sessions){
  const human=sessions.filter(session=>!session.technical&&session.country!=='unknown');
  const map=new Map();
  human.forEach(session=>{
    const key=`${session.city||'unknown'}|${session.country||'unknown'}`;
    map.set(key,(map.get(key)||0)+1);
  });
  const rows=[...map.entries()].map(([key,count])=>{const[city,country]=key.split('|');return{city:city==='unknown'?'Неизвестен град':city,country,count}}).sort((a,b)=>b.count-a.count);
  const main=rows.slice(0,3);
  const other=rows.slice(3).reduce((sum,row)=>sum+row.count,0);
  if(other)main.push({city:'Други',country:'',count:other});
  const technical=sessions.filter(session=>session.technical).length;
  return{rows:main,technical};
}

function hourRows(sessions){
  const buckets=[['00–06',0,6],['06–09',6,9],['09–12',9,12],['12–15',12,15],['15–18',15,18],['18–21',18,21],['21–24',21,24]];
  return buckets.map(([label,from,to])=>{
    const subset=sessions.filter(session=>{const h=localHour(session.opened);return h>=from&&h<to});
    return{label,sessions:subset.length,clients:subset.filter(session=>session.business.length).length,conversion:pct(subset.filter(session=>session.business.length).length,subset.length)};
  }).sort((a,b)=>b.clients-a.clients||b.sessions-a.sessions).slice(0,3);
}

function siteRows(sessions){
  const names={sofia:'София',lom:'Лом',montana:'Монтана','lom-en':'Лом EN','lom-de':'Лом DE'};
  const map=new Map();
  sessions.forEach(session=>{
    const sites=[...new Set(session.events.map(event=>event.site).filter(Boolean))];
    sites.forEach(site=>{
      if(!map.has(site))map.set(site,{site,sessions:new Set(),clients:new Set()});
      map.get(site).sessions.add(session.id);if(session.business.length)map.get(site).clients.add(session.id);
    });
  });
  return[...map.values()].map(row=>({...row,label:names[row.site]||row.site})).sort((a,b)=>b.clients.size-a.clients.size||b.sessions.size-a.sessions.size);
}

function renderChart(sessions){
  const canvas=document.querySelector('#summaryChart');if(!canvas)return;
  const days=new Map();
  sessions.forEach(session=>{
    const day=localDay(session.opened);
    if(!days.has(day))days.set(day,{date:session.opened,sessions:0,clients:0,engaged:0,interest:0});
    const row=days.get(day);row.sessions++;if(session.business.length)row.clients++;if(session.engaged)row.engaged++;if(session.interest.length)row.interest++;
  });
  const rows=[...days.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([,value])=>value);
  const rect=canvas.getBoundingClientRect();const dpr=devicePixelRatio||1;canvas.width=Math.max(1,rect.width*dpr);canvas.height=Math.max(1,rect.height*dpr);
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);const w=rect.width,h=rect.height,p=34;ctx.clearRect(0,0,w,h);
  ctx.strokeStyle='#dbe4ee';ctx.lineWidth=1;for(let i=0;i<5;i++){const y=p+(h-2*p)*i/4;ctx.beginPath();ctx.moveTo(p,y);ctx.lineTo(w-p,y);ctx.stroke()}
  if(!rows.length){ctx.fillStyle='#6e7f93';ctx.fillText('Няма данни',p,h/2);return}
  const max=Math.max(1,...rows.map(row=>row.sessions));
  const x=i=>p+(w-2*p)*(rows.length===1?.5:i/(rows.length-1));const y=v=>h-p-(h-2*p)*v/max;
  const draw=(key,color,width)=>{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();rows.forEach((row,i)=>i?ctx.lineTo(x(i),y(row[key])):ctx.moveTo(x(i),y(row[key])));ctx.stroke()};
  draw('sessions','#d7a43b',3);draw('clients','#145a8d',2.5);
  ctx.fillStyle='#6e7f93';ctx.font='11px system-ui';rows.forEach((row,i)=>{if(rows.length>10&&i%Math.ceil(rows.length/8))return;ctx.fillText(shortDay(row.date),x(i)-10,h-10)});
  canvas.onclick=event=>{
    const bounds=canvas.getBoundingClientRect();const px=event.clientX-bounds.left;let index=0;let distance=Infinity;rows.forEach((row,i)=>{const d=Math.abs(x(i)-px);if(d<distance){distance=d;index=i}});const row=rows[index];
    showPopover(event.clientX,event.clientY,`<strong>${esc(shortDay(row.date))}</strong><span>${row.sessions} сесии</span><span>${row.engaged} ангажирани</span><span>${row.interest} проявили интерес</span><span>${row.clients} клиентски сесии</span><span>${pctText(pct(row.clients,row.sessions))} конверсия</span>`);
  };
}

function renderSummary(sessions,previous){
  const stats=metricStats(sessions),old=metricStats(previous);
  const pages=pageRows(sessions),sources=sourceRows(sessions),actions=actionRows(sessions),geo=geoRows(sessions),hours=hourRows(sessions),sites=siteRows(sessions);
  lastPayload={sessions,previous,pages,sources,actions,geo,hours,sites};
  const conversionSub=`${stats.client} от ${stats.sessions} сесии`;
  view.innerHTML=`
    <div class="view-heading"><div><h1>Обобщение</h1><p class="subtitle">Най-важното за бизнеса за избрания период.</p></div><div class="heading-actions"><button id="exportJsonBtn" class="action-secondary" type="button">Експорт JSON</button></div></div>
    <div class="summary-shell" data-summary-ux-shell>
      <div class="summary-kpis">
        ${kpi('Сесии',stats.sessions,stats.sessions,old.sessions,'Брой отделни посещения на сайта за избрания период.')}
        ${kpi('Ангажирани',stats.engaged,stats.engaged,old.engaged,'Сесии с поне 30 секунди активно време или поне 50% скрол.')}
        ${kpi('Проявили интерес',stats.interested,stats.interested,old.interested,'Сесии с действие като галерия, видео, цени, FAQ или контакти.')}
        ${kpi('Клиентски сесии',stats.client,stats.client,old.client,'Уникални сесии с телефон, Viber или успешно изпратена форма. Повторни действия в една сесия не увеличават броя.')}
        ${kpi('Конверсия',pctText(stats.conversion),stats.conversion,old.conversion,'Делът на всички сесии, които са стигнали до клиентско действие.',conversionSub)}
      </div>
      <section class="card summary-chart-card"><div class="summary-section-heading"><div><h2>Трафик и клиентски резултат ${infoButton('Сравнява всички сесии с клиентските сесии по дни. Ако трафикът расте, а клиентските сесии не растат, качеството на трафика или страниците може да изискват внимание.')}</h2><p class="card-note">Сесии и клиентски сесии по дни</p></div><div class="summary-legend"><span class="all">Сесии</span><span class="client">Клиентски сесии</span></div></div><div class="chart-wrap"><canvas id="summaryChart"></canvas></div></section>
      <div class="summary-grid">
        <section class="card summary-section wide"><div class="summary-section-heading"><h2>Най-силни страници ${infoButton('Подреждането е по клиентски сесии, след това по проявен интерес и накрая по сесии. Целта е да показва бизнес резултат, не само посещаемост.')}</h2></div><div class="summary-page-list">${pages.length?pages.map(row=>`<article class="summary-page-row"><div class="summary-page-main"><strong>${esc(pageLabel(row.path))}</strong><span>${row.interest.size} с интерес · ${row.client.size} клиентски сесии</span></div><div class="summary-page-sessions"><strong>${row.sessions.size}</strong><span>сесии</span></div><button class="action-secondary compact" data-open-page="${esc(row.path)}">Отвори статистика</button></article>`).join(''):'<div class="summary-empty">Няма данни за периода.</div>'}</div></section>
        <section class="card summary-section"><div class="summary-section-heading"><h2>Откъде идват посетителите ${infoButton('Показва първоначалния разпознаваем източник за сесията. „Директно посещение“ може да означава и че надежден външен източник не е наличен.')}</h2></div><div class="summary-source-list">${sources.length?sources.map(row=>`<button class="summary-source-row" data-open-source="${esc(row.label)}"><span><strong>${esc(row.label)}</strong><small>${row.sessions.filter(s=>s.business.length).length} клиентски сесии</small></span><b>${row.sessions.length}</b></button>`).join(''):'<div class="summary-empty">Няма данни.</div>'}</div></section>
        <section class="card summary-section wide"><div class="summary-section-heading"><h2>Какво правят посетителите ${infoButton('Показва уникални сесии, в които е използвана съответната част на сайта. Повторните действия в една и съща сесия не увеличават броя.')}</h2></div><div class="summary-action-grid">${actions.map(row=>`<button class="summary-action-chip" data-action-type="${row.type}"><span>${esc(row.label)}</span><strong>${row.sessions}</strong><small>${row.clients} → клиентско действие</small></button>`).join('')}</div></section>
        <section class="card summary-section"><div class="summary-section-heading"><h2>Къде са посетителите ${infoButton('Приблизително местоположение по мрежова информация. Градът може да е неточен при VPN, proxy, мобилен оператор или друга мрежова услуга.')}</h2></div><div class="summary-geo-list">${geo.rows.map(row=>`<button class="summary-geo-row" data-geo="${esc(row.city)}|${esc(row.country)}"><span><strong>${esc(row.city)}</strong><small>${esc(row.country)}</small></span><b>${row.count}</b></button>`).join('')}${geo.technical?`<button class="summary-geo-row technical" data-technical><span><strong>Вероятно технически трафик ${infoButton('Сесии с много страници за необичайно кратко време и без нормални сигнали за човешко взаимодействие. Данните не се изтриват.')}</strong><small>маркиран по поведение, не по държава</small></span><b>${geo.technical}</b></button>`:''}</div></section>
        <section class="card summary-section"><div class="summary-section-heading"><h2>Най-силни часове ${infoButton('Показва часовите интервали по Europe/Sofia с най-много клиентски сесии.')}</h2></div><div class="summary-mini-list">${hours.map(row=>`<button class="summary-mini-row" data-hour="${row.label}"><span><strong>${row.label}</strong><small>${row.sessions} сесии · ${pctText(row.conversion)} конверсия</small></span><b>${row.clients}</b></button>`).join('')}</div></section>
        <section class="card summary-section"><div class="summary-section-heading"><h2>Сайтове ${infoButton('Сравнява сайтовете по сесии и клиентски сесии. Натисни сайт, за да филтрираш цялото табло само за него.')}</h2></div><div class="summary-mini-list">${sites.slice(0,4).map(row=>`<button class="summary-mini-row" data-site="${esc(row.site)}"><span><strong>${esc(row.label)}</strong><small>${row.clients.size} клиентски сесии</small></span><b>${row.sessions.size}</b></button>`).join('')}</div></section>
      </div>
    </div>`;
  bindSummary();requestAnimationFrame(()=>renderChart(sessions));
}

function bindSummary(){
  view.querySelectorAll('.summary-info').forEach(button=>button.onclick=event=>{event.stopPropagation();showPopover(event.clientX||button.getBoundingClientRect().left,event.clientY||button.getBoundingClientRect().bottom,`<span>${esc(button.dataset.info)}</span>`)});
  view.querySelectorAll('[data-open-page]').forEach(button=>button.onclick=()=>openPage(button.dataset.openPage));
  view.querySelectorAll('[data-open-source]').forEach(button=>button.onclick=()=>openSource(button.dataset.openSource));
  view.querySelectorAll('[data-action-type]').forEach(button=>button.onclick=()=>showActionDetail(button.dataset.actionType));
  view.querySelectorAll('[data-geo]').forEach(button=>button.onclick=()=>showGeoDetail(button.dataset.geo));
  view.querySelector('[data-technical]')?.addEventListener('click',showTechnicalDetail);
  view.querySelectorAll('[data-hour]').forEach(button=>button.onclick=()=>showHoursDetail());
  view.querySelectorAll('[data-site]').forEach(button=>button.onclick=()=>{const select=document.querySelector('#siteFilter');if(select){select.value=button.dataset.site;select.dispatchEvent(new Event('change',{bubbles:true}))}});
}

function openPage(path){
  document.querySelector('.nav button[data-view="pages"]')?.click();
  setTimeout(()=>{const buttons=[...document.querySelectorAll('[data-page]')];const target=buttons.find(button=>normalizePath(button.dataset.page)===normalizePath(path));target?.click()},0);
}

function openSource(label){
  document.querySelector('.nav button[data-view="sources"]')?.click();
  setTimeout(()=>{
    const rows=[...document.querySelectorAll('tbody tr')];const match=rows.find(row=>sourceDisplay(row.querySelector('td')?.textContent||'')===label);
    if(match){match.classList.add('summary-highlight');match.scrollIntoView({block:'center',behavior:'smooth'});setTimeout(()=>match.classList.remove('summary-highlight'),2200)}
  },50);
}

function sourceDisplay(source){
  const value=String(source).toLowerCase();if(value==='google')return'Google търсене';if(value==='direct')return'Директно посещение';if(value.includes('facebook')||value==='fb')return'Facebook';return source||'Други източници';
}

function showActionDetail(type){
  if(!lastPayload)return;const label=ACTION_LABELS[type]||type;const matched=lastPayload.sessions.filter(session=>session.events.some(event=>event.eventType===type));
  const pageMap=new Map(),sourceMap=new Map();matched.forEach(session=>{session.pages.forEach(path=>pageMap.set(path,(pageMap.get(path)||0)+1));const source=sourceCategory(session);sourceMap.set(source,(sourceMap.get(source)||0)+1)});
  const topPages=[...pageMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);const topSources=[...sourceMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);const clients=matched.filter(session=>session.business.length).length;
  showModal(label,`<div class="modal-kpis"><div><strong>${matched.length}</strong><span>сесии</span></div><div><strong>${clients}</strong><span>стигнали до клиентско действие</span></div></div><h3>Най-често на страници</h3>${detailList(topPages.map(([path,count])=>[pageLabel(path),count]))}<h3>Откъде са дошли</h3>${detailList(topSources)}`);
}

function showGeoDetail(key){
  if(!lastPayload)return;const[city,country]=key.split('|');const matched=lastPayload.sessions.filter(session=>!session.technical&&(city==='Други'?true:session.city===city&&session.country===country));
  showModal('Местоположение',`<div class="modal-kpis"><div><strong>${matched.length}</strong><span>сесии</span></div><div><strong>${matched.filter(s=>s.business.length).length}</strong><span>клиентски сесии</span></div></div><h3>Най-силни страници</h3>${detailList(pageRows(matched).map(row=>[pageLabel(row.path),row.sessions.size]))}`);
}

function showTechnicalDetail(){
  if(!lastPayload)return;const matched=lastPayload.sessions.filter(session=>session.technical);showModal('Вероятно технически трафик',`<p class="card-note">Тези сесии са само маркирани. Raw данните остават запазени.</p>${detailList(matched.slice(0,20).map(session=>[`${session.city==='unknown'?'Неизвестен град':session.city}, ${session.country==='unknown'?'—':session.country} · ${session.pages.length} страници`,shortDay(session.opened)]))}`);
}

function showHoursDetail(){
  if(!lastPayload)return;const all=[['00–06',0,6],['06–09',6,9],['09–12',9,12],['12–15',12,15],['15–18',15,18],['18–21',18,21],['21–24',21,24]].map(([label,from,to])=>{const subset=lastPayload.sessions.filter(session=>{const h=localHour(session.opened);return h>=from&&h<to});const clients=subset.filter(s=>s.business.length).length;return[label,`${subset.length} сесии · ${clients} клиентски · ${pctText(pct(clients,subset.length))}`]});showModal('Анализ по часове',detailList(all));
}

function detailList(rows){return`<div class="summary-detail-list">${rows.length?rows.map(([label,value])=>`<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join(''):'<p class="summary-empty">Няма данни.</p>'}</div>`}

function showModal(title,body){
  document.querySelector('.summary-modal')?.remove();const modal=document.createElement('div');modal.className='summary-modal';modal.innerHTML=`<div class="summary-modal-card"><div class="summary-modal-head"><h2>${esc(title)}</h2><button type="button" aria-label="Затвори">×</button></div>${body}</div>`;document.body.appendChild(modal);modal.addEventListener('click',event=>{if(event.target===modal||event.target.closest('.summary-modal-head button'))modal.remove()});
}

function showPopover(x,y,html){
  document.querySelector('.summary-popover')?.remove();const pop=document.createElement('div');pop.className='summary-popover';pop.innerHTML=html;document.body.appendChild(pop);const w=pop.offsetWidth,h=pop.offsetHeight;pop.style.left=`${Math.max(8,Math.min(innerWidth-w-8,x-w/2))}px`;pop.style.top=`${Math.max(8,Math.min(innerHeight-h-8,y+12))}px`;setTimeout(()=>document.addEventListener('click',()=>pop.remove(),{once:true}),0);
}

async function transformSummary(){
  const heading=view?.querySelector('.view-heading h1');if(!heading||heading.textContent.trim()!=='Обобщение'||view.querySelector('[data-summary-ux-shell]'))return;
  const token=++renderToken;
  try{
    const current=range();const [items,previousItems]=await Promise.all([cachedEvents(current),cachedEvents(previousRange(current))]);if(token!==renderToken)return;
    renderSummary(siteFilterSessions(sessionsFrom(items)),siteFilterSessions(sessionsFrom(previousItems)));
  }catch(error){
    console.warn('Summary cache enhancement unavailable; keeping base dashboard summary.',error);
  }
}

const observer=new MutationObserver(()=>transformSummary());
if(view)observer.observe(view,{childList:true,subtree:true});
transformSummary();
