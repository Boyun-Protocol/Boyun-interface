/* Presentation of verified recorded data. No model requests or transactions. */
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg', colors = ['#365f79', '#b2844b', '#617f91', '#5c827c'];
  const node = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = String(text); if (cls) n.className = cls; return n; };
  const svgNode = (tag, attrs, text) => { const n = document.createElementNS(NS, tag); Object.entries(attrs || {}).forEach(([k,v]) => n.setAttribute(k,String(v))); if (text !== undefined) n.textContent = String(text); return n; };
  const button = (text, action, cls = 'deck-button') => { const b = node('button',text,cls); b.type = 'button'; b.addEventListener('click',action); return b; };
  const short = (value, count = 90) => { const s = String(value || ''); return s.length > count ? s.slice(0,count-1) + '…' : s; };
  const number = value => new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(value);
  function moneyCents(cents) {
    if (!/^-?\d+$/.test(String(cents))) return 'Not recorded';
    const value=BigInt(cents),abs=value<0n?-value:value;
    return `${value<0n?'-':''}$${(abs/100n).toLocaleString('en-US')}.${String(abs%100n).padStart(2,'0')}`;
  }
  function buildPages(deck) {
    const [overview,outcomes,resources,scenarios,evidence]=deck.slides;
    return [{kind:'overview',data:overview},...outcomes.metrics.map(m=>({kind:'metric',data:m})),
      ...scenarios.clusters.map(c=>({kind:'scenario',data:c})), ...[...new Set(scenarios.actions.map(a=>a.actor_id))].slice(0,3).flatMap(id=>{ const rows=scenarios.actions.filter(a=>a.actor_id===id);return Array.from({length:Math.ceil(rows.length/3)},(_,i)=>({kind:'choices',data:rows.slice(i*3,i*3+3)}));}),{kind:'resources',data:resources},
      ...(deck.decision_insights?[{kind:'insights',data:deck.decision_insights}]:[]),{kind:'network',data:evidence},{kind:'verification',data:evidence}];
  }
  function caption(root,text) { root.append(node('p',text,'deck-caption')); }
  function stat(root,label,value) { const s=node('div',undefined,'deck-stat');s.append(node('strong',value),node('span',label));root.append(s); }
  function chart(title) { return svgNode('svg',{viewBox:'0 0 800 310',role:'img','aria-label':title,class:'deck-chart'}); }
  function lineChart(metric,mode,showWorlds) {
    const svg=chart(`${metric.label}: recorded values by round`),lo=metric.bounds.min,hi=metric.bounds.max,span=Math.max(1,hi-lo);
    const x=i=>60+i/Math.max(1,metric.rounds.length-1)*690,y=v=>255-(v-lo)/span*220;
    for (let i=0;i<5;i++) { const value=lo+span*i/4,py=y(value);svg.append(svgNode('line',{x1:60,y1:py,x2:750,y2:py,class:'chart-grid'}),svgNode('text',{x:48,y:py+4,'text-anchor':'end',class:'chart-label'},number(value))); }
    const path=values=>values.map((v,i)=>`${i?'L':'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
    if(showWorlds)metric.series.forEach((series,i)=>{svg.append(svgNode('path',{d:path(series.values),fill:'none',stroke:colors[i%colors.length],'stroke-width':2,opacity:.45,class:'chart-line',pathLength:1}));});
    svg.append(svgNode('path',{d:path(metric[mode]),fill:'none',stroke:'#294d66','stroke-width':4,class:'chart-line chart-aggregate',pathLength:1}));
    metric[mode].forEach((value,i)=>{const dot=svgNode('circle',{cx:x(i),cy:y(value),r:5,fill:'#294d66',tabindex:0});dot.append(svgNode('title',{},`Round ${metric.rounds[i]}: ${number(value)} ${metric.unit}`));svg.append(dot,svgNode('text',{x:x(i),y:282,'text-anchor':'middle',class:'chart-label'},`R${metric.rounds[i]}`));});
    return svg;
  }
  function networkChart(data) {
    const svg=chart('Reviewed subscription network. Solid links have recorded message deliveries.'),positions=new Map();
    data.nodes.forEach((n,i)=>{const angle=i/Math.max(1,data.nodes.length)*Math.PI*2-Math.PI/2;positions.set(n.id,{x:400+Math.cos(angle)*265,y:150+Math.sin(angle)*110});});
    for (const edge of data.edges) { const a=positions.get(edge.source),b=positions.get(edge.target);if(!a||!b)continue;svg.append(svgNode('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:edge.delivered_messages?'#7b9dae':'#b9cbd6','stroke-width':edge.delivered_messages?2:1,'stroke-dasharray':edge.delivered_messages?'':'4 5',opacity:.65})); }
    data.nodes.forEach((n,i)=>{const p=positions.get(n.id),g=svgNode('g',{tabindex:0,role:'img','aria-label':`${n.name}: ${n.role}`});g.append(svgNode('circle',{cx:p.x,cy:p.y,r:data.nodes.length>20?5:10,fill:colors[i%colors.length],class:'network-node'}),svgNode('title',{},`${n.name}: ${n.role}`));if(data.nodes.length<=12)g.append(svgNode('text',{x:p.x,y:p.y+24,'text-anchor':'middle',class:'chart-label'},short(n.name,22)));svg.append(g);});
    return svg;
  }
  function mount(root,deck,actions={}) {
    if (deck?.schema_version!=='scenario-presentation.v1'||deck.slides?.length!==5) throw new Error('Verified presentation data is unavailable.');
    const pages=buildPages(deck);let index=0,mode='median',showWorlds=true;
    function go(value) { index=Math.max(0,Math.min(pages.length-1,value));render(); }
    function render() {
      root.replaceChildren();root.dataset.deck='true';const shell=node('section',undefined,'result-deck');shell.setAttribute('aria-label','Scenario presentation');
      const top=node('div',undefined,'deck-top');top.append(node('span',`RESULTS · ${index+1} / ${pages.length}`,'eyebrow'),button('Markdown',()=>actions.onReport?.('md'),'text-button'));if(actions.pdfAvailable)top.append(button('PDF',()=>actions.onReport?.('pdf'),'text-button'));top.append(button('All saved runs',()=>actions.onAll?.(),'text-button'));if(actions.onNew)top.append(button('New question',()=>actions.onNew(),'text-button'));if(actions.onReturn)top.append(button('Back to my question',()=>actions.onReturn(),'text-button'));shell.append(top);
      const page=node('section',undefined,'deck-page');page.setAttribute('aria-live','polite');const selected=pages[index],data=selected.data;
      function heading(title,kicker) { if(kicker)page.append(node('p',kicker,'deck-kicker'));page.append(node('h1',title)); }
      if (selected.kind==='overview') {
        heading(short(deck.title,110),'YOUR SCENARIO, EXPLORED');
        const n=deck.denominators,grid=node('div',undefined,'deck-stats');stat(grid,'personas',data.actor_count);stat(grid,'rounds per world',data.round_count);stat(grid,'observed outcomes',deck.slides[3].clusters.length);page.append(grid);
        const complete=node('div',undefined,'deck-completion');const ring=svgNode('svg',{viewBox:'0 0 120 120',role:'img','aria-label':`${n.completed_worlds} completed worlds`,class:'completion-ring'});
        ring.append(svgNode('circle',{cx:60,cy:60,r:50,fill:'none',stroke:'#e1ebf2','stroke-width':8}),svgNode('circle',{cx:60,cy:60,r:50,fill:'none',stroke:'#668ca5','stroke-width':8,'stroke-dasharray':`${n.requested_worlds?314*n.completed_worlds/n.requested_worlds:314} 314`,transform:'rotate(-90 60 60)',class:'completion-arc'}),svgNode('text',{x:60,y:68,'text-anchor':'middle',class:'completion-number'},n.completed_worlds));
        const copy=node('div');copy.append(node('h2',`${n.completed_worlds} completed ${n.completed_worlds===1?'world':'worlds'}`),node('p',n.requested_worlds===null?'Original requested total was not recorded.':`${n.requested_worlds} requested · ${n.uncompleted_worlds} incomplete`),node('p',short(data.models?.join(' · ')||(deck.slides[2].provider.local_decision_turns?'Offline rules · zero model calls':'Recorded model decisions'),100),'deck-caption'));complete.append(ring,copy);page.append(complete);
        caption(page,'Explore the recorded alternatives. These runs do not establish real-world success odds.');
      } else if (selected.kind==='metric') {
        heading(data.label,'HOW THE WORLD CHANGED');
        const tools=node('div',undefined,'chart-tools');for(const option of ['median','mean']){const b=button(option==='median'?'Median':'Mean',()=>{mode=option;render();});b.setAttribute('aria-pressed',String(mode===option));tools.append(b);}const worlds=button('Individual worlds',()=>{showWorlds=!showWorlds;render();});worlds.setAttribute('aria-pressed',String(showWorlds));tools.append(worlds,node('span',`${data.unit} · scale ${data.bounds.min}–${data.bounds.max}`,'deck-caption'));page.append(tools,lineChart(data,mode,showWorlds));
        const stats=node('div',undefined,'deck-stats compact');stat(stats,'started at',number(data.initial));stat(stats,`final ${mode}`,number(data.final[mode]));stat(stats,'observed range',`${number(data.final.min)}–${number(data.final.max)}`);page.append(stats);
        caption(page,`${showWorlds?'Thin lines are recorded worlds. ':'Individual world lines are hidden. '}The bold line is the selected aggregate. R0 is the supplied initial state.`);
      } else if (selected.kind==='scenario') {
        heading(data.label,'ONE RECORDED OUTCOME');const band=node('div',undefined,'scenario-band');band.append(node('strong',`${data.count} of ${deck.denominators.completed_worlds}`),node('span','completed worlds reached this exact outcome'));page.append(band);
        const grid=node('div',undefined,'scenario-metrics');for(const [id,value]of Object.entries(data.final_metrics)){const definition=deck.slides[1].metrics.find(m=>m.id===id);stat(grid,definition?.label||id,number(value));}page.append(grid);
        const path=node('div',undefined,'scenario-path');for(const actor of data.representative_actions.slice(0,2)){path.append(node('p',`${short(actor.name,28)} → ${actor.sequence.map(s=>short(s.label,28)).join(' → ')}`));}page.append(path,node('p',`${moneyCents(data.total_cost_cents)} in modeled action spending`,'spend-label'));
        caption(page,'One representative recorded path. Run frequency is conditional on these rules, not an event probability or profit forecast.');
      } else if (selected.kind==='choices') {
        heading(short(data[0]?.name||'Persona',70),'PREFERENCES & ACTUAL CHOICES');
        const bars=node('div',undefined,'choice-comparison');for(const action of data.slice(0,5)) {
          const group=node('div',undefined,'choice-comparison-row');group.append(node('strong',short(action.label,65)));
          for(const [key,label]of [['mean_model_score','Mean model score'],['selection_frequency','Actually chosen']]) {
            const row=node('div',undefined,'comparison-series'),track=node('div',undefined,'comparison-track'),fill=node('div',undefined,key==='mean_model_score'?'comparison-model':'comparison-chosen');
            fill.style.width=`${Math.max(0,Math.min(1,action[key]||0))*100}%`;track.append(fill);
            row.append(node('span',label),track,node('span',action[key]===null?'n/a':`${number(action[key]*100)}%`));group.append(row);
          }bars.append(group);
        }page.append(bars);caption(page,'Model scores are averaged only where the action was affordable. Actual choices count completed decisions. Neither is a probability of market success. Jev returns no reasoning trace; these scores do not explain its internal process.');
      } else if (selected.kind==='resources') {
        heading('Where resources went','MODELED COSTS');const bars=node('div',undefined,'resource-bars');const actors=[...data.actors].sort((a,b)=>b.cost_fraction-a.cost_fraction).slice(0,4);
        for(const actor of actors){const row=node('div',undefined,'resource-row'),labels=node('div',undefined,'resource-labels');labels.append(node('span',short(actor.name,36)),node('strong',`$${actor.mean_cost_usd}`));const track=node('div',undefined,'resource-track'),fill=node('div',undefined,'resource-fill');fill.style.width=`${Math.max(0,Math.min(1,actor.cost_fraction))*100}%`;track.append(fill);row.append(labels,track);bars.append(row);}page.append(bars);
        const bill=node('div',undefined,'provider-strip');stat(bill,'actor calls recorded',data.provider.recorded_model_calls);if(data.provider.local_decision_turns)stat(bill,'local rule turns',data.provider.local_decision_turns);stat(bill,'TypeSafe input tokens recorded',data.provider.recorded_input_tokens??'Unknown');stat(bill,'input cost estimate',data.provider.input_cost_estimate_usd==null?'Unknown':'$'+data.provider.input_cost_estimate_usd);page.append(bill);
        caption(page,'Top four spending fractions; labels are mean action costs per world. API charges are separate and unknown. Native input usage is provider-reported, not attested; list-price estimates are not bills. Authoring and incomplete calls are excluded.');
      } else if(selected.kind==='insights'){
        heading('What the choices actually changed','CASH & STRATEGIC CHECKS');
        const resources=data.resources,opening=data.strategic.status!=='computed'&&data.opening_game?.status==='computed',game=opening?data.opening_game:data.strategic,grid=node('div',undefined,'deck-stats compact');
        if(resources.status==='reconciled'||resources.status==='computed'){
          const total=resources.aggregate;
          stat(grid,'cash at start · all recorded worlds',moneyCents(total.initial_cash_cents));stat(grid,'action costs · all recorded worlds',moneyCents(total.action_cost_cents));stat(grid,'cash remaining · all recorded worlds',moneyCents(total.remaining_cash_cents));page.append(grid);
        }else if(resources.aggregate){
          stat(grid,'action costs · all recorded worlds',moneyCents(resources.aggregate.action_cost_cents));stat(grid,'cash remaining · all recorded worlds',moneyCents(resources.aggregate.remaining_cash_cents));page.append(grid);
        }
        caption(page,'Initial cash − modeled costs = remaining cash. Summed worlds are separate hypothetical experiments. Revenue, API charges and token sales are outside this ledger; remaining cash is not profit.');
        if(game.status==='computed'){
          const checks=node('div',undefined,'deck-stats compact');stat(checks,opening?'pure equilibria · FIRST ROUND ONLY':'pure equilibria in the supplied one-round game',game.pure_nash_profiles.length);stat(checks,'strictly dominated actions',game.strictly_dominated_actions.length);page.append(checks);caption(page,opening?'FIRST ROUND ONLY: an author-omniscient static diagnostic. Future messages, events, commitments and reactions are excluded. This does not solve the full repeated game.':'Exact checks over the reviewed payoff table. They do not establish what people will choose or solve a larger repeated game.');
        }else caption(page,game.reason||'A full strategic equilibrium is not computed for this world.');
      } else if (selected.kind==='network') {
        heading('Who could hear whom','THE REVIEWED NETWORK');page.append(networkChart(data));const stats=node('div',undefined,'deck-stats compact');stat(stats,'personas',data.nodes.length);stat(stats,'publications',data.counts.published_messages);stat(stats,'distinct deliveries',data.counts.distinct_deliveries);page.append(stats);caption(page,'Edges are subscriptions, not proven causal influence. Dashed links have no recorded deliveries in these worlds.');
      } else {
        heading('Keep the result verifiable','EVIDENCE & NEAR');const cards=node('div',undefined,'verification-grid');
        for(const [title,value]of [['Rule replay','Verified'],['Observed references',data.source_refs.length],['Assumed parameters',data.provenance_counts.assumed||0]]){const card=node('div',undefined,'verification-card');card.append(node('strong',value),node('span',title));cards.append(card);}page.append(cards);
        const row=node('div',undefined,'actions-row');row.append(button('Record on NEAR testnet',()=>actions.onNear?.(),'button primary'),button('Inspect exact records',()=>actions.onDetails?.(),'text-button'));page.append(row);
        caption(page,'A salted commitment can verify that these exact bytes were recorded. It does not prove forecasting accuracy, authorship or anonymity. Scenario details stay off chain.');
      }
      shell.append(page);const bottom=node('nav',undefined,'deck-navigation');bottom.setAttribute('aria-label','Presentation navigation');const previous=button('← Previous',()=>go(index-1));previous.disabled=index===0;const next=button(index===pages.length-1?'Download data':'Next →',()=>index===pages.length-1?actions.onDownload?.():go(index+1),'deck-button primary');bottom.append(previous,node('span',`${index+1} / ${pages.length}`,'deck-pagination'),next);shell.append(bottom);root.append(shell);
    }
    render();return{get count(){return pages.length;},get index(){return index;},next:()=>go(index+1),back:()=>go(index-1),go};
  }
  window.ScenarioDeck=Object.freeze({mount,buildPages,moneyCents});
})();
