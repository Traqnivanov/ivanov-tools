import{getApps}from'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import{fetchAnalyticsEvents}from'./event-source.js?v=20260827-stage3';

const view=document.querySelector('#view');
let loaded=false;
let initRetry=0;

async function liveEvents(r){
  return fetchAnalyticsEvents(r);
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
  source=source.replace(/function pageRows\(sessions\)\{[^\n]*\}\nfunction sourceRows/,"function pageRows(sessions){const m=new Map();sessions.forEach(s=>s.pages.forEach(path=>{if(!m.has(path))m.set(path,{path,sessions:new Set(),interest:new Set(),client:new Set()});const r=m.get(path),pageEvents=s.events.filter(e=>e.pagePath===path);r.sessions.add(s.id);if(pageEvents.some(e=>INTEREST.has(e.eventType)))r.interest.add(s.id);if(pageEvents.some(e=>BUSINESS.has(e.eventType)))r.client.add(s.id)}));return[...m.values()].sort((a,b)=>b.client.size-a.client.size||b.interest.size-a.interest.size||b.sessions.size-a.sessions.size).slice(0,5)}\nfunction sourceRows");
  if(source===before||!source.includes('window.IvanovPeriods.rangeFromControls()')||!source.includes('window.IvanovPeriods.previousRange(r)')||!source.includes('pageEvents.some(e=>BUSINESS.has(e.eventType))'))throw new Error('summary_live_patch_not_applied');
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
