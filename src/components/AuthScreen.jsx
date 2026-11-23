import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  GraduationCap, Briefcase, Building2, LogIn, Sun, Moon, Monitor, Loader2, AlertCircle, Eye, EyeOff,
  ArrowLeft, ArrowRight, Check, ShieldCheck, Upload, FileText, X, BadgeCheck, Info
} from 'lucide-react';
import BrandLogo from './BrandLogo.jsx';
import FieldSelect from './FieldSelect.jsx';
import SocialAuthButtons from './SocialAuthButtons.jsx';
import DeveloperPanel from './DeveloperPanel.jsx';
import { apiJson, getDeveloperToken, readFileAsDataUrl, setDeveloperToken } from '../lib/api.js';
import { classifyEmail } from '../../shared/emailDomains.js';

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '2.1.0';
const DEV_TAPS = 7;
const MAX_PROOF_BYTES = 4 * 1024 * 1024;

const THEMES = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor }
];

const ROLES = [
  { id: 'student', label: 'Student', icon: GraduationCap, blurb: 'Collect verified certificates and share your skill profile.' },
  { id: 'recruiter', label: 'Recruiter', icon: Briefcase, blurb: 'Verify candidates instantly. Requires company verification.' },
  { id: 'admin', label: 'University staff', icon: Building2, blurb: 'Issue and approve credentials. Requires staff verification.' }
];

const STEPS = {
  student: ['Account type', 'Your details', 'Your studies'],
  recruiter: ['Account type', 'Your details', 'Company', 'Verification'],
  admin: ['Account type', 'Your details', 'Institution', 'Verification']
};

const EMPTY_FORM = {
  name: '', email: '', password: '', university: '', studentId: '', fieldOfStudy: '',
  companyName: '', jobTitle: '', companyWebsite: '', companyRegId: '', departmentRole: ''
};

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-[#666666] dark:text-[#8B949E]">{hint}</p>}
    </div>
  );
}

function Stepper({ steps, current }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Progress">
      {steps.map((label, i) => (
        <li key={label} className="flex-1 min-w-0" aria-current={i === current ? 'step' : undefined}>
          <div className={`h-1 rounded-full transition-colors duration-300 ${i <= current ? 'bg-[#0A66C2] dark:bg-[#58A6FF]' : 'bg-[#E0DFDC] dark:bg-[#30363D]'}`} />
          <p className={`mt-1.5 text-[10px] font-semibold truncate ${i === current ? 'text-[#0A66C2] dark:text-[#58A6FF]' : 'text-[#666666] dark:text-[#8B949E]'}`}>{label}</p>
        </li>
      ))}
    </ol>
  );
}

function ProofDrop({ proof, onChange, onError }) {
  const input = useRef(null);
  const pick = async (file) => {
    if (!file) return;
    if (!/^(image\/(png|jpe?g|webp)|application\/pdf)$/.test(file.type)) return onError('Upload a PNG, JPG, WebP or PDF.');
    if (file.size > MAX_PROOF_BYTES) return onError('That file is larger than 4 MB.');
    onChange({ dataUrl: await readFileAsDataUrl(file), fileName: file.name, sizeKB: Math.round(file.size / 1024), isImage: file.type.startsWith('image/') });
  };
  if (proof) {
    return (
      <div className="flex items-center gap-3 p-2.5 rounded-xl border border-[#E0DFDC] dark:border-[#30363D] bg-[#F4F2EE]/60 dark:bg-[#0D1117]">
        {proof.isImage ? (
          <img src={proof.dataUrl} alt="" className="w-14 h-10 object-cover rounded-md border border-[#E0DFDC] dark:border-[#30363D]" />
        ) : (
          <span className="w-14 h-10 rounded-md bg-white dark:bg-[#1B1F23] flex items-center justify-center"><FileText className="w-5 h-5 text-[#0A66C2]" /></span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold truncate">{proof.fileName}</p>
          <p className="text-[11px] text-[#666666] dark:text-[#8B949E]">{proof.sizeKB} KB</p>
        </div>
        <button type="button" onClick={() => onChange(null)} className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-[#666666]" aria-label="Remove document">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => input.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => (e.preventDefault(), pick(e.dataTransfer.files?.[0]))}
      className="w-full border-2 border-dashed border-[#0A66C2]/35 hover:border-[#0A66C2] rounded-xl p-5 text-center bg-[#F4F2EE]/40 dark:bg-[#0D1117]/60 transition-colors"
    >
      <Upload className="w-5 h-5 text-[#0A66C2] mx-auto mb-1.5" />
      <span className="block text-xs font-semibold">Upload staff or corporate ID</span>
      <span className="block text-[11px] text-[#666666] dark:text-[#8B949E] mt-0.5">PNG, JPG or PDF · up to 4 MB</span>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ''))} />
    </button>
  );
}

export default function AuthScreen({ authRoute = '/login', setAuthRoute, themeMode, setThemeMode, customLogoUrl, isDark, onAuthSuccess }) {
  const isRegister = authRoute === '/register';
  const [role, setRole] = useState('student');
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(EMPTY_FORM);
  const [proof, setProof] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [providers, setProviders] = useState(null);
  const [devOpen, setDevOpen] = useState(Boolean(getDeveloperToken()));
  const taps = useRef({ count: 0, last: 0 });

  useEffect(() => {
    apiJson('/api/auth/providers').then(setProviders).catch(() => setProviders({ google: { enabled: false }, apple: { enabled: false } }));
  }, []);

  useEffect(() => {
    setStep(0);
    setError('');
  }, [isRegister]);

  const steps = STEPS[role];
  const isLastStep = step === steps.length - 1;
  const emailInfo = classifyEmail(form.email, role);
  const needsProof = role !== 'student' && !emailInfo.institutional;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e?.target ? e.target.value : e }));

  const finishAuth = (data) => {
    if (data.developerToken) setDeveloperToken(data.developerToken);
    onAuthSuccess(data.user, data.token, data.message);
  };

  // Hidden developer gesture: tap the version label 7 times within 4 seconds.
  const onVersionTap = () => {
    const now = Date.now();
    taps.current = { count: now - taps.current.last < 1500 ? taps.current.count + 1 : 1, last: now };
    if (taps.current.count >= DEV_TAPS) {
      taps.current.count = 0;
      setDevOpen(true);
    }
  };

  const stepError = () => {
    const current = steps[step];
    if (current === 'Your details') {
      if (!form.name.trim()) return 'Enter your full name.';
      if (emailInfo.kind === 'invalid') return 'Enter a valid email address.';
      if (emailInfo.kind === 'disposable') return 'Disposable email addresses are not accepted.';
      if (form.password.length < 8) return 'Password must be at least 8 characters.';
    }
    if (current === 'Your studies') {
      if (!form.fieldOfStudy) return 'Choose your programme.';
      if (!form.university.trim()) return 'Enter your university.';
    }
    if (current === 'Company' && !form.companyName.trim()) return 'Enter your company name.';
    if (current === 'Institution' && !form.university.trim()) return 'Enter your institution.';
    if (current === 'Verification' && needsProof && !proof) return `Attach your ${role === 'admin' ? 'staff' : 'corporate'} ID to continue.`;
    return '';
  };

  const registrationBody = () => ({
    ...form,
    role,
    verificationProof: proof ? { dataUrl: proof.dataUrl, fileName: proof.fileName } : undefined
  });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (isRegister) {
      const problem = stepError();
      if (problem) return setError(problem);
      if (!isLastStep) return setStep((s) => s + 1);
    }
    setLoading('form');
    try {
      const data = await apiJson(isRegister ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST',
        body: isRegister ? registrationBody() : { email: form.email, password: form.password }
      });
      finishAuth(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading('');
    }
  };

  const handleProviderToken = useCallback(
    async (provider, idToken, extra) => {
      setLoading(provider);
      setError('');
      try {
        const data = await apiJson(`/api/auth/oauth/${provider}`, {
          method: 'POST',
          body: { idToken, ...registrationBody(), ...extra, name: extra.name || form.name }
        });
        finishAuth(data);
      } catch (err) {
        if (err.data?.needsOnboarding) {
          setAuthRoute('/register');
          setError(`${err.message} Complete the steps below, then continue with ${provider === 'google' ? 'Google' : 'Apple'} again.`);
        } else {
          setError(err.message);
        }
      } finally {
        setLoading('');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [role, form, proof, onAuthSuccess, setAuthRoute]
  );

  // Fills the form with the demo account, then signs in with the developer token.
  const pickDemo = async (account) => {
    setForm((f) => ({ ...f, email: account.email, password: '' }));
    setLoading(account.id);
    setError('');
    try {
      finishAuth(await apiJson('/api/auth/demo-login', { method: 'POST', body: { userId: account.id } }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading('');
    }
  };

  const goto = (route) => {
    setError('');
    setAuthRoute(route);
  };

  const passwordField = (
    <Field label="Password" hint={isRegister ? 'At least 8 characters.' : undefined}>
      <div className="relative">
        <input
          type={showPassword ? 'text' : 'password'}
          required
          minLength={isRegister ? 8 : undefined}
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          placeholder="••••••••"
          value={form.password}
          onChange={set('password')}
          className="linkedin-input pr-10"
        />
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#666666] dark:text-[#8B949E]"
          aria-label={showPassword ? 'Hide password' : 'Show password'}
        >
          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </Field>
  );

  const emailLabel = !isRegister ? 'Email' : role === 'recruiter' ? 'Work email' : role === 'admin' ? 'University email' : 'Email';

  const renderStep = () => {
    switch (steps[step]) {
      case 'Account type':
        return (
          <div className="space-y-2" role="radiogroup" aria-label="Account type">
            {ROLES.map(({ id, label, icon: Icon, blurb }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={role === id}
                onClick={() => setRole(id)}
                className={`w-full p-3.5 rounded-xl border text-left flex items-center gap-3 transition-all ${
                  role === id ? 'border-[#0A66C2] dark:border-[#58A6FF] bg-[#EBF3FB]/70 dark:bg-[#0A66C2]/10 ring-1 ring-[#0A66C2]/30' : 'border-[#E0DFDC] dark:border-[#30363D] hover:border-[#0A66C2]/50'
                }`}
              >
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${role === id ? 'bg-[#0A66C2] text-white' : 'bg-[#F4F2EE] dark:bg-[#0D1117] text-[#666666] dark:text-[#8B949E]'}`}>
                  <Icon className="w-5 h-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{label}</span>
                  <span className="block text-[11px] text-[#666666] dark:text-[#8B949E] leading-snug">{blurb}</span>
                </span>
                {role === id && <Check className="w-4 h-4 text-[#0A66C2] dark:text-[#58A6FF] shrink-0" />}
              </button>
            ))}
          </div>
        );
      case 'Your details':
        return (
          <div className="space-y-3">
            <Field label="Full name">
              <input required autoComplete="name" placeholder="As shown on your certificates" value={form.name} onChange={set('name')} className="linkedin-input" />
            </Field>
            <Field
              label={emailLabel}
              hint={
                role !== 'student' && form.email.includes('@') && emailInfo.kind !== 'invalid'
                  ? emailInfo.institutional
                    ? `✓ ${emailInfo.domain} looks like a ${role === 'admin' ? 'university' : 'company'} domain.`
                    : `${emailInfo.domain} is a ${emailInfo.kind === 'disposable' ? 'disposable' : 'personal'} address — you'll need to upload an ID next.`
                  : undefined
              }
            >
              <input type="email" required autoComplete="email" placeholder={role === 'recruiter' ? 'you@company.com' : role === 'admin' ? 'you@university.edu' : 'you@student.university.edu'} value={form.email} onChange={set('email')} className="linkedin-input" />
            </Field>
            {passwordField}
          </div>
        );
      case 'Your studies':
        return (
          <div className="space-y-3">
            <FieldSelect value={form.fieldOfStudy} onChange={set('fieldOfStudy')} required label="Programme" />
            <Field label="University">
              <input required placeholder="e.g. Universiti Teknologi Malaysia" value={form.university} onChange={set('university')} className="linkedin-input" />
            </Field>
            <Field label="Student ID" hint="Optional — shown to recruiters who verify you.">
              <input placeholder="e.g. A21EC0001" value={form.studentId} onChange={set('studentId')} className="linkedin-input font-mono" />
            </Field>
          </div>
        );
      case 'Company':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Field label="Company">
                <input required placeholder="Company name" value={form.companyName} onChange={set('companyName')} className="linkedin-input" />
              </Field>
            </div>
            <Field label="Job title">
              <input placeholder="Talent Acquisition" value={form.jobTitle} onChange={set('jobTitle')} className="linkedin-input" />
            </Field>
            <Field label="Company website">
              <input type="url" placeholder="https://" value={form.companyWebsite} onChange={set('companyWebsite')} className="linkedin-input" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Company registration no." hint="Optional — helps the registrar verify you faster.">
                <input placeholder="e.g. 202301012345" value={form.companyRegId} onChange={set('companyRegId')} className="linkedin-input font-mono" />
              </Field>
            </div>
          </div>
        );
      case 'Institution':
        return (
          <div className="space-y-3">
            <Field label="Institution">
              <input required placeholder="e.g. Universiti Malaya" value={form.university} onChange={set('university')} className="linkedin-input" />
            </Field>
            <Field label="Department or role">
              <input placeholder="Office of the Registrar" value={form.departmentRole} onChange={set('departmentRole')} className="linkedin-input" />
            </Field>
          </div>
        );
      case 'Verification':
        return (
          <div className="space-y-3">
            <div className={`p-3 rounded-xl flex gap-2.5 text-xs ${emailInfo.institutional ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-900 dark:text-amber-200'}`}>
              {emailInfo.institutional ? <BadgeCheck className="w-4 h-4 shrink-0 mt-px" /> : <Info className="w-4 h-4 shrink-0 mt-px" />}
              <span>
                {emailInfo.institutional
                  ? <>Your {role === 'admin' ? 'university' : 'company'} email <b>{emailInfo.domain}</b> counts as proof. An ID is optional but speeds up approval.</>
                  : <><b>{emailInfo.domain}</b> is a personal address, so we need your {role === 'admin' ? 'staff' : 'corporate'} ID.</>}
              </span>
            </div>
            <ProofDrop proof={proof} onChange={setProof} onError={setError} />
            <p className="text-[11px] text-[#666666] dark:text-[#8B949E] flex gap-1.5 leading-snug">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px text-[#0A66C2]" />
              Your account stays pending until a registrar approves it. The document is only seen by reviewers and deleted after approval.
            </p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#F4F2EE] dark:bg-[#0D1117] text-[#191919] dark:text-[#E6EDF3]">
      <header className="bg-white/90 dark:bg-[#1B1F23]/90 backdrop-blur border-b border-[#E0DFDC] dark:border-[#30363D] sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <BrandLogo size="md" showText customLogoUrl={customLogoUrl} />
          <div className="flex items-center bg-[#F4F2EE] dark:bg-[#0D1117] p-0.5 rounded-full border border-[#E0DFDC] dark:border-[#30363D]" role="group" aria-label="Theme">
            {THEMES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setThemeMode(id)}
                aria-pressed={themeMode === id}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                  themeMode === id ? 'bg-white dark:bg-[#1B1F23] text-[#0A66C2] dark:text-[#58A6FF] shadow-sm' : 'text-[#666666] dark:text-[#8B949E]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-start sm:items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-[420px] space-y-4 animate-scale-in">
          <div className="text-center space-y-1.5 pb-1">
            <h1 className="text-[26px] leading-tight font-bold tracking-tight">{isRegister ? 'Create your account' : 'Welcome back'}</h1>
            <p className="text-sm text-[#666666] dark:text-[#8B949E]">
              {isRegister ? 'Verified credentials, mapped to the skills that matter.' : 'Sign in to your wallet or portal.'}
            </p>
          </div>

          <div className="linkedin-card p-5 sm:p-7 space-y-5">
            {isRegister && <Stepper steps={steps} current={step} />}

            {error && (
              <div role="alert" className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300 text-xs flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={submit} className="space-y-4" noValidate={isRegister}>
              {isRegister ? (
                <div key={`${role}-${step}`} className="animate-fade-in">
                  {renderStep()}
                </div>
              ) : (
                <>
                  <Field label="Email">
                    <input type="email" required autoComplete="email" placeholder="you@example.com" value={form.email} onChange={set('email')} className="linkedin-input" />
                  </Field>
                  {passwordField}
                </>
              )}

              <div className="flex gap-2 pt-1">
                {isRegister && step > 0 && (
                  <button type="button" onClick={() => (setError(''), setStep((s) => s - 1))} className="linkedin-btn-neutral h-11 px-4" aria-label="Back">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
                <button type="submit" disabled={Boolean(loading)} className="linkedin-btn-primary flex-1 h-11">
                  {loading === 'form' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : !isRegister ? (
                    <>
                      <LogIn className="w-4 h-4" /> Sign in
                    </>
                  ) : isLastStep ? (
                    <>
                      <Check className="w-4 h-4" /> {role === 'student' ? 'Create account' : 'Submit for verification'}
                    </>
                  ) : (
                    <>
                      Continue <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>

            {(!isRegister || isLastStep) && (
              <SocialAuthButtons providers={providers} isDark={isDark} disabled={Boolean(loading)} onToken={handleProviderToken} onError={setError} />
            )}

            <p className="text-center text-xs text-[#666666] dark:text-[#8B949E]">
              {isRegister ? 'Already on TrustTrace?' : 'New to TrustTrace?'}{' '}
              <button type="button" onClick={() => goto(isRegister ? '/login' : '/register')} className="font-semibold text-[#0A66C2] dark:text-[#58A6FF] hover:underline">
                {isRegister ? 'Sign in' : 'Create an account'}
              </button>
            </p>
          </div>

          <DeveloperPanel
            open={devOpen}
            onClose={() => setDevOpen(false)}
            keyRequired={providers ? !providers.demoLogin : undefined}
            onPick={pickDemo}
            busyId={loading}
          />

          <p className="text-center">
            <button type="button" onClick={onVersionTap} className="text-[11px] text-[#666666]/70 dark:text-[#8B949E]/70 select-none px-3 py-1 tabular-nums">
              TrustTrace v{APP_VERSION}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
