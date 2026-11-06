'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
class El{constructor(tag){this.tagName=tag;this.children=[];this.listeners={};this.value='';this.disabled=false;}append(...n){this.children.push(...n);}replaceChildren(...n){this.children=n;}setAttribute(){}addEventListener(k,v){this.listeners[k]=v;}showModal(){}close(){}remove(){this.removed=true;}focus(){}querySelectorAll(tag){return this.children.flatMap(n=>[...(n.tagName===tag?[n]:[]),...n.querySelectorAll(tag)]);}click(){if(!this.disabled)this.listeners.click?.();}}
const body=new El('body'),requests=[],stored=[];let done=0;
const window={};const ctx=vm.createContext({window,document:{body,getElementById:id=>{const visit=n=>n.id===id&&!n.removed?n:n.children.filter(c=>!c.removed).map(visit).find(Boolean);return visit(body);},createElement:tag=>new El(tag)},fetch:async(url,opt)=>{requests.push({url,opt});return {ok:true,json:async()=>({completed:true})};},localStorage:{setItem:()=>stored.push('local')},sessionStorage:{setItem:()=>stored.push('session')}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/boyun_interface/assets/onboarding.js'),'utf8'),ctx);
const find=(root,text)=>root.querySelectorAll('button').find(n=>n.textContent===text);const flush=()=>new Promise(r=>setImmediate(r));
(async()=>{
 const boot={csrf_token:'fixture',access:{hosted:true,operator_available:true,mode:'typesafe'}};
 window.ScenarioAccess.open({boot,onDone:async()=>done++});let dialog=body.children.at(-1);
 find(dialog,'My TypeSafe key · private session import').click();
 assert.ok(find(dialog,'I trust this host; continue'));assert.equal(requests.length,0);
 find(dialog,'I trust this host; continue').click();let field=dialog.querySelectorAll('input')[0];
 assert.equal(field.type,'password');field.value='transient-test-key';find(dialog,'Import for this session').click();await flush();await flush();
 assert.equal(requests.length,1);const request=requests[0];assert.equal(request.url,'/api/product/access');assert.equal(request.opt.headers['X-CSRF-Token'],'fixture');
 assert.equal(JSON.parse(request.opt.body).mode,'typesafe');assert.equal(JSON.parse(request.opt.body).accept_host_access,true);assert.equal(field.value,'');assert.equal(done,1);assert.equal(stored.length,0);
 window.ScenarioAccess.open({boot,onDone:async()=>done++});dialog=body.children.at(-1);find(dialog,'My TypeSafe key · private session import').click();find(dialog,'I trust this host; continue').click();field=dialog.querySelectorAll('input')[0];field.value='discard-this';find(dialog,'Close').click();assert.equal(field.value,'');assert.equal(requests.length,1);
 window.ScenarioAccess.open({boot,onDone:async()=>done++});dialog=body.children.at(-1);
 find(dialog,'NEAR AI Cloud · configure world author').click();assert.ok(find(dialog,'I trust this host; set up NEAR AI'));
 find(dialog,'I trust this host; set up NEAR AI').click();
 const fields=dialog.querySelectorAll('input');fields[0].value='invented-author-test-key';fields[1].value='canonical/model';
 find(dialog,'Import author for this session').click();await flush();await flush();
 assert.equal(requests.length,2);assert.equal(requests[1].url,'/api/product/author-access');
 const authorBody=JSON.parse(requests[1].opt.body);assert.equal(authorBody.model,'canonical/model');assert.equal(authorBody.accept_host_access,true);assert.equal(authorBody.mode,'near_ai');
 assert.equal(fields[0].value,'');assert.equal(stored.length,0);
 console.log('Onboarding: host trust before key entry, CSRF POST only, password reset, no persistence and no provider evaluation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
