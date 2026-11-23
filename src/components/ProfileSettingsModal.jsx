import React, { useEffect, useRef, useState } from 'react';
import { X, UserRound, ShieldCheck, KeyRound, Trash2, Camera, Copy, Check, Download, Loader2, AlertCircle, Image as ImageIcon } from 'lucide-react';
import Avatar from './Avatar.jsx';
import FieldSelect from './FieldSelect.jsx';
import { apiJson } from '../lib/api.js';

const TABS = [
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'security', label: 'Sign-in & security', icon: ShieldCheck },
  { id: 'wallet', label: 'Wallet', icon: KeyRound },
  { id: 'danger', label: 'Delete account', icon: Trash2 }
];

const TAB_ALIASES = { edit: 'profile', accounts: 'security' };

// Downscales to a square JPEG so avatars stay small in the database and on mobile.
function resizeImage(file, size = 320) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not a supported image.'));
      img.onload = () => {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        canvas
          .getContext('2d')
          .drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function Label({ children }) {
  return <label className="block text-xs font-semibold mb-1">{children}</label>;
}

function CopyRow({ label, value, tone = 'neutral' }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="text-[11px] font-semibold text-[#666666] dark:text-[#8B949E] mb-1">{label}</div>
      <div className="flex items-center gap-1.5">
        <code
          className={`flex-1 min-w-0 p-2.5 rounded-lg font-mono text-[11px] break-all ${
            tone === 'secret'
              ? 'bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200'
              : 'bg-[#F4F2EE] dark:bg-[#0D1117] border border-[#E0DFDC] dark:border-[#30363D]'
          }`}
        >
          {value || '—'}
        </code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(value || '');
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="linkedin-btn-neutral p-2 shrink-0"
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

export default function ProfileSettingsModal({ isOpen, onClose, initialTab = 'profile', currentUser, customLogoUrl, setCustomLogoUrl, onUserUpdated, onAccountDeleted, onNotify }) {
  const [tab, setTab] = useState('profile');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [profile, setProfile] = useState({});
  const [account, setAccount] = useState({ email: '', currentPassword: '', newPassword: '', confirmPassword: '' });
  const [recoveryInput, setRecoveryInput] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const avatarInput = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    setTab(TAB_ALIASES[initialTab] || initialTab || 'profile');
    setError('');
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!currentUser || !isOpen) return;
    setProfile({
      name: currentUser.name || '',
      headline: currentUser.headline || '',
      bio: currentUser.bio || '',
      location: currentUser.location || '',
      university: currentUser.university || '',
      fieldOfStudy: currentUser.fieldOfStudy || '',
      program: currentUser.program || '',
      companyName: currentUser.companyName || '',
      jobTitle: currentUser.jobTitle || '',
      companyWebsite: currentUser.companyWebsite || '',
      departmentRole: currentUser.departmentRole || '',
      avatarUrl: currentUser.avatarUrl || ''
    });
    setAccount({ email: currentUser.email || '', currentPassword: '', newPassword: '', confirmPassword: '' });
    setDeleteConfirm('');
  }, [currentUser, isOpen]);

  if (!isOpen || !currentUser) return null;

  const isStudent = currentUser.role === 'student';
  const hasPassword = currentUser.hasPassword !== false;
  const setP = (key) => (e) => setProfile((p) => ({ ...p, [key]: e.target ? e.target.value : e }));
  const setA = (key) => (e) => setAccount((a) => ({ ...a, [key]: e.target.value }));

  const run = async (key, fn) => {
    setBusy(key);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const saveProfile = (e) =>
    run('profile', async () => {
      e.preventDefault();
      const data = await apiJson(`/api/auth/profile/${currentUser.id}`, { method: 'PUT', body: profile });
      onUserUpdated?.(data.user);
      onNotify?.('Profile updated.');
    });

  const pickAvatar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    run('avatar', async () => {
      const dataUrl = await resizeImage(file);
      const data = await apiJson(`/api/auth/profile/${currentUser.id}`, { method: 'PUT', body: { avatarUrl: dataUrl } });
      setProfile((p) => ({ ...p, avatarUrl: dataUrl }));
      onUserUpdated?.(data.user);
      onNotify?.('Profile photo updated.');
    });
  };

  const removeAvatar = () =>
    run('avatar', async () => {
      const data = await apiJson(`/api/auth/profile/${currentUser.id}`, { method: 'PUT', body: { avatarUrl: '' } });
      setProfile((p) => ({ ...p, avatarUrl: '' }));
      onUserUpdated?.(data.user);
    });

  const saveEmail = (e) =>
    run('email', async () => {
      e.preventDefault();
      const data = await apiJson(`/api/auth/profile/${currentUser.id}`, {
        method: 'PUT',
        body: { email: account.email, currentPassword: account.currentPassword }
      });
      onUserUpdated?.(data.user);
      setAccount((a) => ({ ...a, currentPassword: '' }));
      onNotify?.('Email updated.');
    });

  const savePassword = (e) =>
    run('password', async () => {
      e.preventDefault();
      if (account.newPassword !== account.confirmPassword) throw new Error('New passwords do not match.');
      const data = await apiJson('/api/auth/password', {
        method: 'PUT',
        body: { currentPassword: account.currentPassword, newPassword: account.newPassword }
      });
      setAccount((a) => ({ ...a, currentPassword: '', newPassword: '', confirmPassword: '' }));
      onUserUpdated?.({ ...currentUser, hasPassword: true });
      onNotify?.(data.message);
    });

  const recoverWallet = (e) =>
    run('recover', async () => {
      e.preventDefault();
      const data = await apiJson('/api/wallet/recover', { method: 'POST', body: { recoveryInput } });
      onUserUpdated?.(data.user, data.token);
      onNotify?.(data.message);
      onClose();
    });

  const exportKeystore = () => {
    const keystore = {
      version: 'TrustTrace-SSI-Keystore-v1',
      exportedAt: new Date().toISOString(),
      holderName: currentUser.name,
      did: currentUser.did,
      walletAddress: currentUser.walletAddress,
      publicKeyHex: currentUser.publicKeyHex,
      privateKeyHex: currentUser.privateKeyHex,
      mnemonicSeedPhrase: currentUser.seedPhrase
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(keystore, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `trusttrace-keystore-${(currentUser.did || 'wallet').split(':').pop()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const deleteAccount = () =>
    run('delete', async () => {
      const data = await apiJson(`/api/auth/account/${currentUser.id}`, { method: 'DELETE' });
      onAccountDeleted?.(data);
      onClose();
    });

  const uploadBrandLogo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCustomLogoUrl(reader.result);
      try {
        localStorage.setItem('trusttrace_custom_logo', reader.result);
      } catch {
        // too large for localStorage; logo stays for this session
      }
      onNotify?.('Brand logo updated on this device.');
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel max-w-2xl" role="dialog" aria-modal="true" aria-label="Profile and settings">
        <div className="px-5 py-4 border-b border-[#E0DFDC] dark:border-[#30363D] flex items-center gap-3 sticky top-0 bg-white/95 dark:bg-[#1B1F23]/95 backdrop-blur z-10">
          <Avatar user={{ ...currentUser, avatarUrl: profile.avatarUrl }} size="sm" />
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-sm truncate">{currentUser.name}</h2>
            <p className="text-[11px] text-[#666666] dark:text-[#8B949E] truncate">{currentUser.email}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-[#666666]" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="px-3 sm:px-5 border-b border-[#E0DFDC] dark:border-[#30363D] flex gap-1 overflow-x-auto" role="tablist">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => {
                setTab(id);
                setError('');
              }}
              className={`flex items-center gap-1.5 px-3 py-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
                tab === id
                  ? id === 'danger'
                    ? 'border-red-600 text-red-600 dark:text-red-400'
                    : 'border-[#0A66C2] text-[#0A66C2] dark:text-[#58A6FF]'
                  : 'border-transparent text-[#666666] dark:text-[#8B949E] hover:text-[#191919] dark:hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </nav>

        <div className="p-5 space-y-5">
          {error && (
            <div role="alert" className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
              {error}
            </div>
          )}

          {tab === 'profile' && (
            <form onSubmit={saveProfile} className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Avatar user={{ ...currentUser, avatarUrl: profile.avatarUrl }} size="xl" />
                  <button
                    type="button"
                    onClick={() => avatarInput.current?.click()}
                    className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-[#0A66C2] text-white flex items-center justify-center shadow-md border-2 border-white dark:border-[#1B1F23]"
                    aria-label="Change profile photo"
                  >
                    {busy === 'avatar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                  </button>
                  <input ref={avatarInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={pickAvatar} className="hidden" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold">Profile photo</p>
                  <p className="text-xs text-[#666666] dark:text-[#8B949E]">Recruiters see this next to your verified credentials.</p>
                  {profile.avatarUrl && (
                    <button type="button" onClick={removeAvatar} className="text-xs font-semibold text-red-600 hover:underline">
                      Remove photo
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Full name</Label>
                  <input required value={profile.name} onChange={setP('name')} className="linkedin-input" />
                </div>
                <div>
                  <Label>Location</Label>
                  <input placeholder="City, Country" value={profile.location} onChange={setP('location')} className="linkedin-input" />
                </div>

                {isStudent && (
                  <>
                    <div className="sm:col-span-2">
                      <FieldSelect value={profile.fieldOfStudy} onChange={setP('fieldOfStudy')} />
                    </div>
                    <div>
                      <Label>University</Label>
                      <input value={profile.university} onChange={setP('university')} className="linkedin-input" />
                    </div>
                    <div>
                      <Label>Program (optional)</Label>
                      <input placeholder="e.g., BSc Computer Science" value={profile.program} onChange={setP('program')} className="linkedin-input" />
                    </div>
                  </>
                )}

                {currentUser.role === 'recruiter' && (
                  <>
                    <div>
                      <Label>Company</Label>
                      <input value={profile.companyName} onChange={setP('companyName')} className="linkedin-input" />
                    </div>
                    <div>
                      <Label>Job title</Label>
                      <input value={profile.jobTitle} onChange={setP('jobTitle')} className="linkedin-input" />
                    </div>
                  </>
                )}

                {currentUser.role === 'admin' && (
                  <>
                    <div>
                      <Label>Institution</Label>
                      <input value={profile.university} onChange={setP('university')} className="linkedin-input" />
                    </div>
                    <div>
                      <Label>Department</Label>
                      <input value={profile.departmentRole} onChange={setP('departmentRole')} className="linkedin-input" />
                    </div>
                  </>
                )}

                <div className="sm:col-span-2">
                  <Label>Headline</Label>
                  <input maxLength={120} value={profile.headline} onChange={setP('headline')} className="linkedin-input" />
                </div>
                <div className="sm:col-span-2">
                  <Label>About</Label>
                  <textarea rows={3} maxLength={600} placeholder="A short summary recruiters will see." value={profile.bio} onChange={setP('bio')} className="linkedin-input resize-none" />
                  <p className="text-right text-[10px] text-[#999] mt-0.5">{(profile.bio || '').length}/600</p>
                </div>
              </div>

              {currentUser.role === 'admin' && (
                <div className="p-3 rounded-xl bg-[#F4F2EE] dark:bg-[#0D1117] flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-[#0A66C2]" /> Institution brand logo (this device)
                  </span>
                  <span className="flex items-center gap-2">
                    <label className="linkedin-btn-neutral text-xs py-1 px-3 cursor-pointer">
                      Upload
                      <input type="file" accept="image/*" onChange={uploadBrandLogo} className="hidden" />
                    </label>
                    {customLogoUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomLogoUrl('');
                          try {
                            localStorage.removeItem('trusttrace_custom_logo');
                          } catch {
                            // ignore
                          }
                        }}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Reset
                      </button>
                    )}
                  </span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={onClose} className="linkedin-btn-neutral">
                  Cancel
                </button>
                <button type="submit" disabled={busy === 'profile'} className="linkedin-btn-primary">
                  {busy === 'profile' && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save changes
                </button>
              </div>
            </form>
          )}

          {tab === 'security' && (
            <div className="space-y-6">
              <form onSubmit={saveEmail} className="space-y-3">
                <h3 className="font-bold text-sm">Email address</h3>
                <input type="email" required value={account.email} onChange={setA('email')} className="linkedin-input" />
                {hasPassword && account.email.trim().toLowerCase() !== currentUser.email && (
                  <input
                    type="password"
                    required
                    placeholder="Current password to confirm"
                    autoComplete="current-password"
                    value={account.currentPassword}
                    onChange={setA('currentPassword')}
                    className="linkedin-input"
                  />
                )}
                <button type="submit" disabled={busy === 'email' || account.email.trim().toLowerCase() === currentUser.email} className="linkedin-btn-outline text-xs">
                  {busy === 'email' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Update email
                </button>
              </form>

              <form onSubmit={savePassword} className="space-y-3 pt-5 border-t border-[#E0DFDC] dark:border-[#30363D]">
                <h3 className="font-bold text-sm">{hasPassword ? 'Change password' : 'Set a password'}</h3>
                {!hasPassword && (
                  <p className="text-xs text-[#666666] dark:text-[#8B949E]">You signed up with Google or Apple. Add a password to also sign in with your email.</p>
                )}
                {hasPassword && (
                  <input type="password" required placeholder="Current password" autoComplete="current-password" value={account.currentPassword} onChange={setA('currentPassword')} className="linkedin-input" />
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input type="password" required minLength={8} placeholder="New password (8+ characters)" autoComplete="new-password" value={account.newPassword} onChange={setA('newPassword')} className="linkedin-input" />
                  <input type="password" required minLength={8} placeholder="Confirm new password" autoComplete="new-password" value={account.confirmPassword} onChange={setA('confirmPassword')} className="linkedin-input" />
                </div>
                <button type="submit" disabled={busy === 'password'} className="linkedin-btn-primary text-xs">
                  {busy === 'password' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {hasPassword ? 'Update password' : 'Set password'}
                </button>
              </form>

              <div className="pt-5 border-t border-[#E0DFDC] dark:border-[#30363D] space-y-2">
                <h3 className="font-bold text-sm">Connected sign-in methods</h3>
                <div className="flex flex-wrap gap-2">
                  {hasPassword && <span className="chip bg-[#F4F2EE] dark:bg-[#0D1117]">Email & password</span>}
                  {(currentUser.linkedProviders || []).map((p) => (
                    <span key={p} className="chip bg-[#EBF3FB] text-[#0A66C2] dark:bg-[#0A66C2]/20 dark:text-[#58A6FF] capitalize">
                      {p}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-[#666666] dark:text-[#8B949E]">Signing in with Google or Apple using this email links it automatically.</p>
              </div>
            </div>
          )}

          {tab === 'wallet' && (
            <div className="space-y-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-sm">Self-sovereign identity</h3>
                  <button type="button" onClick={exportKeystore} className="linkedin-btn-outline text-xs py-1 px-3">
                    <Download className="w-3.5 h-3.5" /> Export keystore
                  </button>
                </div>
                <CopyRow label="Decentralized identifier (DID)" value={currentUser.did} />
                <CopyRow label="Soulbound wallet address" value={currentUser.walletAddress} />
                {currentUser.seedPhrase && <CopyRow label="Recovery phrase — keep this private" value={currentUser.seedPhrase} tone="secret" />}
              </div>

              <form onSubmit={recoverWallet} className="space-y-2.5 pt-5 border-t border-[#E0DFDC] dark:border-[#30363D]">
                <h3 className="font-bold text-sm">Restore a wallet</h3>
                <p className="text-xs text-[#666666] dark:text-[#8B949E]">Enter a 12-word recovery phrase or private key to sign in to that wallet.</p>
                <input required placeholder="twelve word recovery phrase…" value={recoveryInput} onChange={(e) => setRecoveryInput(e.target.value)} className="linkedin-input font-mono text-xs" />
                <button type="submit" disabled={busy === 'recover'} className="linkedin-btn-primary text-xs">
                  {busy === 'recover' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                  Restore wallet
                </button>
              </form>
            </div>
          )}

          {tab === 'danger' && (
            <div className="p-4 rounded-2xl bg-red-50/80 dark:bg-red-950/30 border border-red-200 dark:border-red-800/70 space-y-4">
              <div>
                <h3 className="font-bold text-sm text-red-800 dark:text-red-300">Delete your account</h3>
                <p className="text-xs text-red-700/90 dark:text-red-300/80 mt-1 leading-relaxed">
                  This permanently removes your profile and every credential in your wallet, and burns the associated Soulbound Tokens. Certificate hashes are released, so the same files can be added to a new account later. This cannot be undone.
                </p>
              </div>
              <div>
                <Label>
                  Type <strong>DELETE</strong> to confirm
                </Label>
                <input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} className="linkedin-input border-red-300 dark:border-red-800" />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} className="linkedin-btn-neutral text-xs">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleteConfirm !== 'DELETE' || busy === 'delete'}
                  onClick={deleteAccount}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold bg-red-600 hover:bg-red-700 text-white disabled:opacity-40 transition-all"
                >
                  {busy === 'delete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete account permanently
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
