import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {oid,pkt,flush,writePack} from '../src/smart-http.mjs';

test('PR fast-forward merge advances actual Git ref and refuses divergence', async () => {
 const child=spawn(process.execPath,['main.ts'],{env:{...process.env,MAKEFUN_ENV_URL:'',MAKEFUN_SHOP_TOKEN:''},stdio:['ignore','pipe','pipe']});
 let output='';
 const port=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('startup timeout '+output)),8000);
  child.stdout.on('data',c=>{output+=c;const m=/Git forge listening on (\d+)/.exec(output);if(m){clearTimeout(timer);resolve(Number(m[1]))}});
  child.stderr.on('data',c=>output+=c);
  child.once('error',e=>{clearTimeout(timer);reject(e)});
  child.once('exit',code=>{clearTimeout(timer);reject(new Error('exit '+code+' '+output))});
 }).catch(e=>{child.kill();throw e});
 const base='http://127.0.0.1:'+port;
 const request=async(path,method,body)=>{const r=await fetch(base+path,{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()}};
 try{
  assert.equal((await request('/api/v3/user/repos','POST',{name:'merge-test'})).status,201);
  const objects=new Map();
  const add=(type,data)=>{const bytes=Buffer.from(data);const id=oid(type,bytes);objects.set(id,{type,data:bytes});return id};
  const tree=add('tree','');
  const root=add('commit','tree '+tree+'\nauthor Tester <t@example.com> 0 +0000\ncommitter Tester <t@example.com> 0 +0000\n\nroot\n');
  const childCommit=add('commit','tree '+tree+'\nparent '+root+'\nauthor Tester <t@example.com> 1 +0000\ncommitter Tester <t@example.com> 1 +0000\n\nchild\n');
  const sibling=add('commit','tree '+tree+'\nparent '+root+'\nauthor Tester <t@example.com> 2 +0000\ncommitter Tester <t@example.com> 2 +0000\n\nsibling\n');
  const zero='0'.repeat(40);
  const commands=Buffer.concat([pkt(zero+' '+root+' refs/heads/main\n'),pkt(zero+' '+childCommit+' refs/heads/feature\n'),pkt(zero+' '+sibling+' refs/heads/other\n'),flush(),writePack([...objects.keys()],objects)]);
  const pushed=await fetch(base+'/agent/merge-test.git/git-receive-pack',{method:'POST',body:commands});
  assert.equal(pushed.status,200);
  assert.match((await pushed.text()),/unpack ok/);
  const pr=await request('/api/v3/repos/agent/merge-test/pulls','POST',{head:'feature',base:'main',title:'Advance'});
  assert.equal(pr.status,201);
  const merged=await request('/api/v3/repos/agent/merge-test/pulls/'+pr.data.number+'/merge','PUT',{});
  assert.equal(merged.status,200);
  assert.equal(merged.data.sha,childCommit);
  const refs=await fetch(base+'/agent/merge-test.git/info/refs?service=git-upload-pack');
  assert.match(await refs.text(),new RegExp(childCommit+' refs/heads/main'));
  const divergent=await request('/api/v3/repos/agent/merge-test/pulls','POST',{head:'other',base:'main',title:'Diverged'});
  const refused=await request('/api/v3/repos/agent/merge-test/pulls/'+divergent.data.number+'/merge','PUT',{});
  assert.equal(refused.status,409);
  const unchanged=await request('/api/v3/repos/agent/merge-test/pulls/'+divergent.data.number,'GET');
  assert.equal(unchanged.data.merged,false);
 } finally {child.kill()}
});
