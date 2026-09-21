# NanumSquare Neo

Unmodified static WOFF2 files supplied by NAVER. SIL Open Font License 1.1; see [OFL.txt](OFL.txt).

- Official distribution: https://campaign.naver.com/nanumsquare_neo/
- Archive: https://campaign.naver.com/nanumsquare_neo/download/NaverNanumSquareNeo.zip
- License: https://help.naver.com/service/11029/contents/18088?lang=ko&osType=PC

| Weight | Original file | SHA-256 |
| --- | --- | --- |
| 300 | `NanumSquareNeoTTF-aLt.woff2` | `f0da0f2329935d3f88f7e4162b68fcdc0be393f74398736ea0967594282ca4e2` |
| 400 | `NanumSquareNeoTTF-bRg.woff2` | `d13846b612acc829078aff4f91c272c637c08441b409d46bb1a4c802eb2967c3` |
| 700 | `NanumSquareNeoTTF-cBd.woff2` | `97dfe9720fbed813fc988fcedbcf741e97eef9353515b2043717484ec0b90aa1` |
| 800 | `NanumSquareNeoTTF-dEb.woff2` | `f27c0741248dba9a543520ff27eb32f9433de3ca50ac7ba4ccb5f5ede673c535` |
| 900 | `NanumSquareNeoTTF-eHv.woff2` | `090b017020c0b5a8fd517460c5dfdf33819b726e1c860313c75bf0624162242d` |

No conversion, renaming or subsetting was performed. The license applies to the font files, not to this application.

## Registration

`app/fonts.ts` registers these five static faces once through `next/font/local`.
Next.js generates font-face rules, asset URLs and preloads. The shared `--font-sans`
token connects console controls, headers, board and OBS HUD to that registration.
Do not add a separate manual font-face, preload or screen-specific font family.

The old variable WOFF2 remains available for previously cached documents but is not
used by the current registration. On Windows Chrome, that original variable file
failed with `OTS parsing error: Unable to instantiate font face from font data` and
rendered system Malgun Gothic instead. The same file worked in Linux Chromium,
so Linux font-loading checks alone did not cover this failure.

Context7 documentation used for the static `src` array with per-file weights:
- https://nextjs.org/docs/app/api-reference/components/font
- https://tailwindcss.com/docs/theme#referencing-other-variables

## Board display fonts

The unmodified static TTF files below come from the official Google Fonts repository.
Each family is registered once in `app/fonts.ts` with `next/font/local` and exposed as
a CSS variable on the root layout. They are used only when a board font is selected;
the console remains on NanumSquare Neo.

| Family | Official source | Local file | SHA-256 | License |
| --- | --- | --- | --- | --- |
| Jua | https://github.com/google/fonts/tree/main/ofl/jua | `google/Jua-Regular.ttf` | `769677aef240bfc3b9965f2b50748075bff885e6c6992fc591a3fb268279f898` | `google/OFL-Jua.txt` |
| Do Hyeon | https://github.com/google/fonts/tree/main/ofl/dohyeon | `google/DoHyeon-Regular.ttf` | `35644be7f28e0a68a447b1f7af351dcde5674b870f24f7b5f43e26d00b4ab653` | `google/OFL-DoHyeon.txt` |
| Black Han Sans | https://github.com/google/fonts/tree/main/ofl/blackhansans | `google/BlackHanSans-Regular.ttf` | `31960809284026681774a8e52dc19ebcad26cf69b0ad9d560f288296fbb52739` | `google/OFL-BlackHanSans.txt` |

No conversion, subsetting, or font-file modification was performed. The separate OFL
copies are retained because the copyright lines differ by family. Context7's Next.js
16 font documentation was used for the local font registration and root CSS variables:
https://nextjs.org/docs/app/api-reference/components/font
