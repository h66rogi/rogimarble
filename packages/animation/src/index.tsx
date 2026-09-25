'use client';

import Lottie from 'lottie-react';
import type { PawnStyleId } from '@rogimarble/contracts';

export const PAWN_ARTWORK_URL: Record<PawnStyleId, string> = {
  'star-medal': '/artwork/pawn-star-medal.webp',
  'heart-chip': '/artwork/pawn-heart-chip.webp',
  'bunny-face': '/artwork/pawn-bunny-face.webp',
};

/** The same first-party artwork is used by the picker and live board. */
export function DefaultPawn({ active = false, styleId = 'star-medal' }: { active?: boolean; styleId?: PawnStyleId }) {
  return <span className={`default-pawn ${active ? 'is-moving' : ''}`} role="img" aria-label="공유 말">
    <img src={PAWN_ARTWORK_URL[styleId]} alt="" draggable={false} />
  </span>;
}

const landingSpark = {
  v: '5.12.2', fr: 30, ip: 0, op: 22, w: 120, h: 120, nm: 'rogimarble-landing-spark', ddd: 0, assets: [],
  layers: [{ ddd: 0, ind: 1, ty: 4, nm: 'landing-ring', sr: 1, ks: {
    o: { a: 1, k: [{ t: 0, s: [100], e: [100], i: { x: .67, y: 1 }, o: { x: .33, y: 0 } }, { t: 12, s: [100], e: [0], i: { x: .67, y: 1 }, o: { x: .33, y: 0 } }, { t: 21, s: [0], i: { x: .67, y: 1 }, o: { x: .33, y: 0 } }] },
    r: { a: 0, k: 0 }, p: { a: 0, k: [60, 60, 0] }, a: { a: 0, k: [0, 0, 0] },
    s: { a: 1, k: [{ t: 0, s: [35, 35, 100], e: [140, 140, 100], i: { x: .67, y: 1 }, o: { x: .33, y: 0 } }, { t: 21, s: [140, 140, 100], i: { x: .67, y: 1 }, o: { x: .33, y: 0 } }] }
  }, shapes: [{ ty: 'gr', nm: 'spark', it: [
    { ty: 'el', d: 1, p: { a: 0, k: [0, 0] }, s: { a: 0, k: [64, 64] }, nm: 'ring' },
    { ty: 'st', c: { a: 0, k: [.98, .3, .57, 1] }, o: { a: 0, k: 100 }, w: { a: 0, k: 5 }, lc: 2, lj: 2, nm: 'stroke' },
    { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 }, nm: 'transform' }
  ] }], ip: 0, op: 22, st: 0, bm: 0 }]
};

export function LandingLottie({ active, reducedMotion = false }: { active: boolean; reducedMotion?: boolean }) {
  if (!active || reducedMotion) return null;
  return <Lottie className="landing-lottie" animationData={landingSpark} autoplay loop={false} aria-hidden="true" />;
}
