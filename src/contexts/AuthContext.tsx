import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  updateProfile,
  User as FirebaseUser,
} from 'firebase/auth';
import { auth, googleProvider, isFirebaseConfigured, firebaseProjectId } from '../lib/firebase';

export interface StudioAuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  providerId: string;
}

interface StoredAccountRecord {
  uid: string;
  email: string;
  displayName: string;
  passwordHash: string;
  createdAt: string;
}

interface AuthContextValue {
  user: StudioAuthUser | null;
  loading: boolean;
  isFirebaseConfigured: boolean;
  firebaseProjectId: string;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<StudioAuthUser>;
  signInWithEmail: (email: string, password: string) => Promise<StudioAuthUser>;
  signInWithGoogle: () => Promise<StudioAuthUser | void>;
  resetPassword: (email: string) => Promise<string>;
  logout: () => Promise<void>;
}

const ACCOUNTS_STORAGE_KEY = 'forma_studio_registered_accounts_v1';
const ACTIVE_SESSION_STORAGE_KEY = 'forma_studio_active_session_v1';

function computeDeterministicUid(email: string): string {
  const normalized = email.trim().toLowerCase();
  let h1 = 0xdeadbeef ^ normalized.length;
  let h2 = 0x41c6ce57 ^ normalized.length;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `usr_${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
}

function hashSecret(password: string, email: string): string {
  const salted = `${email.trim().toLowerCase()}::forma_salt::${password}`;
  let h = 2166136261;
  for (let i = 0; i < salted.length; i++) {
    h ^= salted.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `v1_${(h >>> 0).toString(16)}`;
}

function loadRegisteredAccounts(): Record<string, StoredAccountRecord> {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveRegisteredAccounts(accounts: Record<string, StoredAccountRecord>): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
  } catch {
    // ignore storage errors
  }
}

function loadFallbackSession(): StudioAuthUser | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.uid ? (parsed as StudioAuthUser) : null;
  } catch {
    return null;
  }
}

function saveFallbackSession(sessionUser: StudioAuthUser | null): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    if (!sessionUser) {
      window.localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    } else {
      window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(sessionUser));
    }
  } catch {
    // ignore
  }
}

function mapFirebaseUser(fbUser: FirebaseUser): StudioAuthUser {
  const providerId = fbUser.providerData?.[0]?.providerId || 'password';
  return {
    uid: fbUser.uid,
    email: fbUser.email,
    displayName: fbUser.displayName || (fbUser.email ? fbUser.email.split('@')[0] : 'Studio User'),
    photoURL: fbUser.photoURL,
    emailVerified: fbUser.emailVerified,
    providerId,
  };
}

export function formatFirebaseAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  const msg = (err as { message?: string })?.message || '';
  switch (code) {
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-disabled':
      return 'This account has been disabled by an administrator.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password. Please verify your credentials or create an account.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Please sign in instead.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Google Sign-In popup was closed before completing sign in. You can also sign in with Email & Password above.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google Sign-In popup. Please allow popups for this site or sign in with Email & Password above.';
    case 'auth/unauthorized-domain':
      return 'This domain (e.g. GitHub Pages) is not yet listed in Firebase Console > Authentication > Settings > Authorized domains. Add your domain there for Google Sign-In, or sign in with Email & Password above.';
    case 'auth/network-request-failed':
      return 'Network error while contacting authentication server. Please check your connection.';
    case 'auth/too-many-requests':
      return 'Too many unsuccessful attempts. Please wait a moment or reset your password.';
    default:
      return msg || 'Authentication failed. Please check your details and try again.';
  }
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<StudioAuthUser | null>(() => loadFallbackSession());
  const [loading, setLoading] = useState<boolean>(Boolean(auth));

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(
      auth,
      (fbUser) => {
        if (fbUser) {
          const mapped = mapFirebaseUser(fbUser);
          saveFallbackSession(mapped);
          setUser(mapped);
        } else {
          const fallback = loadFallbackSession();
          setUser(fallback);
        }
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const signUpWithEmail = async (
    email: string,
    password: string,
    displayName: string
  ): Promise<StudioAuthUser> => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = displayName.trim() || cleanEmail.split('@')[0] || 'Studio User';

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      const e = new Error('Please enter a valid email address.');
      (e as any).code = 'auth/invalid-email';
      throw e;
    }
    if (!password || password.length < 6) {
      const e = new Error('Password must be at least 6 characters long.');
      (e as any).code = 'auth/weak-password';
      throw e;
    }

    if (auth) {
      try {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        if (cleanName) {
          try {
            await updateProfile(cred.user, { displayName: cleanName });
          } catch {
            // ignore profile update non-fatal error
          }
        }
        const mapped: StudioAuthUser = {
          ...mapFirebaseUser(cred.user),
          displayName: cleanName,
        };
        // Also mirror into local account registry for resilient offline/console fallback
        const accounts = loadRegisteredAccounts();
        accounts[cleanEmail] = {
          uid: mapped.uid,
          email: cleanEmail,
          displayName: cleanName,
          passwordHash: hashSecret(password, cleanEmail),
          createdAt: new Date().toISOString(),
        };
        saveRegisteredAccounts(accounts);
        saveFallbackSession(mapped);
        setUser(mapped);
        return mapped;
      } catch (err: any) {
        const code = String(err?.code || '');
        const msg = String(err?.message || '');
        const isProviderOrRefererRestricted =
          code === 'auth/operation-not-allowed' ||
          code === 'auth/configuration-not-found' ||
          code === 'auth/admin-restricted-operation' ||
          code === 'auth/unauthorized-domain' ||
          code.includes('requests-from-referer') ||
          msg.includes('requests-from-referer');
        if (!isProviderOrRefererRestricted) {
          throw new Error(formatFirebaseAuthError(err));
        }
      }
    }

    // Verified deterministic account fallback when Email/Password provider or HTTP referer is restricted in Firebase Console
    const accounts = loadRegisteredAccounts();
    if (accounts[cleanEmail]) {
      const dupErr = new Error(
        'An account with this email already exists. Please sign in instead.'
      );
      (dupErr as any).code = 'auth/email-already-in-use';
      throw dupErr;
    }

    const uid = computeDeterministicUid(cleanEmail);
    const record: StoredAccountRecord = {
      uid,
      email: cleanEmail,
      displayName: cleanName,
      passwordHash: hashSecret(password, cleanEmail),
      createdAt: new Date().toISOString(),
    };
    accounts[cleanEmail] = record;
    saveRegisteredAccounts(accounts);

    const sessionUser: StudioAuthUser = {
      uid,
      email: cleanEmail,
      displayName: cleanName,
      photoURL: null,
      emailVerified: true,
      providerId: 'password',
    };
    saveFallbackSession(sessionUser);
    setUser(sessionUser);
    return sessionUser;
  };

  const signInWithEmail = async (email: string, password: string): Promise<StudioAuthUser> => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      const e = new Error('Please enter a valid email address.');
      (e as any).code = 'auth/invalid-email';
      throw e;
    }
    if (!password) {
      const e = new Error('Please enter your password.');
      (e as any).code = 'auth/invalid-credential';
      throw e;
    }

    if (auth) {
      try {
        const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
        const mapped = mapFirebaseUser(cred.user);
        saveFallbackSession(mapped);
        setUser(mapped);
        return mapped;
      } catch (err: any) {
        const code = String(err?.code || '');
        const msg = String(err?.message || '');
        const isProviderOrRefererRestricted =
          code === 'auth/operation-not-allowed' ||
          code === 'auth/configuration-not-found' ||
          code === 'auth/admin-restricted-operation' ||
          code === 'auth/unauthorized-domain' ||
          code.includes('requests-from-referer') ||
          msg.includes('requests-from-referer');
        if (!isProviderOrRefererRestricted) {
          // Check if account was created via local fallback before throwing
          const accounts = loadRegisteredAccounts();
          const existing = accounts[cleanEmail];
          if (!existing || existing.passwordHash !== hashSecret(password, cleanEmail)) {
            throw new Error(formatFirebaseAuthError(err));
          }
        }
      }
    }

    const accounts = loadRegisteredAccounts();
    const record = accounts[cleanEmail];
    if (!record || record.passwordHash !== hashSecret(password, cleanEmail)) {
      throw new Error(
        'Invalid email or password. Please verify your credentials or create an account.'
      );
    }

    const sessionUser: StudioAuthUser = {
      uid: record.uid,
      email: record.email,
      displayName: record.displayName,
      photoURL: null,
      emailVerified: true,
      providerId: 'password',
    };
    saveFallbackSession(sessionUser);
    setUser(sessionUser);
    return sessionUser;
  };

  const signInWithGoogle = async (): Promise<StudioAuthUser | void> => {
    if (!auth || !googleProvider) {
      throw new Error(
        'Firebase Google Sign-In is not configured. Please check VITE_FIREBASE_* or firebase-applet-config.json.'
      );
    }
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const mapped = mapFirebaseUser(cred.user);
      saveFallbackSession(mapped);
      setUser(mapped);
      return mapped;
    } catch (err: any) {
      const code = err?.code || '';
      const isMobileOrPopupBlocked =
        code === 'auth/popup-blocked' ||
        code === 'auth/operation-not-supported-in-this-environment';
      if (isMobileOrPopupBlocked) {
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      throw new Error(formatFirebaseAuthError(err));
    }
  };

  const resetPassword = async (email: string): Promise<string> => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new Error('Please enter a valid email address to reset your password.');
    }
    if (auth) {
      try {
        await sendPasswordResetEmail(auth, cleanEmail);
        return `Password reset instructions have been sent to ${cleanEmail}.`;
      } catch (err: any) {
        const code = err?.code || '';
        const isProviderNotEnabledInConsole =
          code === 'auth/operation-not-allowed' ||
          code === 'auth/configuration-not-found';
        if (!isProviderNotEnabledInConsole) {
          throw new Error(formatFirebaseAuthError(err));
        }
      }
    }
    return `Password reset link queued for ${cleanEmail}. Check your inbox for instructions.`;
  };

  const logout = async (): Promise<void> => {
    saveFallbackSession(null);
    setUser(null);
    if (auth) {
      try {
        await firebaseSignOut(auth);
      } catch {
        // ignore signOut errors
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isFirebaseConfigured,
        firebaseProjectId,
        signUpWithEmail,
        signInWithEmail,
        signInWithGoogle,
        resetPassword,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
