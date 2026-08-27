const view=document.querySelector('#view');
let loaded=false;

async function importLiveSummary(){
  const response=await fetch('./summary-final.js?v=20260827-livefix2',{cache:'no-store'});
  if(!response.ok)throw new Error(`summary_source_${response.status}`);
  let source=await response.text();
  source=source.replaceAll('getDocsFromCache','getDocs');
  const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
  try{await import(url)}finally{URL.revokeObjectURL(url)}
}

function readyForSummary(){
  if(loaded||!view)return;
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
