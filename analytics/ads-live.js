import{getApp}from'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import{getFirestore,collection,getDocs,getDocsFromCache,query,where,orderBy,limit,Timestamp}from'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const view=document.querySelector('#view');
const BUSINESS=new Set(['phone_click','viber_click','form_success']);
const INTEREST=new Set(['gallery_open','video_play','faq_open','price_open','contact_open']);
let runId=0;

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

async function cachedEvents(){
  const db=getFirestore(getApp()),r=currentRange();
  const q=query(collection(db,'analytics_events'),where('timestamp','>=',Timestamp.fromDate(r.start)),where('timestamp','<=',Timestamp.fromDate(r.end)),orderBy('timestamp','desc'),limit(10000));
  let snap=null;
  try{snap=await getDocsFromCache(q)}catch(_){}
  if(!snap||snap.empty)snap=await getDocs(q);
  return snap.docs.map(doc=>({id:doc.id,...doc.data(),date:doc.data().timestamp?.toDate?.()||new Date()}));
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
  return site==='all'?sessions:sessions.filter(session=>session.events.some(event=>event.site===site));
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
  const old=campaignCard.querySelector('.channel-status');
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

async function enhance(){
  if(!view?.querySelector('[data-external-shell="ads"]'))return;
  const id=++runId;
  try{const sessions=siteFiltered(groupSessions(await cachedEvents()));if(id!==runId)return;renderData(sessions)}catch(error){if(id!==runId)return;renderError(error)}
}

if(view){new MutationObserver(enhance).observe(view,{childList:true,subtree:true});enhance()}
document.querySelector('#siteFilter')?.addEventListener('change',()=>setTimeout(enhance,0));
document.querySelector('#periodFilter')?.addEventListener('change',()=>setTimeout(enhance,0));
