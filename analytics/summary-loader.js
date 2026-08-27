const view=document.querySelector('#view');
let loaded=false;

function readyForSummary(){
  if(loaded||!view)return;
  const heading=view.querySelector('.view-heading h1');
  const isSummary=heading?.textContent?.trim()==='Обобщение';
  const baseReady=isSummary&&!view.textContent.includes('Зареждане...')&&!view.querySelector('[data-summary-final]');
  if(!baseReady)return;
  loaded=true;
  import('./summary-final.js?v=20260827-livefix1').catch(error=>{
    loaded=false;
    console.warn('Summary loader failed',error);
  });
}

if(view){
  new MutationObserver(readyForSummary).observe(view,{childList:true,subtree:true});
  readyForSummary();
}
