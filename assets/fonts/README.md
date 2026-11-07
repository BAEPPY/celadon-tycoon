# Jua

Jua Regular by Woowahan Brothers, distributed under the SIL Open Font License 1.1.

Source: https://github.com/google/fonts/tree/main/ofl/jua

`Jua-Regular.ttf` is the original font. `Jua-Regular.woff2` is a format conversion for local web delivery. The license is preserved in `OFL-Jua.txt`. Self-hosting keeps the game typography available on school networks without depending on the Google Fonts endpoint.

# UnGungseo book title

The old book's title uses Koaunghi Un's **UnGungseo (은 궁서)**, obtained from the official Debian `fonts-unfonts-core_1.0.2-080608-23_all.deb` package:
https://deb.debian.org/debian/pool/main/f/fonts-unfonts-core/fonts-unfonts-core_1.0.2-080608-23_all.deb

The unchanged source is preserved in `source/UnGungseo.ttf`; copyright and GPL-2 are provided in `UnGungseo-COPYRIGHT.txt` and `UnGungseo-GPL-2.txt`. `UnGungseo-BookTitle.woff2` is a local web subset containing only `청자 도감` (2.8 KB). It was generated with FontTools:

```
pyftsubset source/UnGungseo.ttf --text='청자 도감' --flavor=woff2 --output-file=UnGungseo-BookTitle.woff2 --name-IDs='*' --name-legacy --name-languages='*'
```

The title is accessible DOM text with a subtle CSS perspective transform aligned to the generated book's blank top face; no generated spelling or external font request is used.
