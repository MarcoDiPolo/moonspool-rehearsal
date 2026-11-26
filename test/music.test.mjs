import test from "node:test";
import assert from "node:assert/strict";
import {cabinet, moonrise, notes, readRoll} from "../ui/roll.mjs";
import {buildPractice, locate} from "../ui/transport.mjs";

const demo=readRoll(moonrise);
const settings={bpm:96,from:3,to:7,loops:2,countIn:4};
const pack=(bytes)=>Buffer.from(bytes).toString("base64url");

test("Cabinet's published Moonrise reads at 96 BPM from every supported input",()=>{
  assert.equal(demo.bpm,96);
  assert.deepEqual(demo.masks,[1,0,2,0,4,0,5,0,8,0,9,0,16,0,17,0]);
  for(const input of ["#"+moonrise,cabinet+"#"+moonrise," "+moonrise+" "])assert.deepEqual(readRoll(input),demo);
});

test("all 32 masks and every native tempo survive import",()=>{
  for(let bpm=60;bpm<=150;bpm++)for(let n=0;n<32;n++){
    const masks=Array.from({length:16},(_,i)=>(n+i)%32);
    const parsed=readRoll(pack([1,bpm-60,...masks]));
    assert.equal(parsed.bpm,bpm);assert.deepEqual(parsed.masks,masks);
  }
  assert.deepEqual(notes(0),[]);assert.deepEqual(notes(21),["A3","D4","G4"]);
});

test("reject damaged, unsupported, and unrelated input",()=>{
  for(const input of ["",moonrise+"x",moonrise.slice(1),"https://example.com/#"+moonrise,
    cabinet+"?ref=x#"+moonrise,pack([2,36,...demo.masks]),pack([1,91,...demo.masks]),pack([1,0,32,...demo.masks.slice(1)])])
    assert.throws(()=>readRoll(input));
});

test("validates selection and playable inputs",()=>{
  for(const change of [{from:0},{to:17},{from:8,to:5},{bpm:75.4},{bpm:151},{loops:9},{countIn:1}])
    assert.throws(()=>buildPractice(demo.masks,{...settings,...change}));
  for(const masks of [Array(16),demo.masks.slice(1),[34,...demo.masks.slice(1)]])
    assert.throws(()=>buildPractice(masks,settings));
});

test("every sixteenth, count-in, loop, rest and ending stays on its prescribed boundary",()=>{
  for(const bpm of [60,96,97,113,137,149,150]){
    for(const [from,to] of [[1,1],[3,7],[11,16],[1,16]])for(const countIn of [0,4]){
      const p=buildPractice(demo.masks,{bpm,from,to,loops:8,countIn});
      for(let b=0;b<countIn;b++)assert.deepEqual(locate(p,b*p.beatMs),{phase:"count",beat:b+1});
      for(let n=0;n<p.steps.length*p.loops;n++){
        const start=p.countInMs+n*p.stepMs,step=from+n%p.steps.length;
        const expected={phase:"play",pass:1+Math.floor(n/p.steps.length),step,mask:demo.masks[step-1]};
        assert.deepEqual(locate(p,start),expected,`BPM ${bpm}, selection ${from}-${to}, slot ${n}`);
        assert.deepEqual(locate(p,start+p.stepMs*0.99999),expected);
      }
      assert.deepEqual(locate(p,p.totalMs),{phase:"done"});assert.deepEqual(locate(p,p.totalMs+3000),{phase:"done"});
    }
  }
});
