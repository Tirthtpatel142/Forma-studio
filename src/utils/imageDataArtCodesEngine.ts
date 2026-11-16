// Pure, deterministic client-side algorithms for Image Studio Category 07: "Data, Art & Codes" (#56–#60)
// Zero DOM requirement for core byte/pixel transformations so they can be unit-tested in Node.js

export type BinaryHexFormat = 'binary' | 'hex';
export type BinaryHexDelimiter = 'space' | 'none';

export interface ImageToCodeResult {
  codeText: string;
  previewText: string;
  truncated: boolean;
  totalBytes: number;
  totalChars: number;
}

export function bytesToBinaryHexString(
  bytes: Uint8Array,
  format: BinaryHexFormat,
  delimiter: BinaryHexDelimiter,
  previewLimit = 10000
): ImageToCodeResult {
  const sep = delimiter === 'space' ? ' ' : '';
  const parts: string[] = new Array(bytes.length);
  if (format === 'binary') {
    for (let i = 0; i < bytes.length; i++) {
      parts[i] = bytes[i].toString(2).padStart(8, '0');
    }
  } else {
    for (let i = 0; i < bytes.length; i++) {
      parts[i] = bytes[i].toString(16).toUpperCase().padStart(2, '0');
    }
  }
  const codeText = parts.join(sep);
  const truncated = codeText.length > previewLimit;
  const previewText = truncated ? codeText.slice(0, previewLimit) : codeText;
  return {
    codeText,
    previewText,
    truncated,
    totalBytes: bytes.length,
    totalChars: codeText.length,
  };
}

export function detectMimeTypeFromBytes(bytes: Uint8Array): string {
  if (bytes.length >= 4) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return 'image/png';
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return 'image/jpeg';
    }
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
      return 'image/gif';
    }
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
      return 'image/webp';
    }
    if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
      return 'image/bmp';
    }
  }
  // Check if UTF-8 text starts with <svg
  try {
    const head = new TextDecoder().decode(bytes.slice(0, 120)).trim().toLowerCase();
    if (head.startsWith('<svg') || head.includes('<svg')) {
      return 'image/svg+xml';
    }
  } catch {
    // ignore
  }
  return 'image/png';
}

export function parseBinaryHexToBytes(
  rawInput: string,
  mode: 'auto' | 'binary' | 'hex' = 'auto'
): { valid: boolean; error?: string; bytes: Uint8Array; detectedFormat: 'binary' | 'hex'; mimeType: string } {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      valid: false,
      error: 'Paste Binary (0/1) or Hexadecimal byte stream to reconstruct the image.',
      bytes: new Uint8Array(),
      detectedFormat: 'hex',
      mimeType: 'image/png',
    };
  }

  const compact = trimmed.replace(/0x/gi, '').replace(/[\s,;:\-_]+/g, '');
  if (!compact) {
    return {
      valid: false,
      error: 'Input contains only whitespace or delimiters.',
      bytes: new Uint8Array(),
      detectedFormat: 'hex',
      mimeType: 'image/png',
    };
  }

  const isOnlyZeroOne = /^[01]+$/.test(compact);
  const detectedFormat: 'binary' | 'hex' =
    mode === 'binary'
      ? 'binary'
      : mode === 'hex'
      ? 'hex'
      : isOnlyZeroOne && compact.length % 8 === 0
      ? 'binary'
      : 'hex';

  if (detectedFormat === 'binary') {
    if (!/^[01]+$/.test(compact)) {
      return {
        valid: false,
        error: 'Binary stream contains characters other than 0 and 1.',
        bytes: new Uint8Array(),
        detectedFormat: 'binary',
        mimeType: 'image/png',
      };
    }
    if (compact.length % 8 !== 0) {
      return {
        valid: false,
        error: `Binary stream length (${compact.length} bits) must be a multiple of 8 bits.`,
        bytes: new Uint8Array(),
        detectedFormat: 'binary',
        mimeType: 'image/png',
      };
    }
    const byteLen = compact.length / 8;
    const out = new Uint8Array(byteLen);
    for (let i = 0; i < byteLen; i++) {
      out[i] = parseInt(compact.slice(i * 8, i * 8 + 8), 2);
    }
    return {
      valid: true,
      bytes: out,
      detectedFormat: 'binary',
      mimeType: detectMimeTypeFromBytes(out),
    };
  } else {
    if (!/^[0-9a-fA-F]+$/.test(compact)) {
      return {
        valid: false,
        error: 'Hexadecimal stream contains invalid non-hex characters (expected 0-9, A-F).',
        bytes: new Uint8Array(),
        detectedFormat: 'hex',
        mimeType: 'image/png',
      };
    }
    const normalized = compact.length % 2 === 1 ? '0' + compact : compact;
    const byteLen = normalized.length / 2;
    const out = new Uint8Array(byteLen);
    for (let i = 0; i < byteLen; i++) {
      out[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
    }
    return {
      valid: true,
      bytes: out,
      detectedFormat: 'hex',
      mimeType: detectMimeTypeFromBytes(out),
    };
  }
}

export type Base64WrapperFormat = 'data-uri' | 'raw-base64' | 'html-img' | 'css-bg';

export function formatImageDataUriOutput(
  dataUrl: string,
  wrapperFormat: Base64WrapperFormat,
  altText = 'Image'
): { formatted: string; rawBase64: string; mimeType: string; base64CharLength: number } {
  const commaIdx = dataUrl.indexOf(',');
  const header = commaIdx >= 0 ? dataUrl.slice(0, commaIdx) : 'data:image/png;base64';
  const rawBase64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1).trim() : dataUrl.trim();
  const mimeMatch = header.match(/data:([^;]+)/i);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
  const fullDataUri = `data:${mimeType};base64,${rawBase64}`;

  let formatted = fullDataUri;
  if (wrapperFormat === 'raw-base64') {
    formatted = rawBase64;
  } else if (wrapperFormat === 'html-img') {
    formatted = `<img src="${fullDataUri}" alt="${altText.replace(/"/g, '&quot;')}" />`;
  } else if (wrapperFormat === 'css-bg') {
    formatted = `background-image: url("${fullDataUri}");\nbackground-size: cover;\nbackground-position: center;`;
  }

  return {
    formatted,
    rawBase64,
    mimeType,
    base64CharLength: rawBase64.length,
  };
}

export function normalizeBase64ToDataUri(rawInput: string): {
  valid: boolean;
  error?: string;
  dataUri: string;
  mimeType: string;
} {
  let trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      valid: false,
      error: 'Paste a Base64 string, Data URI, HTML <img> tag, or CSS background-image snippet.',
      dataUri: '',
      mimeType: 'image/png',
    };
  }

  // Extract from HTML src="..." or CSS url("...") if user pasted a wrapper
  const srcMatch = trimmed.match(/src=["']([^"']+)["']/i);
  if (srcMatch) trimmed = srcMatch[1].trim();
  const urlMatch = trimmed.match(/url\(["']?([^"')]+)["']?\)/i);
  if (urlMatch) trimmed = urlMatch[1].trim();

  if (trimmed.startsWith('data:image/')) {
    const mimeMatch = trimmed.match(/^data:([^;]+);base64,/i);
    return {
      valid: true,
      dataUri: trimmed,
      mimeType: mimeMatch ? mimeMatch[1] : 'image/png',
    };
  }

  const cleaned = trimmed.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=_-]+$/.test(cleaned) || cleaned.length < 8) {
    return {
      valid: false,
      error: 'Invalid Base64 sequence. Ensure you pasted valid Base64 or a data:image/... URI.',
      dataUri: '',
      mimeType: 'image/png',
    };
  }

  // Normalize URL-safe base64 if needed
  let stdBase64 = cleaned.replace(/-/g, '+').replace(/_/g, '/');
  while (stdBase64.length % 4 !== 0) {
    stdBase64 += '=';
  }

  let mimeType = 'image/png';
  if (stdBase64.startsWith('/9j/')) mimeType = 'image/jpeg';
  else if (stdBase64.startsWith('R0lGOD')) mimeType = 'image/gif';
  else if (stdBase64.startsWith('UklGR')) mimeType = 'image/webp';
  else if (stdBase64.startsWith('Qk')) mimeType = 'image/bmp';

  return {
    valid: true,
    dataUri: `data:${mimeType};base64,${stdBase64}`,
    mimeType,
  };
}

// #58 Image to ASCII / Matrix Art Generator
export type AsciiArtStylePreset = 'classic' | 'detailed' | 'matrix-binary' | 'block-shade';

export interface AsciiArtCell {
  char: string;
  r: number;
  g: number;
  b: number;
}

export function generateAsciiArtFromRgba(
  rgba: Uint8ClampedArray | Uint8Array,
  imgWidth: number,
  imgHeight: number,
  targetCols: number,
  stylePreset: AsciiArtStylePreset,
  invertBrightness: boolean
): { text: string; rows: AsciiArtCell[][]; colsCount: number; rowsCount: number } {
  const colsCount = Math.max(20, Math.min(240, Math.round(targetCols)));
  // Character cells are ~2x taller than wide, so adjust vertical step by 0.5
  const aspectRatio = imgHeight / Math.max(1, imgWidth);
  const rowsCount = Math.max(10, Math.round(colsCount * aspectRatio * 0.52));

  let ramp = '@%#*+=-:. ';
  if (stylePreset === 'detailed') {
    ramp = '$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,"^`\'. ';
  } else if (stylePreset === 'matrix-binary') {
    ramp = '10 ';
  } else if (stylePreset === 'block-shade') {
    ramp = '█▓▒░ ';
  }

  const rows: AsciiArtCell[][] = [];
  const textLines: string[] = [];

  for (let row = 0; row < rowsCount; row++) {
    const srcY = Math.min(imgHeight - 1, Math.floor((row / rowsCount) * imgHeight));
    const rowCells: AsciiArtCell[] = [];
    let lineStr = '';

    for (let col = 0; col < colsCount; col++) {
      const srcX = Math.min(imgWidth - 1, Math.floor((col / colsCount) * imgWidth));
      const idx = (srcY * imgWidth + srcX) * 4;
      const r = rgba[idx] ?? 0;
      const g = rgba[idx + 1] ?? 0;
      const b = rgba[idx + 2] ?? 0;
      const a = rgba[idx + 3] ?? 255;

      // Perceived luminance (0..255)
      let lum = (0.299 * r + 0.587 * g + 0.114 * b) * (a / 255);
      if (invertBrightness) {
        lum = 255 - lum;
      }

      let char: string;
      if (stylePreset === 'matrix-binary') {
        if (lum < 48) {
          char = ' ';
        } else {
          char = (row + col + Math.round(lum)) % 2 === 0 ? '1' : '0';
        }
      } else {
        const rampIdx = Math.min(
          ramp.length - 1,
          Math.max(0, Math.floor((lum / 255) * (ramp.length - 1)))
        );
        char = ramp[rampIdx];
      }

      rowCells.push({ char, r, g, b });
      lineStr += char;
    }

    rows.push(rowCells);
    textLines.push(lineStr);
  }

  return {
    text: textLines.join('\n'),
    rows,
    colsCount,
    rowsCount,
  };
}

// #59 Secret Message in Image (LSB Steganography)
const STEGO_MAGIC = 'FSLSB1:'; // 7 ASCII bytes

function xorTransformPayload(payload: Uint8Array, passphrase: string): Uint8Array {
  if (!passphrase) return payload;
  const keyBytes = new TextEncoder().encode(passphrase);
  const out = new Uint8Array(payload.length);
  for (let i = 0; i < payload.length; i++) {
    const k = keyBytes[i % keyBytes.length] ^ ((i * 31) & 0xff);
    out[i] = payload[i] ^ k;
  }
  return out;
}

export function calculateMaxLsbCapacityBytes(width: number, height: number): number {
  const totalPixels = Math.max(0, width * height);
  const totalRgbBits = totalPixels * 3;
  const totalBytes = Math.floor(totalRgbBits / 8);
  // 12 bytes reserved for magic header + 4-byte uint32 length + 1-byte flag
  return Math.max(0, totalBytes - 12);
}

export function encodeLsbStegoRgba(
  sourceRgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  secretMessage: string,
  passphrase = ''
): { valid: boolean; error?: string; stegoRgba: Uint8ClampedArray; payloadBytes: number; maxCapacityBytes: number } {
  const maxCapacityBytes = calculateMaxLsbCapacityBytes(width, height);
  const msgBytes = new TextEncoder().encode(secretMessage);

  if (!secretMessage) {
    return {
      valid: false,
      error: 'Enter a secret message to embed into the image pixels.',
      stegoRgba: new Uint8ClampedArray(sourceRgba),
      payloadBytes: 0,
      maxCapacityBytes,
    };
  }

  if (msgBytes.length > maxCapacityBytes) {
    return {
      valid: false,
      error: `Message size (${msgBytes.length} bytes) exceeds this image's lossless LSB capacity (${maxCapacityBytes} bytes). Use a larger image or shorter text.`,
      stegoRgba: new Uint8ClampedArray(sourceRgba),
      payloadBytes: msgBytes.length,
      maxCapacityBytes,
    };
  }

  const magicBytes = new TextEncoder().encode(STEGO_MAGIC); // 7 bytes
  const encryptedFlag = passphrase ? 1 : 0;
  const transformedMsg = xorTransformPayload(msgBytes, passphrase);

  // Frame layout: [7B magic][1B encryptedFlag][4B uint32 big-endian length][N bytes payload]
  const frameLen = 7 + 1 + 4 + transformedMsg.length;
  const frame = new Uint8Array(frameLen);
  frame.set(magicBytes, 0);
  frame[7] = encryptedFlag;
  const len = transformedMsg.length;
  frame[8] = (len >>> 24) & 0xff;
  frame[9] = (len >>> 16) & 0xff;
  frame[10] = (len >>> 8) & 0xff;
  frame[11] = len & 0xff;
  frame.set(transformedMsg, 12);

  const stegoRgba = new Uint8ClampedArray(sourceRgba);
  // Ensure all alpha channel bytes are 255 so browser canvas doesn't premultiply and corrupt RGB LSBs
  for (let p = 3; p < stegoRgba.length; p += 4) {
    stegoRgba[p] = 255;
  }

  let bitIndex = 0;
  const totalBits = frame.length * 8;

  for (let i = 0; i < stegoRgba.length && bitIndex < totalBits; i++) {
    // Skip alpha channel (every 4th byte: i % 4 === 3)
    if (i % 4 === 3) continue;
    const bytePos = bitIndex >>> 3;
    const bitOffset = 7 - (bitIndex & 7);
    const bit = (frame[bytePos] >>> bitOffset) & 1;
    stegoRgba[i] = (stegoRgba[i] & 0xfe) | bit;
    bitIndex++;
  }

  return {
    valid: true,
    stegoRgba,
    payloadBytes: msgBytes.length,
    maxCapacityBytes,
  };
}

export function decodeLsbStegoRgba(
  rgba: Uint8ClampedArray | Uint8Array,
  passphrase = ''
): { valid: boolean; error?: string; message: string; encrypted: boolean; byteLength: number } {
  const totalRgbChannels = Math.floor(rgba.length / 4) * 3;
  if (totalRgbChannels < 12 * 8) {
    return {
      valid: false,
      error: 'Image is too small to contain an LSB steganography header.',
      message: '',
      encrypted: false,
      byteLength: 0,
    };
  }

  const readBytesFromLsb = (startByte: number, countBytes: number): Uint8Array => {
    const out = new Uint8Array(countBytes);
    const startBit = startByte * 8;
    const endBit = (startByte + countBytes) * 8;

    for (let bitIdx = startBit; bitIdx < endBit; bitIdx++) {
      const pixelIndex = Math.floor(bitIdx / 3);
      const channelOffset = bitIdx % 3;
      const rgbaIdx = pixelIndex * 4 + channelOffset;
      const bit = (rgba[rgbaIdx] ?? 0) & 1;
      const outByteIdx = Math.floor((bitIdx - startBit) / 8);
      const outBitOffset = 7 - ((bitIdx - startBit) % 8);
      out[outByteIdx] |= bit << outBitOffset;
    }
    return out;
  };

  const header = readBytesFromLsb(0, 12);
  const magicStr = new TextDecoder().decode(header.slice(0, 7));
  if (magicStr !== STEGO_MAGIC) {
    return {
      valid: false,
      error: 'No LSB secret message found in this image (missing FORMA LSB signature). Note: lossy JPG compression destroys LSB data; always use the lossless Stego PNG.',
      message: '',
      encrypted: false,
      byteLength: 0,
    };
  }

  const encryptedFlag = header[7] === 1;
  const payloadLen =
    ((header[8] << 24) >>> 0) + (header[9] << 16) + (header[10] << 8) + header[11];

  const maxPossibleBytes = Math.floor(totalRgbChannels / 8) - 12;
  if (payloadLen <= 0 || payloadLen > maxPossibleBytes) {
    return {
      valid: false,
      error: 'Corrupted LSB payload length header.',
      message: '',
      encrypted: encryptedFlag,
      byteLength: 0,
    };
  }

  if (encryptedFlag && !passphrase) {
    return {
      valid: false,
      error: 'This hidden message is protected with a passphrase. Enter the passphrase to decrypt and reveal it.',
      message: '',
      encrypted: true,
      byteLength: payloadLen,
    };
  }

  const rawPayload = readBytesFromLsb(12, payloadLen);
  const plainBytes = encryptedFlag ? xorTransformPayload(rawPayload, passphrase) : rawPayload;
  const message = new TextDecoder('utf-8', { fatal: false }).decode(plainBytes);

  return {
    valid: true,
    message,
    encrypted: encryptedFlag,
    byteLength: payloadLen,
  };
}

// #60 Code128 Subset B Barcode Generator & Simple Scanner
// Standard Code128B patterns (values 0..106)
const CODE128_PATTERNS: string[] = [
  '11011001100', '11001101100', '11001100110', '10010011000', '10010001100', '10001001100',
  '10011001000', '10011000100', '10001100100', '11001001000', '11001000100', '11000100100',
  '10110011100', '10011011100', '10011001110', '10111001100', '10011101100', '10011100110',
  '11001110010', '11001011100', '11001001110', '11011100100', '11001110100', '11101101110',
  '11101001100', '11100101100', '11100100110', '11101100100', '11100110100', '11100110010',
  '11011011000', '11011000110', '11000110110', '10100011000', '10001011000', '10001000110',
  '10110001000', '10001101000', '10001100010', '11010001000', '11000101000', '11000100010',
  '10110111000', '10110001110', '10001101110', '10111011000', '10111000110', '10001110110',
  '11101110110', '11010001110', '11000101110', '11011101000', '11011100010', '11011101110',
  '11101011000', '11101000110', '11100010110', '11101101000', '11101100010', '11100011010',
  '11101111010', '11001000010', '11110001010', '10100110000', '10100001100', '10010110000',
  '10010000110', '10000101100', '10000100110', '10110010000', '10110000100', '10011010000',
  '10011000010', '10000110100', '10000110010', '11000010010', '11001010000', '11110111010',
  '11000010100', '10001111010', '10100111100', '10010111100', '10010011110', '10111100100',
  '10011110100', '10011110010', '11110100100', '11110010100', '11110010010', '11011011110',
  '11011110110', '11110110110', '10101111000', '10100011110', '10001011110', '10111101000',
  '10111100010', '11110101000', '11110100010', '10111011110', '10111101110', '11101011110',
  '11110101110', '11010000100', '11010010000', '11010011100', '1100011101011',
];

export function encodeCode128Bars(input: string): { valid: boolean; error?: string; bits: string; cleanText: string } {
  const cleanText = input.trim();
  if (!cleanText) {
    return { valid: false, error: 'Enter ASCII text (e.g., FORMA-2026) to generate a Code128 barcode.', bits: '', cleanText: '' };
  }
  for (let i = 0; i < cleanText.length; i++) {
    const code = cleanText.charCodeAt(i);
    if (code < 32 || code > 126) {
      return {
        valid: false,
        error: `Character "${cleanText[i]}" is outside standard printable ASCII (32–126) for Code128-B.`,
        bits: '',
        cleanText,
      };
    }
  }

  // Start Code B = 104
  const codes: number[] = [104];
  let checksum = 104;
  for (let i = 0; i < cleanText.length; i++) {
    const val = cleanText.charCodeAt(i) - 32;
    codes.push(val);
    checksum += val * (i + 1);
  }
  codes.push(checksum % 103);
  codes.push(106); // Stop pattern

  const bits = codes.map((c) => CODE128_PATTERNS[c]).join('');
  return { valid: true, bits, cleanText };
}

export function buildCode128SvgString(
  text: string,
  sizePx = 320,
  fgColor = '#000000',
  bgColor = '#FFFFFF'
): { valid: boolean; error?: string; svg: string } {
  const encoded = encodeCode128Bars(text);
  if (!encoded.valid) {
    return { valid: false, error: encoded.error, svg: '' };
  }
  const quietZoneModules = 10;
  const totalModules = encoded.bits.length + quietZoneModules * 2;
  const width = Math.max(200, sizePx);
  const height = Math.round(width * 0.45);
  const moduleWidth = width / totalModules;
  const barTop = 18;
  const barHeight = Math.max(40, height - 48);

  const rects: string[] = [];
  for (let i = 0; i < encoded.bits.length; i++) {
    if (encoded.bits[i] === '1') {
      const x = (quietZoneModules + i) * moduleWidth;
      rects.push(
        `<rect x="${x.toFixed(2)}" y="${barTop}" width="${(moduleWidth + 0.15).toFixed(2)}" height="${barHeight}" fill="${fgColor}" />`
      );
    }
  }

  const safeLabel = encoded.cleanText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" data-code128-text="${safeLabel}">
  <rect width="100%" height="100%" fill="${bgColor}" />
  ${rects.join('\n  ')}
  <text x="${width / 2}" y="${barTop + barHeight + 20}" fill="${fgColor}" font-family="monospace" font-size="14" font-weight="bold" text-anchor="middle">${safeLabel}</text>
</svg>`;

  return { valid: true, svg };
}
