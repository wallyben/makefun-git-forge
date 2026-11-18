import test from 'node:test';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
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

test('REF_DELTA resolves against existing objects and preserves atomicity',()=>{
 const base=Buffer.from('hello world');const baseId=oid('blob',base);
 const delta=Buffer.from([11,12,0x90,6,6,...Buffer.from('planet')]);
 const compressed=deflateSync(delta);
 const header=Buffer.from([0x70|delta.length]);
 const prefix=Buffer.alloc(12);prefix.write('PACK');prefix.writeUInt32BE(2,4);prefix.writeUInt32BE(1,8);
 const payload=Buffer.concat([prefix,header,Buffer.from(baseId,'hex'),compressed]);
 const pack=Buffer.concat([payload,createHash('sha1').update(payload).digest()]);
 const objects=new Map([[baseId,{type:'blob',data:base}]]);
 const ids=readPack(pack,objects);
 assert.equal(ids.length,1);
 assert.equal(objects.get(ids[0]).data.toString(),'hello planet');
 const missing=new Map();
 assert.throws(()=>readPack(pack,missing),/Unresolved delta base/);
 assert.equal(missing.size,0);
});
test('OFS_DELTA resolves a preceding base object in the same pack',()=>{
 const base=Buffer.from('hello world');const baseId=oid('blob',base);
 const baseBody=Buffer.concat([Buffer.from([0x30|base.length]),deflateSync(base)]);
 const delta=Buffer.from([11,12,0x90,6,6,...Buffer.from('planet')]);
 const deltaStart=12+baseBody.length;
 const distance=deltaStart-12;
 assert.ok(distance<128);
 const deltaBody=Buffer.concat([Buffer.from([0x60|delta.length,distance]),deflateSync(delta)]);
 const prefix=Buffer.alloc(12);prefix.write('PACK');prefix.writeUInt32BE(2,4);prefix.writeUInt32BE(2,8);
 const payload=Buffer.concat([prefix,baseBody,deltaBody]);
 const pack=Buffer.concat([payload,createHash('sha1').update(payload).digest()]);
 const objects=new Map();
 const ids=readPack(pack,objects);
 assert.equal(ids[0],baseId);
 assert.equal(objects.get(ids[1]).data.toString(),'hello planet');
});
