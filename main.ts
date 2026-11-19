import {pkt,flush,packets,readPack,writePack,discoverRefs,advertiseV2,lsRefs,reachableObjects,applyRefUpdates} from './src/smart-http.mjs';
import http from 'node:http';
import {randomUUID,createHash} from 'node:crypto';
const token=process.env.MAKEFUN_SHOP_TOKEN||'';
const env=process.env.MAKEFUN_ENV_URL;
const repos=new Map();
const gitRepos=new Map();
const owner=process.env.MAKEFUN_LOGIN||'agent';
const sha=x=>createHash('sha1').update(x).digest('hex');
const gitBlobSha=bytes=>sha(Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes]));
const json=(res,status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json','X-GitHub-Request-Id':randomUUID(),...headers});res.end(status===204?'':JSON.stringify(data))};
const fail=(res,status,message)=>json(res,status,{message});
const body=async req=>{let s='';for await(const c of req){s+=c;if(s.length>2e6)throw Error('Body too large')}return s?JSON.parse(s):{}};
const repoObj=r=>({id:r.id,name:r.name,full_name:r.owner+'/'+r.name,private:false,description:r.description,default_branch:'main',owner:{login:r.owner},html_url:'https://github.com/'+r.owner+'/'+r.name});
const issueObj=(r,i)=>({id:i.id,number:i.number,title:i.title,body:i.body,state:i.state,labels:i.labels.map(name=>({name})),user:{login:r.owner},html_url:'https://github.com/'+r.owner+'/'+r.name+'/issues/'+i.number});
const server=http.createServer(async(req,res)=>{
 try{
 const url=new URL(req.url,'http://localhost');const p=url.pathname;
 if(/^\/[^/]+\/[^/]+\.git\/(info\/refs|git-upload-pack|git-receive-pack)$/.test(p)){
  const m=/^\/([^/]+)\/([^/]+)\.git\/(info\/refs|git-upload-pack|git-receive-pack)$/.exec(p);
  const key=decodeURIComponent(m[1])+'/'+decodeURIComponent(m[2]);
  const gr=gitRepos.get(key);
  if(!gr)return fail(res,404,'Repository not found');
  const route=m[3],service=url.searchParams.get('service');
  if(route==='info/refs'){
   if(!['git-upload-pack','git-receive-pack'].includes(service))return fail(res,400,'Unsupported service');
   const v2=/version=2/.test(req.headers['git-protocol']||'');
   res.writeHead(200,{'Content-Type':'application/x-'+service+'-advertisement','Cache-Control':'no-cache'});
   return res.end(v2?advertiseV2():discoverRefs(gr,service));
  }
  if(req.method!=='POST')return fail(res,405,'Method not allowed');
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const input=Buffer.concat(chunks);
  if(route==='git-upload-pack'){
   const lines=packets(input);
   const cmd=lines.find(x=>x&&x.toString().startsWith('command='));
   if(cmd&&cmd.toString().startsWith('command=ls-refs')){
    res.writeHead(200,{'Content-Type':'application/x-git-upload-pack-result'});
    return res.end(lsRefs(gr,lines));
   }
   if(cmd&&cmd.toString().startsWith('command=fetch')){
    const wants=lines.filter(x=>x&&x.toString().startsWith('want ')).map(x=>x.toString().slice(5).trim());
    const objects=reachableObjects(wants,gr.objects);
    const packed=writePack(objects,gr.objects);
    const bands=[];for(let i=0;i<packed.length;i+=65515)bands.push(pkt(Buffer.concat([Buffer.from([1]),packed.subarray(i,i+65515)])));
    const haves=lines.filter(x=>x&&x.toString().startsWith('have ')).map(x=>x.toString().slice(5).trim()).filter(oid=>gr.objects.has(oid));
    const acknowledgment=haves.length? [pkt('acknowledgments\n'),...haves.map(oid=>pkt('ACK '+oid+'\n')),pkt('ready\n'),Buffer.from('0001')]:[];
    const result=Buffer.concat([...acknowledgment,pkt('packfile\n'),...bands,flush()]);
    res.writeHead(200,{'Content-Type':'application/x-git-upload-pack-result'});
    return res.end(result);
   }
   const wants=lines.filter(x=>x&&x.toString().startsWith('want ')).map(x=>x.toString().slice(5).trim());
   const packed=writePack(reachableObjects(wants,gr.objects),gr.objects);
   const sideband=lines.some(x=>Buffer.isBuffer(x)&&/side-band(?:-64k)?/.test(x.toString()));
   const result=sideband
    ? Buffer.concat([pkt('NAK\n'),...Array.from({length:Math.ceil(packed.length/65515)},(_,i)=>pkt(Buffer.concat([Buffer.from([1]),packed.subarray(i*65515,(i+1)*65515)]))),flush()])
    : Buffer.concat([pkt('NAK\n'),packed]);
   res.writeHead(200,{'Content-Type':'application/x-git-upload-pack-result'});
   return res.end(result);
  }
  if(route==='git-receive-pack'){
   let end=0;
   while(end+4<=input.length){
    const header=input.toString('ascii',end,end+4);
    if(!/^[0-9a-fA-F]{4}$/.test(header))throw Error('Invalid receive-pack packet header');
    const length=parseInt(header,16);
    if(length===0){end+=4;break}
    if(length<4||end+length>input.length)throw Error('Invalid receive-pack command packet');
    end+=length;
   }
   if(end<4||input.toString('ascii',end-4,end)!=='0000')return fail(res,400,'Missing commands');
   const commands=packets(input.subarray(0,end));
   const pack=input.subarray(end);
   try{
    const staged=new Map(gr.objects);
    if(pack.length)readPack(pack,staged);
    const updated=applyRefUpdates(gr,commands,staged);
    gr.objects=staged;
    res.writeHead(200,{'Content-Type':'application/x-git-receive-pack-result'});
    const status=Buffer.concat([pkt('unpack ok\n'),...updated.map(ref=>pkt('ok '+ref+'\n')),flush()]);
    const sideband=commands.some(x=>Buffer.isBuffer(x)&&/side-band-64k/.test(x.toString()));
    return res.end(sideband?Buffer.concat([pkt(Buffer.concat([Buffer.from([1]),status])),flush()]):status);
   }catch(error){res.writeHead(200,{'Content-Type':'application/x-git-receive-pack-result'});return res.end(Buffer.concat([pkt('unpack '+error.message+'\n'),flush()]))}
  }
 }
 if(!p.startsWith('/api/')&&!p.startsWith('/mcp'))return fail(res,404,'Not Found');
 if(token&&req.headers.authorization!=='Bearer '+token)return fail(res,401,'Bad credentials');
 if(p==='/api/v3/'&&req.method==='GET')return json(res,200,{current_user_url:'/api/v3/user'}, {'X-OAuth-Scopes':'repo'});
 if(p==='/api/v3/meta'&&req.method==='GET')return json(res,200,{installed_version:'0.1.0'});
 if(p==='/api/v3/user'&&req.method==='GET')return json(res,200,{login:owner,id:1});
 if(p==='/api/v3/user/repos'){
  if(req.method==='GET'){const list=[...repos.values()].map(repoObj);const page=Math.max(1,Number(url.searchParams.get('page'))||1),per=Math.min(100,Math.max(1,Number(url.searchParams.get('per_page'))||30));const start=(page-1)*per;const headers={};if(start+per<list.length)headers.Link='<'+url.origin+p+'?page='+(page+1)+'&per_page='+per+'>; rel="next"';return json(res,200,list.slice(start,start+per),headers)}
  if(req.method==='POST'){const b=await body(req);if(typeof b.name!=='string'||!/^[\w.-]+$/.test(b.name))return fail(res,422,'Invalid name');const key=owner+'/'+b.name;if(repos.has(key))return fail(res,422,'Repository exists');const r={id:repos.size+1,name:b.name,owner,description:b.description||'',issues:[],pulls:[],labels:new Set(),files:new Map()};repos.set(key,r);gitRepos.set(key,{refs:new Map(),objects:new Map()});return json(res,201,repoObj(r))}
 }
 const m=/^\/api\/v3\/repos\/([^/]+)\/([^/]+)(?:\/(.*))?$/.exec(p);
 if(m){
 const key=decodeURIComponent(m[1])+'/'+decodeURIComponent(m[2]);const r=repos.get(key);
 if(!r)return fail(res,404,'Not Found');
 const sub=m[3]||'';
 if(!sub){
  if(req.method==='GET')return json(res,200,repoObj(r));
  if(req.method==='PATCH'){const b=await body(req);if(typeof b.description==='string')r.description=b.description;return json(res,200,repoObj(r))}
  if(req.method==='DELETE'){repos.delete(key);gitRepos.delete(key);return json(res,204,null)}
 }
 if(sub==='labels'&&req.method==='POST'){const b=await body(req);if(!b.name)return fail(res,422,'Name required');r.labels.add(b.name);return json(res,201,{name:b.name})}
 if(sub==='issues'){
  if(req.method==='GET'){const state=url.searchParams.get('state')||'open';if(!['open','closed','all'].includes(state))return fail(res,422,'Invalid issue state');const page=Math.max(1,Number(url.searchParams.get('page'))||1),per=Math.min(100,Math.max(1,Number(url.searchParams.get('per_page'))||30));const filtered=r.issues.filter(i=>state==='all'||i.state===state);const start=(page-1)*per;const headers={};if(start+per<filtered.length)headers.Link='<'+url.origin+p+'?state='+state+'&page='+(page+1)+'&per_page='+per+'>; rel="next"';return json(res,200,filtered.slice(start,start+per).map(i=>issueObj(r,i)),headers)}
  if(req.method==='POST'){const b=await body(req);if(typeof b.title!=='string'||!b.title.trim())return fail(res,422,'Title required');if(b.body!==undefined&&typeof b.body!=='string')return fail(res,422,'Invalid body');const labels=b.labels??[];if(!Array.isArray(labels)||labels.some(l=>{const name=typeof l==='string'?l:(l&&typeof l==='object'?l.name:undefined);return typeof name!=='string'||!r.labels.has(name)}))return fail(res,422,'Unknown label');const i={id:r.issues.length+1,number:r.issues.length+1,title:b.title,body:b.body||'',state:'open',labels:labels.map(l=>typeof l==='string'?l:l.name)};r.issues.push(i);return json(res,201,issueObj(r,i))}
 }
 const issue=/^issues\/(\d+)$/.exec(sub);if(issue){const i=r.issues.find(x=>x.number===Number(issue[1]));if(!i)return fail(res,404,'Not Found');if(req.method==='GET')return json(res,200,issueObj(r,i));if(req.method==='PATCH'){const b=await body(req);if(b.title!==undefined&&(typeof b.title!=='string'||!b.title.trim()))return fail(res,422,'Invalid title');if(b.body!==undefined&&typeof b.body!=='string')return fail(res,422,'Invalid body');if(b.state!==undefined&&!['open','closed'].includes(b.state))return fail(res,422,'Invalid state');if(b.title!==undefined)i.title=b.title;if(b.body!==undefined)i.body=b.body;if(b.state!==undefined)i.state=b.state;return json(res,200,issueObj(r,i))}}
 if(sub==='pulls'&&req.method==='GET')return json(res,200,r.pulls);
 if(sub==='pulls'&&req.method==='POST'){const b=await body(req);const i={number:r.pulls.length+1,title:b.title||'',head:b.head||'',base:b.base||'main',state:'open',merged:false};r.pulls.push(i);return json(res,201,i)}
 const pull=/^pulls\/(\d+)(?:\/(merge))?$/.exec(sub);if(pull){const i=r.pulls.find(x=>x.number===Number(pull[1]));if(!i)return fail(res,404,'Not Found');if(!pull[2]&&req.method==='GET')return json(res,200,i);if(pull[2]&&req.method==='PUT'){if(i.merged)return fail(res,405,'Already merged');i.merged=true;i.state='closed';return json(res,200,{sha:sha(key+i.number),merged:true,message:'Pull Request successfully merged'})}}
 const content=/^contents\/(.+)$/.exec(sub);if(content){const name=decodeURIComponent(content[1]);const f=r.files.get(name);
  if(req.method==='GET'){return f?json(res,200,{name,path:name,sha:f.sha,content:f.content,encoding:'base64',type:'file'}):fail(res,404,'Not Found')}
  if(req.method==='PUT'){const b=await body(req);if(f&&b.sha!==f.sha)return fail(res,409,'SHA mismatch');if(!f&&b.sha)return fail(res,409,'SHA mismatch');if(typeof b.content!=='string')return fail(res,422,'Content required');const next={content:b.content,sha:gitBlobSha(Buffer.from(b.content,'base64'))};r.files.set(name,next);return json(res,f?200:201,{content:{name,path:name,sha:next.sha},commit:{sha:sha(key+name+next.sha)}})}
  if(req.method==='DELETE'){if(!f)return fail(res,404,'Not Found');const b=await body(req);if(b.sha!==f.sha)return fail(res,409,'SHA mismatch');r.files.delete(name);return json(res,200,{commit:{sha:sha(key+name+'delete')}})}
 }
 }
 if(p==='/api/graphql'&&req.method==='POST'){
  const b=await body(req);
  if(typeof b.query!=='string'||!b.query.trim())return fail(res,400,'Query required');
  const q=b.query,vars=b.variables||{},data={};
  const arg=name=>{const pattern=new RegExp(name+'\\s*:\\s*('+String.fromCharCode(92,36)+'[A-Za-z_][A-Za-z_0-9]*|"[^"]*")');const m=pattern.exec(q);if(!m)return undefined;return m[1].charCodeAt(0)===36?vars[m[1].slice(1)]:JSON.parse(m[1])};
  const gqlRepo=r=>({id:String(r.id),name:r.name,nameWithOwner:r.owner+'/'+r.name,description:r.description,isPrivate:false,url:'https://github.com/'+r.owner+'/'+r.name,defaultBranchRef:{name:'main'},issues:{totalCount:r.issues.length,nodes:r.issues.map(i=>({id:String(i.id),number:i.number,title:i.title,body:i.body,state:i.state.toUpperCase()}))},pullRequests:{totalCount:r.pulls.length,nodes:r.pulls}});
  // GitHub's createIssue mutation uses a repository node ID, not an owner/name pair.
  // Resolve it against the same in-memory store used by REST and MCP.
  if(/\bmutation\b/.test(q)&&/\bcreateIssue\s*\(/.test(q)){
   const inlineField=(field)=>{const match=new RegExp(field+'\\s*:\\s*("([^"]*)"|\\$([A-Za-z_][A-Za-z_0-9]*))').exec(q);return match?(match[3]?vars[match[3]]:match[2]):undefined};
   const input=vars.input&&typeof vars.input==='object'?vars.input:{repositoryId:inlineField('repositoryId'),title:inlineField('title'),body:inlineField('body'),clientMutationId:inlineField('clientMutationId')};
   const r=[...repos.values()].find(repo=>String(repo.id)===String(input.repositoryId));
   if(!r)return json(res,200,{data:{createIssue:null},errors:[{message:'Could not resolve repositoryId'}]});
   if(typeof input.title!=='string'||!input.title.trim())return json(res,200,{data:{createIssue:null},errors:[{message:'Issue title is required'}]});
   if(input.body!==undefined&&typeof input.body!=='string')return json(res,200,{data:{createIssue:null},errors:[{message:'Issue body must be a string'}]});
   const i={id:r.issues.length+1,number:r.issues.length+1,title:input.title,body:input.body||'',state:'open',labels:[]};
   r.issues.push(i);
   const issue={...issueObj(r,i),id:String(i.id),state:'OPEN'};
   return json(res,200,{data:{createIssue:{clientMutationId:input.clientMutationId??null,issue}}});
  }
   if(/\bmutation\b/.test(q)&&/\bupdateIssue\s*\(/.test(q)){
   const inlineField=(field)=>{const match=new RegExp(field+'\\s*:\\s*("([^"]*)"|\\$([A-Za-z_][A-Za-z_0-9]*))').exec(q);return match?(match[3]?vars[match[3]]:match[2]):undefined};
   const input=vars.input&&typeof vars.input==='object'?vars.input:{id:inlineField('id'),title:inlineField('title'),body:inlineField('body'),state:inlineField('state'),clientMutationId:inlineField('clientMutationId')};
   const matches=[...repos.values()].flatMap(r=>r.issues.map(i=>({r,i}))).filter(({i})=>String(i.id)===String(input.id));
   if(matches.length!==1)return json(res,200,{data:{updateIssue:null},errors:[{message:'Could not resolve issue ID'}]});
   if(input.title!==undefined&&(typeof input.title!=='string'||!input.title.trim()))return json(res,200,{data:{updateIssue:null},errors:[{message:'Invalid issue title'}]});
   if(input.body!==undefined&&typeof input.body!=='string')return json(res,200,{data:{updateIssue:null},errors:[{message:'Invalid issue body'}]});
   if(input.state!==undefined&&!['OPEN','CLOSED'].includes(input.state))return json(res,200,{data:{updateIssue:null},errors:[{message:'Invalid issue state'}]});
   const {r,i}=matches[0];
   if(input.title!==undefined)i.title=input.title;
   if(input.body!==undefined)i.body=input.body;
   if(input.state!==undefined)i.state=input.state.toLowerCase();
   return json(res,200,{data:{updateIssue:{clientMutationId:input.clientMutationId??null,issue:{...issueObj(r,i),id:String(i.id),state:i.state.toUpperCase()}}}});
  }
  if(/\bviewer\b/.test(q))data.viewer={login:owner,id:'1',repositories:{totalCount:repos.size,nodes:[...repos.values()].map(gqlRepo)}};
  if(/\brepository\s*\(/.test(q)){const own=arg('owner'),name=arg('name');if(typeof own!=='string'||typeof name!=='string')return json(res,200,{data:null,errors:[{message:'repository requires owner and name'}]});data.repository=repos.has(own+'/'+name)?gqlRepo(repos.get(own+'/'+name)):null}
  if(/\brateLimit\b/.test(q))data.rateLimit={limit:5000,remaining:5000,cost:1};
  if(!Object.keys(data).length)return json(res,200,{data:null,errors:[{message:'Unsupported GraphQL operation'}]});
  return json(res,200,{data});
 }
 if(p==='/mcp'&&req.method==='POST'){
  const b=await body(req);
  if(b.method==='notifications/initialized'){res.writeHead(202);return res.end()}
  const reply=(result)=>json(res,200,{jsonrpc:'2.0',id:b.id,result});
  const error=(code,message)=>json(res,200,{jsonrpc:'2.0',id:b.id,error:{code,message}});
  if(b.jsonrpc!=='2.0'||typeof b.method!=='string')return error(-32600,'Invalid Request');
  if(b.method==='initialize')return reply({protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'git-forge',version:'0.2.0'}});
  const tools=[
   {name:'list_repositories',description:'List repositories owned by the current user',inputSchema:{type:'object',properties:{},additionalProperties:false}},
   {name:'get_repository',description:'Get a repository by owner and name',inputSchema:{type:'object',properties:{owner:{type:'string'},repo:{type:'string'}},required:['owner','repo'],additionalProperties:false}},
   {name:'list_issues',description:'List issues in a repository',inputSchema:{type:'object',properties:{owner:{type:'string'},repo:{type:'string'}},required:['owner','repo'],additionalProperties:false}},
   {name:'create_issue',description:'Create an issue in a repository',inputSchema:{type:'object',properties:{owner:{type:'string'},repo:{type:'string'},title:{type:'string'},body:{type:'string'}},required:['owner','repo','title'],additionalProperties:false}},
   {name:'update_issue',description:'Update issue title, body or open/closed state',inputSchema:{type:'object',properties:{owner:{type:'string'},repo:{type:'string'},number:{type:'integer',minimum:1},title:{type:'string'},body:{type:'string'},state:{type:'string',enum:['open','closed']}},required:['owner','repo','number'],additionalProperties:false}}
  ];
  if(b.method==='tools/list')return reply({tools});
  if(b.method==='ping')return reply({});
  if(b.method==='tools/call'){
   const name=b.params?.name,a=b.params?.arguments||{};
   if(!tools.some(t=>t.name===name))return error(-32602,'Unknown tool');
   const r=repos.get(a.owner+'/'+a.repo);
   let value;
   if(name==='list_repositories')value=[...repos.values()].map(repoObj);
   else if(!r)return reply({content:[{type:'text',text:'Repository not found'}],isError:true});
   else if(name==='get_repository')value=repoObj(r);
   else if(name==='list_issues')value=r.issues.map(i=>issueObj(r,i));
   else if(name==='create_issue'){
    if(typeof a.title!=='string'||!a.title.trim())return reply({content:[{type:'text',text:'Issue title required'}],isError:true});
    const i={id:r.issues.length+1,number:r.issues.length+1,title:a.title,body:typeof a.body==='string'?a.body:'',state:'open',labels:[]};
    r.issues.push(i);value=issueObj(r,i);
   }
   else if(name==='update_issue'){
    const i=Number.isInteger(a.number)&&a.number>0?r.issues.find(x=>x.number===a.number):undefined;
    if(!i)return reply({content:[{type:'text',text:'Issue not found'}],isError:true});
    if(a.title!==undefined&&(typeof a.title!=='string'||!a.title.trim()))return reply({content:[{type:'text',text:'Invalid issue title'}],isError:true});
    if(a.body!==undefined&&typeof a.body!=='string')return reply({content:[{type:'text',text:'Invalid issue body'}],isError:true});
    if(a.state!==undefined&&!['open','closed'].includes(a.state))return reply({content:[{type:'text',text:'Invalid issue state'}],isError:true});
    if(a.title!==undefined)i.title=a.title;
    if(a.body!==undefined)i.body=a.body;
    if(a.state!==undefined)i.state=a.state;
    value=issueObj(r,i);
   }
   return reply({content:[{type:'text',text:JSON.stringify(value)}]});
  }
  return error(-32601,'Method not found');
 }
 return fail(res,404,'Not Found');
 }catch(e){return fail(res,e instanceof SyntaxError?400:500,e instanceof SyntaxError?'Malformed JSON':'Internal error')}
});
server.listen(0,'0.0.0.0',async()=>{
 const port=server.address().port;console.log('Git forge listening on '+port);
 if(!env)return;
 try{
  const register=await fetch(env+'/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({port})});if(!register.ok)throw Error('Registration failed '+register.status);
  while(true){const r=await fetch(env+'/done');if(r.ok&&(await r.json()).done===true){server.close();process.exit(0)}await new Promise(resolve=>setTimeout(resolve,1000))}
 }catch(e){console.error(e);process.exitCode=1;server.close()}
});
