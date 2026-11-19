import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

test('MCP tools and REST content SHA interoperability',async()=>{
 const child=spawn(process.execPath,['main.ts'],{cwd:process.cwd(),env:{...process.env,MAKEFUN_ENV_URL:'',MAKEFUN_SHOP_TOKEN:''},stdio:['ignore','pipe','pipe']});
 let stderr='';child.stderr.on('data',d=>stderr+=d);
 try{
  const port=await new Promise((resolve,reject)=>{
   let text='';
   const timer=setTimeout(()=>reject(new Error('Server startup timeout: '+stderr)),10000);
   child.stdout.on('data',d=>{text+=d;const m=/Git forge listening on (\d+)/.exec(text);if(m){clearTimeout(timer);resolve(Number(m[1]))}});
   child.once('exit',code=>{clearTimeout(timer);reject(new Error('Server exited '+code+': '+stderr))});
  });
  const base='http://127.0.0.1:'+port;
  const post=async(path,data)=>{const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});return {status:r.status,data:await r.json()}};
  const created=await post('/api/v3/user/repos',{name:'sample'});
  assert.equal(created.status,201);
  const rpc=async(method,params={})=>(await post('/mcp',{jsonrpc:'2.0',id:1,method,params})).data;
  const init=await rpc('initialize');
  assert.equal(init.result.serverInfo.name,'git-forge');
  const tools=await rpc('tools/list');
  assert.ok(tools.result.tools.some(x=>x.name==='create_issue'));
  const listed=await rpc('tools/call',{name:'list_repositories',arguments:{}});
  assert.equal(JSON.parse(listed.result.content[0].text)[0].name,'sample');
  const issue=await rpc('tools/call',{name:'create_issue',arguments:{owner:created.data.owner.login,repo:'sample',title:'MCP issue'}});
  assert.equal(JSON.parse(issue.result.content[0].text).number,1);
  const issues=await rpc('tools/call',{name:'list_issues',arguments:{owner:created.data.owner.login,repo:'sample'}});
  assert.equal(JSON.parse(issues.result.content[0].text).length,1);
  const payload=Buffer.from('hello git\n');
  const put=await fetch(base+'/api/v3/repos/'+created.data.full_name+'/contents/hello.txt',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({message:'Add file',content:payload.toString('base64')})});
  assert.equal(put.status,201);
  const saved=await put.json();
  const {createHash}=await import('node:crypto');
  const expected=createHash('sha1').update(Buffer.concat([Buffer.from('blob '+payload.length+'\0'),payload])).digest('hex');
  assert.equal(saved.content.sha,expected);
 }finally{child.kill();if(child.exitCode===null)await Promise.race([once(child,'exit'),new Promise(r=>setTimeout(r,2000))])}
});
