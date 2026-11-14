import test from 'node:test';
import assert from 'node:assert/strict';
import {
  processRgbaBuffer,
  encodeRgbaToBmp,
  encodeRgbaToTiff,
  encodePngToIco,
  extractDominantColors,
} from './imageWorkerEngine';

test('processRgbaBuffer executes Manual BG Eraser, De-noise, DocShadow, Dehaze, Blur, Pixelation, Artistic, Color LUTs & Glitch with progress updates', () => {
  const width = 16;
  const height = 16;
  const src = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < src.length; i += 4) {
    src[i] = 120;
    src[i + 1] = 150;
    src[i + 2] = 200;
    src[i + 3] = 255;
  }

  const toolsToTest = [
    'img-21-manual-bg-eraser',
    'img-24-denoise',
    'img-26-docshadow',
    'img-27-dehaze',
    'img-45-blur-tools',
    'img-46-pixelation',
    'img-47-artistic',
    'img-48-color-correction',
    'img-49-glitch-distortion',
  ];

  for (const toolId of toolsToTest) {
    let lastProgress = 0;
    const out = processRgbaBuffer(src, width, height, toolId, { presetIndex: 42 }, (pct) => {
      lastProgress = pct;
    });
    assert.equal(out.length, src.length, `Output buffer length matches for ${toolId}`);
    assert.equal(lastProgress, 100, `Progress reaches 100% for ${toolId}`);
  }
});

test('encodeRgbaToBmp, encodeRgbaToTiff, and encodePngToIco produce valid binary headers', () => {
  const rgba = new Uint8ClampedArray(4 * 4 * 4).fill(255);
  const bmp = encodeRgbaToBmp(rgba, 4, 4);
  assert.equal(bmp[0], 0x42); // 'B'
  assert.equal(bmp[1], 0x4d); // 'M'
  assert.equal(bmp.byteLength, 54 + 64);

  const tiff = encodeRgbaToTiff(rgba, 4, 4, 300);
  assert.equal(tiff[0], 0x49); // 'I'
  assert.equal(tiff[1], 0x49); // 'I' Little-endian
  assert.equal(tiff[2], 42); // TIFF magic 42
  assert.equal(tiff[3], 0);
  assert.ok(tiff.byteLength > 4 * 4 * 4);

  const fakePng = new Uint8Array([137, 80, 78, 71]);
  const ico = encodePngToIco(fakePng, 64);
  assert.equal(ico[2], 1); // ICO type 1
  assert.equal(ico[6], 64); // 64px width
});

test('extractDominantColors returns 5 valid HEX color strings', () => {
  const rgba = new Uint8ClampedArray(100 * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 59;
    rgba[i + 1] = 130;
    rgba[i + 2] = 246;
    rgba[i + 3] = 255;
  }
  const palette = extractDominantColors(rgba, 5);
  assert.equal(palette.length, 5);
  assert.ok(palette[0].startsWith('#'));
});
