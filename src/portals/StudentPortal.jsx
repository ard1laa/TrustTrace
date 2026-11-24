import React, { useState } from 'react';
import {
  PlusCircle,
  QrCode,
  ShieldCheck,
  Eye,
  EyeOff,
  Trash2,
  GraduationCap,
  Award,
  UserCog,
  Copy,
  Check,
  UserCheck
} from 'lucide-react';
import CompetencyRadarChart from '../components/CompetencyRadarChart.jsx';
import D3CompetencyGraph from '../components/D3CompetencyGraph.jsx';
import Avatar from '../components/Avatar.jsx';
import { resolveField, axisForCredential, axisColor } from '../../shared/skillTaxonomy.js';
import { CredentialTags } from '../components/CredentialTags.jsx';
import { shareLink } from '../lib/portfolioQr.js';

export default function StudentPortal({
  student,
  credentials = [],
  isDark,
  onOpenScanner,
  onOpenQrModal,
  onOpenProofModal,
  onOpenProfileModal,
  onTogglePrivacy,
  onToggleTalentVisibility,
  onDeleteCredential
}) {
  const [domainFilter, setDomainFilter] = useState('ALL');
  const [copiedLink, setCopiedLink] = useState(false);

  const field = resolveField(student?.fieldOfStudy || student?.program);
  const studentCreds = credentials.filter((c) => c.studentUserId === student?.id);
  const filteredCreds = studentCreds.filter((c) => domainFilter === 'ALL' || axisForCredential(c, field.id) === domainFilter);

  const verifiedCount = studentCreds.filter((c) => c.state === 'Locked').length;
  const publicCount = studentCreds.filter((c) => c.isPublic && c.state !== 'Draft').length;
  const avgMastery =
    studentCreds.length > 0
      ? Math.round(
          studentCreds.reduce((sum, c) => sum + (Number(c.masteryScore) || 88), 0) /
            studentCreds.length
        )
      : 0;

  const isVisibleInSearch = student?.visibleInTalentSearch !== false;

  const handleCopyPortfolioLink = () => {
    const shareUrl = student?.shareCode
      ? shareLink(student.shareCode)
      : `${window.location.origin}/verify?did=${encodeURIComponent(student?.did || '')}`;
    navigator.clipboard?.writeText(shareUrl).catch(() => {});
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  return (
    <div className="space-y-5 pb-20 md:pb-10">
      {/* CLEAN LINKEDIN-STYLE PROFILE HEADER */}
      <section className="linkedin-card overflow-hidden">
        <div className="h-24 sm:h-28 bg-gradient-to-r from-[#004182] via-[#0A66C2] to-[#1D4ED8]" />

        <div className="px-5 sm:px-6 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 -mt-10 sm:-mt-12 mb-3">
            <button type="button" onClick={() => onOpenProfileModal('profile')} className="rounded-full" aria-label="Edit profile">
              <Avatar user={student} size="lg" ring />
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={onOpenScanner}
                className="linkedin-btn-primary text-xs py-2 px-4"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Upload Certificate</span>
              </button>

              <button
                onClick={() => onOpenQrModal(null)}
                className="linkedin-btn-outline text-xs py-1.5 px-3.5"
              >
                <QrCode className="w-4 h-4" />
                <span>Portfolio QR</span>
              </button>

              <button
                onClick={handleCopyPortfolioLink}
                className="linkedin-btn-neutral text-xs py-1.5 px-3"
                title="Copy Candidate Portfolio Link / DID for Recruiters"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Link Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Share Link / DID</span>
                  </>
                )}
              </button>

              <button
                onClick={() => onOpenProfileModal('profile')}
                className="linkedin-btn-neutral text-xs py-1.5 px-3"
              >
                <UserCog className="w-3.5 h-3.5" />
                <span>Edit profile</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold text-[#191919] dark:text-white">
                  {student?.name}
                </h1>
                {student?.studentId && (
                  <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-[#EBF3FB] text-[#0A66C2] dark:bg-[#0A66C2]/20 dark:text-[#58A6FF]">
                    {student.studentId}
                  </span>
                )}
              </div>

              {student?.headline && <p className="text-sm text-[#404040] dark:text-[#C9D1D9]">{student.headline}</p>}
              {student?.bio && <p className="text-xs text-[#666666] dark:text-[#8B949E] max-w-2xl line-clamp-2">{student.bio}</p>}
              <div className="text-xs text-[#666666] dark:text-[#8B949E] flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1 font-medium text-[#191919] dark:text-[#C9D1D9]">
                  <GraduationCap className="w-3.5 h-3.5 text-[#0A66C2]" />
                  {field.label}
                  {student?.university ? ` · ${student.university}` : ''}
                </span>

                {/* Opt-In Recruiter Talent Discovery Privacy Toggle */}
                {onToggleTalentVisibility && (
                  <button
                    type="button"
                    onClick={() => onToggleTalentVisibility(!isVisibleInSearch)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-all ${
                      isVisibleInSearch
                        ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                        : 'bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    <UserCheck className="w-3 h-3" />
                    <span>
                      {isVisibleInSearch
                        ? 'Visible in Recruiter Talent Search'
                        : 'Hidden from Talent Search'}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Compact KPI Pills */}
            <div className="flex items-center gap-2.5">
              <div className="px-3 py-1.5 rounded-lg bg-[#F4F2EE] dark:bg-[#0D1117] border border-[#E0DFDC] dark:border-[#30363D] text-center">
                <div className="text-sm font-bold text-[#0A66C2] dark:text-[#58A6FF]">{verifiedCount}</div>
                <div className="text-[10px] text-[#666666] dark:text-[#8B949E]">Verified</div>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-[#F4F2EE] dark:bg-[#0D1117] border border-[#E0DFDC] dark:border-[#30363D] text-center">
                <div className="text-sm font-bold text-[#191919] dark:text-white">{publicCount}</div>
                <div className="text-[10px] text-[#666666] dark:text-[#8B949E]">Public</div>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-[#F4F2EE] dark:bg-[#0D1117] border border-[#E0DFDC] dark:border-[#30363D] text-center">
                <div className="text-sm font-bold text-emerald-600">{avgMastery}%</div>
                <div className="text-[10px] text-[#666666] dark:text-[#8B949E]">Score</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MAIN GRID: LEFT (CLEAN CERTIFICATE CARDS) | RIGHT (COMPETENCY RADAR) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 space-y-5">
          {/* Clean Certificate Cards List */}
          <div className="linkedin-card p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E0DFDC] dark:border-[#30363D]">
              <h2 className="font-bold text-base text-[#191919] dark:text-white flex items-center gap-2">
                <Award className="w-4 h-4 text-[#0A66C2]" />
                <span>My Credentials ({filteredCreds.length})</span>
              </h2>

              <select
                value={domainFilter}
                onChange={(e) => setDomainFilter(e.target.value)}
                className="linkedin-input w-auto text-xs py-1 px-2.5"
              >
                <option value="ALL">All skill areas</option>
                {field.axes.map((a) => a.name).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            {filteredCreds.length === 0 ? (
              <div className="py-10 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-[#EBF3FB] dark:bg-[#0A66C2]/20 text-[#0A66C2] flex items-center justify-center mx-auto">
                  <Award className="w-5 h-5" />
                </div>
                <div className="font-semibold text-sm text-[#191919] dark:text-white">
                  No certificates yet. Upload your first verified certificate.
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button onClick={onOpenScanner} className="linkedin-btn-primary text-xs">
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Upload Certificate</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-[#E0DFDC] dark:divide-[#30363D] mt-1">
                {filteredCreds.map((cred) => {
                  const axis = axisForCredential(cred, field.id);
                  const domainColor = axisColor(field.id, axis);
                  const isRevoked = cred.state === 'Revoked';
                  const isDraft = cred.state === 'Draft';

                  return (
                    <div key={cred.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 mt-0.5"
                          style={{ backgroundColor: isRevoked ? '#DC2626' : domainColor }}
                        >
                          <Award className="w-5 h-5" />
                        </div>

                        <div className="min-w-0 flex-1 space-y-1">
                          <h3
                            className={`font-bold text-sm truncate ${
                              isRevoked
                                ? 'line-through text-red-600 dark:text-red-400'
                                : 'text-[#191919] dark:text-white'
                            }`}
                          >
                            {cred.achievementTitle}
                          </h3>

                          <div className="text-xs text-[#666666] dark:text-[#8B949E] truncate">
                            {cred.issuingOrganization} •{' '}
                            {new Date(cred.issuanceDate).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </div>
                          <CredentialTags credential={cred} className="mt-1.5" />

                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            <span
                              className="px-2 py-0.5 rounded text-[11px] font-semibold text-white"
                              style={{ backgroundColor: domainColor }}
                            >
                              {axis}
                            </span>

                            <span
                              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                isRevoked
                                  ? 'bg-red-500/15 text-red-700 dark:text-red-300'
                                  : isDraft
                                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                  : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              }`}
                            >
                              {isRevoked ? 'Revoked' : isDraft ? 'Pending Admin' : 'Verified'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => onOpenQrModal(cred)}
                          className="linkedin-btn-neutral text-xs py-1 px-2.5"
                        >
                          <QrCode className="w-3.5 h-3.5 text-[#0A66C2]" />
                          <span>Share QR</span>
                        </button>

                        <button
                          onClick={() => onTogglePrivacy(cred.id, !cred.isPublic)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                            cred.isPublic
                              ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10'
                              : 'border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/10'
                          }`}
                        >
                          {cred.isPublic ? (
                            <>
                              <Eye className="w-3.5 h-3.5" />
                              <span>Public</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3.5 h-3.5" />
                              <span>Private</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => onOpenProofModal(cred)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-[#0A66C2] dark:text-[#58A6FF] hover:bg-[#EBF3FB] dark:hover:bg-[#0A66C2]/15 transition-all"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Technical Proof</span>
                        </button>

                        <button
                          onClick={() => onDeleteCredential(cred.id)}
                          className="p-1.5 rounded-full text-[#666666] hover:text-red-600 hover:bg-red-500/10 transition-all"
                          title="Delete Certificate"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Interactive Competency Graph */}
          <div className="linkedin-card p-4 sm:p-5">
            <h3 className="font-bold text-base text-[#191919] dark:text-white mb-2">
              Competency Network
            </h3>
            <D3CompetencyGraph
              student={student}
              field={field.id}
              isDark={isDark}
              credentials={studentCreds}
              onSelectCredential={(cred) => onOpenProofModal(cred)}
              respectPrivacy={true}
              height={360}
            />
          </div>
        </div>

        {/* Right 4 Columns: Multi-Axis Radar Chart */}
        <div className="lg:col-span-4">
          <div className="linkedin-card p-4 sm:p-5">
            <h3 className="font-bold text-base text-[#191919] dark:text-white mb-2">
              Skill Radar
            </h3>
            <CompetencyRadarChart
              field={field.id}
              credentials={studentCreds}
              respectPrivacy={true}
              isDark={isDark}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
