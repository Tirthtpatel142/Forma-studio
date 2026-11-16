import React, { useState, useEffect, useRef, useMemo } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import {
  Upload,
  Download,
  Copy,
  Trash2,
  Binary,
  FileCode,
  Terminal,
  Lock,
  Unlock,
  QrCode,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Menu,
  ArrowRightLeft,
  ClipboardPaste,
} from 'lucide-react';
import { StudioTool } from '../data/toolsCatalog';
import {
  copyTextToClipboard,
  readTextFromClipboard,
} from '../utils/browserCapabilities';
import {
  BinaryHexFormat,
  BinaryHexDelimiter,
  bytesToBinaryHexString,
  parseBinaryHexToBytes,
  Base64WrapperFormat,
  formatImageDataUriOutput,
  normalizeBase64ToDataUri,
  AsciiArtStylePreset,
  generateAsciiArtFromRgba,
  AsciiArtCell,
  calculateMaxLsbCapacityBytes,
  encodeLsbStegoRgba,
  decodeLsbStegoRgba,
  buildCode128SvgString,
} from '../utils/imageDataArtCodesEngine';

export interface DataArtWorkspaceFile {
  id: string;
  name: string;
  sizeBytes: number;
  rawBytes?: Uint8Array;
  imageDataUrl?: string;
  dimensions?: string;
}

interface ImageDataArtCodesWorkbenchProps {
  activeTool: StudioTool;
  activeFile: DataArtWorkspaceFile | null;
  onUploadFile: (file: File) => Promise<void>;
  onClearFile: () => void;
  onOpenDirectory: () => void;
  onOpenMobileDrawer: () => void;
  onRecordCompletedOutput: (item: {
    fileName: string;
    mimeType: string;
    outputBytes: Uint8Array;
    imageDataUrl?: string;
    summary: string;
  }) => void;
  onNotify: (message: string, tone?: 'success' | 'info' | 'warning') => void;
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const parts = dataUrl.split(',');
  if (parts.length < 2) return new Uint8Array();
  try {
    const bin = atob(parts[1] || '');
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  } catch {
    return new Uint8Array();
  }
}

function uint8ArrayToDataUrl(bytes: Uint8Array, mimeType = 'image/png'): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

function downloadBlobBytes(fileName: string, mimeType: string, bytes: Uint8Array) {
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
    type: mimeType,
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

function downloadTextFile(fileName: string, content: string, mimeType = 'text/plain;charset=utf-8') {
  const bytes = new TextEncoder().encode(content);
  downloadBlobBytes(fileName, mimeType, bytes);
}

export const ImageDataArtCodesWorkbench: React.FC<ImageDataArtCodesWorkbenchProps> = ({
  activeTool,
  activeFile,
  onUploadFile,
  onClearFile,
  onOpenDirectory,
  onOpenMobileDrawer,
  onRecordCompletedOutput,
  onNotify,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const txtInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // ============================================================================
  // Tool #56: Image ↔ Binary (0/1) & Hex Converter State
  // ============================================================================
  const [t56Mode, setT56Mode] = useState<'image-to-code' | 'code-to-image'>('image-to-code');
  const [t56Format, setT56Format] = useState<BinaryHexFormat>('hex');
  const [t56Delimiter, setT56Delimiter] = useState<BinaryHexDelimiter>('space');
  const [t56CodeInput, setT56CodeInput] = useState<string>('');
  const [t56DecodeMode, setT56DecodeMode] = useState<'auto' | 'binary' | 'hex'>('auto');
  const [t56ReconstructedDims, setT56ReconstructedDims] = useState<string>('');

  // ============================================================================
  // Tool #57: Image ↔ Base64 Data URI Converter State
  // ============================================================================
  const [t57Mode, setT57Mode] = useState<'image-to-base64' | 'base64-to-image'>('image-to-base64');
  const [t57Wrapper, setT57Wrapper] = useState<Base64WrapperFormat>('data-uri');
  const [t57Base64Input, setT57Base64Input] = useState<string>('');
  const [t57OutputFormat, setT57OutputFormat] = useState<'image/png' | 'image/jpeg' | 'image/webp'>('image/png');
  const [t57ConvertedDataUrl, setT57ConvertedDataUrl] = useState<string>('');
  const [t57ConvertedDims, setT57ConvertedDims] = useState<{ w: number; h: number; bytes: number } | null>(null);
  const [t57Error, setT57Error] = useState<string | null>(null);

  // ============================================================================
  // Tool #58: Image to ASCII / Matrix Art Generator State
  // ============================================================================
  const [t58Style, setT58Style] = useState<AsciiArtStylePreset>('classic');
  const [t58Cols, setT58Cols] = useState<number>(90);
  const [t58Invert, setT58Invert] = useState<boolean>(false);
  const [t58ColorMode, setT58ColorMode] = useState<'monochrome' | 'color'>('monochrome');
  const [t58AsciiResult, setT58AsciiResult] = useState<{
    text: string;
    rows: AsciiArtCell[][];
    colsCount: number;
    rowsCount: number;
    styledPngUrl: string;
  } | null>(null);

  // ============================================================================
  // Tool #59: Secret Message in Image (LSB Steganography) State
  // ============================================================================
  const [t59Mode, setT59Mode] = useState<'hide' | 'reveal'>('hide');
  const [t59SecretMessage, setT59SecretMessage] = useState<string>('');
  const [t59Passphrase, setT59Passphrase] = useState<string>('');
  const [t59ImgMeta, setT59ImgMeta] = useState<{
    width: number;
    height: number;
    maxCapacityBytes: number;
    rgba: Uint8ClampedArray;
  } | null>(null);
  const [t59EncodedStegoUrl, setT59EncodedStegoUrl] = useState<string>('');
  const [t59EncodedBytes, setT59EncodedBytes] = useState<Uint8Array | null>(null);
  const [t59EncodeError, setT59EncodeError] = useState<string | null>(null);
  const [t59RevealedMessage, setT59RevealedMessage] = useState<string | null>(null);
  const [t59RevealError, setT59RevealError] = useState<string | null>(null);

  // ============================================================================
  // Tool #60: QR Code & Barcode Generator / Scanner State
  // ============================================================================
  const [t60Mode, setT60Mode] = useState<'generate' | 'scan'>('generate');
  const [t60InputText, setT60InputText] = useState<string>('https://forma.studio');
  const [t60CodeType, setT60CodeType] = useState<'qr' | 'code128'>('qr');
  const [t60Size, setT60Size] = useState<number>(320);
  const [t60FgColor, setT60FgColor] = useState<string>('#0F172A');
  const [t60BgColor, setT60BgColor] = useState<string>('#FFFFFF');
  const [t60Ecc, setT60Ecc] = useState<'L' | 'M' | 'Q' | 'H'>('M');
  const [t60GeneratedPngUrl, setT60GeneratedPngUrl] = useState<string>('');
  const [t60GeneratedSvgText, setT60GeneratedSvgText] = useState<string>('');
  const [t60GenerateError, setT60GenerateError] = useState<string | null>(null);
  const [t60ScannedResult, setT60ScannedResult] = useState<{
    found: boolean;
    text: string;
    formatLabel: string;
    error?: string;
  } | null>(null);

  // Active file bytes helper
  const activeFileBytes = useMemo(() => {
    if (!activeFile) return null;
    if (activeFile.rawBytes && activeFile.rawBytes.byteLength > 0) {
      return activeFile.rawBytes;
    }
    if (activeFile.imageDataUrl) {
      return dataUrlToUint8Array(activeFile.imageDataUrl);
    }
    return null;
  }, [activeFile]);

  // #56 Image -> Code live computation
  const t56ImageToCodeOutput = useMemo(() => {
    if (!activeFileBytes || activeFileBytes.length === 0) return null;
    return bytesToBinaryHexString(activeFileBytes, t56Format, t56Delimiter, 10000);
  }, [activeFileBytes, t56Format, t56Delimiter]);

  // #56 Code -> Image live computation
  const t56CodeToImageResult = useMemo(() => {
    if (!t56CodeInput.trim()) return null;
    const parsed = parseBinaryHexToBytes(t56CodeInput, t56DecodeMode);
    if (!parsed.valid) {
      return { valid: false as const, error: parsed.error || 'Invalid byte stream.' };
    }
    const dataUrl = uint8ArrayToDataUrl(parsed.bytes, parsed.mimeType);
    return {
      valid: true as const,
      bytes: parsed.bytes,
      mimeType: parsed.mimeType,
      detectedFormat: parsed.detectedFormat,
      dataUrl,
    };
  }, [t56CodeInput, t56DecodeMode]);

  useEffect(() => {
    if (!t56CodeToImageResult || !t56CodeToImageResult.valid) {
      setT56ReconstructedDims('');
      return;
    }
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0) {
        setT56ReconstructedDims(`${img.naturalWidth} × ${img.naturalHeight} px`);
      } else {
        setT56ReconstructedDims('Valid binary container');
      }
    };
    img.onerror = () => {
      setT56ReconstructedDims('Raw binary payload');
    };
    img.src = t56CodeToImageResult.dataUrl;
  }, [t56CodeToImageResult]);

  // #57 Image -> Base64 live computation
  const t57ImageToBase64Output = useMemo(() => {
    if (!activeFile?.imageDataUrl) return null;
    const formatted = formatImageDataUriOutput(activeFile.imageDataUrl, t57Wrapper, activeFile.name);
    const origBytes = activeFile.sizeBytes || activeFileBytes?.length || 0;
    const b64Bytes = formatted.formatted.length;
    const overheadPct = origBytes > 0 ? Math.round(((b64Bytes - origBytes) / origBytes) * 100) : 33;
    return {
      ...formatted,
      origBytes,
      b64Bytes,
      overheadPct,
    };
  }, [activeFile, activeFileBytes, t57Wrapper]);

  // #57 Base64 -> Image live conversion into chosen format (PNG, JPG, WebP)
  useEffect(() => {
    if (activeTool.id !== 'img-57-base64-datauri' || t57Mode !== 'base64-to-image') return;
    if (!t57Base64Input.trim()) {
      setT57ConvertedDataUrl('');
      setT57ConvertedDims(null);
      setT57Error(null);
      return;
    }
    const norm = normalizeBase64ToDataUri(t57Base64Input);
    if (!norm.valid) {
      setT57ConvertedDataUrl('');
      setT57ConvertedDims(null);
      setT57Error(norm.error || 'Invalid Base64 input');
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const w = img.naturalWidth || img.width || 256;
      const h = img.naturalHeight || img.height || 256;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d')!;
      if (t57OutputFormat === 'image/jpeg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(img, 0, 0, w, h);
      const outUrl = c.toDataURL(t57OutputFormat, 0.92);
      const outBytes = dataUrlToUint8Array(outUrl);
      setT57ConvertedDataUrl(outUrl);
      setT57ConvertedDims({ w, h, bytes: outBytes.length });
      setT57Error(null);
    };
    img.onerror = () => {
      if (cancelled) return;
      setT57ConvertedDataUrl('');
      setT57ConvertedDims(null);
      setT57Error('Could not decode image from the provided Base64 / Data URI string.');
    };
    img.src = norm.dataUri;
    return () => {
      cancelled = true;
    };
  }, [activeTool.id, t57Mode, t57Base64Input, t57OutputFormat]);

  // #58 Image to ASCII / Matrix Art live generator
  useEffect(() => {
    if (activeTool.id !== 'img-58-ascii-matrix-art') return;
    if (!activeFile?.imageDataUrl) {
      setT58AsciiResult(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const w = img.naturalWidth || img.width || 120;
      const h = img.naturalHeight || img.height || 120;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);

      const ascii = generateAsciiArtFromRgba(imgData.data, w, h, t58Cols, t58Style, t58Invert);

      // Render high-contrast Styled PNG canvas
      const fontW = 8;
      const fontH = 15;
      const pad = 16;
      const outCanvas = document.createElement('canvas');
      outCanvas.width = ascii.colsCount * fontW + pad * 2;
      outCanvas.height = ascii.rowsCount * fontH + pad * 2;
      const octx = outCanvas.getContext('2d')!;
      octx.fillStyle = t58Style === 'matrix-binary' ? '#020604' : '#090D16';
      octx.fillRect(0, 0, outCanvas.width, outCanvas.height);
      octx.font = 'bold 13px "JetBrains Mono", monospace';
      octx.textBaseline = 'top';

      for (let r = 0; r < ascii.rows.length; r++) {
        const row = ascii.rows[r];
        const y = pad + r * fontH;
        if (t58ColorMode === 'monochrome') {
          octx.fillStyle = t58Style === 'matrix-binary' ? '#10B981' : '#F8FAFC';
          const line = row.map((cell) => cell.char).join('');
          octx.fillText(line, pad, y);
        } else {
          for (let col = 0; col < row.length; col++) {
            const cell = row[col];
            if (cell.char === ' ') continue;
            octx.fillStyle = `rgb(${cell.r}, ${cell.g}, ${cell.b})`;
            octx.fillText(cell.char, pad + col * fontW, y);
          }
        }
      }

      setT58AsciiResult({
        ...ascii,
        styledPngUrl: outCanvas.toDataURL('image/png'),
      });
    };
    img.src = activeFile.imageDataUrl;
    return () => {
      cancelled = true;
    };
  }, [activeTool.id, activeFile?.imageDataUrl, t58Style, t58Cols, t58Invert, t58ColorMode]);

  // #59 LSB Steganography: load active image pixels and compute capacity
  useEffect(() => {
    if (activeTool.id !== 'img-59-lsb-steganography') return;
    setT59EncodedStegoUrl('');
    setT59EncodedBytes(null);
    setT59EncodeError(null);
    setT59RevealedMessage(null);
    setT59RevealError(null);

    if (!activeFile?.imageDataUrl) {
      setT59ImgMeta(null);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const w = img.naturalWidth || img.width || 1;
      const h = img.naturalHeight || img.height || 1;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      const rgba = ctx.getImageData(0, 0, w, h).data;
      setT59ImgMeta({
        width: w,
        height: h,
        maxCapacityBytes: calculateMaxLsbCapacityBytes(w, h),
        rgba,
      });
    };
    img.src = activeFile.imageDataUrl;
    return () => {
      cancelled = true;
    };
  }, [activeTool.id, activeFile?.imageDataUrl]);

  // #60 QR Code & Barcode Generator live rendering
  useEffect(() => {
    if (activeTool.id !== 'img-60-qr-barcode-studio') return;
    let cancelled = false;

    const generateCode = async () => {
      const text = t60InputText.trim();
      if (!text) {
        setT60GeneratedPngUrl('');
        setT60GeneratedSvgText('');
        setT60GenerateError('Enter text, URL, or Wi-Fi payload to generate a code.');
        return;
      }

      try {
        if (t60CodeType === 'qr') {
          const pngUrl = await QRCode.toDataURL(text, {
            width: t60Size,
            margin: 2,
            errorCorrectionLevel: t60Ecc,
            color: {
              dark: t60FgColor,
              light: t60BgColor,
            },
          });
          const svgStr = await QRCode.toString(text, {
            type: 'svg',
            width: t60Size,
            margin: 2,
            errorCorrectionLevel: t60Ecc,
            color: {
              dark: t60FgColor,
              light: t60BgColor,
            },
          });
          if (!cancelled) {
            setT60GeneratedPngUrl(pngUrl);
            setT60GeneratedSvgText(svgStr);
            setT60GenerateError(null);
          }
        } else {
          const res = buildCode128SvgString(text, t60Size, t60FgColor, t60BgColor);
          if (!res.valid) {
            if (!cancelled) {
              setT60GeneratedPngUrl('');
              setT60GeneratedSvgText('');
              setT60GenerateError(res.error || 'Cannot encode Code128 barcode.');
            }
            return;
          }
          // Render SVG onto canvas to also provide PNG download
          const svgBlob = new Blob([res.svg], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(svgBlob);
          const img = new Image();
          img.onload = () => {
            if (cancelled) {
              URL.revokeObjectURL(url);
              return;
            }
            const c = document.createElement('canvas');
            c.width = img.naturalWidth || t60Size;
            c.height = img.naturalHeight || Math.round(t60Size * 0.45);
            const ctx = c.getContext('2d')!;
            ctx.drawImage(img, 0, 0);
            setT60GeneratedPngUrl(c.toDataURL('image/png'));
            setT60GeneratedSvgText(res.svg);
            setT60GenerateError(null);
            URL.revokeObjectURL(url);
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
          };
          img.src = url;
        }
      } catch (err: any) {
        if (!cancelled) {
          setT60GenerateError(err?.message || 'Unable to generate code.');
        }
      }
    };

    generateCode();
    return () => {
      cancelled = true;
    };
  }, [activeTool.id, t60InputText, t60CodeType, t60Size, t60FgColor, t60BgColor, t60Ecc]);

  // #60 QR / Barcode Scanner automatic decode when an image is uploaded in Scan mode
  useEffect(() => {
    if (activeTool.id !== 'img-60-qr-barcode-studio') return;
    if (!activeFile?.imageDataUrl) {
      setT60ScannedResult(null);
      return;
    }

    let cancelled = false;
    const decodeUploadedImage = async () => {
      // Check if SVG contains data-code128-text
      if (activeFileBytes) {
        try {
          const headText = new TextDecoder().decode(activeFileBytes.slice(0, 2000));
          const attrMatch = headText.match(/data-code128-text="([^"]+)"/);
          if (attrMatch && attrMatch[1]) {
            if (!cancelled) {
              setT60ScannedResult({
                found: true,
                text: attrMatch[1],
                formatLabel: 'Code128 Barcode (SVG Metadata)',
              });
            }
            return;
          }
        } catch {
          // ignore
        }
      }

      const img = new Image();
      img.onload = async () => {
        if (cancelled) return;
        const w = img.naturalWidth || img.width || 256;
        const h = img.naturalHeight || img.height || 256;
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);

        // 1. Try jsQR first
        const qrHit = jsQR(imageData.data, w, h, { inversionAttempts: 'attemptBoth' });
        if (qrHit && qrHit.data) {
          if (!cancelled) {
            setT60ScannedResult({
              found: true,
              text: qrHit.data,
              formatLabel: 'QR Code (ISO/IEC 18004)',
            });
          }
          return;
        }

        // 2. Try native BarcodeDetector API if available in browser
        const WinBarcodeDetector = (window as any).BarcodeDetector;
        if (typeof WinBarcodeDetector === 'function') {
          try {
            const detector = new WinBarcodeDetector();
            const hits = await detector.detect(c);
            if (hits && hits.length > 0 && hits[0].rawValue) {
              if (!cancelled) {
                setT60ScannedResult({
                  found: true,
                  text: String(hits[0].rawValue),
                  formatLabel: String(hits[0].format || 'Barcode').toUpperCase(),
                });
              }
              return;
            }
          } catch {
            // fallback
          }
        }

        if (!cancelled) {
          setT60ScannedResult({
            found: false,
            text: '',
            formatLabel: 'None',
            error:
              'No decodable QR Code or Barcode detected in this image. Ensure the code is clear, well-lit, and surrounded by a quiet zone.',
          });
        }
      };
      img.src = activeFile.imageDataUrl!;
    };

    decodeUploadedImage();
    return () => {
      cancelled = true;
    };
  }, [activeTool.id, activeFile?.imageDataUrl, activeFileBytes]);

  const handleCopyText = async (text: string, label: string) => {
    if (!text) return;
    const ok = await copyTextToClipboard(text);
    if (ok) {
      onNotify(`Copied ${label} to clipboard`, 'success');
    } else {
      onNotify(`Unable to copy ${label} automatically — please select and copy manually.`, 'info');
    }
  };

  const handlePasteText = async (setter: (val: string) => void, label: string) => {
    const res = await readTextFromClipboard();
    if (res.ok && res.text) {
      setter(res.text);
      onNotify(`Pasted ${label} from clipboard (${res.text.length.toLocaleString()} chars)`, 'info');
    } else {
      onNotify(res.error || 'Clipboard is empty or permission was denied — use Ctrl/Cmd+V in the box.', 'info');
    }
  };

  // Single-Image Dropzone Reusable Block
  const renderSingleImageDropzone = (customPrompt?: string) => (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setIsDragOver(false);
        const dropped = e.dataTransfer.files?.[0];
        if (dropped) {
          await onUploadFile(dropped);
        }
      }}
      className={`p-4 rounded-xl border transition-colors ${
        isDragOver
          ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/30 ring-2 ring-indigo-500/30'
          : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
            {activeFile ? activeFile.name : customPrompt || 'Single-Image Dropzone (PNG, JPG, WebP, GIF, BMP, SVG)'}
          </div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
            {activeFile
              ? `${(activeFile.sizeBytes / 1024).toFixed(2)} KB (${activeFile.sizeBytes.toLocaleString()} bytes) · ${
                  activeFile.dimensions || 'Raster Image'
                }`
              : 'Drag & drop an image here or click Upload Image · Strictly isolated to this tool'}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{activeFile ? 'Replace Image' : 'Upload Image'}</span>
          </button>
          {activeFile && (
            <button
              type="button"
              onClick={onClearFile}
              className="px-2.5 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,.ico,.tiff,.avif"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) await onUploadFile(f);
          e.target.value = '';
        }}
        className="hidden"
      />
      <input
        ref={txtInputRef}
        type="file"
        accept=".txt,.hex,.bin,.b64"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const text = await f.text();
          if (activeTool.id === 'img-56-binary-hex') {
            setT56CodeInput(text);
            setT56Mode('code-to-image');
            onNotify(`Loaded ${f.name} (${text.length.toLocaleString()} chars)`, 'info');
          } else if (activeTool.id === 'img-57-base64-datauri') {
            setT57Base64Input(text);
            setT57Mode('base64-to-image');
            onNotify(`Loaded ${f.name} (${text.length.toLocaleString()} chars)`, 'info');
          }
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Mobile Tool Header Switcher Bar (< 1024px) */}
      <div className="lg:hidden px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 truncate">
            IMAGE #{String(activeTool.number).padStart(2, '0')} · {activeTool.categoryName}
          </div>
          <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
            {activeTool.name}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onOpenDirectory}
            className="px-2.5 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
          >
            All Tools
          </button>
          <button
            type="button"
            onClick={onOpenMobileDrawer}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg flex items-center gap-1"
          >
            <Menu className="w-3.5 h-3.5" />
            <span>Tools</span>
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-5 max-w-7xl w-full mx-auto">
        {/* Desktop Header */}
        <div className="hidden lg:flex items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="text-xs font-mono text-indigo-600 dark:text-indigo-400">
              IMAGE STUDIO · TOOL #{String(activeTool.number).padStart(2, '0')} · {activeTool.categoryName.toUpperCase()}
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
              {activeTool.number}. {activeTool.name}
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{activeTool.shortDesc}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="px-2.5 py-1 text-[11px] font-mono rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              100% Client-Side · Zero Server Upload
            </span>
          </div>
        </div>

        {/* =====================================================================
            #56: Image ↔ Binary (0/1) & Hex Converter
           ===================================================================== */}
        {activeTool.id === 'img-56-binary-hex' && (
          <div className="space-y-4">
            {/* Mode Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setT56Mode('image-to-code')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    t56Mode === 'image-to-code'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Image → Code (Binary / Hex)
                </button>
                <button
                  type="button"
                  onClick={() => setT56Mode('code-to-image')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    t56Mode === 'code-to-image'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Code → Image (Works Without Upload)
                </button>
              </div>
              {t56Mode === 'image-to-code' && t56ImageToCodeOutput && (
                <button
                  type="button"
                  onClick={() => {
                    setT56CodeInput(t56ImageToCodeOutput.codeText);
                    setT56DecodeMode('auto');
                    setT56Mode('code-to-image');
                    onNotify('Sent encoded stream to Code → Image tab', 'info');
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 rounded-lg flex items-center gap-1.5"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>Test in Code → Image</span>
                </button>
              )}
            </div>

            {t56Mode === 'image-to-code' ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Left Column: Image Dropzone & Encoding Settings */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Binary className="w-3.5 h-3.5 text-indigo-500" />
                    <span>1. Source Image &amp; Byte Stream Settings</span>
                  </div>

                  {renderSingleImageDropzone('Upload an image to inspect its raw Binary (0/1) or Hex byte stream')}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Encoding Format
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(['binary', 'hex'] as BinaryHexFormat[]).map((fmt) => (
                          <button
                            key={fmt}
                            type="button"
                            onClick={() => setT56Format(fmt)}
                            className={`py-1.5 px-2.5 rounded-lg text-xs font-semibold border ${
                              t56Format === fmt
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            {fmt === 'binary' ? 'Binary (0/1)' : 'Hexadecimal'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Byte Delimiter
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(['space', 'none'] as BinaryHexDelimiter[]).map((del) => (
                          <button
                            key={del}
                            type="button"
                            onClick={() => setT56Delimiter(del)}
                            className={`py-1.5 px-2.5 rounded-lg text-xs font-semibold border ${
                              t56Delimiter === del
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            {del === 'space' ? 'Space Separated' : 'None (Compact)'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {activeFile && activeFile.imageDataUrl && (
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center gap-3">
                      <img
                        src={activeFile.imageDataUrl}
                        alt={activeFile.name}
                        className="w-16 h-16 object-contain rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0"
                      />
                      <div className="text-xs font-mono space-y-0.5 min-w-0">
                        <div className="font-bold text-slate-900 dark:text-white truncate">{activeFile.name}</div>
                        <div className="text-slate-500 dark:text-slate-400">
                          Dimensions: {activeFile.dimensions || 'Raster Image'}
                        </div>
                        <div className="text-indigo-600 dark:text-indigo-400">
                          Raw Bytes: {(activeFileBytes?.length || 0).toLocaleString()} B · Output Chars:{' '}
                          {(t56ImageToCodeOutput?.totalChars || 0).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column: Safe Preview & Copy/Download */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      2. {t56Format === 'binary' ? 'Binary (8-Bit 0/1)' : 'Hexadecimal'} Stream Output
                    </span>
                    {t56ImageToCodeOutput && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyText(t56ImageToCodeOutput.codeText, `${t56Format.toUpperCase()} stream`)
                          }
                          className="px-2.5 py-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white rounded-lg flex items-center gap-1"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy All</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const base = activeFile?.name.replace(/\.[^.]+$/, '') || 'image';
                            downloadTextFile(
                              `${base}_${t56Format}.txt`,
                              t56ImageToCodeOutput.codeText
                            );
                            onNotify(`Downloaded ${base}_${t56Format}.txt`, 'success');
                          }}
                          className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center gap-1"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download .txt</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {t56ImageToCodeOutput ? (
                    <>
                      <textarea
                        readOnly
                        value={t56ImageToCodeOutput.previewText}
                        rows={11}
                        className="w-full font-mono text-xs bg-slate-950 text-emerald-400 border border-slate-800 rounded-xl p-3 focus:outline-none"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        <span>
                          Total Bytes: {t56ImageToCodeOutput.totalBytes.toLocaleString()} · Total Chars:{' '}
                          {t56ImageToCodeOutput.totalChars.toLocaleString()}
                        </span>
                        {t56ImageToCodeOutput.truncated && (
                          <span className="text-amber-600 dark:text-amber-400">
                            Safe Preview: Showing first 10,000 chars (Copy / Download exports 100%)
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="h-64 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 flex flex-col items-center justify-center p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                      <Binary className="w-8 h-8 text-slate-400 mb-2" />
                      <p className="font-semibold text-slate-700 dark:text-slate-300">
                        No Image Uploaded Yet
                      </p>
                      <p className="mt-1 max-w-xs">
                        Upload any image on the left to convert its binary bytes to `0`/`1` or Hex, or switch to{' '}
                        <strong>Code → Image</strong> above to reconstruct an image from code.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Code -> Image Mode (Works without uploading an image first) */
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      1. Paste Binary (0/1) or Hex Stream
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handlePasteText(setT56CodeInput, 'Binary/Hex stream')}
                        className="px-2.5 py-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white rounded-lg flex items-center gap-1"
                      >
                        <ClipboardPaste className="w-3.5 h-3.5" />
                        <span>Paste</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => txtInputRef.current?.click()}
                        className="px-2.5 py-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white rounded-lg"
                      >
                        Upload .txt
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          // 1x1 Emerald PNG in Hex
                          const sampleHex =
                            '89 50 4E 47 0D 0A 1A 0A 00 00 00 0D 49 48 44 52 00 00 00 01 00 00 00 01 08 02 00 00 00 90 77 53 DE 00 00 00 0C 49 44 41 54 08 D7 63 60 F8 CF 80 00 00 02 01 01 00 18 DD 8D B0 00 00 00 00 49 45 4E 44 AE 42 60 82';
                          setT56CodeInput(sampleHex);
                          setT56DecodeMode('auto');
                        }}
                        className="px-2.5 py-1 text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 rounded-lg border border-indigo-200 dark:border-indigo-800"
                      >
                        Sample PNG Hex
                      </button>
                      <button
                        type="button"
                        onClick={() => setT56CodeInput('')}
                        className="px-2 py-1 text-xs text-rose-600 dark:text-rose-400 hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-slate-500">Input Format:</span>
                    {(['auto', 'binary', 'hex'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setT56DecodeMode(m)}
                        className={`px-2.5 py-1 rounded text-xs font-semibold ${
                          t56DecodeMode === m
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {m === 'auto' ? 'Auto-Detect' : m === 'binary' ? 'Binary (0/1)' : 'Hexadecimal'}
                      </button>
                    ))}
                  </div>

                  <textarea
                    value={t56CodeInput}
                    onChange={(e) => setT56CodeInput(e.target.value)}
                    placeholder="Paste space-separated or compact Binary (01001000...) or Hex (89 50 4E 47...) bytes here..."
                    rows={10}
                    className="w-full font-mono text-xs bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-xl p-3 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      2. Reconstructed Image Preview
                    </span>
                    {t56CodeToImageResult?.valid && (
                      <button
                        type="button"
                        onClick={() => {
                          const ext = t56CodeToImageResult.mimeType.split('/')[1]?.replace('+xml', '') || 'png';
                          const fileName = `reconstructed_from_${t56CodeToImageResult.detectedFormat}.${ext}`;
                          downloadBlobBytes(fileName, t56CodeToImageResult.mimeType, t56CodeToImageResult.bytes);
                          onRecordCompletedOutput({
                            fileName,
                            mimeType: t56CodeToImageResult.mimeType,
                            outputBytes: t56CodeToImageResult.bytes,
                            imageDataUrl: t56CodeToImageResult.dataUrl,
                            summary: `Reconstructed ${t56CodeToImageResult.bytes.length} bytes from ${t56CodeToImageResult.detectedFormat.toUpperCase()}`,
                          });
                          onNotify(`Downloaded ${fileName}`, 'success');
                        }}
                        className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download Image</span>
                      </button>
                    )}
                  </div>

                  {t56CodeToImageResult ? (
                    t56CodeToImageResult.valid ? (
                      <div className="flex-1 flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                        <img
                          src={t56CodeToImageResult.dataUrl}
                          alt="Reconstructed from binary/hex"
                          className="max-h-60 object-contain rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2"
                        />
                        <div className="text-xs font-mono text-slate-600 dark:text-slate-400 text-center">
                          Detected: <strong>{t56CodeToImageResult.detectedFormat.toUpperCase()}</strong> →{' '}
                          <strong>{t56CodeToImageResult.mimeType}</strong> ·{' '}
                          {t56CodeToImageResult.bytes.length.toLocaleString()} bytes
                          {t56ReconstructedDims ? ` · ${t56ReconstructedDims}` : ''}
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-200 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>{t56CodeToImageResult.error}</span>
                      </div>
                    )
                  ) : (
                    <div className="h-64 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 flex flex-col items-center justify-center p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                      <p className="font-semibold text-slate-700 dark:text-slate-300">
                        Ready to Reconstruct Image from Code
                      </p>
                      <p className="mt-1 max-w-xs">
                        Paste Binary (`0`/`1`) or Hex bytes on the left (or click <strong>Sample PNG Hex</strong>) to preview and download the image immediately.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* =====================================================================
            #57: Image ↔ Base64 Data URI Converter
           ===================================================================== */}
        {activeTool.id === 'img-57-base64-datauri' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setT57Mode('image-to-base64')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    t57Mode === 'image-to-base64'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Image → Base64
                </button>
                <button
                  type="button"
                  onClick={() => setT57Mode('base64-to-image')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    t57Mode === 'base64-to-image'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Base64 → Image (Works Without Upload)
                </button>
              </div>
              {t57Mode === 'image-to-base64' && t57ImageToBase64Output && (
                <button
                  type="button"
                  onClick={() => {
                    setT57Base64Input(t57ImageToBase64Output.formatted);
                    setT57Mode('base64-to-image');
                    onNotify('Loaded Base64 snippet into Base64 → Image decoder', 'info');
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 rounded-lg flex items-center gap-1.5"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>Send to Base64 → Image</span>
                </button>
              )}
            </div>

            {t57Mode === 'image-to-base64' ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <FileCode className="w-3.5 h-3.5 text-indigo-500" />
                    <span>1. Upload Image &amp; Choose Embed Format</span>
                  </div>

                  {renderSingleImageDropzone('Upload an image to encode as Data URI, Raw Base64, HTML <img>, or CSS')}

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                      Output Snippet Format
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'data-uri', label: 'Full Data URI' },
                        { id: 'raw-base64', label: 'Raw Base64' },
                        { id: 'html-img', label: 'HTML <img> Tag' },
                        { id: 'css-bg', label: 'CSS background-image' },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setT57Wrapper(item.id as Base64WrapperFormat)}
                          className={`py-2 px-3 rounded-lg text-xs font-semibold border text-left ${
                            t57Wrapper === item.id
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {t57ImageToBase64Output && (
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5 font-mono text-xs">
                      <div className="font-bold text-slate-800 dark:text-slate-200">
                        Size Comparison (Binary vs. Base64)
                      </div>
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                        <span>Original Binary Size:</span>
                        <span>{(t57ImageToBase64Output.origBytes / 1024).toFixed(2)} KB ({t57ImageToBase64Output.origBytes.toLocaleString()} B)</span>
                      </div>
                      <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400">
                        <span>Encoded Output Size:</span>
                        <span>{(t57ImageToBase64Output.b64Bytes / 1024).toFixed(2)} KB (+{t57ImageToBase64Output.overheadPct}% Base64 overhead)</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      2. Generated Base64 / Data URI Output
                    </span>
                    {t57ImageToBase64Output && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleCopyText(t57ImageToBase64Output.formatted, 'Base64 snippet')}
                          className="px-2.5 py-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white rounded-lg flex items-center gap-1"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const base = activeFile?.name.replace(/\.[^.]+$/, '') || 'image';
                            downloadTextFile(`${base}_${t57Wrapper}.txt`, t57ImageToBase64Output.formatted);
                            onNotify(`Downloaded ${base}_${t57Wrapper}.txt`, 'success');
                          }}
                          className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center gap-1"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download .txt</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {t57ImageToBase64Output ? (
                    <>
                      <textarea
                        readOnly
                        value={t57ImageToBase64Output.formatted.slice(0, 15000)}
                        rows={11}
                        className="w-full font-mono text-xs bg-slate-950 text-indigo-300 border border-slate-800 rounded-xl p-3 focus:outline-none"
                      />
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 flex items-center justify-between">
                        <span>MIME: {t57ImageToBase64Output.mimeType}</span>
                        <span>Length: {t57ImageToBase64Output.formatted.length.toLocaleString()} chars</span>
                      </div>
                    </>
                  ) : (
                    <div className="h-64 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 flex flex-col items-center justify-center p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                      <FileCode className="w-8 h-8 text-slate-400 mb-2" />
                      <p className="font-semibold text-slate-700 dark:text-slate-300">
                        Upload an Image or Switch to Base64 → Image
                      </p>
                      <p className="mt-1 max-w-xs">
                        Drop an image on the left to generate its Data URI / HTML / CSS code, or switch to{' '}
                        <strong>Base64 → Image</strong> above to decode any Base64 string.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Base64 -> Image Mode */
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      1. Paste Base64 or Data URI
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handlePasteText(setT57Base64Input, 'Base64 / Data URI')}
                        className="px-2.5 py-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white rounded-lg flex items-center gap-1"
                      >
                        <ClipboardPaste className="w-3.5 h-3.5" />
                        <span>Paste</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => txtInputRef.current?.click()}
                        className="px-2.5 py-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white rounded-lg"
                      >
                        Upload .txt
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setT57Base64Input(
                            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
                          );
                        }}
                        className="px-2.5 py-1 text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 rounded-lg border border-indigo-200 dark:border-indigo-800"
                      >
                        Sample Data URI
                      </button>
                      <button
                        type="button"
                        onClick={() => setT57Base64Input('')}
                        className="px-2 py-1 text-xs text-rose-600 dark:text-rose-400 hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Convert Output Format
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { mime: 'image/png', label: 'PNG (Lossless)' },
                        { mime: 'image/jpeg', label: 'JPG (92%)' },
                        { mime: 'image/webp', label: 'WebP' },
                      ].map((fmt) => (
                        <button
                          key={fmt.mime}
                          type="button"
                          onClick={() => setT57OutputFormat(fmt.mime as any)}
                          className={`py-1.5 px-2.5 rounded-lg text-xs font-semibold border ${
                            t57OutputFormat === fmt.mime
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          {fmt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <textarea
                    value={t57Base64Input}
                    onChange={(e) => setT57Base64Input(e.target.value)}
                    placeholder="Paste data:image/png;base64,... or raw Base64 or <img src='...' /> here..."
                    rows={10}
                    className="w-full font-mono text-xs bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-xl p-3 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      2. Live Decoded Image Preview
                    </span>
                    {t57ConvertedDataUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          const ext =
                            t57OutputFormat === 'image/jpeg'
                              ? 'jpg'
                              : t57OutputFormat === 'image/webp'
                              ? 'webp'
                              : 'png';
                          const fileName = `decoded_base64_image.${ext}`;
                          const bytes = dataUrlToUint8Array(t57ConvertedDataUrl);
                          downloadBlobBytes(fileName, t57OutputFormat, bytes);
                          onRecordCompletedOutput({
                            fileName,
                            mimeType: t57OutputFormat,
                            outputBytes: bytes,
                            imageDataUrl: t57ConvertedDataUrl,
                            summary: `Decoded Base64 to ${ext.toUpperCase()} (${bytes.length} bytes)`,
                          });
                          onNotify(`Downloaded ${fileName}`, 'success');
                        }}
                        className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download Image</span>
                      </button>
                    )}
                  </div>

                  {t57Error ? (
                    <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-200 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{t57Error}</span>
                    </div>
                  ) : t57ConvertedDataUrl ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                      <img
                        src={t57ConvertedDataUrl}
                        alt="Decoded Base64 preview"
                        className="max-h-60 object-contain rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2"
                      />
                      {t57ConvertedDims && (
                        <div className="text-xs font-mono text-slate-600 dark:text-slate-400">
                          {t57ConvertedDims.w} × {t57ConvertedDims.h} px · {t57OutputFormat} ·{' '}
                          {(t57ConvertedDims.bytes / 1024).toFixed(2)} KB
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-64 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 flex flex-col items-center justify-center p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                      <p className="font-semibold text-slate-700 dark:text-slate-300">
                        Paste Base64 String to Render Image
                      </p>
                      <p className="mt-1 max-w-xs">
                        Supports raw Base64, `data:image/...`, HTML `&lt;img&gt;` tags, and CSS `url(...)` snippets.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* =====================================================================
            #58: Image to ASCII / Matrix Art Generator
           ===================================================================== */}
        {activeTool.id === 'img-58-ascii-matrix-art' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left Column: Controls & Dropzone */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-indigo-500" />
                <span>1. Source Image &amp; ASCII / Matrix Style Controls</span>
              </div>

              {renderSingleImageDropzone('Upload an image to transform into ASCII, Matrix 0/1, or Block Art')}

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                  Character Style Preset
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'classic', label: 'Classic ASCII (@%#*+=-:.)' },
                    { id: 'detailed', label: 'Detailed 70-Char Ramp' },
                    { id: 'matrix-binary', label: 'Matrix Binary 0/1 (Green)' },
                    { id: 'block-shade', label: 'Block Shade (█▓▒░)' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setT58Style(st.id as AsciiArtStylePreset)}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold border text-left ${
                        t58Style === st.id
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Character Columns Width
                  </span>
                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                    {t58Cols} chars/row
                  </span>
                </div>
                <input
                  type="range"
                  min={40}
                  max={200}
                  step={2}
                  value={t58Cols}
                  onChange={(e) => setT58Cols(Number(e.target.value))}
                  className="w-full accent-indigo-600"
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                  <span>40 cols</span>
                  <span>120 cols</span>
                  <span>200 cols</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setT58Invert((v) => !v)}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold border flex items-center justify-between ${
                    t58Invert
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <span>Invert Brightness</span>
                  <span className="font-mono text-[10px]">{t58Invert ? 'ON' : 'OFF'}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setT58ColorMode((m) => (m === 'monochrome' ? 'color' : 'monochrome'))
                  }
                  className={`py-2 px-3 rounded-lg text-xs font-semibold border flex items-center justify-between ${
                    t58ColorMode === 'color'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <span>Color Mode</span>
                  <span className="font-mono text-[10px] uppercase">{t58ColorMode}</span>
                </button>
              </div>
            </div>

            {/* Right Column: Live ASCII / Matrix Preview & Export */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  2. Live ASCII / Matrix Art Output
                </span>
                {t58AsciiResult && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleCopyText(t58AsciiResult.text, 'ASCII Art text')}
                      className="px-2.5 py-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white rounded-lg flex items-center gap-1"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Text</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const base = activeFile?.name.replace(/\.[^.]+$/, '') || 'ascii_art';
                        downloadTextFile(`${base}_${t58Style}.txt`, t58AsciiResult.text);
                        onNotify(`Downloaded ${base}_${t58Style}.txt`, 'success');
                      }}
                      className="px-2.5 py-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white rounded-lg flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download .txt</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const base = activeFile?.name.replace(/\.[^.]+$/, '') || 'ascii_art';
                        const fileName = `${base}_${t58Style}.png`;
                        const bytes = dataUrlToUint8Array(t58AsciiResult.styledPngUrl);
                        downloadBlobBytes(fileName, 'image/png', bytes);
                        onRecordCompletedOutput({
                          fileName,
                          mimeType: 'image/png',
                          outputBytes: bytes,
                          imageDataUrl: t58AsciiResult.styledPngUrl,
                          summary: `Generated ${t58AsciiResult.colsCount}×${t58AsciiResult.rowsCount} ${t58Style} PNG`,
                        });
                        onNotify(`Downloaded ${fileName}`, 'success');
                      }}
                      className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Styled PNG</span>
                    </button>
                  </div>
                )}
              </div>

              {t58AsciiResult ? (
                <div className="space-y-2">
                  <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 overflow-auto max-h-[380px]">
                    {t58ColorMode === 'monochrome' ? (
                      <pre
                        className={`font-mono text-[8px] leading-[9px] select-all ${
                          t58Style === 'matrix-binary' ? 'text-emerald-400' : 'text-slate-100'
                        }`}
                      >
                        {t58AsciiResult.text}
                      </pre>
                    ) : (
                      <pre className="font-mono text-[8px] leading-[9px] select-all">
                        {t58AsciiResult.rows.map((row, rIdx) => (
                          <div key={rIdx}>
                            {row.map((cell, cIdx) => (
                              <span
                                key={cIdx}
                                style={{ color: `rgb(${cell.r},${cell.g},${cell.b})` }}
                              >
                                {cell.char}
                              </span>
                            ))}
                          </div>
                        ))}
                      </pre>
                    )}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 flex items-center justify-between">
                    <span>
                      Grid: {t58AsciiResult.colsCount} cols × {t58AsciiResult.rowsCount} rows
                    </span>
                    <span>
                      Total Characters: {t58AsciiResult.text.length.toLocaleString()}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="h-64 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 flex flex-col items-center justify-center p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  <Terminal className="w-8 h-8 text-slate-400 mb-2" />
                  <p className="font-semibold text-slate-700 dark:text-slate-300">
                    Upload an Image to Generate Live ASCII / Matrix Art
                  </p>
                  <p className="mt-1 max-w-xs">
                    Supports Classic ASCII, Detailed 70-character ramp, Green-on-Black Matrix Binary (`0`/`1`), and Unicode Block Shades (`█▓▒░`).
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =====================================================================
            #59: Secret Message in Image (LSB Steganography)
           ===================================================================== */}
        {activeTool.id === 'img-59-lsb-steganography' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setT59Mode('hide')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    t59Mode === 'hide'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Hide Message (Encode Stego PNG)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setT59Mode('reveal')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    t59Mode === 'reveal'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Reveal Message (Extract from Stego PNG)</span>
                </button>
              </div>
            </div>

            {t59Mode === 'hide' ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-indigo-500" />
                    <span>1. Carrier Image &amp; Secret Message Payload</span>
                  </div>

                  {renderSingleImageDropzone('Upload a carrier image to embed a hidden LSB message')}

                  {t59ImgMeta && (
                    <div className="p-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 text-xs font-mono flex items-center justify-between">
                      <span>
                        Carrier: {t59ImgMeta.width} × {t59ImgMeta.height} px
                      </span>
                      <span className="font-bold text-indigo-700 dark:text-indigo-300">
                        Max Capacity: {t59ImgMeta.maxCapacityBytes.toLocaleString()} bytes
                      </span>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      <span>Secret Message to Hide (UTF-8)</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handlePasteText(setT59SecretMessage, 'secret message')}
                          className="px-2 py-0.5 text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white rounded flex items-center gap-1"
                        >
                          <ClipboardPaste className="w-3 h-3" />
                          <span>Paste</span>
                        </button>
                        <span className="font-mono">
                          {new TextEncoder().encode(t59SecretMessage).length.toLocaleString()} /{' '}
                          {(t59ImgMeta?.maxCapacityBytes || 0).toLocaleString()} bytes
                        </span>
                      </div>
                    </div>
                    <textarea
                      value={t59SecretMessage}
                      onChange={(e) => setT59SecretMessage(e.target.value)}
                      placeholder="Type the confidential text, coordinates, or recovery note to embed invisibly inside the image RGB least-significant bits..."
                      rows={5}
                      className="w-full font-mono text-xs bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-xl p-3 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Optional Passphrase (Encrypts Payload Before LSB Embedding)
                    </label>
                    <input
                      type="password"
                      value={t59Passphrase}
                      onChange={(e) => setT59Passphrase(e.target.value)}
                      placeholder="Leave blank for unencrypted LSB or enter a passphrase..."
                      className="w-full font-mono text-xs bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={!t59ImgMeta}
                    onClick={() => {
                      if (!t59ImgMeta) return;
                      const encoded = encodeLsbStegoRgba(
                        t59ImgMeta.rgba,
                        t59ImgMeta.width,
                        t59ImgMeta.height,
                        t59SecretMessage,
                        t59Passphrase
                      );
                      if (!encoded.valid) {
                        setT59EncodeError(encoded.error || 'Encoding failed.');
                        setT59EncodedStegoUrl('');
                        setT59EncodedBytes(null);
                        return;
                      }
                      const c = document.createElement('canvas');
                      c.width = t59ImgMeta.width;
                      c.height = t59ImgMeta.height;
                      const ctx = c.getContext('2d')!;
                      const outImgData = new ImageData(
                        new Uint8ClampedArray(encoded.stegoRgba),
                        t59ImgMeta.width,
                        t59ImgMeta.height
                      );
                      ctx.putImageData(outImgData, 0, 0);
                      const pngUrl = c.toDataURL('image/png');
                      const pngBytes = dataUrlToUint8Array(pngUrl);
                      setT59EncodedStegoUrl(pngUrl);
                      setT59EncodedBytes(pngBytes);
                      setT59EncodeError(null);
                      onNotify(`Embedded ${encoded.payloadBytes} bytes into lossless Stego PNG`, 'success');
                    }}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Encode &amp; Preview Lossless Stego PNG</span>
                  </button>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      2. Encoded Stego PNG Output
                    </span>
                    {t59EncodedStegoUrl && t59EncodedBytes && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={async () => {
                            const ab = t59EncodedBytes.buffer.slice(
                              t59EncodedBytes.byteOffset,
                              t59EncodedBytes.byteOffset + t59EncodedBytes.byteLength
                            ) as ArrayBuffer;
                            const f = new File([ab], 'stego_carrier.png', {
                              type: 'image/png',
                            });
                            await onUploadFile(f);
                            setT59Mode('reveal');
                            onNotify('Loaded Stego PNG into Reveal Message tab', 'info');
                          }}
                          className="px-2.5 py-1 text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 rounded-lg border border-indigo-200 dark:border-indigo-800"
                        >
                          Verify in Reveal Tab
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const base = activeFile?.name.replace(/\.[^.]+$/, '') || 'image';
                            const fileName = `${base}_stego_lsb.png`;
                            downloadBlobBytes(fileName, 'image/png', t59EncodedBytes);
                            onRecordCompletedOutput({
                              fileName,
                              mimeType: 'image/png',
                              outputBytes: t59EncodedBytes,
                              imageDataUrl: t59EncodedStegoUrl,
                              summary: `LSB Steganography PNG (${t59EncodedBytes.length} bytes)`,
                            });
                            onNotify(`Downloaded ${fileName}`, 'success');
                          }}
                          className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center gap-1.5"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download Stego PNG</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {t59EncodeError && (
                    <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-200 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{t59EncodeError}</span>
                    </div>
                  )}

                  {t59EncodedStegoUrl ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                      <img
                        src={t59EncodedStegoUrl}
                        alt="Stego PNG Preview"
                        className="max-h-60 object-contain rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2"
                      />
                      <div className="text-xs font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>
                          Lossless 24-bit RGB LSB Stego PNG Ready ({(t59EncodedBytes?.length || 0).toLocaleString()} bytes)
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="h-64 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 flex flex-col items-center justify-center p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                      <Lock className="w-8 h-8 text-slate-400 mb-2" />
                      <p className="font-semibold text-slate-700 dark:text-slate-300">
                        Upload an Image &amp; Click Encode
                      </p>
                      <p className="mt-1 max-w-xs">
                        Embeds your UTF-8 message into the Least Significant Bits of RGB pixels and exports a visually identical lossless PNG.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Reveal Message Mode */
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Unlock className="w-3.5 h-3.5 text-indigo-500" />
                    <span>1. Upload Stego PNG &amp; Passphrase</span>
                  </div>

                  {renderSingleImageDropzone('Upload a lossless Stego PNG image to extract its hidden message')}

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Decryption Passphrase (If Protected)
                    </label>
                    <input
                      type="password"
                      value={t59Passphrase}
                      onChange={(e) => setT59Passphrase(e.target.value)}
                      placeholder="Enter passphrase if message was encrypted..."
                      className="w-full font-mono text-xs bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={!t59ImgMeta}
                    onClick={() => {
                      if (!t59ImgMeta) return;
                      const decoded = decodeLsbStegoRgba(t59ImgMeta.rgba, t59Passphrase);
                      if (!decoded.valid) {
                        setT59RevealError(decoded.error || 'Could not extract message.');
                        setT59RevealedMessage(null);
                      } else {
                        setT59RevealedMessage(decoded.message);
                        setT59RevealError(null);
                        onNotify(`Extracted ${decoded.byteLength} bytes from Stego PNG`, 'success');
                      }
                    }}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors"
                  >
                    <Unlock className="w-4 h-4" />
                    <span>Extract Message from Image</span>
                  </button>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      2. Extracted Secret Message
                    </span>
                    {t59RevealedMessage !== null && (
                      <button
                        type="button"
                        onClick={() => handleCopyText(t59RevealedMessage, 'extracted secret message')}
                        className="px-3 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center gap-1"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Message</span>
                      </button>
                    )}
                  </div>

                  {t59RevealError ? (
                    <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-200 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{t59RevealError}</span>
                    </div>
                  ) : t59RevealedMessage !== null ? (
                    <textarea
                      readOnly
                      value={t59RevealedMessage}
                      rows={10}
                      className="w-full font-mono text-xs bg-slate-950 text-emerald-400 border border-slate-800 rounded-xl p-3 focus:outline-none"
                    />
                  ) : (
                    <div className="h-64 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 flex flex-col items-center justify-center p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                      <Unlock className="w-8 h-8 text-slate-400 mb-2" />
                      <p className="font-semibold text-slate-700 dark:text-slate-300">
                        Ready to Extract Hidden LSB Payload
                      </p>
                      <p className="mt-1 max-w-xs">
                        Upload a Stego PNG image on the left and click <strong>Extract Message from Image</strong>.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* =====================================================================
            #60: QR Code & Barcode Generator / Scanner
           ===================================================================== */}
        {activeTool.id === 'img-60-qr-barcode-studio' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setT60Mode('generate')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    t60Mode === 'generate'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Generate QR / Barcode (Works Without Upload)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setT60Mode('scan')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    t60Mode === 'scan'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Scan / Read from Image</span>
                </button>
              </div>
            </div>

            {t60Mode === 'generate' ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between">
                    <span>1. Payload &amp; Code Styling</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setT60InputText('https://forma.studio')}
                        className="px-2 py-0.5 text-[10px] font-mono bg-slate-100 dark:bg-slate-800 rounded"
                      >
                        URL
                      </button>
                      <button
                        type="button"
                        onClick={() => setT60InputText('WIFI:S:FormaStudio5G;T:WPA;P:Precision2026;;')}
                        className="px-2 py-0.5 text-[10px] font-mono bg-slate-100 dark:bg-slate-800 rounded"
                      >
                        Wi-Fi
                      </button>
                      <button
                        type="button"
                        onClick={() => setT60InputText('FORMA-INV-2026-089')}
                        className="px-2 py-0.5 text-[10px] font-mono bg-slate-100 dark:bg-slate-800 rounded"
                      >
                        SKU
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Code Type
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setT60CodeType('qr')}
                        className={`py-2 px-3 rounded-lg text-xs font-semibold border ${
                          t60CodeType === 'qr'
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        QR Code (ISO/IEC 18004)
                      </button>
                      <button
                        type="button"
                        onClick={() => setT60CodeType('code128')}
                        className={`py-2 px-3 rounded-lg text-xs font-semibold border ${
                          t60CodeType === 'code128'
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        Code128 Barcode (ASCII)
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      <span>Text / URL / Wi-Fi Input</span>
                      <button
                        type="button"
                        onClick={() => handlePasteText(setT60InputText, 'QR / Barcode payload')}
                        className="px-2 py-0.5 text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white rounded flex items-center gap-1"
                      >
                        <ClipboardPaste className="w-3 h-3" />
                        <span>Paste</span>
                      </button>
                    </div>
                    <textarea
                      value={t60InputText}
                      onChange={(e) => setT60InputText(e.target.value)}
                      rows={3}
                      placeholder="Enter URL, text, SKU, or Wi-Fi string..."
                      className="w-full font-mono text-xs bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-xl p-3 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-600 dark:text-slate-400">Size (px)</span>
                        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {t60Size} px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={128}
                        max={512}
                        step={16}
                        value={t60Size}
                        onChange={(e) => setT60Size(Number(e.target.value))}
                        className="w-full accent-indigo-600"
                      />
                    </div>

                    {t60CodeType === 'qr' && (
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                          Error Correction (ECC)
                        </label>
                        <div className="grid grid-cols-4 gap-1">
                          {(['L', 'M', 'Q', 'H'] as const).map((lvl) => (
                            <button
                              key={lvl}
                              type="button"
                              onClick={() => setT60Ecc(lvl)}
                              className={`py-1 rounded text-xs font-mono font-bold border ${
                                t60Ecc === lvl
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                              }`}
                            >
                              {lvl}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Foreground Color
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={t60FgColor}
                          onChange={(e) => setT60FgColor(e.target.value)}
                          className="w-8 h-8 rounded cursor-pointer border border-slate-300 dark:border-slate-700"
                        />
                        <input
                          type="text"
                          value={t60FgColor}
                          onChange={(e) => setT60FgColor(e.target.value)}
                          className="flex-1 font-mono text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Background Color
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={t60BgColor}
                          onChange={(e) => setT60BgColor(e.target.value)}
                          className="w-8 h-8 rounded cursor-pointer border border-slate-300 dark:border-slate-700"
                        />
                        <input
                          type="text"
                          value={t60BgColor}
                          onChange={(e) => setT60BgColor(e.target.value)}
                          className="flex-1 font-mono text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      2. Live {t60CodeType === 'qr' ? 'QR Code' : 'Code128 Barcode'} Preview
                    </span>
                    {t60GeneratedPngUrl && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={async () => {
                            const bytes = dataUrlToUint8Array(t60GeneratedPngUrl);
                            const ab = bytes.buffer.slice(
                              bytes.byteOffset,
                              bytes.byteOffset + bytes.byteLength
                            ) as ArrayBuffer;
                            const f = new File([ab], `generated_${t60CodeType}.png`, {
                              type: 'image/png',
                            });
                            await onUploadFile(f);
                            setT60Mode('scan');
                            onNotify('Sent generated code to Scanner tab', 'info');
                          }}
                          className="px-2.5 py-1 text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 rounded-lg border border-indigo-200 dark:border-indigo-800"
                        >
                          Test in Scanner
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const fileName = `forma_${t60CodeType}_${t60Size}px.png`;
                            const bytes = dataUrlToUint8Array(t60GeneratedPngUrl);
                            downloadBlobBytes(fileName, 'image/png', bytes);
                            onRecordCompletedOutput({
                              fileName,
                              mimeType: 'image/png',
                              outputBytes: bytes,
                              imageDataUrl: t60GeneratedPngUrl,
                              summary: `Generated ${t60CodeType.toUpperCase()} PNG (${t60Size}px)`,
                            });
                            onNotify(`Downloaded ${fileName}`, 'success');
                          }}
                          className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center gap-1"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download PNG</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const fileName = `forma_${t60CodeType}_${t60Size}px.svg`;
                            downloadTextFile(fileName, t60GeneratedSvgText, 'image/svg+xml;charset=utf-8');
                            onNotify(`Downloaded ${fileName}`, 'success');
                          }}
                          className="px-2.5 py-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white rounded-lg flex items-center gap-1"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download SVG</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {t60GenerateError ? (
                    <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-200 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{t60GenerateError}</span>
                    </div>
                  ) : t60GeneratedPngUrl ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                      <img
                        src={t60GeneratedPngUrl}
                        alt="Generated QR or Barcode"
                        className="max-h-64 object-contain rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm bg-white p-2"
                      />
                      <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                        {t60CodeType === 'qr' ? `ISO/IEC 18004 QR (ECC ${t60Ecc})` : 'Code128-B Linear Barcode'} ·{' '}
                        {t60Size}px · PNG &amp; Vector SVG Ready
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              /* Scan / Read from Image Mode */
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    1. Upload Image Containing QR Code or Barcode
                  </div>

                  {renderSingleImageDropzone('Upload a screenshot or photo of a QR Code / Barcode to scan')}

                  {activeFile?.imageDataUrl && (
                    <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center">
                      <img
                        src={activeFile.imageDataUrl}
                        alt={activeFile.name}
                        className="max-h-48 object-contain rounded border border-slate-300 dark:border-slate-700 bg-white p-1.5"
                      />
                    </div>
                  )}
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      2. Decoded QR / Barcode Payload
                    </span>
                    {t60ScannedResult?.found && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleCopyText(t60ScannedResult.text, 'decoded QR/Barcode text')}
                          className="px-2.5 py-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white rounded-lg flex items-center gap-1"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </button>
                        {/^https?:\/\//i.test(t60ScannedResult.text.trim()) && (
                          <a
                            href={t60ScannedResult.text.trim()}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center gap-1"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Open Link</span>
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  {t60ScannedResult ? (
                    t60ScannedResult.found ? (
                      <div className="space-y-3">
                        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-mono text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                          <span>Decoded Format: {t60ScannedResult.formatLabel}</span>
                        </div>
                        <textarea
                          readOnly
                          value={t60ScannedResult.text}
                          rows={8}
                          className="w-full font-mono text-xs bg-slate-950 text-emerald-400 border border-slate-800 rounded-xl p-3 focus:outline-none"
                        />
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>{t60ScannedResult.error}</span>
                      </div>
                    )
                  ) : (
                    <div className="h-64 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 flex flex-col items-center justify-center p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                      <QrCode className="w-8 h-8 text-slate-400 mb-2" />
                      <p className="font-semibold text-slate-700 dark:text-slate-300">
                        Upload an Image to Auto-Decode QR or Barcode
                      </p>
                      <p className="mt-1 max-w-xs">
                        Automatically scans uploaded PNG, JPG, WebP, or SVG images for QR codes and barcodes 100% locally in your browser.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
