import React, { useEffect, useState } from 'react';
import { Briefcase, Building2, Code2, KeyRound, Loader2, LogOut, X } from 'lucide-react';
import { apiJson, getDeveloperToken, setDeveloperToken } from '../lib/api.js';

const ROLE_ICON = { recruiter: Briefcase, admin: Building2 };

// Hidden presenter tools. Opened by tapping the version label 7 times; needs
// the server's developer key unless the server already allows demo logins.
export default function DeveloperPanel({ open, onClose, keyRequired, onPick, busyId }) {
  const [unlocked, setUnlocked] = useState(Boolean(getDeveloperToken()));
  const [accounts, setAccounts] = useState([]);
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !unlocked) return;
    apiJson('/api/auth/developer/demo-accounts')
      .then((d) => setAccounts(d.demoAccounts || []))
      .catch(() => {
        // Token expired: ask for the key again.
        setDeveloperToken(null);
        setUnlocked(false);
      });
  }, [open, unlocked]);

  const unlock = async (e) => {
    e?.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await apiJson('/api/auth/developer/unlock', { method: 'POST', body: { key } });
      setDeveloperToken(data.developerToken);
      setAccounts(data.demoAccounts || []);
      setUnlocked(true);
      setKey('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Servers that allow demo logins don't need a key.
  useEffect(() => {
    if (open && !unlocked && keyRequired === false) unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unlocked, keyRequired]);

  if (!open) return null;

  return (
    <div className="linkedin-card p-4 space-y-3 animate-scale-in border-dashed" aria-label="Developer mode">
      <div className="flex items-center justify-between">
        <span className="section-label flex items-center gap-1.5">
          <Code2 className="w-3.5 h-3.5 text-[#0A66C2]" /> Developer mode
        </span>
        <div className="flex items-center gap-1">
          {unlocked && (
            <button
              type="button"
              onClick={() => {
                setDeveloperToken(null);
                setUnlocked(false);
                setAccounts([]);
                onClose();
              }}
              className="text-[11px] font-semibold text-[#666666] dark:text-[#8B949E] hover:text-red-600 flex items-center gap-1 px-2 py-1 rounded-full"
            >
              <LogOut className="w-3 h-3" /> Exit
            </button>
          )}
          <button type="button" onClick={onClose} className="p-1 rounded-full text-[#666666] hover:bg-black/5 dark:hover:bg-white/5" aria-label="Hide developer mode">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!unlocked ? (
        <form onSubmit={unlock} className="space-y-2">
          <p className="text-xs text-[#666666] dark:text-[#8B949E]">Enter the developer key to use the presentation accounts.</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#666666]" />
              <input
                type="password"
                autoComplete="off"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Developer key"
                className="linkedin-input pl-9"
                autoFocus
              />
            </div>
            <button type="submit" disabled={loading || !key} className="linkedin-btn-primary text-xs px-4">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Unlock'}
            </button>
          </div>
          {error && <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}
        </form>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {accounts.map((a) => {
            const Icon = ROLE_ICON[a.role] || Briefcase;
            return (
              <button
                key={a.id}
                type="button"
                disabled={Boolean(busyId)}
                onClick={() => onPick(a)}
                className="p-2.5 rounded-xl border border-[#E0DFDC] dark:border-[#30363D] hover:border-[#0A66C2] dark:hover:border-[#58A6FF] text-left transition-all flex items-center gap-2.5 min-w-0"
              >
                <span className="w-8 h-8 rounded-lg bg-[#EBF3FB] dark:bg-[#0A66C2]/20 text-[#0A66C2] dark:text-[#58A6FF] flex items-center justify-center shrink-0">
                  {busyId === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold truncate">{a.name}</span>
                  <span className="block text-[10px] text-[#666666] dark:text-[#8B949E] truncate">{a.email}</span>
                </span>
              </button>
            );
          })}
          {!accounts.length && <p className="text-xs text-[#666666] dark:text-[#8B949E]">No demo accounts on this server.</p>}
        </div>
      )}
    </div>
  );
}
