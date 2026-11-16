import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  RotateCcw,
  Copy,
  Check,
  ArrowLeftRight,
  ZoomIn,
  ZoomOut,
  Plus,
  Trash2,
  Calculator,
  Compass,
  Clock,
  HeartPulse,
  DollarSign,
  AlertTriangle,
  Download,
  Volume2,
  Square,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
} from 'lucide-react';
import { StudioTool } from '../data/toolsCatalog';
import {
  copyTextToClipboard,
  readTextFromClipboard,
} from '../utils/browserCapabilities';
import {
  AngleMode,
  formatCleanNumber,
  roundClean,
  numVal,
  parseNumInput,
  computeZoneUtcDateFromLocalMinutes,
  evaluateMathExpression,
  convertBaseBigInt,
  computeBitwiseBigInt,
  simplifyRatioAndProportion,
  UNIT_CONVERTER_CONFIGS,
  convertUnitValue,
  calculateUsNavyBodyFat,
  calculateOneRepMax,
  calculateCompoundInterestExact,
  calculateExactAgeChronological,
  calculateLoanEmiAmortization,
  calculateRoiMarginBreakEven,
  calculateOhmsLawAndPower,
  OhmsSolveMode,
  calculateDescriptiveStatistics,
  convertTypographyAndCssUnits,
  TypographyUnit,
  calculateBandwidthTransferTime,
  translateTextBinaryHexOctal,
  ByteCodeFormat,
  ByteTranslateMode,
  ByteDelimiter,
  translateMorseCode,
  MORSE_REFERENCE_CHART,
  runCipherStudio,
  CipherType,
  encodeDecodeBase64UrlHtml,
  EncoderFormatTab,
  inspectAsciiUnicodeCharacters,
} from '../utils/extraToolsEngine';
import type { CalcHistoryEntry } from '../utils/userStorage';

interface ExtraToolsWorkbenchProps {
  activeTool: StudioTool;
  isDark: boolean;
  calcHistoryForTool?: CalcHistoryEntry[];
  onSaveCalcHistoryEntry?: (
    summaryLabel: string,
    resultValue: string,
    stateSnapshot: Record<string, any>
  ) => void;
  onClearCalcHistoryForTool?: () => void;
  onNotify?: (msg: string) => void;
}

interface CurrencyMeta {
  code: string;
  name: string;
  symbol: string;
  ratePerUsd: number;
}

export const OFFLINE_CURRENCIES: CurrencyMeta[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', ratePerUsd: 1.0 },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', ratePerUsd: 94.26 },
  { code: 'EUR', name: 'Euro', symbol: '€', ratePerUsd: 0.92 },
  { code: 'GBP', name: 'British Pound', symbol: '£', ratePerUsd: 0.79 },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', ratePerUsd: 154.5 },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$', ratePerUsd: 1.39 },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', ratePerUsd: 1.53 },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', ratePerUsd: 0.88 },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', ratePerUsd: 7.24 },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', ratePerUsd: 1.34 },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED', ratePerUsd: 3.6725 },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', ratePerUsd: 5.75 },
];

const currencyDisplayNames =
  typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames(['en'], { type: 'currency' })
    : null;

function resolveCurrencyMetadata(code: string, ratePerUsd: number): CurrencyMeta {
  const upper = code.toUpperCase();
  const preset = OFFLINE_CURRENCIES.find((c) => c.code === upper);
  if (preset) {
    return { ...preset, ratePerUsd };
  }
  let name = upper;
  try {
    const resolved = currencyDisplayNames?.of(upper);
    if (resolved && resolved.toUpperCase() !== upper) {
      name = resolved;
    }
  } catch {
    name = upper;
  }
  let symbol = upper;
  try {
    const parts = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: upper,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(1);
    const symPart = parts.find((p) => p.type === 'currency');
    if (symPart?.value) symbol = symPart.value;
  } catch {
    symbol = upper;
  }
  return { code: upper, name, symbol, ratePerUsd };
}

const DEFAULT_WORLD_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

function getSupportedIanaTimezones(): string[] {
  try {
    if (typeof Intl !== 'undefined' && typeof (Intl as any).supportedValuesOf === 'function') {
      const list = (Intl as any).supportedValuesOf('timeZone') as string[];
      if (Array.isArray(list) && list.length > 0) {
        return ['UTC', ...list.filter((z) => z !== 'UTC')];
      }
    }
  } catch {
    // fallback below
  }
  return DEFAULT_WORLD_TIMEZONES;
}

function getDefaultToolState(toolId: string): Record<string, any> {
  if (toolId in UNIT_CONVERTER_CONFIGS) {
    const cfg = UNIT_CONVERTER_CONFIGS[toolId];
    return {
      value: cfg.defaultValue,
      fromUnit: cfg.defaultFrom,
      toUnit: cfg.defaultTo,
    };
  }

  switch (toolId) {
    case 'extra-1-apr-monthly':
      return { monthlyRate: 1.5, loanBalance: 10000 };
    case 'extra-2-wage-converter':
      return { mode: 'annual-to-hourly', amount: 85000, hoursPerWeek: 40, weeksPerYear: 52 };
    case 'extra-3-cagr':
      return { beginValue: 10000, endValue: 24500, years: 5 };
    case 'extra-4-compound-interest':
      return {
        principal: 10000,
        annualRate: 8,
        compoundingPerYear: 12,
        years: 10,
        contribution: 250,
        contributionCadence: 'monthly',
      };
    case 'extra-5-currency-converter':
      return {
        amount: 1000,
        fromCurrency: 'USD',
        toCurrency: 'INR',
        useCustomRate: false,
        customRate: 94.26,
        showSymbols: true,
      };
    case 'extra-6-percentage-change':
      return { v1: 120, v2: 150, pctX: 15, pctY: 240, partX: 45, wholeY: 180 };
    case 'extra-7-discount-tax':
      return {
        originalPrice: 250,
        discountType: 'percent',
        discountValue: 20,
        extraPromoPct: 0,
        taxPct: 8.5,
      };
    case 'extra-8-tip-split':
      return { billAmount: 145, tipPct: 18, people: 4 };
    case 'extra-9-graphing-2d':
      return {
        fxExpr: 'x^2 - 4',
        gxExpr: '2*x - 1',
        xMin: -10,
        xMax: 10,
        yMin: -10,
        yMax: 10,
        angleMode: 'RAD' as AngleMode,
        evalX: 2,
      };
    case 'extra-10-quadratic-solver':
      return { a: 1, b: -5, c: 6 };
    case 'extra-11-bodmas-calc':
      return { expression: '2(3 + 4) + sin(30) * 10', angleMode: 'DEG' as AngleMode };
    case 'extra-12-base-ratio':
      return {
        inputValue: '255',
        fromBase: 10 as 2 | 8 | 10 | 16,
        bitA: '240',
        bitB: '170',
        ratioA: 1920,
        ratioB: 1080,
        propC: 16,
      };
    case 'extra-27-exact-age':
      return {
        birthDate: '1996-05-15',
        targetDate: new Date().toISOString().slice(0, 10),
      };
    case 'extra-28-world-time': {
      let localZone = 'UTC';
      try {
        localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      } catch {
        localZone = 'UTC';
      }
      return {
        baseZone: localZone,
        sliderMinutes: 14 * 60, // 14:00 in baseZone
        use24Hour: true,
        liveClock: false,
        selectedZones: DEFAULT_WORLD_TIMEZONES.includes(localZone)
          ? [...DEFAULT_WORLD_TIMEZONES]
          : [localZone, ...DEFAULT_WORLD_TIMEZONES],
        searchQuery: '',
      };
    }
    case 'extra-29-bmi':
      return {
        unitSystem: 'metric',
        weightKg: 72,
        heightCm: 175,
        weightLb: 160,
        heightFt: 5,
        heightIn: 9,
      };
    case 'extra-30-bmr-tdee':
      return {
        sex: 'male',
        age: 29,
        unitSystem: 'metric',
        weightKg: 75,
        heightCm: 178,
        weightLb: 165,
        heightFt: 5,
        heightIn: 10,
        heightInTotal: 70,
        activityMultiplier: 1.55,
      };
    case 'extra-31-body-fat':
      return {
        sex: 'male',
        age: 30,
        unitSystem: 'metric',
        weightKg: 78,
        heightCm: 178,
        neckCm: 38,
        waistCm: 84,
        hipCm: 96,
        weightLb: 172,
        heightFt: 5,
        heightIn: 10,
        neckIn: 15,
        waistIn: 33,
        hipIn: 38,
      };
    case 'extra-32-one-rep-max':
      return { weight: 100, reps: 5, unit: 'kg' };
    case 'extra-33-loan-emi':
      return {
        principalAmount: 350000,
        annualRatePercent: 6.5,
        tenureYears: 30,
        extraMonthlyPayment: 200,
      };
    case 'extra-34-roi-margin':
      return {
        unitCost: 42,
        sellingPrice: 95,
        unitsSold: 500,
        fixedOverheadCost: 12000,
      };
    case 'extra-35-ohms-law':
      return {
        solveMode: 'from-v-i' as OhmsSolveMode,
        inputA: 24,
        inputB: 2.5,
        resistorR1: 100,
        resistorR2: 220,
      };
    case 'extra-36-statistics-calc':
      return {
        datasetText: '12, 15, 18, 22, 22, 25, 29, 34, 41, 48',
      };
    case 'extra-37-typography-css':
      return {
        value: 24,
        fromUnit: 'px' as TypographyUnit,
        baseFontPx: 16,
        dpi: 96,
      };
    case 'extra-38-bandwidth-transfer':
      return {
        fileSize: 25,
        fileSizeUnit: 'GB',
        bandwidthSpeed: 250,
        bandwidthUnit: 'Mbps',
        overheadPercent: 5,
      };
    case 'extra-39-binary-hex-octal':
      return {
        input: 'Forma Studio 2026',
        mode: 'text-to-code' as ByteTranslateMode,
        format: 'binary' as ByteCodeFormat,
        delimiter: 'space' as ByteDelimiter,
        useUtf8: true,
        padLeadingZeros: true,
      };
    case 'extra-40-morse-code':
      return {
        input: 'SOS FORMA STUDIO',
        mode: 'text-to-morse',
        wordSeparator: 'slash',
        wpm: 18,
        toneHz: 600,
        volume: 65,
        showReferenceChart: false,
      };
    case 'extra-41-cipher-studio':
      return {
        input: 'MEET AT DAWN IN THE VAULT',
        cipher: 'caesar' as CipherType,
        mode: 'encode',
        shift: 3,
        preserveSpaces: true,
        showAll25Shifts: false,
      };
    case 'extra-42-base64-url-html':
      return {
        input: 'https://formastudio.app/search?q=PDF & Image <Studio>',
        format: 'base64' as EncoderFormatTab,
        mode: 'encode',
        urlSafeBase64: false,
        urlScope: 'component',
      };
    case 'extra-43-unicode-inspector':
      return {
        input: 'Forma Studio — 169 Tools ✓',
      };
    default:
      return {};
  }
}

export const ExtraToolsWorkbench: React.FC<ExtraToolsWorkbenchProps> = ({
  activeTool,
  isDark,
  calcHistoryForTool = [],
  onSaveCalcHistoryEntry,
  onClearCalcHistoryForTool,
  onNotify,
}) => {
  const [stateByToolId, setStateByToolId] = useState<Record<string, Record<string, any>>>(() => ({
    [activeTool.id]: getDefaultToolState(activeTool.id),
  }));
  const [bodmasTape, setBodmasTape] = useState<
    { id: string; expr: string; mode: AngleMode; result: string }[]
  >([]);
  const [copiedFlag, setCopiedFlag] = useState<boolean>(false);
  const [isPlayingMorse, setIsPlayingMorse] = useState<boolean>(false);
  const morseAudioCtxRef = useRef<AudioContext | null>(null);
  const morseStopTimerRef = useRef<number | null>(null);

  const stopMorseAudio = () => {
    if (morseStopTimerRef.current !== null) {
      window.clearTimeout(morseStopTimerRef.current);
      morseStopTimerRef.current = null;
    }
    if (morseAudioCtxRef.current) {
      try {
        morseAudioCtxRef.current.close();
      } catch {
        // ignore
      }
      morseAudioCtxRef.current = null;
    }
    setIsPlayingMorse(false);
  };

  useEffect(() => {
    return () => {
      stopMorseAudio();
    };
  }, [activeTool.id]);

  const playMorseAudio = (morseString: string, wpm: number, toneHz: number, volumePct: number) => {
    stopMorseAudio();
    const cleaned = String(morseString || '').trim();
    if (!cleaned) return;

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) {
      onNotify?.('Web Audio API is not supported in this browser.');
      return;
    }

    const ctx = new AudioCtx();
    morseAudioCtxRef.current = ctx;
    setIsPlayingMorse(true);

    const safeWpm = Math.max(5, Math.min(30, Number(wpm) || 18));
    const safeFreq = Math.max(400, Math.min(900, Number(toneHz) || 600));
    const safeGain = Math.max(0.02, Math.min(1, (Number(volumePct) || 65) / 100));
    const dotDurationSec = 1.2 / safeWpm;

    let cursor = ctx.currentTime + 0.04;
    for (let i = 0; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (ch === '.' || ch === '-') {
        const dur = ch === '.' ? dotDurationSec : dotDurationSec * 3;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(safeFreq, cursor);
        gain.gain.setValueAtTime(0.001, cursor);
        gain.gain.exponentialRampToValueAtTime(safeGain, cursor + 0.008);
        gain.gain.setValueAtTime(safeGain, cursor + Math.max(0.01, dur - 0.008));
        gain.gain.exponentialRampToValueAtTime(0.001, cursor + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(cursor);
        osc.stop(cursor + dur + 0.01);
        cursor += dur + dotDurationSec;
      } else if (ch === ' ') {
        cursor += dotDurationSec * 2;
      } else if (ch === '/') {
        cursor += dotDurationSec * 4;
      }
    }

    const totalMs = Math.max(100, Math.ceil((cursor - ctx.currentTime) * 1000));
    morseStopTimerRef.current = window.setTimeout(() => {
      stopMorseAudio();
    }, totalMs);
  };

  // Graph Canvas & Hover/Touch Trace state (#9)
  const graphCanvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverCoord, setHoverCoord] = useState<{
    x: number;
    fx: number | null;
    gx: number | null;
  } | null>(null);
  const [canvasResizeTick, setCanvasResizeTick] = useState<number>(0);

  // Live Currency Exchange Rate State (#5 — Auto-updates on mount and every 60s for all 150+ currencies)
  const [liveUsdRates, setLiveUsdRates] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    OFFLINE_CURRENCIES.forEach((c) => {
      map[c.code] = c.ratePerUsd;
    });
    return map;
  });
  const [rateSource, setRateSource] = useState<'live-market' | 'baseline-fallback'>(
    'baseline-fallback'
  );
  const [lastRateSyncTime, setLastRateSyncTime] = useState<string>(() =>
    new Date().toTimeString().slice(0, 8)
  );
  const [isSyncingRates, setIsSyncingRates] = useState<boolean>(false);

  // Live ticking UTC clock state for #28 World Time Converter
  const [liveUtcDate, setLiveUtcDate] = useState<Date>(() => new Date());

  const allIanaZones = useMemo(() => getSupportedIanaTimezones(), []);

  // Merge OFFLINE_CURRENCIES with all 150+ live currency codes returned by liveUsdRates
  const allCurrenciesWithLiveRates = useMemo<CurrencyMeta[]>(() => {
    const seen = new Set<string>();
    const list: CurrencyMeta[] = [];

    for (const c of OFFLINE_CURRENCIES) {
      seen.add(c.code);
      list.push({
        ...c,
        ratePerUsd: liveUsdRates[c.code] ?? c.ratePerUsd,
      });
    }

    const extraCodes = Object.keys(liveUsdRates)
      .map((k) => k.toUpperCase())
      .filter((code) => !seen.has(code) && /^[A-Z]{3}$/.test(code))
      .sort();

    for (const code of extraCodes) {
      const rate = liveUsdRates[code];
      if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) {
        seen.add(code);
        list.push(resolveCurrencyMetadata(code, rate));
      }
    }

    return list;
  }, [liveUsdRates]);

  const fetchLiveCurrencyRates = async (force = false) => {
    setIsSyncingRates(true);
    try {
      const resp = await fetch(`/api/v1/currency-rates${force ? '?force=1' : ''}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.rates && typeof data.rates === 'object') {
          setLiveUsdRates((prev) => {
            const next = { ...prev, ...data.rates };
            next.USD = 1.0;
            return next;
          });
          setRateSource(data.source === 'live-market' ? 'live-market' : 'baseline-fallback');
          setLastRateSyncTime(new Date().toTimeString().slice(0, 8));
          setIsSyncingRates(false);
          return;
        }
      }
    } catch {
      // Fallback to direct public FX endpoint below
    }

    try {
      const resp2 = await fetch('https://open.er-api.com/v6/latest/USD');
      if (resp2.ok) {
        const data2 = await resp2.json();
        if (data2 && data2.rates && typeof data2.rates === 'object') {
          setLiveUsdRates((prev) => {
            const next = { ...prev, ...data2.rates };
            next.USD = 1.0;
            return next;
          });
          setRateSource('live-market');
          setLastRateSyncTime(new Date().toTimeString().slice(0, 8));
        }
      }
    } catch {
      setLastRateSyncTime(new Date().toTimeString().slice(0, 8));
    } finally {
      setIsSyncingRates(false);
    }
  };

  useEffect(() => {
    fetchLiveCurrencyRates(false);
    const intervalId = setInterval(() => {
      fetchLiveCurrencyRates(false);
    }, 60_000);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    setStateByToolId((prev) =>
      prev[activeTool.id]
        ? prev
        : { ...prev, [activeTool.id]: getDefaultToolState(activeTool.id) }
    );
    setCopiedFlag(false);
    setHoverCoord(null);
  }, [activeTool.id]);

  const toolState = stateByToolId[activeTool.id] || getDefaultToolState(activeTool.id);

  // Live 1s ticking clock for #28 World Time Converter when liveClock mode is active
  useEffect(() => {
    if (activeTool.id !== 'extra-28-world-time' || !toolState.liveClock) return;
    setLiveUtcDate(new Date());
    const id = setInterval(() => {
      setLiveUtcDate(new Date());
    }, 1000);
    return () => clearInterval(id);
  }, [activeTool.id, toolState.liveClock]);

  // ResizeObserver on #9 2D Graphing Canvas so mobile/tablet rotation redraws cleanly
  useEffect(() => {
    if (activeTool.id !== 'extra-9-graphing-2d') return;
    const canvas = graphCanvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      setCanvasResizeTick((t) => t + 1);
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [activeTool.id]);

  const updateState = (patch: Record<string, any>) => {
    setStateByToolId((prev) => ({
      ...prev,
      [activeTool.id]: {
        ...(prev[activeTool.id] || getDefaultToolState(activeTool.id)),
        ...patch,
      },
    }));
  };

  const handleResetTool = () => {
    setStateByToolId((prev) => ({
      ...prev,
      [activeTool.id]: getDefaultToolState(activeTool.id),
    }));
    setHoverCoord(null);
  };

  const handleCopyText = async (textToCopy: string) => {
    const ok = await copyTextToClipboard(textToCopy);
    if (ok) {
      setCopiedFlag(true);
      onNotify?.('Result copied to clipboard');
      setTimeout(() => setCopiedFlag(false), 1800);
    } else {
      onNotify?.('Clipboard access unavailable — please select and copy manually.');
    }
  };

  const handlePasteIntoInput = async (fieldKey = 'input') => {
    const res = await readTextFromClipboard();
    if (res.ok && res.text) {
      updateState({ [fieldKey]: res.text });
      onNotify?.(`Pasted ${res.text.length.toLocaleString()} characters from clipboard`);
    } else {
      onNotify?.(res.error || 'Clipboard is empty or permission was denied — use Ctrl/Cmd+V.');
    }
  };

  const handleExportSummaryTxt = (summaryText: string) => {
    const content = [
      `Forma Studio — Calculator & Converter Studio Report`,
      `Tool: #${String(activeTool.number).padStart(2, '0')} ${activeTool.name} (${activeTool.categoryName})`,
      `Generated At: ${new Date().toISOString()}`,
      `------------------------------------------------------------`,
      `Result Summary:`,
      summaryText,
      ``,
      `Input Parameters:`,
      JSON.stringify(toolState, null, 2),
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTool.id}_report.txt`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify?.(`Exported ${activeTool.name} summary (.txt)`);
  };

  // Draw 2D Graphing Calculator Canvas (#9) with Asymptote Guard & ResizeObserver Sync
  useEffect(() => {
    if (activeTool.id !== 'extra-9-graphing-2d') return;
    const canvas = graphCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const cssW = canvas.clientWidth || 640;
    const cssH = canvas.clientHeight || 380;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const xMin = numVal(toolState.xMin, -10);
    const xMax = numVal(toolState.xMax, 10);
    const yMin = numVal(toolState.yMin, -10);
    const yMax = numVal(toolState.yMax, 10);
    const angleMode: AngleMode = toolState.angleMode || 'RAD';

    // Background
    ctx.fillStyle = isDark ? '#090D16' : '#FFFFFF';
    ctx.fillRect(0, 0, cssW, cssH);

    if (
      !Number.isFinite(xMin) ||
      !Number.isFinite(xMax) ||
      !Number.isFinite(yMin) ||
      !Number.isFinite(yMax) ||
      xMax <= xMin ||
      yMax <= yMin
    ) {
      return;
    }

    const xSpan = xMax - xMin;
    const ySpan = yMax - yMin;
    const toPxX = (x: number) => ((x - xMin) / xSpan) * cssW;
    const toPxY = (y: number) => cssH - ((y - yMin) / ySpan) * cssH;

    // Gridlines
    ctx.lineWidth = 1;
    ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(15, 23, 42, 0.08)';
    const xStep = Math.pow(10, Math.floor(Math.log10(xSpan))) / 2 || 1;
    const yStep = Math.pow(10, Math.floor(Math.log10(ySpan))) / 2 || 1;

    const firstXGrid = Math.ceil(xMin / xStep) * xStep;
    for (let x = firstXGrid; x <= xMax; x += xStep) {
      const px = toPxX(x);
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, cssH);
      ctx.stroke();
    }

    const firstYGrid = Math.ceil(yMin / yStep) * yStep;
    for (let y = firstYGrid; y <= yMax; y += yStep) {
      const py = toPxY(y);
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(cssW, py);
      ctx.stroke();
    }

    // X=0 and Y=0 Principal Axes
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.45)' : 'rgba(15, 23, 42, 0.35)';
    if (xMin <= 0 && xMax >= 0) {
      const zeroX = toPxX(0);
      ctx.beginPath();
      ctx.moveTo(zeroX, 0);
      ctx.lineTo(zeroX, cssH);
      ctx.stroke();
    }
    if (yMin <= 0 && yMax >= 0) {
      const zeroY = toPxY(0);
      ctx.beginPath();
      ctx.moveTo(0, zeroY);
      ctx.lineTo(cssW, zeroY);
      ctx.stroke();
    }

    // Function Curve Plotter with Asymptote Discontinuity Guard
    const plotFunction = (expr: string, strokeColor: string) => {
      if (!expr || !expr.trim()) return;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2.25;
      ctx.beginPath();

      const samples = Math.max(400, Math.round(cssW * 1.5));
      let penDown = false;
      let prevY: number | null = null;

      for (let i = 0; i <= samples; i++) {
        const x = xMin + (i / samples) * xSpan;
        let y = NaN;
        try {
          y = evaluateMathExpression(expr, { x }, angleMode);
        } catch {
          y = NaN;
        }

        if (!Number.isFinite(y) || Math.abs(y) > ySpan * 50) {
          penDown = false;
          prevY = null;
          continue;
        }

        // Asymptote / Vertical Discontinuity Guard (e.g., tan(x) or 1/x jumping across poles)
        if (prevY !== null && Math.abs(y - prevY) > ySpan * 1.25) {
          penDown = false;
        }

        const px = toPxX(x);
        const py = toPxY(y);

        if (!penDown) {
          ctx.moveTo(px, py);
          penDown = true;
        } else {
          ctx.lineTo(px, py);
        }
        prevY = y;
      }
      ctx.stroke();
    };

    plotFunction(String(toolState.fxExpr || ''), '#10B981'); // Emerald f(x)
    plotFunction(String(toolState.gxExpr || ''), '#3B82F6'); // Blue g(x)

    // Draw Hover / Touch Crosshair & Point Markers
    if (hoverCoord && hoverCoord.x >= xMin && hoverCoord.x <= xMax) {
      const cx = toPxX(hoverCoord.x);
      ctx.strokeStyle = isDark ? 'rgba(226, 232, 240, 0.45)' : 'rgba(15, 23, 42, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, cssH);
      ctx.stroke();
      ctx.setLineDash([]);

      if (hoverCoord.fx !== null && Number.isFinite(hoverCoord.fx)) {
        const fy = toPxY(hoverCoord.fx);
        ctx.fillStyle = '#10B981';
        ctx.beginPath();
        ctx.arc(cx, fy, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (hoverCoord.gx !== null && Number.isFinite(hoverCoord.gx)) {
        const gy = toPxY(hoverCoord.gx);
        ctx.fillStyle = '#3B82F6';
        ctx.beginPath();
        ctx.arc(cx, gy, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [activeTool.id, toolState, isDark, hoverCoord, canvasResizeTick]);

  const updateGraphTraceFromClientX = (clientX: number) => {
    const canvas = graphCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const xMin = numVal(toolState.xMin, -10);
    const xMax = numVal(toolState.xMax, 10);
    const angleMode: AngleMode = toolState.angleMode || 'RAD';
    const x = roundClean(xMin + ratio * (xMax - xMin), 4);

    let fx: number | null = null;
    let gx: number | null = null;
    try {
      const v1 = evaluateMathExpression(String(toolState.fxExpr || ''), { x }, angleMode);
      if (Number.isFinite(v1)) fx = v1;
    } catch {
      fx = null;
    }
    try {
      if (String(toolState.gxExpr || '').trim()) {
        const v2 = evaluateMathExpression(String(toolState.gxExpr || ''), { x }, angleMode);
        if (Number.isFinite(v2)) gx = v2;
      }
    } catch {
      gx = null;
    }
    setHoverCoord({ x, fx, gx });
  };

  // Render Tool-Specific Interactive Stage & Summary Text
  const renderToolContent = (): { ui: React.ReactNode; summaryToCopy: string } => {
    const id = activeTool.id;

    // ------------------------------------------------------------------------
    // #1 APR FROM MONTHLY RATE
    // ------------------------------------------------------------------------
    if (id === 'extra-1-apr-monthly') {
      const rmPct = numVal(toolState.monthlyRate, 0);
      const loanBal = Math.max(0, numVal(toolState.loanBalance, 0));
      const rmDec = rmPct / 100;
      const nominalAprPct = rmPct * 12;
      const earPct = (Math.pow(1 + rmDec, 12) - 1) * 100;
      const dailyRatePct = nominalAprPct / 365;
      const monthlyInterestCost = loanBal * rmDec;
      const annualCompoundedInterest = loanBal * (earPct / 100);

      const summary = `Monthly Rate: ${formatCleanNumber(rmPct, 4)}% | Nominal APR: ${formatCleanNumber(nominalAprPct, 4)}% | Effective Annual Rate (EAR): ${formatCleanNumber(earPct, 4)}%`;

      return {
        summaryToCopy: summary,
        ui: (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Monthly Periodic Rate Input
              </h3>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Monthly Interest Rate (r_m %)
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={toolState.monthlyRate}
                  onChange={(e) => updateState({ monthlyRate: parseNumInput(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Reference Principal / Balance ($)
                </label>
                <input
                  type="number"
                  step="500"
                  value={toolState.loanBalance}
                  onChange={(e) => updateState({ loanBalance: parseNumInput(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Nominal APR vs. Effective Annual Rate (EAR)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/70 rounded-lg">
                  <div className="text-xs text-emerald-800 dark:text-emerald-300">
                    Nominal APR (r_m × 12)
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300 mt-1">
                    {formatCleanNumber(nominalAprPct, 4)}%
                  </div>
                </div>
                <div className="p-3.5 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/70 rounded-lg">
                  <div className="text-xs text-blue-800 dark:text-blue-300">
                    Effective Annual Rate ((1+r_m)^12 − 1)
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-blue-700 dark:text-blue-300 mt-1">
                    {formatCleanNumber(earPct, 4)}%
                  </div>
                </div>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono tabular-nums">
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500">Daily Periodic Rate (APR / 365)</span>
                  <span className="font-semibold">{formatCleanNumber(dailyRatePct, 5)}%</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500">1st Month Interest on Balance</span>
                  <span className="font-semibold">${formatCleanNumber(monthlyInterestCost, 2)}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500">1-Year Compounded Interest (EAR)</span>
                  <span className="font-semibold">
                    ${formatCleanNumber(annualCompoundedInterest, 2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ),
      };
    }

    // ------------------------------------------------------------------------
    // #2 ANNUAL <-> HOURLY WAGE CONVERTER
    // ------------------------------------------------------------------------
    if (id === 'extra-2-wage-converter') {
      const mode = toolState.mode || 'annual-to-hourly';
      const amount = Math.max(0, numVal(toolState.amount, 0));
      const hoursPerWeek = Math.max(1, numVal(toolState.hoursPerWeek, 40));
      const weeksPerYear = Math.max(1, numVal(toolState.weeksPerYear, 52));
      const totalHoursYear = hoursPerWeek * weeksPerYear;

      const annualGross =
        mode === 'annual-to-hourly' ? amount : amount * totalHoursYear;
      const hourlyWage =
        mode === 'annual-to-hourly' ? amount / totalHoursYear : amount;
      const weeklyPay = hourlyWage * hoursPerWeek;
      const biWeeklyPay = weeklyPay * 2;
      const dailyPay = weeklyPay / 5;
      const monthlyPay = annualGross / 12;

      const summary = `Annual Salary: $${formatCleanNumber(annualGross, 2)} | Hourly Wage: $${formatCleanNumber(hourlyWage, 2)}/hr | Monthly: $${formatCleanNumber(monthlyPay, 2)} | Weekly: $${formatCleanNumber(weeklyPay, 2)}`;

      return {
        summaryToCopy: summary,
        ui: (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Payroll Conversion Mode
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    updateState({
                      mode:
                        mode === 'annual-to-hourly' ? 'hourly-to-annual' : 'annual-to-hourly',
                      amount:
                        mode === 'annual-to-hourly'
                          ? roundClean(hourlyWage, 2)
                          : roundClean(annualGross, 2),
                    })
                  }
                  className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 text-white rounded-md flex items-center gap-1"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  <span>
                    {mode === 'annual-to-hourly' ? 'Annual → Hourly' : 'Hourly → Annual'}
                  </span>
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {mode === 'annual-to-hourly'
                    ? 'Annual Gross Salary ($)'
                    : 'Hourly Wage Rate ($/hr)'}
                </label>
                <input
                  type="number"
                  step={mode === 'annual-to-hourly' ? '1000' : '0.5'}
                  value={toolState.amount}
                  onChange={(e) => updateState({ amount: parseNumInput(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Hours / Week
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={168}
                    value={toolState.hoursPerWeek}
                    onChange={(e) => updateState({ hoursPerWeek: parseNumInput(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Weeks / Year
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={52}
                    value={toolState.weeksPerYear}
                    onChange={(e) => updateState({ weeksPerYear: parseNumInput(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Complete Compensation Schedule
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/70 rounded-lg">
                  <div className="text-xs text-emerald-800 dark:text-emerald-300">Hourly Wage</div>
                  <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300 mt-0.5">
                    ${formatCleanNumber(hourlyWage, 2)}/hr
                  </div>
                </div>
                <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/70 rounded-lg">
                  <div className="text-xs text-blue-800 dark:text-blue-300">Annual Gross</div>
                  <div className="text-xl font-bold font-mono tabular-nums text-blue-700 dark:text-blue-300 mt-0.5">
                    ${formatCleanNumber(annualGross, 2)}/yr
                  </div>
                </div>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono tabular-nums">
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500">Monthly Gross (12 mo)</span>
                  <span className="font-semibold">${formatCleanNumber(monthlyPay, 2)}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500">Bi-Weekly Paycheck</span>
                  <span className="font-semibold">${formatCleanNumber(biWeeklyPay, 2)}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500">Weekly Gross</span>
                  <span className="font-semibold">${formatCleanNumber(weeklyPay, 2)}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500">Daily Rate (5 days/wk)</span>
                  <span className="font-semibold">${formatCleanNumber(dailyPay, 2)}</span>
                </div>
              </div>
            </div>
          </div>
        ),
      };
    }

    // ------------------------------------------------------------------------
    // #3 CAGR CALCULATOR
    // ------------------------------------------------------------------------
    if (id === 'extra-3-cagr') {
      const v0 = numVal(toolState.beginValue, 0);
      const vn = numVal(toolState.endValue, 0);
      const years = numVal(toolState.years, 0);

      const valid = v0 > 0 && vn >= 0 && years > 0;
      const cagrPct = valid ? (Math.pow(vn / v0, 1 / years) - 1) * 100 : 0;
      const multiple = valid ? vn / v0 : 0;
      const netGain = vn - v0;

      const summary = valid
        ? `CAGR: ${formatCleanNumber(cagrPct, 2)}% | Growth Multiple: ${formatCleanNumber(multiple, 2)}x | Net Gain: $${formatCleanNumber(netGain, 2)}`
        : 'Enter positive Beginning Value and Years.';

      return {
        summaryToCopy: summary,
        ui: (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Investment Horizon Parameters
              </h3>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Beginning Value (V_0)
                </label>
                <input
                  type="number"
                  value={toolState.beginValue}
                  onChange={(e) => updateState({ beginValue: parseNumInput(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Ending Value (V_n)
                </label>
                <input
                  type="number"
                  value={toolState.endValue}
                  onChange={(e) => updateState({ endValue: parseNumInput(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Number of Periods / Years (n)
                </label>
                <input
                  type="number"
                  min={0.1}
                  step="1"
                  value={toolState.years}
                  onChange={(e) => updateState({ years: parseNumInput(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Compound Annual Growth Output
              </h3>
              <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/70 rounded-lg">
                <div className="text-xs text-emerald-800 dark:text-emerald-300">
                  Compound Annual Growth Rate (CAGR)
                </div>
                <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300 mt-1">
                  {valid ? `${formatCleanNumber(cagrPct, 2)}%` : 'Invalid Input'}
                </div>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono tabular-nums">
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500">Total Growth Multiple (V_n / V_0)</span>
                  <span className="font-semibold">{formatCleanNumber(multiple, 3)}×</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500">Absolute Gain (V_n − V_0)</span>
                  <span className="font-semibold">${formatCleanNumber(netGain, 2)}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500">Total Return Percentage</span>
                  <span className="font-semibold">
                    {v0 > 0 ? `${formatCleanNumber(((vn - v0) / v0) * 100, 2)}%` : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ),
      };
    }

    // ------------------------------------------------------------------------
    // #4 COMPOUND INTEREST CALCULATOR (Exact Periodic Rate Conversion)
    // ------------------------------------------------------------------------
    if (id === 'extra-4-compound-interest') {
      const ci = calculateCompoundInterestExact({
        principal: numVal(toolState.principal, 0),
        annualRatePct: numVal(toolState.annualRate, 0),
        compoundingPerYear: numVal(toolState.compoundingPerYear, 12),
        years: numVal(toolState.years, 0),
        contribution: numVal(toolState.contribution, 0),
        contributionCadence:
          toolState.contributionCadence === 'annual' ? 'annual' : 'monthly',
      });

      const {
        finalBalance,
        totalPrincipalContributed,
        totalInterestEarned,
        principalSharePct,
        effectivePeriodicRatePct,
      } = ci;

      const summary = `Future Value: $${formatCleanNumber(finalBalance, 2)} | Total Principal: $${formatCleanNumber(totalPrincipalContributed, 2)} | Total Interest Earned: $${formatCleanNumber(totalInterestEarned, 2)}`;

      return {
        summaryToCopy: summary,
        ui: (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3.5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Compounding &amp; Contribution Inputs
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Initial Principal ($)
                  </label>
                  <input
                    type="number"
                    value={toolState.principal}
                    onChange={(e) => updateState({ principal: parseNumInput(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Annual Rate (r %)
                  </label>
                  <input
                    type="number"
                    step="0.25"
                    value={toolState.annualRate}
                    onChange={(e) => updateState({ annualRate: parseNumInput(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Compounding (k / yr)
                  </label>
                  <select
                    value={toolState.compoundingPerYear}
                    onChange={(e) => updateState({ compoundingPerYear: Number(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs"
                  >
                    <option value={1}>Annually (1×/yr)</option>
                    <option value={2}>Semi-Annually (2×/yr)</option>
                    <option value={4}>Quarterly (4×/yr)</option>
                    <option value={12}>Monthly (12×/yr)</option>
                    <option value={365}>Daily (365×/yr)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Time Horizon (Years)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={toolState.years}
                    onChange={(e) => updateState({ years: parseNumInput(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Recurring Deposit ($)
                  </label>
                  <input
                    type="number"
                    value={toolState.contribution}
                    onChange={(e) => updateState({ contribution: parseNumInput(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Deposit Cadence
                  </label>
                  <select
                    value={toolState.contributionCadence}
                    onChange={(e) => updateState({ contributionCadence: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs"
                  >
                    <option value="monthly">Monthly (12×/yr)</option>
                    <option value="annual">Annually (1×/yr)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Future Value &amp; Principal vs. Interest Split
              </h3>
              <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/70 rounded-lg">
                <div className="text-xs text-emerald-800 dark:text-emerald-300">
                  Projected Future Value (FV)
                </div>
                <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300 mt-1">
                  ${formatCleanNumber(finalBalance, 2)}
                </div>
              </div>

              <div className="w-full h-3 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden flex">
                <div
                  className="bg-blue-600 h-full"
                  style={{ width: `${Math.min(100, Math.max(0, principalSharePct))}%` }}
                  title="Total Principal"
                />
                <div
                  className="bg-emerald-500 h-full flex-1"
                  title="Total Interest Earned"
                />
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono tabular-nums">
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500">Total Principal Contributed</span>
                  <span className="font-semibold text-blue-600 dark:text-blue-400">
                    ${formatCleanNumber(totalPrincipalContributed, 2)} (
                    {formatCleanNumber(principalSharePct, 1)}%)
                  </span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500">Total Compound Interest Earned</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    ${formatCleanNumber(totalInterestEarned, 2)} (
                    {formatCleanNumber(100 - principalSharePct, 1)}%)
                  </span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500">Effective Periodic Deposit Rate (r_m)</span>
                  <span className="font-semibold">{formatCleanNumber(effectivePeriodicRatePct, 4)}%</span>
                </div>
              </div>

              {/* Year-by-Year Compounding Schedule & CSV Export */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => updateState({ showSchedule: !toolState.showSchedule })}
                    className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    {toolState.showSchedule
                      ? 'Hide Year-by-Year Schedule'
                      : `View Year-by-Year Schedule (${Math.max(1, Math.min(50, Math.round(numVal(toolState.years, 10))))} Years)`}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const totalYrs = Math.max(1, Math.min(50, Math.round(numVal(toolState.years, 10))));
                      const rows: string[] = ['Year,Principal_Contributed,Interest_Earned,Ending_Balance'];
                      for (let y = 1; y <= totalYrs; y++) {
                        const stepCi = calculateCompoundInterestExact({
                          principal: numVal(toolState.principal, 0),
                          annualRatePct: numVal(toolState.annualRate, 0),
                          compoundingPerYear: numVal(toolState.compoundingPerYear, 12),
                          years: y,
                          contribution: numVal(toolState.contribution, 0),
                          contributionCadence:
                            toolState.contributionCadence === 'annual' ? 'annual' : 'monthly',
                        });
                        rows.push(
                          `${y},${stepCi.totalPrincipalContributed.toFixed(2)},${stepCi.totalInterestEarned.toFixed(2)},${stepCi.finalBalance.toFixed(2)}`
                        );
                      }
                      const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'compound_schedule_yearly.csv';
                      a.click();
                      URL.revokeObjectURL(url);
                      onNotify?.('Exported Year-by-Year Schedule CSV');
                    }}
                    className="px-2.5 py-1 text-[11px] font-mono bg-slate-100 dark:bg-slate-800 hover:bg-emerald-600 hover:text-white rounded flex items-center gap-1 transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    <span>Export Schedule CSV</span>
                  </button>
                </div>

                {Boolean(toolState.showSchedule) && (
                  <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800 text-[11px] font-mono tabular-nums">
                    <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-950 font-bold text-slate-600 dark:text-slate-300 grid grid-cols-4 gap-2">
                      <span>Year</span>
                      <span>Principal</span>
                      <span>Interest</span>
                      <span className="text-right">Balance</span>
                    </div>
                    {Array.from({
                      length: Math.max(1, Math.min(50, Math.round(numVal(toolState.years, 10)))),
                    }).map((_, idx) => {
                      const yr = idx + 1;
                      const stepCi = calculateCompoundInterestExact({
                        principal: numVal(toolState.principal, 0),
                        annualRatePct: numVal(toolState.annualRate, 0),
                        compoundingPerYear: numVal(toolState.compoundingPerYear, 12),
                        years: yr,
                        contribution: numVal(toolState.contribution, 0),
                        contributionCadence:
                          toolState.contributionCadence === 'annual' ? 'annual' : 'monthly',
                      });
                      return (
                        <div key={yr} className="px-3 py-1.5 grid grid-cols-4 gap-2">
                          <span className="text-slate-500">Yr {yr}</span>
                          <span>${formatCleanNumber(stepCi.totalPrincipalContributed, 0)}</span>
                          <span className="text-emerald-600 dark:text-emerald-400">
                            +${formatCleanNumber(stepCi.totalInterestEarned, 0)}
                          </span>
                          <span className="text-right font-semibold">
                            ${formatCleanNumber(stepCi.finalBalance, 0)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        ),
      };
    }

    // ------------------------------------------------------------------------
    // #5 CURRENCY CONVERTER (Live Auto-Updating Market Rates for All 150+ World Currencies)
    // ------------------------------------------------------------------------
    if (id === 'extra-5-currency-converter') {
      const amount = numVal(toolState.amount, 0);
      const fromCode = String(toolState.fromCurrency || 'USD').toUpperCase();
      const toCode = String(toolState.toCurrency || 'INR').toUpperCase();
      const useCustom = Boolean(toolState.useCustomRate);
      const showSymbols = Boolean(toolState.showSymbols ?? true);

      const fromMeta =
        allCurrenciesWithLiveRates.find((c) => c.code === fromCode) ||
        resolveCurrencyMetadata(fromCode, liveUsdRates[fromCode] ?? 1);
      const toMeta =
        allCurrenciesWithLiveRates.find((c) => c.code === toCode) ||
        resolveCurrencyMetadata(toCode, liveUsdRates[toCode] ?? 1);

      const defaultCrossRate = toMeta.ratePerUsd / fromMeta.ratePerUsd;
      const customRateVal = numVal(toolState.customRate, defaultCrossRate);
      const effectiveRate = useCustom
        ? Math.max(0.000001, customRateVal > 0 ? customRateVal : defaultCrossRate)
        : defaultCrossRate;
      const converted = amount * effectiveRate;
      const inverseRate = 1 / effectiveRate;

      const fmtFrom = `${showSymbols ? fromMeta.symbol : ''}${formatCleanNumber(amount, 2)} ${fromCode}`;
      const fmtTo = `${showSymbols ? toMeta.symbol : ''}${formatCleanNumber(converted, 2)} ${toCode}`;
      const summary = `${fmtFrom} = ${fmtTo} (Rate: 1 ${fromCode} = ${formatCleanNumber(effectiveRate, 4)} ${toCode})`;

      return {
        summaryToCopy: summary,
        ui: (
          <div className="space-y-4">
            {/* Dynamic Live Rate Telemetry Badge for ONLY the Active Selected Currency Pair */}
            <div className="p-3.5 bg-emerald-50/80 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-900/70 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 font-mono text-emerald-900 dark:text-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span>
                  Live Market Rate:{' '}
                  <strong>
                    1 {fromCode} = {showSymbols ? toMeta.symbol : ''}
                    {formatCleanNumber(effectiveRate, 4)} {toCode}
                  </strong>{' '}
                  (Inverse: 1 {toCode} = {showSymbols ? fromMeta.symbol : ''}
                  {formatCleanNumber(inverseRate, 4)} {fromCode}) ·{' '}
                  {rateSource === 'live-market' ? 'Live Market Feed' : 'Offline Fallback'} (Last
                  synced: {lastRateSyncTime})
                </span>
              </div>
              <button
                type="button"
                onClick={() => fetchLiveCurrencyRates(true)}
                disabled={isSyncingRates}
                className="px-2.5 py-1 text-xs font-semibold bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 rounded-md hover:bg-emerald-100/60 dark:hover:bg-slate-800 transition-colors shrink-0"
              >
                {isSyncingRates ? 'Syncing Rates...' : 'Refresh Live Rates'}
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Currency Exchange Parameters ({allCurrenciesWithLiveRates.length} World Currencies)
                  </h3>
                  <button
                    type="button"
                    onClick={() =>
                      updateState({
                        fromCurrency: toCode,
                        toCurrency: fromCode,
                        customRate: roundClean(1 / effectiveRate, 6),
                      })
                    }
                    className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 text-white rounded-md flex items-center gap-1"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    <span>Swap Currencies</span>
                  </button>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Amount
                  </label>
                  <input
                    type="number"
                    value={toolState.amount}
                    onChange={(e) => updateState({ amount: parseNumInput(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      From Currency
                    </label>
                    <select
                      value={fromCode}
                      onChange={(e) => {
                        const nextFrom = e.target.value;
                        const nextFromMeta =
                          allCurrenciesWithLiveRates.find((c) => c.code === nextFrom) ||
                          resolveCurrencyMetadata(nextFrom, liveUsdRates[nextFrom] ?? 1);
                        const nextCross = roundClean(
                          toMeta.ratePerUsd / nextFromMeta.ratePerUsd,
                          6
                        );
                        updateState({
                          fromCurrency: nextFrom,
                          customRate: nextCross,
                        });
                      }}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs"
                    >
                      {allCurrenciesWithLiveRates.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} — {c.name} ({c.symbol})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      To Currency
                    </label>
                    <select
                      value={toCode}
                      onChange={(e) => {
                        const nextTo = e.target.value;
                        const nextToMeta =
                          allCurrenciesWithLiveRates.find((c) => c.code === nextTo) ||
                          resolveCurrencyMetadata(nextTo, liveUsdRates[nextTo] ?? 1);
                        const nextCross = roundClean(
                          nextToMeta.ratePerUsd / fromMeta.ratePerUsd,
                          6
                        );
                        updateState({
                          toCurrency: nextTo,
                          customRate: nextCross,
                        });
                      }}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs"
                    >
                      {allCurrenciesWithLiveRates.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} — {c.name} ({c.symbol})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useCustom}
                        onChange={(e) =>
                          updateState({
                            useCustomRate: e.target.checked,
                            customRate: roundClean(defaultCrossRate, 6),
                          })
                        }
                        className="rounded border-slate-300 text-emerald-600"
                      />
                      <span>Custom Exchange Rate Override</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showSymbols}
                        onChange={(e) => updateState({ showSymbols: e.target.checked })}
                        className="rounded border-slate-300 text-emerald-600"
                      />
                      <span>Show Symbols</span>
                    </label>
                  </div>

                  {useCustom && (
                    <input
                      type="number"
                      step="0.0001"
                      value={toolState.customRate}
                      onChange={(e) => updateState({ customRate: parseNumInput(e.target.value) })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono tabular-nums"
                    />
                  )}
                </div>
              </div>

              <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Converted Output &amp; Denomination Ladder ({fromCode} → {toCode})
                </h3>
                <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/70 rounded-lg">
                  <div className="text-xs text-emerald-800 dark:text-emerald-300">{fmtFrom} =</div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300 mt-1">
                    {fmtTo}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 mt-1">
                    1 {fromCode} = {showSymbols ? toMeta.symbol : ''}
                    {formatCleanNumber(effectiveRate, 4)} {toCode} · 1 {toCode} ={' '}
                    {showSymbols ? fromMeta.symbol : ''}
                    {formatCleanNumber(inverseRate, 4)} {fromCode}
                  </div>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono tabular-nums">
                  {[1, 10, 100, 1000, 10000].map((unitAmt) => (
                    <div key={unitAmt} className="py-1.5 flex justify-between">
                      <span className="text-slate-500">
                        {unitAmt.toLocaleString()} {fromCode}
                      </span>
                      <span className="font-semibold">
                        {showSymbols ? toMeta.symbol : ''}
                        {formatCleanNumber(unitAmt * effectiveRate, 2)} {toCode}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ),
      };
    }

    // ------------------------------------------------------------------------
    // #6 PERCENTAGE INCREASE / DECREASE CALCULATOR (3-Mode Calculator)
    // ------------------------------------------------------------------------
    if (id === 'extra-6-percentage-change') {
      const v1 = numVal(toolState.v1, 0);
      const v2 = numVal(toolState.v2, 0);
      const pctX = numVal(toolState.pctX, 0);
      const pctY = numVal(toolState.pctY, 0);
      const partX = numVal(toolState.partX, 45);
      const wholeY = numVal(toolState.wholeY, 180);

      const diff = v2 - v1;
      const pctChange = v1 !== 0 ? (diff / Math.abs(v1)) * 100 : NaN;
      const xOfY = (pctX / 100) * pctY;
      const xIsWhatPctOfY = wholeY !== 0 ? (partX / wholeY) * 100 : NaN;

      const summary = Number.isFinite(pctChange)
        ? `From ${v1} to ${v2}: ${pctChange >= 0 ? '+' : ''}${formatCleanNumber(pctChange, 2)}% (Diff: ${formatCleanNumber(diff, 4)}) | ${pctX}% of ${pctY} = ${formatCleanNumber(xOfY, 4)} | ${partX} is ${Number.isFinite(xIsWhatPctOfY) ? formatCleanNumber(xIsWhatPctOfY, 2) + '%' : 'Undefined'} of ${wholeY}`
        : `Difference: ${formatCleanNumber(diff, 4)} | ${pctX}% of ${pctY} = ${formatCleanNumber(xOfY, 4)}`;

      return {
        summaryToCopy: summary,
        ui: (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                1. Percentage Change ((V₂ − V₁) / |V₁| × 100)
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Initial Value (V₁)
                  </label>
                  <input
                    type="number"
                    value={toolState.v1}
                    onChange={(e) => updateState({ v1: parseNumInput(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Final Value (V₂)
                  </label>
                  <input
                    type="number"
                    value={toolState.v2}
                    onChange={(e) => updateState({ v2: parseNumInput(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/70 rounded-lg">
                <div className="text-xs text-emerald-800 dark:text-emerald-300">
                  Percentage {diff >= 0 ? 'Increase' : 'Decrease'}
                </div>
                <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300 mt-1">
                  {v1 === 0
                    ? 'Undefined (V₁ = 0)'
                    : `${pctChange >= 0 ? '+' : ''}${formatCleanNumber(pctChange, 3)}%`}
                </div>
                <div className="text-xs font-mono text-slate-500 mt-1">
                  Absolute Difference: {diff >= 0 ? '+' : ''}
                  {formatCleanNumber(diff, 4)}
                </div>
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                2. &ldquo;What is X% of Y?&rdquo;
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Percentage (X %)
                  </label>
                  <input
                    type="number"
                    value={toolState.pctX}
                    onChange={(e) => updateState({ pctX: parseNumInput(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Base Amount (Y)
                  </label>
                  <input
                    type="number"
                    value={toolState.pctY}
                    onChange={(e) => updateState({ pctY: parseNumInput(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="p-4 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/70 rounded-lg">
                <div className="text-xs text-blue-800 dark:text-blue-300">
                  {pctX}% of {pctY} equals
                </div>
                <div className="text-2xl font-bold font-mono tabular-nums text-blue-700 dark:text-blue-300 mt-1">
                  {formatCleanNumber(xOfY, 4)}
                </div>
                <div className="text-xs font-mono text-slate-500 mt-1">
                  {pctY} + {pctX}% = {formatCleanNumber(pctY + xOfY, 4)} · {pctY} − {pctX}% ={' '}
                  {formatCleanNumber(pctY - xOfY, 4)}
                </div>
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                3. &ldquo;X is what % of Y?&rdquo;
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Part Value (X)
                  </label>
                  <input
                    type="number"
                    value={toolState.partX}
                    onChange={(e) => updateState({ partX: parseNumInput(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Total Value (Y)
                  </label>
                  <input
                    type="number"
                    value={toolState.wholeY}
                    onChange={(e) => updateState({ wholeY: parseNumInput(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="p-4 bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/70 rounded-lg">
                <div className="text-xs text-indigo-800 dark:text-indigo-300">
                  {partX} as a percentage of {wholeY}
                </div>
                <div className="text-2xl font-bold font-mono tabular-nums text-indigo-700 dark:text-indigo-300 mt-1">
                  {wholeY === 0
                    ? 'Undefined (Y = 0)'
                    : `${formatCleanNumber(xIsWhatPctOfY, 3)}%`}
                </div>
                <div className="text-xs font-mono text-slate-500 mt-1">
                  Ratio: {wholeY !== 0 ? formatCleanNumber(partX / wholeY, 4) : '—'}
                </div>
              </div>
            </div>
          </div>
        ),
      };
    }

    // ------------------------------------------------------------------------
    // #7 DISCOUNT & TAX PRICE CALCULATOR
    // ------------------------------------------------------------------------
    if (id === 'extra-7-discount-tax') {
      const orig = Math.max(0, numVal(toolState.originalPrice, 0));
      const dType = toolState.discountType || 'percent';
      const dVal = Math.max(0, numVal(toolState.discountValue, 0));
      const extraPromo = Math.max(0, Math.min(100, numVal(toolState.extraPromoPct, 0)));
      const taxPct = Math.max(0, numVal(toolState.taxPct, 0));

      const firstDisc = dType === 'percent' ? orig * (Math.min(100, dVal) / 100) : Math.min(orig, dVal);
      const afterFirst = Math.max(0, orig - firstDisc);
      const secondDisc = afterFirst * (extraPromo / 100);
      const discountedSubtotal = Math.max(0, afterFirst - secondDisc);
      const totalSaved = orig - discountedSubtotal;
      const taxAmount = discountedSubtotal * (taxPct / 100);
      const finalPayable = discountedSubtotal + taxAmount;

      const summary = `Original: $${formatCleanNumber(orig, 2)} | Discount Saved: $${formatCleanNumber(totalSaved, 2)} | Tax: $${formatCleanNumber(taxAmount, 2)} | Final Payable: $${formatCleanNumber(finalPayable, 2)}`;

      return {
        summaryToCopy: summary,
        ui: (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3.5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Price, Discount & Tax Inputs
              </h3>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Original Retail Price ($)
                </label>
                <input
                  type="number"
                  value={toolState.originalPrice}
                  onChange={(e) => updateState({ originalPrice: parseNumInput(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Discount Type
                  </label>
                  <select
                    value={dType}
                    onChange={(e) => updateState({ discountType: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs"
                  >
                    <option value="percent">Percentage (%)</option>
                    <option value="fixed">Fixed Amount ($)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Discount Value ({dType === 'percent' ? '%' : '$'})
                  </label>
                  <input
                    type="number"
                    value={toolState.discountValue}
                    onChange={(e) => updateState({ discountValue: parseNumInput(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Extra Coupon / Promo (%)
                  </label>
                  <input
                    type="number"
                    value={toolState.extraPromoPct}
                    onChange={(e) => updateState({ extraPromoPct: parseNumInput(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Sales Tax / GST (%)
                  </label>
                  <input
                    type="number"
                    step="0.25"
                    value={toolState.taxPct}
                    onChange={(e) => updateState({ taxPct: parseNumInput(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono tabular-nums"
                  />
                </div>
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Checkout Receipt Breakdown
              </h3>
              <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/70 rounded-lg">
                <div className="text-xs text-emerald-800 dark:text-emerald-300">
                  Final Payable Price
                </div>
                <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300 mt-1">
                  ${formatCleanNumber(finalPayable, 2)}
                </div>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono tabular-nums">
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500">Original Retail Price</span>
                  <span className="font-semibold">${formatCleanNumber(orig, 2)}</span>
                </div>
                <div className="py-2 flex justify-between text-emerald-600 dark:text-emerald-400">
                  <span>Total Discount Saved</span>
                  <span className="font-semibold">−${formatCleanNumber(totalSaved, 2)}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500">Discounted Subtotal</span>
                  <span className="font-semibold">${formatCleanNumber(discountedSubtotal, 2)}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500">Sales Tax / GST ({taxPct}%)</span>
                  <span className="font-semibold">+${formatCleanNumber(taxAmount, 2)}</span>
                </div>
              </div>
            </div>
          </div>
        ),
      };
    }

    // ------------------------------------------------------------------------
    // #8 TIP & BILL SPLIT CALCULATOR
    // ------------------------------------------------------------------------
    if (id === 'extra-8-tip-split') {
      const bill = Math.max(0, numVal(toolState.billAmount, 0));
      const tipPct = Math.max(0, numVal(toolState.tipPct, 0));
      const people = Math.max(1, Math.round(numVal(toolState.people, 1)));

      const totalTip = bill * (tipPct / 100);
      const grandTotal = bill + totalTip;
      const perPersonTotal = grandTotal / people;
      const perPersonTip = totalTip / people;

      const summary = `Bill: $${formatCleanNumber(bill, 2)} | Tip (${tipPct}%): $${formatCleanNumber(totalTip, 2)} | Total: $${formatCleanNumber(grandTotal, 2)} | Per Person (${people}): $${formatCleanNumber(perPersonTotal, 2)}`;

      return {
        summaryToCopy: summary,
        ui: (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Bill & Gratuity Controls
              </h3>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Bill Amount ($)
                </label>
                <input
                  type="number"
                  value={toolState.billAmount}
                  onChange={(e) => updateState({ billAmount: parseNumInput(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Tip Percentage
                  </span>
                  <span className="font-mono font-bold text-emerald-600">{tipPct}%</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[10, 15, 18, 20, 25].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => updateState({ tipPct: p })}
                      className={`px-2.5 py-1 text-xs font-mono rounded-md border ${
                        tipPct === p
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      {p}%
                    </button>
                  ))}
                </div>
                <input
                  type="range"
                  min={0}
                  max={50}
                  value={tipPct}
                  onChange={(e) => updateState({ tipPct: Number(e.target.value) })}
                  className="w-full accent-emerald-600"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Number of People Splitting
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={toolState.people}
                  onChange={(e) => updateState({ people: parseNumInput(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Per-Person & Total Split
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/70 rounded-lg">
                  <div className="text-xs text-emerald-800 dark:text-emerald-300">
                    Cost Per Person
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300 mt-1">
                    ${formatCleanNumber(perPersonTotal, 2)}
                  </div>
                </div>
                <div className="p-3.5 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/70 rounded-lg">
                  <div className="text-xs text-blue-800 dark:text-blue-300">Grand Total Bill</div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-blue-700 dark:text-blue-300 mt-1">
                    ${formatCleanNumber(grandTotal, 2)}
                  </div>
                </div>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono tabular-nums">
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500">Total Tip ({tipPct}%)</span>
                  <span className="font-semibold">${formatCleanNumber(totalTip, 2)}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500">Tip Per Person</span>
                  <span className="font-semibold">${formatCleanNumber(perPersonTip, 2)}</span>
                </div>
              </div>
            </div>
          </div>
        ),
      };
    }

    // ------------------------------------------------------------------------
    // #9 2D GRAPHING CALCULATOR (Touch + Asymptote Guard + Direct X-Evaluator)
    // ------------------------------------------------------------------------
    if (id === 'extra-9-graphing-2d') {
      const fxExpr = String(toolState.fxExpr || '');
      const gxExpr = String(toolState.gxExpr || '');
      const angleMode: AngleMode = toolState.angleMode || 'RAD';
      const evalX = numVal(toolState.evalX, 0);

      let evalFx = 'Undefined';
      let evalGx = '—';
      try {
        const v1 = evaluateMathExpression(fxExpr, { x: evalX }, angleMode);
        evalFx = formatCleanNumber(v1, 6);
      } catch (err: any) {
        evalFx = err?.message || 'Syntax Error';
      }
      if (gxExpr.trim()) {
        try {
          const v2 = evaluateMathExpression(gxExpr, { x: evalX }, angleMode);
          evalGx = formatCleanNumber(v2, 6);
        } catch {
          evalGx = 'Syntax Error';
        }
      }

      const handleZoom = (factor: number) => {
        const xMin = numVal(toolState.xMin, -10);
        const xMax = numVal(toolState.xMax, 10);
        const yMin = numVal(toolState.yMin, -10);
        const yMax = numVal(toolState.yMax, 10);
        const cx = (xMin + xMax) / 2;
        const cy = (yMin + yMax) / 2;
        const hw = ((xMax - xMin) / 2) * factor;
        const hh = ((yMax - yMin) / 2) * factor;
        updateState({
          xMin: roundClean(cx - hw, 2),
          xMax: roundClean(cx + hw, 2),
          yMin: roundClean(cy - hh, 2),
          yMax: roundClean(cy + hh, 2),
        });
      };

      const summary = `f(x) = ${fxExpr} | At x = ${evalX}: f(${evalX}) = ${evalFx}${gxExpr.trim() ? `, g(${evalX}) = ${evalGx}` : ''}`;

      return {
        summaryToCopy: summary,
        ui: (
          <div className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Function Expressions (Supports sin, cos, tan, sqrt, ln, ^, 2x)
                  </span>
                  <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-md text-xs font-mono">
                    {(['RAD', 'DEG'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => updateState({ angleMode: m })}
                        className={`px-2 py-0.5 rounded ${
                          angleMode === m ? 'bg-emerald-600 text-white' : 'text-slate-500'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                      Primary y₁ = f(x)
                    </label>
                    <input
                      type="text"
                      value={fxExpr}
                      onChange={(e) => updateState({ fxExpr: e.target.value })}
                      placeholder="e.g. sin(x) or x^2 - 4"
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-mono text-blue-600 dark:text-blue-400 font-semibold">
                      Secondary y₂ = g(x) (Optional)
                    </label>
                    <input
                      type="text"
                      value={gxExpr}
                      onChange={(e) => updateState({ gxExpr: e.target.value })}
                      placeholder="e.g. 2*x - 1"
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] text-slate-400 mr-1">Presets:</span>
                  {[
                    { label: 'Parabola', fx: 'x^2 - 4', gx: '2*x - 1' },
                    { label: 'Sine & Cosine', fx: 'sin(x)', gx: 'cos(x)' },
                    { label: 'Tangent (Asymptote)', fx: 'tan(x)', gx: '' },
                    { label: 'Reciprocal 1/x', fx: '1/x', gx: 'x/4' },
                    { label: 'Radical √x', fx: 'sqrt(x)', gx: 'ln(x)' },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => updateState({ fxExpr: p.fx, gxExpr: p.gx })}
                      className="px-2 py-1 text-[11px] font-mono bg-slate-100 dark:bg-slate-800 hover:bg-emerald-600 hover:text-white rounded transition-colors"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Direct X-Evaluator & Domain Bounds */}
              <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  Direct Point Evaluator & Bounds
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Evaluate at x =
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={toolState.evalX}
                    onChange={(e) => updateState({ evalX: parseNumInput(e.target.value) })}
                    aria-label="Evaluate at x ="
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums"
                  />
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-mono tabular-nums space-y-1">
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>f({evalX}) =</span>
                    <span className="font-bold">{evalFx}</span>
                  </div>
                  {gxExpr.trim() && (
                    <div className="flex justify-between text-blue-600 dark:text-blue-400">
                      <span>g({evalX}) =</span>
                      <span className="font-bold">{evalGx}</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-4 gap-1.5 text-[11px] font-mono">
                  <div>
                    <span className="text-slate-400 block">Xmin</span>
                    <input
                      type="number"
                      value={toolState.xMin}
                      onChange={(e) => updateState({ xMin: parseNumInput(e.target.value) })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-1.5 py-1"
                    />
                  </div>
                  <div>
                    <span className="text-slate-400 block">Xmax</span>
                    <input
                      type="number"
                      value={toolState.xMax}
                      onChange={(e) => updateState({ xMax: parseNumInput(e.target.value) })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-1.5 py-1"
                    />
                  </div>
                  <div>
                    <span className="text-slate-400 block">Ymin</span>
                    <input
                      type="number"
                      value={toolState.yMin}
                      onChange={(e) => updateState({ yMin: parseNumInput(e.target.value) })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-1.5 py-1"
                    />
                  </div>
                  <div>
                    <span className="text-slate-400 block">Ymax</span>
                    <input
                      type="number"
                      value={toolState.yMax}
                      onChange={(e) => updateState({ yMax: parseNumInput(e.target.value) })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-1.5 py-1"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Interactive 2D Canvas Stage with Mouse + Touch Trace */}
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  {hoverCoord ? (
                    <span>
                      Trace: x = <strong>{formatCleanNumber(hoverCoord.x, 3)}</strong>
                      {hoverCoord.fx !== null
                        ? ` · f(x) = ${formatCleanNumber(hoverCoord.fx, 4)}`
                        : ' · f(x) = Undefined'}
                      {hoverCoord.gx !== null
                        ? ` · g(x) = ${formatCleanNumber(hoverCoord.gx, 4)}`
                        : ''}
                    </span>
                  ) : (
                    <span>Hover mouse or drag finger on graph to trace coordinates</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleZoom(0.75)}
                    className="px-2.5 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-800 rounded flex items-center gap-1"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                    <span>Zoom In</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleZoom(1.35)}
                    className="px-2.5 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-800 rounded flex items-center gap-1"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                    <span>Zoom Out</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateState({ xMin: -10, xMax: 10, yMin: -10, yMax: 10 })}
                    className="px-2.5 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-800 rounded"
                  >
                    Origin [-10, 10]
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const canvas = graphCanvasRef.current;
                      if (!canvas) return;
                      const dataUrl = canvas.toDataURL('image/png');
                      const a = document.createElement('a');
                      a.href = dataUrl;
                      a.download = 'forma_2d_graph.png';
                      a.click();
                      onNotify?.('Downloaded 2D Graph PNG');
                    }}
                    className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Graph PNG</span>
                  </button>
                </div>
              </div>

              <canvas
                ref={graphCanvasRef}
                onMouseMove={(e) => updateGraphTraceFromClientX(e.clientX)}
                onMouseLeave={() => setHoverCoord(null)}
                onTouchStart={(e) => {
                  if (e.touches[0]) updateGraphTraceFromClientX(e.touches[0].clientX);
                }}
                onTouchMove={(e) => {
                  if (e.touches[0]) updateGraphTraceFromClientX(e.touches[0].clientX);
                }}
                className="w-full h-[360px] rounded-lg border border-slate-200 dark:border-slate-800 cursor-crosshair touch-pan-y block"
              />
            </div>
          </div>
        ),
      };
    }

    // ------------------------------------------------------------------------
    // #10 QUADRATIC EQUATION SOLVER
    // ------------------------------------------------------------------------
    if (id === 'extra-10-quadratic-solver') {
      const a = numVal(toolState.a, 0);
      const b = numVal(toolState.b, 0);
      const c = numVal(toolState.c, 0);

      const disc = b * b - 4 * a * c;
      let classification = '';
      let root1Str = '';
      let root2Str = '';
      let vertexStr = '—';

      if (a === 0) {
        classification = 'Linear Equation (a = 0)';
        root1Str = b !== 0 ? `x = ${formatCleanNumber(-c / b, 6)}` : 'No Solution (b = 0)';
        root2Str = '—';
      } else {
        const vx = -b / (2 * a);
        const vy = a * vx * vx + b * vx + c;
        vertexStr = `(${formatCleanNumber(vx, 4)}, ${formatCleanNumber(vy, 4)})`;

        if (Math.abs(disc) < 1e-12) {
          classification = 'One Repeated Real Root (Δ = 0)';
          root1Str = `x = ${formatCleanNumber(vx, 6)}`;
          root2Str = root1Str;
        } else if (disc > 0) {
          classification = 'Two Distinct Real Roots (Δ > 0)';
          const r1 = (-b + Math.sqrt(disc)) / (2 * a);
          const r2 = (-b - Math.sqrt(disc)) / (2 * a);
          root1Str = `x₁ = ${formatCleanNumber(r1, 6)}`;
          root2Str = `x₂ = ${formatCleanNumber(r2, 6)}`;
        } else {
          classification = 'Two Complex Conjugate Roots (Δ < 0)';
          const realPart = formatCleanNumber(-b / (2 * a), 5);
          const imagPart = formatCleanNumber(Math.sqrt(-disc) / Math.abs(2 * a), 5);
          root1Str = `x₁ = ${realPart} + ${imagPart}i`;
          root2Str = `x₂ = ${realPart} − ${imagPart}i`;
        }
      }

      const summary = `${a}x² + ${b}x + ${c} = 0 | Δ = ${formatCleanNumber(disc, 4)} (${classification}) | ${root1Str}, ${root2Str} | Vertex: ${vertexStr}`;

      return {
        summaryToCopy: summary,
        ui: (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Quadratic Coefficients (ax² + bx + c = 0)
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {(['a', 'b', 'c'] as const).map((coef) => (
                  <div key={coef} className="space-y-1">
                    <label className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                      Coefficient {coef}
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={toolState[coef]}
                      onChange={(e) => updateState({ [coef]: parseNumInput(e.target.value) })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                    />
                  </div>
                ))}
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-mono">
                Equation: {a}x² {b >= 0 ? `+ ${b}x` : `− ${Math.abs(b)}x`}{' '}
                {c >= 0 ? `+ ${c}` : `− ${Math.abs(c)}`} = 0
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Roots, Discriminant & Vertex Analysis
              </h3>
              <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/70 rounded-lg space-y-1">
                <div className="text-xs text-emerald-800 dark:text-emerald-300">
                  {classification}
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
                  {root1Str}
                </div>
                {root2Str !== '—' && (
                  <div className="text-lg font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
                    {root2Str}
                  </div>
                )}
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono tabular-nums">
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500">Discriminant (Δ = b² − 4ac)</span>
                  <span className="font-semibold">{formatCleanNumber(disc, 6)}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500">Parabola Vertex (h, k)</span>
                  <span className="font-semibold">{vertexStr}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500">Axis of Symmetry</span>
                  <span className="font-semibold">
                    {a !== 0 ? `x = ${formatCleanNumber(-b / (2 * a), 4)}` : '—'}
                  </span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500">Y-Intercept (0, c)</span>
                  <span className="font-semibold">(0, {formatCleanNumber(c, 4)})</span>
                </div>
              </div>
            </div>
          </div>
        ),
      };
    }

    // ------------------------------------------------------------------------
    // #11 STANDARD BODMAS CALCULATOR (DEG/RAD Toggle, Implicit Mult, Clean Tape)
    // ------------------------------------------------------------------------
    if (id === 'extra-11-bodmas-calc') {
      const expr = String(toolState.expression || '');
      const angleMode: AngleMode = toolState.angleMode || 'DEG';

      let liveValueStr = '0';
      let evalError: string | null = null;
      if (expr.trim()) {
        try {
          const val = evaluateMathExpression(expr, {}, angleMode);
          liveValueStr = Number.isFinite(val) ? formatCleanNumber(val, 10) : 'Undefined';
        } catch (err: any) {
          evalError = err?.message || 'Incomplete expression';
        }
      }

      const handleCommitToTape = () => {
        if (!expr.trim() || evalError || liveValueStr === 'Undefined') return;
        setBodmasTape((prev) => [
          {
            id: `tape-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            expr,
            mode: angleMode,
            result: liveValueStr,
          },
          ...prev.slice(0, 19),
        ]);
      };

      const appendToken = (tok: string) => {
        updateState({ expression: expr + tok });
      };

      const summary = `${expr} = ${liveValueStr} (${angleMode})`;

      return {
        summaryToCopy: summary,
        ui: (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  BODMAS / PEMDAS Keypad & Expression
                </h3>
                <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-mono">
                  {(['DEG', 'RAD'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => updateState({ angleMode: m })}
                      className={`px-2.5 py-1 rounded font-semibold ${
                        angleMode === m ? 'bg-emerald-600 text-white' : 'text-slate-500'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <input
                  type="text"
                  value={expr}
                  onChange={(e) => updateState({ expression: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCommitToTape();
                    }
                  }}
                  placeholder="e.g. 2(3 + 4) + sin(30)"
                  aria-label="BODMAS arithmetic expression"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2.5 text-base font-mono tabular-nums"
                />
                <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/70 rounded-lg flex items-center justify-between">
                  <span className="text-xs text-emerald-800 dark:text-emerald-300 font-mono">
                    = ({angleMode})
                  </span>
                  <span className="text-xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
                    {evalError ? (
                      <span className="text-xs text-amber-600 dark:text-amber-400">
                        {evalError}
                      </span>
                    ) : (
                      liveValueStr
                    )}
                  </span>
                </div>
              </div>

              {/* Keypad */}
              <div className="grid grid-cols-5 gap-1.5 text-xs font-mono">
                {[
                  'sin(',
                  'cos(',
                  'tan(',
                  'sqrt(',
                  '^',
                  '7',
                  '8',
                  '9',
                  '(',
                  ')',
                  '4',
                  '5',
                  '6',
                  '*',
                  '/',
                  '1',
                  '2',
                  '3',
                  '+',
                  '-',
                  '0',
                  '.',
                  'pi',
                  '⌫',
                  'C',
                ].map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      if (k === 'C') updateState({ expression: '' });
                      else if (k === '⌫') updateState({ expression: expr.slice(0, -1) });
                      else appendToken(k);
                    }}
                    className="py-2 px-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold transition-colors"
                  >
                    {k}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleCommitToTape}
                className="w-full py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg"
              >
                Record to Calculation Tape (=)
              </button>
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Recent Calculation Tape
                  </h3>
                  {bodmasTape.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setBodmasTape([])}
                      className="text-xs text-rose-500 hover:underline"
                    >
                      Clear Tape
                    </button>
                  )}
                </div>

                {bodmasTape.length === 0 ? (
                  <div className="p-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-center text-xs text-slate-500">
                    No calculations recorded yet. Evaluate an expression and click &ldquo;Record to Calculation Tape (=)&rdquo;.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                    {bodmasTape.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() =>
                          updateState({ expression: item.expr, angleMode: item.mode })
                        }
                        className="w-full p-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center justify-between gap-2 text-xs font-mono"
                      >
                        <span className="truncate text-slate-600 dark:text-slate-300">
                          {item.expr} <span className="text-[10px] text-slate-400">[{item.mode}]</span>
                        </span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                          = {item.result}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="text-[11px] text-slate-500 font-mono">
                Supports implicit multiplication: 2(3+4) = 14, (2+1)(3+1) = 12, 2pi, 3sqrt(16) = 12.
              </div>
            </div>
          </div>
        ),
      };
    }

    // ------------------------------------------------------------------------
    // #12 BASE / NUMBER SYSTEM & RATIO CONVERTER (BigInt Precision)
    // ------------------------------------------------------------------------
    if (id === 'extra-12-base-ratio') {
      const fromBase: 2 | 8 | 10 | 16 = toolState.fromBase || 10;
      const baseRes = convertBaseBigInt(String(toolState.inputValue || ''), fromBase);
      const bitwiseRes = computeBitwiseBigInt(
        String(toolState.bitA || '0'),
        String(toolState.bitB || '0'),
        10
      );
      const ratioRes = simplifyRatioAndProportion(
        numVal(toolState.ratioA, 0),
        numVal(toolState.ratioB, 0),
        numVal(toolState.propC, 0)
      );

      const summary = `Dec: ${baseRes.decimal} | Hex: 0x${baseRes.hexadecimal} | Bin: ${baseRes.binary} | Oct: 0o${baseRes.octal} | Ratio ${toolState.ratioA}:${toolState.ratioB} = ${ratioRes.simplified}`;

      return {
        summaryToCopy: summary,
        ui: (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                1. Arbitrary-Precision BigInt Radix Converter
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Integer Value (Supports &gt;64-bit BigInt)
                  </label>
                  <input
                    type="text"
                    value={toolState.inputValue}
                    onChange={(e) => updateState({ inputValue: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Input Base
                  </label>
                  <select
                    value={fromBase}
                    onChange={(e) =>
                      updateState({ fromBase: Number(e.target.value) as 2 | 8 | 10 | 16 })
                    }
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-2 text-xs font-mono"
                  >
                    <option value={2}>Base 2 (Bin)</option>
                    <option value={8}>Base 8 (Oct)</option>
                    <option value={10}>Base 10 (Dec)</option>
                    <option value={16}>Base 16 (Hex)</option>
                  </select>
                </div>
              </div>

              {!baseRes.valid && baseRes.error && (
                <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-300">
                  {baseRes.error}
                </div>
              )}

              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono">
                <div className="py-2 flex justify-between gap-3">
                  <span className="text-slate-500 shrink-0">Binary (Base 2)</span>
                  <span className="font-semibold break-all text-right">{baseRes.binary}</span>
                </div>
                <div className="py-2 flex justify-between gap-3">
                  <span className="text-slate-500 shrink-0">Octal (Base 8)</span>
                  <span className="font-semibold break-all text-right">{baseRes.octal}</span>
                </div>
                <div className="py-2 flex justify-between gap-3">
                  <span className="text-slate-500 shrink-0">Decimal (Base 10)</span>
                  <span className="font-semibold break-all text-right text-emerald-600 dark:text-emerald-400">
                    {baseRes.decimal}
                  </span>
                </div>
                <div className="py-2 flex justify-between gap-3">
                  <span className="text-slate-500 shrink-0">Hexadecimal (Base 16)</span>
                  <span className="font-semibold break-all text-right">{baseRes.hexadecimal}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500">Bit Length</span>
                  <span className="font-semibold">{baseRes.bitLength} bits</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  BigInt Bitwise Operations (Decimal A &amp; B)
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={toolState.bitA}
                    onChange={(e) => updateState({ bitA: e.target.value })}
                    placeholder="Operand A"
                    className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono"
                  />
                  <input
                    type="text"
                    value={toolState.bitB}
                    onChange={(e) => updateState({ bitB: e.target.value })}
                    placeholder="Operand B"
                    className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
                  <div className="p-2 bg-slate-50 dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-400 block">A AND B</span>
                    <span className="font-bold">{bitwiseRes.andDec}</span>
                  </div>
                  <div className="p-2 bg-slate-50 dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-400 block">A OR B</span>
                    <span className="font-bold">{bitwiseRes.orDec}</span>
                  </div>
                  <div className="p-2 bg-slate-50 dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-400 block">A XOR B</span>
                    <span className="font-bold">{bitwiseRes.xorDec}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                2. Ratio Simplifier (A : B) &amp; Proportion Solver (A / B = C / X)
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Term A
                  </label>
                  <input
                    type="number"
                    value={toolState.ratioA}
                    onChange={(e) => updateState({ ratioA: parseNumInput(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Term B
                  </label>
                  <input
                    type="number"
                    value={toolState.ratioB}
                    onChange={(e) => updateState({ ratioB: parseNumInput(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Target C
                  </label>
                  <input
                    type="number"
                    value={toolState.propC}
                    onChange={(e) => updateState({ propC: parseNumInput(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/70 rounded-lg space-y-1">
                <div className="text-xs text-emerald-800 dark:text-emerald-300">
                  Simplified Lowest Whole Ratio
                </div>
                <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
                  {ratioRes.simplified}
                </div>
                <div className="text-xs font-mono text-slate-500">
                  Share A: {ratioRes.shareA} · Share B: {ratioRes.shareB}
                </div>
              </div>

              <div className="p-4 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/70 rounded-lg space-y-1">
                <div className="text-xs text-blue-800 dark:text-blue-300">
                  Proportion Solution ({toolState.ratioA} / {toolState.ratioB} = {toolState.propC} / X)
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-blue-700 dark:text-blue-300">
                  X = {ratioRes.solvedX}
                </div>
              </div>
            </div>
          </div>
        ),
      };
    }

    // ------------------------------------------------------------------------
    // #13 - #26 UNIT & ENGINEERING CONVERTERS (14 TOOLS)
    // ------------------------------------------------------------------------
    if (id in UNIT_CONVERTER_CONFIGS) {
      const cfg = UNIT_CONVERTER_CONFIGS[id];
      const val = numVal(toolState.value, 0);
      const fromUnit = toolState.fromUnit || cfg.defaultFrom;
      const toUnit = toolState.toUnit || cfg.defaultTo;

      const primaryConv = convertUnitValue(id, val, fromUnit, toUnit);
      const fromMeta = cfg.units.find((u) => u.id === fromUnit) || cfg.units[0];
      const toMeta = cfg.units.find((u) => u.id === toUnit) || cfg.units[1] || cfg.units[0];

      const primaryFormatted =
        primaryConv.value !== null ? formatCleanNumber(primaryConv.value, 8) : 'Undefined';
      const summary = `${formatCleanNumber(val, 6)} ${fromMeta.symbol} = ${primaryFormatted} ${toMeta.symbol}`;

      return {
        summaryToCopy: summary,
        ui: (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Conversion Input &amp; Scale Selection
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    updateState({
                      fromUnit: toUnit,
                      toUnit: fromUnit,
                    })
                  }
                  className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 text-white rounded-md flex items-center gap-1"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  <span>Swap Units</span>
                </button>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Input Value ({fromMeta.symbol})
                </label>
                <input
                  type="number"
                  step="any"
                  value={toolState.value}
                  onChange={(e) => updateState({ value: parseNumInput(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    From Unit
                  </label>
                  <select
                    value={fromUnit}
                    onChange={(e) => updateState({ fromUnit: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs"
                  >
                    {cfg.units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    To Unit
                  </label>
                  <select
                    value={toUnit}
                    onChange={(e) => updateState({ toUnit: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs"
                  >
                    {cfg.units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {primaryConv.warning && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-2 text-xs text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>{primaryConv.warning}</span>
                </div>
              )}

              <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/70 rounded-lg flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-emerald-800 dark:text-emerald-300">
                    {formatCleanNumber(val, 6)} {fromMeta.label} =
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300 mt-1">
                    {primaryFormatted} {toMeta.symbol}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyText(primaryFormatted)}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 rounded-lg hover:bg-emerald-100/60 dark:hover:bg-slate-800 flex items-center gap-1.5 shrink-0"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Numeric Value</span>
                </button>
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                All Equivalent Units Matrix
              </h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden text-xs font-mono tabular-nums">
                {cfg.units.map((u) => {
                  const conv = convertUnitValue(id, val, fromUnit, u.id);
                  const formatted =
                    conv.value !== null ? formatCleanNumber(conv.value, 8) : 'Undefined';
                  const isTarget = u.id === toUnit;
                  return (
                    <div
                      key={u.id}
                      className={`px-3 py-2 flex items-center justify-between gap-2 ${
                        isTarget ? 'bg-emerald-50/60 dark:bg-emerald-950/30 font-bold' : ''
                      }`}
                    >
                      <span className="text-slate-600 dark:text-slate-300 truncate">
                        {u.label}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-slate-900 dark:text-white">
                          {formatted} {u.symbol}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyText(`${formatted} ${u.symbol}`)}
                          title={`Copy ${u.symbol} value`}
                          className="p-1 text-slate-400 hover:text-emerald-500"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ),
      };
    }

    // ------------------------------------------------------------------------
    // #27 EXACT AGE CALCULATOR (With Leap-Year Feb 29 & Future Date Guard)
    // ------------------------------------------------------------------------
    if (id === 'extra-27-exact-age') {
      const birthStr = String(toolState.birthDate || '1996-05-15');
      const targetStr = String(toolState.targetDate || new Date().toISOString().slice(0, 10));

      const ageRes = calculateExactAgeChronological(birthStr, targetStr);
      const {
        valid,
        error,
        years,
        months,
        days,
        totalDays,
        totalWeeks,
        remDays,
        totalHours,
        daysUntilNextBirthday,
        bornWeekday,
      } = ageRes;

      const summary = valid
        ? `Exact Age: ${years} years, ${months} months, ${days} days | Total Days: ${totalDays.toLocaleString()} | Next Birthday in ${daysUntilNextBirthday} days`
        : error || 'Target date must be on or after birth date.';

      return {
        summaryToCopy: summary,
        ui: (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Date of Birth &amp; Reference Date
              </h3>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Date of Birth
                </label>
                <input
                  type="date"
                  value={birthStr}
                  onChange={(e) => updateState({ birthDate: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Target / Reference Date
                </label>
                <input
                  type="date"
                  value={targetStr}
                  onChange={(e) => updateState({ targetDate: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono"
                />
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Chronological Age Breakdown
              </h3>
              {valid ? (
                <>
                  <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/70 rounded-lg">
                    <div className="text-xs text-emerald-800 dark:text-emerald-300">Exact Age</div>
                    <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300 mt-1">
                      {years} yrs · {months} mos · {days} days
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono tabular-nums">
                    <div className="py-2 flex justify-between">
                      <span className="text-slate-500">Day of Week Born</span>
                      <span className="font-semibold">{bornWeekday}</span>
                    </div>
                    <div className="py-2 flex justify-between">
                      <span className="text-slate-500">Total Weeks Lived</span>
                      <span className="font-semibold">
                        {totalWeeks.toLocaleString()} weeks, {remDays} days
                      </span>
                    </div>
                    <div className="py-2 flex justify-between">
                      <span className="text-slate-500">Total Days Lived</span>
                      <span className="font-semibold">{totalDays.toLocaleString()} days</span>
                    </div>
                    <div className="py-2 flex justify-between">
                      <span className="text-slate-500">Total Hours Lived</span>
                      <span className="font-semibold">{totalHours.toLocaleString()} hrs</span>
                    </div>
                    <div className="py-2 flex justify-between">
                      <span className="text-slate-500">Until Next Birthday</span>
                      <span className="font-semibold text-blue-600 dark:text-blue-400">
                        {daysUntilNextBirthday === 0
                          ? 'Happy Birthday Today!'
                          : `${daysUntilNextBirthday} days remaining`}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>{error || 'Please choose a target date on or after the birth date.'}</span>
                </div>
              )}
            </div>
          </div>
        ),
      };
    }

    // ------------------------------------------------------------------------
    // #28 WORLD TIME / TIME ZONE CONVERTER (Live Ticking Clock + 12h/24h Toggle + Searchable IANA Zones + Reference Base Zone)
    // ------------------------------------------------------------------------
    if (id === 'extra-28-world-time') {
      const sliderMinutes = numVal(toolState.sliderMinutes, 840);
      const use24Hour = Boolean(toolState.use24Hour ?? true);
      const isLiveClock = Boolean(toolState.liveClock ?? false);
      const selectedZones: string[] = toolState.selectedZones || DEFAULT_WORLD_TIMEZONES;
      const baseZone: string =
        toolState.baseZone ||
        Intl.DateTimeFormat().resolvedOptions().timeZone ||
        'UTC';
      const searchQuery = String(toolState.searchQuery || '').trim().toLowerCase();

      const now = isLiveClock ? liveUtcDate : new Date();
      const refUtc = isLiveClock
        ? liveUtcDate
        : computeZoneUtcDateFromLocalMinutes(baseZone, sliderMinutes, now);

      const formatZoneTime = (zone: string) => {
        try {
          const timeStr = new Intl.DateTimeFormat('en-US', {
            timeZone: zone,
            hour: '2-digit',
            minute: '2-digit',
            second: isLiveClock ? '2-digit' : undefined,
            hour12: !use24Hour,
          }).format(refUtc);
          const dateStr = new Intl.DateTimeFormat('en-US', {
            timeZone: zone,
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          }).format(refUtc);
          const hour24 = Number(
            new Intl.DateTimeFormat('en-US', {
              timeZone: zone,
              hour: 'numeric',
              hour12: false,
            }).format(refUtc)
          );
          const isBusiness = hour24 >= 9 && hour24 < 18;
          return { timeStr, dateStr, isBusiness };
        } catch {
          return { timeStr: '—', dateStr: '—', isBusiness: false };
        }
      };

      const matchingAddableZones = searchQuery
        ? allIanaZones
            .filter(
              (z) => z.toLowerCase().includes(searchQuery) && !selectedZones.includes(z)
            )
            .slice(0, 12)
        : [];

      const baseZoneOptions = Array.from(
        new Set(['UTC', baseZone, ...selectedZones, ...DEFAULT_WORLD_TIMEZONES])
      );

      const baseInfo = formatZoneTime(baseZone);
      const sliderHrStr = String(Math.floor(sliderMinutes / 60)).padStart(2, '0');
      const sliderMinStr = String(sliderMinutes % 60).padStart(2, '0');
      const summary = selectedZones
        .slice(0, 5)
        .map((z) => `${z}: ${formatZoneTime(z).timeStr}`)
        .join(' | ');

      return {
        summaryToCopy: summary,
        ui: (
          <div className="space-y-5">
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Global Time &amp; Meeting Slider (Reference Base {baseZone}:{' '}
                    {isLiveClock ? `${baseInfo.timeStr} · LIVE` : `${sliderHrStr}:${sliderMinStr}`})
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isLiveClock
                      ? 'Real-time ticking world clock across all selected IANA time zones'
                      : `Drag slider to scrub local time in ${baseZone} and preview simultaneous times worldwide`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <label
                      htmlFor="world-time-base-zone"
                      className="text-xs font-medium text-slate-600 dark:text-slate-300"
                    >
                      Reference Base Zone:
                    </label>
                    <select
                      id="world-time-base-zone"
                      aria-label="Reference Base Time Zone"
                      value={baseZone}
                      onChange={(e) => updateState({ baseZone: e.target.value })}
                      className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono"
                    >
                      {baseZoneOptions.map((z) => (
                        <option key={z} value={z}>
                          {z}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => updateState({ liveClock: !isLiveClock })}
                    className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                      isLiveClock
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {isLiveClock ? '● Live Clock Active' : 'Enable Live Ticking Clock'}
                  </button>
                  <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-mono">
                    <button
                      type="button"
                      onClick={() => updateState({ use24Hour: false })}
                      className={`px-2.5 py-1 rounded ${
                        !use24Hour ? 'bg-emerald-600 text-white' : 'text-slate-500'
                      }`}
                    >
                      12h (AM/PM)
                    </button>
                    <button
                      type="button"
                      onClick={() => updateState({ use24Hour: true })}
                      className={`px-2.5 py-1 rounded ${
                        use24Hour ? 'bg-emerald-600 text-white' : 'text-slate-500'
                      }`}
                    >
                      24h
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = new Date();
                      try {
                        const parts = new Intl.DateTimeFormat('en-US', {
                          timeZone: baseZone,
                          hour: '2-digit',
                          minute: '2-digit',
                          hourCycle: 'h23',
                        }).formatToParts(cur);
                        const hr = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
                        const mn = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
                        updateState({
                          liveClock: false,
                          sliderMinutes: (hr === 24 ? 0 : hr) * 60 + mn,
                        });
                      } catch {
                        updateState({
                          liveClock: false,
                          sliderMinutes: cur.getUTCHours() * 60 + cur.getUTCMinutes(),
                        });
                      }
                    }}
                    className="px-2.5 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 rounded-lg"
                  >
                    Snap to Live Now
                  </button>
                </div>
              </div>

              <input
                type="range"
                min={0}
                max={1425}
                step={15}
                value={sliderMinutes}
                onChange={(e) =>
                  updateState({ liveClock: false, sliderMinutes: Number(e.target.value) })
                }
                aria-label="Global time slider in minutes"
                className="w-full accent-emerald-600"
              />

              {/* Search & Add Any IANA Timezone */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Search &amp; Add Any IANA Time Zone ({allIanaZones.length} supported zones):
                </label>
                <input
                  type="text"
                  value={toolState.searchQuery || ''}
                  onChange={(e) => updateState({ searchQuery: e.target.value })}
                  placeholder="Type a city or region (e.g. Zurich, Toronto, Seoul, Nairobi, Chicago)..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs"
                />
                {matchingAddableZones.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {matchingAddableZones.map((z) => (
                      <button
                        key={z}
                        type="button"
                        onClick={() =>
                          updateState({
                            selectedZones: [...selectedZones, z],
                            searchQuery: '',
                          })
                        }
                        className="px-2.5 py-1 text-xs font-mono bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 rounded-md flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>{z}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {selectedZones.map((zone) => {
                const info = formatZoneTime(zone);
                const isBase = zone === baseZone;
                return (
                  <div
                    key={zone}
                    className={`p-4 bg-white dark:bg-slate-900 border rounded-xl flex items-center justify-between gap-2 ${
                      isBase
                        ? 'border-emerald-500 dark:border-emerald-600 ring-1 ring-emerald-500/30'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold font-mono text-slate-900 dark:text-white truncate">
                        {zone.replace(/_/g, ' ')} {isBase ? '(Base)' : ''}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {info.dateStr} · {info.isBusiness ? 'Business Hours' : 'Off-Hours'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-lg font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                        {info.timeStr}
                      </span>
                      {selectedZones.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            updateState({
                              selectedZones: selectedZones.filter((z) => z !== zone),
                            })
                          }
                          aria-label={`Remove ${zone}`}
                          className="p-1 text-slate-400 hover:text-rose-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ),
      };
    }

    // ------------------------------------------------------------------------
    // #29 BMI CALCULATOR
    // ------------------------------------------------------------------------
    if (id === 'extra-29-bmi') {
      const sys = toolState.unitSystem || 'metric';
      const weightKg =
        sys === 'metric'
          ? Math.max(1, numVal(toolState.weightKg, 70))
          : Math.max(1, numVal(toolState.weightLb, 154)) * 0.45359237;
      const heightM =
        sys === 'metric'
          ? Math.max(0.3, numVal(toolState.heightCm, 175) / 100)
          : Math.max(
              0.3,
              (numVal(toolState.heightFt, 5) * 12 + numVal(toolState.heightIn, 0)) * 0.0254
            );

      const bmi = weightKg / (heightM * heightM);
      const minHealthyKg = 18.5 * heightM * heightM;
      const maxHealthyKg = 24.9 * heightM * heightM;

      let category = 'Normal Weight (18.5–24.9)';
      if (bmi < 18.5) category = 'Underweight (< 18.5)';
      else if (bmi >= 30) category = 'Obese (≥ 30.0)';
      else if (bmi >= 25) category = 'Overweight (25.0–29.9)';

      const summary = `BMI: ${formatCleanNumber(bmi, 1)} kg/m² (${category}) | Healthy Range: ${formatCleanNumber(minHealthyKg, 1)}–${formatCleanNumber(maxHealthyKg, 1)} kg`;

      return {
        summaryToCopy: summary,
        ui: (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Body Measurements
                </h3>
                <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs">
                  <button
                    type="button"
                    onClick={() => updateState({ unitSystem: 'metric' })}
                    className={`px-2.5 py-1 rounded ${
                      sys === 'metric' ? 'bg-emerald-600 text-white' : 'text-slate-500'
                    }`}
                  >
                    Metric (kg/cm)
                  </button>
                  <button
                    type="button"
                    onClick={() => updateState({ unitSystem: 'imperial' })}
                    className={`px-2.5 py-1 rounded ${
                      sys === 'imperial' ? 'bg-emerald-600 text-white' : 'text-slate-500'
                    }`}
                  >
                    Imperial (lb/ft)
                  </button>
                </div>
              </div>

              {sys === 'metric' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Weight (kg)
                    </label>
                    <input
                      type="number"
                      value={toolState.weightKg}
                      onChange={(e) => updateState({ weightKg: parseNumInput(e.target.value) })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Height (cm)
                    </label>
                    <input
                      type="number"
                      value={toolState.heightCm}
                      onChange={(e) => updateState({ heightCm: parseNumInput(e.target.value) })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Weight (lb)
                    </label>
                    <input
                      type="number"
                      value={toolState.weightLb}
                      onChange={(e) => updateState({ weightLb: parseNumInput(e.target.value) })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Feet (ft)
                    </label>
                    <input
                      type="number"
                      value={toolState.heightFt}
                      onChange={(e) => updateState({ heightFt: parseNumInput(e.target.value) })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Inches (in)
                    </label>
                    <input
                      type="number"
                      value={toolState.heightIn}
                      onChange={(e) => updateState({ heightIn: parseNumInput(e.target.value) })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                WHO Body Mass Index Classification
              </h3>
              <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/70 rounded-lg">
                <div className="text-xs text-emerald-800 dark:text-emerald-300">{category}</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300 mt-1">
                  {formatCleanNumber(bmi, 1)} kg/m²
                </div>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono tabular-nums">
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500">Healthy Weight Range (Metric)</span>
                  <span className="font-semibold">
                    {formatCleanNumber(minHealthyKg, 1)} – {formatCleanNumber(maxHealthyKg, 1)} kg
                  </span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500">Healthy Weight Range (Imperial)</span>
                  <span className="font-semibold">
                    {formatCleanNumber(minHealthyKg / 0.45359237, 1)} –{' '}
                    {formatCleanNumber(maxHealthyKg / 0.45359237, 1)} lb
                  </span>
                </div>
              </div>
            </div>
          </div>
        ),
      };
    }

    // ------------------------------------------------------------------------
    // #30 BMR & TDEE CALORIE CALCULATOR (With Metric / Imperial Toggle)
    // ------------------------------------------------------------------------
    if (id === 'extra-30-bmr-tdee') {
      const sys = toolState.unitSystem || 'metric';
      const sex = toolState.sex || 'male';
      const age = Math.max(10, numVal(toolState.age, 29));
      const weightKg =
        sys === 'metric'
          ? Math.max(20, numVal(toolState.weightKg, 75))
          : Math.max(20, numVal(toolState.weightLb, 165.3) * 0.45359237);
      const heightCm =
        sys === 'metric'
          ? Math.max(100, numVal(toolState.heightCm, 178))
          : Math.max(
              100,
              (numVal(toolState.heightFt, 5) * 12 + numVal(toolState.heightIn, 0)) * 2.54
            );
      const mult = numVal(toolState.activityMultiplier, 1.55);

      const mifflinBmr =
        sex === 'male'
          ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
          : 10 * weightKg + 6.25 * heightCm - 5 * age - 161;

      const harrisBmr =
        sex === 'male'
          ? 88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * age
          : 447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.33 * age;

      const tdee = mifflinBmr * mult;
      const summary = `Mifflin-St Jeor BMR: ${Math.round(mifflinBmr)} kcal/day | Maintenance TDEE: ${Math.round(tdee)} kcal/day | Fat Loss (-500): ${Math.round(tdee - 500)} kcal/day`;

      return {
        summaryToCopy: summary,
        ui: (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3.5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Metabolic Profile Inputs
                </h3>
                <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs">
                  <button
                    type="button"
                    onClick={() => updateState({ unitSystem: 'metric' })}
                    className={`px-2.5 py-1 rounded ${
                      sys === 'metric' ? 'bg-emerald-600 text-white' : 'text-slate-500'
                    }`}
                  >
                    Metric (kg/cm)
                  </button>
                  <button
                    type="button"
                    onClick={() => updateState({ unitSystem: 'imperial' })}
                    className={`px-2.5 py-1 rounded ${
                      sys === 'imperial' ? 'bg-emerald-600 text-white' : 'text-slate-500'
                    }`}
                  >
                    Imperial (lb/ft)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Biological Sex
                  </label>
                  <select
                    value={sex}
                    onChange={(e) => updateState({ sex: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Age (Years)
                  </label>
                  <input
                    type="number"
                    value={toolState.age}
                    onChange={(e) => updateState({ age: parseNumInput(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono tabular-nums"
                  />
                </div>
              </div>

              {sys === 'metric' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Weight (kg)
                    </label>
                    <input
                      type="number"
                      value={toolState.weightKg}
                      onChange={(e) => updateState({ weightKg: parseNumInput(e.target.value) })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Height (cm)
                    </label>
                    <input
                      type="number"
                      value={toolState.heightCm}
                      onChange={(e) => updateState({ heightCm: parseNumInput(e.target.value) })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono tabular-nums"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Weight (lb)
                    </label>
                    <input
                      type="number"
                      value={toolState.weightLb}
                      onChange={(e) => updateState({ weightLb: parseNumInput(e.target.value) })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Feet (ft)
                    </label>
                    <input
                      type="number"
                      value={toolState.heightFt}
                      onChange={(e) => updateState({ heightFt: parseNumInput(e.target.value) })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Inches (in)
                    </label>
                    <input
                      type="number"
                      value={toolState.heightIn}
                      onChange={(e) => updateState({ heightIn: parseNumInput(e.target.value) })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono tabular-nums"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Daily Activity Level
                </label>
                <select
                  value={mult}
                  onChange={(e) => updateState({ activityMultiplier: Number(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs"
                >
                  <option value={1.2}>Sedentary (Office job, little exercise — 1.2×)</option>
                  <option value={1.375}>Lightly Active (1–3 workouts/week — 1.375×)</option>
                  <option value={1.55}>Moderately Active (3–5 workouts/week — 1.55×)</option>
                  <option value={1.725}>Very Active (6–7 hard workouts/week — 1.725×)</option>
                  <option value={1.9}>Athlete / Physical Job (2× daily training — 1.9×)</option>
                </select>
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Daily Energy Expenditure &amp; Calorie Targets
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/70 rounded-lg">
                  <div className="text-xs text-emerald-800 dark:text-emerald-300">
                    Maintenance TDEE
                  </div>
                  <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300 mt-0.5">
                    {Math.round(tdee).toLocaleString()} kcal
                  </div>
                </div>
                <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/70 rounded-lg">
                  <div className="text-xs text-blue-800 dark:text-blue-300">
                    Mifflin-St Jeor BMR
                  </div>
                  <div className="text-xl font-bold font-mono tabular-nums text-blue-700 dark:text-blue-300 mt-0.5">
                    {Math.round(mifflinBmr).toLocaleString()} kcal
                  </div>
                </div>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono tabular-nums">
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500">Harris-Benedict BMR (Revised)</span>
                  <span className="font-semibold">{Math.round(harrisBmr).toLocaleString()} kcal/day</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500">Mild Weight Loss (−250 kcal)</span>
                  <span className="font-semibold">{Math.round(tdee - 250).toLocaleString()} kcal/day</span>
                </div>
                <div className="py-2 flex justify-between text-emerald-600 dark:text-emerald-400">
                  <span>Standard Fat Cut (−500 kcal)</span>
                  <span className="font-semibold">{Math.round(tdee - 500).toLocaleString()} kcal/day</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-500">Lean Muscle Gain (+300 kcal)</span>
                  <span className="font-semibold">{Math.round(tdee + 300).toLocaleString()} kcal/day</span>
                </div>
              </div>
            </div>
          </div>
        ),
      };
    }

    // ------------------------------------------------------------------------
    // #31 BODY FAT & LEAN MASS ESTIMATOR (With US Navy Log10 Validation Guard + Metric/Imperial Toggle)
    // ------------------------------------------------------------------------
    if (id === 'extra-31-body-fat') {
      const sys = toolState.unitSystem || 'metric';
      const sex: 'male' | 'female' = toolState.sex || 'male';
      const effWeightKg =
        sys === 'metric'
          ? numVal(toolState.weightKg, 78)
          : numVal(toolState.weightLb, 172) * 0.45359237;
      const effHeightCm =
        sys === 'metric'
          ? numVal(toolState.heightCm, 178)
          : (numVal(toolState.heightFt, 5) * 12 + numVal(toolState.heightIn, 0)) * 2.54;
      const effNeckCm =
        sys === 'metric'
          ? numVal(toolState.neckCm, 38)
          : numVal(toolState.neckIn, 15) * 2.54;
      const effWaistCm =
        sys === 'metric'
          ? numVal(toolState.waistCm, 84)
          : numVal(toolState.waistIn, 33) * 2.54;
      const effHipCm =
        sys === 'metric'
          ? numVal(toolState.hipCm, 96)
          : numVal(toolState.hipIn, 37.8) * 2.54;

      const bfRes = calculateUsNavyBodyFat({
        sex,
        age: numVal(toolState.age, 30),
        weightKg: effWeightKg,
        heightCm: effHeightCm,
        neckCm: effNeckCm,
        waistCm: effWaistCm,
        hipCm: effHipCm,
      });

      const summary = bfRes.valid
        ? `US Navy Body Fat: ${bfRes.navyBodyFatPct}% (${bfRes.category}) | Fat Mass: ${bfRes.fatMassKg} kg | Lean Body Mass: ${bfRes.leanMassKg} kg`
        : bfRes.error || 'Invalid measurements';

      return {
        summaryToCopy: summary,
        ui: (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3.5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  US Navy Circumference Measurements
                </h3>
                <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs">
                  <button
                    type="button"
                    onClick={() => updateState({ unitSystem: 'metric' })}
                    className={`px-2.5 py-1 rounded ${
                      sys === 'metric' ? 'bg-emerald-600 text-white' : 'text-slate-500'
                    }`}
                  >
                    Metric (kg/cm)
                  </button>
                  <button
                    type="button"
                    onClick={() => updateState({ unitSystem: 'imperial' })}
                    className={`px-2.5 py-1 rounded ${
                      sys === 'imperial' ? 'bg-emerald-600 text-white' : 'text-slate-500'
                    }`}
                  >
                    Imperial (lb/in)
                  </button>
                </div>
              </div>

              {sys === 'metric' ? (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Sex
                      </label>
                      <select
                        value={sex}
                        onChange={(e) => updateState({ sex: e.target.value })}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-2 text-xs"
                      >
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Weight (kg)
                      </label>
                      <input
                        type="number"
                        value={toolState.weightKg}
                        onChange={(e) => updateState({ weightKg: parseNumInput(e.target.value) })}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-2 text-xs font-mono tabular-nums"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Height (cm)
                      </label>
                      <input
                        type="number"
                        value={toolState.heightCm}
                        onChange={(e) => updateState({ heightCm: parseNumInput(e.target.value) })}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-2 text-xs font-mono tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Neck (cm)
                      </label>
                      <input
                        type="number"
                        value={toolState.neckCm}
                        onChange={(e) => updateState({ neckCm: parseNumInput(e.target.value) })}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-2 text-xs font-mono tabular-nums"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Waist (cm)
                      </label>
                      <input
                        type="number"
                        value={toolState.waistCm}
                        onChange={(e) => updateState({ waistCm: parseNumInput(e.target.value) })}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-2 text-xs font-mono tabular-nums"
                      />
                    </div>
                    {sex === 'female' && (
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          Hip (cm)
                        </label>
                        <input
                          type="number"
                          value={toolState.hipCm}
                          onChange={(e) => updateState({ hipCm: parseNumInput(e.target.value) })}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-2 text-xs font-mono tabular-nums"
                        />
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-2.5">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Sex
                      </label>
                      <select
                        value={sex}
                        onChange={(e) => updateState({ sex: e.target.value })}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-2 text-xs"
                      >
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Weight (lb)
                      </label>
                      <input
                        type="number"
                        value={toolState.weightLb}
                        onChange={(e) => updateState({ weightLb: parseNumInput(e.target.value) })}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-2 text-xs font-mono tabular-nums"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Feet (ft)
                      </label>
                      <input
                        type="number"
                        value={toolState.heightFt}
                        onChange={(e) => updateState({ heightFt: parseNumInput(e.target.value) })}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-2 text-xs font-mono tabular-nums"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Inches (in)
                      </label>
                      <input
                        type="number"
                        value={toolState.heightIn}
                        onChange={(e) => updateState({ heightIn: parseNumInput(e.target.value) })}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-2 text-xs font-mono tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Neck (in)
                      </label>
                      <input
                        type="number"
                        step="0.25"
                        value={toolState.neckIn}
                        onChange={(e) => updateState({ neckIn: parseNumInput(e.target.value) })}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-2 text-xs font-mono tabular-nums"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Waist (in)
                      </label>
                      <input
                        type="number"
                        step="0.25"
                        value={toolState.waistIn}
                        onChange={(e) => updateState({ waistIn: parseNumInput(e.target.value) })}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-2 text-xs font-mono tabular-nums"
                      />
                    </div>
                    {sex === 'female' && (
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          Hip (in)
                        </label>
                        <input
                          type="number"
                          step="0.25"
                          value={toolState.hipIn}
                          onChange={(e) => updateState({ hipIn: parseNumInput(e.target.value) })}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-2 text-xs font-mono tabular-nums"
                        />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Body Composition Breakdown
              </h3>
              {!bfRes.valid ? (
                <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>{bfRes.error}</span>
                </div>
              ) : (
                <>
                  <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/70 rounded-lg">
                    <div className="text-xs text-emerald-800 dark:text-emerald-300">
                      US Navy Body Fat ({bfRes.category})
                    </div>
                    <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300 mt-1">
                      {bfRes.navyBodyFatPct}%
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono tabular-nums">
                    <div className="py-2 flex justify-between">
                      <span className="text-slate-500">Lean Body Mass (LBM)</span>
                      <span className="font-semibold text-blue-600 dark:text-blue-400">
                        {bfRes.leanMassKg} kg ({formatCleanNumber(bfRes.leanMassKg / 0.45359237, 1)} lb)
                      </span>
                    </div>
                    <div className="py-2 flex justify-between">
                      <span className="text-slate-500">Total Fat Mass</span>
                      <span className="font-semibold">
                        {bfRes.fatMassKg} kg ({formatCleanNumber(bfRes.fatMassKg / 0.45359237, 1)} lb)
                      </span>
                    </div>
                    <div className="py-2 flex justify-between">
                      <span className="text-slate-500">BMI-Derived Body Fat Estimate</span>
                      <span className="font-semibold">{bfRes.bmiBodyFatPct}%</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        ),
      };
    }

    // ------------------------------------------------------------------------
    // #33 LOAN & MORTGAGE EMI AMORTIZATION CALCULATOR
    // ------------------------------------------------------------------------
    if (id === 'extra-33-loan-emi') {
      const principalAmount = numVal(toolState.principalAmount, 350000);
      const annualRatePercent = numVal(toolState.annualRatePercent, 6.5);
      const tenureYears = numVal(toolState.tenureYears, 30);
      const extraMonthlyPayment = numVal(toolState.extraMonthlyPayment, 0);

      const emiRes = calculateLoanEmiAmortization(
        principalAmount,
        annualRatePercent,
        tenureYears,
        extraMonthlyPayment
      );

      const summary = emiRes.error
        ? emiRes.error
        : `Loan $${principalAmount.toLocaleString()} @ ${annualRatePercent}% (${tenureYears}y) → Monthly EMI: $${formatCleanNumber(emiRes.monthlyEmi, 2)} | Total Interest: $${formatCleanNumber(emiRes.totalInterest, 2)} | Total Payable: $${formatCleanNumber(emiRes.totalPayment, 2)}`;

      return {
        summaryToCopy: summary,
        ui: (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Loan & Mortgage Parameters
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Loan Principal Amount ($)
                    </label>
                    <input
                      type="number"
                      min={100}
                      step="1000"
                      value={toolState.principalAmount}
                      onChange={(e) => updateState({ principalAmount: parseNumInput(e.target.value) })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Annual Interest Rate (% APR)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={40}
                      step="0.1"
                      value={toolState.annualRatePercent}
                      onChange={(e) => updateState({ annualRatePercent: parseNumInput(e.target.value) })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Loan Tenure (Years)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={toolState.tenureYears}
                      onChange={(e) => updateState({ tenureYears: parseNumInput(e.target.value) })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Extra Monthly Prepayment ($)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="50"
                      value={toolState.extraMonthlyPayment}
                      onChange={(e) => updateState({ extraMonthlyPayment: parseNumInput(e.target.value) })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                    />
                  </div>
                </div>
              </div>

              <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Monthly EMI & Amortization Breakdown
                </h3>
                {emiRes.error ? (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-lg text-xs text-rose-700 dark:text-rose-300">
                    {emiRes.error}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/70 rounded-lg">
                        <div className="text-xs text-emerald-800 dark:text-emerald-300">
                          Scheduled Monthly EMI
                        </div>
                        <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300 mt-1">
                          ${formatCleanNumber(emiRes.monthlyEmi, 2)}
                        </div>
                      </div>
                      <div className="p-3.5 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/70 rounded-lg">
                        <div className="text-xs text-blue-800 dark:text-blue-300">
                          Total Interest Payable
                        </div>
                        <div className="text-2xl font-bold font-mono tabular-nums text-blue-700 dark:text-blue-300 mt-1">
                          ${formatCleanNumber(emiRes.totalInterest, 2)}
                        </div>
                      </div>
                    </div>

                    {/* Principal vs Interest Visual Bar */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[11px] font-mono">
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          Principal: {formatCleanNumber(emiRes.principalPercent, 1)}%
                        </span>
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">
                          Interest: {formatCleanNumber(emiRes.interestPercent, 1)}%
                        </span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden flex">
                        <div
                          className="bg-emerald-500 h-full"
                          style={{ width: `${Math.min(100, Math.max(0, emiRes.principalPercent))}%` }}
                        />
                        <div
                          className="bg-amber-500 h-full"
                          style={{ width: `${Math.min(100, Math.max(0, emiRes.interestPercent))}%` }}
                        />
                      </div>
                    </div>

                    <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono tabular-nums">
                      <div className="py-1.5 flex justify-between">
                        <span className="text-slate-500">Total Principal + Interest</span>
                        <span className="font-semibold">${formatCleanNumber(emiRes.totalPayment, 2)}</span>
                      </div>
                      <div className="py-1.5 flex justify-between">
                        <span className="text-slate-500">Actual Payoff Duration</span>
                        <span className="font-semibold">
                          {emiRes.payoffMonthsWithExtra} mos ({formatCleanNumber(emiRes.payoffMonthsWithExtra / 12, 1)} yrs)
                        </span>
                      </div>
                      {extraMonthlyPayment > 0 && (
                        <div className="py-1.5 flex justify-between text-emerald-600 dark:text-emerald-400">
                          <span>Interest Saved via Prepayment</span>
                          <span className="font-bold">${formatCleanNumber(emiRes.interestSavedWithExtra, 2)}</span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Collapsible Year-by-Year Amortization Table + CSV Export */}
            {emiRes.yearlySchedule.length > 0 && (
              <details className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl group">
                <summary className="cursor-pointer flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                  <span>
                    Year-by-Year Loan Amortization Schedule ({emiRes.yearlySchedule.length} Years)
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      const header = 'Year,Opening_Balance,Principal_Paid,Interest_Paid,Extra_Prepayment,Closing_Balance';
                      const rows = emiRes.yearlySchedule.map(
                        (r) =>
                          `${r.year},${r.openingBalance.toFixed(2)},${r.principalPaid.toFixed(2)},${r.interestPaid.toFixed(2)},${r.extraPaid.toFixed(2)},${r.closingBalance.toFixed(2)}`
                      );
                      const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'forma_loan_amortization_schedule.csv';
                      a.click();
                      URL.revokeObjectURL(url);
                      onNotify?.('Exported Loan Amortization Schedule (.CSV)');
                    }}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    <span>Export CSV</span>
                  </button>
                </summary>
                <div className="mt-3 max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                  <table className="w-full text-left text-xs font-mono tabular-nums">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 sticky top-0">
                      <tr>
                        <th className="px-3 py-2">Year</th>
                        <th className="px-3 py-2">Opening</th>
                        <th className="px-3 py-2">Principal</th>
                        <th className="px-3 py-2">Interest</th>
                        <th className="px-3 py-2">Closing Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {emiRes.yearlySchedule.map((row) => (
                        <tr key={row.year}>
                          <td className="px-3 py-1.5 font-bold">Yr {row.year}</td>
                          <td className="px-3 py-1.5">${formatCleanNumber(row.openingBalance, 0)}</td>
                          <td className="px-3 py-1.5 text-emerald-600 dark:text-emerald-400">
                            ${formatCleanNumber(row.principalPaid + row.extraPaid, 0)}
                          </td>
                          <td className="px-3 py-1.5 text-amber-600 dark:text-amber-400">
                            ${formatCleanNumber(row.interestPaid, 0)}
                          </td>
                          <td className="px-3 py-1.5 font-semibold">${formatCleanNumber(row.closingBalance, 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        ),
      };
    }

    // ------------------------------------------------------------------------
    // #34 ROI, PROFIT MARGIN & BREAK-EVEN CALCULATOR
    // ------------------------------------------------------------------------
    if (id === 'extra-34-roi-margin') {
      const unitCost = numVal(toolState.unitCost, 42);
      const sellingPrice = numVal(toolState.sellingPrice, 95);
      const unitsSold = numVal(toolState.unitsSold, 500);
      const fixedOverheadCost = numVal(toolState.fixedOverheadCost, 12000);

      const roiRes = calculateRoiMarginBreakEven(
        unitCost,
        sellingPrice,
        unitsSold,
        fixedOverheadCost
      );

      const summary = roiRes.error
        ? roiRes.error
        : `Gross Margin: ${formatCleanNumber(roiRes.grossMarginPercent, 2)}% | Markup: ${formatCleanNumber(roiRes.markupPercent, 2)}% | Net Profit: $${formatCleanNumber(roiRes.netProfit, 2)} | ROI: ${formatCleanNumber(roiRes.roiPercent, 2)}% | Break-Even: ${roiRes.breakEvenUnits ?? 'N/A'} units`;

      return {
        summaryToCopy: summary,
        ui: (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Unit Economics & Fixed Overhead Inputs
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Variable Unit Cost ($)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={toolState.unitCost}
                    onChange={(e) => updateState({ unitCost: parseNumInput(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Unit Selling Price ($)
                  </label>
                  <input
                    type="number"
                    min={0.01}
                    step="1"
                    value={toolState.sellingPrice}
                    onChange={(e) => updateState({ sellingPrice: parseNumInput(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Target Volume (Units Sold)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="10"
                    value={toolState.unitsSold}
                    onChange={(e) => updateState({ unitsSold: parseNumInput(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Fixed Overhead Cost ($)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="500"
                    value={toolState.fixedOverheadCost}
                    onChange={(e) => updateState({ fixedOverheadCost: parseNumInput(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Profitability, ROI & Break-Even Analysis
              </h3>
              {roiRes.error ? (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-lg text-xs text-rose-700 dark:text-rose-300">
                  {roiRes.error}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/70 rounded-lg">
                      <div className="text-xs text-emerald-800 dark:text-emerald-300">
                        Gross Profit Margin
                      </div>
                      <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300 mt-1">
                        {formatCleanNumber(roiRes.grossMarginPercent, 2)}%
                      </div>
                      <div className="text-[11px] font-mono text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
                        Markup: {formatCleanNumber(roiRes.markupPercent, 2)}%
                      </div>
                    </div>
                    <div className="p-3.5 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/70 rounded-lg">
                      <div className="text-xs text-blue-800 dark:text-blue-300">
                        Return on Investment (ROI)
                      </div>
                      <div className="text-2xl font-bold font-mono tabular-nums text-blue-700 dark:text-blue-300 mt-1">
                        {formatCleanNumber(roiRes.roiPercent, 2)}%
                      </div>
                      <div className="text-[11px] font-mono text-blue-700/80 dark:text-blue-400/80 mt-0.5">
                        Net: ${formatCleanNumber(roiRes.netProfit, 2)}
                      </div>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono tabular-nums">
                    <div className="py-1.5 flex justify-between">
                      <span className="text-slate-500">Contribution Margin per Unit</span>
                      <span className="font-semibold">${formatCleanNumber(roiRes.unitContributionMargin, 2)} / unit</span>
                    </div>
                    <div className="py-1.5 flex justify-between">
                      <span className="text-slate-500">Total Gross Revenue ({unitsSold} units)</span>
                      <span className="font-semibold">${formatCleanNumber(roiRes.totalRevenue, 2)}</span>
                    </div>
                    <div className="py-1.5 flex justify-between">
                      <span className="text-slate-500">Total Cost (Variable + Fixed)</span>
                      <span className="font-semibold">${formatCleanNumber(roiRes.totalCost, 2)}</span>
                    </div>
                    <div className="py-1.5 flex justify-between text-emerald-600 dark:text-emerald-400">
                      <span>Break-Even Volume & Revenue</span>
                      <span className="font-bold">
                        {roiRes.breakEvenUnits !== null
                          ? `${roiRes.breakEvenUnits.toLocaleString()} units ($${formatCleanNumber(roiRes.breakEvenRevenue || 0, 2)})`
                          : 'Unreachable (Price ≤ Unit Cost)'}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        ),
      };
    }

    // ------------------------------------------------------------------------
    // #35 OHM'S LAW & ELECTRICAL POWER CALCULATOR
    // ------------------------------------------------------------------------
    if (id === 'extra-35-ohms-law') {
      const solveMode: OhmsSolveMode = toolState.solveMode || 'from-v-i';
      const inputA = numVal(toolState.inputA, 24);
      const inputB = numVal(toolState.inputB, 2.5);
      const resistorR1 = numVal(toolState.resistorR1, 100);
      const resistorR2 = numVal(toolState.resistorR2, 220);

      const ohmRes = calculateOhmsLawAndPower(solveMode, inputA, inputB, resistorR1, resistorR2);

      const modeLabels: Record<OhmsSolveMode, { labelA: string; labelB: string }> = {
        'from-v-i': { labelA: 'Voltage V (Volts)', labelB: 'Current I (Amperes)' },
        'from-v-r': { labelA: 'Voltage V (Volts)', labelB: 'Resistance R (Ohms Ω)' },
        'from-i-r': { labelA: 'Current I (Amperes)', labelB: 'Resistance R (Ohms Ω)' },
        'from-p-v': { labelA: 'Power P (Watts)', labelB: 'Voltage V (Volts)' },
      };
      const activeLabels = modeLabels[solveMode] || modeLabels['from-v-i'];

      const summary = ohmRes.error
        ? ohmRes.error
        : `V = ${formatCleanNumber(ohmRes.voltageV, 4)} V | I = ${formatCleanNumber(ohmRes.currentA, 4)} A | R = ${formatCleanNumber(ohmRes.resistanceOhm, 4)} Ω | P = ${formatCleanNumber(ohmRes.powerW, 4)} W`;

      return {
        summaryToCopy: summary,
        ui: (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Ohm&apos;s Law Known Parameters & Resistor Network
              </h3>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Known Input Pair
                </label>
                <select
                  value={solveMode}
                  onChange={(e) => updateState({ solveMode: e.target.value as OhmsSolveMode })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono"
                >
                  <option value="from-v-i">Given Voltage (V) & Current (I) → Solve R & P</option>
                  <option value="from-v-r">Given Voltage (V) & Resistance (R) → Solve I & P</option>
                  <option value="from-i-r">Given Current (I) & Resistance (R) → Solve V & P</option>
                  <option value="from-p-v">Given Power (P) & Voltage (V) → Solve I & R</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    {activeLabels.labelA}
                  </label>
                  <input
                    type="number"
                    min={0.001}
                    step="any"
                    value={toolState.inputA}
                    onChange={(e) => updateState({ inputA: parseNumInput(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    {activeLabels.labelB}
                  </label>
                  <input
                    type="number"
                    min={0.001}
                    step="any"
                    value={toolState.inputB}
                    onChange={(e) => updateState({ inputB: parseNumInput(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Series / Parallel Resistor Network Solver (R₁ & R₂)
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-mono text-slate-500">Resistor R₁ (Ω)</label>
                    <input
                      type="number"
                      min={0.1}
                      step="any"
                      value={toolState.resistorR1}
                      onChange={(e) => updateState({ resistorR1: parseNumInput(e.target.value) })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-mono text-slate-500">Resistor R₂ (Ω)</label>
                    <input
                      type="number"
                      min={0.1}
                      step="any"
                      value={toolState.resistorR2}
                      onChange={(e) => updateState({ resistorR2: parseNumInput(e.target.value) })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Solved Electrical Quantities (V, I, R, P)
              </h3>
              {ohmRes.error ? (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-lg text-xs text-rose-700 dark:text-rose-300">
                  {ohmRes.error}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/70 rounded-lg">
                      <div className="text-[11px] text-emerald-800 dark:text-emerald-300">Voltage (V)</div>
                      <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
                        {formatCleanNumber(ohmRes.voltageV, 4)} V
                      </div>
                    </div>
                    <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/70 rounded-lg">
                      <div className="text-[11px] text-blue-800 dark:text-blue-300">Current (I)</div>
                      <div className="text-xl font-bold font-mono tabular-nums text-blue-700 dark:text-blue-300">
                        {formatCleanNumber(ohmRes.currentA, 4)} A
                      </div>
                    </div>
                    <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/70 rounded-lg">
                      <div className="text-[11px] text-amber-800 dark:text-amber-300">Resistance (R)</div>
                      <div className="text-xl font-bold font-mono tabular-nums text-amber-700 dark:text-amber-300">
                        {formatCleanNumber(ohmRes.resistanceOhm, 4)} Ω
                      </div>
                    </div>
                    <div className="p-3 bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/70 rounded-lg">
                      <div className="text-[11px] text-purple-800 dark:text-purple-300">Active Power (P)</div>
                      <div className="text-xl font-bold font-mono tabular-nums text-purple-700 dark:text-purple-300">
                        {formatCleanNumber(ohmRes.powerW, 4)} W
                      </div>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono tabular-nums">
                    <div className="py-1.5 flex justify-between">
                      <span className="text-slate-500">Formula Applied</span>
                      <span className="font-semibold">{ohmRes.formulaUsed}</span>
                    </div>
                    <div className="py-1.5 flex justify-between">
                      <span className="text-slate-500">Series Equivalent (R₁ + R₂)</span>
                      <span className="font-semibold">{formatCleanNumber(ohmRes.seriesReq, 3)} Ω</span>
                    </div>
                    <div className="py-1.5 flex justify-between">
                      <span className="text-slate-500">Parallel Equivalent (R₁∥R₂)</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatCleanNumber(ohmRes.parallelReq, 3)} Ω
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        ),
      };
    }

    // ------------------------------------------------------------------------
    // #36 DESCRIPTIVE STATISTICS & STANDARD DEVIATION
    // ------------------------------------------------------------------------
    if (id === 'extra-36-statistics-calc') {
      const datasetText = String(toolState.datasetText || '');
      const statRes = calculateDescriptiveStatistics(datasetText);

      const summary = statRes.error
        ? statRes.error
        : `n = ${statRes.count} | Mean = ${formatCleanNumber(statRes.mean, 4)} | Median = ${formatCleanNumber(statRes.median, 4)} | Sample SD (s) = ${formatCleanNumber(statRes.sampleStdDev, 4)} | Pop SD (σ) = ${formatCleanNumber(statRes.populationStdDev, 4)} | IQR = ${formatCleanNumber(statRes.iqr, 4)}`;

      return {
        summaryToCopy: summary,
        ui: (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Numeric Sample Dataset (Comma, Space, or Semicolon Separated)
              </h3>
              <textarea
                rows={4}
                value={datasetText}
                onChange={(e) => updateState({ datasetText: e.target.value })}
                placeholder="Enter numbers separated by commas or spaces..."
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-xs font-mono tabular-nums"
              />
              {!statRes.error && (
                <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-[11px] font-mono text-slate-600 dark:text-slate-400">
                  Sorted ({statRes.count} values): {statRes.sortedValues.join(', ')}
                </div>
              )}
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Distribution Metrics, Standard Deviation & Quartiles
              </h3>
              {statRes.error ? (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-lg text-xs text-rose-700 dark:text-rose-300">
                  {statRes.error}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/70 rounded-lg">
                      <div className="text-[11px] text-emerald-800 dark:text-emerald-300">Mean (x̄)</div>
                      <div className="text-lg font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
                        {formatCleanNumber(statRes.mean, 4)}
                      </div>
                    </div>
                    <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/70 rounded-lg">
                      <div className="text-[11px] text-blue-800 dark:text-blue-300">Median</div>
                      <div className="text-lg font-bold font-mono tabular-nums text-blue-700 dark:text-blue-300">
                        {formatCleanNumber(statRes.median, 4)}
                      </div>
                    </div>
                    <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/70 rounded-lg">
                      <div className="text-[11px] text-amber-800 dark:text-amber-300">Sample SD (s)</div>
                      <div className="text-lg font-bold font-mono tabular-nums text-amber-700 dark:text-amber-300">
                        {formatCleanNumber(statRes.sampleStdDev, 4)}
                      </div>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono tabular-nums">
                    <div className="py-1.5 flex justify-between">
                      <span className="text-slate-500">Count (n) & Sum (Σx)</span>
                      <span className="font-semibold">
                        n = {statRes.count} · Σx = {formatCleanNumber(statRes.sum, 4)}
                      </span>
                    </div>
                    <div className="py-1.5 flex justify-between">
                      <span className="text-slate-500">Population Std Dev (σ) & Variance (σ²)</span>
                      <span className="font-semibold">
                        σ = {formatCleanNumber(statRes.populationStdDev, 4)} · σ² = {formatCleanNumber(statRes.populationVariance, 4)}
                      </span>
                    </div>
                    <div className="py-1.5 flex justify-between">
                      <span className="text-slate-500">Min / Max / Range</span>
                      <span className="font-semibold">
                        {statRes.min} / {statRes.max} (Range: {formatCleanNumber(statRes.range, 4)})
                      </span>
                    </div>
                    <div className="py-1.5 flex justify-between">
                      <span className="text-slate-500">Quartiles (Q₁, Q₃) & IQR</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        Q₁ = {formatCleanNumber(statRes.q1, 3)} · Q₃ = {formatCleanNumber(statRes.q3, 3)} · IQR = {formatCleanNumber(statRes.iqr, 3)}
                      </span>
                    </div>
                    <div className="py-1.5 flex justify-between">
                      <span className="text-slate-500">Mode(s)</span>
                      <span className="font-semibold">
                        {statRes.modes.length > 0 ? statRes.modes.join(', ') : 'No repeating mode'}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        ),
      };
    }

    // ------------------------------------------------------------------------
    // #37 TYPOGRAPHY, REM/PX & DPI PRINT CONVERTER
    // ------------------------------------------------------------------------
    if (id === 'extra-37-typography-css') {
      const value = numVal(toolState.value, 24);
      const fromUnit: TypographyUnit = toolState.fromUnit || 'px';
      const baseFontPx = numVal(toolState.baseFontPx, 16);
      const dpi = numVal(toolState.dpi, 96);

      const typoRes = convertTypographyAndCssUnits(value, fromUnit, baseFontPx, dpi);
      const summary = `${value}${fromUnit} = ${formatCleanNumber(typoRes.px, 2)}px = ${formatCleanNumber(typoRes.rem, 4)}rem = ${formatCleanNumber(typoRes.pt, 2)}pt = ${formatCleanNumber(typoRes.mm, 2)}mm (@ ${baseFontPx}px root, ${dpi} DPI)`;

      return {
        summaryToCopy: summary,
        ui: (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                CSS Typography & Print Resolution Parameters
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Input Value
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={toolState.value}
                    onChange={(e) => updateState({ value: parseNumInput(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Source Unit
                  </label>
                  <select
                    value={fromUnit}
                    onChange={(e) => updateState({ fromUnit: e.target.value as TypographyUnit })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono"
                  >
                    <option value="px">Pixels (px)</option>
                    <option value="rem">Root EM (rem)</option>
                    <option value="em">Relative EM (em)</option>
                    <option value="pt">Typographic Points (pt)</option>
                    <option value="pc">Picas (pc)</option>
                    <option value="mm">Millimeters (mm)</option>
                    <option value="in">Inches (in)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Base Root Font Size (px)
                  </label>
                  <input
                    type="number"
                    min={8}
                    max={64}
                    value={toolState.baseFontPx}
                    onChange={(e) => updateState({ baseFontPx: parseNumInput(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Screen / Print Density (DPI)
                  </label>
                  <select
                    value={dpi}
                    onChange={(e) => updateState({ dpi: Number(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono"
                  >
                    <option value={72}>72 DPI (Legacy Screen / PostScript)</option>
                    <option value={96}>96 DPI (W3C CSS Standard)</option>
                    <option value={150}>150 DPI (Medium Print Proof)</option>
                    <option value={300}>300 DPI (High-Res Offset Print)</option>
                  </select>
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg flex items-center justify-between gap-2 text-xs font-mono">
                <span className="truncate text-emerald-700 dark:text-emerald-300">{typoRes.cssSnippet}</span>
                <button
                  type="button"
                  onClick={() => handleCopyText(typoRes.cssSnippet)}
                  className="px-2 py-1 text-[11px] bg-emerald-600 text-white rounded shrink-0"
                >
                  Copy CSS
                </button>
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Equivalent Design & Print Units Matrix
              </h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono tabular-nums">
                {[
                  { label: 'CSS Pixels (px)', val: `${formatCleanNumber(typoRes.px, 3)} px` },
                  { label: `Root EM (rem @ ${baseFontPx}px)`, val: `${formatCleanNumber(typoRes.rem, 4)} rem` },
                  { label: 'Typographic Points (pt)', val: `${formatCleanNumber(typoRes.pt, 3)} pt` },
                  { label: 'Picas (pc)', val: `${formatCleanNumber(typoRes.pc, 3)} pc` },
                  { label: `Millimeters (mm @ ${dpi} DPI)`, val: `${formatCleanNumber(typoRes.mm, 3)} mm` },
                  { label: `Inches (in @ ${dpi} DPI)`, val: `${formatCleanNumber(typoRes.inches, 4)} in` },
                ].map((row) => (
                  <div key={row.label} className="py-2 flex items-center justify-between">
                    <span className="text-slate-500">{row.label}</span>
                    <span className="font-bold text-slate-900 dark:text-white">{row.val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ),
      };
    }

    // ------------------------------------------------------------------------
    // #38 DATA TRANSFER TIME & BANDWIDTH CALCULATOR
    // ------------------------------------------------------------------------
    if (id === 'extra-38-bandwidth-transfer') {
      const fileSize = numVal(toolState.fileSize, 25);
      const fileSizeUnit = (toolState.fileSizeUnit || 'GB') as 'MB' | 'GB' | 'TB' | 'GiB';
      const bandwidthSpeed = numVal(toolState.bandwidthSpeed, 250);
      const bandwidthUnit = (toolState.bandwidthUnit || 'Mbps') as 'Mbps' | 'Gbps' | 'MB/s';
      const overheadPercent = numVal(toolState.overheadPercent, 5);

      const bwRes = calculateBandwidthTransferTime(
        fileSize,
        fileSizeUnit,
        bandwidthSpeed,
        bandwidthUnit,
        overheadPercent
      );

      const summary = bwRes.error
        ? bwRes.error
        : `Transfer ${fileSize} ${fileSizeUnit} @ ${bandwidthSpeed} ${bandwidthUnit} (${overheadPercent}% overhead) → Duration: ${bwRes.formattedDuration} (Effective: ${formatCleanNumber(bwRes.effectiveSpeedMbps, 2)} Mbps)`;

      return {
        summaryToCopy: summary,
        ui: (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Payload Size & Network Link Speed
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    File / Payload Size
                  </label>
                  <input
                    type="number"
                    min={0.01}
                    step="any"
                    value={toolState.fileSize}
                    onChange={(e) => updateState({ fileSize: parseNumInput(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Payload Unit
                  </label>
                  <select
                    value={fileSizeUnit}
                    onChange={(e) => updateState({ fileSizeUnit: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono"
                  >
                    <option value="MB">Megabytes (MB · 10⁶ B)</option>
                    <option value="GB">Gigabytes (GB · 10⁹ B)</option>
                    <option value="GiB">Gibibytes (GiB · 2³⁰ B)</option>
                    <option value="TB">Terabytes (TB · 10¹² B)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Network Link Speed
                  </label>
                  <input
                    type="number"
                    min={0.1}
                    step="any"
                    value={toolState.bandwidthSpeed}
                    onChange={(e) => updateState({ bandwidthSpeed: parseNumInput(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Bandwidth Unit
                  </label>
                  <select
                    value={bandwidthUnit}
                    onChange={(e) => updateState({ bandwidthUnit: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono"
                  >
                    <option value="Mbps">Megabits/sec (Mbps)</option>
                    <option value="Gbps">Gigabits/sec (Gbps)</option>
                    <option value="MB/s">Megabytes/sec (MB/s)</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  TCP/IP & TLS Protocol Overhead (%): {overheadPercent}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={25}
                  step={1}
                  value={overheadPercent}
                  onChange={(e) => updateState({ overheadPercent: Number(e.target.value) })}
                  className="w-full accent-emerald-600"
                />
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Estimated Transfer Duration & Benchmark Links
              </h3>
              {bwRes.error ? (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-lg text-xs text-rose-700 dark:text-rose-300">
                  {bwRes.error}
                </div>
              ) : (
                <>
                  <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/70 rounded-lg">
                    <div className="text-xs text-emerald-800 dark:text-emerald-300">
                      Estimated Transfer Time ({overheadPercent}% overhead)
                    </div>
                    <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300 mt-1">
                      {bwRes.formattedDuration}
                    </div>
                    <div className="text-[11px] font-mono text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
                      Effective Throughput: {formatCleanNumber(bwRes.effectiveSpeedMbps, 2)} Mbps ({formatCleanNumber(bwRes.effectiveBytesPerSec / 1e6, 2)} MB/s)
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono tabular-nums">
                    {bwRes.speedComparisonTable.map((row) => (
                      <div key={row.label} className="py-1.5 flex justify-between">
                        <span className="text-slate-500">{row.label}</span>
                        <span className="font-semibold">{row.formattedTime}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        ),
      };
    }

    // ------------------------------------------------------------------------
    // #39 TEXT ↔ BINARY / DECIMAL / HEX / OCTAL TRANSLATOR
    // ------------------------------------------------------------------------
    if (id === 'extra-39-binary-hex-octal') {
      const input = String(toolState.input ?? '');
      const mode: ByteTranslateMode =
        toolState.mode === 'code-to-text' || toolState.mode === 'auto-detect'
          ? toolState.mode
          : 'text-to-code';
      const format: ByteCodeFormat =
        toolState.format === 'decimal' ||
        toolState.format === 'hex' ||
        toolState.format === 'octal'
          ? toolState.format
          : 'binary';
      const delimiter: ByteDelimiter =
        toolState.delimiter === 'none' ||
        toolState.delimiter === 'newline' ||
        toolState.delimiter === 'comma'
          ? toolState.delimiter
          : 'space';
      const useUtf8 = toolState.useUtf8 !== false;
      const padLeadingZeros = toolState.padLeadingZeros !== false;

      const res = translateTextBinaryHexOctal({
        input,
        mode,
        format,
        delimiter,
        useUtf8,
        padLeadingZeros,
      });

      const summary = res.error ? res.error : res.output;

      return {
        summaryToCopy: summary,
        ui: (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column: Input & Encoding Controls */}
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Input Stream &amp; Radix Options
                </h3>
                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
                  {(
                    [
                      { id: 'text-to-code', label: 'Text → Code' },
                      { id: 'code-to-text', label: 'Code → Text' },
                      { id: 'auto-detect', label: 'Auto-Detect' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => updateState({ mode: m.id })}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        mode === m.id
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(
                  [
                    { id: 'binary', label: 'Binary (8-bit)' },
                    { id: 'decimal', label: 'Decimal' },
                    { id: 'hex', label: 'Hexadecimal' },
                    { id: 'octal', label: 'Octal' },
                  ] as const
                ).map((fmt) => (
                  <button
                    key={fmt.id}
                    type="button"
                    onClick={() => updateState({ format: fmt.id })}
                    className={`py-2 px-2.5 text-xs font-semibold rounded-lg border transition-colors ${
                      format === fmt.id
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Byte Delimiter
                  </label>
                  <select
                    value={delimiter}
                    onChange={(e) => updateState({ delimiter: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono"
                  >
                    <option value="space">Space</option>
                    <option value="none">None</option>
                    <option value="newline">Newline</option>
                    <option value="comma">Comma</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer pt-5">
                  <input
                    type="checkbox"
                    checked={useUtf8}
                    onChange={(e) => updateState({ useUtf8: e.target.checked })}
                    className="rounded border-slate-300 text-emerald-600"
                  />
                  <span>UTF-8 Multi-Byte</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer pt-5">
                  <input
                    type="checkbox"
                    checked={padLeadingZeros}
                    onChange={(e) => updateState({ padLeadingZeros: e.target.checked })}
                    className="rounded border-slate-300 text-emerald-600"
                  />
                  <span>Pad leading zeros (8-bit)</span>
                </label>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Source Input ({res.charCount} chars · {res.byteCount} bytes)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handlePasteIntoInput('input')}
                      className="px-2 py-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-emerald-600 hover:text-white rounded-md flex items-center gap-1 transition-colors"
                    >
                      <ClipboardPaste className="w-3 h-3" />
                      <span>Paste</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateState({
                          input: res.output,
                          mode:
                            res.effectiveMode === 'text-to-code'
                              ? 'code-to-text'
                              : 'text-to-code',
                        })
                      }
                      className="px-2 py-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-emerald-600 hover:text-white rounded-md flex items-center gap-1 transition-colors"
                    >
                      <ArrowLeftRight className="w-3 h-3" />
                      <span>Swap (⇄)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateState({ input: '' })}
                      className="px-2 py-1 text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <textarea
                  rows={5}
                  value={input}
                  onChange={(e) => updateState({ input: e.target.value })}
                  placeholder="Type text or paste Binary (01000110), Hex (46 6F), Decimal, or Octal..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-xs font-mono"
                />
              </div>
            </div>

            {/* Right Column: Live Monospace Output */}
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Translated Output Stream
                    </h3>
                    <p className="text-[11px] font-mono text-slate-500">
                      Active: {res.effectiveMode === 'text-to-code' ? 'Text → Code' : 'Code → Text'} ·{' '}
                      {res.effectiveFormat.toUpperCase()} · {res.byteCount} bytes
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleCopyText(res.output)}
                      className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-md flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportSummaryTxt(res.output)}
                      className="px-2.5 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download .txt</span>
                    </button>
                  </div>
                </div>

                {res.error ? (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-lg text-xs text-rose-700 dark:text-rose-300">
                    {res.error}
                  </div>
                ) : (
                  <textarea
                    readOnly
                    rows={8}
                    value={res.output}
                    placeholder="Translated output appears here..."
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-xs font-mono text-emerald-700 dark:text-emerald-300"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs font-mono tabular-nums">
                <div className="p-2.5 bg-slate-50 dark:bg-slate-950 rounded-lg flex justify-between">
                  <span className="text-slate-500">Characters</span>
                  <span className="font-bold">{res.charCount}</span>
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-950 rounded-lg flex justify-between">
                  <span className="text-slate-500">UTF-8 Bytes</span>
                  <span className="font-bold">{res.byteCount}</span>
                </div>
              </div>
            </div>
          </div>
        ),
      };
    }

    // ------------------------------------------------------------------------
    // #40 MORSE CODE TRANSLATOR (TEXT ↔ MORSE + WEB AUDIO CW TONE)
    // ------------------------------------------------------------------------
    if (id === 'extra-40-morse-code') {
      const input = String(toolState.input ?? '');
      const mode: 'text-to-morse' | 'morse-to-text' =
        toolState.mode === 'morse-to-text' ? 'morse-to-text' : 'text-to-morse';
      const wordSeparator: 'slash' | 'space' =
        toolState.wordSeparator === 'space' ? 'space' : 'slash';
      const wpm = Math.max(5, Math.min(30, numVal(toolState.wpm, 18)));
      const toneHz = Math.max(400, Math.min(900, numVal(toolState.toneHz, 600)));
      const volume = Math.max(5, Math.min(100, numVal(toolState.volume, 65)));
      const showRef = Boolean(toolState.showReferenceChart);

      const morseRes = translateMorseCode({ input, mode, wordSeparator });
      const activeMorseStream = mode === 'text-to-morse' ? morseRes.output : input;

      return {
        summaryToCopy: morseRes.output,
        ui: (
          <div className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: Input & Audio Synthesizer Controls */}
              <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Morse Transcoder &amp; CW Audio Controls
                  </h3>
                  <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
                    {(
                      [
                        { id: 'text-to-morse', label: 'Text → Morse' },
                        { id: 'morse-to-text', label: 'Morse → Text' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => updateState({ mode: m.id })}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                          mode === m.id
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      Word Separator:
                    </span>
                    <button
                      type="button"
                      onClick={() => updateState({ wordSeparator: 'slash' })}
                      className={`px-2.5 py-1 rounded-md border font-mono ${
                        wordSeparator === 'slash'
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                          : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      / (Slash)
                    </button>
                    <button
                      type="button"
                      onClick={() => updateState({ wordSeparator: 'space' })}
                      className={`px-2.5 py-1 rounded-md border font-mono ${
                        wordSeparator === 'space'
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                          : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      Space
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handlePasteIntoInput('input')}
                      className="px-2.5 py-1 font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-emerald-600 hover:text-white rounded-md flex items-center gap-1"
                    >
                      <ClipboardPaste className="w-3 h-3" />
                      <span>Paste</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateState({
                          input: morseRes.output,
                          mode: mode === 'text-to-morse' ? 'morse-to-text' : 'text-to-morse',
                        })
                      }
                      className="px-2.5 py-1 font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-emerald-600 hover:text-white rounded-md flex items-center gap-1"
                    >
                      <ArrowLeftRight className="w-3 h-3" />
                      <span>Swap (⇄)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateState({ input: '' })}
                      className="px-2 py-1 text-rose-600 dark:text-rose-400 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <textarea
                  rows={4}
                  value={input}
                  onChange={(e) => updateState({ input: e.target.value })}
                  placeholder={
                    mode === 'text-to-morse'
                      ? 'Enter message (e.g. SOS FORMA STUDIO)...'
                      : 'Enter Morse dots & dashes (e.g. ... --- ...)...'
                  }
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-xs font-mono"
                />

                {/* Web Audio API CW Tone Controls */}
                <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Web Audio CW Tone Synthesizer
                    </span>
                    <div className="flex items-center gap-2">
                      {!isPlayingMorse ? (
                        <button
                          type="button"
                          onClick={() => playMorseAudio(activeMorseStream, wpm, toneHz, volume)}
                          className="px-3 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center gap-1.5"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Play Audio</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={stopMorseAudio}
                          className="px-3 py-1 text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded-lg flex items-center gap-1.5"
                        >
                          <Square className="w-3.5 h-3.5" />
                          <span>Stop Audio</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
                    <div>
                      <label className="block text-[11px] text-slate-500">
                        Speed: {wpm} WPM
                      </label>
                      <input
                        type="range"
                        min={5}
                        max={30}
                        value={wpm}
                        onChange={(e) => updateState({ wpm: Number(e.target.value) })}
                        className="w-full accent-emerald-600"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500">
                        Tone: {toneHz} Hz
                      </label>
                      <input
                        type="range"
                        min={400}
                        max={900}
                        step={10}
                        value={toneHz}
                        onChange={(e) => updateState({ toneHz: Number(e.target.value) })}
                        className="w-full accent-emerald-600"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500">
                        Volume: {volume}%
                      </label>
                      <input
                        type="range"
                        min={5}
                        max={100}
                        step={5}
                        value={volume}
                        onChange={(e) => updateState({ volume: Number(e.target.value) })}
                        className="w-full accent-emerald-600"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Morse Output */}
              <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {mode === 'text-to-morse' ? 'ITU Morse Code Output' : 'Decoded Text Output'}
                    </h3>
                    <button
                      type="button"
                      onClick={() => handleCopyText(morseRes.output)}
                      className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-md flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </button>
                  </div>

                  <textarea
                    readOnly
                    rows={7}
                    value={morseRes.output}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-sm font-mono tracking-wider text-emerald-700 dark:text-emerald-300"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => updateState({ showReferenceChart: !showRef })}
                  className="w-full py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-xs font-semibold flex items-center justify-between"
                >
                  <span>ITU Morse Code Reference Chart (A–Z, 0–9)</span>
                  {showRef ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {showRef && (
              <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
                <div className="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-9 gap-2 text-xs font-mono">
                  {MORSE_REFERENCE_CHART.map((item) => (
                    <div
                      key={item.char}
                      className="p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg flex items-center justify-between"
                    >
                      <span className="font-bold text-slate-900 dark:text-white">{item.char}</span>
                      <span className="text-emerald-600 dark:text-emerald-400">{item.code}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ),
      };
    }

    // ------------------------------------------------------------------------
    // #41 CIPHER & SECRET MESSAGE STUDIO (CAESAR, ROT13, ATBASH, REVERSE)
    // ------------------------------------------------------------------------
    if (id === 'extra-41-cipher-studio') {
      const input = String(toolState.input ?? '');
      const cipher: CipherType =
        toolState.cipher === 'rot13' ||
        toolState.cipher === 'atbash' ||
        toolState.cipher === 'reverse'
          ? toolState.cipher
          : 'caesar';
      const mode: 'encode' | 'decode' = toolState.mode === 'decode' ? 'decode' : 'encode';
      const shift = Math.max(1, Math.min(25, Math.round(numVal(toolState.shift, 3))));
      const preserveSpaces = toolState.preserveSpaces !== false;
      const showAll25Shifts = Boolean(toolState.showAll25Shifts);

      const cipherRes = runCipherStudio({
        input,
        cipher,
        mode,
        shift,
        preserveSpacesAndPunctuation: preserveSpaces,
      });

      return {
        summaryToCopy: cipherRes.output,
        ui: (
          <div className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: Cipher Controls & Input */}
              <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(
                    [
                      { id: 'caesar', label: 'Caesar Cipher' },
                      { id: 'rot13', label: 'ROT13' },
                      { id: 'atbash', label: 'Atbash' },
                      { id: 'reverse', label: 'Reverse Text' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => updateState({ cipher: tab.id })}
                      className={`py-2 px-2.5 text-xs font-semibold rounded-lg border transition-colors ${
                        cipher === tab.id
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
                    {(['encode', 'decode'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => updateState({ mode: m })}
                        className={`px-3 py-1 text-xs font-semibold rounded-md capitalize ${
                          mode === m
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handlePasteIntoInput('input')}
                      className="px-2.5 py-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-emerald-600 hover:text-white rounded-md flex items-center gap-1"
                    >
                      <ClipboardPaste className="w-3 h-3" />
                      <span>Paste</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateState({
                          input: cipherRes.output,
                          mode: mode === 'encode' ? 'decode' : 'encode',
                        })
                      }
                      className="px-2.5 py-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-emerald-600 hover:text-white rounded-md flex items-center gap-1"
                    >
                      <ArrowLeftRight className="w-3 h-3" />
                      <span>Swap (⇄)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateState({ input: '' })}
                      className="px-2 py-1 text-xs text-rose-600 dark:text-rose-400 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {cipher === 'caesar' && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300 font-mono">
                      Alphabet Shift (1–25): {shift}
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={25}
                      value={shift}
                      onChange={(e) => updateState({ shift: Number(e.target.value) })}
                      className="w-full accent-emerald-600"
                    />
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preserveSpaces}
                      onChange={(e) => updateState({ preserveSpaces: e.target.checked })}
                      className="rounded border-slate-300 text-emerald-600"
                    />
                    <span>Preserve spaces &amp; punctuation</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-emerald-700 dark:text-emerald-400">
                    <input
                      type="checkbox"
                      checked={showAll25Shifts}
                      onChange={(e) => updateState({ showAll25Shifts: e.target.checked })}
                      className="rounded border-slate-300 text-emerald-600"
                    />
                    <span>Show All 25 Shifts (Brute-Force)</span>
                  </label>
                </div>

                <textarea
                  rows={5}
                  value={input}
                  onChange={(e) => updateState({ input: e.target.value })}
                  placeholder="Enter plaintext or ciphertext message..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-xs font-mono"
                />
              </div>

              {/* Right Column: Cipher Output */}
              <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Cipher Output ({cipher.toUpperCase()} · {mode.toUpperCase()})
                    </h3>
                    <button
                      type="button"
                      onClick={() => handleCopyText(cipherRes.output)}
                      className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-md flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </button>
                  </div>

                  <textarea
                    readOnly
                    rows={8}
                    value={cipherRes.output}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-xs font-mono text-emerald-700 dark:text-emerald-300"
                  />
                </div>
              </div>
            </div>

            {showAll25Shifts && (
              <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  All 25 Caesar Shifts (Brute-Force Inspector)
                </h4>
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-mono">
                  {cipherRes.all25Shifts.map((row) => (
                    <div
                      key={row.shift}
                      className="px-3 py-2 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-950/60"
                    >
                      <span className="text-slate-400 shrink-0">
                        Shift +{String(row.shift).padStart(2, '0')}
                      </span>
                      <span className="flex-1 truncate text-slate-800 dark:text-slate-200">
                        {row.text}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyText(row.text)}
                        className="px-2 py-0.5 text-[11px] bg-slate-100 dark:bg-slate-800 hover:bg-emerald-600 hover:text-white rounded"
                      >
                        Copy
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ),
      };
    }

    // ------------------------------------------------------------------------
    // #42 BASE64 / URL / HTML ENCODER & DECODER
    // ------------------------------------------------------------------------
    if (id === 'extra-42-base64-url-html') {
      const input = String(toolState.input ?? '');
      const format: EncoderFormatTab =
        toolState.format === 'url' || toolState.format === 'html'
          ? toolState.format
          : 'base64';
      const mode: 'encode' | 'decode' = toolState.mode === 'decode' ? 'decode' : 'encode';
      const urlSafeBase64 = Boolean(toolState.urlSafeBase64);
      const urlScope: 'component' | 'full' =
        toolState.urlScope === 'full' ? 'full' : 'component';

      const encRes = encodeDecodeBase64UrlHtml({
        input,
        format,
        mode,
        urlSafeBase64,
        urlScope,
      });

      return {
        summaryToCopy: encRes.error ? encRes.error : encRes.output,
        ui: (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column: Format Tabs & Source Input */}
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'base64', label: 'Base64 (UTF-8)' },
                    { id: 'url', label: 'URL Encode' },
                    { id: 'html', label: 'HTML Entities' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => updateState({ format: tab.id })}
                    className={`py-2 px-2.5 text-xs font-semibold rounded-lg border transition-colors ${
                      format === tab.id
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
                  {(['encode', 'decode'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => updateState({ mode: m })}
                      className={`px-3 py-1 text-xs font-semibold rounded-md capitalize ${
                        mode === m
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePasteIntoInput('input')}
                    className="px-2.5 py-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-emerald-600 hover:text-white rounded-md flex items-center gap-1"
                  >
                    <ClipboardPaste className="w-3 h-3" />
                    <span>Paste</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateState({
                        input: encRes.output,
                        mode: mode === 'encode' ? 'decode' : 'encode',
                      })
                    }
                    className="px-2.5 py-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-emerald-600 hover:text-white rounded-md flex items-center gap-1"
                  >
                    <ArrowLeftRight className="w-3 h-3" />
                    <span>Swap (⇄)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateState({ input: '' })}
                    className="px-2 py-1 text-xs text-rose-600 dark:text-rose-400 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {format === 'base64' && (
                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={urlSafeBase64}
                    onChange={(e) => updateState({ urlSafeBase64: e.target.checked })}
                    className="rounded border-slate-300 text-emerald-600"
                  />
                  <span>URL-safe Base64 (- and _ instead of + and /)</span>
                </label>
              )}

              {format === 'url' && (
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-500">Scope:</span>
                  <button
                    type="button"
                    onClick={() => updateState({ urlScope: 'component' })}
                    className={`px-2.5 py-1 rounded border ${
                      urlScope === 'component'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-300 font-semibold'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    Component (encodeURIComponent)
                  </button>
                  <button
                    type="button"
                    onClick={() => updateState({ urlScope: 'full' })}
                    className={`px-2.5 py-1 rounded border ${
                      urlScope === 'full'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-300 font-semibold'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    Full URL (encodeURI)
                  </button>
                </div>
              )}

              <textarea
                rows={6}
                value={input}
                onChange={(e) => updateState({ input: e.target.value })}
                placeholder="Paste text, URL, HTML snippet, or Base64 string..."
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-xs font-mono"
              />
            </div>

            {/* Right Column: Encoded/Decoded Output */}
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {mode === 'encode' ? 'Encoded' : 'Decoded'} Output ({encRes.outputBytes} bytes)
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleCopyText(encRes.output)}
                      className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-md flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportSummaryTxt(encRes.output)}
                      className="px-2.5 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download .txt</span>
                    </button>
                  </div>
                </div>

                {encRes.error ? (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-lg text-xs text-rose-700 dark:text-rose-300">
                    {encRes.error}
                  </div>
                ) : (
                  <textarea
                    readOnly
                    rows={8}
                    value={encRes.output}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-xs font-mono text-emerald-700 dark:text-emerald-300"
                  />
                )}
              </div>
            </div>
          </div>
        ),
      };
    }

    // ------------------------------------------------------------------------
    // #43 ASCII & UNICODE CHARACTER INSPECTOR
    // ------------------------------------------------------------------------
    if (id === 'extra-43-unicode-inspector') {
      const input = String(toolState.input ?? '');
      const uniRes = inspectAsciiUnicodeCharacters(input);

      return {
        summaryToCopy: uniRes.csvExport,
        ui: (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column: Input Box & Summary Bar */}
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Text &amp; Symbol Input
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePasteIntoInput('input')}
                    className="px-2.5 py-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-emerald-600 hover:text-white rounded-md flex items-center gap-1"
                  >
                    <ClipboardPaste className="w-3 h-3" />
                    <span>Paste</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateState({ input: '' })}
                    className="px-2.5 py-1 text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <textarea
                rows={5}
                value={input}
                onChange={(e) => updateState({ input: e.target.value })}
                placeholder="Type or paste any ASCII, Unicode, emoji, or technical symbols..."
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-xs font-mono"
              />

              {/* Summary Bar */}
              <div className="grid grid-cols-3 gap-3 text-xs font-mono tabular-nums">
                <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/70 rounded-lg">
                  <div className="text-[11px] text-emerald-800 dark:text-emerald-300">
                    Characters
                  </div>
                  <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                    {uniRes.charCount}
                  </div>
                </div>
                <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/70 rounded-lg">
                  <div className="text-[11px] text-blue-800 dark:text-blue-300">UTF-8 Bytes</div>
                  <div className="text-lg font-bold text-blue-700 dark:text-blue-300">
                    {uniRes.utf8ByteCount}
                  </div>
                </div>
                <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/70 rounded-lg">
                  <div className="text-[11px] text-indigo-800 dark:text-indigo-300">Words</div>
                  <div className="text-lg font-bold text-indigo-700 dark:text-indigo-300">
                    {uniRes.wordCount}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Scrollable Codepoint Table & CSV/JSON Copy */}
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Codepoint &amp; UTF-8 Byte Table
                </h3>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCopyText(uniRes.csvExport)}
                    className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-md"
                  >
                    Copy All as CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyText(uniRes.jsonExport)}
                    className="px-2.5 py-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md"
                  >
                    Copy All as JSON
                  </button>
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                <table className="w-full text-left text-xs font-mono tabular-nums">
                  <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800 sticky top-0">
                    <tr>
                      <th className="py-2 px-2.5">Char</th>
                      <th className="py-2 px-2.5">Decimal</th>
                      <th className="py-2 px-2.5">Hex</th>
                      <th className="py-2 px-2.5">Binary 8-bit</th>
                      <th className="py-2 px-2.5">UTF-8 Bytes</th>
                      <th className="py-2 px-2.5 text-right">Copy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {uniRes.rows.map((row) => (
                      <tr key={row.index} className="hover:bg-slate-50/70 dark:hover:bg-slate-950/40">
                        <td className="py-1.5 px-2.5 font-bold text-slate-900 dark:text-white">
                          {row.displayChar}
                        </td>
                        <td className="py-1.5 px-2.5">{row.codePointDec}</td>
                        <td className="py-1.5 px-2.5 text-emerald-600 dark:text-emerald-400">
                          {row.codePointHex}
                        </td>
                        <td className="py-1.5 px-2.5 text-[11px]">{row.binary8Bit}</td>
                        <td className="py-1.5 px-2.5">{row.utf8HexBytes}</td>
                        <td className="py-1.5 px-2.5 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              handleCopyText(
                                `${row.displayChar} | Dec: ${row.codePointDec} | ${row.codePointHex} | Bin: ${row.binary8Bit} | UTF-8: ${row.utf8HexBytes}`
                              )
                            }
                            className="px-2 py-0.5 text-[10px] bg-slate-100 dark:bg-slate-800 hover:bg-emerald-600 hover:text-white rounded"
                          >
                            Copy
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ),
      };
    }

    // ------------------------------------------------------------------------
    // #32 ONE-REP MAX (1RM) STRENGTH CALCULATOR (With Brzycki r >= 37 Guard)
    // ------------------------------------------------------------------------
    const weight = numVal(toolState.weight, 100);
    const reps = numVal(toolState.reps, 5);
    const unit = toolState.unit || 'kg';
    const orm = calculateOneRepMax(weight, reps);

    const summary = orm.valid
      ? `Estimated 1RM: ${orm.average1RM} ${unit} (Epley: ${orm.epley1RM} ${unit}, Brzycki: ${orm.brzycki1RM} ${unit})`
      : orm.warning || 'Invalid input';

    return {
      summaryToCopy: summary,
      ui: (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Lift Performance Input
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Weight Lifted
                </label>
                <input
                  type="number"
                  min={1}
                  value={toolState.weight}
                  onChange={(e) => updateState({ weight: parseNumInput(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Repetitions
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={toolState.reps}
                  onChange={(e) => updateState({ reps: parseNumInput(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Unit
                </label>
                <select
                  value={unit}
                  onChange={(e) => updateState({ unit: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono"
                >
                  <option value="kg">kg</option>
                  <option value="lb">lb</option>
                </select>
              </div>
            </div>

            {orm.warning && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <span>{orm.warning}</span>
              </div>
            )}

            {orm.valid && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/70 rounded-lg">
                  <div className="text-xs text-emerald-800 dark:text-emerald-300">
                    Epley 1RM Formula
                  </div>
                  <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300 mt-1">
                    {orm.epley1RM} {unit}
                  </div>
                </div>
                <div className="p-3.5 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/70 rounded-lg">
                  <div className="text-xs text-blue-800 dark:text-blue-300">
                    Brzycki 1RM Formula
                  </div>
                  <div className="text-xl font-bold font-mono tabular-nums text-blue-700 dark:text-blue-300 mt-1">
                    {orm.brzycki1RM} {unit}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Training Percentage Load Table (95% – 60%)
            </h3>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden text-xs font-mono tabular-nums">
              {orm.percentageTable.map((row) => (
                <div key={row.pct} className="px-3.5 py-2 flex items-center justify-between">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {row.pct}% of 1RM ({row.estReps})
                  </span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {row.weight} {unit}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ),
    };
  };

  const { ui, summaryToCopy } = renderToolContent();

  // Everyday Quick Preset Chips for active tool
  const quickPresetButtons = useMemo(() => {
    const id = activeTool.id;
    if (id === 'extra-7-discount-tax') {
      return [
        { label: '5% Tax', patch: { taxPct: 5 } },
        { label: '8.5% Sales Tax', patch: { taxPct: 8.5 } },
        { label: '18% GST', patch: { taxPct: 18 } },
        { label: '10% Discount', patch: { discountType: 'percent', discountValue: 10 } },
        { label: '25% Discount', patch: { discountType: 'percent', discountValue: 25 } },
        { label: '50% Discount', patch: { discountType: 'percent', discountValue: 50 } },
      ];
    }
    if (id === 'extra-8-tip-split') {
      return [
        { label: '10% Tip', patch: { tipPct: 10 } },
        { label: '15% Tip', patch: { tipPct: 15 } },
        { label: '18% Tip', patch: { tipPct: 18 } },
        { label: '20% Tip', patch: { tipPct: 20 } },
        { label: 'Split 2 Ways', patch: { people: 2 } },
        { label: 'Split 4 Ways', patch: { people: 4 } },
      ];
    }
    if (id === 'extra-12-base-ratio') {
      return [
        { label: '1920×1080 (16:9 FHD)', patch: { ratioA: 1920, ratioB: 1080 } },
        { label: '3840×2160 (4K UHD)', patch: { ratioA: 3840, ratioB: 2160 } },
        { label: '1080×1350 (4:5 Social)', patch: { ratioA: 1080, ratioB: 1350 } },
        { label: '1080×1920 (9:16 Story)', patch: { ratioA: 1080, ratioB: 1920 } },
      ];
    }
    if (id === 'extra-33-loan-emi') {
      return [
        { label: '30Y Home Mortgage ($400k @ 6.5%)', patch: { principalAmount: 400000, annualRatePercent: 6.5, tenureYears: 30, extraMonthlyPayment: 0 } },
        { label: '15Y Refinance ($300k @ 5.75%)', patch: { principalAmount: 300000, annualRatePercent: 5.75, tenureYears: 15, extraMonthlyPayment: 250 } },
        { label: '5Y Auto Loan ($35k @ 7.2%)', patch: { principalAmount: 35000, annualRatePercent: 7.2, tenureYears: 5, extraMonthlyPayment: 0 } },
      ];
    }
    if (id === 'extra-34-roi-margin') {
      return [
        { label: 'SaaS Product ($15 cost / $79 price)', patch: { unitCost: 15, sellingPrice: 79, unitsSold: 400, fixedOverheadCost: 8500 } },
        { label: 'Retail E-Commerce ($28 cost / $65 price)', patch: { unitCost: 28, sellingPrice: 65, unitsSold: 1000, fixedOverheadCost: 15000 } },
      ];
    }
    if (id === 'extra-35-ohms-law') {
      return [
        { label: '12V Automotive (12V, 5A)', patch: { solveMode: 'from-v-i', inputA: 12, inputB: 5 } },
        { label: 'USB-C PD 100W (100W, 20V)', patch: { solveMode: 'from-p-v', inputA: 100, inputB: 20 } },
        { label: '230V Mains Heater (230V, 23Ω)', patch: { solveMode: 'from-v-r', inputA: 230, inputB: 23 } },
      ];
    }
    if (id === 'extra-36-statistics-calc') {
      return [
        { label: 'Exam Scores Sample', patch: { datasetText: '68, 74, 79, 82, 85, 85, 88, 91, 94, 98' } },
        { label: 'Server Latency (ms)', patch: { datasetText: '11.4, 12.1, 12.8, 13.2, 14.0, 15.6, 18.9, 24.5' } },
      ];
    }
    if (id === 'extra-37-typography-css') {
      return [
        { label: '16px Body (1rem)', patch: { value: 16, fromUnit: 'px', baseFontPx: 16 } },
        { label: '24px Heading (1.5rem)', patch: { value: 24, fromUnit: 'px', baseFontPx: 16 } },
        { label: '12pt Print @ 300 DPI', patch: { value: 12, fromUnit: 'pt', dpi: 300 } },
      ];
    }
    if (id === 'extra-38-bandwidth-transfer') {
      return [
        { label: '50 GB Game @ 500 Mbps Fiber', patch: { fileSize: 50, fileSizeUnit: 'GB', bandwidthSpeed: 500, bandwidthUnit: 'Mbps' } },
        { label: '1 TB Backup @ 1 Gbps Link', patch: { fileSize: 1, fileSizeUnit: 'TB', bandwidthSpeed: 1, bandwidthUnit: 'Gbps' } },
      ];
    }
    if (id === 'extra-39-binary-hex-octal') {
      return [
        { label: 'Text → 8-bit Binary', patch: { mode: 'text-to-code', format: 'binary', delimiter: 'space' } },
        { label: 'Text → Hex Bytes', patch: { mode: 'text-to-code', format: 'hex', delimiter: 'space' } },
        { label: 'Decode Binary Stream', patch: { mode: 'auto-detect', input: '01000110 01101111 01110010 01101101 01100001' } },
      ];
    }
    if (id === 'extra-40-morse-code') {
      return [
        { label: 'SOS Distress (... --- ...)', patch: { mode: 'text-to-morse', input: 'SOS' } },
        { label: 'Decode Morse Sample', patch: { mode: 'morse-to-text', input: '... --- ... / ..-. --- .-. -- .-' } },
      ];
    }
    if (id === 'extra-41-cipher-studio') {
      return [
        { label: 'Caesar +3 Classic', patch: { cipher: 'caesar', mode: 'encode', shift: 3 } },
        { label: 'ROT13 Toggle', patch: { cipher: 'rot13', mode: 'encode' } },
        { label: 'Brute-Force All 25 Shifts', patch: { cipher: 'caesar', mode: 'decode', showAll25Shifts: true } },
      ];
    }
    if (UNIT_CONVERTER_CONFIGS[id]) {
      return [
        { label: 'Value: 1', patch: { value: 1 } },
        { label: 'Value: 10', patch: { value: 10 } },
        { label: 'Value: 100', patch: { value: 100 } },
        { label: 'Value: 1,000', patch: { value: 1000 } },
      ];
    }
    return [];
  }, [activeTool.id]);

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-5 min-w-0">
      {/* Tool Header with Reset, Save to History, Export & Copy Result Actions (Zero File Upload Dropzone) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="min-w-0">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
            CALCULATOR AND CONVERTER STUDIO · #{String(activeTool.number).padStart(2, '0')} · {activeTool.categoryName} ·{' '}
            {activeTool.engineLabel}
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
            {activeTool.number}. {activeTool.name}
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            {activeTool.shortDesc}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleResetTool}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
          {onSaveCalcHistoryEntry && (
            <button
              type="button"
              onClick={() =>
                onSaveCalcHistoryEntry(activeTool.name, summaryToCopy, { ...toolState })
              }
              className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-500" />
              <span>Save Result</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => handleExportSummaryTxt(summaryToCopy)}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <span>Export .TXT</span>
          </button>
          <button
            type="button"
            onClick={() => handleCopyText(summaryToCopy)}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            {copiedFlag ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedFlag ? 'Copied!' : 'Copy Result'}</span>
          </button>
        </div>
      </div>

      {/* Everyday Quick Preset Chips Bar */}
      {quickPresetButtons.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mr-1">
            Quick Presets:
          </span>
          {quickPresetButtons.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => updateState(preset.patch)}
              className="px-2.5 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-700 dark:text-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}

      {/* Interactive Calculator / Graph / Converter Stage */}
      {ui}

      {/* Per-Tool Recent Calculations / Conversions History (User-Scoped, Clearable & CSV Exportable) */}
      {calcHistoryForTool.length > 0 && (
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-emerald-500" />
              <span>Recent Saved Calculations ({calcHistoryForTool.length})</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  const csvHeader = 'Timestamp,Tool_ID,Tool_Name,Result';
                  const csvRows = calcHistoryForTool.map(
                    (e) =>
                      `"${e.timestamp}","${e.toolId}","${e.toolName.replace(/"/g, '""')}","${e.resultValue.replace(/"/g, '""')}"`
                  );
                  const blob = new Blob([[csvHeader, ...csvRows].join('\n')], {
                    type: 'text/csv;charset=utf-8',
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${activeTool.id}_calculation_history.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                Export CSV
              </button>
              {onClearCalcHistoryForTool && (
                <button
                  type="button"
                  onClick={onClearCalcHistoryForTool}
                  className="text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear History</span>
                </button>
              )}
            </div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            {calcHistoryForTool.map((entry) => (
              <div
                key={entry.id}
                className="px-3.5 py-2.5 bg-slate-50/50 dark:bg-slate-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-mono text-[11px] text-slate-400 tabular-nums">
                    {entry.timestamp}
                  </div>
                  <div className="font-mono text-slate-800 dark:text-slate-200 break-words">
                    {entry.resultValue}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => updateState(entry.stateSnapshot)}
                    className="px-2.5 py-1 text-[11px] font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 rounded-md"
                  >
                    Restore Inputs
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyText(entry.resultValue)}
                    className="p-1.5 text-slate-400 hover:text-emerald-500 rounded-md"
                    title="Copy saved result"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
