'use strict';
// Regression: custom-flow privacy exits and history detours must preserve work.
// Found by /qa on 2026-10-27. Report: docs/decision-lab/UX_REVIEW_2026-10-27.md
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const fixture=fs.readFileSync(path.join(__dirname,'product_flow_regression.cjs'),'utf8').split('(async()=>{')[0];
const scenario=process.argv[2];
vm.runInNewContext(fixture+`(async()=>{
 await flush();await flush();boot.access={mode:'operator',completed:true};
 boot.routes.author={enabled:true,provider:'near_ai',model:'fixture-cloud',public_only:false};
 const screen=elements.get('screen');
 const choose=value=>{const b=find(screen,e=>e.dataset?.value===value);assert.ok(b,value);b.click();elements.get('next').click();};
 choose('launch');choose('custom');
 const brief='Should I wait or launch a small pilot? My own confidential brief.';
 const field=find(screen,e=>e.tagName==='TEXTAREA');field.value=brief;field.listeners.input({target:field});
 if(${JSON.stringify(scenario)}==='privacy_exit'){
  for(let i=0;i<20&&screen.dataset.step!=='privacy';i++)elements.get('next').click();
  choose('false');assert.equal(screen.dataset.step,'starter','refusal must return to ready worlds, not disabled authoring');
  choose('custom');assert.equal(find(screen,e=>e.tagName==='TEXTAREA').value,brief);
 }else if(${JSON.stringify(scenario)}==='library_return'){
  const run={session_id:'a'.repeat(32),run_id:'run-'+'b'.repeat(32),title:'Earlier result',completed_worlds:1,requested_worlds:1,actor_count:2,rounds:2};
  responder=url=>url==='/api/product/results'?{runs:[run]}:{id:run.session_id,run_id:run.run_id,status:'completed',proposal:{world:examples[0].world},results:[]};
  context.window.ScenarioDeck={mount(root,deck,actions){const b=new El('BUTTON',doc);b.textContent='Back to my question';b.addEventListener('click',()=>actions.onReturn?.());root.append(b);return{index:0,go(){}};}};
  elements.get('saved-results').click();await flush();await flush();
  let back=find(screen,e=>e.tagName==='BUTTON'&&e.textContent==='Back to my question');assert.ok(back,'history needs a way back to the unsent question');
  find(screen,e=>e.tagName==='BUTTON'&&e.textContent==='Open results →').click();await flush();await flush();await flush();
  back=find(screen,e=>e.tagName==='BUTTON'&&e.textContent==='Back to my question');back.click();
  assert.equal(screen.dataset.step,'description');assert.equal(find(screen,e=>e.tagName==='TEXTAREA').value,brief);
 }else if(${JSON.stringify(scenario)}==='focused_followups'){
  elements.get('next').click();elements.get('next').click();choose('Cautious retail participants');choose('cautious');
  assert.equal(screen.dataset.step,'depth','retail focus should not force unrelated team questions');
  const normalized=context.window.ScenarioFlow.personaOptions({intent:'launch',focus:'Cautious retail participants',retailStyle:'cautious',teamPriority:'marketing'});
  assert.equal(normalized.team_priority,'balanced','hidden earlier team preference cannot leak into a retail-focused request');
 }
 assert.equal(requests.filter(r=>r.opt.method==='POST').length,0,'navigation never authorizes model requests');
 console.log('Custom journey passed: '+${JSON.stringify(scenario)});
})().catch(e=>{console.error(e);process.exitCode=1;});`,{require,__dirname,console,setImmediate,process,URL,Blob});
