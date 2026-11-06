'use strict';
// Reuse the real shipped-flow fixture, but exercise new recovery behavior.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const harness=fs.readFileSync(path.join(__dirname,'product_flow_regression.cjs'),'utf8').split('(async()=>{')[0];
const mode=process.argv[2];
const checks=`(async()=>{
 await flush();await flush();
 boot.access={mode:'operator',completed:true};
 const screen=elements.get('screen');
 const pick=value=>{const b=find(screen,e=>e.dataset?.value===value);assert.ok(b,value);b.click();};
 let access;
 context.window.ScenarioAccess={open:options=>access=options};
 if(${JSON.stringify(mode)}==='draft'){
  pick('launch');elements.get('next').click();pick('custom');elements.get('next').click();
  const field=find(screen,e=>e.tagName==='TEXTAREA');field.value='My private launch decision';field.listeners.input({target:field});
  elements.get('access-settings').click();assert.ok(access);
  await access.onDone();await flush();
  assert.equal(screen.dataset.step,'description','changing provider settings must preserve the question');
  assert.equal(find(screen,e=>e.tagName==='TEXTAREA').value,'My private launch decision');
  assert.equal(requests.filter(r=>r.opt.method==='POST').length,0,'settings callback cannot dispatch inference');
 }else if(${JSON.stringify(mode)}==='results'){
  let controller;let mounts=0;
  context.window.ScenarioDeck={mount(root,deck,actions){mounts++;controller={index:0,go(n){this.index=n;},count:8};return controller;}};
  const saved={session_id:'a'.repeat(32),run_id:'run-'+'b'.repeat(32),title:'Recorded decision',completed_worlds:1,requested_worlds:1,actor_count:2,rounds:2};
  const session={id:saved.session_id,run_id:saved.run_id,status:'completed',proposal:{world:examples[0].world},results:[]};
  responder=url=>url==='/api/product'?boot:url.endsWith('/presentation')?{schema_version:'scenario-presentation.v1'}:url==='/api/product/results'?{runs:[saved]}:session;
  elements.get('saved-results').click();await flush();await flush();find(screen,e=>e.tagName==='BUTTON'&&e.textContent==='Open results →').click();await flush();await flush();await flush();
  assert.ok(controller);controller.go(3);
  elements.get('access-settings').click();await access.onDone();await flush();
  assert.equal(screen.dataset.kind,'results','model setup must return to the viewed result');
  assert.equal(controller.index,3,'re-render must preserve slide position');
  assert.ok(mounts>1);
 }else if(${JSON.stringify(mode)}==='cloud_failure'){
  boot.routes.author={enabled:true,provider:'near_ai',model:'openai/gpt-6.1-sol',public_only:false};
  pick('launch');elements.get('next').click();pick('custom');elements.get('next').click();
  while(screen.dataset.step!=='privacy'){elements.get('next').click();}
  pick('true');elements.get('next').click();
  const failed={id:'a'.repeat(32),status:'failed',proposal:null,results:[],progress:{},error:'near_ai_http_402',error_details:{http_status:402,message:'Cloud account needs funding.'}};
  responder=url=>url==='/api/product/sessions'?failed:boot;
  find(screen,e=>e.tagName==='BUTTON'&&e.textContent.startsWith('Construct with')).click();await flush();await flush();
  const billing=find(screen,e=>e.tagName==='A'&&e.href==='https://cloud.near.ai');assert.ok(billing,'Cloud account failures must point to Cloud');
  assert.ok(!find(screen,e=>e.tagName==='A'&&e.href?.includes('typesafe.com')));
  const edit=find(screen,e=>e.tagName==='BUTTON'&&e.textContent==='Edit my question');assert.ok(edit,'failed authoring needs a way back to the existing brief');edit.click();assert.equal(screen.dataset.step,'description');
 }else if(['shortcut','free_review','ai_review'].includes(${JSON.stringify(mode)})){
  const session={id:'a'.repeat(32),status:'ready',proposal:{summary:'Ready world',questions:[],world:examples[0].world,limitations:[]},review:null,results:[]};
  if(${JSON.stringify(mode)}==='free_review'){boot.access.mode='offline';boot.routes.actors=[{id:'offline',enabled:true,model:'local rules'}];}
  const ai=${JSON.stringify(mode)}==='ai_review';if(ai)boot.routes.actors=[{id:'typesafe',enabled:true,model:'jev'}];
  responder=(url,opt)=>url==='/api/product/sessions'?session:url.endsWith('/typesafe/models')?{status:'ready',models:['jev-1']}:url.endsWith('/review')?{...session,review:{model:ai?'jev':'local rules',actor_route:ai?'typesafe':'offline',required_calls:4,max_credits:0,worlds:1,sha256:'review-fixture'}}:boot;
  pick('launch');elements.get('next').click();pick('prepared');elements.get('next').click();
  for(let n=0;n<10&&screen.dataset.step!=='prepared-review';n++)elements.get('next').click();
  find(screen,e=>e.tagName==='BUTTON'&&e.textContent.includes('Build these personas')).click();await flush();await flush();
  assert.equal(screen.dataset.step,'world');
  const primary=find(screen,e=>e.tagName==='BUTTON'&&e.textContent==='Review run & cost →');assert.ok(primary,'ready world needs a direct path to run review');
  const before=requests.length;primary.click();await flush();await flush();
  if(['free_review','ai_review'].includes(${JSON.stringify(mode)})){
    assert.ok(screen.textContent.includes('Run this reviewed world?'));assert.equal(requests.length,before+(ai?2:1));if(ai)assert.ok(requests[before].url.endsWith('/typesafe/models'));assert.ok(requests.at(-1).url.endsWith('/review'));assert.equal(JSON.parse(requests.at(-1).opt.body).actor_route,ai?'typesafe':'offline');
    assert.equal(requests.filter(r=>r.url.endsWith('/run')).length,0,'review is not execution approval');
  }else{assert.equal(screen.dataset.step,'plan');assert.equal(requests.length,before,'unconfigured route must not dispatch');}
 }
 console.log('First-time UX recovery passed: '+${JSON.stringify(mode)});
})().catch(e=>{console.error(e);process.exitCode=1;});`;
vm.runInNewContext(harness+checks,{require,__dirname,console,setImmediate,process,URL,Blob});
