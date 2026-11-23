import React, { useEffect, useState } from 'react';
import { Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import BrandLogo from './BrandLogo.jsx';
import VerificationResultView from './VerificationResultView.jsx';
import { verifyScannedText } from '../lib/verification.js';

// Landing page for scanned QR codes and shared links (/verify?did=…#tt1=…).
// Works signed-out, and offline when the QR carries signed claims.
export default function PublicVerifyPage({ isDark, customLogoUrl, onBack, backLabel = 'Sign in' }) {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let cancelled = false;
    verifyScannedText(window.location.href).then((result) => !cancelled && setState({ loading: false, result }));
    return () => {
      cancelled = true;
    };
  }, []);

  const { loading, result } = state;

  return (
    <div className="min-h-[100dvh] bg-[#F4F2EE] dark:bg-[#0D1117] text-[#191919] dark:text-[#E6EDF3]">
      <header className="sticky top-0 z-10 bg-white/90 dark:bg-[#1B1F23]/90 backdrop-blur border-b border-[#E0DFDC] dark:border-[#30363D]">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <BrandLogo size="sm" showText customLogoUrl={customLogoUrl} />
          <button onClick={onBack} className="linkedin-btn-neutral text-xs py-1.5">
            <ArrowLeft className="w-3.5 h-3.5" />
            {backLabel}
          </button>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-5 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        <h1 className="text-lg font-bold mb-4">Credential verification</h1>
        {loading && (
          <div className="py-16 text-center space-y-3" aria-live="polite">
            <Loader2 className="w-8 h-8 animate-spin text-[#0A66C2] mx-auto" />
            <p className="text-sm text-[#666666] dark:text-[#8B949E]">Checking signatures…</p>
          </div>
        )}
        {!loading && result?.error && (
          <div role="alert" className="linkedin-card p-5 flex gap-3 text-sm">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <p>{result.error}</p>
          </div>
        )}
        {!loading && result && !result.error && <VerificationResultView result={result} isDark={isDark} />}
      </main>
    </div>
  );
}
