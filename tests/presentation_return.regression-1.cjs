'use strict';
// Regression: a history detour must retain a working return action on every slide.
// Found by /qa on 2026-10-27. Report: docs/decision-lab/UX_REVIEW_2026-10-27.md
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const fixture=fs.readFileSync(path.join(__dirname,'presentation_ui_regression.cjs'),'utf8').split("const root=new El('main')")[0];
vm.runInNewContext(fixture+`
 const root=new El('main');let returns=0;
 const controller=ctx.window.ScenarioDeck.mount(root,deck,{onReturn(){returns++;}});
 function find(n){return n.tagName==='BUTTON'&&n.textContent==='Back to my question'?n:n.children.map(find).find(Boolean);}
 for(const index of [0,controller.count-1]){controller.go(index);const back=find(root);assert.ok(back);back.click();}
 assert.equal(returns,2);
 ctx.window.ScenarioDeck.mount(root,deck,{});assert.ok(!find(root),'no misleading return action without a retained draft');
 console.log('Presentation return is explicit and only shown for a retained question.');
`,{require,__dirname,console});
