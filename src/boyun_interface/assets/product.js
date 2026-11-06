/* One-question local workflow. Navigation is inert; model dispatch is explicit. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const clone = value => JSON.parse(JSON.stringify(value));
  const usd = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: value % 1 ? 2 : 0 }).format(value);
  const number = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  const S = { boot: null, session: null, world: null, mode: 'setup', steps: [], index: 0,
    answers: { intent: null, description: '', capital: 10000, focus: 'Balanced view', depth: 2, public: null, start: null, retailStyle: 'balanced', teamPriority: 'balanced' },
    settings: { mode: 'argmax', worlds: 1, actorRoute: 'typesafe' }, typesafeHealth: null, profiles: {}, clarifications: {}, custom: '',
    slidePositions: {}, busy: false, timer: null, epoch: 0, pollFailures: 0, direction: 1, savedRuns: [], savedView: null, advanceTimer: null, transitioning: false, deck: null, deckKey: null, deckController: null, deckLoading: false, detailsMode: false, nearState: null, walletAccount: null, walletPlan: null, walletResult: null, walletAttempted: false, walletHash: null };
  const DESCRIPTIONS = {
    launch: 'I want to launch a NEAR community token with $10,000. Compare a small transparent pilot with a broad launch announcement. Who could respond, and what should I pay attention to?',
    defi: 'Our DeFi team has $10,000. Should we prioritize reliability work or temporary incentives? Compare the team’s choices with an independent liquidity allocator’s response.',
    ticker: 'Compare PARIS, PARS and RIVE as ticker names for a hypothetical Paris-themed NEAR community token. Consider recognition, confusion and different audience preferences. Do not predict token returns.',
    other: 'I am deciding between two approaches to a crypto project. Help me define the participants, their incentives, constraints and available actions.'
  };
  function el(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = String(text); if (className) node.className = className; return node; }
  function button(text, handler, className = 'button secondary') { const b = el('button', text, className); b.type = 'button'; b.addEventListener('click', () => { if (!S.busy && !S.transitioning) handler(); }); return b; }
  function message(text) { $('announcer').textContent = text; }
  function error(text = '') { $('error').textContent = text; $('error').hidden = !text; if (text) message(text); }
  function recommendAlpha(score) { return Number.isFinite(score) ? .025 + .09 * Math.max(0, Math.min(1, score)) : .025; }
  function shade(node, score) { node.style.setProperty('--choice-alpha', String(recommendAlpha(score))); }
  function sliderValue(value, min, max, step) { return Math.max(min, Math.min(max, min + Math.round((Number(value) - min) / step) * step)); }
  function buildBrief(a) {
    const capital = ['launch', 'defi'].includes(a.intent) ? `Creator/team capital is ${usd(a.capital)}. This amount supersedes any earlier example capital in the description. ` : '';
    const preferences = personaOptions(a);
    return `${a.description}\n${capital}Focus: ${a.focus==='Cautious retail participants'?'Retail participants':a.focus}. Retail style: ${preferences.retail_style} (speculative/degen seeks momentum; cautious seeks evidence). Team priority: ${preferences.team_priority} (marketing versus liquidity/market-making readiness). These are requested motivations, not numeric probabilities or an allocation of funds. Expose any proposed spending plan separately within existing capital, and do not invent live market-making execution. Use exactly ${a.depth} actors and initially two rounds. More persona detail must not add capital or imply population/market share. Identify explicit hypothetical motivations, goals, private information, affordable actions and joint interactions. Preserve a wait action. Do not invent calibrated event odds or implement unsupported financial settlement.`;
  }
  function authoringPlan(answers) {
    if (answers.depth <= 12) return null;
    const plan = { mode: 'batched', actor_count: answers.depth, batch_size: 20, max_calls: 1 + Math.ceil(answers.depth / 20) };
    if (['launch', 'defi'].includes(answers.intent)) plan.creator_capital_cents = Math.round(answers.capital * 100);
    return plan;
  }
  function keyNavigation(event, kind) {
    if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey || event.defaultPrevented || event.isComposing) return null;
    if (['results', 'library', 'loading'].includes(kind)) return null;
    const tag = event.target?.tagName;
    if (['TEXTAREA', 'INPUT', 'SELECT'].includes(tag) || event.target?.isContentEditable) return null;
    if (event.key === 'ArrowUp') return 'back';
    if (event.key === 'ArrowDown' && kind === 'question') return 'next';
    return null; // No keyboard navigation dispatches a model request.
  }
  function route(id = S.settings.actorRoute) { return S.boot?.routes?.actors?.find(item => item.id === id); }
  function callLimit() { return S.boot?.limits?.max_calls || 96; }
  function authorName() { return S.boot?.routes?.author?.provider==='near_ai' ? 'NEAR AI Cloud' : 'Gemini'; }
  function actorName() { return S.settings.actorRoute === 'offline' ? 'Offline rules' : S.settings.actorRoute === 'typesafe' ? 'Jev' : 'Gemini'; }
  function needsPublic() { return route()?.public_only === true; }
  function active() { return ['authoring', 'running'].includes(S.session?.status) && S.mode === 'loading'; }
  function current() { return S.steps[S.index]; }
  function stoppedPoll() { if (S.timer) clearTimeout(S.timer); S.timer = null; }
  function saveSession() { try { localStorage.setItem('scenario-product-session', S.session.id); } catch (_) {} }
  function storedSession() { try { return localStorage.getItem('scenario-product-session'); } catch (_) { return null; } }
  function sessionPath(suffix = '') { return `/api/product/sessions/${encodeURIComponent(S.session.id)}${suffix}`; }
  async function api(path, data) {
    const options = { method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } };
    if (data !== undefined) { options.headers['Content-Type'] = 'application/json'; options.headers['X-CSRF-Token'] = S.boot.csrf_token; options.body = JSON.stringify(data); }
    let reply; try { reply = await fetch(path, options); } catch (_) { throw new Error('Cannot reach the local backend. No model request is automatically retried.'); }
    let dataReply; try { dataReply = await reply.json(); } catch (_) { throw new Error('The backend returned an unreadable reply. No automatic retry.'); }
    if (!reply.ok) throw new Error(dataReply.error || `Request rejected (${reply.status}). Check the current world and call limit.`);
    return dataReply;
  }
  async function operation(work) {
    if (S.busy || active()) return;
    cancelAdvance(); error(); S.busy = true; render();
    try { await work(); } catch (failure) { error(failure.message || 'The operation stopped. No automatic retry.'); }
    finally { S.busy = false; render(); }
  }
  function exampleFor(intent) {
    const id = { launch: 'near-launch-coordination', defi: S.answers.readyWorld === 'near-pilot-eight-roles' ? 'near-pilot-eight-roles' : 'defi-incentive-coordination', ticker: 'ticker-choice-coordination' }[intent];
    return S.boot?.examples?.find(example => example.id === id);
  }
  function questionTempo(index, count, mode) {
    const quick = (mode === 'setup' && index < 2) || index >= count - 2;
    return { pace: quick ? 'quick' : 'consider', duration: quick ? 360 : 680, delay: quick ? 120 : 200 };
  }
  function preferredActor(boot) { return boot?.access?.mode==='offline' ? 'offline' : boot?.routes?.actors?.some(r => r.id === 'typesafe' && r.enabled) ? 'typesafe' : null; }
  function setupSteps() {
    const a = S.answers;
    const steps = [{ id: 'intent', title: 'What would you like to explore?', hint: 'Start with one decision. We’ll build the world around it.', kind: 'question', type: 'choices',
      value: () => a.intent, choose: v => { if (a.intent !== v) { a.start = null; a.description = DESCRIPTIONS[v]; } a.intent = v; },
      options: [
        ...(S.boot.near_demo?.available?[{value:'observed-near',label:'Explore a NEAR pilot with observed market data',description:'Freeze the current public archive, review sources and run a bounded pilot-versus-commitment decision.'}]:[]),
        { value: 'launch', label: 'Launch a community token', description: 'Explore incentives, attention and coordination around a NEAR launch.' },
        { value: 'defi', label: 'Build a DeFi product', description: 'Compare reliability, incentives and participant responses.' },
        { value: 'ticker', label: 'Choose a ticker name', description: 'A smaller decision about recognition, fit and confusion.' },
        { value: 'other', label: 'Something else', description: S.boot.routes.author.enabled ? 'Describe your own crypto or finance decision.' : 'Custom world authoring is disabled in this reviewer preview. Choose a ready example.', disabled: !S.boot.routes.author.enabled }
      ] }];
    if(a.intent==='observed-near'){
      steps.push({id:'observed-near',kind:'submit',title:'Freeze a real NEAR snapshot.',hint:'Public sampled swaps provide context. Persona motives, budgets and effects remain reviewed assumptions; this does not forecast token returns.',render:()=>{$('screen').append(button('Load sources and review the NEAR world →',()=>operation(async()=>{const snapshot=await api('/api/product/near-demo',{});accept(snapshot,'example');}),'button primary'));}});
      return steps;
    }
    const example = exampleFor(a.intent);
    if (example) steps.push({ id: 'starter', title: 'Where should we begin?', hint: 'Ready worlds use reviewed templates. Custom worlds need a separate authoring model.', kind: 'question', type: 'choices', value: () => a.start, choose: v => { a.start = v; }, options: [
      { value: 'prepared', label: 'Start with a ready world', description: 'Review this fictional example, then use your selected decision route. No authoring calls.', suggestion: 'Quickest start', guidance: 1 },
      { value: 'custom', label: 'Describe my own world', description: `Use ${authorName()} to propose the world, then Jev for persona decisions.`, disabled: !S.boot.routes.author.enabled, guidance: .35 }
    ] });
    if (example && a.start !== 'custom') {
      if (a.start === 'prepared' && a.intent === 'defi' && S.boot.examples.some(e => e.id === 'near-pilot-eight-roles')) steps.push({
        id: 'ready-world', kind: 'question', type: 'choices', title: 'How much of the interaction should we explore?',
        hint: 'Both worlds are fictional, reviewed starting points. More roles add different incentives, not proven realism.',
        value: () => a.readyWorld || 'defi-incentive-coordination', choose: v => { a.readyWorld = v; },
        options: [{value:'defi-incentive-coordination', label:'A small coordination game', description:'Isolate the original DeFi incentive mechanism.'},
          {value:'near-pilot-eight-roles',label:'NEAR pilot · eight distinct incentives',description:'Founder, treasury, reviewer, sponsor, two retail perspectives, a large participant and a partner share one $10,000 cast budget.'}]
      });
      if (a.start === 'prepared') steps.push(...personaSetupSteps(a),{id:'prepared-review',kind:'submit',title:'Your starting perspectives.',render:()=>{const preferences=personaOptions(a);summary([['Focus',a.focus==='Cautious retail participants'?'Retail participants':a.focus],['Retail behavior',preferences.retail_style],['Team priority',preferences.team_priority],['Decision route',S.boot.access?.mode==='offline'?'Offline rules · no inference':'Jev · no authoring call']]);$('screen').append(button('Build these personas from the ready world →',()=>loadExample(example),'button primary'));}});
      return steps;
    }
    steps.push(
      { id: 'description', title: 'Tell us the situation.', hint: 'One description is enough. The agent can ask for missing details later.', kind: 'question', type: 'text', value: () => a.description, change: v => { a.description = v; }, maxLength: 6000 });
    if (['launch', 'defi'].includes(a.intent)) steps.push({ id: 'capital', title: 'How much capital is available?', hint: 'The creator or team’s starting budget. More capital adds capacity, not guaranteed demand or profit.', kind: 'question', type: 'slider',
      min: 1000, max: 100000, step: 500, unit: 'USD', format: usd, value: () => a.capital, change: v => { a.capital = v; }, presets: [1000, 10000, 25000, 100000] });
    steps.push({ id: 'focus', title: 'Whose perspective matters most?', hint: 'This guides persona detail. It does not silently increase their capital or market influence.', kind: 'question', type: 'choices', value: () => a.focus, choose: v => { a.focus = v; }, options: [
      { value: 'Balanced view', label: 'A balanced view', description: 'Start with contrasting participants around the decision.' },
      { value: 'Cautious retail participants', label: 'Retail participants', description: 'Explore speculative or cautious behavior in the next question.' },
      { value: 'Large wallets and liquidity providers', label: 'Large wallets & liquidity providers', description: 'Explore alternative incentives without inferring real identities or motives.' },
      { value: 'Project team and independent partners', label: 'The team & independent partners', description: 'Focus on commitments, opportunity costs and coordination.' }
    ] });
    steps.push(...personaFollowups(a), { id: 'depth', title: 'How many personas should we start with?', hint: 'Start with two for a focused first run, or expand to 10, 20 or more. Larger casts use sparse peer links and more model calls. Profile detail must not silently add capital or market influence.', kind: 'question', type: 'slider', min: 2, max: S.boot?.limits?.max_actors || 12, step: 1, unit: 'personas', format: v => `${v} personas`, value: () => a.depth, change: v => { a.depth = v; }, presets: [2, 10, 20, 100]
    }, privacyStep(), { id: 'build', kind: 'submit', title: 'Ready to construct your world?', hint: `${authorName()} will propose the cast, incentives and rules. You’ll review them before any persona simulation.`, render: renderBuild });
    return steps;
  }
  function personaOptions(a) {
    return {focus:a.focus==='Cautious retail participants'?'retail':a.focus==='Large wallets and liquidity providers'?'liquidity':a.focus==='Project team and independent partners'?'team':'balanced',retail_style:['Balanced view','Cautious retail participants'].includes(a.focus)?a.retailStyle||'balanced':'balanced',team_priority:((a.focus==='Balanced view'&&['launch','defi'].includes(a.intent))||a.focus==='Project team and independent partners')?a.teamPriority||'balanced':'balanced'};
  }
  function personaFollowups(a) {
    const steps=[];
    if (['Balanced view','Cautious retail participants'].includes(a.focus)) steps.push({id:'retail-style',kind:'question',type:'choices',title:'How should retail participants behave?',hint:'A hypothetical decision style. Capital and market influence stay unchanged.',value:()=>a.retailStyle,choose:v=>a.retailStyle=v,options:[{value:'balanced',label:'Mix curiosity with caution',guidance:.55},{value:'degen',label:'More degen / momentum-seeking',description:'Explore trends and social signals; the action menu and cash limits still apply.'},{value:'cautious',label:'More cautious / evidence-seeking',description:'Prioritize verification, downside and waiting.'}]});
    if ((a.focus==='Balanced view'&&['launch','defi'].includes(a.intent))||a.focus==='Project team and independent partners') steps.push({id:'team-priority',kind:'question',type:'choices',title:'What should the team prioritize?',hint:'This shapes motivation, not a cash transfer. Any spending must still use the reviewed actions.',value:()=>a.teamPriority,choose:v=>a.teamPriority=v,options:[{value:'balanced',label:'Balance visibility and readiness',guidance:.55},{value:'marketing',label:'More marketing & audience discovery'},{value:'liquidity',label:'More liquidity & market-making readiness',description:'Planning emphasis only. This engine does not execute market-maker trades or fund a liquidity position.'}]});
    return steps;
  }
  function personaSetupSteps(a) {
    return [{id:'focus',kind:'question',type:'choices',title:'Whose perspective matters most?',hint:'Refine the ready profiles without changing their cash or numeric rules.',value:()=>a.focus,choose:v=>a.focus=v,options:[{value:'Balanced view',label:'A balanced view'},{value:'Cautious retail participants',label:'Retail participants'},{value:'Large wallets and liquidity providers',label:'Whales & liquidity providers'},{value:'Project team and independent partners',label:'Team & partners'}]},...personaFollowups(a)];
  }
  function privacyStep() {
    const privateCapable=S.boot?.routes?.author?.public_only===false;
    return { id: 'privacy', kind: 'question', type: 'choices', title: privateCapable?'May we send this brief to your selected author?':'Is this information public or fictional?', hint: privateCapable?`${authorName()} and this host receive the brief and proposed world. No TEE attestation is verified; Jev separately receives persona state.`:'The Gemini development route requires public inputs. The scenario stays off chain, but the model receives the data you submit.', value: () => S.answers.public, choose: v => { S.answers.public = v; }, options: [
      { value: true, label: privateCapable?'Allow this provider to process my brief':'Yes — public or fictional information', description: privateCapable?'This author-call consent is separate from paid Jev execution.':'Allow this scenario to be sent through the configured Gemini route.' },
      { value: false, label: privateCapable?'Do not send; return to ready worlds':'It contains confidential details', description: privateCapable?'Use a ready world or your own validated JSON without authoring.':'Remove confidential details before using the development route.' }
    ] };
  }

  function reviewSteps() {
    const world = S.world;
    const steps = [{ id: 'world', title: world.title, hint: world.description, kind: 'question', type: 'overview' }];
    if (world.actors.length > 6) steps.push({ id: 'cast', title: `Review your ${world.actors.length} personas.`, hint: 'Keep the cast together. Open a profile only when you want to inspect or revise it. More profiles do not create extra capital.', kind: 'question', type: 'cast', render: renderCast });
    else for (const actor of world.actors) steps.push({ id: `persona-${actor.id}`, title: `How should ${actor.name} approach this?`, hint: actor.role, kind: 'question', type: 'persona', actor,
      value: () => S.profiles[actor.id] || 'keep', choose: v => { S.profiles[actor.id] = v; invalidate(); }, options: [
        { value: 'keep', label: 'Keep the proposed profile', description: 'Use the motivation, goal and information shown above.' },
        { value: 'cautious', label: 'Ask for a more cautious version', disabled: !S.boot.routes.author.enabled, description: 'Give the authoring agent a stronger emphasis on uncertainty and preserving resources.' },
        { value: 'exploratory', label: 'Ask for a more exploratory version', disabled: !S.boot.routes.author.enabled, description: 'Ask the author to consider bounded experiments and information gathering.' }
      ] });
    const owner = world.actors[0], amount = owner.initial_cash_cents / 100;
    if (amount > 0) steps.push({ id: 'world-capital', title: `What starting budget should ${owner.name} have?`, hint: 'This changes only this actor’s starting cash. Action costs and the other actors’ budgets stay explicit in the world.', kind: 'question', type: 'slider',
      min: Math.min(1000, amount), max: Math.max(100000, amount), step: amount % 100 ? .01 : 100, unit: 'USD', format: usd,
      value: () => owner.initial_cash_cents / 100, change: v => { owner.initial_cash_cents = Math.round(v * 100); owner.provenance = { status: 'assumed', rationale: 'Starting cash was explicitly set by the user. Other profile fields retain the author’s hypothetical proposal.', source_refs: owner.provenance.source_refs }; invalidate(); }, presets: [1000, 10000, 25000, 100000] });
    const minimum = Math.max(1, ...(world.events || []).map(e => e.round));
    if (S.boot.routes.actors.some(r => r.enabled)) steps.push({ id: 'actor-model', title: S.settings.actorRoute==='offline'?'Local rules make these decisions.':'Jev makes the persona decisions.', hint: S.settings.actorRoute==='offline'?'No model or network calls. This baseline ignores narrative motivations, messages and joint responses. One-hot action scores are policy, not confidence.':'Jev is selected by default. The world author is a separate job; ready examples need no authoring call.', kind: 'question', type: 'choices', value: () => S.settings.actorRoute, choose: value => { S.settings.actorRoute = value; invalidate(); }, options: [
      ...(route('offline')?.enabled?[{value:'offline',label:'Offline rules · deterministic own-action utility',description:'Zero model calls. Does not interpret persona prose or solve opponents.'}]:[]),
      { value: 'typesafe', label: 'Jev through TypeSafe', suggestion: 'Primary model', guidance: 1, description: 'Structured decisions through the official TypeSafe API. Check catalog access before running.', disabled: !route('typesafe')?.enabled },
      { value: 'gemini', label: 'Gemini · optional alternative', description: 'Generate the same typed Choice contract with the current development model.', disabled: !route('gemini')?.enabled }
    ], render: renderTypeSafeStatus });
    steps.push({ id: 'rounds', title: 'How many decision rounds?', hint: `Each round lets every persona choose again. Messages reach subscribed peers in the next round. Scheduled events set the lower bound at ${minimum}.`, kind: 'question', type: 'slider', min: minimum, max: 8, step: 1, unit: 'rounds', format: v => String(v), value: () => world.rounds, change: v => { world.rounds = v; invalidate(); }, presets: [1, 2, 4, 8].filter(v => v >= minimum) },
      { id: 'policy', title: 'How should a persona’s action be selected?', hint: `${actorName()} returns scores over permitted choices. These are model judgments, not calibrated real-world event odds.`, kind: 'question', type: 'choices', value: () => S.settings.mode, choose: v => { S.settings.mode = v; invalidate(); }, options: [
        { value: 'argmax', label: 'Choose the highest-scoring action', description: 'Easier to inspect in a first run.', suggestion: 'Suggested first run', guidance: 1 },
        { value: 'sample', label: 'Sample from the action scores', description: 'Use a seeded draw. This is an experimental behavior policy, not a solved equilibrium.', guidance: .35 }
      ] }, { id: 'worlds', title: 'How many fresh worlds should run?', hint: 'Each world makes fresh model requests under the same reviewed rules. A few worlds can illustrate variation; they do not establish real outcome odds.', kind: 'question', type: 'choices', value: () => S.settings.worlds, choose: v => { S.settings.worlds = v; invalidate(); }, options: [1, 2, 4].map(v => ({ value: v, label: `${v} ${v === 1 ? 'world' : 'worlds'}`, description: `Up to ${world.actors.length * world.rounds * v} actor calls.`, suggestion: v === 1 ? 'Suggested first run' : null, guidance: v === 1 ? 1 : v === 2 ? .45 : .18, disabled: world.actors.length * world.rounds * v > callLimit() })) });
    if (S.answers.public !== true && (needsPublic() || profileTweaks().length)) steps.push(privacyStep());
    steps.push({ id: 'plan', kind: 'submit', title: 'Check the world before running.', hint: `Your selected actor model is ${actorName()}. Requests contain only permitted persona state and typed questions.`, render: renderPlan });
    return steps;
  }
  function invalidate() { if (S.session) S.session.review = null; }
  function beginReview() { S.profiles = {}; S.steps = reviewSteps(); S.index = 0; S.mode = 'review'; }
  function beginSetup() { if (S.busy || active()) return; cancelAdvance(); stoppedPoll(); S.epoch++; S.readingReturn = null; S.savedView = null; S.settings.actorRoute = preferredActor(S.boot) || 'typesafe'; S.mode = 'setup'; S.steps = setupSteps(); S.index = 0; error(); render(); }
  function summary(rows, root = $('screen')) { const list = el('dl', undefined, 'summary'); for (const [key, value] of rows) { const row = el('div', undefined, 'summary-row'); row.append(el('dt', key), el('dd', value)); list.append(row); } root.append(list); }
  function note(text, root = $('screen')) { root.append(el('p', text, 'subtle-note')); }
  function details(title, values, root = $('screen')) { const d = el('details', undefined, 'fine-details'); d.append(el('summary', title)); for (const value of values) d.append(el('p', value)); root.append(d); }
  function heading(title, hint) { const h = el('h1', title); h.id = 'question-title'; h.tabIndex = -1; $('screen').append(h); if (hint) $('screen').append(el('p', hint, 'question-hint')); }
  function choiceList(step) {
    const group = el('div', undefined, 'choices'); group.setAttribute('role', 'group'); group.setAttribute('aria-label', step.title);
    step.options.forEach((option, i) => {
      const b = button('', () => selectAnswer(step, option.value), 'choice');
      b.dataset.value = String(option.value); b.setAttribute('aria-pressed', String(step.value() === option.value)); b.disabled = S.busy || Boolean(option.disabled);
      shade(b, option.score ?? option.guidance); b.append(el('span', String.fromCharCode(65 + i), 'choice-key'));
      const copy = el('span', undefined, 'choice-copy'); copy.append(el('span', option.label, 'choice-title'));
      if (option.description) { b.title = option.description; b.setAttribute('aria-description', option.description); copy.append(el('span', option.description, 'choice-description')); }
      if (option.suggestion) copy.append(el('span', option.suggestion, 'choice-tag')); b.append(copy);
      if (Number.isFinite(option.score)) b.append(el('span', `${Math.round(option.score * 100)}%`, 'choice-score'));
      group.append(b);
    });
    $('screen').append(group);
    if (step.options.some(o => Number.isFinite(o.score))) note('Agent suggestion scores. Darker means more favored in this context, not higher odds of a real-world outcome.');
    else if (step.options.some(o => o.guidance !== undefined)) note('Color strength reflects interface guidance for a first run, not a forecast.');
    return group;
  }
  function cancelAdvance() { if (S.advanceTimer !== null) clearTimeout(S.advanceTimer); S.advanceTimer = null; }
  function selectAnswer(step, value) {
    if (S.busy || S.transitioning) return;
    cancelAdvance(); step.choose(value); error(); render(); findChoice(value)?.focus();
    if (!['choices', 'persona'].includes(step.type) || step.multiple || step.autoAdvance === false || (step.id === 'privacy' && value !== true)) return;
    const mode = S.mode, index = S.index, epoch = S.epoch;
    S.advanceTimer = setTimeout(() => {
      S.advanceTimer = null;
      if (S.mode === mode && S.index === index && S.epoch === epoch && !S.busy) next();
    }, questionTempo(S.index, S.steps.length, S.mode).delay);
  }
  function moveQuestion(change, direction) {
    cancelAdvance();
    const root = $('screen'), stage = $('flow-stage');
    const motion = window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches;
    const ghost = motion && root.cloneNode ? root.cloneNode(true) : null;
    S.direction = direction; change(); render(true);
    if (!ghost || !root.animate || !stage) return;
    ghost.removeAttribute('id'); ghost.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    ghost.classList.add('question-ghost'); ghost.setAttribute('aria-hidden', 'true'); ghost.inert = true;
    stage.append(ghost); S.transitioning = true; stage.dataset.moving = 'true';
    const distance = Math.max(stage.clientHeight, 520);
    const after = questionTempo(S.index, S.steps.length, S.mode);
    const timing = { duration: after.duration, easing: 'cubic-bezier(.22,.72,.18,1)', fill: 'both' };
    const leaving = ghost.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${-direction * distance}px)`, opacity: .1 }], timing);
    const arriving = root.animate([{ transform: `translateY(${direction * distance}px)`, opacity: .2 }, { transform: 'translateY(0)', opacity: 1 }], timing);
    Promise.allSettled([leaving.finished, arriving.finished]).then(() => {
      leaving.cancel(); arriving.cancel(); ghost.remove(); delete stage.dataset.moving; S.transitioning = false;
    });
  }
  function findChoice(value) { return [...document.querySelectorAll('.choice')].find(b => b.dataset.value === String(value)); }
  function textInput(step) {
    const wrap = el('div', undefined, 'input-wrap'), label = el('label', 'Your description', 'input-label'), input = el('textarea'); input.id = 'current-input'; label.setAttribute('for', input.id); input.value = step.value() || ''; input.maxLength = step.maxLength || 4000; input.rows = 5;
    input.addEventListener('input', () => { step.change(input.value); updateNavigation(); reportInternalFlow(); }); wrap.append(label, input); $('screen').append(wrap);
    if (step.id === 'description') { const row = el('div', undefined, 'example-row'); row.append(button('Fill example', () => { S.answers.description = DESCRIPTIONS[S.answers.intent] || DESCRIPTIONS.other; render(); }, 'text-button')); $('screen').append(row); note('Up/down keys move the text cursor here. Use Continue, or Ctrl/⌘ + Enter, when ready.'); }
  }
  function slider(step) {
    const wrap = el('div', undefined, 'input-wrap'), valueRow = el('div', undefined, 'slider-value'), output = el('output', step.format(step.value())), input = el('input');
    input.type = 'range'; input.id = 'current-range'; input.min = String(step.min); input.max = String(step.max); input.step = String(step.step); input.value = String(step.value()); input.setAttribute('aria-label', step.title); input.setAttribute('aria-valuetext', step.format(step.value())); output.setAttribute('for', input.id);
    valueRow.append(output, el('span', step.unit)); wrap.append(valueRow, input); const bounds = el('div', undefined, 'slider-boundaries'); bounds.append(el('span', step.format(step.min)), el('span', step.format(step.max))); wrap.append(bounds);
    function change(v) { const bounded = sliderValue(v, step.min, step.max, step.step); step.change(bounded); input.value = String(bounded); output.textContent = step.format(bounded); input.setAttribute('aria-valuetext', step.format(bounded)); updateNavigation(); reportInternalFlow(); }
    input.addEventListener('input', () => change(input.value));
    const presets = el('div', undefined, 'presets'); for (const v of step.presets || []) { if (v < step.min || v > step.max) continue; const b = button(step.format(v), () => { change(v); for (const child of presets.children) child.setAttribute('aria-pressed', String(child.dataset.value === String(v))); }, 'preset'); b.dataset.value = String(v); b.setAttribute('aria-pressed', String(step.value() === v)); presets.append(b); }
    wrap.append(presets); $('screen').append(wrap); note('Use the slider or a preset. Its arrow keys adjust the value; Back and Continue move between questions.');
  }
  function renderPersona(step) {
    const a = step.actor, card = el('div', undefined, 'persona-context'); card.append(el('p', `Motivation: ${a.motivation}`), el('p', `Goal: ${a.goal}`), el('p', `Own private information: ${a.information || 'None supplied.'}`));
    const actions = el('div', undefined, 'action-list'); for (const action of a.actions) actions.append(el('span', `${action.label} · ${usd(action.cost_cents / 100)}`, 'action-label')); card.append(actions); $('screen').append(card); choiceList(step);
    note(`Profile changes are requests to the authoring agent. They are applied together, after an explicit ${authorName()} request. The local review shows every persona; each actor receives only its own permitted information.`);
  }
  async function quickReview(){
    if(S.busy||active())return;
    const plan=()=>{S.steps=reviewSteps();S.index=S.steps.length-1;S.mode='review';render(true);};
    if(profileTweaks().length||!route()?.enabled||(needsPublic()&&S.answers.public!==true)){plan();return;}
    if(S.settings.actorRoute==='typesafe'&&S.typesafeHealth?.status!=='ready'){
      await operation(async()=>{S.typesafeHealth=await api('/api/product/typesafe/models');});
      if(S.typesafeHealth?.status!=='ready'){plan();return;}
    }
    await reviewRun();
  }
  function renderOverview() {
    const approach=S.settings.actorRoute==='offline'?'Local rules · no model calls':`${actorName()} · call limit shown before you run`;
    const intro=el('div',undefined,'journey-summary');
    intro.append(el('p',`${S.world.actors.length} participants · ${S.world.rounds} decision rounds · ${S.settings.worlds} ${S.settings.worlds===1?'run':'runs'}`),el('p',approach,'subtle-note'));
    const people=el('div',undefined,'participant-preview');
    for(const actor of S.world.actors.slice(0,4)){const card=el('article',undefined,'participant-card');card.append(el('h3',actor.name),el('p',actor.goal),el('span',`${usd(actor.initial_cash_cents/100)} starting budget`,'participant-budget'));people.append(card);}
    intro.append(people);$('screen').append(intro);
    $('screen').append(el('p',S.settings.actorRoute==='offline'?'Review the free run, then confirm. No model calls or wallet required.':'A catalog access check makes no inference request. Review the actor-call limit and token-cost assumptions before approving AI calls.','review-boundary'));
    const actions=el('div',undefined,'actions-row');
    actions.append(button('Review run & cost →',quickReview,'button primary'));
    actions.append(button('Adjust people or settings',()=>next(),'text-button'));$('screen').append(actions);
    const facts=[`${S.world.interactions.length} interaction rules connect the participants.`, `Tracked outcomes: ${S.world.metrics.map(m=>`${m.label} (${m.unit})`).join(' · ')}.`];
    const rows = S.world.interactions.map(i => `${i.description} When: ${Object.entries(i.when).map(([id, action]) => `${id} → ${action}`).join(' + ')}. Effects: ${Object.entries(i.effects).map(([id, n]) => `${id} ${n >= 0 ? '+' : ''}${n}`).join(', ')}.`);
    details('How this example works', [...facts, ...rows, ...S.world.assumptions, ...S.world.limitations]);
    if (S.boot.routes.author.enabled) $('screen').append(button(`Ask ${authorName()} to change the cast or rules`, () => showCustom(), 'text-button'));
  }
  function renderCast() {
    summary([['Cast size', `${S.world.actors.length} personas`], ['Total starting cash', usd(S.world.actors.reduce((sum, actor) => sum + actor.initial_cash_cents, 0) / 100)], ['Information structure', S.world.schema_version === 'strategic-world.v2' ? 'Sparse public neighborhoods; private goals stay isolated' : 'Reviewed peer subscriptions and private observations']]);
    const list = el('div', undefined, 'cast-list');
    for (const actor of S.world.actors) {
      const profile = el('details', undefined, 'fine-details'); profile.append(el('summary', `${actor.name} · ${actor.role}${S.profiles[actor.id] && S.profiles[actor.id] !== 'keep' ? ' · revision selected' : ''}`));
      for (const [label, value] of [['Motivation', actor.motivation], ['Goal', actor.goal], ['Own information', actor.information], ['Starting cash', usd(actor.initial_cash_cents / 100)], ['Permitted actions', actor.actions.map(a => `${a.label} (${usd(a.cost_cents / 100)})`).join(' · ')]]) profile.append(el('p', `${label}: ${value}`));
      const actions = el('div', undefined, 'actions-row');
      for (const [value, label] of [['keep', 'Keep profile'], ['cautious', 'More cautious'], ['exploratory', 'More exploratory']]) {
        const b = button(label, () => { S.profiles[actor.id] = value; invalidate(); [...actions.children].forEach(choice => choice.setAttribute('aria-pressed', String(choice === b)));  message(`${actor.name}: ${label}. Changes will need a separate ${authorName()} revision.`); }, 'button secondary');
        b.disabled = S.busy || (value !== 'keep' && !S.boot.routes.author.enabled); b.setAttribute('aria-pressed', String((S.profiles[actor.id] || 'keep') === value)); actions.append(b);
      }
      profile.append(actions); list.append(profile);
    }
    $('screen').append(list); note(`Continue keeps unchanged profiles. Selected revisions are sent together to ${authorName()} only after a separate confirmation.`);
    if (S.boot.routes.author.enabled) $('screen').append(button(`Ask ${authorName()} to change this cast`, () => showCustom(), 'text-button'));
  }
  function renderTypeSafeStatus() {
    if (S.settings.actorRoute !== 'typesafe') return;
    const health = S.typesafeHealth;
    if (health?.status === 'ready') note(`TypeSafe catalog access confirmed${Array.isArray(health.models) ? ` · ${health.models.length} models listed` : ''}. This does not verify inference or available funding.`);
    else if (health) { note(health.details?.message || health.error || 'TypeSafe access check failed.'); if (health.details?.retry_after_seconds) note(`Provider cooldown: ${health.details.retry_after_seconds} seconds from the last check.`); }
    const check = button('Check TypeSafe access', () => operation(async () => { S.typesafeHealth = await api('/api/product/typesafe/models'); }), 'text-button'); check.disabled = S.busy || !route('typesafe')?.enabled; $('screen').append(check);
    if (!health) note('Checks the official TypeSafe model catalog with GET. It never evaluates the scenario or checks a balance.');
  }
  function renderBuild() {
    if(S.boot.routes.author.provider==='near_ai')$('screen').append(button('Check Cloud model catalog · no inference',()=>operation(async()=>{const result=await api('/api/product/author-models',{});if(result.status==='failed')throw Error(result.details?.message||'Cloud catalog access failed.');const selected=result.models.find(m=>m.id===S.boot.routes.author.model);message(selected?'Selected model is listed. Capability and privacy metadata remain provider-declared.':'The configured model is absent from this catalog; choose an exact available ID before authoring.');}),'text-button'));
    summary([['Focus', S.answers.focus==='Cautious retail participants'?'Retail participants':S.answers.focus], ['Persona detail', `${S.answers.depth} actors`], ['Starting capital', ['launch', 'defi'].includes(S.answers.intent) ? usd(S.answers.capital) : 'Defined from the decision context'], ['Author', S.boot.routes.author.model || authorName()], ['Authoring requests', authoringPlan(S.answers) ? `${authoringPlan(S.answers).max_calls} maximum · one scaffold + ${Math.ceil(S.answers.depth / 20)} profile batches` : '1 initial request'], ['Data', S.answers.public ? 'Selected-provider disclosure approved' : 'Disclosure not approved']]);
    const row = el('div', undefined, 'actions-row'); const b = button(`Construct with ${authorName()} →`, () => createWorld(), 'button primary'); b.disabled = S.busy || !S.boot.routes.author.enabled || S.answers.public !== true; row.append(b); $('screen').append(row);
    note(authoringPlan(S.answers) ? 'This explicitly authorizes the shown sequential authoring stages. Numeric rules and allocations freeze before profile batches. Any invalid stage stops the plan; no automatic retry. Author-provider billing is separate and unknown. No Jev requests yet.' : 'One actual authoring request. You will review the resulting world before actor calls. Author-provider billing is separate and unknown; no Jev inference or chain action.');
  }
  function profileTweaks() { return S.world.actors.filter(a => S.profiles[a.id] && S.profiles[a.id] !== 'keep'); }
  function renderPlan() {
    const tweaks = profileTweaks(), maxCalls = S.world.actors.length * S.world.rounds * S.settings.worlds;
    summary([['Actor model', `${route()?.model || actorName()} · typed decisions`], ['World', `${S.world.actors.length} actors × ${S.world.rounds} rounds × ${S.settings.worlds} ${S.settings.worlds === 1 ? 'world' : 'worlds'}`], [S.settings.actorRoute==='offline'?'Local decision turns':'Actor call ceiling', `${maxCalls} / ${callLimit()}`], ['Decision policy', S.settings.mode === 'argmax' ? 'Highest action score' : 'Seeded action sampling'], ['Outstanding persona changes', tweaks.length ? `${tweaks.length} need agent revision` : 'None']]);
    const row = el('div', undefined, 'actions-row');
    if (tweaks.length) { const b = button(S.session.authoring_plan ? 'Review a new authoring plan →' : `Apply persona choices with ${authorName()} →`, () => applyProfiles(), 'button primary'); b.disabled = !S.boot.routes.author.enabled || S.answers.public !== true || S.busy; row.append(b); note(S.session.authoring_plan ? 'A staged world needs a new explicit authoring plan for revisions. Review the new question and full call budget first; the new proposal may change rules and needs review again.' : 'This makes one authoring request to revise the profiles, then returns you to review. It does not start the simulation.'); }
    else if (S.settings.actorRoute === 'typesafe' && S.typesafeHealth?.status !== 'ready') { renderTypeSafeStatus(); note('A successful TypeSafe catalog check is required in this interface before submitting a Jev run. No evaluation has been dispatched.'); }
    else { const b = button('Validate this run plan →', () => reviewRun(), 'button primary'); b.disabled = !route()?.enabled || (needsPublic() && S.answers.public !== true) || S.busy || maxCalls > callLimit(); row.append(b); note('Validation is local and makes no model requests. The next screen is the explicit run confirmation.'); }
    $('screen').append(row);
    if (S.settings.actorRoute === 'typesafe' && S.typesafeHealth?.status === 'ready') note('Catalog access is confirmed. The reviewed actor-call ceiling limits requests; it is not a dollar guarantee.');
  }
  function next() {
    if (S.busy || active() || S.transitioning) return; cancelAdvance(); const step = current(); if (!step || step.kind !== 'question' || !answered(step)) return;
    if(S.mode==='setup'&&step.id==='privacy'&&S.answers.public===false){
      S.answers.start=null;S.steps=setupSteps();
      moveQuestion(()=>{S.index=Math.max(0,S.steps.findIndex(item=>item.id==='starter'));},-1);
      message('Nothing was sent. Choose a ready example, or return to your retained question.');return;
    }
    if (S.mode === 'setup') S.steps = setupSteps();
    else if (S.mode === 'review') S.steps = reviewSteps();
    if (S.index < S.steps.length - 1) moveQuestion(() => S.index++, 1);
  }
  function back() {
    if (S.busy || active() || S.transitioning) return; cancelAdvance(); S.direction = -1;
    if (S.mode === 'confirm') { S.mode = 'review'; S.index = S.steps.length - 1; render(true); return; }
    if (S.mode === 'results') { beginReview(); render(true); return; }
    if (S.mode === 'custom') { beginReview(); render(true); return; }
    if (S.mode === 'custom-public' && S.index === 0) { S.mode = 'custom'; render(true); return; }
    if (S.index > 0) { error(); moveQuestion(() => S.index--, -1); }
  }
  function answered(step) { return step.type === 'text' ? Boolean(step.value()?.trim()) : ['choices', 'persona'].includes(step.type) ? step.options.some(option => option.value === step.value() && !option.disabled) : true; }
  function updateNavigation() {
    const step = current(), question = ['setup', 'review', 'questions', 'custom-public'].includes(S.mode) && step?.kind === 'question';
    $('back').disabled = S.busy || active() || (S.index === 0 && !['confirm', 'results', 'custom', 'custom-public'].includes(S.mode));
    $('next').textContent=step?.type==='overview'?'Customize ↓':'Continue ↓';
    $('next').hidden = !question; $('next').disabled = S.busy || !question || !answered(step);
    $('back').hidden = S.mode === 'loading'; $('keyboard-hint').hidden = ['loading', 'results', 'confirm', 'custom'].includes(S.mode);
    $('start-over').hidden = S.mode === 'setup' && S.index === 0; $('start-over').disabled = S.busy || active(); $('resume').disabled = S.busy || active();
  }
  let internalTimer = null, internalLast = '';
  function reportInternalFlow() {
    if (!S.boot?.internal_flow) return;
    if (internalTimer !== null) clearTimeout(internalTimer);
    internalTimer = setTimeout(() => {
      internalTimer = null;
      const plain = (value,limit=200) => String(value ?? '').replace(/[\x00-\x1f]/g,' ').slice(0,limit);
      const describe = (step,visited,id=step.id) => {
        const value = step.value?.();
        const answer = step.type === 'text' ? (value ? `Text entered (${value.length} characters)` : '') : plain(step.options?.find(o=>o.value===value)?.label ?? (value === undefined ? '' : step.format ? step.format(value) : value));
        return {id:plain(id,100),label:plain(step.title),input:plain(step.type || step.kind,100),answer,visited};
      };
      const prefix = S.mode !== 'setup' && S.answers.intent ? setupSteps().map(step=>describe(step,true,`setup-${step.id}`)) : [];
      const steps = [...prefix,...S.steps.map((step,index)=>describe(step,index<S.index))];
      const snapshot = {phase:S.mode,current:current()?.id || '',actor_route:S.settings.actorRoute,steps},key=JSON.stringify(snapshot);
      if (key === internalLast) return; internalLast = key;
      api('/api/internal/flow',snapshot).catch(()=>{});
    },180);
  }
  function render(focus = false) {
    if (!S.boot) return; if($('screen').dataset.kind==='results'&&S.deckController&&S.deckKey)S.slidePositions[S.deckKey]=S.deckController.index; reportInternalFlow(); $('start-over').hidden = S.mode === 'setup' && S.index === 0; $('start-over').disabled = S.busy || active(); $('saved-results').disabled = S.busy || active(); document.body?.setAttribute('data-view', ['results', 'library'].includes(S.mode) ? 'reading' : 'focus'); const root = $('screen'); root.replaceChildren(); root.setAttribute('aria-busy', String(S.busy || active()));
    $('wallet-connect').textContent = S.walletAccount ? `${S.walletAccount.accountId.length>22?S.walletAccount.accountId.slice(0,18)+'…':S.walletAccount.accountId} · testnet` : 'Connect testnet wallet';
    $('access-settings').disabled=S.busy||active();
    $('wallet-connect').hidden=!['results','near','library'].includes(S.mode);
    $('score-legend').textContent='Your choices stay available when you go back.';
    $('wallet-connect').disabled = S.busy || active() || !S.boot.near?.wallet_enabled;
    $('wallet-connect').title = S.walletAccount ? 'Disconnect this wallet. Connecting does not prove account ownership until a signature verifies.' : 'Connect Intear on NEAR testnet';
    $('model-label').textContent = S.settings.actorRoute === 'offline' ? 'Offline · local rules' : S.settings.actorRoute === 'typesafe' ? (route('typesafe')?.enabled ? 'Jev · primary' : 'Jev · not configured') : 'Gemini · selected';
    $('score-legend').textContent = 'One question at a time. Choices keep readable text; stronger green indicates a stronger labelled suggestion.';
    if (S.mode === 'loading') { renderLoading(); return; }
    if (S.mode === 'results') { renderResults(); if (focus) focusScreen(); return; }
    if (S.mode === 'near') { renderNear(); return; }
    if (S.mode === 'library') { renderLibrary(); if (focus) focusScreen(); return; }
    if (S.mode === 'confirm') { renderConfirm(); return; }
    if (S.mode === 'failure') { renderFailure(); return; }
    if (S.mode === 'custom') { renderCustom(); return; }
    const step = current(); root.dataset.kind = step.kind; root.dataset.step = step.id;
    const tempo = questionTempo(S.index, S.steps.length, S.mode); root.dataset.pace = tempo.pace;
    $('step-label').textContent = `Question ${S.index + 1}`;
    $('flow-progress').max = S.steps.length; $('flow-progress').value = S.index + 1;
    heading(step.title, step.hint);
    if (step.type === 'choices') choiceList(step);
    if (step.type === 'text') textInput(step);
    if (step.type === 'slider') slider(step);
    if (step.type === 'persona') renderPersona(step);
    if (step.type === 'overview') renderOverview();
    if (step.render) step.render();
    updateNavigation(); message(`Question ${S.index + 1}. ${step.title}`);
    if (focus) focusScreen();
  }
  function focusScreen() {
    $('question-title')?.focus(); window.scrollTo?.({ top: 0, behavior: 'auto' });

  }
  function accept(snapshot, source) {
    S.savedView = null; S.detailsMode = false;
    if (['example','author'].includes(source) && preferredActor(S.boot)) S.settings.actorRoute = preferredActor(S.boot);
    S.session = snapshot; if (snapshot.review?.actor_route) S.settings.actorRoute = snapshot.review.actor_route; else if (snapshot.error?.startsWith('typesafe_') && route('typesafe')?.enabled) S.settings.actorRoute = 'typesafe'; saveSession(); $('resume').hidden = true; stoppedPoll();
    if (['authoring', 'running'].includes(snapshot.status)) { S.mode = 'loading'; schedulePoll(); }
    else if (snapshot.status === 'failed') S.mode = 'failure';
    else if (source === 'review') S.mode = 'confirm';
    else if (snapshot.status === 'completed') { S.world = clone(snapshot.proposal.world); S.detailsMode = false; S.mode = 'results'; }
    else if (snapshot.proposal?.questions?.length) { S.world = snapshot.proposal.world ? clone(snapshot.proposal.world) : null; beginQuestions(); }
    else if (snapshot.proposal?.world) { S.world = clone(snapshot.proposal.world); beginReview(); }
    render(true);
  }
  function schedulePoll() {
    const id = S.session.id, epoch = S.epoch;
    S.timer = setTimeout(async () => {
      try { const snapshot = await api(`/api/product/sessions/${id}`); if (S.epoch !== epoch || S.session?.id !== id) return; S.pollFailures = 0; accept(snapshot, 'poll'); }
      catch (failure) { error(failure.message); if (++S.pollFailures < 3) schedulePoll(); else { S.mode = 'failure'; render(); error('Progress checks stopped. Resume to inspect the session; model calls are not retried.'); } }
    }, 1000);
  }
  async function createWorld() { await operation(async () => { S.epoch++; const plan = authoringPlan(S.answers); const snapshot = await api('/api/product/sessions', { mode: 'author', example_id: null, question: buildBrief(S.answers), public_input: S.answers.public === true, ...(plan ? { authoring_plan: plan } : {}) }); accept(snapshot, 'author'); }); }
  async function loadExample(example) { await operation(async () => { S.epoch++; const snapshot = await api('/api/product/sessions', { mode: 'example', example_id: example.id, question: example.question, public_input: false, persona_options: personaOptions(S.answers) }); accept(snapshot, 'example'); }); }
  function beginQuestions() {
    S.clarifications = {}; S.mode = 'questions'; S.index = 0;
    S.steps = S.session.proposal.questions.map(q => ({ id: `clarify-${q.id}`, kind: 'question', type: 'choices', title: q.prompt,
      hint: q.recommendation?.reason || 'The agent needs this detail to define the world. Unranked choices have equal color strength.', value: () => S.clarifications[q.id], choose: v => { S.clarifications[q.id] = v; }, options: q.choices.map(c => ({ value: c, label: c, score: q.recommendation?.probabilities[c], suggestion: q.recommendation?.choice === c ? 'Agent suggestion' : null })) }));
    S.steps.push({ id: 'clarify-submit', kind: 'submit', title: `Send these answers to ${authorName()}?`, hint: S.session.authoring_plan ? 'The previous staged plan has stopped for clarification. Review a new bounded plan using these answers before generating again.' : 'All answers are submitted together in one authoring request.', render: () => {
      summary(S.session.proposal.questions.map(q => [q.prompt, S.clarifications[q.id] || 'Not answered']));
      const b = button(S.session.authoring_plan ? 'Review a new authoring plan →' : `Update the world with ${authorName()} →`, () => say(S.session.proposal.questions.map(q => `${q.id}: ${q.prompt}\nAnswer: ${S.clarifications[q.id]}`).join('\n\n')), 'button primary'); b.disabled = S.answers.public !== true || S.busy; $('screen').append(el('div', undefined, 'actions-row')); $('screen').children[$('screen').children.length - 1].append(b);
    } });
    if (S.answers.public !== true) S.steps.splice(S.steps.length - 1, 0, privacyStep());
  }
  async function say(text) { if (S.session.authoring_plan) { prepareNewAuthorPlan(text); return; } const local = S.world ? `\nCurrent local review values: ${JSON.stringify({ rounds: S.world.rounds, budgets_cents: Object.fromEntries(S.world.actors.map(a => [a.id, a.initial_cash_cents])) })}. Preserve these unless the user explicitly requests a change.` : ''; await operation(async () => { const snapshot = await api(sessionPath('/say'), { message: text + local, public_input: S.answers.public === true }); accept(snapshot, 'author'); }); }
  function prepareNewAuthorPlan(change) {
    const original = S.session.question || S.answers.description;
    const description = `${original}\n\nRequested clarification or revision: ${change}\nCreate a new reviewable proposal. Do not claim this is an unchanged replay of the prior world.`;
    if (description.length > 6000) { error('This revision is too long for the next question. Start a new question and summarize the changes in fewer than 6,000 characters. No model request was made.'); return; }
    const previous = S.session.authoring_plan;
    S.answers.description = description; S.answers.depth = previous.actor_count;
    if (previous.creator_capital_cents !== undefined) { S.answers.intent = 'launch'; S.answers.capital = previous.creator_capital_cents / 100; }
    else S.answers.intent = 'other';
    S.answers.start = 'custom'; S.profiles = {}; beginSetup(); S.index = S.steps.findIndex(step => step.id === 'description'); render(true);
    message('Review the revised question and authoring call budget. No new model request has been made.');
  }
  async function applyProfiles() {
    const requests = profileTweaks().map(a => `${a.id}: ${S.profiles[a.id] === 'cautious' ? 'Make the motivation and policy more cautious about uncertainty and preserving resources.' : 'Emphasize bounded experiments and information gathering, with explicit resource limits.'}`);
    const budgets = S.world.actors.map(a => `${a.id}=${a.initial_cash_cents} cash cents`).join(', ');
    await say(`Revise these hypothetical persona profiles: ${requests.join('\n')}\nPreserve exactly these budgets: ${budgets}. Keep ${S.world.rounds} rounds and the same actor count. More detail must not create funds. Return a complete revised world for review.`);
  }
  function showCustom() { S.custom = ''; S.mode = 'custom'; render(true); }
  function renderCustom() {
    $('screen').dataset.kind = 'submit'; $('step-label').textContent = 'CHANGE YOUR WORLD'; heading('What should the agent change?', 'One request can change the cast, motivations, action menus or rules. The result comes back for review.');
    textInput({ id: 'custom', value: () => S.custom, change: v => { S.custom = v; }, maxLength: 4000 });
    const b = button(S.session.authoring_plan ? 'Review a new authoring plan →' : `Send change to ${authorName()} →`, () => { if (!S.custom.trim()) { error('Describe the change first.'); return; } say(S.custom); }, 'button primary'); b.disabled = S.answers.public !== true || !S.boot.routes.author.enabled || S.busy;
    const row = el('div', undefined, 'actions-row'); row.append(b); $('screen').append(row); if (S.answers.public !== true) { note('Review and approve the selected author’s data boundary before sending.'); $('screen').append(button('Confirm data scope', () => { S.steps = [privacyStep(), { id: 'custom-return', kind: 'submit', title: 'Ready to continue?', render: () => $('screen').append(button('Return to your change', () => { S.mode = 'custom'; render(); })) }]; S.mode = 'custom-public'; S.index = 0; render(); }, 'text-button')); }
    $('next').hidden = true; $('back').hidden = false; $('back').disabled = S.busy; $('keyboard-hint').hidden = true;
  }
  async function reviewRun() {
    await operation(async () => { const snapshot = await api(sessionPath('/review'), { world: S.world, actor_route: S.settings.actorRoute, mode: S.settings.mode, worlds: S.settings.worlds, seed: 42, max_calls: callLimit(), max_credits: 0 }); accept(snapshot, 'review'); });
  }
  function renderConfirm() {
    $('screen').dataset.kind = 'submit'; $('step-label').textContent = 'READY TO RUN'; const review = S.session.review;
    heading('Run this reviewed world?', S.settings.actorRoute==='offline'?'This explicitly runs the local rule baseline with no model or chain calls.':'This is the explicit model-call step. Arrow-key navigation will never start it.');
    summary([['Selected actor model', review.model], ['Decision contract', 'Typed Choice action probabilities'], [S.settings.actorRoute==='offline'?'Local turns':'Actor call ceiling', `Up to ${review.required_calls}`], ['Worlds', review.worlds], ['Public chain activity', 'None']]);
    const row = el('div', undefined, 'actions-row'); const b = button(`Run with ${actorName()} · up to ${review.required_calls} ${S.settings.actorRoute==='offline'?'local turns':'calls'} →`, () => runWorld(), 'button primary'); b.disabled = S.busy || (needsPublic() && S.answers.public !== true) || (S.settings.actorRoute === 'typesafe' && S.typesafeHealth?.status !== 'ready'); row.append(b); $('screen').append(row);
    if (review.preview_allowance) note(`Operator-funded preview allowance: ${review.preview_allowance.remaining_calls} calls remaining of ${review.preview_allowance.call_limit}; ${review.preview_allowance.reserved_calls} calls reserved. Reservations persist across sign-in and restart; failed requests are not automatically released. This is a request-count allowance, not a dollar guarantee.`);
    if (S.settings.actorRoute === 'typesafe' && review.typesafe_estimate) {
      const estimate = review.typesafe_estimate;
      note(`TypeSafe assumption: up to ${estimate.input_tokens_upper_bound} input tokens across ${estimate.actor_call_ceiling} actor calls; estimated input cost $${estimate.input_cost_upper_estimate_usd}. ${estimate.basis || ''} Authoring is separate. This is an estimate, not a billing measurement or dollar cap.`);
    }
    if (S.settings.actorRoute === 'typesafe') note('Official TypeSafe route. No automatic retry or model fallback. One bounded API check passed; full live-world validation remains pending.');
    details('What this run can establish', review.limitations || []);
    const construction = review.construction_summary;
    if (construction) details('How this game is constructed', [
      `${construction.actor_count} modeled participants, ${construction.role_label_count} supplied role labels, ${construction.action_count} actions. Cast size is not an estimate of market population.`,
      `Total allocated cash: ${usd(construction.total_initial_cash_cents / 100)}. Persona detail must not duplicate these resources.`,
      `${construction.direct_dependency_edge_count} initial objective-sensitive influence links; ${construction.interaction_rule_count} conditional joint-action rules. These are numeric assumptions, not observed causal effects.`,
      `Construction warnings: ${construction.warning_count}. ${Object.entries(construction.warning_counts || {}).map(([code,count]) => `${code.replaceAll('_',' ')}: ${count}`).join('; ') || 'No numeric warning was triggered.'}`,
      S.settings.actorRoute==='offline' ? 'This run uses the immediate own-action utility rule. It does not interpret persona prose, anticipate opponents or optimize future rounds.' : 'Jev receives its own objective, permitted information and affordable action menu. Code supplies partial own-action utility calculations; other participants and future effects remain separate.',
      construction.interpretation
    ]);
    const game = S.session.game_analysis;
    if (game?.status === 'computed') details('First-round incentive checks', [`${game.analysis.profile_count} joint action combinations. Pure Nash profiles: ${game.analysis.pure_nash_profiles.map(p => Object.entries(p).map(([id, action]) => `${id}: ${action}`).join(' + ')).join('; ') || 'none'}.`, ...game.limitations]); $('flow-progress').value = $('flow-progress').max; updateNavigation();
  }
  async function runWorld() { await operation(async () => { const snapshot = await api(sessionPath('/run'), { review_sha256: S.session.review.sha256, public_input: S.answers.public === true }); accept(snapshot, 'run'); }); }
  function renderLoading() {
    const p = S.session.progress || {}; $('screen').dataset.kind = 'loading'; $('step-label').textContent = S.session.status === 'authoring' ? 'CONSTRUCTING THE WORLD' : 'RUNNING THE REVIEWED WORLD';
    $('screen').append(el('div', undefined, 'loading-mark')); heading(S.session.status === 'authoring' ? `${authorName()} is building your world.` : 'Your personas are deciding.', p.phase);
    const progress = el('progress', undefined, 'run-progress'); progress.max = p.total_calls || 1; progress.value = p.completed_calls || 0; progress.setAttribute('aria-label', S.settings.actorRoute==='offline'?'Completed local turns':'Completed model calls'); $('screen').append(progress, el('p', `${p.completed_calls || 0} completed / ${p.total_calls || 0} planned ${S.settings.actorRoute==='offline'?'local turns':'calls'} · ${p.attempted_calls || 0} attempts · ${p.completed_worlds || 0} completed worlds`, 'progress-count'));
    note('Progress comes from the backend. No automatic model retry or fallback.');
    if (S.session.status === 'authoring' && S.session.authoring_plan) { const stop = button(S.session.authoring_cancel_requested ? 'Stopping after the current request…' : 'Stop after the current request', () => requestAuthorStop(), 'button secondary'); stop.disabled = S.busy || S.session.authoring_cancel_requested === true; $('screen').append(stop); note('An in-flight provider request can still finish and be charged. Stopping prevents the next batch from starting.'); } $('back').hidden = true; $('next').hidden = true; $('keyboard-hint').hidden = true; $('start-over').disabled = true; $('resume').disabled = true;
  }
  async function requestAuthorStop() {
    if (S.busy || S.session.authoring_cancel_requested) return;
    S.busy = true; render();
    try { accept(await api(sessionPath('/cancel_author'), {}), 'cancel'); }
    catch (failure) { error(failure.message); }
    finally { S.busy = false; render(); }
  }
  function renderFailure() {
    $('screen').dataset.kind = 'submit'; $('step-label').textContent = 'STOPPED'; heading('This operation stopped.', S.session?.error_details?.message || S.session?.error || 'The local connection needs checking.');
    const authorFailure=S.session?.error?.startsWith('near_ai_')||S.session?.error?.startsWith('author');
    if(S.session?.error_details?.http_status===402){
      if(S.session.error.startsWith('near_ai_')){const link=el('a','Open NEAR AI Cloud billing','text-button');link.href='https://cloud.near.ai';link.target='_blank';link.rel='noopener noreferrer';$('screen').append(link);}
      else note('TypeSafe rejected the request for account funding or access. Check the official TypeSafe account before explicitly retrying.');
    }
    if(authorFailure){
      const recovery=el('div',undefined,'actions-row');
      recovery.append(button('Edit my question',()=>{S.mode='setup';S.steps=setupSteps();S.index=Math.max(0,S.steps.findIndex(step=>step.id==='description'));error();render(true);},'button secondary'));
      recovery.append(button('Open a ready NEAR example',()=>loadExample(exampleFor('launch')),'text-button'));$('screen').append(recovery);
      note('Your question is kept. Changing a provider or opening an example does not automatically repeat the failed call.');
    }
    if (S.session?.error_details?.retry_after_seconds) note(`Wait at least ${S.session.error_details.retry_after_seconds} seconds from the failure before retrying. The client enforces the provider cooldown.`);
    if (S.session?.error?.startsWith('typesafe')) renderTypeSafeStatus();
    const p = S.session?.progress || {}; note(`${p.completed_calls || 0} completed model calls, ${p.attempted_calls || 0} attempts. No automatic retry was made. Inspect provider records before another attempt.`);
    const row = el('div', undefined, 'actions-row'); if (S.session?.results?.length) row.append(button('View completed worlds', () => { S.mode = 'results'; render(); }));
    if (S.session?.proposal?.world) row.append(button('Return to the reviewed world', () => { S.world = clone(S.session.proposal.world); beginReview(); render(); })); row.append(button('Check saved session', () => resume(), 'text-button')); $('screen').append(row);
    $('next').hidden = true; $('back').hidden = true; $('keyboard-hint').hidden = true; $('start-over').disabled = S.busy; $('resume').disabled = S.busy;
  }
  function summaryStats(results) {
    const complete = results.filter(r => r.result?.status === 'completed'), metrics = new Map();
    for (const entry of complete) for (const metric of entry.result.world.metrics) { const v = entry.result.final_metrics[metric.id]; if (!metrics.has(metric.id)) metrics.set(metric.id, { ...metric, values: [] }); metrics.get(metric.id).values.push(v); }
    return { completed_worlds: complete.length, metrics: Object.fromEntries([...metrics].map(([id, m]) => { const values = m.values.sort((a, b) => a - b), n = values.length; return [id, { label: m.label, unit: m.unit, mean: values.reduce((a, b) => a + b, 0) / n, median: n % 2 ? values[(n - 1) / 2] : (values[n / 2 - 1] + values[n / 2]) / 2, min: values[0], max: values[n - 1] }]; })) };
  }
  function groups(results, byRound = false) {
    const values = new Map(); for (const r of results.filter(r => r.result?.status === 'completed')) for (const d of r.decisions) { const key = byRound ? `${d.actor_id}:${d.round}` : d.actor_id; if (!values.has(key)) values.set(key, { actor: d.actor_id, round: byRound ? d.round : null, count: 0, actions: new Map() }); const g = values.get(key); g.count++; for (const [id, p] of Object.entries(d.probabilities)) g.actions.set(id, (g.actions.get(id) || 0) + p); }
    return [...values.values()].map(g => ({ ...g, actions: [...g.actions].map(([id, p]) => ({ id, score: p / g.count })).sort((a, b) => b.score - a.score) }));
  }
  function renderDistribution(g, root) {
    const card = el('section', undefined, 'distribution'), actor = S.world.actors.find(a => a.id === g.actor); card.append(el('h3', `${actor?.name || g.actor}${g.round ? ` · round ${g.round}` : ''}`)); const options = el('div', undefined, 'score-options');
    for (const a of g.actions) { const row = el('div', undefined, 'score-option'); shade(row, a.score); row.append(el('span', actor?.actions.find(item => item.id === a.id)?.label || a.id), el('strong', `${(a.score * 100).toFixed(1)}%`)); const meter = el('meter', undefined, 'score-meter'); meter.min = 0; meter.max = 1; meter.value = a.score; meter.setAttribute('aria-label', `${a.id}: ${(a.score * 100).toFixed(1)}% mean action score`); row.append(meter); options.append(row); }
    card.append(options, el('p', g.count === 1 ? 'Model scores for this completed decision.' : `Mean model score across ${g.count} completed decisions${g.round ? '' : ' and their differing round contexts'}.`, 'score-caption')); root.append(card);
  }
  async function showLibrary() {
    await operation(async () => {
      const value = await api('/api/product/results');
      if(!['library','results','near'].includes(S.mode))S.readingReturn={mode:S.mode,index:S.index,steps:S.steps,session:S.session,world:S.world,settings:{...S.settings},profiles:S.profiles,clarifications:S.clarifications,custom:S.custom,savedView:S.savedView,detailsMode:S.detailsMode};
      stoppedPoll(); S.epoch++; S.savedRuns = value.runs || []; S.mode = 'library';
      S.libraryNotice = value.truncated ? 'Showing the most recent saved runs. Older files remain in the local output folder.' : value.skipped_runs ? 'Some runs have no completed world or have unreadable files. Their original files were kept.' : '';
      render(true);
    });
  }
  function returnToQuestion(){
    if(!S.readingReturn||S.busy||active())return;
    const saved=S.readingReturn;S.readingReturn=null;Object.assign(S,saved);S.settings={...saved.settings};
    if(S.boot.access?.mode==='offline')S.settings.actorRoute='offline';
    else if(!route()?.enabled)S.settings.actorRoute=preferredActor(S.boot)||'typesafe';
    if(S.session)S.session.review=null;
    if(['review','confirm'].includes(S.mode)){const step=S.mode==='confirm'?'plan':current()?.id;S.mode='review';S.steps=reviewSteps();S.index=Math.max(0,S.steps.findIndex(item=>item.id===step));}
    else if(S.mode==='setup'){const step=current()?.id;S.steps=setupSteps();S.index=Math.max(0,S.steps.findIndex(item=>item.id===step));}
    error();render(true);
  }
  async function openSaved(run) {
    await operation(async () => {
      const snapshot = await api(`/api/product/results/${encodeURIComponent(run.session_id)}/${encodeURIComponent(run.run_id)}`);
      stoppedPoll(); S.epoch++; S.session = snapshot; S.savedView = { session: run.session_id, run: run.run_id };
      S.world = clone(snapshot.proposal.world); S.detailsMode = false; S.mode = 'results';
      if (snapshot.review?.actor_route) S.settings.actorRoute = snapshot.review.actor_route;
      render(true);
    });
  }
  function renderLibrary() {
    $('screen').dataset.kind = 'library'; $('step-label').textContent = 'YOUR LOCAL RUNS';
    message('Saved results. Choose a recorded run to inspect.'); heading('Saved results', 'Your recorded runs stay here when you start another question. Opening a run verifies its replay and makes no model requests.');
    if(S.readingReturn)$('screen').append(button('Back to my question',returnToQuestion,'button secondary'));
    if (!S.savedRuns.length) note('There are no recorded completed worlds yet. A completed simulation will appear here automatically.');
    if (S.libraryNotice) note(S.libraryNotice);
    const list = el('div', undefined, 'run-list');
    for (const run of S.savedRuns) {
      const card = el('section', undefined, 'saved-run'); card.append(el('h2', run.title));
      const denominator = Number.isInteger(run.requested_worlds) ? ` of ${run.requested_worlds} requested` : ' · requested total not recorded';
      note(`${run.completed_worlds} completed${denominator} · ${run.actor_count} personas · ${run.rounds} rounds`, card);
      if (run.model) note(`Model: ${Array.isArray(run.model) ? run.model.join(', ') : run.model}`, card);
      const actions = el('div', undefined, 'actions-row'); actions.append(button('Open results →', () => openSaved(run), 'button primary')); card.append(actions); list.append(card);
    }
    $('screen').append(list); $('next').hidden = true; $('back').hidden = true; $('keyboard-hint').hidden = true;
    $('start-over').hidden = false; $('start-over').disabled = S.busy; $('resume').disabled = S.busy;
  }
  function resultCosts(results) {
    let calls = 0, inputTokens = 0, tokenReceipts = 0, inputEstimate = 0, estimateReceipts = 0; const models = new Set();
    for (const entry of results) for (const decision of entry.decisions || []) {
      const receipt = decision.receipt; if (!receipt || receipt.local_decision === true) continue; calls++;
      const model = receipt.model_reported || receipt.model_declared; if (model) models.add(model);
      if (['typesafe_systemone_http', 'typesafe_systemone_curl'].includes(receipt.transport)) {
        if (Number.isInteger(receipt.usage?.input_tokens) && receipt.usage.input_tokens >= 0) { inputTokens += receipt.usage.input_tokens; tokenReceipts++; }
        if (Number.isFinite(receipt.input_cost_estimate_usd) && receipt.input_cost_estimate_usd >= 0) { inputEstimate += receipt.input_cost_estimate_usd; estimateReceipts++; }
      }
    }
    return { recorded_model_calls: calls, models: [...models], recorded_input_tokens: tokenReceipts ? inputTokens : null, input_cost_estimate_usd: estimateReceipts ? inputEstimate : null, cost_usd: null };
  }
  function resultBase() { return S.savedView ? `/api/product/results/${S.savedView.session}/${S.savedView.run}` : sessionPath(); }
  function downloadExact() { const a = el('a'); a.href = resultBase() + '/download'; a.download = `scenario-${S.session.id}.results.json`; a.click(); }
  function downloadReport(format){const a=el('a');a.href=resultBase()+'/report-'+format;a.download='scenario-report.'+format;a.click();}
  function renderResults() {
    if (!window.ScenarioDeck || S.detailsMode) { renderDetailedResults(); if (window.ScenarioDeck) $('screen').append(button('Return to presentation', () => { S.detailsMode = false; render(); }, 'button primary')); return; }
    $('screen').dataset.kind = 'results'; document.body?.setAttribute('data-view', 'deck'); $('step-label').textContent = '';
    $('next').hidden = true; $('back').hidden = true; $('keyboard-hint').hidden = true; $('start-over').hidden = false;
    const key = `${S.session.id}:${S.session.run_id || ''}:${S.savedView?.run || ''}`;
    if (!S.deck || S.deckKey !== key) {
      heading('Preparing your scenario presentation…', 'Reading the recorded outcomes. No model calls.');
      if (!S.deckLoading) {
        S.deckLoading = true; const base = resultBase();
        api(base + '/presentation').then(deck => { if (S.mode === 'results' && resultBase() === base) { S.deck = deck; S.deckKey = key; render(); } }).catch(failure => { error(failure.message); S.detailsMode = true; render(); }).finally(() => { S.deckLoading = false; });
      }
      return;
    }
    S.deckController = window.ScenarioDeck.mount($('screen'), S.deck, { onAll: () => showLibrary(), onDownload: downloadExact,
      onReport:format=>downloadReport(format),pdfAvailable:S.boot.reports?.pdf===true,onNew:beginSetup,onReturn:S.readingReturn?returnToQuestion:null,
      onDetails: () => { S.detailsMode = true; render(); }, onNear: () => prepareNear() });
    S.deckController.go(S.slidePositions[key]||0);
  }
  async function prepareNear() {
    await operation(async () => { S.nearState = await api(resultBase() + '/near/prepare', {}); S.walletPlan = null; S.walletResult = null; S.walletAttempted = false; S.walletHash = null;
      try { const pending=JSON.parse(sessionStorage.getItem('scenario-wallet-pending')||'null'); if(pending?.base===resultBase()){S.walletPlan=await api(resultBase()+'/near/wallet-resume',{plan_id:pending.plan_id});S.walletAttempted=S.walletPlan.attempted;S.walletHash=pending.transaction_hash||S.walletPlan.transaction_hash;if(S.walletPlan.receipt)S.walletResult={verified:S.walletPlan.receipt.verified,receipt:S.walletPlan.receipt};} }catch(_){}
      S.mode = 'near'; });
  }
  async function connectWallet() {
    await operation(async()=>{
      if(!window.ScenarioWallet) throw Error('Wallet bundle is unavailable. Refresh before connecting.');
      if(S.walletAccount){await window.ScenarioWallet.disconnect();S.walletAccount=null;S.walletPlan=null;}
      else S.walletAccount=await window.ScenarioWallet.connect();
    });
  }
  function renderWalletNear(){
    const root=$('screen'),row=el('div',undefined,'actions-row');
    if(!S.walletAccount&&!S.walletPlan){row.append(button('Connect my testnet wallet',connectWallet,'button primary'));root.append(row);return;}
    if(!S.walletPlan){row.append(button('Review transaction for my wallet',()=>operation(async()=>{S.walletPlan=await api(resultBase()+'/near/wallet-prepare',{signer_id:S.walletAccount.accountId});S.walletAttempted=false;S.walletResult=null;S.walletHash=null;}),'button primary'));root.append(row);return;}
    const plan=S.walletPlan;
    summary([['Wallet transaction signer',plan.descriptor.signer_id],['Receiver',plan.descriptor.contract.account_id],['Method','register_commitment'],['Public argument',plan.public.commitment],['Attached funding','0.01 testNEAR + gas; storage surplus refunded']]);
    const sign=button('Approve in my testnet wallet',()=>operation(async()=>{
      await api(resultBase()+'/near/wallet-attempt',{plan_id:plan.plan_id,allow_wallet_submit:true});S.walletAttempted=true;
      try{sessionStorage.setItem('scenario-wallet-pending',JSON.stringify({base:resultBase(),plan_id:plan.plan_id}));}catch(_){}
      const returned=await window.ScenarioWallet.sign(plan.descriptor,S.nearState.capabilities.contract_id);S.walletHash=returned.transaction_hash;
      try{sessionStorage.setItem('scenario-wallet-pending',JSON.stringify({base:resultBase(),plan_id:plan.plan_id,transaction_hash:S.walletHash}));}catch(_){}
      S.walletResult=await api(resultBase()+'/near/wallet-verify',{plan_id:plan.plan_id,transaction_hash:S.walletHash});
    }),'button primary');sign.disabled=S.busy||S.walletAttempted||!S.walletAccount;row.append(sign);
    if(S.walletHash)row.append(button('Verify my wallet transaction',()=>operation(async()=>{S.walletResult=await api(resultBase()+'/near/wallet-verify',{plan_id:plan.plan_id,transaction_hash:S.walletHash});})));
    row.append(button('Download wallet private opening',()=>operation(async()=>{
      const opening=await api(resultBase()+'/near/wallet-opening',{plan_id:plan.plan_id});const url=URL.createObjectURL(new Blob([JSON.stringify(opening,null,2)+'\n'],{type:'application/json'}));const a=el('a');a.href=url;a.download='wallet-result-opening.private.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }),'text-button'));root.append(row);
    if(S.walletAttempted&&!S.walletResult?.verified)note('Wallet outcome is not yet verified. Inspect wallet activity before any further submission. No automatic retry.');
    if(S.walletResult?.verified)note('Wallet transaction reached FINAL and matches the exact result commitment, signer and pinned contract.');
  }
  function renderNear() {
    $('screen').dataset.kind = 'submit'; document.body?.setAttribute('data-view','focus'); $('step-label').textContent = 'NEAR TESTNET';
    const value = S.nearState, receipt = S.walletResult?.receipt || value?.receipt;
    const title = S.walletResult?.verified ? 'Your wallet recorded this result on NEAR.' : value?.verified ? 'The demo operator recorded this result on NEAR.' : 'Record this result on NEAR testnet.';
    heading(title, 'Only a salted commitment leaves this app. Scenario details and the private opening stay off chain.');
    summary([['Network','NEAR testnet'],['Contract',value?.capabilities?.contract_id || 'Not configured'],['Connected wallet',S.walletAccount?.accountId || 'Not connected'],['Operator relay',value?.capabilities?.signer_id || 'Not configured'],['Attached test NEAR ceiling','0.01 · storage excess refunded by contract'],['Status',receipt?.status || value?.status || 'Prepared locally']]);
    if (receipt?.transaction_hash) { const link = el('a','View transaction ↗','text-button'); link.href = 'https://testnet.nearblocks.io/txns/' + encodeURIComponent(receipt.transaction_hash); link.target='_blank';link.rel='noopener noreferrer';$('screen').append(link); }
    renderWalletNear();
    const row=el('div',undefined,'actions-row');
    const confirm=button('Use operator demo relay instead',()=>operation(async()=>{try { S.nearState=await api(resultBase()+'/near/submit',{allow_submit:true,commitment:value.public.commitment}); } catch (failure) { try { S.nearState=await api(resultBase()+'/near/prepare',{}); } catch (_) {} throw failure; }}), 'button primary');
    confirm.disabled=S.busy||value?.can_submit!==true;row.append(confirm);
    const verify=button('Verify from NEAR',()=>operation(async()=>{S.nearState=await api(resultBase()+'/near/verify',{});}));verify.disabled=S.busy||!value?.capabilities?.enabled;row.append(verify,button('Return to slides',()=>{S.mode='results';render();},'text-button'));$('screen').append(row);
    const opening=el('a','Download private opening','text-button');opening.href=resultBase()+'/near/opening';opening.download='private-result-opening.json';$('screen').append(opening);
    if (S.busy) note('Waiting for the testnet RPC and finalized receipts. This can take a minute. No duplicate submission or automatic retry will be made.');
    note('Your wallet or the optional demo relayer signs publicly. A commitment proves byte consistency, not identity, anonymity or prediction accuracy. Submission is never automatically retried.');
    $('next').hidden=true;$('back').hidden=true;$('keyboard-hint').hidden=true;
  }
  function renderDetailedResults() {
    $('screen').dataset.kind = 'results'; $('step-label').textContent = 'RESULTS UNDER YOUR RULES'; const results = S.session.results || [], stats = S.session.summary || summaryStats(results), completed = stats.completed_worlds; const costs = S.session.cost || resultCosts(results); const requested = Number.isInteger(stats.requested_worlds) ? stats.requested_worlds : null; message(`${completed} completed worlds. Recorded results and charts.`);
    if(S.readingReturn)$('screen').append(button('Back to my question',returnToQuestion,'button secondary'));
    $('screen').append(el('span', 'Recorded model decisions · replay verified', 'status-tag')); heading('What happened in these worlds?', `${completed} completed${requested === null ? ' worlds. The requested total was not recorded for this historical run.' : ` of ${requested} requested ${requested === 1 ? 'world' : 'worlds'}.`} Means and medians describe these conditional runs, not real-world success odds.`);
    summary([['Recorded model calls in completed worlds', costs.recorded_model_calls], ['Reported models', costs.models?.join(', ') || 'Not recorded'], ['TypeSafe input tokens recorded', costs.recorded_input_tokens ?? 'Unknown'], ['Input cost estimate · not billed cost', costs.input_cost_estimate_usd == null ? 'Unknown' : `$${costs.input_cost_estimate_usd}`]]);
    note('Recorded call and native input totals cover completed worlds only, where the relevant receipt fields exist. Model identity and usage are provider-reported, not attested. Input cost is a list-price estimate; actual charges remain unknown. Authoring and failed or unfinished calls are excluded.');
    const grid = el('div', undefined, 'metric-grid'); for (const metric of Object.values(stats.metrics || {})) { if (!Number.isFinite(metric.median)) continue; const card = el('div', undefined, 'metric'); card.append(el('p', metric.label, 'metric-label'), el('p', number(metric.median), 'metric-number'), el('p', `Median ${metric.unit} · mean ${number(metric.mean)}`, 'metric-description'), el('p', `Range ${number(metric.min)}–${number(metric.max)}`, 'metric-description')); const definition = S.world.metrics.find(m => m.label === metric.label); if (definition && definition.max > definition.min) { const meter = el('meter', undefined, 'score-meter'); meter.min = definition.min; meter.max = definition.max; meter.value = metric.median; meter.setAttribute('aria-label', `${metric.label}: median ${metric.median}, permitted range ${definition.min} to ${definition.max}`); card.append(meter, el('p', `Started at ${definition.initial} · scale ${definition.min}–${definition.max}`, 'metric-description')); } grid.append(card); } $('screen').append(grid);
    $('screen').append(el('h2', 'What the personas favored')); note('Darker choices have higher model scores. These are action preferences in the supplied context, not event probabilities or explanations. Jev returns no reasoning trace. Scores below average over completed decisions; inspect round-level scores separately.');
    const roles = groups(results); for (const g of roles.slice(0, 6)) renderDistribution(g, $('screen'));
    if (roles.length > 6) { const remaining = el('details', undefined, 'fine-details'); remaining.append(el('summary', `All ${roles.length} persona score charts`)); for (const g of roles.slice(6)) renderDistribution(g, remaining); $('screen').append(remaining); }
    const detailed = el('details', undefined, 'fine-details'); detailed.append(el('summary', 'Round-by-round decisions and modeled costs')); for (const g of groups(results, true)) renderDistribution(g, detailed);
    for (const r of results) { const row = el('div', undefined, 'trace-row'); row.append(el('p', `World ${r.world_index + 1}: ${usd(r.result.total_cost_cents / 100)} in modeled action costs.`)); for (const d of r.decisions) row.append(el('p', `${d.actor_id} / round ${d.round}: ${d.action_id}. ${d.receipt?.model_reported || d.receipt?.model_declared || 'No model call'}${d.receipt?.decision_contract ? ` · ${d.receipt.decision_contract}` : ''}.`)); detailed.append(row); } $('screen').append(detailed);
    const actions = el('div', undefined, 'actions-row'); actions.append(button('Review another run', () => { if (S.savedView) { operation(async () => { const snapshot = await api(`/api/product/sessions/${S.savedView.session}`); S.session = snapshot; S.savedView = null; beginReview(); render(true); }); } else { beginReview(); render(true); } }), button('All saved results', () => showLibrary(), 'text-button'), button('Download exact results', () => { const a = el('a'); a.href = S.savedView ? `/api/product/results/${S.savedView.session}/${S.savedView.run}/download` : sessionPath('/download'); a.download = `scenario-${S.session.id}.results.json`; a.click(); }, 'text-button')); $('screen').append(actions); note('The download includes full private scenario details. Utilities are not cash profit; model billing is separate from modeled action costs.');
    $('flow-progress').max = 1; $('flow-progress').value = 1; $('next').hidden = true; $('back').hidden = true; $('keyboard-hint').hidden = true; $('start-over').hidden = false; $('start-over').disabled = S.busy; $('resume').disabled = S.busy;
  }
  async function resume() { await operation(async () => { const id = storedSession(); if (!id) throw new Error('No saved session is available in this browser.'); const snapshot = await api(`/api/product/sessions/${encodeURIComponent(id)}`); accept(snapshot, 'resume'); }); }
  function accessSetup(options){
    if(S.busy||active())return;
    const previous={mode:S.mode,index:S.index,step:current()?.id,author:JSON.stringify(S.boot.routes.author)};
    window.ScenarioAccess?.open({boot:S.boot,welcome:options?.welcome===true,onDone:async(action)=>{
      S.boot=await api('/api/product');S.typesafeHealth=null;
      S.settings.actorRoute=preferredActor(S.boot)||S.settings.actorRoute;
      if(previous.author!==JSON.stringify(S.boot.routes.author))S.answers.public=null;
      if(S.session)S.session.review=null;
      if(S.boot.access.mode==='offline'){
        S.walletAccount=null;S.walletPlan=null;
        if(window.ScenarioWallet?.account){window.location.reload();return;}
      }
      if(action==='example'){
        S.answers.intent='launch';S.answers.start='prepared';
        await loadExample(exampleFor('launch'));return;
      }
      if(S.world&&['review','confirm'].includes(previous.mode)){
        S.mode='review';S.steps=reviewSteps();
        const id=previous.mode==='confirm'?'plan':previous.step;
        S.index=Math.max(0,S.steps.findIndex(step=>step.id===id));
      }else if(previous.mode==='setup'){
        S.mode='setup';S.steps=setupSteps();
        S.index=Math.max(0,S.steps.findIndex(step=>step.id===previous.step));
      }else{S.mode=previous.mode;S.index=previous.index;}
      render(true);
    }});
  }

  async function init() {
    try { S.boot = await api('/api/product'); S.settings.actorRoute = preferredActor(S.boot) || 'typesafe'; S.typesafeHealth = S.boot.typesafe_health; $('model-label').textContent = route('typesafe')?.enabled ? 'Jev · primary' : 'Jev · not configured'; $('model-label').title = $('model-label').textContent; $('resume').hidden = !storedSession(); S.steps = setupSteps(); render(); if(S.boot.access&&(!S.boot.access.completed||(!hasIntroduction&&!storedSession())))accessSetup({welcome:true}); }
    catch (failure) { error(failure.message); $('model-label').textContent = 'Backend unavailable'; }
  }
  const introduction=$('landing'),hasIntroduction=introduction?.dataset.page==='intro';
  let entering=false;
  async function enterWorkspace(){
    if(entering)return;entering=true;
    introduction.hidden=true;$('main').hidden=false;document.body?.setAttribute('data-view','focus');
    $('skip-link').href='#main';$('skip-link').textContent='Skip to current question';window.scrollTo?.(0,0);
    await init();
  }
  function previewAction(id){
    const actions={pilot:{label:'Run a small pilot',cost:500,attention:25,risk:25},announce:{label:'Broad announcement',cost:1500,attention:45,risk:45},wait:{label:'Wait',cost:0,attention:20,risk:30}},action=actions[id];
    const root=$('landing-preview');root.replaceChildren();root.append(el('p',action.label,'preview-action'));
    const spend=el('p',usd(action.cost)+' ','preview-spend');spend.append(el('span','modeled action cost'));root.append(spend);
    const effects=el('dl',undefined,'preview-effects');for(const [name,value]of [['Qualified attention',`20 → ${action.attention}`],['Execution risk',`30 → ${action.risk}`]]){const row=el('div');row.append(el('dt',name),el('dd',value));effects.append(row);}root.append(effects);
    for(const key of Object.keys(actions))$('preview-'+key).setAttribute('aria-pressed',String(key===id));
  }
  $('access-settings').addEventListener('click',accessSetup);
  $('wallet-connect').addEventListener('click',connectWallet);
  $('saved-results').addEventListener('click', () => showLibrary());
  $('back').addEventListener('click', back); $('next').addEventListener('click', next); $('start-over').addEventListener('click', beginSetup); $('resume').addEventListener('click', resume);
  document.addEventListener('keydown', event => {
    if(hasIntroduction&&!introduction.hidden)return;
    if(document.getElementById('access-dialog'))return;
    if (S.busy || active() || S.transitioning) return;
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && current()?.type === 'text') { event.preventDefault(); next(); return; }
    if (S.mode === 'results' && !S.detailsMode && S.deckController && ['ArrowRight','ArrowLeft','ArrowDown','ArrowUp'].includes(event.key) && !['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName)) { event.preventDefault(); if (['ArrowRight','ArrowDown'].includes(event.key)) S.deckController.next(); else S.deckController.back(); return; }
    const step = current();
    if (/^[a-h]$/i.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName) && !event.target?.isContentEditable && $('screen').dataset.kind === 'question' && step?.options) {
      const option = step.options[event.key.toLowerCase().charCodeAt(0) - 97];
      if (option && !option.disabled) { event.preventDefault(); selectAnswer(step, option.value); }
      return;
    }
    const action = keyNavigation(event, $('screen').dataset.kind); if (action === 'back') { event.preventDefault(); back(); } else if (action === 'next') { event.preventDefault(); next(); }
  });
  window.ScenarioFlow = Object.freeze({ recommendAlpha, sliderValue, buildBrief, authoringPlan, keyNavigation, summaryStats, groups, questionTempo, preferredActor, personaOptions });
  if(hasIntroduction){
    $('main').hidden=true;
    for(const id of ['landing-start','landing-start-bottom'])$(id).addEventListener('click',enterWorkspace);
    for(const id of ['pilot','announce','wait'])$('preview-'+id).addEventListener('click',()=>previewAction(id));
  }else init();
})();
