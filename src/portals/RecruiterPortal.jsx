import { apiFetch } from '../lib/api.js';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Briefcase,
  ShieldCheck,
  Award,
  QrCode,
  CheckCircle2,
  Globe,
  ScanLine,
  BookmarkCheck,
  BookmarkPlus,
  Search,
  Trash2,
  GraduationCap,
  SlidersHorizontal,
  ArrowUpRight,
  XCircle
} from 'lucide-react';
import LiveQRScanner, { decodeQrFromImageFile } from '../components/LiveQRScanner.jsx';
import D3CompetencyGraph from '../components/D3CompetencyGraph.jsx';
import CompetencyRadarChart from '../components/CompetencyRadarChart.jsx';
import VerificationResultView from '../components/VerificationResultView.jsx';
import Avatar from '../components/Avatar.jsx';
import { FIELDS, resolveField, axisForCredential, axisColor } from '../../shared/skillTaxonomy.js';
import { CredentialTags } from '../components/CredentialTags.jsx';
import { decodePortfolioText } from '../lib/portfolioQr.js';
import { verifyScannedText } from '../lib/verification.js';

const fieldLabelOf = (user) => resolveField(user?.fieldOfStudy || user?.program).label;

export default function RecruiterPortal({
  recruiter,
  students = [],
  credentials = [],
  recruiterShortlists = {},
  initialSelectedCredential,
  isDark,
  onOpenQrModal,
  onOpenProofModal,
  onRefreshData,
  onNotify
}) {
  // 3-Tab Recruiter Workflow: 'verify' | 'shortlist' | 'search'
  const [activeTab, setActiveTab] = useState('verify');

  // Tab 1: Active Verified Candidate (NEVER auto-populated from all students unless scanned/selected!)
  const [verifiedStudentId, setVerifiedStudentId] = useState(
    initialSelectedCredential?.studentUserId || ''
  );
  const [selectedCred, setSelectedCred] = useState(initialSelectedCredential || null);
  const [handshakeInfo, setHandshakeInfo] = useState(null);
  const [scanResult, setScanResult] = useState(null);

  // Tab 2: Private Per-Recruiter Shortlist
  const [myShortlist, setMyShortlist] = useState([]);

  // Tab 3: Talent Discovery Search Filters (Results appear ONLY when actively searched/filtered)
  const [searchQuery, setSearchQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState('ALL');
  const [minScore, setMinScore] = useState(75);
  const [hasSearched, setHasSearched] = useState(false);

  // Sync shortlist for this specific logged-in recruiter
  useEffect(() => {
    if (recruiter?.id && recruiterShortlists && recruiterShortlists[recruiter.id]) {
      setMyShortlist(recruiterShortlists[recruiter.id]);
    } else if (recruiter?.id) {
      apiFetch(`/api/recruiter/${recruiter.id}/shortlist`)
        .then((r) => r.json())
        .then((d) => {
          if (d.ok && Array.isArray(d.shortlist)) setMyShortlist(d.shortlist);
        })
        .catch(() => {});
    }
  }, [recruiter?.id, recruiterShortlists]);

  useEffect(() => {
    if (initialSelectedCredential) {
      setVerifiedStudentId(initialSelectedCredential.studentUserId);
      setSelectedCred(initialSelectedCredential);
      setActiveTab('verify');
    }
  }, [initialSelectedCredential]);

  // Support opening a direct portfolio share link (?student=...)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const stuParam = params.get('student') || params.get('did');
    if (stuParam && students.length > 0 && !verifiedStudentId) {
      const q = stuParam.trim().toLowerCase();
      const matched = students.find(
        (s) =>
          s.id.toLowerCase() === q ||
          (s.did && s.did.toLowerCase() === q) ||
          (s.studentId && s.studentId.toLowerCase() === q)
      );
      if (matched) {
        setVerifiedStudentId(matched.id);
      }
    }
  }, [students, verifiedStudentId]);

  const activeStudent = students.find((s) => s.id === verifiedStudentId) || null;
  const activeField = resolveField(activeStudent?.fieldOfStudy || activeStudent?.program);

  const studentPublicCreds = activeStudent
    ? credentials.filter(
        (c) => c.studentUserId === activeStudent.id && c.isPublic && c.state !== 'Draft'
      )
    : [];

  const isShortlisted = Boolean(
    activeStudent && myShortlist.some((item) => item.studentUserId === activeStudent.id)
  );
  const currentShortlistEntry = activeStudent
    ? myShortlist.find((item) => item.studentUserId === activeStudent.id)
    : null;

  // Save or update candidate in Recruiter's private shortlist
  const handleSaveToShortlist = useCallback(
    async (studentUserId, status = 'Shortlisted') => {
      if (!recruiter?.id || !studentUserId) return;
      try {
        const res = await apiFetch(`/api/recruiter/${recruiter.id}/shortlist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentUserId, status })
        });
        const data = await res.json();
        if (res.ok && data.shortlist) {
          setMyShortlist(data.shortlist);
          if (onRefreshData) onRefreshData();
          if (onNotify) onNotify(data.message);
        }
      } catch (err) {
        if (onNotify) onNotify('Failed to update shortlist: ' + err.message);
      }
    },
    [recruiter?.id, onRefreshData, onNotify]
  );

  const handleRemoveFromShortlist = async (studentUserId) => {
    if (!recruiter?.id || !studentUserId) return;
    try {
      const res = await apiFetch(`/api/recruiter/${recruiter.id}/shortlist/${studentUserId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok && data.shortlist) {
        setMyShortlist(data.shortlist);
        if (onRefreshData) onRefreshData();
        if (onNotify) onNotify(data.message);
      }
    } catch (err) {
      if (onNotify) onNotify('Failed to remove candidate: ' + err.message);
    }
  };

  // Run < 1.5s Cryptographic Verification Handshake via /api/verify
  const runCandidateVerification = async (lookupOrPayload) => {
    try {
      const res = await apiFetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          typeof lookupOrPayload === 'string'
            ? { candidateLookup: lookupOrPayload }
            : lookupOrPayload
        )
      });
      const data = await res.json();
      if (!res.ok) {
        if (onNotify) onNotify(data.error || 'Candidate or credential not found on ledger.');
        return;
      }

      if (data.candidate) {
        setVerifiedStudentId(data.candidate.id);
      } else if (data.credential?.studentUserId) {
        setVerifiedStudentId(data.credential.studentUserId);
      }

      if (data.credential) {
        setSelectedCred(data.credential);
      }
      setHandshakeInfo(data.verification || null);
      setScanResult(null);
      setActiveTab('verify');

      if (onNotify) {
        const name = data.candidate?.name || data.credential?.studentName || 'Candidate';
        onNotify(`Verified ${name} (${data.verification?.latencyMs ?? 0.48} ms handshake)`);
      }
    } catch (err) {
      if (onNotify) onNotify(navigator.onLine ? 'Verification failed: ' + err.message : "You're offline. Scan the candidate's TrustTrace QR to verify it on this device.");
    }
  };

  const handleDecodedQrString = async (rawText) => {
    if (!rawText) return;
    // Portfolio QRs carry signed claims: verify locally, then upgrade to live status if online.
    if (decodePortfolioText(rawText)) {
      const result = await verifyScannedText(rawText);
      if (result.error) {
        onNotify?.(result.error);
        return;
      }
      setActiveTab('verify');
      if (result.mode === 'online' && result.holder?.id) {
        setVerifiedStudentId(result.holder.id);
        setSelectedCred(null);
        setScanResult(null);
        setHandshakeInfo({ latencyMs: result.latencyMs });
        onNotify?.(`Verified ${result.holder.name}.`);
      } else {
        setVerifiedStudentId('');
        setScanResult(result);
        onNotify?.(`Verified ${result.holder?.name} offline.`);
      }
      return;
    }
    try {
      const parsed = JSON.parse(rawText);
      if (parsed.credentialId || parsed.tokenId) {
        runCandidateVerification({
          credentialId: parsed.credentialId,
          tokenId: parsed.tokenId
        });
        return;
      }
      if (parsed.studentDid || parsed.studentUserId) {
        runCandidateVerification(parsed.studentDid || parsed.studentUserId);
        return;
      }
    } catch {
      // Plain URL, DID, Student ID, or Credential ID string
      runCandidateVerification(rawText);
    }
  };

  const handleFileVerifyUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith('.json') || file.type === 'application/json') {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const json = JSON.parse(reader.result);
          runCandidateVerification({ rawVcJson: json });
        } catch {
          if (onNotify) onNotify('Invalid JSON credential file.');
        }
      };
      reader.readAsText(file);
    } else if ((file.type || '').startsWith('image/')) {
      const decoded = await decodeQrFromImageFile(file);
      if (decoded) {
        handleDecodedQrString(decoded);
      } else if (onNotify) {
        onNotify('No QR code detected in uploaded image.');
      }
    }
    if (e.target) e.target.value = '';
  };

  // Compute Opt-In Talent Discovery Search Results (ONLY when hasSearched is true)
  const optInStudents = students.filter((s) => s.visibleInTalentSearch !== false);
  const searchResults = hasSearched
    ? optInStudents.filter((stu) => {
        const stuCreds = credentials.filter(
          (c) => c.studentUserId === stu.id && c.isPublic && c.state === 'Locked'
        );
        const avgScore =
          stuCreds.length > 0
            ? Math.round(
                stuCreds.reduce((sum, c) => sum + (Number(c.masteryScore) || 88), 0) /
                  stuCreds.length
              )
            : 0;

        // 1. Check search query (Student Name, University, Program, Student ID, or DID)
        if (searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase();
          const matchText = `${stu.name} ${stu.university} ${fieldLabelOf(stu)} ${stu.headline || ''} ${stu.studentId} ${stu.did}`.toLowerCase();
          if (!matchText.includes(q)) return false;
        }

        // 2. Field of study filter
        if (domainFilter !== 'ALL') {
          if (resolveField(stu.fieldOfStudy || stu.program).familyId !== domainFilter) return false;
        }

        // 3. Check Minimum Score filter (if student has credentials, or if minScore > 0)
        if (stuCreds.length > 0 && avgScore < minScore) {
          return false;
        }

        return true;
      })
    : [];

  return (
    <div className="space-y-5 pb-20 md:pb-10">
      {/* RECRUITER PROFILE HEADER + 3-TAB NAVIGATION BAR */}
      <section className="linkedin-card p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar user={recruiter} size="md" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-bold text-base sm:text-lg text-[#191919] dark:text-white">
                  {recruiter?.name}
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Verified recruiter
                </span>
              </div>
              <div className="text-xs text-[#666666] dark:text-[#8B949E] flex flex-wrap items-center gap-2 mt-0.5">
                <span className="font-semibold text-[#191919] dark:text-[#C9D1D9]">
                  {[recruiter?.jobTitle, recruiter?.companyName].filter(Boolean).join(' · ')}
                </span>
                {recruiter?.companyRegId && (
                  <span className="font-mono text-[11px]">({recruiter.companyRegId})</span>
                )}
                {recruiter?.companyWebsite && (
                  <span className="inline-flex items-center gap-1 text-[#0A66C2] dark:text-[#58A6FF]">
                    <Globe className="w-3 h-3" />
                    {recruiter.companyWebsite.replace(/^https?:\/\//, '')}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 3-Tab Switcher */}
          <div className="flex items-center gap-1 bg-[#F4F2EE] dark:bg-[#0D1117] p-1 rounded-xl border border-[#E0DFDC] dark:border-[#30363D] overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setActiveTab('verify')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'verify'
                  ? 'bg-white dark:bg-[#1B1F23] text-[#0A66C2] dark:text-[#58A6FF] shadow-xs'
                  : 'text-[#666666] dark:text-[#8B949E]'
              }`}
            >
              <ScanLine className="w-3.5 h-3.5" />
              <span>Verify</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('shortlist')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'shortlist'
                  ? 'bg-white dark:bg-[#1B1F23] text-[#0A66C2] dark:text-[#58A6FF] shadow-xs'
                  : 'text-[#666666] dark:text-[#8B949E]'
              }`}
            >
              <BookmarkCheck className="w-3.5 h-3.5" />
              <span>Shortlist</span>
              {myShortlist.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-[#0A66C2] text-white text-[10px] font-bold">
                  {myShortlist.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('search')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'search'
                  ? 'bg-white dark:bg-[#1B1F23] text-[#0A66C2] dark:text-[#58A6FF] shadow-xs'
                  : 'text-[#666666] dark:text-[#8B949E]'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search</span>
            </button>
          </div>
        </div>
      </section>

      {/* ===================================================================
          TAB 1: SCAN & VERIFY CANDIDATE (Default Tab)
      =================================================================== */}
      {activeTab === 'verify' && (
        <div className="space-y-5">
          <LiveQRScanner
            onQrDecoded={handleDecodedQrString}
            onUploadFile={handleFileVerifyUpload}
            onLookupCandidate={(query) => runCandidateVerification(query)}
          />

          {scanResult ? (
            <VerificationResultView
              result={scanResult}
              isDark={isDark}
              actions={
                <button type="button" onClick={() => setScanResult(null)} className="linkedin-btn-neutral text-xs py-1.5 px-3">
                  <XCircle className="w-3.5 h-3.5" /> Clear
                </button>
              }
            />
          ) : !activeStudent ? (
            <div className="linkedin-card p-8 text-center space-y-2.5">
              <div className="w-12 h-12 rounded-full bg-[#EBF3FB] dark:bg-[#0A66C2]/20 text-[#0A66C2] flex items-center justify-center mx-auto">
                <ScanLine className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-sm text-[#191919] dark:text-white">
                Ready for Candidate Verification
              </h3>
              <p className="text-xs text-[#666666] dark:text-[#8B949E] max-w-md mx-auto">
                Scan a candidate&apos;s QR code, paste their Portfolio Link or DID above, or use the{' '}
                <button
                  type="button"
                  onClick={() => setActiveTab('search')}
                  className="text-[#0A66C2] dark:text-[#58A6FF] font-semibold underline"
                >
                  Talent Discovery Search
                </button>{' '}
                tab to filter opt-in candidates.
              </p>
            </div>
          ) : (
            <>
              {/* Verified Candidate Header + Save to Shortlist Controls */}
              <section className="linkedin-card p-4 sm:p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E0DFDC] dark:border-[#30363D]">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-bold text-base sm:text-lg text-[#191919] dark:text-white">
                        {activeStudent.name}
                      </h2>
                      <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-[#EBF3FB] text-[#0A66C2] dark:bg-[#0A66C2]/20 dark:text-[#58A6FF]">
                        {activeStudent.studentId}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        DID Verified ({handshakeInfo?.latencyMs ?? 0.42} ms)
                      </span>
                    </div>
                    <div className="text-xs text-[#666666] dark:text-[#8B949E] flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 font-medium text-[#191919] dark:text-[#C9D1D9]">
                        <GraduationCap className="w-3.5 h-3.5 text-[#0A66C2]" />
                        {activeField.label}
                        {activeStudent.university ? ` · ${activeStudent.university}` : ''}
                      </span>
                      <span className="font-mono text-[11px] truncate max-w-xs">
                        {activeStudent.did}
                      </span>
                    </div>
                  </div>

                  {/* Save Candidate to My Shortlist Button & Status Tag */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {isShortlisted ? (
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                          <BookmarkCheck className="w-3.5 h-3.5" />
                          Saved ({currentShortlistEntry?.status || 'Shortlisted'})
                        </span>
                        <select
                          value={currentShortlistEntry?.status || 'Shortlisted'}
                          onChange={(e) => handleSaveToShortlist(activeStudent.id, e.target.value)}
                          className="linkedin-input w-auto text-xs py-1 px-2 font-semibold"
                        >
                          <option value="Shortlisted">Shortlisted</option>
                          <option value="Reviewed">Reviewed</option>
                          <option value="Archived">Archived</option>
                        </select>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSaveToShortlist(activeStudent.id, 'Shortlisted')}
                        className="linkedin-btn-primary text-xs py-2 px-4"
                      >
                        <BookmarkPlus className="w-4 h-4" />
                        <span>Save Candidate to My Shortlist</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setVerifiedStudentId('');
                        setSelectedCred(null);
                        setHandshakeInfo(null);
                      }}
                      className="linkedin-btn-neutral text-xs py-1.5 px-3"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Clear</span>
                    </button>
                  </div>
                </div>

                {/* Public Soulbound Badges */}
                <div>
                  <h3 className="font-bold text-sm text-[#191919] dark:text-white mb-2">
                    Public Soulbound Credentials ({studentPublicCreds.length})
                  </h3>

                  {studentPublicCreds.length === 0 ? (
                    <div className="py-6 text-center text-xs text-[#666666] dark:text-[#8B949E]">
                      No public credentials shared by this candidate yet.
                    </div>
                  ) : (
                    <div className="divide-y divide-[#E0DFDC] dark:divide-[#30363D]">
                      {studentPublicCreds.map((cred) => {
                        const credAxis = axisForCredential(cred, activeField.id);
                        const domainColor = axisColor(activeField.id, credAxis);
                        const isRevoked = cred.state === 'Revoked';

                        return (
                          <div
                            key={cred.id}
                            className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              <div
                                className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 mt-0.5"
                                style={{ backgroundColor: isRevoked ? '#DC2626' : domainColor }}
                              >
                                <Award className="w-5 h-5" />
                              </div>

                              <div className="min-w-0 flex-1 space-y-1">
                                <h4
                                  className={`font-bold text-sm truncate ${
                                    isRevoked
                                      ? 'line-through text-red-600 dark:text-red-400'
                                      : 'text-[#191919] dark:text-white'
                                  }`}
                                >
                                  {cred.achievementTitle}
                                </h4>

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
                                    {credAxis}
                                  </span>

                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                      isRevoked
                                        ? 'bg-red-500/15 text-red-700 dark:text-red-300'
                                        : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                    }`}
                                  >
                                    {isRevoked ? 'Revoked' : 'Verified'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => onOpenQrModal(cred)}
                                className="linkedin-btn-neutral text-xs py-1 px-2.5"
                              >
                                <QrCode className="w-3.5 h-3.5 text-[#0A66C2]" />
                                <span>Share QR</span>
                              </button>

                              <button
                                onClick={() => onOpenProofModal(cred)}
                                className="linkedin-btn-outline text-xs py-1 px-3"
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                                <span>View Cryptographic Proof</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>

              {/* D3 FORCE-DIRECTED GRAPH & RADAR CHART */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className="lg:col-span-8 linkedin-card p-4 sm:p-5">
                  <h2 className="font-bold text-base text-[#191919] dark:text-white mb-2">
                    Competency Graph
                  </h2>
                  <D3CompetencyGraph
                    student={activeStudent}
                    field={activeField.id}
                    isDark={isDark}
                    credentials={credentials.filter((c) => c.studentUserId === activeStudent.id)}
                    selectedCredId={selectedCred?.id}
                    onSelectCredential={(cred) => {
                      setSelectedCred(cred);
                      onOpenProofModal(cred);
                    }}
                    respectPrivacy={true}
                    height={400}
                  />
                </div>

                <div className="lg:col-span-4 linkedin-card p-4 sm:p-5">
                  <h2 className="font-bold text-base text-[#191919] dark:text-white mb-2">
                    Skill Radar
                  </h2>
                  <CompetencyRadarChart
                    field={activeField.id}
                    credentials={credentials.filter((c) => c.studentUserId === activeStudent.id)}
                    respectPrivacy={true}
                    isDark={isDark}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ===================================================================
          TAB 2: MY SHORTLISTED & SCANNED CANDIDATES (Private Per-Recruiter List)
      =================================================================== */}
      {activeTab === 'shortlist' && (
        <section className="linkedin-card p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#E0DFDC] dark:border-[#30363D]">
            <div>
              <h2 className="font-bold text-base text-[#191919] dark:text-white flex items-center gap-2">
                <BookmarkCheck className="w-4 h-4 text-[#0A66C2]" />
                <span>My Shortlisted &amp; Scanned Candidates ({myShortlist.length})</span>
              </h2>
              <p className="text-xs text-[#666666] dark:text-[#8B949E] mt-0.5">
                Private to {recruiter?.name} ({recruiter?.companyName || 'Corporate Recruiter'})
              </p>
            </div>
          </div>

          {myShortlist.length === 0 ? (
            <div className="py-10 text-center space-y-2.5">
              <div className="w-10 h-10 rounded-full bg-[#EBF3FB] dark:bg-[#0A66C2]/20 text-[#0A66C2] flex items-center justify-center mx-auto">
                <BookmarkCheck className="w-5 h-5" />
              </div>
              <div className="font-semibold text-sm text-[#191919] dark:text-white">
                Your shortlist is currently empty.
              </div>
              <p className="text-xs text-[#666666] dark:text-[#8B949E]">
                Scan a candidate QR code or search opt-in candidates to save them to your private list.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#E0DFDC] dark:divide-[#30363D]">
              {myShortlist.map((entry) => {
                const stu = students.find((s) => s.id === entry.studentUserId);
                if (!stu) return null;
                const stuCreds = credentials.filter(
                  (c) => c.studentUserId === stu.id && c.isPublic && c.state === 'Locked'
                );
                const avgScore =
                  stuCreds.length > 0
                    ? Math.round(
                        stuCreds.reduce((sum, c) => sum + (Number(c.masteryScore) || 88), 0) /
                          stuCreds.length
                      )
                    : 0;

                return (
                  <div
                    key={entry.studentUserId}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-[#191919] dark:text-white">
                          {stu.name}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-[#EBF3FB] text-[#0A66C2] dark:bg-[#0A66C2]/20 dark:text-[#58A6FF]">
                          {stu.studentId}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            entry.status === 'Shortlisted'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : entry.status === 'Reviewed'
                              ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
                              : 'bg-gray-500/15 text-gray-600 dark:text-gray-400'
                          }`}
                        >
                          {entry.status || 'Shortlisted'}
                        </span>
                      </div>

                      <div className="text-xs text-[#666666] dark:text-[#8B949E]">
                        {fieldLabelOf(stu)} · {stu.university || '—'} ·{' '}
                        <strong className="text-[#191919] dark:text-white">
                          {stuCreds.length} Verified SBTs
                        </strong>{' '}
                        ({avgScore}% Avg Score)
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <select
                        value={entry.status || 'Shortlisted'}
                        onChange={(e) => handleSaveToShortlist(stu.id, e.target.value)}
                        className="linkedin-input w-auto text-xs py-1 px-2.5 font-semibold"
                      >
                        <option value="Shortlisted">Shortlisted</option>
                        <option value="Reviewed">Reviewed</option>
                        <option value="Archived">Archived</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => {
                          setVerifiedStudentId(stu.id);
                          setActiveTab('verify');
                        }}
                        className="linkedin-btn-primary text-xs py-1.5 px-3"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        <span>Inspect Portfolio &amp; Graph</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemoveFromShortlist(stu.id)}
                        className="p-1.5 rounded-full text-[#666666] hover:text-red-600 hover:bg-red-500/10"
                        title="Remove from Shortlist"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ===================================================================
          TAB 3: TALENT DISCOVERY SEARCH (Opt-In Filter & Search Only)
      =================================================================== */}
      {activeTab === 'search' && (
        <section className="linkedin-card p-4 sm:p-5 space-y-4">
          <div className="pb-3 border-b border-[#E0DFDC] dark:border-[#30363D]">
            <h2 className="font-bold text-base text-[#191919] dark:text-white flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-[#0A66C2]" />
              <span>Talent Discovery Search (Opt-In Candidates Only)</span>
            </h2>
            <p className="text-xs text-[#666666] dark:text-[#8B949E] mt-0.5">
              Filter candidates who have enabled &ldquo;Visible in Recruiter Talent Search&rdquo; by field of study, minimum score, or university
            </p>
          </div>

          {/* Search & Filter Controls */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setHasSearched(true);
            }}
            className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end bg-[#F4F2EE]/70 dark:bg-[#0D1117] p-3.5 rounded-xl border border-[#E0DFDC] dark:border-[#30363D]"
          >
            <div className="md:col-span-4">
              <label className="block text-xs font-semibold mb-1">
                University or Student Name
              </label>
              <input
                type="text"
                placeholder="e.g., University, Jordan, STU-2026..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setHasSearched(true);
                }}
                className="linkedin-input text-xs py-2"
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-semibold mb-1">Field of study</label>
              <select
                value={domainFilter}
                onChange={(e) => {
                  setDomainFilter(e.target.value);
                  setHasSearched(true);
                }}
                className="linkedin-input text-xs py-2"
              >
                <option value="ALL">All fields</option>
                {FIELDS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-semibold mb-1 flex items-center justify-between">
                <span>Min Competency Score</span>
                <span className="font-mono text-[#0A66C2] dark:text-[#58A6FF] font-bold">
                  &gt;= {minScore}%
                </span>
              </label>
              <input
                type="range"
                min="50"
                max="95"
                step="5"
                value={minScore}
                onChange={(e) => {
                  setMinScore(Number(e.target.value));
                  setHasSearched(true);
                }}
                className="w-full accent-[#0A66C2]"
              />
            </div>

            <div className="md:col-span-2 flex items-center gap-1.5">
              <button
                type="submit"
                className="linkedin-btn-primary w-full text-xs py-2"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Search</span>
              </button>
            </div>
          </form>

          {/* Search Results */}
          {!hasSearched ? (
            <div className="py-10 text-center space-y-2">
              <Search className="w-8 h-8 text-[#0A66C2] mx-auto opacity-80" />
              <div className="font-semibold text-sm text-[#191919] dark:text-white">
                Enter a search query or select a competency filter above to discover candidates
              </div>
              <p className="text-xs text-[#666666] dark:text-[#8B949E]">
                Candidates are never dumped automatically — search by skill domain, university, or minimum mastery score.
              </p>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#666666] dark:text-[#8B949E]">
              No opt-in candidates matched your current filters. Try lowering the minimum score or broadening the domain filter.
            </div>
          ) : (
            <div className="divide-y divide-[#E0DFDC] dark:divide-[#30363D]">
              {searchResults.map((stu) => {
                const stuCreds = credentials.filter(
                  (c) => c.studentUserId === stu.id && c.isPublic && c.state === 'Locked'
                );
                const avgScore =
                  stuCreds.length > 0
                    ? Math.round(
                        stuCreds.reduce((sum, c) => sum + (Number(c.masteryScore) || 88), 0) /
                          stuCreds.length
                      )
                    : 0;
                const alreadySaved = myShortlist.some((i) => i.studentUserId === stu.id);

                return (
                  <div
                    key={stu.id}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-[#191919] dark:text-white">
                          {stu.name}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-[#EBF3FB] text-[#0A66C2] dark:bg-[#0A66C2]/20 dark:text-[#58A6FF]">
                          {stu.studentId}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                          {avgScore}% Mastery ({stuCreds.length} SBTs)
                        </span>
                      </div>
                      <div className="text-xs text-[#666666] dark:text-[#8B949E]">
                        {fieldLabelOf(stu)}
                        {stu.university ? ` · ${stu.university}` : ''}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleSaveToShortlist(stu.id, 'Shortlisted')}
                        className="linkedin-btn-outline text-xs py-1.5 px-3"
                      >
                        {alreadySaved ? (
                          <>
                            <BookmarkCheck className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Shortlisted</span>
                          </>
                        ) : (
                          <>
                            <BookmarkPlus className="w-3.5 h-3.5" />
                            <span>Save to Shortlist</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setVerifiedStudentId(stu.id);
                          setActiveTab('verify');
                        }}
                        className="linkedin-btn-primary text-xs py-1.5 px-3"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Verify &amp; View Graph</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
