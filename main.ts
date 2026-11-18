import http from 'node:http';
import {randomUUID,createHash} from 'node:crypto';
const token=process.env.MAKEFUN_SHOP_TOKEN||'';
const env=process.env.MAKEFUN_ENV_URL;
const repos=new Map();
const owner=process.env.MAKEFUN_LOGIN||'agent';
const sha=x=>createHash('sha1').update(x).digest('hex');
const json=(res,status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json','X-GitHub-Request-Id':randomUUID(),...headers});res.end(status===204?'':JSON.stringify(data))};
const fail=(res,status,message)=>json(res,status,{message});
const body=async req=>{let s='';for await(const c of req){s+=c;if(s.length>2e6)throw Error('Body too large')}return s?JSON.parse(s):{}};
const repoObj=r=>({id:r.id,name:r.name,full_name:r.owner+'/'+r.name,private:false,description:r.description,default_branch:'main',owner:{login:r.owner},html_url:'https://github.com/'+r.owner+'/'+r.name});
const issueObj=(r,i)=>({id:i.id,number:i.number,title:i.title,body:i.body,state:i.state,labels:i.labels.map(name=>({name})),user:{login:r.owner},html_url:'https://github.com/'+r.owner+'/'+r.name+'/issues/'+i.number});
const server=http.createServer(async(req,res)=>{
 try{
 const url=new URL(req.url,'http://localhost');const p=url.pathname;
 if(!p.startsWith('/api/')&&!p.startsWith('/mcp'))return fail(res,404,'Not Found');
 if(token&&req.headers.authorization!=='Bearer '+token)return fail(res,401,'Bad credentials');
 if(p==='/api/v3/'&&req.method==='GET')return json(res,200,{current_user_url:'/api/v3/user'}, {'X-OAuth-Scopes':'repo'});
 if(p==='/api/v3/meta'&&req.method==='GET')return json(res,200,{installed_version:'0.1.0'});
 if(p==='/api/v3/user'&&req.method==='GET')return json(res,200,{login:owner,id:1});
 if(p==='/api/v3/user/repos'){
  if(req.method==='GET'){const list=[...repos.values()].map(repoObj);const page=Math.max(1,Number(url.searchParams.get('page'))||1),per=Math.min(100,Math.max(1,Number(url.searchParams.get('per_page'))||30));const start=(page-1)*per;const headers={};if(start+per<list.length)headers.Link='<'+url.origin+p+'?page='+(page+1)+'&per_page='+per+'>; rel="next"';return json(res,200,list.slice(start,start+per),headers)}
  if(req.method==='POST'){const b=await body(req);if(typeof b.name!=='string'||!/^[\w.-]+$/.test(b.name))return fail(res,422,'Invalid name');const key=owner+'/'+b.name;if(repos.has(key))return fail(res,422,'Repository exists');const r={id:repos.size+1,name:b.name,owner,description:b.description||'',issues:[],pulls:[],labels:new Set(),files:new Map()};repos.set(key,r);return json(res,201,repoObj(r))}
 }
 const m=/^\/api\/v3\/repos\/([^/]+)\/([^/]+)(?:\/(.*))?$/.exec(p);
 if(m){
 const key=decodeURIComponent(m[1])+'/'+decodeURIComponent(m[2]);const r=repos.get(key);
 if(!r)return fail(res,404,'Not Found');
 const sub=m[3]||'';
 if(!sub){
  if(req.method==='GET')return json(res,200,repoObj(r));
  if(req.method==='PATCH'){const b=await body(req);if(typeof b.description==='string')r.description=b.description;return json(res,200,repoObj(r))}
  if(req.method==='DELETE'){repos.delete(key);return json(res,204,null)}
 }
 if(sub==='labels'&&req.method==='POST'){const b=await body(req);if(!b.name)return fail(res,422,'Name required');r.labels.add(b.name);return json(res,201,{name:b.name})}
 if(sub==='issues'){
  if(req.method==='GET')return json(res,200,r.issues.map(i=>issueObj(r,i)));
  if(req.method==='POST'){const b=await body(req);if(!b.title)return fail(res,422,'Title required');const labels=b.labels||[];if(!Array.isArray(labels)||labels.some(l=>!r.labels.has(typeof l==='string'?l:l.name)))return fail(res,422,'Unknown label');const i={id:r.issues.length+1,number:r.issues.length+1,title:b.title,body:b.body||'',state:'open',labels:labels.map(l=>typeof l==='string'?l:l.name)};r.issues.push(i);return json(res,201,issueObj(r,i))}
 }
 const issue=/^issues\/(\d+)$/.exec(sub);if(issue&&req.method==='GET'){const i=r.issues.find(x=>x.number===Number(issue[1]));return i?json(res,200,issueObj(r,i)):fail(res,404,'Not Found')}
 if(sub==='pulls'&&req.method==='POST'){const b=await body(req);const i={number:r.pulls.length+1,title:b.title||'',head:b.head||'',base:b.base||'main',state:'open',merged:false};r.pulls.push(i);return json(res,201,i)}
 const pull=/^pulls\/(\d+)(?:\/(merge))?$/.exec(sub);if(pull){const i=r.pulls.find(x=>x.number===Number(pull[1]));if(!i)return fail(res,404,'Not Found');if(!pull[2]&&req.method==='GET')return json(res,200,i);if(pull[2]&&req.method==='PUT'){if(i.merged)return fail(res,405,'Already merged');i.merged=true;i.state='closed';return json(res,200,{sha:sha(key+i.number),merged:true,message:'Pull Request successfully merged'})}}
 const content=/^contents\/(.+)$/.exec(sub);if(content){const name=decodeURIComponent(content[1]);const f=r.files.get(name);
  if(req.method==='GET'){return f?json(res,200,{name,path:name,sha:f.sha,content:f.content,encoding:'base64',type:'file'}):fail(res,404,'Not Found')}
  if(req.method==='PUT'){const b=await body(req);if(f&&b.sha!==f.sha)return fail(res,409,'SHA mismatch');if(!f&&b.sha)return fail(res,409,'SHA mismatch');if(typeof b.content!=='string')return fail(res,422,'Content required');const next={content:b.content,sha:sha(Buffer.from(b.content,'base64'))};r.files.set(name,next);return json(res,f?200:201,{content:{name,path:name,sha:next.sha},commit:{sha:sha(key+name+next.sha)}})}
  if(req.method==='DELETE'){if(!f)return fail(res,404,'Not Found');const b=await body(req);if(b.sha!==f.sha)return fail(res,409,'SHA mismatch');r.files.delete(name);return json(res,200,{commit:{sha:sha(key+name+'delete')}})}
 }
 }
 if(p==='/api/graphql'&&req.method==='POST'){const b=await body(req);if(typeof b.query!=='string')return fail(res,400,'Query required');return json(res,200,{data:{viewer:{login:owner}}})}
 if(p==='/mcp'&&req.method==='POST'){const b=await body(req);if(b.method==='initialize')return json(res,200,{jsonrpc:'2.0',id:b.id,result:{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'git-forge',version:'0.1.0'}}});if(b.method==='tools/list')return json(res,200,{jsonrpc:'2.0',id:b.id,result:{tools:[]}});return json(res,200,{jsonrpc:'2.0',id:b.id,error:{code:-32601,message:'Method not found'}})}
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
