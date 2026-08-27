import{getApps,getApp}from'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import{getFirestore,collection,getDocs,query,where,orderBy,limit,Timestamp}from'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const view=document.querySelector('#view');
let loaded=false;
let initRetry=0;

async function liveEvents(r){
  const db=getFirestore(getApp());
  const q=query(
    collection(db,'analytics_events'),
    where('timestamp','>=',Timestamp.fromDate(r.start)),
    where('timestamp','<=',Timestamp.fromDate(r.end)),
    orderBy('timestamp','desc'),
    limit(10000)
  );
  const snap=await getDocs(q);
  return snap.docs.map(doc=>{
    const x=doc.data();
    let pagePath=String(x.pagePath||'/').split('?')[0].split('#')[0]||'/';
    if(!pagePath.startsWith('/'))pagePath='/'+pagePath;
    while(pagePath.includes('//'))pagePath=pagePath.replace('//','/');
    return{id:doc.id,...x,pagePath,date:x.timestamp?.toDate?.()||new Date()};
  });
}

window.__ivanovSummaryLiveEvents=liveEvents;

async function importLiveSummary(){
  const response=await fetch('./summary-final.js?v=20260827-livefix3',{cache:'no-store'});
  if(!response.ok)throw new Error(`summary_source_${response.status}`);
  let source=await response.text();
  const before=source;
  source=source.replace(/function currentRange\(\)\{[\s\S]*?return\{start,end\};\n\}/,"function currentRange(){return window.IvanovPeriods.rangeFromControls()}");
  source=source.replace(/function previousRange\(r\)\{[^\n]*\}/,"function previousRange(r){return window.IvanovPeriods.previousRange(r)}");
  source=source.replace(/async function cachedEvents\(r\)\{[\s\S]*?\n\}/,"async function cachedEvents(r){return window.__ivanovSummaryLiveEvents(r)}");
  if(source===before||!source.includes('window.IvanovPeriods.rangeFromControls()')||!source.includes('window.IvanovPeriods.previousRange(r)'))throw new Error('summary_live_patch_not_applied');
  const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
  try{await import(url)}finally{URL.revokeObjectURL(url)}
}

function readyForSummary(){
  if(loaded||!view)return;
  if(!getApps().length){
    clearTimeout(initRetry);
    initRetry=setTimeout(readyForSummary,50);
    return;
  }
  const heading=view.querySelector('.view-heading h1');
  const isSummary=heading?.textContent?.trim()==='Обобщение';
  const baseReady=isSummary&&!view.textContent.includes('Зареждане...')&&!view.querySelector('[data-summary-final]');
  if(!baseReady)return;
  loaded=true;
  importLiveSummary().catch(error=>{
    loaded=false;
    console.warn('Summary loader failed',error);
  });
}

if(view){
  new MutationObserver(readyForSummary).observe(view,{childList:true,subtree:true});
  readyForSummary();
}
