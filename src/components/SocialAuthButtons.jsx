import React, { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';

const loaded = new Map();
function loadScript(src) {
  if (!loaded.has(src)) {
    loaded.set(
      src,
      new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.src = src;
        el.async = true;
        el.onload = resolve;
        el.onerror = () => {
          loaded.delete(src);
          reject(new Error('Could not reach the sign-in service. Check your connection and try again.'));
        };
        document.head.appendChild(el);
      })
    );
  }
  return loaded.get(src);
}

function AppleLogo() {
  return (
    <svg viewBox="0 0 17 20" className="w-4 h-4" fill="currentColor" aria-hidden="true">
      <path d="M14.2 10.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9C3.7 4.8 2 5.8 1.1 7.4c-1.9 3.3-.5 8.1 1.3 10.8.9 1.3 2 2.7 3.3 2.7 1.3-.1 1.8-.9 3.4-.9s2 .9 3.4.8c1.4 0 2.3-1.3 3.2-2.6 1-1.5 1.4-2.9 1.4-3-.1 0-2.9-1.1-2.9-4.6zM11.6 3c.7-.9 1.2-2 1.1-3.2-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.1 1.1.1 2.3-.6 3-1.5z" />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-4 h-4" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

const SETTINGS = { google: 'GOOGLE_CLIENT_ID', apple: 'APPLE_SERVICE_ID' };

// Google / Apple buttons.
//   mode: 'signin' | 'signup' | 'link' — wording only.
//   dividerLabel: text of the "or" divider; placed below the buttons (they sit
//   above the email form) unless dividerPosition="top".
// Providers the server hasn't configured are hidden in production. On a
// development server they show disabled, naming the setting to add.
export default function SocialAuthButtons({
  providers,
  isDark,
  disabled,
  onToken,
  onError,
  mode = 'signin',
  dividerLabel = 'or continue with email',
  dividerPosition = 'bottom',
  exclude = []
}) {
  const googleRef = useRef(null);
  const handlers = useRef({ onToken, onError });
  handlers.current = { onToken, onError };
  const [appleBusy, setAppleBusy] = useState(false);
  const google = exclude.includes('google') ? null : providers?.google;
  const apple = exclude.includes('apple') ? null : providers?.apple;
  const hints = Boolean(providers?.setupHints);
  const verb = mode === 'link' ? 'Link' : mode === 'signup' ? 'Sign up with' : 'Continue with';

  useEffect(() => {
    if (!google?.enabled || !google.webClientId || !googleRef.current) return;
    let cancelled = false;
    loadScript('https://accounts.google.com/gsi/client')
      .then(() => {
        if (cancelled || !window.google?.accounts?.id || !googleRef.current) return;
        window.google.accounts.id.initialize({
          client_id: google.webClientId,
          callback: (resp) => resp?.credential && handlers.current.onToken('google', resp.credential, {}),
          ux_mode: 'popup',
          cancel_on_tap_outside: true
        });
        googleRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(googleRef.current, {
          theme: isDark ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'pill',
          text: mode === 'signup' ? 'signup_with' : 'continue_with',
          logo_alignment: 'center',
          width: Math.max(220, Math.min(googleRef.current.offsetWidth || 360, 400))
        });
      })
      .catch((err) => handlers.current.onError?.(err.message));
    return () => {
      cancelled = true;
    };
  }, [google?.enabled, google?.webClientId, isDark, mode]);

  const handleApple = async () => {
    setAppleBusy(true);
    try {
      await loadScript('https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js');
      window.AppleID.auth.init({
        clientId: apple.serviceId,
        scope: 'name email',
        redirectURI: apple.redirectUri || `${window.location.origin}/api/auth/oauth/apple/callback`,
        usePopup: true
      });
      const res = await window.AppleID.auth.signIn();
      const name = [res.user?.name?.firstName, res.user?.name?.lastName].filter(Boolean).join(' ');
      onToken('apple', res.authorization.id_token, name ? { name } : {});
    } catch (err) {
      const code = err?.error || '';
      if (code !== 'popup_closed_by_user' && code !== 'user_cancelled_authorize') {
        onError?.(code === 'popup_blocked_by_browser' ? 'Allow pop-ups for this site to continue with Apple.' : err?.message || 'Apple sign-in failed. Please try again.');
      }
    } finally {
      setAppleBusy(false);
    }
  };

  const showGoogle = google?.enabled || hints;
  const showApple = apple?.enabled || hints;
  if (!providers || (!showGoogle && !showApple)) return null;
  const missing = [!google?.enabled && showGoogle && 'google', !apple?.enabled && showApple && 'apple'].filter(Boolean);

  const divider = (
    <div className="flex items-center gap-3 text-[11px] font-medium text-[#666666] dark:text-[#8B949E]" role="separator">
      <span className="h-px flex-1 bg-[#E0DFDC] dark:bg-[#30363D]" />
      {dividerLabel}
      <span className="h-px flex-1 bg-[#E0DFDC] dark:bg-[#30363D]" />
    </div>
  );

  const placeholder = (provider) => (
    <button
      type="button"
      disabled
      title={`Not set up on this server: add ${SETTINGS[provider]} to .env`}
      className="w-full h-11 rounded-full border border-[#C0BFBC] dark:border-[#30363D] bg-white dark:bg-[#0D1117] text-sm font-semibold inline-flex items-center justify-center gap-2 opacity-55 cursor-not-allowed"
    >
      {provider === 'google' ? <GoogleLogo /> : <AppleLogo />}
      {verb} {provider === 'google' ? 'Google' : 'Apple'}
    </button>
  );

  return (
    <div className="space-y-2.5">
      {dividerLabel && dividerPosition === 'top' && divider}
      {showGoogle &&
        (google?.enabled ? (
          <div ref={googleRef} data-testid="google-signin" className={`w-full flex justify-center min-h-[44px] ${disabled ? 'pointer-events-none opacity-60' : ''}`} />
        ) : (
          placeholder('google')
        ))}
      {showApple &&
        (apple?.enabled ? (
          <button
            type="button"
            onClick={handleApple}
            disabled={disabled || appleBusy}
            className="w-full h-11 rounded-full bg-black text-white dark:bg-white dark:text-black font-semibold text-sm inline-flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <AppleLogo />
            {verb} Apple
          </button>
        ) : (
          placeholder('apple')
        ))}
      {missing.length > 0 && (
        <p className="text-[11px] leading-snug text-[#666666] dark:text-[#8B949E] flex gap-1.5">
          <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>
            Developer note: {missing.map((p) => (p === 'google' ? 'Google' : 'Apple')).join(' and ')} sign-in {missing.length > 1 ? 'are' : 'is'} not set up on this
            server. Add {missing.map((p) => <code key={p} className="font-mono">{SETTINGS[p]}</code>).reduce((a, b) => [a, ' and ', b])} to <code className="font-mono">.env</code> and
            restart (see docs/SOCIAL_SIGN_IN.md). Hidden in production until configured.
          </span>
        </p>
      )}
      {dividerLabel && dividerPosition === 'bottom' && divider}
    </div>
  );
}
