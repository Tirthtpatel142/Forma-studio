import React, { useState, useEffect, useRef } from 'react';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import {
  FileText,
  Image as ImageIcon,
  Layers,
  Activity,
  Search,
  Upload,
  Download,
  Play,
  Sun,
  Moon,
  Sparkles,
  CheckCircle2,
  ArrowUpRight,
  FolderOpen,
  Sliders,
  Grid,
  Eye,
  Trash2,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  X,
  Menu,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ExternalLink,
  Shield,
  Send,
  Calculator,
  Star,
  LogOut,
  Keyboard,
  Archive,
  BookmarkCheck,
  Copy,
  Bell,
  BellOff,
} from 'lucide-react';
import {
  PDF_CATEGORIES,
  IMAGE_CATEGORIES,
  EXTRA_CATEGORIES,
  PDF_TOOLS,
  IMAGE_TOOLS,
  EXTRA_TOOLS,
  ALL_312_FILTER_PRESETS,
  ENCRYPTION_104_PROFILES,
  StudioTool,
  isMultiFileToolId,
} from './data/toolsCatalog';
import {
  executePdfStudioTool,
  extractTextFromPdfBytes,
  extractPagesTextFromPdfBytes,
  extractTextFromAnyFile,
  PdfExecutionResult,
  PdfVisualSheetMeta,
  buildPdfVisualMeta,
  InputFilePayload,
} from './utils/pdfEngine';
import {
  executeImageStudioTool,
  ImageExecutionResult,
  AdditionalImageInput,
} from './utils/imageWorkerEngine';
import { CommandSearchModal } from './components/CommandSearchModal';
import { ExtraToolsWorkbench } from './components/ExtraToolsWorkbench';
import { ImageDataArtCodesWorkbench } from './components/ImageDataArtCodesWorkbench';
import {
  PipelinesBuilderView,
  SystemAndLogsView,
  AuditLogEntry,
  ImportedHistoryItem,
  CompletedOutputHistoryItem,
  PipelineStepInstance,
  PipelineInputFile,
} from './components/PipelinesAndSystemView';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthModal } from './components/AuthModal';
import {
  loadUserPreferences,
  saveUserPreferences,
  loadUserWorkspaceSnapshot,
  saveUserWorkspaceSnapshot,
  SavedPipelinePreset,
  CalcHistoryEntry,
} from './utils/userStorage';
import { StudioErrorBoundary } from './components/StudioErrorBoundary';
import {
  getNotificationPermissionState,
  requestCompletionNotificationPermission,
  sendCompletionNotification,
  copyTextToClipboard,
} from './utils/browserCapabilities';

type ActiveSection = 'pdf' | 'image' | 'extra' | 'pipelines' | 'system';

export interface WorkspaceFileItem {
  id: string;
  name: string;
  kind: 'pdf' | 'image';
  sizeBytes: number;
  pdfBytes?: Uint8Array;
  rawBytes?: Uint8Array;
  text?: string;
  imageDataUrl?: string;
  canRenderAsImg?: boolean;
  pageCount?: number;
  dimensions?: string;
}

interface PdfPageVisualInfo {
  pageNumber: number;
  width: number;
  height: number;
  rotationDeg: number;
  text: string;
}

interface PdfViewerModalState {
  fileName: string;
  bytes: Uint8Array;
  blobUrl: string | null;
  pages: PdfPageVisualInfo[];
  sizeBytes: number;
  visualMeta?: PdfVisualSheetMeta;
}

interface AssetPreviewModalState {
  title: string;
  subtitle: string;
  mimeType: string;
  fileName: string;
  bytes: Uint8Array;
  imageDataUrl?: string;
  previewText?: string;
}

const DIRECT_INPUT_PDF_TOOL_IDS = new Set([
  'pdf-27-html-to-pdf',
  'pdf-28-url-to-pdf',
  'pdf-29-markdown-to-pdf',
  'pdf-30-text-to-pdf',
  'pdf-66-invoice-generator',
]);

const STANDALONE_IMAGE_TOOL_IDS = new Set([
  'img-37-qr-generator',
  'img-41-gradient-maker',
]);

export const BEFORE_AFTER_COMPARE_TOOL_IDS = new Set([
  // Smart AI Enhancement & Restoration (#20–#27)
  'img-20-ai-bg-remove',
  'img-21-manual-bg-eraser',
  'img-22-spot-heal',
  'img-23-upscaler',
  'img-24-denoise',
  'img-25-colorizer',
  'img-26-docshadow',
  'img-27-dehaze',
  // Dedicated Compare Tool (#42)
  'img-42-compare-slider',
  // Filters & Effects (#45–#49, #52)
  'img-45-blur-tools',
  'img-46-pixelation',
  'img-47-artistic',
  'img-48-color-correction',
  'img-49-glitch-distortion',
  'img-52-duotone-studio',
]);

const TOTAL_TOOLS_COUNT = PDF_TOOLS.length + IMAGE_TOOLS.length + EXTRA_TOOLS.length;

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const parts = dataUrl.split(',');
  if (parts.length < 2) return new Uint8Array();
  const base64 = parts[1] || '';
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function probeImageDimensions(
  dataUrl: string,
  fileName: string
): Promise<{ dimensions: string; canRenderAsImg: boolean }> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.enc')) {
    return { dimensions: 'Encrypted Container (.enc)', canRenderAsImg: false };
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve({
          dimensions: `${img.naturalWidth} × ${img.naturalHeight} px`,
          canRenderAsImg: true,
        });
      } else {
        resolve({ dimensions: 'Raster Image File', canRenderAsImg: false });
      }
    };
    img.onerror = () => {
      const extLabel = lower.split('.').pop()?.toUpperCase() || 'RAW';
      resolve({
        dimensions: `${extLabel} Raster Container`,
        canRenderAsImg: false,
      });
    };
    img.src = dataUrl;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

function buildDefaultParams(tool: StudioTool): Record<string, any> {
  const defaults: Record<string, any> = {};
  tool.params.forEach((p) => {
    defaults[p.key] = p.defaultValue;
  });
  return defaults;
}

export default function App() {
  return (
    <AuthProvider>
      <FormaStudioWorkspace />
    </AuthProvider>
  );
}

function FormaStudioWorkspace() {
  const { user, loading: authLoading, logout } = useAuth();
  const [activeSection, setActiveSection] = useState<ActiveSection>('pdf');
  const [viewMode, setViewMode] = useState<'workbench' | 'directory'>('workbench');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [sidebarQuery, setSidebarQuery] = useState<string>('');
  const [activeTool, setActiveTool] = useState<StudioTool>(PDF_TOOLS[0]);
  const [paramsByToolId, setParamsByToolId] = useState<Record<string, Record<string, any>>>(() => ({
    [PDF_TOOLS[0].id]: buildDefaultParams(PDF_TOOLS[0]),
  }));
  const [isDark, setIsDark] = useState<boolean>(true);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [isMobileToolDrawerOpen, setIsMobileToolDrawerOpen] = useState<boolean>(false);

  // Per-User Persisted Preferences (Strictly Scoped to user.uid)
  const [pinnedToolIds, setPinnedToolIds] = useState<string[]>([]);
  const [customPipelinePresets, setCustomPipelinePresets] = useState<SavedPipelinePreset[]>([]);
  const [savedToolParamPresets, setSavedToolParamPresets] = useState<
    Record<string, Record<string, any>>
  >({});
  const [calcHistoryByToolId, setCalcHistoryByToolId] = useState<
    Record<string, CalcHistoryEntry[]>
  >({});
  const [recentToolIds, setRecentToolIds] = useState<string[]>([]);
  const [completionAlertsEnabled, setCompletionAlertsEnabled] = useState<boolean>(false);
  const [hydratedUid, setHydratedUid] = useState<string | null>(null);

  // Per-Tool Isolated File, Queue & Result State (Zero Global Leakage, Zero Pre-loaded Samples)
  const [filesByToolId, setFilesByToolId] = useState<Record<string, WorkspaceFileItem[]>>({});
  const [selectedIdsByToolId, setSelectedIdsByToolId] = useState<Record<string, string[]>>({});
  const [activeFileIdByToolId, setActiveFileIdByToolId] = useState<Record<string, string | null>>({});
  const [resultByToolId, setResultByToolId] = useState<
    Record<string, { pdf?: PdfExecutionResult; image?: ImageExecutionResult }>
  >({});
  const [zipEntriesByToolId, setZipEntriesByToolId] = useState<
    Record<string, { name: string; sizeBytes: number; bytes: Uint8Array }[]>
  >({});

  // Dedicated Stamp Image store for PDF Tool #42 (Add Image / Logo to PDF)
  const [stampImages, setStampImages] = useState<WorkspaceFileItem[]>([]);
  const [selectedStampImageId, setSelectedStampImageId] = useState<string>('');

  // Explicit Output Handoff Target Selector
  const [handoffTargetToolId, setHandoffTargetToolId] = useState<string>('current');

  // Dedicated Pipelines (#57) Input Files & Result State
  const [pipelineFiles, setPipelineFiles] = useState<PipelineInputFile[]>([]);
  const [pipelineSummary, setPipelineSummary] = useState<string | null>(null);
  const [pipelineLastResult, setPipelineLastResult] = useState<CompletedOutputHistoryItem | null>(null);

  // Session History (Starts 100% Empty — Strictly User Imports & Completed Outputs)
  const [importedHistory, setImportedHistory] = useState<ImportedHistoryItem[]>([]);
  const [completedOutputs, setCompletedOutputs] = useState<CompletedOutputHistoryItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  // Execution, Preview, Compare & Modal States
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [workerProgress, setWorkerProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [compareSplit, setCompareSplit] = useState<number>(50);
  const [showCompareCurtain, setShowCompareCurtain] = useState<boolean>(false);
  const [imageStageZoom, setImageStageZoom] = useState<'fit' | 100 | 200>('fit');
  const [isDragOverUpload, setIsDragOverUpload] = useState<boolean>(false);
  const [showDirectoryPinnedOnly, setShowDirectoryPinnedOnly] = useState<boolean>(false);
  const [directorySearchQuery, setDirectorySearchQuery] = useState<string>('');
  const [isUserMenuOpen, setIsUserMenuOpen] = useState<boolean>(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false);
  const [toasts, setToasts] = useState<
    { id: string; message: string; tone: 'success' | 'info' | 'warning' }[]
  >([]);

  // Full-Screen In-App PDF Viewer Modal State
  const [pdfViewerModal, setPdfViewerModal] = useState<PdfViewerModalState | null>(null);
  const [pdfModalZoom, setPdfModalZoom] = useState<number>(100);
  const [pdfModalTab, setPdfModalTab] = useState<'sheets' | 'native'>('sheets');
  const [pdfJumpPageInput, setPdfJumpPageInput] = useState<string>('1');

  // Non-PDF Asset Preview Modal (for History / Pipeline Images, Text, XML, CSV, ZIP)
  const [assetPreviewModal, setAssetPreviewModal] = useState<AssetPreviewModalState | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stampInputRef = useRef<HTMLInputElement>(null);
  const outputBannerRef = useRef<HTMLDivElement>(null);
  const hydratedUidRef = useRef<string | null>(null);
  const [hydratedPrefsUid, setHydratedPrefsUid] = useState<string | null>(null);

  const pushToast = (message: string, tone: 'success' | 'info' | 'warning' = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  const handleToggleCompletionAlerts = async () => {
    const next = !completionAlertsEnabled;
    if (next) {
      const perm = await requestCompletionNotificationPermission();
      setCompletionAlertsEnabled(true);
      if (perm === 'granted') {
        pushToast(
          'Completion Alerts enabled — you will be notified when PDF, Image, or Pipeline jobs finish.',
          'success'
        );
      } else if (perm === 'denied') {
        pushToast(
          'Completion Alerts enabled (in-app mode; browser notifications are blocked in site settings).',
          'info'
        );
      } else {
        pushToast('Completion Alerts enabled for PDF, Image & Pipeline jobs.', 'success');
      }
    } else {
      setCompletionAlertsEnabled(false);
      pushToast('Completion Alerts turned off.', 'info');
    }
  };

  const wipeAllInMemoryWorkspaceState = () => {
    setFilesByToolId({});
    setSelectedIdsByToolId({});
    setActiveFileIdByToolId({});
    setResultByToolId({});
    setZipEntriesByToolId({});
    setStampImages([]);
    setSelectedStampImageId('');
    setPipelineFiles([]);
    setPipelineSummary(null);
    setPipelineLastResult(null);
    setImportedHistory([]);
    setCompletedOutputs([]);
    setAuditLogs([]);
    setPinnedToolIds([]);
    setRecentToolIds([]);
    setCustomPipelinePresets([]);
    setSavedToolParamPresets({});
    setCalcHistoryByToolId({});
    setCompletionAlertsEnabled(false);
    setPdfViewerModal(null);
    setAssetPreviewModal(null);
    setErrorMessage(null);
    setIsUserMenuOpen(false);
    setShowCompareCurtain(false);
    setParamsByToolId({
      [PDF_TOOLS[0].id]: buildDefaultParams(PDF_TOOLS[0]),
    });
  };

  // Hydrate strictly per user.uid on sign-in, or wipe on sign-out
  useEffect(() => {
    let cancelled = false;
    if (!user?.uid) {
      hydratedUidRef.current = null;
      setHydratedPrefsUid(null);
      setHydratedUid(null);
      wipeAllInMemoryWorkspaceState();
      return;
    }

    const uid = user.uid;
    hydratedUidRef.current = null;
    setHydratedPrefsUid(null);
    setHydratedUid(null);
    // Start from a clean slate before hydrating this user's own profile
    wipeAllInMemoryWorkspaceState();

    const prefs = loadUserPreferences(uid);
    setPinnedToolIds(prefs.pinnedToolIds || []);
    setRecentToolIds(prefs.recentToolIds || []);
    setCustomPipelinePresets(prefs.customPipelinePresets || []);
    setSavedToolParamPresets(prefs.savedToolParamPresets || {});
    setCalcHistoryByToolId(prefs.calcHistoryByToolId || {});
    setCompletionAlertsEnabled(Boolean(prefs.completionAlertsEnabled));
    if (prefs.savedToolParamPresets && Object.keys(prefs.savedToolParamPresets).length > 0) {
      setParamsByToolId((prev) => ({
        ...prev,
        ...prefs.savedToolParamPresets,
      }));
    }
    hydratedUidRef.current = uid;
    setHydratedPrefsUid(uid);

    loadUserWorkspaceSnapshot(uid)
      .then((snap) => {
        if (cancelled) return;
        if (snap) {
          setFilesByToolId(snap.filesByToolId || {});
          setSelectedIdsByToolId(snap.selectedIdsByToolId || {});
          setActiveFileIdByToolId(snap.activeFileIdByToolId || {});
          setResultByToolId(snap.resultByToolId || {});
          setStampImages(snap.stampImages || []);
          setSelectedStampImageId(snap.selectedStampImageId || '');
          setImportedHistory(snap.importedHistory || []);
          setCompletedOutputs(snap.completedOutputs || []);
          setAuditLogs(snap.auditLogs || []);
          setPipelineFiles(snap.pipelineFiles || []);
          setPipelineSummary(snap.pipelineSummary || null);
          setPipelineLastResult(snap.pipelineLastResult || null);
        }
        setHydratedUid(uid);
      })
      .catch(() => {
        if (!cancelled) setHydratedUid(uid);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  // Persist user preferences strictly under user.uid
  useEffect(() => {
    if (!user?.uid || hydratedPrefsUid !== user.uid || hydratedUidRef.current !== user.uid) return;
    saveUserPreferences(user.uid, {
      pinnedToolIds,
      recentToolIds,
      customPipelinePresets,
      savedToolParamPresets,
      calcHistoryByToolId,
      completionAlertsEnabled,
    });
  }, [
    user?.uid,
    hydratedPrefsUid,
    pinnedToolIds,
    recentToolIds,
    customPipelinePresets,
    savedToolParamPresets,
    calcHistoryByToolId,
    completionAlertsEnabled,
  ]);

  // Persist user workspace snapshot strictly under user.uid (debounced by 350ms to avoid main-thread stalls)
  useEffect(() => {
    if (!user?.uid || hydratedUid !== user.uid || hydratedUidRef.current !== user.uid) return;
    const uid = user.uid;
    const timer = window.setTimeout(() => {
      if (hydratedUidRef.current !== uid) return;
      saveUserWorkspaceSnapshot(uid, {
        filesByToolId,
        selectedIdsByToolId,
        activeFileIdByToolId,
        resultByToolId,
        stampImages,
        selectedStampImageId,
        importedHistory,
        completedOutputs,
        auditLogs,
        pipelineFiles,
        pipelineSummary,
        pipelineLastResult,
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [
    user?.uid,
    hydratedUid,
    filesByToolId,
    selectedIdsByToolId,
    activeFileIdByToolId,
    resultByToolId,
    stampImages,
    selectedStampImageId,
    importedHistory,
    completedOutputs,
    auditLogs,
    pipelineFiles,
    pipelineSummary,
    pipelineLastResult,
  ]);

  const handleSignOut = async () => {
    hydratedUidRef.current = null;
    setHydratedPrefsUid(null);
    setHydratedUid(null);
    wipeAllInMemoryWorkspaceState();
    await logout();
  };

  const togglePinTool = (toolId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setPinnedToolIds((prev) => {
      const exists = prev.includes(toolId);
      const next = exists ? prev.filter((id) => id !== toolId) : [toolId, ...prev];
      pushToast(exists ? 'Removed tool from Pinned Bar' : 'Pinned tool to quick access', 'info');
      return next;
    });
  };

  // Derived per-tool slices
  const isMultiFileTool = isMultiFileToolId(activeTool.id);
  const toolFiles = filesByToolId[activeTool.id] || [];
  const toolSelectedIds = selectedIdsByToolId[activeTool.id] || [];
  const toolActiveFileId = activeFileIdByToolId[activeTool.id] || null;
  const toolActiveFile =
    toolFiles.find((f) => f.id === toolActiveFileId) || toolFiles[0] || null;
  const toolPdfResult = resultByToolId[activeTool.id]?.pdf || null;
  const toolImageResult = resultByToolId[activeTool.id]?.image || null;
  const toolZipEntries = zipEntriesByToolId[activeTool.id] || [];
  const toolParams =
    paramsByToolId[activeTool.id] ||
    savedToolParamPresets[activeTool.id] ||
    buildDefaultParams(activeTool);

  const updateActiveToolParam = (key: string, value: any) => {
    setParamsByToolId((prev) => ({
      ...prev,
      [activeTool.id]: {
        ...(prev[activeTool.id] ||
          savedToolParamPresets[activeTool.id] ||
          buildDefaultParams(activeTool)),
        [key]: value,
      },
    }));
  };

  // Sync dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDark]);

  // Global Cmd+K / Ctrl+K, Alt+1..5 studio switchers, ? shortcuts modal, and Esc to close modals
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
        return;
      }
      if (e.altKey && !e.metaKey && !e.ctrlKey) {
        if (e.key === '1') {
          e.preventDefault();
          handleStudioSwitch('pdf');
          return;
        }
        if (e.key === '2') {
          e.preventDefault();
          handleStudioSwitch('image');
          return;
        }
        if (e.key === '3') {
          e.preventDefault();
          handleStudioSwitch('extra');
          return;
        }
        if (e.key === '4') {
          e.preventDefault();
          handleStudioSwitch('pipelines');
          return;
        }
        if (e.key === '5') {
          e.preventDefault();
          handleStudioSwitch('system');
          return;
        }
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
        setIsShortcutsOpen(false);
        setIsMobileToolDrawerOpen(false);
        setIsUserMenuOpen(false);
        setPdfViewerModal(null);
        setAssetPreviewModal(null);
        return;
      }
      const target = e.target as HTMLElement | null;
      const isEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (!isEditable && e.key === '?') {
        e.preventDefault();
        setIsShortcutsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Maintain live Blob URL for the PDF preview <iframe /> scoped to the active tool
  useEffect(() => {
    let bytesToPreview: Uint8Array | undefined;
    if (
      activeSection === 'pdf' &&
      toolPdfResult &&
      toolPdfResult.mimeType === 'application/pdf' &&
      toolPdfResult.outputBytes.byteLength > 0
    ) {
      bytesToPreview = toolPdfResult.outputBytes;
    } else if (
      activeSection === 'pdf' &&
      toolActiveFile?.pdfBytes &&
      toolActiveFile.pdfBytes.byteLength > 0
    ) {
      const header = new TextDecoder('latin1').decode(toolActiveFile.pdfBytes.slice(0, 8));
      if (header.startsWith('%PDF-')) {
        bytesToPreview = toolActiveFile.pdfBytes;
      }
    }

    if (!bytesToPreview) {
      setPdfPreviewUrl(null);
      return;
    }

    const blob = new Blob([bytesToPreview as unknown as BlobPart], {
      type: 'application/pdf',
    });
    const url = URL.createObjectURL(blob);
    setPdfPreviewUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [activeSection, activeTool.id, toolActiveFile, toolPdfResult]);

  // Cleanup PDF Modal Blob URL on close/replace
  useEffect(() => {
    return () => {
      if (pdfViewerModal?.blobUrl) {
        URL.revokeObjectURL(pdfViewerModal.blobUrl);
      }
    };
  }, [pdfViewerModal]);

  const openFullScreenPdfModal = async (
    fileName: string,
    bytes: Uint8Array,
    visualMeta?: PdfVisualSheetMeta
  ) => {
    const pagesText = await extractPagesTextFromPdfBytes(bytes);
    const pagesInfo: PdfPageVisualInfo[] = [];

    try {
      const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = pdfDoc.getPages();
      for (let i = 0; i < pages.length; i++) {
        const size = pages[i].getSize();
        const rot = pages[i].getRotation().angle || 0;
        pagesInfo.push({
          pageNumber: i + 1,
          width: Math.round(size.width),
          height: Math.round(size.height),
          rotationDeg: rot,
          text: pagesText[i] || `[Page ${i + 1}]`,
        });
      }
    } catch {
      pagesText.forEach((txt, idx) => {
        pagesInfo.push({
          pageNumber: idx + 1,
          width: 595,
          height: 842,
          rotationDeg: 0,
          text: txt,
        });
      });
    }

    const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);
    setPdfModalZoom(100);
    setPdfModalTab('sheets');
    setPdfViewerModal({
      fileName,
      bytes,
      blobUrl,
      pages: pagesInfo,
      sizeBytes: bytes.byteLength,
      visualMeta:
        visualMeta ||
        (activeSection === 'pdf'
          ? toolPdfResult?.visualMeta || buildPdfVisualMeta(activeTool.id, toolParams)
          : undefined),
    });
  };

  const renderVisualPdfSheet = (
    p: PdfPageVisualInfo,
    visualMeta: PdfVisualSheetMeta | undefined,
    totalPages: number,
    scale = 1
  ) => {
    const effectiveRot =
      p.rotationDeg || (visualMeta?.rotationDeg ? visualMeta.rotationDeg % 360 : 0);
    const isLandscapeRot = effectiveRot === 90 || effectiveRot === 270;
    const baseW = isLandscapeRot ? Math.max(p.width, p.height) : p.width;
    const displayW = Math.round(Math.min(720, baseW) * scale);
    const sheetBg = visualMeta?.backgroundTint?.color || '#FFFFFF';
    const maxCropPt = visualMeta?.cropMargins
      ? Math.max(
          visualMeta.cropMargins.top,
          visualMeta.cropMargins.right,
          visualMeta.cropMargins.bottom,
          visualMeta.cropMargins.left
        )
      : 0;
    const cropInset = maxCropPt > 0 ? Math.min(48, Math.max(8, Math.round(maxCropPt * 0.45))) : 0;
    const nUpCount = visualMeta?.nUpGrid
      ? visualMeta.nUpGrid.cols * visualMeta.nUpGrid.rows
      : visualMeta?.bookletSpread
      ? 2
      : 0;

    return (
      <div
        key={p.pageNumber}
        id={`pdf-modal-page-${p.pageNumber}`}
        style={{ width: `${displayW}px`, maxWidth: '100%' }}
        className="bg-white text-slate-900 rounded-lg shadow-xl border border-slate-300 overflow-hidden shrink-0 relative"
      >
        <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-600">
          <span>
            Page {p.pageNumber} of {totalPages}
            {visualMeta?.nUpGrid
              ? ` · ${visualMeta.nUpGrid.cols}×${visualMeta.nUpGrid.rows} N-Up Sheet`
              : ''}
            {visualMeta?.bookletSpread ? ' · Booklet Spread (2-Up)' : ''}
            {visualMeta?.trimCutMode ? ` · Split (${visualMeta.trimCutMode})` : ''}
          </span>
          <span>
            {p.width} × {p.height} pt
            {effectiveRot !== 0 ? ` · Rotated ${effectiveRot}°` : ''}
            {maxCropPt > 0 ? ` · Crop ${maxCropPt}pt` : ''}
          </span>
        </div>

        {/* Certification Banner (#37) */}
        {visualMeta?.certification && (
          <div className="px-4 py-1.5 bg-blue-900 text-white text-[11px] font-mono flex items-center justify-between">
            <span>CERTIFIED X.509 PDF · {visualMeta.certification.authority}</span>
            <span className="text-blue-200">
              {visualMeta.certification.locked ? 'LOCKED · PAdES-B-LT' : 'PAdES-B-LT VALID'}
            </span>
          </div>
        )}

        <div
          style={{ backgroundColor: sheetBg }}
          className="p-6 min-h-[260px] relative overflow-hidden flex flex-col justify-between transition-all"
        >
          {/* Crop / Trim Dashed Guides (#7, #12) */}
          {(cropInset > 0 || visualMeta?.trimCutMode) && (
            <div
              style={{
                top: `${cropInset || 14}px`,
                left: `${cropInset || 14}px`,
                right: `${cropInset || 14}px`,
                bottom: `${cropInset || 14}px`,
              }}
              className="absolute border-2 border-dashed border-rose-500/75 pointer-events-none z-10 rounded-xs"
            >
              <span className="absolute -top-2.5 left-2 bg-rose-600 text-white text-[9px] font-mono px-1.5 py-0.2 rounded-xs">
                {visualMeta?.trimCutMode
                  ? `TRIM / SPLIT AXIS (${visualMeta.trimCutMode})`
                  : `CROP / TRIM BOX (-${maxCropPt}pt)`}
              </span>
            </div>
          )}

          {/* Header Running Text (#58) */}
          {visualMeta?.headerFooter?.headerText && (
            <div className="text-[10px] font-mono text-slate-500 border-b border-slate-200/80 pb-1.5 mb-3 flex items-center justify-between z-10">
              <span>{visualMeta.headerFooter.headerText}</span>
              <span>Forma Document Engine</span>
            </div>
          )}

          {/* Diagonal / Tiled Watermark (#34) or Overlay (#54) */}
          {(visualMeta?.watermark || visualMeta?.overlayStyle) && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden z-0">
              <div
                style={{
                  transform: `rotate(${visualMeta?.watermark?.rotation ?? -35}deg)`,
                  opacity: Math.max(
                    0.14,
                    Math.min(0.45, visualMeta?.watermark?.opacity ?? 0.22)
                  ),
                }}
                className="text-2xl sm:text-3xl font-extrabold font-mono tracking-widest text-blue-700 uppercase text-center px-4"
              >
                {visualMeta?.watermark?.text || `LAYER OVERLAY (${visualMeta?.overlayStyle})`}
              </div>
            </div>
          )}

          {/* Main Sheet Content (N-Up / Booklet Grid or Standard Page Body) */}
          <div className="relative z-10 flex-1">
            {nUpCount > 0 ? (
              <div
                className={`grid gap-3 ${
                  visualMeta?.nUpGrid?.cols === 3 ? 'grid-cols-3' : 'grid-cols-2'
                }`}
              >
                {Array.from({ length: nUpCount }).map((_, cellIdx) => (
                  <div
                    key={cellIdx}
                    className="p-3 rounded border border-slate-300 bg-white/90 font-mono text-[10px] leading-relaxed text-slate-700 shadow-2xs"
                  >
                    <div className="text-[9px] font-bold text-blue-600 mb-1">
                      SUB-PAGE FRAME #{cellIdx + 1}
                    </div>
                    <div className="line-clamp-6 whitespace-pre-wrap break-words">{p.text}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={effectiveRot === 180 ? { transform: 'rotate(180deg)' } : undefined}
                className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-slate-800"
              >
                {p.text}
              </div>
            )}

            {/* Vector Highlight / Ink Drawing (#40, #44) */}
            {(visualMeta?.guiCallout || visualMeta?.vectorMarkup) && (
              <div className="mt-4 p-2.5 bg-amber-200/70 border-l-4 border-amber-500 rounded-r text-[11px] font-mono text-slate-900">
                <span className="font-bold uppercase text-amber-900 mr-1.5">
                  [Vector Markup / Callout]:
                </span>
                {visualMeta?.guiCallout?.text ||
                  `${visualMeta?.vectorMarkup?.mode} (${visualMeta?.vectorMarkup?.strokeColor}, ${visualMeta?.vectorMarkup?.strokeWidth}pt)`}
              </div>
            )}

            {/* Redaction Blackout Bars (#38) */}
            {visualMeta?.redactionActive && (
              <div className="mt-3 p-2.5 bg-slate-950 text-white rounded flex items-center justify-between text-[11px] font-mono">
                <span className="tracking-widest">██████████ REDACTED PII / TOKENS ██████████</span>
                <span className="text-[10px] text-rose-400">SANITIZED</span>
              </div>
            )}

            {/* Sticky Note Annotation (#45) */}
            {visualMeta?.stickyAnnotation && (
              <div className="mt-3 p-3 bg-yellow-100 border border-yellow-400 rounded-lg shadow-sm text-[11px] font-mono text-slate-800">
                <div className="font-bold text-yellow-900 mb-0.5">
                  Sticky Note Annotation ({visualMeta.stickyAnnotation.author}):
                </div>
                <div>{visualMeta.stickyAnnotation.note}</div>
              </div>
            )}

            {/* Embedded Image / Logo Stamp (#42) */}
            {visualMeta?.stampBadge && (
              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-300 rounded-md text-[11px] font-mono text-indigo-900">
                <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                <span>
                  {visualMeta.stampBadge.label} ({visualMeta.stampBadge.placement} ·{' '}
                  {visualMeta.stampBadge.scalePercent}%)
                </span>
              </div>
            )}

            {/* Visual Digital Signature Seal (#36) */}
            {visualMeta?.signature && (
              <div className="mt-4 ml-auto max-w-xs p-3 bg-emerald-50 border-2 border-emerald-600 rounded-lg text-[11px] font-mono text-emerald-950 shadow-sm">
                <div className="font-bold text-emerald-800 uppercase">
                  Digitally Signed by {visualMeta.signature.signerName}
                </div>
                {visualMeta.signature.reason && (
                  <div className="text-[10px] text-emerald-700 mt-0.5">
                    Reason: {visualMeta.signature.reason}
                  </div>
                )}
                <div className="text-[9px] text-emerald-600 mt-1">
                  SHA-256 Digest Verified · Page {p.pageNumber}
                </div>
              </div>
            )}
          </div>

          {/* Footer / Page Numbers (#41) / Bates Stamp (#43) */}
          {(visualMeta?.headerFooter?.footerText ||
            visualMeta?.pageNumbering ||
            visualMeta?.batesStamp) && (
            <div className="mt-4 pt-2 border-t border-slate-200/90 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-600 z-10">
              <span>{visualMeta?.headerFooter?.footerText || 'Forma Studio PDF Output'}</span>
              <div className="flex items-center gap-3 font-bold text-slate-800">
                {visualMeta?.batesStamp && (
                  <span className="px-1.5 py-0.5 bg-slate-200 rounded text-slate-900">
                    {visualMeta.batesStamp.prefix}
                    {String(
                      (visualMeta.batesStamp.startNumber || 1001) + p.pageNumber - 1
                    ).padStart(visualMeta.batesStamp.digits || 6, '0')}
                  </span>
                )}
                {visualMeta?.pageNumbering && (
                  <span>
                    Page {(visualMeta.pageNumbering.startNumber || 1) + p.pageNumber - 1} of{' '}
                    {totalPages}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const handleSelectTool = (tool: StudioTool) => {
    setActiveTool(tool);
    setParamsByToolId((prev) =>
      prev[tool.id] ? prev : { ...prev, [tool.id]: buildDefaultParams(tool) }
    );
    setErrorMessage(null);
    setShowCompareCurtain(false);
    setHandoffTargetToolId('current');
    setIsSearchOpen(false);
    setIsMobileToolDrawerOpen(false);
    setRecentToolIds((prev) => [tool.id, ...prev.filter((id) => id !== tool.id)].slice(0, 6));

    if (tool.studio === 'extra') {
      setActiveSection('extra');
      setViewMode('workbench');
    } else if (tool.studio === 'pdf' && tool.number === 57) {
      setActiveSection('pipelines');
    } else {
      setActiveSection(tool.studio);
      setViewMode('workbench');
    }

    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleStudioSwitch = (sec: ActiveSection) => {
    setActiveSection(sec);
    setViewMode('workbench');
    setSelectedCategoryId('all');
    setSidebarQuery('');
    setErrorMessage(null);
    setIsMobileToolDrawerOpen(false);
    if (sec === 'pdf' && (activeTool.studio !== 'pdf' || activeTool.number === 57)) {
      const nextTool = PDF_TOOLS[0];
      setActiveTool(nextTool);
      setParamsByToolId((prev) =>
        prev[nextTool.id] ? prev : { ...prev, [nextTool.id]: buildDefaultParams(nextTool) }
      );
    } else if (sec === 'image' && activeTool.studio !== 'image') {
      const nextTool = IMAGE_TOOLS[0];
      setActiveTool(nextTool);
      setParamsByToolId((prev) =>
        prev[nextTool.id] ? prev : { ...prev, [nextTool.id]: buildDefaultParams(nextTool) }
      );
    } else if (sec === 'extra' && activeTool.studio !== 'extra') {
      const nextTool = EXTRA_TOOLS[0];
      setActiveTool(nextTool);
      setParamsByToolId((prev) =>
        prev[nextTool.id] ? prev : { ...prev, [nextTool.id]: buildDefaultParams(nextTool) }
      );
    }
  };

  // Shared File Processor for File Input & Drag-and-Drop (Enforces Single vs. Multi-File Rules)
  const processIncomingFiles = async (rawFiles: File[]) => {
    if (!rawFiles || rawFiles.length === 0) return;

    if (!isMultiFileTool && rawFiles.length > 1) {
      pushToast(
        `Single-file tool: loaded "${rawFiles[0].name}" and ignored ${rawFiles.length - 1} extra file(s).`,
        'info'
      );
    }

    const filesToProcess = isMultiFileTool ? rawFiles : rawFiles.slice(0, 1);
    const targetTool = activeTool;
    const newItems: WorkspaceFileItem[] = [];
    const newImportRecords: ImportedHistoryItem[] = [];
    const nowTime = new Date().toTimeString().slice(0, 8);

    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i];
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const lower = file.name.toLowerCase();

      const isImageStudioUpload = activeSection === 'image';
      const isImageExtOrMime =
        file.type.startsWith('image/') ||
        /\.(png|jpe?g|webp|gif|bmp|svg|tiff?|heif|avif|jxl|ico|enc)$/i.test(lower);

      if (isImageStudioUpload || isImageExtOrMime) {
        const dataUrl = await readFileAsDataUrl(file);
        const { dimensions, canRenderAsImg } = await probeImageDimensions(dataUrl, file.name);
        const id = `file-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
        const item: WorkspaceFileItem = {
          id,
          name: file.name,
          kind: 'image',
          sizeBytes: file.size,
          rawBytes: bytes,
          pdfBytes: bytes,
          imageDataUrl: dataUrl,
          canRenderAsImg,
          dimensions,
        };
        newItems.push(item);
        newImportRecords.push({
          id: `imp-${id}`,
          name: file.name,
          kind: 'image',
          sizeBytes: file.size,
          uploadedAt: nowTime,
          dimensions,
          bytes,
          imageDataUrl: dataUrl,
          sourceToolId: targetTool.id,
          sourceToolName: `${targetTool.studio.toUpperCase()} #${targetTool.number} ${targetTool.name}`,
        });
      } else {
        let actualPageCount = 1;
        let extractedText = '';
        const header = new TextDecoder('latin1').decode(bytes.slice(0, 8));
        if (header.startsWith('%PDF-')) {
          try {
            const loadedDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
            actualPageCount = Math.max(1, loadedDoc.getPageCount());
          } catch {
            actualPageCount = 1;
          }
          extractedText = await extractTextFromPdfBytes(bytes);
        } else {
          extractedText = await extractTextFromAnyFile(file.name, bytes);
          const lineCount = extractedText.split(/\r?\n/).length;
          actualPageCount = Math.max(1, Math.ceil(lineCount / 42));
        }

        const id = `file-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
        const item: WorkspaceFileItem = {
          id,
          name: file.name,
          kind: 'pdf',
          sizeBytes: file.size,
          pdfBytes: bytes,
          rawBytes: bytes,
          text: extractedText,
          pageCount: actualPageCount,
        };
        newItems.push(item);
        newImportRecords.push({
          id: `imp-${id}`,
          name: file.name,
          kind: 'pdf',
          sizeBytes: file.size,
          uploadedAt: nowTime,
          pageCount: actualPageCount,
          bytes,
          text: extractedText,
          sourceToolId: targetTool.id,
          sourceToolName: `${targetTool.studio.toUpperCase()} #${targetTool.number} ${targetTool.name}`,
        });
      }
    }

    setErrorMessage(null);
    setShowCompareCurtain(false);

    if (newItems.length === 0) return;

    // Store strictly scoped to targetTool.id
    if (isMultiFileTool) {
      setFilesByToolId((prev) => ({
        ...prev,
        [targetTool.id]: [...(prev[targetTool.id] || []), ...newItems],
      }));
      setSelectedIdsByToolId((prev) => ({
        ...prev,
        [targetTool.id]: [...(prev[targetTool.id] || []), ...newItems.map((it) => it.id)],
      }));
      setActiveFileIdByToolId((prev) => ({
        ...prev,
        [targetTool.id]: prev[targetTool.id] || newItems[0].id,
      }));
    } else {
      const single = newItems[0];
      setFilesByToolId((prev) => ({
        ...prev,
        [targetTool.id]: [single],
      }));
      setSelectedIdsByToolId((prev) => ({
        ...prev,
        [targetTool.id]: [single.id],
      }));
      setActiveFileIdByToolId((prev) => ({
        ...prev,
        [targetTool.id]: single.id,
      }));
    }

    // Reset previous output for this tool when new input arrives
    setResultByToolId((prev) => {
      const copy = { ...prev };
      delete copy[targetTool.id];
      return copy;
    });
    setZipEntriesByToolId((prev) => {
      const copy = { ...prev };
      delete copy[targetTool.id];
      return copy;
    });

    // Record user upload into Imported Studio Documents history
    setImportedHistory((prev) => [...newImportRecords, ...prev]);
  };

  // Per-Tool Isolated File Upload Handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const rawFiles = Array.from(fileList);
    e.target.value = '';
    await processIncomingFiles(rawFiles);
  };

  // Dedicated Stamp Image upload handler for PDF Tool #42 (Add Image / Logo to PDF)
  const handleStampImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const dataUrl = await readFileAsDataUrl(file);
    const { dimensions, canRenderAsImg } = await probeImageDimensions(dataUrl, file.name);
    const id = `stamp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const stampItem: WorkspaceFileItem = {
      id,
      name: file.name,
      kind: 'image',
      sizeBytes: file.size,
      rawBytes: bytes,
      imageDataUrl: dataUrl,
      canRenderAsImg,
      dimensions,
    };
    e.target.value = '';
    setStampImages((prev) => [stampItem, ...prev]);
    setSelectedStampImageId(stampItem.id);
    setImportedHistory((prev) => [
      {
        id: `imp-${id}`,
        name: file.name,
        kind: 'image',
        sizeBytes: file.size,
        uploadedAt: new Date().toTimeString().slice(0, 8),
        dimensions,
        bytes,
        imageDataUrl: dataUrl,
        sourceToolId: 'pdf-42-add-image',
        sourceToolName: 'PDF #42 Add Image (Stamp Asset)',
      },
      ...prev,
    ]);
  };

  // Multi-File Selection & Reorder Helpers scoped to activeTool.id
  const handleToggleSelectFile = (fileItem: WorkspaceFileItem) => {
    const tid = activeTool.id;
    setActiveFileIdByToolId((prev) => ({ ...prev, [tid]: fileItem.id }));
    setSelectedIdsByToolId((prev) => {
      const cur = prev[tid] || [];
      if (cur.includes(fileItem.id)) {
        return { ...prev, [tid]: cur.filter((id) => id !== fileItem.id) };
      }
      return { ...prev, [tid]: [...cur, fileItem.id] };
    });
  };

  const handleMoveSelectedFile = (fileId: string, direction: 'up' | 'down') => {
    const tid = activeTool.id;
    setFilesByToolId((prev) => {
      const list = prev[tid] || [];
      const idx = list.findIndex((f) => f.id === fileId);
      if (idx === -1) return prev;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= list.length) return prev;
      const copy = [...list];
      const [item] = copy.splice(idx, 1);
      copy.splice(targetIdx, 0, item);
      return { ...prev, [tid]: copy };
    });
    setSelectedIdsByToolId((prev) => {
      const list = prev[tid] || [];
      const idx = list.indexOf(fileId);
      if (idx === -1) return prev;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= list.length) return prev;
      const copy = [...list];
      const [item] = copy.splice(idx, 1);
      copy.splice(targetIdx, 0, item);
      return { ...prev, [tid]: copy };
    });
  };

  const handleRemoveToolFile = (fileId: string) => {
    const tid = activeTool.id;
    setFilesByToolId((prev) => {
      const remaining = (prev[tid] || []).filter((f) => f.id !== fileId);
      setActiveFileIdByToolId((aprev) => ({
        ...aprev,
        [tid]: aprev[tid] === fileId ? remaining[0]?.id || null : aprev[tid],
      }));
      return { ...prev, [tid]: remaining };
    });
    setSelectedIdsByToolId((prev) => ({
      ...prev,
      [tid]: (prev[tid] || []).filter((id) => id !== fileId),
    }));
  };

  const handleClearToolFiles = () => {
    const tid = activeTool.id;
    setFilesByToolId((prev) => ({ ...prev, [tid]: [] }));
    setSelectedIdsByToolId((prev) => ({ ...prev, [tid]: [] }));
    setActiveFileIdByToolId((prev) => ({ ...prev, [tid]: null }));
    setResultByToolId((prev) => {
      const copy = { ...prev };
      delete copy[tid];
      return copy;
    });
  };

  const handleRunActiveTool = async () => {
    const t0 = performance.now();
    const tid = activeTool.id;
    setIsProcessing(true);
    setWorkerProgress(10);
    setErrorMessage(null);

    if (completionAlertsEnabled && getNotificationPermissionState() === 'default') {
      void requestCompletionNotificationPermission();
    }

    try {
      if (activeTool.studio === 'pdf') {
        const orderedSelectedItems: WorkspaceFileItem[] = [];
        for (const id of toolSelectedIds) {
          const found = toolFiles.find((w) => w.id === id);
          if (found) orderedSelectedItems.push(found);
        }
        if (orderedSelectedItems.length === 0 && toolActiveFile) {
          orderedSelectedItems.push(toolActiveFile);
        }

        const isDirectInputTool = DIRECT_INPUT_PDF_TOOL_IDS.has(tid);
        if (!isDirectInputTool && orderedSelectedItems.length === 0) {
          throw new Error(
            `No input file uploaded for "${activeTool.name}". Please upload a file first.`
          );
        }

        const selectedFilesPayload: InputFilePayload[] = orderedSelectedItems.map((item) => ({
          name: item.name,
          bytes: item.pdfBytes || item.rawBytes || new Uint8Array(),
          text: item.text,
        }));

        const effectiveParams: Record<string, any> = { ...toolParams };
        if (tid === 'pdf-42-add-image') {
          const chosenStamp =
            stampImages.find((s) => s.id === selectedStampImageId) || stampImages[0];
          if (chosenStamp?.rawBytes) {
            effectiveParams.stampImageBytes = chosenStamp.rawBytes;
          } else if (chosenStamp?.imageDataUrl) {
            effectiveParams.stampImageBytes = dataUrlToUint8Array(chosenStamp.imageDataUrl);
          }
        }
        if (tid === 'pdf-60-log-viewer') {
          effectiveParams.auditLogs = auditLogs;
        }

        const res = await executePdfStudioTool(tid, selectedFilesPayload, effectiveParams);
        setWorkerProgress(100);
        setResultByToolId((prev) => ({ ...prev, [tid]: { pdf: res } }));

        if (res.fileName.toLowerCase().endsWith('.zip') || res.mimeType.includes('zip')) {
          try {
            const loadedZip = await JSZip.loadAsync(res.outputBytes);
            const entries: { name: string; sizeBytes: number; bytes: Uint8Array }[] = [];
            for (const [entryName, zipObj] of Object.entries(loadedZip.files)) {
              if (!zipObj.dir) {
                const raw = await zipObj.async('uint8array');
                entries.push({ name: entryName, sizeBytes: raw.byteLength, bytes: raw });
              }
            }
            setZipEntriesByToolId((prev) => ({ ...prev, [tid]: entries }));
          } catch {
            setZipEntriesByToolId((prev) => ({ ...prev, [tid]: [] }));
          }
        } else {
          setZipEntriesByToolId((prev) => ({ ...prev, [tid]: [] }));
        }

        const totalInputBytes = selectedFilesPayload.reduce(
          (acc, f) => acc + f.bytes.byteLength,
          0
        );
        const inputNamesLabel =
          selectedFilesPayload.length === 0
            ? 'Direct Studio Text / URL Input'
            : selectedFilesPayload.length > 1
            ? `${selectedFilesPayload[0].name} (+${selectedFilesPayload.length - 1} more)`
            : selectedFilesPayload[0].name;

        const nowTime = new Date().toTimeString().slice(0, 8);
        const elapsed = Math.max(8, Math.round(performance.now() - t0));

        setCompletedOutputs((prev) => [
          {
            id: `out-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            fileName: res.fileName,
            mimeType: res.mimeType,
            outputBytes: res.outputBytes,
            sizeBytes: res.outputBytes.byteLength,
            completedAt: nowTime,
            studio: 'PDF',
            toolNumber: activeTool.number,
            toolName: activeTool.name,
            pageCount: res.pageCount,
            previewText: res.previewText,
            summary: res.summary,
          },
          ...prev,
        ]);

        setAuditLogs((prev) => [
          {
            id: `log-${Date.now()}`,
            timestamp: nowTime,
            studio: 'PDF',
            toolNumber: activeTool.number,
            toolName: activeTool.name,
            inputName: inputNamesLabel,
            inputBytes: totalInputBytes,
            outputName: res.fileName,
            outputBytes: res.outputBytes.byteLength,
            durationMs: elapsed,
            status: 'Completed',
          },
          ...prev,
        ]);

        sendCompletionNotification({
          studio: 'PDF',
          toolName: activeTool.name,
          fileName: res.fileName,
          isMultiFile: selectedFilesPayload.length > 1,
          enabledByUser: completionAlertsEnabled,
        });
        if (completionAlertsEnabled || selectedFilesPayload.length > 1) {
          pushToast(
            `Forma Studio — Ready: Your processed PDF (${res.fileName}) is ready to download.`,
            'success'
          );
        }
      } else {
        // Image Studio Execution
        const isStandalone = STANDALONE_IMAGE_TOOL_IDS.has(tid);
        const orderedImages: WorkspaceFileItem[] = [];
        for (const id of toolSelectedIds) {
          const found = toolFiles.find((w) => w.id === id);
          if (found) orderedImages.push(found);
        }
        if (orderedImages.length === 0 && toolActiveFile) {
          orderedImages.push(toolActiveFile);
        }

        if (!isStandalone && orderedImages.length === 0) {
          throw new Error(
            `No image uploaded for "${activeTool.name}". Please upload an image first.`
          );
        }

        const primaryImage = orderedImages[0];
        const srcDataUrl = primaryImage?.imageDataUrl || '';
        const srcName = primaryImage?.name || 'generated';
        const effectiveParams: Record<string, any> = {
          ...toolParams,
          rawBytes: primaryImage?.rawBytes,
        };
        const additionalImages: AdditionalImageInput[] = orderedImages.slice(1).map((item) => ({
          name: item.name,
          dataUrl: item.imageDataUrl || '',
        }));

        const res = await executeImageStudioTool(
          tid,
          srcDataUrl,
          srcName,
          effectiveParams,
          (pct) => setWorkerProgress(pct),
          additionalImages
        );

        setResultByToolId((prev) => ({ ...prev, [tid]: { image: res } }));
        if (res.fileName.toLowerCase().endsWith('.zip') || res.mimeType.includes('zip')) {
          try {
            const loadedZip = await JSZip.loadAsync(res.outputBytes);
            const entries: { name: string; sizeBytes: number; bytes: Uint8Array }[] = [];
            for (const [entryName, zipObj] of Object.entries(loadedZip.files)) {
              if (!zipObj.dir) {
                const raw = await zipObj.async('uint8array');
                entries.push({ name: entryName, sizeBytes: raw.byteLength, bytes: raw });
              }
            }
            setZipEntriesByToolId((prev) => ({ ...prev, [tid]: entries }));
          } catch {
            setZipEntriesByToolId((prev) => ({ ...prev, [tid]: [] }));
          }
        } else {
          setZipEntriesByToolId((prev) => ({ ...prev, [tid]: [] }));
        }
        const isRenderableVisualOutput =
          res.mimeType.startsWith('image/') &&
          !res.fileName.endsWith('.json') &&
          !res.fileName.endsWith('.enc') &&
          !res.fileName.endsWith('.zip') &&
          !res.fileName.endsWith('.pdf');
        const isCompareSupportedTool = BEFORE_AFTER_COMPARE_TOOL_IDS.has(tid);
        setShowCompareCurtain(
          Boolean(
            isCompareSupportedTool &&
              primaryImage?.canRenderAsImg &&
              isRenderableVisualOutput
          )
        );

        const nowTime = new Date().toTimeString().slice(0, 8);
        const elapsed = Math.max(12, Math.round(performance.now() - t0));
        const inputBytesTotal = orderedImages.reduce((acc, it) => acc + it.sizeBytes, 0);
        const inputNamesLabel =
          orderedImages.length === 0
            ? 'Standalone Parameter Generator'
            : orderedImages.length > 1
            ? `${orderedImages[0].name} (+${orderedImages.length - 1} more)`
            : orderedImages[0].name;

        setCompletedOutputs((prev) => [
          {
            id: `out-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            fileName: res.fileName,
            mimeType: res.mimeType,
            outputBytes: res.outputBytes,
            sizeBytes: res.outputBytes.byteLength,
            completedAt: nowTime,
            studio: 'IMAGE',
            toolNumber: activeTool.number,
            toolName: activeTool.name,
            imageDataUrl: res.mimeType.startsWith('image/') ? res.outputDataUrl : undefined,
            summary: res.summary,
          },
          ...prev,
        ]);

        setAuditLogs((prev) => [
          {
            id: `log-${Date.now()}`,
            timestamp: nowTime,
            studio: 'IMAGE',
            toolNumber: activeTool.number,
            toolName: activeTool.name,
            inputName: inputNamesLabel,
            inputBytes: inputBytesTotal,
            outputName: res.fileName,
            outputBytes: res.outputBytes.byteLength,
            durationMs: elapsed,
            status: 'Completed',
          },
          ...prev,
        ]);

        sendCompletionNotification({
          studio: 'IMAGE',
          toolName: activeTool.name,
          fileName: res.fileName,
          isMultiFile: orderedImages.length > 1,
          enabledByUser: completionAlertsEnabled,
        });
        if (completionAlertsEnabled || orderedImages.length > 1) {
          pushToast(
            `Forma Studio — Ready: Your processed image (${res.fileName}) is ready to download.`,
            'success'
          );
        }
      }

      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setTimeout(() => {
          outputBannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 120);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'An unexpected error occurred while running the tool.');
    } finally {
      setIsProcessing(false);
    }
  };

  const triggerDownloadBytes = (fileName: string, mimeType: string, bytes: Uint8Array) => {
    const blob = new Blob([bytes as unknown as BlobPart], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadOutput = () => {
    if (activeSection === 'pdf' && toolPdfResult) {
      triggerDownloadBytes(
        toolPdfResult.fileName,
        toolPdfResult.mimeType,
        toolPdfResult.outputBytes
      );
    } else if (activeSection === 'image' && toolImageResult) {
      triggerDownloadBytes(
        toolImageResult.fileName,
        toolImageResult.mimeType,
        toolImageResult.outputBytes
      );
    }
  };

  // 1-Click "Use Output as Input" Strictly Scoped to activeTool.id (Zero Cross-Tool Leakage)
  const handleUseOutputInCurrentTool = async () => {
    const tid = activeTool.id;
    if (activeSection === 'pdf' && toolPdfResult && toolPdfResult.mimeType === 'application/pdf') {
      const extractedText = await extractTextFromPdfBytes(toolPdfResult.outputBytes);
      const nextItem: WorkspaceFileItem = {
        id: `chained-${Date.now()}`,
        name: toolPdfResult.fileName,
        kind: 'pdf',
        sizeBytes: toolPdfResult.outputBytes.byteLength,
        pdfBytes: toolPdfResult.outputBytes,
        rawBytes: toolPdfResult.outputBytes,
        text: extractedText,
        pageCount: toolPdfResult.pageCount,
      };
      setFilesByToolId((prev) => ({
        ...prev,
        [tid]: isMultiFileToolId(tid) ? [...(prev[tid] || []), nextItem] : [nextItem],
      }));
      setSelectedIdsByToolId((prev) => ({
        ...prev,
        [tid]: isMultiFileToolId(tid) ? [...(prev[tid] || []), nextItem.id] : [nextItem.id],
      }));
      setActiveFileIdByToolId((prev) => ({ ...prev, [tid]: nextItem.id }));
      setResultByToolId((prev) => {
        const copy = { ...prev };
        delete copy[tid];
        return copy;
      });
      pushToast(`Loaded "${nextItem.name}" as input in #${activeTool.number} ${activeTool.name}`, 'success');
    } else if (activeSection === 'image' && toolImageResult) {
      const canImg =
        toolImageResult.mimeType.startsWith('image/') &&
        toolImageResult.mimeType !== 'image/tiff';
      const nextItem: WorkspaceFileItem = {
        id: `chained-${Date.now()}`,
        name: toolImageResult.fileName,
        kind: 'image',
        sizeBytes: toolImageResult.outputBytes.byteLength,
        rawBytes: toolImageResult.outputBytes,
        imageDataUrl: toolImageResult.outputDataUrl,
        canRenderAsImg: canImg,
        dimensions: `${toolImageResult.width} × ${toolImageResult.height} px`,
      };
      setFilesByToolId((prev) => ({
        ...prev,
        [tid]: isMultiFileToolId(tid) ? [...(prev[tid] || []), nextItem] : [nextItem],
      }));
      setSelectedIdsByToolId((prev) => ({
        ...prev,
        [tid]: isMultiFileToolId(tid) ? [...(prev[tid] || []), nextItem.id] : [nextItem.id],
      }));
      setActiveFileIdByToolId((prev) => ({ ...prev, [tid]: nextItem.id }));
      setResultByToolId((prev) => {
        const copy = { ...prev };
        delete copy[tid];
        return copy;
      });
      pushToast(`Loaded "${nextItem.name}" as input in #${activeTool.number} ${activeTool.name}`, 'success');
    }
  };

  // Explicit Cross-Tool Output Handoff (Zero Passive Sharing)
  const handleSendOutputToTool = async () => {
    const destTool =
      handoffTargetToolId === 'current'
        ? activeTool
        : [...PDF_TOOLS, ...IMAGE_TOOLS].find((t) => t.id === handoffTargetToolId) || activeTool;

    if (activeSection === 'pdf' && toolPdfResult && toolPdfResult.mimeType === 'application/pdf') {
      const extractedText = await extractTextFromPdfBytes(toolPdfResult.outputBytes);
      const nextItem: WorkspaceFileItem = {
        id: `handoff-${Date.now()}`,
        name: toolPdfResult.fileName,
        kind: 'pdf',
        sizeBytes: toolPdfResult.outputBytes.byteLength,
        pdfBytes: toolPdfResult.outputBytes,
        rawBytes: toolPdfResult.outputBytes,
        text: extractedText,
        pageCount: toolPdfResult.pageCount,
      };
      setFilesByToolId((prev) => ({
        ...prev,
        [destTool.id]: isMultiFileToolId(destTool.id)
          ? [...(prev[destTool.id] || []), nextItem]
          : [nextItem],
      }));
      setSelectedIdsByToolId((prev) => ({
        ...prev,
        [destTool.id]: isMultiFileToolId(destTool.id)
          ? [...(prev[destTool.id] || []), nextItem.id]
          : [nextItem.id],
      }));
      setActiveFileIdByToolId((prev) => ({ ...prev, [destTool.id]: nextItem.id }));
      setResultByToolId((prev) => {
        const copy = { ...prev };
        delete copy[destTool.id];
        return copy;
      });
      if (destTool.id !== activeTool.id) {
        handleSelectTool(destTool);
      }
    } else if (activeSection === 'image' && toolImageResult) {
      const canImg =
        toolImageResult.mimeType.startsWith('image/') &&
        toolImageResult.mimeType !== 'image/tiff';
      const nextItem: WorkspaceFileItem = {
        id: `handoff-${Date.now()}`,
        name: toolImageResult.fileName,
        kind: 'image',
        sizeBytes: toolImageResult.outputBytes.byteLength,
        rawBytes: toolImageResult.outputBytes,
        imageDataUrl: toolImageResult.outputDataUrl,
        canRenderAsImg: canImg,
        dimensions: `${toolImageResult.width} × ${toolImageResult.height} px`,
      };
      setFilesByToolId((prev) => ({
        ...prev,
        [destTool.id]: isMultiFileToolId(destTool.id)
          ? [...(prev[destTool.id] || []), nextItem]
          : [nextItem],
      }));
      setSelectedIdsByToolId((prev) => ({
        ...prev,
        [destTool.id]: isMultiFileToolId(destTool.id)
          ? [...(prev[destTool.id] || []), nextItem.id]
          : [nextItem.id],
      }));
      setActiveFileIdByToolId((prev) => ({ ...prev, [destTool.id]: nextItem.id }));
      setResultByToolId((prev) => {
        const copy = { ...prev };
        delete copy[destTool.id];
        return copy;
      });
      if (destTool.id !== activeTool.id) {
        handleSelectTool(destTool);
      }
    }
  };

  // Pipeline Isolated File Upload Handler
  const handleUploadPipelineFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    const added: PipelineInputFile[] = [];
    const imports: ImportedHistoryItem[] = [];
    const nowTime = new Date().toTimeString().slice(0, 8);

    for (let i = 0; i < arr.length; i++) {
      const f = arr[i];
      const buf = await f.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const isImage =
        f.type.startsWith('image/') ||
        /\.(png|jpe?g|webp|gif|bmp|svg|tiff?|heif|avif|jxl|ico|enc)$/i.test(f.name);
      const id = `pipefile-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;

      if (isImage) {
        const dataUrl = await readFileAsDataUrl(f);
        const { dimensions } = await probeImageDimensions(dataUrl, f.name);
        added.push({
          id,
          name: f.name,
          kind: 'image',
          bytes,
          sizeBytes: f.size,
          imageDataUrl: dataUrl,
        });
        imports.push({
          id: `imp-${id}`,
          name: f.name,
          kind: 'image',
          sizeBytes: f.size,
          uploadedAt: nowTime,
          dimensions,
          bytes,
          imageDataUrl: dataUrl,
          sourceToolId: 'pdf-57-pipelines',
          sourceToolName: 'Pipelines (#57 Input)',
        });
      } else {
        let pageCount = 1;
        let text = '';
        const header = new TextDecoder('latin1').decode(bytes.slice(0, 8));
        if (header.startsWith('%PDF-')) {
          try {
            const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
            pageCount = Math.max(1, doc.getPageCount());
          } catch {
            pageCount = 1;
          }
          text = await extractTextFromPdfBytes(bytes);
        } else {
          text = await extractTextFromAnyFile(f.name, bytes);
        }
        added.push({
          id,
          name: f.name,
          kind: 'pdf',
          bytes,
          sizeBytes: f.size,
          pageCount,
          text,
        });
        imports.push({
          id: `imp-${id}`,
          name: f.name,
          kind: 'pdf',
          sizeBytes: f.size,
          uploadedAt: nowTime,
          pageCount,
          bytes,
          text,
          sourceToolId: 'pdf-57-pipelines',
          sourceToolName: 'Pipelines (#57 Input)',
        });
      }
    }

    setErrorMessage(null);
    setPipelineFiles((prev) => [...prev, ...added]);
    setImportedHistory((prev) => [...imports, ...prev]);
  };

  // Customizable Sequential Pipeline Runner
  const handleExecutePipeline = async (steps: PipelineStepInstance[]) => {
    setIsProcessing(true);
    setErrorMessage(null);
    const t0 = performance.now();

    if (completionAlertsEnabled && getNotificationPermissionState() === 'default') {
      void requestCompletionNotificationPermission();
    }

    try {
      if (pipelineFiles.length === 0) {
        throw new Error(
          'Please upload at least one PDF or Image file into the Pipeline Input area before running.'
        );
      }
      if (steps.length === 0) {
        throw new Error('Add at least one step to the pipeline before running.');
      }

      const primary = pipelineFiles[0];
      let currentBytes = primary.bytes;
      let currentName = primary.name;
      let currentMime = primary.kind === 'pdf' ? 'application/pdf' : 'image/png';
      let currentPageCount = primary.pageCount || 1;
      let currentPreviewText = primary.text || '';
      let currentImageDataUrl = primary.imageDataUrl || '';

      for (const stepInst of steps) {
        const { tool, params } = stepInst;
        if (tool.studio === 'pdf') {
          let filesPayload: InputFilePayload[] = [
            { name: currentName, bytes: currentBytes, text: currentPreviewText },
          ];
          if (
            tool.id === 'pdf-1-merge' ||
            tool.id === 'pdf-52-compare' ||
            tool.id === 'pdf-54-overlay'
          ) {
            const second = pipelineFiles[1];
            if (!second && tool.id !== 'pdf-54-overlay') {
              throw new Error(
                `Pipeline step "${tool.name}" requires at least 2 uploaded PDF files in Pipeline Input.`
              );
            }
            if (second) {
              filesPayload.push({
                name: second.name,
                bytes: second.bytes,
                text: second.text,
              });
            }
          }

          const out = await executePdfStudioTool(tool.id, filesPayload, params);
          currentBytes = out.outputBytes;
          currentName = out.fileName;
          currentMime = out.mimeType;
          currentPageCount = out.pageCount;
          currentPreviewText = out.previewText || '';
        } else {
          if (!currentImageDataUrl) {
            throw new Error(
              `Pipeline step "${tool.name}" requires an image input. Please upload an image file into Pipeline Input.`
            );
          }
          const imgOut = await executeImageStudioTool(
            tool.id,
            currentImageDataUrl,
            currentName,
            { ...params, rawBytes: currentBytes },
            (pct) => setWorkerProgress(pct),
            pipelineFiles.slice(1).filter((f) => f.kind === 'image' && f.imageDataUrl).map((f) => ({
              name: f.name,
              dataUrl: f.imageDataUrl!,
            }))
          );
          currentImageDataUrl = imgOut.outputDataUrl;
          currentBytes = imgOut.outputBytes;
          currentName = imgOut.fileName;
          currentMime = imgOut.mimeType;
          currentPageCount = 1;
        }
      }

      const elapsed = Math.max(15, Math.round(performance.now() - t0));
      const nowTime = new Date().toTimeString().slice(0, 8);
      const summary = `Completed ${steps.length}-step custom pipeline (${steps
        .map((s) => s.tool.name)
        .join(' → ')}) in ${elapsed} ms. Output: ${currentName} (${(
        currentBytes.byteLength / 1024
      ).toFixed(1)} KB).`;

      const outputRecord: CompletedOutputHistoryItem = {
        id: `pipe-out-${Date.now()}`,
        fileName: currentName,
        mimeType: currentMime,
        outputBytes: currentBytes,
        sizeBytes: currentBytes.byteLength,
        completedAt: nowTime,
        studio: 'PIPELINE',
        toolNumber: 57,
        toolName: `Pipeline (${steps.length} steps)`,
        pageCount: currentPageCount,
        previewText: currentPreviewText || undefined,
        imageDataUrl: currentMime.startsWith('image/') ? currentImageDataUrl : undefined,
        summary,
      };

      setPipelineSummary(summary);
      setPipelineLastResult(outputRecord);
      setCompletedOutputs((prev) => [outputRecord, ...prev]);
      setAuditLogs((prev) => [
        {
          id: `pipe-${Date.now()}`,
          timestamp: nowTime,
          studio: 'PIPELINE',
          toolNumber: 57,
          toolName: `Pipeline (${steps.length} steps)`,
          inputName: primary.name,
          inputBytes: primary.sizeBytes,
          outputName: currentName,
          outputBytes: currentBytes.byteLength,
          durationMs: elapsed,
          status: 'Completed',
        },
        ...prev,
      ]);

      sendCompletionNotification({
        studio: 'PIPELINE',
        toolName: `Pipeline (${steps.length} steps)`,
        fileName: currentName,
        isMultiFile: pipelineFiles.length > 1,
        enabledByUser: completionAlertsEnabled,
      });
      pushToast(
        `Forma Studio — Ready: Your processed pipeline output (${currentName}) is ready to download.`,
        'success'
      );
    } catch (err: any) {
      setErrorMessage(err?.message || 'Pipeline execution failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Preview Handlers for History & Pipeline Outputs
  const handlePreviewImportedItem = async (item: ImportedHistoryItem) => {
    if (item.kind === 'pdf') {
      const header = new TextDecoder('latin1').decode(item.bytes.slice(0, 8));
      if (header.startsWith('%PDF-')) {
        await openFullScreenPdfModal(item.name, item.bytes);
        return;
      }
      setAssetPreviewModal({
        title: item.name,
        subtitle: `Imported Document (${item.sourceToolName})`,
        mimeType: 'text/plain',
        fileName: item.name,
        bytes: item.bytes,
        previewText: item.text || new TextDecoder('utf-8', { fatal: false }).decode(item.bytes),
      });
    } else {
      setAssetPreviewModal({
        title: item.name,
        subtitle: `Imported Image (${item.dimensions || 'Image Asset'})`,
        mimeType: 'image/png',
        fileName: item.name,
        bytes: item.bytes,
        imageDataUrl: item.imageDataUrl,
      });
    }
  };

  const handlePreviewCompletedItem = async (item: CompletedOutputHistoryItem) => {
    if (item.mimeType === 'application/pdf') {
      await openFullScreenPdfModal(item.fileName, item.outputBytes);
      return;
    }
    const textPreview =
      item.previewText ||
      (item.mimeType.startsWith('text/') ||
      item.mimeType.includes('json') ||
      item.mimeType.includes('xml') ||
      item.mimeType.includes('svg')
        ? new TextDecoder('utf-8', { fatal: false }).decode(item.outputBytes)
        : undefined);
    setAssetPreviewModal({
      title: item.fileName,
      subtitle: `${item.studio} #${item.toolNumber} ${item.toolName} · ${item.summary}`,
      mimeType: item.mimeType,
      fileName: item.fileName,
      bytes: item.outputBytes,
      imageDataUrl: item.imageDataUrl,
      previewText: textPreview,
    });
  };

  const activeStudioCategories =
    activeSection === 'image'
      ? IMAGE_CATEGORIES
      : activeSection === 'extra'
      ? EXTRA_CATEGORIES
      : PDF_CATEGORIES;
  const activeStudioTools =
    activeSection === 'image'
      ? IMAGE_TOOLS
      : activeSection === 'extra'
      ? EXTRA_TOOLS
      : PDF_TOOLS;

  const filteredTools = activeStudioTools.filter((tool) => {
    const matchesCat = selectedCategoryId === 'all' || tool.categoryId === selectedCategoryId;
    const q = sidebarQuery.trim().toLowerCase();
    const matchesQuery =
      !q ||
      tool.name.toLowerCase().includes(q) ||
      tool.shortDesc.toLowerCase().includes(q) ||
      String(tool.number) === q;
    return matchesCat && matchesQuery;
  });

  const isDirectPdfTool =
    activeSection === 'pdf' && DIRECT_INPUT_PDF_TOOL_IDS.has(activeTool.id);
  const isStandaloneImgTool =
    activeSection === 'image' && STANDALONE_IMAGE_TOOL_IDS.has(activeTool.id);

  const allStudioTools = [...PDF_TOOLS, ...IMAGE_TOOLS, ...EXTRA_TOOLS];
  const pinnedToolsList = pinnedToolIds
    .map((id) => allStudioTools.find((t) => t.id === id))
    .filter((t): t is StudioTool => Boolean(t));

  // Render helper for tool list inside both desktop sidebar & mobile drawer
  const renderToolListItems = () => (
    <>
      {pinnedToolsList.length > 0 && !sidebarQuery.trim() && (
        <div className="bg-amber-50/50 dark:bg-amber-950/20 border-b border-amber-200/70 dark:border-amber-900/40 py-1.5">
          <div className="px-3.5 py-1 flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-amber-700 dark:text-amber-400 font-bold">
            <span className="flex items-center gap-1">
              <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
              <span>Pinned Favorites ({pinnedToolsList.length})</span>
            </span>
          </div>
          {pinnedToolsList.map((tool) => {
            const isSelected = activeTool.id === tool.id && viewMode === 'workbench';
            return (
              <div
                key={`pinned-${tool.id}`}
                onClick={() => handleSelectTool(tool)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelectTool(tool);
                  }
                }}
                className={`w-full text-left px-3.5 py-2 transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                  isSelected
                    ? 'bg-amber-100/80 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200'
                    : 'hover:bg-amber-100/40 dark:hover:bg-amber-950/40 text-slate-800 dark:text-slate-200'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-[10px] text-amber-700/80 dark:text-amber-400/80 font-mono tabular-nums truncate">
                    {tool.studio === 'extra' ? 'CALC' : tool.studio.toUpperCase()} #
                    {String(tool.number).padStart(2, '0')}
                  </div>
                  <div className="text-xs font-semibold truncate">{tool.name}</div>
                </div>
                <button
                  type="button"
                  onClick={(e) => togglePinTool(tool.id, e)}
                  aria-label={`Unpin ${tool.name}`}
                  className="p-1 text-amber-500 hover:text-amber-600 rounded shrink-0"
                >
                  <Star className="w-3.5 h-3.5 fill-amber-400" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {filteredTools.map((tool) => {
        const isSelected = activeTool.id === tool.id && viewMode === 'workbench';
        const isPinned = pinnedToolIds.includes(tool.id);
        return (
          <div
            key={tool.id}
            onClick={() => handleSelectTool(tool)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleSelectTool(tool);
              }
            }}
            className={`w-full text-left px-3.5 py-2.5 transition-colors flex items-start justify-between gap-2 cursor-pointer ${
              isSelected
                ? activeSection === 'pdf'
                  ? 'bg-blue-50/90 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                  : activeSection === 'image'
                  ? 'bg-indigo-50/90 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                  : 'bg-emerald-50/90 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-800 dark:text-slate-200'
            }`}
          >
            <div className="min-w-0">
              <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono tabular-nums truncate">
                #{String(tool.number).padStart(2, '0')} · {tool.categoryName}
              </div>
              <div className="text-xs font-semibold truncate mt-0.5">{tool.name}</div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
              <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 uppercase">
                {tool.studio === 'extra' ? 'LIVE' : `.${tool.outputExt}`}
              </span>
              <button
                type="button"
                onClick={(e) => togglePinTool(tool.id, e)}
                aria-label={isPinned ? `Unpin ${tool.name}` : `Pin ${tool.name}`}
                className={`p-1 rounded transition-colors ${
                  isPinned
                    ? 'text-amber-500 hover:text-amber-600'
                    : 'text-slate-300 dark:text-slate-600 hover:text-amber-400'
                }`}
              >
                <Star className={`w-3.5 h-3.5 ${isPinned ? 'fill-amber-400' : ''}`} />
              </button>
            </div>
          </div>
        );
      })}
    </>
  );

  // Mandatory Full-Screen Login Gate when user === null
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100">
        <div className="flex flex-col items-center gap-3">
          <img
            src="./assets/aistudio/1794833140188_119f9ad8.png"
            alt="Forma Studio Logo"
            referrerPolicy="no-referrer"
            className="w-11 h-11 rounded-xl object-cover shadow-md border border-slate-200 dark:border-slate-800"
          />
          <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
            Initializing Forma Studio Security Gate...
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthModal
        mode="fullscreen-gate"
        isDark={isDark}
        onToggleTheme={() => setIsDark((d) => !d)}
        onSuccessToast={(msg) => pushToast(msg, 'success')}
      />
    );
  }

  const userInitial = (user.displayName || user.email || 'U').trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden max-w-full bg-slate-50 dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100">
      {/* Hidden Input Elements */}
      <input
        ref={fileInputRef}
        type="file"
        multiple={isMultiFileTool}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.html,.md,.txt,.csv,.xml,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,.tiff,.tif,.heif,.avif,.jxl,.ico,.enc"
        onChange={handleFileUpload}
        className="hidden"
      />
      <input
        ref={stampInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,.svg"
        onChange={handleStampImageUpload}
        className="hidden"
      />

      {/* Single Unified Top Navigation Bar */}
      <header className="w-full px-3 sm:px-4 lg:px-5 py-2.5 bg-white dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30">
        <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-2">
          {/* Left: Mobile Drawer Trigger + Wordmark */}
          <div className="flex items-center gap-2 shrink-0">
            {(activeSection === 'pdf' ||
              activeSection === 'image' ||
              activeSection === 'extra') && (
              <button
                type="button"
                onClick={() => setIsMobileToolDrawerOpen(true)}
                aria-label="Open tool directory drawer"
                className="lg:hidden p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Menu className="w-4 h-4" />
              </button>
            )}
            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                handleStudioSwitch('pdf');
              }}
              className="flex items-center gap-2 text-base sm:text-lg font-extrabold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 font-display"
            >
              <img
                src="./assets/aistudio/1794833140188_119f9ad8.png"
                alt="Forma Studio Logo"
                referrerPolicy="no-referrer"
                className="w-7 h-7 rounded-lg object-cover shrink-0 border border-slate-200 dark:border-slate-800"
              />
              <span>Forma Studio</span>
            </a>
          </div>

          {/* Center: Unified 5-Tab Studio Switcher Navigation (Compact labels on Mobile/Tablet < 1024px, Full labels on Desktop) */}
          <nav
            aria-label="Primary studio navigation"
            className="order-3 lg:order-2 w-full lg:w-auto flex items-center gap-1 overflow-x-auto lg:overflow-visible py-1 lg:py-0 text-xs font-semibold"
          >
            <button
              type="button"
              onClick={() => handleStudioSwitch('pdf')}
              className={`px-2 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                activeSection === 'pdf'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="lg:hidden">PDF</span>
              <span className="hidden lg:inline">PDF Studio ({PDF_TOOLS.length})</span>
            </button>
            <button
              type="button"
              onClick={() => handleStudioSwitch('image')}
              className={`px-2 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                activeSection === 'image'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span className="lg:hidden">Image</span>
              <span className="hidden lg:inline">Image Studio ({IMAGE_TOOLS.length})</span>
            </button>
            <button
              type="button"
              onClick={() => handleStudioSwitch('extra')}
              className={`px-2 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                activeSection === 'extra'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Calculator className="w-3.5 h-3.5" />
              <span className="lg:hidden">Calc &amp; Convert</span>
              <span className="hidden lg:inline">Calculator and Converter Studio ({EXTRA_TOOLS.length})</span>
            </button>
            <button
              type="button"
              onClick={() => handleStudioSwitch('pipelines')}
              className={`px-2 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                activeSection === 'pipelines'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="lg:hidden">Pipelines</span>
              <span className="hidden lg:inline">Pipelines (#57)</span>
            </button>
            <button
              type="button"
              onClick={() => handleStudioSwitch('system')}
              className={`px-2 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                activeSection === 'system'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span className="lg:hidden">History</span>
              <span className="hidden lg:inline">History &amp; Logs</span>
            </button>
          </nav>

          {/* Right: View Switcher, Theme Toggle, Quick Search & Compact User Profile / Sign Out */}
          <div className="order-2 lg:order-3 flex items-center gap-1.5 shrink-0">
            {(activeSection === 'pdf' ||
              activeSection === 'image' ||
              activeSection === 'extra') && (
              <div className="hidden sm:flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setViewMode('workbench')}
                  className={`px-2 py-1 text-xs font-medium rounded-md flex items-center gap-1 whitespace-nowrap shrink-0 ${
                    viewMode === 'workbench'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Sliders className="w-3 h-3" />
                  <span>Workbench</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('directory')}
                  className={`px-2 py-1 text-xs font-medium rounded-md flex items-center gap-1 whitespace-nowrap shrink-0 ${
                    viewMode === 'directory'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Grid className="w-3 h-3" />
                  <span>All Tools</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleToggleCompletionAlerts}
              aria-label={
                completionAlertsEnabled
                  ? 'Disable completion notifications'
                  : 'Enable Completion Alerts'
              }
              title={
                completionAlertsEnabled
                  ? 'Completion Alerts Active (click to turn off)'
                  : 'Enable Completion Alerts for PDF, Image & Pipeline jobs'
              }
              data-testid="toggle-completion-alerts-button"
              className={`p-1.5 sm:px-2 sm:py-1.5 text-xs font-medium border rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                completionAlertsEnabled
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                  : 'text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
              }`}
            >
              {completionAlertsEnabled ? (
                <Bell className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <BellOff className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              )}
              <span className="hidden 2xl:inline">
                {completionAlertsEnabled ? 'Alerts On' : 'Enable Alerts'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setIsDark((d) => !d)}
              aria-label={isDark ? 'Switch to Daylight Mode' : 'Switch to Precision Dark Mode'}
              className="p-1.5 sm:px-2 sm:py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              {isDark ? (
                <Sun className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-slate-600" />
              )}
              <span className="hidden 2xl:inline">{isDark ? 'Daylight' : 'Dark'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              aria-label="Quick Search (Cmd+K)"
              className="px-2.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Search (Cmd+K)</span>
            </button>

            {/* Compact User Profile Avatar + Sign Out Control (Fits cleanly at 360px+) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsUserMenuOpen((prev) => !prev)}
                aria-label="Open account menu"
                data-testid="user-profile-menu-button"
                className="p-1 sm:px-2 sm:py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 transition-colors shrink-0"
              >
                <span className="w-6 h-6 rounded-md bg-blue-600 text-white font-mono text-xs font-bold flex items-center justify-center shrink-0">
                  {userInitial}
                </span>
                <span className="hidden xl:inline max-w-[96px] 2xl:max-w-[140px] truncate">
                  {user.displayName || user.email}
                </span>
              </button>

              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-3 z-50 space-y-2.5">
                  <div className="pb-2 border-b border-slate-100 dark:border-slate-800">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {user.displayName || 'Authenticated User'}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                      {user.email}
                    </div>
                    <div className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 mt-1 truncate">
                      UID-Scoped Storage Active
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between font-mono">
                    <span>Pinned Tools: {pinnedToolIds.length}</span>
                    <span>Outputs: {completedOutputs.length}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleCompletionAlerts}
                    className={`w-full py-1.5 px-3 font-medium rounded-lg text-xs flex items-center justify-between transition-colors border ${
                      completionAlertsEnabled
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-transparent'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {completionAlertsEnabled ? (
                        <Bell className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <BellOff className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span>Enable Completion Alerts</span>
                    </span>
                    <span className="font-mono text-[10px] font-bold">
                      {completionAlertsEnabled ? 'ON' : 'OFF'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFilesByToolId({});
                      setSelectedIdsByToolId({});
                      setActiveFileIdByToolId({});
                      setResultByToolId({});
                      setZipEntriesByToolId({});
                      setImportedHistory([]);
                      setCompletedOutputs([]);
                      setAuditLogs([]);
                      setPipelineFiles([]);
                      setPipelineSummary(null);
                      setPipelineLastResult(null);
                      setIsUserMenuOpen(false);
                      pushToast('Cleared workspace files and history for your account', 'info');
                    }}
                    className="w-full py-1.5 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                    <span>Clear Workspace History</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    data-testid="header-sign-out-button"
                    className="w-full py-2 px-3 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out &amp; Lock Workspace</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile & Tablet Slide-Over Tool Drawer (< 1024px) */}
      {isMobileToolDrawerOpen &&
        (activeSection === 'pdf' ||
          activeSection === 'image' ||
          activeSection === 'extra') && (
          <div
            className="fixed inset-0 z-40 lg:hidden flex"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile Studio Tool Drawer"
          >
            <div
              className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs"
              onClick={() => setIsMobileToolDrawerOpen(false)}
            />
            <aside className="relative z-10 w-80 max-w-[85vw] h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shadow-2xl">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {activeSection === 'pdf'
                    ? `PDF Studio (${PDF_TOOLS.length} Tools)`
                    : activeSection === 'image'
                    ? `Image Studio (${IMAGE_TOOLS.length} Tools)`
                    : `Calculator and Converter Studio (${EXTRA_TOOLS.length})`}
                </span>
                <button
                  type="button"
                  onClick={() => setIsMobileToolDrawerOpen(false)}
                  aria-label="Close tool drawer"
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={sidebarQuery}
                    onChange={(e) => setSidebarQuery(e.target.value)}
                    placeholder={`Filter ${activeStudioTools.length} tools...`}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400"
                  />
                </div>
                <select
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200"
                >
                  <option value="all">
                    All {activeStudioCategories.length} Categories ({activeStudioTools.length} Tools)
                  </option>
                  {activeStudioCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      0{cat.index}. {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
                {renderToolListItems()}
              </div>
            </aside>
          </div>
        )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 max-w-full">
        {activeSection === 'pipelines' ? (
          <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
            {errorMessage && (
              <div className="mb-4 p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center justify-between gap-3 text-xs text-rose-800 dark:text-rose-200">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMessage(null)}
                  className="p-1 hover:bg-rose-100 dark:hover:bg-rose-900 rounded"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <PipelinesBuilderView
              pipelineFiles={pipelineFiles}
              onUploadPipelineFiles={handleUploadPipelineFiles}
              onRemovePipelineFile={(id) =>
                setPipelineFiles((prev) => prev.filter((f) => f.id !== id))
              }
              onClearPipelineFiles={() => {
                setPipelineFiles([]);
                setPipelineLastResult(null);
                setPipelineSummary(null);
              }}
              onRunPipeline={handleExecutePipeline}
              isRunning={isProcessing}
              lastSummary={pipelineSummary}
              lastResultOutput={pipelineLastResult}
              onOpenOutputPreview={handlePreviewCompletedItem}
              onDownloadOutputItem={(item) =>
                triggerDownloadBytes(item.fileName, item.mimeType, item.outputBytes)
              }
              customPresets={customPipelinePresets}
              onSaveCustomPreset={(name, steps) => {
                const preset: SavedPipelinePreset = {
                  id: `preset-${Date.now()}`,
                  name,
                  createdAt: new Date().toTimeString().slice(0, 8),
                  steps,
                };
                setCustomPipelinePresets((prev) => [preset, ...prev]);
                pushToast(`Saved pipeline preset "${name}"`, 'success');
              }}
              onDeleteCustomPreset={(presetId) => {
                setCustomPipelinePresets((prev) => prev.filter((p) => p.id !== presetId));
                pushToast('Deleted custom pipeline preset', 'info');
              }}
            />
          </div>
        ) : activeSection === 'system' ? (
          <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
            <SystemAndLogsView
              importedFiles={importedHistory}
              completedOutputs={completedOutputs}
              logs={auditLogs}
              onPreviewImported={handlePreviewImportedItem}
              onDownloadImported={(item) =>
                triggerDownloadBytes(
                  item.name,
                  item.kind === 'pdf' ? 'application/pdf' : 'application/octet-stream',
                  item.bytes
                )
              }
              onRemoveImported={(id) =>
                setImportedHistory((prev) => prev.filter((item) => item.id !== id))
              }
              onPreviewCompleted={handlePreviewCompletedItem}
              onDownloadCompleted={(item) =>
                triggerDownloadBytes(item.fileName, item.mimeType, item.outputBytes)
              }
              onRemoveCompleted={(id) =>
                setCompletedOutputs((prev) => prev.filter((item) => item.id !== id))
              }
              onClearHistory={() => {
                setImportedHistory([]);
                setCompletedOutputs([]);
                setAuditLogs([]);
              }}
            />
          </div>
        ) : (
          /* PDF Studio (60 Tools) & Image Studio (49+ Tools) Responsive Layout */
          <div className="flex-1 flex flex-col lg:flex-row min-w-0">
            {/* Desktop Left Pane: Category & Tool Navigator (Hidden on < 1024px, uses Slide-Over Drawer) */}
            <aside
              aria-label="Studio tools sidebar"
              className="hidden lg:flex lg:w-[270px] shrink-0 bg-white dark:bg-slate-900/70 border-r border-slate-200 dark:border-slate-800 flex-col lg:max-h-[calc(100vh-58px)] lg:sticky lg:top-[58px]"
            >
              <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={sidebarQuery}
                    onChange={(e) => setSidebarQuery(e.target.value)}
                    placeholder={`Filter ${activeStudioTools.length} ${
                      activeSection === 'extra'
                        ? 'Calculator & Converter'
                        : activeSection.toUpperCase()
                    } tools...`}
                    aria-label="Filter tools in sidebar"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <select
                  aria-label="Select tool category"
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200"
                >
                  <option value="all">
                    All {activeStudioCategories.length} Categories ({activeStudioTools.length} Tools)
                  </option>
                  {activeStudioCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      0{cat.index}. {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
                {renderToolListItems()}
              </div>
            </aside>

            {/* Center & Right Stage */}
            {viewMode === 'directory' ? (
              <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-6 min-w-0">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Complete Tool Catalog ·{' '}
                      {activeSection === 'pdf'
                        ? `${PDF_TOOLS.length} PDF Studio Tools`
                        : activeSection === 'image'
                        ? `${IMAGE_TOOLS.length} Image Studio Tools & ${ALL_312_FILTER_PRESETS.length} LUT Presets`
                        : `${EXTRA_TOOLS.length} Offline Calculators, 2D Grapher, Unit Converters & Ciphers`}
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                      {activeSection === 'pdf'
                        ? `PDF Studio — Complete ${PDF_TOOLS.length}-Tool Architecture`
                        : activeSection === 'image'
                        ? `Image Studio — Complete ${IMAGE_TOOLS.length}-Tool & ${ALL_312_FILTER_PRESETS.length}-Filter Architecture`
                        : `Calculator and Converter Studio — ${EXTRA_TOOLS.length} Calculators, Graphing, Converters & Ciphers`}
                    </h1>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={directorySearchQuery}
                        onChange={(e) => setDirectorySearchQuery(e.target.value)}
                        placeholder="Search tools in directory..."
                        aria-label="Search tools in directory"
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 w-48 sm:w-56"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowDirectoryPinnedOnly((p) => !p)}
                      className={`px-3 py-2 text-xs font-semibold rounded-lg border flex items-center gap-1.5 transition-colors ${
                        showDirectoryPinnedOnly
                          ? 'bg-amber-500 text-white border-amber-500'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <Star className="w-3.5 h-3.5" />
                      <span>Pinned Only ({pinnedToolIds.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('workbench')}
                      className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      Return to Active Workbench
                    </button>
                  </div>
                </div>

                {/* Category Quick-Jump Pill Bar */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {activeStudioCategories.map((cat) => (
                    <a
                      key={cat.id}
                      href={`#dir-cat-${cat.id}`}
                      className="px-2.5 py-1 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500 rounded-md text-slate-700 dark:text-slate-300 whitespace-nowrap shrink-0"
                    >
                      0{cat.index}. {cat.name}
                    </a>
                  ))}
                </div>

                {activeStudioCategories.map((cat) => {
                  const dq = directorySearchQuery.trim().toLowerCase();
                  const catTools = activeStudioTools.filter(
                    (t) =>
                      t.categoryId === cat.id &&
                      (!showDirectoryPinnedOnly || pinnedToolIds.includes(t.id)) &&
                      (!dq ||
                        t.name.toLowerCase().includes(dq) ||
                        t.shortDesc.toLowerCase().includes(dq) ||
                        String(t.number) === dq)
                  );
                  if (catTools.length === 0) return null;
                  return (
                    <section key={cat.id} id={`dir-cat-${cat.id}`} className="space-y-3">
                      <div className="flex items-baseline justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                          0{cat.index}. {cat.name}
                        </h2>
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                          {catTools.length} tools
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
                        {catTools.map((tool) => {
                          const isPinned = pinnedToolIds.includes(tool.id);
                          return (
                            <div
                              key={tool.id}
                              onClick={() => handleSelectTool(tool)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  handleSelectTool(tool);
                                }
                              }}
                              className="p-4 text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 rounded-xl transition-colors group flex flex-col justify-between cursor-pointer"
                            >
                              <div>
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                                    #{String(tool.number).padStart(2, '0')} · {tool.executionMode}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => togglePinTool(tool.id, e)}
                                    aria-label={isPinned ? `Unpin ${tool.name}` : `Pin ${tool.name}`}
                                    className={`p-1 rounded ${
                                      isPinned
                                        ? 'text-amber-500'
                                        : 'text-slate-300 dark:text-slate-600 hover:text-amber-400'
                                    }`}
                                  >
                                    <Star
                                      className={`w-3.5 h-3.5 ${isPinned ? 'fill-amber-400' : ''}`}
                                    />
                                  </button>
                                </div>
                                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                  {tool.name}
                                </h3>
                                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                                  {tool.shortDesc}
                                </p>
                              </div>
                              <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                                <span>{tool.engineLabel}</span>
                                <ArrowUpRight className="w-3.5 h-3.5 group-hover:text-blue-500" />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : activeSection === 'extra' ? (
              /* Calculator and Converter Studio Workbench (32 Instant Calculators, Graphing & Unit Converters — Zero File Upload Dropzone) */
              <div className="flex-1 flex flex-col min-w-0">
                {/* Mobile Tool Header Switcher Bar (< 1024px) */}
                <div className="lg:hidden px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 truncate">
                      CALC &amp; CONVERTER #{String(activeTool.number).padStart(2, '0')} · {activeTool.categoryName}
                    </div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {activeTool.name}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setViewMode('directory')}
                      className="px-2.5 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
                    >
                      All Tools
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsMobileToolDrawerOpen(true)}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg flex items-center gap-1"
                    >
                      <Menu className="w-3.5 h-3.5" />
                      <span>Tools</span>
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto min-w-0">
                  <StudioErrorBoundary
                    toolName={activeTool.name}
                    onResetTool={handleClearToolFiles}
                  >
                    <ExtraToolsWorkbench
                      activeTool={activeTool}
                      isDark={isDark}
                      calcHistoryForTool={calcHistoryByToolId[activeTool.id] || []}
                      onSaveCalcHistoryEntry={(
                        summaryLabel: string,
                        resultValue: string,
                        stateSnapshot: Record<string, any>
                      ) => {
                        const entry: CalcHistoryEntry = {
                          id: `calc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                          toolId: activeTool.id,
                          toolName: activeTool.name,
                          timestamp: new Date().toTimeString().slice(0, 8),
                          summaryLabel,
                          resultValue,
                          stateSnapshot,
                        };
                        setCalcHistoryByToolId((prev) => ({
                          ...prev,
                          [activeTool.id]: [entry, ...(prev[activeTool.id] || []).slice(0, 19)],
                        }));
                        pushToast('Saved calculation to history', 'success');
                      }}
                      onClearCalcHistoryForTool={() => {
                        setCalcHistoryByToolId((prev) => ({
                          ...prev,
                          [activeTool.id]: [],
                        }));
                        pushToast('Cleared tool calculation history', 'info');
                      }}
                      onNotify={(msg) => pushToast(msg, 'info')}
                    />
                  </StudioErrorBoundary>
                </div>
              </div>
            ) : activeSection === 'image' && activeTool.categoryId === 'img-data-art-codes' ? (
              /* Image Studio Category 07: Data, Art & Codes (#56-#60) Dedicated 2-Column Desktop / 1-Column Mobile Workbench */
              <StudioErrorBoundary toolName={activeTool.name} onResetTool={handleClearToolFiles}>
                <ImageDataArtCodesWorkbench
                  activeTool={activeTool}
                  activeFile={toolActiveFile}
                  onUploadFile={async (file) => {
                    await processIncomingFiles([file]);
                  }}
                  onClearFile={handleClearToolFiles}
                  onOpenDirectory={() => setViewMode('directory')}
                  onOpenMobileDrawer={() => setIsMobileToolDrawerOpen(true)}
                  onRecordCompletedOutput={(item) => {
                    const timestamp = new Date().toTimeString().slice(0, 8);
                    setCompletedOutputs((prev) => [
                      {
                        id: `out-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        toolId: activeTool.id,
                        toolNumber: activeTool.number,
                        toolName: activeTool.name,
                        studio: 'IMAGE',
                        fileName: item.fileName,
                        mimeType: item.mimeType,
                        sizeBytes: item.outputBytes.byteLength,
                        completedAt: timestamp,
                        summary: item.summary,
                        outputBytes: item.outputBytes,
                        imageDataUrl: item.imageDataUrl,
                      },
                      ...prev,
                    ]);
                    sendCompletionNotification({
                      studio: 'IMAGE',
                      toolName: activeTool.name,
                      fileName: item.fileName,
                      enabledByUser: completionAlertsEnabled,
                    });
                  }}
                  onNotify={(msg, tone) => pushToast(msg, tone || 'info')}
                />
              </StudioErrorBoundary>
            ) : (
              /* Workbench: Desktop 2-column grid (Center + Right Inspector), Mobile ordered (Upload -> Params/Run -> Preview/Output) */
              <StudioErrorBoundary toolName={activeTool.name} onResetTool={handleClearToolFiles}>
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_330px] min-w-0">
                {/* Mobile Tool Header Switcher Bar (< 1024px) */}
                <div className="lg:hidden px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                      {activeTool.studio.toUpperCase()} #{String(activeTool.number).padStart(2, '0')} ·{' '}
                      {activeTool.categoryName}
                    </div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {activeTool.name}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setViewMode('directory')}
                      className="px-2.5 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
                    >
                      All Tools
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsMobileToolDrawerOpen(true)}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg flex items-center gap-1"
                    >
                      <Menu className="w-3.5 h-3.5" />
                      <span>Tools</span>
                    </button>
                  </div>
                </div>

                {/* Top Center Block (Desktop Col 1 Row 1, Mobile Order 1): Tool Heading + Error + File Upload Card */}
                <div className="order-1 lg:col-start-1 lg:row-start-1 p-4 sm:p-6 pb-2 sm:pb-3 space-y-4 min-w-0">
                  {/* Breadcrumb & Tool Header */}
                  <div className="hidden lg:flex sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                    <div className="min-w-0">
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
                        {activeTool.studio.toUpperCase()} STUDIO · TOOL #
                        {String(activeTool.number).padStart(2, '0')} · {activeTool.categoryName} ·{' '}
                        {activeTool.executionMode}
                      </div>
                      <h1 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                        {activeTool.number}. {activeTool.name}
                      </h1>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                        {activeTool.shortDesc}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {isDirectPdfTool || isStandaloneImgTool
                          ? 'Standalone Generator'
                          : isMultiFileTool
                          ? 'Multi-File Queue'
                          : 'Single-File Tool'}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        Engine: {activeTool.engineLabel}
                      </span>
                    </div>
                  </div>

                  {/* Error Banner */}
                  {errorMessage && (
                    <div
                      role="alert"
                      className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center justify-between gap-3 text-xs text-rose-800 dark:text-rose-200"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                        <span className="font-medium break-words">{errorMessage}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setErrorMessage(null)}
                        aria-label="Dismiss error"
                        className="p-1 hover:bg-rose-100 dark:hover:bg-rose-900 rounded shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Per-Tool Isolated File Input Card & Drag-and-Drop Zone (Enforces Single vs. Multi-File Rules) */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragOverUpload(true);
                    }}
                    onDragLeave={() => setIsDragOverUpload(false)}
                    onDrop={async (e) => {
                      e.preventDefault();
                      setIsDragOverUpload(false);
                      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        await processIncomingFiles(Array.from(e.dataTransfer.files));
                      }
                    }}
                    className={`p-3.5 sm:p-4 bg-white dark:bg-slate-900 border rounded-xl space-y-3 transition-colors ${
                      isDragOverUpload
                        ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/30 ring-2 ring-blue-500/30'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FolderOpen className="w-4 h-4 text-blue-500 shrink-0" />
                        <div className="text-xs min-w-0">
                          <span className="text-slate-500 dark:text-slate-400">
                            {isMultiFileTool
                              ? 'Multi-File Queue Dropzone: '
                              : 'Single-File Dropzone: '}
                          </span>
                          <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono break-words">
                            {toolActiveFile
                              ? toolActiveFile.name
                              : isDirectPdfTool || isStandaloneImgTool
                              ? 'Optional (Direct Parameter Mode Ready)'
                              : 'Drag & drop or click Upload File'}
                          </span>
                          {toolActiveFile && (
                            <span className="text-slate-400 font-mono tabular-nums ml-2">
                              · {(toolActiveFile.sizeBytes / 1024).toFixed(1)} KB
                              {toolActiveFile.kind === 'pdf'
                                ? ` (${toolActiveFile.pageCount || 1} pages)`
                                : ` (${toolActiveFile.dimensions || 'Image'})`}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className={`px-3 py-1.5 text-xs font-semibold text-white rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                            activeSection === 'pdf'
                              ? 'bg-blue-600 hover:bg-blue-500'
                              : 'bg-indigo-600 hover:bg-indigo-500'
                          }`}
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>
                            {isMultiFileTool
                              ? '+ Upload Files (Multi)'
                              : toolActiveFile
                              ? 'Replace File'
                              : 'Upload File'}
                          </span>
                        </button>
                        {toolFiles.length > 0 && (
                          <button
                            type="button"
                            onClick={handleClearToolFiles}
                            className="px-2.5 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline whitespace-nowrap shrink-0"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Multi-File Queue & Reorder Tray (Rendered ONLY for the 9 Multi-File Tools) */}
                    {isMultiFileTool && toolFiles.length > 0 && (
                      <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                          <span>
                            Ordered Queue ({activeTool.name}) — use checkboxes &amp; arrows to order inputs:
                          </span>
                          <span className="font-mono tabular-nums">
                            {toolSelectedIds.length} of {toolFiles.length} checked
                          </span>
                        </div>

                        <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50/60 dark:bg-slate-950/60">
                          {toolFiles.map((fileItem, idx) => {
                            const isChecked = toolSelectedIds.includes(fileItem.id);
                            const isPreviewActive = toolActiveFile?.id === fileItem.id;
                            const queueOrderIndex = toolSelectedIds.indexOf(fileItem.id);
                            return (
                              <div
                                key={fileItem.id}
                                className={`px-3 py-1.5 flex items-center justify-between gap-2 text-xs ${
                                  isPreviewActive ? 'bg-blue-50/70 dark:bg-blue-950/30' : ''
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handleToggleSelectFile(fileItem)}
                                    aria-label={`Select ${fileItem.name}`}
                                    className="rounded border-slate-300 text-blue-600"
                                  />
                                  {isChecked && (
                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-600 text-white tabular-nums shrink-0">
                                      #{queueOrderIndex + 1}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setActiveFileIdByToolId((prev) => ({
                                        ...prev,
                                        [activeTool.id]: fileItem.id,
                                      }))
                                    }
                                    className="font-mono truncate text-left hover:text-blue-600 dark:hover:text-blue-400 font-medium text-slate-800 dark:text-slate-200"
                                  >
                                    {fileItem.name}
                                  </button>
                                  <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                                    {(fileItem.sizeBytes / 1024).toFixed(1)} KB
                                    {fileItem.pageCount ? ` · ${fileItem.pageCount}p` : ''}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    disabled={idx === 0}
                                    onClick={() => handleMoveSelectedFile(fileItem.id, 'up')}
                                    aria-label={`Move ${fileItem.name} up`}
                                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30"
                                  >
                                    <ArrowUp className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={idx === toolFiles.length - 1}
                                    onClick={() => handleMoveSelectedFile(fileItem.id, 'down')}
                                    aria-label={`Move ${fileItem.name} down`}
                                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30"
                                  >
                                    <ArrowDown className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveToolFile(fileItem.id)}
                                    aria-label={`Remove ${fileItem.name}`}
                                    className="p-1 text-slate-400 hover:text-rose-500"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Dedicated Stamp Image Picker for #42 Add Image to PDF */}
                    {activeSection === 'pdf' && activeTool.id === 'pdf-42-add-image' && (
                      <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          Stamp Image Asset (#42):
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          {stampImages.length > 0 && (
                            <select
                              aria-label="Select stamp image to embed into PDF"
                              value={selectedStampImageId || stampImages[0].id}
                              onChange={(e) => setSelectedStampImageId(e.target.value)}
                              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-xs font-mono"
                            >
                              {stampImages.map((img) => (
                                <option key={img.id} value={img.id}>
                                  {img.name} ({(img.sizeBytes / 1024).toFixed(1)} KB)
                                </option>
                              ))}
                            </select>
                          )}
                          <button
                            type="button"
                            onClick={() => stampInputRef.current?.click()}
                            className="px-2.5 py-1 text-xs font-medium bg-slate-900 dark:bg-slate-700 text-white rounded-md hover:bg-slate-700 dark:hover:bg-slate-600"
                          >
                            {stampImages.length > 0 ? '+ Upload Another Image' : 'Upload Stamp Image'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Pane (Desktop Col 2 Row 1-2, Mobile Order 2): Contextual Parameter Inspector */}
                <aside
                  aria-label="Tool parameter inspector"
                  className="order-2 lg:order-none lg:col-start-2 lg:row-start-1 lg:row-span-2 bg-white dark:bg-slate-900 border-y lg:border-y-0 lg:border-l border-slate-200 dark:border-slate-800 p-4 sm:p-5 flex flex-col justify-between gap-6 min-w-0"
                >
                  <div className="space-y-5">
                    <div className="pb-3 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                          PARAMETER INSPECTOR
                        </div>
                        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                          Configure {activeTool.name}
                        </h2>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={handleRunActiveTool}
                          disabled={isProcessing}
                          className={`lg:hidden px-2.5 py-1 text-[10px] font-mono font-bold text-white rounded flex items-center gap-1 ${
                            activeSection === 'pdf' ? 'bg-blue-600' : 'bg-indigo-600'
                          } disabled:opacity-50`}
                        >
                          <Play className="w-2.5 h-2.5" />
                          <span>Run</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSavedToolParamPresets((prev) => ({
                              ...prev,
                              [activeTool.id]: { ...toolParams },
                            }));
                            pushToast(`Saved default parameters for ${activeTool.name}`, 'success');
                          }}
                          title="Save current parameters as your personal default"
                          className="px-2 py-1 text-[10px] font-mono font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white rounded text-slate-600 dark:text-slate-300 flex items-center gap-1 transition-colors"
                        >
                          <BookmarkCheck className="w-3 h-3" />
                          <span>Save Default</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const factory = buildDefaultParams(activeTool);
                            setParamsByToolId((prev) => ({ ...prev, [activeTool.id]: factory }));
                            setSavedToolParamPresets((prev) => {
                              const copy = { ...prev };
                              delete copy[activeTool.id];
                              return copy;
                            });
                            pushToast('Reset parameters to factory defaults', 'info');
                          }}
                          title="Reset to factory defaults"
                          className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* PDF Quick Page Range Presets + Interactive Clickable Page Pills (#2 Split, #4 Remove Pages, #6 Rotate, #8 Extract Pages) */}
                    {activeSection === 'pdf' &&
                      (activeTool.id === 'pdf-2-split' ||
                        activeTool.id === 'pdf-4-remove-pages' ||
                        activeTool.id === 'pdf-6-rotate' ||
                        activeTool.id === 'pdf-8-extract-pages') && (
                        <div className="p-2.5 bg-blue-50/60 dark:bg-blue-950/25 border border-blue-200/70 dark:border-blue-900/50 rounded-lg space-y-2">
                          <div className="text-[10px] font-mono uppercase tracking-wider text-blue-700 dark:text-blue-300 font-semibold">
                            Quick Page Selection Presets:
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              { label: 'First Page', val: '1' },
                              {
                                label: 'Last Page',
                                val: String(toolActiveFile?.pageCount || 2),
                              },
                              { label: 'Odd Pages', val: 'odd' },
                              { label: 'Even Pages', val: 'even' },
                              {
                                label: 'All Pages',
                                val: `1-${toolActiveFile?.pageCount || 5}`,
                              },
                            ].map((chip) => {
                              const targetKey =
                                activeTool.params.find(
                                  (p) =>
                                    p.key.toLowerCase().includes('page') ||
                                    p.key.toLowerCase().includes('range')
                                )?.key || activeTool.params[0]?.key;
                              return (
                                <button
                                  key={chip.label}
                                  type="button"
                                  onClick={() => {
                                    if (targetKey) updateActiveToolParam(targetKey, chip.val);
                                  }}
                                  className="px-2 py-0.5 text-[11px] font-mono bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 hover:border-blue-500 rounded text-blue-700 dark:text-blue-300"
                                >
                                  {chip.label}
                                </button>
                              );
                            })}
                          </div>

                          {/* Interactive Page Number Pills when a PDF is uploaded */}
                          {toolActiveFile?.pageCount && toolActiveFile.pageCount > 1 && (
                            <div className="pt-1.5 border-t border-blue-200/60 dark:border-blue-900/50 space-y-1">
                              <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                                Click page numbers to toggle ({toolActiveFile.pageCount} pages):
                              </div>
                              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                                {Array.from({
                                  length: Math.min(24, toolActiveFile.pageCount),
                                }).map((_, idx) => {
                                  const pNum = String(idx + 1);
                                  const targetKey =
                                    activeTool.params.find(
                                      (p) =>
                                        p.key.toLowerCase().includes('page') ||
                                        p.key.toLowerCase().includes('range')
                                    )?.key || activeTool.params[0]?.key;
                                  const curRaw = String((targetKey && toolParams[targetKey]) || '');
                                  const tokens = curRaw
                                    .split(',')
                                    .map((s) => s.trim())
                                    .filter(Boolean);
                                  const isSelectedPage = tokens.includes(pNum);
                                  return (
                                    <button
                                      key={pNum}
                                      type="button"
                                      onClick={() => {
                                        if (!targetKey) return;
                                        const nextTokens = isSelectedPage
                                          ? tokens.filter((t) => t !== pNum)
                                          : [...tokens.filter((t) => !t.includes('-') && t !== 'odd' && t !== 'even'), pNum];
                                        updateActiveToolParam(
                                          targetKey,
                                          nextTokens.length > 0 ? nextTokens.join(', ') : '1'
                                        );
                                      }}
                                      className={`px-1.5 py-0.5 text-[10px] font-mono rounded border ${
                                        isSelectedPage
                                          ? 'bg-blue-600 text-white border-blue-600'
                                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                                      }`}
                                    >
                                      p.{pNum}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                    {/* Image Studio Live Aspect Ratio / Resolution Preset Chips (#1 Single Resize, #3 Crop, #4 Batch Crop) */}
                    {activeSection === 'image' &&
                      (activeTool.id === 'img-1-single-resize' ||
                        activeTool.id === 'img-3-crop' ||
                        activeTool.id === 'img-4-batch-crop') && (
                        <div className="p-2.5 bg-indigo-50/60 dark:bg-indigo-950/25 border border-indigo-200/70 dark:border-indigo-900/50 rounded-lg space-y-1.5">
                          <div className="text-[10px] font-mono uppercase tracking-wider text-indigo-700 dark:text-indigo-300 font-semibold">
                            Quick Aspect Ratio &amp; Resolution Presets:
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              { label: '1:1 Square', w: 1080, h: 1080, ratio: '1:1' },
                              { label: '16:9 HD', w: 1920, h: 1080, ratio: '16:9' },
                              { label: '4:5 Portrait', w: 1080, h: 1350, ratio: '4:5' },
                              { label: '9:16 Story', w: 1080, h: 1920, ratio: '9:16' },
                              { label: 'Passport', w: 600, h: 600, ratio: '1:1' },
                              { label: '4K UHD', w: 3840, h: 2160, ratio: '16:9' },
                            ].map((preset) => (
                              <button
                                key={preset.label}
                                type="button"
                                onClick={() => {
                                  setParamsByToolId((prev) => ({
                                    ...prev,
                                    [activeTool.id]: {
                                      ...(prev[activeTool.id] || buildDefaultParams(activeTool)),
                                      width: preset.w,
                                      height: preset.h,
                                      aspectRatio: preset.ratio,
                                    },
                                  }));
                                }}
                                className="px-2 py-0.5 text-[11px] font-mono bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 hover:border-indigo-500 rounded text-indigo-700 dark:text-indigo-300"
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* Standalone PDF Invoice Quick Templates (#66) */}
                    {activeTool.id === 'pdf-66-invoice-generator' && (
                      <div className="p-2.5 bg-blue-50/60 dark:bg-blue-950/25 border border-blue-200/70 dark:border-blue-900/50 rounded-lg space-y-1.5">
                        <div className="text-[10px] font-mono uppercase tracking-wider text-blue-700 dark:text-blue-300 font-semibold">
                          Quick Invoice Templates:
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            {
                              label: 'SaaS Enterprise License',
                              invoiceNumber: 'INV-2026-0842',
                              vendorName: 'Forma Studio Engineering LLC',
                              clientName: 'Acme Global Enterprises Inc.',
                              lineItemsText:
                                'Enterprise PDF & Image Suite License | 1 | 1450.00\nCustom Pipeline Integration & Setup | 12 | 125.00\nPriority Engineering Support (Annual) | 1 | 600.00',
                              taxPercent: 8.5,
                            },
                            {
                              label: 'Design Agency Retainer',
                              invoiceNumber: 'INV-2026-1094',
                              vendorName: 'Nordic Creative Studio Ltd.',
                              clientName: 'Vanguard Retail Group',
                              lineItemsText:
                                'Brand Identity & Print Guidelines | 1 | 3200.00\nSocial Media Multi-Size Asset Kit | 4 | 450.00\nUI/UX Design Sprint (40 hrs) | 40 | 95.00',
                              taxPercent: 0,
                            },
                            {
                              label: 'Legal & Compliance Filing',
                              invoiceNumber: 'INV-2026-0318',
                              vendorName: 'Apex Legal Discovery Partners',
                              clientName: 'Meridian Holdings Corp.',
                              lineItemsText:
                                'Bates Stamping & Exhibit Indexing | 1 | 850.00\nPII Redaction & PDF/A Archival | 1 | 1200.00',
                              taxPercent: 6.0,
                            },
                          ].map((tpl) => (
                            <button
                              key={tpl.label}
                              type="button"
                              onClick={() => {
                                setParamsByToolId((prev) => ({
                                  ...prev,
                                  [activeTool.id]: {
                                    ...(prev[activeTool.id] || buildDefaultParams(activeTool)),
                                    invoiceNumber: tpl.invoiceNumber,
                                    vendorName: tpl.vendorName,
                                    clientName: tpl.clientName,
                                    lineItemsText: tpl.lineItemsText,
                                    taxPercent: tpl.taxPercent,
                                  },
                                }));
                              }}
                              className="px-2 py-0.5 text-[11px] font-mono bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 hover:border-blue-500 rounded text-blue-700 dark:text-blue-300"
                            >
                              {tpl.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Duotone Studio Palette Presets (#52) */}
                    {activeTool.id === 'img-52-duotone-studio' && (
                      <div className="p-2.5 bg-indigo-50/60 dark:bg-indigo-950/25 border border-indigo-200/70 dark:border-indigo-900/50 rounded-lg space-y-1.5">
                        <div className="text-[10px] font-mono uppercase tracking-wider text-indigo-700 dark:text-indigo-300 font-semibold">
                          Quick Duotone Color Palettes:
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            { label: 'Cyber Indigo / Sky', shadow: '#1E1B4B', highlight: '#38BDF8' },
                            { label: 'Spotify Emerald / Obsidian', shadow: '#064E3B', highlight: '#34D399' },
                            { label: 'Sunset Crimson / Gold', shadow: '#4C0519', highlight: '#FBBF24' },
                            { label: 'Archival Cyanotype', shadow: '#0C4A6E', highlight: '#E0F2FE' },
                          ].map((pal) => (
                            <button
                              key={pal.label}
                              type="button"
                              onClick={() => {
                                setParamsByToolId((prev) => ({
                                  ...prev,
                                  [activeTool.id]: {
                                    ...(prev[activeTool.id] || buildDefaultParams(activeTool)),
                                    shadowColor: pal.shadow,
                                    highlightColor: pal.highlight,
                                  },
                                }));
                              }}
                              className="px-2 py-0.5 text-[11px] font-mono bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 hover:border-indigo-500 rounded text-indigo-700 dark:text-indigo-300"
                            >
                              {pal.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-4">
                      {activeTool.params.map((param) => {
                        const val = toolParams[param.key] ?? param.defaultValue;
                        const inputId = `param-${activeTool.id}-${param.key}`;
                        return (
                          <div key={param.key} className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <label
                                htmlFor={inputId}
                                className="text-xs font-medium text-slate-700 dark:text-slate-300"
                              >
                                {param.label}
                              </label>
                              {param.type === 'range' && (
                                <span className="text-xs font-mono tabular-nums text-blue-600 dark:text-blue-400">
                                  {val}
                                  {param.unit ? ` ${param.unit}` : ''}
                                </span>
                              )}
                            </div>

                            {param.type === 'select' && (
                              <select
                                id={inputId}
                                value={String(val)}
                                onChange={(e) => updateActiveToolParam(param.key, e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                              >
                                {param.options?.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            )}

                            {param.type === 'range' && (
                              <input
                                id={inputId}
                                type="range"
                                min={param.min ?? 0}
                                max={param.max ?? 100}
                                step={param.step ?? 1}
                                value={Number(val)}
                                onChange={(e) =>
                                  updateActiveToolParam(param.key, Number(e.target.value))
                                }
                                className="w-full accent-blue-600"
                              />
                            )}

                            {param.type === 'number' && (
                              <input
                                id={inputId}
                                type="number"
                                min={param.min}
                                max={param.max}
                                step={param.step ?? 1}
                                value={Number(val)}
                                onChange={(e) =>
                                  updateActiveToolParam(param.key, Number(e.target.value))
                                }
                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100"
                              />
                            )}

                            {param.type === 'text' && (
                              <input
                                id={inputId}
                                type="text"
                                value={String(val)}
                                placeholder={param.placeholder}
                                onChange={(e) => updateActiveToolParam(param.key, e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                              />
                            )}

                            {param.type === 'textarea' && (
                              <textarea
                                id={inputId}
                                rows={4}
                                value={String(val)}
                                placeholder={param.placeholder}
                                onChange={(e) => updateActiveToolParam(param.key, e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
                              />
                            )}

                            {param.type === 'color' && (
                              <div className="flex items-center gap-2">
                                <input
                                  id={inputId}
                                  type="color"
                                  value={String(val)}
                                  onChange={(e) => updateActiveToolParam(param.key, e.target.value)}
                                  className="h-8 w-12 rounded border border-slate-300 dark:border-slate-700 bg-transparent cursor-pointer"
                                />
                                <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
                                  {String(val)}
                                </span>
                              </div>
                            )}

                            {param.type === 'boolean' && (
                              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer pt-0.5">
                                <input
                                  id={inputId}
                                  type="checkbox"
                                  checked={Boolean(val)}
                                  onChange={(e) =>
                                    updateActiveToolParam(param.key, e.target.checked)
                                  }
                                  className="rounded border-slate-300 text-blue-600"
                                />
                                <span>Enabled</span>
                              </label>
                            )}
                          </div>
                        );
                      })}

                      {/* Extra Catalog Browser for #30 File Encryption (104 Cipher Profiles) */}
                      {activeTool.id === 'img-30-encryption' && (
                        <div className="pt-2">
                          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-1">
                            104 Cipher Cascade Profiles (Click to load):
                          </div>
                          <div className="max-h-28 overflow-y-auto bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-1.5 space-y-1">
                            {ENCRYPTION_104_PROFILES.slice(0, 24).map((prof, idx) => (
                              <button
                                key={prof}
                                type="button"
                                onClick={() => updateActiveToolParam('cipherProfile', idx + 1)}
                                className={`w-full text-left px-2 py-1 rounded text-[11px] font-mono truncate transition-colors ${
                                  Number(toolParams.cipherProfile) === idx + 1
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800'
                                }`}
                              >
                                {prof}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Primary Execution Action */}
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      <span>Target Format</span>
                      <span className="uppercase font-semibold text-slate-800 dark:text-slate-200">
                        .{activeTool.outputExt}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleRunActiveTool}
                      disabled={isProcessing}
                      className={`w-full py-2.5 px-4 text-xs font-semibold text-white rounded-lg flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                        activeSection === 'pdf'
                          ? 'bg-blue-600 hover:bg-blue-500'
                          : 'bg-indigo-600 hover:bg-indigo-500'
                      } disabled:opacity-50`}
                    >
                      {activeTool.executionMode.includes('Gemini AI') ? (
                        <Sparkles className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                      <span>{isProcessing ? 'Processing...' : `Run ${activeTool.name}`}</span>
                    </button>
                  </div>
                </aside>

                {/* Bottom Center Block (Desktop Col 1 Row 2, Mobile Order 3): Preview Stage & Output Banner */}
                <div className="order-3 lg:col-start-1 lg:row-start-2 p-4 sm:p-6 pt-2 sm:pt-3 space-y-4 min-w-0">
                  <div className="min-h-[380px] bg-checkerboard bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col justify-between relative overflow-hidden">
                    {activeSection === 'pdf' ? (
                      <div className="space-y-4 flex-1 flex flex-col min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-semibold text-slate-700 dark:text-slate-300 break-words">
                            {toolPdfResult && toolPdfResult.mimeType === 'application/pdf'
                              ? `Generated PDF Output — ${toolPdfResult.fileName} (${toolPdfResult.pageCount} Pages, ${(toolPdfResult.outputBytes.byteLength / 1024).toFixed(1)} KB)`
                              : toolActiveFile
                              ? `Active Document — ${toolActiveFile.name} (${toolActiveFile.pageCount || 1} Pages, ${(toolActiveFile.sizeBytes / 1024).toFixed(1)} KB)`
                              : isDirectPdfTool
                              ? 'Direct Text / HTML / Markdown / URL Converter Ready'
                              : 'No Document Uploaded'}
                          </span>

                          <div className="flex items-center gap-2 shrink-0">
                            {(pdfPreviewUrl ||
                              (toolPdfResult && toolPdfResult.mimeType === 'application/pdf') ||
                              (toolActiveFile?.pdfBytes &&
                                new TextDecoder('latin1')
                                  .decode(toolActiveFile.pdfBytes.slice(0, 8))
                                  .startsWith('%PDF-'))) && (
                              <button
                                type="button"
                                onClick={() => {
                                  const targetBytes =
                                    toolPdfResult?.mimeType === 'application/pdf'
                                      ? toolPdfResult.outputBytes
                                      : toolActiveFile?.pdfBytes;
                                  const targetName =
                                    toolPdfResult?.mimeType === 'application/pdf'
                                      ? toolPdfResult.fileName
                                      : toolActiveFile?.name || 'document.pdf';
                                  if (targetBytes) {
                                    openFullScreenPdfModal(
                                      targetName,
                                      targetBytes,
                                      toolPdfResult?.visualMeta ||
                                        buildPdfVisualMeta(activeTool.id, toolParams)
                                    );
                                  }
                                }}
                                className="px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-md flex items-center gap-1"
                              >
                                <Maximize2 className="w-3 h-3" />
                                <span>Open PDF</span>
                              </button>
                            )}
                            <span className="font-mono tabular-nums hidden sm:inline">
                              Output: .{activeTool.outputExt}
                            </span>
                          </div>
                        </div>

                        {/* Live Visual PDF Sheet Preview for Geometric, Stamp, Redaction & Overlay Tools */}
                        {(toolActiveFile || toolPdfResult) && (
                          <div className="flex flex-col items-center gap-3 p-3 bg-slate-200/70 dark:bg-slate-900/80 rounded-xl border border-slate-300 dark:border-slate-800 max-h-[360px] overflow-y-auto">
                            <div className="w-full flex items-center justify-between text-[11px] font-mono text-slate-600 dark:text-slate-400">
                              <span>
                                Live Visual Sheet Inspector ({activeTool.name})
                              </span>
                              <span>
                                {toolPdfResult?.pageCount || toolActiveFile?.pageCount || 1} Page(s)
                              </span>
                            </div>
                            {renderVisualPdfSheet(
                              {
                                pageNumber: 1,
                                width:
                                  Number(activeTool.id === 'pdf-6-rotate' && (Number(toolParams.angle) === 90 || Number(toolParams.angle) === 270))
                                    ? 842
                                    : 595,
                                height:
                                  Number(activeTool.id === 'pdf-6-rotate' && (Number(toolParams.angle) === 90 || Number(toolParams.angle) === 270))
                                    ? 595
                                    : 842,
                                rotationDeg:
                                  activeTool.id === 'pdf-6-rotate'
                                    ? Number(toolParams.angle) || 90
                                    : 0,
                                text:
                                  toolPdfResult?.previewText ||
                                  toolActiveFile?.text ||
                                  `Document: ${toolPdfResult?.fileName || toolActiveFile?.name || 'Active PDF'}`,
                              },
                              toolPdfResult?.visualMeta ||
                                buildPdfVisualMeta(activeTool.id, toolParams),
                              toolPdfResult?.pageCount || toolActiveFile?.pageCount || 1,
                              0.82
                            )}
                          </div>
                        )}

                        {pdfPreviewUrl ? (
                          <iframe
                            src={pdfPreviewUrl}
                            title="Live PDF Document Preview"
                            className="w-full h-[320px] sm:h-[360px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white shadow-inner"
                          />
                        ) : toolActiveFile?.text ? (
                          <div className="flex-1 p-4 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg font-mono text-xs text-slate-800 dark:text-slate-200 overflow-y-auto max-h-[380px] whitespace-pre-wrap">
                            {toolActiveFile.text}
                          </div>
                        ) : (
                          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border border-dashed border-slate-300 dark:border-slate-800 rounded-lg">
                            <FileText className="w-8 h-8 text-slate-400 mb-2" />
                            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md">
                              {isDirectPdfTool
                                ? `Enter your content in the Parameter Inspector and click "Run ${activeTool.name}", or optionally upload a source file above.`
                                : `Upload ${
                                    isMultiFileTool
                                      ? 'multiple files'
                                      : 'a PDF or document file'
                                  } above to preview and run "${activeTool.name}".`}
                            </p>
                          </div>
                        )}

                        {(toolPdfResult?.previewText || toolActiveFile?.text) && (
                          <div className="p-3.5 bg-slate-900 text-slate-100 rounded-lg font-mono text-xs max-h-40 overflow-y-auto whitespace-pre-wrap border border-slate-800">
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <div className="text-[10px] uppercase tracking-wider text-blue-400">
                                {toolPdfResult?.previewText
                                  ? `Tool Execution Output / Extracted Stream (${toolPdfResult.fileName})`
                                  : `Extracted Document Text Preview (${toolActiveFile?.name})`}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const txt = toolPdfResult?.previewText || toolActiveFile?.text || '';
                                  if (txt && navigator.clipboard) {
                                    navigator.clipboard.writeText(txt).catch(() => {});
                                    pushToast('Copied extracted text to clipboard', 'success');
                                  }
                                }}
                                className="px-2 py-0.5 text-[10px] font-mono bg-slate-800 hover:bg-blue-600 text-slate-200 rounded flex items-center gap-1 shrink-0"
                              >
                                <Copy className="w-3 h-3" />
                                <span>Copy Text</span>
                              </button>
                            </div>
                            {toolPdfResult?.previewText || toolActiveFile?.text}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Image Studio Interactive HTML5 Canvas + Before/After Split Curtain */
                      <div className="flex-1 flex flex-col items-center justify-center gap-4 min-w-0">
                        <div className="w-full flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span>
                            Canvas Stage ·{' '}
                            {toolImageResult
                              ? `${toolImageResult.width} × ${toolImageResult.height} px`
                              : toolActiveFile?.dimensions ||
                                (isStandaloneImgTool ? 'Generator Ready' : 'No Image Uploaded')}
                          </span>
                          <div className="flex flex-wrap items-center gap-3">
                            {(toolImageResult || toolActiveFile?.canRenderAsImg) && (
                              <div className="flex items-center gap-1 p-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md font-mono text-[11px]">
                                {(['fit', 100, 200] as const).map((zMode) => (
                                  <button
                                    key={String(zMode)}
                                    type="button"
                                    onClick={() => setImageStageZoom(zMode)}
                                    className={`px-2 py-0.5 rounded ${
                                      imageStageZoom === zMode
                                        ? 'bg-indigo-600 text-white'
                                        : 'text-slate-600 dark:text-slate-400'
                                    }`}
                                  >
                                    {zMode === 'fit' ? 'Fit' : `${zMode}%`}
                                  </button>
                                ))}
                              </div>
                            )}
                            {BEFORE_AFTER_COMPARE_TOOL_IDS.has(activeTool.id) &&
                              toolImageResult &&
                              toolActiveFile?.canRenderAsImg &&
                              Boolean(toolImageResult.outputDataUrl?.startsWith('data:image/')) &&
                              !toolImageResult.fileName.endsWith('.json') &&
                              !toolImageResult.fileName.endsWith('.enc') &&
                              !toolImageResult.fileName.endsWith('.zip') &&
                              !toolImageResult.fileName.endsWith('.pdf') && (
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={showCompareCurtain}
                                    onChange={(e) => setShowCompareCurtain(e.target.checked)}
                                    className="rounded border-slate-300 text-indigo-600"
                                  />
                                  <Eye className="w-3.5 h-3.5 text-indigo-500" />
                                  <span className="font-medium text-slate-700 dark:text-slate-200">
                                    Before / After Split ({compareSplit}%)
                                  </span>
                                </label>
                              )}
                          </div>
                        </div>

                        {toolImageResult ? (
                          Boolean(toolImageResult.outputDataUrl?.startsWith('data:image/')) ? (
                            <div className="space-y-3 flex flex-col items-center max-w-full">
                              <div className="relative max-w-full overflow-auto rounded-lg border border-slate-300 dark:border-slate-700 shadow-lg bg-slate-900">
                                <img
                                  src={
                                    activeTool.id === 'img-42-compare-slider' &&
                                    toolImageResult.extraMeta?.afterDataUrl
                                      ? String(toolImageResult.extraMeta.afterDataUrl)
                                      : toolImageResult.outputDataUrl
                                  }
                                  alt="Processed image output"
                                  referrerPolicy="no-referrer"
                                  style={
                                    imageStageZoom === 100
                                      ? { transform: 'scale(1)', transformOrigin: 'center' }
                                      : imageStageZoom === 200
                                      ? { transform: 'scale(1.5)', transformOrigin: 'center' }
                                      : undefined
                                  }
                                  className="max-h-[340px] w-auto object-contain block transition-transform"
                                />
                                {BEFORE_AFTER_COMPARE_TOOL_IDS.has(activeTool.id) &&
                                  showCompareCurtain &&
                                  toolActiveFile?.imageDataUrl && (
                                    <div
                                      className="absolute inset-y-0 left-0 overflow-hidden border-r-2 border-white shadow-md"
                                      style={{ width: `${compareSplit}%` }}
                                    >
                                      <img
                                        src={toolActiveFile.imageDataUrl}
                                        alt="Original before edit"
                                        referrerPolicy="no-referrer"
                                        className="max-h-[340px] w-auto max-w-none object-contain block"
                                      />
                                      <span className="absolute top-2 left-2 bg-slate-950/80 text-white text-[10px] font-mono px-2 py-0.5 rounded-xs">
                                        {activeTool.id === 'img-42-compare-slider' && toolFiles.length >= 2
                                          ? `IMAGE #1 (${toolFiles[0].name})`
                                          : 'BEFORE'}
                                      </span>
                                    </div>
                                  )}
                                <span className="absolute top-2 right-2 bg-indigo-600/90 text-white text-[10px] font-mono px-2 py-0.5 rounded-xs">
                                  {activeTool.id === 'img-42-compare-slider' && toolFiles.length >= 2
                                    ? `IMAGE #2 (${toolFiles[1].name})`
                                    : BEFORE_AFTER_COMPARE_TOOL_IDS.has(activeTool.id)
                                    ? `AFTER (${activeTool.name})`
                                    : activeTool.name}
                                </span>
                              </div>

                              {/* Interactive Click-to-Copy HEX Color Swatches for #39 Eyedropper & #40 Palette Generator */}
                              {(Array.isArray(toolImageResult.extraMeta?.swatches) ||
                                typeof toolImageResult.extraMeta?.hex === 'string') && (
                                <div className="w-full max-w-xl p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-2">
                                  <div className="text-[10px] font-mono uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-bold">
                                    Interactive Color Swatches (Click any swatch to copy HEX):
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {(Array.isArray(toolImageResult.extraMeta?.swatches)
                                      ? (toolImageResult.extraMeta.swatches as string[])
                                      : [String(toolImageResult.extraMeta?.hex)]
                                    ).map((hexVal) => (
                                      <button
                                        key={hexVal}
                                        type="button"
                                        onClick={() => {
                                          navigator.clipboard?.writeText(hexVal).catch(() => {});
                                          pushToast(`Copied ${hexVal} to clipboard`, 'success');
                                        }}
                                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 hover:border-indigo-500 flex items-center gap-2 text-xs font-mono"
                                      >
                                        <span
                                          className="w-4 h-4 rounded border border-slate-300 dark:border-slate-700 shrink-0"
                                          style={{ backgroundColor: hexVal }}
                                        />
                                        <span>{hexVal}</span>
                                        <Copy className="w-3 h-3 text-slate-400" />
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Structured JSON / Metadata / Archive Inspector for .json, .enc, .zip, .pdf outputs */}
                              {(toolImageResult.fileName.endsWith('.json') ||
                                toolImageResult.fileName.endsWith('.enc') ||
                                toolImageResult.fileName.endsWith('.zip') ||
                                toolImageResult.fileName.endsWith('.pdf') ||
                                toolImageResult.extraMeta) && (
                                <div className="w-full max-w-xl p-3 bg-slate-900 text-slate-100 rounded-lg border border-slate-800 font-mono text-xs overflow-x-auto max-h-40">
                                  <div className="text-[10px] uppercase tracking-wider text-indigo-400 mb-1">
                                    Output Payload Inspector ({toolImageResult.fileName} ·{' '}
                                    {toolImageResult.mimeType})
                                  </div>
                                  <pre className="whitespace-pre-wrap break-words text-[11px] text-slate-200">
                                    {toolImageResult.fileName.endsWith('.json')
                                      ? new TextDecoder('utf-8', { fatal: false }).decode(
                                          toolImageResult.outputBytes
                                        )
                                      : JSON.stringify(
                                          toolImageResult.extraMeta || {
                                            fileName: toolImageResult.fileName,
                                            mimeType: toolImageResult.mimeType,
                                            sizeBytes: toolImageResult.outputBytes.byteLength,
                                            summary: toolImageResult.summary,
                                          },
                                          null,
                                          2
                                        )}
                                  </pre>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="p-6 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-center space-y-2 max-w-md w-full">
                              <Shield className="w-8 h-8 text-indigo-500 mx-auto" />
                              <div className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100 break-all">
                                {toolImageResult.fileName}
                              </div>
                              <p className="text-xs text-slate-600 dark:text-slate-400">
                                {toolImageResult.summary}
                              </p>
                            </div>
                          )
                        ) : toolActiveFile ? (
                          toolActiveFile.canRenderAsImg && toolActiveFile.imageDataUrl ? (
                            <div className="relative max-w-full overflow-auto rounded-lg border border-slate-300 dark:border-slate-700 shadow-lg bg-slate-900">
                              <img
                                src={toolActiveFile.imageDataUrl}
                                alt={toolActiveFile.name}
                                referrerPolicy="no-referrer"
                                style={
                                  imageStageZoom === 100
                                    ? { transform: 'scale(1)', transformOrigin: 'center' }
                                    : imageStageZoom === 200
                                    ? { transform: 'scale(1.5)', transformOrigin: 'center' }
                                    : undefined
                                }
                                className="max-h-[340px] w-auto object-contain block transition-transform"
                              />
                            </div>
                          ) : (
                            <div className="p-6 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-center space-y-2 max-w-md w-full">
                              <Shield className="w-8 h-8 text-indigo-500 mx-auto" />
                              <div className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100 break-all">
                                {toolActiveFile.name}
                              </div>
                              <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                                {toolActiveFile.dimensions} ·{' '}
                                {(toolActiveFile.sizeBytes / 1024).toFixed(1)} KB · Ready to Process
                              </div>
                            </div>
                          )
                        ) : (
                          <div className="w-full flex-1 flex flex-col items-center justify-center text-center p-8 border border-dashed border-slate-300 dark:border-slate-800 rounded-lg">
                            <ImageIcon className="w-8 h-8 text-slate-400 mb-2" />
                            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md">
                              {isStandaloneImgTool
                                ? `Configure options in the Parameter Inspector and click "Run ${activeTool.name}" to generate output.`
                                : `Upload ${
                                    isMultiFileTool ? '2 or more images' : 'an image file'
                                  } above to preview and run "${activeTool.name}".`}
                            </p>
                          </div>
                        )}

                        {BEFORE_AFTER_COMPARE_TOOL_IDS.has(activeTool.id) &&
                          toolImageResult &&
                          showCompareCurtain &&
                          toolActiveFile?.canRenderAsImg && (
                            <div className="w-full max-w-md flex items-center gap-3">
                              <span className="text-[11px] font-mono text-slate-400">Before</span>
                              <input
                                type="range"
                                min={5}
                                max={95}
                                value={compareSplit}
                                onChange={(e) => setCompareSplit(Number(e.target.value))}
                                aria-label="Before and After comparison split slider"
                                className="flex-1 accent-indigo-600"
                              />
                              <span className="text-[11px] font-mono text-slate-400">After</span>
                            </div>
                          )}

                        {/* #48 312 LUT Filter Quick Preset Selector Strip */}
                        {activeTool.id === 'img-48-color-correction' && (
                          <div className="w-full pt-2 border-t border-slate-200 dark:border-slate-800">
                            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                              312 Curated LUT Presets (Click any preset to load into Worker LUT Engine):
                            </div>
                            <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5">
                              {ALL_312_FILTER_PRESETS.slice(0, 36).map((preset) => (
                                <button
                                  key={preset.id}
                                  type="button"
                                  onClick={() => {
                                    setParamsByToolId((prev) => ({
                                      ...prev,
                                      [activeTool.id]: {
                                        ...(prev[activeTool.id] || buildDefaultParams(activeTool)),
                                        presetIndex: preset.id,
                                        brightness: preset.brightness,
                                        contrast: preset.contrast,
                                        saturation: preset.saturation,
                                      },
                                    }));
                                  }}
                                  className={`px-2.5 py-1 text-[11px] font-mono rounded-md border whitespace-nowrap shrink-0 transition-colors ${
                                    Number(toolParams.presetIndex) === preset.id
                                      ? 'bg-indigo-600 text-white border-indigo-600'
                                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-indigo-500'
                                  }`}
                                >
                                  #{preset.code} · {preset.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Web Worker Progress Bar */}
                    {isProcessing && (
                      <div className="mt-4 p-3 bg-slate-900/95 text-white rounded-lg space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                          <span>Running {activeTool.engineLabel}...</span>
                          <span>{workerProgress}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 transition-all duration-150"
                            style={{ width: `${workerProgress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Output Result Banner with Byte Delta Badge + Batch ZIP Inspector + Explicit Open PDF + Cross-Tool Handoff */}
                  {((activeSection === 'pdf' && toolPdfResult) ||
                    (activeSection === 'image' && toolImageResult)) && (
                    <div
                      ref={outputBannerRef}
                      className="p-4 bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/70 rounded-xl space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-emerald-950 dark:text-emerald-100 break-all flex flex-wrap items-center gap-2">
                              <span>
                                {activeSection === 'pdf'
                                  ? toolPdfResult?.fileName
                                  : toolImageResult?.fileName}
                              </span>
                              <span className="font-mono tabular-nums font-normal text-emerald-700 dark:text-emerald-300">
                                (
                                {(
                                  ((activeSection === 'pdf'
                                    ? toolPdfResult?.outputBytes.byteLength
                                    : toolImageResult?.outputBytes.byteLength) || 0) / 1024
                                ).toFixed(1)}{' '}
                                KB)
                              </span>
                              {toolActiveFile && toolActiveFile.sizeBytes > 0 && (
                                <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-emerald-600/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30">
                                  Input {(toolActiveFile.sizeBytes / 1024).toFixed(1)} KB → Output{' '}
                                  {(
                                    ((activeSection === 'pdf'
                                      ? toolPdfResult?.outputBytes.byteLength
                                      : toolImageResult?.outputBytes.byteLength) || 0) / 1024
                                  ).toFixed(1)}{' '}
                                  KB (
                                  {(
                                    ((((activeSection === 'pdf'
                                      ? toolPdfResult?.outputBytes.byteLength
                                      : toolImageResult?.outputBytes.byteLength) || 0) -
                                      toolActiveFile.sizeBytes) /
                                      toolActiveFile.sizeBytes) *
                                    100
                                  ).toFixed(1)}
                                  %)
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-emerald-800 dark:text-emerald-200/90 mt-0.5">
                              {activeSection === 'pdf'
                                ? toolPdfResult?.summary
                                : toolImageResult?.summary}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {((activeSection === 'pdf' &&
                            toolPdfResult?.mimeType === 'application/pdf') ||
                            (activeSection === 'image' &&
                              toolImageResult?.mimeType.startsWith('image/'))) && (
                            <button
                              type="button"
                              onClick={handleUseOutputInCurrentTool}
                              className="px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 hover:border-blue-500 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                            >
                              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                              <span>Use Output as Input</span>
                            </button>
                          )}
                          {activeSection === 'image' &&
                            toolImageResult?.mimeType.startsWith('image/') && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const blob = new Blob(
                                      [toolImageResult.outputBytes as unknown as BlobPart],
                                      { type: 'image/png' }
                                    );
                                    if (
                                      navigator.clipboard &&
                                      typeof ClipboardItem !== 'undefined'
                                    ) {
                                      await navigator.clipboard.write([
                                        new ClipboardItem({ 'image/png': blob }),
                                      ]);
                                      pushToast('Copied image to clipboard', 'success');
                                    } else {
                                      await navigator.clipboard.writeText(
                                        toolImageResult.outputDataUrl
                                      );
                                      pushToast('Copied image data URL to clipboard', 'success');
                                    }
                                  } catch {
                                    pushToast('Clipboard copy not supported in this context', 'info');
                                  }
                                }}
                                className="px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 hover:border-indigo-500 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                              >
                                <Copy className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                <span>Copy Image</span>
                              </button>
                            )}
                          {activeSection === 'pdf' &&
                            toolPdfResult?.mimeType === 'application/pdf' && (
                              <button
                                type="button"
                                onClick={() =>
                                  openFullScreenPdfModal(
                                    toolPdfResult.fileName,
                                    toolPdfResult.outputBytes,
                                    toolPdfResult.visualMeta
                                  )
                                }
                                className="px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                              >
                                <Maximize2 className="w-3.5 h-3.5" />
                                <span>Open PDF</span>
                              </button>
                            )}
                          <button
                            type="button"
                            onClick={handleDownloadOutput}
                            className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download Output</span>
                          </button>
                        </div>
                      </div>

                      {/* Batch ZIP File Inspector Table with Individual Entry Preview & Download */}
                      {toolZipEntries.length > 0 && (
                        <div className="pt-2.5 border-t border-emerald-200/80 dark:border-emerald-900/60 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-mono text-emerald-900 dark:text-emerald-200 font-semibold">
                            <span className="flex items-center gap-1.5">
                              <Archive className="w-3.5 h-3.5 text-emerald-600" />
                              <span>
                                ZIP Archive Inspector ({toolZipEntries.length} packaged files)
                              </span>
                            </span>
                            <span>
                              Total Uncompressed:{' '}
                              {(
                                toolZipEntries.reduce((acc, e) => acc + e.sizeBytes, 0) / 1024
                              ).toFixed(1)}{' '}
                              KB
                            </span>
                          </div>
                          <div className="max-h-40 overflow-y-auto bg-white/90 dark:bg-slate-900/90 border border-emerald-200 dark:border-emerald-800/70 rounded-lg divide-y divide-slate-100 dark:divide-slate-800/60 text-xs font-mono">
                            {toolZipEntries.map((entry) => {
                              const lower = entry.name.toLowerCase();
                              const isPdfEntry = lower.endsWith('.pdf');
                              const isImgEntry = /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(lower);
                              const entryMime = isPdfEntry
                                ? 'application/pdf'
                                : isImgEntry
                                ? `image/${lower.endsWith('.jpg') ? 'jpeg' : lower.split('.').pop()}`
                                : 'application/octet-stream';
                              return (
                                <div
                                  key={entry.name}
                                  className="px-3 py-1.5 flex items-center justify-between gap-2 text-slate-700 dark:text-slate-200"
                                >
                                  <span className="truncate">{entry.name}</span>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-[11px] text-slate-400 tabular-nums">
                                      {(entry.sizeBytes / 1024).toFixed(1)} KB
                                    </span>
                                    {(isPdfEntry || isImgEntry) && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (isPdfEntry) {
                                            openFullScreenPdfModal(entry.name, entry.bytes);
                                          } else {
                                            const blob = new Blob(
                                              [entry.bytes as unknown as BlobPart],
                                              { type: entryMime }
                                            );
                                            const url = URL.createObjectURL(blob);
                                            setAssetPreviewModal({
                                              title: entry.name,
                                              subtitle: `Extracted from ${
                                                activeSection === 'pdf'
                                                  ? toolPdfResult?.fileName
                                                  : toolImageResult?.fileName
                                              }`,
                                              mimeType: entryMime,
                                              fileName: entry.name,
                                              bytes: entry.bytes,
                                              imageDataUrl: url,
                                            });
                                          }
                                        }}
                                        className="px-2 py-0.5 text-[10px] font-sans font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white rounded"
                                      >
                                        Preview
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        triggerDownloadBytes(entry.name, entryMime, entry.bytes)
                                      }
                                      className="px-2 py-0.5 text-[10px] font-sans font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded"
                                    >
                                      Download
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Explicit Output Handoff Control */}
                      {((activeSection === 'pdf' && toolPdfResult?.mimeType === 'application/pdf') ||
                        activeSection === 'image') && (
                        <div className="pt-2.5 border-t border-emerald-200/80 dark:border-emerald-900/60 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-medium text-emerald-900 dark:text-emerald-200">
                            Explicit Handoff (Send this output to a tool):
                          </span>
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              aria-label="Choose destination tool for output handoff"
                              value={handoffTargetToolId}
                              onChange={(e) => setHandoffTargetToolId(e.target.value)}
                              className="bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 max-w-[230px]"
                            >
                              <option value="current">Use Output in Current Tool</option>
                              {(activeSection === 'pdf' ? PDF_TOOLS : IMAGE_TOOLS)
                                .filter((t) => t.id !== activeTool.id && t.number !== 57)
                                .map((t) => (
                                  <option key={t.id} value={t.id}>
                                    #{t.number} {t.name}
                                  </option>
                                ))}
                            </select>
                            <button
                              type="button"
                              onClick={handleSendOutputToTool}
                              className="px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:border-blue-500 rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0"
                            >
                              <Send className="w-3 h-3" />
                              <span>Send Output</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              </StudioErrorBoundary>
            )}
          </div>
        )}
      </main>

      {/* Minimal Footer */}
      <footer className="px-4 sm:px-6 py-3 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <div>
          Forma Studio — {TOTAL_TOOLS_COUNT} Tools ({PDF_TOOLS.length} PDF · {IMAGE_TOOLS.length} Image · {EXTRA_TOOLS.length} Calculator &amp; Converter) · 100% Local Browser Processing
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 font-mono tabular-nums">
          <button
            type="button"
            onClick={() => setIsShortcutsOpen(true)}
            className="hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1"
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>Shortcuts (?)</span>
          </button>
          <span aria-hidden="true">·</span>
          <span>{importedHistory.length} Imported</span>
          <span aria-hidden="true">·</span>
          <span>{completedOutputs.length} Completed</span>
          <span aria-hidden="true">·</span>
          <a
            href="./privacy.html"
            className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors"
          >
            Privacy
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="./terms.html"
            className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors"
          >
            Terms
          </a>
        </div>
      </footer>

      {/* Global Cmd+K Search Modal */}
      <CommandSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectTool={handleSelectTool}
        pinnedToolIds={pinnedToolIds}
        recentToolIds={recentToolIds}
        onTogglePinTool={togglePinTool}
      />

      {/* Keyboard Shortcuts Cheat-Sheet Modal */}
      {isShortcutsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard Shortcuts Cheat-Sheet"
        >
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  Keyboard Shortcuts
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsShortcutsOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-2.5 text-xs">
              {[
                { keys: 'Cmd / Ctrl + K', desc: `Open Global Command Search (${TOTAL_TOOLS_COUNT} Tools)` },
                { keys: 'Alt + 1 / 2 / 3', desc: 'Jump to PDF / Image / Calc & Converter Studio' },
                { keys: 'Alt + 4 / 5', desc: 'Jump to Pipelines (#57) / History & Logs (#60)' },
                { keys: '?', desc: 'Toggle Keyboard Shortcuts Cheat-Sheet' },
                { keys: 'Esc', desc: 'Close active modal, PDF viewer, or drawer' },
              ].map((sc) => (
                <div
                  key={sc.keys}
                  className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100 dark:border-slate-800/70"
                >
                  <span className="text-slate-600 dark:text-slate-300">{sc.desc}</span>
                  <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-200 shrink-0">
                    {sc.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Non-Blocking Toast Notification Stack */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs w-full pointer-events-none"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`px-3.5 py-2.5 rounded-xl shadow-lg border text-xs font-medium pointer-events-auto flex items-center justify-between gap-2 ${
                t.tone === 'success'
                  ? 'bg-emerald-900/95 text-emerald-100 border-emerald-700'
                  : 'bg-slate-900/95 text-slate-100 border-slate-700'
              }`}
            >
              <span>{t.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* In-App Full-Screen PDF Viewer Modal */}
      {pdfViewerModal && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 text-slate-100"
          role="dialog"
          aria-modal="true"
          aria-label="In-App Full-Screen PDF Viewer"
        >
          {/* Modal Top Control Bar */}
          <div className="px-4 sm:px-6 py-3 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-bold font-mono text-white truncate">
                {pdfViewerModal.fileName}
              </div>
              <div className="text-[11px] font-mono text-slate-400">
                {pdfViewerModal.pages.length} Page(s) ·{' '}
                {(pdfViewerModal.sizeBytes / 1024).toFixed(1)} KB
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-0.5 bg-slate-800 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setPdfModalTab('sheets')}
                  className={`px-2.5 py-1 rounded-md font-medium ${
                    pdfModalTab === 'sheets' ? 'bg-blue-600 text-white' : 'text-slate-300'
                  }`}
                >
                  Visual Sheets
                </button>
                <button
                  type="button"
                  onClick={() => setPdfModalTab('native')}
                  className={`px-2.5 py-1 rounded-md font-medium ${
                    pdfModalTab === 'native' ? 'bg-blue-600 text-white' : 'text-slate-300'
                  }`}
                >
                  Browser PDF Frame
                </button>
              </div>

              {pdfModalTab === 'sheets' && (
                <>
                  <div className="flex items-center gap-1 bg-slate-800 rounded-lg px-2 py-1 text-xs font-mono">
                    <button
                      type="button"
                      onClick={() => setPdfModalZoom((z) => Math.max(50, z - 25))}
                      aria-label="Zoom out"
                      className="p-1 hover:text-white text-slate-300"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-1.5 tabular-nums">{pdfModalZoom}%</span>
                    <button
                      type="button"
                      onClick={() => setPdfModalZoom((z) => Math.min(200, z + 25))}
                      aria-label="Zoom in"
                      className="p-1 hover:text-white text-slate-300"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPdfModalZoom(85)}
                      className="px-1.5 py-0.5 text-[10px] hover:text-white text-slate-300 border-l border-slate-700"
                    >
                      Fit Width
                    </button>
                    <button
                      type="button"
                      onClick={() => setPdfModalZoom(100)}
                      className="px-1.5 py-0.5 text-[10px] hover:text-white text-slate-300"
                    >
                      100%
                    </button>
                    <button
                      type="button"
                      onClick={() => setPdfModalZoom(150)}
                      className="px-1.5 py-0.5 text-[10px] hover:text-white text-slate-300"
                    >
                      150%
                    </button>
                  </div>

                  {/* Page Jump Input */}
                  <div className="flex items-center gap-1.5 bg-slate-800 rounded-lg px-2.5 py-1 text-xs font-mono">
                    <span className="text-slate-400">Page</span>
                    <input
                      type="number"
                      min={1}
                      max={Math.max(1, pdfViewerModal.pages.length)}
                      value={pdfJumpPageInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPdfJumpPageInput(val);
                        const pageNum = Math.max(
                          1,
                          Math.min(pdfViewerModal.pages.length, Number(val) || 1)
                        );
                        const el = document.getElementById(`pdf-modal-page-${pageNum}`);
                        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className="w-12 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-center text-white"
                    />
                    <span className="text-slate-400">of {pdfViewerModal.pages.length}</span>
                  </div>
                </>
              )}

              {pdfViewerModal.blobUrl && (
                <a
                  href={pdfViewerModal.blobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Open in New Tab</span>
                </a>
              )}

              <button
                type="button"
                onClick={() =>
                  triggerDownloadBytes(
                    pdfViewerModal.fileName,
                    'application/pdf',
                    pdfViewerModal.bytes
                  )
                }
                className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download PDF</span>
              </button>

              <button
                type="button"
                onClick={() => setPdfViewerModal(null)}
                aria-label="Close PDF viewer"
                className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Modal Viewport */}
          <div className="flex-1 overflow-auto p-4 sm:p-8 flex flex-col items-center gap-6">
            {pdfModalTab === 'native' && pdfViewerModal.blobUrl ? (
              <iframe
                src={pdfViewerModal.blobUrl}
                title={pdfViewerModal.fileName}
                className="w-full max-w-5xl h-full min-h-[75vh] rounded-lg bg-white border border-slate-700"
              />
            ) : (
              pdfViewerModal.pages.map((p) =>
                renderVisualPdfSheet(
                  p,
                  pdfViewerModal.visualMeta,
                  pdfViewerModal.pages.length,
                  pdfModalZoom / 100
                )
              )
            )}
          </div>
        </div>
      )}

      {/* Non-PDF Asset Preview Modal (Images, Text, CSV, XML, SVG, ZIP) */}
      {assetPreviewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Output Asset Preview"
        >
          <div className="w-full max-w-3xl max-h-[88vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold font-mono text-slate-900 dark:text-white truncate">
                  {assetPreviewModal.title}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {assetPreviewModal.subtitle}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    triggerDownloadBytes(
                      assetPreviewModal.fileName,
                      assetPreviewModal.mimeType,
                      assetPreviewModal.bytes
                    )
                  }
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAssetPreviewModal(null)}
                  aria-label="Close preview modal"
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-5 flex items-center justify-center bg-slate-50 dark:bg-slate-950">
              {assetPreviewModal.imageDataUrl &&
              assetPreviewModal.mimeType.startsWith('image/') &&
              assetPreviewModal.mimeType !== 'image/tiff' ? (
                <img
                  src={assetPreviewModal.imageDataUrl}
                  alt={assetPreviewModal.fileName}
                  className="max-h-[65vh] w-auto object-contain rounded-lg border border-slate-200 dark:border-slate-800"
                />
              ) : assetPreviewModal.previewText ? (
                <pre className="w-full p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-mono whitespace-pre-wrap break-words text-slate-800 dark:text-slate-200">
                  {assetPreviewModal.previewText}
                </pre>
              ) : (
                <div className="text-center space-y-2 p-6">
                  <Shield className="w-8 h-8 text-indigo-500 mx-auto" />
                  <div className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100">
                    {assetPreviewModal.fileName}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Binary Archive / Container ({(assetPreviewModal.bytes.byteLength / 1024).toFixed(1)} KB). Click Download to save.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
