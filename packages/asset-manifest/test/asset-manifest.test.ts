import assert from 'node:assert/strict';
import test from 'node:test';
import { assetManifest, assetManifestById, knownAssetIds } from '../src/index.ts';

test('generated cell-art atlases expose twelve unique, complete tile coordinates',()=>{
  assert.equal(new Set(knownAssetIds).size,knownAssetIds.length);
  assert.equal(assetManifestById.size,assetManifest.length);
  const images=assetManifest.filter(entry=>entry.kind==='atlas-image');
  assert.equal(images.length,12);
  for(const path of ['/artwork/jurumarble-party-atlas.png','/artwork/jurumarble-mission-atlas.png'] as const){
    const entries=images.filter(entry=>entry.path===path);
    assert.equal(entries.length,6);
    assert.deepEqual(entries.map(entry=>[entry.atlas.x,entry.atlas.y]),[[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]]);
    for(const entry of entries)assert.deepEqual([entry.atlas.width,entry.atlas.height,entry.atlas.tileWidth,entry.atlas.tileHeight],[1536,1024,512,512]);
  }
});
