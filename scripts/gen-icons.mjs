/**
 * Regenerate the PNG icons from public/icon.svg.
 *
 * Modern browsers happily use the SVG favicon directly, but iOS Safari
 * needs apple-touch-icon.png for "Add to Home Screen" and Android Chrome
 * prefers rasterized PNGs in the manifest so it doesn't have to render the
 * SVG at install time. This script renders all three PNG sizes from the
 * single SVG source so the icon set always stays in sync.
 *
 * Run with: `node scripts/gen-icons.mjs`
 * Requires: devDependency `@resvg/resvg-js`.
 */

import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const svgPath = resolve(repoRoot, 'public', 'icon.svg');
const svg = readFileSync(svgPath, 'utf8');

const TARGETS = [
  { name: 'pwa-192.png', size: 192 },
  { name: 'pwa-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'favicon-32.png', size: 32 },
];

for (const { name, size } of TARGETS) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
  const png = resvg.render().asPng();
  const out = resolve(repoRoot, 'public', name);
  writeFileSync(out, png);
  console.log(`wrote public/${name} (${size}×${size}, ${png.byteLength} bytes)`);
}
