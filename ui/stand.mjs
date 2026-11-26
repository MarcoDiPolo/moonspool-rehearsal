import {cabinet, midi, moonrise, notes, pitches, readRoll} from "./roll.mjs";
import {buildPractice, locate} from "./transport.mjs";

export function mount(container) {
  const holder = document.createElement("div");
  container.append(holder);
  const view = holder.attachShadow({mode:"open"});
  const sheet = document.createElement("link");
  sheet.rel = "stylesheet";
  sheet.href = new URL("./stand.css", import.meta.url).href;
  view.append(sheet);
  const body = document.createElement("section");
  body.className = "stand";
  body.innerHTML = `
    <header><div class="moon" aria-hidden="true"></div><div><h1>Moonspool Rehearsal</h1>
    <p>A practice stand for your Moonspool Cabinet rolls.</p></div></header>
    <form id="source"><label for="roll">Cabinet link or roll code</label><div class="row"><input id="roll" type="text" spellcheck="false" autocomplete="off" required><button>Load roll</button></div></form>
    <p id="error" role="alert"></p>
    <section class="score" aria-label="Piano roll"><div class="scorehead"><h2>Practice score</h2><a id="original" target="_blank" rel="noopener noreferrer">Open in Cabinet ↗</a></div>
    <div class="scroll"><table aria-label="Notes by sixteenth-note step"><thead></thead><tbody></tbody></table></div></section>
    <form id="practice"><fieldset><legend>Phrase settings</legend><div class="settings">
    <label>From step<select id="from"></select></label><label>Through step<select id="to"></select></label>
    <label>Tempo (BPM)<input id="bpm" type="number" min="60" max="150" step="1" required></label>
    <label>Passes<select id="loops"></select></label></div>
    <div class="options"><label><input type="checkbox" id="count" checked> Four-beat count-in</label>
    <label><input type="checkbox" id="sound" checked> Sound</label></div></fieldset>
    <div class="transport"><button class="primary" id="play">Start rehearsal</button><button type="button" id="stop" disabled>Stop</button>
    <output id="status" aria-live="polite">Ready</output></div><p id="cue" aria-live="off"></p></form>`;
  view.append(body);
  const el = id => view.getElementById(id);
  let roll = readRoll(moonrise), run = null, audio = null, frame = 0, serial = 0;
  let column = 0, disposed = false;
  const columns = Array.from({length:16}, () => []);
  const make = (tag, txt) => Object.assign(document.createElement(tag), {textContent:txt});
  for (const [id, length, initial] of [["from",16,1],["to",16,16],["loops",8,2]]) {
    for (let i=1;i<=length;i++) el(id).add(new Option(String(i),String(i)));
    el(id).value = initial;
  }
  const head = document.createElement("tr");
  head.append(make("th","Pitch"));
  columns.forEach((cells,i)=>{const th=make("th",String(i+1));th.scope="col";cells.push(th);head.append(th);});
  view.querySelector("thead").append(head);
  for(let pitch=pitches.length-1;pitch>=0;pitch--) {
    const tr=document.createElement("tr"), th=make("th",pitches[pitch]);
    th.scope="row";tr.append(th);
    columns.forEach(cells=>{const td=make("td","");cells.push(td);tr.append(td);});
    view.querySelector("tbody").append(tr);
  }
  function render() {
    const first=Number(el("from").value), last=Number(el("to").value);
    columns.forEach((cells,i)=>cells.forEach((cell,row)=>{
      const on = row>0 && Boolean(roll.masks[i] & (1 << (5-row)));
      cell.classList.toggle("active",on);
      cell.classList.toggle("outside",i+1<first || i+1>last);
      cell.classList.toggle("current",i+1===column);
      if(row>0){cell.textContent=on?"●":"·";cell.setAttribute("aria-label",on?"Played":"Silent");}
    }));
  }
  function load(next) {
    roll=next;el("bpm").value=roll.bpm;el("roll").value=roll.token;
    el("original").href=cabinet+"#"+roll.token;el("error").textContent="";
    el("cue").textContent="";el("status").textContent="Ready";render();
  }
  function finish(message) {
    serial++;run=null;cancelAnimationFrame(frame);column=0;
    if(audio){const previous=audio;audio=null;previous.close().catch(()=>{});}
    if(disposed)return;
    view.querySelector("fieldset").disabled=false;el("play").disabled=false;el("stop").disabled=true;
    el("status").textContent=message;el("cue").textContent="";render();
  }
  function tone(ctx,time,hz,duration,level) {
    const osc=ctx.createOscillator(), gain=ctx.createGain();
    osc.type="sine";osc.frequency.value=hz;
    gain.gain.setValueAtTime(0.0001,time);
    gain.gain.exponentialRampToValueAtTime(level,time+0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001,time+duration);
    osc.connect(gain);gain.connect(ctx.destination);
    osc.onended=()=>{osc.disconnect();gain.disconnect();};
    osc.start(time);osc.stop(time+duration+0.002);
  }
  function schedule(ctx,base,plan) {
    for(let b=0;b<plan.countInMs/plan.beatMs;b++)tone(ctx,base+b*plan.beatMs/1000,b===0?880:660,0.048,0.065);
    for(let pass=0;pass<plan.loops;pass++) {
      plan.steps.forEach(({mask},i)=>{
        const when=base+(plan.countInMs+(pass*plan.steps.length+i)*plan.stepMs)/1000;
        midi.forEach((n,p)=>{if(mask & (1<<p))tone(ctx,when,440*2**((n-69)/12),plan.stepMs*0.78/1000,0.07);});
      });
    }
  }
  async function start(e) {
    e.preventDefault();if(run || disposed)return;
    let plan;
    try{plan=buildPractice(roll.masks,{bpm:Number(el("bpm").value),from:Number(el("from").value),
      to:Number(el("to").value),loops:Number(el("loops").value),countIn:el("count").checked?4:0});}
    catch{el("error").textContent="Choose a valid phrase and a whole-number tempo from 60 to 150 BPM.";return;}
    const id=++serial;run=plan;el("error").textContent="";
    el("play").disabled=true;el("stop").disabled=false;view.querySelector("fieldset").disabled=true;
    try {
      if(el("sound").checked) {
        audio=new AudioContext();await audio.resume();
        if(disposed || serial!==id)return;
        const base=audio.currentTime+0.07;schedule(audio,base,plan);
        animate(()=>Math.max(0,(audio.currentTime-base)*1000));
      } else {
        const base=performance.now();animate(()=>performance.now()-base);
      }
    } catch {
      if(serial!==id || disposed)return;
      finish("Stopped");el("error").textContent="Audio could not start. Switch off Sound to rehearse visually.";
    }
    function animate(clock) {
      let prior="";
      function tick(){
        if(serial!==id || disposed)return;
        const cue=locate(plan,clock());
        if(cue.phase==="done"){finish("Rehearsal complete");return;}
        const key=JSON.stringify(cue);
        if(prior!==key){
          prior=key;column=cue.step||0;render();
          const status=cue.phase==="count"?"Count-in":"Pass "+cue.pass+" of "+plan.loops;
          if(el("status").textContent!==status)el("status").textContent=status;
          el("cue").textContent=cue.phase==="count"?"Beat "+cue.beat+" of 4":"Step "+cue.step+" | "+(notes(cue.mask).join(" + ")||"Rest");
        }
        frame=requestAnimationFrame(tick);
      }
      tick();
    }
  }
  el("source").addEventListener("submit",e=>{
    e.preventDefault();
    try{const next=readRoll(el("roll").value);finish("Ready");load(next);}
    catch(err){el("error").textContent=err.message;}
  });
  for(const id of ["from","to"])el(id).addEventListener("change",()=>{
    if(+el("from").value>+el("to").value)el(id==="from"?"to":"from").value=el(id).value;
    render();
  });
  el("practice").addEventListener("submit",start);
  el("stop").addEventListener("click",()=>finish("Stopped"));
  load(roll);
  return ()=>{disposed=true;finish("Stopped");holder.remove();};
}
