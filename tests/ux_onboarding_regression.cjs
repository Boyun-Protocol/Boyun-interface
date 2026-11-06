'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const prefix=fs.readFileSync(path.join(__dirname,'onboarding_ui_regression.cjs'),'utf8').split('(async()=>{')[0];
const checks=`(async()=>{
 let action;
 window.ScenarioAccess.open({welcome:true,boot:{csrf_token:'fixture',access:{completed:true,hosted:false,mode:'operator',operator_available:true}},onDone:async value=>action=value});
 const dialog=body.children.at(-1);
 assert.equal(requests.length,0,'opening welcome cannot call a provider');
 const trial=find(dialog,'Try a free example');assert.ok(trial,'new users need a no-key example first');
 const advanced=dialog.querySelectorAll('details');assert.equal(advanced.length,1,'provider choices belong in optional setup');assert.ok(!advanced[0].open);
 trial.click();await flush();await flush();
 assert.equal(action,'example');assert.equal(requests.length,1);assert.equal(requests[0].url,'/api/product/access');
 assert.equal(JSON.parse(requests[0].opt.body).mode,'offline');assert.equal(stored.length,0);
 console.log('Welcome: free rules walkthrough, optional provider setup, no implicit paid inference.');
})().catch(e=>{console.error(e);process.exitCode=1;});`;
vm.runInNewContext(prefix+checks,{require,__dirname,console,setImmediate,process});
