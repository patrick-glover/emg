#!/usr/bin/env node
/* ═══════════ sync-engine: pull a tagged nm-engine release into a project ═══════════
   Canonical copy lives in nm-engine/tools/. Consumers keep a copy at
   tools/sync-engine.js and a lock file, engine.lock.json, at their root.

     node tools/sync-engine.js sync v0.1.1 [--path src/model.js]
         Resolve the tag to a commit, download src/model.js at that commit,
         write it to --path (default: the lock's path, else src/model.js),
         and record repo, tag, commit and sha256 in engine.lock.json.

     node tools/sync-engine.js check [--remote]
         Confirm the local copy is byte-for-byte the locked release:
         its sha256 matches the lock and its ENGINE_VERSION matches the tag.
         --remote also re-downloads the locked commit and confirms the tag
         still points to it. Exits 1 on any mismatch.

   Node 18+ (uses built-in fetch). No dependencies. */
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');

const REPO='patrick-glover/nm-engine', FILE='src/model.js';
const ROOT=path.resolve(__dirname,'..'), LOCK=path.join(ROOT,'engine.lock.json');

const sha256=buf=>crypto.createHash('sha256').update(buf).digest('hex');
const versionIn=text=>(String(text).match(/const ENGINE_VERSION='([^']+)'/)||[])[1]||null;
const readLock=()=>fs.existsSync(LOCK)?JSON.parse(fs.readFileSync(LOCK,'utf8')):null;
function fail(msg){console.error('✖ '+msg);process.exit(1);}

async function get(url,accept){
  const r=await fetch(url,{headers:{'User-Agent':'nm-engine-sync',...(accept?{Accept:accept}:{})}});
  if(!r.ok)fail(`${url} → HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
const commitOf=async tag=>(await get(`https://api.github.com/repos/${REPO}/commits/${encodeURIComponent(tag)}`,'application/vnd.github.sha')).toString().trim();
const fileAt=commit=>get(`https://raw.githubusercontent.com/${REPO}/${commit}/${FILE}`);

async function sync(tag,outRel){
  if(!/^v\d+\.\d+\.\d+$/.test(tag||''))fail('give a release tag like v0.1.1');
  const lock=readLock(),rel=outRel||lock?.path||'src/model.js';
  const commit=await commitOf(tag),body=await fileAt(commit);
  const v=versionIn(body);
  if(v!==tag.slice(1))fail(`${tag} at ${commit.slice(0,7)} declares ENGINE_VERSION ${v}; refusing to sync a mislabelled release`);
  fs.mkdirSync(path.dirname(path.join(ROOT,rel)),{recursive:true});
  fs.writeFileSync(path.join(ROOT,rel),body);
  const next={repo:REPO,tag,commit,file:FILE,path:rel,sha256:sha256(body),syncedAt:new Date().toISOString()};
  fs.writeFileSync(LOCK,JSON.stringify(next,null,2)+'\n');
  console.log(`✔ ${rel} ← ${REPO}@${tag} (${commit.slice(0,7)}), sha256 ${next.sha256.slice(0,12)}…`);
  if(lock&&lock.tag!==tag)console.log(`  was ${lock.tag}. See https://github.com/${REPO}/blob/${tag}/CHANGELOG.md`);
}

async function check(remote){
  const lock=readLock();if(!lock)fail('no engine.lock.json; run: node tools/sync-engine.js sync <tag>');
  const p=path.join(ROOT,lock.path);if(!fs.existsSync(p))fail(`${lock.path} is missing`);
  const body=fs.readFileSync(p),h=sha256(body);
  if(h!==lock.sha256)fail(`${lock.path} has been edited since it was synced from ${lock.tag} (sha256 ${h.slice(0,12)}… ≠ ${lock.sha256.slice(0,12)}…). Make changes in nm-engine and release them instead.`);
  const v=versionIn(body);
  if(v!==lock.tag.slice(1))fail(`${lock.path} declares ENGINE_VERSION ${v} but the lock says ${lock.tag}`);
  if(remote){
    const c=await commitOf(lock.tag);
    if(c!==lock.commit)fail(`tag ${lock.tag} now points to ${c.slice(0,7)}, not the locked ${lock.commit.slice(0,7)}; the release was moved`);
    if(sha256(await fileAt(lock.commit))!==lock.sha256)fail(`upstream ${FILE} at ${lock.commit.slice(0,7)} no longer matches the lock`);
  }
  console.log(`✔ ${lock.path} is nm-engine ${lock.tag} (${lock.commit.slice(0,7)})${remote?', confirmed against GitHub':''}`);
}

const [cmd,arg,...rest]=process.argv.slice(2);
const opt=k=>{const a=[arg,...rest],i=a.indexOf(k);return i<0?null:a[i+1]??true;};
if(cmd==='sync')sync(arg,opt('--path'));
else if(cmd==='check')check(!!opt('--remote'));
else{console.log('usage: sync-engine.js sync <tag> [--path file] | check [--remote]');process.exit(cmd?1:0);}
