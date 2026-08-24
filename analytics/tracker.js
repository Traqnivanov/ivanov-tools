import{initializeApp}from'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import{getFirestore,collection,addDoc,serverTimestamp}from'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-lite.js';
import{firebaseConfig}from'./firebase-config.js?v=20260818-5';
import{normalizePath,siteFromPath}from'./sites.js?v=20260818-5';

const VERSION='2.1.4';
const EXCLUDE_KEY='ivanov_analytics_excluded';
const DASHBOARD_ORIGIN='https://traqnivanov.github.io';
const params=new URLSearchParams(location.search);
const adminAction=params.get('ivanov_device_action');

function isObviousBot(){
  const u=navigator.userAgent||'';
  return /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|headlesschrome|lighthouse/i.test(u);
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
  try{
    if(window.opener&&!window.opener.closed){
      window.opener.postMessage(adminMessage(excluded,action),DASHBOARD_ORIGIN);
    }
  }catch(e){}
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

if(adminAction==='exclude'){
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

if(!adminAction&&!excluded&&!isObviousBot()){
  const app=initializeApp(firebaseConfig,'ivanovTracker');
  const db=getFirestore(app);
  const path=normalizePath(location.pathname);
  const site=siteFromPath(path);
  const q=new URLSearchParams(location.search);
  const start=Date.now();
  let active=0,last=Date.now(),visible=!document.hidden,scrolls=new Set(),engagements=new Set();

  function sid(){
    let k='ia_session',v=sessionStorage.getItem(k);
    if(!v){
      v=crypto.randomUUID?.()||Math.random().toString(36).slice(2);
      sessionStorage.setItem(k,v);
    }
    return v;
  }
  const sessionId=sid();

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
    let r=ref();
    if(!r)return'direct';
    if(r==='ivanov-remonti.com'||r.endsWith('.ivanov-remonti.com'))return'direct';
    if(r.includes('google.'))return'google';
    if(r.includes('facebook.')||r.includes('fb.'))return'facebook';
    if(r.includes('instagram.'))return'instagram';
    return r;
  }
  function attribution(){
    const key='ia_attribution_v2';
    try{
      const saved=sessionStorage.getItem(key);
      if(saved)return JSON.parse(saved);
    }catch(e){}
    const value={
      source:detectedSource(),medium:(q.get('utm_medium')||'').slice(0,100),
      campaign:(q.get('utm_campaign')||'').slice(0,180),content:(q.get('utm_content')||'').slice(0,180),
      term:(q.get('utm_term')||'').slice(0,180)
    };
    try{sessionStorage.setItem(key,JSON.stringify(value))}catch(e){}
    return value;
  }
  const firstTouch=attribution();

  async function send(eventType,extra={}){
    try{
      await addDoc(collection(db,'analytics_events'),{
        eventType,site,pagePath:path,pageTitle:document.title.slice(0,160),sessionId,
        timestamp:serverTimestamp(),trackerVersion:VERSION,source:firstTouch.source,
        medium:firstTouch.medium,campaign:firstTouch.campaign,
        content:firstTouch.content,term:firstTouch.term,
        referrerDomain:ref(),device:device(),browser:browser(),os:os(),
        country:'unknown',...extra
      });
    }catch(e){
      console.warn('Analytics not saved',e.code||e.message);
    }
  }

  function sendOnce(eventType,extra={}){
    const key=`ia_once_v1:${path}:${eventType}`;
    try{
      if(sessionStorage.getItem(key)==='1')return;
      sessionStorage.setItem(key,'1');
    }catch(e){}
    send(eventType,extra);
  }

  send('page_view');

  function updateActive(){
    const now=Date.now();
    if(visible)active+=Math.max(0,(now-last)/1000);
    last=now;
  }
  setInterval(()=>{
    updateActive();
    [15,30,60,120,300].forEach(seconds=>{
      if(active>=seconds&&!engagements.has(seconds)){
        engagements.add(seconds);
        send('engagement',{activeSeconds:seconds});
      }
    });
  },5000);

  document.addEventListener('visibilitychange',()=>{
    updateActive();
    visible=!document.hidden;
  });

  let scrollQueued=false;
  addEventListener('scroll',()=>{
    if(scrollQueued)return;
    scrollQueued=true;
    requestAnimationFrame(()=>{
      scrollQueued=false;
      let m=Math.max(1,document.documentElement.scrollHeight-innerHeight);
      let d=Math.round(scrollY/m*100);
      [25,50,75,90].forEach(n=>{
        if(d>=n&&!scrolls.has(n)){
          scrolls.add(n);
          send('scroll',{scrollDepth:n});
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
    send('session_end',{
      activeSeconds:Math.round(active),
      totalSeconds:Math.round((Date.now()-start)/1000)
    });
  },{once:true});
}
