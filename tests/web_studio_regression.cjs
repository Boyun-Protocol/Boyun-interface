'use strict';
// Shipped code, minimal inert DOM; browser end-to-end checks run separately.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
class Element {
  constructor(tag) { this.tagName=tag; this.children=[]; this.value=''; this.listeners={}; this.dataset={}; this.style={}; this.attributes={}; this._text=''; this.hidden=false; }
  set textContent(value) { this._text=String(value); this.children=[]; }
  get textContent() { return this._text+this.children.map((child)=>child.textContent).join(''); }
  get lastChild() { return this.children.at(-1); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this._text=''; this.children=children; }
  addEventListener(type, handler) { this.listeners[type]=handler; }
  setAttribute(key,value) { this.attributes[key]=value; }
  setCustomValidity(value) { this.validity=value; }
}
function context() {
  const elements=new Map();
  const document={getElementById(id){ if(!elements.has(id)) elements.set(id,new Element('div')); return elements.get(id); }, createElement(tag){return new Element(tag);},querySelectorAll(){return[];}};
  const scope=vm.createContext({document,Intl,console,setTimeout:(fn,ms)=>setTimeout(fn,ms===450?0:ms),clearTimeout,window:{addEventListener(){}},crypto:{randomUUID:()=> 'unique-action'},localStorage:{setItem(){}}});
  const dir=path.join(__dirname,'../src/decision_lab/web');
  vm.runInContext(fs.readFileSync(path.join(dir,'app.js'),'utf8').replace(/init\(\);\s*$/,''),scope);
  vm.runInContext(fs.readFileSync(path.join(dir,'studio.js'),'utf8'),scope);
  return {scope,document,studio:scope.window.ScenarioStudio};
}
function draft(){return {schema_version:'scenario-draft.v1',id:'test',revision:0,event_description:'Test',fields:[],engine_input:{schema_version:'event-chain.v1'}};}
(async()=>{
  {
    const {studio}=context();
    assert.equal(studio.fieldValue({type:'integer'},''),null);
    assert.equal(studio.fieldValue({type:'integer'},'0'),0);
    assert.throws(()=>studio.fieldValue({type:'integer'},'1.5'),/whole number/);
    assert.equal(studio.fieldValue({type:'boolean'},'false'),false);
    console.log('PASS typed integer, blank and false values preserve meaning');
  }
  {
    const {document,studio}=context(); studio.state.draft=draft();
    studio.state.draft.engine_input={schema_version:'choice-world.v1',personas:[null,7]};
    studio.state.compilation={ready:false,draft_valid:true};
    assert.doesNotThrow(()=>{studio.renderPolicy();studio.renderPersonas();});
    assert.ok(document.getElementById('studio-policy').textContent.includes('complete'));
    console.log('PASS incomplete packages remain editable without crashing review panels');
  }
  {
    const {scope,studio}=context(); studio.state.draft=draft();
    vm.runInContext('api=()=>new Promise(resolve=>globalThis.resolveStartValidation=resolve)',scope);
    const first=studio.startWorld(); const second=studio.startWorld();
    await second;
    assert.equal(studio.state.busy,true);
    scope.resolveStartValidation({ready:false,issues:[]}); await first;
    assert.equal(studio.state.busy,false);
    console.log('PASS double start is locked before asynchronous validation');
  }
  {
    const {scope,document,studio}=context(); studio.state.draft=draft();
    vm.runInContext('api=()=>new Promise(resolve=>globalThis.resolveValidation=resolve)',scope);
    const pending=studio.validate(); studio.state.epoch++;
    document.getElementById('studio-run').disabled=true;
    scope.resolveValidation({ready:true,package:{schema_version:'event-chain.v1'},issues:[]});
    assert.equal(await pending,null); assert.equal(studio.state.compilation,null); assert.equal(document.getElementById('studio-run').disabled,true);
    console.log('PASS stale validation cannot enable a revised draft');
  }
  {
    const {scope,document,studio}=context(); studio.state.draft=draft();
    vm.runInContext('api=()=>new Promise(resolve=>globalThis.resolveApply=resolve)',scope);
    const pending=studio.applyResponse({}); studio.state.epoch++;
    scope.resolveApply({draft:{...draft(),revision:1}});
    await assert.rejects(pending,/Draft changed/); assert.equal(studio.state.draft.revision,0);
    console.log('PASS delayed agent response retains the newer draft');
  }
  {
    const {scope,document,studio}=context(); const d=draft();
    d.fields=[{id:'score',label:'Score',type:'integer',unit:null,required:true,value:3,minimum:0,maximum:10,choices:[],target:'/parameters/score',why:'Higher means a higher declared score.',provenance:{status:'assumed'}}];
    studio.state.draft=d; studio.renderFields();
    const wrap=document.getElementById('studio-fields').children[0]; const input=wrap.children[1];
    vm.runInContext('api=()=>new Promise(resolve=>globalThis.resolveValidation=resolve)',scope);
    const old=studio.validate(); input.value='1.5'; input.listeners.input(); clearTimeout(studio.state.timer);
    assert.equal(d.fields[0].value,'1.5'); assert.equal(d.revision,1); assert.equal(studio.state.epoch,1);
    scope.resolveValidation({ready:true,package:{},issues:[]}); await old;
    assert.equal(document.getElementById('studio-run').disabled,true);
    assert.equal(studio.state.compilation,null);
    console.log('PASS invalid visible integer replaces retained value and invalidates in-flight checks');
  }
  {
    const {scope,document,studio}=context(); studio.state.draft=draft();
    document.getElementById('studio-worlds').value='10'; document.getElementById('studio-seed').value='42';
    scope.calls=[];
    vm.runInContext(`api=async(path)=>{calls.push(path);if(path==='/api/studio/validate')return {ready:true,package:{schema_version:'event-chain.v1'},issues:[]};if(path==='/api/jobs')return {job_id:'job-1',status:'queued'};if(path==='/api/jobs/job-1')return {job_id:'job-1',status:'completed',result:{worlds:10,seed:42,metrics:{score:{unit:'points',mean:3,median:3,p05:3,p95:3}},paths:[],limitations:[]}};throw Error('Unsupported endpoint '+path);}`,scope);
    await studio.runBatch(); assert.deepEqual(Array.from(scope.calls),['/api/studio/validate','/api/jobs','/api/jobs/job-1']);
    assert.equal(studio.state.result.worlds,10); assert.equal(document.getElementById('studio-results').hidden,false);
    assert.ok(document.getElementById('studio-result-metrics').textContent.includes('Median · mean 3'));
    console.log('PASS batch consumes the actual completed-job result endpoint and renders aggregates');
  }
  {
    const {document,studio}=context();
    const result={world_count:2,seed:42,worlds:[{net_profit_cents:100},{net_profit_cents:300}],overview:{event_paths:[{id:'a',label:'Catalyst',count:2,frequency:1,median_cents:100,mean_cents:200}]},limitations:[]};
    studio.renderResults(result,'job',draft());
    assert.ok(document.getElementById('studio-result-paths').textContent.includes('median $1.00 · mean $2.00'));
    assert.ok(document.getElementById('studio-result-metrics').textContent.includes('$1.00'));
    console.log('PASS launch groups use actual flat cash statistics and cents units');
  }
  {
    const {scope,studio}=context(); studio.state.world={id:'w',revision:0};
    scope.actions=[];
    vm.runInContext(`api=async(path,opts)=>{if(opts){actions.push(JSON.parse(opts.body));throw Error('response lost');}throw Error('offline');}`,scope);
    await assert.rejects(studio.step('pilot'),/response lost/); await assert.rejects(studio.step('pilot'),/response lost/);
    assert.equal(scope.actions.length,2); assert.equal(scope.actions[0].action_id,scope.actions[1].action_id); assert.equal(scope.actions[1].expected_revision,0);
    console.log('PASS uncertain step retry preserves its action ID and expected revision');
  }
})().catch((error)=>{console.error(error);process.exitCode=1;});
