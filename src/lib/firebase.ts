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
}

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};

function cleanEnvValue(val: string | undefined): string {
  if (!val) return '';
  const trimmed = val.trim();
  if (
    trimmed.startsWith('YOUR_') ||
    trimmed.startsWith('MY_') ||
    trimmed === 'remixed-project-id' ||
    trimmed === 'undefined'
  ) {
    return '';
  }
  return trimmed;
}

const resolvedConfig: FirebaseConfigShape = {
  apiKey: cleanEnvValue(env.VITE_FIREBASE_API_KEY) || cleanEnvValue(appletConfig?.apiKey),
  authDomain:
    cleanEnvValue(env.VITE_FIREBASE_AUTH_DOMAIN) || cleanEnvValue(appletConfig?.authDomain),
  projectId: cleanEnvValue(env.VITE_FIREBASE_PROJECT_ID) || cleanEnvValue(appletConfig?.projectId),
  storageBucket:
    cleanEnvValue(env.VITE_FIREBASE_STORAGE_BUCKET) || cleanEnvValue(appletConfig?.storageBucket),
  messagingSenderId:
    cleanEnvValue(env.VITE_FIREBASE_MESSAGING_SENDER_ID) ||
    cleanEnvValue(appletConfig?.messagingSenderId),
  appId: cleanEnvValue(env.VITE_FIREBASE_APP_ID) || cleanEnvValue(appletConfig?.appId),
};

export const isFirebaseConfigured = Boolean(
  resolvedConfig.apiKey && resolvedConfig.authDomain && resolvedConfig.projectId && resolvedConfig.appId
);

export const firebaseProjectId = resolvedConfig.projectId || '';

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let googleAuthProvider: GoogleAuthProvider | null = null;

if (isFirebaseConfigured) {
  try {
    firebaseApp = getApps().length > 0 ? getApp() : initializeApp(resolvedConfig);
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
