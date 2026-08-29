import { getApps } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { CHANNEL_WORKER_BASE } from './channel-config.js?v=20260827-stage1f';

const view=document.querySelector('#view');
let latestStatus=null;
let loading=false;

function sofiaDay(date=new Date()){
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Sofia',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}

function shiftDay(day,offset){
  const [year,month,date]=day.split('-').map(Number);
  return new Date(Date.UTC(year,month-1,date+offset)).toISOString().slice(0,10);
}

function statusText(){
  if(!latestStatus)return 'Проверявам статуса…';
  if(latestStatus.configured===false)return 'Не са конфигурирани.';
  if(latestStatus.hasData)return 'Активирани · cron обобщенията се записват автоматично.';
  return 'Активирани · очаква първото cron обобщение.';
}

function apply(root=document){
  root.querySelectorAll('p').forEach(paragraph=>{
    const strong=paragraph.querySelector('strong');
    if(strong?.textContent.trim()==='Дневни и месечни обобщения:'){
      paragraph.innerHTML=`<strong>Дневни и месечни обобщения:</strong> ${statusText()}`;
    }
  });
}

async function refresh(){
  if(loading)return;
  const app=getApps()[0];
  const user=app?getAuth(app).currentUser:null;
  if(!user)return;
  loading=true;
  try{
    const yesterday=shiftDay(sofiaDay(),-1);
    const token=await user.getIdToken();
    const response=await fetch(`${CHANNEL_WORKER_BASE}/api/analytics/summaries?period=daily&from=${encodeURIComponent(yesterday)}&to=${encodeURIComponent(yesterday)}&site=all`,{
      headers:{Authorization:`Bearer ${token}`},cache:'no-store'
    });
    if(!response.ok)return;
    const payload=await response.json();
    latestStatus={configured:payload.configured!==false,hasData:Array.isArray(payload.data)&&payload.data.length>0};
    apply();
  }catch(_){
  }finally{
    loading=false;
  }
}

function mount(){
  apply(view||document);
  refresh();
}

window.addEventListener('focus',refresh);
let attempts=0;
const authWait=setInterval(()=>{
  attempts++;
  refresh();
  if(latestStatus||attempts>=40)clearInterval(authWait);
},250);

if(view){
  new MutationObserver(mount).observe(view,{childList:true,subtree:true});
  mount();
}
