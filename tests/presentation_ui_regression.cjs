'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
class El{constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attributes={};this.style={setProperty(){}};this.listeners={};this._text='';}set textContent(v){this._text=String(v);this.children=[];}get textContent(){return this._text+this.children.map(c=>c.textContent||'').join('');}append(...a){this.children.push(...a);}replaceChildren(...a){this.children=a;this._text='';}setAttribute(k,v){this.attributes[k]=String(v);}addEventListener(k,f){this.listeners[k]=f;}click(){if(!this.disabled)this.listeners.click?.();}focus(){}}
const doc={createElement:t=>new El(t),createElementNS:(_,t)=>new El(t)};
const ctx=vm.createContext({window:{},document:doc,Math,Number,Object,String,Array,Map,Set,BigInt,Intl});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/boyun_interface/assets/presentation.js'),'utf8'),ctx);
const slide={id:'x',label:'Trust',unit:'assumed points',initial:10,bounds:{min:0,max:100},final:{mean:20,median:20,min:15,max:25},rounds:[0,1],series:[{world_index:0,values:[10,15]},{world_index:1,values:[10,25]}],mean:[10,20],median:[10,20]};
const cluster=(id,cost)=>({id,label:'Observed scenario '+id,count:1,completed_frequency:.5,world_indexes:[id],total_cost_cents:cost,final_metrics:{x:20},representative_actions:[{name:'Reviewer',sequence:[{round:1,label:'Review'}]}]});
const deck={schema_version:'scenario-presentation.v1',title:'Actual fixture outcomes',source:{replay_verified:true},denominators:{requested_worlds:2,completed_worlds:2,uncompleted_worlds:0},slides:[{kind:'overview',actor_count:2,round_count:1,models:['jev-1.14.0'],scenario_count:2},{kind:'metric-trajectories',metrics:[slide]},{kind:'cash-costs',actors:[{name:'Reviewer',cost_fraction:.2,mean_cost_usd:'20.00',mean_remaining_usd:'80.00'}],world_costs:[{world_index:0,cost_cents:'2000',cost_usd:'20.00'}],provider:{recorded_model_calls:2,recorded_input_tokens:5000,input_cost_estimate_usd:0.00021,models:['jev-1.14.0']}},{kind:'scenario-clusters',clusters:[cluster(0,'2000'),cluster(1,'1000')],actions:[]},{kind:'network-evidence',nodes:[{id:'a',name:'Reviewer',role:'Review'},{id:'b',name:'Creator',role:'Build'}],edges:[{source:'a',target:'b',delivered_messages:1}],counts:{published_messages:1,distinct_deliveries:1,matched_interactions:0},provenance_counts:{assumed:4},source_refs:[],limitations:[]}]};
const root=new El('main');let anchors=0,details=0;const controller=ctx.window.ScenarioDeck.mount(root,deck,{onNear(){anchors++;},onDetails(){details++;}});
assert.match(root.textContent,/Actual fixture outcomes/);assert.equal(anchors,0,'mounting must not submit transactions');
assert.ok(controller.count>=7);controller.next();assert.match(root.textContent,/Trust/);assert.ok(root.children.length);
function find(n,test){if(test(n))return n;for(const c of n.children){const f=find(c,test);if(f)return f;}return null;}
assert.ok(find(root,n=>n.tagName==='SVG'),'metric slide has a real chart');
controller.next();assert.match(root.textContent,/Observed scenario/);assert.match(root.textContent,/1 of 2/);assert.ok(!root.textContent.includes('50% chance'));
controller.go(4);assert.match(root.textContent,/5000/);assert.match(root.textContent,/\$0.00021/);assert.match(root.textContent,/not attested/);assert.ok(!root.textContent.includes('credit'));
 deck.slides[2].provider.recorded_input_tokens=null;deck.slides[2].provider.input_cost_estimate_usd=null;controller.go(4);assert.match(root.textContent,/Unknown/);assert.ok(!root.textContent.includes('$null'));
 controller.go(controller.count-1);assert.equal(anchors,0);
find(root,n=>n.tagName==='BUTTON'&&n.textContent.includes('NEAR')).click();assert.equal(anchors,1);
assert.equal(ctx.window.ScenarioDeck.moneyCents('9007199254740993'),'$90,071,992,547,409.93');
deck.slides[3].actions=[{actor_id:'a',name:'Reviewer',action_id:'wait',label:'Wait',mean_model_score:1,selection_frequency:1}];
const withChoices=ctx.window.ScenarioDeck.mount(root,deck,{});
let sawChoices=false;for(let i=0;i<withChoices.count;i++){withChoices.go(i);if(root.textContent.includes('PREFERENCES & ACTUAL CHOICES')){sawChoices=true;assert.match(root.textContent,/Jev returns no reasoning trace/);assert.ok(!root.textContent.includes('NaN'));break;}}
assert.equal(sawChoices,true,'decision-record disclosure must appear on an actually rendered choice page');
console.log('Presentation UI: slide navigation, actual charts, exact money and explicit-only NEAR action passed.');
