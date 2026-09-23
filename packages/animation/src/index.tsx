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

const diceBurst = {
  v: '5.12.2', fr: 30, ip: 0, op: 24, w: 180, h: 90, nm: 'rogimarble-dice-burst', ddd: 0, assets: [],
  layers: [{ ddd: 0, ind: 1, ty: 4, nm: 'dice-burst', sr: 1, ks: {
    o: { a: 1, k: [{ t: 0, s: [0], e: [100], i: { x: .67, y: 1 }, o: { x: .33, y: 0 } }, { t: 6, s: [100], e: [100], i: { x: .67, y: 1 }, o: { x: .33, y: 0 } }, { t: 20, s: [100], e: [0], i: { x: .67, y: 1 }, o: { x: .33, y: 0 } }, { t: 23, s: [0], i: { x: .67, y: 1 }, o: { x: .33, y: 0 } }] },
    r: { a: 1, k: [{ t: 0, s: [-18], e: [18], i: { x: .67, y: 1 }, o: { x: .33, y: 0 } }, { t: 12, s: [18], e: [0], i: { x: .67, y: 1 }, o: { x: .33, y: 0 } }, { t: 23, s: [0], i: { x: .67, y: 1 }, o: { x: .33, y: 0 } }] },
    p: { a: 0, k: [90, 45, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 1, k: [{ t: 0, s: [55, 55, 100], e: [112, 112, 100], i: { x: .67, y: 1 }, o: { x: .33, y: 0 } }, { t: 12, s: [112, 112, 100], e: [100, 100, 100], i: { x: .67, y: 1 }, o: { x: .33, y: 0 } }, { t: 23, s: [100, 100, 100], i: { x: .67, y: 1 }, o: { x: .33, y: 0 } }] }
  }, shapes: [{ ty: 'gr', nm: 'burst-ring', it: [
    { ty: 'el', d: 1, p: { a: 0, k: [0, 0] }, s: { a: 0, k: [106, 52] }, nm: 'ring' },
    { ty: 'st', c: { a: 0, k: [.98, .3, .57, 1] }, o: { a: 0, k: 72 }, w: { a: 0, k: 5 }, lc: 2, lj: 2, nm: 'stroke' },
    { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 }, nm: 'transform' }
  ] },
  { ty: 'gr', nm: 'decorative-die-left', it: [
    { ty: 'rc', d: 1, p: { a: 0, k: [0, 0] }, s: { a: 0, k: [42, 42] }, r: { a: 0, k: 8 }, nm: 'cube' },
    { ty: 'fl', c: { a: 0, k: [.98, .3, .57, 1] }, o: { a: 0, k: 100 }, r: 1, nm: 'cube-fill' },
    { ty: 'st', c: { a: 0, k: [.49, .16, .31, 1] }, o: { a: 0, k: 100 }, w: { a: 0, k: 3 }, lc: 2, lj: 2, nm: 'cube-stroke' },
    { ty: 'el', d: 1, p: { a: 0, k: [-10, -10] }, s: { a: 0, k: [7, 7] }, nm: 'pip-1' },
    { ty: 'el', d: 1, p: { a: 0, k: [10, 10] }, s: { a: 0, k: [7, 7] }, nm: 'pip-2' },
    { ty: 'fl', c: { a: 0, k: [1, 1, 1, 1] }, o: { a: 0, k: 100 }, r: 1, nm: 'pip-fill' },
    { ty: 'tr', p: { a: 1, k: [{ t: 0, s: [-38, 18], e: [-25, -12], i: { x: .67, y: 1 }, o: { x: .33, y: 0 } }, { t: 11, s: [-25, -12], e: [-27, 4], i: { x: .67, y: 1 }, o: { x: .33, y: 0 } }, { t: 23, s: [-27, 4] }] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 1, k: [{ t: 0, s: [-28], e: [24], i: { x: .67, y: 1 }, o: { x: .33, y: 0 } }, { t: 11, s: [24], e: [4], i: { x: .67, y: 1 }, o: { x: .33, y: 0 } }, { t: 23, s: [4] }] }, o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 }, nm: 'transform' }
  ] },
  { ty: 'gr', nm: 'decorative-die-right', it: [
    { ty: 'rc', d: 1, p: { a: 0, k: [0, 0] }, s: { a: 0, k: [42, 42] }, r: { a: 0, k: 8 }, nm: 'cube' },
    { ty: 'fl', c: { a: 0, k: [.98, .3, .57, 1] }, o: { a: 0, k: 100 }, r: 1, nm: 'cube-fill' },
    { ty: 'st', c: { a: 0, k: [.49, .16, .31, 1] }, o: { a: 0, k: 100 }, w: { a: 0, k: 3 }, lc: 2, lj: 2, nm: 'cube-stroke' },
    { ty: 'el', d: 1, p: { a: 0, k: [-10, -10] }, s: { a: 0, k: [6, 6] }, nm: 'pip-1' },
    { ty: 'el', d: 1, p: { a: 0, k: [10, -10] }, s: { a: 0, k: [6, 6] }, nm: 'pip-2' },
    { ty: 'el', d: 1, p: { a: 0, k: [0, 0] }, s: { a: 0, k: [6, 6] }, nm: 'pip-3' },
    { ty: 'el', d: 1, p: { a: 0, k: [-10, 10] }, s: { a: 0, k: [6, 6] }, nm: 'pip-4' },
    { ty: 'el', d: 1, p: { a: 0, k: [10, 10] }, s: { a: 0, k: [6, 6] }, nm: 'pip-5' },
    { ty: 'fl', c: { a: 0, k: [1, 1, 1, 1] }, o: { a: 0, k: 100 }, r: 1, nm: 'pip-fill' },
    { ty: 'tr', p: { a: 1, k: [{ t: 0, s: [38, 18], e: [25, -15], i: { x: .67, y: 1 }, o: { x: .33, y: 0 } }, { t: 11, s: [25, -15], e: [27, 4], i: { x: .67, y: 1 }, o: { x: .33, y: 0 } }, { t: 23, s: [27, 4] }] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 1, k: [{ t: 0, s: [30], e: [-26], i: { x: .67, y: 1 }, o: { x: .33, y: 0 } }, { t: 11, s: [-26], e: [-5], i: { x: .67, y: 1 }, o: { x: .33, y: 0 } }, { t: 23, s: [-5] }] }, o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 }, nm: 'transform' }
  ] }], ip: 0, op: 24, st: 0, bm: 0 }]
};

const singleDiceBurst = (() => {
  const copy = structuredClone(diceBurst) as any;
  copy.layers[0].shapes = copy.layers[0].shapes.filter((shape: { nm?: string }) => shape.nm !== 'decorative-die-right');
  const die = copy.layers[0].shapes.find((shape: { nm?: string }) => shape.nm === 'decorative-die-left');
  const position = die?.it?.find((item: { ty?: string }) => item.ty === 'tr')?.p?.k;
  if (Array.isArray(position)) for (const frame of position) {
    if (Array.isArray(frame.s)) frame.s[0] += 32;
    if (Array.isArray(frame.e)) frame.e[0] += 32;
  }
  return copy;
})();

export function DiceLottie({ active, reducedMotion = false, count = 1 }: { active: boolean; reducedMotion?: boolean; count?: number }) {
  if (!active || reducedMotion) return null;
  return <Lottie className="dice-lottie" animationData={count > 1 ? diceBurst : singleDiceBurst} autoplay loop={false} aria-hidden="true" />;
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
