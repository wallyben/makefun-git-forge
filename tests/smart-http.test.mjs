import test from 'node:test';
import assert from 'node:assert/strict';
import {oid,pkt,flush,packets,readPack,writePack,advertiseV2,lsRefs} from '../src/smart-http.mjs';
test('packet framing and flush roundtrip',()=>{
 const data=Buffer.concat([pkt('hello\n'),flush(),pkt('world\n')]);
 assert.deepEqual(packets(data).map(x=>x===null?null:x.toString()),['hello\n',null,'world\n']);
});
test('Git blob object identity uses canonical object header',()=>{
 assert.equal(oid('blob',Buffer.from('hello\n')),'ce013625030ba8dba906f756967f9e9ca394464a');
});
test('PACK v2 roundtrip for blob, tree and commit objects',()=>{
 const objects=new Map();
 for(const type of ['blob','tree','commit']){
  const data=Buffer.from('test-'+type);
  objects.set(oid(type,data),{type,data});
 }
 const ids=[...objects.keys()];
 const packed=writePack(ids,objects);
 const decoded=new Map();
 assert.deepEqual(readPack(packed,decoded),ids);
 for(const id of ids)assert.deepEqual(decoded.get(id),objects.get(id));
 const corrupted=Buffer.from(packed);corrupted[20]^=1;
 assert.throws(()=>readPack(corrupted,new Map()),/checksum/);
});
test('protocol v2 advertisement and ls-refs framing',()=>{
 assert.match(advertiseV2().toString(),'version 2');
 const r={refs:new Map([['refs/heads/main','a'.repeat(40)]])};
 assert.match(lsRefs(r).toString(),'refs/heads/main');
});
