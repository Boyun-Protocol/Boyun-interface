/* Compile the pinned SDK with reviewed message-boundary hardening. */
import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const root=path.dirname(new URL(import.meta.url).pathname);
await build({entryPoints:[path.join(root,'../src/boyun_interface/assets/wallet-entry.js')],nodePaths:[path.join(root,'node_modules')],bundle:true,format:'iife',platform:'browser',target:'es2022',minify:true,legalComments:'external',outfile:path.join(root,'../src/boyun_interface/assets/wallet-sdk.js'),plugins:[{name:'pin-intear-message-origin',setup(build){build.onLoad({filter:/@near-wallet-selector\/intear-wallet\/index\.js$/},async args=>{
 let source=await readFile(args.path,'utf8');
 const a='logger.log("Message from connect popup", event);',b='logger.log("Message from send-transactions popup", event);',c='const functionCallKeyAdded = event.data.functionCallKeyAdded;';
 if([a,b,c].some(marker=>source.split(marker).length!==2))throw Error('Pinned wallet source changed; review message boundaries before rebuilding.');
 source=source.replace(a,'if (event.origin !== iframeOriginUrl || event.source !== iframe.contentWindow) return;\n'+a);
 source=source.replace(b,'if (event.origin !== walletUrl || event.source !== popup) return;\n'+b);
 source=source.replace(c,'if (event.data.walletUrl !== "https://wallet.intear.tech" || event.data.useBridge) { reject(new Error("Unsupported wallet route")); iframe.remove(); window.removeEventListener("message", listener); return; }\n'+c);
 return {contents:source,loader:'js'};
 });}}]});
console.log('Built pinned testnet wallet bundle with origin/source checks; no credentials or runtime calls.');
