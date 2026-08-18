import{initializeApp}from'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import{getAuth,signInWithEmailAndPassword,onAuthStateChanged,signOut,setPersistence,browserLocalPersistence}from'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import{getFirestore,collection,getDocs,query,where,orderBy,limit,Timestamp}from'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import{firebaseConfig,OWNER_UID}from'./firebase-config.js?v=20260818-3';
import{TRACKED_PAGES,normalizePath,pageLabel,pageUrl}from'./sites.js?v=20260818-3';

const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
const db=getFirestore(app);
const $=s=>document.querySelector(s);
const PERIOD_KEY='ivanov_dash_period';
const SITE_KEY='ivanov_dash_site';
const DEVICE_STATE_KEY='ivanov_dashboard_device_state';
const SITE_ORIGIN='https://ivanov-remonti.com';
const SELF_SOURCE=/^(www\.)?ivanov-remonti\.com$/i;
let current='summary';
let selectedPage='';
let events=[];
let previousEvents=[];
let chartEvents=[];
let deviceTimer=0;

setPersistence(auth,browserLocalPersistence).catch(()=>{});

$('#loginForm').onsubmit=async event=>{
  event.preventDefault();
  $('#loginError').textContent='';
  try{
    const credential=await signInWithEmailAndPassword(auth,$('#email').value.trim(),$('#password').value);
    if(credential.user.uid!==OWNER_UID){
      await signOut(auth);
      throw Error('Този профил няма достъп.');
    }
  }catch(error){
    $('#loginError').textContent=error.code==='auth/invalid-credential'?'Грешен имейл или парола.':error.message;
  }
};

$('#logoutBtn').onclick=()=>signOut(auth);
$('#mobileMenu').onclick=()=>$('#sidebar').classList.toggle('open');
document.querySelectorAll('.nav button').forEach(button=>button.onclick=()=>setView(button.dataset.view));

try{
  const savedPeriod=localStorage.getItem(PERIOD_KEY);
  const savedSite=localStorage.getItem(SITE_KEY);
  if(savedPeriod)$('#periodFilter').value=savedPeriod;
  if(savedSite)$('#siteFilter').value=savedSite;
  toggleCustomDates();
}catch(error){}

$('#siteFilter').onchange=()=>{
  try{localStorage.setItem(SITE_KEY,$('#siteFilter').value)}catch(error){}
  selectedPage='';
  render();
};
$('#periodFilter').onchange=()=>{
  try{localStorage.setItem(PERIOD_KEY,$('#periodFilter').value)}catch(error){}
  toggleCustomDates();
  if($('#periodFilter').value!=='custom')load();
};
$('#dateFrom').onchange=load;
$('#dateTo').onchange=load;
$('#refreshBtn').onclick=load;

onAuthStateChanged(auth,user=>{
  const allowed=user&&user.uid===OWNER_UID;
  $('#loginScreen').classList.toggle('hidden',allowed);
  $('#app').classList.toggle('hidden',!allowed);
  if(allowed){
    $('#userEmail').textContent=user.email||'';
    load();
  }
});

function setView(view){
  current=view;
  if(view!=='pages')selectedPage='';
  document.querySelectorAll('.nav button').forEach(button=>button.classList.toggle('active',button.dataset.view===view));
  $('#sidebar').classList.remove('open');
  render();
}

function toggleCustomDates(){
  const custom=$('#periodFilter').value==='custom';
  $('#dateFrom').classList.toggle('hidden',!custom);
  $('#dateTo').classList.toggle('hidden',!custom);
}

function range(){
  const now=new Date();
  const start=new Date(now);
  const end=new Date(now);
  end.setHours(23,59,59,999);
  const period=$('#periodFilter').value;
  if(period==='today')start.setHours(0,0,0,0);
  if(period==='yesterday'){
    start.setDate(start.getDate()-1);
    start.setHours(0,0,0,0);
    end.setDate(end.getDate()-1);
  }
  if(period==='7d'){
    start.setDate(start.getDate()-6);
    start.setHours(0,0,0,0);
  }
  if(period==='30d'){
    start.setDate(start.getDate()-29);
    start.setHours(0,0,0,0);
  }
  if(period==='month'){
    start.setDate(1);
    start.setHours(0,0,0,0);
  }
  if(period==='custom'){
    if($('#dateFrom').value)start.setTime(new Date($('#dateFrom').value+'T00:00:00').getTime());
    if($('#dateTo').value)end.setTime(new Date($('#dateTo').value+'T23:59:59.999').getTime());
  }
  return{start,end};
}

function previousRange(currentRange){
  const duration=currentRange.end-currentRange.start+1;
  const end=new Date(currentRange.start.getTime()-1);
  const start=new Date(end.getTime()-duration+1);
  return{start,end};
}

async function fetchEvents(timeRange){
  const eventQuery=query(
    collection(db,'analytics_events'),
    where('timestamp','>=',Timestamp.fromDate(timeRange.start)),
    where('timestamp','<=',Timestamp.fromDate(timeRange.end)),
    orderBy('timestamp','desc'),
    limit(10000)
  );
  const snapshot=await getDocs(eventQuery);
  return normalizeAttribution(snapshot.docs.map(doc=>({
    id:doc.id,
    ...doc.data(),
    pagePath:normalizePath(doc.data().pagePath||'/'),
    date:doc.data().timestamp?.toDate?.()||new Date()
  })));
}

async function load(){
  $('#view').innerHTML='<div class="card empty">Зареждане...</div>';
  try{
    const currentRange=range();
    const [currentData,previousData]=await Promise.all([
      fetchEvents(currentRange),
      fetchEvents(previousRange(currentRange))
    ]);
    events=currentData;
    previousEvents=previousData;
    render();
  }catch(error){
    $('#view').innerHTML=`<div class="card"><h2>Няма достъп до данните</h2><p class="error">${esc(error.message)}</p></div>`;
  }
}

function normalizeAttribution(items){
  const sessions=group(items,event=>event.sessionId||event.id);
  sessions.forEach(([,sessionEvents])=>{
    const ordered=[...sessionEvents].sort((a,b)=>a.date-b.date);
    const pageViews=ordered.filter(event=>event.eventType==='page_view');
    const external=pageViews.find(event=>event.source&&!SELF_SOURCE.test(event.source));
    const first=external||pageViews[0]||ordered[0];
    const source=first?.source&&!SELF_SOURCE.test(first.source)?first.source:'direct';
    sessionEvents.forEach(event=>event.sessionSource=source||'direct');
  });
  return items;
}

function filtered(items=events){
  const site=$('#siteFilter').value;
  return site==='all'?items:items.filter(event=>event.site===site);
}

const by=(items,type)=>items.filter(event=>event.eventType===type);
const uniq=(items,key)=>new Set(items.map(item=>item[key]).filter(Boolean)).size;
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const percent=(value,total)=>total?((value/total)*100).toFixed(1)+'%':'0%';
const time=value=>{
  const seconds=Math.round(value||0);
  return seconds<60?seconds+' сек.':`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} мин.`;
};
const dateTime=value=>value.toLocaleString('bg-BG',{timeZone:'Europe/Sofia'});
const localDay=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Sofia',year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
const shortDay=value=>new Intl.DateTimeFormat('bg-BG',{timeZone:'Europe/Sofia',day:'2-digit',month:'2-digit'}).format(value);

function group(items,key){
  const map=new Map();
  items.forEach(item=>{
    const value=typeof key==='function'?key(item):(item[key]||'Неизвестно');
    map.set(value,(map.get(value)||[]).concat(item));
  });
  return[...map.entries()];
}

function stats(items){
  const pageViews=by(items,'page_view');
  const sessions=uniq(items,'sessionId');
  const phone=by(items,'phone_click').length;
  const viber=by(items,'viber_click').length;
  const forms=by(items,'form_submit').length;
  const actions=phone+viber+forms;
  const engagedSessions=new Set();
  items.forEach(event=>{
    if(
      (event.eventType==='engagement'&&+event.activeSeconds>=30)||
      (event.eventType==='session_end'&&+event.activeSeconds>=30)||
      (event.eventType==='scroll'&&+event.scrollDepth>=50)
    )engagedSessions.add(event.sessionId);
  });
  const endings=by(items,'session_end').map(event=>+event.activeSeconds||0).filter(value=>value>=0);
  const average=endings.length?endings.reduce((sum,value)=>sum+value,0)/endings.length:0;
  return{
    sessions,pages:pageViews.length,phone,viber,forms,actions,
    engaged:engagedSessions.size,average,
    conversion:percent(actions,sessions),
    engagementRate:percent(engagedSessions.size,sessions)
  };
}

function delta(currentValue,previousValue,suffix=''){
  const difference=currentValue-previousValue;
  if(!difference)return'без промяна';
  return`${difference>0?'+':''}${difference}${suffix} спрямо предишния период`;
}

function metric(label,value,sub=''){
  return`<div class="card"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-sub">${esc(sub)}</div></div>`;
}

function head(title,subtitle,actions=''){
  return`<div class="view-heading"><div><h1>${title}</h1><p class="subtitle">${subtitle}</p></div>${actions}</div>`;
}

function table(headers,rows,empty='Няма данни за избрания период.'){
  return`<div class="table-wrap"><table><thead><tr>${headers.map(header=>`<th>${header}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.join(''):`<tr><td colspan="${headers.length}" class="empty">${empty}</td></tr>`}</tbody></table></div>`;
}

function render(){
  const data=filtered();
  const previous=filtered(previousEvents);
  const renderers={summary,pages,results,sources,system};
  $('#view').innerHTML=renderers[current](data,previous);
  requestAnimationFrame(()=>{
    drawChart();
    bindDynamicControls();
    bindDeviceControls();
  });
}

function summary(items,previousItems){
  const currentStats=stats(items);
  const oldStats=stats(previousItems);
  chartEvents=by(items,'page_view');
  const strongest=TRACKED_PAGES
    .map(page=>({page,pageStats:stats(items.filter(event=>event.pagePath===page.path))}))
    .filter(row=>row.pageStats.pages||row.pageStats.actions)
    .sort((a,b)=>b.pageStats.actions-a.pageStats.actions||b.pageStats.pages-a.pageStats.pages)
    .slice(0,8)
    .map(row=>`<tr><td><button class="link-button" data-page="${esc(row.page.path)}">${esc(row.page.label)}</button></td><td>${row.pageStats.pages}</td><td>${row.pageStats.actions}</td><td>${row.pageStats.conversion}</td></tr>`);
  const sourceRows=sourceGroups(items).slice(0,8).map(row=>`<tr><td>${esc(row.source)}</td><td>${row.stats.sessions}</td><td>${row.stats.actions}</td><td>${row.stats.conversion}</td></tr>`);
  const siteRows=group(items,event=>event.site||'other').map(([site,siteEvents])=>{
    const value=stats(siteEvents);
    return`<tr><td>${esc(siteName(site))}</td><td>${value.sessions}</td><td>${value.pages}</td><td>${value.actions}</td><td>${value.conversion}</td></tr>`;
  });
  const mobile=uniq(by(items,'page_view').filter(event=>event.device==='mobile'),'sessionId');
  const browserRows=group(by(items,'page_view'),event=>event.browser||'Неизвестно')
    .map(([browser,browserEvents])=>`<tr><td>${esc(browser)}</td><td>${uniq(browserEvents,'sessionId')}</td></tr>`);
  return head('Обобщение','Най-важното за трафика и реалните действия.')+
    `<div class="cards">
      ${metric('Сесии',currentStats.sessions,delta(currentStats.sessions,oldStats.sessions))}
      ${metric('Отворени страници',currentStats.pages,delta(currentStats.pages,oldStats.pages))}
      ${metric('Ангажирани посещения',currentStats.engaged,currentStats.engagementRate)}
      ${metric('Общо действия',currentStats.actions,delta(currentStats.actions,oldStats.actions))}
      ${metric('Кликове за обаждане',currentStats.phone)}
      ${metric('Viber',currentStats.viber)}
      ${metric('Опити за форма',currentStats.forms)}
      ${metric('Конверсия',currentStats.conversion)}
    </div>
    <div class="grid-2">
      <div class="card"><h2>Посещения по дни</h2><div class="chart-wrap"><canvas id="mainChart"></canvas></div></div>
      <div class="card"><h2>Източници</h2>${table(['Източник','Сесии','Действия','Конверсия'],sourceRows)}</div>
    </div>
    <div class="grid-2">
      <div class="card"><h2>Сравнение по сайтове</h2>${table(['Сайт','Сесии','Страници','Действия','Конверсия'],siteRows)}</div>
      <div class="card"><h2>Техническа аудитория</h2>
        <div class="small-metrics">
          <div><strong>${percent(mobile,currentStats.sessions)}</strong><span>мобилни сесии</span></div>
          <div><strong>${currentStats.sessions?(currentStats.pages/currentStats.sessions).toFixed(2):0}</strong><span>страници / сесия</span></div>
          <div><strong>${time(currentStats.average)}</strong><span>средно отчетено време</span></div>
        </div>
        ${table(['Браузър','Сесии'],browserRows)}
      </div>
    </div>
    <div class="card section-gap"><h2>Най-силни страници</h2>${table(['Страница','Отваряния','Действия','Конверсия'],strongest)}</div>`;
}

function pages(items,previousItems){
  if(selectedPage)return pageDetails(items,previousItems,selectedPage);
  const site=$('#siteFilter').value;
  const visiblePages=TRACKED_PAGES.filter(page=>site==='all'||page.site===site);
  const periodName=$('#periodFilter').selectedOptions[0]?.textContent||'избрания период';
  const pageData=visiblePages.map(page=>{
    const pageEvents=items.filter(event=>event.pagePath===page.path);
    const value=stats(pageEvents);
    const last=by(pageEvents,'page_view').sort((a,b)=>b.date-a.date)[0];
    return{page,value,last};
  });
  const rows=pageData.map(({page,value,last})=>`<tr>
      <td><strong>${esc(page.label)}</strong><div class="row-sub">${esc(page.path)}</div></td>
      <td>${last?dateTime(last.date):'Няма посещение'}</td>
      <td>${value.sessions}</td><td>${value.pages}</td><td>${value.engaged}</td>
      <td>${value.actions}</td><td>${value.conversion}</td>
      <td class="row-actions"><button class="action-secondary compact" data-page="${esc(page.path)}">Статистика</button><a class="action-secondary compact" href="${pageUrl(page.path)}" target="_blank" rel="noopener">Отвори</a></td>
    </tr>`);
  const mobileRows=pageData.map(({page,value,last})=>`<article class="page-mobile-card">
    <div class="page-mobile-heading"><div><strong>${esc(page.label)}</strong><div class="row-sub">${esc(page.path)}</div></div>
      <div class="page-period-counter"><strong>${value.pages}</strong><span>отваряния · ${esc(periodName)}</span></div>
    </div>
    <div class="page-last-open">Последно: ${last?dateTime(last.date):'няма посещение за периода'}</div>
    <div class="page-mobile-metrics"><span><b>${value.sessions}</b> сесии</span><span><b>${value.engaged}</b> ангажирани</span><span><b>${value.actions}</b> действия</span><span><b>${value.conversion}</b> конверсия</span></div>
    <div class="page-mobile-actions"><button class="action-primary" data-page="${esc(page.path)}">Статистика · ${value.pages}</button><a class="action-secondary" href="${pageUrl(page.path)}" target="_blank" rel="noopener">Отвори</a></div>
  </article>`);
  return head('Всички страници',`${visiblePages.length} следени страници. Отвори всяка поотделно за пълна статистика.`)+
    `<div class="card pages-desktop">${table(['Страница','Последно отваряне','Сесии','Отваряния','Ангажирани','Действия','Конверсия',''],rows)}</div>
    <div class="pages-mobile">${mobileRows.join('')}</div>`;
}

function pageDetails(items,previousItems,path){
  const page=TRACKED_PAGES.find(item=>item.path===path)||{path,label:pageLabel(path)};
  const pageEvents=items.filter(event=>event.pagePath===path);
  const previousPageEvents=previousItems.filter(event=>event.pagePath===path);
  const value=stats(pageEvents);
  const oldValue=stats(previousPageEvents);
  chartEvents=by(pageEvents,'page_view');
  const sourceRows=sourceGroups(pageEvents).map(row=>`<tr><td>${esc(row.source)}</td><td>${row.stats.sessions}</td><td>${row.stats.actions}</td><td>${row.stats.conversion}</td></tr>`);
  const deviceRows=group(by(pageEvents,'page_view'),event=>event.device||'Неизвестно')
    .map(([device,deviceEvents])=>`<tr><td>${esc(device)}</td><td>${uniq(deviceEvents,'sessionId')}</td></tr>`);
  const browserRows=group(by(pageEvents,'page_view'),event=>event.browser||'Неизвестно')
    .map(([browser,browserEvents])=>`<tr><td>${esc(browser)}</td><td>${uniq(browserEvents,'sessionId')}</td></tr>`);
  const scrollRows=[25,50,75,90].map(depth=>{
    const count=by(pageEvents,'scroll').filter(event=>+event.scrollDepth===depth).length;
    return`<tr><td>${depth}%</td><td>${count}</td><td>${percent(count,value.pages)}</td></tr>`;
  });
  const sessionRows=sessionDetails(pageEvents).slice(0,100).map(session=>`<tr>
    <td>${dateTime(session.opened)}</td><td>${esc(session.source)}</td><td>${esc(session.device)}</td>
    <td>${session.active?time(session.active):'—'}</td><td>${session.scroll?session.scroll+'%':'—'}</td><td>${esc(session.action||'—')}</td>
  </tr>`);
  const actions=`<div class="heading-actions"><button class="action-secondary" data-page-back>← Всички страници</button><a class="action-primary" href="${pageUrl(path)}" target="_blank" rel="noopener">Отвори страницата</a></div>`;
  return head(esc(page.label),'Подробна статистика само за тази страница.',actions)+
    `<div class="cards">
      ${metric('Сесии',value.sessions,delta(value.sessions,oldValue.sessions))}
      ${metric('Отваряния',value.pages,delta(value.pages,oldValue.pages))}
      ${metric('Ангажирани',value.engaged,value.engagementRate)}
      ${metric('Действия',value.actions,value.conversion)}
      ${metric('Кликове за обаждане',value.phone)}
      ${metric('Viber',value.viber)}
      ${metric('Опити за форма',value.forms)}
      ${metric('Средно отчетено време',time(value.average),'ориентировъчно за старите посещения')}
    </div>
    <div class="grid-2">
      <div class="card"><h2>Отваряния по дни</h2><div class="chart-wrap"><canvas id="mainChart"></canvas></div></div>
      <div class="card"><h2>Източници</h2>${table(['Източник','Сесии','Действия','Конверсия'],sourceRows)}</div>
    </div>
    <div class="grid-3">
      <div class="card"><h2>Устройства</h2>${table(['Устройство','Сесии'],deviceRows)}</div>
      <div class="card"><h2>Браузъри</h2>${table(['Браузър','Сесии'],browserRows)}</div>
      <div class="card"><h2>Скрол</h2>${table(['Дълбочина','Събития','От отварянията'],scrollRows)}</div>
    </div>
    <div class="card section-gap"><h2>Кога е отваряна страницата</h2><p class="card-note">До 100 последни сесии за избрания период. Данните са анонимни.</p>
      ${table(['Дата и час','Източник','Устройство','Ангажираност','Скрол','Действие'],sessionRows)}
    </div>`;
}

function sessionDetails(items){
  return group(items,event=>event.sessionId||event.id).map(([,sessionEvents])=>{
    const ordered=[...sessionEvents].sort((a,b)=>a.date-b.date);
    const opened=(ordered.find(event=>event.eventType==='page_view')||ordered[0]).date;
    const active=Math.max(0,...ordered.filter(event=>['engagement','session_end'].includes(event.eventType)).map(event=>+event.activeSeconds||0));
    const scroll=Math.max(0,...ordered.filter(event=>event.eventType==='scroll').map(event=>+event.scrollDepth||0));
    const actionEvents=ordered.filter(event=>['phone_click','viber_click','form_submit'].includes(event.eventType));
    return{
      opened,
      source:ordered[0].sessionSource||'direct',
      device:ordered[0].device||'Неизвестно',
      active,scroll,
      action:actionEvents.map(event=>label(event.eventType)).join(', ')
    };
  }).sort((a,b)=>b.opened-a.opened);
}

function results(items){
  const value=stats(items);
  const rows=items.filter(event=>['phone_click','viber_click','form_submit'].includes(event.eventType))
    .sort((a,b)=>b.date-a.date)
    .map(event=>`<tr><td>${dateTime(event.date)}</td><td>${esc(label(event.eventType))}</td><td><button class="link-button" data-page="${esc(event.pagePath)}">${esc(pageLabel(event.pagePath))}</button></td><td>${esc(event.sessionSource||'direct')}</td><td>${esc(event.device||'')}</td><td>${esc(event.campaign||'—')}</td></tr>`);
  return head('Резултати','Всички действия с потенциал за клиент. Кликът за обаждане не доказва проведен разговор.')+
    `<div class="cards">
      ${metric('Кликове за обаждане',value.phone)}
      ${metric('Viber',value.viber)}
      ${metric('Опити за форма',value.forms,'отчита submit, не потвърдено изпращане')}
      ${metric('Конверсия',value.conversion)}
    </div>
    <div class="card section-gap">${table(['Дата','Действие','Страница','Източник','Устройство','Кампания'],rows)}</div>`;
}

function sourceGroups(items){
  return group(by(items,'page_view'),event=>event.sessionSource||'direct')
    .map(([source,pageViews])=>{
      const sessionIds=new Set(pageViews.map(event=>event.sessionId));
      const sourceEvents=items.filter(event=>sessionIds.has(event.sessionId));
      return{source,stats:stats(sourceEvents)};
    })
    .sort((a,b)=>b.stats.actions-a.stats.actions||b.stats.sessions-a.stats.sessions);
}

function sources(items){
  const rows=sourceGroups(items).map(row=>`<tr><td>${esc(row.source)}</td><td>${row.stats.sessions}</td><td>${row.stats.pages}</td><td>${row.stats.engaged}</td><td>${row.stats.actions}</td><td>${row.stats.conversion}</td></tr>`);
  const campaignRows=group(by(items,'page_view').filter(event=>event.campaign),event=>event.campaign)
    .map(([campaign,pageViews])=>{
      const sessionIds=new Set(pageViews.map(event=>event.sessionId));
      const campaignEvents=items.filter(event=>sessionIds.has(event.sessionId));
      const value=stats(campaignEvents);
      return`<tr><td>${esc(campaign)}</td><td>${value.sessions}</td><td>${value.actions}</td><td>${value.conversion}</td></tr>`;
    });
  return head('Източници','Първоначалният източник се пази за цялата сесия; вътрешните преминавания не се броят отделно.')+
    `<div class="card">${table(['Източник','Сесии','Страници','Ангажирани','Действия','Конверсия'],rows)}</div>
    <div class="card section-gap"><h2>Кампании</h2>${table(['Кампания','Сесии','Действия','Конверсия'],campaignRows,'Няма UTM кампании за избрания период.')}</div>`;
}

function system(items){
  const rows=TRACKED_PAGES.map(page=>{
    const pageEvents=items.filter(event=>event.pagePath===page.path);
    const last=[...pageEvents].sort((a,b)=>b.date-a.date)[0];
    return`<tr><td>${esc(page.label)}</td><td>${last?dateTime(last.date):'Няма данни в периода'}</td><td>${esc(last?.trackerVersion||'—')}</td><td><button class="action-secondary compact" data-page="${esc(page.path)}">Статистика</button></td></tr>`;
  });
  return head('Система и настройки','Техническата информация е събрана тук, без да се смесва с бизнес резултатите.')+
    `<div class="card"><h2>Следени страници</h2><p class="card-note">„Няма данни“ не доказва повреда — може просто да няма посещение. Това не е автоматичен uptime монитор.</p>
      ${table(['Страница','Последно събитие в периода','Tracker версия',''],rows)}
    </div>
    <div class="grid-2">
      <div class="card"><h2>Моите устройства</h2><p>Изключването се прави отделно за всеки телефон, компютър и браузър.</p>
        <div id="deviceStatusBox" class="device-status unknown"><strong>Статус:</strong> <span id="deviceStatusText">Натисни „Провери статуса“.</span></div>
        <div class="notice">Ако production сайтът не върне отговор до 5 секунди, приложението ще покаже ясна грешка и няма да приема настройката за успешна.</div>
        <div class="settings-action"><button id="excludeDeviceBtn" class="action-primary" type="button">Изключи това устройство</button><button id="checkDeviceBtn" class="action-secondary" type="button">Провери статуса</button><button id="includeDeviceBtn" class="action-secondary" type="button">Включи отново</button></div>
        <p id="deviceActionMessage" class="device-action-message" aria-live="polite"></p>
      </div>
      <div class="card"><h2>Данни и памет</h2>
        <p><strong>Текущо зареждане:</strong> до 10 000 подробни събития за период.</p>
        <p><strong>Автоматично изтриване след 90 дни:</strong> още не е активирано.</p>
        <p><strong>Дневни и месечни обобщения:</strong> още не са активирани.</p>
        <p class="card-note">Старите обещания за 90 дни, 24 месеца и 5 години са премахнати, докато няма реален автоматичен процес.</p>
      </div>
    </div>
    <div class="grid-2">
      <div class="card"><h2>Поверителност</h2><p>Не се записват име, телефонен номер, текст от форма, пълен IP адрес или постоянен fingerprint.</p><p>Сесиите са временни и анонимни.</p></div>
      <div class="card"><h2>Запазена техническа статистика</h2><p>Устройство, браузър, операционна система, скрол, активно време, източник и UTM параметри.</p><p>Държава не се показва, защото tracker-ът в момента няма надежден начин да я определи.</p></div>
    </div>`;
}

function bindDynamicControls(){
  document.querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>{
    selectedPage=normalizePath(button.dataset.page);
    current='pages';
    document.querySelectorAll('.nav button').forEach(nav=>nav.classList.toggle('active',nav.dataset.view==='pages'));
    render();
  });
  const back=$('[data-page-back]');
  if(back)back.onclick=()=>{
    selectedPage='';
    render();
  };
}

function savedDeviceState(){
  try{return localStorage.getItem(DEVICE_STATE_KEY)||'unknown'}catch(error){return'unknown'}
}

function saveDeviceState(value){
  try{localStorage.setItem(DEVICE_STATE_KEY,value)}catch(error){}
}

function showDeviceState(value,message=''){
  const box=$('#deviceStatusBox');
  const text=$('#deviceStatusText');
  const note=$('#deviceActionMessage');
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
  clearTimeout(deviceTimer);
  if(!popup){
    if(note)note.textContent='Браузърът блокира прозореца. Разреши изскачащите прозорци и опитай отново.';
    return;
  }
  deviceTimer=setTimeout(()=>{
    const currentNote=$('#deviceActionMessage');
    if(currentNote)currentNote.textContent='Сайтът не върна отговор. Настройката не е потвърдена и трябва да се поправи в production страниците.';
  },5000);
}

function bindDeviceControls(){
  if(current!=='system')return;
  showDeviceState(savedDeviceState());
  const exclude=$('#excludeDeviceBtn');
  const include=$('#includeDeviceBtn');
  const check=$('#checkDeviceBtn');
  if(exclude)exclude.onclick=()=>openDeviceAction('exclude');
  if(include)include.onclick=()=>openDeviceAction('include');
  if(check)check.onclick=()=>openDeviceAction('status');
}

window.addEventListener('message',event=>{
  if(event.origin!==SITE_ORIGIN)return;
  const payload=event.data;
  if(!payload||payload.type!=='ivanov-analytics-device-status')return;
  clearTimeout(deviceTimer);
  const state=payload.excluded?'excluded':'included';
  saveDeviceState(state);
  showDeviceState(state,payload.excluded?'Готово — твоите посещения няма да се записват.':'Готово — отчитането е включено.');
});

function label(type){
  return({
    phone_click:'Клик за обаждане',
    viber_click:'Viber',
    form_submit:'Опит за форма',
    faq_open:'FAQ',
    gallery_open:'Галерия',
    price_open:'Цени',
    contact_open:'Контакти'
  })[type]||type;
}

function siteName(site){
  return({sofia:'София',lom:'Лом',montana:'Монтана','lom-en':'Лом EN','lom-de':'Лом DE'})[site]||site;
}

function drawChart(){
  const canvas=$('#mainChart');
  if(!canvas)return;
  const grouped=group(chartEvents,event=>localDay(event.date)).sort((a,b)=>a[0].localeCompare(b[0]));
  const values=grouped.map(([,items])=>items.length);
  const labels=grouped.map(([,items])=>shortDay(items[0].date));
  const rect=canvas.getBoundingClientRect();
  const density=devicePixelRatio||1;
  canvas.width=rect.width*density;
  canvas.height=rect.height*density;
  const context=canvas.getContext('2d');
  context.scale(density,density);
  const width=rect.width;
  const height=rect.height;
  const padding=34;
  const maximum=Math.max(...values,1);
  context.clearRect(0,0,width,height);
  context.strokeStyle='#dbe4ee';
  for(let index=0;index<5;index++){
    const y=padding+(height-2*padding)*index/4;
    context.beginPath();
    context.moveTo(padding,y);
    context.lineTo(width-padding,y);
    context.stroke();
  }
  if(!values.length){
    context.fillStyle='#6e7f93';
    context.fillText('Няма данни',padding,height/2);
    return;
  }
  context.strokeStyle='#d7a43b';
  context.lineWidth=3;
  context.beginPath();
  values.forEach((value,index)=>{
    const x=padding+(width-2*padding)*(values.length===1?.5:index/(values.length-1));
    const y=height-padding-(height-2*padding)*value/maximum;
    index?context.lineTo(x,y):context.moveTo(x,y);
  });
  context.stroke();
  context.fillStyle='#6e7f93';
  context.font='11px system-ui';
  labels.forEach((label,index)=>{
    if(labels.length>10&&index%Math.ceil(labels.length/8))return;
    const x=padding+(width-2*padding)*(labels.length===1?.5:index/(labels.length-1));
    context.fillText(label,x-10,height-10);
  });
}
