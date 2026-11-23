import React, { useState } from 'react';
import { BadgeCheck, Briefcase, Building2, Check, FileText, Loader2, Mail, UserCheck, X } from 'lucide-react';
import Avatar from './Avatar.jsx';
import { apiJson } from '../lib/api.js';

function ProofViewer({ request, onClose }) {
  const [proof, setProof] = useState(null);
  const [error, setError] = useState('');
  React.useEffect(() => {
    apiJson(`/api/admin/access-requests/${request.id}/proof`)
      .then((d) => setProof(d.proof))
      .catch((err) => setError(err.message));
  }, [request.id]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel max-w-2xl" role="dialog" aria-modal="true" aria-label={`Proof for ${request.name}`}>
        <div className="px-5 py-4 border-b border-[#E0DFDC] dark:border-[#30363D] flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="font-bold text-base truncate">{request.name}</h2>
            <p className="text-[11px] text-[#666666] dark:text-[#8B949E] truncate">{request.verification.proof?.fileName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-[#666666]" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 bg-[#F4F2EE] dark:bg-[#0D1117] min-h-[240px] flex items-center justify-center">
          {error && <p className="text-xs text-red-600">{error}</p>}
          {!proof && !error && <Loader2 className="w-6 h-6 animate-spin text-[#0A66C2]" />}
          {proof?.mimeType?.startsWith('image/') && <img src={proof.dataUrl} alt="Uploaded proof document" className="max-h-[70vh] rounded-lg shadow" />}
          {proof?.mimeType === 'application/pdf' && <iframe title="Proof document" src={proof.dataUrl} className="w-full h-[70vh] rounded-lg bg-white" />}
        </div>
      </div>
    </div>
  );
}

// Recruiter and staff accounts waiting for a registrar decision.
export default function AccessRequestsPanel({ requests = [], onReview }) {
  const [viewing, setViewing] = useState(null);
  const [busy, setBusy] = useState('');
  const pending = requests.filter((r) => r.accountStatus === 'pending_verification');
  if (!pending.length) return null;

  const decide = async (r, decision) => {
    const note = decision === 'reject' ? window.prompt(`Reason for declining ${r.name} (shown to them):`, 'We could not confirm your role from the document provided.') : '';
    if (note === null) return;
    setBusy(`${r.id}:${decision}`);
    await onReview(r.id, decision, note);
    setBusy('');
  };

  return (
    <section className="linkedin-card p-4 sm:p-5" aria-label="Account requests">
      <div className="flex items-center justify-between pb-3 border-b border-[#E0DFDC] dark:border-[#30363D]">
        <h2 className="font-bold text-base flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-[#0A66C2]" />
          Account requests
          <span className="chip bg-[#0A66C2] text-white">{pending.length}</span>
        </h2>
      </div>
      <ul className="divide-y divide-[#E0DFDC] dark:divide-[#30363D]">
        {pending.map((r) => {
          const v = r.verification;
          const RoleIcon = r.role === 'admin' ? Building2 : Briefcase;
          return (
            <li key={r.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Avatar user={r} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{r.name}</p>
                  <p className="text-xs text-[#666666] dark:text-[#8B949E] truncate flex items-center gap-1">
                    <RoleIcon className="w-3 h-3 shrink-0" />
                    {r.role === 'admin' ? `${r.departmentRole || 'Staff'} · ${r.university}` : `${r.jobTitle || 'Recruiter'} · ${r.companyName}`}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <span className={`chip ${v.institutionalEmail ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-800 dark:text-amber-300'}`}>
                      {v.institutionalEmail ? <BadgeCheck className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
                      {v.emailDomain}
                    </span>
                    {v.proof ? (
                      <button type="button" onClick={() => setViewing(r)} className="chip bg-[#EBF3FB] dark:bg-[#0A66C2]/20 text-[#0A66C2] dark:text-[#58A6FF] hover:underline">
                        <FileText className="w-3 h-3" /> View ID
                      </button>
                    ) : (
                      <span className="chip bg-black/5 dark:bg-white/5 text-[#666666] dark:text-[#8B949E]">No document</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button type="button" disabled={Boolean(busy)} onClick={() => decide(r, 'approve')} className="linkedin-btn-primary text-xs py-1.5 px-3.5">
                  {busy === `${r.id}:approve` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => decide(r, 'reject')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold text-red-600 bg-red-500/10 hover:bg-red-500/20"
                >
                  <X className="w-3.5 h-3.5" /> Decline
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {viewing && <ProofViewer request={viewing} onClose={() => setViewing(null)} />}
    </section>
  );
}
