import{initializeApp}from'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import{getAuth,signInWithEmailAndPassword,onAuthStateChanged,signOut,setPersistence,browserLocalPersistence}from'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import{getFirestore,collection,getDocs,query,where,orderBy,limit,Timestamp}from'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import{firebaseConfig,OWNER_UID}from'./firebase-config.js?v=20260818-5';
import{TRACKED_PAGES,normalizePath,pageLabel,pageUrl}from'./sites.js?v=20260818-5';

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

function range(){return window.IvanovPeriods.rangeFromControls()}
function previousRange(currentRange){return window.IvanovPeriods.previousRange(currentRange)}

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
    const geo=ordered.find(event=>event.eventType==='session_geo'&&event.country&&event.country!=='unknown');
    const sessionCity=geo?.city||'unknown';
    const sessionCountry=geo?.country||'unknown';
    sessionEvents.forEach(event=>{
      event.sessionSource=source||'direct';
      event.sessionCity=sessionCity;
      event.sessionCountry=sessionCountry;
    });
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
  const formAttempts=by(items,'form_submit').length;
  const formSuccess=by(items,'form_success').length;
  const businessTypes=new Set(['phone_click','viber_click','form_success']);
  const interestTypes=new Set(['gallery_open','video_play','faq_open','price_open','contact_open']);
  const businessEvents=items.filter(event=>businessTypes.has(event.eventType));
  const interestEvents=items.filter(event=>interestTypes.has(event.eventType));
  const businessSessions=new Set(businessEvents.map(event=>event.sessionId).filter(Boolean));
  const interestSessions=new Set(interestEvents.map(event=>event.sessionId).filter(Boolean));
  const actions=businessEvents.length;
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
    sessions,pages:pageViews.length,phone,viber,formAttempts,formSuccess,actions,
    businessSessions:businessSessions.size,interest:interestEvents.length,interestSessions:interestSessions.size,
    engaged:engagedSessions.size,average,
    conversion:percent(businessSessions.size,sessions),
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

function decorateTables(){
  document.querySelectorAll('.table-wrap table').forEach(table=>{
    const headers=[...table.querySelectorAll('thead th')].map(cell=>cell.textContent.trim());
    table.querySelectorAll('tbody tr').forEach(row=>{
      [...row.children].forEach((cell,index)=>{
        if(cell.matches('td'))cell.dataset.label=headers[index]||'';
      });
    });
  });
}

function render(){
  const data=filtered();
  const previous=filtered(previousEvents);
  const renderers={summary,pages,results,sources,system};
  $('#view').innerHTML=renderers[current](data,previous);
  requestAnimationFrame(()=>{
    decorateTables();
    drawChart();
    bindDynamicControls();
    bindDeviceControls();
  });
}

function mediaInsights(items){
  const mediaEvents=items.filter(event=>event.eventType==='gallery_open'||event.eventType==='video_play');
  const gallerySessions=uniq(mediaEvents.filter(event=>event.eventType==='gallery_open'),'sessionId');
  const videoSessions=uniq(mediaEvents.filter(event=>event.eventType==='video_play'),'sessionId');
  const uniqueEvents=[...new Map(mediaEvents
    .sort((a,b)=>b.date-a.date)
    .map(event=>[`${event.sessionId||event.id}|${event.eventType}|${event.pagePath}`,event])).values()];
  const rows=uniqueEvents.slice(0,100).map(event=>{
    const source=event.sessionSource||event.source||'direct';
    const isAds=String(source).toLowerCase()==='google'&&String(event.medium||'').toLowerCase()==='cpc';
    const city=event.sessionCity&&event.sessionCity!=='unknown'?event.sessionCity:'—';
    return`<tr>
      <td>${dateTime(event.date)}</td>
      <td>${esc(label(event.eventType))}</td>
      <td><button class="link-button" data-page="${esc(event.pagePath)}">${esc(pageLabel(event.pagePath))}</button></td>
      <td>${esc(source)}</td>
      <td>${isAds?esc(event.campaign||'—'):'—'}</td>
      <td>${isAds?esc(event.term||'—'):'—'}</td>
      <td>${isAds?esc(event.content||'—'):'—'}</td>
      <td>${esc(event.device||'—')}</td>
      <td>${esc(city)}</td>
    </tr>`;
  });
  return{gallerySessions,videoSessions,rows};
}

function mediaBlock(items,title='Снимки и видео'){
  const media=mediaInsights(items);
  return`<div class="card section-gap"><h2>${esc(title)}</h2>
    <p class="card-note">Показва уникални сесии, в които е отворена галерия или е пуснато видео. Източникът е за всички посещения; Ads колоните се попълват само при Google Ads.</p>
    <div class="small-metrics">
      <div><strong>${media.gallerySessions}</strong><span>сесии с галерия</span></div>
      <div><strong>${media.videoSessions}</strong><span>сесии с видео</span></div>
    </div>
    ${table(['Дата','Действие','Страница','Източник','Ads кампания','Ключова дума','Реклама','Устройство','Град'],media.rows,'Няма отваряне на снимки или пускане на видео за избрания период.')}
  </div>`;
}

function summary(items,previousItems){
  const currentStats=stats(items);
  const oldStats=stats(previousItems);
  chartEvents=by(items,'page_view');
  const strongest=TRACKED_PAGES
    .map(page=>({page,pageStats:stats(items.filter(event=>event.pagePath===page.path))}))
    .filter(row=>row.pageStats.pages||row.pageStats.actions||row.pageStats.interest)
    .sort((a,b)=>b.pageStats.businessSessions-a.pageStats.businessSessions||b.pageStats.interestSessions-a.pageStats.interestSessions||b.pageStats.pages-a.pageStats.pages)
    .slice(0,8)
    .map(row=>`<tr><td><button class="link-button" data-page="${esc(row.page.path)}">${esc(row.page.label)}</button></td><td>${row.pageStats.sessions}</td><td>${row.pageStats.interestSessions}</td><td>${row.pageStats.businessSessions}</td><td>${row.pageStats.conversion}</td></tr>`);
  const sourceRows=sourceGroups(items).slice(0,8).map(row=>`<tr><td>${esc(row.source)}</td><td>${row.stats.sessions}</td><td>${row.stats.actions}</td><td>${row.stats.conversion}</td></tr>`);
  const siteRows=group(items,event=>event.site||'other').map(([site,siteEvents])=>{
    const value=stats(siteEvents);
    return`<tr><td>${esc(siteName(site))}</td><td>${value.sessions}</td><td>${value.pages}</td><td>${value.actions}</td><td>${value.conversion}</td></tr>`;
  });
  const mobile=uniq(by(items,'page_view').filter(event=>event.device==='mobile'),'sessionId');
  const browserRows=group(by(items,'page_view'),event=>event.browser||'Неизвестно')
    .map(([browser,browserEvents])=>`<tr><td>${esc(browser)}</td><td>${uniq(browserEvents,'sessionId')}</td></tr>`);
  const osRows=group(by(items,'page_view'),event=>event.os||'Неизвестно')
    .map(([os,osEvents])=>`<tr><td>${esc(os)}</td><td>${uniq(osEvents,'sessionId')}</td></tr>`);
  const geoSessionViews=by(items,'page_view').filter(event=>event.sessionCountry&&event.sessionCountry!=='unknown');
  const geoRows=group(geoSessionViews,event=>`${event.sessionCity||'unknown'}|${event.sessionCountry||'unknown'}`)
    .map(([key,geoEvents])=>{
      const [city,country]=key.split('|');
      return{city,country,sessions:uniq(geoEvents,'sessionId')};
    })
    .sort((a,b)=>b.sessions-a.sessions)
    .slice(0,20)
    .map(row=>`<tr><td>${esc(row.city==='unknown'?'Неизвестен град':row.city)}</td><td>${esc(row.country)}</td><td>${row.sessions}</td></tr>`);
  const hourBuckets=[
    {label:'00–06',from:0,to:6},{label:'06–09',from:6,to:9},{label:'09–12',from:9,to:12},
    {label:'12–15',from:12,to:15},{label:'15–18',from:15,to:18},{label:'18–21',from:18,to:21},{label:'21–24',from:21,to:24}
  ];
  const localHour=date=>+new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Sofia',hour:'2-digit',hourCycle:'h23'}).format(date);
  const businessTypes=new Set(['phone_click','viber_click','form_success']);
  const hourRows=hourBuckets.map(bucket=>{
    const visits=by(items,'page_view').filter(event=>{const hour=localHour(event.date);return hour>=bucket.from&&hour<bucket.to});
    const actions=items.filter(event=>businessTypes.has(event.eventType)&&(()=>{const hour=localHour(event.date);return hour>=bucket.from&&hour<bucket.to})());
    return`<tr><td>${bucket.label}</td><td>${uniq(visits,'sessionId')}</td><td>${uniq(actions,'sessionId')}</td></tr>`;
  });
  return head('Обобщение','Най-важното за трафика и реалните действия.','<div class="heading-actions"><button id="exportJsonBtn" class="action-secondary" type="button">Експорт JSON</button></div>')+
    `<div class="cards">
      ${metric('Сесии',currentStats.sessions,delta(currentStats.sessions,oldStats.sessions))}
      ${metric('Отворени страници',currentStats.pages,delta(currentStats.pages,oldStats.pages))}
      ${metric('Ангажирани посещения',currentStats.engaged,currentStats.engagementRate)}
      ${metric('Проявили интерес',currentStats.interestSessions)}
      ${metric('Клиентски действия',currentStats.actions,delta(currentStats.actions,oldStats.actions))}
      ${metric('Кликове за обаждане',currentStats.phone)}
      ${metric('Viber',currentStats.viber)}
      ${metric('Успешни форми',currentStats.formSuccess)}
      ${metric('Конверсия',currentStats.conversion,'уникални сесии с клиентско действие')}
    </div>
    ${mediaBlock(items)}
    <div class="card section-gap"><h2>Най-силни страници</h2>${table(['Страница','Сесии','Интерес','Клиентски сесии','Конверсия'],strongest)}</div>
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
        <div class="grid-2">
          <div>${table(['Браузър','Сесии'],browserRows)}</div>
          <div>${table(['ОС','Сесии'],osRows)}</div>
        </div>
      </div>
    </div>
    <div class="card section-gap"><h2>По часове</h2><p class="card-note">Часовете са по Europe/Sofia. „Клиентски сесии“ = телефон, Viber или успешно изпратена форма.</p>
      ${table(['Час','Сесии','Клиентски сесии'],hourRows)}
    </div>
    <div class="card section-gap"><h2>Град и държава</h2><p class="card-note">Приблизително местоположение от Cloudflare. Записват се само град и държава, веднъж на сесия.</p>
      ${table(['Град','Държава','Сесии'],geoRows,'Няма налични geo данни за избрания период.')}
    </div>`;
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
      ${metric('Клиентски действия',value.actions,value.conversion)}
      ${metric('Кликове за обаждане',value.phone)}
      ${metric('Viber',value.viber)}
      ${metric('Успешни форми',value.formSuccess)}
      ${metric('Средно отчетено време',time(value.average),'ориентировъчно за старите посещения')}
    </div>
    ${mediaBlock(pageEvents,'Снимки и видео на тази страница')}
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
    const actionEvents=ordered.filter(event=>['phone_click','viber_click','form_success','gallery_open','video_play','faq_open','price_open','contact_open'].includes(event.eventType));
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
  const businessTypes=['phone_click','viber_click','form_success'];
  const rows=items.filter(event=>businessTypes.includes(event.eventType))
    .sort((a,b)=>b.date-a.date)
    .map(event=>`<tr><td>${dateTime(event.date)}</td><td>${esc(label(event.eventType))}</td><td><button class="link-button" data-page="${esc(event.pagePath)}">${esc(pageLabel(event.pagePath))}</button></td><td>${esc(event.sessionSource||'direct')}</td><td>${esc(event.device||'')}</td><td>${esc(event.campaign||'—')}</td></tr>`);
  return head('Резултати','Реални клиентски действия. Кликът за обаждане не доказва проведен разговор.')+
    `<div class="cards">
      ${metric('Кликове за обаждане',value.phone)}
      ${metric('Viber',value.viber)}
      ${metric('Успешни форми',value.formSuccess)}
      ${metric('Опити за форма',value.formAttempts,'submit опити, включително неуспешни')}
      ${metric('Конверсия',value.conversion,'уникални сесии с клиентско действие')}
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
  const pageViews=by(items,'page_view');
  const googleAdsViews=pageViews.filter(event=>String(event.source||'').toLowerCase()==='google'&&String(event.medium||'').toLowerCase()==='cpc');
  const googleAdsSessionIds=new Set(googleAdsViews.map(event=>event.sessionId).filter(Boolean));
  const googleAdsRows=group(googleAdsViews,event=>`${event.campaign||'—'}\u0001${event.term||'—'}\u0001${event.content||'—'}`)
    .map(([key,views])=>{
      const [campaign,term,content]=key.split('\u0001');
      const sessionIds=new Set(views.map(event=>event.sessionId).filter(Boolean));
      const adEvents=items.filter(event=>sessionIds.has(event.sessionId));
      return{campaign,term,content,value:stats(adEvents)};
    })
    .sort((a,b)=>b.value.businessSessions-a.value.businessSessions||b.value.sessions-a.value.sessions)
    .map(row=>`<tr><td>${esc(row.campaign)}</td><td>${esc(row.term)}</td><td>${esc(row.content)}</td><td>${row.value.sessions}</td><td>${row.value.businessSessions}</td><td>${row.value.conversion}</td></tr>`);
  const otherCampaignRows=group(pageViews.filter(event=>event.campaign&&!googleAdsSessionIds.has(event.sessionId)),event=>event.campaign)
    .map(([campaign,views])=>{
      const sessionIds=new Set(views.map(event=>event.sessionId));
      const campaignEvents=items.filter(event=>sessionIds.has(event.sessionId));
      const value=stats(campaignEvents);
      return`<tr><td>${esc(campaign)}</td><td>${value.sessions}</td><td>${value.actions}</td><td>${value.conversion}</td></tr>`;
    });
  const otherCampaignBlock=otherCampaignRows.length
    ?`<div class="card section-gap"><h2>Други UTM кампании</h2><p class="card-note">Кампании извън платените Google Ads посещения.</p>${table(['Кампания','Сесии','Действия','Конверсия'],otherCampaignRows)}</div>`
    :'';
  return head('Източници','Първоначалният източник се пази за цялата сесия; вътрешните преминавания не се броят отделно.')+
    `<div class="card">${table(['Източник','Сесии','Страници','Ангажирани','Действия','Конверсия'],rows)}</div>
    <div class="card section-gap"><h2>Google Ads</h2><p class="card-note">Само платени посещения от Google Ads. Кампания и реклама са ID стойности от Google Ads; ключовата дума е тази, по която е дошло посещението.</p>${table(['Кампания (ID)','Ключова дума','Реклама (ID)','Сесии','Клиентски сесии','Конверсия'],googleAdsRows,'Още няма Google Ads посещение с новите UTM параметри за избрания период.')}</div>
    ${otherCampaignBlock}`;
}

function system(items){
  const periodName=$('#periodFilter').selectedOptions[0]?.textContent||'избрания период';
  const pageData=TRACKED_PAGES.map(page=>{
    const pageEvents=items.filter(event=>event.pagePath===page.path);
    const last=[...pageEvents].sort((a,b)=>b.date-a.date)[0];
    return{page,last,openings:by(pageEvents,'page_view').length};
  });
  const rows=pageData.map(({page,last,openings})=>`<tr><td>${esc(page.label)}</td><td>${last?dateTime(last.date):'Няма данни в периода'}</td><td>${esc(last?.trackerVersion||'—')}</td><td class="system-count">${openings}</td><td><button class="action-secondary compact" data-page="${esc(page.path)}">Статистика</button></td></tr>`);
  const mobileRows=pageData.map(({page,last,openings})=>`<article class="system-page-card">
    <div><strong>${esc(page.label)}</strong><div class="row-sub">${esc(page.path)}</div></div>
    <div class="system-page-meta"><span>Последно: ${last?dateTime(last.date):'няма данни'}</span><span>Tracker: ${esc(last?.trackerVersion||'—')}</span></div>
    <div class="system-page-action"><div class="system-period-count"><strong>${openings}</strong><span>отваряния · ${esc(periodName)}</span></div><button class="action-secondary" data-page="${esc(page.path)}">Статистика</button></div>
  </article>`);
  return head('Система и настройки','Техническата информация е събрана тук, без да се смесва с бизнес резултатите.')+
    `<div class="card system-pages-desktop"><h2>Следени страници</h2><p class="card-note">„Няма данни“ не доказва повреда — може просто да няма посещение. Това не е автоматичен uptime монитор.</p>
      ${table(['Страница','Последно събитие в периода','Tracker версия',`Отваряния · ${esc(periodName)}`,'' ],rows)}
    </div>
    <div class="system-pages-mobile"><h2>Следени страници</h2>${mobileRows.join('')}</div>
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
      <div class="card"><h2>Поверителност</h2><p>Не се записват име, телефонен номер, текст от форма, пълен IP адрес, координати, пощенски код, ISP или постоянен fingerprint.</p><p>Сесиите са временни и анонимни. Geo заявката връща само приблизителен град и държава.</p></div>
      <div class="card"><h2>Запазена техническа статистика</h2><p>Устройство, браузър, операционна система, скрол, активно време, източник и UTM параметри.</p><p>При налични данни се пазят приблизителен град и държава чрез едно отделно geo събитие на сесия.</p></div>
    </div>`;
}

function exportJson(){
  const data=filtered().map(event=>{
    const clean={...event,date:event.date?.toISOString?.()||null};
    delete clean.timestamp;
    return clean;
  });
  const payload={
    exportedAt:new Date().toISOString(),
    period:$('#periodFilter').selectedOptions[0]?.textContent||'',
    site:$('#siteFilter').value,
    eventCount:data.length,
    events:data
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;
  link.download=`ivanov-analytics-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function bindDynamicControls(){
  const exportButton=$('#exportJsonBtn');
  if(exportButton)exportButton.onclick=exportJson;
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
    form_success:'Успешна форма',
    faq_open:'FAQ',
    gallery_open:'Галерия',
    video_play:'Видео',
    price_open:'Цени',
    contact_open:'Контакти',
    session_geo:'Град / държава'
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