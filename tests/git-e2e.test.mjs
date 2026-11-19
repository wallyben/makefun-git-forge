import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';

const exec=promisify(execFile);
const git=(cwd,...args)=>exec('git',args,{cwd,timeout:20000,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GIT_AUTHOR_NAME:'Tester',GIT_AUTHOR_EMAIL:'test@example.com',GIT_COMMITTER_NAME:'Tester',GIT_COMMITTER_EMAIL:'test@example.com'}});
test('real git push and clone through smart HTTP', {timeout:45000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'forge-e2e-'));
 const child=spawn(process.execPath,['main.ts'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,MAKEFUN_ENV_URL:'',MAKEFUN_SHOP_TOKEN:''},stdio:['ignore','pipe','pipe']});
 let output='';let error='';
 child.stdout.on('data',b=>output+=b.toString());child.stderr.on('data',b=>error+=b.toString());
 try{
  const deadline=Date.now()+8000;
  while(!/Git forge listening on (\d+)/.test(output)&&Date.now()<deadline&&child.exitCode===null)await new Promise(r=>setTimeout(r,50));
  const m=/Git forge listening on (\d+)/.exec(output);
  assert.ok(m,'Server failed to start: '+error);
  const url='http://127.0.0.1:'+m[1];
  const created=await fetch(url+'/api/v3/user/repos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'demo'})});
  assert.equal(created.status,201,await created.text());
  const source=join(dir,'source');const target=join(dir,'target');
  await (await import('node:fs/promises')).mkdir(source);
  await git(source,'init','-b','main');
  await writeFile(join(source,'hello.txt'),'Git Forge real push and clone\n');
  await git(source,'add','hello.txt');
  await git(source,'commit','-m','Initial');
  await git(source,'remote','add','origin',url+'/agent/demo.git');
  await git(source,'push','origin','main');
  await exec('git',['clone',url+'/agent/demo.git',target],{timeout:20000,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
  assert.equal(await readFile(join(target,'hello.txt'),'utf8'),'Git Forge real push and clone\n');
 }finally{
  child.kill('SIGTERM');
  await rm(dir,{recursive:true,force:true});
 }
});
