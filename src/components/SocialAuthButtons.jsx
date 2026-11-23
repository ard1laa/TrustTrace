import React, { useEffect, useRef, useState } from 'react';

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
        el.onerror = () => reject(new Error(`Could not load ${src}`));
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

// Renders Google / Apple sign-in for whichever providers the server has configured.
export default function SocialAuthButtons({ providers, isDark, disabled, onToken, onError }) {
  const googleRef = useRef(null);
  const handlers = useRef({ onToken, onError });
  handlers.current = { onToken, onError };
  const [appleBusy, setAppleBusy] = useState(false);
  const google = providers?.google;
  const apple = providers?.apple;

  useEffect(() => {
    if (!google?.enabled || !google.webClientId || !googleRef.current) return;
    let cancelled = false;
    loadScript('https://accounts.google.com/gsi/client')
      .then(() => {
        if (cancelled || !window.google?.accounts?.id) return;
        window.google.accounts.id.initialize({
          client_id: google.webClientId,
          callback: (resp) => resp?.credential && handlers.current.onToken('google', resp.credential, {}),
          ux_mode: 'popup'
        });
        googleRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(googleRef.current, {
          theme: isDark ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: Math.min(googleRef.current.offsetWidth || 320, 400)
        });
      })
      .catch((err) => handlers.current.onError?.(err.message));
    return () => {
      cancelled = true;
    };
  }, [google?.enabled, google?.webClientId, isDark]);

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
      if (err?.error !== 'popup_closed_by_user') onError?.(err?.error || err?.message || 'Apple sign-in failed.');
    } finally {
      setAppleBusy(false);
    }
  };

  if (!google?.enabled && !apple?.enabled) return null;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-3 text-[11px] text-[#666666] dark:text-[#8B949E]">
        <span className="h-px flex-1 bg-[#E0DFDC] dark:bg-[#30363D]" />
        or
        <span className="h-px flex-1 bg-[#E0DFDC] dark:bg-[#30363D]" />
      </div>
      {google?.enabled && <div ref={googleRef} className={`w-full flex justify-center min-h-[44px] ${disabled ? 'pointer-events-none opacity-60' : ''}`} />}
      {apple?.enabled && (
        <button
          type="button"
          onClick={handleApple}
          disabled={disabled || appleBusy}
          className="w-full h-11 rounded-full bg-black text-white dark:bg-white dark:text-black font-semibold text-sm inline-flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <AppleLogo />
          Continue with Apple
        </button>
      )}
    </div>
  );
}
