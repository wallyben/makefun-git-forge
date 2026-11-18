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
function deltaVarint(data,offset){
 let value=0,shift=0,b;
 do{
  if(offset>=data.length||shift>49)throw Error('Invalid delta varint');
  b=data[offset++];value+=(b&127)*2**shift;shift+=7;
 }while(b&128);
 return [value,offset];
}
export function applyDelta(base,delta){
 let pos=0;let baseSize,outSize;
 [baseSize,pos]=deltaVarint(delta,pos);[outSize,pos]=deltaVarint(delta,pos);
 if(baseSize!==base.length)throw Error('Delta base size mismatch');
 if(!Number.isSafeInteger(outSize)||outSize>64*1024*1024)throw Error('Delta output too large');
 const out=Buffer.alloc(outSize);let dest=0;
 while(pos<delta.length){
  const cmd=delta[pos++];
  if(cmd&128){
   let offset=0,length=0;
   for(let i=0;i<4;i++)if(cmd&(1<<i)){if(pos>=delta.length)throw Error('Truncated delta copy offset');offset+=delta[pos++]*2**(8*i)}
   for(let i=0;i<3;i++)if(cmd&(1<<(i+4))){if(pos>=delta.length)throw Error('Truncated delta copy length');length+=delta[pos++]*2**(8*i)}
   if(length===0)length=65536;
   if(offset+length>base.length||dest+length>out.length)throw Error('Delta copy out of bounds');
   base.copy(out,dest,offset,offset+length);dest+=length;
  }else if(cmd){
   if(pos+cmd>delta.length||dest+cmd>out.length)throw Error('Delta insert out of bounds');
   delta.copy(out,dest,pos,pos+cmd);pos+=cmd;dest+=cmd;
  }else throw Error('Invalid delta opcode');
 }
 if(dest!==outSize)throw Error('Delta output size mismatch');
 return out;
}
export function readPack(input,objects){
 if(input.length<32||input.toString('ascii',0,4)!=='PACK')throw Error('Missing PACK header');
 if(input.readUInt32BE(4)!==2&&input.readUInt32BE(4)!==3)throw Error('Unsupported PACK version');
 const count=input.readUInt32BE(8);
 const checksum=createHash('sha1').update(input.subarray(0,input.length-20)).digest();
 if(!checksum.equals(input.subarray(input.length-20)))throw Error('Invalid PACK checksum');
 let pos=12;const entries=[],resolved=new Map(objects);
 const readOffset=()=>{
  if(pos>=input.length-20)throw Error('Truncated PACK');
  return input[pos++];
 };
 for(let i=0;i<count;i++){
  const start=pos;
  let c=readOffset(),type=(c>>4)&7,size=c&15,shift=4;
  while(c&128){c=readOffset();size+=(c&127)*2**shift;shift+=7;if(shift>49)throw Error('Object size too large')}
  if(!Number.isSafeInteger(size)||size>64*1024*1024)throw Error('Object too large');
  let baseId=null,baseOffset=null;
  if(type===6){
   let b=readOffset(),distance=b&127;
   while(b&128){b=readOffset();distance=((distance+1)*128)+(b&127)}
   baseOffset=start-distance;
   if(baseOffset<12)throw Error('Invalid OFS_DELTA offset');
  }else if(type===7){
   if(pos+20>input.length-20)throw Error('Truncated REF_DELTA base');
   baseId=input.subarray(pos,pos+20).toString('hex');pos+=20;
  }else if(!TYPES[type])throw Error('Unsupported object type '+type);
  const inflated=inflateSync(input.subarray(pos,input.length-20),{info:true});
  pos+=inflated.engine.bytesWritten;
  if(inflated.buffer.length!==size)throw Error('Object size mismatch');
  entries.push({start,type,data:inflated.buffer,baseId,baseOffset});
 }
 if(pos!==input.length-20)throw Error('Trailing PACK data');
 const byOffset=new Map();const pending=new Set(entries);
 for(let attempt=0;pending.size&&attempt<=entries.length;attempt++){
  let progressed=false;
  for(const entry of [...pending]){
   let object;
   if(TYPES[entry.type])object={type:TYPES[entry.type],data:entry.data};
   else{
    const base=entry.type===6?byOffset.get(entry.baseOffset):resolved.get(entry.baseId);
    if(!base)continue;
    object={type:base.type,data:applyDelta(base.data,entry.data)};
   }
   const id=oid(object.type,object.data);
   entry.id=id;entry.object=object;resolved.set(id,object);byOffset.set(entry.start,object);
   pending.delete(entry);progressed=true;
  }
  if(!progressed)break;
 }
 if(pending.size)throw Error('Unresolved delta base');
 for(const entry of entries)objects.set(entry.id,entry.object);
 return entries.map(entry=>entry.id);
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
 const main=repo.refs.get('refs/heads/main');
 const refs=[...repo.refs].sort(([a],[b])=>a.localeCompare(b));
 const caps='report-status report-status-v2 delete-refs ofs-delta side-band-64k agent=git-forge/0.3';
 const rows=[pkt('# service='+service+'\n'),flush()];
 if(!refs.length){
  rows.push(pkt('0'.repeat(40)+' capabilities^{}\\0'+caps+'\n'));
 }else{
  const [firstName,firstId]=refs[0];
  rows.push(pkt(firstId+' '+firstName+'\\0'+caps+'\n'));
  for(const [name,id] of refs.slice(1))rows.push(pkt(id+' '+name+'\n'));
  rows.push(pkt((main||firstId)+' HEAD\n'));
 }
 return Buffer.concat([...rows,flush()]);
}
export function advertiseV2(){
 return Buffer.concat([pkt('version 2\n'),pkt('agent=git-forge/0.3\n'),pkt('ls-refs\n'),pkt('fetch=shallow wait-for-done\n'),flush()]);
}
export function lsRefs(repo,request=[]){
 const lines=request.filter(x=>Buffer.isBuffer(x)).map(x=>x.toString('utf8').trim());
 const prefixes=lines.filter(x=>x.startsWith('ref-prefix ')).map(x=>x.slice(11));
 const symrefs=lines.includes('symrefs');
 const main=repo.refs.get('refs/heads/main');
 const rows=[];
 if(main&&(!prefixes.length||prefixes.some(p=>'HEAD'.startsWith(p))))
  rows.push(pkt(main+' HEAD'+(symrefs?' symref-target:refs/heads/main':'')+'\n'));
 for(const [name,id] of [...repo.refs].sort(([a],[b])=>a.localeCompare(b))){
  if(prefixes.length&&!prefixes.some(p=>name.startsWith(p)))continue;
  rows.push(pkt(id+' '+name+'\n'));
 }
 return Buffer.concat([...rows,flush()]);
}

/** Resolve the full object graph needed for a fetch, including commit parents and trees. */
export function reachableObjects(wants,objects){
 const visited=new Set(),queue=[...wants];
 while(queue.length){
  const id=queue.pop();
  if(!/^[0-9a-f]{40}$/.test(id)||!objects.has(id))throw Error('Unknown wanted object '+id);
  if(visited.has(id))continue;
  visited.add(id);
  const object=objects.get(id);
  if(object.type==='commit'){
   const header=object.data.toString('utf8').split('\n\n',1)[0];
   for(const line of header.split('\n')){
    const match=/^(?:tree|parent) ([0-9a-f]{40})$/.exec(line);
    if(match)queue.push(match[1]);
   }
  }else if(object.type==='tag'){
   const match=/^object ([0-9a-f]{40})$/m.exec(object.data.toString('utf8').split('\n\n',1)[0]);
   if(match)queue.push(match[1]);
  }else if(object.type==='tree'){
   let pos=0;
   while(pos<object.data.length){
    const space=object.data.indexOf(32,pos);
    const nul=object.data.indexOf(0,space+1);
    if(space<0||nul<0||nul+21>object.data.length)throw Error('Invalid tree object');
    const mode=object.data.toString('ascii',pos,space);
    const child=object.data.subarray(nul+1,nul+21).toString('hex');
    if(mode!=='160000')queue.push(child); // submodules refer to external commits
    pos=nul+21;
   }
  }
 }
 return [...visited];
}
export function applyRefUpdates(repo,commands,objects){
 const zero='0'.repeat(40);
 const updates=[],seen=new Set();
 for(const line of commands){
  if(!line)continue;
  const raw=line.toString('utf8').split('\0')[0].trim();
  const match=/^([a-f0-9]{40}) ([a-f0-9]{40}) (refs\/(?:heads|tags)\/[A-Za-z0-9._/-]+)$/.exec(raw);
  if(!match)throw Error('Invalid ref update command');
  const [,oldId,newId,ref]=match;
  if(ref.includes('..')||ref.includes('//')||ref.endsWith('/')||ref.endsWith('.')||ref.includes('/.')||ref.includes('.lock')||seen.has(ref))throw Error('Invalid or duplicate ref');
  seen.add(ref);
  if((repo.refs.get(ref)||zero)!==oldId)throw Error('Stale reference '+ref);
  if(newId!==zero&&!objects.has(newId))throw Error('Missing target object '+newId);
  if(newId!==zero)reachableObjects([newId],objects);
  updates.push({ref,newId});
 }
 for(const {ref,newId} of updates){
  if(newId===zero)repo.refs.delete(ref);else repo.refs.set(ref,newId);
 }
 return updates.map(x=>x.ref);
}
