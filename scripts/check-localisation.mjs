// Catalogue contract shared by Rust, SSR and future trusted extension registries.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const definitions = JSON.parse(fs.readFileSync(path.join(root,'crates/localisation/data/keys.json'),'utf8'));
const keys = new Set();
for(const definition of definitions) {
 if(keys.has(definition.key) || !/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+$/.test(definition.key)) throw Error(`Invalid/duplicate key ${definition.key}`);
 keys.add(definition.key);
 for(const locale of ['en','ja','zh','es','fr']) {
  const text=definition.defaults[locale];
  if(typeof text!=='string' || !text.trim()) throw Error(`Missing ${locale}: ${definition.key}`);
  const placeholders=[...new Set([...text.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(m=>m[1]))].sort();
  if(JSON.stringify(placeholders)!==JSON.stringify(Object.keys(definition.placeholders).sort())) throw Error(`Placeholder mismatch: ${definition.key}/${locale}`);
 }
}
function walk(dir) {for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
 const file=path.join(dir,entry.name);
 if(entry.isDirectory())walk(file);
 else if(/\.tsx?$/.test(file))for(const match of fs.readFileSync(file,'utf8').matchAll(/\bt\(['"]([\w.]+)['"]/g))if(!keys.has(match[1]))throw Error(`Unknown key ${match[1]} in ${file}`);
}}
walk(path.join(root,'web/src'));
const sources=Object.fromEntries(definitions.map(d=>[d.key,d.defaults.en]));
if(process.argv.includes('--write-sources'))fs.writeFileSync(path.join(root,'web/src/localisation/sources.ts'),`export const sources: Record<string,string> = ${JSON.stringify(sources,null,2)};\n`);
console.log(`Validated ${keys.size} keys across five locales.`);
