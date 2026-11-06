'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
let connects=0,sends=0;
const wallet={signIn:async()=>{connects++;return [{accountId:'reviewer.testnet'}];},signOut:async()=>{},getAccounts:async()=>[{accountId:'reviewer.testnet'}],signAndSendTransaction:async tx=>{sends++;assert.equal(tx.signerId,'reviewer.testnet');return {transaction:{hash:'2'.repeat(44)}};}};
let source=fs.readFileSync(path.join(__dirname,'../src/boyun_interface/assets/wallet-entry.js'),'utf8').replace(/^import .*;$/mg,'');
const ctx=vm.createContext({window:{},Object,Error,setupIntearWallet:()=>({}),setupWalletSelector:async config=>{assert.equal(config.network,'testnet');return {wallet:async()=>wallet};}});
vm.runInContext(source,ctx);
(async()=>{
 const api=ctx.window.ScenarioWallet;assert.equal(connects,0);assert.equal(sends,0);
 await api.connect();assert.equal(connects,1);
 const plan={network:'testnet',status:'unsigned_verified_contract',signer_id:'reviewer.testnet',contract:{account_id:'registry.testnet'},wallet_request:{receiverId:'registry.testnet',actions:[{type:'FunctionCall',params:{methodName:'register_commitment',args:{commitment:'a'.repeat(64)},gas:'30000000000000',deposit:'10000000000000000000000'}}]}};
 for(const mutate of [p=>p.network='mainnet',p=>p.signer_id='other.testnet',p=>p.wallet_request.receiverId='evil.testnet',p=>p.wallet_request.actions[0].params.methodName='delete_account',p=>p.wallet_request.actions[0].params.deposit='1000000000000000000000000']){
  const p=JSON.parse(JSON.stringify(plan));mutate(p);await assert.rejects(()=>api.sign(p,'registry.testnet'));assert.equal(sends,0);
 }
 assert.equal((await api.sign(plan,'registry.testnet')).transaction_hash,'2'.repeat(44));assert.equal(sends,1);
 await api.disconnect();await assert.rejects(()=>api.sign(plan,'registry.testnet'));
 console.log('Wallet UI: no automatic connect/sign; testnet signer, receiver, method, gas, deposit bounds and explicit signing passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
