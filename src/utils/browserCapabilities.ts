// Polite Browser Capabilities Helper for Forma Studio
// Strictly avoids camera, microphone, or geolocation permissions.
// Provides:
// 1. User-gesture-initiated Web Notification API completion alerts (never prompts on page load)
// 2. Clipboard API writeText / readText with graceful iframe & permission-denied fallbacks

export type NotificationPermState = 'granted' | 'denied' | 'default' | 'unsupported';

export function getNotificationPermissionState(): NotificationPermState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    return window.Notification.permission as NotificationPermState;
  } catch {
    return 'unsupported';
  }
}

/**
 * Requests browser Notification permission ONLY when explicitly triggered by a user gesture
 * (such as clicking "Enable Completion Alerts" or starting a batch/tool task while alerts are enabled).
 */
export async function requestCompletionNotificationPermission(): Promise<NotificationPermState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const current = window.Notification.permission;
    if (current === 'granted' || current === 'denied') {
      return current;
    }
    const result = await window.Notification.requestPermission();
    return (result as NotificationPermState) || 'default';
  } catch {
    return 'unsupported';
  }
}

export interface CompletionNotificationPayload {
  studio: 'PDF' | 'IMAGE' | 'PIPELINE';
  toolName: string;
  fileName: string;
  isMultiFile?: boolean;
  enabledByUser: boolean;
}

export function formatCompletionNotificationMessage(payload: CompletionNotificationPayload): {
  title: string;
  body: string;
} {
  const studioNoun =
    payload.studio === 'PDF'
      ? 'PDF'
      : payload.studio === 'IMAGE'
      ? 'image'
      : 'pipeline output';
  const batchPrefix = payload.isMultiFile ? 'Batch job complete — ' : '';
  return {
    title: `Forma Studio — Ready: Your processed ${studioNoun} is ready to download.`,
    body: `${batchPrefix}${payload.toolName} finished producing "${payload.fileName}".`,
  };
}

/**
 * Fires a clean desktop/mobile Web Notification when a PDF, Image, or Automated Pipeline job completes
 * (when the user has enabled Completion Alerts or when the tab is in the background with granted permission).
 */
export function sendCompletionNotification(payload: CompletionNotificationPayload): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  const isTabHidden =
    typeof document !== 'undefined' && document.visibilityState === 'hidden';
  if (!payload.enabledByUser && !isTabHidden) {
    return false;
  }
  if (window.Notification.permission !== 'granted') {
    return false;
  }

  const { title, body } = formatCompletionNotificationMessage(payload);
  try {
    const notif = new window.Notification(title, {
      body,
      tag: `forma-complete-${Date.now()}`,
      silent: false,
    });
    notif.onclick = () => {
      try {
        window.focus();
        notif.close();
      } catch {
        // Ignore focus restrictions
      }
    };
    return true;
  } catch {
    return false;
  }
}

/**
 * Copies text to the clipboard using standard `navigator.clipboard.writeText`,
 * with a graceful DOM textarea fallback if Clipboard API permission is restricted in an iframe.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand fallback
    }
  }
  if (typeof document !== 'undefined') {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'true');
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Reads plain text from the clipboard using standard `navigator.clipboard.readText`
 * with graceful fallback if permission is denied or unsupported by the browser.
 */
export async function readTextFromClipboard(): Promise<{
  ok: boolean;
  text: string;
  error?: string;
}> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
    try {
      const text = await navigator.clipboard.readText();
      return { ok: true, text: text || '' };
    } catch {
      return {
        ok: false,
        text: '',
        error: 'Clipboard read access was declined or blocked by the browser. Use Ctrl+V / Cmd+V to paste directly.',
      };
    }
  }
  return {
    ok: false,
    text: '',
    error: 'Clipboard read API is not supported in this browser context. Use Ctrl+V / Cmd+V to paste directly.',
  };
}
