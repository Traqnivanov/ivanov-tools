const MOBILE_QUERY='(max-width: 760px)';
const SITE_ORIGIN='https://ivanov-remonti.com';
const DEVICE_STATE_KEY='ivanov_dashboard_device_state';
let pendingTimer=0;
let pendingView='';

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

function activateWhenReady(viewName,attempt=0){
  pendingView=viewName;
  clearTimeout(pendingTimer);
  const button=document.querySelector(`.nav button[data-view="${viewName}"]`);
  if(button&&typeof button.onclick==='function'){
    pendingView='';
    document.querySelector('.mobile-nav-sheet')?.classList.remove('open');
    button.click();
    syncMobileActive(viewName);
    return;
  }
  if(attempt>=80){
    pendingView='';
    console.warn('Mobile Analytics view was not ready:',viewName);
    return;
  }
  pendingTimer=setTimeout(()=>{
    if(pendingView===viewName)activateWhenReady(viewName,attempt+1);
  },50);
}

function deviceActionFromButton(button){
  if(button.id==='excludeDeviceBtn')return'exclude';
  if(button.id==='includeDeviceBtn')return'include';
  if(button.id==='checkDeviceBtn')return'status';
  return'';
}

function openMobileDeviceAction(action){
  if(action==='exclude'){
    try{localStorage.setItem(DEVICE_STATE_KEY,'excluded')}catch(error){}
  }else if(action==='include'){
    try{localStorage.setItem(DEVICE_STATE_KEY,'included')}catch(error){}
  }
  const message=document.querySelector('#deviceActionMessage');
  if(message)message.textContent=action==='status'
    ?'Отварям production проверката в нов раздел…'
    :'Отварям production настройката в нов раздел…';
  const url=`${SITE_ORIGIN}/?ivanov_device_action=${encodeURIComponent(action)}&t=${Date.now()}`;
  const opened=window.open(url,'_blank');
  if(!opened){
    window.location.assign(url);
  }
}

document.addEventListener('click',event=>{
  if(!isMobileUi())return;

  const go=event.target instanceof Element?event.target.closest('.mobile-nav-sheet [data-go]'):null;
  if(go){
    event.preventDefault();
    event.stopImmediatePropagation();
    activateWhenReady(go.dataset.go||'summary');
    return;
  }

  const deviceButton=event.target instanceof Element
    ?event.target.closest('#excludeDeviceBtn,#includeDeviceBtn,#checkDeviceBtn')
    :null;
  if(deviceButton){
    const action=deviceActionFromButton(deviceButton);
    if(!action)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openMobileDeviceAction(action);
  }
},true);

window.addEventListener('ivanov:analytics-loader-fallback',()=>{
  if(pendingView)activateWhenReady(pendingView);
});
