const view=document.querySelector('#view');

function numberFrom(text){
  const match=String(text||'').replace(',','.').match(/-?\d+(?:\.\d+)?/);
  return match?Number(match[0]):0;
}

function metricMap(cards){
  const map=new Map();
  cards.querySelectorAll(':scope > .card').forEach(card=>{
    const label=card.querySelector('.metric-label')?.textContent.trim();
    if(label)map.set(label,card);
  });
  return map;
}

function compactStrongest(card){
  const rows=[...card.querySelectorAll('tbody tr')].slice(0,5);
  const list=document.createElement('div');
  list.className='summary-page-list';
  if(!rows.length){
    list.innerHTML='<div class="summary-empty">Няма данни за избрания период.</div>';
    return list;
  }
  rows.forEach(row=>{
    const cells=[...row.querySelectorAll('td')];
    if(cells.length<5)return;
    const pageButton=cells[0].querySelector('[data-page]');
    const item=document.createElement('article');
    item.className='summary-page-row';
    const pageName=pageButton?.textContent.trim()||cells[0].textContent.trim();
    const pagePath=pageButton?.dataset.page||'';
    item.innerHTML=`
      <div class="summary-page-main">
        <strong>${escapeHtml(pageName)}</strong>
        <span>${escapeHtml(cells[2].textContent.trim())} интерес · ${escapeHtml(cells[3].textContent.trim())} клиентски сесии</span>
      </div>
      <div class="summary-page-sessions"><strong>${escapeHtml(cells[1].textContent.trim())}</strong><span>сесии</span></div>
      <button class="action-secondary compact summary-open-page" type="button" data-page="${escapeHtml(pagePath)}">Отвори статистика</button>`;
    list.appendChild(item);
  });
  return list;
}

function compactSources(card){
  const rows=[...card.querySelectorAll('tbody tr')].slice(0,5);
  const list=document.createElement('div');
  list.className='summary-source-list';
  if(!rows.length){
    list.innerHTML='<div class="summary-empty">Няма данни за избрания период.</div>';
    return list;
  }
  rows.forEach(row=>{
    const cells=[...row.querySelectorAll('td')];
    if(cells.length<4)return;
    const source=cells[0].textContent.trim();
    const item=document.createElement('button');
    item.type='button';
    item.className='summary-source-row';
    item.dataset.summarySource=source;
    item.innerHTML=`<span><strong>${escapeHtml(sourceLabel(source))}</strong><small>${escapeHtml(cells[2].textContent.trim())} действия · ${escapeHtml(cells[3].textContent.trim())} конверсия</small></span><b>${escapeHtml(cells[1].textContent.trim())}</b>`;
    list.appendChild(item);
  });
  return list;
}

function sourceLabel(source){
  const value=String(source||'').toLowerCase();
  if(value==='google')return 'Google';
  if(value==='direct')return 'Direct';
  if(value.includes('facebook')||value==='fb')return 'Facebook';
  return source||'Други';
}

function actionChip(label,value,detail=false){
  return `<button type="button" class="summary-action-chip" data-summary-action="${escapeHtml(label)}"><span>${escapeHtml(label)}</span><strong>${detail?'Виж':escapeHtml(value)}</strong></button>`;
}

function compactActions(mediaCard){
  const metrics=[...mediaCard.querySelectorAll('.small-metrics > div')];
  const gallery=metrics[0]?.querySelector('strong')?.textContent.trim()||'0';
  const video=metrics[1]?.querySelector('strong')?.textContent.trim()||'0';
  const block=document.createElement('div');
  block.className='summary-action-grid';
  block.innerHTML=[
    actionChip('Галерия',gallery),
    actionChip('Видео',video),
    actionChip('Цени','',true),
    actionChip('FAQ','',true),
    actionChip('Контакти','',true)
  ].join('');
  return block;
}

function technicalTrafficCount(sourceCard,technicalCard,geoCard){
  const sourceRows=[...sourceCard.querySelectorAll('tbody tr')];
  const directRow=sourceRows.find(row=>row.querySelector('td')?.textContent.trim().toLowerCase()==='direct');
  const directSessions=numberFrom(directRow?.querySelectorAll('td')[1]?.textContent);

  const techTables=[...technicalCard.querySelectorAll('table')];
  const browserRows=[...(techTables[0]?.querySelectorAll('tbody tr')||[])];
  const osRows=[...(techTables[1]?.querySelectorAll('tbody tr')||[])];
  const chromeRow=browserRows.find(row=>row.querySelector('td')?.textContent.trim().toLowerCase()==='chrome');
  const otherOsRow=osRows.find(row=>row.querySelector('td')?.textContent.trim().toLowerCase()==='other');
  const chromeSessions=numberFrom(chromeRow?.querySelectorAll('td')[1]?.textContent);
  const otherOsSessions=numberFrom(otherOsRow?.querySelectorAll('td')[1]?.textContent);

  const geoRows=[...geoCard.querySelectorAll('tbody tr')];
  const candidates=geoRows.map(row=>{
    const cells=[...row.querySelectorAll('td')];
    return{row,city:cells[0]?.textContent.trim()||'',country:cells[1]?.textContent.trim()||'',sessions:numberFrom(cells[2]?.textContent)};
  }).filter(item=>item.country.toUpperCase()==='US'&&item.sessions>=4);

  const likely=candidates.filter(item=>directSessions>=item.sessions&&chromeSessions>=item.sessions&&otherOsSessions>=item.sessions);
  return{count:likely.reduce((sum,item)=>sum+item.sessions,0),rows:new Set(likely.map(item=>item.row))};
}

function compactGeo(sourceCard,technicalCard,geoCard){
  const tech=technicalTrafficCount(sourceCard,technicalCard,geoCard);
  const rows=[...geoCard.querySelectorAll('tbody tr')];
  const items=[];
  rows.forEach(row=>{
    if(tech.rows.has(row))return;
    const cells=[...row.querySelectorAll('td')];
    if(cells.length<3)return;
    items.push({city:cells[0].textContent.trim(),country:cells[1].textContent.trim(),sessions:cells[2].textContent.trim()});
  });
  const list=document.createElement('div');
  list.className='summary-geo-list';
  items.slice(0,3).forEach(item=>{
    const row=document.createElement('div');
    row.className='summary-geo-row';
    row.innerHTML=`<span><strong>${escapeHtml(item.city)}</strong><small>${escapeHtml(item.country)}</small></span><b>${escapeHtml(item.sessions)}</b>`;
    list.appendChild(row);
  });
  if(tech.count){
    const row=document.createElement('div');
    row.className='summary-geo-row technical';
    row.innerHTML=`<span><strong>Вероятно технически трафик</strong><small>маркиран по комбинация от geo + source + browser + OS</small></span><b>${tech.count}</b>`;
    list.appendChild(row);
  }
  if(!list.children.length)list.innerHTML='<div class="summary-empty">Няма налични geo данни.</div>';
  return list;
}

function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function section(title,content,extraClass=''){
  const card=document.createElement('section');
  card.className=`card summary-section ${extraClass}`.trim();
  const heading=document.createElement('div');
  heading.className='summary-section-heading';
  heading.innerHTML=`<h2>${escapeHtml(title)}</h2>`;
  card.append(heading,content);
  return card;
}

function transformSummary(){
  if(!view||view.querySelector('[data-summary-ux-shell]'))return;
  const heading=view.querySelector('.view-heading h1');
  if(!heading||heading.textContent.trim()!=='Обобщение')return;

  const children=[...view.children];
  const headingWrap=children.find(el=>el.classList.contains('view-heading'));
  const cards=children.find(el=>el.classList.contains('cards'));
  const mediaCard=children.find(el=>el.classList.contains('section-gap')&&el.querySelector('h2')?.textContent.trim()==='Снимки и видео');
  const strongestCard=children.find(el=>el.classList.contains('section-gap')&&el.querySelector('h2')?.textContent.trim()==='Най-силни страници');
  const gridRows=children.filter(el=>el.classList.contains('grid-2'));
  const chartSourceGrid=gridRows[0];
  const siteTechGrid=gridRows[1];
  const chartCard=chartSourceGrid?.children[0];
  const sourceCard=chartSourceGrid?.children[1];
  const technicalCard=siteTechGrid?.children[1];
  const hoursCard=children.find(el=>el.classList.contains('section-gap')&&el.querySelector('h2')?.textContent.trim()==='По часове');
  const geoCard=children.find(el=>el.classList.contains('section-gap')&&el.querySelector('h2')?.textContent.trim()==='Град и държава');

  if(!headingWrap||!cards||!mediaCard||!strongestCard||!chartCard||!sourceCard||!technicalCard||!geoCard)return;

  const metrics=metricMap(cards);
  const keep=['Сесии','Ангажирани посещения','Проявили интерес','Клиентски действия','Конверсия'];
  const kpis=document.createElement('div');
  kpis.className='summary-kpis';
  keep.forEach(label=>{
    const card=metrics.get(label);
    if(!card)return;
    const labelNode=card.querySelector('.metric-label');
    if(labelNode&&label==='Ангажирани посещения')labelNode.textContent='Ангажирани';
    kpis.appendChild(card);
  });

  chartCard.classList.add('summary-chart-card');
  const strongest=section('Най-силни страници',compactStrongest(strongestCard));
  const sources=section('Източници',compactSources(sourceCard));
  const actions=section('Какво правят',compactActions(mediaCard));
  const geo=section('Град и държава',compactGeo(sourceCard,technicalCard,geoCard));

  const lower=document.createElement('div');
  lower.className='summary-grid';
  lower.append(strongest,sources,actions,geo);

  const details=document.createElement('details');
  details.className='card summary-details';
  details.innerHTML='<summary>Още анализи и подробни таблици</summary>';
  const detailsBody=document.createElement('div');
  detailsBody.className='summary-details-body';
  detailsBody.append(mediaCard);
  if(siteTechGrid)detailsBody.append(siteTechGrid);
  if(hoursCard)detailsBody.append(hoursCard);
  detailsBody.append(geoCard);
  details.appendChild(detailsBody);

  const shell=document.createElement('div');
  shell.dataset.summaryUxShell='1';
  shell.className='summary-shell';
  shell.append(kpis,chartCard,lower,details);

  [...view.children].forEach(child=>{if(child!==headingWrap)child.remove()});
  view.appendChild(shell);

  shell.querySelectorAll('[data-summary-source]').forEach(button=>button.addEventListener('click',()=>{
    document.querySelector('.nav button[data-view="sources"]')?.click();
  }));
  shell.querySelectorAll('[data-summary-action]').forEach(button=>button.addEventListener('click',()=>{
    document.querySelector('.nav button[data-view="pages"]')?.click();
  }));
}

const observer=new MutationObserver(()=>transformSummary());
if(view)observer.observe(view,{childList:true,subtree:true});
transformSummary();
