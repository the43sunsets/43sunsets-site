// 43 Sunsets Cockpit — visit beacon (no cookies, no personal data). Keeps a random id in this browser only,
// remembers the first utm_source it saw, and pings /cockpit/hit once per visit. Disable: localStorage.setItem('c43_optout','1').
(function(){try{
  if(localStorage.getItem('c43_optout')==='1')return;
  var vid=localStorage.getItem('c43_vid');
  if(!vid){vid=Array.from(crypto.getRandomValues(new Uint8Array(12)),function(b){return b.toString(16).padStart(2,'0')}).join('');localStorage.setItem('c43_vid',vid);}
  var q=new URLSearchParams(location.search),src=q.get('utm_source')||q.get('src');
  if(src){localStorage.setItem('c43_src',src);}else{src=localStorage.getItem('c43_src')||(document.referrer?'ref':'direct');}
  var body=JSON.stringify({vid:vid,src:src,path:location.pathname});
  if(navigator.sendBeacon){navigator.sendBeacon('/cockpit/hit',new Blob([body],{type:'application/json'}));}
  else{fetch('/cockpit/hit',{method:'POST',headers:{'content-type':'application/json'},body:body,keepalive:true});}
}catch(e){}})();
