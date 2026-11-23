import React, { useRef, useState } from 'react';
import { Clock, FileText, Loader2, LogOut, ShieldAlert, Upload, BadgeCheck, Mail } from 'lucide-react';
import BrandLogo from './BrandLogo.jsx';
import { apiJson, readFileAsDataUrl } from '../lib/api.js';

const MAX_BYTES = 4 * 1024 * 1024;

const firstName = (name = '') => name.replace(/^((dr|prof|mr|mrs|ms|ir|ts|assoc\.?\s+prof)\.?\s+)+/i, '').split(' ')[0] || name;

function Row({ icon: Icon, title, children, done }) {
  return (
    <li className="flex gap-3">
      <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${done ? 'bg-emerald-500/15 text-emerald-600' : 'bg-[#F4F2EE] dark:bg-[#0D1117] text-[#666666] dark:text-[#8B949E]'}`}>
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0 pt-1">
        <p className="text-sm font-semibold">{title}</p>
        <div className="text-xs text-[#666666] dark:text-[#8B949E] mt-0.5">{children}</div>
      </div>
    </li>
  );
}

// Shown to recruiter and university accounts until a registrar approves them.
// Updates live: the app re-fetches on every server change event.
export default function PendingVerificationScreen({ user, customLogoUrl, onUserUpdated, onLogout, onNotify }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const v = user.verification || {};
  const rejected = user.accountStatus === 'rejected';
  const roleLabel = user.role === 'admin' ? 'university staff' : 'recruiter';

  const upload = async (file) => {
    if (!file) return;
    if (file.size > MAX_BYTES) return setError('That file is larger than 4 MB.');
    setBusy(true);
    setError('');
    try {
      const data = await apiJson('/api/auth/verification-proof', {
        method: 'POST',
        body: { verificationProof: { dataUrl: await readFileAsDataUrl(file), fileName: file.name } }
      });
      onUserUpdated(data.user);
      onNotify?.(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#F4F2EE] dark:bg-[#0D1117] text-[#191919] dark:text-[#E6EDF3]">
      <header className="bg-white/90 dark:bg-[#1B1F23]/90 backdrop-blur border-b border-[#E0DFDC] dark:border-[#30363D]">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <BrandLogo size="md" showText customLogoUrl={customLogoUrl} />
          <button onClick={onLogout} className="linkedin-btn-neutral text-xs">
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-start sm:items-center justify-center px-4 py-10">
        <div className="w-full max-w-md linkedin-card p-6 sm:p-8 space-y-6 animate-scale-in">
          <div className="text-center space-y-3">
            <span className={`w-14 h-14 rounded-2xl mx-auto flex items-center justify-center ${rejected ? 'bg-red-500/10 text-red-600' : 'bg-amber-500/10 text-amber-600'}`}>
              {rejected ? <ShieldAlert className="w-7 h-7" /> : <Clock className="w-7 h-7" />}
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight">{rejected ? 'Verification not approved' : 'Verification in progress'}</h1>
              <p className="text-sm text-[#666666] dark:text-[#8B949E] mt-1">
                {rejected
                  ? 'A registrar could not confirm your role. Upload a clearer document to try again.'
                  : `Hi ${firstName(user.name)} — a registrar is confirming your ${roleLabel} account. This page updates the moment you're approved.`}
              </p>
            </div>
          </div>

          {rejected && v.note && (
            <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20 text-xs">
              <span className="font-semibold">Reviewer note: </span>
              {v.note}
            </div>
          )}

          <ul className="space-y-4">
            <Row icon={Mail} title="Email" done={v.institutionalEmail}>
              {v.emailDomain}
              {v.institutionalEmail ? ` · ${user.role === 'admin' ? 'university' : 'company'} domain` : ' · personal address'}
            </Row>
            <Row icon={v.proof ? BadgeCheck : FileText} title="Proof document" done={Boolean(v.proof)}>
              {v.proof ? `${v.proof.fileName} · ${v.proof.sizeKB} KB` : 'Not uploaded'}
            </Row>
            <Row icon={Clock} title="Registrar review" done={false}>
              {rejected ? 'Declined' : `Submitted ${new Date(v.submittedAt || user.createdAt).toLocaleDateString()}`}
            </Row>
          </ul>

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

          {(rejected || !v.proof) && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => input.current?.click()}
                className={`${v.institutionalEmail && !rejected ? 'linkedin-btn-outline' : 'linkedin-btn-primary'} w-full h-11`}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {v.proof ? 'Upload a new document' : `Upload ${user.role === 'admin' ? 'staff' : 'corporate'} ID`}
              </button>
              {v.institutionalEmail && !rejected && !v.proof && (
                <p className="-mt-3 text-center text-[11px] text-[#666666] dark:text-[#8B949E]">Optional — your email already counts as proof, but an ID speeds things up.</p>
              )}
              <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={(e) => (upload(e.target.files?.[0]), (e.target.value = ''))} />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
