# Showcase assets

The Lite landing uses the selected second visual concept with a grayscale
palette. Its decorative assets do not supply financial evidence.

## Paper sculpture

- File: `paper-sculpture.webp`.
- Dimensions: 1400 × 1004 pixels; 124,226 bytes.
- Origin: an original image generated for Prispect from the selected grayscale
  concept, showing five curled report-paper sheets on a transparent background.
- Processing: cropped to the alpha bounds with small padding, converted to
  neutral grayscale, resized and encoded as WebP while preserving transparency.
- Use: decorative hero imagery only. Its indistinct print and chart marks are
  illustration, not company records, financial values or source excerpts.

## Display font

- File: `display.woff`; 23,044 bytes.
- Source: Noto Sans CJK SC Bold, face 2 of the installed
  `/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc` collection.
- Upstream: <https://github.com/notofonts/noto-cjk>.
- Derivation: fontTools subset containing the landing and menu headline
  characters and Latin characters; converted to WOFF 1. The modified family is
  `Prispect Display`, and its PostScript name is `PrispectDisplay-Bold`.
- License: SIL Open Font License 1.1, retained in
  [FONT-LICENSE.txt](FONT-LICENSE.txt). The upstream Adobe copyright embedded in
  the source font remains in the subset; the accompanying notice also retains
  the Google attribution from the installed package's font copyright record.

## Original report excerpts

The Lite page shares the same unchanged original-report table crops as the
existing landing page. Their issuer, annual scope, PDF source, hash, crop
coordinates and rights are recorded in
[the landing source record](../landing/SOURCES.md). These are historical source
excerpts and remain distinct from the decorative paper sculpture.
