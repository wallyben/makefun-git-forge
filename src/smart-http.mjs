import {createHash} from 'node:crypto';
import {deflateSync,inflateSync} from 'node:zlib';

export const oid = (type,data) => createHash('sha1').update(type+' '+data.length+'\0').update(data).digest('hex');
export const pkt = (data) => {
 const bytes=Buffer.isBuffer(data)?data:Buffer.from(data);
 return Buffer.concat([Buffer.from((bytes.length+4).toString(16).padStart(4,'0')),bytes]);
};
export const flush=()=>Buffer.from('0000');
export function packets(buffer){
 const out=[];let pos=0;
 while(pos+4<=buffer.length){
  const n=parseInt(buffer.toString('ascii',pos,pos+4),16);
  if(!Number.isFinite(n))throw Error('Invalid packet length');
  pos+=4;
  if(n===0){out.push(null);continue}
  if(n===1){out.push({delimiter:true});continue}
  if(n<4||pos+n-4>buffer.length)throw Error('Truncated packet');
  out.push(buffer.subarray(pos,pos+n-4));pos+=n-4;
 }
 return out;
}
const TYPES={1:'commit',2:'tree',3:'blob',4:'tag'};
export function readPack(input,objects){
 if(input.toString('ascii',0,4)!=='PACK')throw Error('Missing PACK header');
 if(input.readUInt32BE(4)!==2&&input.readUInt32BE(4)!==3)throw Error('Unsupported PACK version');
 const count=input.readUInt32BE(8);
 const checksum=createHash('sha1').update(input.subarray(0,input.length-20)).digest();
 if(!checksum.equals(input.subarray(input.length-20)))throw Error('Invalid PACK checksum');
 let pos=12;const unpacked=[];
 for(let i=0;i<count;i++){
  let c=input[pos++],type=(c>>4)&7,size=c&15,shift=4;
  while(c&128){c=input[pos++];size|=(c&127)*2**shift;shift+=7}
  if(type===6||type===7)throw Error('Delta objects not yet supported');
  if(!TYPES[type])throw Error('Unsupported object type '+type);
  const result=inflateSync(input.subarray(pos,input.length-20),{info:true});
  const data=result.buffer;
  if(data.length!==size)throw Error('Object size mismatch');
  pos+=result.engine.bytesWritten;
  const name=TYPES[type],id=oid(name,data);
  unpacked.push([id,{type:name,data}]);
 }
 if(pos!==input.length-20)throw Error('Trailing PACK data');
 for(const [id,obj] of unpacked)objects.set(id,obj);
 return unpacked.map(([id])=>id);
}
export function writePack(ids,objects){
 const chunks=[Buffer.alloc(12)];chunks[0].write('PACK',0);chunks[0].writeUInt32BE(2,4);chunks[0].writeUInt32BE(ids.length,8);
 const typeIds={commit:1,tree:2,blob:3,tag:4};
 for(const id of ids){
  const obj=objects.get(id);if(!obj)throw Error('Unknown object '+id);
  let n=obj.data.length;
  const head=[(typeIds[obj.type]<<4)|(n&15)];n>>>=4;
  if(n)head[0]|=128;
  while(n){let b=n&127;n>>>=7;if(n)b|=128;head.push(b)}
  chunks.push(Buffer.from(head),deflateSync(obj.data));
 }
 const payload=Buffer.concat(chunks);
 return Buffer.concat([payload,createHash('sha1').update(payload).digest()]);
}
export function discoverRefs(repo,service){
 const head=repo.refs.get('refs/heads/main')||'0'.repeat(40);
 return Buffer.concat([
 pkt('# service='+service+'\n'),flush(),
 pkt(head+' HEAD\0multi_ack thin-pack side-band side-band-64k ofs-delta agent=git-forge/0.2\n'),
 pkt(head+' refs/heads/main\n'),flush()
 ]);
}
export function advertiseV2(){
 return Buffer.concat([pkt('version 2\n'),pkt('agent=git-forge/0.2\n'),pkt('ls-refs\n'),pkt('fetch=shallow\n'),flush()]);
}
export function lsRefs(repo){
 const rows=[];
 for(const [name,id] of repo.refs)rows.push(pkt(id+' '+name+'\n'));
 return Buffer.concat([...rows,flush()]);
}
