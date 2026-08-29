import{fetchAnalyticsEvents,clearAnalyticsEventCache}from'./event-source.js?v=20260829-stage5j';

const view=document.querySelector('#view');
const BUSINESS=new Set(['phone_click','viber_click','form_success']);
const INTEREST=new Set(['gallery_open','video_play','faq_open','price_open','contact_open']);
let runId=0;

function currentRange(){return window.IvanovPeriods.rangeFromControls()}

async function cachedEvents(force=false){
  if(force)clearAnalyticsEventCache();
  return fetchAnalyticsEvents(currentRange(),{force});
}

function groupSessions(items){
  const map=new Map();
  items.forEach(event=>{const id=event.sessionId||event.id;if(!map.has(id))map.set(id,[]);map.get(id).push(event)});
  return[...map.entries()].map(([id,events])=>{
    const ordered=[...events].sort((a,b)=>a.date-b.date);
    const adView=ordered.find(event=>event.eventType==='page_view'&&String(event.source||'').toLowerCase()==='google'&&String(event.medium||'').toLowerCase()==='cpc');
    return{id,events:ordered,adView,business:ordered.some(event=>BUSINESS.has(event.eventType)),interest:ordered.some(event=>INTEREST.has(event.eventType))};
  }).filter(session=>session.adView);
}

function siteFiltered(sessions){
  const site=document.querySelector('#siteFilter')?.value||'all';
  return site==='all'?sessions:sessions.filter(session=>session.adView?.site===site);
}

function esc(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
function pct(value,total){return total?`${(value/total*100).toFixed(1)}%`:'0%'}

function campaignRows(sessions){
  const map=new Map();
  sessions.forEach(session=>{
    const event=session.adView;
    const campaign=event.campaign||'Без campaign ID',term=event.term||'—',content=event.content||'—';
    const key=[campaign,term,content].join('\u0001');
    if(!map.has(key))map.set(key,{campaign,term,content,sessions:0,clients:0});
    const row=map.get(key);row.sessions++;if(session.business)row.clients++;
  });
  return[...map.values()].sort((a,b)=>b.clients-a.clients||b.sessions-a.sessions).slice(0,6);
}

function renderData(sessions){
  const shell=view?.querySelector('[data-external-shell="ads"]');if(!shell)return;
  const interested=sessions.filter(session=>session.interest).length,clients=sessions.filter(session=>session.business).length;
  const values=[sessions.length,interested,clients,pct(clients,sessions.length)];
  shell.querySelectorAll('.ads-overview .channel-metric strong').forEach((node,index)=>{node.textContent=values[index]??'—'});
  const status=shell.querySelector('.ads-overview .channel-state');if(status){status.textContent='Реални tracker данни';status.classList.remove('pending');status.classList.add('live')}
  const campaignCard=shell.querySelector('.channel-grid .channel-card:first-child');if(!campaignCard)return;
  const rows=campaignRows(sessions);
  const old=campaignCard.querySelector('.channel-status,.ads-live-list');
  const list=document.createElement('div');list.className='ads-live-list';
  list.innerHTML=rows.length?rows.map(row=>`<div><span><strong>${esc(row.term)}</strong><small>Кампания ${esc(row.campaign)} · Реклама ${esc(row.content)}</small></span><em>${row.clients} клиентски / ${row.sessions} сесии</em></div>`).join(''):'<p class="channel-status">Няма Google Ads сесии за избрания период.</p>';
  old?.replaceWith(list);
}

function renderError(error){
  const shell=view?.querySelector('[data-external-shell="ads"]');if(!shell)return;
  const status=shell.querySelector('.ads-overview .channel-state');if(status){status.textContent='Грешка при зареждане';status.classList.remove('live');status.classList.add('pending')}
  const campaignCard=shell.querySelector('.channel-grid .channel-card:first-child');
  const old=campaignCard?.querySelector('.channel-status,.ads-live-list');
  if(old){const node=document.createElement('p');node.className='channel-status';node.textContent='Ads данните не могат да се заредят в момента. Опитай „Обнови“.';old.replaceWith(node)}
  console.warn('Ads tracker data unavailable.',error);
}

async function enhance(force=false){
  if(!view?.querySelector('[data-external-shell="ads"]'))return;
  const id=++runId;
  try{const sessions=siteFiltered(groupSessions(await cachedEvents(force)));if(id!==runId)return;renderData(sessions)}catch(error){if(id!==runId)return;renderError(error)}
}

if(view){new MutationObserver(()=>enhance(false)).observe(view,{childList:true,subtree:true});enhance(false)}
['siteFilter','periodFilter','dateFrom','dateTo'].forEach(id=>document.querySelector(`#${id}`)?.addEventListener('change',()=>setTimeout(()=>enhance(false),0)));
document.querySelector('#refreshBtn')?.addEventListener('click',()=>setTimeout(()=>enhance(true),0));
