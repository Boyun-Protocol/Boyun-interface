'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const fixture=fs.readFileSync(path.join(__dirname,'product_flow_regression.cjs'),'utf8').split('(async()=>{')[0];
const beforeInit=fixture.replace('vm.runInContext(source,context);',"doc.getElementById('landing').dataset.page='intro';vm.runInContext(source,context);");
vm.runInNewContext(beforeInit+`(async()=>{
 await flush();assert.equal(requests.length,0,'landing does not bootstrap private scenario access');
 assert.equal(elements.get('main').hidden,true,'questions must wait for Start');
 const world=examples.find(e=>e.id==='near-launch-coordination').world;
 for(const id of ['pilot','announce','wait']){
  elements.get('preview-'+id).click();
  const action=world.actors[0].actions.find(a=>a.id===id),output=elements.get('landing-preview').textContent;
  assert.ok(output.includes(new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(action.cost_cents/100)));
  for(const metric of world.metrics.filter(m=>['attention','risk'].includes(m.id)))assert.ok(output.includes(metric.initial+' → '+(metric.initial+(action.effects[metric.id]||0))),'preview must match actual template rules');
 }
 assert.equal(requests.length,0,'example controls are arithmetic only');
 let dialogs=0;boot.access={mode:'operator',completed:true};context.window.ScenarioAccess={open(){dialogs++;}};
 const start=elements.get('landing-start');start.click();start.click();await flush();await flush();
 assert.equal(elements.get('landing').hidden,true);assert.equal(elements.get('main').hidden,false);
 assert.equal(requests.filter(r=>r.url==='/api/product').length,1,'double Start has one bootstrap');
 assert.equal(elements.get('screen').dataset.step,'intent');
 assert.equal(requests.filter(r=>r.opt.method==='POST').length,0,'Start cannot authorize inference or import');
 assert.equal(dialogs,0,'a configured user should not get a second welcome after the landing');
 console.log('Landing precedes questions; Start is one explicit, free transition.');
})().catch(e=>{console.error(e);process.exitCode=1;});`,{require,__dirname,console,setImmediate,process,URL,Blob});
