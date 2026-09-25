# Bundled fonts

Font files in this directory are distributed under their own SIL Open Font License 1.1 notices. The font licenses apply to the fonts, not to the application source code.

## NanumSquare Neo

The static WOFF2 files are unmodified NAVER distributions. See [OFL.txt](OFL.txt) and the [official distribution](https://campaign.naver.com/nanumsquare_neo/).

| Weight | File | SHA-256 |
| --- | --- | --- |
| 300 | `NanumSquareNeoTTF-aLt.woff2` | `f0da0f2329935d3f88f7e4162b68fcdc0be393f74398736ea0967594282ca4e2` |
| 400 | `NanumSquareNeoTTF-bRg.woff2` | `d13846b612acc829078aff4f91c272c637c08441b409d46bb1a4c802eb2967c3` |
| 700 | `NanumSquareNeoTTF-cBd.woff2` | `97dfe9720fbed813fc988fcedbcf741e97eef9353515b2043717484ec0b90aa1` |
| 800 | `NanumSquareNeoTTF-dEb.woff2` | `f27c0741248dba9a543520ff27eb32f9433de3ca50ac7ba4ccb5f5ede673c535` |
| 900 | `NanumSquareNeoTTF-eHv.woff2` | `090b017020c0b5a8fd517460c5dfdf33819b726e1c860313c75bf0624162242d` |

`app/fonts.ts` registers the static faces with `next/font/local`. The console uses the shared `--font-sans` token. `NanumSquareNeo-Variable.woff2` is retained for compatibility with previously cached assets and is not registered by the application.

## Board display fonts

The unmodified TTF files below come from the [Google Fonts repository](https://github.com/google/fonts). Each family is registered in `app/fonts.ts` and selected through the board font setting. The separate OFL copies retain each family's copyright notice.

| Family | File | SHA-256 | License |
| --- | --- | --- | --- |
| Jua | `google/Jua-Regular.ttf` | `769677aef240bfc3b9965f2b50748075bff885e6c6992fc591a3fb268279f898` | `google/OFL-Jua.txt` |
| Do Hyeon | `google/DoHyeon-Regular.ttf` | `35644be7f28e0a68a447b1f7af351dcde5674b870f24f7b5f43e26d00b4ab653` | `google/OFL-DoHyeon.txt` |
| Black Han Sans | `google/BlackHanSans-Regular.ttf` | `31960809284026681774a8e52dc19ebcad26cf69b0ad9d560f288296fbb52739` | `google/OFL-BlackHanSans.txt` |
