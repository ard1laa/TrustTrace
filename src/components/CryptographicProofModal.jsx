import { apiFetch } from '../lib/api.js';
import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Lock,
  ArrowRightLeft,
  Bug,
  FileCode2,
  Copy,
  Check,
  Clock,
  Loader2
} from 'lucide-react';

const LIFECYCLE_STEPS = ['Draft', 'Signed', 'Anchored', 'Locked'];

export default function CryptographicProofModal({
  isOpen,
  onClose,
  credential,
  onOpenTransferModal
}) {
  const [verificationData, setVerificationData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [simulateTamper, setSimulateTamper] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [copiedKey, setCopiedKey] = useState('');

  useEffect(() => {
    if (isOpen && credential) {
      runProofCheck(credential, false);
    } else {
      setVerificationData(null);
      setSimulateTamper(false);
      setShowRawJson(false);
    }
  }, [isOpen, credential]);

  if (!isOpen || !credential) return null;

  const runProofCheck = async (cred, tamper = false) => {
    setLoading(true);
    setSimulateTamper(tamper);
    try {
      const res = await apiFetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credentialId: cred.id,
          tokenId: cred.tokenId,
          simulateTamper: tamper
        })
      });
      const data = await res.json();
      if (res.ok) setVerificationData(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (val, key) => {
    navigator.clipboard.writeText(val || '');
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 1800);
  };

  const v = verificationData?.verification;
  const steps = v?.steps;
  const eq = steps?.step4_ecdsaMath?.equations;
  const isRevoked = credential.state === 'Revoked';

  const currentStepIdx = isRevoked
    ? -1
    : LIFECYCLE_STEPS.indexOf(credential.state) !== -1
    ? LIFECYCLE_STEPS.indexOf(credential.state)
    : 3;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="linkedin-card w-full max-w-2xl max-h-[92vh] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E0DFDC] dark:border-[#30363D] flex items-center justify-between sticky top-0 bg-white dark:bg-[#1B1F23] z-10">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                v?.overallValid
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : 'bg-red-500/15 text-red-600 dark:text-red-400'
              }`}
            >
              {v?.overallValid ? (
                <ShieldCheck className="w-5 h-5" />
              ) : (
                <ShieldAlert className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="font-bold text-base text-[#191919] dark:text-white">
                Cryptographic Proof &amp; Lifecycle
              </h2>
              <p className="text-xs text-[#666666] dark:text-[#8B949E]">
                {credential.achievementTitle} • SBT #{credential.tokenId || 'Draft'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-[#666666]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* 1. STATE MACHINE LIFECYCLE BAR (Draft -> Signed -> Anchored -> Locked -> Revoked) */}
          <div className="p-3.5 rounded-xl bg-[#F4F2EE]/80 dark:bg-[#0D1117] border border-[#E0DFDC] dark:border-[#30363D]">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-[#666666] dark:text-[#8B949E]">
                State Machine Lifecycle
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                  isRevoked
                    ? 'bg-red-600 text-white'
                    : credential.state === 'Draft'
                    ? 'bg-amber-500 text-white'
                    : 'bg-emerald-600 text-white'
                }`}
              >
                {credential.state}
              </span>
            </div>

            <div className="grid grid-cols-5 gap-1.5 text-center">
              {['Draft', 'Signed', 'Anchored', 'Locked', 'Revoked'].map((st, idx) => {
                const isActive =
                  st === 'Revoked'
                    ? isRevoked
                    : !isRevoked && idx <= currentStepIdx;
                return (
                  <div
                    key={st}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold border ${
                      st === 'Revoked' && isRevoked
                        ? 'bg-red-600 text-white border-red-600'
                        : isActive
                        ? 'bg-[#0A66C2] text-white border-[#0A66C2]'
                        : 'bg-white dark:bg-[#1B1F23] text-[#666666] dark:text-[#8B949E] border-[#E0DFDC] dark:border-[#30363D]'
                    }`}
                  >
                    {st}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. 5-STEP CRYPTOGRAPHIC VERIFICATION HANDSHAKE */}
          {loading ? (
            <div className="py-8 text-center">
              <Loader2 className="w-7 h-7 text-[#0A66C2] animate-spin mx-auto" />
            </div>
          ) : (
            v && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        v.overallValid
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : 'bg-red-500/15 text-red-700 dark:text-red-300'
                      }`}
                    >
                      {steps?.step5_tokenState?.statusLabel}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-mono text-[#666666] dark:text-[#8B949E]">
                      <Clock className="w-3.5 h-3.5 text-[#0A66C2]" />
                      {v.latencyMs} ms
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => runProofCheck(credential, !simulateTamper)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                        simulateTamper
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10'
                      }`}
                    >
                      <Bug className="w-3.5 h-3.5" />
                      <span>{simulateTamper ? 'Restore Original' : 'Simulate Tamper'}</span>
                    </button>

                    {credential.state !== 'Draft' && onOpenTransferModal && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenTransferModal(credential);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        <span>Try Transfer (ERC-5192)</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Identifiers & Hashes */}
                <div className="p-3.5 rounded-xl bg-[#F4F2EE]/60 dark:bg-[#0D1117] border border-[#E0DFDC] dark:border-[#30363D] space-y-2 text-xs font-mono">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#666666] dark:text-[#8B949E]">Holder DID:</span>
                    <span className="truncate text-[#191919] dark:text-white">{credential.studentDid}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#666666] dark:text-[#8B949E]">Issuer DID:</span>
                    <span className="truncate text-[#191919] dark:text-white">{steps?.step2_didResolution?.issuerDid}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#666666] dark:text-[#8B949E]">IPFS CID:</span>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate text-[#0A66C2] dark:text-[#58A6FF]">ipfs://{credential.ipfsCid}</span>
                      <button onClick={() => handleCopy(credential.ipfsCid, 'cid')}>
                        {copiedKey === 'cid' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#666666] dark:text-[#8B949E]">Local SHA-256 (z):</span>
                    <span className="truncate text-[#191919] dark:text-white">
                      {steps?.step3_hashComparison?.computedLocalHashZ}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#666666] dark:text-[#8B949E]">On-Chain Hash:</span>
                    <span
                      className={`truncate font-bold ${
                        steps?.step3_hashComparison?.passed ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      {steps?.step3_hashComparison?.anchoredOnChainHash}
                    </span>
                  </div>
                </div>

                {/* ECDSA secp256r1 Mathematical Equations */}
                <div className="p-3.5 rounded-xl bg-[#0D1117] text-gray-200 font-mono text-[11px] space-y-1.5 border border-[#30363D] overflow-x-auto">
                  <div className="text-blue-400 font-bold">
                    // ECDSA (secp256r1 / NIST P-256) Signature Verification Math:
                  </div>
                  <div>Q_I (Issuer Public Key X) = {steps?.step2_didResolution?.publicKeyQx}</div>
                  <div>r = (k · G)_x mod n       = {eq?.r}</div>
                  <div>s = k⁻¹(z + r·d_I) mod n  = {eq?.s}</div>
                  <div>w = s⁻¹ mod n             = {eq?.w_invS}</div>
                  <div>u₁ = z · w mod n          = {eq?.u1}</div>
                  <div>u₂ = r · w mod n          = {eq?.u2}</div>
                  <div className={steps?.step4_ecdsaMath?.passed ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                    X = u₁·G + u₂·Q_I =&gt; X_x mod n = {eq?.Xx_mod_n}
                  </div>
                  <div className={steps?.step4_ecdsaMath?.passed ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                    Congruence Check: {eq?.congruenceCheck}
                  </div>
                </div>

                {/* Collapsible W3C JSON-LD Payload */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowRawJson(!showRawJson)}
                    className="linkedin-btn-neutral text-xs py-1.5 px-3"
                  >
                    <FileCode2 className="w-3.5 h-3.5" />
                    <span>{showRawJson ? 'Hide W3C JSON-LD Payload' : 'Inspect W3C JSON-LD Payload'}</span>
                  </button>

                  {showRawJson && (
                    <pre className="mt-2 p-3 rounded-xl bg-[#0D1117] text-emerald-300 font-mono text-[11px] overflow-x-auto border border-[#30363D] max-h-60">
                      {JSON.stringify(credential.verifiableCredential, null, 2)}
                    </pre>
                  )}
                </div>
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
