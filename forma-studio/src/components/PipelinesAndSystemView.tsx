import React, { useRef, useState } from 'react';
import JSZip from 'jszip';
import {
  Play,
  Plus,
  Trash2,
  Download,
  CheckCircle2,
  Upload,
  ArrowUp,
  ArrowDown,
  Eye,
  FileText,
  Image as ImageIcon,
  FolderOpen,
  Layers,
  XCircle,
  BookmarkPlus,
  Copy,
  Archive,
  Search,
} from 'lucide-react';
import { PDF_TOOLS, IMAGE_TOOLS, StudioTool } from '../data/toolsCatalog';
import type { SavedPipelinePreset } from '../utils/userStorage';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  studio: 'PDF' | 'IMAGE' | 'PIPELINE';
  toolNumber: number;
  toolName: string;
  inputName: string;
  inputBytes: number;
  outputName: string;
  outputBytes: number;
  durationMs: number;
  status: 'Nominal' | 'Completed';
}

export interface ImportedHistoryItem {
  id: string;
  name: string;
  kind: 'pdf' | 'image';
  sizeBytes: number;
  uploadedAt: string;
  pageCount?: number;
  dimensions?: string;
  bytes: Uint8Array;
  imageDataUrl?: string;
  text?: string;
  sourceToolId: string;
  sourceToolName: string;
}

export interface CompletedOutputHistoryItem {
  id: string;
  fileName: string;
  mimeType: string;
  outputBytes: Uint8Array;
  sizeBytes: number;
  completedAt: string;
  studio: 'PDF' | 'IMAGE' | 'PIPELINE';
  toolNumber: number;
  toolName: string;
  pageCount?: number;
  previewText?: string;
  imageDataUrl?: string;
  summary: string;
}

export interface PipelineStepInstance {
  uid: string;
  tool: StudioTool;
  params: Record<string, any>;
  enabled?: boolean;
}

export interface PipelineInputFile {
  id: string;
  name: string;
  kind: 'pdf' | 'image';
  bytes: Uint8Array;
  sizeBytes: number;
  pageCount?: number;
  text?: string;
  imageDataUrl?: string;
}

function buildDefaultParams(tool: StudioTool): Record<string, any> {
  const defaults: Record<string, any> = {};
  tool.params.forEach((p) => {
    defaults[p.key] = p.defaultValue;
  });
  return defaults;
}

function makeStep(
  tool: StudioTool,
  customParams?: Record<string, any>,
  enabled = true
): PipelineStepInstance {
  return {
    uid: `step-${tool.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tool,
    params: customParams ? { ...customParams } : buildDefaultParams(tool),
    enabled,
  };
}

interface PipelinesViewProps {
  pipelineFiles: PipelineInputFile[];
  onUploadPipelineFiles: (files: FileList | File[]) => Promise<void>;
  onRemovePipelineFile: (id: string) => void;
  onClearPipelineFiles: () => void;
  onRunPipeline: (steps: PipelineStepInstance[]) => Promise<void>;
  isRunning: boolean;
  lastSummary: string | null;
  lastResultOutput: CompletedOutputHistoryItem | null;
  onOpenOutputPreview: (item: CompletedOutputHistoryItem) => void;
  onDownloadOutputItem: (item: CompletedOutputHistoryItem) => void;
  customPresets?: SavedPipelinePreset[];
  onSaveCustomPreset?: (name: string, steps: PipelineStepInstance[]) => void;
  onDeleteCustomPreset?: (presetId: string) => void;
}

export const PipelinesBuilderView: React.FC<PipelinesViewProps> = ({
  pipelineFiles,
  onUploadPipelineFiles,
  onRemovePipelineFile,
  onClearPipelineFiles,
  onRunPipeline,
  isRunning,
  lastSummary,
  lastResultOutput,
  onOpenOutputPreview,
  onDownloadOutputItem,
  customPresets = [],
  onSaveCustomPreset,
  onDeleteCustomPreset,
}) => {
  const [steps, setSteps] = useState<PipelineStepInstance[]>([
    makeStep(PDF_TOOLS[45]), // #46 Compress PDF
    makeStep(PDF_TOOLS[33]), // #34 Add Watermark
    makeStep(PDF_TOOLS[40]), // #41 Add Page Numbers
    makeStep(PDF_TOOLS[30]), // #31 Add Password / Encrypt
  ]);
  const [selectedToolIdToAdd, setSelectedToolIdToAdd] = useState<string>(PDF_TOOLS[42].id);
  const [customPresetName, setCustomPresetName] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const pipelineFileInputRef = useRef<HTMLInputElement>(null);

  const allTools = [...PDF_TOOLS, ...IMAGE_TOOLS].filter(
    (t) => (t.studio === 'pdf' || t.studio === 'image') && !(t.studio === 'pdf' && t.number === 57)
  );

  const handleAddStep = () => {
    if (steps.length >= 8) return;
    const found = allTools.find(
      (t) => t.id === selectedToolIdToAdd && (t.studio === 'pdf' || t.studio === 'image')
    );
    if (found) {
      setSteps((prev) => [...prev, makeStep(found)]);
    }
  };

  const handleDuplicateStep = (idx: number) => {
    if (steps.length >= 8) return;
    const target = steps[idx];
    if (!target) return;
    const duplicated = makeStep(target.tool, target.params);
    setSteps((prev) => {
      const next = [...prev];
      next.splice(idx + 1, 0, duplicated);
      return next;
    });
  };

  const handleRemoveStep = (idx: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleClearAllSteps = () => {
    setSteps([]);
  };

  const handleMoveStep = (idx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= steps.length) return;
    setSteps((prev) => {
      const next = [...prev];
      const [moved] = next.splice(idx, 1);
      next.splice(targetIdx, 0, moved);
      return next;
    });
  };

  const handleSwapStepTool = (idx: number, newToolId: string) => {
    const found = allTools.find((t) => t.id === newToolId);
    if (!found) return;
    setSteps((prev) =>
      prev.map((s, i) =>
        i === idx ? { ...s, tool: found, params: buildDefaultParams(found) } : s
      )
    );
  };

  const handleStepParamChange = (idx: number, key: string, value: any) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, params: { ...s.params, [key]: value } } : s))
    );
  };

  const handleToggleStepEnabled = (idx: number) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, enabled: s.enabled === false ? true : false } : s))
    );
  };

  const enabledSteps = steps.filter((s) => s.enabled !== false);

  const applyTemplate = (preset: 'secure' | 'archival' | 'image-web') => {
    if (preset === 'secure') {
      setSteps([
        makeStep(PDF_TOOLS[45]),
        makeStep(PDF_TOOLS[33]),
        makeStep(PDF_TOOLS[40]),
        makeStep(PDF_TOOLS[30]),
      ]);
    } else if (preset === 'archival') {
      setSteps([
        makeStep(PDF_TOOLS[38]),
        makeStep(PDF_TOOLS[42]),
        makeStep(PDF_TOOLS[50]),
        makeStep(PDF_TOOLS[21]),
      ]);
    } else {
      setSteps([
        makeStep(IMAGE_TOOLS[0]),
        makeStep(IMAGE_TOOLS[23]),
        makeStep(IMAGE_TOOLS[28]),
        makeStep(IMAGE_TOOLS[10]),
      ]);
    }
  };

  const handleLoadSavedPreset = (preset: SavedPipelinePreset) => {
    const hydrated: PipelineStepInstance[] = preset.steps
      .map((s) => {
        const matchedTool = allTools.find((t) => t.id === s.tool?.id) || s.tool;
        if (!matchedTool) return null;
        return makeStep(matchedTool, s.params);
      })
      .filter(Boolean) as PipelineStepInstance[];
    if (hydrated.length > 0) {
      setSteps(hydrated);
    }
  };

  const handleSavePresetClick = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = customPresetName.trim();
    if (!cleanName || steps.length === 0 || !onSaveCustomPreset) return;
    onSaveCustomPreset(cleanName, steps);
    setCustomPresetName('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
            Tool #57 · Customizable Sequential Automation Engine
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
            01. Automated Multi-Tool Pipelines
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Upload or drag-and-drop your input file, compose up to 8 custom steps, save reusable pipeline presets, and execute end-to-end.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => applyTemplate('secure')}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Preset: Secure PDF
          </button>
          <button
            type="button"
            onClick={() => applyTemplate('archival')}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Preset: Archival PDF/A
          </button>
          <button
            type="button"
            onClick={() => applyTemplate('image-web')}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Preset: Web Image
          </button>
          {steps.length > 0 && (
            <button
              type="button"
              onClick={handleClearAllSteps}
              className="px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-950/70 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1"
            >
              <XCircle className="w-3.5 h-3.5" />
              Clear All Steps
            </button>
          )}
        </div>
      </div>

      {/* Custom Saved Pipeline Presets Bar (Per-User Persisted) */}
      {onSaveCustomPreset && (
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <BookmarkPlus className="w-3.5 h-3.5 text-blue-500" />
                <span>Saved Custom Pipeline Presets</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Save your current step chain and inline parameters to your personal account profile for 1-click reuse.
              </p>
            </div>

            <form onSubmit={handleSavePresetClick} className="flex items-center gap-2">
              <input
                type="text"
                value={customPresetName}
                onChange={(e) => setCustomPresetName(e.target.value)}
                placeholder="Name this pipeline (e.g., Legal Release)..."
                aria-label="Custom pipeline preset name"
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 min-w-[210px]"
              />
              <button
                type="submit"
                disabled={!customPresetName.trim() || steps.length === 0}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                <span>Save Preset</span>
              </button>
            </form>
          </div>

          {customPresets.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              {customPresets.map((preset) => (
                <div
                  key={preset.id}
                  className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                >
                  <button
                    type="button"
                    onClick={() => handleLoadSavedPreset(preset)}
                    className="font-medium text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    {preset.name} ({preset.steps.length} steps)
                  </button>
                  {onDeleteCustomPreset && (
                    <button
                      type="button"
                      onClick={() => onDeleteCustomPreset(preset.id)}
                      aria-label={`Delete preset ${preset.name}`}
                      className="p-1 text-slate-400 hover:text-rose-500 rounded"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Isolated Pipeline File Input Card with Drag-and-Drop */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setIsDragOver(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            await onUploadPipelineFiles(e.dataTransfer.files);
          }
        }}
        className={`p-4 bg-white dark:bg-slate-900 border rounded-xl space-y-3 transition-colors ${
          isDragOver
            ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/20'
            : 'border-slate-200 dark:border-slate-800'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <FolderOpen className="w-4 h-4 text-blue-500 shrink-0" />
            <div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                Pipeline Input Document(s) · Drag &amp; Drop Enabled
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Drop or upload the PDF or Image file(s) you want this pipeline to process (isolated from individual Studio tools).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={pipelineFileInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.html,.md,.txt,.csv,.xml,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,.tiff,.tif"
              onChange={async (e) => {
                if (e.target.files && e.target.files.length > 0) {
                  await onUploadPipelineFiles(e.target.files);
                }
                e.target.value = '';
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => pipelineFileInputRef.current?.click()}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Input File(s)</span>
            </button>
            {pipelineFiles.length > 0 && (
              <button
                type="button"
                onClick={onClearPipelineFiles}
                className="px-2.5 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline whitespace-nowrap shrink-0"
              >
                Clear Files
              </button>
            )}
          </div>
        </div>

        {pipelineFiles.length === 0 ? (
          <div className="p-4 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg text-center text-xs text-slate-500 dark:text-slate-400">
            Drag and drop PDF or Image files here, or click Upload Input File(s) above before clicking Execute.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50/70 dark:bg-slate-950/60">
            {pipelineFiles.map((f, idx) => (
              <div key={f.id} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                    #{idx + 1} · {f.kind.toUpperCase()}
                  </span>
                  <span className="font-mono font-medium text-slate-800 dark:text-slate-200 truncate">
                    {f.name}
                  </span>
                  <span className="font-mono text-[11px] text-slate-400 shrink-0 tabular-nums">
                    {(f.sizeBytes / 1024).toFixed(1)} KB
                    {f.pageCount ? ` · ${f.pageCount}p` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onRemovePipelineFile(f.id)}
                  aria-label={`Remove ${f.name} from pipeline`}
                  className="p-1 text-slate-400 hover:text-rose-500 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Customizable Pipeline Steps Chain with Inline Parameters */}
      {steps.length === 0 ? (
        <div className="p-8 bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-center space-y-2">
          <Layers className="w-7 h-7 text-slate-400 mx-auto" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Pipeline is empty
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Add tools below or load a preset template to build your custom pipeline.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {steps.map((step, idx) => {
            const isStepEnabled = step.enabled !== false;
            return (
            <div
              key={step.uid}
              className={`p-4 bg-white dark:bg-slate-900 border rounded-xl flex flex-col justify-between gap-4 transition-opacity ${
                isStepEnabled
                  ? 'border-slate-200 dark:border-slate-800'
                  : 'border-dashed border-slate-300 dark:border-slate-800 opacity-60'
              }`}
            >
              <div className="space-y-3">
                {/* Step Header & Order Controls */}
                <div className="flex items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isStepEnabled}
                      onChange={() => handleToggleStepEnabled(idx)}
                      aria-label={`Toggle step ${idx + 1} enabled`}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                      STEP {String(idx + 1).padStart(2, '0')} · {step.tool.studio.toUpperCase()} #{step.tool.number}
                      {!isStepEnabled ? ' (BYPASSED)' : ''}
                    </span>
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveStep(idx, 'up')}
                      aria-label={`Move step ${idx + 1} up`}
                      title="Move Step Up"
                      className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 disabled:opacity-30"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === steps.length - 1}
                      onClick={() => handleMoveStep(idx, 'down')}
                      aria-label={`Move step ${idx + 1} down`}
                      title="Move Step Down"
                      className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 disabled:opacity-30"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={steps.length >= 8}
                      onClick={() => handleDuplicateStep(idx)}
                      aria-label={`Duplicate step ${idx + 1}`}
                      title="Duplicate Step"
                      className="p-1 text-slate-400 hover:text-blue-500 disabled:opacity-30"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveStep(idx)}
                      aria-label={`Remove step ${idx + 1}`}
                      title="Remove Step"
                      className="p-1 text-slate-400 hover:text-rose-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Inline Tool Selector */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Assigned Tool
                  </label>
                  <select
                    value={step.tool.id}
                    onChange={(e) => handleSwapStepTool(idx, e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100"
                  >
                    {allTools.map((t) => (
                      <option key={t.id} value={t.id}>
                        [{t.studio.toUpperCase()} #{t.number}] {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Inline Step Parameter Controls */}
                {step.tool.params.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-2.5">
                    {step.tool.params.map((param) => {
                      const val = step.params[param.key] ?? param.defaultValue;
                      return (
                        <div key={param.key} className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-600 dark:text-slate-400 font-medium">
                              {param.label}
                            </span>
                            {param.type === 'range' && (
                              <span className="font-mono text-blue-500 tabular-nums">{val}</span>
                            )}
                          </div>

                          {param.type === 'select' && (
                            <select
                              value={String(val)}
                              onChange={(e) => handleStepParamChange(idx, param.key, e.target.value)}
                              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md px-2 py-1 text-xs text-slate-900 dark:text-slate-100"
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
                              type="range"
                              min={param.min ?? 0}
                              max={param.max ?? 100}
                              step={param.step ?? 1}
                              value={Number(val)}
                              onChange={(e) => handleStepParamChange(idx, param.key, Number(e.target.value))}
                              className="w-full accent-blue-600"
                            />
                          )}

                          {param.type === 'number' && (
                            <input
                              type="number"
                              min={param.min}
                              max={param.max}
                              value={Number(val)}
                              onChange={(e) => handleStepParamChange(idx, param.key, Number(e.target.value))}
                              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md px-2 py-1 text-xs font-mono text-slate-900 dark:text-slate-100"
                            />
                          )}

                          {param.type === 'text' && (
                            <input
                              type="text"
                              value={String(val)}
                              placeholder={param.placeholder}
                              onChange={(e) => handleStepParamChange(idx, param.key, e.target.value)}
                              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md px-2 py-1 text-xs text-slate-900 dark:text-slate-100"
                            />
                          )}

                          {param.type === 'color' && (
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={String(val)}
                                onChange={(e) => handleStepParamChange(idx, param.key, e.target.value)}
                                className="h-6 w-10 rounded border border-slate-300 dark:border-slate-700 bg-transparent cursor-pointer"
                              />
                              <span className="text-[11px] font-mono text-slate-500">{String(val)}</span>
                            </div>
                          )}

                          {param.type === 'boolean' && (
                            <label className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={Boolean(val)}
                                onChange={(e) => handleStepParamChange(idx, param.key, e.target.checked)}
                                className="rounded border-slate-300 text-blue-600"
                              />
                              <span>Enabled</span>
                            </label>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-400 font-mono truncate">
                Engine: {step.tool.engineLabel}
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* Add Step & Execute Bar */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          <label htmlFor="pipeline-add-select" className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
            Append Tool ({steps.length}/8):
          </label>
          <select
            id="pipeline-add-select"
            value={selectedToolIdToAdd}
            onChange={(e) => setSelectedToolIdToAdd(e.target.value)}
            className="flex-1 min-w-[200px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
          >
            {allTools.map((t) => (
              <option key={t.id} value={t.id}>
                [{t.studio.toUpperCase()} #{t.number}] {t.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAddStep}
            disabled={steps.length >= 8}
            className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Step
          </button>
        </div>

        <button
          type="button"
          onClick={() => onRunPipeline(enabledSteps)}
          disabled={isRunning || enabledSteps.length === 0}
          className="px-5 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
        >
          <Play className="w-4 h-4" />
          {isRunning ? 'Executing Pipeline...' : `Execute ${enabledSteps.length}-Step Pipeline`}
        </button>
      </div>

      {/* Pipeline Output Summary + Preview/Download */}
      {lastSummary && (
        <div className="p-4 bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3 text-xs text-emerald-900 dark:text-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <span>{lastSummary}</span>
          </div>
          {lastResultOutput && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onOpenOutputPreview(lastResultOutput)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:border-blue-500 rounded-lg flex items-center gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" />
                Open / Preview
              </button>
              <button
                type="button"
                onClick={() => onDownloadOutputItem(lastResultOutput)}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface SystemAndLogsViewProps {
  importedFiles: ImportedHistoryItem[];
  completedOutputs: CompletedOutputHistoryItem[];
  logs: AuditLogEntry[];
  onPreviewImported: (item: ImportedHistoryItem) => void;
  onDownloadImported: (item: ImportedHistoryItem) => void;
  onRemoveImported: (id: string) => void;
  onPreviewCompleted: (item: CompletedOutputHistoryItem) => void;
  onDownloadCompleted: (item: CompletedOutputHistoryItem) => void;
  onRemoveCompleted: (id: string) => void;
  onClearHistory: () => void;
}

export const SystemAndLogsView: React.FC<SystemAndLogsViewProps> = ({
  importedFiles,
  completedOutputs,
  logs,
  onPreviewImported,
  onDownloadImported,
  onRemoveImported,
  onPreviewCompleted,
  onDownloadCompleted,
  onRemoveCompleted,
  onClearHistory,
}) => {
  const [filterText, setFilterText] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'pdf' | 'image' | 'zip'>('all');
  const [bundlingZip, setBundlingZip] = useState(false);

  const handleExportLogsCsv = () => {
    const header =
      'Timestamp,Studio,Tool_Number,Tool_Name,Input_File,Input_Bytes,Output_File,Output_Bytes,Duration_ms,Status';
    const rows = logs.map(
      (l) =>
        `${l.timestamp},${l.studio},${l.toolNumber},"${l.toolName}","${l.inputName}",${l.inputBytes},"${l.outputName}",${l.outputBytes},${l.durationMs},${l.status}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'forma_studio_history_log.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAllCompletedZip = async () => {
    if (completedOutputs.length === 0) return;
    setBundlingZip(true);
    try {
      const zip = new JSZip();
      completedOutputs.forEach((item, idx) => {
        const safeName = `${String(idx + 1).padStart(2, '0')}_${item.fileName}`;
        zip.file(safeName, item.outputBytes);
      });
      const zipBytes = await zip.generateAsync({ type: 'uint8array' });
      const blob = new Blob([zipBytes as unknown as BlobPart], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `forma_studio_completed_outputs_${completedOutputs.length}_files.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBundlingZip(false);
    }
  };

  const q = filterText.trim().toLowerCase();
  const visibleImports = importedFiles.filter((item) => {
    if (typeFilter === 'pdf' && item.kind !== 'pdf') return false;
    if (typeFilter === 'image' && item.kind !== 'image') return false;
    if (typeFilter === 'zip' && !item.name.toLowerCase().endsWith('.zip')) return false;
    return (
      !q ||
      item.name.toLowerCase().includes(q) ||
      item.sourceToolName.toLowerCase().includes(q)
    );
  });

  const visibleCompleted = completedOutputs.filter((item) => {
    const lowerName = item.fileName.toLowerCase();
    const isPdf = item.mimeType === 'application/pdf' || lowerName.endsWith('.pdf');
    const isImage = item.mimeType.startsWith('image/');
    const isZip =
      item.mimeType === 'application/zip' ||
      lowerName.endsWith('.zip') ||
      (!isPdf && !isImage);

    if (typeFilter === 'pdf' && !isPdf) return false;
    if (typeFilter === 'image' && !isImage) return false;
    if (typeFilter === 'zip' && !isZip) return false;

    return (
      !q ||
      item.fileName.toLowerCase().includes(q) ||
      item.toolName.toLowerCase().includes(q) ||
      item.summary.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-8">
      {/* Header & Search/Filter/Export Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
            Studio Workspace Vault · User Files &amp; Completed Deliverables
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
            History &amp; Completed Outputs
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* File-Type Filter Segmented Control */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'pdf', label: 'PDF' },
                { id: 'image', label: 'Image' },
                { id: 'zip', label: 'ZIP / Other' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTypeFilter(tab.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  typeFilter === tab.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Search filename or tool..."
              aria-label="Filter history items"
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
            />
          </div>

          <button
            type="button"
            onClick={handleExportLogsCsv}
            disabled={logs.length === 0}
            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Export Log CSV
          </button>
          <button
            type="button"
            onClick={onClearHistory}
            disabled={importedFiles.length === 0 && completedOutputs.length === 0}
            className="px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/60 disabled:opacity-40 rounded-lg whitespace-nowrap shrink-0"
          >
            Clear All History
          </button>
        </div>
      </div>

      {/* TOP SECTION: 1. Imported Studio Documents */}
      <section className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-blue-500" />
              <span>1. Imported Studio Documents</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Original files uploaded by you during your workspace sessions. Pre-loaded samples are never added here.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {visibleImports.length} file(s)
          </span>
        </div>

        {visibleImports.length === 0 ? (
          <div className="p-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-center text-xs text-slate-500 dark:text-slate-400">
            No matching imported documents. Upload a file inside any PDF Studio, Image Studio, or Pipeline tool to track it here.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            {visibleImports.map((item) => (
              <div
                key={item.id}
                className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/40 dark:bg-slate-950/30 hover:bg-slate-50 dark:hover:bg-slate-800/30"
              >
                <div className="flex items-start gap-3 min-w-0">
                  {item.kind === 'pdf' ? (
                    <FileText className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  ) : (
                    <ImageIcon className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-semibold font-mono text-slate-900 dark:text-slate-100 truncate">
                      {item.name}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5 tabular-nums">
                      {(item.sizeBytes / 1024).toFixed(1)} KB
                      {item.pageCount ? ` · ${item.pageCount} pages` : ''}
                      {item.dimensions ? ` · ${item.dimensions}` : ''}
                      {` · Uploaded to ${item.sourceToolName} at ${item.uploadedAt}`}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onPreviewImported(item)}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-500 rounded-lg flex items-center gap-1"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => onDownloadImported(item)}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-500 rounded-lg flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveImported(item.id)}
                    aria-label={`Remove ${item.name} from history`}
                    className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* BOTTOM SECTION: 2. Completed Work / Processed Outputs */}
      <section className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>2. Completed Work / Processed Outputs</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Generated PDFs, images, ZIP bundles, and pipeline results ready to inspect or download anytime.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            {completedOutputs.length >= 2 && (
              <button
                type="button"
                onClick={handleDownloadAllCompletedZip}
                disabled={bundlingZip}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>
                  {bundlingZip
                    ? 'Bundling ZIP...'
                    : `Download All (${completedOutputs.length}) as .ZIP`}
                </span>
              </button>
            )}
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {visibleCompleted.length} output(s)
            </span>
          </div>
        </div>

        {visibleCompleted.length === 0 ? (
          <div className="p-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-center text-xs text-slate-500 dark:text-slate-400">
            No matching completed outputs. Run any PDF tool, Image filter, or Automated Pipeline to store results here.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            {visibleCompleted.map((item) => (
              <div
                key={item.id}
                className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-50/20 dark:bg-emerald-950/10 hover:bg-slate-50 dark:hover:bg-slate-800/30"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 font-semibold">
                      {item.studio} #{item.toolNumber} · {item.toolName}
                    </span>
                    <span aria-hidden="true" className="text-slate-400">·</span>
                    <span className="text-xs font-semibold font-mono text-slate-900 dark:text-slate-100 truncate">
                      {item.fileName}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400">
                    {item.summary}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                    {(item.sizeBytes / 1024).toFixed(1)} KB
                    {item.pageCount ? ` · ${item.pageCount} pages` : ''}
                    {` · Completed at ${item.completedAt}`}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onPreviewCompleted(item)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-500 rounded-lg flex items-center gap-1"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => onDownloadCompleted(item)}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveCompleted(item.id)}
                    aria-label={`Remove ${item.fileName} from outputs`}
                    className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
