'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/boyun_interface/assets/product.js'), 'utf8');
class El {
  constructor(tag='DIV', document) { this.tagName=tag.toUpperCase(); this.document=document; this.children=[]; this.listeners={};this.dataset={};this.attributes={};this.style={setProperty(k,v){this[k]=v;}};this.value='';this.hidden=false;this.disabled=false;this._text='';this.classList={add(){},remove(){},toggle(){}}; }
  set textContent(v){this._text=String(v);this.children=[];} get textContent(){return this._text+this.children.map(c=>c.textContent||'').join('');}
  append(...v){this.children.push(...v);} replaceChildren(...v){this.children=v;this._text='';}
  setAttribute(k,v){this.attributes[k]=String(v);} removeAttribute(k){delete this.attributes[k];}
  addEventListener(k,fn){this.listeners[k]=fn;} focus(){this.document.activeElement=this;} scrollIntoView(){} click(){if(!this.disabled)this.listeners.click?.({preventDefault(){},target:this});}
}
const elements=new Map();const doc={activeElement:null,listeners:{},getElementById(id){if(!elements.has(id))elements.set(id,new El('DIV',doc));return elements.get(id);},createElement(tag){return new El(tag,doc);},querySelectorAll(){return[];},addEventListener(k,fn){this.listeners[k]=fn;}};
const examples=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/strategic_examples.json'),'utf8'));
const requests=[];let responder=()=>boot;const timers=new Map();let timerID=0;
const boot={csrf_token:'fixture',examples,routes:{author:{enabled:true,model:'gemini-fixture',public_only:true},actors:[{id:'gemini',enabled:true,model:'gemini-fixture',public_only:true} ]},limits:{max_calls:96,max_worlds:4}};
const context=vm.createContext({document:doc,window:{},Intl,console,URL,Blob,setTimeout:(fn)=>{timers.set(++timerID,fn);return timerID;},clearTimeout:(id)=>timers.delete(id),localStorage:{getItem(){return null;},setItem(){}},fetch:async(url,opt={})=>{requests.push({url,opt});const value=responder(url,opt);return {ok:value?.reject!==true,json:async()=>value};}});
vm.runInContext(source,context);
const flush=()=>new Promise(r=>setImmediate(r));
function find(root,predicate){if(predicate(root))return root;for(const child of root.children){const hit=find(child,predicate);if(hit)return hit;}return null;}
(async()=>{
 await flush();await flush();
 const f=context.window.ScenarioFlow;assert.ok(f,'one-question flow helpers exposed');
 assert.equal(f.preferredActor(boot),null,'no automatic Gemini fallback when Jev is unavailable');
 assert.equal(f.preferredActor({routes:{actors:[{id:'gemini',enabled:true},{id:'typesafe',enabled:true}]}}),'typesafe');
 assert.ok(f.questionTempo(0,8,'setup').duration<f.questionTempo(3,8,'setup').duration);
 assert.ok(f.questionTempo(7,8,'setup').duration<f.questionTempo(3,8,'setup').duration);
 assert.equal(f.recommendAlpha(null),f.recommendAlpha(undefined));assert.ok(f.recommendAlpha(.8)>f.recommendAlpha(.3));assert.ok(f.recommendAlpha(1)<=.12,'recommendation tint remains subtle');
 assert.equal(f.sliderValue(200000,1000,100000,500),100000);assert.equal(f.sliderValue(0,1000,100000,500),1000);
 const question=f.buildBrief({intent:'launch',description:'A public NEAR project',capital:5000,focus:'Cautious retail traders',depth:4});
 assert.match(question,/\$5,000/);assert.match(question,/Cautious retail/);assert.match(question,/4 actors/);assert.match(question,/not add capital/i);
 const switched=f.buildBrief({intent:'ticker',description:'Compare names',depth:2,focus:'Large wallets and liquidity providers',retailStyle:'degen',teamPriority:'marketing'});
 assert.match(switched,/Retail style: balanced/);assert.match(switched,/Team priority: balanced/,'hidden answers from an earlier branch must not influence the author');
 const event={key:'ArrowDown',target:{tagName:'BUTTON'},preventDefault(){}};
 assert.equal(f.keyNavigation(event,'question'),'next');assert.equal(f.keyNavigation({...event,key:'ArrowUp'},'question'),'back');
 assert.equal(f.keyNavigation({...event,key:'ArrowRight'},'question'),null,'horizontal arrows no longer navigate');
 assert.equal(f.keyNavigation({...event,target:{tagName:'TEXTAREA'}},'question'),null);
 assert.equal(f.keyNavigation({...event,target:{tagName:'INPUT',type:'range'}},'question'),null);
 assert.equal(f.keyNavigation(event,'submit'),null,'arrows never submit paid calls');
 const screen=elements.get('screen');
 function openPrepared(){goTo('intent');find(screen,e=>e.dataset?.value==='launch').click();elements.get('next').click();find(screen,e=>e.dataset?.value==='prepared').click();elements.get('next').click();goTo('prepared-review');find(screen,e=>e.tagName==='BUTTON'&&e.textContent.includes('Build these personas')).click();}
 function goTo(id){for(let i=0;i<40&&screen.dataset.step!==id;i++){if(screen.dataset.step==='starter')find(screen,e=>e.dataset?.value==='custom').click();elements.get('next').click();}assert.equal(screen.dataset.step,id);}
 assert.equal(screen.dataset.kind,'question');
 const options=screen.children.flatMap(c=>c.children).filter(c=>c.tagName==='BUTTON');
 const launch=find(screen,e=>e.dataset?.value==='launch');assert.ok(launch);launch.click();elements.get('next').click();
 assert.equal(screen.dataset.step,'starter');find(screen,e=>e.dataset?.value==='custom').click();elements.get('next').click();
 assert.equal(screen.dataset.step,'description');const input=find(screen,e=>e.tagName==='TEXTAREA');input.value='My own scenario';input.listeners.input({target:input});
 elements.get('back').click();elements.get('next').click();assert.equal(find(screen,e=>e.tagName==='TEXTAREA').value,'My own scenario');
 elements.get('next').click();assert.equal(screen.dataset.step,'capital');assert.equal(find(screen,e=>e.type==='range').min,'1000');assert.equal(find(screen,e=>e.type==='range').max,'100000');
 assert.equal(requests.filter(r=>r.opt.method==='POST').length,0,'navigation and sliders do not call models');

 // Run the shipped handlers with injected API replies. No external models.
 goTo('privacy');
 assert.equal(screen.dataset.step,'privacy');find(screen,e=>e.dataset?.value==='true').click();elements.get('next').click();
 assert.equal(screen.dataset.kind,'submit');const before=requests.length;
 doc.listeners.keydown({key:'ArrowDown',target:{tagName:'BUTTON'},preventDefault(){}});
 assert.equal(requests.length,before);
 const session={id:'a'.repeat(32),status:'ready',question:'fixture',proposal:{summary:'Fixture world',questions:[],world:examples[0].world,limitations:[]},review:null,progress:{},results:[]};
 responder=(url,opt)=>{if(url==='/api/product/sessions')return session;return boot;};
 const build=find(screen,e=>e.tagName==='BUTTON'&&e.textContent.includes('Construct with Gemini'));
 build.click();build.click();await flush();await flush();
 assert.equal(requests.filter(r=>r.opt.method==='POST').length,1,'double-click has one authoring dispatch');
 assert.equal(screen.dataset.step,'world');
 elements.get('next').click();elements.get('next').click();elements.get('next').click();
 assert.equal(screen.dataset.step,'world-capital');const capital=find(screen,e=>e.type==='range');capital.value='5000';capital.listeners.input();
 elements.get('next').click();assert.equal(screen.dataset.step,'actor-model');find(screen,e=>e.dataset?.value==='gemini').click();elements.get('next').click();assert.equal(screen.dataset.step,'rounds');const rounds=find(screen,e=>e.type==='range');rounds.value='1';rounds.listeners.input();
 elements.get('next').click();elements.get('next').click();elements.get('next').click();assert.equal(screen.dataset.step,'plan');
 responder=()=>({reject:true,error:'fixture_bounded_rejection'});
 find(screen,e=>e.tagName==='BUTTON'&&e.textContent.includes('Validate this run')).click();await flush();await flush();
 assert.equal(elements.get('error').hidden,false);assert.equal(elements.get('error').textContent,'fixture_bounded_rejection','errors survive final rerender');
 responder=(url,opt)=>{const body=opt.body?JSON.parse(opt.body):null;if(url.endsWith('/review')){assert.equal(body.actor_route,'gemini');assert.equal(body.max_credits,0);assert.equal(body.world.actors[0].initial_cash_cents,500000);assert.equal(body.world.rounds,1);return {...session,proposal:{...session.proposal,world:body.world},review:{model:'gemini-fixture',required_calls:2,worlds:1,sha256:'review-fixture',limitations:[]}};}if(url.endsWith('/run'))return {...session,status:'failed',error:'fixture_model_failure'};return boot;};
 find(screen,e=>e.tagName==='BUTTON'&&e.textContent.includes('Validate this run')).click();await flush();await flush();
 assert.equal(screen.dataset.kind,'submit');assert.match(screen.textContent,/Run this reviewed world/);
 const beforeRun=requests.filter(r=>r.url.endsWith('/run')).length;
 doc.listeners.keydown({key:'ArrowDown',target:{tagName:'BUTTON'},preventDefault(){}});
 assert.equal(requests.filter(r=>r.url.endsWith('/run')).length,beforeRun,'arrows do not execute reviewed runs');
 const run=find(screen,e=>e.tagName==='BUTTON'&&e.textContent.includes('Run with Gemini'));run.click();run.click();await flush();await flush();
 assert.equal(requests.filter(r=>r.url.endsWith('/run')).length,1);assert.match(screen.textContent,/fixture_model_failure/);

 // Dynamic agent questions are presented separately, with only real supplied rankings.
 elements.get('start-over').click();goTo('build');
 assert.equal(screen.dataset.step,'build');
 const qsession={...session,status:'draft',proposal:{summary:'Fixture questions',world:null,limitations:[],questions:[
   {id:'goal',prompt:'Which primary goal?',choices:['Runway','Reach'],required:true,recommendation:{choice:'Runway',confidence:.8,probabilities:{Runway:.8,Reach:.2},reason:'A fixture-ranked setup suggestion.'}},
   {id:'audience',prompt:'Which audience?',choices:['Local','Global'],required:true}
 ]}};
 responder=url=>url==='/api/product/sessions'?qsession:boot;
 find(screen,e=>e.tagName==='BUTTON'&&e.textContent.includes('Construct with Gemini')).click();await flush();await flush();
 assert.match(screen.textContent,/Which primary goal/);assert.ok(!screen.textContent.includes('Which audience'));
 let ranked=[];function collect(root){if(root.attributes?.['aria-pressed']!==undefined&&root.tagName==='BUTTON')ranked.push(root);for(const c of root.children)collect(c);}collect(screen);
 assert.ok(Number(ranked[0].style['--choice-alpha'])>Number(ranked[1].style['--choice-alpha']));
 find(screen,e=>e.dataset?.value==='Runway').click();elements.get('next').click();assert.match(screen.textContent,/Which audience/);assert.ok(!screen.textContent.includes('Which primary goal'));
 ranked=[];collect(screen);assert.equal(ranked[0].style['--choice-alpha'],ranked[1].style['--choice-alpha']);
 find(screen,e=>e.dataset?.value==='Global').click();elements.get('next').click();
 responder=(url,opt)=>{if(url.endsWith('/say')){const body=JSON.parse(opt.body);assert.match(body.message,/goal:.*Which primary goal/s);assert.match(body.message,/Runway/);assert.match(body.message,/Global/);return session;}return boot;};
 find(screen,e=>e.tagName==='BUTTON'&&e.textContent.includes('Update the world with Gemini')).click();await flush();await flush();
 assert.equal(requests.filter(r=>r.url.endsWith('/say')).length,1,'answers batch into one explicit author request');

 // Prepared Jev route: explicit GET catalog check, call ceiling and account failures.
 boot.routes.actors.push({id:'typesafe',enabled:true,model:'jev',public_only:false});
 elements.get('start-over').click();
 responder=(url,opt)=>{if(url==='/api/product/sessions')return session;if(url==='/api/product/typesafe/models')return {status:'ready',models:['jev-1']};return boot;};
 openPrepared();await flush();await flush();
 for(let i=0;i<4;i++)elements.get('next').click();assert.equal(screen.dataset.step,'actor-model');
 assert.equal(find(screen,e=>e.dataset?.value==='typesafe').attributes['aria-pressed'],'true','ready worlds select Jev before any actor choice');
 assert.ok(Number(find(screen,e=>e.dataset?.value==='typesafe').style['--choice-alpha'])>Number(find(screen,e=>e.dataset?.value==='gemini').style['--choice-alpha']));
 find(screen,e=>e.dataset?.value==='typesafe').click();
 assert.ok(!requests.some(r=>r.url==='/api/product/typesafe/models'));
 const balance=find(screen,e=>e.tagName==='BUTTON'&&e.textContent.includes('Check TypeSafe access'));balance.click();balance.click();await flush();await flush();
 assert.equal(requests.filter(r=>r.url==='/api/product/typesafe/models').length,1);assert.equal(requests.find(r=>r.url==='/api/product/typesafe/models').opt.method,'GET');assert.match(screen.textContent,/TypeSafe catalog access confirmed/);
 for(let i=0;i<4;i++)elements.get('next').click();assert.equal(screen.dataset.step,'plan');
 const review={actor_route:'typesafe',model:'jev',required_calls:4,worlds:1,max_credits:0,sha256:'jev-review',limitations:[],preview_allowance:{call_limit:100,reserved_calls:4,remaining_calls:96},typesafe_estimate:{actor_call_ceiling:4,input_tokens_upper_bound:10000,input_cost_upper_estimate_usd:'0.00042',basis:'Conservative byte-based estimate',includes_authoring:false,estimate_only:true}};
 responder=(url,opt)=>{if(url.endsWith('/review')){const body=JSON.parse(opt.body);assert.equal(body.actor_route,'typesafe');assert.equal(body.max_credits,0);return {...session,review};}if(url.endsWith('/run'))return {...session,status:'failed',review,error:'typesafe_http_402',error_details:{http_status:402,message:'TypeSafe account needs funding.'}};return boot;};
 find(screen,e=>e.tagName==='BUTTON'&&e.textContent.includes('Validate this run')).click();await flush();await flush();
 assert.match(screen.textContent,/96 calls remaining of 100/);assert.match(screen.textContent,/10000 input tokens/);assert.match(screen.textContent,/not a billing measurement or dollar cap/);assert.ok(!screen.textContent.includes('credit'));
 find(screen,e=>e.tagName==='BUTTON'&&e.textContent.includes('Run with Jev')).click();await flush();await flush();
 assert.match(screen.textContent,/TypeSafe account needs funding/);assert.ok(!find(screen,e=>e.tagName==='A'&&e.href?.includes('/pricing')));
 assert.ok(requests.every(r=>!r.opt.headers?.Authorization),'provider key never enters browser headers');

 // Jev can use an authored example privately; asking Gemini for a change still
 // requires its separate public-data confirmation and preserves the request.
 elements.get('start-over').click();goTo('privacy');
 assert.equal(screen.dataset.step,'privacy');find(screen,e=>e.dataset?.value==='false').click();
 for(let i=0;i<10;i++)elements.get('back').click();
 responder=url=>url==='/api/product/sessions'?session:boot;
 openPrepared();await flush();await flush();
 find(screen,e=>e.tagName==='BUTTON'&&e.textContent.includes('change the cast')).click();
 const custom=find(screen,e=>e.tagName==='TEXTAREA');custom.value='Keep cash fixed; add a cautious alternative.';custom.listeners.input();
 find(screen,e=>e.tagName==='BUTTON'&&e.textContent.includes('Confirm data scope')).click();
 assert.equal(screen.dataset.step,'privacy');find(screen,e=>e.dataset?.value==='true').click();
 const priorChanges=requests.filter(r=>r.url.endsWith('/say')).length;
 elements.get('next').click();assert.equal(screen.dataset.step,'custom-return');
 find(screen,e=>e.tagName==='BUTTON'&&e.textContent.includes('Return to your change')).click();
 assert.equal(find(screen,e=>e.tagName==='TEXTAREA').value,'Keep cash fixed; add a cautious alternative.');
 assert.equal(requests.filter(r=>r.url.endsWith('/say')).length,priorChanges,'scope navigation never authors a change');

 // Completed results remain discoverable after a later draft replaces Resume.
 const report={world:examples[0].world,status:'completed',total_cost_cents:110000,final_metrics:Object.fromEntries(examples[0].world.metrics.map(m=>[m.id,m.initial+1]))};
 const decision={actor_id:examples[0].world.actors[0].id,round:1,action_id:'wait',probabilities:{wait:1},receipt:{model_reported:'jev-1.14.0',transport:'typesafe_systemone_http',usage:{input_tokens:2500},input_cost_estimate_usd:0.000105}};
 const saved={...session,status:'completed',run_id:'run-'+ 'b'.repeat(32),read_only:true,results:[{world_index:0,result:report,decisions:[decision]}],summary:{completed_worlds:1,requested_worlds:1,metrics:f.summaryStats([{result:report}]).metrics},archive:{replay_verified:true}};
 const metadata={session_id:session.id,run_id:saved.run_id,title:examples[0].world.title,status:'completed',completed_worlds:1,requested_worlds:1,actor_count:2,rounds:2,updated_at:'2026-10-25T00:00:00Z'};
 responder=url=>url==='/api/product/results'?{runs:[metadata]}:saved;
 const paidBefore=requests.filter(r=>r.opt.method==='POST').length;
 elements.get('saved-results').click();await flush();await flush();
 assert.equal(screen.dataset.kind,'library');assert.match(screen.textContent,/Saved results/);
 find(screen,e=>e.tagName==='BUTTON'&&e.textContent.includes('Open results')).click();await flush();await flush();
 assert.equal(screen.dataset.kind,'results');assert.match(screen.textContent,/What happened/);assert.ok(!screen.textContent.includes('credit'));assert.match(screen.textContent,/2500/);assert.match(screen.textContent,/\$0.000105/);
 assert.ok(find(screen,e=>e.tagName==='METER'),'actual action distributions have charts');
 assert.equal(requests.filter(r=>r.opt.method==='POST').length,paidBefore,'opening history makes no inference POST');
 doc.listeners.keydown({key:'ArrowUp',target:{tagName:'BUTTON'},preventDefault(){}});
 assert.equal(screen.dataset.kind,'results','reading result charts does not leave the result page');
 // A normal run completes through its progress poll and opens results automatically.
 find(screen,e=>e.tagName==='BUTTON'&&e.textContent.includes('Review another run')).click();await flush();await flush();
 for(let i=0;i<8;i++)elements.get('next').click();
 assert.equal(screen.dataset.step,'plan');
 responder=(url,opt)=>url.endsWith('/review')?{...session,review}:url.endsWith('/run')?{...session,status:'running',review,progress:{total_calls:4,completed_calls:0}}:saved;
 find(screen,e=>e.tagName==='BUTTON'&&e.textContent.includes('Validate this run')).click();await flush();await flush();
 find(screen,e=>e.tagName==='BUTTON'&&e.textContent.includes('Run with Jev')).click();await flush();await flush();
 assert.equal(screen.dataset.kind,'loading');
 const poll=[...timers.values()].at(-1);assert.ok(poll);await poll();await flush();await flush();
 assert.equal(screen.dataset.kind,'results','completion poll must display results');
 assert.equal(elements.get('error').hidden,true);
 // Persona scale is a bounded numeric choice; using presets does not call models.
 boot.limits.max_actors=100;boot.limits.max_calls=800;
 elements.get('start-over').click();goTo('depth');
 assert.equal(screen.dataset.step,'depth');const count=find(screen,e=>e.type==='range');
 assert.equal(count.min,'2');assert.equal(count.max,'100');
 const countBefore=requests.length;count.value='100';count.listeners.input();
 assert.equal(requests.length,countBefore);elements.get('next').click();
 assert.match(f.buildBrief({intent:'launch',description:'Public cohort test',capital:10000,focus:'Reviewed roles',depth:100}),/exactly 100 actors/);
 // Single-answer selection advances once; non-one-click inputs and safety
 // confirmations remain explicit. Advancing to a submit screen never submits.
 elements.get('start-over').click();
 const priorPosts=requests.filter(r=>r.opt.method==='POST').length;
 find(screen,e=>e.dataset?.value==='launch').click();
 assert.equal(screen.dataset.step,'intent','keep selected feedback before transition');
 const advance=[...timers.values()].at(-1);assert.ok(advance);await advance();
 assert.equal(screen.dataset.step,'starter','single choice advances automatically');
 assert.equal(elements.get('step-label').textContent,'Question 2');
 find(screen,e=>e.dataset?.value==='custom').click();await [...timers.values()].at(-1)();
 assert.equal(screen.dataset.step,'description');
 const typed=find(screen,e=>e.tagName==='TEXTAREA');typed.value='A public scenario';typed.listeners.input();
 assert.equal(screen.dataset.step,'description','typing does not automatically leave the field');
 elements.get('next').click();assert.equal(screen.dataset.step,'capital');
 find(screen,e=>e.tagName==='BUTTON'&&e.textContent==='$10,000').click();
 assert.equal(screen.dataset.step,'capital','slider presets do not advance');
 elements.get('next').click();find(screen,e=>e.dataset?.value==='Balanced view').click();
 await [...timers.values()].at(-1)();assert.equal(screen.dataset.step,'retail-style');
 find(screen,e=>e.dataset?.value==='degen').click();await [...timers.values()].at(-1)();assert.equal(screen.dataset.step,'team-priority');
 find(screen,e=>e.dataset?.value==='marketing').click();await [...timers.values()].at(-1)();assert.equal(screen.dataset.step,'depth');
 elements.get('next').click();find(screen,e=>e.dataset?.value==='false').click();
 assert.equal(screen.dataset.step,'privacy','confidential data choice stays for correction');
 find(screen,e=>e.dataset?.value==='true').click();await [...timers.values()].at(-1)();
 assert.equal(screen.dataset.step,'build');
 assert.equal(requests.filter(r=>r.opt.method==='POST').length,priorPosts,'automatic navigation must never authorize a model call');
 assert.equal(f.authoringPlan({depth:12}),null);
 const batchPlan=f.authoringPlan({depth:100,intent:'launch',capital:10000});
 assert.deepEqual(JSON.parse(JSON.stringify(batchPlan)),{mode:'batched',actor_count:100,batch_size:20,max_calls:6,creator_capital_cents:1000000});
 assert.equal(f.authoringPlan({depth:21,intent:'ticker'}).max_calls,3);
 // The large-cast create payload carries exactly the explicit reviewed plan.
 elements.get('start-over').click();goTo('depth');
 const large=find(screen,e=>e.type==='range');large.value='20';large.listeners.input();
 elements.get('next').click();elements.get('next').click();assert.equal(screen.dataset.step,'build');
 assert.match(screen.textContent,/2 maximum/);
 responder=(url,opt)=>{if(url==='/api/product/sessions'){const data=JSON.parse(opt.body);assert.equal(data.authoring_plan.actor_count,20);assert.equal(data.authoring_plan.max_calls,2);assert.equal(data.authoring_plan.creator_capital_cents,1000000);return session;}return boot;};
 find(screen,e=>e.tagName==='BUTTON'&&e.textContent.includes('Construct with Gemini')).click();await flush();await flush();
 // Revising a staged world prepares another reviewed plan without hidden calls.
 // The eight-role construction is reachable without an author/model call.
 responder=(url,opt)=>url==='/api/product/sessions'?session:boot;
 elements.get('start-over').click();
 find(screen,e=>e.dataset?.value==='defi').click();elements.get('next').click();
 find(screen,e=>e.dataset?.value==='prepared').click();elements.get('next').click();
 assert.equal(screen.dataset.step,'ready-world');
 find(screen,e=>e.dataset?.value==='near-pilot-eight-roles').click();elements.get('next').click();
 goTo('prepared-review');
 const oldCount=requests.filter(r=>r.url==='/api/product/sessions').length;
 find(screen,e=>e.tagName==='BUTTON'&&e.textContent.includes('Build these personas')).click();await flush();await flush();
 const last=requests.filter(r=>r.url==='/api/product/sessions').at(-1);
 assert.equal(JSON.parse(last.opt.body).example_id,'near-pilot-eight-roles');
 assert.equal(requests.filter(r=>r.url==='/api/product/sessions').length,oldCount+1);
 const staged={...session,authoring_plan:{mode:'batched',actor_count:20,batch_size:20,max_calls:2,creator_capital_cents:1000000},authoring_cancel_requested:false};
 responder=url=>url==='/api/product/sessions'?staged:boot;
 elements.get('start-over').click();
 openPrepared();await flush();await flush();
 const revisionPosts=requests.filter(r=>r.opt.method==='POST').length;
 find(screen,e=>e.tagName==='BUTTON'&&e.textContent.includes('change the cast')).click();
 const change=find(screen,e=>e.tagName==='TEXTAREA');change.value='Focus on independent reviewers.';change.listeners.input();
 find(screen,e=>e.tagName==='BUTTON'&&e.textContent.includes('Review a new authoring plan')).click();
 assert.equal(screen.dataset.step,'description');assert.match(find(screen,e=>e.tagName==='TEXTAREA').value,/independent reviewers/);
 assert.equal(requests.filter(r=>r.opt.method==='POST').length,revisionPosts);
 goTo('build');assert.equal(screen.dataset.step,'build');
 responder=(url,opt)=>url==='/api/product/sessions'?{...staged,status:'authoring',progress:{total_calls:2,completed_calls:0}}:url.endsWith('/cancel_author')?{...staged,status:'authoring',authoring_cancel_requested:true,progress:{total_calls:2,completed_calls:0}}:boot;
 find(screen,e=>e.tagName==='BUTTON'&&e.textContent.includes('Construct with Gemini')).click();await flush();await flush();
 assert.equal(screen.dataset.kind,'loading');find(screen,e=>e.tagName==='BUTTON'&&e.textContent.includes('Stop after')).click();await flush();await flush();
 assert.equal(requests.filter(r=>r.url.endsWith('/cancel_author')).length,1);
 assert.match(screen.textContent,/Stopping after the current request/);
 console.log('Product flow regressions passed: single-question navigation, retained answers, bounded slider, recommendation intensity, native arrows and no inference on navigation.');
})().catch(err=>{console.error(err);process.exitCode=1;});
