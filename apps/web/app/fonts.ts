import localFont from 'next/font/local';

export const nanumSquareNeo = localFont({
  src: '../public/fonts/NanumSquareNeo-Variable.woff2',
  variable: '--font-nanum-square-neo',
  weight: '300 900',
  style: 'normal',
  display: 'swap',
  preload: true,
  adjustFontFallback: false,
  fallback: ['system-ui', 'sans-serif'],
});
