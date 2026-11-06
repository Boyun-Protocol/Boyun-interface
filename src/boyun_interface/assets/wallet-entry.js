/* Testnet-only NEAR Wallet Selector; no wallet action occurs on page load. */
import {setupWalletSelector} from '@near-wallet-selector/core';
import {setupIntearWallet} from '@near-wallet-selector/intear-wallet';
let selectorPromise=null,wallet=null,account=null;
const accountValid=id=>typeof id==='string'&&(/^[0-9a-f]{64}$/.test(id)||/^(?=.{2,64}$)[a-z0-9]+(?:[-_.][a-z0-9]+)*\.testnet$/.test(id));
async function connect(){
 if(!selectorPromise)selectorPromise=setupWalletSelector({network:'testnet',debug:false,modules:[setupIntearWallet({walletUrl:'https://wallet.intear.tech'})]});
 const selector=await selectorPromise;wallet=await selector.wallet('intear-wallet');
 // No contractId: request connection, not an on-chain function-call access key.
 let accounts;try{accounts=await wallet.signIn({});}catch(_){throw Error('Wallet connection cancelled or unavailable. No transaction was submitted.');}
 if(!accounts.length||!accountValid(accounts[0].accountId)){await wallet.signOut();wallet=null;throw Error('Choose a NEAR testnet account.');}
 account=accounts[0].accountId;return {accountId:account,network:'testnet',wallet:'Intear'};
}
async function disconnect(){try{if(wallet)await wallet.signOut();}finally{wallet=null;account=null;}}
function validatePlan(plan,expected){
 if(!account||plan?.network!=='testnet'||plan.signer_id!==account||plan.contract?.account_id!==expected||plan.status!=='unsigned_verified_contract')throw Error('The reviewed testnet signer or registry changed.');
 const tx=plan.wallet_request,call=tx?.actions?.[0]?.params;
 if(tx?.receiverId!==expected||tx.actions.length!==1||tx.actions[0].type!=='FunctionCall'||call.methodName!=='register_commitment'||call.gas!=='30000000000000'||call.deposit!=='10000000000000000000000'||Object.keys(call.args).join()!=='commitment'||!/^[0-9a-f]{64}$/.test(call.args.commitment))throw Error('Unexpected wallet transaction.');
 return tx;
}
async function sign(plan,expected){
 if(!wallet)throw Error('Connect your testnet wallet first.');
 const tx=validatePlan(plan,expected),accounts=await wallet.getAccounts();
 if(accounts[0]?.accountId!==account)throw Error('Wallet account changed. Connect and review again.');
 const outcome=await wallet.signAndSendTransaction({signerId:account,...tx});
 const hash=outcome?.transaction?.hash||outcome?.transaction_outcome?.id;
 if(typeof hash!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(hash))throw Error('Wallet returned no transaction hash. Do not submit again; inspect the wallet activity.');
 return {transaction_hash:hash,signer_id:account};
}
window.ScenarioWallet=Object.freeze({connect,disconnect,sign,validatePlan,get account(){return account;},network:'testnet'});
