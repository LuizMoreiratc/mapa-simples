/* Mapa de Jireh · Simples Music
   Controle (celular) + Tela (projeção) sincronizados em tempo real por MQTT público.
   A letra não faz parte do site: quem controla cola a letra no celular, e ela é enviada para a tela. */
(function(){
const FAM={'Introdução':'intro','Final':'intro','Estrofe 1':'estrofe','Estrofe 2':'estrofe','Estrofe 3':'estrofe','Estrofe 4':'estrofe','Pré-refrão':'pre','Refrão':'refrao','Refrão final':'refrao','Pós-refrão':'pos','Ponte A':'ponte','Ponte B':'ponte','Ponte C':'ponte','Tag':'tag','Tag + Vamp':'tag','Vamp':'vamp','Vamp C':'vamp'};
const SECTIONS=Object.keys(FAM);
const col=l=>'var(--f-'+(FAM[l]||'intro')+')';
const DEFAULT=['Estrofe 1','Estrofe 2','Refrão','Pós-refrão','Estrofe 3','Refrão','Pós-refrão','Ponte A','Ponte A','Ponte A','Tag + Vamp','Tag + Vamp','Refrão','Ponte B','Ponte B','Ponte B','Tag','Vamp C','Vamp C','Vamp C','Tag','Refrão final'];
const THEMES={'Introdução':['Instrumental'],'Estrofe 1':['O amor já recebido'],'Estrofe 2':['A tempestade'],'Estrofe 3':['O alto da montanha'],'Refrão':['Jireh, o provedor','Volta o tema central'],'Pós-refrão':['Suficiente para sempre','Volta a extensão'],'Ponte A':['Identidade'],'Tag + Vamp':['Plenitude em frases curtas'],'Ponte B':['Lírios e aves'],'Tag':['O cuidado de Deus','Fecho da ideia'],'Vamp C':['O poder de Deus'],'Refrão final':['Síntese'],'Final':['Saída da música'],'Pré-refrão':['Preparação do refrão']};
const TITLES=['Onde a música muda?','E agora, o que mudou?','A música se amplia','Até o fim'];
const BROKERS=['wss://broker.hivemq.com:8884/mqtt','wss://broker.emqx.io:8084/mqtt'];
const $=id=>document.getElementById(id);
const store={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}},del(k){try{localStorage.removeItem(k)}catch(e){}}};

/* ---------- Leitura da letra ---------- */
const norm=s=>s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu,'').replace(/\s+/g,' ').trim();
const eqLines=(a,b)=>a.length===b.length&&a.every((x,i)=>norm(x)===norm(b[i]));
function stanzasOf(text){
  const out=[];let cur=[];
  text.replace(/\r/g,'').split('\n').forEach(raw=>{const l=raw.trim();if(!l){if(cur.length){out.push(cur);cur=[]}}else cur.push(l)});
  if(cur.length)out.push(cur);
  if(out.length>1&&out[0].length<=3&&out[0].some(l=>/\(part\.|worship|feat\.|^jireh\b/i.test(l)))out.shift();
  return out;
}
function splitTail(ls){
  const n=ls.length;
  for(let u=1;u<=Math.floor(n/3);u++){
    const unit=ls.slice(n-u);let c=1;
    while(n-(c+1)*u>=0&&eqLines(ls.slice(n-(c+1)*u,n-c*u),unit))c++;
    const head=n-(c-1)*u;
    if(c>=3&&head>u)return [ls.slice(0,head),ls.slice(head)];
  }
  return [ls];
}
function compress(ls){
  const n=ls.length;
  for(let p=1;p<=n/2;p++){if(n%p)continue;let ok=true;for(let i=p;i<n;i++)if(norm(ls[i])!==norm(ls[i%p])){ok=false;break}if(ok)return{lines:ls.slice(0,p),rep:n/p}}
  return{lines:ls,rep:1};
}
function parse(text,saved){
  const st=[];stanzasOf(text).forEach(s=>splitTail(s).forEach(x=>st.push(x)));
  const known=st.length===DEFAULT.length;
  let labels=st.map((s,i)=>known?DEFAULT[i]:'');
  if(!known)labels=labels.map((l,i)=>{for(let j=0;j<i;j++)if(eqLines(st[j],st[i])&&labels[j])return labels[j];return l});
  if(saved&&saved.length===st.length)labels=saved;
  const bl=[];
  st.forEach((s,i)=>{const c=compress(s);const last=bl[bl.length-1];
    if(last&&eqLines(last.src,s)&&last.label===labels[i]){last.times++;last.idx.push(i)}
    else bl.push({label:labels[i],src:s,lines:c.lines,rep:c.rep,times:1,idx:[i]})});
  return{blocks:bl,count:st.length,known};
}

/* ---------- Montagem (determinística: o controle calcula e envia para a tela) ---------- */
function estH(b){const lines=b.lines.reduce((s,l)=>s+Math.max(1,Math.ceil(l.length/36)),0)+(b.x>1?1:0);return 24+lines*31+2}
function layout(blocks){
  const all=[{label:'Introdução',lines:['(instrumental)'],x:1,inst:true}].concat(blocks.map(b=>({label:b.label,lines:b.lines,x:b.times*b.rep}))).concat([{label:'Final',lines:['(saída da música)'],x:1,inst:true}]);
  const groups=[];all.forEach((b,i)=>{const g=groups[groups.length-1];if(g&&g.label===b.label&&!b.inst&&!g.inst)g.b.push(i);else groups.push({label:b.label,b:[i],inst:!!b.inst})});
  groups.forEach((g,gi)=>g.b.forEach(i=>all[i].g=gi));
  const H=680,GAP=12;const hs=all.map(estH);
  function pack(limit){const pages=[];let page=[[]],ci=0,used=0;
    all.forEach((b,i)=>{const h=hs[i];
      if(used+(used?GAP:0)+h>limit&&page[ci].length){ci++;used=0;if(ci>2){pages.push(page);page=[[]];ci=0}else page.push([])}
      page[ci].push(i);used+=(used?GAP:0)+h});
    if(page.some(c=>c.length))pages.push(page);return pages}
  let pages=pack(H);
  // equilibra: mesma quantidade de telas, mas com as colunas mais parecidas entre si
  const total=hs.reduce((x,y)=>x+y+GAP,0);
  for(let lim=Math.max(Math.ceil(total/(pages.length*3)),Math.max(...hs));lim<H;lim+=10){const t=pack(lim);if(t.length===pages.length){pages=t;break}}

  const owner={};pages.forEach((p,pi)=>p.flat().forEach(i=>{const g=all[i].g;if(owner[g]===undefined)owner[g]=pi}));
  const ranges=pages.map((p,pi)=>{const own=Object.keys(owner).map(Number).filter(g=>owner[g]===pi);return{first:Math.min(...own),last:Math.max(...own)}});
  return{all,groups:groups.map(g=>({label:g.label})),pages,ranges};
}


/* ---------- Parte teórica (antes da prática) ---------- */
const PECAS=[['Introdução','intro','Abertura, geralmente instrumental. Apresenta o clima e o tom.'],['Estrofe','estrofe','Conta a história. Mesma melodia, letra nova a cada vez.'],['Pré-refrão','pre','Trecho curto que prepara a chegada do refrão. Nem toda música tem.'],['Refrão','refrao','O centro da canção. A mensagem principal, que volta igual.'],['Pós-refrão','pos','Extensão logo depois do refrão que reforça a mesma ideia.'],['Ponte','ponte','Ideia nova e contrastante, geralmente na segunda metade.'],['Tag','tag','Uma frase curta repetida várias vezes.'],['Vamp','vamp','Um ciclo de acordes que a banda sustenta e pode prolongar.']];
const PISTAS=[['Melodia','Mudou a ideia cantada?'],['Harmonia','Mudou o caminho dos acordes?'],['Ritmo','Mudou a divisão, o groove ou a frase?'],['Função','Desenvolve, prepara, contrasta ou conclui?']];
const PASSOS=[['Ouvir','A música toca com a letra corrida na tela.'],['Perceber','Levante a mão quando a música mudar de seção.'],['Nomear','Voltamos o trecho e damos nome a ele.'],['Pintar','O trecho recebe a cor da sua família.']];
const THEORY=[
 ()=>`<div class="th-panel"><div class="th-panel-words">Ouvir<br>Identificar<br>Mapear</div><div class="th-panel-foot">Simples Music</div></div>
  <div class="th-cover"><div class="s-eye">Mentoria · Prática de conjunto</div><div class="th-h1">Enxergar a música</div><p class="th-lead">Como ouvir, nomear e mapear a estrutura de uma canção</p><p class="th-small">Música de estudo: Jireh (Get Worship, versão em português)</p></div>`+foot('Parte 1 · Teoria'),
 ()=>`<div class="s-eye">Parte 1 · Teoria</div><div class="s-title">As peças de uma canção</div><div class="th-grid">`+PECAS.map(([n,f,d])=>`<div class="th-card" style="background:var(--f-${f})"><div class="th-card-t">${n}</div><p>${d}</p></div>`).join('')+`</div>`+foot('Cada família tem uma cor'),
 ()=>`<div class="s-eye">Parte 1 · Teoria</div><div class="s-title">Quatro pistas para perceber a mudança</div><div class="th-cols">`+PISTAS.map(([n,q],i)=>`<div class="th-col"><div class="th-num">0${i+1}</div><div class="th-col-t">${n}</div><p>${q}</p></div>`).join('')+`</div><p class="th-rule"><b>A letra orienta, mas não decide sozinha.</b> Compare a identidade musical e a função do trecho.</p>`+foot('Parte 1 · Teoria'),
 ()=>`<div class="s-eye">Parte 2 · Prática</div><div class="s-title">Vamos mapear Jireh juntos</div><div class="th-cols">`+PASSOS.map(([n,q],i)=>`<div class="th-col${i===3?' hl':''}"><div class="th-num sm">0${i+1}</div><div class="th-col-t">${n}</div><p>${q}</p></div>`).join('')+`</div><p class="th-rule"><b>No final:</b> a música inteira setorizada, de ponta a ponta.</p>`+foot('Parte 2 · Prática')
];
const T=THEORY.length;

/* ---------- Desenho de um slide ---------- */
function blockEl(b,on){
  const d=document.createElement('div');d.className='blk'+(on?' on':'');if(on)d.style.background=col(b.label);
  const t=document.createElement('span');t.className='tagp';t.textContent=b.label;d.appendChild(t);
  b.lines.forEach(l=>{const p=document.createElement('p');p.className='ln'+(b.inst?' inst':'');p.textContent=l;d.appendChild(p)});
  if(b.x>1){const p=document.createElement('p');p.className='ln rep';p.textContent='('+b.x+'x)';d.appendChild(p)}
  return d;
}
const foot=lab=>`<div class="s-foot"><span class="mark">simples<span class="dot">.</span> <span class="mus">music</span></span><span class="lab">${lab}</span></div>`;
function drawSlide(stage,L,view,flash){
  stage.innerHTML='';const sl=document.createElement('div');sl.className='slide';
  const nL=L.pages.length;const li=view.slide-T;
  if(view.slide<T){sl.innerHTML=THEORY[view.slide]();if(view.slide===0)sl.classList.add('th-first')}
  else if(li<nL){
    sl.innerHTML=`<div class="s-eye">Parte 2 · Prática · letra ${li+1}/${nL}</div><div class="s-title">${TITLES[Math.min(li,TITLES.length-1)]}</div>`+foot('Jireh · Get Worship');
    const cols=document.createElement('div');cols.className='cols';
    L.pages[li].forEach(c=>{const cd=document.createElement('div');cd.className='col';c.forEach(i=>{const b=L.all[i];const el=blockEl(b,b.g<view.painted);if(flash&&b.g===view.painted-1)el.classList.add('flash');cd.appendChild(el)});cols.appendChild(cd)});
    sl.appendChild(cols);
  }else{
    sl.innerHTML=`<div class="s-eye">Mapa completo</div><div class="s-title">Jireh, parte por parte</div>`+foot('Mapa completo');
    const seen={};const rows=L.groups.map(g=>{const k=g.label;seen[k]=(seen[k]||0)+1;const th=THEMES[k]||[''];return{label:k,theme:th[Math.min(seen[k]-1,th.length-1)]}});
    const half=Math.max(1,Math.ceil(rows.length/2)-(rows.length%2?1:0));
    const sum=document.createElement('div');sum.className='sum';
    [rows.slice(0,half),rows.slice(half)].forEach(part=>{const c=document.createElement('div');c.className='sc';part.forEach(r=>{const d=document.createElement('div');d.className='sr';const p=document.createElement('span');p.className='sp';p.style.background=col(r.label);p.textContent=r.label;const t=document.createElement('span');t.className='st';t.textContent=r.theme;d.append(p,t);c.appendChild(d)});sum.appendChild(c)});
    sl.appendChild(sum);
  }
  stage.appendChild(sl);
}


/* ---------- Música (YouTube) ---------- */
function ytId(u){if(!u)return'';const m=String(u).match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([A-Za-z0-9_-]{11})/);if(m)return m[1];return /^[A-Za-z0-9_-]{11}$/.test(u.trim())?u.trim():''}
let ytReady=null;
function loadYT(){if(ytReady)return ytReady;ytReady=new Promise(res=>{window.onYouTubeIframeAPIReady=()=>res(window.YT);const t=document.createElement('script');t.src='https://www.youtube.com/iframe_api';document.head.appendChild(t)});return ytReady}

/* ---------- Tempo real ---------- */
function topicFor(code){return 'simplesmusic/mapa-jireh/v1/'+code}
function connect(code,onState,onStatus){
  const clients=[];let ok=0;
  if(!window.mqtt){onStatus(false);return{publish(){},clients}}
  BROKERS.forEach(url=>{
    try{
      const c=mqtt.connect(url,{clientId:'sm-'+Math.random().toString(36).slice(2,10),clean:true,connectTimeout:8000,reconnectPeriod:2000,keepalive:30});
      c.on('connect',()=>{ok++;onStatus(true);c.subscribe(topicFor(code),{qos:1})});
      c.on('close',()=>{ok=Math.max(0,ok-1);onStatus(clients.some(x=>x.connected))});
      c.on('message',(t,msg)=>{try{onState(JSON.parse(msg.toString()))}catch(e){}});
      clients.push(c);
    }catch(e){}
  });
  return{clients,publish(state){const s=JSON.stringify(state);clients.forEach(c=>{try{c.publish(topicFor(code),s,{qos:1,retain:true})}catch(e){}})}};
}
function fitStage(stage,box){const k=Math.min(box.clientWidth/1920,box.clientHeight/1080);stage.style.transform=`translate(-50%,-50%) scale(${k})`}

/* =========================================================
   TELA (projeção)
   ========================================================= */
function initTela(){
  const code=(location.hash||'').replace('#','').trim().toUpperCase();
  const wait=$('wait'),show=$('show'),stage=$('stage');
  $('code').textContent=code||'—';
  if(!code){$('waitmsg').textContent='Este link está sem o código da sala. Peça o link completo para quem está no controle.';return}
  let cur=null,L=null,lastKey='';
  const fit=()=>fitStage(stage,show);window.addEventListener('resize',fit);
  connect(code,st=>{
    if(!st||typeof st.seq!=='number')return;
    if(cur&&st.seq<cur.seq)return; // vem de dois servidores: fica com o mais novo
    const key=JSON.stringify(st.L);
    if(key!==lastKey){L=st.L;lastKey=key}
    const flash=cur&&st.view.painted===cur.view.painted+1;
    const first=!cur;cur=st;wait.hidden=true;show.hidden=false;fit();drawSlide(stage,L,st.view,flash);
    if(st.media)media(st.media,first);
  },live=>{$('live').classList.toggle('ok',live);$('livetxt').textContent=live?'Conectado. Aguardando o controle…':'Conectando…'});
  // ---- música
  let player=null,curId='',lastN=-1;
  const wrap=$('ytwrap'),unlock=$('unlock');
  function media(m,first){
    wrap.className=m.size==='full'?'full':'';wrap.hidden=!m.id;
    const go=()=>{
      if(first){lastN=m.n;return}
      if(m.n===lastN)return;lastN=m.n;
      const t=player.getCurrentTime?player.getCurrentTime():0;
      if(m.cmd==='play'){player.playVideo();setTimeout(()=>{const s=player.getPlayerState&&player.getPlayerState();if(s!==1&&s!==3)unlock.hidden=false},1800)}
      else if(m.cmd==='pause')player.pauseVideo();
      else if(m.cmd==='back')player.seekTo(Math.max(0,t-10),true);
      else if(m.cmd==='fwd')player.seekTo(t+10,true);
      else if(m.cmd==='restart'){player.seekTo(0,true);player.pauseVideo()}
    };
    if(!m.id)return;
    if(m.id!==curId){curId=m.id;
      loadYT().then(YT=>{
        if(player){player.cueVideoById(m.id);go();return}
        player=new YT.Player('yt',{videoId:m.id,playerVars:{playsinline:1,rel:0,modestbranding:1},events:{onReady:go}});
      });
    }else if(player&&player.playVideo)go();
  }
  unlock.addEventListener('click',()=>{unlock.hidden=true;try{player.playVideo()}catch(e){}});
  $('fs').addEventListener('click',()=>{try{const p=document.documentElement.requestFullscreen();if(p&&p.catch)p.catch(()=>{})}catch(e){}});
  let t;const wake=()=>{document.body.classList.remove('idle');clearTimeout(t);t=setTimeout(()=>document.body.classList.add('idle'),2500)};
  document.addEventListener('mousemove',wake);wake();
}

/* =========================================================
   CONTROLE (celular)
   ========================================================= */
function initControle(){
  let code=(location.hash||'').replace('#','').trim().toUpperCase()||store.get('sm.code');
  if(!code){code=Array.from({length:6},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*32)]).join('')}
  store.set('sm.code',code);if(location.hash.replace('#','').toUpperCase()!==code)history.replaceState(null,'','#'+code);
  const telaURL=location.href.replace(/controle\.html.*$/,'tela.html#'+code).replace(/\/(#.*)?$/,'/tela.html#'+code);
  $('telaLink').textContent=telaURL;$('roomCode').textContent=code;

  let parsed=null,L=null,view={slide:0,painted:0},seq=Number(store.get('sm.seq')||0);
  let mediaSt={id:ytId(store.get('sm.yt')||'https://www.youtube.com/watch?v=cjHFWrf3fCk'),cmd:'',n:0,size:'corner'};
  try{const ms=JSON.parse(store.get('sm.media')||'null');if(ms)mediaSt=ms}catch(e){}
  const bus=connect(code,()=>{},live=>{$('live').classList.toggle('ok',live);$('livetxt').textContent=live?'Conectado ao telão':'Conectando…'});
  const mstage=$('mstage'),mini=$('mini');
  const fitMini=()=>{const k=mini.clientWidth/1920;mstage.style.transform=`scale(${k})`};
  window.addEventListener('resize',fitMini);
  function send(flash){
    if(!L)return;seq=Math.max(seq+1,Date.now());store.set('sm.seq',seq);store.set('sm.view',JSON.stringify(view));
    store.set('sm.media',JSON.stringify(mediaSt));bus.publish({seq,L,view,media:mediaSt});drawSlide(mstage,L,view,flash);fitMini();updateCtl();
  }
  function pageOf(g){for(let i=0;i<L.ranges.length;i++){const r=L.ranges[i];if(g>=r.first&&g<=r.last)return T+i}return T}
  function updateCtl(){
    const total=L.groups.length,nP=T+L.pages.length+1,last=T+L.pages.length;
    $('nextlab').textContent=view.painted<total?'Próximo a pintar: '+L.groups[view.painted].label:'Tudo pintado';
    $('ctlcount').textContent=`Tela ${view.slide+1}/${nP}${view.slide===last?' (mapa final)':view.slide<T?' (teoria)':''} · ${view.painted}/${total} trechos pintados`;
    $('bPgPrev').disabled=view.slide===0;$('bPgNext').disabled=view.slide>=last;
    $('bNext').disabled=view.painted>=total;$('bPrev').disabled=view.painted===0;
  }
  // Pintar: pinta o próximo trecho e mostra a tela onde ele está
  function next(){if(view.painted>=L.groups.length)return;view.slide=pageOf(view.painted);view.painted++;send(true)}
  // Desfazer: tira a cor do último trecho pintado
  function prev(){if(!view.painted)return;view.painted--;view.slide=pageOf(view.painted);send()}
  // Virar página sem pintar
  function pg(d){view.slide=Math.min(T+L.pages.length,Math.max(0,view.slide+d));send()}
  // preparo
  function stanzaLabels(){const a=[];parsed.blocks.forEach(b=>b.idx.forEach(()=>a.push(b.label)));return a}
  function renderBlocks(){
    const box=$('blocks');box.innerHTML='';box.hidden=false;
    parsed.blocks.forEach((b,bi)=>{
      const r=document.createElement('div');r.className='brow';
      const sel=document.createElement('select');sel.id='sec-'+bi;sel.setAttribute('aria-label','Seção do bloco '+(bi+1));
      const o0=document.createElement('option');o0.value='';o0.textContent='Escolha…';sel.appendChild(o0);
      SECTIONS.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;if(s===b.label)o.selected=true;sel.appendChild(o)});
      sel.style.borderLeft='8px solid '+(b.label?getComputedStyle(document.documentElement).getPropertyValue('--f-'+(FAM[b.label]||'intro')):'var(--line)');
      sel.addEventListener('change',()=>{b.label=sel.value;store.set('sm.labels',JSON.stringify(stanzaLabels()));renderBlocks();status();ready()});
      const pv=document.createElement('div');pv.className='prev';pv.textContent=b.lines[0]+(b.lines.length>1?'  ·  '+b.lines.length+' linhas':'');
      const x=document.createElement('span');x.className='x';const t=b.times*b.rep;x.textContent=t>1?'×'+t:'';
      r.append(sel,pv,x);box.appendChild(r);
    });
  }
  function status(){
    const s=$('status');const miss=parsed.blocks.filter(b=>!b.label).length;
    s.className='status'+(parsed.known&&!miss?'':' warn');
    s.innerHTML=parsed.known?`<b>Estrutura reconhecida.</b> ${parsed.count} blocos de letra em ${parsed.blocks.length} trechos.`:`<b>A letra veio com ${parsed.count} blocos, diferente do esperado.</b> Escolha a seção dos que estão em branco.`;
    if(miss)s.innerHTML+=` Faltam ${miss}.`;
    return !miss;
  }
  function ready(){
    if(!parsed||parsed.blocks.some(b=>!b.label)){$('ctl').hidden=true;return}
    const nl=layout(parsed.blocks);const changed=!L||JSON.stringify(nl)!==JSON.stringify(L);L=nl;
    if(changed){const sv=JSON.parse(store.get('sm.view')||'null');view=sv&&sv.slide<=T+L.pages.length?sv:{slide:0,painted:0}}
    $('ctl').hidden=false;send();
  }
  function doParse(useSaved){
    const text=$('lyrics').value;if(!text.trim()){$('status').textContent='Cole a letra no campo acima primeiro.';return}
    store.set('sm.text',text);let saved=null;
    if(useSaved){try{saved=JSON.parse(store.get('sm.labels')||'null')}catch(e){}}else{store.del('sm.labels');store.del('sm.view')}
    parsed=parse(text,saved);renderBlocks();status();ready();
  }
  $('btnParse').addEventListener('click',()=>doParse(false));
  $('bNext').addEventListener('click',next);$('bPrev').addEventListener('click',prev);$('bPgPrev').addEventListener('click',()=>pg(-1));$('bPgNext').addEventListener('click',()=>pg(1));
  $('bAll').addEventListener('click',()=>{view.painted=L.groups.length;send()});
  $('bReset').addEventListener('click',()=>{view={slide:T,painted:0};send()});
  $('bSum').addEventListener('click',()=>{view.slide=T+L.pages.length;send()});
  $('bCopy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(telaURL);$('bCopy').textContent='Copiado'}catch(e){const r=document.createRange();r.selectNodeContents($('telaLink'));const s=getSelection();s.removeAllRanges();s.addRange(r)}setTimeout(()=>$('bCopy').textContent='Copiar link',1800)});
  if(navigator.share){$('bShare').hidden=false;$('bShare').addEventListener('click',()=>navigator.share({title:'Mapa de Jireh · tela',text:'Abra este link no computador da projeção, em tela cheia:',url:telaURL}).catch(()=>{}))}
  $('bNewRoom').addEventListener('click',()=>{store.del('sm.code');store.del('sm.view');location.hash='';location.reload()});
  // ---- música
  $('ytUrl').value=store.get('sm.yt')||'https://www.youtube.com/watch?v=cjHFWrf3fCk';
  function mcmd(c){if(!L){$('ytMsg').textContent='Organize a letra primeiro.';return}mediaSt.cmd=c;mediaSt.n=(mediaSt.n||0)+1;send();$('ytMsg').textContent={play:'Tocando no telão',pause:'Pausado',back:'Voltou 10 s',fwd:'Avançou 10 s',restart:'Voltou ao início (pausado)'}[c]||''}
  $('ytSet').addEventListener('click',()=>{const id=ytId($('ytUrl').value);if(!id){$('ytMsg').textContent='Não reconheci esse link do YouTube.';return}store.set('sm.yt',$('ytUrl').value);mediaSt.id=id;mediaSt.cmd='';mediaSt.n=(mediaSt.n||0)+1;send();$('ytMsg').textContent='Vídeo carregado no telão.'});
  [['ytPlay','play'],['ytPause','pause'],['ytBack','back'],['ytFwd','fwd'],['ytRestart','restart']].forEach(([id,c])=>$(id).addEventListener('click',()=>mcmd(c)));
  $('ytSize').addEventListener('click',()=>{mediaSt.size=mediaSt.size==='full'?'corner':'full';$('ytSize').textContent=mediaSt.size==='full'?'Vídeo no canto':'Vídeo em tela cheia';send()});
  $('ytSize').textContent=mediaSt.size==='full'?'Vídeo no canto':'Vídeo em tela cheia';
  const saved=store.get('sm.text');if(saved){$('lyrics').value=saved;doParse(true)}
  // reenviar o estado de tempos em tempos para quem entrar depois
  setInterval(()=>{if(L&&document.visibilityState==='visible')bus.publish({seq,L,view,media:mediaSt})},15000);
}

window.SM={initTela,initControle,parse,layout,ytId};
})();
