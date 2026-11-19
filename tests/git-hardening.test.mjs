import test from 'node:test';
import assert from 'node:assert/strict';
import {oid,pkt,packets,writePack,readPack,discoverRefs,lsRefs} from '../src/smart-http.mjs';
test('Git blob SHA matches known Git hash',()=>{
 assert.equal(oid('blob',Buffer.from('hello\n')),'ce013625030ba8dba906f756967f9e9ca394464a');
});
test('packet line rejects invalid length and truncated data',()=>{
 assert.throws(()=>packets(Buffer.from('0003x')),/Invalid or truncated packet/);
 assert.throws(()=>packets(Buffer.from('0008x')),/Invalid or truncated packet/);
 assert.deepEqual(packets(pkt('hello\n')).map(x=>x.toString()),['hello\n']);
});
test('PACK rejects oversized object count before allocation',()=>{
 const b=Buffer.alloc(32);b.write('PACK');b.writeUInt32BE(2,4);b.writeUInt32BE(100001,8);
 assert.throws(()=>readPack(b,new Map()),/object count exceeds limit/);
});
test('PACK roundtrip retains blob data',()=>{
 const data=Buffer.from('hello\n');const id=oid('blob',data);
 const objects=new Map([[id,{type:'blob',data}]]);
 const result=new Map();readPack(writePack([id],objects),result);
 assert.deepEqual(result.get(id),{type:'blob',data});
});
test('protocol v0 advertises symbolic HEAD and sideband capability',()=>{
 const id='a'.repeat(40);
 const response=discoverRefs({refs:new Map([['refs/heads/main',id]])},'git-upload-pack').toString('utf8');
 assert.match(response,/symref=HEAD:refs\/heads\/main/);
 assert.match(response,/side-band-64k/);
});
test('protocol v2 ls-refs returns symbolic HEAD',()=>{
 const id='b'.repeat(40);
 const response=lsRefs({refs:new Map([['refs/heads/main',id]])},[Buffer.from('symrefs\n')]).toString('utf8');
 assert.match(response,/HEAD symref-target:refs\/heads\/main/);
});
