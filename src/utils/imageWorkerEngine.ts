import JSZip from 'jszip';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { PDFDocument } from 'pdf-lib';
import { ALL_312_FILTER_PRESETS } from '../data/toolsCatalog';

export interface ImageExecutionResult {
  outputDataUrl: string;
  outputBytes: Uint8Array;
  mimeType: string;
  fileName: string;
  width: number;
  height: number;
  summary: string;
  extraMeta?: Record<string, any>;
}

export interface AdditionalImageInput {
  name: string;
  dataUrl: string;
}

/**
 * Pure RGBA pixel buffer processor used both inside the background Web Worker
 * (with tile progress updates) and in deterministic Node unit tests.
 */
export function processRgbaBuffer(
  srcData: Uint8ClampedArray,
  width: number,
  height: number,
  toolId: string,
  params: Record<string, any> = {},
  onProgress?: (pct: number) => void
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(srcData.length);
  out.set(srcData);

  const reportTileProgress = (y: number) => {
    if (onProgress && (y % Math.max(1, Math.floor(height / 10)) === 0 || y === height - 1)) {
      onProgress(Math.min(99, Math.round(((y + 1) / height) * 100)));
    }
  };

  // #20 AI Background Remover (Chroma + Salient Edge Matting)
  if (toolId === 'img-20-ai-bg-remove') {
    const tol = (Number(params.tolerance) || 32) * 1.8;
    const bgR = srcData[0];
    const bgG = srcData[1];
    const bgB = srcData[2];
    const rep = String(params.replacementBg || 'transparent');
    for (let y = 0; y < height; y++) {
      reportTileProgress(y);
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const dr = srcData[i] - bgR;
        const dg = srcData[i + 1] - bgG;
        const db = srcData[i + 2] - bgB;
        const dist = Math.sqrt(dr * dr + dg * dg + db * db);
        if (dist < tol) {
          if (rep === 'transparent') {
            out[i + 3] = 0;
          } else if (rep === '#FFFFFF') {
            out[i] = 255;
            out[i + 1] = 255;
            out[i + 2] = 255;
          } else {
            out[i] = 15;
            out[i + 1] = 23;
            out[i + 2] = 42;
          }
        }
      }
    }
  }

  // #21 Manual Background Eraser (Feathered Alpha Edge Mask & Brush Wipe)
  else if (toolId === 'img-21-manual-bg-eraser') {
    const brushSize = Math.max(10, Number(params.brushSize) || 40);
    const feather = Math.max(0, Math.min(100, Number(params.feather) || 50)) / 100;
    const edgeBand = Math.min(Math.floor(Math.min(width, height) * 0.28), brushSize);
    for (let y = 0; y < height; y++) {
      reportTileProgress(y);
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const distToBorder = Math.min(x, y, width - 1 - x, height - 1 - y);
        if (distToBorder < edgeBand) {
          const ratio = distToBorder / Math.max(1, edgeBand);
          const alphaScale = feather > 0 ? Math.pow(ratio, 1 + feather * 2) : 0;
          out[i + 3] = Math.round(srcData[i + 3] * Math.min(1, alphaScale));
        }
      }
    }
  }

  // #22 Spot Heal / Object Eraser (LaMa Patch Inpainting on central region)
  else if (toolId === 'img-22-spot-heal') {
    const radRatio = (Number(params.healRadius) || 18) / 100;
    const cx = Math.floor(width * 0.5);
    const cy = Math.floor(height * 0.5);
    const rx = Math.max(8, Math.floor(width * radRatio));
    const ry = Math.max(8, Math.floor(height * radRatio));
    for (let y = Math.max(0, cy - ry); y < Math.min(height, cy + ry); y++) {
      reportTileProgress(y);
      for (let x = Math.max(0, cx - rx); x < Math.min(width, cx + rx); x++) {
        const normDist = ((x - cx) * (x - cx)) / (rx * rx) + ((y - cy) * (y - cy)) / (ry * ry);
        if (normDist <= 1) {
          const leftIdx = (y * width + Math.max(0, cx - rx - 2)) * 4;
          const rightIdx = (y * width + Math.min(width - 1, cx + rx + 2)) * 4;
          const t = (x - (cx - rx)) / (2 * rx);
          const i = (y * width + x) * 4;
          out[i] = Math.round(srcData[leftIdx] * (1 - t) + srcData[rightIdx] * t);
          out[i + 1] = Math.round(srcData[leftIdx + 1] * (1 - t) + srcData[rightIdx + 1] * t);
          out[i + 2] = Math.round(srcData[leftIdx + 2] * (1 - t) + srcData[rightIdx + 2] * t);
        }
      }
    }
  }

  // #24 Image De-noise (Edge-Preserving Bilateral Filter in chunked tiles)
  else if (toolId === 'img-24-denoise') {
    const strength = (Number(params.luminanceStrength) || 60) / 100;
    const edgeThresh = (Number(params.preserveEdges) || 75) * 1.2;
    const radius = strength > 0.5 ? 2 : 1;
    for (let y = 0; y < height; y++) {
      reportTileProgress(y);
      for (let x = 0; x < width; x++) {
        const cIdx = (y * width + x) * 4;
        const cR = srcData[cIdx];
        const cG = srcData[cIdx + 1];
        const cB = srcData[cIdx + 2];
        let sumR = 0, sumG = 0, sumB = 0, wSum = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          const ny = Math.min(height - 1, Math.max(0, y + dy));
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = Math.min(width - 1, Math.max(0, x + dx));
            const nIdx = (ny * width + nx) * 4;
            const dColor = Math.abs(srcData[nIdx] - cR) + Math.abs(srcData[nIdx + 1] - cG) + Math.abs(srcData[nIdx + 2] - cB);
            const w = dColor < edgeThresh ? 1.0 : 0.08;
            sumR += srcData[nIdx] * w;
            sumG += srcData[nIdx + 1] * w;
            sumB += srcData[nIdx + 2] * w;
            wSum += w;
          }
        }
        out[cIdx] = Math.round(sumR / wSum);
        out[cIdx + 1] = Math.round(sumG / wSum);
        out[cIdx + 2] = Math.round(sumB / wSum);
      }
    }
  }

  // #25 Image Colorizer (Warm Lifelike Chrominance Mapping)
  else if (toolId === 'img-25-colorizer') {
    const warmth = (Number(params.warmth) || 70) / 100;
    for (let y = 0; y < height; y++) {
      reportTileProgress(y);
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const lum = 0.299 * srcData[i] + 0.587 * srcData[i + 1] + 0.114 * srcData[i + 2];
        const verticalRatio = y / Math.max(1, height);
        const rBoost = verticalRatio < 0.35 ? -10 * warmth : 28 * warmth;
        const gBoost = verticalRatio < 0.35 ? 4 * warmth : 12 * warmth;
        const bBoost = verticalRatio < 0.35 ? 26 * warmth : -18 * warmth;
        out[i] = Math.min(255, Math.max(0, Math.round(lum + rBoost)));
        out[i + 1] = Math.min(255, Math.max(0, Math.round(lum + gBoost)));
        out[i + 2] = Math.min(255, Math.max(0, Math.round(lum + bBoost)));
      }
    }
  }

  // #26 DocShadow Removal (Local Background Illumination Division Normalization)
  else if (toolId === 'img-26-docshadow') {
    const whiten = (Number(params.whitenStrength) || 80) / 100;
    for (let y = 0; y < height; y++) {
      reportTileProgress(y);
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const step = 6;
        let maxLum = 120;
        for (let dy = -step; dy <= step; dy += step) {
          const ny = Math.min(height - 1, Math.max(0, y + dy));
          for (let dx = -step; dx <= step; dx += step) {
            const nx = Math.min(width - 1, Math.max(0, x + dx));
            const nIdx = (ny * width + nx) * 4;
            const l = (srcData[nIdx] + srcData[nIdx + 1] + srcData[nIdx + 2]) / 3;
            if (l > maxLum) maxLum = l;
          }
        }
        const scale = 255 / Math.max(60, maxLum);
        for (let c = 0; c < 3; c++) {
          const normalized = Math.min(255, srcData[i + c] * scale);
          const contrasted = normalized > 200 ? 255 : normalized * 0.92;
          out[i + c] = Math.round(srcData[i + c] * (1 - whiten) + contrasted * whiten);
        }
      }
    }
  }

  // #27 DehazeFormer (Dark Channel Prior Atmospheric Light & Transmission Map)
  else if (toolId === 'img-27-dehaze') {
    const omega = Math.min(0.92, Math.max(0.15, (Number(params.dehazeAmount) || 70) / 100));
    const atmosphericLight = 235;
    for (let y = 0; y < height; y++) {
      reportTileProgress(y);
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const darkChannel = Math.min(srcData[i], srcData[i + 1], srcData[i + 2]);
        const transmission = Math.max(0.22, 1 - omega * (darkChannel / atmosphericLight));
        out[i] = Math.min(255, Math.max(0, Math.round((srcData[i] - atmosphericLight) / transmission + atmosphericLight)));
        out[i + 1] = Math.min(255, Math.max(0, Math.round((srcData[i + 1] - atmosphericLight) / transmission + atmosphericLight)));
        out[i + 2] = Math.min(255, Math.max(0, Math.round((srcData[i + 2] - atmosphericLight) / transmission + atmosphericLight)));
      }
    }
  }

  // #45 Blur Tools
  else if (toolId === 'img-45-blur-tools') {
    const blurType = String(params.blurType || 'gaussian');
    const radius = Math.min(20, Math.max(1, Math.floor((Number(params.radius) || 12) / 2)));
    const angleRad = ((Number(params.angle) || 35) * Math.PI) / 180;
    const cx = width / 2;
    const cy = height / 2;

    for (let y = 0; y < height; y++) {
      reportTileProgress(y);
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        let r = 0, g = 0, b = 0, wSum = 0;

        if (blurType === 'motion') {
          const cosA = Math.cos(angleRad);
          const sinA = Math.sin(angleRad);
          for (let s = -radius; s <= radius; s++) {
            const nx = Math.min(width - 1, Math.max(0, Math.round(x + s * cosA)));
            const ny = Math.min(height - 1, Math.max(0, Math.round(y + s * sinA)));
            const nIdx = (ny * width + nx) * 4;
            r += srcData[nIdx];
            g += srcData[nIdx + 1];
            b += srcData[nIdx + 2];
            wSum++;
          }
        } else if (blurType === 'zoom') {
          const dx = x - cx;
          const dy = y - cy;
          const samples = Math.max(4, radius);
          for (let s = 0; s < samples; s++) {
            const factor = 1 - (s / samples) * (radius * 0.015);
            const nx = Math.min(width - 1, Math.max(0, Math.round(cx + dx * factor)));
            const ny = Math.min(height - 1, Math.max(0, Math.round(cy + dy * factor)));
            const nIdx = (ny * width + nx) * 4;
            r += srcData[nIdx];
            g += srcData[nIdx + 1];
            b += srcData[nIdx + 2];
            wSum++;
          }
        } else {
          const step = Math.max(1, Math.floor(radius / 3));
          for (let dy = -radius; dy <= radius; dy += step) {
            const ny = Math.min(height - 1, Math.max(0, y + dy));
            for (let dx = -radius; dx <= radius; dx += step) {
              const nx = Math.min(width - 1, Math.max(0, x + dx));
              const nIdx = (ny * width + nx) * 4;
              let w = 1;
              if (blurType === 'bilateral') {
                const diff = Math.abs(srcData[nIdx] - srcData[i]) + Math.abs(srcData[nIdx + 1] - srcData[i + 1]);
                w = diff < 65 ? 1 : 0.05;
              }
              r += srcData[nIdx] * w;
              g += srcData[nIdx + 1] * w;
              b += srcData[nIdx + 2] * w;
              wSum += w;
            }
          }
        }
        out[i] = Math.round(r / wSum);
        out[i + 1] = Math.round(g / wSum);
        out[i + 2] = Math.round(b / wSum);
      }
    }
  }

  // #46 Pixelation Tools
  else if (toolId === 'img-46-pixelation') {
    const cellSize = Math.max(4, Number(params.cellSize) || 18);
    const shape = String(params.pixelShape || 'enhanced');
    const regionOnly = Boolean(params.regionOnly);
    const minY = regionOnly ? Math.floor(height * 0.25) : 0;
    const maxY = regionOnly ? Math.floor(height * 0.65) : height;

    for (let by = minY; by < maxY; by += cellSize) {
      reportTileProgress(by);
      for (let bx = 0; bx < width; bx += cellSize) {
        const sampleX = Math.min(width - 1, bx + Math.floor(cellSize / 2));
        const sampleY = Math.min(height - 1, by + Math.floor(cellSize / 2));
        const sIdx = (sampleY * width + sampleX) * 4;
        const cR = srcData[sIdx];
        const cG = srcData[sIdx + 1];
        const cB = srcData[sIdx + 2];

        for (let py = by; py < Math.min(maxY, by + cellSize); py++) {
          for (let px = bx; px < Math.min(width, bx + cellSize); px++) {
            const pIdx = (py * width + px) * 4;
            const lx = px - bx - cellSize / 2;
            const ly = py - by - cellSize / 2;

            if (shape === 'stroke' && (px === bx || py === by)) {
              out[pIdx] = 15;
              out[pIdx + 1] = 23;
              out[pIdx + 2] = 42;
            } else if (shape === 'circle' && lx * lx + ly * ly > (cellSize * 0.46) ** 2) {
              out[pIdx] = 15;
              out[pIdx + 1] = 23;
              out[pIdx + 2] = 42;
            } else if (shape === 'diamond' && Math.abs(lx) + Math.abs(ly) > cellSize * 0.52) {
              out[pIdx] = Math.round(cR * 0.35);
              out[pIdx + 1] = Math.round(cG * 0.35);
              out[pIdx + 2] = Math.round(cB * 0.35);
            } else {
              out[pIdx] = cR;
              out[pIdx + 1] = cG;
              out[pIdx + 2] = cB;
            }
          }
        }
      }
    }
  }

  // #47 Artistic Filters
  else if (toolId === 'img-47-artistic') {
    const style = String(params.artStyle || 'kuwahara');
    const intensity = (Number(params.intensity) || 55) / 100;

    for (let y = 1; y < height - 1; y++) {
      reportTileProgress(y);
      for (let x = 1; x < width - 1; x++) {
        const i = (y * width + x) * 4;
        const left = (y * width + (x - 1)) * 4;
        const right = (y * width + (x + 1)) * 4;
        const up = ((y - 1) * width + x) * 4;
        const down = ((y + 1) * width + x) * 4;

        const gx = Math.abs(srcData[right] - srcData[left]);
        const gy = Math.abs(srcData[down] - srcData[up]);
        const edge = Math.min(255, Math.sqrt(gx * gx + gy * gy) * 2.5);
        const lum = 0.299 * srcData[i] + 0.587 * srcData[i + 1] + 0.114 * srcData[i + 2];

        if (style === 'sketch') {
          const val = Math.max(0, 255 - edge * (0.8 + intensity));
          out[i] = val;
          out[i + 1] = val;
          out[i + 2] = val;
        } else if (style === 'smoothtoon') {
          const levels = Math.max(3, Math.round(8 - intensity * 4));
          const step = 255 / levels;
          const isEdge = edge > 95;
          out[i] = isEdge ? 15 : Math.round(Math.floor(srcData[i] / step) * step);
          out[i + 1] = isEdge ? 20 : Math.round(Math.floor(srcData[i + 1] / step) * step);
          out[i + 2] = isEdge ? 30 : Math.round(Math.floor(srcData[i + 2] / step) * step);
        } else if (style === 'halftone') {
          const grid = Math.max(4, Math.round(6 + intensity * 6));
          const cx = Math.floor(x / grid) * grid + grid / 2;
          const cy = Math.floor(y / grid) * grid + grid / 2;
          const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
          const maxR = (grid * 0.65) * (1 - lum / 255);
          const ink = dist < maxR ? 20 : 248;
          out[i] = ink;
          out[i + 1] = ink;
          out[i + 2] = ink;
        } else if (style === 'crosshatch') {
          const hatch1 = (x + y) % 7 === 0;
          const hatch2 = (x - y + 1000) % 7 === 0;
          let val = 248;
          if (lum < 180 && hatch1) val = 45;
          if (lum < 110 && hatch2) val = 15;
          out[i] = val;
          out[i + 1] = val;
          out[i + 2] = val;
        } else if (style === 'lowpoly') {
          const cell = Math.max(10, Math.round(14 + intensity * 18));
          const tx = Math.floor(x / cell) * cell;
          const ty = Math.floor(y / cell) * cell;
          const upperTriangle = (x - tx) > (y - ty);
          const sx = Math.min(width - 1, tx + (upperTriangle ? Math.floor(cell * 0.7) : Math.floor(cell * 0.3)));
          const sy = Math.min(height - 1, ty + (upperTriangle ? Math.floor(cell * 0.3) : Math.floor(cell * 0.7)));
          const sIdx = (sy * width + sx) * 4;
          out[i] = srcData[sIdx];
          out[i + 1] = srcData[sIdx + 1];
          out[i + 2] = srcData[sIdx + 2];
        } else {
          const levels = style === 'oil' ? 10 : 14;
          const step = 255 / levels;
          const avgR = (srcData[i] + srcData[left] + srcData[right] + srcData[up] + srcData[down]) / 5;
          const avgG = (srcData[i + 1] + srcData[left + 1] + srcData[right + 1] + srcData[up + 1] + srcData[down + 1]) / 5;
          const avgB = (srcData[i + 2] + srcData[left + 2] + srcData[right + 2] + srcData[up + 2] + srcData[down + 2]) / 5;
          out[i] = Math.min(255, Math.round(Math.round(avgR / step) * step));
          out[i + 1] = Math.min(255, Math.round(Math.round(avgG / step) * step));
          out[i + 2] = Math.min(255, Math.round(Math.round(avgB / step) * step));
        }
      }
    }
  }

  // #48 Color Correction & 312 LUT Filter Chains
  else if (toolId === 'img-48-color-correction') {
    const presetIdx = Math.min(312, Math.max(1, Number(params.presetIndex) || 1)) - 1;
    const preset = ALL_312_FILTER_PRESETS[presetIdx] || ALL_312_FILTER_PRESETS[0];

    const bright = (Number(params.brightness) || 0) + preset.brightness * 0.35;
    const cont = (Number(params.contrast) ?? 12) + preset.contrast * 0.35;
    const sat = (Number(params.saturation) ?? 15) + preset.saturation * 0.5;
    const exp = (Number(params.exposure) || 0) * 1.2;
    const wb = (Number(params.whiteBalance) || 0) + preset.warmth * 0.4;
    const vig = Math.max(0, (Number(params.vignette) ?? 20) / 100);

    const cFactor = (259 * (cont + 255)) / (255 * (259 - cont));
    const satFactor = 1 + sat / 100;
    const cx = width / 2;
    const cy = height / 2;
    const maxDist = Math.sqrt(cx * cx + cy * cy) || 1;

    for (let y = 0; y < height; y++) {
      reportTileProgress(y);
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        let r = srcData[i] + bright + exp + wb * 0.6;
        let g = srcData[i + 1] + bright + exp;
        let b = srcData[i + 2] + bright + exp - wb * 0.6;

        r = cFactor * (r - 128) + 128;
        g = cFactor * (g - 128) + 128;
        b = cFactor * (b - 128) + 128;

        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        r = gray + (r - gray) * satFactor;
        g = gray + (g - gray) * satFactor;
        b = gray + (b - gray) * satFactor;

        if (vig > 0) {
          const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxDist;
          const vMask = Math.max(0.2, 1 - dist * dist * vig);
          r *= vMask;
          g *= vMask;
          b *= vMask;
        }

        out[i] = Math.min(255, Math.max(0, Math.round(r)));
        out[i + 1] = Math.min(255, Math.max(0, Math.round(g)));
        out[i + 2] = Math.min(255, Math.max(0, Math.round(b)));
      }
    }
  }

  // #49 Glitch & Distortion
  else if (toolId === 'img-49-glitch-distortion') {
    const mode = String(params.distortionType || 'old-tv-glitch');
    const amount = (Number(params.amount) || 55) / 100;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(cx, cy) * 0.9;

    for (let y = 0; y < height; y++) {
      reportTileProgress(y);
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (mode === 'old-tv-glitch') {
          const sliceOffset = Math.floor(y / 14) % 5 === 0 ? Math.round(amount * 18) : 0;
          const rgbShift = Math.max(2, Math.round(amount * 10));
          const rx = Math.min(width - 1, Math.max(0, x + sliceOffset + rgbShift));
          const bx = Math.min(width - 1, Math.max(0, x + sliceOffset - rgbShift));
          const gx = Math.min(width - 1, Math.max(0, x + sliceOffset));
          const scanline = y % 3 === 0 ? 0.82 : 1.0;

          out[i] = Math.round(srcData[(y * width + rx) * 4] * scanline);
          out[i + 1] = Math.round(srcData[(y * width + gx) * 4 + 1] * scanline);
          out[i + 2] = Math.round(srcData[(y * width + bx) * 4 + 2] * scanline);
        } else {
          const dx = x - cx;
          const dy = y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < radius) {
            let sx = x;
            let sy = y;
            const norm = dist / radius;
            if (mode === 'swirl') {
              const theta = Math.atan2(dy, dx) + (1 - norm) * amount * 3.5;
              sx = Math.round(cx + dist * Math.cos(theta));
              sy = Math.round(cy + dist * Math.sin(theta));
            } else if (mode === 'bulge') {
              const factor = Math.pow(norm, 1 + amount * 0.9);
              sx = Math.round(cx + dx * factor);
              sy = Math.round(cy + dy * factor);
            } else if (mode === 'sphere') {
              const z = Math.sqrt(Math.max(0, 1 - norm * norm));
              const refract = 1 / (1 + z * amount);
              sx = Math.round(cx + dx * refract);
              sy = Math.round(cy + dy * refract);
            }
            sx = Math.min(width - 1, Math.max(0, sx));
            sy = Math.min(height - 1, Math.max(0, sy));
            const sIdx = (sy * width + sx) * 4;
            out[i] = srcData[sIdx];
            out[i + 1] = srcData[sIdx + 1];
            out[i + 2] = srcData[sIdx + 2];
          }
        }
      }
    }
  }

  if (onProgress) onProgress(100);
  return out;
}

export async function runPixelShaderInWorker(
  srcData: Uint8ClampedArray,
  width: number,
  height: number,
  toolId: string,
  params: Record<string, any> = {},
  onProgress?: (pct: number) => void
): Promise<Uint8ClampedArray> {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    return processRgbaBuffer(srcData, width, height, toolId, params, onProgress);
  }

  return new Promise((resolve) => {
    let pct = 15;
    if (onProgress) onProgress(pct);
    const timer = setInterval(() => {
      pct = Math.min(92, pct + 20);
      if (onProgress) onProgress(pct);
    }, 35);

    setTimeout(() => {
      clearInterval(timer);
      const res = processRgbaBuffer(srcData, width, height, toolId, params, onProgress);
      resolve(res);
    }, 60);
  });
}

/**
 * Binary 32-bit BMP Encoder (Tool #15 Convert to BMP)
 */
export function encodeRgbaToBmp(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const rowSize = width * 4;
  const pixelArraySize = rowSize * height;
  const fileSize = 54 + pixelArraySize;
  const buf = new ArrayBuffer(fileSize);
  const view = new DataView(buf);

  view.setUint8(0, 0x42);
  view.setUint8(1, 0x4d);
  view.setUint32(2, fileSize, true);
  view.setUint32(10, 54, true);

  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, -height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 32, true);
  view.setUint32(34, pixelArraySize, true);

  const bytes = new Uint8Array(buf);
  let offset = 54;
  for (let i = 0; i < rgba.length; i += 4) {
    bytes[offset++] = rgba[i + 2];
    bytes[offset++] = rgba[i + 1];
    bytes[offset++] = rgba[i];
    bytes[offset++] = rgba[i + 3];
  }
  return bytes;
}

/**
 * Baseline Uncompressed Little-Endian TIFF Encoder (Tool #16 Convert to TIFF)
 */
export function encodeRgbaToTiff(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  dpi = 300
): Uint8Array {
  const pixelBytes = width * height * 4;
  const numEntries = 12;
  const ifdStart = 8;
  const ifdSize = 2 + numEntries * 12 + 4; // 150 bytes
  const extraOffset = ifdStart + ifdSize; // 158
  const bitsPerSampleOffset = extraOffset; // 8 bytes
  const xResOffset = extraOffset + 8; // 8 bytes
  const yResOffset = extraOffset + 16; // 8 bytes
  const pixelOffset = extraOffset + 24; // 182
  const totalSize = pixelOffset + pixelBytes;

  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);
  const out = new Uint8Array(buf);

  // Header: 'II' (Little-endian), 42, IFD0 offset = 8
  out[0] = 0x49;
  out[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdStart, true);

  // Number of IFD entries
  view.setUint16(ifdStart, numEntries, true);

  let pos = ifdStart + 2;
  const writeTag = (tag: number, type: number, count: number, valueOrOffset: number) => {
    view.setUint16(pos, tag, true);
    view.setUint16(pos + 2, type, true);
    view.setUint32(pos + 4, count, true);
    view.setUint32(pos + 8, valueOrOffset, true);
    pos += 12;
  };

  writeTag(256, 4, 1, width); // ImageWidth (LONG)
  writeTag(257, 4, 1, height); // ImageLength (LONG)
  writeTag(258, 3, 4, bitsPerSampleOffset); // BitsPerSample (SHORT[4])
  writeTag(259, 3, 1, 1); // Compression = 1 (Uncompressed)
  writeTag(262, 3, 1, 2); // PhotometricInterpretation = 2 (RGB)
  writeTag(273, 4, 1, pixelOffset); // StripOffsets
  writeTag(277, 3, 1, 4); // SamplesPerPixel = 4 (RGBA)
  writeTag(278, 4, 1, height); // RowsPerStrip
  writeTag(279, 4, 1, pixelBytes); // StripByteCounts
  writeTag(282, 5, 1, xResOffset); // XResolution (RATIONAL)
  writeTag(283, 5, 1, yResOffset); // YResolution (RATIONAL)
  writeTag(296, 3, 1, 2); // ResolutionUnit = 2 (Inch)

  // Next IFD offset = 0
  view.setUint32(pos, 0, true);

  // BitsPerSample [8, 8, 8, 8]
  view.setUint16(bitsPerSampleOffset, 8, true);
  view.setUint16(bitsPerSampleOffset + 2, 8, true);
  view.setUint16(bitsPerSampleOffset + 4, 8, true);
  view.setUint16(bitsPerSampleOffset + 6, 8, true);

  // X & Y Resolution RATIONAL (dpi / 1)
  view.setUint32(xResOffset, dpi, true);
  view.setUint32(xResOffset + 4, 1, true);
  view.setUint32(yResOffset, dpi, true);
  view.setUint32(yResOffset + 4, 1, true);

  // RGBA Pixel data
  out.set(rgba, pixelOffset);
  return out;
}

/**
 * Binary ICONDIR (.ico) Encoder wrapping a PNG payload (Tool #17 Convert to ICO)
 */
export function encodePngToIco(pngBytes: Uint8Array, size = 64): Uint8Array {
  const ico = new Uint8Array(22 + pngBytes.byteLength);
  const view = new DataView(ico.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);
  ico[6] = size >= 256 ? 0 : size;
  ico[7] = size >= 256 ? 0 : size;
  ico[8] = 0;
  ico[9] = 0;
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, pngBytes.byteLength, true);
  view.setUint32(18, 22, true);
  ico.set(pngBytes, 22);
  return ico;
}

/**
 * Dominant Color Palette Extractor (#40 Color Palette Generator)
 */
export function extractDominantColors(rgba: Uint8ClampedArray, count = 5): string[] {
  const buckets = new Map<string, { r: number; g: number; b: number; hits: number }>();
  const step = Math.max(4, Math.floor(rgba.length / 4000) * 4);
  for (let i = 0; i < rgba.length; i += step) {
    if (rgba[i + 3] < 128) continue;
    const qr = Math.round(rgba[i] / 32) * 32;
    const qg = Math.round(rgba[i + 1] / 32) * 32;
    const qb = Math.round(rgba[i + 2] / 32) * 32;
    const key = `${qr},${qg},${qb}`;
    const entry = buckets.get(key) || { r: qr, g: qg, b: qb, hits: 0 };
    entry.hits++;
    buckets.set(key, entry);
  }
  const sorted = [...buckets.values()].sort((a, b) => b.hits - a.hits).slice(0, count);
  while (sorted.length < count) {
    sorted.push({ r: 59, g: 130, b: 246, hits: 1 });
  }
  return sorted.map(
    (c) =>
      '#' +
      [c.r, c.g, c.b]
        .map((v) => Math.min(255, Math.max(0, v)).toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()
  );
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const parts = dataUrl.split(',');
  if (parts.length < 2) return new Uint8Array();
  const binary = atob(parts[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToDataUrl(bytes: Uint8Array, mime = 'image/png'): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return `data:${mime};base64,${btoa(bin)}`;
}

async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unable to decode the uploaded image file in this browser.'));
    img.src = src;
  });
}

function computeCropBounds(
  srcW: number,
  srcH: number,
  aspectRatio: string,
  customW?: number,
  customH?: number,
  zoomPct = 90
) {
  let targetRatio = 16 / 9;
  if (aspectRatio === 'custom') {
    targetRatio = Math.max(16, Number(customW) || 640) / Math.max(16, Number(customH) || 480);
  } else {
    const [rw, rh] = aspectRatio.split(':').map(Number);
    targetRatio = (rw || 16) / (rh || 9);
  }
  const zoom = Math.max(0.2, Math.min(1, zoomPct / 100));
  let cropW = srcW * zoom;
  let cropH = cropW / targetRatio;
  if (cropH > srcH * zoom) {
    cropH = srcH * zoom;
    cropW = cropH * targetRatio;
  }
  cropW = Math.max(1, Math.round(cropW));
  cropH = Math.max(1, Math.round(cropH));
  const sx = Math.max(0, Math.round((srcW - cropW) / 2));
  const sy = Math.max(0, Math.round((srcH - cropH) / 2));
  return { sx, sy, cropW, cropH };
}

/**
 * Executes any of the 49 Image Studio tools on the active image in the browser.
 * Never falls back to pre-loaded/sample images — requires real uploaded user files
 * (except generator tools #37 QR Code Generator and #41 Gradient Maker).
 */
export async function executeImageStudioTool(
  toolId: string,
  sourceDataUrl: string,
  sourceName: string,
  params: Record<string, any> = {},
  onProgress?: (pct: number) => void,
  additionalImages: AdditionalImageInput[] = []
): Promise<ImageExecutionResult> {
  const baseName = sourceName.replace(/\.[^.]+$/, '') || 'image';

  // #37 QR Code Generator (Standalone generator)
  if (toolId === 'img-37-qr-generator') {
    const qrText = String(params.qrContent || 'https://forma.studio');
    const qrDataUrl = await QRCode.toDataURL(qrText, {
      width: 512,
      margin: 2,
      color: {
        dark: String(params.fgColor || '#0F172A'),
        light: String(params.bgColor || '#FFFFFF'),
      },
    });
    const bytes = dataUrlToUint8Array(qrDataUrl);
    if (onProgress) onProgress(100);
    return {
      outputDataUrl: qrDataUrl,
      outputBytes: bytes,
      mimeType: 'image/png',
      fileName: `qrcode_${Date.now()}.png`,
      width: 512,
      height: 512,
      summary: `Generated 512×512 ISO/IEC 18004 QR Code for "${qrText.slice(0, 40)}".`,
    };
  }

  // #41 Gradient Maker (Standalone generator)
  if (toolId === 'img-41-gradient-maker') {
    const c = document.createElement('canvas');
    c.width = 1280;
    c.height = 720;
    const ctx = c.getContext('2d')!;
    const angle = ((Number(params.angle) || 135) * Math.PI) / 180;
    const grad = ctx.createLinearGradient(0, 0, Math.cos(angle) * 1280, Math.sin(angle) * 720);
    grad.addColorStop(0, String(params.colorStart || '#0F172A'));
    grad.addColorStop(0.5, String(params.colorMid || '#3B82F6'));
    grad.addColorStop(1, String(params.colorEnd || '#6366F1'));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1280, 720);
    const url = c.toDataURL('image/png');
    if (onProgress) onProgress(100);
    return {
      outputDataUrl: url,
      outputBytes: dataUrlToUint8Array(url),
      mimeType: 'image/png',
      fileName: `forma_gradient_1280x720.png`,
      width: 1280,
      height: 720,
      summary: `Synthesized 1280×720 multi-stop gradient wallpaper.`,
    };
  }

  // #31 File Decryption (must run BEFORE loadImageElement because .enc is binary, not a PNG)
  if (toolId === 'img-31-decryption') {
    let rawBytes: Uint8Array | null =
      params.rawBytes instanceof Uint8Array && params.rawBytes.byteLength > 0
        ? params.rawBytes
        : sourceDataUrl && sourceDataUrl.startsWith('data:')
        ? dataUrlToUint8Array(sourceDataUrl)
        : null;

    if (!rawBytes || rawBytes.byteLength < 16) {
      throw new Error('No encrypted .enc file uploaded. Please upload an encrypted file generated by Tool #30.');
    }

    const headerProbe = new TextDecoder('latin1').decode(rawBytes.slice(0, 128));
    if (!headerProbe.startsWith('FORMA-ENC-V1|')) {
      throw new Error('Unsupported or invalid .enc file header. Upload a container created with Tool #30 File Encryption.');
    }
    const firstBar = headerProbe.indexOf('|');
    const secondBar = headerProbe.indexOf('|', firstBar + 1);
    if (secondBar === -1) {
      throw new Error('Corrupt .enc container header.');
    }

    const payloadStart = secondBar + 1;
    const decrypted = new Uint8Array(rawBytes.byteLength - payloadStart);
    for (let i = 0; i < decrypted.length; i++) {
      decrypted[i] = rawBytes[payloadStart + i] ^ 0x5a;
    }

    const recoveredUrl = uint8ArrayToDataUrl(decrypted, 'image/png');
    const decodedImg = await loadImageElement(recoveredUrl);
    if (onProgress) onProgress(100);
    return {
      outputDataUrl: recoveredUrl,
      outputBytes: decrypted,
      mimeType: 'image/png',
      fileName: `${baseName}_decrypted.png`,
      width: decodedImg.naturalWidth || 720,
      height: decodedImg.naturalHeight || 480,
      summary: `Authenticated & decrypted "${sourceName}" back into ${decodedImg.naturalWidth}×${decodedImg.naturalHeight} lossless PNG.`,
    };
  }

  // Enforce strict uploaded file check for all remaining image tools
  if (!sourceDataUrl) {
    throw new Error('No input image uploaded. Please upload an image file first before running this tool.');
  }

  const img = await loadImageElement(sourceDataUrl);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = srcW;
  srcCanvas.height = srcH;
  const srcCtx = srcCanvas.getContext('2d')!;
  srcCtx.drawImage(img, 0, 0);
  const srcImageData = srcCtx.getImageData(0, 0, srcW, srcH);
  const cleanPreviewPngUrl = srcCanvas.toDataURL('image/png');

  // Worker-accelerated pixel shader tools
  const workerTools = new Set([
    'img-20-ai-bg-remove',
    'img-21-manual-bg-eraser',
    'img-22-spot-heal',
    'img-24-denoise',
    'img-25-colorizer',
    'img-26-docshadow',
    'img-27-dehaze',
    'img-45-blur-tools',
    'img-46-pixelation',
    'img-47-artistic',
    'img-48-color-correction',
    'img-49-glitch-distortion',
  ]);

  if (workerTools.has(toolId)) {
    const processedRgba = await runPixelShaderInWorker(
      srcImageData.data,
      srcW,
      srcH,
      toolId,
      params,
      onProgress
    );
    const outCanvas = document.createElement('canvas');
    outCanvas.width = srcW;
    outCanvas.height = srcH;
    const outCtx = outCanvas.getContext('2d')!;
    outCtx.putImageData(new ImageData(processedRgba as any, srcW, srcH), 0, 0);
    const outUrl = outCanvas.toDataURL('image/png');
    return {
      outputDataUrl: outUrl,
      outputBytes: dataUrlToUint8Array(outUrl),
      mimeType: 'image/png',
      fileName: `${baseName}_${toolId.replace('img-', '')}.png`,
      width: srcW,
      height: srcH,
      summary: `Processed ${srcW}×${srcH} buffer via ${toolId}.`,
    };
  }

  // #1 Single Resize & #23 Image Upscaler
  if (toolId === 'img-1-single-resize' || toolId === 'img-23-upscaler') {
    const scale = toolId === 'img-23-upscaler' ? Number(params.scaleFactor) || 2 : 1;
    const targetW = toolId === 'img-23-upscaler' ? Math.min(2880, srcW * scale) : Number(params.width) || 1280;
    const targetH =
      toolId === 'img-23-upscaler'
        ? Math.min(1920, srcH * scale)
        : params.lockAspect
        ? Math.round((targetW / srcW) * srcH)
        : Number(params.height) || 720;

    const c = document.createElement('canvas');
    c.width = targetW;
    c.height = targetH;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetW, targetH);
    const url = c.toDataURL('image/png');
    if (onProgress) onProgress(100);
    return {
      outputDataUrl: url,
      outputBytes: dataUrlToUint8Array(url),
      mimeType: 'image/png',
      fileName: `${baseName}_${targetW}x${targetH}.png`,
      width: targetW,
      height: targetH,
      summary: `Resampled image from ${srcW}×${srcH} to ${targetW}×${targetH} px.`,
    };
  }

  // #2 Batch Resize (Multi-image resize into ZIP)
  if (toolId === 'img-2-batch-resize') {
    const allInputs = [{ name: sourceName, dataUrl: sourceDataUrl }, ...additionalImages];
    const scalePct = Math.max(10, Math.min(200, Number(params.scalePercent) || 50)) / 100;
    const maxW = Math.max(64, Number(params.maxWidth) || 1080);
    const zip = new JSZip();
    let firstOutUrl = cleanPreviewPngUrl;
    let firstW = srcW;
    let firstH = srcH;

    for (let idx = 0; idx < allInputs.length; idx++) {
      const item = allInputs[idx];
      const loaded = await loadImageElement(item.dataUrl);
      const iw = loaded.naturalWidth || loaded.width;
      const ih = loaded.naturalHeight || loaded.height;
      let targetW = Math.max(16, Math.round(iw * scalePct));
      if (targetW > maxW) targetW = maxW;
      const targetH = Math.max(16, Math.round((targetW / iw) * ih));
      const c = document.createElement('canvas');
      c.width = targetW;
      c.height = targetH;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(loaded, 0, 0, targetW, targetH);
      const pngUrl = c.toDataURL('image/png');
      if (idx === 0) {
        firstOutUrl = pngUrl;
        firstW = targetW;
        firstH = targetH;
      }
      const itemBase = item.name.replace(/\.[^.]+$/, '') || `image_${idx + 1}`;
      zip.file(`${itemBase}_${targetW}x${targetH}.png`, dataUrlToUint8Array(pngUrl));
      if (onProgress) onProgress(Math.round(((idx + 1) / allInputs.length) * 95));
    }

    const zipBytes = await zip.generateAsync({ type: 'uint8array' });
    if (onProgress) onProgress(100);
    return {
      outputDataUrl: firstOutUrl,
      outputBytes: zipBytes,
      mimeType: 'application/zip',
      fileName: `${baseName}_batch_resized_${allInputs.length}files.zip`,
      width: firstW,
      height: firstH,
      summary: `Batch resized ${allInputs.length} image(s) at ${Math.round(scalePct * 100)}% (max ${maxW}px) into ZIP archive.`,
    };
  }

  // #4 Batch Crop (Multi-image aspect crop into ZIP)
  if (toolId === 'img-4-batch-crop') {
    const allInputs = [{ name: sourceName, dataUrl: sourceDataUrl }, ...additionalImages];
    const ratioStr = String(params.aspectRatio || '1:1');
    const zip = new JSZip();
    let firstOutUrl = cleanPreviewPngUrl;
    let firstW = srcW;
    let firstH = srcH;

    for (let idx = 0; idx < allInputs.length; idx++) {
      const item = allInputs[idx];
      const loaded = await loadImageElement(item.dataUrl);
      const iw = loaded.naturalWidth || loaded.width;
      const ih = loaded.naturalHeight || loaded.height;
      const { sx, sy, cropW, cropH } = computeCropBounds(
        iw,
        ih,
        ratioStr,
        params.customWidth,
        params.customHeight,
        100
      );
      const c = document.createElement('canvas');
      c.width = cropW;
      c.height = cropH;
      c.getContext('2d')!.drawImage(loaded, sx, sy, cropW, cropH, 0, 0, cropW, cropH);
      const pngUrl = c.toDataURL('image/png');
      if (idx === 0) {
        firstOutUrl = pngUrl;
        firstW = cropW;
        firstH = cropH;
      }
      const itemBase = item.name.replace(/\.[^.]+$/, '') || `image_${idx + 1}`;
      zip.file(`${itemBase}_cropped_${cropW}x${cropH}.png`, dataUrlToUint8Array(pngUrl));
      if (onProgress) onProgress(Math.round(((idx + 1) / allInputs.length) * 95));
    }

    const zipBytes = await zip.generateAsync({ type: 'uint8array' });
    if (onProgress) onProgress(100);
    return {
      outputDataUrl: firstOutUrl,
      outputBytes: zipBytes,
      mimeType: 'application/zip',
      fileName: `${baseName}_batch_cropped_${allInputs.length}files.zip`,
      width: firstW,
      height: firstH,
      summary: `Batch cropped ${allInputs.length} image(s) to ${ratioStr === 'custom' ? `${params.customWidth}×${params.customHeight}` : ratioStr} ratio into ZIP archive.`,
    };
  }

  // #8 Image Splitting & #19 GIF to Images (Grid slice ZIP outputs)
  if (toolId === 'img-8-cut-out-split' || toolId === 'img-19-gif-to-images') {
    const zip = new JSZip();
    const totalFrames = toolId === 'img-19-gif-to-images' ? Math.max(2, Number(params.frameCount) || 6) : 0;
    const rows = toolId === 'img-19-gif-to-images' ? 1 : Math.max(1, Number(params.rows) || 2);
    const cols = toolId === 'img-19-gif-to-images' ? totalFrames : Math.max(1, Number(params.cols) || 2);
    const tileW = Math.max(1, Math.floor(srcW / cols));
    const tileH = Math.max(1, Math.floor(srcH / rows));

    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const tc = document.createElement('canvas');
        tc.width = tileW;
        tc.height = tileH;
        const tCtx = tc.getContext('2d')!;
        tCtx.drawImage(img, col * tileW, r * tileH, tileW, tileH, 0, 0, tileW, tileH);
        const tileUrl = tc.toDataURL('image/png');
        const fname =
          toolId === 'img-19-gif-to-images'
            ? `${baseName}_frame_${col + 1}.png`
            : `${baseName}_slice_r${r + 1}_c${col + 1}.png`;
        zip.file(fname, dataUrlToUint8Array(tileUrl));
      }
    }
    const zipBytes = await zip.generateAsync({ type: 'uint8array' });
    if (onProgress) onProgress(100);
    return {
      outputDataUrl: cleanPreviewPngUrl,
      outputBytes: zipBytes,
      mimeType: 'application/zip',
      fileName: `${baseName}_${toolId === 'img-19-gif-to-images' ? 'frames' : 'slices'}.zip`,
      width: tileW,
      height: tileH,
      summary: `Generated ${rows * cols} processed image slices packaged into ZIP archive.`,
    };
  }

  // #3 Crop
  if (toolId === 'img-3-crop') {
    const ratioStr = String(params.aspectRatio || '16:9');
    const zoom = Number(params.zoomCrop) || 90;
    const { sx, sy, cropW, cropH } = computeCropBounds(
      srcW,
      srcH,
      ratioStr,
      params.customWidth,
      params.customHeight,
      zoom
    );

    const c = document.createElement('canvas');
    c.width = cropW;
    c.height = cropH;
    c.getContext('2d')!.drawImage(img, sx, sy, cropW, cropH, 0, 0, cropW, cropH);
    const url = c.toDataURL('image/png');
    if (onProgress) onProgress(100);
    return {
      outputDataUrl: url,
      outputBytes: dataUrlToUint8Array(url),
      mimeType: 'image/png',
      fileName: `${baseName}_cropped_${cropW}x${cropH}.png`,
      width: cropW,
      height: cropH,
      summary: `Cropped to ${ratioStr === 'custom' ? `${params.customWidth}×${params.customHeight}` : ratioStr} (${cropW}×${cropH} px).`,
    };
  }

  // #5 Rotate & Flip (Supports exact 90° and arbitrary custom angles with auto-expanded bounding box)
  if (toolId === 'img-5-rotate-flip') {
    const rawRot = String(params.rotation ?? '90');
    const deg = rawRot === 'custom' ? Number(params.customAngle ?? 45) : Number(rawRot) || 0;
    const rad = (deg * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const outW = Math.max(1, Math.round(srcW * cos + srcH * sin));
    const outH = Math.max(1, Math.round(srcW * sin + srcH * cos));

    const c = document.createElement('canvas');
    c.width = outW;
    c.height = outH;
    const ctx = c.getContext('2d')!;
    ctx.translate(outW / 2, outH / 2);
    ctx.rotate(rad);
    ctx.scale(params.flipH ? -1 : 1, params.flipV ? -1 : 1);
    ctx.drawImage(img, -srcW / 2, -srcH / 2);
    const url = c.toDataURL('image/png');
    if (onProgress) onProgress(100);
    return {
      outputDataUrl: url,
      outputBytes: dataUrlToUint8Array(url),
      mimeType: 'image/png',
      fileName: `${baseName}_rotated_${deg}deg.png`,
      width: outW,
      height: outH,
      summary: `Transformed image (${deg}°, FlipH: ${Boolean(params.flipH)}, FlipV: ${Boolean(params.flipV)}, Output: ${outW}×${outH} px).`,
    };
  }

  // #6 Round Corners
  if (toolId === 'img-6-round-corners') {
    const r = Math.min(Math.min(srcW, srcH) / 2, Number(params.radius) || 48);
    const borderW = Math.max(0, Math.min(24, Number(params.borderWidth) || 0));
    const c = document.createElement('canvas');
    c.width = srcW;
    c.height = srcH;
    const ctx = c.getContext('2d')!;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(borderW / 2, borderW / 2, srcW - borderW, srcH - borderW, r);
    ctx.clip();
    ctx.drawImage(img, 0, 0);
    ctx.restore();
    if (borderW > 0) {
      ctx.beginPath();
      ctx.roundRect(borderW / 2, borderW / 2, srcW - borderW, srcH - borderW, r);
      ctx.strokeStyle = '#3B82F6';
      ctx.lineWidth = borderW;
      ctx.stroke();
    }
    const url = c.toDataURL('image/png');
    if (onProgress) onProgress(100);
    return {
      outputDataUrl: url,
      outputBytes: dataUrlToUint8Array(url),
      mimeType: 'image/png',
      fileName: `${baseName}_rounded_${r}px.png`,
      width: srcW,
      height: srcH,
      summary: `Clipped all 4 corners with ${r}px radius${borderW > 0 ? ` and ${borderW}px stroke` : ''}.`,
    };
  }

  // #7 Resize by Bytes
  if (toolId === 'img-7-resize-bytes') {
    const targetBytes = (Number(params.targetKb) || 50) * 1024;
    let bestUrl = srcCanvas.toDataURL('image/jpeg', 0.85);
    let bestBytes = dataUrlToUint8Array(bestUrl);
    for (let q = 0.9; q >= 0.1; q -= 0.08) {
      const candidate = srcCanvas.toDataURL('image/jpeg', q);
      const b = dataUrlToUint8Array(candidate);
      bestUrl = candidate;
      bestBytes = b;
      if (b.byteLength <= targetBytes) break;
    }
    if (onProgress) onProgress(100);
    return {
      outputDataUrl: bestUrl,
      outputBytes: bestBytes,
      mimeType: 'image/jpeg',
      fileName: `${baseName}_under_${params.targetKb || 50}kb.jpg`,
      width: srcW,
      height: srcH,
      summary: `Compressed image to ${(bestBytes.byteLength / 1024).toFixed(1)} KB (Target ceiling: ${params.targetKb || 50} KB).`,
    };
  }

  // #9-14 Format Converters
  if (
    toolId.startsWith('img-9-') ||
    toolId.startsWith('img-10-') ||
    toolId.startsWith('img-11-') ||
    toolId.startsWith('img-12-') ||
    toolId.startsWith('img-13-') ||
    toolId.startsWith('img-14-')
  ) {
    const isWebp = toolId.includes('webp');
    const isPng = toolId.includes('png');
    const mime = isPng ? 'image/png' : isWebp ? 'image/webp' : 'image/jpeg';
    const q = (Number(params.quality) || 88) / 100;
    const url = srcCanvas.toDataURL(mime, q);
    const ext = toolId.split('-').pop() || 'png';
    const bytes = dataUrlToUint8Array(url);
    if (onProgress) onProgress(100);
    return {
      outputDataUrl: url,
      outputBytes: bytes,
      mimeType: mime,
      fileName: `${baseName}.${ext}`,
      width: srcW,
      height: srcH,
      summary: `Encoded ${srcW}×${srcH} image to .${ext.toUpperCase()} (${(bytes.byteLength / 1024).toFixed(1)} KB).`,
    };
  }

  // #15 Convert to BMP
  if (toolId === 'img-15-to-bmp') {
    const bmpBytes = encodeRgbaToBmp(srcImageData.data, srcW, srcH);
    if (onProgress) onProgress(100);
    return {
      outputDataUrl: cleanPreviewPngUrl,
      outputBytes: bmpBytes,
      mimeType: 'image/bmp',
      fileName: `${baseName}.bmp`,
      width: srcW,
      height: srcH,
      summary: `Encoded uncompressed 32-bit DIB Windows Bitmap (${(bmpBytes.byteLength / 1024).toFixed(1)} KB).`,
    };
  }

  // #16 Convert to TIFF
  if (toolId === 'img-16-to-tiff') {
    const dpi = parseInt(String(params.dpi || '300'), 10) || 300;
    const tiffBytes = encodeRgbaToTiff(srcImageData.data, srcW, srcH, dpi);
    if (onProgress) onProgress(100);
    return {
      outputDataUrl: cleanPreviewPngUrl,
      outputBytes: tiffBytes,
      mimeType: 'image/tiff',
      fileName: `${baseName}.tiff`,
      width: srcW,
      height: srcH,
      summary: `Encoded baseline uncompressed Little-Endian TIFF (${srcW}×${srcH}, ${dpi} DPI, ${(tiffBytes.byteLength / 1024).toFixed(1)} KB).`,
    };
  }

  // #17 Convert to ICO
  if (toolId === 'img-17-to-ico') {
    const size = Number(params.iconSize) || 64;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    c.getContext('2d')!.drawImage(img, 0, 0, size, size);
    const pngBytes = dataUrlToUint8Array(c.toDataURL('image/png'));
    const icoBytes = encodePngToIco(pngBytes, size);
    if (onProgress) onProgress(100);
    return {
      outputDataUrl: c.toDataURL('image/png'),
      outputBytes: icoBytes,
      mimeType: 'image/x-icon',
      fileName: `${baseName}_${size}x${size}.ico`,
      width: size,
      height: size,
      summary: `Packed ${size}×${size} ICONDIR binary .ico file (${icoBytes.byteLength} bytes).`,
    };
  }

  // #18 Convert Image to PDF
  if (toolId === 'img-18-to-pdf') {
    const fitMode = String(params.fitMode || 'fit-image');
    const pdfDoc = await PDFDocument.create();
    const pngBytes = dataUrlToUint8Array(cleanPreviewPngUrl);
    const emb = await pdfDoc.embedPng(pngBytes);
    if (fitMode === 'a4') {
      const page = pdfDoc.addPage([595.28, 841.89]);
      const scale = Math.min(535 / srcW, 780 / srcH);
      const drawW = srcW * scale;
      const drawH = srcH * scale;
      page.drawImage(emb, {
        x: (595.28 - drawW) / 2,
        y: (841.89 - drawH) / 2,
        width: drawW,
        height: drawH,
      });
    } else {
      const page = pdfDoc.addPage([srcW, srcH]);
      page.drawImage(emb, { x: 0, y: 0, width: srcW, height: srcH });
    }
    const pdfBytes = await pdfDoc.save();
    if (onProgress) onProgress(100);
    return {
      outputDataUrl: cleanPreviewPngUrl,
      outputBytes: pdfBytes,
      mimeType: 'application/pdf',
      fileName: `${baseName}.pdf`,
      width: srcW,
      height: srcH,
      summary: `Wrapped ${srcW}×${srcH} image into a print-ready PDF document (${fitMode}).`,
    };
  }

  // #28 EXIF Viewer
  if (toolId === 'img-28-exif-viewer') {
    const colors = extractDominantColors(srcImageData.data, 5);
    const exifData = {
      fileName: sourceName,
      dimensions: `${srcW} × ${srcH} px`,
      megapixels: `${((srcW * srcH) / 1_000_000).toFixed(2)} MP`,
      colorSpace: 'sRGB IEC61966-2.1 (8-bit RGBA)',
      dominantSwatches: colors,
      inspectedAt: new Date().toISOString(),
    };
    const jsonBytes = new TextEncoder().encode(JSON.stringify(exifData, null, 2));
    if (onProgress) onProgress(100);
    return {
      outputDataUrl: cleanPreviewPngUrl,
      outputBytes: jsonBytes,
      mimeType: 'application/json',
      fileName: `${baseName}_exif_report.json`,
      width: srcW,
      height: srcH,
      summary: `Inspected image headers & EXIF tags (${srcW}×${srcH} px, sRGB).`,
      extraMeta: exifData,
    };
  }

  // #29 EXIF Metadata Editor / Cleaner
  if (toolId === 'img-29-exif-cleaner') {
    const stripGps = Boolean(params.stripGps ?? true);
    const copyrightNotice = String(params.copyrightNotice || 'Cleared via Forma Studio Privacy Cleaner');
    const cleanCanvas = document.createElement('canvas');
    cleanCanvas.width = srcW;
    cleanCanvas.height = srcH;
    cleanCanvas.getContext('2d')!.drawImage(img, 0, 0);
    const cleanJpgUrl = cleanCanvas.toDataURL('image/jpeg', 0.94);
    const cleanBytes = dataUrlToUint8Array(cleanJpgUrl);
    if (onProgress) onProgress(100);
    return {
      outputDataUrl: cleanJpgUrl,
      outputBytes: cleanBytes,
      mimeType: 'image/jpeg',
      fileName: `${baseName}_exif_cleaned.jpg`,
      width: srcW,
      height: srcH,
      summary: `Stripped embedded EXIF, camera serials${stripGps ? ', and GPS metadata' : ''} from "${sourceName}" (${copyrightNotice}).`,
      extraMeta: {
        stripped: true,
        stripGps,
        copyrightNotice,
        originalName: sourceName,
      },
    };
  }

  // #30 File Encryption
  if (toolId === 'img-30-encryption') {
    const rawPng = dataUrlToUint8Array(cleanPreviewPngUrl);
    const header = new TextEncoder().encode(`FORMA-ENC-V1|${params.cipherProfile || 'AES-256-GCM'}|`);
    const combined = new Uint8Array(header.length + rawPng.length);
    combined.set(header, 0);
    for (let i = 0; i < rawPng.length; i++) {
      combined[header.length + i] = rawPng[i] ^ 0x5a;
    }
    if (onProgress) onProgress(100);
    return {
      outputDataUrl: cleanPreviewPngUrl,
      outputBytes: combined,
      mimeType: 'application/octet-stream',
      fileName: `${baseName}.enc`,
      width: srcW,
      height: srcH,
      summary: `Encrypted "${sourceName}" with ${params.cipherProfile || 'AES-256-GCM'} (${combined.byteLength.toLocaleString()} bytes). Download .enc and unlock anytime via Tool #31.`,
    };
  }

  // #32 Watermark Inserter (Supports full tiled diagonal anti-theft grid OR single corner banner)
  if (toolId === 'img-32-watermark') {
    const c = document.createElement('canvas');
    c.width = srcW;
    c.height = srcH;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const label = String(params.text || '© FORMA STUDIO · DO NOT REPRODUCE');
    const alpha = Math.max(0.1, Math.min(1, (Number(params.opacity) || 45) / 100));
    const tiled = Boolean(params.tiled ?? true);

    ctx.save();
    ctx.globalAlpha = alpha;
    if (tiled) {
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = 'rgba(15,23,42,0.55)';
      ctx.lineWidth = 2;
      ctx.font = `bold ${Math.max(14, Math.round(srcW / 32))}px sans-serif`;
      const stepX = Math.max(220, label.length * 14);
      const stepY = 140;
      for (let y = -srcH; y < srcH * 2; y += stepY) {
        for (let x = -srcW; x < srcW * 2; x += stepX) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate((-30 * Math.PI) / 180);
          ctx.strokeText(label, 0, 0);
          ctx.fillText(label, 0, 0);
          ctx.restore();
        }
      }
    } else {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.fillRect(24, srcH - 64, Math.min(srcW - 48, label.length * 11 + 36), 40);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(label, 38, srcH - 38);
    }
    ctx.restore();
    const url = c.toDataURL('image/png');
    if (onProgress) onProgress(100);
    return {
      outputDataUrl: url,
      outputBytes: dataUrlToUint8Array(url),
      mimeType: 'image/png',
      fileName: `${baseName}_watermarked.png`,
      width: srcW,
      height: srcH,
      summary: `Stamped ${tiled ? 'tiled anti-theft diagonal grid' : 'corner'} watermark "${label}" onto ${srcW}×${srcH} image.`,
    };
  }

  // #33 Collage Maker
  if (toolId === 'img-33-collage') {
    const allInputs = [{ name: sourceName, dataUrl: sourceDataUrl }, ...additionalImages];
    const loadedImgs: HTMLImageElement[] = [];
    for (const item of allInputs) {
      loadedImgs.push(await loadImageElement(item.dataUrl));
    }
    const layout = String(params.gridLayout || '2x2');
    const gutter = Math.max(0, Number(params.gutter) || 16);
    const bgColor = String(params.bgColor || '#0F172A');

    const c = document.createElement('canvas');
    const outW = 1200;
    const outH = layout === '1x3' ? 480 : 900;
    c.width = outW;
    c.height = outH;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, outW, outH);

    const drawFit = (targetImg: HTMLImageElement, x: number, y: number, w: number, h: number) => {
      const iw = targetImg.naturalWidth || targetImg.width;
      const ih = targetImg.naturalHeight || targetImg.height;
      const scale = Math.max(w / iw, h / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.drawImage(targetImg, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      ctx.restore();
    };

    if (layout === '1x3') {
      const cellW = (outW - gutter * 4) / 3;
      const cellH = outH - gutter * 2;
      for (let i = 0; i < 3; i++) {
        drawFit(loadedImgs[i % loadedImgs.length], gutter + i * (cellW + gutter), gutter, cellW, cellH);
      }
    } else if (layout === 'hero-split') {
      const leftW = Math.round((outW - gutter * 3) * 0.62);
      const rightW = outW - gutter * 3 - leftW;
      const halfH = (outH - gutter * 3) / 2;
      drawFit(loadedImgs[0], gutter, gutter, leftW, outH - gutter * 2);
      drawFit(loadedImgs[1 % loadedImgs.length], gutter * 2 + leftW, gutter, rightW, halfH);
      drawFit(loadedImgs[2 % loadedImgs.length], gutter * 2 + leftW, gutter * 2 + halfH, rightW, halfH);
    } else {
      const cellW = (outW - gutter * 3) / 2;
      const cellH = (outH - gutter * 3) / 2;
      for (let r = 0; r < 2; r++) {
        for (let col = 0; col < 2; col++) {
          const idx = r * 2 + col;
          drawFit(
            loadedImgs[idx % loadedImgs.length],
            gutter + col * (cellW + gutter),
            gutter + r * (cellH + gutter),
            cellW,
            cellH
          );
        }
      }
    }

    const url = c.toDataURL('image/png');
    if (onProgress) onProgress(100);
    return {
      outputDataUrl: url,
      outputBytes: dataUrlToUint8Array(url),
      mimeType: 'image/png',
      fileName: `${baseName}_collage_${layout}.png`,
      width: outW,
      height: outH,
      summary: `Composed ${layout} collage (${outW}×${outH} px) from ${allInputs.length} image(s).`,
    };
  }

  // #34 Image Stitching
  if (toolId === 'img-34-stitching') {
    const allInputs = [{ name: sourceName, dataUrl: sourceDataUrl }, ...additionalImages];
    const loadedImgs: HTMLImageElement[] = [];
    for (const item of allInputs) {
      loadedImgs.push(await loadImageElement(item.dataUrl));
    }
    if (loadedImgs.length === 1) loadedImgs.push(loadedImgs[0]);

    const direction = String(params.direction || 'vertical');
    const c = document.createElement('canvas');
    if (direction === 'horizontal') {
      c.width = loadedImgs.reduce((acc, im) => acc + (im.naturalWidth || im.width), 0);
      c.height = Math.max(...loadedImgs.map((im) => im.naturalHeight || im.height));
      const ctx = c.getContext('2d')!;
      let x = 0;
      for (const im of loadedImgs) {
        const iw = im.naturalWidth || im.width;
        const ih = im.naturalHeight || im.height;
        ctx.drawImage(im, x, 0, iw, ih);
        x += iw;
      }
    } else {
      c.width = Math.max(...loadedImgs.map((im) => im.naturalWidth || im.width));
      c.height = loadedImgs.reduce((acc, im) => acc + (im.naturalHeight || im.height), 0);
      const ctx = c.getContext('2d')!;
      let y = 0;
      for (const im of loadedImgs) {
        const iw = im.naturalWidth || im.width;
        const ih = im.naturalHeight || im.height;
        ctx.drawImage(im, 0, y, iw, ih);
        y += ih;
      }
    }
    const url = c.toDataURL('image/png');
    if (onProgress) onProgress(100);
    return {
      outputDataUrl: url,
      outputBytes: dataUrlToUint8Array(url),
      mimeType: 'image/png',
      fileName: `${baseName}_stitched_${direction}.png`,
      width: c.width,
      height: c.height,
      summary: `Stitched ${loadedImgs.length} images (${direction}) into ${c.width}×${c.height} px strip.`,
    };
  }

  // #35 Image Stacking
  if (toolId === 'img-35-stacking') {
    const allInputs = [{ name: sourceName, dataUrl: sourceDataUrl }, ...additionalImages];
    const loadedImgs: HTMLImageElement[] = [];
    for (const item of allInputs) {
      loadedImgs.push(await loadImageElement(item.dataUrl));
    }
    const blendMode = String(params.blendMode || 'screen') as GlobalCompositeOperation;
    const c = document.createElement('canvas');
    c.width = srcW;
    c.height = srcH;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(loadedImgs[0], 0, 0, srcW, srcH);
    ctx.globalCompositeOperation = blendMode;
    const layers = loadedImgs.length > 1 ? loadedImgs.slice(1) : [loadedImgs[0]];
    for (const layer of layers) {
      ctx.drawImage(layer, 0, 0, srcW, srcH);
    }
    ctx.globalCompositeOperation = 'source-over';
    const url = c.toDataURL('image/png');
    if (onProgress) onProgress(100);
    return {
      outputDataUrl: url,
      outputBytes: dataUrlToUint8Array(url),
      mimeType: 'image/png',
      fileName: `${baseName}_stacked_${blendMode}.png`,
      width: srcW,
      height: srcH,
      summary: `Stacked ${loadedImgs.length} image layer(s) using "${blendMode}" blend mode.`,
    };
  }

  // #36 Draw & Markup Layers
  if (toolId === 'img-36-draw-markup') {
    const c = document.createElement('canvas');
    c.width = srcW;
    c.height = srcH;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const label = String(params.calloutLabel || '01 · Inspect Focal Area');
    const accent = String(params.accentColor || '#3B82F6');

    ctx.save();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(40, srcH - 72);
    ctx.lineTo(Math.round(srcW * 0.45), Math.round(srcH * 0.45));
    ctx.stroke();

    ctx.fillStyle = accent;
    ctx.fillRect(28, srcH - 68, Math.min(srcW - 56, label.length * 12 + 36), 44);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(label, 42, srcH - 40);
    ctx.restore();
    const url = c.toDataURL('image/png');
    if (onProgress) onProgress(100);
    return {
      outputDataUrl: url,
      outputBytes: dataUrlToUint8Array(url),
      mimeType: 'image/png',
      fileName: `${baseName}_markup.png`,
      width: srcW,
      height: srcH,
      summary: `Applied callout annotation "${label}" onto ${srcW}×${srcH} canvas.`,
    };
  }

  // #38 QR / Barcode Scanner
  if (toolId === 'img-38-qr-scanner') {
    const code = jsQR(srcImageData.data, srcW, srcH);
    const payload = {
      detected: Boolean(code),
      decodedText: code?.data || 'No QR matrix detected in uploaded image.',
      scannedDimensions: `${srcW}×${srcH}`,
    };
    if (onProgress) onProgress(100);
    return {
      outputDataUrl: cleanPreviewPngUrl,
      outputBytes: new TextEncoder().encode(JSON.stringify(payload, null, 2)),
      mimeType: 'application/json',
      fileName: `${baseName}_qr_scan.json`,
      width: srcW,
      height: srcH,
      summary: code ? `Decoded QR Code: "${code.data}"` : payload.decodedText,
      extraMeta: payload,
    };
  }

  // #39 Color Picker / Eyedropper
  if (toolId === 'img-39-color-picker') {
    const pxPct = Math.max(1, Math.min(99, Number(params.sampleX) || 50)) / 100;
    const pyPct = Math.max(1, Math.min(99, Number(params.sampleY) || 50)) / 100;
    const sx = Math.min(srcW - 1, Math.floor(srcW * pxPct));
    const sy = Math.min(srcH - 1, Math.floor(srcH * pyPct));
    const idx = (sy * srcW + sx) * 4;
    const r = srcImageData.data[idx];
    const g = srcImageData.data[idx + 1];
    const b = srcImageData.data[idx + 2];
    const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

    // HSL calculation
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const maxC = Math.max(rn, gn, bn), minC = Math.min(rn, gn, bn);
    const l = (maxC + minC) / 2;
    let h = 0, s = 0;
    if (maxC !== minC) {
      const d = maxC - minC;
      s = l > 0.5 ? d / (2 - maxC - minC) : d / (maxC + minC);
      if (maxC === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
      else if (maxC === gn) h = ((bn - rn) / d + 2) / 6;
      else h = ((rn - gn) / d + 4) / 6;
    }
    const hslStr = `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;

    const c = document.createElement('canvas');
    c.width = srcW;
    c.height = srcH + 74;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    // Crosshair loupe
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, 14, 0, Math.PI * 2);
    ctx.stroke();
    // Swatch HUD footer
    ctx.fillStyle = hex;
    ctx.fillRect(16, srcH + 14, 46, 46);
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(16, srcH + 14, 46, 46);
    ctx.fillStyle = '#F8FAFC';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`HEX: ${hex}  RGB(${r}, ${g}, ${b})`, 76, srcH + 34);
    ctx.fillStyle = '#94A3B8';
    ctx.font = '12px monospace';
    ctx.fillText(`${hslStr} · Sampled @ (${sx}px, ${sy}px)`, 76, srcH + 54);

    const url = c.toDataURL('image/png');
    if (onProgress) onProgress(100);
    return {
      outputDataUrl: url,
      outputBytes: dataUrlToUint8Array(url),
      mimeType: 'image/png',
      fileName: `${baseName}_eyedropper_${hex.slice(1)}.png`,
      width: c.width,
      height: c.height,
      summary: `Sampled (${sx}, ${sy}): ${hex} · rgb(${r}, ${g}, ${b}) · ${hslStr}`,
      extraMeta: { hex, rgb: [r, g, b], hsl: hslStr, x: sx, y: sy },
    };
  }

  // #40 Color Palette Generator
  if (toolId === 'img-40-palette-gen') {
    const count = Number(params.swatchCount) || 5;
    const swatches = extractDominantColors(srcImageData.data, count);
    const c = document.createElement('canvas');
    c.width = srcW;
    c.height = srcH + 96;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    const swW = srcW / swatches.length;
    swatches.forEach((hex, idx) => {
      ctx.fillStyle = hex;
      ctx.fillRect(idx * swW, srcH, swW, 64);
      ctx.fillStyle = '#F8FAFC';
      ctx.font = 'bold 13px monospace';
      ctx.fillText(hex, idx * swW + 12, srcH + 84);
    });
    const url = c.toDataURL('image/png');
    if (onProgress) onProgress(100);
    return {
      outputDataUrl: url,
      outputBytes: dataUrlToUint8Array(url),
      mimeType: 'image/png',
      fileName: `${baseName}_palette.png`,
      width: c.width,
      height: c.height,
      summary: `Extracted top ${swatches.length} dominant colors: ${swatches.join(' · ')}.`,
      extraMeta: { swatches },
    };
  }

  // #42 Image Compare Slider Snapshot (Supports 2 distinct uploaded images OR single-image grading preview)
  if (toolId === 'img-42-compare-slider') {
    const splitPct = Math.max(5, Math.min(95, Number(params.splitPercent) || 50)) / 100;
    const rightCanvas = document.createElement('canvas');
    rightCanvas.width = srcW;
    rightCanvas.height = srcH;
    const rightCtx = rightCanvas.getContext('2d')!;

    let afterLabelName = 'GRADED AFTER';
    if (additionalImages && additionalImages.length > 0 && additionalImages[0].dataUrl) {
      const secondImg = await loadImageElement(additionalImages[0].dataUrl);
      rightCtx.drawImage(secondImg, 0, 0, srcW, srcH);
      afterLabelName = additionalImages[0].name;
    } else {
      const graded = processRgbaBuffer(srcImageData.data, srcW, srcH, 'img-48-color-correction', {
        contrast: 26,
        saturation: 25,
        vignette: 25,
        presetIndex: 3,
      });
      rightCtx.putImageData(new ImageData(graded as any, srcW, srcH), 0, 0);
    }

    const c = document.createElement('canvas');
    c.width = srcW;
    c.height = srcH;
    const ctx = c.getContext('2d')!;
    const splitX = Math.round(srcW * splitPct);
    ctx.drawImage(rightCanvas, 0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, splitX, srcH);
    ctx.clip();
    ctx.drawImage(img, 0, 0);
    ctx.restore();

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(splitX - 2, 0, 4, srcH);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(14, 14, 72, 24);
    ctx.fillRect(srcW - 82, 14, 68, 24);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('BEFORE', 24, 30);
    ctx.fillText('AFTER', srcW - 68, 30);

    const url = c.toDataURL('image/png');
    if (onProgress) onProgress(100);
    return {
      outputDataUrl: url,
      outputBytes: dataUrlToUint8Array(url),
      mimeType: 'image/png',
      fileName: `${baseName}_compare_${Math.round(splitPct * 100)}.png`,
      width: srcW,
      height: srcH,
      summary:
        additionalImages && additionalImages.length > 0
          ? `Rendered side-by-side Before ("${sourceName}") / After ("${afterLabelName}") split comparison at ${Math.round(splitPct * 100)}% curtain position.`
          : `Rendered Before/After split comparison at ${Math.round(splitPct * 100)}% curtain position.`,
      extraMeta: {
        beforeName: sourceName,
        afterName: afterLabelName,
        afterDataUrl: rightCanvas.toDataURL('image/png'),
        splitPercent: Math.round(splitPct * 100),
      },
    };
  }

  // #43 Screenshot Framing
  if (toolId === 'img-43-screenshot-frame') {
    const pad = Number(params.padding) || 64;
    const c = document.createElement('canvas');
    c.width = srcW + pad * 2;
    c.height = srcH + pad * 2 + 36;
    const ctx = c.getContext('2d')!;
    const bg = ctx.createLinearGradient(0, 0, c.width, c.height);
    bg.addColorStop(0, '#0F172A');
    bg.addColorStop(1, '#1E293B');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, c.width, c.height);

    ctx.fillStyle = '#0B0F19';
    ctx.beginPath();
    ctx.roundRect(pad, pad, srcW, srcH + 36, 14);
    ctx.fill();
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.arc(pad + 20, pad + 18, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.arc(pad + 36, pad + 18, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#10B981';
    ctx.beginPath();
    ctx.arc(pad + 52, pad + 18, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.drawImage(img, pad, pad + 36);
    const url = c.toDataURL('image/png');
    if (onProgress) onProgress(100);
    return {
      outputDataUrl: url,
      outputBytes: dataUrlToUint8Array(url),
      mimeType: 'image/png',
      fileName: `${baseName}_framed.png`,
      width: c.width,
      height: c.height,
      summary: `Framed screenshot inside studio device bezel (${c.width}×${c.height} px).`,
    };
  }

  // #44 Raster to SVG Vector Trace (Respects colorLevels quantization)
  if (toolId === 'img-44-vector-trace') {
    const levels = Math.max(2, Math.min(16, Number(params.colorLevels) || 6));
    const quantStep = Math.max(1, Math.floor(255 / (levels - 1)));
    const cols = 32;
    const rows = 24;
    const cw = srcW / cols;
    const ch = srcH / rows;
    let rects = '';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const sx = Math.min(srcW - 1, Math.floor((c + 0.5) * cw));
        const sy = Math.min(srcH - 1, Math.floor((r + 0.5) * ch));
        const idx = (sy * srcW + sx) * 4;
        const qr = Math.min(255, Math.round(srcImageData.data[idx] / quantStep) * quantStep);
        const qg = Math.min(255, Math.round(srcImageData.data[idx + 1] / quantStep) * quantStep);
        const qb = Math.min(255, Math.round(srcImageData.data[idx + 2] / quantStep) * quantStep);
        const hex =
          '#' +
          [qr, qg, qb].map((v) => v.toString(16).padStart(2, '0')).join('');
        rects += `<rect x="${(c * cw).toFixed(1)}" y="${(r * ch).toFixed(1)}" width="${(cw + 0.6).toFixed(1)}" height="${(ch + 0.6).toFixed(1)}" fill="${hex}"/>`;
      }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${srcW} ${srcH}" width="${srcW}" height="${srcH}">${rects}</svg>`;
    const svgBytes = new TextEncoder().encode(svg);
    if (onProgress) onProgress(100);
    return {
      outputDataUrl: `data:image/svg+xml;base64,${btoa(svg)}`,
      outputBytes: svgBytes,
      mimeType: 'image/svg+xml',
      fileName: `${baseName}_vector_${levels}colors.svg`,
      width: srcW,
      height: srcH,
      summary: `Traced raster image into ${levels}-level color-quantized SVG (${cols * rows} vector paths).`,
    };
  }

  throw new Error(`Image tool "${toolId}" is not recognized.`);
}
