const MOBILE_QUERY='(max-width: 760px)';
const SITE_ORIGIN='https://ivanov-remonti.com';
let pendingTimer=0;
let pendingView='';
let suppressHistory=false;
let labelsQueued=false;

function isMobileUi(){
  return window.matchMedia?.(MOBILE_QUERY).matches
    || window.matchMedia?.('(display-mode: standalone)').matches
    || navigator.standalone===true;
}

function mobileKeyForView(viewName){
  if(viewName==='summary')return'home';
  if(viewName==='system')return'more';
  return'site';
}

function syncMobileActive(viewName){
  const key=mobileKeyForView(viewName);
  document.querySelectorAll('[data-mobile-nav]').forEach(button=>{
    button.classList.toggle('active',button.dataset.mobileNav===key);
  });
}

function currentDepth(){
  return history.state?.ivanovAnalytics?Number(history.state.depth||0):0;
}

function historyState(kind,value,depth){
  const state={ivanovAnalytics:true,kind,depth};
  if(kind==='view')state.view=value;
  if(kind==='external')state.channel=value;
  if(kind==='page')state.path=value;
  return state;
}

function updateBackButton(){
  const button=document.querySelector('#mobileBackBtn');
  if(!button)return;
  const visible=isMobileUi()&&history.state?.ivanovAnalytics&&currentDepth()>0;
  button.classList.toggle('hidden',!visible);
}

function sameHistoryTarget(kind,value){
  const state=history.state;
  if(!state?.ivanovAnalytics||state.kind!==kind)return false;
  if(kind==='view')return state.view===value;
  if(kind==='external')return state.channel===value;
  if(kind==='page')return state.path===value;
  return false;
}

function pushHistory(kind,value){
  if(suppressHistory||sameHistoryTarget(kind,value))return;
  history.pushState(historyState(kind,value,currentDepth()+1),'',location.href);
  updateBackButton();
}

function closeSheet(){
  document.querySelector('.mobile-nav-sheet')?.classList.remove('open');
}

function activateWhenReady(viewName,attempt=0,record=true,after=null){
  pendingView=viewName;
  clearTimeout(pendingTimer);
  const button=document.querySelector(`.nav button[data-view="${viewName}"]`);
  if(button&&typeof button.onclick==='function'){
    pendingView='';
    closeSheet();
    const previous=suppressHistory;
    if(!record)suppressHistory=true;
    button.click();
    suppressHistory=previous;
    syncMobileActive(viewName);
    updateBackButton();
    if(after)requestAnimationFrame(after);
    return;
  }
  if(attempt>=80){
    pendingView='';
    console.warn('Mobile Analytics view was not ready:',viewName);
    return;
  }
  pendingTimer=setTimeout(()=>{
    if(pendingView===viewName)activateWhenReady(viewName,attempt+1,record,after);
  },50);
}

function activateExternalWhenReady(channel,attempt=0){
  const link=document.querySelector(`.nav [data-external-view="${channel}"]`);
  if(link){
    const previous=suppressHistory;
    suppressHistory=true;
    link.click();
    suppressHistory=previous;
    updateBackButton();
    return;
  }
  if(attempt<80)setTimeout(()=>activateExternalWhenReady(channel,attempt+1),50);
}

function openPageWhenReady(path,attempt=0){
  const buttons=[...document.querySelectorAll('[data-page]')];
  const button=buttons.find(item=>item.dataset.page===path);
  if(button){
    const previous=suppressHistory;
    suppressHistory=true;
    button.click();
    suppressHistory=previous;
    updateBackButton();
    return;
  }
  if(attempt<80)setTimeout(()=>openPageWhenReady(path,attempt+1),50);
}

function restoreHistoryState(state){
  if(!state?.ivanovAnalytics)return;
  closeSheet();
  if(state.kind==='external'){
    activateExternalWhenReady(state.channel);
  }else if(state.kind==='page'){
    activateWhenReady('pages',0,false,()=>openPageWhenReady(state.path));
  }else{
    activateWhenReady(state.view||'summary',0,false);
  }
  updateBackButton();
}

function ensureHistoryRoot(){
  if(!history.state?.ivanovAnalytics){
    history.replaceState(historyState('view','summary',0),'',location.href);
  }
  updateBackButton();
}

function ensureBackButton(){
  if(document.querySelector('#mobileBackBtn'))return;
  const topbar=document.querySelector('.topbar');
  const site=document.querySelector('#siteFilter');
  if(!topbar||!site)return;
  const button=document.createElement('button');
  button.id='mobileBackBtn';
  button.type='button';
  button.className='ghost hidden';
  button.textContent='← Назад';
  button.addEventListener('click',()=>history.back());
  topbar.insertBefore(button,site);
  updateBackButton();
}

function labelTables(){
  labelsQueued=false;
  document.querySelectorAll('.table-wrap table').forEach(table=>{
    const headers=[...table.querySelectorAll('thead th')].map(header=>header.textContent.trim());
    table.querySelectorAll('tbody tr').forEach(row=>{
      [...row.children].forEach((cell,index)=>{
        if(cell instanceof HTMLTableCellElement&&!cell.classList.contains('empty')){
          cell.dataset.label=headers[index]||'';
        }
      });
    });
  });
}

function queueTableLabels(){
  if(labelsQueued)return;
  labelsQueued=true;
  requestAnimationFrame(labelTables);
}

function deviceActionFromButton(button){
  if(button.id==='excludeDeviceBtn')return'exclude';
  if(button.id==='includeDeviceBtn')return'include';
  if(button.id==='checkDeviceBtn')return'status';
  return'';
}

function openMobileDeviceAction(action){
  const message=document.querySelector('#deviceActionMessage');
  if(message)message.textContent=action==='status'
    ?'Отварям production проверката. Статусът ще се промени само след реално потвърждение.'
    :'Отварям production настройката. Статусът ще се промени само след реално потвърждение.';
  const url=`${SITE_ORIGIN}/?ivanov_device_action=${encodeURIComponent(action)}&t=${Date.now()}`;
  const opened=window.open(url,'ivanovDeviceActionMobile');
  if(!opened&&message){
    message.textContent='Браузърът блокира новия прозорец. Разреши изскачащите прозорци за Ivanov Analytics и опитай отново.';
  }
}

function installMobileStyles(){
  if(document.querySelector('#stage5awMobileStyles'))return;
  const style=document.createElement('style');
  style.id='stage5awMobileStyles';
  style.textContent=`
    #mobileBackBtn{display:none}
    @media(max-width:760px){
      #mobileBackBtn:not(.hidden){display:inline-flex;flex:1 1 100%;align-items:center;justify-content:center}
      .topbar #dateFrom:not(.hidden),.topbar #dateTo:not(.hidden){flex:1 1 calc(50% - 4px);max-width:none;min-width:0}
    }
    @media(max-width:420px){
      .topbar #dateFrom:not(.hidden),.topbar #dateTo:not(.hidden){flex-basis:100%;width:100%}
    }
  `;
  document.head.appendChild(style);
}

document.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target:null;
  if(!target)return;

  const desktopView=target.closest('.nav button[data-view]');
  if(desktopView&&!suppressHistory){
    pushHistory('view',desktopView.dataset.view||'summary');
  }

  const external=target.closest('.nav [data-external-view]');
  if(external&&!suppressHistory){
    pushHistory('external',external.dataset.externalView||'');
  }

  const page=target.closest('[data-page]');
  if(page&&!suppressHistory){
    pushHistory('page',page.dataset.page||'');
  }

  const pageBack=target.closest('[data-page-back]');
  if(pageBack&&history.state?.ivanovAnalytics&&currentDepth()>0){
    event.preventDefault();
    event.stopImmediatePropagation();
    history.back();
    return;
  }

  const logout=target.closest('#logoutBtn,.mobile-nav-sheet [data-action="logout"]');
  if(logout)closeSheet();

  if(!isMobileUi())return;

  const go=target.closest('.mobile-nav-sheet [data-go]');
  if(go){
    event.preventDefault();
    event.stopImmediatePropagation();
    activateWhenReady(go.dataset.go||'summary');
    return;
  }

  const mobileChannel=target.closest('.mobile-nav-sheet [data-channel]');
  if(mobileChannel&&!suppressHistory){
    pushHistory('external',mobileChannel.dataset.channel||'');
  }

  const deviceButton=target.closest('#excludeDeviceBtn,#includeDeviceBtn,#checkDeviceBtn');
  if(deviceButton){
    const action=deviceActionFromButton(deviceButton);
    if(!action)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openMobileDeviceAction(action);
  }
},true);

window.addEventListener('popstate',event=>restoreHistoryState(event.state));
window.addEventListener('resize',updateBackButton);
window.addEventListener('ivanov:analytics-loader-fallback',()=>{
  if(pendingView)activateWhenReady(pendingView);
});

const app=document.querySelector('#app');
if(app){
  new MutationObserver(()=>{
    if(app.classList.contains('hidden'))closeSheet();
  }).observe(app,{attributes:true,attributeFilter:['class']});
}

const view=document.querySelector('#view');
if(view){
  new MutationObserver(queueTableLabels).observe(view,{childList:true,subtree:true});
}

installMobileStyles();
ensureHistoryRoot();
ensureBackButton();
queueTableLabels();
