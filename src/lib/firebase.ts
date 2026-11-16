import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, Auth } from 'firebase/auth';
import appletConfig from '../../firebase-applet-config.json';

export interface FirebaseConfigShape {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  measurementId?: string;
  firestoreDatabaseId?: string;
}

export interface RawFirebaseEnvVars {
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_AUTH_DOMAIN?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_STORAGE_BUCKET?: string;
  VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  VITE_FIREBASE_APP_ID?: string;
  VITE_FIREBASE_MEASUREMENT_ID?: string;
  VITE_FIREBASE_FIRESTORE_DATABASE_ID?: string;
}

export function cleanFirebaseConfigValue(val: string | undefined | null): string {
  if (!val || typeof val !== 'string') return '';
  const trimmed = val.trim();
  if (
    !trimmed ||
    trimmed.startsWith('YOUR_') ||
    trimmed.startsWith('MY_') ||
    trimmed === 'remixed-project-id' ||
    trimmed === 'undefined' ||
    trimmed === 'null'
  ) {
    return '';
  }
  return trimmed;
}

/**
 * Resolves Firebase configuration by checking `import.meta.env.VITE_FIREBASE_*` first
 * and falling back to `firebase-applet-config.json` when any `VITE_FIREBASE_*` variable
 * is empty, unset, or a template placeholder (ensuring GitHub Pages and static builds work).
 */
export function resolveFirebaseConfig(
  envVars: RawFirebaseEnvVars = {},
  fallbackConfig: Partial<FirebaseConfigShape> = appletConfig
): FirebaseConfigShape {
  return {
    apiKey:
      cleanFirebaseConfigValue(envVars.VITE_FIREBASE_API_KEY) ||
      cleanFirebaseConfigValue(fallbackConfig?.apiKey),
    authDomain:
      cleanFirebaseConfigValue(envVars.VITE_FIREBASE_AUTH_DOMAIN) ||
      cleanFirebaseConfigValue(fallbackConfig?.authDomain),
    projectId:
      cleanFirebaseConfigValue(envVars.VITE_FIREBASE_PROJECT_ID) ||
      cleanFirebaseConfigValue(fallbackConfig?.projectId),
    storageBucket:
      cleanFirebaseConfigValue(envVars.VITE_FIREBASE_STORAGE_BUCKET) ||
      cleanFirebaseConfigValue(fallbackConfig?.storageBucket),
    messagingSenderId:
      cleanFirebaseConfigValue(envVars.VITE_FIREBASE_MESSAGING_SENDER_ID) ||
      cleanFirebaseConfigValue(fallbackConfig?.messagingSenderId),
    appId:
      cleanFirebaseConfigValue(envVars.VITE_FIREBASE_APP_ID) ||
      cleanFirebaseConfigValue(fallbackConfig?.appId),
    measurementId:
      cleanFirebaseConfigValue(envVars.VITE_FIREBASE_MEASUREMENT_ID) ||
      cleanFirebaseConfigValue(fallbackConfig?.measurementId),
    firestoreDatabaseId:
      cleanFirebaseConfigValue(envVars.VITE_FIREBASE_FIRESTORE_DATABASE_ID) ||
      cleanFirebaseConfigValue(fallbackConfig?.firestoreDatabaseId),
  };
}

// Read import.meta.env.VITE_FIREBASE_* explicitly so Vite statically replaces values at build time,
// while falling back to firebase-applet-config.json whenever VITE_FIREBASE_* is empty (e.g. GitHub Pages).
const metaEnv =
  typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: RawFirebaseEnvVars }).env
    ? (import.meta as unknown as { env: RawFirebaseEnvVars }).env
    : {};

const viteEnvVars: RawFirebaseEnvVars = {
  VITE_FIREBASE_API_KEY: metaEnv.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: metaEnv.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: metaEnv.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: metaEnv.VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID: metaEnv.VITE_FIREBASE_APP_ID,
  VITE_FIREBASE_MEASUREMENT_ID: metaEnv.VITE_FIREBASE_MEASUREMENT_ID,
  VITE_FIREBASE_FIRESTORE_DATABASE_ID: metaEnv.VITE_FIREBASE_FIRESTORE_DATABASE_ID,
};

export const resolvedFirebaseConfig: FirebaseConfigShape = resolveFirebaseConfig(
  viteEnvVars,
  appletConfig
);

export const isFirebaseConfigured = Boolean(
  resolvedFirebaseConfig.apiKey &&
    resolvedFirebaseConfig.authDomain &&
    resolvedFirebaseConfig.projectId &&
    resolvedFirebaseConfig.appId
);

export const firebaseProjectId = resolvedFirebaseConfig.projectId || '';
export const firestoreDatabaseId = resolvedFirebaseConfig.firestoreDatabaseId || '';

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let googleAuthProvider: GoogleAuthProvider | null = null;

if (isFirebaseConfigured) {
  try {
    firebaseApp = getApps().length > 0 ? getApp() : initializeApp(resolvedFirebaseConfig);
    firebaseAuth = getAuth(firebaseApp);
    googleAuthProvider = new GoogleAuthProvider();
    googleAuthProvider.setCustomParameters({ prompt: 'select_account' });
  } catch (err) {
    console.warn('Firebase initialization warning:', err);
    firebaseApp = null;
    firebaseAuth = null;
    googleAuthProvider = null;
  }
}

export const app = firebaseApp;
export const auth = firebaseAuth;
export const googleProvider = googleAuthProvider;
