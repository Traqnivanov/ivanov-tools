import { getApps } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { channelOwnerFetch } from './channel-api.js?v=20260829-stage5e';

const view=document.querySelector('#view');
const FIRST_COMPLETE_D1_DAY='2026-08-30';
let latestStatus=null;
let loadingPromise=null;
let authUnsubscribe=null;
let authRetry=0;
let authGeneration=0;

function sofiaDay(date=new Date()){
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Sofia',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}

function shiftDay(day,offset){
  const [year,month,date]=day.split('-').map(Number);
  return new Date(Date.UTC(year,month-1,date+offset)).toISOString().slice(0,10);
}

function statusText(){
  if(!latestStatus)return 'Проверявам статуса…';
  if(latestStatus.error)return 'Статусът временно не е достъпен.';
  if(latestStatus.configured===false)return 'Не са конфигурирани.';
  if(latestStatus.beforeCoverage)return 'Активирани · първият пълен D1 ден е 30.08.2026; дневното обобщение се появява след приключването му.';
  if(latestStatus.hasData)return 'Активирани · cron обобщенията се записват автоматично.';
  return 'Активирани · очаква първото пълно D1 дневно обобщение.';
}

function apply(root=document){
  root.querySelectorAll('p').forEach(paragraph=>{
    const strong=paragraph.querySelector('strong');
    if(strong?.textContent.trim()==='Дневни и месечни обобщения:'){
      paragraph.innerHTML=`<strong>Дневни и месечни обобщения:</strong> ${statusText()}`;
      return;
    }
    if(strong?.textContent.trim()==='Текущо зареждане:'){
      paragraph.innerHTML='<strong>Текущо зареждане:</strong> до 10 000 подробни събития от всеки необходим storage source за избрания период.';
      return;
    }
    if(paragraph.classList.contains('card-note')&&paragraph.textContent.includes('Старите обещания за 90 дни')){
      paragraph.textContent='Retention/автоматичното изтриване още не е активирано. Дневните и месечните D1 обобщения се генерират автоматично от backend cron.';
    }
  });
}

async function refresh(){
  if(loadingPromise)return loadingPromise;
  const app=getApps()[0];
  const auth=app?getAuth(app):null;
  const user=auth?.currentUser||null;
  if(!user)return null;
  const generation=authGeneration;
  const userId=user.uid;
  const yesterday=shiftDay(sofiaDay(),-1);
  if(yesterday<FIRST_COMPLETE_D1_DAY){
    latestStatus={configured:true,hasData:false,beforeCoverage:true};
    apply();
    return latestStatus;
  }
  const request=channelOwnerFetch(`/api/analytics/summaries?period=daily&from=${encodeURIComponent(yesterday)}&to=${encodeURIComponent(yesterday)}&site=all`)
    .then(payload=>{
      if(generation!==authGeneration||auth.currentUser?.uid!==userId)return null;
      latestStatus={configured:payload.configured!==false,hasData:Array.isArray(payload.data)&&payload.data.length>0};
      apply();
      return latestStatus;
    })
    .catch(()=>{
      if(generation!==authGeneration||auth.currentUser?.uid!==userId)return null;
      latestStatus={error:true};
      apply();
      return latestStatus;
    })
    .finally(()=>{if(loadingPromise===request)loadingPromise=null});
  loadingPromise=request;
  return request;
}

function mount(){
  apply(view||document);
  if(!latestStatus)refresh();
}

function bindAuth(){
  if(authUnsubscribe)return;
  const app=getApps()[0];
  if(!app){
    clearTimeout(authRetry);
    authRetry=setTimeout(bindAuth,50);
    return;
  }
  authUnsubscribe=onAuthStateChanged(getAuth(app),user=>{
    authGeneration++;
    latestStatus=null;
    loadingPromise=null;
    apply();
    if(user)refresh();
  });
}

window.addEventListener('focus',refresh);
bindAuth();

if(view){
  new MutationObserver(mount).observe(view,{childList:true,subtree:true});
  mount();
}
