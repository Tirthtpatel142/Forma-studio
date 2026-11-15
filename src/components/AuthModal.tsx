import React, { useState } from 'react';
import {
  Mail,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Sun,
  Moon,
  FileText,
  Image as ImageIcon,
  Calculator,
  Layers,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface AuthGateOrModalProps {
  mode?: 'fullscreen-gate' | 'modal';
  isDark: boolean;
  onToggleTheme?: () => void;
  onClose?: () => void;
  onSuccessToast?: (msg: string) => void;
}

function computePasswordStrength(pw: string): {
  level: 0 | 1 | 2 | 3;
  label: string;
  toneClass: string;
} {
  if (!pw) {
    return { level: 0, label: 'Minimum 6 characters', toneClass: 'text-slate-400' };
  }
  if (pw.length < 6) {
    return { level: 1, label: 'Too short (min 6 characters)', toneClass: 'text-rose-500' };
  }
  const hasLetters = /[a-zA-Z]/.test(pw);
  const hasNumbers = /\d/.test(pw);
  const hasSpecialOrMixed = /[^a-zA-Z0-9]/.test(pw) || (/[a-z]/.test(pw) && /[A-Z]/.test(pw));
  if (pw.length >= 10 && hasLetters && hasNumbers && hasSpecialOrMixed) {
    return { level: 3, label: 'Strong password', toneClass: 'text-emerald-500' };
  }
  if (pw.length >= 6 && hasLetters && hasNumbers) {
    return { level: 2, label: 'Good (letters + numbers)', toneClass: 'text-amber-500' };
  }
  return { level: 1, label: 'Fair (add numbers or symbols)', toneClass: 'text-amber-500' };
}

export const AuthModal: React.FC<AuthGateOrModalProps> = ({
  mode = 'fullscreen-gate',
  isDark,
  onToggleTheme,
  onClose,
  onSuccessToast,
}) => {
  const {
    isFirebaseConfigured,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    resetPassword,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const pwStrength = computePasswordStrength(password);

  const handleTabSwitch = (nextTab: 'signin' | 'signup' | 'forgot') => {
    setActiveTab(nextTab);
    setErrorMsg(null);
    setInfoMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    setSubmitting(true);

    try {
      if (activeTab === 'signin') {
        const signedInUser = await signInWithEmail(email, password);
        onSuccessToast?.(`Welcome back, ${signedInUser.displayName || signedInUser.email}!`);
        onClose?.();
      } else if (activeTab === 'signup') {
        const createdUser = await signUpWithEmail(email, password, displayName);
        onSuccessToast?.(`Account created for ${createdUser.displayName || createdUser.email}!`);
        onClose?.();
      } else {
        const message = await resetPassword(email);
        setInfoMsg(message);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Authentication failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setSubmitting(true);
    try {
      const signedInUser = await signInWithGoogle();
      if (signedInUser) {
        onSuccessToast?.(`Signed in as ${signedInUser.displayName || signedInUser.email}`);
        onClose?.();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Google Sign-In failed. Please try Email & Password above.');
    } finally {
      setSubmitting(false);
    }
  };

  const cardContent = (
    <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
      {/* Card Header */}
      <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-mono text-blue-600 dark:text-blue-400">
            FORMA STUDIO WORKSTATION
          </div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-0.5">
            {activeTab === 'signin'
              ? 'Sign in to your workspace'
              : activeTab === 'signup'
              ? 'Create your studio account'
              : 'Reset your password'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Isolated per-user storage for all 159 PDF, Image &amp; Calculator tools
          </p>
        </div>
        {mode === 'modal' && onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close authentication modal"
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Mode Switch Tabs */}
      {activeTab !== 'forgot' && (
        <div className="px-5 sm:px-6 pt-4">
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => handleTabSwitch('signin')}
              className={`py-2 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'signin'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => handleTabSwitch('signup')}
              className={`py-2 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'signup'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>
        </div>
      )}

      <div className="p-5 sm:p-6 space-y-4">
        {!isFirebaseConfigured && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-xl text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Firebase Environment Configuration Notice</div>
              <p className="mt-0.5 text-[11px] opacity-90">
                Set <code className="font-mono">VITE_FIREBASE_API_KEY</code> and{' '}
                <code className="font-mono">VITE_FIREBASE_PROJECT_ID</code> in{' '}
                <code className="font-mono">.env</code> to connect external Firebase projects.
              </p>
            </div>
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2.5"
          >
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {infoMsg && (
          <div
            role="status"
            className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 flex items-start gap-2.5"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <span>{infoMsg}</span>
          </div>
        )}

        {/* 1. Email & Password Form (Top of Auth Card) */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {activeTab === 'signup' && (
            <div>
              <label
                htmlFor="auth-display-name"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Full Name
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="auth-display-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter name..."
                  required
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}

          <div>
            <label
              htmlFor="auth-email"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email..."
                required
                autoComplete="email"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {activeTab !== 'forgot' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="auth-password"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Password
                </label>
                {activeTab === 'signin' && (
                  <button
                    type="button"
                    onClick={() => handleTabSwitch('forgot')}
                    className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={activeTab === 'signup' ? 'At least 6 characters' : '••••••••'}
                  required
                  minLength={6}
                  autoComplete={activeTab === 'signup' ? 'new-password' : 'current-password'}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl pl-9 pr-9 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>

              {activeTab === 'signup' && (
                <div className="mt-2 space-y-1">
                  <div className="grid grid-cols-3 gap-1.5">
                    {[1, 2, 3].map((bar) => (
                      <div
                        key={bar}
                        className={`h-1 rounded-full transition-colors ${
                          pwStrength.level >= bar
                            ? pwStrength.level === 3
                              ? 'bg-emerald-500'
                              : pwStrength.level === 2
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                            : 'bg-slate-200 dark:bg-slate-800'
                        }`}
                      />
                    ))}
                  </div>
                  <div className={`text-[10px] font-mono ${pwStrength.toneClass}`}>
                    {pwStrength.label}
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm"
          >
            <span>
              {submitting
                ? 'Authenticating...'
                : activeTab === 'signin'
                ? 'Sign In to Forma Studio'
                : activeTab === 'signup'
                ? 'Create Account & Open Studio'
                : 'Send Password Reset Email'}
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          {activeTab === 'forgot' && (
            <button
              type="button"
              onClick={() => handleTabSwitch('signin')}
              className="w-full py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            >
              Back to Sign In
            </button>
          )}
        </form>

        {/* 2. Single-Line Horizontal Divider + 3. Google Sign-In Button at Bottom */}
        {activeTab !== 'forgot' && (
          <>
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 whitespace-nowrap shrink-0">
                OR
              </span>
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={submitting}
              className="w-full py-2.5 px-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-2.5 transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>
          </>
        )}
      </div>

      {/* Footer Security & Per-User Scope Note (Clean Status Label — No Raw Firebase Project ID) */}
      <div className="px-5 sm:px-6 py-3.5 bg-slate-50 dark:bg-slate-950/70 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
        <span className="truncate">Strict per-user isolated workspace</span>
        <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 whitespace-nowrap shrink-0">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
          <span>UID-Isolated Workspace</span>
        </span>
      </div>
    </div>
  );

  if (mode === 'modal') {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs"
        role="dialog"
        aria-modal="true"
        aria-label="Forma Studio Authentication"
      >
        {cardContent}
      </div>
    );
  }

  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="min-h-screen bg-slate-100 dark:bg-[#090D16] text-slate-900 dark:text-slate-100 flex flex-col justify-between p-3.5 sm:p-6">
        {/* Compact Top Bar on Login Gate (Fits cleanly at 360px+) */}
        <header className="max-w-6xl w-full mx-auto flex items-center justify-between gap-2 py-1.5 sm:py-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 font-display">
              Forma Studio
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 hidden md:inline truncate">
              · Unified Document, Image &amp; Engineering Workstation
            </span>
          </div>
          {onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={isDark ? 'Switch to Daylight Mode' : 'Switch to Dark Studio Mode'}
              className="px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              {isDark ? (
                <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-slate-600 shrink-0" />
              )}
              <span>{isDark ? 'Daylight Mode' : 'Dark Studio'}</span>
            </button>
          )}
        </header>

        {/* Center Main Gate: Left Hero visible ONLY on Laptop/Desktop (hidden lg:flex), Auth Card centered on Mobile/Tablet */}
        <main className="max-w-5xl w-full mx-auto my-auto py-4 sm:py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="hidden lg:flex lg:flex-col lg:col-span-6 space-y-5">
            <div className="text-xs font-mono text-blue-600 dark:text-blue-400">
              AUTHENTICATED WORKSTATION GATE
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
              159 Precision Tools Across PDF, Image &amp; Engineering Calculators.
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Sign in with your Email &amp; Password or Google account to unlock your private Forma
              Studio workstation. All pinned tools, custom pipelines, uploaded files, and session
              histories are strictly isolated to your personal account UID and wiped from memory
              upon sign-out.
            </p>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="p-3.5 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-xl">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                  <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                  <span>PDF Studio (66 Tools)</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Merge, Split, Bates Stamp, Exhibit Stickers, Invoice Builder, AES-256 Encrypt &amp;
                  Sheet Viewer.
                </p>
              </div>
              <div className="p-3.5 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-xl">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                  <ImageIcon className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span>Image Studio (55 Tools)</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Batch Resize/Crop, 312 LUT Presets, Passport ID Sheets, Social Asset Kits &amp; RGB
                  Histogram.
                </p>
              </div>
              <div className="p-3.5 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-xl">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                  <Calculator className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Calculator &amp; Converter (38)</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Loan EMI, ROI &amp; Margin, Ohm&apos;s Law, Statistics, Live FX Rates, 2D Graphing &amp;
                  Converters.
                </p>
              </div>
              <div className="p-3.5 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-xl">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                  <Layers className="w-4 h-4 text-blue-500 shrink-0" />
                  <span>Pipelines &amp; Per-UID Storage</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Save custom multi-step pipelines, pin favorite tools, and restore your work on
                  next sign-in.
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 flex justify-center lg:justify-end">{cardContent}</div>
        </main>

        <footer className="max-w-6xl w-full mx-auto py-3 border-t border-slate-200 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
          <span>Forma Studio — 159 Total Tools (66 PDF · 55 Image · 38 Calculator &amp; Converter)</span>
          <span className="font-mono text-[11px]">
            100% Local Browser Processing · Files Never Leave Your Device · UID-Isolated Workspace
          </span>
        </footer>
      </div>
    </div>
  );
};
