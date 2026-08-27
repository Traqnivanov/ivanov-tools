(()=>{
  const TIME_ZONE='Europe/Sofia';
  const dateFormatter=new Intl.DateTimeFormat('sv-SE',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'});
  const partFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const pad=value=>String(value).padStart(2,'0');

  function dateKey(value=new Date()){return dateFormatter.format(value)}
  function splitKey(key){const [year,month,day]=String(key).split('-').map(Number);return{year,month,day}}
  function keyFromUTC(ms){const date=new Date(ms);return`${date.getUTCFullYear()}-${pad(date.getUTCMonth()+1)}-${pad(date.getUTCDate())}`}
  function shiftKey(key,days){const {year,month,day}=splitKey(key);return keyFromUTC(Date.UTC(year,month-1,day+days))}
  function partsAt(value){const result={};for(const part of partFormatter.formatToParts(value)){if(part.type!=='literal')result[part.type]=Number(part.value)}return result}

  function zonedDateTime(key,hour=0,minute=0,second=0,millisecond=0){
    const {year,month,day}=splitKey(key);
    const target=Date.UTC(year,month-1,day,hour,minute,second,millisecond);
    let guess=target;
    for(let i=0;i<3;i++){
      const parts=partsAt(new Date(guess));
      const represented=Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second);
      const offset=represented-Math.floor(guess/1000)*1000;
      guess=target-offset;
    }
    return new Date(guess);
  }

  function dayCount(from,to){
    const a=splitKey(from),b=splitKey(to);
    return Math.floor((Date.UTC(b.year,b.month-1,b.day)-Date.UTC(a.year,a.month-1,a.day))/86400000)+1;
  }

  function range(period='7d',from='',to='',now=new Date()){
    const today=dateKey(now);
    let startKey=today,endKey=today;
    if(period==='yesterday'){startKey=shiftKey(today,-1);endKey=startKey}
    else if(period==='7d')startKey=shiftKey(today,-6);
    else if(period==='30d')startKey=shiftKey(today,-29);
    else if(period==='month')startKey=`${today.slice(0,7)}-01`;
    else if(period==='custom'){startKey=from||today;endKey=to||today}
    const start=zonedDateTime(startKey);
    const end=new Date(zonedDateTime(shiftKey(endKey,1)).getTime()-1);
    return{start,end,from:startKey,to:endKey,timeZone:TIME_ZONE};
  }

  function previousRange(current){
    const currentFrom=current.from||dateKey(current.start);
    const currentTo=current.to||dateKey(current.end);
    const days=dayCount(currentFrom,currentTo);
    const endKey=shiftKey(currentFrom,-1);
    const startKey=shiftKey(endKey,-days+1);
    return{
      start:zonedDateTime(startKey),
      end:new Date(zonedDateTime(shiftKey(endKey,1)).getTime()-1),
      from:startKey,
      to:endKey,
      timeZone:TIME_ZONE
    };
  }

  function rangeFromControls(){
    return range(
      document.querySelector('#periodFilter')?.value||'7d',
      document.querySelector('#dateFrom')?.value||'',
      document.querySelector('#dateTo')?.value||''
    );
  }

  window.IvanovPeriods=Object.freeze({TIME_ZONE,dateKey,shiftKey,zonedDateTime,range,previousRange,rangeFromControls});
})();
