import{normalizePath,siteFromPath}from'./sites.js?v=20260818-5';

const VERSION='2.1.14';
const INGEST_ENDPOINT='https://ivanov-channels.traqnivanov1.workers.dev/ingest';
const GEO_ENDPOINT='https://ivanov-geo.traqnivanov1.workers.dev/';
const EXCLUDE_KEY='ivanov_analytics_excluded';
const DASHBOARD_ORIGIN='https://traqnivanov.github.io';
const SESSION_TIMEOUT_MS=30*60*1000;
const SESSION_ID_KEY='ia_session';
const SESSION_ACTIVITY_KEY='ia_session_last_activity_v2';
const RETRY_QUEUE_KEY='ivanov_analytics_retry_v1';
const RETRY_QUEUE_MAX=80;
const RETRY_QUEUE_MAX_AGE_MS=48*60*60*1000;
const RETRY_FLUSH_LIMIT=12;
const params=new URLSearchParams(location.search);
const adminAction=params.get('ivanov_device_action');
const ingestHealth=params.get('ivanov_ingest_health')==='1';

function isObviousBot(){
  const u=navigator.userAgent||'';
  return /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|headlesschrome|lighthouse/i.test(u);
}

function postToDashboard(message){
  try{
    if(window.opener&&!window.opener.closed)window.opener.postMessage(message,DASHBOARD_ORIGIN);
  }catch(e){}
  try{
    if(window.parent&&window.parent!==window)window.parent.postMessage(message,DASHBOARD_ORIGIN);
  }catch(e){}
}

async function runIngestHealthProbe(){
  const checkedAt=new Date().toISOString();
  let result={type:'ivanov-analytics-ingest-health',ok:false,status:0,error:'probe_failed',checkedAt};
  try{
    const response=await fetch(INGEST_ENDPOINT,{
      method:'POST',mode:'cors',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',
      headers:{'Content-Type':'text/plain;charset=UTF-8'},
      body:JSON.stringify({eventType:'__ivanov_health_probe__'})
    });
    let body=null;
    try{body=await response.json()}catch(e){}
    const ok=response.status===400&&body?.error==='invalid_event_type';
    result={
      type:'ivanov-analytics-ingest-health',ok,status:response.status,
      error:ok?'':String(body?.error||`http_${response.status}`),checkedAt
    };
  }catch(error){
    result.error=String(error?.message||error||'network_error');
  }
  postToDashboard(result);
}

function getExcluded(){
  try{return localStorage.getItem(EXCLUDE_KEY)==='1'}catch(e){return false}
}

function setExcluded(value){
  try{
    if(value)localStorage.setItem(EXCLUDE_KEY,'1');
    else localStorage.removeItem(EXCLUDE_KEY);
  }catch(e){}
}

function adminMessage(excluded,action){
  return{
    type:'ivanov-analytics-device-status',
    excluded:Boolean(excluded),
    action:action||'status'
  };
}

function sendStatusToDashboard(excluded,action){
  postToDashboard(adminMessage(excluded,action));
}

function renderAdminResult(excluded,action){
  const isStatus=action==='status';
  const title=isStatus
    ?(excluded?'Това устройство е изключено':'Това устройство се отчита')
    :(excluded?'Устройството е изключено':'Отчитането е включено отново');
  const text=excluded
    ?'Посещенията от този браузър вече няма да влизат в Ivanov Analytics.'
    :'Посещенията от този браузър отново ще се записват в Ivanov Analytics.';

  const show=()=>{
    document.title=title;
    document.documentElement.lang='bg';
    document.body.innerHTML=`
      <main style="min-height:100vh;display:grid;place-items:center;padding:24px;background:#eef3f8;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#152033">
        <section style="width:min(520px,100%);background:#fff;border:1px solid #dbe4ee;border-radius:22px;padding:28px;box-shadow:0 18px 50px rgba(20,32,51,.14);text-align:center">
          <div style="width:58px;height:58px;margin:0 auto 16px;border-radius:50%;display:grid;place-items:center;background:${excluded?'#eaf7ef':'#fff4e5'};font-size:30px">${excluded?'✓':'●'}</div>
          <h1 style="font-size:1.55rem;margin:0 0 10px">${title}</h1>
          <p style="line-height:1.55;color:#607086;margin:0 0 14px">${text}</p>
          <p id="ivanovCloseNote" style="font-size:.88rem;color:#7a899a;margin:0">Връщане към приложението…</p>
          <button id="ivanovCloseButton" type="button" style="display:none;margin:16px auto 0;border:0;border-radius:11px;padding:11px 16px;background:#111827;color:#fff;font-weight:800">Затвори страницата</button>
        </section>
      </main>`;

    sendStatusToDashboard(excluded,action);

    setTimeout(()=>{
      try{window.close()}catch(e){}
      setTimeout(()=>{
        const note=document.getElementById('ivanovCloseNote');
        const button=document.getElementById('ivanovCloseButton');
        if(note)note.textContent='Готово. Може да затворите тази страница.';
        if(button){
          button.style.display='inline-flex';
          button.onclick=()=>window.close();
        }
      },500);
    },1300);
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',show,{once:true});
  else show();
}

let excluded=getExcluded();

if(ingestHealth){
  runIngestHealthProbe();
}else if(adminAction==='exclude'){
  setExcluded(true);
  excluded=true;
  renderAdminResult(true,'exclude');
}else if(adminAction==='include'){
  setExcluded(false);
  excluded=false;
  renderAdminResult(false,'include');
}else if(adminAction==='status'){
  renderAdminResult(excluded,'status');
}

if(!adminAction&&!ingestHealth&&!excluded&&!isObviousBot()){
  const path=normalizePath(location.pathname);
  const site=siteFromPath(path);
  const q=new URLSearchParams(location.search);
  let sessionStart=Date.now();
  let active=0,last=Date.now(),visible=!document.hidden,scrolls=new Set(),engagements=new Set();
  let lastActivityAt=Date.now();
  let retryFlushRunning=false;

  function newSessionId(){
    return crypto.randomUUID?.()||Math.random().toString(36).slice(2);
  }

  function restoreSession(){
    const now=Date.now();
    try{
      const storedId=sessionStorage.getItem(SESSION_ID_KEY);
      const storedActivity=Number(sessionStorage.getItem(SESSION_ACTIVITY_KEY)||0);
      if(storedId&&Number.isFinite(storedActivity)&&storedActivity>0&&now-storedActivity<SESSION_TIMEOUT_MS){
        lastActivityAt=storedActivity;
        return storedId;
      }
    }catch(e){}
    const id=newSessionId();
    lastActivityAt=now;
    try{
      sessionStorage.setItem(SESSION_ID_KEY,id);
      sessionStorage.setItem(SESSION_ACTIVITY_KEY,String(now));
    }catch(e){}
    return id;
  }

  let sessionId=restoreSession();

  function markActivity(now=Date.now()){
    lastActivityAt=now;
    try{
      sessionStorage.setItem(SESSION_ID_KEY,sessionId);
      sessionStorage.setItem(SESSION_ACTIVITY_KEY,String(now));
    }catch(e){}
  }

  function device(){
    let u=navigator.userAgent;
    return/iPad|Tablet/i.test(u)?'tablet':/Mobi|Android|iPhone/i.test(u)?'mobile':'desktop';
  }
  function browser(){
    let u=navigator.userAgent;
    return/Edg/i.test(u)?'Edge':/Firefox/i.test(u)?'Firefox':/Chrome/i.test(u)?'Chrome':/Safari/i.test(u)?'Safari':'Other';
  }
  function os(){
    let u=navigator.userAgent;
    return/Android/i.test(u)?'Android':/iPhone|iPad/i.test(u)?'iOS':/Windows/i.test(u)?'Windows':/Mac OS/i.test(u)?'macOS':'Other';
  }
  function ref(){
    try{return document.referrer?new URL(document.referrer).hostname:''}catch{return''}
  }
  function detectedSource(){
    if(q.get('utm_source'))return q.get('utm_source').slice(0,180);
    if(q.get('gclid'))return'google';
    let r=ref();
    if(!r)return'direct';
    if(r==='ivanov-remonti.com'||r.endsWith('.ivanov-remonti.com'))return'direct';
    if(r.includes('google.'))return'google';
    if(r.includes('facebook.')||r.includes('fb.'))return'facebook';
    if(r.includes('instagram.'))return'instagram';
    return r;
  }
  function saveAttribution(value){
    try{sessionStorage.setItem('ia_attribution_v3',JSON.stringify({sessionId,value}))}catch(e){}
    return value;
  }
  function directAttribution(){
    return saveAttribution({source:'direct',medium:'',campaign:'',content:'',term:''});
  }
  function attribution(){
    const key='ia_attribution_v3';
    try{
      const saved=JSON.parse(sessionStorage.getItem(key)||'null');
      if(saved?.sessionId===sessionId&&saved.value)return saved.value;
    }catch(e){}
    const value={
      source:detectedSource(),medium:(q.get('utm_medium')||(q.get('gclid')?'cpc':'')).slice(0,100),
      campaign:(q.get('utm_campaign')||'').slice(0,180),content:(q.get('utm_content')||'').slice(0,180),
      term:(q.get('utm_term')||'').slice(0,180)
    };
    return saveAttribution(value);
  }
  let firstTouch=attribution();

  function payload(eventType,extra={}){
    return{
      eventType,site,pagePath:path,pageTitle:document.title.slice(0,160),sessionId,
      trackerVersion:VERSION,source:firstTouch.source,medium:firstTouch.medium,
      campaign:firstTouch.campaign,content:firstTouch.content,term:firstTouch.term,
      referrerDomain:ref(),device:device(),browser:browser(),os:os(),country:'unknown',
      eventTime:new Date().toISOString(),...extra
    };
  }

  function readRetryQueue(){
    try{
      const parsed=JSON.parse(localStorage.getItem(RETRY_QUEUE_KEY)||'[]');
      if(!Array.isArray(parsed))return[];
      const cutoff=Date.now()-RETRY_QUEUE_MAX_AGE_MS;
      return parsed.filter(item=>item&&item.data&&Number(item.queuedAt)>=cutoff).slice(-RETRY_QUEUE_MAX);
    }catch(e){return[]}
  }

  function writeRetryQueue(items){
    try{
      if(items.length)localStorage.setItem(RETRY_QUEUE_KEY,JSON.stringify(items.slice(-RETRY_QUEUE_MAX)));
      else localStorage.removeItem(RETRY_QUEUE_KEY);
    }catch(e){}
  }

  function queueRetry(data){
    const queue=readRetryQueue();
    queue.push({data,queuedAt:Date.now(),attempts:0});
    writeRetryQueue(queue);
  }

  async function retryQueuedItem(item){
    try{
      const response=await fetch(INGEST_ENDPOINT,{
        method:'POST',mode:'cors',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',
        headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(item.data)
      });
      if(response.ok)return'sent';
      if(response.status===429||response.status>=500)return'retry';
      return'drop';
    }catch(e){return'retry'}
  }

  async function flushRetryQueue(){
    if(retryFlushRunning)return;
    retryFlushRunning=true;
    try{
      const queue=readRetryQueue();
      if(!queue.length)return;
      const remaining=[];
      let attempted=0;
      for(let index=0;index<queue.length;index++){
        const item=queue[index];
        if(attempted>=RETRY_FLUSH_LIMIT){remaining.push(...queue.slice(index));break}
        attempted++;
        const result=await retryQueuedItem(item);
        if(result==='retry'){
          remaining.push({...item,attempts:Number(item.attempts||0)+1});
          remaining.push(...queue.slice(index+1));
          break;
        }
      }
      writeRetryQueue(remaining);
    }finally{
      retryFlushRunning=false;
    }
  }

  function transmit(data,{beacon=false}={}){
    const body=JSON.stringify(data);
    if(beacon&&navigator.sendBeacon){
      try{if(navigator.sendBeacon(INGEST_ENDPOINT,body))return Promise.resolve(true)}catch(e){}
    }
    return fetch(INGEST_ENDPOINT,{
      method:'POST',mode:'cors',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',
      headers:{'Content-Type':'text/plain;charset=UTF-8'},body,keepalive:beacon
    }).then(response=>{
      if(response.ok)return true;
      if(response.status===429||response.status>=500)queueRetry(data);
      console.warn('Analytics not saved','ingest_http_'+response.status);
      return false;
    }).catch(error=>{
      queueRetry(data);
      console.warn('Analytics not saved',error.message||error);
      return false;
    });
  }

  async function loadGeoOnce(){
    const key=`ia_geo_v2:${sessionId}`;
    try{
      if(sessionStorage.getItem(key))return;
      sessionStorage.setItem(key,'pending');
    }catch(e){}

    const geoSessionId=sessionId;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),2000);
    try{
      const response=await fetch(GEO_ENDPOINT,{
        method:'GET',mode:'cors',cache:'no-store',credentials:'omit',
        referrerPolicy:'no-referrer',signal:controller.signal
      });
      if(!response.ok)throw Error('geo_http_'+response.status);
      const data=await response.json();
      const city=typeof data.city==='string'&&data.city?data.city.slice(0,120):'unknown';
      const country=typeof data.country==='string'&&data.country?data.country.slice(0,30):'unknown';
      try{sessionStorage.setItem(key,JSON.stringify({city,country}))}catch(e){}
      if(sessionId===geoSessionId)send('session_geo',{city,country},{activity:false});
    }catch(e){
      try{sessionStorage.setItem(key,'failed')}catch(_){}
    }finally{
      clearTimeout(timer);
    }
  }

  function updateActive(now=Date.now()){
    if(visible){
      const activeUntil=Math.min(now,lastActivityAt+SESSION_TIMEOUT_MS);
      if(activeUntil>last)active+=(activeUntil-last)/1000;
    }
    last=now;
  }

  function closeCurrentSession(now=Date.now()){
    const endedAt=Math.min(now,lastActivityAt+SESSION_TIMEOUT_MS);
    updateActive(endedAt);
    transmit(payload('session_end',{
      activeSeconds:Math.round(active),
      totalSeconds:Math.round(Math.max(0,endedAt-sessionStart)/1000)
    }));
  }

  function startNewSession(now=Date.now(),emitPageView=true){
    sessionId=newSessionId();
    sessionStart=now;
    active=0;
    last=now;
    scrolls=new Set();
    engagements=new Set();
    markActivity(now);
    firstTouch=directAttribution();
    if(emitPageView){
      transmit(payload('page_view'));
      loadGeoOnce();
    }
  }

  function ensureActiveSession(){
    const now=Date.now();
    if(now-lastActivityAt>=SESSION_TIMEOUT_MS){
      closeCurrentSession(now);
      startNewSession(now,true);
      return true;
    }
    return false;
  }

  function send(eventType,extra={},options={}){
    if(options.activity!==false){
      ensureActiveSession();
      markActivity();
    }
    return transmit(payload(eventType,extra));
  }

  function sendOnce(eventType,extra={}){
    ensureActiveSession();
    markActivity();
    const key=`ia_once_v2:${sessionId}:${path}:${eventType}`;
    try{
      if(sessionStorage.getItem(key)==='1')return;
      sessionStorage.setItem(key,'1');
    }catch(e){}
    return transmit(payload(eventType,extra));
  }

  markActivity();
  flushRetryQueue();
  addEventListener('online',flushRetryQueue);
  send('page_view',{}, {activity:false});
  loadGeoOnce();

  setInterval(()=>{
    updateActive();
    [15,30,60,120,300].forEach(seconds=>{
      if(active>=seconds&&!engagements.has(seconds)){
        engagements.add(seconds);
        send('engagement',{activeSeconds:seconds},{activity:false});
      }
    });
  },5000);

  document.addEventListener('visibilitychange',()=>{
    updateActive();
    visible=!document.hidden;
    if(visible){
      ensureActiveSession();
      markActivity();
      flushRetryQueue();
    }
  });

  const noteActivity=()=>{
    ensureActiveSession();
    markActivity();
  };
  document.addEventListener('keydown',noteActivity,{capture:true});
  document.addEventListener('input',noteActivity,{capture:true});
  document.addEventListener('pointerdown',noteActivity,{capture:true,passive:true});

  let scrollQueued=false;
  addEventListener('scroll',()=>{
    if(scrollQueued)return;
    scrollQueued=true;
    requestAnimationFrame(()=>{
      scrollQueued=false;
      ensureActiveSession();
      markActivity();
      let m=Math.max(1,document.documentElement.scrollHeight-innerHeight);
      let d=Math.round(scrollY/m*100);
      [25,50,75,90].forEach(n=>{
        if(d>=n&&!scrolls.has(n)){
          scrolls.add(n);
          transmit(payload('scroll',{scrollDepth:n}));
        }
      });
    });
  },{passive:true});

  document.addEventListener('click',e=>{
    const el=e.target instanceof Element?e.target:null;
    if(!el)return;
    const action=el.closest("a,button,.faq-q,.yt-lite,.gallery-thumb,.lom-gallery-btn,.preview-item,.masonry-item,.lomgal-item,.svc-thumb,.lom-svc-thumb");
    if(!action)return;
    const a=action.closest('a,button')||action;
    let h=(a.getAttribute?.('href')||'').toLowerCase();
    let t=(a.textContent||'').trim().toLowerCase();
    if(h.startsWith('tel:'))send('phone_click');
    else if(h.includes('viber')||t.includes('viber'))send('viber_click');
    else if(action.closest('.yt-lite'))sendOnce('video_play');
    else if(action.closest(".gallery-thumb,.lom-gallery-btn,.preview-item,.masonry-item,.lomgal-item,.svc-thumb,.lom-svc-thumb,[onclick*='openGalleryLb'],[onclick*='openGallery'],[onclick*='openFullGallery'],[onclick*='openLightboxGal'],[onclick*='openLb']"))sendOnce('gallery_open');
    else if(action.closest(".faq-q,[data-track='faq']"))sendOnce('faq_open');
    else if(a.matches("[data-track='prices'],.card-pbtn,[onclick*='openServiceModal']")||h.includes('#prices')||h.includes('#pricing')||/^(цени|ценоразпис)$/.test(t))sendOnce('price_open');
    else if(a.matches("[data-track='contact']")||h.includes('#contact'))sendOnce('contact_open');
  },true);

  document.addEventListener('submit',e=>{
    if(e.target.matches('form'))send('form_submit',{formId:e.target.id||'form'});
  },true);

  document.addEventListener('ivanov:form-success',e=>{
    sendOnce('form_success',{formId:e.detail?.formId||'form'});
  });

  addEventListener('pagehide',()=>{
    updateActive();
    transmit(payload('session_end',{
      activeSeconds:Math.round(active),
      totalSeconds:Math.round((Date.now()-sessionStart)/1000)
    }),{beacon:true});
  },{once:true});
}