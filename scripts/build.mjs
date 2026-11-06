import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,mkdtemp,readFile,rename,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {applyOverlay} from './overlay.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const commit='130eda427a9edceef22e7e5377ce2f9d924edc7b';
const tree='b4a46519f87bac08368daad1114ea527bdd7892f';
const sourceURL='https://codeload.github.com/arthen97/one2x-dentsu-film-report/tar.gz/'+commit;
const expectedManifest='cf39d858123259427b55b28839dcd5419c3dff77caf36a3ef70fac41d6e5832d';
const localArchive=process.env.ONE2X_SOURCE_ARCHIVE;
const work=await mkdtemp(path.join(root,'.one2x-work-'));
const source=path.join(work,'source');
const dist=path.join(root,'dist');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function extract(stream,strip){
  const child=spawn('tar',['-xz','-C',source,'--strip-components='+strip],{stdio:['pipe','ignore','pipe']});
  let stderr='';
  child.stderr.on('data',b=>{stderr=(stderr+b.toString()).slice(-8192)});
  const done=new Promise((resolve,reject)=>{
    child.once('error',reject);
    child.once('close',(code,signal)=>code===0?resolve():reject(Error('tar failed ('+(signal||code)+'): '+stderr)));
  });
  try{await Promise.all([pipeline(stream,child.stdin),done])}
  catch(error){child.kill('SIGTERM');await done.catch(()=>{});throw error}
}

async function acquire(){
  const attempts=localArchive?1:2;
  for(let attempt=1;attempt<=attempts;attempt++){
    await rm(source,{recursive:true,force:true});
    await mkdir(source,{recursive:true});
    try{
      if(localArchive){
        const archive=path.resolve(localArchive);
        if(!(await stat(archive)).isFile())throw Error('Local source archive is not a file');
        console.log('[deploy] Reading verified local archive (strip-components=0).');
        await extract(createReadStream(archive),0);
      }else{
        console.log('[deploy] Downloading pinned GitHub source, attempt '+attempt+'/'+attempts+'.');
        const response=await fetch(sourceURL,{redirect:'follow',signal:AbortSignal.timeout(15*60*1000)});
        if(!response.ok||!response.body){
          await response.body?.cancel();
          const error=Error('Source download HTTP '+response.status);
          error.permanent=response.status>=400&&response.status<500;
          throw error;
        }
        let received=0,nextLog=64*1024*1024;
        async function* progress(){for await(const b of Readable.fromWeb(response.body)){received+=b.length;if(received>=nextLog){console.log('[deploy] Source download '+Math.floor(received/1048576)+' MiB');nextLog+=64*1024*1024}yield b}}
        await extract(Readable.from(progress()),1);
        console.log('[deploy] Download/extraction finished: '+received+' compressed bytes.');
      }
      return;
    }catch(error){
      if(attempt===attempts||error.permanent)throw error;
      console.warn('[deploy] Source acquisition failed; retrying: '+error.message);
      await sleep(2000*attempt);
    }
  }
}

async function run(script){
  await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[path.join(source,'scripts',script)],{cwd:source,stdio:'inherit',env:process.env});
    child.once('error',reject);
    child.once('close',(code,signal)=>code===0?resolve():reject(Error(script+' failed ('+(signal||code)+')')));
  });
}

try{
  await acquire();
  const manifestBytes=await readFile(path.join(source,'asset-manifest.json'));
  if(createHash('sha256').update(manifestBytes).digest('hex')!==expectedManifest)throw Error('Pinned source manifest SHA256 mismatch');
  const manifest=JSON.parse(manifestBytes);
  const counts=manifest.assets.reduce((out,a)=>(out[a.type]=(out[a.type]||0)+1,out),{});
  if(manifest.assets.length!==323||counts.video!==45||counts.image!==192||counts.font!==2)throw Error('Pinned source asset counts differ');
  console.log('[deploy] Pinned manifest confirmed. Rebuilding all 323 logical files.');
  await run('build.mjs');
  await run('verify-assets.mjs');
  const release=await applyOverlay({root,dist:path.join(source,'dist'),manifest,baseContentCommit:commit,baseContentTree:tree});
  const finalCounts=release.assets.reduce((out,a)=>(out[a.type]=(out[a.type]||0)+1,out),{});
  for(const type of ['video','image','font'])if((finalCounts[type]||0)<counts[type])throw Error('Overlay would reduce the original '+type+' asset count');
  await rm(dist,{recursive:true,force:true});
  await rename(path.join(source,'dist'),dist);
  console.log(JSON.stringify({deployBuild:'passed',commit,tree,logicalFiles:release.assets.length,counts:finalCounts,overlayCount:release.overlayCount,allLogicalSHA256Verified:true,releaseManifest:'dist/release-manifest.json',output:'dist',localArchiveValidation:Boolean(localArchive)},null,2));
}finally{
  await rm(work,{recursive:true,force:true});
}
