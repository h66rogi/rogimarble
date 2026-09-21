'use client';

import Lottie from 'lottie-react';
import { useEffect, useState } from 'react';

const tokenBounce = {
  v: '5.12.2', fr: 30, ip: 0, op: 30, w: 120, h: 120, nm: 'token-bounce', ddd: 0,
  assets: [],
  layers: [{ ddd: 0, ind: 1, ty: 4, nm: 'token', sr: 1,
    ks: {
      o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] },
      p: { a: 1, k: [
        { t: 0, s: [60, 68, 0], e: [60, 45, 0], i: { x: .42, y: 1 }, o: { x: .32, y: 0 } },
        { t: 14, s: [60, 45, 0], e: [60, 68, 0], i: { x: .68, y: 1 }, o: { x: .58, y: 0 } },
        { t: 29, s: [60, 68, 0] }
      ] }
    },
    shapes: [{ ty: 'gr', nm: 'token-body', it: [
      { ty: 'el', d: 1, p: { a: 0, k: [0, 0] }, s: { a: 0, k: [44, 44] }, nm: 'body' },
      { ty: 'fl', c: { a: 0, k: [.98, .28, .55, 1] }, o: { a: 0, k: 100 }, r: 1, nm: 'fill' },
      { ty: 'st', c: { a: 0, k: [.36, .12, .27, 1] }, o: { a: 0, k: 100 }, w: { a: 0, k: 4 }, lc: 2, lj: 2, nm: 'stroke' },
      { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 }, nm: 'transform' }
    ] }], ip: 0, op: 30, st: 0, bm: 0 }]
};

export function TokenLottie({ active = false }: { active?: boolean }) {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => { const query = matchMedia('(prefers-reduced-motion: reduce)'); const sync = () => setReduceMotion(query.matches); sync(); query.addEventListener('change', sync); return () => query.removeEventListener('change', sync); }, []);
  return <div className={`token-animation ${active && !reduceMotion ? 'is-moving' : ''}`} aria-label="공유 말">
    <span className="token-static" aria-hidden="true" />
    <Lottie key={active && !reduceMotion ? 'moving' : 'idle'} className="token-lottie" animationData={tokenBounce} autoplay={active && !reduceMotion} loop={active && !reduceMotion} />
  </div>;
}
