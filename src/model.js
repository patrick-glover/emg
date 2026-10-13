/* ═══════════ Model: a nerve is a population of axons ═══════════
   Positions are mm along the nerve, measured from the recording electrode.
   Time is ms. Motor amplitudes are mV, sensory amplitudes are µV. */

/* release version: matches package.json and the git tag, so a page can show which engine it runs */
const ENGINE_VERSION='0.1.1';

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function gauss(rng){let u=0,v=0;while(!u)u=rng();while(!v)v=rng();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
const G=(t,m,s)=>Math.exp(-0.5*((t-m)/s)**2);

const NERVES={
  median:{name:'Median',limb:'arm',len:900,cv:1,
    motor:{muscle:'APB',amp:1,sites:[{k:'w',name:'Wrist',x:70,depth:1},{k:'e',name:'Elbow',x:300,depth:1.25},{k:'a',name:'Axilla',x:520,depth:1.5}]},
    sensory:{rec:'digit 2',amp:1,sites:[{k:'w',name:'Wrist',x:140,depth:1},{k:'e',name:'Elbow',x:370,depth:1.25}]},
    entrap:{name:'carpal tunnel',motor:[25,55],sensory:[95,125]},
    norm:{dml:4.4,amp:4.1,cv:49,slat:3.5,samp:20,scv:50}},
  ulnar:{name:'Ulnar',limb:'arm',len:950,cv:1.01,
    motor:{muscle:'ADM',amp:1.0,sites:[{k:'w',name:'Wrist',x:70,depth:1},{k:'be',name:'Below elbow',x:300,depth:1.2},{k:'ae',name:'Above elbow',x:400,depth:1.3},{k:'a',name:'Axilla',x:540,depth:1.5}]},
    sensory:{rec:'digit 5',amp:.85,sites:[{k:'w',name:'Wrist',x:140,depth:1},{k:'be',name:'Below elbow',x:370,depth:1.2}]},
    entrap:{name:'elbow (cubital tunnel)',motor:[330,370],sensory:[400,440]},
    norm:{dml:3.3,amp:6.0,cv:49,slat:3.1,samp:17,scv:50}},
  fibular:{name:'Fibular',limb:'leg',len:1150,cv:.84,
    motor:{muscle:'EDB',amp:.6,sites:[{k:'an',name:'Ankle',x:80,depth:1},{k:'bfh',name:'Below fib. head',x:380,depth:1.2},{k:'lp',name:'Popliteal',x:480,depth:1.4}]},
    sensory:{rec:'sural, ankle',nerve:'Sural',amp:.45,sites:[{k:'c',name:'Calf',x:140,depth:1}]},
    entrap:{name:'fibular head',motor:[395,435],sensory:null},
    norm:{dml:6.5,amp:2.0,cv:44,slat:4.4,samp:6,scv:40}},
};

/* one fixed population per nerve × modality, so sliders move the same axons */
const POP_N={motor:200,sensory:300};
const ZONE=50;
function makePop(nerveKey,kind){
  const rng=mulberry32((nerveKey.length*977+(kind==='motor'?13:71))>>>0), n=POP_N[kind], U=[];
  for(let i=0;i<n;i++){
    const r=(i+.5)/n;                              // size rank: 0 small/slow → 1 large/fast
    const cv0=kind==='motor'?33+23*Math.pow(r,.6):40+18*Math.pow(r,.7);
    const amp0=kind==='motor'?(.35+1.3*Math.pow(r,1.6)):(.6+.8*r);
    const thr0=kind==='motor'?(19-11*r)*Math.exp(.12*gauss(rng)):(14-6*r)*Math.exp(.1*gauss(rng));
    const resid=kind==='motor'?2.45+.22*gauss(rng):0;
    const zr=[],zb=[];for(let z=0;z<30;z++){zr.push(rng());zb.push(rng());}
    U.push({i,r,cv0,amp0,thr0,resid,zr,zb,uf:rng(),ub:rng(),ul:rng()});
  }
  const mean=U.reduce((s,u)=>s+u.cv0,0)/n;
  U.forEach(u=>u.cvMean=mean);
  return U;
}

/* disease / conditions state */
function freshD(){return{loss:0,lossMode:'random',demy:0,patch:0,dblock:0,spread:1,
  focal:{on:false,where:'entrap',slow:0,block:0},temp:32};}

/* focal lesion region for a nerve/modality */
function focalRegion(nv,kind,D){
  if(!D.focal.on||(D.focal.motorOnly&&kind==='sensory'))return null;
  if(D.focal.where==='entrap')return nv.entrap[kind];
  const s=nv[kind].sites; if(s.length<2)return null;     // mid-segment between first two sites
  const a=s[0].x,b=s[1].x,m=(a+b)/2;return[m-25,m+25];
}

/* velocity multiplier for unit u in zone z (diffuse demyelination) */
function demyF(u,z,D){
  if(!D.demy)return 1;
  // large, heavily myelinated fibres lose the most speed, so uniform disease
  // squeezes the velocity spread; patchiness then scatters it zone by zone
  const spread=D.patch*(u.zr[z]*2-1);
  return Math.max(.06,1-D.demy*(.55+.45*u.r)*(1+spread*.9));
}

/* baseline velocity; D.spread widens or narrows the population around its mean */
function cvOf(u,D){return u.cvMean+(u.cv0-u.cvMean)*(D.spread??1);}

/* arrival time at recording electrode for stimulus at x; null if blocked */
function arrival(u,nv,kind,x,D,region){
  const tempCv=1-.03*(32-D.temp), step=10;
  let t=u.resid*(1+.03*(32-D.temp)), pos=0;
  while(pos<x){
    const seg=Math.min(step,x-pos), mid=pos+seg/2, z=Math.min(29,Math.floor(mid/ZONE));
    let f=nv.cv*tempCv*(1+.1*Math.min(1,mid/600))*demyF(u,z,D);
    if(region&&mid>=region[0]&&mid<=region[1]){
      if(u.ub<D.focal.block)return null;
      f*=Math.max(.05,1-D.focal.slow*(.9+.2*u.uf));   // compressed segment: fairly even slowing
    }
    if(D.dblock&&u.zb[z]<D.dblock*.08)return null;          // patchy block, accumulates with length
    if(f<.1)return null;                                       // too slow to propagate
    t+=seg/(cvOf(u,D)*f);pos+=seg;
  }
  return t;
}

function isDead(u,D,kind){
  const loss=kind==='sensory'&&D.lossS!=null?D.lossS:D.loss;
  if(!loss)return false;
  const rank=D.lossMode==='largest'?1-u.r:u.ul;
  return rank<loss;
}

/* unit waveforms (display convention: negative up = positive numbers) */
function motorShape(t){return G(t,2.5,1.15)-.55*G(t,6.3,2.0);}
function sensoryShape(t){return -.28*G(t,.18,.17)+G(t,.62,.26)-.5*G(t,1.12,.36);}

const TIME={motor:{dt:.05,T:70},sensory:{dt:.02,T:30}};

/* full response for one stimulus site */
function respond(pop,nerveKey,kind,site,D,mA,opts={}){
  const nv=NERVES[nerveKey], region=focalRegion(nv,kind,D);
  const {dt,T}=TIME[kind], N=Math.round(T/dt), sig=new Float32Array(N);
  const cold=32-D.temp, tsc=1+.03*cold, asc=(1+.025*cold)*nv[kind].amp*(kind==='motor'?.062:.28);
  const shape=kind==='motor'?motorShape:sensoryShape, dur=(kind==='motor'?11:2.2)*tsc;
  const parts=[];
  for(const u of pop){
    const dead=isDead(u,D,kind);
    const zs=Math.min(29,Math.floor(site.x/ZONE));
    const thr=u.thr0*site.depth/Math.sqrt(Math.max(.15,demyF(u,zs,D)));
    const stim=mA>=thr;
    let t=null;
    if(!dead)t=arrival(u,nv,kind,site.x,D,region);
    const p={u,dead,stim,t,blocked:!dead&&t==null,a:u.amp0*asc};
    parts.push(p);
    if(dead||!stim||t==null)continue;
    const i0=Math.max(0,Math.floor(t/dt)),i1=Math.min(N,Math.ceil((t+dur)/dt));
    for(let i=i0;i<i1;i++)sig[i]+=p.a*shape((i*dt-t)/tsc);
  }
  return measure({sig,parts,dt,kind,site,shape,tsc,udur:dur});
}

function measure(R){
  const {sig,parts,dt,kind}=R, floor=kind==='motor'?.08:1.5;
  let mx=0,im=0;for(let i=0;i<sig.length;i++)if(sig[i]>mx){mx=sig[i];im=i;}
  const live=parts.filter(p=>!p.dead&&p.stim&&p.t!=null);
  R.nr=mx<floor||!live.length;
  if(R.nr){Object.assign(R,{onset:null,peakLat:null,amp:0,dur:null,area:0});return R;}
  const onset=Math.min(...live.map(p=>p.t));
  let ie=im;while(ie<sig.length-1&&sig[ie]>0)ie++;
  let area=0;for(let i=Math.floor(onset/dt);i<ie;i++)if(sig[i]>0)area+=sig[i]*dt;
  Object.assign(R,{onset,peakLat:im*dt,amp:mx,dur:ie*dt-onset,area});
  return R;
}

/* conduction velocity between two responses (m/s) */
function segCv(Rd,Rp){
  if(Rd.nr||Rp.nr)return null;
  const d=Rp.site.x-Rd.site.x, dtm=Rp.onset-Rd.onset;
  return dtm>0?d/dtm:null;
}

/* ═══════════ Neuromuscular junction ═══════════
   Each motor unit's endplate has a safety factor (EPP / threshold at rest).
   Release = p × pool. Pool refills between stimuli; mobilization speeds refill
   during a train (gives the U shape). Residual Ca after exercise raises p. */
const NMJ_PRESETS={
  normal:{name:'Normal',q:1,p0:.2},
  mgMild:{name:'Mild MG',q:.46,p0:.2},
  mgMod:{name:'Moderate MG',q:.36,p0:.2},
  lems:{name:'LEMS',q:1,p0:.045},
};
function makeNmj(pop,seed=7){
  const rng=mulberry32(seed);
  return pop.map(u=>({sf:3.6*Math.exp(.28*gauss(rng)),noise:rng}));
}
function nmjState(){return{pool:1,mob:0,tSinceEx:Infinity};}
/* post-exercise modifiers at time t (s) after a 10-s contraction */
function ptp(t){return isFinite(t)?.42*Math.exp(-t/35):0;}
function exhaustion(t){if(!isFinite(t)||t<20)return 0;const x=t/150;return .13*x*Math.exp(1-x);}

function rnsTrain(pop,nmj,preset,S,opts={}){
  const P=NMJ_PRESETS[preset], n=opts.n||10, hz=opts.hz||3, dt=1/hz, k=1.15;
  const rng=opts.rng||Math.random;
  const R=P.p0*Math.pow(1+ptp(S.tSinceEx),4);
  const p=Math.min(.85,R), ex=1-exhaustion(S.tSinceEx);
  let pool=1,mob=0;const out=[];
  for(let s=0;s<n;s++){
    const rel=p*pool*ex/.2;                         // relative to normal first release
    const fired=nmj.map(f=>{
      const epp=f.sf*P.q*rel*(1+.07*gauss(rng));
      return {epp,fire:epp>=1};
    });
    out.push({rel,pool,fired});
    pool=pool*(1-p);
    mob=mob+(1-mob)*.14;
    const c=1-Math.exp(-k*(1+1.6*mob)*dt);
    pool=pool+(1-pool)*c;
  }
  return out;
}
if(typeof module!=='undefined')module.exports={ENGINE_VERSION,cvOf,arrival,isDead,NERVES,makePop,freshD,respond,segCv,NMJ_PRESETS,makeNmj,nmjState,rnsTrain,mulberry32,motorShape,sensoryShape,ptp,exhaustion};
