import type { PipelineStepInstance, PipelineInputFile, AuditLogEntry, ImportedHistoryItem, CompletedOutputHistoryItem } from '../components/PipelinesAndSystemView';

export interface SavedPipelinePreset {
  id: string;
  name: string;
  createdAt: string;
  steps: PipelineStepInstance[];
}

export interface CalcHistoryEntry {
  id: string;
  toolId: string;
  toolName: string;
  timestamp: string;
  summaryLabel: string;
  resultValue: string;
  stateSnapshot: Record<string, any>;
}

export interface UserPreferencesPayload {
  pinnedToolIds: string[];
  recentToolIds?: string[];
  customPipelinePresets: SavedPipelinePreset[];
  savedToolParamPresets: Record<string, Record<string, any>>;
  calcHistoryByToolId: Record<string, CalcHistoryEntry[]>;
}

export interface UserWorkspaceSnapshot {
  filesByToolId: Record<string, any[]>;
  selectedIdsByToolId: Record<string, string[]>;
  activeFileIdByToolId: Record<string, string | null>;
  resultByToolId: Record<string, any>;
  stampImages: any[];
  selectedStampImageId: string;
  importedHistory: ImportedHistoryItem[];
  completedOutputs: CompletedOutputHistoryItem[];
  auditLogs: AuditLogEntry[];
  pipelineFiles: PipelineInputFile[];
  pipelineSummary: string | null;
  pipelineLastResult: CompletedOutputHistoryItem | null;
}

const DB_NAME = 'FormaStudioUserDB_v1';
const STORE_NAME = 'user_workspaces';

// In-memory fallback store for environments without localStorage/IndexedDB (e.g. unit tests)
const memoryPrefsStore = new Map<string, string>();
const memoryWorkspaceStore = new Map<string, UserWorkspaceSnapshot>();

export function getUserStorageKey(uid: string, suffix: string): string {
  const safeUid = String(uid || '').trim();
  if (!safeUid) {
    throw new Error('Cannot access user storage without a valid user.uid');
  }
  return `forma_user_${safeUid}_${suffix}`;
}

export function createEmptyUserPreferences(): UserPreferencesPayload {
  return {
    pinnedToolIds: [],
    recentToolIds: [],
    customPipelinePresets: [],
    savedToolParamPresets: {},
    calcHistoryByToolId: {},
  };
}

export function createEmptyUserWorkspace(): UserWorkspaceSnapshot {
  return {
    filesByToolId: {},
    selectedIdsByToolId: {},
    activeFileIdByToolId: {},
    resultByToolId: {},
    stampImages: [],
    selectedStampImageId: '',
    importedHistory: [],
    completedOutputs: [],
    auditLogs: [],
    pipelineFiles: [],
    pipelineSummary: null,
    pipelineLastResult: null,
  };
}

export function saveUserPreferences(uid: string, prefs: UserPreferencesPayload): void {
  if (!uid) return;
  const key = getUserStorageKey(uid, 'prefs_v1');
  const serialized = JSON.stringify(prefs);
  memoryPrefsStore.set(key, serialized);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(key, serialized);
    } catch {
      // Ignore quota errors
    }
  }
}

export function loadUserPreferences(uid: string): UserPreferencesPayload {
  if (!uid) return createEmptyUserPreferences();
  const key = getUserStorageKey(uid, 'prefs_v1');
  let raw: string | null = null;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      raw = null;
    }
  }
  if (!raw && memoryPrefsStore.has(key)) {
    raw = memoryPrefsStore.get(key) || null;
  }
  if (!raw) return createEmptyUserPreferences();
  try {
    const parsed = JSON.parse(raw);
    return {
      pinnedToolIds: Array.isArray(parsed.pinnedToolIds) ? parsed.pinnedToolIds : [],
      recentToolIds: Array.isArray(parsed.recentToolIds) ? parsed.recentToolIds : [],
      customPipelinePresets: Array.isArray(parsed.customPipelinePresets)
        ? parsed.customPipelinePresets
        : [],
      savedToolParamPresets:
        parsed.savedToolParamPresets && typeof parsed.savedToolParamPresets === 'object'
          ? parsed.savedToolParamPresets
          : {},
      calcHistoryByToolId:
        parsed.calcHistoryByToolId && typeof parsed.calcHistoryByToolId === 'object'
          ? parsed.calcHistoryByToolId
          : {},
    };
  } catch {
    return createEmptyUserPreferences();
  }
}

function openWorkspaceDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveUserWorkspaceSnapshot(
  uid: string,
  snapshot: UserWorkspaceSnapshot
): Promise<void> {
  if (!uid) return;
  const key = getUserStorageKey(uid, 'workspace_v1');
  memoryWorkspaceStore.set(key, structuredClone ? structuredClone(snapshot) : snapshot);

  const db = await openWorkspaceDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(snapshot, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export async function loadUserWorkspaceSnapshot(uid: string): Promise<UserWorkspaceSnapshot> {
  if (!uid) return createEmptyUserWorkspace();
  const key = getUserStorageKey(uid, 'workspace_v1');

  const db = await openWorkspaceDb();
  if (db) {
    const fromIdb = await new Promise<UserWorkspaceSnapshot | null>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const getReq = store.get(key);
        getReq.onsuccess = () => {
          db.close();
          resolve((getReq.result as UserWorkspaceSnapshot) || null);
        };
        getReq.onerror = () => {
          db.close();
          resolve(null);
        };
      } catch {
        db.close();
        resolve(null);
      }
    });
    if (fromIdb) {
      return {
        ...createEmptyUserWorkspace(),
        ...fromIdb,
      };
    }
  }

  const fromMem = memoryWorkspaceStore.get(key);
  if (fromMem) {
    return {
      ...createEmptyUserWorkspace(),
      ...(structuredClone ? structuredClone(fromMem) : fromMem),
    };
  }

  return createEmptyUserWorkspace();
}
