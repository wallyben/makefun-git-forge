import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

test('REST issues can be updated and pull requests listed', async t => {
 const child=spawn(process.execPath,['--experimental-strip-types','main.ts'],{env:{...process.env,MAKEFUN_ENV_URL:'',MAKEFUN_SHOP_TOKEN:''},stdio:['ignore','pipe','pipe']});
 t.after(()=>child.kill());
 const port=await new Promise((resolve,reject)=>{
  let output='';
  const timeout=setTimeout(()=>reject(new Error('Server startup timed out: '+output)),10000);
  child.once('exit',code=>{clearTimeout(timeout);reject(new Error('Server exited: '+code+' '+output))});
  child.stdout.on('data',chunk=>{output+=chunk.toString();const m=/Git forge listening on (\d+)/.exec(output);if(m){clearTimeout(timeout);resolve(Number(m[1]))}});
 });
 const api=async(method,path,data)=>{
  const res=await fetch('http://127.0.0.1:'+port+path,{method,headers:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
  return {status:res.status,body:await res.json()};
 };
 const created=await api('POST','/api/v3/user/repos',{name:'patch-check'});
 assert.equal(created.status,201);
 const issue=await api('POST','/api/v3/repos/agent/patch-check/issues',{title:'Original'});
 assert.equal(issue.status,201);
 const patched=await api('PATCH','/api/v3/repos/agent/patch-check/issues/1',{title:'Updated',state:'closed',body:'Resolved'});
 assert.equal(patched.status,200);
 assert.equal(patched.body.title,'Updated');
 assert.equal(patched.body.state,'closed');
 assert.equal(patched.body.body,'Resolved');
 assert.equal((await api('PATCH','/api/v3/repos/agent/patch-check/issues/1',{state:'invalid'})).status,422);
 const pulls=await api('GET','/api/v3/repos/agent/patch-check/pulls');
 assert.equal(pulls.status,200);
 assert.deepEqual(pulls.body,[]);
});
