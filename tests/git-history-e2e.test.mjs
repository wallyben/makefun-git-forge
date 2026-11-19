import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn, execFile} from 'node:child_process';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';

const exec=promisify(execFile);
const git=(cwd,...args)=>exec('git',args,{cwd,timeout:30000,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GIT_AUTHOR_NAME:'Forge Test',GIT_AUTHOR_EMAIL:'forge@example.test',GIT_COMMITTER_NAME:'Forge Test',GIT_COMMITTER_EMAIL:'forge@example.test'}});

test('real Git multi-commit push, clone, history and second push', {timeout:90000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'forge-history-'));
 const child=spawn(process.execPath,['main.ts'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,MAKEFUN_ENV_URL:'',MAKEFUN_SHOP_TOKEN:''},stdio:['ignore','pipe','pipe']});
 let output='',errors='';
 child.stdout.on('data',chunk=>output+=chunk);
 child.stderr.on('data',chunk=>errors+=chunk);
 try{
  const deadline=Date.now()+10000;
  while(!/Git forge listening on (\d+)/.test(output)&&Date.now()<deadline&&child.exitCode===null)await new Promise(resolve=>setTimeout(resolve,50));
  const match=/Git forge listening on (\d+)/.exec(output);
  assert.ok(match,'Server did not start: '+errors);
  const base='http://127.0.0.1:'+match[1];
  const response=await fetch(base+'/api/v3/user/repos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'history'})});
  assert.equal(response.status,201,await response.text());
  const source=join(dir,'source'),target=join(dir,'target');
  await mkdir(source);
  await git(source,'init','-b','main');
  await writeFile(join(source,'a.txt'),'first\n');
  await git(source,'add','.');
  await git(source,'commit','-m','First commit');
  await writeFile(join(source,'b.txt'),'second\n');
  await git(source,'add','.');
  await git(source,'commit','-m','Second commit');
  await git(source,'remote','add','origin',base+'/agent/history.git');
  await git(source,'push','origin','main');
  await exec('git',['clone',base+'/agent/history.git',target],{timeout:30000,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
  assert.equal(await readFile(join(target,'a.txt'),'utf8'),'first\n');
  assert.equal(await readFile(join(target,'b.txt'),'utf8'),'second\n');
  const history=await git(target,'log','--format=%s');
  assert.deepEqual(history.stdout.trim().split('\n'),['Second commit','First commit']);
  await writeFile(join(source,'c.txt'),'third\n');
  await git(source,'add','.');
  await git(source,'commit','-m','Third commit');
  await git(source,'push','origin','main');
  await git(target,'pull','--ff-only','origin','main');
  assert.equal(await readFile(join(target,'c.txt'),'utf8'),'third\n');
  const count=await git(target,'rev-list','--count','HEAD');
  assert.equal(count.stdout.trim(),'3');
 }finally{
  child.kill('SIGTERM');
  await rm(dir,{recursive:true,force:true});
 }
});
