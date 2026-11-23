import React, { useCallback, useEffect, useState } from 'react';
import { GraduationCap, Briefcase, Building2, LogIn, UserPlus, Sun, Moon, Monitor, Loader2, AlertCircle, Zap, Eye, EyeOff } from 'lucide-react';
import BrandLogo from './BrandLogo.jsx';
import FieldSelect from './FieldSelect.jsx';
import SocialAuthButtons from './SocialAuthButtons.jsx';
import { apiJson } from '../lib/api.js';

const THEMES = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor }
];

const ROLES = [
  { id: 'student', label: 'Student', icon: GraduationCap },
  { id: 'recruiter', label: 'Recruiter', icon: Briefcase },
  { id: 'admin', label: 'University', icon: Building2 }
];

const EMPTY_FORM = {
  name: '',
  email: '',
  password: '',
  university: '',
  studentId: '',
  fieldOfStudy: '',
  companyName: '',
  jobTitle: '',
  companyWebsite: '',
  companyRegId: '',
  departmentRole: '',
  verificationCode: ''
};

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1">{label}</label>
      {children}
    </div>
  );
}

export default function AuthScreen({ authRoute = '/login', setAuthRoute, themeMode, setThemeMode, customLogoUrl, isDark, onAuthSuccess }) {
  const isRegister = authRoute === '/register';
  const [role, setRole] = useState('student');
  const [form, setForm] = useState(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [providers, setProviders] = useState(null);

  useEffect(() => {
    apiJson('/api/auth/providers').then(setProviders).catch(() => setProviders({ google: { enabled: false }, apple: { enabled: false }, demoLogin: false }));
  }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target ? e.target.value : e }));

  const submit = async (e) => {
    e.preventDefault();
    if (isRegister && role === 'student' && !form.fieldOfStudy) {
      setError('Choose your field of study.');
      return;
    }
    setLoading('form');
    setError('');
    try {
      const data = await apiJson(isRegister ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST',
        body: isRegister ? { ...form, role } : { email: form.email, password: form.password }
      });
      onAuthSuccess(data.user, data.token, data.message);
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
          body: { idToken, role, ...form, ...extra, name: extra.name || form.name }
        });
        onAuthSuccess(data.user, data.token, data.message);
      } catch (err) {
        if (err.data?.needsOnboarding) {
          setAuthRoute('/register');
          setError(`${err.message} Fill in the details below, then continue with ${provider === 'google' ? 'Google' : 'Apple'} again.`);
        } else {
          setError(err.message);
        }
      } finally {
        setLoading('');
      }
    },
    [role, form, onAuthSuccess, setAuthRoute]
  );

  const demoLogin = async (demoRole) => {
    setLoading(demoRole);
    setError('');
    try {
      const data = await apiJson('/api/auth/demo-login', { method: 'POST', body: { role: demoRole } });
      onAuthSuccess(data.user, data.token, data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading('');
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

      <main className="flex-1 flex items-start sm:items-center justify-center px-4 py-6 sm:py-10">
        <div className="w-full max-w-md space-y-4 animate-scale-in">
          <div className="text-center space-y-1 pb-1">
            <h1 className="text-2xl font-bold tracking-tight">{isRegister ? 'Join TrustTrace' : 'Welcome back'}</h1>
            <p className="text-sm text-[#666666] dark:text-[#8B949E]">
              {isRegister ? 'Verified credentials, mapped to the skills that matter.' : 'Sign in to your wallet or portal.'}
            </p>
          </div>

          <div className="linkedin-card p-5 sm:p-6 space-y-4">
            {isRegister && (
              <div className="grid grid-cols-3 gap-1 bg-[#F4F2EE] dark:bg-[#0D1117] p-1 rounded-xl" role="tablist" aria-label="Account type">
                {ROLES.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={role === id}
                    onClick={() => setRole(id)}
                    className={`flex flex-col items-center gap-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                      role === id ? 'bg-white dark:bg-[#1B1F23] text-[#0A66C2] dark:text-[#58A6FF] shadow-sm' : 'text-[#666666] dark:text-[#8B949E]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>
            )}

            {error && (
              <div role="alert" className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300 text-xs flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={submit} className="space-y-3">
              {isRegister && (
                <Field label="Full name">
                  <input required autoComplete="name" placeholder="e.g., Alex Johnson" value={form.name} onChange={set('name')} className="linkedin-input" />
                </Field>
              )}

              <Field label={isRegister && role === 'recruiter' ? 'Work email' : isRegister && role === 'admin' ? 'Institutional email' : 'Email'}>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder={role === 'recruiter' ? 'recruiter@company.com' : role === 'admin' ? 'registrar@university.edu' : 'student@university.edu'}
                  value={form.email}
                  onChange={set('email')}
                  className="linkedin-input"
                />
              </Field>

              <Field label="Password">
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={isRegister ? 8 : undefined}
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                    placeholder={isRegister ? 'At least 8 characters' : '••••••••'}
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

              {isRegister && role === 'student' && (
                <>
                  <FieldSelect value={form.fieldOfStudy} onChange={set('fieldOfStudy')} required />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="University">
                      <input required placeholder="Global Institute of Technology" value={form.university} onChange={set('university')} className="linkedin-input" />
                    </Field>
                    <Field label="Student ID">
                      <input placeholder="STU-2026-001" value={form.studentId} onChange={set('studentId')} className="linkedin-input font-mono" />
                    </Field>
                  </div>
                </>
              )}

              {isRegister && role === 'recruiter' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Company">
                    <input required placeholder="Global Tech Corp" value={form.companyName} onChange={set('companyName')} className="linkedin-input" />
                  </Field>
                  <Field label="Job title">
                    <input placeholder="Talent Acquisition" value={form.jobTitle} onChange={set('jobTitle')} className="linkedin-input" />
                  </Field>
                  <Field label="Company website">
                    <input type="url" placeholder="https://company.example" value={form.companyWebsite} onChange={set('companyWebsite')} className="linkedin-input" />
                  </Field>
                  <Field label="Registration ID">
                    <input placeholder="CORP-2026-001" value={form.companyRegId} onChange={set('companyRegId')} className="linkedin-input font-mono" />
                  </Field>
                </div>
              )}

              {isRegister && role === 'admin' && (
                <>
                  <Field label="Institution">
                    <input required placeholder="Global Institute of Technology" value={form.university} onChange={set('university')} className="linkedin-input" />
                  </Field>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Department or role">
                      <input placeholder="Office of the Registrar" value={form.departmentRole} onChange={set('departmentRole')} className="linkedin-input" />
                    </Field>
                    <Field label="Verification code">
                      <input required placeholder="Issued by your institution" value={form.verificationCode} onChange={set('verificationCode')} className="linkedin-input font-mono" />
                    </Field>
                  </div>
                </>
              )}

              <button type="submit" disabled={Boolean(loading)} className="linkedin-btn-primary w-full h-11 mt-1">
                {loading === 'form' ? <Loader2 className="w-4 h-4 animate-spin" /> : isRegister ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                {isRegister ? 'Create account' : 'Sign in'}
              </button>
            </form>

            <SocialAuthButtons
              providers={providers}
              isDark={isDark}
              disabled={Boolean(loading)}
              onToken={handleProviderToken}
              onError={setError}
            />

            <p className="text-center text-xs text-[#666666] dark:text-[#8B949E] pt-1">
              {isRegister ? 'Already on TrustTrace?' : 'New to TrustTrace?'}{' '}
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setAuthRoute(isRegister ? '/login' : '/register');
                }}
                className="font-semibold text-[#0A66C2] dark:text-[#58A6FF] hover:underline"
              >
                {isRegister ? 'Sign in' : 'Create an account'}
              </button>
            </p>
          </div>

          {providers?.demoLogin && (
            <div className="linkedin-card p-4 space-y-2.5">
              <span className="section-label flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-[#0A66C2]" />
                Demo accounts
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { id: 'recruiter', title: 'Demo recruiter', sub: 'Global Tech Corp', icon: Briefcase },
                  { id: 'admin', title: 'Demo registrar', sub: 'Global Institute of Technology', icon: Building2 }
                ].map(({ id, title, sub, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    disabled={Boolean(loading)}
                    onClick={() => demoLogin(id)}
                    className="p-2.5 rounded-xl border border-[#E0DFDC] dark:border-[#30363D] hover:border-[#0A66C2] dark:hover:border-[#58A6FF] text-left transition-all flex items-center gap-2.5 min-w-0"
                  >
                    <span className="w-8 h-8 rounded-lg bg-[#EBF3FB] dark:bg-[#0A66C2]/20 text-[#0A66C2] dark:text-[#58A6FF] flex items-center justify-center shrink-0">
                      {loading === id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-bold truncate">{title}</span>
                      <span className="block text-[10px] text-[#666666] dark:text-[#8B949E] truncate">{sub}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
