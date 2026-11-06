'use strict';

const $ = (id) => document.getElementById(id);
const state = { bootstrap: null, scenario: null, jobs: new Map(), activeJob: null, run: null,
  peopleMode: 'library', cast: null, commitments: new Map(), selectedView: 'studio', walletEvidence: null,
  evidenceRevision: { wallets: 0, topics: 0 }, overviewMode: 'event_paths', briefPrepared: false };
const moneyFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const integerFormat = new Intl.NumberFormat('en-US');
const money = (cents) => Number.isFinite(cents) ? moneyFormat.format(cents / 100) : '–';
const number = (value) => Number.isFinite(value) ? integerFormat.format(value) : '–';
const decimal = (value, digits = 4) => Number.isFinite(value) ? value.toFixed(digits) : '–';
const percent = (value) => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '–';
const human = (value) => String(value ?? '').replaceAll('_', ' ');
const json = (value) => JSON.stringify(value, null, 2);
const clone = (value) => JSON.parse(JSON.stringify(value));
const outcomeRanges = { severe_loss: 'Below −$5,000', loss: '−$5,000 to below $0', modest_profit: '$0 to below $20,000', large_profit: '$20,000 or more' };
const planNames = { launch_now: 'Launch now', lower_marketing: 'Lower marketing', defer_launch: 'Defer launch', do_not_launch: 'Do not launch' };

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined && text !== null) element.textContent = String(text);
  if (className) element.className = className;
  return element;
}
function replace(id, ...children) { $(id).replaceChildren(...children); }
function paragraph(text, className = 'help') { return node('p', text, className); }
function jsonDetails(title, value) {
  const details = node('details', null, 'advanced');
  details.append(node('summary', title), node('pre', json(value)));
  return details;
}
function errorMessage(error) { return error instanceof Error ? error.message : String(error); }
function showError(error) { $('app-error').textContent = errorMessage(error); $('app-error').hidden = false; }
function clearError() { $('app-error').hidden = true; }
function guard(action) { return async (event) => { if (event) event.preventDefault(); clearError(); try { await action(event); } catch (error) { showError(error); } }; }
function downloadLink(jobId, label = 'Download result JSON') {
  const link = node('a', label, 'text-link');
  link.href = `/api/jobs/${encodeURIComponent(jobId)}/download`;
  link.download = '';
  return link;
}
function downloadObject(value, filename) {
  const blob = new Blob([json(value) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = node('a'); anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function table(columns, rows, caption) {
  const wrap = node('div', null, 'table-scroll');
  const element = node('table');
  if (caption) { const cap = node('caption', caption, 'sr-only'); element.append(cap); }
  const head = node('thead'); const header = node('tr');
  columns.forEach((column) => header.append(node('th', column.label, column.numeric ? 'numeric' : '')));
  head.append(header); element.append(head);
  const body = node('tbody');
  rows.forEach((row) => {
    const tr = node('tr');
    columns.forEach((column) => tr.append(node('td', column.value(row), column.numeric ? 'numeric' : '')));
    body.append(tr);
  });
  element.append(body); wrap.append(element); return wrap;
}
function metrics(items) {
  const wrapper = node('div', null, 'metrics');
  items.forEach(([label, value, note]) => {
    const metric = node('div', null, 'metric');
    metric.append(node('span', label, 'metric-label'), node('div', value, 'metric-value'));
    if (note) metric.append(node('div', note, 'metric-note'));
    wrapper.append(metric);
  });
  return wrapper;
}
function svgNode(tag, attributes, text) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attributes || {}).forEach(([key, value]) => element.setAttribute(key, String(value)));
  if (text !== undefined) element.textContent = text;
  return element;
}
function summary(worlds) {
  const values = worlds.map((world) => world.net_profit_cents).sort((a, b) => a - b);
  if (!values.length) throw new Error('The result contains no completed worlds.');
  const rank = (p) => values[Math.max(0, Math.ceil(p * values.length) - 1)];
  return { count: values.length, mean: values.reduce((a, b) => a + b, 0) / values.length,
    p05: rank(.05), p50: rank(.5), p95: rank(.95) };
}
function histogram(worlds) {
  const values = worlds.map((world) => world.net_profit_cents);
  const min = Math.min(...values); const max = Math.max(...values);
  const bins = Array(min === max ? 1 : 12).fill(0);
  const span = max - min;
  values.forEach((value) => { bins[span === 0 ? 0 : Math.min(bins.length - 1, Math.floor((value - min) / span * bins.length))] += 1; });
  const width = 560; const height = 190; const left = 8; const top = 16; const bottom = 147; const plotWidth = 544;
  const chart = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, class: 'histogram', role: 'img', 'aria-label': `Cash profit histogram for ${values.length} worlds, from ${money(min)} to ${money(max)}` });
  chart.append(svgNode('title', {}, 'Computed cash profit distribution'));
  chart.append(svgNode('line', { x1: left, x2: left + plotWidth, y1: bottom, y2: bottom, class: 'axis' }));
  const peak = Math.max(...bins);
  bins.forEach((count, index) => {
    const slot = plotWidth / bins.length; const barHeight = count / peak * (bottom - top);
    const bar = svgNode('rect', { x: left + index * slot + 2, y: bottom - barHeight, width: Math.max(1, slot - 4), height: barHeight, class: 'bar' });
    const low = min + (span / bins.length) * index; const high = min + (span / bins.length) * (index + 1);
    bar.append(svgNode('title', {}, `${money(low)} to ${money(high)}: ${count} worlds`)); chart.append(bar);
  });
  if (min < 0 && max > 0) chart.append(svgNode('line', { x1: left + -min / span * plotWidth, x2: left + -min / span * plotWidth, y1: top, y2: bottom, class: 'zero' }));
  chart.append(svgNode('text', { x: left, y: 170 }, money(min)), svgNode('text', { x: width - 8, y: 170, 'text-anchor': 'end' }, money(max)), svgNode('text', { x: width - 8, y: 12, 'text-anchor': 'end' }, `Peak bin: ${peak} worlds`));
  return chart;
}
function comparisonChart(arms) {
  const width = 800; const rowHeight = 43; const labelWidth = 185; const right = 115; const plotWidth = width - labelWidth - right;
  const minimum = Math.min(0, ...arms.map((arm) => arm.stats.mean));
  const maximum = Math.max(0, ...arms.map((arm) => arm.stats.mean));
  const range = maximum - minimum || 1;
  const x = (value) => labelWidth + (value - minimum) / range * plotWidth;
  const chart = svgNode('svg', { viewBox: `0 0 ${width} ${arms.length * rowHeight + 10}`, class: 'comparison-chart', role: 'img', 'aria-label': 'Mean cash profit by experiment arm. Exact values are in the following table.' });
  arms.forEach((arm, index) => {
    const y = index * rowHeight + 6;
    chart.append(svgNode('text', { x: 0, y: y + 19 }, arm.label), svgNode('line', { x1: labelWidth, x2: width - right, y1: y + 30, y2: y + 30 }));
    const rect = svgNode('rect', { x: Math.min(x(0), x(arm.stats.mean)), y, width: Math.max(1, Math.abs(x(arm.stats.mean) - x(0))), height: 27, class: index === 0 ? 'baseline' : '' });
    rect.append(svgNode('title', {}, `${arm.label}: ${money(arm.stats.mean)}`)); chart.append(rect);
    chart.append(svgNode('text', { x: width, y: y + 19, 'text-anchor': 'end' }, money(arm.stats.mean)));
  });
  return chart;
}
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json', 'X-CSRF-Token': state.bootstrap?.csrf_token || '' } : {}), ...options.headers } });
  let data;
  try { data = await response.json(); } catch (_) { throw new Error(`The local server returned an unreadable response (${response.status}).`); }
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : (data.error?.message || data.message || `Local request failed (${response.status}).`));
  return data;
}
function setBusy(busy) {
  document.querySelectorAll('.job-action, #prepare-experiment, #use-example, #edit-brief, #scenario-form input, #scenario-form select, #scenario-form textarea, #apply-scenario, #brief-form input, #brief-form textarea').forEach((control) => { control.disabled = busy || !state.bootstrap; });
}
function positiveInteger(id, name, minimum = 0) {
  const value = Number($(id).value);
  if (!$(id).value.trim() || !Number.isSafeInteger(value) || value < minimum) throw new Error(`${name} must be a whole number of at least ${minimum}.`);
  return value;
}
function centsInput(id, label, minimum = 0) {
  const value = Number($(id).value); const cents = Math.round(value * 100);
  if (!$(id).value.trim() || !Number.isFinite(value) || cents < minimum || Math.abs(value * 100 - cents) > 1e-6 || !Number.isSafeInteger(cents)) throw new Error(`${label} must be a valid amount with at most two decimals.`);
  return cents;
}
function percentageInput(id, label) {
  const value = Number($(id).value); const basisPoints = Math.round(value * 100);
  if (!$(id).value.trim() || !Number.isFinite(value) || value < 0 || value > 100 || Math.abs(value * 100 - basisPoints) > 1e-6) throw new Error(`${label} must be from 0 to 100, with at most two decimals.`);
  return basisPoints;
}
function validateScenario(scenario) {
  if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario) || scenario.mode !== 'synthetic') throw new Error('Apply an explicitly synthetic scenario object.');
  for (const field of ['capital_cents', 'lp_cash_cents', 'horizon_hours']) if (!Number.isSafeInteger(scenario[field]) || scenario[field] < 1) throw new Error(`${field} must be a positive integer.`);
  for (const field of ['launch_cost_cents', 'campaign_budget_cents']) if (!Number.isSafeInteger(scenario[field]) || scenario[field] < 0) throw new Error(`${field} must be a nonnegative integer.`);
  if (!scenario.cast_recipe || scenario.cast_recipe.founder_initial_cash_cents !== scenario.capital_cents) throw new Error('Capital must equal cast_recipe.founder_initial_cash_cents.');
  if (!Array.isArray(scenario.campaigns) || scenario.campaigns.some((campaign) => !Number.isSafeInteger(campaign.fee_cents) || campaign.fee_cents < 0)) throw new Error('Campaigns must have nonnegative integer fee_cents.');
  const obligations = scenario.campaigns.reduce((total, campaign) => total + campaign.fee_cents, 0);
  if (obligations > scenario.campaign_budget_cents) throw new Error('Scheduled campaign fees exceed the campaign budget.');
  if (scenario.launch_cost_cents + scenario.lp_cash_cents + obligations > scenario.capital_cents) throw new Error('Liquidity, launch cost and scheduled campaign fees exceed starting capital.');
  if (scenario.lp_unlock_at_hour <= scenario.horizon_hours) throw new Error('Liquidity must remain locked beyond the horizon; increase lp_unlock_at_hour.');
  for (const field of ['catalyst_probability_bps', 'followup_positive_probability_bps']) if (!Number.isInteger(scenario[field]) || scenario[field] < 0 || scenario[field] > 10000) throw new Error(`${field} must be an integer from 0 to 10000.`);
  if (scenario.user_brief !== undefined) validateBrief(scenario.user_brief);
  return scenario;
}
function readScenario() {
  if (!state.scenario) throw new Error('The local scenario has not loaded yet.');
  const scenario = clone(state.scenario);
  scenario.capital_cents = centsInput('capital', 'Starting capital', 1);
  scenario.cast_recipe.founder_initial_cash_cents = scenario.capital_cents;
  scenario.lp_cash_cents = centsInput('liquidity', 'Liquidity deposit', 1);
  scenario.launch_cost_cents = centsInput('launch-cost', 'Launch cost');
  const campaignBudget = centsInput('campaign', 'Campaign budget');
  if (campaignBudget !== scenario.campaign_budget_cents) {
    if (!scenario.campaigns.length && campaignBudget > 0) throw new Error('No campaign schedule exists. Add campaign entries in advanced JSON before assigning a budget.');
    const previousTotal = scenario.campaigns.reduce((total, campaign) => total + campaign.fee_cents, 0);
    let allocated = 0;
    scenario.campaigns.forEach((campaign, index) => {
      campaign.fee_cents = index === scenario.campaigns.length - 1 ? campaignBudget - allocated : Math.floor(campaignBudget * (previousTotal ? campaign.fee_cents / previousTotal : 1 / scenario.campaigns.length));
      allocated += campaign.fee_cents;
    });
    scenario.campaign_budget_cents = campaignBudget;
  }
  scenario.horizon_hours = positiveInteger('horizon', 'Horizon', 1);
  if (scenario.horizon_hours !== state.scenario.horizon_hours && scenario.lp_unlock_at_hour <= scenario.horizon_hours) scenario.lp_unlock_at_hour = scenario.horizon_hours + 1;
  scenario.catalyst_probability_bps = percentageInput('catalyst', 'Catalyst assumption');
  scenario.followup_positive_probability_bps = percentageInput('followup', 'Positive follow-up');
  return validateScenario(scenario);
}
function syncScenario() {
  try {
    const scenario = readScenario(); const changed = json(scenario) !== json(state.scenario); state.scenario = scenario;
    $('scenario-json').value = json(scenario); $('scenario-error').hidden = true;
    const campaignFees = scenario.campaigns.reduce((total, campaign) => total + campaign.fee_cents, 0);
    $('unallocated').textContent = money(scenario.capital_cents - scenario.lp_cash_cents - scenario.launch_cost_cents - campaignFees);
    if (changed) markPreviousResults();
    return scenario;
  } catch (error) { $('scenario-error').textContent = errorMessage(error); $('scenario-error').hidden = false; $('unallocated').textContent = 'Check allocation'; throw error; }
}
function populateScenario(scenario) {
  state.scenario = clone(scenario);
  $('capital').value = scenario.capital_cents / 100; $('liquidity').value = scenario.lp_cash_cents / 100;
  $('launch-cost').value = scenario.launch_cost_cents / 100; $('campaign').value = scenario.campaign_budget_cents / 100;
  $('horizon').value = scenario.horizon_hours; $('catalyst').value = scenario.catalyst_probability_bps / 100;
  $('followup').value = scenario.followup_positive_probability_bps / 100; $('scenario-json').value = json(scenario);
  $('scenario-error').hidden = true;
  const campaignFees = scenario.campaigns.reduce((total, campaign) => total + campaign.fee_cents, 0);
  $('unallocated').textContent = money(scenario.capital_cents - scenario.lp_cash_cents - scenario.launch_cost_cents - campaignFees);
  renderBriefContext(scenario.user_brief);
  markPreviousResults();
}
function jobInputs() {
  return { scenario: clone(syncScenario()), worlds: positiveInteger('world-count', 'Worlds', 1), seed: positiveInteger('seed', 'Seed'), policy_id: $('run-policy').value || 'baseline' };
}
function markPreviousResults() {
  if (state.run) $('run-meta').textContent = `Previous experiment · ${number(state.run.result.world_count)} worlds · seed ${state.run.result.seed}`;
}
function validateBrief(brief) {
  if (!brief || typeof brief !== 'object' || Array.isArray(brief) || Object.keys(brief).sort().join(',') !== 'event,question,ticker' ||
      ['question','event','ticker'].some((field)=>typeof brief[field] !== 'string') || !brief.question.trim() ||
      brief.question.length > 2000 || brief.event.length > 160 || brief.ticker.length > 24) throw new Error('Enter a scenario of up to 2,000 characters, with an optional event (160) and ticker (24).');
  return brief;
}
function renderBriefContext(brief) {
  state.briefPrepared = Boolean(brief);
  $('user-question').value = brief?.question || ''; $('brief-event').value = brief?.event || ''; $('brief-ticker').value = brief?.ticker || '';
  $('brief-summary').textContent = brief ? [brief.question, [brief.event, brief.ticker].filter(Boolean).join(' · ')].filter(Boolean).join('\n') : '';
  $('brief-step').hidden = state.briefPrepared; $('brief-review').hidden = !state.briefPrepared;
  $('experiment-workspace').hidden = !state.briefPrepared; $('header-run').hidden = !state.briefPrepared;
}
function prepareBrief() {
  if (state.activeJob) throw new Error('Wait for the current experiment before editing its brief.');
  if (!state.scenario) throw new Error('The local scenario is still loading.');
  const brief = { question: $('user-question').value.trim(), event: $('brief-event').value.trim(), ticker: $('brief-ticker').value.trim() };
  validateBrief(brief);
  state.scenario.user_brief = brief; renderBriefContext(brief); markPreviousResults();
  $('scenario-json').value = json(state.scenario);
  $('capital').focus();
}
function editBrief() {
  if (state.activeJob) throw new Error('Wait for the current experiment before editing its brief.');
  $('brief-step').hidden = false; $('brief-review').hidden = true;
  $('experiment-workspace').hidden = true; $('header-run').hidden = true;
  $('user-question').focus();
}
let visibleTooltip = null;
let tooltipHideTimer = null;
let tooltipEventsBound = false;
function hideTooltip() {
  clearTimeout(tooltipHideTimer);
  if (visibleTooltip) visibleTooltip.tooltip.hidden = true;
  visibleTooltip = null;
}
function showTooltip(trigger) {
  hideTooltip();
  const tooltip = $(trigger.dataset.tooltip);
  if (!tooltip) return;
  tooltip.hidden = false; visibleTooltip = { trigger, tooltip };
  const anchor = trigger.getBoundingClientRect(); const box = tooltip.getBoundingClientRect();
  const left = Math.max(12, Math.min(window.innerWidth - box.width - 12, anchor.left + anchor.width / 2 - box.width / 2));
  const below = anchor.bottom + 6;
  const top = below + box.height <= window.innerHeight - 12 ? below : Math.max(12, anchor.top - box.height - 6);
  tooltip.style.left = `${left}px`; tooltip.style.top = `${top}px`;
}
function bindTooltips() {
  document.querySelectorAll('.help-trigger').forEach((trigger) => {
    if (trigger.dataset.tooltipBound) return;
    trigger.dataset.tooltipBound = 'true';
    const tooltip = $(trigger.dataset.tooltip);
    trigger.addEventListener('pointerenter', () => showTooltip(trigger));
    trigger.addEventListener('focus', () => showTooltip(trigger));
    trigger.addEventListener('click', () => { if (!visibleTooltip || visibleTooltip.trigger !== trigger) showTooltip(trigger); });
    const leave = () => {
      clearTimeout(tooltipHideTimer);
      tooltipHideTimer = setTimeout(() => { if (document.activeElement !== trigger) hideTooltip(); }, 100);
    };
    trigger.addEventListener('pointerleave', leave); trigger.addEventListener('blur', leave);
    tooltip?.addEventListener('pointerenter', () => clearTimeout(tooltipHideTimer));
    tooltip?.addEventListener('pointerleave', leave);
  });
  if (tooltipEventsBound) return;
  tooltipEventsBound = true;
  // Optional guards keep this module usable by the small DOM regression harness.
  document.addEventListener?.('keydown', (event) => { if (event.key === 'Escape') hideTooltip(); });
  window.addEventListener?.('resize', hideTooltip);
  document.addEventListener?.('scroll', hideTooltip, true);
  document.addEventListener?.('pointerdown', (event) => {
    if (visibleTooltip && !visibleTooltip.trigger.contains(event.target) && !visibleTooltip.tooltip.contains(event.target)) hideTooltip();
  });
}
function renderProgress(job) {
  if (job.kind !== 'run') return;
  $('run-progress').hidden = false;
  const phase = job.phase || 'validating';
  const stages = ['participants', 'worlds', 'sampling', 'summary'];
  const stage = { queued: 0, validating: 0, building_cast: 0, preparing_worlds: 1, simulating: 2, summarizing: 3, completed: 4 }[phase] ?? 0;
  const descriptions = {
    queued: ['Waiting for the engine', 'Your submitted assumptions are queued locally.'],
    validating: ['Checking the scenario', 'Checking cash allocation, policies and the selected templates.'],
    building_cast: ['Preparing participants', 'Selecting role templates, assigning funds and binding numeric behavior rules.'],
    preparing_worlds: ['Building the world', 'Preparing liquidity, attention channels, campaign schedules and seeded event draws.'],
    simulating: ['Running possible outcomes', 'Each world executes the same rules with different seeded event draws.'],
    summarizing: ['Finding the main scenarios', 'Grouping completed worlds and calculating cash averages, medians and ranges.'],
    completed: ['Experiment complete', 'All requested worlds are calculated. The scenario summary is ready below.'],
    failed: ['Experiment stopped', 'The engine could not complete this run. Review the error before trying again.'],
    start_unknown: ['Experiment start unconfirmed', 'Could not confirm whether the server accepted this run. Check the local server before retrying.'],
    status_unknown: ['Progress unavailable', 'The last confirmed progress is shown. The server may still be calculating; check it before submitting another run.'],
  };
  const [title, description] = descriptions[phase] || descriptions.validating;
  $('progress-title').textContent = title; $('progress-description').textContent = description;
  $('run-progress').dataset.phase = phase;
  document.querySelectorAll('#progress-steps li').forEach((item) => {
    const index = stages.indexOf(item.dataset.stage);
    const stopped = ['failed','start_unknown','status_unknown'].includes(phase);
    item.classList.toggle('complete', !stopped && index < stage);
    item.classList.toggle('active', !stopped && index === stage);
    if (index === stage && !stopped) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
  });
  const done = Number.isInteger(job.completed_worlds) ? job.completed_worlds : 0;
  const total = Number.isInteger(job.target_worlds) ? job.target_worlds : 0;
  $('world-progress').max = total || 1; $('world-progress').value = done;
  $('progress-count').textContent = total ? `${number(done)} / ${number(total)} worlds` : 'Preparing';
  $('cast-preview').textContent = Number.isInteger(job.actor_count) ? `${number(job.actor_count)} participants prepared · ${number(job.active_traders)} roles eligible to trade. Reviewed templates and numeric policies; no live model calls.` : '';
}
function statusText(job) {
  const names = { run: 'Experiment', plans: 'Plan comparison', policies: 'Policy comparison', sensitivity: 'Sensitivity', evaluate: 'Evaluation', cast: 'Cast', prepare: 'Policy request', import: 'Policy import', checkpoint: 'Batch', resume: 'Resumed experiment', wallets: 'Wallet evidence', topics: 'Topic evidence' };
  const name = names[job.kind] || 'Job';
  if (job.status === 'running' || job.status === 'queued') return `${name} · ${job.status === 'queued' ? 'Queued' : 'Calculating…'}${Number.isInteger(job.completed_worlds) && job.completed_worlds > 0 ? ` · ${job.completed_worlds} worlds completed` : ''}`;
  if (job.status === 'paused') return `${name} paused · ${job.completed_worlds} of ${job.target_worlds} worlds completed`;
  if (job.status === 'failed') return `${name} failed · ${typeof job.error === 'string' ? job.error : 'See the error below.'}`;
  return `${name} complete${Number.isFinite(job.elapsed_seconds) ? ` · ${job.elapsed_seconds.toFixed(2)} s` : ''}`;
}
function updateJobStrip(job) {
  $('job-strip').hidden = false; $('job-status').textContent = statusText(job);
  $('job-download').hidden = job.status !== 'completed';
  if (job.status === 'completed') { $('job-download').href = `/api/jobs/${encodeURIComponent(job.job_id)}/download`; $('job-download').download = ''; }
  renderProgress(job);
}
async function startJob(kind, extra = {}) {
  if (state.activeJob) throw new Error('Wait for the current local job to finish.');
  const inputs = ['resume', 'wallets', 'topics'].includes(kind) ? {} : jobInputs();
  if (['plans', 'policies', 'sensitivity'].includes(kind) && inputs.worlds > 50) throw new Error('Comparisons support up to 50 worlds per arm. Choose 10 or 25 worlds in Experiment.');
  if (kind === 'sensitivity' && (extra.values.length > 8 || inputs.worlds * (extra.values.length + 1) > 200)) throw new Error('Use up to 8 sensitivity values and at most 200 worlds across all arms.');
  const payload = { kind, ...inputs, ...extra };
  const evidenceRevision = ['wallets', 'topics'].includes(kind) ? ++state.evidenceRevision[kind] : null;
  if (['run', 'checkpoint', 'resume'].includes(kind) && state.run) $('run-meta').textContent = `Previous · ${number(state.run.result.world_count)} worlds · seed ${state.run.result.seed}`;
  state.activeJob = 'submitting';
  setBusy(true); $('run-button').textContent = kind === 'run' ? 'Calculating…' : 'Run experiment ↗';
  if (kind === 'run') {
    $('run-results').hidden = true; $('run-empty').hidden = true;
    renderProgress({kind, phase: 'validating', completed_worlds: 0, target_worlds: inputs.worlds});
    $('run-progress').scrollIntoView?.({block:'start'});
  }
  let job = {kind, phase:'validating', completed_worlds:0, target_worlds:inputs.worlds};
  try {
    const submitted = await api('/api/jobs', { method: 'POST', body: JSON.stringify(payload) });
    state.activeJob = submitted.job_id;
    job = { ...job, ...submitted, kind };
    updateJobStrip(job);
    while (job.status === 'queued' || job.status === 'running') {
      await new Promise((resolve) => setTimeout(resolve, 450));
      job = await api(`/api/jobs/${encodeURIComponent(submitted.job_id)}`); updateJobStrip(job);
    }
    state.jobs.set(job.job_id, job);
    if (job.status === 'failed') throw new Error(typeof job.error === 'string' ? job.error : job.error?.message || 'The local job failed.');
    if (job.status === 'paused') {
      $('checkpoint-status').textContent = `${job.completed_worlds} of ${job.target_worlds} worlds are stored. Resume to calculate the remaining worlds.`;
      $('resume-button').hidden = false; $('resume-button').dataset.jobId = job.job_id;
    } else if (job.status === 'completed' && (evidenceRevision === null || evidenceRevision === state.evidenceRevision[kind])) { await displayJob(job); }
    return job;
  } catch (error) {
    if (kind === 'run') {
      renderProgress({...job, phase: job.status === 'failed' ? 'failed' : state.activeJob === 'submitting' ? 'start_unknown' : 'status_unknown'});
      if (state.run) $('run-results').hidden = false;
    }
    if (state.activeJob && state.activeJob !== 'submitting' && !state.jobs.has(state.activeJob)) $('job-status').textContent = 'Could not read job status. The server may still be calculating. Check the local server before running again.';
    if (kind === 'run' && state.activeJob === 'submitting') {
      $('job-strip').hidden = false; $('job-download').hidden = true;
      $('job-status').textContent = 'Could not confirm experiment start. Check the local server before retrying.';
    }
    throw error;
  } finally { state.activeJob = null; setBusy(false); $('run-button').replaceChildren(document.createTextNode('Run experiment '), node('span', '↗')); }
}
async function displayJob(job) {
  if (['run', 'checkpoint', 'resume'].includes(job.kind)) {
    state.run = job; renderRun(job); refreshIntegrityJobs(); renderCoverage();
    if (job.kind === 'resume' || job.kind === 'checkpoint') { $('checkpoint-status').textContent = `${job.result.world_count} worlds complete. Final results are shown above.`; $('resume-button').hidden = true; }
  } else if (['plans', 'policies', 'sensitivity'].includes(job.kind)) renderComparison(job);
  else if (job.kind === 'cast') { state.cast = job.result; setPeopleMode('cast'); }
  else if (job.kind === 'evaluate') renderEvaluation(job);
  else if (job.kind === 'wallets') { $('wallets-source').value = ''; state.walletEvidence = job.result; setPeopleMode('observed'); }
  else if (job.kind === 'topics') { $('topics-source').value = ''; renderTopicEvidence(job.result); }
  else if (job.kind === 'prepare') {
    replace('prepare-result', paragraph('Request prepared locally. No provider was called.'), downloadLink(job.job_id, 'Download policy request'), jsonDetails('Inspect request', job.result));
    $('import-request').value = json(job.result);
  } else if (job.kind === 'import') {
    const receipt = job.result.receipt;
    replace('import-result', paragraph(`Registered ${job.result.policy_id}. Source provenance is declared and unverified.`), downloadLink(job.job_id, 'Download bundle & receipt'), jsonDetails('Import receipt', receipt));
    const bootstrap = await api('/api/bootstrap'); state.bootstrap.policy_options = bootstrap.policy_options; renderPolicies();
  }
}
function renderRun(job) {
  const report = job.result; const stats = summary(report.worlds);
  $('run-empty').hidden = true; $('run-results').hidden = false;
  $('run-meta').textContent = `${number(report.world_count)} worlds · seed ${report.seed}`;
  const items = metrics([['Mean cash profit', money(stats.mean)], ['Median cash profit', money(stats.p50)], ['5th percentile', money(stats.p05)], ['95th percentile', money(stats.p95)]]);
  $('run-metrics').replaceChildren(...items.children);
  replace('profit-chart', histogram(report.worlds));
  replace('outcome-table', table([{ label: 'Outcome', value: (row) => human(row.id) }, { label: 'Cash profit range', value: (row) => outcomeRanges[row.id] || 'See result' }, { label: 'Worlds', value: (row) => number(row.count), numeric: true }, { label: 'Frequency', value: (row) => percent(row.frequency), numeric: true }], report.outcomes, 'Conditional outcome frequencies'));
  $('world-select').replaceChildren(...report.worlds.map((world, index) => { const option = node('option', `World ${world.world_id}`); option.value = String(index); return option; }));
  $('run-download').href = `/api/jobs/${encodeURIComponent(job.job_id)}/download`; $('run-download').download = '';
  renderScenarioOverview();
  renderWorld();
}
function renderScenarioOverview() {
  const report = state.run?.result; if (!report) return;
  const overview = report.overview;
  if (!overview) {
    replace('scenario-chart', paragraph('Run a new experiment to calculate grouped scenarios.'));
    replace('scenario-table'); replace('aggregate-cash-bridge'); return;
  }
  const mode = state.overviewMode;
  ['event_paths', 'cash_outcomes'].forEach((key) => {
    const button = $(key === 'event_paths' ? 'view-event-paths' : 'view-cash-outcomes');
    button.classList.toggle('selected', mode === key); button.setAttribute('aria-pressed', String(mode === key));
  });
  const brief = report.user_brief;
  $('overview-context').textContent = `${brief ? `${brief.event || brief.question}${brief.ticker ? ` · ${brief.ticker}` : ''}. ` : ''}${number(overview.world_count)} computed worlds. Shares are sampled frequencies under your assumptions, not calibrated market odds. Cash profit is withdrawable cash after paid costs, minus starting capital.`;
  const rows = overview[mode];
  const minimum = Math.min(0, ...rows.filter((row) => row.count).flatMap((row) => [row.p05_cents, row.mean_cents, row.median_cents]));
  const maximum = Math.max(0, ...rows.filter((row) => row.count).flatMap((row) => [row.p95_cents, row.mean_cents, row.median_cents]));
  const x = (value) => 16 + (value - minimum) / (maximum - minimum || 1) * 528;
  const list = node('div', null, 'scenario-chart-list');
  rows.forEach((row) => {
    const item = node('section', null, 'scenario-row');
    const heading = node('div', null, 'scenario-row-heading');
    heading.append(node('h4', row.label), node('span', `${percent(row.frequency)} · ${number(row.count)} worlds`));
    const track = node('div', null, 'scenario-frequency-track'); const fill = node('div', null, 'scenario-frequency-fill');
    fill.style.width = `${row.frequency * 100}%`; track.append(fill); item.append(heading, track);
    if (!row.count) item.append(paragraph('Not sampled in this run. No cash estimate.', 'scenario-empty'));
    else {
      const chart = svgNode('svg', {viewBox: '0 0 560 36', class: 'scenario-cash-chart', role: 'img', 'aria-label': `${row.label}: median ${money(row.median_cents)}, mean ${money(row.mean_cents)}, 5th to 95th percentile ${money(row.p05_cents)} to ${money(row.p95_cents)}.`});
      chart.append(svgNode('line', {x1:16,x2:544,y1:20,y2:20,class:'axis'}));
      chart.append(svgNode('line', {x1:x(0),x2:x(0),y1:5,y2:34,class:'zero'}));
      chart.append(svgNode('line', {x1:x(row.p05_cents),x2:x(row.p95_cents),y1:20,y2:20,class:'range'}));
      chart.append(svgNode('circle', {cx:x(row.median_cents),cy:20,r:5,class:'median'}));
      const mean = x(row.mean_cents);
      chart.append(svgNode('path', {d:`M ${mean} 13 L ${mean+6} 20 L ${mean} 27 L ${mean-6} 20 Z`,class:'mean'}));
      const scale = node('div', null, 'scenario-cash-scale'); scale.append(node('span', money(minimum)), node('span', money(maximum)));
      item.append(chart, scale, paragraph(`Median ${money(row.median_cents)} · Mean ${money(row.mean_cents)}`, 'scenario-cash-label'));
    }
    list.append(item);
  });
  replace('scenario-chart', paragraph('Bar: share of worlds. Cash range: 5th–95th percentile. ● Median · ◆ Mean. Each cash chart uses the same scale.', 'scenario-legend'), list);
  const detail = node('details', null, 'advanced'); detail.append(node('summary', 'Exact scenario statistics'), table([
    {label:'Scenario',value:(row)=>row.label}, {label:'Share',value:(row)=>percent(row.frequency),numeric:true},
    {label:'Worlds',value:(row)=>number(row.count),numeric:true}, {label:'Mean',value:(row)=>money(row.mean_cents),numeric:true},
    {label:'Median',value:(row)=>money(row.median_cents),numeric:true}, {label:'P05',value:(row)=>money(row.p05_cents),numeric:true},
    {label:'P95',value:(row)=>money(row.p95_cents),numeric:true},
  ], rows, 'Exact statistics for mutually exclusive scenario groups'));
  replace('scenario-table', detail);
  const labels = { contributed_capital_cents:'Starting capital', launch_paid_cents:'Launch cost paid', lp_cash_allocated_cents:'Cash locked in liquidity', campaign_paid_cents:'Campaigns paid', founder_sale_proceeds_cents:'Founder sale proceeds', ending_withdrawable_cash_cents:'Ending withdrawable cash' };
  const order = Object.keys(labels);
  replace('aggregate-cash-bridge', node('h3','Average cash flow'), paragraph('Arithmetic means across every completed world. Subtract starting capital from ending cash to get mean profit. Locked liquidity and unsold tokens are excluded.'), table([
    {label:'Cash flow',value:(row)=>labels[row.field] || human(row.field)}, {label:'Mean',value:(row)=>money(row.mean_cents),numeric:true},
    {label:'Median',value:(row)=>money(row.median_cents),numeric:true},
  ], [...overview.cash_bridge].sort((a,b)=>order.indexOf(a.field)-order.indexOf(b.field)), 'Cash flow across all completed worlds'));
}
function renderWorld() {
  if (!state.run) return;
  const world = state.run.result.worlds[Number($('world-select').value) || 0];
  $('world-summary').textContent = `Cash profit ${money(world.net_profit_cents)} · ${number(world.participant_buys)} participant buys · ${number(world.participant_sells)} participant sells · ${number(world.unsold_project_tokens)} unsold tokens · ${number(world.locked_project_lp_shares)} locked LP shares`;
  const bridgeLabels = { contributed_capital_cents: 'Contributed capital', launch_paid_cents: 'Launch cost paid', lp_cash_allocated_cents: 'Cash allocated to liquidity', campaign_paid_cents: 'Campaigns paid', founder_sale_proceeds_cents: 'Founder sale proceeds', ending_withdrawable_cash_cents: 'Ending withdrawable cash' };
  replace('cash-bridge', table([{ label: 'Cash flow', value: (row) => bridgeLabels[row[0]] || human(row[0]) }, { label: 'USD', value: (row) => money(row[1]), numeric: true }], Object.entries(world.cash_bridge), 'World cash bridge'));
  if (!world.trace?.length) replace('event-trace', paragraph('No event trace was retained for this world. Cash totals and other aggregates remain available in the result JSON.'));
  else replace('event-trace', table([
    { label: 'Hour', value: (event) => event.at_hour, numeric: true },
    { label: 'Event', value: (event) => human(event.kind) },
    { label: 'Actor / source', value: (event) => event.actor_id || event.recipient || event.source || '–' },
    { label: 'Cash', value: (event) => money(event.cash_cents ?? event.paid_cents ?? event.paid_cost_cents), numeric: true },
    { label: 'Detail', value: (event) => event.reason || event.rejection || event.status || (event.token_units !== undefined ? `${number(event.token_units)} token units` : '') },
  ], world.trace, 'Recorded events in selected world'));
}
function getProfiles() { return state.bootstrap?.pool?.profiles || []; }
function setPeopleMode(mode) {
  state.peopleMode = mode;
  $('show-library').classList.toggle('selected', mode === 'library'); $('show-library').setAttribute('aria-pressed', String(mode === 'library'));
  $('show-cast').classList.toggle('selected', mode === 'cast'); $('show-cast').setAttribute('aria-pressed', String(mode === 'cast'));
  if ($('show-observed')) {
    $('show-observed').classList.toggle('selected', mode === 'observed'); $('show-observed').setAttribute('aria-pressed', String(mode === 'observed'));
    $('observed-wallets').hidden = mode !== 'observed'; $('people-results').hidden = mode === 'observed';
    document.querySelector('#view-people .filter-row').hidden = mode === 'observed';
    $('build-cast').hidden = mode === 'observed'; $('people-note').hidden = mode === 'observed';
    $('people-title').textContent = mode === 'observed' ? 'Observed wallet profiles' : 'People & their rules';
    document.querySelector('#view-people .page-intro').textContent = mode === 'observed' ? 'Recorded trading behavior, with its limits visible.' : 'Descriptions give context. The cast shows what actually executes.';
    $('pool-count').textContent = mode === 'observed' ? 'Observed evidence' : `${getProfiles().length} descriptive templates`;
  }
  renderPeople();
}
function actorMode(actor) {
  if (actor.id === 'project-founder') return 'Scheduled founder sales';
  if (actor.id === 'project-lp') return 'Scheduled liquidity deposit';
  if ((actor.allowed_actions || []).some((action) => ['buy', 'sell'].includes(action))) return actor.policy_binding ? `Trading role · ${human(actor.policy_binding.mode)}` : 'Trading capability';
  return 'Passive / observation only';
}
function renderPeople() {
  if (state.peopleMode === 'observed') { renderWalletEvidence(); return; }
  const query = $('people-search').value.trim().toLowerCase(); const category = $('people-category').value;
  if (state.peopleMode === 'cast' && !state.cast) {
    replace('people-results', paragraph('Build the current cast to inspect actual funding, subscriptions and executable capabilities from the scenario recipe.')); return;
  }
  const all = state.peopleMode === 'library' ? getProfiles() : state.cast.actors;
  const profiles = new Map(getProfiles().map((profile) => [profile.id, profile]));
  const filtered = all.filter((item) => {
    const profile = state.peopleMode === 'library' ? item : profiles.get(item.template_id);
    return (!category || item.category === category) && (!query || [item.id, item.template_id, profile?.name, profile?.description, item.category].join(' ').toLowerCase().includes(query));
  });
  const header = paragraph(`${number(filtered.length)} of ${number(all.length)} ${state.peopleMode === 'library' ? 'templates' : 'actors'} shown.${state.peopleMode === 'cast' ? ' Cast is a snapshot of the scenario at the last build.' : ''}`);
  const list = node('div', null, 'people-list');
  filtered.forEach((item) => {
    const profile = state.peopleMode === 'library' ? item : profiles.get(item.template_id) || item.provenance?.template || {};
    const article = node('article', null, 'person'); const top = node('div', null, 'person-top'); const title = node('div');
    title.append(node('h3', profile.name || item.id), node('div', state.peopleMode === 'library' ? item.id : `${item.id} / ${item.template_id}`, 'person-id'));
    top.append(title, node('span', human(item.category), 'category-tag')); article.append(top, paragraph(profile.description || 'No description supplied.', ''));
    if (state.peopleMode === 'library') {
      const details = node('details'); details.append(node('summary', 'Read template context'));
      if (profile.objective) details.append(paragraph(`Objective: ${profile.objective}`));
      if (profile.exit_or_inactivity_trigger) details.append(paragraph(`Exit / inactivity: ${profile.exit_or_inactivity_trigger}`));
      details.append(paragraph('Biography only. Numeric and network defaults in the template do not set the executable actor.'));
      article.append(details);
    } else {
      article.append(paragraph(actorMode(item)));
      article.append(table([
        { label: 'Funding / capability', value: (row) => row[0] }, { label: 'Recipe value', value: (row) => row[1] },
      ], [['Initial cash', money(item.initial_cash_cents)], ['Owner', item.owner_id], ['Actions', (item.allowed_actions || []).join(', ') || 'See actor record'], ['Position limit', money(item.position_limit_cents)], ['Recipe entry fraction', percent(item.entry_fraction_bps / 10000)], ['Effective entry fraction', Number.isFinite(item.effective_entry_fraction_bps) ? percent(item.effective_entry_fraction_bps / 10000) : 'See actor record'], ['Recipe strategy family', human(item.strategy)], ['Policy binding', item.policy_binding ? human(item.policy_binding.mode) : 'See actor record'], ['Subscriptions', (item.subscriptions || []).join(', ') || 'None'], ['Attention capacity', number(item.attention_capacity)]]));
      article.append(jsonDetails('Actual actor & provenance', item));
    }
    list.append(article);
  });
  if (!filtered.length) list.append(paragraph('No people match these filters.'));
  const content = [header];
  if (state.peopleMode === 'cast' && state.cast.policy_source) content.push(paragraph(`Policy source (declared, unverified): ${human(state.cast.policy_source.kind)}${state.cast.policy_source.model ? ` · ${state.cast.policy_source.model}` : ''}.`));
  if (state.peopleMode === 'cast' && state.cast.policy_bindings?.counts) content.push(table([{ label: 'Actual policy binding', value: (row) => human(row[0]) }, { label: 'Actors', value: (row) => row[1], numeric: true }], Object.entries(state.cast.policy_bindings.counts)));
  content.push(list);
  if (state.peopleMode === 'cast' && state.cast.excluded?.length) content.push(node('h3', 'Excluded roles', 'result-block'), table([{ label: 'Role', value: (row) => row.id }, { label: 'Reason', value: (row) => human(row.reason) }], state.cast.excluded));
  replace('people-results', ...content);
}
function pairedStats(baseline, variant) {
  const byId = new Map(baseline.worlds.map((world) => [world.world_id, world]));
  const diffs = variant.worlds.map((world) => ({ net_profit_cents: world.net_profit_cents - byId.get(world.world_id).net_profit_cents }));
  return { ...summary(diffs), higher: diffs.filter((world) => world.net_profit_cents > 0).length };
}
function renderComparison(job) {
  const result = job.result; let arms = []; let baseline;
  if (job.kind === 'plans') {
    baseline = result.plans.launch_now;
    arms = ['launch_now', 'lower_marketing', 'defer_launch', 'do_not_launch'].map((id) => { const report = result.plans[id]; return { label: planNames[id], report, stats: summary(report.worlds) }; });
  } else if (job.kind === 'policies') {
    baseline = result.baseline;
    arms = [{ label: 'Python rules baseline', report: result.baseline, stats: summary(result.baseline.worlds) }, { label: 'Imported policy', report: result.policy, stats: summary(result.policy.worlds) }];
  } else {
    baseline = result.baseline;
    arms = [{ label: `Baseline · ${result.baseline_value} bps`, report: result.baseline, stats: summary(result.baseline.worlds) }, ...result.variants.map((variant) => ({ label: `Assumption · ${variant.value} bps`, report: variant.report, stats: summary(variant.report.worlds) }))];
  }
  arms = arms.map((arm) => ({ ...arm, paired: pairedStats(baseline, arm.report) }));
  const surface = node('section', null, 'surface');
  surface.append(node('h2', job.kind === 'sensitivity' ? `Sensitivity: ${human(result.parameter).replace(' bps', '')}` : 'Computed comparison'), paragraph('Conditional synthetic comparison, with one fixed cast and matched external draws. Quantiles describe these worlds; they are not confidence intervals.'), comparisonChart(arms));
  surface.append(table([
    { label: 'Arm', value: (arm) => arm.label }, { label: 'Mean cash profit', value: (arm) => money(arm.stats.mean), numeric: true },
    { label: 'P05', value: (arm) => money(arm.stats.p05), numeric: true }, { label: 'Median', value: (arm) => money(arm.stats.p50), numeric: true },
    { label: 'P95', value: (arm) => money(arm.stats.p95), numeric: true }, { label: 'Mean Δ vs baseline', value: (arm) => money(arm.paired.mean), numeric: true },
    { label: 'Higher cash worlds', value: (arm) => `${arm.paired.higher} / ${arm.stats.count}`, numeric: true },
  ], arms, 'Actual cash outcome summaries for each arm'));
  surface.append(node('h3', 'Paired cash differences', 'result-block'), paragraph(`Variant minus baseline in the same world. Baseline: ${arms[0].label}.`), table([
    { label: 'Arm', value: (arm) => arm.label }, { label: 'P05 difference', value: (arm) => money(arm.paired.p05), numeric: true },
    { label: 'Median difference', value: (arm) => money(arm.paired.p50), numeric: true }, { label: 'P95 difference', value: (arm) => money(arm.paired.p95), numeric: true },
  ], arms.slice(1)), paragraph('Cash profit excludes unsold tokens and locked LP shares. These comparisons do not establish causal effects or real-world odds.'), downloadLink(job.job_id));
  replace('compare-results', surface);
}
function renderEvaluation(job) {
  const result = job.result; const surface = node('section', null, 'surface');
  surface.append(node('h2', result.source_metadata.source_mode === 'synthetic' ? 'Synthetic arithmetic sample' : 'Supplied forecast evaluation'), paragraph(`Source status: ${human(result.source_metadata.status)}. Source content and timestamps are not independently verified.`));
  surface.append(metrics([['Holdout Brier score', decimal(result.holdout.brier_score)], ['Holdout log loss', decimal(result.holdout.log_loss)], ['Training records', number(result.counts.train)], ['Holdout records', number(result.counts.holdout)]]));
  surface.append(table([
    { label: 'Scoring rule', value: (row) => row[0] }, { label: 'Supplied forecasts', value: (row) => decimal(row[1]), numeric: true }, { label: 'Training-rate baseline', value: (row) => decimal(row[2]), numeric: true },
  ], [['Brier (lower is better)', result.holdout.brier_score, result.baseline.brier_score], ['Log loss (lower is better)', result.holdout.log_loss, result.baseline.log_loss]]));
  surface.append(paragraph(`Split: ${result.split_at}. Training outcome rate: ${percent(result.training_base_rate)}. Excluded records: ${number(result.counts.excluded)}. No calibration is fitted.`), node('h3', 'Descriptive calibration bins', 'result-block'));
  surface.append(table([
    { label: 'Probability bin', value: (bin) => `${percent(bin.lower)}–${percent(bin.upper)}` }, { label: 'Count', value: (bin) => bin.count, numeric: true },
    { label: 'Mean probability', value: (bin) => percent(bin.mean_probability), numeric: true }, { label: 'Outcome rate', value: (bin) => percent(bin.outcome_rate), numeric: true },
  ], result.calibration_bins), paragraph('Bins are left-closed and right-open; the final bin includes 100%. Empty bins have no rate. Synthetic fixtures test mechanics only, not predictive performance.'), downloadLink(job.job_id), jsonDetails('Evaluation limitations & source declarations', { limitations: result.limitations, sources: result.source_metadata.sources }));
  replace('evaluation-results', surface);
}
function renderPolicies() {
  const options = state.bootstrap.policy_options || [];
  ['run-policy', 'compare-policy'].forEach((id) => {
    const select = $(id); const previous = select.value;
    const available = id === 'compare-policy' ? options.filter((option) => option.id !== 'baseline') : options;
    select.replaceChildren(...available.map((option) => { const element = node('option', option.label); element.value = option.id; return element; }));
    if (!available.length) { const empty = node('option', 'No imported policy loaded'); empty.value = ''; select.append(empty); }
    if (available.some((option) => option.id === previous)) select.value = previous;
  });
  replace('model-policies', table([
    { label: 'Available policy', value: (option) => option.label }, { label: 'Model', value: (option) => option.model || (option.id === 'baseline' ? 'Python rules' : '–') },
    { label: 'Source', value: (option) => human(option.source_kind || (option.id === 'baseline' ? 'offline_rules' : 'declared_unverified')) },
    { label: 'Bundle', value: (option) => option.bundle_id || '–' },
  ], options, 'Policies actually registered in the local server'));
}
function renderCoverage() {
  if (!state.run) return;
  const report = state.run.result; const surface = $('policy-coverage');
  surface.replaceChildren(node('h3', 'Last experiment: execution & policy coverage'));
  surface.append(paragraph(`${report.world_count} worlds · ${report.usage.model_calls} model calls · ${human(report.usage.mode)}. Offline rollout model cost: $${report.usage.model_cost_usd}. This excludes any earlier policy preparation cost.`));
  if (report.policy_bindings?.counts) surface.append(table([{ label: 'Binding', value: (row) => human(row[0]) }, { label: 'Actors', value: (row) => row[1], numeric: true }], Object.entries(report.policy_bindings.counts)));
  else surface.append(paragraph('This run used baseline Python rules. No imported model rule coverage applies.'));
}
function refreshIntegrityJobs() {
  const current = $('integrity-job').value;
  const jobs = [...state.jobs.values()].filter((job) => job.status === 'completed' && ['run', 'checkpoint', 'resume'].includes(job.kind));
  $('integrity-job').replaceChildren(...jobs.map((job, index) => { const option = node('option', `Experiment ${index + 1} · ${job.result.world_count} worlds · seed ${job.result.seed}`); option.value = job.job_id; return option; }));
  $('integrity-job').value = jobs.some((job) => job.job_id === current) ? current : jobs.at(-1)?.job_id || '';
  renderCommitment();
}
function renderCommitment() {
  const id = $('integrity-job').value; const commitment = state.commitments.get(id);
  $('near-button').disabled = !commitment;
  if (!commitment) { replace('commitment-result', paragraph('No commitment created for this experiment.')); replace('near-result', paragraph('Create a commitment first. No transaction will be signed or submitted.')); return; }
  const content = [node('p', `Local verification: ${commitment.verified ? 'passed' : 'failed'}`, 'verification'), paragraph('Public salted commitment'), node('div', commitment.public.commitment, 'hash')];
  const buttons = node('div', null, 'button-row');
  const publicDownload = node('button', 'Download public commitment', 'button secondary');
  publicDownload.addEventListener('click', () => downloadObject(commitment.public, 'public-commitment.json'));
  const opening = node('a', 'Download private opening', 'button secondary'); opening.href = `/api/jobs/${encodeURIComponent(id)}/opening`; opening.download = '';
  buttons.append(publicDownload, opening, downloadLink(id, 'Download original result'));
  content.push(buttons, paragraph('The opening contains a private salt and artifact hash. Keep it with the original result; share it only when you choose to reveal the commitment.'));
  replace('commitment-result', ...content);
  replace('near-result', paragraph('Ready to prepare an unsigned descriptor. Not signed or submitted.'));
}
function updateComparisonControls() {
  $('compare-policy-wrap').hidden = $('comparison-kind').value !== 'policies';
  $('sensitivity-controls').hidden = $('comparison-kind').value !== 'sensitivity';
}
async function readFile(inputId, targetId, after) {
  const file = $(inputId).files?.[0]; if (!file) return;
  if (file.size > 2_000_000) throw new Error('Choose a JSON file smaller than 2 MB.');
  const text = await file.text(); JSON.parse(text); $(targetId).value = text;
  if (after) after(file);
}
function datasetNote() {
  try { const dataset = JSON.parse($('evaluation-json').value); $('evaluation-source').textContent = dataset.source_mode === 'synthetic' ? 'Synthetic arithmetic sample. Tests scoring mechanics only.' : 'Supplied records. Sources and outcomes are caller-reported and unverified.'; }
  catch (_) { $('evaluation-source').textContent = 'Edit valid JSON before evaluating.'; }
}
function switchView(view) {
  state.selectedView = view;
  document.querySelectorAll('.view').forEach((section) => { section.hidden = section.id !== `view-${view}`; });
  document.querySelectorAll('.nav-item').forEach((button) => { const active = button.dataset.view === view; button.classList.toggle('active', active); if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
  const selected = document.querySelector(`.nav-item[data-view="${view}"]`);
  $('breadcrumb').textContent = `Workbench / ${selected.textContent.replace(/^\s*\d+\s*/, '').trim()}`;
  document.title = `${human(view).replace(/^./, (char) => char.toUpperCase())} — Boyun Lab`;
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function labelledControl(label, element) {
  const wrap = node('div', null, 'parameter-field'); const text = node('label', label);
  text.htmlFor = element.id; wrap.append(text, element); return wrap;
}
function externalLink(label, url) {
  const link = node('a', label, 'text-link'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
}
function evidenceExport(result, filename) {
  const button = node('button', 'Download evidence report', 'button secondary');
  button.addEventListener('click', () => downloadObject(result, filename)); return button;
}
function mountEvidenceWorkspaces() {
  const button = node('button', 'Observed wallets'); button.id = 'show-observed'; button.setAttribute('aria-pressed', 'false');
  $('show-cast').parentElement.append(button); button.addEventListener('click', () => setPeopleMode('observed'));
  const wallet = node('section', null, 'result-block'); wallet.id = 'observed-wallets'; wallet.hidden = true;
  wallet.append(node('h2', 'Profiles from observed trades'), paragraph('These descriptions come from recorded swaps, not an invented biography. They are not yet executable simulation actors. Wallet balances, motives and ownership need separate evidence.'));
  const topic = node('section', null, 'surface result-block'); topic.id = 'topic-context';
  topic.append(node('h2', 'News & social context'), paragraph('Review related coverage separately from numerical forecast scores. Search matches do not automatically change event probabilities. The example topic is not linked to the NEAR pools.'));
  for (const [kind, section, title] of [['wallets', wallet, 'Wallet snapshot'], ['topics', topic, 'Topic snapshot']]) {
    const select = node('select'); select.id = `${kind}-source`;
    const options = (state.bootstrap.evidence_options || []).filter((item) => item.kind === kind);
    const blank = node('option', 'Choose an explicitly loaded snapshot'); blank.value = ''; select.append(blank);
    options.forEach((item) => { const option = node('option', item.label); option.value = item.id; select.append(option); });
    const row = node('div', null, 'button-row'); const load = node('button', 'Load snapshot', 'button secondary');
    row.append(labelledControl(title, select), load); section.append(row);
    load.addEventListener('click', guard(async () => {
      const id = select.value; if (!id) throw new Error('Choose a loaded snapshot or import a JSON file.');
      const revision = ++state.evidenceRevision[kind];
      load.disabled = true;
      try {
        const result = await api(`/api/evidence/${encodeURIComponent(id)}`);
        if (select.value !== id || revision !== state.evidenceRevision[kind]) return;
        if (kind === 'wallets') { state.walletEvidence = result; renderWalletEvidence(); } else renderTopicEvidence(result);
      } finally { load.disabled = false; }
    }));
    const details = node('details', null, 'advanced'); details.append(node('summary', `Import ${kind === 'wallets' ? 'wallet-observations.v1' : 'topic-observations.v1'} JSON`));
    const fileLabel = node('label', 'Open snapshot file', 'file-button'); const file = node('input'); file.type = 'file'; file.accept = '.json,application/json'; file.id = `${kind}-file`; fileLabel.append(file);
    const editor = node('textarea'); editor.id = `${kind}-json`; editor.rows = 6; editor.className = 'code-input'; editor.setAttribute('aria-label', `${title} JSON`);
    const submit = node('button', 'Analyze imported snapshot', 'button secondary job-action');
    details.append(paragraph('Local validation only. No provider request is made. Files must fit the 2 MiB local input limit; wallet snapshots allow at most 1,000 trade records and keep networks separate.'), fileLabel, editor, submit);
    file.addEventListener('change', guard(() => readFile(file.id, editor.id)));
    submit.addEventListener('click', guard(() => startJob(kind, { snapshot: JSON.parse(editor.value) })));
    section.append(details);
    const result = node('div', null, 'result-block'); result.id = `${kind}-evidence-results`; section.append(result);
  }
  const filters = node('div', null, 'filter-row'); const search = node('input'); search.id = 'wallet-search'; search.type = 'search'; search.placeholder = 'Address or measured profile description';
  filters.append(labelledControl('Search observed profiles', search));
  wallet.querySelector('#wallets-evidence-results').before(filters); search.addEventListener('input', renderWalletEvidence);
  $('view-people').append(wallet);
  const history = node('section', null, 'surface result-block'); history.id = 'public-history';
  const refresh = node('button', 'Refresh collection status', 'button secondary'); refresh.id = 'refresh-public-history';
  history.append(node('h3', 'Public history · accumulating forward'), paragraph('Public feeds are collected locally without model calls or API keys. History grows only while the collector runs. Sleep, outages and the recent-trade cap can leave gaps; elapsed days do not prove complete coverage.'), refresh);
  const historyResult = node('div'); historyResult.id = 'public-history-results'; history.append(historyResult);
  wallet.prepend(history);
  refresh.addEventListener('click', guard(renderPublicHistory));
  $('view-evidence').querySelector('.two-column').before(topic);
}
async function renderPublicHistory() {
  const result = await api('/api/public-history');
  if (!result.configured) { replace('public-history-results', paragraph('No public archive selected for this server. Use --public-archive at startup after initializing collection.')); return; }
  if (result.available === false) { replace('public-history-results', paragraph('Selected archive is unavailable. The collector may be stopped or local storage may need attention.')); return; }
  replace('public-history-results', metrics([['Unique archived swaps', number(result.total_trades)], ['Successful pool captures', number(result.capture_count)], ['Failed captures', number(result.failed_capture_count)], ['Complete history', 'Unverified']]),
    table([{label:'Network / pool',value:r=>`${r.network.toUpperCase()} · ${r.name||r.address}`},{label:'Swaps',value:r=>number(r.trade_count),numeric:true},{label:'Last successful capture (UTC)',value:r=>r.last_success_at||'None'},{label:'Possible gaps',value:r=>number(r.possible_gap_count),numeric:true},{label:'Last error',value:r=>r.latest_error_code||'None'}],result.pools),
    paragraph('Load an “accumulating public archive” source above to calculate current profiles from up to 1,000 recent archived records. The archive retains older records; this UI export is bounded. Refreshing status does not make external requests.'));
}
function renderWalletEvidence() {
  const result = state.walletEvidence;
  if (!result) { replace('wallets-evidence-results', paragraph('Choose a loaded public snapshot, or import your own. No observations have been selected.')); return; }
  $('wallets-evidence-results').dataset.network = result.network;
  if (state.peopleMode === 'observed') $('pool-count').textContent = `${result.summary.observed_wallets} observed addresses · ${result.network.toUpperCase()}`;
  const header = node('section', null, 'surface');
  header.append(node('h3', `${result.network.toUpperCase()} · observed address profiles`), paragraph(`Target: ${result.target_window.start} to ${result.target_window.end}. Complete 30-day history: no. The table shows the actual captured coverage per pool.`),
    metrics([['Observed addresses', number(result.summary.observed_wallets)], ['Accepted swaps', number(result.summary.accepted_trades)], ['Sampled USD notional', money(result.summary.observed_notional_cents)], ['Model calls', '0']]),
    table([{label:'Pool',value:r=>r.name},{label:'Swaps',value:r=>r.accepted_trades,numeric:true},{label:'First observed (UTC)',value:r=>r.earliest_observed_at||'None'},{label:'Last observed (UTC)',value:r=>r.latest_observed_at||'None'}], result.coverage.pools),
    paragraph('Small/medium/large describe median observed trade size: ≤$100 / between $100 and $10,000 / ≥$10,000. These thresholds are analyst choices, not retail/whale identities.'),
    table([{label:'Observed size',value:r=>human(r.size)},{label:'Activity',value:r=>human(r.activity)},{label:'Addresses',value:r=>r.wallet_count,numeric:true},{label:'Swaps',value:r=>r.trade_count,numeric:true}],result.cohorts),
    evidenceExport(result, `${result.network}-wallet-cohorts.json`), jsonDetails('Sources, exclusions & limits', {sources:result.source_metadata,coverage:result.coverage,limitations:result.limitations}));
  const query = $('wallet-search').value.trim().toLowerCase();
  const selected = result.profiles.filter((profile) => `${profile.address} ${profile.description}`.toLowerCase().includes(query));
  const list = node('div', null, 'people-list');
  selected.slice(0,60).forEach((profile) => {
    const item = node('article', null, 'person');
    item.append(node('h3', profile.address, 'wallet-address'), paragraph(profile.description, ''),
      paragraph(`Sample volume share: ${percent(profile.observed_volume_share_bps/10000)}. This is not its token holding or portfolio share.`),
      jsonDetails('Recorded swaps & unknown traits', {evidence:profile.evidence,unknown_traits:profile.unknown_traits,sources:profile.sources}));
    list.append(item);
  });
  replace('wallets-evidence-results', header, paragraph(`${selected.length} matching profiles; showing up to 60. Search to inspect another address. All profiles are in the download. No wallet clustering or social identity attribution has been performed.`), list);
}
function renderTopicEvidence(result) {
  const content = node('section');
  content.append(node('h3', result.topic), paragraph(`Declared entities: ${result.entities.join(', ')}. Thirty-day search target ending ${result.captured_at}; results are bounded, not a complete news archive.`),
    metrics([['Articles returned',number(result.summary.articles)],['Headline groups',number(result.summary.headline_groups)],['Imported social posts',number(result.summary.social_posts)],['Automatic simulation effect','None']]),
    paragraph('First seen is the index timestamp, not the original publication time. Identical normalized headlines are grouped; syndicated versions are not independent confirmations. Social account retrieval is not connected. Imported authorship remains unverified.'));
  const list = node('div', null, 'news-list');
  result.articles.forEach((article) => {
    const item = node('article'); item.append(externalLink(article.title, article.url), paragraph(`${article.domain} · first seen ${article.first_seen_at} · ${article.relevance.replaceAll('_',' ')} · group ${article.headline_group}`)); list.append(item);
  });
  result.social_posts.forEach((post) => {
    const item = node('article'); item.append(externalLink(`${post.author} · ${post.platform}`, post.url), paragraph(post.text), paragraph(`${post.created_at} · author declared, unverified`)); list.append(item);
  });
  content.append(list, evidenceExport(result,'topic-evidence.json'),jsonDetails('Source & interpretation limits', {source:result.source_metadata,limitations:result.limitations}));
  replace('topics-evidence-results',content);
}
function bindEvents() {
  bindTooltips();
  $('brief-form').addEventListener('submit', guard(prepareBrief));
  $('use-example').addEventListener('click', () => {
    $('user-question').value = 'I want to launch a memecoin on NEAR with $10,000 around a Paris political event. What are the main scenarios, how much cash could I lose or withdraw after all costs, and what should I pay attention to?';
    $('brief-event').value = 'Paris politics (demo)';
    $('brief-ticker').value = 'PARIS';
    $('user-question').focus();
  });
  $('edit-brief').addEventListener('click', guard(editBrief));
  $('view-event-paths').addEventListener('click', () => { state.overviewMode = 'event_paths'; renderScenarioOverview(); });
  $('view-cash-outcomes').addEventListener('click', () => { state.overviewMode = 'cash_outcomes'; renderScenarioOverview(); });
  document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.view)));
  ['capital', 'liquidity', 'launch-cost', 'campaign', 'horizon', 'catalyst', 'followup'].forEach((id) => $(id).addEventListener('change', () => { try { syncScenario(); } catch (_) { /* The form error describes the invalid allocation. */ } }));
  $('scenario-form').addEventListener('submit', guard(() => startJob('run')));
  $('apply-scenario').addEventListener('click', guard(() => { const scenario = validateScenario(JSON.parse($('scenario-json').value)); populateScenario(scenario); $('json-status').textContent = 'Scenario applied. Controls now reflect this JSON.'; }));
  $('world-select').addEventListener('change', renderWorld);
  $('checkpoint-button').addEventListener('click', guard(() => startJob('checkpoint', { batch_worlds: positiveInteger('batch-worlds', 'Batch worlds', 1) })));
  $('resume-button').addEventListener('click', guard(() => startJob('resume', { resume_job_id: $('resume-button').dataset.jobId })));
  $('show-library').addEventListener('click', () => setPeopleMode('library'));
  $('show-cast').addEventListener('click', () => setPeopleMode('cast'));
  $('build-cast').addEventListener('click', guard(() => startJob('cast')));
  $('people-search').addEventListener('input', renderPeople); $('people-category').addEventListener('change', renderPeople);
  $('comparison-kind').addEventListener('change', updateComparisonControls);
  $('compare-button').addEventListener('click', guard(() => {
    const kind = $('comparison-kind').value;
    if (kind === 'policies') { if (!$('compare-policy').value) throw new Error('Load or import a policy in Models before comparing policies.'); return startJob(kind, { policy_id: $('compare-policy').value }); }
    if (kind === 'sensitivity') {
      const raw = $('sensitivity-values').value.split(',').map((value) => value.trim());
      if (raw.some((value) => !/^\d+$/.test(value))) throw new Error('Sensitivity values must be comma-separated whole basis points, such as 2500, 5000, 7500.');
      return startJob(kind, { parameter: $('sensitivity-parameter').value, values: raw.map(Number) });
    }
    return startJob(kind);
  }));
  $('load-fixture').addEventListener('click', guard(() => { $('evaluation-json').value = json(state.bootstrap.evaluation_fixture); datasetNote(); }));
  $('evaluation-file').addEventListener('change', guard(() => readFile('evaluation-file', 'evaluation-json', datasetNote)));
  $('evaluation-json').addEventListener('change', datasetNote);
  $('evaluate-button').addEventListener('click', guard(() => { if (!$('evaluation-json').value.trim()) throw new Error('Load the synthetic sample or supply a forecast dataset first.'); return startJob('evaluate', { dataset: JSON.parse($('evaluation-json').value) }); }));
  $('prepare-form').addEventListener('submit', guard(() => startJob('prepare', { model: $('model-name').value.trim(), template_ids: $('template-ids').value.split(/[,\n]/).map((id) => id.trim()).filter(Boolean), fallback: $('policy-fallback').value, max_output_tokens: positiveInteger('output-tokens', 'Requested output tokens', 1) })));
  $('request-file').addEventListener('change', guard(() => readFile('request-file', 'import-request')));
  $('response-file').addEventListener('change', guard(() => readFile('response-file', 'import-response')));
  $('import-button').addEventListener('click', guard(() => { if (!$('import-request').value.trim() || !$('import-response').value.trim()) throw new Error('Supply both prepared request and response JSON.'); return startJob('import', { request: JSON.parse($('import-request').value), response: JSON.parse($('import-response').value), bundle_id: $('bundle-id').value.trim() }); }));
  $('integrity-job').addEventListener('change', renderCommitment);
  $('commit-button').addEventListener('click', guard(async () => {
    const id = $('integrity-job').value; if (!id) throw new Error('Complete an experiment before creating a commitment.');
    $('commit-button').disabled = true;
    try { const commitment = await api(`/api/jobs/${encodeURIComponent(id)}/commitment`, { method: 'POST', body: '{}' }); state.commitments.set(id, commitment); renderCommitment(); }
    finally { $('commit-button').disabled = false; }
  }));
  $('near-form').addEventListener('submit', guard(async () => {
    const id = $('integrity-job').value; if (!state.commitments.has(id)) throw new Error('Create a commitment for this experiment first.');
    const action = await api(`/api/jobs/${encodeURIComponent(id)}/near-action`, { method: 'POST', body: JSON.stringify({ network: 'testnet', signer_id: $('near-signer').value.trim(), contract_id: $('near-contract').value.trim() }) });
    if ($('integrity-job').value !== id) return;
    const button = node('button', 'Download unsigned action JSON', 'button secondary'); button.addEventListener('click', () => downloadObject(action, 'near-testnet-unsigned.json'));
    replace('near-result', node('p', 'Not signed or submitted.', 'verification'), button, jsonDetails('Inspect unsigned descriptor', action));
  }));
}
async function init() {
  bindEvents(); setBusy(true); $('near-button').disabled = true;
  try {
    const bootstrap = await api('/api/bootstrap');
    if (!bootstrap.csrf_token) throw new Error('The local server did not supply a CSRF token.');
    state.bootstrap = bootstrap; populateScenario(bootstrap.scenario);
    const categories = [...new Set(getProfiles().map((profile) => profile.category))];
    categories.forEach((category) => { const option = node('option', human(category)); option.value = category; $('people-category').append(option); });
    $('pool-count').textContent = `${getProfiles().length} descriptive templates`;
    const eligible = getProfiles().filter((profile) => ['retail', 'event_traders', 'large_holders'].includes(profile.category));
    $('template-ids').value = ['retail', 'event_traders', 'large_holders'].map((category) => eligible.find((profile) => profile.category === category)?.id).filter(Boolean).join(', ');
    $('server-provenance').textContent = json({ capabilities: bootstrap.capabilities, provenance: bootstrap.provenance });
    mountEvidenceWorkspaces();
    await renderPublicHistory();
    renderPolicies(); renderPeople(); $('startup').hidden = true; setBusy(false);
    window.dispatchEvent?.(new Event('scenario-lab-ready'));
  } catch (error) { $('startup').hidden = true; showError(error); setBusy(true); }
}
init();
