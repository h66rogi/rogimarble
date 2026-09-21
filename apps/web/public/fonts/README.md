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
