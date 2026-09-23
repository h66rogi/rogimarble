'use client';

import Lottie from 'lottie-react';

/** A single silhouette for both resting and moving states, sized to remain legible in OBS. */
export function DefaultPawn({ active = false }: { active?: boolean }) {
  return <span className={`default-pawn ${active ? 'is-moving' : ''}`} role="img" aria-label="공유 말">
    <svg viewBox="0 0 88 112" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="default-pawn-body" x1=".1" y1="0" x2=".9" y2="1">
          <stop stopColor="#7188FF" />
          <stop offset=".48" stopColor="#4260E8" />
          <stop offset="1" stopColor="#2844BC" />
        </linearGradient>
        <linearGradient id="default-pawn-head" x1=".15" y1="0" x2=".85" y2="1">
          <stop stopColor="#9AA9FF" />
          <stop offset=".55" stopColor="#5671F4" />
          <stop offset="1" stopColor="#3550C7" />
        </linearGradient>
      </defs>
      <ellipse cx="44" cy="105" rx="32" ry="5" fill="#18254D" opacity=".22" />
      <g className="default-pawn-figure">
        <path d="M34 50h20c-2 14 3 23 12 34H22c9-11 14-20 12-34Z" fill="url(#default-pawn-body)" stroke="#fff" strokeWidth="7" strokeLinejoin="round" />
        <path d="M34 50h20c-2 14 3 23 12 34H22c9-11 14-20 12-34Z" fill="none" stroke="#202C59" strokeWidth="3.5" strokeLinejoin="round" />
        <path d="M29 66c-2 8-5 12-7 16h44c-2-4-5-8-7-16" fill="none" stroke="#A8B5FF" strokeWidth="3" strokeLinecap="round" opacity=".65" />
        <circle cx="44" cy="31" r="19" fill="url(#default-pawn-head)" stroke="#fff" strokeWidth="7" />
        <circle cx="44" cy="31" r="19" fill="none" stroke="#202C59" strokeWidth="3.5" />
        <path d="M31 30c1-8 6-13 14-14" fill="none" stroke="#DDE4FF" strokeWidth="5" strokeLinecap="round" opacity=".88" />
        <path d="M20 84h48c5 0 9 4 9 9s-4 9-9 9H20c-5 0-9-4-9-9s4-9 9-9Z" fill="#fff" />
        <path d="M20 87h48c4 0 6 2 6 6s-2 6-6 6H20c-4 0-6-2-6-6s2-6 6-6Z" fill="#253B9E" stroke="#202C59" strokeWidth="3" />
        <path d="M20 90h48" stroke="#A5B5FF" strokeWidth="3" strokeLinecap="round" opacity=".8" />
      </g>
    </svg>
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
