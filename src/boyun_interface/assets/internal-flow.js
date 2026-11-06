/* Local developer page only. No provider calls, external content or secrets. */
(() => {
  const map=document.getElementById('map'),status=document.getElementById('status');let revision=-1;
  const add=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
  async function refresh(){
    try{const response=await fetch('/api/internal/flow',{cache:'no-store',credentials:'same-origin'});if(!response.ok)throw Error('Internal map is not enabled.');const data=await response.json();if(data.revision===revision)return;revision=data.revision;map.replaceChildren();
      const nav=data.navigation;if(!nav){status.textContent='Waiting for a local browser to navigate.';return;}
      status.textContent=`${nav.phase} · ${nav.actor_route} · local snapshot ${revision}`;
      for(const step of nav.steps){const box=add('article','',`flow-node${step.id===nav.current?' current':step.visited?' visited':''}`);box.append(add('span',step.input,'eyebrow'),add('h2',step.label),add('p',step.answer||'Not answered'));map.append(box);}
    }catch(error){status.textContent=error.message;}
    finally{window.setTimeout(refresh,1200);}
  }
  refresh();
})();
