export interface LottieAssetManifestEntry {
  readonly id: string;
  readonly kind: 'lottie';
  readonly source: 'first-party';
  readonly usage: 'token';
}

export interface AtlasImageAssetManifestEntry {
  readonly id: string;
  readonly kind: 'atlas-image';
  readonly source: 'first-party';
  readonly usage: 'cell-art';
  readonly path: '/artwork/jurumarble-party-atlas.png' | '/artwork/jurumarble-mission-atlas.png';
  readonly atlas: {
    /** Zero-based tile coordinates, not pixel coordinates. */
    readonly x: number;
    readonly y: number;
    readonly columns: 3;
    readonly rows: 2;
    readonly width: 1536;
    readonly height: 1024;
    readonly tileWidth: 512;
    readonly tileHeight: 512;
  };
}

export type AssetManifestEntry = LottieAssetManifestEntry | AtlasImageAssetManifestEntry;

const atlas = (id:string,path:AtlasImageAssetManifestEntry['path'],x:number,y:number):AtlasImageAssetManifestEntry => ({
  id,kind:'atlas-image',source:'first-party',usage:'cell-art',path,
  atlas:{x,y,columns:3,rows:2,width:1536,height:1024,tileWidth:512,tileHeight:512},
});

export const assetManifest: readonly AssetManifestEntry[] = [
  { id: 'token-bounce-v1', kind: 'lottie', source: 'first-party', usage: 'token' },
  atlas('party-toast-v1','/artwork/jurumarble-party-atlas.png',0,0),
  atlas('party-island-v1','/artwork/jurumarble-party-atlas.png',1,0),
  atlas('party-travel-v1','/artwork/jurumarble-party-atlas.png',2,0),
  atlas('party-heart-v1','/artwork/jurumarble-party-atlas.png',0,1),
  atlas('party-music-v1','/artwork/jurumarble-party-atlas.png',1,1),
  atlas('party-shield-v1','/artwork/jurumarble-party-atlas.png',2,1),
  atlas('party-snack-v1','/artwork/jurumarble-mission-atlas.png',0,0),
  atlas('party-kiss-v1','/artwork/jurumarble-mission-atlas.png',1,0),
  atlas('party-punch-v1','/artwork/jurumarble-mission-atlas.png',2,0),
  atlas('party-talk-v1','/artwork/jurumarble-mission-atlas.png',0,1),
  atlas('party-turn-v1','/artwork/jurumarble-mission-atlas.png',1,1),
  atlas('party-bank-v1','/artwork/jurumarble-mission-atlas.png',2,1),
];

export const knownAssetIds: readonly string[] = assetManifest.map(({id})=>id);
export const assetManifestById: ReadonlyMap<string,AssetManifestEntry> = new Map(assetManifest.map(entry=>[entry.id,entry]));
