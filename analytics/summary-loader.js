const view=document.querySelector('#view');
let loaded=false;

async function importNativeSummary(){
  await import('./summary-final.js?v=20260829-stage5bb');
}

function readyForSummary(){
  if(loaded||!view)return;
  const heading=view.querySelector('.view-heading h1');
  const isSummary=heading?.textContent?.trim()==='Обобщение';
  const baseReady=isSummary&&!view.textContent.includes('Зареждане...')&&!view.querySelector('[data-summary-final]');
  if(!baseReady)return;
  loaded=true;
  importNativeSummary().catch(error=>{
    loaded=false;
    console.warn('Summary loader failed',error);
  });
}

if(view){
  new MutationObserver(readyForSummary).observe(view,{childList:true,subtree:true});
  readyForSummary();
}
