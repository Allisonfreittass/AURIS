/**
 * Build the platform-specific icon files from the single source SVG.
 *
 * Inputs:
 *   resources/icon.svg
 *
 * Outputs:
 *   resources/icon.ico         — Windows ICO bundle (16/24/32/48/64/128/256)
 *   resources/icon.png         — 512×512 PNG (Linux/macOS + dev BrowserWindow)
 *   landing/favicon.svg        — copied for the landing-page tab
 *   landing/favicon-32.png     — 32×32 PNG fallback for older browsers
 *   landing/apple-touch-icon.png — 180×180 for iOS bookmarks
 *
 * Run once, or whenever resources/icon.svg changes:
 *   npm run build:icons
 */
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const resources = path.join(root, 'resources');
const landing = path.join(root, 'landing');

// Sizes embedded in the .ico (Windows picks the right one per context).
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

async function rasterize(svg, size) {
  return sharp(svg).resize(size, size).png().toBuffer();
}

async function main() {
  const svgPath = path.join(resources, 'icon.svg');
  const svg = await readFile(svgPath);
  await mkdir(landing, { recursive: true });

  // 1. ICO with multi-resolution PNGs inside.
  console.log('[icons] rendering PNGs for ICO...');
  const icoFrames = await Promise.all(ICO_SIZES.map((s) => rasterize(svg, s)));
  const ico = await pngToIco(icoFrames);
  const icoPath = path.join(resources, 'icon.ico');
  await writeFile(icoPath, ico);
  console.log(`[icons] ✓ ${path.relative(root, icoPath)} (${ico.length.toLocaleString()} bytes)`);

  // 2. 512×512 PNG (used by BrowserWindow and electron-builder fallback).
  console.log('[icons] rendering 512×512 PNG...');
  const png512 = await rasterize(svg, 512);
  const png512Path = path.join(resources, 'icon.png');
  await writeFile(png512Path, png512);
  console.log(`[icons] ✓ ${path.relative(root, png512Path)} (${png512.length.toLocaleString()} bytes)`);

  // 3. Landing-page favicons.
  console.log('[icons] writing landing favicons...');
  await copyFile(svgPath, path.join(landing, 'favicon.svg'));

  const fav32 = await rasterize(svg, 32);
  await writeFile(path.join(landing, 'favicon-32.png'), fav32);

  const apple = await rasterize(svg, 180);
  await writeFile(path.join(landing, 'apple-touch-icon.png'), apple);

  console.log('[icons] ✓ landing/{favicon.svg, favicon-32.png, apple-touch-icon.png}');
  console.log('[icons] done.');
}

main().catch((err) => {
  console.error('[icons] failed:', err);
  process.exit(1);
});
