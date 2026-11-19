import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

test('GraphQL createIssue mutation shares issue state with REST', async t => {
 const child=spawn(process.execPath,['--experimental-strip-types','main.ts'],{env:{...process.env,MAKEFUN_ENV_URL:'',MAKEFUN_SHOP_TOKEN:''},stdio:['ignore','pipe','pipe']});
 t.after(()=>child.kill());
 const port=await new Promise((resolve,reject)=>{
  let output='';
  const timeout=setTimeout(()=>reject(new Error('Startup timeout: '+output)),10000);
  child.once('exit',code=>{clearTimeout(timeout);reject(new Error('Exited '+code+' '+output))});
  child.stdout.on('data',chunk=>{output+=chunk.toString();const m=/Git forge listening on (\\d+)/.exec(output);if(m){clearTimeout(timeout);resolve(Number(m[1]))}});
 });
 const api=async(path,payload)=>{
  const res=await fetch('http://127.0.0.1:'+port+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  assert.equal(res.status,path==='/api/graphql'?200:201);
  return res.json();
 };
 const repo=await api('/api/v3/user/repos',{name:'graphql-mutation'});
 const mutation='mutation Create($input: CreateIssueInput!) { createIssue(input: $input) { issue { number title state } clientMutationId } }';
 const result=await api('/api/graphql',{query:mutation,variables:{input:{repositoryId:String(repo.id),title:'Created via GraphQL',body:'Shared store',clientMutationId:'request-1'}}});
 assert.equal(result.data.createIssue.issue.title,'Created via GraphQL');
 assert.equal(result.data.createIssue.clientMutationId,'request-1');
 const issues=await (await fetch('http://127.0.0.1:'+port+'/api/v3/repos/agent/graphql-mutation/issues')).json();
 assert.equal(issues.length,1);
 assert.equal(issues[0].body,'Shared store');
 const bad=await api('/api/graphql',{query:mutation,variables:{input:{repositoryId:'missing',title:'Nope'}}});
 assert.equal(bad.data.createIssue,null);
 assert.equal(bad.errors.length,1);
});
