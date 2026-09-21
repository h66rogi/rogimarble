// pdfjs-dist 의 cmaps / standard_fonts / wasm 폴더를 public/_pdfjs/ 로 복사한다.
//
// pdfjs v4+ 는 PDF 콘텐츠에 따라 외부 데이터를 동적으로 fetch 한다:
//  - standard_fonts: PDF 14개 Type1 standard font (Helvetica/Times/Courier 계열)
//    참조 PDF
//  - cmaps: CJK / 다국어 charset PDF
//  - wasm: JBig2 / OpenJPEG 압축 이미지 포함 PDF
//
// 폴더 단위 동적 fetch 라 `import.meta.url + new URL(...)` 패턴으로는 webpack 이
// 번들에 자동 포함시키지 못한다. build 직전에 정적 자산으로 public/ 에 복사하고
// 절대 경로 (`/_pdfjs/cmaps/`) 로 PdfViewer 가 참조하게 만든다.
//
// dev / build / pnpm install 모두에서 자동 실행되도록 scripts.{dev,build,postinstall}
// 에서 호출.
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const sourceRoot = resolve(repoRoot, 'node_modules/pdfjs-dist');
const targetRoot = resolve(repoRoot, 'public/_pdfjs');

const folders = ['cmaps', 'standard_fonts', 'wasm'];

if (!existsSync(sourceRoot)) {
  console.error(
    '[copy-pdfjs-assets] node_modules/pdfjs-dist not found — install dependencies first.',
  );
  process.exit(1);
}

mkdirSync(targetRoot, { recursive: true });

for (const folder of folders) {
  const src = resolve(sourceRoot, folder);
  const dst = resolve(targetRoot, folder);
  if (!existsSync(src)) {
    console.warn(`[copy-pdfjs-assets] missing source: ${src} (skipped)`);
    continue;
  }
  cpSync(src, dst, { recursive: true, force: true });
  console.log(`[copy-pdfjs-assets] ${folder}/ → public/_pdfjs/${folder}/`);
}

console.log('[copy-pdfjs-assets] done');
