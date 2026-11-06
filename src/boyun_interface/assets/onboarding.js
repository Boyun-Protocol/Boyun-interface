/* Provider secrets live only in the transient password field and POST body. */
(()=>{
 'use strict';
 const node=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
 function open({boot,onDone,welcome=false}){
  const prior=document.getElementById('access-dialog');if(prior)return;
  const dialog=node('dialog',undefined,'access-dialog');dialog.id='access-dialog';dialog.setAttribute('aria-labelledby','access-title');
  let busy=false,keyInput=null;
  const clear=()=>{if(keyInput)keyInput.value='';};
  const close=()=>{if(busy)return;clear();dialog.close();dialog.remove();};
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  function button(label,handler,cls='choice'){
   const b=node('button',label,cls);b.type='button';b.addEventListener('click',()=>{if(!busy)handler();});return b;
  }
  function frame(title,hint){
   clear();dialog.replaceChildren();const bar=node('div',undefined,'access-top');bar.append(node('span','PRIVATE SETUP','eyebrow'),button('Close',close,'text-button'));dialog.append(bar);
   const content=node('div',undefined,'access-content'),h=node('h1',title);h.id='access-title';content.append(h,node('p',hint,'question-hint'));dialog.append(content);return content;
  }
  async function configure(mode,accept=false,nextAction=null){
   if(busy)return;
   if(mode==='typesafe'&&(!keyInput||!keyInput.value)){keyInput?.focus();return;}
   const field=keyInput;busy=true;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);
   const error=node('p','','notice error');error.hidden=true;dialog.append(error);
   try{
    // No secret variables, persistence, status text, analytics or URL arguments.
    const response=await fetch('/api/product/access',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-CSRF-Token':boot.csrf_token},body:JSON.stringify({mode,api_key:mode==='typesafe'?field.value:'',accept_host_access:accept})});
    clear();const result=await response.json();if(!response.ok)throw Error('Access setup was rejected. Check the key format and wait for active work to finish.');
    await onDone(nextAction);busy=false;close();
   }catch(_){clear();error.textContent='Setup could not finish. No provider request was made by import. If needed, re-enter the key; no automatic retry.';error.hidden=false;}
   finally{busy=false;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}
  }
  function keyStep(accepted){
   const content=frame('Bring your TypeSafe key.','Stored only in this backend process. Never in browser storage, scenario files or reports. Import makes no provider request.');
   const label=node('label','TypeSafe API key','input-label');keyInput=node('input');keyInput.id='provider-key';label.htmlFor=keyInput.id;keyInput.type='password';keyInput.autocomplete='off';keyInput.spellcheck=false;keyInput.maxLength=4096;keyInput.setAttribute('data-1p-ignore','true');keyInput.setAttribute('data-lpignore','true');keyInput.setAttribute('aria-describedby','key-boundary');
   const boundary=node('p','The provider sees submitted persona state. The host can read process memory. Closing this tab does not remove a key already imported. Choose “Forget imported key” or stop the server. Memory cannot be guaranteed zeroized.','subtle-note');boundary.id='key-boundary';
   const actions=node('div',undefined,'actions-row');actions.append(button('Import for this session',()=>configure('typesafe',accepted),'button primary'),button('Back',start,'text-button'));
   content.append(label,keyInput,boundary,actions);keyInput.focus();
  }
  function trust(){
   const content=frame('Do you trust this preview host?','HTTPS protects the connection. It does not hide your API key or scenario from the host operating this preview.');
   content.append(node('p','Use a limited test key. For stronger host privacy, run the product on your own machine. Keys are isolated by reviewer and released on sign-out or expiry; an already dispatched provider call cannot be recalled.','subtle-note'));
   const actions=node('div',undefined,'actions-row');actions.append(button('I trust this host; continue',()=>keyStep(true),'button primary'),button('Use offline rules instead',()=>configure('offline'),'button secondary'),button('Back',start,'text-button'));content.append(actions);
  }
  async function configureAuthor(mode){
   if(busy)return;
   if(mode==='near_ai'&&(!keyInput?.value||!document.getElementById('author-model')?.value)){keyInput?.focus();return;}
   const field=keyInput;busy=true;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);
   const error=node('p','','notice error');error.hidden=true;dialog.append(error);
   try{
    const response=await fetch('/api/product/author-access',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-CSRF-Token':boot.csrf_token},body:JSON.stringify({mode,api_key:mode==='near_ai'?field.value:'',model:mode==='near_ai'?document.getElementById('author-model').value:'',accept_host_access:boot.access?.hosted===true})});
    clear();if(!response.ok)throw Error('rejected');await response.json();await onDone();busy=false;close();
   }catch(_){clear();error.textContent='Author setup rejected. Check the exact model ID, key format and host consent. Import makes no provider request; no automatic retry.';error.hidden=false;}
   finally{busy=false;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}
  }
  function authorKey(){
   const content=frame('Connect your world architect.','NEAR AI Cloud proposes the world; Jev remains the persona decider. These accounts have separate billing.');
   const label=node('label','NEAR AI Cloud API key','input-label');keyInput=node('input');keyInput.id='provider-key';label.htmlFor=keyInput.id;keyInput.type='password';keyInput.autocomplete='off';keyInput.maxLength=4096;keyInput.spellcheck=false;
   const modelLabel=node('label','Exact model ID from your Cloud catalog','input-label'),model=node('input');model.id='author-model';modelLabel.htmlFor=model.id;model.maxLength=160;model.autocomplete='off';model.spellcheck=false;model.placeholder='namespace/canonical-model-id';
   content.append(label,keyInput,modelLabel,model,node('p','Import does not contact Cloud. Keys remain only in this backend process. The host and selected provider see your brief; this integration does not verify TEE or confidential execution. Closing the tab does not forget the key.','subtle-note'));
   const actions=node('div',undefined,'actions-row');actions.append(button('Import author for this session',()=>configureAuthor('near_ai'),'button primary'),button('Back',start,'text-button'));content.append(actions);keyInput.focus();
  }
  function authorTrust(){
   if(!boot.access?.hosted){authorKey();return;}
   const content=frame('Trust this host with your author key?','The preview host can read the key and private world brief. HTTPS protects transport, not access by the host.');
   content.append(button('I trust this host; set up NEAR AI',authorKey,'button primary'),button('Back',start,'text-button'));
  }
  function start(){
   const first=welcome||!boot.access?.completed;
   const content=frame(first?'Explore a decision before committing.':'AI & privacy',first?'Compare possible scenarios, see how participants respond, and inspect the costs. Start with a small example.':'Change your model access without losing your question. Participant decisions and custom-world authoring are separate.');
   if(first){
    const intro=node('div',undefined,'welcome-intro');intro.append(node('p','1 · Review the people and choices.  2 · Run the example.  3 · Explore the results.','welcome-steps'));
    intro.append(button('Try a free example',()=>configure('offline',false,'example'),'button primary'));
    intro.append(node('p','No account, API key or wallet needed. The free walkthrough uses local rules, not AI. Connect Jev later for AI participant decisions.','welcome-boundary'));
    if(boot.access?.mode==='typesafe'||boot.routes?.author?.imported)intro.append(node('p','Choosing the free walkthrough forgets imported keys and switches to local rules. Saved results remain available.','welcome-boundary'));
    content.append(intro);
   }

   const choices=node('div',undefined,'choices');
   choices.append(button('Offline on this host · local rules, no model calls',()=>configure('offline')),
    button('My TypeSafe key · private session import',()=>boot.access?.hosted?trust():keyStep(false)));
   if(boot.access?.operator_available)choices.append(button('Use the configured TypeSafe operator account · shared call allowance',()=>configure('operator')));
   if(boot.access?.mode!=='offline'){choices.append(button('NEAR AI Cloud · configure world author',authorTrust));if(boot.routes?.author?.imported)choices.append(button('Forget imported world-author key',()=>configureAuthor('none')));}
   let settings=content;
   if(first){const advanced=node('details',undefined,'access-advanced');advanced.append(node('summary','Connect AI or use my own keys'));content.append(advanced);settings=advanced;}
   settings.append(choices,node('p',boot.access?.hosted?'This preview runs on someone else’s machine. Offline here disables external model/NEAR calls; the host still sees scenario data. Download and run locally for local-only data.':'Offline rules are a deterministic utility baseline, not an AI simulation. Live Jev needs internet. Keys are not saved to disk.','subtle-note'));
   if(boot.access?.mode==='typesafe'||boot.routes?.author?.imported)settings.append(button('Forget imported key and switch to offline',()=>configure('offline'),'text-button'));
   if(boot.access?.hosted){const link=node('a','Preview access & sign out','text-button');link.href='/preview';settings.append(link);}
  }
  document.body.append(dialog);start();dialog.showModal();
 }
 window.ScenarioAccess=Object.freeze({open});
})();
