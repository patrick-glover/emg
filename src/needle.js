/* ═══════════ Needle EMG: spontaneous activity ═══════════
   Each pattern is synthesised as discharge events placed on a timeline, then
   rendered to one buffer (µV). The screen draws that buffer and the speaker
   plays it, so what you hear is exactly the waveform you see.
   Display convention: negative up, so positive numbers here plot upward. */

const NSR=24000, NLOOP=8;
const Gs=(t,m,s)=>Math.exp(-0.5*((t-m)/s)**2);

const SHAPES={
  fib:t=>-.38*Gs(t,.32,.16)+Gs(t,.8,.2)-.52*Gs(t,1.45,.42),                       // initial positive, brief
  psw:t=>(t<.55?-t/.55:-Math.exp(-(t-.55)/4.2))+.1*Gs(t,15,4),                     // sharp positive, slow return
  eps:t=>Gs(t,.35,.18)-.62*Gs(t,1.0,.38),                                            // endplate spike: initial negative
  mepp:t=>Gs(t,.35,.22),                                                              // miniature endplate potential
  muap:t=>-.16*Gs(t,1.0,.45)+Gs(t,2.7,.62)-.72*Gs(t,4.4,1.0)+.16*Gs(t,6.9,1.4),
};
const SHAPE_LEN={fib:3,psw:28,eps:3,mepp:1.5,muap:10};

function crdComplex(rng,k){                                                          // a fixed chain of fibre spikes
  const parts=[];for(let i=0;i<k;i++)parts.push({o:i*1.35+rng()*.6,a:(.45+rng()*.8)*(i%2?1:-.8)});
  return t=>{let v=0;for(const p of parts)v+=p.a*SHAPES.fib(t-p.o);return v;};
}

/* each pattern returns events [{t (s), id, a (µV), f (shape fn), len (ms)}] */
const PATTERNS={
  silent:{name:'Normal at rest',short:'Silence',gain:50,
    gen:'None. A relaxed healthy muscle is silent once the needle stops moving.',
    looks:'Flat baseline with low-level amplifier noise.',rhythm:'None',sound:'Soft hiss',
    where:'Normal muscle.',insert:'normal',
    events(){return[];}},
  endplate:{name:'Endplate zone',short:'Normal',gain:50,
    gen:'Nerve terminals at the endplate: spontaneous vesicle release, and small nerve twigs irritated by the needle.',
    looks:'Endplate noise: tiny monophasic negative (upward) potentials. Endplate spikes: 3–4 ms, initial negative.',
    rhythm:'Irregular, often fast (5–50 Hz) and sputtering',sound:'A seashell hiss, with sputtering fat in a frying pan',
    where:'Normal. The needle tip is sitting at the endplate; the patient usually feels a deep ache.',insert:'normal',
    events(rng){const E=[];for(let t=0;t<NLOOP;t+=-Math.log(rng())/260)E.push({t,id:-1,a:8+14*rng(),f:SHAPES.mepp,len:1.5});
      let t=.1;while(t<NLOOP){const burst=.3+rng()*.8;for(let s=t;s<Math.min(NLOOP,t+burst);s+=.012+rng()*.09)E.push({t:s,id:0,a:70+110*rng(),f:SHAPES.eps,len:3});t+=burst+.1+rng()*.6;}
      return E;}},
  fib:{name:'Fibrillation potentials',short:'Denervation',gain:50,
    gen:'A single muscle fibre that has lost its nerve supply, firing on its own.',
    looks:'Brief spikes, 1–5 ms, 20–200 µV, initial positive (downward) deflection.',
    rhythm:'Regular, 0.5–15 Hz. Each fibre fires at its own steady rate.',sound:'Rain on a tin roof, or a clock ticking',
    where:'Denervation (appears 1–4 weeks after axon loss, earliest in proximal muscles); also necrotic or inflammatory myopathy.',insert:'increased',
    events(rng){const E=[];const n=4;for(let k=0;k<n;k++){const hz=[2.2,5.5,8.3,11.6][k]*(.9+.2*rng()),a=[140,70,105,50][k];
      for(let t=rng()/hz;t<NLOOP;t+=1/hz*(1+.012*(rng()-.5)))E.push({t,id:k,a,f:SHAPES.fib,len:3});}return E;}},
  psw:{name:'Positive sharp waves',short:'Denervation',gain:50,
    gen:'The same denervated fibres as fibrillations, recorded where the needle has injured the fibre so the spike cannot pass the tip.',
    looks:'A sharp positive (downward) drop, then a slow negative return lasting 10–30 ms.',
    rhythm:'Regular, 0.5–15 Hz',sound:'Dull, regular pops',
    where:'Same meaning as fibrillations: denervation or muscle fibre necrosis.',insert:'increased',
    events(rng){const E=[];for(let k=0;k<3;k++){const hz=[3.1,6.4,9.7][k]*(.9+.2*rng()),a=[120,85,60][k];
      for(let t=rng()/hz;t<NLOOP;t+=1/hz*(1+.012*(rng()-.5)))E.push({t,id:k,a,f:SHAPES.psw,len:28});}return E;}},
  fasc:{name:'Fasciculation potentials',short:'Motor unit',gain:200,
    gen:'A whole motor unit firing on its own, with the discharge starting anywhere along the lower motor neuron.',
    looks:'Motor unit potential shape (here 5–10 ms, 0.5–1.5 mV). Visible as a twitch under the skin.',
    rhythm:'Irregular and slow, well under 1 Hz on average',sound:'Occasional random thumps, like corn starting to pop',
    where:'Often benign. With fibrillations and chronic reinnervation, think motor neuron disease; also radiculopathy, cramp–fasciculation syndrome.',insert:'normal',
    events(rng){const E=[];const units=[{a:900},{a:550},{a:1300}];let t=.3;
      while(t<NLOOP){const k=Math.floor(rng()*3);E.push({t,id:k,a:units[k].a,f:SHAPES.muap,len:10});t+=.4+(-Math.log(rng()))*1.1;}return E;}},
  myotonic:{name:'Myotonic discharges',short:'Muscle membrane',gain:100,
    gen:'Single muscle fibres with an unstable membrane (chloride or sodium channel disease) that keep firing after a trigger.',
    looks:'Fibrillation or positive-wave shapes whose rate and size wax and wane.',
    rhythm:'20–80 Hz (up to 150), speeding up then slowing down over 1–3 s',sound:'A dive bomber, or a motorcycle revving',
    where:'Myotonic dystrophy types 1 and 2, myotonia congenita, paramyotonia; also Pompe disease without clinical myotonia.',insert:'myotonic',
    events(rng){const E=[];let s=.2,id=0;while(s<NLOOP-1){const D=1.6+rng()*1.2,rev=rng()<.5;
      for(let t=s;t<s+D&&t<NLOOP;){const x=(t-s)/D,env=Math.pow(Math.sin(Math.PI*(rev?.35+.65*x:x)),1.6);   // wax then wane
        const hz=16+84*env;E.push({t,id,a:40+95*env,f:SHAPES.psw,len:28});t+=1/hz;}
      s+=D+.35+rng()*.6;id++;}return E;}},
  myokymia:{name:'Myokymic discharges',short:'Nerve',gain:200,
    gen:'Motor units firing in repeated groups because of an abnormal, demyelinated or irradiated stretch of nerve.',
    looks:'Bursts of 2–10 motor unit potentials. Seen on the skin as a slow, worm-like rippling.',
    rhythm:'Groups at 20–150 Hz inside, repeating semi-rhythmically every 0.1–10 s',sound:'Soldiers marching',
    where:'Radiation plexopathy (a key clue against tumour recurrence); facial myokymia in MS or brainstem tumour; GBS.',insert:'normal',
    events(rng){const E=[];let t=.15;while(t<NLOOP){const k=3+Math.floor(rng()*4);
      for(let j=0;j<k;j++)E.push({t:t+j/(38+10*rng()),id:0,a:420+120*rng(),f:SHAPES.muap,len:10});t+=.55+.2*rng();}return E;}},
  crd:{name:'Complex repetitive discharges',short:'Chronic',gain:100,
    gen:'A ring of muscle fibres activating each other through direct (ephaptic) contact. One pacemaker fibre sets off the rest.',
    looks:'A polyphasic complex that repeats identically, time after time.',
    rhythm:'Perfectly regular, 5–100 Hz; starts and stops abruptly, may jump to a new shape',sound:'A machine: motorboat or idling engine',
    where:'Chronic disorders, neurogenic or myopathic (old radiculopathy, chronic myopathy).',insert:'normal',
    events(rng){const E=[];const c1=crdComplex(rng,6),c2=crdComplex(rng,4);
      for(let t=.4;t<3.6;t+=1/28)E.push({t,id:0,a:95,f:c1,len:12});
      for(let t=4.6;t<7.7;t+=1/33)E.push({t,id:1,a:95,f:c2,len:10});return E;}},
  nmt:{name:'Neuromyotonic discharges',short:'Nerve',gain:200,
    gen:'Hyperexcitable motor axons firing at very high rates, usually from antibodies against potassium-channel complexes.',
    looks:'Motor unit potentials in high-frequency trains whose amplitude falls through the burst.',
    rhythm:'150–250 Hz, in bursts that decay',sound:'A high-pitched ping or whine',
    where:'Isaacs syndrome (CASPR2 antibodies), Morvan syndrome; rarely other neuropathies.',insert:'normal',
    events(rng){const E=[];let s=.25;while(s<NLOOP-.5){const D=.35+rng()*.5,hz=170+70*rng();
      for(let t=s;t<s+D;t+=1/hz){const x=(t-s)/D;E.push({t,id:0,a:520*(1-.62*x),f:SHAPES.muap,len:10});}
      s+=D+.8+rng()*.9;}return E;}},
};

function renderEvents(E,seconds,rng,noise=2.2){
  const N=Math.round(seconds*NSR),d=new Float32Array(N);
  let lp=0;for(let i=0;i<N;i++){lp+=.35*((rng()*2-1)*noise*1.7-lp);d[i]=lp;}   // coloured amplifier noise
  for(const e of E){const i0=Math.round(e.t*NSR),L=Math.round(e.len/1000*NSR);
    for(let j=0;j<L&&i0+j<N;j++)d[i0+j]+=e.a*e.f(j/NSR*1000);}
  return d;
}

function makePattern(key,seed){
  const rng=mulberry32(seed|0),P=PATTERNS[key],E=P.events(rng).filter(e=>e.t<NLOOP);
  E.sort((a,b)=>a.t-b.t);
  return {key,data:renderEvents(E,NLOOP,rng),events:E.filter(e=>e.id>=0)};
}

/* burst produced when the needle moves */
function insertionBurst(kind,seed){
  const rng=mulberry32(seed|0),E=[];
  const D=kind==='increased'?.9:kind==='myotonic'?1.8:.22;
  let t=0;
  while(t<D){const x=t/D;
    if(kind==='myotonic'&&t>.2){                      // needle movement sets off a myotonic run
      const env=Math.sin(Math.PI*Math.min(1,(t-.2)/(D-.2)));
      E.push({t,id:9,a:40+90*env,f:SHAPES.psw,len:28});t+=1/(22+60*env);continue;}
    const psw=kind==='increased'&&t>.15&&rng()<.5;
    E.push({t,id:9,a:(psw?90:160)*(1-.7*x)*(.5+rng()),f:psw?SHAPES.psw:SHAPES.fib,len:psw?28:3});
    t+=.002+rng()*.012;}
  return renderEvents(E,D+.05,rng,0);
}
