import {copyFile,mkdir} from 'node:fs/promises';
await mkdir('dist/tts',{recursive:true});
for(const name of ['ort-wasm-simd-threaded.jsep.mjs','ort-wasm-simd-threaded.jsep.wasm']) await copyFile(`node_modules/@huggingface/transformers/dist/${name}`,`dist/tts/${name}`);
