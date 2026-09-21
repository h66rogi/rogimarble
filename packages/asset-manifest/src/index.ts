export interface AssetManifestEntry {
  readonly id: string;
  readonly kind: 'lottie';
  readonly source: 'first-party';
  readonly usage: 'token';
}

export const assetManifest: readonly AssetManifestEntry[] = [
  { id: 'token-bounce-v1', kind: 'lottie', source: 'first-party', usage: 'token' },
];
