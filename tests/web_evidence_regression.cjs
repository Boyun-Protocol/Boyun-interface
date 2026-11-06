'use strict';

// Run: node engine/tests/web_evidence_regression.cjs
// Execute the shipped evidence listeners and startJob flow without requests or a
// browser dependency. Rendering is recorded to isolate async selection integrity.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

function createAppContext() {
  const elements = new Map();
  class Element {
    constructor(tag) {
      this.tagName = tag; this.children = []; this.listeners = {}; this.attributes = {};
      this.value = ''; this.classList = { toggle() {} }; this.parentElement = this;
    }
    set id(value) { this._id = value; elements.set(value, this); }
    get id() { return this._id; }
    append(...items) { this.children.push(...items); }
    prepend(...items) { this.children.unshift(...items); }
    replaceChildren(...items) { this.children = items; }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(type, handler) { this.listeners[type] = handler; }
    before() {}
    querySelector() { return new Element('div'); }
  }
  const document = {
    getElementById(id) {
      if (!elements.has(id)) { const element = new Element('div'); element.id = id; }
      return elements.get(id);
    },
    createElement: (tag) => new Element(tag),
    createTextNode: (text) => ({ textContent: text }),
    querySelector: () => new Element('div'), querySelectorAll: () => [],
  };
  const context = vm.createContext({ document, Intl, console, setTimeout, clearTimeout, elements });
  const appPath = path.join(__dirname, '..', 'src', 'decision_lab', 'web', 'app.js');
  vm.runInContext(fs.readFileSync(appPath, 'utf8').replace(/init\(\);\s*$/, ''), context, { filename: appPath });
  vm.runInContext(`
    state.bootstrap = {evidence_options:[
      {id:'old-wallet',kind:'wallets',label:'NEAR'},
      {id:'old-topic',kind:'topics',label:'Old topic'}
    ]};
    globalThis.rendered = {};
    renderWalletEvidence = () => { rendered.wallets = state.walletEvidence; };
    renderTopicEvidence = (result) => { rendered.topics = result; };
    setPeopleMode = () => renderWalletEvidence();
    mountEvidenceWorkspaces();
  `, context);
  function loader(kind) {
    const section = document.getElementById(kind === 'wallets' ? 'observed-wallets' : 'topic-context');
    return section.children.find((child) => child.tagName === 'div').children[1];
  }
  return { context, elements, loader };
}

async function testDelayedLoadCannotOverwriteNewImport(kind) {
  const { context, elements, loader } = createAppContext();
  elements.get(`${kind}-source`).value = kind === 'wallets' ? 'old-wallet' : 'old-topic';
  context.kind = kind;
  vm.runInContext(`
    api = (url) => {
      if (url.startsWith('/api/evidence/')) return new Promise((resolve) => { globalThis.resolveOld = resolve; });
      if (url === '/api/jobs') return Promise.resolve({job_id:'new-import',status:'queued'});
      return Promise.resolve({job_id:'new-import',kind,status:'completed',elapsed_seconds:0,result:{network:'solana',marker:'new import'}});
    };
  `, context);
  const oldLoad = loader(kind).listeners.click({ preventDefault() {} });
  // startJob is production code: it must invalidate older loads before its first
  // await and only publish the result for the matching evidence revision.
  await vm.runInContext(`startJob(kind,{snapshot:{}})`, context);
  assert.equal(context.rendered[kind].marker, 'new import');
  context.resolveOld({ network: 'near', marker: 'old snapshot' });
  await oldLoad;
  assert.equal(context.rendered[kind].marker, 'new import',
    `A delayed ${kind} load must not replace a newer import`);
  console.log(`PASS delayed ${kind} load cannot overwrite newer import`);
}

async function testLatestSameSelectionLoadWins(kind) {
  const { context, elements, loader } = createAppContext();
  elements.get(`${kind}-source`).value = kind === 'wallets' ? 'old-wallet' : 'old-topic';
  vm.runInContext(`globalThis.responses=[]; api=()=>new Promise(resolve=>responses.push(resolve));`, context);
  const handler = loader(kind).listeners.click;
  // Invoke the actual listener twice to test ordering even when both requests
  // refer to the same ID; comparing the dropdown value alone is insufficient.
  const earlier = handler({ preventDefault() {} });
  const later = handler({ preventDefault() {} });
  context.responses[1]({ network: 'near', marker: 'later' });
  await later;
  context.responses[0]({ network: 'near', marker: 'earlier' });
  await earlier;
  assert.equal(context.rendered[kind].marker, 'later', `Newest ${kind} request should remain visible for an unchanged source ID`);
  console.log(`PASS newest ${kind} load wins for unchanged source ID`);
}


async function testDelayedImportCannotOverwriteNewLoad(kind) {
  const { context, elements, loader } = createAppContext();
  elements.get(`${kind}-source`).value = kind === 'wallets' ? 'old-wallet' : 'old-topic';
  context.kind = kind;
  const pollStarted = new Promise((resolve) => { context.pollStarted = resolve; });
  vm.runInContext(`
    api = (url) => {
      if (url.startsWith('/api/evidence/')) return Promise.resolve({network:'near',marker:'new load'});
      if (url === '/api/jobs') return Promise.resolve({job_id:'old-import',status:'queued'});
      return new Promise((resolve) => { globalThis.resolveImport = resolve; pollStarted(); });
    };
  `, context);
  const pendingImport = vm.runInContext(`startJob(kind,{snapshot:{}})`, context);
  await pollStarted;
  await loader(kind).listeners.click({ preventDefault() {} });
  assert.equal(context.rendered[kind].marker, 'new load');
  context.resolveImport({job_id:'old-import',kind,status:'completed',elapsed_seconds:0,result:{network:'solana',marker:'old import'}});
  await pendingImport;
  assert.equal(context.rendered[kind].marker, 'new load', `An older ${kind} import must not overwrite the newest loaded snapshot`);
  console.log(`PASS delayed ${kind} import cannot overwrite newer load`);
}

(async () => {
  for (const kind of ['wallets', 'topics']) {
    await testDelayedLoadCannotOverwriteNewImport(kind);
    await testLatestSameSelectionLoadWins(kind);
    await testDelayedImportCannotOverwriteNewLoad(kind);
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
