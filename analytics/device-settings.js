const SITE_ORIGIN='https://ivanov-remonti.com';
let deviceActionTimer=0;

function actionFor(button){
  if(button.id==='excludeDeviceBtn')return'exclude';
  if(button.id==='includeDeviceBtn')return'include';
  if(button.id==='checkDeviceBtn')return'status';
  return'';
}

function actionMessage(action){
  return action==='status'
    ?'Проверявам статуса в production сайта…'
    :'Отварям production настройката…';
}

function openDeviceAction(action){
  const note=document.querySelector('#deviceActionMessage');
  if(note)note.textContent=actionMessage(action);
  clearTimeout(deviceActionTimer);

  const url=`${SITE_ORIGIN}/?ivanov_device_action=${encodeURIComponent(action)}&t=${Date.now()}`;
  const opened=window.open(url,'_blank');
  if(!opened){
    if(note)note.textContent='Браузърът блокира новия таб. Разреши изскачащите прозорци за Ivanov Analytics и опитай отново.';
    return;
  }
  try{opened.focus()}catch(error){}

  deviceActionTimer=setTimeout(()=>{
    const current=document.querySelector('#deviceActionMessage');
    if(current)current.textContent='Production сайтът не върна потвърждение до 5 секунди. Настройката не е приета за успешна.';
  },5000);
}

document.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target:null;
  const button=target?.closest('#excludeDeviceBtn,#includeDeviceBtn,#checkDeviceBtn');
  if(!button)return;
  const action=actionFor(button);
  if(!action)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openDeviceAction(action);
},true);

window.addEventListener('message',event=>{
  if(event.origin!==SITE_ORIGIN)return;
  if(!event.data||event.data.type!=='ivanov-analytics-device-status')return;
  clearTimeout(deviceActionTimer);
});
