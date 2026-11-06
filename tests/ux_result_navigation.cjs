'use strict';
// Regression: results must offer a visible next journey, not a hidden flow control.
// Found by /qa on 2026-10-27. Report: docs/decision-lab/UX_REVIEW_2026-10-27.md
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const fixture=fs.readFileSync(path.join(__dirname,'presentation_ui_regression.cjs'),'utf8').split("const root=new El('main')")[0];
vm.runInNewContext(fixture+`
 const root=new El('main');let starts=0;
 const controller=ctx.window.ScenarioDeck.mount(root,deck,{onNew(){starts++;}});
 for(const index of [0,controller.count-1]){
  controller.go(index);
  const find=n=>n.tagName==='BUTTON'&&n.textContent==='New question'?n:n.children.map(find).find(Boolean);
  const start=find(root);assert.ok(start,'results need their own New question action');start.click();
 }
 assert.equal(starts,2);console.log('Every result slide offers an explicit next journey.');
`,{require,__dirname,console});
