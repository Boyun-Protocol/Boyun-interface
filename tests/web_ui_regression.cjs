'use strict';

// Run: node engine/tests/web_ui_regression.cjs
// Exercise the shipped app without a browser dependency. This small DOM only
// implements the operations used by comparison rendering and the submit listener.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

class Element {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.value = '';
    this.listeners = {};
    this.dataset = {};
    this.attributes = {};
    this.style = {};
    this.classList = { toggle() {} };
    this._text = '';
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this._text = ''; this.children = children; }
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  focus() { this.focused = true; }
}

function createAppContext() {
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new Element('div'));
      return elements.get(id);
    },
    createElement(tag) { return new Element(tag); },
    createElementNS(_namespace, tag) { return new Element(tag); },
    querySelectorAll() { return []; },
  };
  const context = vm.createContext({ document, Intl, console, setTimeout, clearTimeout,
    elements, window: { scrollTo() {} } });
  const appPath = path.join(__dirname, '..', 'src', 'decision_lab', 'web', 'app.js');
  // Initialization fetch is unrelated to these regressions. Test the actual
  // functions and listeners below, without altering their implementation.
  const source = fs.readFileSync(appPath, 'utf8').replace(/init\(\);\s*$/, '');
  vm.runInContext(source, context, { filename: appPath });
  return { context, document, elements };
}

function findAll(element, tag) {
  return (element.tagName === tag ? [element] : [])
    .concat(...element.children.map((child) => findAll(child, tag)));
}

function testPlanBaselineAndAlignment() {
  const { context, elements } = createAppContext();
  const worlds = (profits) => profits.map((net_profit_cents, world_id) => ({ world_id, net_profit_cents }));
  // Match the server's alphabetically sorted JSON keys. Different world-array
  // orders also prove paired calculations bind by world ID rather than row index.
  context.fixture = { plans: {
    defer_launch: { worlds: worlds([-500000, -200000, 400000, 1900000]).reverse() },
    do_not_launch: { worlds: worlds([0, 0, 0, 0]) },
    launch_now: { worlds: worlds([-600000, -100000, 500000, 2100000]) },
    lower_marketing: { worlds: worlds([-400000, -50000, 600000, 2200000]).reverse() },
  } };
  assert.equal(Object.keys(context.fixture.plans)[0], 'defer_launch');
  vm.runInContext("renderComparison({kind:'plans',job_id:'comparison-test',result:fixture})", context);
  const output = elements.get('compare-results');
  const tables = findAll(output, 'table');
  const rows = findAll(tables[0], 'tbody')[0].children;
  const labels = ['Launch now', 'Lower marketing', 'Defer launch', 'Do not launch'];
  assert.deepEqual(rows.map((row) => row.children[0].textContent), labels);
  assert.deepEqual(rows.map((row) => row.children[5].textContent), ['$0.00', '$1,125.00', '-$750.00', '-$4,750.00']);
  assert.ok(output.textContent.includes('Baseline: Launch now.'));
  const chartLabels = findAll(findAll(output, 'svg')[0], 'text')
    .filter((_element, index) => index % 2 === 0).map((element) => element.textContent);
  assert.deepEqual(chartLabels, labels);

  const pairedRows = findAll(tables[1], 'tbody')[0].children;
  assert.deepEqual(pairedRows.map((row) => row.children.map((cell) => cell.textContent)), [
    ['Lower marketing', '$500.00', '$1,000.00', '$2,000.00'],
    ['Defer launch', '-$2,000.00', '-$1,000.00', '$1,000.00'],
    ['Do not launch', '-$21,000.00', '-$5,000.00', '$6,000.00'],
  ]);
  console.log('PASS plan chart/table order, named baseline, mean deltas and paired quantile alignment');
}

async function testUnsignedActionSelectionRace() {
  const { context, document, elements } = createAppContext();
  vm.runInContext(`
    bindEvents();
    state.commitments.set('job-a',{public:{commitment:'a'},verified:true});
    $('integrity-job').value='job-a';
    $('near-signer').value='signer.testnet';
    $('near-contract').value='receipt.testnet';
    api=()=>new Promise((resolve)=>{globalThis.resolveAction=resolve});
    globalThis.actionPromise=elements.get('near-form').listeners.submit({preventDefault(){}});
  `, context);
  elements.get('integrity-job').value = 'job-b';
  document.getElementById('near-result').textContent = 'Selected job B';
  context.resolveAction({ status: 'unsigned_unverified', signer_id: 'signer.testnet' });
  await context.actionPromise;
  assert.equal(elements.get('near-result').textContent, 'Selected job B',
    'A delayed job A descriptor must not overwrite the selected job B UI');

  vm.runInContext(`
    $('integrity-job').value='job-a';
    globalThis.actionPromise=elements.get('near-form').listeners.submit({preventDefault(){}});
  `, context);
  context.resolveAction({ status: 'unsigned_unverified', signer_id: 'signer.testnet' });
  await context.actionPromise;
  assert.ok(elements.get('near-result').textContent.includes('Not signed or submitted.'));
  assert.ok(elements.get('near-result').textContent.includes('Download unsigned action JSON'));
  console.log('PASS delayed unsigned action ignores changed selection and renders for unchanged selection');
}

function testBriefIsContextNotAnInference() {
  const {context, document} = createAppContext();
  context.scenario = {capital_cents:1000000, catalyst_probability_bps:6500};
  vm.runInContext('state.scenario=clone(scenario);',context);
  document.getElementById('user-question').value = 'Launch with $50,000 and a guaranteed profit';
  document.getElementById('brief-event').value = '<script>untrusted</script>';
  document.getElementById('brief-ticker').value = 'PARIS';
  vm.runInContext('prepareBrief()',context);
  assert.equal(vm.runInContext('state.scenario.capital_cents',context),1000000);
  assert.equal(vm.runInContext('state.scenario.catalyst_probability_bps',context),6500);
  assert.equal(vm.runInContext('state.scenario.user_brief.ticker',context),'PARIS');
  assert.equal(document.getElementById('brief-step').hidden,true);
  assert.equal(document.getElementById('experiment-workspace').hidden,false);
  assert.ok(document.getElementById('brief-summary').textContent.includes('<script>untrusted</script>'));
  assert.equal(document.getElementById('brief-summary').children.length,0,'Brief uses plain text, never HTML');
  vm.runInContext('editBrief()',context);
  assert.equal(document.getElementById('brief-step').hidden,false);
  vm.runInContext("state.run={result:{world_count:25,seed:42}};state.scenario.user_brief={question:'Imported context',event:'Imported event',ticker:'NEW'};renderBriefContext(state.scenario.user_brief);markPreviousResults()",context);
  assert.equal(document.getElementById('user-question').value,'Imported context');
  assert.ok(document.getElementById('brief-summary').textContent.includes('Imported event · NEW'));
  assert.ok(document.getElementById('run-meta').textContent.startsWith('Previous experiment'));
  document.getElementById('user-question').value='  ';
  assert.throws(()=>vm.runInContext('prepareBrief()',context),/Enter a scenario/);
  console.log('PASS brief entry/edit, plain-text retention and no invented numeric interpretation');
}

async function testProgressFailureRetainsActualWork() {
  for(const failure of ['engine','connection','acceptance']) {
    const {context,document}=createAppContext();
    context.failure=failure;
    vm.runInContext(`
      jobInputs=()=>({scenario:{},worlds:10,seed:42,policy_id:'baseline'});
      let polls=0;
      api=async(path)=>{
        if(failure==='acceptance') throw new Error('POST response lost');
        if(path==='/api/jobs') return {job_id:'progress-test',kind:'run',status:'running',phase:'simulating',completed_worlds:3,target_worlds:10,actor_count:78,active_traders:64};
        if(failure==='connection') throw new Error('connection interrupted');
        return {job_id:'progress-test',kind:'run',status:'failed',phase:'failed',completed_worlds:4,target_worlds:10,actor_count:78,active_traders:64,error:'World calculation failed'};
      };
      globalThis.progressAttempt=startJob('run').catch(()=>{});
    `,context);
    await context.progressAttempt;
    assert.equal(document.getElementById('progress-count').textContent,failure==='engine'?'4 / 10 worlds':failure==='acceptance'?'0 / 10 worlds':'3 / 10 worlds');
    if(failure!=='acceptance') assert.ok(document.getElementById('cast-preview').textContent.includes('78 participants prepared'));
    assert.equal(document.getElementById('run-progress').dataset.phase,failure==='engine'?'failed':failure==='acceptance'?'start_unknown':'status_unknown');
    if(failure==='connection') assert.ok(document.getElementById('progress-description').textContent.includes('may still be calculating'));
    if(failure==='acceptance') assert.ok(document.getElementById('progress-description').textContent.includes('whether the server accepted'));
  }
  console.log('PASS failed and unreadable runs preserve confirmed work and distinguish unknown status');
}

function testAggregateScenariosAndEmptyGroup() {
  const {context, elements} = createAppContext();
  const row = (id,label,count,frequency,mean,median,p05,p95) => ({id,label,count,frequency,mean_cents:mean,median_cents:median,p05_cents:p05,p95_cents:p95});
  context.fixture={user_brief:{question:'Original submitted question',event:'Original event',ticker:'ORIG'},overview:{world_count:10,
    event_paths:[row('a','Confirmed + contradiction',9,.9,-10000,-20000,-30000,0),row('b','Rare path',1,.1,100000,100000,100000,100000),row('c','Unobserved path',0,0,null,null,null,null)],
    cash_outcomes:[row('loss','Loss group',9,.9,-10000,-20000,-30000,0),row('profit','Profit group',1,.1,100000,100000,100000,100000)],
    cash_bridge:[{field:'ending_withdrawable_cash_cents',mean_cents:1001000,median_cents:980000},{field:'contributed_capital_cents',mean_cents:1000000,median_cents:1000000}]}};
  vm.runInContext('state.run={result:fixture};renderScenarioOverview()',context);
  const chart=elements.get('scenario-chart');
  assert.equal(findAll(chart,'svg').length,2,'No cash chart should be drawn for an unsampled group');
  assert.ok(chart.textContent.includes('Not sampled in this run. No cash estimate.'));
  assert.ok(chart.textContent.includes('90.0% · 9 worlds'));
  assert.ok(chart.textContent.includes('Median -$200.00 · Mean -$100.00'));
  assert.ok(!chart.textContent.includes('NaN'));
  assert.ok(elements.get('overview-context').textContent.includes('Original event · ORIG'));
  const rows=findAll(findAll(elements.get('scenario-table'),'table')[0],'tbody')[0].children;
  assert.equal(rows[2].children[3].textContent,'–','Absent cash means must not become $0');
  vm.runInContext("state.overviewMode='cash_outcomes';renderScenarioOverview()",context);
  assert.ok(elements.get('scenario-chart').textContent.includes('Loss group'));
  assert.ok(!elements.get('scenario-chart').textContent.includes('Rare path'));
  assert.equal(elements.get('view-cash-outcomes').attributes['aria-pressed'],'true');
  assert.ok(elements.get('aggregate-cash-bridge').textContent.includes('$10,010.00'));
  console.log('PASS scenario grouping switch, submitted context, means/medians and unsampled null statistics');
}

(async () => {
  testPlanBaselineAndAlignment();
  await testUnsignedActionSelectionRace();
  testBriefIsContextNotAnInference();
  testAggregateScenariosAndEmptyGroup();
  await testProgressFailureRetainsActualWork();
})().catch((error) => { console.error(error); process.exitCode = 1; });
