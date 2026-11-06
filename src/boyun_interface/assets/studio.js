'use strict';

// Authoring stays outside the engine. This view edits/imports declared packages;
// every validation, batch and choice below calls the real local backend.
(() => {
  const s = { mounted: false, draft: null, compilation: null, epoch: 0, busy: false,
    world: null, result: null, pendingStep: null, timer: null };
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const post = (path, data) => api(path, { method: 'POST', body: JSON.stringify(data) });
  const status = (text) => { $('studio-status').textContent = text; };
  const clear = () => { $('studio-error').hidden = true; };
  const fail = (error) => { $('studio-error').textContent = errorMessage(error); $('studio-error').hidden = false; };
  const act = (fn) => async (event) => { event?.preventDefault(); clear(); try { await fn(event); } catch (error) { fail(error); } };
  const interactive = () => s.compilation?.package?.schema_version === 'choice-world.v1';
  const ready = () => Boolean(s.compilation?.ready);
  const display = (value, unit) => unit === 'cents' ? money(value) : unit === 'declared_USD_payoff' ? moneyFormat.format(value) : number(value);
  const label = (id) => human(id).replaceAll('-', ' ').replace(/^./, (first) => first.toUpperCase());

  function lock(busy) {
    s.busy = busy;
    document.querySelectorAll('#view-studio input, #view-studio select, #view-studio textarea, #view-studio button').forEach((el) => { el.disabled = busy; });
    $('studio-run').disabled = busy || !ready();
    $('studio-start').disabled = busy || !ready() || !interactive();
    $('studio-fork').disabled = busy || !s.world;
    if (!busy && s.world) document.querySelectorAll('#studio-choices button[data-ineligible]').forEach((el) => { el.disabled = true; });
  }
  function changed() {
    s.draft.revision += 1; s.epoch += 1; s.compilation = null;
    $('studio-revision').textContent = `Revision ${s.draft.revision}`;
    $('studio-json').value = JSON.stringify(s.draft, null, 2);
    $('studio-run').disabled = true; $('studio-start').disabled = true;
    $('studio-validation').replaceChildren(paragraph('Changed. Checking the updated inputs…'));
    if (s.result) $('studio-results-meta').textContent = `Previous draft · ${s.result.worlds} worlds`;
    clearTimeout(s.timer); s.timer = setTimeout(() => validate().catch(fail), 300);
  }
  async function validate() {
    const epoch = s.epoch; const draft = copy(s.draft);
    const result = await post('/api/studio/validate', { draft });
    // A delayed validation must never enable execution for a newer draft.
    if (s.epoch !== epoch) return null;
    s.compilation = result;
    const box = $('studio-validation'); box.replaceChildren();
    box.append(paragraph(result.ready ? 'Ready to execute. Inputs and allowed actions pass validation.' : 'Some inputs need attention before execution.', result.ready ? 'verification' : 'field-error'));
    for (const issue of result.issues || []) box.append(paragraph(`${issue.path}: ${issue.message}`, 'field-error'));
    $('studio-module').textContent = result.package?.schema_version || s.draft.engine_input?.schema_version || 'No executable package';
    lock(s.busy);
    return result;
  }
  function fieldValue(field, raw) {
    if (raw === '') return null;
    if (field.type === 'integer') { const value = Number(raw); if (!Number.isSafeInteger(value)) throw new Error('Enter a whole number.'); return value; }
    if (field.type === 'boolean') return raw === 'true';
    return raw;
  }
  function renderFields() {
    const box = $('studio-fields'); box.replaceChildren();
    if (!s.draft.fields.length) box.append(paragraph('This package supplies its inputs directly. Use your agent or the JSON editor to change them.'));
    s.draft.fields.forEach((field, index) => {
      const wrap = node('div', null, 'studio-field parameter-field');
      const title = node('div', null, 'parameter-name');
      const caption = node('label', `${field.label}${field.required ? ' *' : ''}`); caption.htmlFor = `studio-field-${index}`;
      const help = node('button', '?', 'help-trigger'); help.type = 'button';
      help.dataset.tooltip = `studio-help-${index}`; help.setAttribute('aria-label', `About ${field.label}`);
      help.setAttribute('aria-describedby', help.dataset.tooltip); help.setAttribute('aria-expanded', 'false');
      const tip = node('span', String(field.why || 'Declared input.').slice(0, 190), 'param-tooltip'); tip.id = help.dataset.tooltip; tip.hidden = true; tip.setAttribute('role', 'tooltip');
      title.append(caption, help, tip);
      let input;
      if (field.type === 'boolean' || field.type === 'choice') {
        input = node('select'); input.append(node('option', 'Choose a value'));
        input.children[0].value = '';
        const choices = field.type === 'boolean' ? ['true', 'false'] : field.choices;
        choices.forEach((choice) => { const option = node('option', String(choice)); option.value = String(choice); input.append(option); });
      } else {
        input = node('input'); input.type = field.type === 'integer' ? 'number' : 'text';
        if (field.type === 'integer') { input.step = '1'; if (field.minimum !== null) input.min = String(field.minimum); if (field.maximum !== null) input.max = String(field.maximum); }
      }
      input.id = caption.htmlFor; input.value = field.value === null ? '' : String(field.value);
      input.addEventListener('input', () => { try { field.value = fieldValue(field, input.value); input.setCustomValidity(''); changed(); } catch (error) { input.setCustomValidity(errorMessage(error)); field.value = input.value; changed(); } });
      wrap.append(title, input, paragraph([field.unit ? label(field.unit) : '', field.target ? 'Executable input' : 'Context only', field.provenance?.status || ''].filter(Boolean).join(' · '), 'quiet'));
      box.append(wrap);
    });
    bindTooltips();
  }
  function renderPolicy() {
    const box = $('studio-policy'); box.replaceChildren();
    const p = s.draft.engine_input;
    if (p?.schema_version !== 'choice-world.v1') return;
    if (!s.compilation?.ready) { box.append(paragraph('Batch decisions become available when the package and required inputs are complete.')); return; }
    box.append(node('h3', 'Batch decisions'), paragraph('Choose the first action to try in each scene. If it is unavailable, the engine tries the remaining actions in the listed order.'));
    p.scenes.forEach((scene, index) => {
      const row = node('label', scene.title); const select = node('select'); select.id = `studio-policy-${index}`;
      p.policy[scene.id].forEach((id) => { const choice = scene.choices.find((c) => c.id === id); const option = node('option', choice.label); option.value = id; select.append(option); });
      select.value = p.policy[scene.id][0];
      const order = paragraph(`Order: ${p.policy[scene.id].join(' → ')}`, 'quiet');
      select.addEventListener('change', () => { const previous = p.policy[scene.id]; p.policy[scene.id] = [select.value, ...previous.filter((id) => id !== select.value)]; order.textContent = `Order: ${p.policy[scene.id].join(' → ')}`; changed(); });
      row.append(select); box.append(row, order);
    });
  }
  function renderPersonas() {
    const p = s.draft.engine_input; const supplied = p?.personas || p?.cast?.actors;
    const actors = Array.isArray(supplied) ? supplied.filter((actor) => actor && typeof actor === 'object' && !Array.isArray(actor)) : [];
    const box = $('studio-personas'); box.replaceChildren();
    $('studio-personas-title').textContent = `Participants & behavior · ${actors.length} supplied`;
    box.append(paragraph('Descriptions supply context. Only the declared rules, policies and allowed actions cause behavior. Ask your agent for more detail or alternative strategies; adding a variant does not add capital.'));
    actors.forEach((actor) => {
      const item = node('div', null, 'studio-person'); item.append(node('h3', actor.name || actor.id), paragraph(actor.description || actor.provenance?.description || actor.provenance?.rationale || 'Supplied actor slot.'));
      item.append(paragraph([actor.role || actor.category, actor.strategy, actor.initial_cash_cents !== undefined ? `Initial cash ${money(actor.initial_cash_cents)}` : ''].filter(Boolean).join(' · '), 'quiet'));
      const alternatives = Array.isArray(p.cast?.alternatives) ? p.cast.alternatives.find((slot) => slot?.actor_id === actor.id) : null;
      if (Array.isArray(alternatives?.variants)) item.append(paragraph(`${alternatives.variants.length} alternatives for this same funded slot. Their supplied weights are reviewed in the draft JSON.`, 'quiet'));
      item.append(jsonDetails('Declared behavior', actor)); box.append(item);
    });
  }
  async function adopt(draft) {
    if (!draft || draft.schema_version !== 'scenario-draft.v1' || !Array.isArray(draft.fields) || !Number.isSafeInteger(draft.revision)) throw new Error('Import a scenario-draft.v1 object.');
    const epoch = ++s.epoch;
    const checked = await post('/api/studio/validate', { draft });
    if (s.epoch !== epoch) return;
    if (!checked.draft_valid) throw new Error((checked.issues || []).map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
    s.draft = copy(draft); s.compilation = checked; s.result = null;
    $('studio-results').hidden = true;
    $('studio-draft-title').textContent = label(draft.id);
    $('studio-description').textContent = draft.event_description;
    $('studio-revision').textContent = `Revision ${draft.revision}`;
    $('studio-json').value = JSON.stringify(draft, null, 2);
    renderFields(); renderPolicy(); renderPersonas();
    await validate();
    status('Scenario loaded. All calculations run locally; model calls: 0. Review the assumptions before running.');
  }
  async function readFile(input) {
    const file = input.files?.[0]; if (!file) throw new Error('Choose a JSON file.');
    if (file.size > 1024 * 1024) throw new Error('Use a JSON file smaller than 1 MiB.');
    try { return JSON.parse(await file.text()); } finally { input.value = ''; }
  }
  function metricRows(result) {
    if (Array.isArray(result.metrics)) return result.metrics;
    if (result.metrics) return Object.entries(result.metrics).map(([id, metric]) => ({ id, ...metric }));
    const stats = summary(result.worlds); return [{ id: 'net_cash_profit', unit: 'cents', mean: stats.mean, median: stats.p50, p05: stats.p05, p95: stats.p95 }];
  }
  function pathTitle(path, packageInput) {
    if (path.path) return path.path.map((step) => {
      const scene = packageInput.scenes?.find((scene) => scene.id === step.scene_id);
      const choice = scene?.choices.find((choice) => choice.id === step.choice_id);
      return `${choice?.label || step.choice_id}: ${choice?.outcomes.find((outcome) => outcome.id === step.outcome_id)?.label || step.outcome_id}`;
    }).join(' → ') || `No step executed · ${path.status}`;
    if (path.selected_outcomes) return Object.entries(path.selected_outcomes).map(([id, outcome]) => `${label(id)}: ${label(outcome)}`).join(' → ') || 'No event fired';
    return path.label || path.id || 'Scenario';
  }
  function pathRows(result) {
    if (result.paths) return result.paths;
    return result.overview?.event_paths || [];
  }
  function renderResults(result, jobId, draft) {
    s.result = { worlds: typeof result.worlds === 'number' ? result.worlds : result.world_count, result, draft };
    $('studio-results').hidden = false;
    const count = s.result.worlds;
    $('studio-results-meta').textContent = `${count} worlds · revision ${draft.revision} · seed ${result.seed}`;
    const items = metricRows(result);
    $('studio-result-metrics').replaceChildren(metrics(items.slice(0, 8).map((metric) => [label(metric.id), display(metric.median, metric.unit), `Median · mean ${display(metric.mean, metric.unit)} · ${label(metric.unit)}`])));
    const paths = pathRows(result).slice().sort((a, b) => b.count - a.count);
    const box = $('studio-result-paths'); box.replaceChildren();
    if (result.status_counts) box.append(paragraph(`${result.status_counts.completed} completed · ${result.status_counts.blocked} blocked. Blocked worlds stay in the denominator.`, 'quiet'));
    paths.slice(0, 6).forEach((path) => {
      const row = node('div', null, 'scenario-row');
      const heading = node('div', null, 'scenario-row-heading');
      heading.append(node('h4', pathTitle(path, result.execution_input || draft.engine_input)), node('span', `${percent(path.frequency ?? path.count / count)} · ${path.count} worlds`));
      const track = node('div', null, 'scenario-frequency-track'); const fill = node('span', null, 'scenario-frequency-fill'); fill.style.width = `${Math.max(0, Math.min(100, (path.frequency ?? path.count / count) * 100))}%`; track.append(fill);
      row.append(heading, track);
      const perPath = path.metrics || {};
      if (!Object.keys(perPath).length && path.selected_outcomes && result.world_results) {
        const matching = result.world_results.filter((world) => JSON.stringify(world.selected_outcomes) === JSON.stringify(path.selected_outcomes));
        items.forEach((metric) => {
          const values = matching.map((world) => world.metrics[metric.id]).sort((a, b) => a - b);
          if (values.length) perPath[metric.id] = { median: values[Math.ceil(values.length / 2) - 1], mean: values.reduce((a, b) => a + b, 0) / values.length };
        });
      }
      Object.entries(perPath).slice(0, 4).forEach(([id, stats]) => { const metric = items.find((item) => item.id === id); row.append(paragraph(`${label(id)} · median ${display(stats.median, metric?.unit)} · mean ${display(stats.mean, metric?.unit)}`, 'scenario-cash-label')); });
      if ('median_cents' in path) row.append(paragraph(`Cash profit · median ${money(path.median_cents)} · mean ${money(path.mean_cents)}`, 'scenario-cash-label'));
      box.append(row);
    });
    if (paths.length > 6) box.append(paragraph(`${paths.length - 6} more paths account for ${percent(paths.slice(6).reduce((total, path) => total + (path.frequency ?? path.count / count), 0))} of worlds. The download includes every path.`));
    if (!paths.length) box.append(paragraph('This adapter returns its detailed scenario groups in the result download.'));
    $('studio-result-download').replaceChildren(downloadLink(jobId));
    const limits = $('studio-limits'); limits.replaceChildren();
    (result.limitations || []).forEach((line) => limits.append(paragraph(line)));
    limits.append(paragraph('Frequencies are conditional on this package and policy. Supplied odds and rules are not empirically calibrated by this engine.'), jsonDetails('Execution identity', result.run_identity));
    $('studio-results').scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }
  async function runBatch() {
    if (s.busy || state.activeJob) throw new Error('Another local experiment is running. Wait for it to finish.');
    const checked = await validate(); if (!checked?.ready) return;
    if (state.activeJob) throw new Error('Another local experiment is running. Wait for it to finish.');
    const draft = copy(s.draft); const worlds = positiveInteger('studio-worlds', 'Worlds', 1); const seed = positiveInteger('studio-seed', 'Seed');
    lock(true); setBusy(true); state.activeJob = 'studio-submitting';
    try {
      status(`Submitting ${worlds} worlds for validation and local execution…`);
      let job = await post('/api/jobs', { kind: 'scenario', draft, worlds, seed });
      state.activeJob = job.job_id;
      while (job.status === 'queued' || job.status === 'running') {
        status(`${job.status === 'queued' ? 'Queued' : 'Executing reviewed rules'} · ${worlds} requested worlds · no model calls.`);
        await new Promise((resolve) => setTimeout(resolve, 450));
        job = await api(`/api/jobs/${encodeURIComponent(job.job_id)}`);
      }
      if (job.status !== 'completed') throw new Error(job.error || 'The local engine stopped before completing the batch.');
      renderResults(job.result, job.job_id, draft);
      status(`Completed ${worlds} worlds using the submitted revision ${draft.revision}. Charts summarize calculated outcomes.`);
    } catch (error) { status('Run status needs attention. If the connection was lost, the server may still be executing; check its status before submitting again.'); throw error; }
    finally { state.activeJob = null; setBusy(false); lock(false); }
  }
  function remember(record) { try { localStorage.setItem('scenario-studio-world', record.id); } catch (_) { /* Browser storage may be unavailable. */ } }
  function renderWorld(record) {
    s.world = record; remember(record); s.pendingStep = null;
    const snap = record.snapshot; const p = snap.package;
    const scene = p.scenes.find((scene) => scene.id === snap.scene_id);
    $('studio-world').hidden = false; $('studio-world-empty').hidden = true;
    $('studio-scene-title').textContent = scene?.title || (snap.status === 'completed' ? 'World complete' : 'World blocked');
    $('studio-world-meta').textContent = `${p.id} · ${snap.branch_id} · step ${snap.step_count} · revision ${record.revision}`;
    $('studio-scene-description').textContent = scene?.description || `Final state for ${p.id}. You can save it or restore an earlier snapshot to compare choices.`;
    $('studio-world-metrics').replaceChildren(metrics(p.metrics.map((metric) => [label(metric.id), display(snap.metrics[metric.id], metric.unit), label(metric.unit)])));
    const box = $('studio-choices'); box.replaceChildren();
    record.choices.forEach((choice) => {
      const card = node('div', null, 'studio-choice');
      const button = node('button', choice.label, 'button secondary'); button.disabled = !choice.eligible || s.busy;
      if (!choice.eligible) button.dataset.ineligible = 'true';
      button.addEventListener('click', act(() => step(choice.id)));
      card.append(button, paragraph(choice.explanation));
      if (!choice.eligible) card.append(paragraph(`Unavailable: ${choice.disabled_reason}`, 'field-error'));
      const effects = choice.immediate_effects.map((effect) => `${label(effect.metric_id)} ${effect.delta >= 0 ? '+' : ''}${effect.delta}`);
      if (effects.length) card.append(paragraph(`Immediate: ${effects.join(' · ')}`, 'quiet'));
      choice.outcomes.forEach((outcome) => card.append(paragraph(`${percent(outcome.probability_bps / 10000)} ${outcome.label}`, 'quiet')));
      card.append(paragraph(`${choice.probability_provenance.status}: ${choice.probability_provenance.rationale}`, 'quiet'));
      box.append(card);
    });
    const history = $('studio-history'); history.replaceChildren();
    snap.history.forEach((entry, index) => {
      const scene = p.scenes.find((scene) => scene.id === entry.scene_id); const choice = scene.choices.find((choice) => choice.id === entry.choice_id); const outcome = choice.outcomes.find((outcome) => outcome.id === entry.outcome_id);
      history.append(paragraph(`${index + 1}. ${choice.label} → ${outcome.label}`));
    });
    $('studio-realized').hidden = !snap.history.length;
    if (snap.history.length) $('studio-realized').textContent = `Realized in this simulation: ${history.lastChild.textContent}`;
    lock(s.busy);
  }
  async function startWorld() {
    if (s.busy) return;
    lock(true);
    try {
      const checked = await validate(); if (!checked?.ready || !interactive()) return;
      renderWorld(await post('/api/studio/worlds', { package: checked.package, seed: positiveInteger('studio-seed', 'Seed'), world_id: 0 })); status('World created from the current package. Choose an action to realize its seeded event.'); $('studio-world').scrollIntoView?.({ behavior: 'smooth', block: 'start' }); }
    finally { lock(false); }
  }
  async function step(choiceId) {
    const record = s.world;
    if (!record) return;
    const pending = s.pendingStep?.id === record.id && s.pendingStep?.choice_id === choiceId ? s.pendingStep : { id: record.id, choice_id: choiceId, action_id: crypto.randomUUID(), expected_revision: record.revision };
    s.pendingStep = pending; lock(true);
    try {
      const updated = await post(`/api/studio/worlds/${record.id}/step`, { choice_id: pending.choice_id, action_id: pending.action_id, expected_revision: pending.expected_revision });
      if (s.world?.id === record.id) renderWorld(updated);
      status('Choice executed. The realized event and metric changes are saved locally.');
    } catch (error) {
      // Reconcile before another attempt. Never replace an unconfirmed action ID.
      try { const current = await api(`/api/studio/worlds/${record.id}`); if (s.world?.id === record.id && current.revision > record.revision) renderWorld(current); } catch (_) { /* Keep pending action for an exact retry. */ }
      throw error;
    } finally { lock(false); }
  }
  async function restore(input) {
    const snapshot = await readFile(input); lock(true);
    try { renderWorld(await post('/api/studio/restore', { snapshot })); status('Snapshot replay-validated and restored as a new local session. This verifies consistency, not historical ownership.'); }
    finally { lock(false); }
  }
  async function prepare() {
    const epoch = s.epoch;
    const request = await post('/api/studio/prepare', { draft: copy(s.draft), model: $('studio-model').value });
    if (epoch !== s.epoch) throw new Error('Draft changed while preparing the request. Export it again.');
    downloadObject(request, `${s.draft.id}-authoring-request.json`);
    status('Authoring request exported. Give it to your chosen agent and import its structured response here. No inference was called.');
  }
  async function applyResponse(response) {
    const epoch = s.epoch;
    const result = await post('/api/studio/apply', { draft: copy(s.draft), response });
    if (epoch !== s.epoch) throw new Error('Draft changed while applying this response. The newer draft is retained.');
    await adopt(result.draft);
  }
  async function mount() {
    if (s.mounted) return; s.mounted = true;
    try {
      const catalog = await api('/api/studio'); s.catalog = catalog;
      const select = $('studio-example'); select.replaceChildren();
      catalog.examples.forEach((example) => { const option = node('option', example.label); option.value = example.id; select.append(option); });
      select.value = 'choice'; select.disabled = false;
      select.addEventListener('change', act(() => adopt(catalog.examples.find((example) => example.id === select.value).draft)));
      $('studio-validate').addEventListener('click', act(validate));
      $('studio-draft-file').addEventListener('change', act(async (event) => adopt(await readFile(event.target))));
      $('studio-download-draft').addEventListener('click', act(() => downloadObject(s.draft, `${s.draft.id}-draft.json`)));
      $('studio-apply-json').addEventListener('click', act(() => adopt(JSON.parse($('studio-json').value))));
      $('studio-prepare').addEventListener('click', act(prepare));
      $('studio-response-file').addEventListener('change', act(async (event) => applyResponse(await readFile(event.target))));
      $('studio-run').addEventListener('click', act(runBatch));
      $('studio-start').addEventListener('click', act(startWorld));
      $('studio-save-world').addEventListener('click', act(() => downloadObject(s.world.snapshot, `${s.world.snapshot.package.id}-${s.world.snapshot.branch_id}.json`)));
      $('studio-fork').addEventListener('click', act(async () => { if (s.busy) return; const record = s.world; lock(true); try { renderWorld(await post(`/api/studio/worlds/${record.id}/fork`, { branch_id: `comparison-${Date.now()}`, expected_revision: record.revision })); status('Fork created. Save a state before choosing when you want to compare alternatives; a fork keeps the same future event draws.'); } finally { lock(false); } }));
      ['studio-snapshot-file', 'studio-empty-snapshot-file'].forEach((id) => $(id).addEventListener('change', act((event) => restore(event.target))));
      let saved; try { saved = localStorage.getItem('scenario-studio-world'); } catch (_) { /* Optional recovery. */ }
      if (/^[0-9a-f]{32}$/.test(saved || '')) {
        $('studio-resume').hidden = false;
        $('studio-resume').addEventListener('click', act(async () => { if (s.busy) return; lock(true); try { renderWorld(await api(`/api/studio/worlds/${saved}`)); status('Saved world resumed from its own frozen package. Editing the current draft does not alter it.'); } finally { lock(false); } }));
      }
      await adopt(catalog.examples.find((example) => example.id === 'choice').draft);
    } catch (error) { fail(error); status('Studio could not load. Check the local server and refresh.'); }
  }
  // A narrow test seam exercises race handling using the shipped functions.
  window.ScenarioStudio = { mount, validate, applyResponse, fieldValue, state: s, metricRows, pathTitle, renderFields, renderPolicy, renderPersonas, startWorld, runBatch, renderResults, step };
  window.addEventListener('scenario-lab-ready', mount);
  if (state.bootstrap) mount();
})();
