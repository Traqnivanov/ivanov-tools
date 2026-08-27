const view=document.querySelector('#view');
let latestChannelStatus=null;

const CHANNELS=[
  {key:'business',label:'Google Business',detail:'Лом · София',status:'Свързването предстои'},
  {key:'facebook',label:'Facebook',detail:'Лом · София',status:'Свързването предстои'},
  {key:'search',label:'Google търсене',detail:'Search Console',status:'Свързването предстои'},
  {key:'ads',label:'Google Ads',detail:'Резултат след рекламния клик',status:'Tracker данни налични'}
];

function liveStatusFor(key,status){
  if(!status)return null;
  const provider=key==='business'?'google_business':key==='search'?'search_console':null;
  if(!provider)return null;
  const connection=(status.connections||[]).find(item=>item.provider===provider);
  let profiles=(status.profiles||[]).filter(item=>item.provider===provider);
  if(provider==='search_console'){
    const siteProfiles=profiles.filter(item=>String(item.profile_key||'').startsWith('sc-city:'));
    if(siteProfiles.length>=5)profiles=siteProfiles;
  }
  if(!connection)return 'Свързването предстои';
  if(profiles.length)return `Свързано · ${profiles.length} профила`;
  return key==='business'?'Разрешено · чака API':'Разрешено';
}

function applyLiveStatuses(root=document){
  if(!latestChannelStatus)return;
  root.querySelectorAll('[data-summary-channel]').forEach(button=>{
    const status=liveStatusFor(button.dataset.summaryChannel,latestChannelStatus);
    if(status)button.querySelector('em').textContent=status;
  });
}

function mount(){
  const shell=view?.querySelector('[data-summary-final]');
  if(!shell||shell.querySelector('[data-summary-channels]'))return;
  const card=document.createElement('section');
  card.className='card summary-channel-entry';
  card.dataset.summaryChannels='1';
  card.innerHTML=`<div class="summary-channel-head"><div><span>Външни канали</span><h2>Още откъде идва бизнесът</h2></div><small>Подробностите са в Канали</small></div><div class="summary-channel-grid">${CHANNELS.map(channel=>`<button type="button" data-summary-channel="${channel.key}"><span><strong>${channel.label}</strong><small>${channel.detail}</small></span><em>${channel.status}</em><b>→</b></button>`).join('')}</div>`;
  shell.appendChild(card);
  applyLiveStatuses(card);
  card.querySelectorAll('[data-summary-channel]').forEach(button=>button.addEventListener('click',()=>{
    document.querySelector(`.nav button[data-external-view="${button.dataset.summaryChannel}"]`)?.click();
  }));
}

window.addEventListener('ivanov:channel-status',event=>{
  latestChannelStatus=event.detail||null;
  applyLiveStatuses();
});

if(view){
  new MutationObserver(mount).observe(view,{childList:true,subtree:true});
  mount();
}
