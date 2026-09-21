import localFont from 'next/font/local';

export const nanumSquareNeo = localFont({
  src: [
    { path: '../public/fonts/NanumSquareNeoTTF-aLt.woff2', weight: '300', style: 'normal' },
    { path: '../public/fonts/NanumSquareNeoTTF-bRg.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/NanumSquareNeoTTF-cBd.woff2', weight: '700', style: 'normal' },
    { path: '../public/fonts/NanumSquareNeoTTF-dEb.woff2', weight: '800', style: 'normal' },
    { path: '../public/fonts/NanumSquareNeoTTF-eHv.woff2', weight: '900', style: 'normal' },
  ],
  variable: '--font-nanum-square-neo',
  style: 'normal',
  display: 'swap',
  preload: true,
  adjustFontFallback: false,
  fallback: ['system-ui', 'sans-serif'],
});

export const jua = localFont({
  src: '../public/fonts/google/Jua-Regular.ttf',
  variable: '--font-jua',
  weight: '400',
  style: 'normal',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  fallback: ['system-ui', 'sans-serif'],
});

export const doHyeon = localFont({
  src: '../public/fonts/google/DoHyeon-Regular.ttf',
  variable: '--font-do-hyeon',
  weight: '400',
  style: 'normal',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  fallback: ['system-ui', 'sans-serif'],
});

export const blackHanSans = localFont({
  src: '../public/fonts/google/BlackHanSans-Regular.ttf',
  variable: '--font-black-han-sans',
  weight: '400',
  style: 'normal',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  fallback: ['system-ui', 'sans-serif'],
});
