const view=document.querySelector('#view');
const sidebar=document.querySelector('#sidebar');
const siteFilter=document.querySelector('#siteFilter');
let externalView='';

const CHANNELS={
  business:{title:'Google Business',subtitle:'Официалната видимост и действията от двата Business Profile профила.',icon:'G',scope:'business'},
  facebook:{title:'Facebook',subtitle:'Резултатите от Ivanov Remonti Лом и Ivanov Remonti София.',icon:'f',scope:'social'},
  search:{title:'Google търсене',subtitle:'Органичното представяне от Google Search Console.',icon:'⌕',scope:'search'},
  ads:{title:'Google Ads',subtitle:'Краткият бизнес резултат от рекламния трафик, без да дублираме Google Ads приложението.',icon:'↗',scope:'ads'}
};

function currentArea(){
  const value=siteFilter?.value||'all';
  if(value==='sofia')return'София';
  if(value==='montana')return'Монтана';
  if(value==='lom'||value==='lom-en'||value==='lom-de')return'Лом';
  return'Всички';
}

function profileCards(type,area){
  const cities=area==='Всички'?['Лом','София']:[area];
  if((type==='business'||type==='facebook')&&area==='Монтана'){
    return`<article class="card channel-card"><h2>Монтана</h2><div class="channel-status">Няма свързан ${type==='business'?'Google Business профил':'Facebook страница'} за Монтана. Това не е грешка — модулът остава празен, докато няма реален източник.</div></article>`;
  }
  return cities.map(city=>{
    if(city==='Монтана'&&(type==='business'||type==='facebook'))return'';
    const name=type==='business'?`Google Business — ${city}`:type==='facebook'?`Ivanov Remonti ${city}`:`${city}`;
    const chips=type==='business'?['Показвания','Обаждания','Към сайта','Упътвания']:type==='facebook'?['Reach','Взаимодействия','Кликове','Публикации']:type==='search'?['Кликове','Показвания','CTR','Позиция']:['Ads сесии','Интерес','Клиентски сесии','Конверсия'];
    return`<article class="card channel-card"><h2>${name}</h2><p class="card-note">Структурата е готова. Реалните стойности ще се покажат след официалното свързване на източника.</p><div class="channel-next">${chips.map(x=>`<span>${x}</span>`).join('')}</div><div class="channel-status">Не е свързано още</div></article>`;
  }).join('');
}

function renderExternal(type){
  const config=CHANNELS[type];
  if(!config||!view)return;
  externalView=type;
  const area=currentArea();
  document.querySelectorAll('.nav button').forEach(button=>button.classList.toggle('active',button.dataset.externalView===type));
  view.innerHTML=`<div class="view-heading"><div><h1>${config.title}</h1><p class="subtitle">${config.subtitle}</p></div><span class="channel-badge">Филтър: ${area}</span></div><div class="channel-shell"><div class="channel-grid">${profileCards(type,area)}</div><section class="card channel-card"><h2>Как ще работи</h2><p class="card-note">Този раздел ще показва само официалните данни от съответната платформа и ясна връзка към резултата на сайта. Няма да дублира подробните панели на Google или Meta.</p><div class="channel-status">Следващият етап е свързване на източника. Пароли не се записват в Ivanov Analytics; използва се официално разрешение към платформата.</div></section></div>`;
  sidebar?.classList.remove('open');
  syncMobileActive('channels');
}

function activateInternal(viewName){
  externalView='';
  const button=document.querySelector(`.nav button[data-view="${viewName}"]`);
  button?.click();
  syncMobileActive(viewName==='summary'?'home':viewName==='system'?'more':'site');
}

function buildMobileNav(){
  if(document.querySelector('.mobile-primary-nav'))return;
  const nav=document.createElement('nav');
  nav.className='mobile-primary-nav';
  nav.setAttribute('aria-label','Основна навигация');
  nav.innerHTML=`<button type="button" data-mobile-nav="home" class="active"><b>⌂</b><span>Начало</span></button><button type="button" data-mobile-nav="site"><b>▤</b><span>Сайт</span></button><button type="button" data-mobile-nav="channels"><b>◎</b><span>Канали</span></button><button type="button" data-mobile-nav="more"><b>•••</b><span>Още</span></button>`;
  document.body.appendChild(nav);
  const sheet=document.createElement('div');
  sheet.className='mobile-nav-sheet';
  sheet.innerHTML='<div class="mobile-sheet-title"><span></span><button type="button" data-sheet-close>Затвори</button></div><div class="mobile-sheet-grid"></div>';
  document.body.appendChild(sheet);
  nav.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>handleMobile(button.dataset.mobileNav)));
  sheet.querySelector('[data-sheet-close]').addEventListener('click',closeSheet);
}

function handleMobile(type){
  if(type==='home'){closeSheet();activateInternal('summary');return}
  const sheet=document.querySelector('.mobile-nav-sheet');
  const title=sheet.querySelector('.mobile-sheet-title span');
  const grid=sheet.querySelector('.mobile-sheet-grid');
  if(type==='site'){
    title.textContent='Сайт';
    grid.innerHTML='<button data-go="pages">Всички страници<small>Статистика по страници</small></button><button data-go="results">Резултати<small>Телефон, Viber и форми</small></button><button data-go="sources">Източници<small>Откъде идват посещенията</small></button>';
  }else if(type==='channels'){
    title.textContent='Външни канали';
    grid.innerHTML='<button data-channel="business">Google Business<small>Лом и София</small></button><button data-channel="facebook">Facebook<small>Лом и София</small></button><button data-channel="search">Google търсене<small>Search Console</small></button><button data-channel="ads">Google Ads<small>Бизнес резултат</small></button>';
  }else{
    title.textContent='Още';
    grid.innerHTML='<button data-go="system">Система и настройки<small>Техническа информация</small></button>';
  }
  grid.querySelectorAll('[data-go]').forEach(button=>button.addEventListener('click',()=>{closeSheet();activateInternal(button.dataset.go)}));
  grid.querySelectorAll('[data-channel]').forEach(button=>button.addEventListener('click',()=>{closeSheet();renderExternal(button.dataset.channel)}));
  sheet.classList.add('open');
  syncMobileActive(type);
}

function closeSheet(){document.querySelector('.mobile-nav-sheet')?.classList.remove('open')}
function syncMobileActive(type){document.querySelectorAll('[data-mobile-nav]').forEach(button=>button.classList.toggle('active',button.dataset.mobileNav===type))}

function bindDesktop(){
  document.querySelectorAll('.nav button[data-external-view]').forEach(button=>{button.onclick=()=>renderExternal(button.dataset.externalView)});
  document.querySelectorAll('.nav button[data-view]').forEach(button=>button.addEventListener('click',()=>{externalView='';syncMobileActive(button.dataset.view==='summary'?'home':button.dataset.view==='system'?'more':'site')}));
}

siteFilter?.addEventListener('change',()=>{if(externalView)setTimeout(()=>renderExternal(externalView),0)});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeSheet()});

bindDesktop();
buildMobileNav();
