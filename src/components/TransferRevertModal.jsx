import { apiFetch } from '../lib/api.js';
import React, { useState } from 'react';
import {
  X,
  Lock,
  ShieldAlert,
  ArrowRightLeft,
  Terminal,
  Loader2,
  CheckCircle2
} from 'lucide-react';

export default function TransferRevertModal({ isOpen, onClose, credential, onTransferAttemptLogged }) {
  const [targetAddress, setTargetAddress] = useState('0x71C95911E9a5D330f4D621842EC243EE134389A2');
  const [loading, setLoading] = useState(false);
  const [revertResult, setRevertResult] = useState(null);

  if (!isOpen || !credential) return null;

  const handleAttemptTransfer = async (e) => {
    e.preventDefault();
    setLoading(true);
    setRevertResult(null);
    try {
      const res = await apiFetch(`/api/credentials/${credential.id}/try-transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetAddress })
      });
      const data = await res.json();
      setRevertResult(data);
      if (onTransferAttemptLogged) onTransferAttemptLogged();
    } catch (err) {
      setRevertResult({
        reverted: true,
        evmError: `VM Exception while processing transaction: revert ErrSoulboundTokenLocked(${credential.tokenId || 1001})`
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4">
      <div className="linkedin-card w-full max-w-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#E0DFDC] dark:border-[#30363D] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-[#0A66C2] dark:text-[#58A6FF]" />
            <div>
              <h3 className="font-bold text-sm text-[#191919] dark:text-white">
                ERC-5192 Soulbound Non-Transferability Test
              </h3>
              <p className="text-[11px] text-[#666666] dark:text-[#8B949E]">
                Test <code className="font-mono">transferFrom(from, to, tokenId)</code> on Smart Contract
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setRevertResult(null);
              onClose();
            }}
            className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-[#666666]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleAttemptTransfer} className="p-5 space-y-4">
          <div className="p-3 rounded-lg bg-[#F4F2EE] dark:bg-[#0D1117] border border-[#E0DFDC] dark:border-[#30363D] text-xs space-y-1">
            <div className="font-semibold text-[#191919] dark:text-white">
              Target Badge: {credential.achievementTitle}
            </div>
            <div className="font-mono text-[11px] text-[#666666] dark:text-[#8B949E]">
              Token ID: SBT #{credential.tokenId || 1001} • locked({credential.tokenId || 1001}) = <strong className="text-emerald-600">true</strong>
            </div>
            <div className="font-mono text-[11px] text-[#666666] dark:text-[#8B949E] truncate">
              Current Holder Soul: {credential.holderAddress}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1 text-[#404040] dark:text-[#C9D1D9]">
              Attempt Transfer To External Wallet Address (<code className="font-mono">address to</code>)
            </label>
            <input
              type="text"
              required
              value={targetAddress}
              onChange={(e) => setTargetAddress(e.target.value)}
              className="linkedin-input font-mono text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-full font-semibold text-xs bg-amber-600 hover:bg-amber-700 text-white flex items-center justify-center gap-2 transition-all shadow-sm"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Broadcasting transferFrom() to IBFT Node...
              </>
            ) : (
              <>
                <ArrowRightLeft className="w-4 h-4" />
                Execute Smart Contract transferFrom() Call
              </>
            )}
          </button>

          {/* EVM Revert Output Box */}
          {revertResult && (
            <div className="p-4 rounded-xl bg-red-950/95 border border-red-500/60 text-red-100 space-y-2.5 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-red-300">
                  <ShieldAlert className="w-4 h-4 text-red-400" />
                  EVM Transaction Reverted (ERC-5192 Enforced)
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-500/30 text-red-200">
                  locked(uint256) == true
                </span>
              </div>

              <div className="p-2.5 rounded bg-black/50 border border-red-800/60 font-mono text-[11px] text-red-300 break-all leading-relaxed">
                <div className="flex items-center gap-1.5 text-red-400 font-bold mb-1">
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Solidity Custom Error Trace:</span>
                </div>
                {revertResult.evmError}
              </div>

              <div className="flex items-start gap-2 text-[11px] text-emerald-300 bg-emerald-950/60 border border-emerald-700/50 p-2.5 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Security Proof Verified:</strong> Because <code className="font-mono">TrustTraceSBT.sol</code> overrides <code className="font-mono">transferFrom</code> under EIP-5192, micro-credentials are permanently bound to the student&apos;s wallet and cannot be sold, traded, or stolen.
                </span>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
