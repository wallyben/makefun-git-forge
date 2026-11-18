import test from 'node:test';
import assert from 'node:assert/strict';
import {pkt,packets,flush,oid,writePack,readPack,discoverRefs,lsRefs,reachableObjects,applyRefUpdates} from '../src/smart-http.mjs';

test('packet framing roundtrip and flush',()=>{
 const data=Buffer.concat([pkt('hello\n'),flush()]);
 const parsed=packets(data);
 assert.equal(parsed[0].toString(),'hello\n');
 assert.equal(parsed[1],null);
});
test('empty repo advertises capabilities with NUL delimiter',()=>{
 const repo={refs:new Map(),objects:new Map()};
 const advertised=packets(discoverRefs(repo,'git-receive-pack'));
 assert.ok(advertised.some(x=>Buffer.isBuffer(x)&&x.includes(Buffer.from([0]))));
 assert.ok(advertised.some(x=>Buffer.isBuffer(x)&&x.toString().includes('capabilities^{}')));
});
test('v2 ls-refs honours prefix and symref',()=>{
 const id='a'.repeat(40),other='b'.repeat(40);
 const repo={refs:new Map([['refs/heads/main',id],['refs/tags/v1',other]])};
 const response=packets(lsRefs(repo,[Buffer.from('symrefs\n'),Buffer.from('ref-prefix HEAD\n'),Buffer.from('ref-prefix refs/heads/\n')]));
 const text=response.filter(Buffer.isBuffer).map(x=>x.toString()).join('');
 assert.match(text,/HEAD symref-target:refs\/heads\/main/);
 assert.match(text,/refs\/heads\/main/);
 assert.doesNotMatch(text,/refs\/tags\/v1/);
});
test('PACK v2 roundtrip preserves binary blobs',()=>{
 const data=Buffer.from([0,1,2,3,255,0,127]);
 const id=oid('blob',data);
 const src=new Map([[id,{type:'blob',data}]]);
 const out=new Map();
 assert.deepEqual(readPack(writePack([id],src),out),[id]);
 assert.deepEqual(out.get(id).data,data);
});
test('invalid ref updates do not mutate refs',()=>{
 const id='a'.repeat(40),newId='b'.repeat(40);
 const repo={refs:new Map([['refs/heads/main',id]])};
 assert.throws(()=>applyRefUpdates(repo,[Buffer.from(id+' '+newId+' refs/heads/main\n')],new Map()),/Missing target object/);
 assert.equal(repo.refs.get('refs/heads/main'),id);
});
test('reachability traverses tree and blob',()=>{
 const blob=Buffer.from('hello');
 const blobId=oid('blob',blob);
 const tree=Buffer.concat([Buffer.from('100644 readme.txt\0'),Buffer.from(blobId,'hex')]);
 const treeId=oid('tree',tree);
 const commit=Buffer.from('tree '+treeId+'\nauthor A <a@b> 0 +0000\ncommitter A <a@b> 0 +0000\n\ninitial\n');
 const commitId=oid('commit',commit);
 const objects=new Map([[blobId,{type:'blob',data:blob}],[treeId,{type:'tree',data:tree}],[commitId,{type:'commit',data:commit}]]);
 assert.deepEqual(new Set(reachableObjects([commitId],objects)),new Set([commitId,treeId,blobId]));
});
