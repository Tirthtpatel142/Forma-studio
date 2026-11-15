import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  X,
  ArrowRight,
  FileText,
  Image as ImageIcon,
  Calculator,
  Star,
  Clock,
} from 'lucide-react';
import {
  StudioTool,
  searchStudioTools,
  PDF_TOOLS,
  IMAGE_TOOLS,
  EXTRA_TOOLS,
} from '../data/toolsCatalog';

interface CommandSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTool: (tool: StudioTool) => void;
  pinnedToolIds?: string[];
  recentToolIds?: string[];
  onTogglePinTool?: (toolId: string, e?: React.MouseEvent) => void;
}

const ALL_STUDIO_TOOLS: StudioTool[] = [...PDF_TOOLS, ...IMAGE_TOOLS, ...EXTRA_TOOLS];

export const CommandSearchModal: React.FC<CommandSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectTool,
  pinnedToolIds = [],
  recentToolIds = [],
  onTogglePinTool,
}) => {
  const [query, setQuery] = useState('');
  const [studioFilter, setStudioFilter] = useState<'all' | 'pdf' | 'image' | 'extra'>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 40);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const results = searchStudioTools(
    query,
    studioFilter === 'all' ? undefined : studioFilter
  );

  const pinnedTools = pinnedToolIds
    .map((id) => ALL_STUDIO_TOOLS.find((t) => t.id === id))
    .filter((t): t is StudioTool => Boolean(t));

  const recentTools = recentToolIds
    .map((id) => ALL_STUDIO_TOOLS.find((t) => t.id === id))
    .filter((t): t is StudioTool => Boolean(t));

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-12 sm:pt-16 px-4 bg-slate-950/75 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Global Studio Tool Search"
    >
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all 159 tools across PDF, Image & Calculator and Converter Studio (e.g., Bates, Invoice, Duotone, EMI, Graphing)..."
            aria-label="Search studio tools"
            className="w-full bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search modal"
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-1 p-0.5 bg-slate-200/70 dark:bg-slate-800 rounded-lg overflow-x-auto max-w-full">
            {(['all', 'pdf', 'image', 'extra'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStudioFilter(tab)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  studioFilter === tab
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tab === 'all'
                  ? 'All 159 Tools'
                  : tab === 'pdf'
                  ? 'PDF Studio (66)'
                  : tab === 'image'
                  ? 'Image Studio (55)'
                  : 'Calculator & Converter Studio (38)'}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {results.length} matching tools
          </span>
        </div>

        {/* Quick-Access Pinned & Recent Tools Strip (When query is empty) */}
        {!query.trim() && (pinnedTools.length > 0 || recentTools.length > 0) && (
          <div className="px-4 py-2.5 bg-slate-50/70 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800 space-y-2">
            {pinnedTools.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1 mr-1">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  <span>Pinned:</span>
                </span>
                {pinnedTools.slice(0, 6).map((t) => (
                  <button
                    key={`pin-chip-${t.id}`}
                    type="button"
                    onClick={() => {
                      onSelectTool(t);
                      onClose();
                    }}
                    className="px-2 py-0.5 text-[11px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800/70 rounded-md hover:border-amber-400 transition-colors"
                  >
                    #{String(t.number).padStart(2, '0')} {t.name}
                  </button>
                ))}
              </div>
            )}

            {recentTools.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1 mr-1">
                  <Clock className="w-3 h-3 text-blue-500" />
                  <span>Recent:</span>
                </span>
                {recentTools.slice(0, 5).map((t) => (
                  <button
                    key={`recent-chip-${t.id}`}
                    type="button"
                    onClick={() => {
                      onSelectTool(t);
                      onClose();
                    }}
                    className="px-2 py-0.5 text-[11px] font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-md hover:border-blue-500 transition-colors"
                  >
                    #{String(t.number).padStart(2, '0')} {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70">
          {results.map((tool) => {
            const isPinned = pinnedToolIds.includes(tool.id);
            return (
              <div
                key={tool.id}
                onClick={() => {
                  onSelectTool(tool);
                  onClose();
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectTool(tool);
                    onClose();
                  }
                }}
                className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors group cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-0.5">
                    {tool.studio === 'pdf' ? (
                      <FileText className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    ) : tool.studio === 'image' ? (
                      <ImageIcon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    ) : (
                      <Calculator className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    )}
                    <span className="font-mono tabular-nums">
                      {tool.studio === 'extra' ? 'CALC & CONVERTER' : tool.studio.toUpperCase()} #
                      {String(tool.number).padStart(2, '0')}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{tool.categoryName}</span>
                    <span aria-hidden="true">·</span>
                    <span>{tool.executionMode}</span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {tool.name}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {tool.shortDesc}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {onTogglePinTool && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTogglePinTool(tool.id, e);
                      }}
                      aria-label={isPinned ? `Unpin ${tool.name}` : `Pin ${tool.name}`}
                      className="p-1.5 rounded-lg hover:bg-slate-200/70 dark:hover:bg-slate-700 transition-colors"
                    >
                      <Star
                        className={`w-4 h-4 ${
                          isPinned
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-slate-300 dark:text-slate-600 hover:text-amber-400'
                        }`}
                      />
                    </button>
                  )}
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-500 shrink-0 transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
            );
          })}
          {results.length === 0 && (
            <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
              No tools matched &ldquo;{query}&rdquo;. Try searching by keyword or tool number (159 tools across all studios).
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
