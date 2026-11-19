import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

test('MCP update_issue shares state with REST and rejects invalid changes', {timeout:15000}, async () => {
 const child=spawn(process.execPath,['main.ts'],{stdio:['ignore','pipe','pipe'],env:{...process.env,MAKEFUN_ENV:''}});
 let stderr='';
 child.stderr.on('data',b=>{stderr+=b});
 try{
  const port=await new Promise((resolve,reject)=>{
   let output='';
   const timer=setTimeout(()=>reject(new Error('Server startup timeout '+stderr)),8000);
   child.once('exit',code=>{clearTimeout(timer);reject(new Error('Server exited '+code+' '+stderr))});
   child.stdout.on('data',chunk=>{
    output+=chunk.toString();
    const match=/Git forge listening on (\d+)/.exec(output);
    if(match){clearTimeout(timer);resolve(Number(match[1]))}
   });
  });
  const base='http://127.0.0.1:'+port;
  const request=async(path,payload)=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});return {status:r.status,data:await r.json()}};
  const created=await request('/api/v3/user/repos',{name:'mcp-update-test'});
  assert.equal(created.status,201);
  const issue=await request('/api/v3/repos/'+created.data.full_name+'/issues',{title:'Original'});
  assert.equal(issue.status,201);
  const rpc=async(id,name,args)=>(await request('/mcp',{jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args}})).data.result;
  const args={owner:created.data.owner.login,repo:created.data.name,number:issue.data.number};
  const changed=await rpc(1,'update_issue',{...args,title:'Updated',state:'closed'});
  assert.equal(changed.isError,undefined);
  const got=await fetch(base+'/api/v3/repos/'+created.data.full_name+'/issues/'+issue.data.number).then(r=>r.json());
  assert.equal(got.title,'Updated');
  assert.equal(got.state,'closed');
  const bad=await rpc(2,'update_issue',{...args,state:'invalid',title:'Should not change'});
  assert.equal(bad.isError,true);
  const unchanged=await fetch(base+'/api/v3/repos/'+created.data.full_name+'/issues/'+issue.data.number).then(r=>r.json());
  assert.equal(unchanged.title,'Updated');
 }finally{
  child.kill();
  if(child.exitCode===null)await Promise.race([once(child,'exit'),new Promise(resolve=>setTimeout(resolve,1000))]);
 }
});
