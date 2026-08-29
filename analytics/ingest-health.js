const SITE_ORIGIN='https://ivanov-remonti.com';
const PROBE_PATH='/?ivanov_ingest_health=1';
const STORAGE_KEY='ivanov_ingest_health_state_v1';
const WARNING_ID='analyticsIngestWarning';
const FAILURE_LIMIT=3;
const PROBE_INTERVAL_MS=5*60*1000;
const PROBE_TIMEOUT_MS=12000;

let probeTimer=0;
let probeTimeout=0;
let probeFrame=null;
let awaitingProbe=false;

function appVisible(){
  const app=document.querySelector('#app');
  return Boolean(app&&!app.classList.contains('hidden'));
}

function loadState(){
  try{
    const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(value&&typeof value==='object')return value;
  }catch(e){}
  return{failures:0,firstFailureAt:null,lastCheckedAt:null,lastError:''};
}

function saveState(state){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}catch(e){}
}

function formatTime(value){
  if(!value)return'';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return'';
  return date.toLocaleString('bg-BG',{timeZone:'Europe/Sofia'});
}

function renderWarning(){
  const topbar=document.querySelector('.topbar');
  const existing=document.getElementById(WARNING_ID);
  const state=loadState();
  if(!topbar||state.failures<FAILURE_LIMIT){
    existing?.remove();
    return;
  }
  const node=existing||document.createElement('span');
  node.id=WARNING_ID;
  node.setAttribute('role','alert');
  const since=formatTime(state.firstFailureAt)||'неизвестен час';
  node.textContent=`⚠ Проследяването е спряло от ${since}`;
  node.title=`Три или повече поредни проверки от production сайта не достигат успешно analytics ingest. Последна грешка: ${state.lastError||'неизвестна'}.`;
  node.style.cssText='display:inline-flex;align-items:center;gap:6px;max-width:360px;padding:7px 10px;border:1px solid #b42318;border-radius:8px;background:#fff1f0;color:#b42318;font-size:12px;font-weight:800;line-height:1.25;white-space:normal;';
  if(!existing){
    const spacer=topbar.querySelector('.spacer');
    topbar.insertBefore(node,spacer||null);
  }
}

function cleanupProbe(){
  clearTimeout(probeTimeout);
  probeTimeout=0;
  awaitingProbe=false;
  probeFrame?.remove();
  probeFrame=null;
}

function markSuccess(checkedAt){
  saveState({failures:0,firstFailureAt:null,lastCheckedAt:checkedAt||new Date().toISOString(),lastError:''});
  renderWarning();
}

function markFailure(error,checkedAt){
  const previous=loadState();
  const now=checkedAt||new Date().toISOString();
  const state={
    failures:Number(previous.failures||0)+1,
    firstFailureAt:previous.firstFailureAt||now,
    lastCheckedAt:now,
    lastError:String(error||'probe_failed')
  };
  saveState(state);
  renderWarning();
}

function runProbe(){
  if(awaitingProbe||!appVisible())return;
  awaitingProbe=true;
  const frame=document.createElement('iframe');
  frame.tabIndex=-1;
  frame.setAttribute('aria-hidden','true');
  frame.style.cssText='position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;border:0;left:-9999px;top:-9999px;';
  frame.src=`${SITE_ORIGIN}${PROBE_PATH}&t=${Date.now()}`;
  probeFrame=frame;
  document.body.appendChild(frame);
  probeTimeout=setTimeout(()=>{
    if(!awaitingProbe)return;
    cleanupProbe();
    markFailure('probe_timeout');
  },PROBE_TIMEOUT_MS);
}

window.addEventListener('message',event=>{
  if(event.origin!==SITE_ORIGIN)return;
  const data=event.data;
  if(!data||data.type!=='ivanov-analytics-ingest-health')return;
  cleanupProbe();
  if(data.ok)markSuccess(data.checkedAt);
  else markFailure(data.error||`http_${data.status||0}`,data.checkedAt);
});

document.querySelector('#refreshBtn')?.addEventListener('click',()=>setTimeout(runProbe,300));

const app=document.querySelector('#app');
if(app){
  new MutationObserver(()=>{
    if(appVisible())setTimeout(runProbe,500);
    else cleanupProbe();
  }).observe(app,{attributes:true,attributeFilter:['class']});
}

renderWarning();
setTimeout(runProbe,1200);
probeTimer=setInterval(runProbe,PROBE_INTERVAL_MS);
window.addEventListener('pagehide',()=>{
  clearInterval(probeTimer);
  cleanupProbe();
},{once:true});
