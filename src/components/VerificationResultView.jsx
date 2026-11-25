import React from 'react';
import { ShieldCheck, ShieldAlert, WifiOff, GraduationCap, Award, XCircle, CheckCircle2, Ban } from 'lucide-react';
import Avatar from './Avatar.jsx';
import CompetencyRadarChart from './CompetencyRadarChart.jsx';
import D3CompetencyGraph from './D3CompetencyGraph.jsx';
import { resolveField, axisForCredential, axisColor } from '../../shared/skillTaxonomy.js';
import { CredentialTags } from './CredentialTags.jsx';

function StatusBadge({ cred }) {
  if (cred.revoked) return <span className="chip bg-red-500/15 text-red-700 dark:text-red-300"><Ban className="w-3 h-3" /> Revoked</span>;
  if (!cred.signatureValid) return <span className="chip bg-red-500/15 text-red-700 dark:text-red-300"><XCircle className="w-3 h-3" /> Invalid signature</span>;
  return <span className="chip bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="w-3 h-3" /> Verified</span>;
}

export default function VerificationResultView({ result, isDark, actions }) {
  const { holder, credentials = [], mode } = result;
  const field = resolveField(holder?.fieldOfStudy || holder?.program);
  const valid = credentials.filter((c) => c.signatureValid && !c.revoked);
  const anyInvalid = credentials.some((c) => !c.signatureValid);
  const revokedCount = credentials.filter((c) => c.signatureValid && c.revoked).length;
  const chartCreds = credentials.filter((c) => c.signatureValid && !c.revoked);
  // Online banner: red = a signature failed; amber = revoked or nothing to show; green = all valid.
  const tone = anyInvalid ? 'bad' : revokedCount || credentials.length === 0 ? 'caution' : 'good';
  const banner = {
    bad: { cls: 'bg-red-500/10 border-red-500/40', icon: <ShieldAlert className="w-5 h-5 shrink-0 text-red-600" />, title: 'Some credentials failed verification' },
    caution: {
      cls: 'bg-amber-500/10 border-amber-500/40',
      icon: <ShieldAlert className="w-5 h-5 shrink-0 text-amber-600" />,
      title: credentials.length === 0 ? 'Identity confirmed — no public credentials yet' : `${revokedCount} credential${revokedCount === 1 ? ' has' : 's have'} been revoked`
    },
    good: { cls: 'bg-emerald-500/10 border-emerald-500/40', icon: <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-600" />, title: 'Verified against the live registry' }
  }[tone];

  return (
    <div className="space-y-4 animate-fade-in">
      {mode === 'offline' ? (
        <div role="status" className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/40 text-amber-900 dark:text-amber-200 flex gap-3">
          <WifiOff className="w-5 h-5 shrink-0 text-amber-600" />
          <div className="text-xs leading-relaxed">
            <p className="font-bold text-sm">Verified offline (live revocation status unavailable)</p>
            <p>Signatures were checked on this device against the registrar's cached public key. Reconnect to confirm none have been revoked.</p>
          </div>
        </div>
      ) : (
        <div role="status" className={`p-3.5 rounded-2xl border flex gap-3 ${banner.cls}`}>
          {banner.icon}
          <div className="text-xs leading-relaxed">
            <p className="font-bold text-sm">{banner.title}</p>
            <p>
              {credentials.length === 0
                ? 'This candidate is registered, but hasn’t shared any minted credentials.'
                : `${valid.length} of ${credentials.length} credential${credentials.length === 1 ? '' : 's'} valid — signatures checked on this device${result.latencyMs ? ` · ${result.latencyMs} ms` : ''}.`}
            </p>
          </div>
        </div>
      )}

      <section className="linkedin-card p-4 sm:p-5 flex items-start gap-4">
        <Avatar user={holder} size="md" />
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-lg leading-tight truncate">{holder?.name}</h2>
          <p className="text-xs text-[#666666] dark:text-[#8B949E] flex items-center gap-1 mt-0.5 min-w-0">
            <GraduationCap className="w-3.5 h-3.5 text-[#0A66C2] shrink-0" />
            <span className="truncate">
              {field.label}
              {holder?.university ? ` · ${holder.university}` : ''}
            </span>
          </p>
          <p className="font-mono text-[10px] text-[#666666] dark:text-[#8B949E] truncate mt-1">{holder?.did}</p>
        </div>
        {actions && <div className="shrink-0 flex flex-col sm:flex-row gap-2">{actions}</div>}
      </section>

      <section className="linkedin-card p-4 sm:p-5">
        <h3 className="font-bold text-sm mb-2 flex items-center gap-2">
          <Award className="w-4 h-4 text-[#0A66C2]" /> Credentials ({credentials.length})
        </h3>
        {credentials.length === 0 ? (
          <p className="text-xs text-[#666666] dark:text-[#8B949E] py-6 text-center">No public credentials shared yet.</p>
        ) : (
          <ul className="divide-y divide-[#E0DFDC] dark:divide-[#30363D]">
            {credentials.map((c) => {
              const axis = axisForCredential(c, field.id);
              return (
                <li key={c.id} className="py-3 flex items-start gap-3">
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0" style={{ backgroundColor: c.revoked || !c.signatureValid ? '#DC2626' : axisColor(field.id, axis) }}>
                    <Award className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`font-semibold text-sm truncate ${c.revoked ? 'line-through text-red-600' : ''}`}>{c.achievementTitle}</p>
                    <p className="text-xs text-[#666666] dark:text-[#8B949E] truncate">
                      {c.issuingOrganization} · {new Date(c.issuanceDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <span className="chip text-white" style={{ backgroundColor: axisColor(field.id, axis) }}>{axis}</span>
                      <StatusBadge cred={c} />
                      <CredentialTags credential={c} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {chartCreds.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <section className="lg:col-span-7 linkedin-card p-4 sm:p-5">
            <h3 className="font-bold text-sm mb-2">Skill network</h3>
            <D3CompetencyGraph student={holder} field={field.id} credentials={chartCreds} isDark={isDark} height={340} />
          </section>
          <section className="lg:col-span-5 linkedin-card p-4 sm:p-5">
            <h3 className="font-bold text-sm mb-2">Skill radar</h3>
            <CompetencyRadarChart credentials={chartCreds} field={field.id} isDark={isDark} compact />
          </section>
        </div>
      )}
    </div>
  );
}
