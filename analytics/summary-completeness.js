import{fetchAnalyticsEvents}from'./event-source.js?v=20260829-stage5m';
import{TRACKED_PAGES,normalizePath}from'./sites.js?v=20260818-5';

const view=document.querySelector('#view');
const BUSINESS=new Set(['phone_click','viber_click','form_success']);
const INTEREST=new Set(['gallery_open','video_play','faq_open','price_open','contact_open']);
const pageLabels=new Map(TRACKED_PAGES.map(page=>[normalizePath(page.path),page.label]));
let runToken=0;
let scheduled=0;

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function pageLabel(path){
  const normalized=normalizePath(path||'/');
  if(pageLabels.has(normalized))return pageLabels.get(normalized);
  if(normalized==='/'||normalized==='/index.html')return'Начална страница';
  return normalized.split('/').pop().replace('.html','').split('-').join(' ').split('_').join(' ')||'Страница';
}

function sessionsFrom(items){
  const grouped=new Map();
  items.forEach(event=>{
    const id=event.sessionId||event.id;
    if(!id)return;
    if(!grouped.has(id))grouped.set(id,[]);
    grouped.get(id).push(event);
  });
  return[...grouped.entries()].map(([id,raw])=>{
    const events=[...raw].sort((a,b)=>a.date-b.date);
    const views=events.filter(event=>event.eventType==='page_view');
    const pages=[...new Set(views.map(event=>normalizePath(event.pagePath||'/')).filter(Boolean))];
    const business=events.filter(event=>BUSINESS.has(event.eventType));
    const interest=events.filter(event=>INTEREST.has(event.eventType));
    const active=Math.max(0,...events.filter(event=>event.eventType==='engagement'||event.eventType==='session_end').map(event=>+event.activeSeconds||0));
    const scroll=Math.max(0,...events.filter(event=>event.eventType==='scroll').map(event=>+event.scrollDepth||0));
    const span=views.length>1?views[views.length-1].date-views[0].date:0;
    const first=views[0]||events[0];
    const browser=first?.browser||'unknown';
    const os=first?.os||'unknown';
    const technical=views.length>=4&&pages.length>=3&&span<=30000&&!business.length&&!interest.length&&active<10&&scroll<25&&(String(os).toLowerCase()==='other'||String(browser).toLowerCase()==='other');
    const geo=events.find(event=>event.eventType==='session_geo'&&event.country&&event.country!=='unknown');
    return{id,events,pages,business,interest,technical,city:geo?.city||'unknown',country:geo?.country||'unknown'};
  });
}

function siteFiltered(items){
  const site=document.querySelector('#siteFilter')?.value||'all';
  if(site==='all')return items;
  return items.filter(event=>event.site===site);
}

function allPages(sessions){
  const map=new Map();
  sessions.forEach(session=>session.pages.forEach(path=>{
    if(!map.has(path))map.set(path,{path,sessions:new Set(),interest:new Set(),client:new Set()});
    const row=map.get(path);
    const pageEvents=session.events.filter(event=>normalizePath(event.pagePath||'/')===path);
    row.sessions.add(session.id);
    if(pageEvents.some(event=>INTEREST.has(event.eventType)))row.interest.add(session.id);
    if(pageEvents.some(event=>BUSINESS.has(event.eventType)))row.client.add(session.id);
  }));
  return[...map.values()].sort((a,b)=>b.client.size-a.client.size||b.interest.size-a.interest.size||b.sessions.size-a.sessions.size||pageLabel(a.path).localeCompare(pageLabel(b.path),'bg'));
}

function allGeo(sessions){
  const map=new Map();
  sessions.filter(session=>!session.technical&&session.country!=='unknown').forEach(session=>{
    const city=session.city&&session.city!=='unknown'?session.city:'Неизвестен град';
    const key=`${city}|${session.country}`;
    map.set(key,(map.get(key)||0)+1);
  });
  return[...map.entries()].map(([key,count])=>{
    const separator=key.lastIndexOf('|');
    return{city:key.slice(0,separator),country:key.slice(separator+1),count};
  }).sort((a,b)=>b.count-a.count||a.city.localeCompare(b.city,'bg'));
}

function openPage(path){
  document.querySelector('.nav button[data-view="pages"]')?.click();
  setTimeout(()=>{
    const target=[...document.querySelectorAll('[data-page]')].find(node=>normalizePath(node.dataset.page||'')===normalizePath(path));
    target?.click();
  },50);
}

function renderAll(pages,geo,technical){
  if(!view?.querySelector('[data-summary-final]'))return;
  const sections=[...view.querySelectorAll('.summary-section')];
  const pagesSection=sections.find(section=>section.querySelector('h2')?.textContent.includes('Най-силни страници')||section.querySelector('h2')?.textContent.includes('Всички страници'));
  const geoSection=sections.find(section=>section.querySelector('h2')?.textContent.includes('Къде са посетителите'));

  if(pagesSection){
    const heading=pagesSection.querySelector('h2');
    if(heading&&heading.firstChild)heading.firstChild.textContent='Всички страници ';
    const list=pagesSection.querySelector('.summary-page-list');
    if(list){
      list.innerHTML=pages.length?pages.map(row=>`<article class="summary-page-row"><div class="summary-page-main"><strong>${esc(pageLabel(row.path))}</strong><span>${row.interest.size} с интерес · ${row.client.size} клиентски сесии</span></div><div class="summary-page-sessions"><strong>${row.sessions.size}</strong><span>сесии</span></div><button class="action-secondary compact" data-all-open-page="${esc(row.path)}">Отвори статистика</button></article>`).join(''):'<div class="summary-empty">Няма данни за периода.</div>';
      list.querySelectorAll('[data-all-open-page]').forEach(button=>button.addEventListener('click',()=>openPage(button.dataset.allOpenPage)));
    }
  }

  if(geoSection){
    const list=geoSection.querySelector('.summary-geo-list');
    if(list){
      list.innerHTML=geo.map(row=>`<div class="summary-geo-row"><span><strong>${esc(row.city)}</strong><small>${esc(row.country)}</small></span><b>${row.count}</b></div>`).join('')+(technical?`<div class="summary-geo-row technical"><span><strong>Вероятно технически трафик</strong><small>по поведение, не по държава</small></span><b>${technical}</b></div>`:'');
    }
  }
}

async function refresh(){
  if(!view?.querySelector('[data-summary-final]'))return;
  const token=++runToken;
  try{
    const range=window.IvanovPeriods?.rangeFromControls?.();
    if(!range)return;
    const events=siteFiltered(await fetchAnalyticsEvents(range));
    if(token!==runToken||!view.querySelector('[data-summary-final]'))return;
    const sessions=sessionsFrom(events);
    renderAll(allPages(sessions),allGeo(sessions),sessions.filter(session=>session.technical).length);
  }catch(error){
    console.warn('Summary completeness failed',error);
  }
}

function schedule(){
  clearTimeout(scheduled);
  scheduled=setTimeout(refresh,80);
}

if(view){
  new MutationObserver(()=>{
    if(view.querySelector('[data-summary-final]')&&!view.querySelector('[data-all-open-page]'))schedule();
  }).observe(view,{childList:true,subtree:true});
}
['siteFilter','periodFilter','dateFrom','dateTo'].forEach(id=>document.querySelector(`#${id}`)?.addEventListener('change',schedule));
document.querySelector('#refreshBtn')?.addEventListener('click',schedule);
schedule();
