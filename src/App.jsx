import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle2, X, WifiOff, AlertTriangle } from 'lucide-react';
import Navbar from './components/Navbar.jsx';
import AuthScreen from './components/AuthScreen.jsx';
import PublicVerifyPage from './components/PublicVerifyPage.jsx';
import PendingVerificationScreen from './components/PendingVerificationScreen.jsx';
import StudentPortal from './portals/StudentPortal.jsx';
import RecruiterPortal from './portals/RecruiterPortal.jsx';
import AdminPortal from './portals/AdminPortal.jsx';
import AIScannerModal from './components/AIScannerModal.jsx';
import QRCodeModal from './components/QRCodeModal.jsx';
import TransferRevertModal from './components/TransferRevertModal.jsx';
import CryptographicProofModal from './components/CryptographicProofModal.jsx';
import ProfileSettingsModal from './components/ProfileSettingsModal.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { apiFetch, apiJson, setSession, endSession, getSavedUser, getToken } from './lib/api.js';
import { saveSnapshot, loadSnapshot, clearSnapshots } from './lib/offlineStore.js';
import { cacheIssuerDid } from './lib/verification.js';

const ROLE_PATHS = { admin: '/admin', recruiter: '/recruiter', student: '/student' };
const isVerifyRoute = () =>
  window.location.pathname === '/verify' || /^\/v\/[0-9a-z]{8}\/?$/i.test(window.location.pathname) || /[#&]tt1=/.test(window.location.hash);

function readTheme() {
  try {
    return localStorage.getItem('trusttrace_theme') || 'system';
  } catch {
    return 'system';
  }
}

export default function App() {
  const [themeMode, setThemeMode] = useState(readTheme);
  const [isDark, setIsDark] = useState(false);
  const [authRoute, setAuthRoute] = useState('/login');
  const [currentUser, setCurrentUser] = useState(getSavedUser);
  const [showVerify, setShowVerify] = useState(isVerifyRoute);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  const [students, setStudents] = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [logoRegistry, setLogoRegistry] = useState([]);
  const [recruiterShortlists, setRecruiterShortlists] = useState({});
  const [accessRequests, setAccessRequests] = useState([]);
  const [txLogs, setTxLogs] = useState([]);
  const [dbStatus, setDbStatus] = useState(null);
  const [issuerDidDocument, setIssuerDidDocument] = useState(null);
  const [soliditySource, setSoliditySource] = useState('');

  const [scannerOpen, setScannerOpen] = useState(false);
  const [qrTarget, setQrTarget] = useState({ open: false, credential: null });
  const [proofTarget, setProofTarget] = useState({ open: false, credential: null });
  const [transferTarget, setTransferTarget] = useState({ open: false, credential: null });
  const [profileModal, setProfileModal] = useState({ open: false, tab: 'profile' });

  const [customLogoUrl, setCustomLogoUrl] = useState(() => {
    try {
      return localStorage.getItem('trusttrace_custom_logo') || '';
    } catch {
      return '';
    }
  });
  const [toast, setToast] = useState(null);

  // options: { tone: 'info' | 'warn', sticky, action: { label, run } }
  const showToast = useCallback((message, options = {}) => {
    const next = { message, ...options, id: Date.now() + Math.random() };
    setToast(next);
    if (!options.sticky) setTimeout(() => setToast((prev) => (prev?.id === next.id ? null : prev)), options.duration || 4000);
  }, []);

  // Service worker: offer the new version instead of reloading mid-task.
  useEffect(() => {
    const onUpdate = (e) => showToast('A new version of TrustTrace is ready.', { sticky: true, action: { label: 'Refresh', run: e.detail } });
    // Only worth saying in the installed app; a recruiter opening a scanned link doesn't need it.
    const onOfflineReady = () => window.matchMedia?.('(display-mode: standalone)').matches && showToast('TrustTrace is ready to work offline.');
    window.addEventListener('trusttrace:update-ready', onUpdate);
    window.addEventListener('trusttrace:offline-ready', onOfflineReady);
    return () => {
      window.removeEventListener('trusttrace:update-ready', onUpdate);
      window.removeEventListener('trusttrace:offline-ready', onOfflineReady);
    };
  }, [showToast]);

  // Theme: light | dark | system
  useEffect(() => {
    try {
      localStorage.setItem('trusttrace_theme', themeMode);
    } catch {
      // ignore
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = themeMode === 'dark' || (themeMode === 'system' && mq.matches);
      setIsDark(dark);
      document.documentElement.classList.toggle('dark', dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1B1F23' : '#0A66C2');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [themeMode]);

  const applyData = useCallback((usersData, statusData) => {
    if (statusData?.ok) {
      setDbStatus(statusData.status);
      setIssuerDidDocument(statusData.issuerDidDocument);
      setSoliditySource(statusData.soliditySource);
      setLogoRegistry(statusData.logoRegistry || []);
    }
    if (usersData) {
      setStudents(usersData.students || []);
      setCredentials(usersData.credentials || []);
      setTxLogs(usersData.txLogs?.length ? usersData.txLogs : statusData?.txLogs || []);
      if (usersData.logoRegistry) setLogoRegistry(usersData.logoRegistry);
      setRecruiterShortlists(usersData.recruiterShortlists || {});
      setAccessRequests(usersData.accessRequests || []);
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    try {
      const [statusRes, usersRes] = await Promise.all([apiFetch('/api/status'), apiFetch('/api/users')]);
      // The server answered, so live data is showing (navigator.onLine alone
      // stays true on Wi-Fi that can't actually reach the server).
      setOnline(true);
      if (!statusRes.ok || !usersRes.ok) return;
      const [statusData, usersData] = await Promise.all([statusRes.json(), usersRes.json()]);
      applyData(usersData, statusData);
      cacheIssuerDid(statusData.issuerDidDocument);
      if (getToken()) {
        if (usersData.me) {
          setCurrentUser((prev) => {
            if (prev && prev.accountStatus !== 'verified' && usersData.me.accountStatus === 'verified') {
              setToast('Your account has been verified. Welcome to TrustTrace.');
            }
            return usersData.me;
          });
          setSession(getToken(), usersData.me);
        } else {
          // Token no longer maps to an account (deleted or expired).
          window.dispatchEvent(new CustomEvent('trusttrace:session-expired'));
        }
      }
      saveSnapshot('dashboard', { usersData, statusData: { ...statusData, soliditySource: '' } });
    } catch (err) {
      // Server unreachable: keep showing the last snapshot, and say so.
      if (err?.offline) setOnline(false);
    }
  }, [applyData]);

  // Instant paint from the last snapshot, then refresh from the network.
  useEffect(() => {
    loadSnapshot('dashboard').then((snap) => snap?.value && applyData(snap.value.usersData, snap.value.statusData));
    fetchAllData();
  }, [applyData, fetchAllData]);

  // Realtime: server-sent change events, with a slow poll as a safety net.
  const refetchTimer = useRef(null);
  useEffect(() => {
    const scheduleRefetch = () => {
      clearTimeout(refetchTimer.current);
      refetchTimer.current = setTimeout(fetchAllData, 250);
    };
    let source;
    if (typeof EventSource !== 'undefined') {
      source = new EventSource('/api/events');
      source.addEventListener('change', scheduleRefetch);
      source.addEventListener('hello', scheduleRefetch);
    }
    const poll = setInterval(fetchAllData, 30000);
    const goOnline = () => {
      setOnline(true);
      scheduleRefetch();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('focus', scheduleRefetch);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      source?.close();
      clearInterval(poll);
      clearTimeout(refetchTimer.current);
      window.removeEventListener('focus', scheduleRefetch);
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [fetchAllData]);

  const logout = useCallback(
    (message = 'Signed out.', tone = 'info') => {
      endSession();
      clearSnapshots();
      setCurrentUser(null);
      setAuthRoute('/login');
      setProfileModal((m) => ({ ...m, open: false }));
      if (message) showToast(message, { tone, duration: tone === 'warn' ? 6000 : 4000 });
    },
    [showToast]
  );

  useEffect(() => {
    const onExpired = (e) => logout(e.detail?.message || 'Session expired. Please log in again.', 'warn');
    window.addEventListener('trusttrace:session-expired', onExpired);
    return () => window.removeEventListener('trusttrace:session-expired', onExpired);
  }, [logout]);

  // Keep the URL in sync with the signed-in role.
  useEffect(() => {
    if (showVerify) return;
    const target = currentUser ? ROLE_PATHS[currentUser.role] || '/student' : authRoute;
    if (window.location.pathname !== target) window.history.replaceState({}, '', target);
  }, [currentUser, authRoute, showVerify]);

  const act = useCallback(
    async (path, options, successFallback) => {
      try {
        const data = await apiJson(path, options);
        await fetchAllData();
        showToast(data.message || successFallback);
        return data;
      } catch (err) {
        showToast(err.message);
        return null;
      }
    },
    [fetchAllData, showToast]
  );

  const handleTogglePrivacy = (credId, isPublic) => act(`/api/credentials/${credId}/privacy`, { method: 'PATCH', body: { isPublic } });
  const handleToggleTalentVisibility = (visible) =>
    currentUser && act(`/api/users/${currentUser.id}/talent-visibility`, { method: 'PATCH', body: { visibleInTalentSearch: visible } });
  const handleRevokeCredential = (credId) => act(`/api/credentials/${credId}/revoke`, { method: 'POST', body: { reason: 'Revoked by the registrar.' } });
  const handleDeleteCredential = (credId) => act(`/api/credentials/${credId}`, { method: 'DELETE' });
  const handleApproveMint = (credId) => act(`/api/credentials/${credId}/approve-mint`, { method: 'POST', body: {} });
  const handleChangeState = (credId, state) => act(`/api/credentials/${credId}/state`, { method: 'PATCH', body: { state } });

  const toastData = typeof toast === 'string' ? { message: toast } : toast;
  const warnToast = toastData?.tone === 'warn';
  const toastEl = toastData && (
    <div
      key={toastData.id}
      role={warnToast ? 'alert' : 'status'}
      className={`toast fixed top-[72px] inset-x-3 sm:inset-x-auto sm:right-4 z-[60] sm:max-w-sm linkedin-card p-3 border-l-4 ${warnToast ? 'border-l-amber-500' : 'border-l-[#0A66C2]'} flex items-center gap-2.5 animate-slide-up`}
    >
      {warnToast ? (
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
      ) : (
        <CheckCircle2 className="w-4 h-4 text-[#0A66C2] dark:text-[#58A6FF] shrink-0" />
      )}
      <span className="text-xs font-medium flex-1">{toastData.message}</span>
      {toastData.action && (
        <button
          onClick={() => {
            toastData.action.run?.();
            setToast(null);
          }}
          className="linkedin-btn-primary text-xs px-3 py-1"
        >
          {toastData.action.label}
        </button>
      )}
      <button onClick={() => setToast(null)} className="p-1 rounded-full text-[#666666] hover:bg-black/5 dark:hover:bg-white/10 transition-colors" aria-label="Dismiss">
        <X className="w-4 h-4" />
      </button>
    </div>
  );

  if (showVerify) {
    return (
      <>
        {toastEl}
        <PublicVerifyPage
          isDark={isDark}
          customLogoUrl={customLogoUrl}
          backLabel={currentUser ? 'Back to dashboard' : 'Sign in'}
          onBack={() => {
            window.history.replaceState({}, '', currentUser ? ROLE_PATHS[currentUser.role] : '/login');
            setShowVerify(false);
          }}
        />
      </>
    );
  }

  if (!currentUser) {
    return (
      <>
        {toastEl}
        <AuthScreen
          authRoute={authRoute}
          setAuthRoute={setAuthRoute}
          themeMode={themeMode}
          setThemeMode={setThemeMode}
          customLogoUrl={customLogoUrl}
          isDark={isDark}
          onAuthSuccess={async (user, token, msg) => {
            setSession(token, user);
            setCurrentUser(user);
            if (msg) showToast(msg);
            fetchAllData();
          }}
        />
      </>
    );
  }

  if ((currentUser.accountStatus || 'verified') !== 'verified') {
    return (
      <>
        {toastEl}
        <PendingVerificationScreen
          user={currentUser}
          customLogoUrl={customLogoUrl}
          onUserUpdated={(user) => {
            setSession(getToken(), user);
            setCurrentUser(user);
          }}
          onLogout={() => logout()}
          onNotify={showToast}
        />
      </>
    );
  }

  const draftQueueCount = credentials.filter((c) => c.state === 'Draft').length;
  const openProof = (cred) => setProofTarget({ open: true, credential: cred });

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#F4F2EE] dark:bg-[#0D1117] text-[#191919] dark:text-[#E6EDF3]">
      <Navbar
        currentUser={currentUser}
        themeMode={themeMode}
        setThemeMode={setThemeMode}
        draftQueueCount={draftQueueCount}
        onOpenScanner={() => setScannerOpen(true)}
        onOpenProfileModal={() => setProfileModal({ open: true, tab: 'profile' })}
        onLogout={() => logout()}
        customLogoUrl={customLogoUrl}
      />

      {!online && (
        <div className="bg-amber-500/15 text-amber-900 dark:text-amber-200 text-xs font-medium px-4 py-2 flex items-center justify-center gap-2 border-b border-amber-500/30">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>
            Can’t reach the TrustTrace server — showing your last saved data. Uploading, issuing and live revocation checks need a connection; Offline QR codes can still be checked.
          </span>
        </div>
      )}
      {toastEl}

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 pt-5">
        {currentUser.role === 'student' && (
          <StudentPortal
            student={currentUser}
            credentials={credentials}
            isDark={isDark}
            onOpenScanner={() => setScannerOpen(true)}
            onOpenQrModal={(cred) => setQrTarget({ open: true, credential: cred })}
            onOpenProofModal={openProof}
            onOpenProfileModal={(tab = 'profile') => setProfileModal({ open: true, tab })}
            onTogglePrivacy={handleTogglePrivacy}
            onToggleTalentVisibility={handleToggleTalentVisibility}
            onDeleteCredential={handleDeleteCredential}
          />
        )}

        {currentUser.role === 'recruiter' && (
          <RecruiterPortal
            recruiter={currentUser}
            students={students}
            credentials={credentials}
            recruiterShortlists={recruiterShortlists}
            isDark={isDark}
            onOpenProofModal={openProof}
            onRefreshData={fetchAllData}
            onNotify={showToast}
          />
        )}

        {currentUser.role === 'admin' && (
          <AdminPortal
            adminUser={currentUser}
            students={students}
            credentials={credentials}
            logoRegistry={logoRegistry}
            txLogs={txLogs}
            issuerDidDocument={issuerDidDocument}
            soliditySource={soliditySource}
            dbStatus={dbStatus}
            isDark={isDark}
            onApproveMint={handleApproveMint}
            onChangeState={handleChangeState}
            onRevokeCredential={handleRevokeCredential}
            onDeleteCredential={handleDeleteCredential}
            accessRequests={accessRequests}
            onReviewAccess={(userId, decision, note) =>
              act(`/api/admin/access-requests/${userId}/decision`, { method: 'POST', body: { decision, note } })
            }
            onManualIssued={async (_cred, msg) => {
              await fetchAllData();
              showToast(msg);
            }}
            onOpenProofModal={openProof}
            onRefreshData={fetchAllData}
            onNotify={showToast}
          />
        )}
      </main>

      <ErrorBoundary variant="modal" name="Certificate upload" open={scannerOpen} resetKey={scannerOpen} onClose={() => setScannerOpen(false)}>
        <AIScannerModal
          isOpen={scannerOpen}
          onClose={() => setScannerOpen(false)}
          currentUser={currentUser}
          onCredentialIssued={async (_cred, msg) => {
            await fetchAllData();
            showToast(msg);
          }}
        />
      </ErrorBoundary>

      <ErrorBoundary variant="modal" name="Portfolio QR" open={qrTarget.open} resetKey={qrTarget.open} onClose={() => setQrTarget({ open: false, credential: null })}>
        <QRCodeModal
          isOpen={qrTarget.open}
          onClose={() => setQrTarget({ open: false, credential: null })}
          credential={qrTarget.credential}
          student={currentUser}
          credentials={credentials}
        />
      </ErrorBoundary>

      <ErrorBoundary variant="modal" name="Credential proof" open={proofTarget.open} resetKey={proofTarget.open} onClose={() => setProofTarget({ open: false, credential: null })}>
        <CryptographicProofModal
          isOpen={proofTarget.open}
          onClose={() => setProofTarget({ open: false, credential: null })}
          credential={proofTarget.credential}
          onOpenTransferModal={(cred) => setTransferTarget({ open: true, credential: cred })}
        />
      </ErrorBoundary>

      <ErrorBoundary variant="modal" name="Transfer check" open={transferTarget.open} resetKey={transferTarget.open} onClose={() => setTransferTarget({ open: false, credential: null })}>
        <TransferRevertModal
          isOpen={transferTarget.open}
          onClose={() => setTransferTarget({ open: false, credential: null })}
          credential={transferTarget.credential}
          onTransferAttemptLogged={fetchAllData}
        />
      </ErrorBoundary>

      <ErrorBoundary variant="modal" name="Profile & settings" open={profileModal.open} resetKey={profileModal.open} onClose={() => setProfileModal((m) => ({ ...m, open: false }))}>
        <ProfileSettingsModal
          isOpen={profileModal.open}
          onClose={() => setProfileModal((m) => ({ ...m, open: false }))}
          initialTab={profileModal.tab}
          currentUser={currentUser}
          customLogoUrl={customLogoUrl}
          setCustomLogoUrl={setCustomLogoUrl}
          onUserUpdated={(user, token) => {
            setSession(token || getToken(), user);
            setCurrentUser(user);
            fetchAllData();
          }}
          onAccountDeleted={(data) => logout(data.message)}
          onNotify={showToast}
        />
      </ErrorBoundary>
    </div>
  );
}
