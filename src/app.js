'use strict';
/* ═══════════ utils ═══════════ */
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const REDUCED=matchMedia('(prefers-reduced-motion: reduce)').matches;
const F_UI='Archivo, system-ui, sans-serif';
const font=(w,px)=>`${w} ${px}px ${F_UI}`;
let COL={}, STOPS=[];
function readColors(){
  const cs=getComputedStyle(document.documentElement);
  ['paper','screen','tray','ink','ink2','ink3','rule','grid','grid2','slow','mid1','mid2','fast','bad','ok']
    .forEach(k=>COL[k]=cs.getPropertyValue('--'+k).trim());
  STOPS=['slow','mid1','mid2','fast'].map(k=>hexRgb(COL[k]));
}
function hexRgb(h){h=h.replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');
  const n=parseInt(h,16);return[n>>16&255,n>>8&255,n&255];}
/* colour = the axon's normal conduction velocity (0 slowest → 1 fastest) */
function spec(r,a=1){const x=clamp(r,0,1)*3,i=Math.min(2,Math.floor(x)),f=x-i,A=STOPS[i],B=STOPS[i+1];
  return `rgba(${A.map((v,k)=>Math.round(v+(B[k]-v)*f)).join(',')},${a})`;}
function alpha(hex,a){const [r,g,b]=hexRgb(hex);return `rgba(${r},${g},${b},${a})`;}
function fit(cv){const r=cv.getBoundingClientRect(),d=window.devicePixelRatio||1;
  const W=Math.max(1,Math.round(r.width*d)),H=Math.max(1,Math.round(r.height*d));
  if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H;}
  const ctx=cv.getContext('2d');ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,r.width,r.height);
  return{ctx,w:r.width,h:r.height};}
function text(ctx,s,x,y,{c=COL.ink2,w=500,px=11,al='left',bl='alphabetic'}={}){
  ctx.font=font(w,px);ctx.fillStyle=c;ctx.textAlign=al;ctx.textBaseline=bl;ctx.fillText(s,x,y);}
function line(ctx,x0,y0,x1,y1,c,lw=1,dash){ctx.save();if(dash)ctx.setLineDash(dash);ctx.strokeStyle=c;ctx.lineWidth=lw;
  ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();ctx.restore();}
const f1=v=>v==null?'—':v.toFixed(1), f0=v=>v==null?'—':v.toFixed(0);
const fmtAmp=(v,kind)=>kind==='motor'?(v<1?v.toFixed(2):v.toFixed(1)):v.toFixed(0);
const unitOf=kind=>kind==='motor'?'mV':'µV';

/* ═══════════ state ═══════════ */
const S={
  ch:1, nerve:'median',
  c1:{site:0,mA:30,crowd:true},
  c2:{mod:'motor',D:freshD(),crowd:true,dt:{motor:1.2,sensory:.3}},
  c3:{D:freshD(),preset:'normal',crowd:false},
};
const POPS={};
function pop(nk,kind){const k=nk+kind;return POPS[k]||(POPS[k]=makePop(nk,kind));}
const NV=()=>NERVES[S.nerve];
function sitesOf(kind){return NV()[kind].sites;}

/* reference normal response per nerve/kind so gain stays put while disease shrinks things */
const REF={};
function refAmp(kind){const k=S.nerve+kind;if(REF[k])return REF[k];
  const R=respond(pop(S.nerve,kind),S.nerve,kind,sitesOf(kind)[0],freshD(),100);return REF[k]=R.amp;}

/* ═══════════ the scope: stacked sweeps, one row per stimulation site ═══════════ */
const SWEEPS={motor:[2,3,5,10],sensory:[.5,1,2,3,5]};
const GAINS={motor:[.1,.2,.5,1,2,5],sensory:[1,2,5,10,20]};
function pickSweep(rows,kind){
  let need=kind==='motor'?20:4;
  for(const {R} of rows)if(!R.nr)need=Math.max(need,R.onset+R.dur+(kind==='motor'?7:1.6));
  return SWEEPS[kind].find(s=>s*10>=need)||SWEEPS[kind].at(-1);
}
function pickGain(kind,divs){const ref=refAmp(kind);return GAINS[kind].find(g=>g*divs>=ref)||GAINS[kind].at(-1);}

function drawScope(cv,rows,{kind,crowd,sweep,gain,labelW=78,markers=true}){
  const {ctx,w,h}=fit(cv);
  const x0=labelW,x1=w-8,top=6,bot=h-20,n=rows.length,rowH=(bot-top)/n;
  const tx=t=>x0+t/(sweep*10)*(x1-x0);
  const divPx=rowH*(n===1?.19:.25), pxPer=divPx/gain;
  // grid: 10 time divisions
  for(let i=0;i<=10;i++){const X=Math.round(tx(i*sweep))+.5;line(ctx,X,top,X,bot,i%5?COL.grid:COL.grid2);}
  for(let i=0;i<10;i+=2)text(ctx,(i*sweep).toFixed(sweep<1?1:0),tx(i*sweep),h-5,{c:COL.ink3,al:'center'});
  text(ctx,'ms',x1,h-5,{c:COL.ink3,al:'right'});
  rows.forEach(({R,label,sub},ri)=>{
    const base=top+rowH*ri+rowH*(n===1?.72:.68);
    line(ctx,x0,Math.round(base)+.5,x1,Math.round(base)+.5,COL.grid2);
    text(ctx,label,10,base-4,{c:COL.ink,w:650,px:12});
    if(sub)text(ctx,sub,10,base+11,{c:COL.ink3,px:11});
    ctx.save();ctx.beginPath();ctx.rect(x0,top,x1-x0,bot-top);ctx.clip();
    if(crowd&&!R.nr)drawCrowd(ctx,R,tx,base,pxPer,x0,x1,sweep);
    // summed trace
    ctx.strokeStyle=COL.ink;ctx.lineWidth=crowd?1.8:1.6;ctx.lineJoin='round';ctx.beginPath();
    const tmax=sweep*10;
    for(let i=0;i*R.dt<=tmax&&i<R.sig.length;i++){const X=tx(i*R.dt),Y=base-R.sig[i]*pxPer;i?ctx.lineTo(X,Y):ctx.moveTo(X,Y);}
    ctx.stroke();ctx.restore();
    if(!markers)return;
    if(R.nr){text(ctx,'No response',x0+10,base-8,{c:COL.bad,w:600,px:12});return;}
    const ox=tx(R.onset);
    ctx.fillStyle=COL.ink;ctx.beginPath();ctx.moveTo(ox,base+2);ctx.lineTo(ox-4,base+9);ctx.lineTo(ox+4,base+9);ctx.fill();
    text(ctx,R.onset.toFixed(1)+' ms',ox,base+21,{c:COL.ink,w:600,al:'center'});
    const px=tx(R.peakLat),py=base-R.amp*pxPer;
    line(ctx,px-6,py,px+6,py,COL.ink,1.4);
    text(ctx,fmtAmp(R.amp,kind)+' '+unitOf(kind),px+9,Math.max(top+10,py-5),{c:COL.ink,w:600});
  });
  return{tx,x0,x1};
}

/* each contributing unit is a ribbon stacked on the ones before it, fastest first */
function drawCrowd(ctx,R,tx,base,pxPer,x0,x1,sweep){
  const live=R.parts.filter(p=>!p.dead&&p.stim&&p.t!=null).sort((a,b)=>b.u.cv0-a.u.cv0);
  const step=1.5,N=Math.ceil((x1-x0)/step)+1,cum=new Float32Array(N),tpx=(sweep*10)/(x1-x0);
  for(const p of live){
    const i0=Math.max(0,Math.floor((tx(p.t)-x0)/step)),i1=Math.min(N-1,Math.ceil((tx(p.t+R.udur)-x0)/step));
    if(i1<=i0)continue;
    const old=cum.slice(i0,i1+1);
    for(let i=i0;i<=i1;i++){const t=i*step*tpx;cum[i]+=p.a*R.shape((t-p.t)/R.tsc);}
    ctx.fillStyle=spec(p.u.r,.82);ctx.beginPath();
    for(let i=i0;i<=i1;i++){const X=x0+i*step,Y=base-cum[i]*pxPer;i===i0?ctx.moveTo(X,Y):ctx.lineTo(X,Y);}
    for(let i=i1;i>=i0;i--)ctx.lineTo(x0+i*step,base-old[i-i0]*pxPer);
    ctx.closePath();ctx.fill();
  }
}

/* ═══════════ nerve selector (shared) ═══════════ */
function renderNerveSegs(){
  $$('[data-nerve-seg]').forEach(box=>{
    box.innerHTML=Object.entries(NERVES).map(([k,v])=>`<button data-v="${k}" aria-pressed="${k===S.nerve}">${v.name}</button>`).join('');
    box.querySelectorAll('button').forEach(b=>b.onclick=()=>setNerve(b.dataset.v));
  });
}
function setNerve(k){
  if(k===S.nerve)return;S.nerve=k;
  S.c1.site=Math.min(S.c1.site,sitesOf('motor').length-1);
  if(S.c2.mod==='sensory'&&sitesOf('sensory').length<2){} // sural has one site; handled in ch2
  if(['length','entrap'].includes(S.c3.preset))applyPreset3(S.c3.preset);
  renderNerveSegs();SR1=null;renderNorms();redraw();
}
function renderNorms(){
  const nv=NV(),n=nv.norm,sn=nv.sensory.nerve||nv.name;
  const html=`<caption>Approximate normal values, ${nv.name.toLowerCase()} and ${sn.toLowerCase()} sensory. Labs differ, so use your own.</caption>
  <tr><td>Distal motor latency (${nv.motor.muscle})</td><td>≤ ${n.dml} ms</td></tr>
  <tr><td>CMAP amplitude</td><td>≥ ${n.amp} mV</td></tr>
  <tr><td>Motor conduction velocity</td><td>≥ ${n.cv} m/s</td></tr>
  <tr><td>SNAP amplitude (${nv.sensory.rec})</td><td>≥ ${n.samp} µV</td></tr>
  <tr><td>Sensory peak latency, 14 cm</td><td>≤ ${n.slat} ms</td></tr>
  <tr><td>Sensory conduction velocity</td><td>≥ ${n.scv} m/s</td></tr>`;
  ['#norms1','#norms3'].forEach(s=>$(s).innerHTML=html);
}

/* ═══════════ chapter 1: summation ═══════════ */
let SR1=null;   // stimulus–response curve cache
function draw1(){
  const nv=NV(),site=sitesOf('motor')[S.c1.site],D=freshD(),P=pop(S.nerve,'motor');
  const R=respond(P,S.nerve,'motor',site,D,S.c1.mA);
  const sweep=pickSweep([{R}],'motor'), gain=pickGain('motor',3.2);
  $('#c1what').innerHTML=`${nv.name} motor <span>recording ${nv.motor.muscle}, stimulating at the ${site.name.toLowerCase()}</span>`;
  $('#c1set').textContent=`${gain} mV/div, ${sweep} ms/div`;
  const sc=drawScope($('#c1scope'),[{R,label:site.name,sub:site.x/10+' cm'}],{kind:'motor',crowd:S.c1.crowd,sweep,gain});
  // raster: arrival time vs velocity rank
  {const {ctx,w,h}=fit($('#c1raster'));const n=P.length,y=r=>6+(1-r)*(h-14);
    for(let i=0;i<=10;i++){const X=Math.round(sc.tx(i*sweep))+.5;line(ctx,X,0,X,h,COL.grid);}
    text(ctx,'fast',8,12,{c:COL.ink3});text(ctx,'slow',8,h-4,{c:COL.ink3});
    const Dn=freshD();
    R.parts.forEach(p=>{const t=p.t??arrival(p.u,nv,'motor',site.x,Dn,null);const X=sc.tx(t),Y=y(p.u.r);
      ctx.beginPath();ctx.arc(X,Y,2.3,0,7);
      if(p.stim){ctx.fillStyle=spec(p.u.r);ctx.fill();}else{ctx.strokeStyle=alpha(COL.ink3,.6);ctx.lineWidth=1;ctx.stroke();}});
    if(!R.nr)line(ctx,sc.tx(R.onset),0,sc.tx(R.onset),h,COL.ink,1,[3,3]);
  }
  // stimulus–response curve
  if(!SR1||SR1.key!==S.nerve+S.c1.site){SR1={key:S.nerve+S.c1.site,pts:[]};
    for(let mA=0;mA<=45;mA+=.5)SR1.pts.push([mA,respond(P,S.nerve,'motor',site,D,mA).amp]);}
  {const {ctx,w,h}=fit($('#c1sr'));const x0=34,x1=w-8,y0=h-20,y1=8,mx=Math.max(...SR1.pts.map(p=>p[1]))*1.12;
    const sx=v=>x0+v/45*(x1-x0),sy=v=>y0-v/mx*(y0-y1);
    for(const v of [0,10,20,30,40]){line(ctx,sx(v),y1,sx(v),y0,COL.grid);text(ctx,v,sx(v),h-6,{c:COL.ink3,al:'center'});}
    text(ctx,'mA',x1,h-6,{c:COL.ink3,al:'right'});
    const tick=mx>6?4:2;for(let v=0;v<=mx;v+=tick){line(ctx,x0,sy(v),x1,sy(v),COL.grid);text(ctx,v,x0-6,sy(v)+4,{c:COL.ink3,al:'right'});}
    const pmax=SR1.pts.at(-1)[1],sat=SR1.pts.find(p=>p[1]>=pmax*.995)[0];
    ctx.fillStyle=alpha(COL.ok,.1);ctx.fillRect(sx(sat*1.2),y1,x1-sx(sat*1.2),y0-y1);
    text(ctx,'supramaximal',x1-4,y1+12,{c:COL.ok,w:600,al:'right'});
    ctx.strokeStyle=COL.ink;ctx.lineWidth=1.6;ctx.beginPath();SR1.pts.forEach(([a,b],i)=>i?ctx.lineTo(sx(a),sy(b)):ctx.moveTo(sx(a),sy(b)));ctx.stroke();
    ctx.fillStyle=COL.ink;ctx.beginPath();ctx.arc(sx(S.c1.mA),sy(R.amp),4.5,0,7);ctx.fill();
    SR1.sat=sat;
  }
  const fired=R.parts.filter(p=>p.stim).length;
  $('#c1n').innerHTML=`${fired}<small>of ${P.length}</small>`;
  $('#c1amp').innerHTML=`${fmtAmp(R.amp,'motor')}<small>mV</small>`;
  $('#c1lat').innerHTML=R.nr?'—':`${R.onset.toFixed(2)}<small>ms</small>`;
  const st=fired===0?['No axons reached threshold',COL.ink3]:S.c1.mA>=SR1.sat*1.2?['Supramaximal',COL.ok]:fired===P.length?['Maximal',COL.ink]:['Submaximal',COL.bad];
  $('#c1state').textContent=st[0];$('#c1state').style.color=st[1];
  $('#c1mA').value=S.c1.mA;$('#c1mAo').textContent=S.c1.mA.toFixed(1)+' mA';
  $('#c1crowd').checked=S.c1.crowd;
  $('#c1sites').innerHTML=sitesOf('motor').map((s,i)=>`<button data-i="${i}" aria-pressed="${i===S.c1.site}">${s.name}</button>`).join('');
  $$('#c1sites button').forEach(b=>b.onclick=()=>{S.c1.site=+b.dataset.i;redraw();});
}
$('#c1mA').oninput=e=>{stopAnim();S.c1.mA=+e.target.value;draw1();};
$('#c1crowd').onchange=e=>{S.c1.crowd=e.target.checked;draw1();};

/* ═══════════ chapter 2: dispersion ═══════════ */
function draw2(){
  const nv=NV(),kind=S.c2.mod,D=S.c2.D,P=pop(S.nerve,kind),sites=sitesOf(kind);
  const rows=sites.map(s=>({R:respond(P,S.nerve,kind,s,D,100),label:s.name,sub:s.x/10+' cm'}));
  const sweep=pickSweep(rows,kind),gain=pickGain(kind,kind==='motor'?2.8:3);
  const sname=kind==='motor'?`${nv.name} motor <span>recording ${nv.motor.muscle}</span>`:`${nv.sensory.nerve||nv.name} sensory <span>recording ${nv.sensory.rec}, antidromic</span>`;
  $('#c2what').innerHTML=sname;$('#c2set').textContent=`${gain} ${unitOf(kind)}/div, ${sweep} ms/div`;
  drawScope($('#c2scope'),rows,{kind,crowd:S.c2.crowd,sweep,gain});
  const a=rows[0].R,b=rows.at(-1).R;
  if(rows.length>1&&!a.nr&&!b.nr){
    const drop=100*(b.amp/a.amp-1),dd=100*(b.dur/a.dur-1);
    $('#c2drop').innerHTML=`${drop>0?'+':'−'}${Math.abs(drop).toFixed(0)}<small>%</small>`;
    $('#c2dur').innerHTML=`${dd>=0?'+':'−'}${Math.abs(dd).toFixed(0)}<small>%</small>`;
    $('#c2dur').classList.toggle('bad',dd>30&&kind==='motor');
  }else{$('#c2drop').textContent='—';$('#c2dur').textContent='—';}
  // amplitude vs distance, CMAP and SNAP
  {const {ctx,w,h}=fit($('#c2dist'));const x0=34,x1=w-8,y0=h-20,y1=8,X=[60,650];
    const sx=v=>x0+(v-X[0])/(X[1]-X[0])*(x1-x0),sy=v=>y0-v/110*(y0-y1);
    for(const v of [0,25,50,75,100]){line(ctx,x0,sy(v),x1,sy(v),COL.grid);text(ctx,v,x0-6,sy(v)+4,{c:COL.ink3,al:'right'});}
    for(const v of [100,200,300,400,500,600]){line(ctx,sx(v),y1,sx(v),y0,COL.grid);text(ctx,v/10,sx(v),h-6,{c:COL.ink3,al:'center'});}
    for(const [k,c] of [['motor',COL.ink],['sensory',COL.mid1]]){
      const Pk=pop(S.nerve,k),pts=[];let a0=null;
      for(let x=X[0];x<=X[1];x+=30){const r=respond(Pk,S.nerve,k,{x,depth:1},D,100);if(a0==null)a0=r.amp||1;pts.push([x,100*r.amp/a0]);}
      ctx.strokeStyle=c;ctx.lineWidth=k===kind?2.2:1.3;ctx.beginPath();pts.forEach(([x,v],i)=>i?ctx.lineTo(sx(x),sy(v)):ctx.moveTo(sx(x),sy(v)));ctx.stroke();
    }
    sites.forEach(s=>{ctx.fillStyle=kind==='motor'?COL.ink:COL.mid1;ctx.beginPath();ctx.arc(sx(s.x),y0,3.5,0,7);ctx.fill();});
  }
  // two units, offset in time
  {const {ctx,w,h}=fit($('#c2two'));const dt=S.c2.dt[kind],shape=kind==='motor'?motorShape:sensoryShape;
    const T=kind==='motor'?22:4.5,x0=8,x1=w-8,base=h*.58,sc=h*.22,sx=t=>x0+t/T*(x1-x0),t0=kind==='motor'?1:.4;
    for(let i=0;i<=10;i++)line(ctx,sx(i*T/10),6,sx(i*T/10),h-6,COL.grid);
    line(ctx,x0,base,x1,base,COL.grid2);
    const tr=(fn,c,lw)=>{ctx.strokeStyle=c;ctx.lineWidth=lw;ctx.beginPath();for(let i=0;i<=300;i++){const t=i/300*T;const v=fn(t);i?ctx.lineTo(sx(t),base-v*sc):ctx.moveTo(sx(t),base-v*sc);}ctx.stroke();};
    const u1=t=>shape(t-t0),u2=t=>shape(t-t0-dt);
    tr(u1,spec(.95),1.5);tr(u2,spec(.1),1.5);tr(t=>u1(t)+u2(t),COL.ink,2.2);
    let mx=0;for(let i=0;i<=600;i++){const t=i/600*T;mx=Math.max(mx,u1(t)+u2(t));}
    let one=0;for(let i=0;i<=600;i++)one=Math.max(one,u1(i/600*T));
    $('#c2pair').textContent=`sum = ${(mx/one).toFixed(2)}× one unit`;
    text(ctx,`${dt.toFixed(2)} ms apart`,x1,18,{c:COL.ink2,w:600,al:'right'});
  }
  $$('#c2mod button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===kind));
  $('#c2spread').value=D.spread;$('#c2spreado').textContent=D.spread.toFixed(2)+'×';
  const dtIn=$('#c2dt');dtIn.max=kind==='motor'?8:2;dtIn.step=kind==='motor'?.05:.01;dtIn.value=S.c2.dt[kind];
  $('#c2dto').textContent=S.c2.dt[kind].toFixed(2)+' ms';
  $('#c2crowd').checked=S.c2.crowd;
}
$$('#c2mod button').forEach(b=>b.onclick=()=>{S.c2.mod=b.dataset.v;draw2();});
$('#c2spread').oninput=e=>{S.c2.D.spread=+e.target.value;draw2();};
$('#c2dt').oninput=e=>{S.c2.dt[S.c2.mod]=+e.target.value;draw2();};
$('#c2crowd').onchange=e=>{S.c2.crowd=e.target.checked;draw2();};

/* ═══════════ chapter 3: lesions ═══════════ */
const PRESETS3={
  normal:{name:'Normal',set(D){}},
  axonal:{name:'Axon loss',set(D){D.loss=.7;}},
  length:{name:'Length-dependent',set(D,nk){D.loss={median:.3,ulnar:.35,fibular:.72}[nk];D.lossS={median:.5,ulnar:.55,fibular:.97}[nk];}},
  cmt:{name:'CMT1A',set(D){D.demy=.6;D.loss=.25;D.lossS=.7;}},
  cidp:{name:'CIDP',set(D){D.demy=.5;D.patch=.75;D.dblock=.6;D.loss=.15;}},
  aidp:{name:'GBS (AIDP)',set(D){D.demy=.38;D.patch=.85;D.dblock=.85;D.focal={on:true,where:'entrap',slow:.55,block:.1,motorOnly:false};}},
  mmn:{name:'MMN',set(D){D.focal={on:true,where:'mid',slow:.1,block:.7,motorOnly:true};}},
  entrap:{name:'Entrapment',set(D){D.focal={on:true,where:'entrap',slow:.8,block:.1,motorOnly:false};}},
};
function applyPreset3(k){const D=freshD();D.temp=S.c3.D.temp;PRESETS3[k].set(D,S.nerve);S.c3.D=D;S.c3.preset=k;}
$('#c3presets').innerHTML=Object.entries(PRESETS3).map(([k,p])=>`<button data-v="${k}">${p.name}</button>`).join('');
$$('#c3presets button').forEach(b=>b.onclick=()=>{applyPreset3(b.dataset.v);draw3();});

function draw3(){
  const nv=NV(),D=S.c3.D,Pm=pop(S.nerve,'motor'),Ps=pop(S.nerve,'sensory'),n=nv.norm;
  const ms=sitesOf('motor'),ss=sitesOf('sensory');
  const rows=ms.map(s=>({R:respond(Pm,S.nerve,'motor',s,D,100),label:s.name,sub:s.x/10+' cm'}));
  const sens=respond(Ps,S.nerve,'sensory',ss[0],D,100);
  const sweep=pickSweep(rows,'motor'),gain=pickGain('motor',2.6);
  $('#c3what').innerHTML=`${nv.name} motor <span>recording ${nv.motor.muscle}, ${D.temp.toFixed(1)} °C</span>`;
  $('#c3set').textContent=`${gain} mV/div, ${sweep} ms/div`;
  drawScope($('#c3scope'),rows,{kind:'motor',crowd:S.c3.crowd,sweep,gain});

  // results table
  const R0=rows[0].R,segs=[];
  for(let i=1;i<rows.length;i++){const a=rows[i-1].R,b=rows[i].R;
    segs.push({name:`${rows[i-1].label} to ${rows[i].label.toLowerCase()}`,cv:segCv(a,b),
      drop:a.nr||b.nr?null:100*(1-b.amp/a.amp),dur:a.nr||b.nr?null:100*(b.dur/a.dur-1)});}
  const bad=c=>c?' class="bad"':'';
  let html=`<tr><th>Motor</th><th>Latency</th><th>Amp</th><th>Duration</th><th>CV</th><th>Amp drop</th><th>Dur change</th></tr>`;
  rows.forEach(({R,label},i)=>{
    html+=`<tr><td>${label}</td><td${bad(i===0&&!R.nr&&R.onset>n.dml)}>${R.nr?'NR':R.onset.toFixed(1)+' ms'}</td><td${bad(i===0&&R.amp<n.amp)}>${R.nr?'NR':fmtAmp(R.amp,'motor')+' mV'}</td><td>${R.nr?'—':R.dur.toFixed(1)+' ms'}</td><td></td><td></td><td></td></tr>`;
    if(i<rows.length-1){const s=segs[i];
      html+=`<tr class="sub"><td>&nbsp;&nbsp;${s.name}</td><td></td><td></td><td></td><td${bad(s.cv!=null&&s.cv<n.cv)}>${s.cv==null?'—':s.cv.toFixed(0)+' m/s'}</td><td${bad(s.drop!=null&&s.drop>=30)}>${s.drop==null?'—':Math.max(0,s.drop).toFixed(0)+'%'}</td><td${bad(s.dur!=null&&s.dur>30)}>${s.dur==null?'—':(s.dur>=0?'+':'−')+Math.abs(s.dur).toFixed(0)+'%'}</td></tr>`;}
  });
  const scv=sens.nr?null:ss[0].x/sens.onset;
  html+=`<tr><th>Sensory</th><th>Peak lat</th><th>Amp</th><th></th><th>CV</th><th></th><th></th></tr>
    <tr><td>${nv.sensory.nerve||nv.name}, ${nv.sensory.rec}</td><td${bad(!sens.nr&&sens.peakLat>n.slat)}>${sens.nr?'NR':sens.peakLat.toFixed(1)+' ms'}</td><td${bad(sens.amp<n.samp)}>${sens.nr?'NR':sens.amp.toFixed(0)+' µV'}</td><td></td><td${bad(scv!=null&&scv<n.scv)}>${scv==null?'—':scv.toFixed(0)+' m/s'}</td><td></td><td></td></tr>`;
  $('#c3table').innerHTML=html;
  $('#c3verdict').innerHTML=verdict(rows,segs,sens,scv,n);

  // velocity of every axon across the first segment
  {const {ctx,w,h}=fit($('#c3swarm'));const x0=10,x1=w-10,V=[0,75],sx=v=>x0+(v-V[0])/(V[1]-V[0])*(x1-x0),yb=h-18;
    for(let v=0;v<=75;v+=10){line(ctx,sx(v),4,sx(v),yb,COL.grid);text(ctx,v,sx(v),h-4,{c:COL.ink3,al:'center'});}
    text(ctx,'m/s',x1,h-4,{c:COL.ink3,al:'right'});
    const pa=rows[0].R.parts,pb=rows[1]?.R.parts;const cols={};const dots=[];
    if(pb){const d=ms[1].x-ms[0].x,Dn=freshD();Dn.temp=D.temp;
      pa.forEach((p,i)=>{const q=pb[i];let v,st;
        if(p.dead){st='dead';}else if(p.t==null||q.t==null){st='block';}else{v=d/(q.t-p.t);st='ok';}
        if(v==null){const ta=arrival(p.u,nv,'motor',ms[0].x,Dn,null),tb=arrival(p.u,nv,'motor',ms[1].x,Dn,null);v=d/(tb-ta);}
        dots.push({v,st,r:p.u.r});});}
    dots.sort((a,b)=>(a.st==='ok')-(b.st==='ok'));
    const rad=2.3,gap=4.4;
    dots.forEach(d=>{const X=sx(clamp(d.v,V[0],V[1])),bin=Math.round(X/gap);cols[bin]=(cols[bin]||0)+1;const Y=yb-3-(cols[bin]-1)*gap;
      ctx.beginPath();ctx.arc(bin*gap,Y,rad,0,7);
      if(d.st==='ok'){ctx.fillStyle=spec(d.r);ctx.fill();}
      else if(d.st==='dead'){ctx.fillStyle=COL.grid2;ctx.fill();}
      else{ctx.strokeStyle=COL.bad;ctx.lineWidth=1.2;ctx.stroke();}});
    const lln=n.cv;line(ctx,sx(lln),4,sx(lln),yb,COL.ink,1.2);text(ctx,'lower limit '+lln,sx(lln)+4,14,{c:COL.ink,w:600});
    line(ctx,sx(lln*.7),4,sx(lln*.7),yb,COL.bad,1.2,[4,3]);text(ctx,'70%',sx(lln*.7)-4,14,{c:COL.bad,w:600,al:'right'});
    const cv=segs[0]?.cv;
    if(cv!=null){ctx.fillStyle=COL.ink;const X=sx(clamp(cv,0,75));ctx.beginPath();ctx.moveTo(X,yb+1);ctx.lineTo(X-5,yb+9);ctx.lineTo(X+5,yb+9);ctx.fill();}
    $('#c3cvcap').textContent=cv!=null?`measured ${cv.toFixed(0)} m/s (▲), set by the fastest survivors`:'';
  }
  // controls
  $$('#c3presets button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===S.c3.preset));
  const setR=(id,v,txt)=>{$('#'+id).value=v;$('#'+id+'o').textContent=txt;};
  setR('c3loss',D.loss,Math.round(D.loss*100)+'%');
  setR('c3demy',D.demy,Math.round(D.demy*100)+'%');
  setR('c3patch',D.patch,Math.round(D.patch*100)+'%');
  setR('c3dblock',D.dblock,Math.round(D.dblock*100)+'%');
  setR('c3temp',D.temp,D.temp.toFixed(1)+' °C');
  setR('c3fslow',D.focal.slow,Math.round(D.focal.slow*100)+'%');
  setR('c3fblock',D.focal.block,Math.round(D.focal.block*100)+'%');
  $('#c3largest').checked=D.lossMode==='largest';
  $('#c3motoronly').checked=!!D.focal.motorOnly;
  const fw=D.focal.on?D.focal.where:'none';
  $$('#c3focal button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===fw));
  $$('#c3focal button[data-v="entrap"]').forEach(b=>b.textContent=nv.entrap.name[0].toUpperCase()+nv.entrap.name.slice(1));
  $('#c3focalCtl').style.opacity=D.focal.on?1:.45;
  $('#c3crowd').checked=S.c3.crowd;
}
function verdict(rows,segs,sens,scv,n){
  const R0=rows[0].R,out=[];
  const snap=sens.nr?'SNAP absent':sens.amp<n.samp?'SNAP low':'SNAP normal';
  if(R0.nr)return `<b>No motor response.</b> <span>Severe axon loss, or block distal to the wrist stimulus. ${snap}.</span>`;
  const cvs=segs.map(s=>s.cv).filter(v=>v!=null),cvMin=cvs.length?Math.min(...cvs):null;
  const lowAmp=R0.amp<n.amp, demyCv=cvMin!=null&&cvMin<.7*n.cv, demyDml=R0.onset>1.5*n.dml;
  const block=segs.find(s=>s.drop!=null&&s.drop>=50&&s.dur<=30), pblock=segs.find(s=>s.drop!=null&&s.drop>=30&&s.drop<50);
  const disp=segs.find(s=>s.dur!=null&&s.dur>30);
  const slowSeg=segs.find(s=>s.cv!=null&&s.cv<n.cv&&s.cv>=.7*n.cv);
  const badSegs=segs.filter(s=>(s.cv!=null&&s.cv<n.cv)||(s.drop!=null&&s.drop>=30));
  const focal=badSegs.length===1&&segs.indexOf(badSegs[0])>0&&!lowAmp&&R0.onset<=n.dml;
  let head;
  if(focal)head=`Focal lesion, ${badSegs[0].name.toLowerCase()}`;
  else if(block)head='Conduction block';
  else if(demyCv||demyDml)head='Demyelinating range';
  else if(pblock)head='Possible conduction block';
  else if(disp)head='Temporal dispersion';
  else if(lowAmp&&R0.onset<=n.dml*1.25)head=slowSeg?'Axonal pattern, with slowing from lost fast fibres':'Axonal pattern';
  else if(R0.onset>n.dml&&!lowAmp&&(cvMin==null||cvMin>=n.cv))head='Focal slowing, distal';
  else if(lowAmp||slowSeg||R0.onset>n.dml)head='Mixed or indeterminate';
  else head='Normal study';
  if(lowAmp)out.push(`low distal CMAP (${fmtAmp(R0.amp,'motor')} mV)`);
  if(R0.onset>n.dml)out.push(`distal latency ${R0.onset.toFixed(1)} ms${demyDml?', over 150% of the upper limit':''}`);
  if(cvMin!=null&&cvMin<n.cv)out.push(`slowest segment ${cvMin.toFixed(0)} m/s${demyCv?', under 70% of the lower limit':''}`);
  if(block)out.push(`${block.drop.toFixed(0)}% amplitude drop ${block.name.toLowerCase()} with little widening`);
  else if(pblock)out.push(`${pblock.drop.toFixed(0)}% drop ${pblock.name.toLowerCase()}`);
  if(disp)out.push(`duration +${disp.dur.toFixed(0)}% ${disp.name.toLowerCase()}`);
  out.push(snap);
  return `<b>${head}.</b> <span>${out.join('; ')}.</span>`;
}
function bind3(id,fn){$('#'+id).addEventListener('input',e=>{fn(+e.target.value,e.target);S.c3.preset='custom';draw3();});}
bind3('c3loss',v=>{S.c3.D.loss=v;delete S.c3.D.lossS;});
bind3('c3demy',v=>S.c3.D.demy=v);
bind3('c3patch',v=>S.c3.D.patch=v);
bind3('c3dblock',v=>S.c3.D.dblock=v);
bind3('c3temp',v=>S.c3.D.temp=v);
bind3('c3fslow',v=>{S.c3.D.focal.slow=v;if(!S.c3.D.focal.on){S.c3.D.focal.on=true;S.c3.D.focal.where='entrap';}});
bind3('c3fblock',v=>{S.c3.D.focal.block=v;if(!S.c3.D.focal.on){S.c3.D.focal.on=true;S.c3.D.focal.where='entrap';}});
$('#c3largest').onchange=e=>{S.c3.D.lossMode=e.target.checked?'largest':'random';S.c3.preset='custom';draw3();};
$('#c3motoronly').onchange=e=>{S.c3.D.focal.motorOnly=e.target.checked;S.c3.preset='custom';draw3();};
$('#c3crowd').onchange=e=>{S.c3.crowd=e.target.checked;draw3();};
$$('#c3focal button').forEach(b=>b.onclick=()=>{const v=b.dataset.v,F=S.c3.D.focal;
  if(v==='none')F.on=false;else{F.on=true;F.where=v;if(!F.slow&&!F.block)F.slow=.6;}S.c3.preset='custom';draw3();});

/* ═══════════ chapter 5: junction ═══════════ */
const C5={preset:'normal',tEx:Infinity,train:null,shown:0,log:[],busy:false,timer:null,nmj:{}};
function nmjOf(){const k=S.nerve;return C5.nmj[k]||(C5.nmj[k]=makeNmj(pop(k,'motor')));}
function rnsCmaps(train){
  const P=pop(S.nerve,'motor'),site=sitesOf('motor')[0],base=respond(P,S.nerve,'motor',site,freshD(),100);
  return train.map(st=>{const sig=new Float32Array(base.sig.length);
    base.parts.forEach((p,i)=>{if(!st.fired[i].fire)return;const i0=Math.floor(p.t/base.dt),i1=Math.min(sig.length,Math.ceil((p.t+base.udur)/base.dt));
      for(let j=i0;j<i1;j++)sig[j]+=p.a*base.shape(j*base.dt-p.t);});
    let mx=0;for(const v of sig)mx=Math.max(mx,v);return{sig,amp:mx,dt:base.dt};});
}
function runTrain(label,animate=true){
  clearTimeout(C5.timer);
  const st=nmjState();st.tSinceEx=C5.tEx;
  const train=rnsTrain(pop(S.nerve,'motor'),nmjOf(),C5.preset,st,{rng:mulberry32(Math.floor(Math.random()*1e9))});
  const cm=rnsCmaps(train);train.forEach((t,i)=>t.cmap=cm[i]);
  C5.train=train;
  const a=train.map(t=>t.cmap.amp),dec=100*(1-Math.min(...a.slice(1,5))/a[0]);
  const rest=C5.log.find(l=>l.rest);
  C5.log.push({label,a1:a[0],dec,rest:!isFinite(C5.tEx),vsRest:rest?100*(a[0]/rest.a1-1):null});
  if(animate&&!REDUCED){C5.shown=0;C5.busy=true;const tick=()=>{C5.shown++;draw5();if(C5.shown<10)C5.timer=setTimeout(tick,333);else{C5.busy=false;draw5();}};tick();}
  else{C5.shown=10;C5.busy=false;draw5();}
}
function exLabel(){if(!isFinite(C5.tEx))return 'At rest';if(C5.tEx===0)return 'Right after exercise';return `${C5.tEx/60} min after exercise`;}
function exercise(){clearTimeout(C5.timer);
  if(!C5.log.some(l=>l.rest)){C5.tEx=Infinity;runTrain('At rest',false);}
  C5.tEx=0;C5.busy=true;C5.exercising=true;draw5();
  C5.timer=setTimeout(()=>{C5.exercising=false;runTrain(exLabel());},REDUCED?0:1100);}
function wait1(){if(!isFinite(C5.tEx))return;C5.tEx+=60;runTrain(exLabel());}
function reset5(){clearTimeout(C5.timer);C5.tEx=Infinity;C5.train=null;C5.shown=0;C5.log=[];C5.busy=false;C5.exercising=false;draw5();}
function setPreset5(k){C5.preset=k;reset5();}
$('#c5presets').innerHTML=Object.entries(NMJ_PRESETS).map(([k,p])=>`<button data-v="${k}">${p.name}</button>`).join('');
$$('#c5presets button').forEach(b=>b.onclick=()=>setPreset5(b.dataset.v));
$('#c5run').onclick=()=>runTrain(exLabel());
$('#c5ex').onclick=exercise;$('#c5wait').onclick=wait1;$('#c5reset').onclick=reset5;

function draw5(){
  const nv=NV(),T=C5.train,shown=T?C5.shown:0,gain=pickGain('motor',2.4);
  $('#c5what').innerHTML=`${nv.name} motor, 3 Hz <span>recording ${nv.motor.muscle}, junction: ${NMJ_PRESETS[C5.preset].name}</span>`;
  $('#c5set').textContent=`${gain} mV/div, 10 responses`;
  // train view: ten slots side by side
  {const {ctx,w,h}=fit($('#c5scope'));const x0=6,x1=w-6,slot=(x1-x0)/10,base=h*.66,pxPer=(h*.2)/gain,T0=15;
    line(ctx,x0,base,x1,base,COL.grid2);
    for(let s=0;s<10;s++){const sx=x0+s*slot;line(ctx,sx,8,sx,h-18,COL.grid);text(ctx,s+1,sx+slot/2,h-4,{c:COL.ink3,al:'center'});
      if(!T||s>=shown)continue;const c=T[s].cmap;
      ctx.strokeStyle=s===shown-1&&C5.busy?COL.mid1:COL.ink;ctx.lineWidth=1.6;ctx.beginPath();
      for(let i=0;i*c.dt<=T0;i++){const X=sx+4+(i*c.dt/T0)*(slot-8),Y=base-c.sig[i]*pxPer;i?ctx.lineTo(X,Y):ctx.moveTo(X,Y);}ctx.stroke();}
    if(T&&shown){const a0=T[0].cmap.amp;line(ctx,x0,base-a0*pxPer,x1,base-a0*pxPer,alpha(COL.ink3,.7),1,[3,4]);}
    if(C5.exercising){ctx.fillStyle=alpha(COL.screen,.85);ctx.fillRect(0,0,w,h);text(ctx,'Contracting for 10 seconds…',w/2,h/2,{c:COL.ink,w:650,px:15,al:'center'});}
    else if(!T)text(ctx,'Run a train to begin',w/2,h*.4,{c:COL.ink3,w:600,px:14,al:'center'});
  }
  // endplates: EPP / threshold, log scale
  {const {ctx,w,h}=fit($('#c5epp'));const nmj=nmjOf(),order=nmj.map((f,i)=>i).sort((a,b)=>nmj[a].sf-nmj[b].sf);
    const x0=36,x1=w-8,y0=h-8,y1=8,L=[Math.log(.15),Math.log(12)],sy=v=>y0-(Math.log(clamp(v,.15,12))-L[0])/(L[1]-L[0])*(y0-y1);
    for(const v of [.25,.5,1,2,4,8]){line(ctx,x0,sy(v),x1,sy(v),v===1?COL.ink:COL.grid,v===1?1.4:1);text(ctx,v+'×',x0-6,sy(v)+4,{c:v===1?COL.ink:COL.ink3,w:v===1?700:500,al:'right'});}
    text(ctx,'fires above this line',x1,sy(1)-5,{c:COL.ink,w:600,al:'right'});
    const P=pop(S.nerve,'motor');
    let st=T?T[Math.max(0,shown-1)]:null;
    if(!st){const pre=rnsTrain(P,nmj,C5.preset,{tSinceEx:C5.tEx},{n:1,rng:mulberry32(5)});st=pre[0];}
    const first=T?T[0]:null;
    order.forEach((i,k)=>{const X=x0+(k+.5)/order.length*(x1-x0);
      if(first&&shown>1){ctx.fillStyle=alpha(COL.ink3,.25);ctx.fillRect(X-1,sy(first.fired[i].epp)-1,2,2);}
      const f=st.fired[i];ctx.beginPath();ctx.arc(X,sy(f.epp),2.2,0,7);
      if(f.fire){ctx.fillStyle=spec(P[i].r);ctx.fill();}else{ctx.strokeStyle=COL.bad;ctx.lineWidth=1.1;ctx.stroke();}});
    text(ctx,'weakest endplate',x0+2,h-12,{c:COL.ink3,px:10});text(ctx,'strongest',x1,h-12,{c:COL.ink3,px:10,al:'right'});
  }
  // bars
  {const {ctx,w,h}=fit($('#c5bars'));const x0=34,x1=w-6,y0=h-18,y1=8,sy=v=>y0-v/120*(y0-y1),bw=(x1-x0)/10;
    for(const v of [0,50]){line(ctx,x0,sy(v),x1,sy(v),COL.grid);text(ctx,v,x0-6,sy(v)+4,{c:COL.ink3,al:'right'});}
    line(ctx,x0,sy(90),x1,sy(90),COL.bad,1,[4,3]);text(ctx,'−10%',x0-6,sy(90)+4,{c:COL.bad,w:600,al:'right'});
    if(T){const a0=T[0].cmap.amp;for(let s=0;s<Math.min(shown,10);s++){const v=100*T[s].cmap.amp/(a0||1);
      ctx.fillStyle=s>=1&&s<=4&&v<90?COL.bad:COL.ink;ctx.fillRect(x0+s*bw+bw*.18,sy(v),bw*.64,y0-sy(v));}}
    for(let s=0;s<10;s++)text(ctx,s+1,x0+s*bw+bw/2,h-4,{c:COL.ink3,al:'center'});
  }
  const done=T&&shown>=10,L=C5.log.at(-1);
  $('#c5a1').innerHTML=T&&shown?`${fmtAmp(T[0].cmap.amp,'motor')}<small>mV</small>`:'—';
  $('#c5dec').innerHTML=done?`${Math.max(0,L.dec).toFixed(0)}<small>%</small>`:'—';
  $('#c5dec').classList.toggle('bad',!!(done&&L.dec>10));
  $('#c5inc').innerHTML=done&&L.vsRest!=null&&!L.rest?`${L.vsRest>=0?'+':'−'}${Math.abs(L.vsRest).toFixed(0)}<small>%</small>`:'—';
  $('#c5pool').innerHTML=T&&shown?`${Math.round(T[shown-1].pool*100)}<small>%</small>`:'100<small>%</small>';
  $('#c5clock').innerHTML=isFinite(C5.tEx)?`${C5.tEx}<small>s</small>`:'—';
  $('#c5logwrap').hidden=!C5.log.length;
  $('#c5log').innerHTML=`<tr><th>When</th><th>First response</th><th>Decrement</th><th>vs rest</th></tr>`+
    C5.log.map((l,i)=>{const live=i===C5.log.length-1&&!done;return `<tr><td>${l.label}</td><td>${fmtAmp(l.a1,'motor')} mV</td><td${!live&&l.dec>10?' class="bad"':''}>${live?'…':Math.max(0,l.dec).toFixed(0)+'%'}</td><td>${l.rest||l.vsRest==null?'—':(l.vsRest>=0?'+':'−')+Math.abs(l.vsRest).toFixed(0)+'%'}</td></tr>`;}).join('');
  $$('#c5presets button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===C5.preset));
  $('#c5run').disabled=C5.busy;$('#c5ex').disabled=C5.busy;$('#c5wait').disabled=C5.busy||!isFinite(C5.tEx);
}

/* ═══════════ chapter 6: needle at rest ═══════════ */
const C6={pat:'fib',gain:50,buf:null,t0:performance.now()/1000,overlays:[],ac:null,src:null,vol:null,sound:false,volume:.6,
  mystery:null,guessed:new Set(),seed:11};
const GAIN_STEPS=[20,50,100,200,500,1000];
function elapsed(){return performance.now()/1000-C6.t0;}
function setPattern(k,{keepMystery=false}={}){
  C6.pat=k;C6.gain=PATTERNS[k].gain;C6.seed++;C6.buf=makePattern(k,C6.seed);C6.t0=performance.now()/1000;C6.overlays=[];
  const last={},first={};C6.buf.events.forEach(e=>{if(last[e.id]!=null)e.isi=e.t-last[e.id];else first[e.id]=e;last[e.id]=e.t;});
  for(const id in first){const gap=first[id].t+NLOOP-last[id];if(gap<2)first[id].isi=gap;}   // the loop wraps seamlessly
  if(!keepMystery){C6.mystery=null;C6.guessed.clear();}
  if(C6.sound)startAudio();
  render6Controls();
}
function ensureAC(){if(!C6.ac){const AC=window.AudioContext||window.webkitAudioContext;C6.ac=new AC();C6.vol=C6.ac.createGain();C6.vol.connect(C6.ac.destination);}
  C6.vol.gain.value=C6.volume*C6.volume*1.6;if(C6.ac.state==='suspended')C6.ac.resume();}
const toAudio=d=>{const o=new Float32Array(d.length);for(let i=0;i<d.length;i++)o[i]=Math.tanh(d[i]/320);return o;};
function startAudio(){
  ensureAC();stopSource();
  const b=C6.ac.createBuffer(1,C6.buf.data.length,NSR);b.copyToChannel(toAudio(C6.buf.data),0);
  const s=C6.ac.createBufferSource();s.buffer=b;s.loop=true;s.connect(C6.vol);
  s.start(C6.ac.currentTime+.03,(elapsed()+.03+(C6.ac.baseLatency||0))%NLOOP);C6.src=s;
}
function stopSource(){if(C6.src){try{C6.src.stop();}catch(e){}C6.src.disconnect();C6.src=null;}}
function setSound(on){C6.sound=on;if(on)startAudio();else stopSource();$('#c6sound').setAttribute('aria-pressed',on);}
function moveNeedle(){
  const kind=PATTERNS[C6.pat].insert,data=insertionBurst(kind,Math.random()*1e9),t=elapsed()+.03;
  C6.overlays.push({t,data});C6.overlays=C6.overlays.filter(o=>o.t+o.data.length/NSR>elapsed()-3);
  if(C6.sound){ensureAC();const b=C6.ac.createBuffer(1,data.length,NSR);b.copyToChannel(toAudio(data),0);
    const s=C6.ac.createBufferSource();s.buffer=b;s.connect(C6.vol);s.start(C6.ac.currentTime+.03);}
}
function sampleAt(t){const d=C6.buf.data;let v=d[Math.floor(((t%NLOOP)+NLOOP)%NLOOP*NSR)%d.length];
  for(const o of C6.overlays){const i=Math.floor((t-o.t)*NSR);if(i>=0&&i<o.data.length)v+=o.data[i];}return v;}

function traceMinMax(ctx,t0,t1,xA,xB,base,pxPer,col,lw=1.3){
  const n=Math.max(1,Math.round(xB-xA)),per=(t1-t0)/n,sub=Math.max(1,Math.ceil(per*NSR));
  ctx.strokeStyle=col;ctx.lineWidth=lw;ctx.beginPath();
  for(let i=0;i<n;i++){let mn=Infinity,mx=-Infinity;const ts=t0+i*per;
    for(let j=0;j<sub;j++){const v=sampleAt(ts+j/NSR);if(v<mn)mn=v;if(v>mx)mx=v;}
    const X=xA+i;if(i===0)ctx.moveTo(X,base-mx*pxPer);ctx.lineTo(X,base-mx*pxPer);ctx.lineTo(X,base-mn*pxPer);}
  ctx.stroke();
}
function draw6(){
  if(!C6.buf)return;const e=elapsed(),P=PATTERNS[C6.pat];
  $('#c6what').innerHTML=C6.mystery?'Mystery discharge <span>name it by ear</span>':`${P.name} <span>concentric needle, relaxed muscle</span>`;
  $('#c6set').textContent=`${C6.gain} µV/div, 10 ms/div`;
  // sweep with erase bar
  {const {ctx,w,h}=fit($('#c6sweep'));const x0=0,x1=w,base=h/2,div=h/8,pxPer=div/C6.gain,SW=.1;
    for(let i=0;i<=10;i++)line(ctx,x0+i*(x1-x0)/10,0,x0+i*(x1-x0)/10,h,i%5?COL.grid:COL.grid2);
    for(let i=0;i<=8;i++)line(ctx,0,i*div,w,i*div,i===4?COL.grid2:COL.grid);
    const k=Math.floor(e/SW),cs=k*SW,pos=(e-cs)/SW,xp=x0+pos*(x1-x0);
    ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();
    traceMinMax(ctx,cs-SW+pos*SW+.004,cs,xp+6,x1,base,pxPer,alpha(COL.ink,.35));
    traceMinMax(ctx,cs,e,x0,xp,base,pxPer,COL.ink,1.5);
    ctx.restore();
    ctx.fillStyle=COL.mid1;ctx.fillRect(xp,0,2,h);
  }
  // 2 s strip
  {const {ctx,w,h}=fit($('#c6strip'));const base=h/2,pxPer=(h/6)/C6.gain;
    for(let i=0;i<=10;i++)line(ctx,i*w/10,0,i*w/10,h,COL.grid);
    ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();traceMinMax(ctx,e-2,e,0,w,base,pxPer,COL.ink,1);ctx.restore();
    text(ctx,'200 ms/div',w-4,12,{c:COL.ink3,al:'right'});
  }
  // firing rate
  {const {ctx,w,h}=fit($('#c6rate'));const x0=40,x1=w-6,y0=h-16,y1=6,W=6,L=[Math.log(.3),Math.log(400)];
    const sy=f=>y0-(Math.log(clamp(f,.3,400))-L[0])/(L[1]-L[0])*(y0-y1),sx=t=>x1-(e-t)/W*(x1-x0);
    for(const f of [1,10,100]){line(ctx,x0,sy(f),x1,sy(f),COL.grid);text(ctx,f+' Hz',x0-6,sy(f)+4,{c:COL.ink3,al:'right'});}
    for(let s=0;s<=W;s++)line(ctx,sx(e-s),y1,sx(e-s),y0,COL.grid);
    text(ctx,'now',x1,h-3,{c:COL.ink3,al:'right'});text(ctx,`−${W} s`,x0,h-3,{c:COL.ink3});
    const ids=[...new Set(C6.buf.events.map(ev=>ev.id))];
    for(let Lp=Math.floor((e-W)/NLOOP);Lp<=Math.floor(e/NLOOP);Lp++)for(const ev of C6.buf.events){
      if(ev.isi==null)continue;const t=Lp*NLOOP+ev.t;if(t>e||t<e-W)continue;
      ctx.fillStyle=spec(ids.length>1?1-ids.indexOf(ev.id)/(ids.length-1)*.85:.9,.9);
      ctx.beginPath();ctx.arc(sx(t),sy(1/ev.isi),2.4,0,7);ctx.fill();}
    if(!C6.buf.events.length)text(ctx,'No discharges',(x0+x1)/2,h/2,{c:COL.ink3,w:600,px:13,al:'center'});
  }
}
function render6Controls(){
  $('#c6types').innerHTML=Object.entries(PATTERNS).map(([k,p])=>`<button data-v="${k}" aria-pressed="${!C6.mystery&&k===C6.pat}">${p.name.replace(' potentials','').replace(' discharges','')}<small>${p.short}</small></button>`).join('');
  $$('#c6types button').forEach(b=>b.onclick=()=>setPattern(b.dataset.v));
  $('#c6gain').innerHTML=GAIN_STEPS.map(g=>`<button data-v="${g}" aria-pressed="${g===C6.gain}">${g<1000?g+' µV':'1 mV'}</button>`).join('');
  $$('#c6gain button').forEach(b=>b.onclick=()=>{C6.gain=+b.dataset.v;render6Controls();});
  const P=PATTERNS[C6.pat];
  if(C6.mystery){
    const opts=Object.keys(PATTERNS).filter(k=>k!=='silent');
    $('#c6info').innerHTML=`<div class="quiz"><span class="q">What is it?</span>${opts.map(k=>`<button class="btn ${C6.guessed.has(k)?(k===C6.mystery?'right':'wrong'):''}" data-g="${k}">${PATTERNS[k].name.replace(' potentials','').replace(' discharges','')}</button>`).join('')}</div>`;
    $$('#c6info [data-g]').forEach(b=>b.onclick=()=>{C6.guessed.add(b.dataset.g);if(b.dataset.g===C6.mystery){C6.mystery=null;render6Controls();$('#c6info').insertAdjacentHTML('afterbegin',`<p class="verdict" style="margin:0 0 10px"><b>Correct.</b> <span>Press Mystery for another.</span></p>`);}else render6Controls();});
  }else{
    $('#c6info').innerHTML=`<dl class="dcard"><dt>Source</dt><dd>${P.gen}</dd><dt>Looks like</dt><dd>${P.looks}</dd><dt>Rhythm</dt><dd>${P.rhythm}</dd><dt>Sounds like</dt><dd>${P.sound}</dd><dt>Seen in</dt><dd>${P.where}</dd></dl>`;
  }
  $('#c6volo').textContent=Math.round(C6.volume*100)+'%';
}
$('#c6sound').onclick=()=>setSound(!C6.sound);
$('#c6vol').oninput=e=>{C6.volume=+e.target.value;if(C6.vol)C6.vol.gain.value=C6.volume*C6.volume*1.6;$('#c6volo').textContent=Math.round(C6.volume*100)+'%';};
$('#c6move').onclick=moveNeedle;
$('#c6mystery').onclick=()=>{const opts=Object.keys(PATTERNS).filter(k=>k!=='silent'&&k!==C6.pat);const k=opts[Math.floor(Math.random()*opts.length)];
  C6.mystery=k;C6.guessed.clear();setPattern(k,{keepMystery:true});};

/* ═══════════ actions: prose operates the machine ═══════════ */
let anim=null;
function stopAnim(){if(anim){cancelAnimationFrame(anim.id);anim=null;}}
function rampMA(from,to,ms){stopAnim();if(REDUCED){S.c1.mA=to;draw1();return;}
  const t0=performance.now();anim={};const step=now=>{const x=clamp((now-t0)/ms,0,1),e=x<.5?2*x*x:1-(-2*x+2)**2/2;
    S.c1.mA=+(from+(to-from)*e).toFixed(1);draw1();if(x<1)anim.id=requestAnimationFrame(step);else anim=null;};anim.id=requestAnimationFrame(step);}
const ACTIONS={
  'c1-one':()=>{stopAnim();const site=sitesOf('motor')[S.c1.site];const t=Math.min(...pop(S.nerve,'motor').map(u=>u.thr0*site.depth));S.c1.mA=Math.ceil(t*10)/10;S.c1.crowd=true;draw1();},
  'c1-ramp':()=>{S.c1.crowd=true;rampMA(S.c1.mA<8?S.c1.mA:0,32,5200);},
  'c1-sub':()=>{stopAnim();S.c1.mA=12;draw1();},
  'c1-crowd':()=>{S.c1.crowd=false;draw1();},
  'c1-crowdon':()=>{S.c1.crowd=true;draw1();},
  'c2-offset':()=>{S.c2.mod='motor';S.c2.dt.motor=3;draw2();},
  'c2-offset6':()=>{S.c2.mod='motor';S.c2.dt.motor=5;draw2();},
  'c2-sensory':()=>{S.c2.mod='sensory';if(S.nerve==='fibular')setNerve('median');draw2();},
  'c2-wide':()=>{S.c2.D.spread=3;draw2();},
  'c2-reset':()=>{S.c2.D.spread=1;draw2();},
  'c3-axonal':()=>{applyPreset3('axonal');draw3();},
  'c3-largest':()=>{applyPreset3('normal');S.c3.D.loss=.9;S.c3.D.lossMode='largest';S.c3.preset='custom';draw3();},
  'c3-cmt':()=>{applyPreset3('cmt');draw3();},
  'c3-cidp':()=>{applyPreset3('cidp');draw3();},
  'c3-entrap':()=>{applyPreset3('entrap');draw3();},
  'c3-mmn':()=>{applyPreset3('mmn');draw3();},
  'c3-length':()=>{applyPreset3('length');draw3();},
  'c5-train':()=>{if(C5.busy)return;runTrain(exLabel());},
  'c5-mg':()=>{setPreset5('mgMod');runTrain('At rest');},
  'c5-ex':()=>{if(C5.busy)return;exercise();},
  'c5-wait':()=>{if(C5.busy)return;if(!isFinite(C5.tEx)){exercise();return;}wait1();},
  'c5-lems':()=>{setPreset5('lems');runTrain('At rest');},
  'c5-lemsex':()=>{if(C5.preset!=='lems')setPreset5('lems');exercise();},
  'c6-sound':()=>setSound(true),
  'c6-endplate':()=>setPattern('endplate'),
  'c6-fib':()=>setPattern('fib'),
  'c6-psw':()=>setPattern('psw'),
  'c6-fasc':()=>setPattern('fasc'),
  'c6-myo':()=>setPattern('myotonic'),
  'c6-move':()=>moveNeedle(),
};
$$('.act').forEach(b=>b.addEventListener('click',()=>{
  const f=ACTIONS[b.dataset.act];if(!f)return;f();
  b.classList.remove('fired');void b.offsetWidth;b.classList.add('fired');
  const inst=b.closest('.chapter').querySelector('.inst'),r=inst.getBoundingClientRect();
  if(r.bottom<80||r.top>innerHeight-120)inst.scrollIntoView({behavior:REDUCED?'auto':'smooth',block:'start'});
}));

/* ═══════════ navigation ═══════════ */
const LIVE=[1,2,3,5,6],TITLES={1:'Summation',2:'Dispersion',3:'Lesions',5:'Junction',6:'At rest'};
function go(n){
  if(!LIVE.includes(n))n=1;
  if(S.ch===6&&n!==6)setSound(false);
  S.ch=n;
  $$('.chapter').forEach(s=>s.hidden=+s.dataset.ch!==n);
  $$('nav button').forEach(b=>b.setAttribute('aria-current',+b.dataset.go===n));
  try{history.replaceState(null,'','#ch'+n);}catch(e){}
  window.scrollTo({top:0});
  if(n===6&&!C6.buf)setPattern(C6.pat);
  redraw();if(n===6)loop6();
}
$$('nav button').forEach(b=>b.onclick=()=>go(+b.dataset.go));
addEventListener('hashchange',()=>{const n=+(location.hash.match(/ch(\d)/)||[])[1];if(n&&n!==S.ch)go(n);});
$$('.pager').forEach(p=>{const n=+p.closest('.chapter').dataset.ch,i=LIVE.indexOf(n),pv=LIVE[i-1],nx=LIVE[i+1];
  p.innerHTML=`<button ${pv?'':'disabled'} data-p="${pv||''}"><small>Previous</small>${pv?TITLES[pv]:''}</button><button ${nx?'':'disabled'} data-p="${nx||''}"><small>Next</small>${nx?TITLES[nx]:''}</button>`;
  p.querySelectorAll('button').forEach(b=>b.onclick=()=>go(+b.dataset.p));});
let raf6=null;
function loop6(){cancelAnimationFrame(raf6);const f=()=>{if(S.ch!==6)return;draw6();raf6=requestAnimationFrame(f);};raf6=requestAnimationFrame(f);}
function redraw(){({1:draw1,2:draw2,3:draw3,5:draw5,6:draw6})[S.ch]?.();}

/* ═══════════ theme + boot ═══════════ */
try{const t=localStorage.getItem('summation-theme');if(t)document.documentElement.dataset.theme=t;}catch(e){}
$('#themeBtn').onclick=()=>{const r=document.documentElement,dark=r.dataset.theme?r.dataset.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches;
  r.dataset.theme=dark?'light':'dark';try{localStorage.setItem('summation-theme',r.dataset.theme);}catch(e){}readColors();redraw();};
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{readColors();redraw();});
new ResizeObserver(()=>redraw()).observe($('main'));
new ResizeObserver(()=>document.documentElement.style.setProperty('--hdr',$('.top').offsetHeight+'px')).observe($('.top'));
readColors();renderNerveSegs();renderNorms();
const start=+(location.hash.match(/ch(\d)/)||[])[1]||1;
if(start===1&&!REDUCED){S.c1.mA=0;go(1);setTimeout(()=>rampMA(0,30,3200),400);}else go(start);
document.fonts?.ready.then(()=>redraw());
