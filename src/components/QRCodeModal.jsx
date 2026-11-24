import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { X, Download, Copy, Check, ExternalLink, FileJson, WifiOff, Zap } from 'lucide-react';
import { buildPortfolioPayload, encodePortfolioUrl, shareLink, MAX_QR_CREDENTIALS } from '../lib/portfolioQr.js';
import { resolveField } from '../../shared/skillTaxonomy.js';

// Default: a short link QR (sparse, scans from a distance; the scanner fetches
// and verifies the signed credentials). Offline mode embeds the signed claims
// so a recruiter with no connection can still check them.
export default function QRCodeModal({ isOpen, onClose, credential, student, credentials = [] }) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const isPortfolio = !credential;
  const shortCode = isPortfolio ? student?.shareCode : credential?.shareCode;
  const useShort = Boolean(shortCode) && !offlineMode;

  const { url, payload } = useMemo(() => {
    if (!isOpen || !student) return { url: '', payload: null };
    if (useShort) return { url: shareLink(shortCode), payload: null };
    const source = isPortfolio ? credentials.filter((c) => c.studentUserId === student.id) : [credential];
    const p = buildPortfolioPayload(student, source);
    return { url: encodePortfolioUrl(p), payload: p };
  }, [isOpen, student, credential, credentials, isPortfolio, useShort, shortCode]);

  useEffect(() => {
    if (!url) return;
    // Short links get medium error correction: still sparse, and tolerant of glare on a phone screen.
    QRCode.toDataURL(url, { width: 360, margin: 2, errorCorrectionLevel: useShort ? 'M' : 'L', color: { dark: '#0B1F33', light: '#FFFFFF' } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [url, useShort]);

  useEffect(() => {
    if (!isOpen) setOfflineMode(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const offlineCount = payload?.c.length || 0;

  const downloadPng = () => {
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `trusttrace-${isPortfolio ? 'portfolio' : `credential-${credential.tokenId || credential.id}`}.png`;
    a.click();
  };

  const downloadJson = () => {
    const body = credential?.verifiableCredential || {
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      type: ['VerifiablePresentation'],
      holder: student?.did,
      verifiableCredential: credentials.filter((c) => c.studentUserId === student?.id && c.isPublic !== false).map((c) => c.verifiableCredential)
    };
    const href = URL.createObjectURL(new Blob([JSON.stringify(body, null, 2)], { type: 'application/ld+json' }));
    const a = document.createElement('a');
    a.href = href;
    a.download = `trusttrace-${isPortfolio ? 'presentation' : credential.id}.jsonld`;
    a.click();
    URL.revokeObjectURL(href);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel max-w-md" role="dialog" aria-modal="true" aria-label="Share QR code">
        <div className="px-5 py-3.5 border-b border-[#E0DFDC] dark:border-[#30363D] flex items-center justify-between">
          <h3 className="font-bold text-sm">{isPortfolio ? 'Share your portfolio' : 'Share this credential'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-[#666666]" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 text-center space-y-4">
          <div>
            <p className="font-bold text-sm">{isPortfolio ? student?.name : credential?.achievementTitle}</p>
            <p className="text-xs text-[#666666] dark:text-[#8B949E] mt-0.5">
              {isPortfolio ? `${resolveField(student?.fieldOfStudy).label}${student?.university ? ` · ${student.university}` : ''}` : credential?.issuingOrganization}
            </p>
          </div>

          {shortCode && (
            <div role="tablist" aria-label="QR type" className="segmented mx-auto">
              <button role="tab" aria-selected={!offlineMode} onClick={() => setOfflineMode(false)} className={!offlineMode ? 'is-active' : ''}>
                <Zap className="w-3.5 h-3.5" /> Quick scan
              </button>
              <button role="tab" aria-selected={offlineMode} onClick={() => setOfflineMode(true)} className={offlineMode ? 'is-active' : ''}>
                <WifiOff className="w-3.5 h-3.5" /> Offline QR
              </button>
            </div>
          )}

          <div className="inline-block p-3 bg-white rounded-2xl shadow-soft border border-[#E0DFDC]">
            {qrDataUrl ? <img src={qrDataUrl} alt="Verification QR code" className="w-60 h-60 sm:w-64 sm:h-64" /> : <div className="w-60 h-60 skeleton" />}
          </div>

          <div className="flex items-start gap-2 text-left p-3 rounded-xl bg-[#F4F2EE] dark:bg-[#0D1117] text-xs">
            {useShort ? <Zap className="w-4 h-4 text-[#0A66C2] shrink-0 mt-px" /> : <WifiOff className="w-4 h-4 text-[#0A66C2] shrink-0 mt-px" />}
            <span className="text-[#404040] dark:text-[#C9D1D9]">
              {useShort
                ? 'A short link that scans instantly, even from a distance. The recruiter’s device downloads your signed credentials and checks every signature and revocation status.'
                : offlineCount > 0
                ? `Contains ${offlineCount} signed credential${offlineCount === 1 ? '' : 's'} that can be verified offline${
                    isPortfolio && credentials.filter((c) => c.studentUserId === student?.id && c.state === 'Locked' && c.isPublic !== false).length > MAX_QR_CREDENTIALS
                      ? ` (your ${MAX_QR_CREDENTIALS} most recent)`
                      : ''
                  }. Revocation status is checked when the scanner is online.`
                : 'No public, minted credentials yet — this QR links to your profile only.'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <input readOnly value={url} className="linkedin-input text-xs font-mono py-1.5" onFocus={(e) => e.target.select()} />
            <button
              onClick={() => {
                navigator.clipboard?.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }}
              className="linkedin-btn-neutral py-1.5 px-3 shrink-0"
              aria-label="Copy link"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={downloadPng} disabled={!qrDataUrl} className="linkedin-btn-neutral text-xs py-2">
              <Download className="w-3.5 h-3.5" /> QR image
            </button>
            <button onClick={downloadJson} className="linkedin-btn-neutral text-xs py-2">
              <FileJson className="w-3.5 h-3.5" /> W3C JSON-LD
            </button>
          </div>

          <a href={url} target="_blank" rel="noreferrer" className="linkedin-btn-primary w-full py-2.5 text-xs">
            Preview what recruiters see <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
