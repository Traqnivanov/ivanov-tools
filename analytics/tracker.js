import{initializeApp}from'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import{getFirestore,collection,addDoc,serverTimestamp}from'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import{firebaseConfig}from'./firebase-config.js';
import{normalizePath,siteFromPath}from'./sites.js';

const VERSION='1.1.0';
const EXCLUDE_KEY='ivanov_analytics_excluded';
const params=new URLSearchParams(location.search);

function cleanAdminParameter(){
  try{
    const u=new URL(location.href);
    u.searchParams.delete('ivanov_exclude');
    u.searchParams.delete('ivanov_include');
    history.replaceState({},document.title,u.pathname+(u.search?'?'+u.searchParams.toString():'')+u.hash);
  }catch(e){}
}

function showAdminNotice(message){
  const box=document.createElement('div');
  box.textContent=message;
  box.setAttribute('role','status');
  Object.assign(box.style,{
    position:'fixed',left:'12px',right:'12px',bottom:'12px',zIndex:'2147483647',
    padding:'14px 16px',borderRadius:'12px',background:'#111827',color:'#fff',
    font:'700 15px system-ui,sans-serif',textAlign:'center',
    boxShadow:'0 12px 35px rgba(0,0,0,.35)'
  });
  document.addEventListener('DOMContentLoaded',()=>document.body.appendChild(box),{once:true});
  setTimeout(()=>box.remove(),5000);
}

if(params.get('ivanov_exclude')==='1'){
  try{localStorage.setItem(EXCLUDE_KEY,'1')}catch(e){}
  cleanAdminParameter();
  showAdminNotice('Това устройство вече не се отчита в Ivanov Analytics.');
}
if(params.get('ivanov_include')==='1'){
  try{localStorage.removeItem(EXCLUDE_KEY)}catch(e){}
  cleanAdminParameter();
  showAdminNotice('Отчитането на това устройство е включено отново.');
}

let excluded=false;
try{excluded=localStorage.getItem(EXCLUDE_KEY)==='1'}catch(e){}

if(!excluded){
  const app=initializeApp(firebaseConfig,'ivanovTracker');
  const db=getFirestore(app);
  const path=normalizePath(location.pathname);
  const site=siteFromPath(path);
  const q=new URLSearchParams(location.search);
  const start=Date.now();
  let active=0,last=Date.now(),visible=!document.hidden,scrolls=new Set();

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
  function source(){
    if(q.get('utm_source'))return q.get('utm_source');
    let r=ref();
    if(!r)return'direct';
    if(r.includes('google.'))return'google';
    if(r.includes('facebook.')||r.includes('fb.'))return'facebook';
    if(r.includes('instagram.'))return'instagram';
    return r;
  }

  async function send(eventType,extra={}){
    try{
      await addDoc(collection(db,'analytics_events'),{
        eventType,site,pagePath:path,pageTitle:document.title.slice(0,160),sessionId,
        timestamp:serverTimestamp(),trackerVersion:VERSION,source:source(),
        medium:q.get('utm_medium')||'',campaign:q.get('utm_campaign')||'',
        content:q.get('utm_content')||'',term:q.get('utm_term')||'',
        referrerDomain:ref(),device:device(),browser:browser(),os:os(),
        country:'unknown',...extra
      });
    }catch(e){
      console.warn('Analytics not saved',e.code||e.message);
    }
  }

  send('page_view');

  setInterval(()=>{
    let n=Date.now();
    if(visible)active+=Math.max(0,Math.round((n-last)/1000));
    last=n;
  },10000);

  document.addEventListener('visibilitychange',()=>{
    visible=!document.hidden;
    last=Date.now();
  });

  addEventListener('scroll',()=>{
    let m=Math.max(1,document.documentElement.scrollHeight-innerHeight);
    let d=Math.round(scrollY/m*100);
    [25,50,75,90].forEach(n=>{
      if(d>=n&&!scrolls.has(n)){
        scrolls.add(n);
        send('scroll',{scrollDepth:n});
      }
    });
  },{passive:true});

  document.addEventListener('click',e=>{
    let a=e.target.closest('a,button');
    if(!a)return;
    let h=(a.getAttribute('href')||'').toLowerCase();
    let t=(a.textContent||'').toLowerCase();
    if(h.startsWith('tel:'))send('phone_click');
    else if(h.includes('viber')||t.includes('viber'))send('viber_click');
    else if(a.matches("[data-track='faq']"))send('faq_open');
    else if(a.matches("[data-track='gallery']"))send('gallery_open');
    else if(a.matches("[data-track='prices']"))send('price_open');
    else if(a.matches("[data-track='contact']"))send('contact_open');
  });

  document.addEventListener('submit',e=>{
    if(e.target.matches('form'))send('form_submit',{formId:e.target.id||'form'});
  },true);

  addEventListener('pagehide',()=>{
    send('session_end',{
      activeSeconds:active,
      totalSeconds:Math.round((Date.now()-start)/1000)
    });
  },{once:true});
}
