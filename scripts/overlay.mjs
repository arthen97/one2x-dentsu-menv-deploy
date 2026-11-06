import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {copyFile,lstat,mkdir,readFile,realpath,writeFile} from 'node:fs/promises';
import path from 'node:path';

const releasePath='release-manifest.json';

function assetPath(value){
  if(typeof value!=='string'||!value||value.includes('\\')||/[\u0000-\u001f\u007f]/.test(value)||path.isAbsolute(value)||/^[a-z][a-z\d+.-]*:/i.test(value))throw Error('Unsafe asset path: '+JSON.stringify(value));
  const parts=value.split('/');
  if(parts.some(part=>!part||part==='.'||part==='..'))throw Error('Unsafe asset path: '+JSON.stringify(value));
  if(parts[0]===releasePath)throw Error(releasePath+' is reserved for generated release metadata');
  return value;
}

function assetRecord(value,label){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error(label+' must be an asset object');
  const name=assetPath(value.path);
  if(!Number.isSafeInteger(value.size)||value.size<0)throw Error(label+' invalid size: '+name);
  if(typeof value.sha256!=='string'||! /^[a-f\d]{64}$/i.test(value.sha256))throw Error(label+' invalid SHA256: '+name);
  if(typeof value.mime!=='string'||!value.mime.trim()||typeof value.type!=='string'||!value.type.trim())throw Error(label+' requires mime and type: '+name);
  return {...value,path:name,sha256:value.sha256.toLowerCase()};
}

function inside(root,filename){
  const relative=path.relative(root,filename);
  return relative!==''&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);
}

async function checkedFile(root,relative,label){
  const filename=path.join(root,...relative.split('/'));
  const info=await lstat(filename);
  if(!info.isFile()||info.isSymbolicLink())throw Error(label+' is not a regular file: '+relative);
  const resolved=await realpath(filename);
  if(!inside(root,resolved))throw Error(label+' escapes its root: '+relative);
  return {filename,size:info.size};
}

async function digest(filename){
  const hash=createHash('sha256');
  for await(const bytes of createReadStream(filename))hash.update(bytes);
  return hash.digest('hex');
}

async function verifyFile(root,asset,label){
  const file=await checkedFile(root,asset.path,label);
  if(file.size!==asset.size)throw Error(label+' size mismatch: '+asset.path+' (expected '+asset.size+', got '+file.size+')');
  if(await digest(file.filename)!==asset.sha256)throw Error(label+' SHA256 mismatch: '+asset.path);
  return file.filename;
}

/** Apply a verified optional overlay to an already restored site. No source/network access. */
export async function applyOverlay({root,dist,manifest,baseContentCommit,baseContentTree}){
  if(!Array.isArray(manifest?.assets))throw Error('Base manifest must contain assets');
  const base=new Map();
  for(const value of manifest.assets){
    const asset=assetRecord(value,'Base asset');
    if(base.has(asset.path))throw Error('Duplicate base asset path: '+asset.path);
    base.set(asset.path,asset);
  }
  let overlay;
  const overlayManifestPath=path.join(root,'overlay-manifest.json');
  try{overlay=JSON.parse(await readFile(overlayManifestPath,'utf8'))}
  catch(error){if(error.code!=='ENOENT')throw error}
  const replacements=[];
  if(overlay!==undefined){
    if(!overlay||overlay.schemaVersion!==1||!Array.isArray(overlay.assets))throw Error('Overlay manifest requires schemaVersion 1 and an assets array');
    const seen=new Set();
    for(const value of overlay.assets){
      const asset=assetRecord(value,'Overlay asset');
      if(seen.has(asset.path))throw Error('Duplicate overlay asset path: '+asset.path);
      seen.add(asset.path);
      replacements.push(asset);
    }
  }
  const distRoot=await realpath(dist);
  const overlayRoot=replacements.length?await realpath(path.join(root,'overlay')):null;
  // Preflight the entire overlay before making any mutations to the restored site.
  const verified=[];
  for(const asset of replacements)verified.push({asset,source:await verifyFile(overlayRoot,asset,'Overlay source')});
  for(const {asset,source} of verified){
    const destination=path.join(distRoot,...asset.path.split('/'));
    await mkdir(path.dirname(destination),{recursive:true});
    const parent=await realpath(path.dirname(destination));
    if(parent!==distRoot&&!inside(distRoot,parent))throw Error('Overlay destination escapes dist: '+asset.path);
    try{
      const current=await lstat(destination);
      if(!current.isFile()||current.isSymbolicLink())throw Error('Overlay destination is not a regular file: '+asset.path);
    }catch(error){if(error.code!=='ENOENT')throw error}
    await copyFile(source,destination);
    base.set(asset.path,asset);
  }
  const assets=[...base.values()];
  // Retain every logical base asset and validate every final byte, including untouched media.
  for(const asset of assets)await verifyFile(distRoot,asset,'Final asset');
  const release={schemaVersion:1,baseContentCommit,baseContentTree,overlayCount:replacements.length,assetCount:assets.length,assets};
  await writeFile(path.join(distRoot,releasePath),JSON.stringify(release,null,2)+'\n');
  return release;
}
