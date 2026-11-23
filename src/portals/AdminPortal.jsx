import { apiFetch } from '../lib/api.js';
import React, { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import {
  Building2,
  CheckCircle2,
  XCircle,
  Clock,
  FilePlus2,
  Terminal,
  Cpu,
  BarChart3,
  Trash2,
  Code2,
  Play,
  Loader2,
  ShieldCheck,
  Stamp,
  Layers
} from 'lucide-react';
import { axisNames } from '../../shared/skillTaxonomy.js';
import AccessRequestsPanel from '../components/AccessRequestsPanel.jsx';
import { CredentialTags } from '../components/CredentialTags.jsx';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const LIFECYCLE_STATES = ['Draft', 'Signed', 'Anchored', 'Locked', 'Revoked'];

export default function AdminPortal({
  adminUser,
  students = [],
  credentials = [],
  logoRegistry = [],
  txLogs = [],
  issuerDidDocument,
  soliditySource,
  isDark,
  onApproveMint,
  onChangeState,
  onRevokeCredential,
  onDeleteCredential,
  onManualIssued,
  onOpenProofModal,
  onRefreshData,
  onNotify,
  accessRequests = [],
  onReviewAccess
}) {
  const [activeSubTab, setActiveSubTab] = useState('issuance'); // 'issuance' | 'registry' | 'benchmark' | 'ledger'
  const [issuing, setIssuing] = useState(false);
  const [scopeToMyInstitution, setScopeToMyInstitution] = useState(true);

  const adminInstitution = (adminUser?.university || 'University Registrar Office').trim();

  // Scope students and credentials to this University Admin's Institution
  const matchesAdminInstitution = (uniStr) => {
    if (!scopeToMyInstitution) return true;
    const target = adminInstitution.toLowerCase();
    const candidate = (uniStr || '').trim().toLowerCase();
    if (!candidate) return true;
    // Demo registrar office matches default university / registrar items or exact match
    if (
      target.includes('registrar') &&
      (candidate.includes('registrar') || candidate.includes('university'))
    ) {
      return true;
    }
    return candidate.includes(target) || target.includes(candidate);
  };

  const scopedStudents = students.filter((s) => matchesAdminInstitution(s.university));
  const scopedCredentials = credentials.filter((c) => {
    const stu = students.find((s) => s.id === c.studentUserId);
    return (
      matchesAdminInstitution(c.studentUniversity) ||
      matchesAdminInstitution(c.issuingOrganization) ||
      matchesAdminInstitution(stu?.university)
    );
  });

  // Direct Admin Issuance Form (Select Student OR enter email/DID)
  const [manualForm, setManualForm] = useState({
    studentUserId: scopedStudents[0]?.id || '',
    studentLookup: '',
    studentNameOverride: '',
    achievementTitle: '',
    issuingOrganization: adminInstitution,
    issuanceDate: new Date().toISOString().slice(0, 10),
    competencyDomain: 'Leadership',
    attainedLevel: 'Expert / Mastery',
    masteryScore: 95
  });

  // New Logo Registry Rule Form
  const [newRuleForm, setNewRuleForm] = useState({
    name: '',
    issuerEntity: adminInstitution,
    ruleType: 'Authorized Club Rubber Stamp & Signature',
    minConfidenceThreshold: 80
  });

  // Benchmark state
  const [maxBenchmarkScale, setMaxBenchmarkScale] = useState(50000);
  const [benchmarkData, setBenchmarkData] = useState(null);
  const [runningBenchmark, setRunningBenchmark] = useState(false);

  useEffect(() => {
    if (scopedStudents.length > 0 && !manualForm.studentUserId) {
      setManualForm((prev) => ({
        ...prev,
        studentUserId: scopedStudents[0].id,
        issuingOrganization: prev.issuingOrganization || adminInstitution
      }));
    }
  }, [scopedStudents, adminInstitution]);

  useEffect(() => {
    if (activeSubTab === 'benchmark' && !benchmarkData) {
      handleRunBenchmark(50000);
    }
  }, [activeSubTab]);

  const issueTarget = students.find((s) => s.id === manualForm.studentUserId);
  const issueAxes = axisNames(issueTarget?.fieldOfStudy || issueTarget?.program);

  useEffect(() => {
    if (!issueAxes.includes(manualForm.competencyDomain)) {
      setManualForm((prev) => ({ ...prev, competencyDomain: issueAxes[0] }));
    }
  }, [issueAxes.join('|')]);

  const handleManualIssueSubmit = async (e) => {
    e.preventDefault();
    setIssuing(true);
    try {
      const res = await apiFetch('/api/credentials/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...manualForm,
          validationMode: 'auto'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Issuance failed');
      if (onManualIssued) await onManualIssued(data.credential, data.message);
    } catch (err) {
      if (onNotify) onNotify(err.message);
    } finally {
      setIssuing(false);
    }
  };

  const handleToggleRule = async (ruleId, active) => {
    try {
      await apiFetch(`/api/admin/logo-registry/${ruleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active })
      });
      if (onRefreshData) await onRefreshData();
    } catch {
      // ignore
    }
  };

  const handleAddRule = async (e) => {
    e.preventDefault();
    if (!newRuleForm.name.trim()) return;
    try {
      const res = await apiFetch('/api/admin/logo-registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRuleForm)
      });
      if (res.ok) {
        setNewRuleForm({ ...newRuleForm, name: '' });
        if (onRefreshData) await onRefreshData();
        if (onNotify) onNotify('Registry rule added.');
      }
    } catch {
      // ignore
    }
  };

  const handleRunBenchmark = async (scaleOverride) => {
    const targetScale = scaleOverride || maxBenchmarkScale;
    setRunningBenchmark(true);
    try {
      const res = await apiFetch('/api/benchmark/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxCredentials: targetScale })
      });
      const data = await res.json();
      if (res.ok && data.benchmark) {
        setBenchmarkData(data.benchmark);
      }
    } catch {
      // ignore
    } finally {
      setRunningBenchmark(false);
    }
  };

  const draftQueue = scopedCredentials.filter((c) => c.state === 'Draft');
  const chartTextColor = isDark ? '#C9D1D9' : '#404040';
  const chartGridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';

  return (
    <div className="space-y-5 pb-20 md:pb-10">
      {/* TOP UNIVERSITY ADMIN HEADER & SUB-TABS */}
      <section className="linkedin-card p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#0A66C2] text-white flex items-center justify-center shrink-0">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-[#191919] dark:text-white">
                  {adminUser?.name || 'Dr. Sam Rivera'}
                </h1>
                <button
                  type="button"
                  onClick={() => setScopeToMyInstitution((prev) => !prev)}
                  className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#EBF3FB] text-[#0A66C2] dark:bg-[#0A66C2]/20 dark:text-[#58A6FF] border border-[#0A66C2]/30"
                  title="Toggle Institution Scope vs. Consortium View"
                >
                  {scopeToMyInstitution
                    ? `Institution Scope: ${adminInstitution}`
                    : 'Scope: All Consortium Institutions'}
                </button>
              </div>
              <p className="text-xs text-[#666666] dark:text-[#8B949E]">
                {adminUser?.departmentRole || 'Office of the Registrar'} • {adminInstitution}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 bg-[#F4F2EE] dark:bg-[#0D1117] p-1 rounded-xl border border-[#E0DFDC] dark:border-[#30363D]">
            <button
              onClick={() => setActiveSubTab('issuance')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeSubTab === 'issuance'
                  ? 'bg-white dark:bg-[#1B1F23] text-[#0A66C2] dark:text-[#58A6FF] shadow-xs'
                  : 'text-[#666666] dark:text-[#8B949E]'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Queue &amp; Issuance</span>
              {draftQueue.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                  {draftQueue.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveSubTab('registry')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeSubTab === 'registry'
                  ? 'bg-white dark:bg-[#1B1F23] text-[#0A66C2] dark:text-[#58A6FF] shadow-xs'
                  : 'text-[#666666] dark:text-[#8B949E]'
              }`}
            >
              <Stamp className="w-3.5 h-3.5" />
              <span>Logo &amp; Stamp Registry</span>
            </button>

            <button
              onClick={() => setActiveSubTab('benchmark')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeSubTab === 'benchmark'
                  ? 'bg-white dark:bg-[#1B1F23] text-[#0A66C2] dark:text-[#58A6FF] shadow-xs'
                  : 'text-[#666666] dark:text-[#8B949E]'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Benchmark</span>
            </button>

            <button
              onClick={() => setActiveSubTab('ledger')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeSubTab === 'ledger'
                  ? 'bg-white dark:bg-[#1B1F23] text-[#0A66C2] dark:text-[#58A6FF] shadow-xs'
                  : 'text-[#666666] dark:text-[#8B949E]'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Ledger &amp; Solidity</span>
            </button>
          </div>
        </div>
      </section>

      {/* TAB 1: PENDING APPROVAL QUEUE, DIRECT ADMIN ISSUANCE & LIFECYCLE */}
      {activeSubTab === 'issuance' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left 7 Columns: Pending Approval Queue + Credential Lifecycle List */}
          <div className="lg:col-span-7 space-y-5">
            <AccessRequestsPanel requests={accessRequests} onReview={onReviewAccess} />
            {/* Pending Approval Queue */}
            <div className="linkedin-card p-4 sm:p-5">
              <div className="flex items-center justify-between pb-3 border-b border-[#E0DFDC] dark:border-[#30363D]">
                <h2 className="font-bold text-base text-[#191919] dark:text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600" />
                  <span>Pending Approval Queue ({draftQueue.length})</span>
                </h2>
              </div>

              {draftQueue.length === 0 ? (
                <div className="py-6 text-center text-xs text-[#666666] dark:text-[#8B949E]">
                  No certificates waiting in queue.
                </div>
              ) : (
                <div className="space-y-2.5 mt-3">
                  {draftQueue.map((draft) => (
                    <div
                      key={draft.id}
                      className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="font-bold text-sm text-[#191919] dark:text-white">
                          {draft.achievementTitle}
                        </div>
                        <div className="text-xs text-[#666666] dark:text-[#8B949E]">
                          {draft.studentName} ({draft.studentId}) • {draft.competencyDomain}
                        </div>
                        <CredentialTags credential={draft} />
                        {draft.aiForensics?.outcome === 'review' ? (
                          <ul className="text-[11px] text-amber-800 dark:text-amber-300 space-y-0.5">
                            {(draft.aiForensics.reviewReasons || []).map((reason) => (
                              <li key={reason}>• {reason.replace(/^Gate \d: /, '')}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[11px] text-[#666666] dark:text-[#8B949E]">
                            {draft.aiForensics?.overallConfidence != null ? `Scanner: ${draft.aiForensics.verdict || `${draft.aiForensics.overallConfidence}%`}` : 'Submitted for review by the student'}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => onApproveMint(draft.id)}
                          className="linkedin-btn-primary text-xs py-1.5 px-3.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Approve, Sign &amp; Mint</span>
                        </button>
                        <button
                          onClick={() => onDeleteCredential(draft.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold text-red-600 bg-red-500/10 hover:bg-red-500/20"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Issued Credentials & State Machine Lifecycle */}
            <div className="linkedin-card p-4 sm:p-5">
              <div className="pb-3 border-b border-[#E0DFDC] dark:border-[#30363D] flex items-center justify-between">
                <h2 className="font-bold text-base text-[#191919] dark:text-white">
                  Issued Credentials ({scopedCredentials.length})
                </h2>
                <span className="text-[11px] font-semibold text-[#666666] dark:text-[#8B949E]">
                  {scopeToMyInstitution ? adminInstitution : 'All Institutions'}
                </span>
              </div>

              {scopedCredentials.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#666666] dark:text-[#8B949E]">
                  No credentials issued for {adminInstitution} yet. Use Direct Admin Issuance on the right.
                </div>
              ) : (
                <div className="divide-y divide-[#E0DFDC] dark:divide-[#30363D] mt-1">
                  {scopedCredentials.map((cred) => (
                    <div
                      key={cred.id}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-sm text-[#191919] dark:text-white truncate">
                          {cred.achievementTitle}
                        </div>
                        <div className="text-xs text-[#666666] dark:text-[#8B949E]">
                          {cred.studentName} • {cred.competencyDomain}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <select
                          value={cred.state}
                          onChange={(e) => onChangeState(cred.id, e.target.value)}
                          className="linkedin-input w-auto text-xs py-1 px-2 font-semibold"
                        >
                          {LIFECYCLE_STATES.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>

                        { onOpenProofModal && (
                          <button
                            onClick={() => onOpenProofModal(cred)}
                            className="linkedin-btn-neutral text-xs py-1 px-2.5"
                          >
                            Proof
                          </button>
                        )}

                        {cred.state !== 'Revoked' && cred.state !== 'Draft' && (
                          <button
                            onClick={() => onRevokeCredential(cred.id)}
                            className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300"
                          >
                            Revoke
                          </button>
                        )}

                        <button
                          onClick={() => onDeleteCredential(cred.id)}
                          className="p-1.5 rounded-full text-[#666666] hover:text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right 5 Columns: Workflow 1 — Direct Admin Issuance (No PDF Upload Required) */}
          <div className="lg:col-span-5">
            <div className="linkedin-card p-4 sm:p-5">
              <div className="flex items-center gap-2 pb-3 border-b border-[#E0DFDC] dark:border-[#30363D]">
                <FilePlus2 className="w-5 h-5 text-[#0A66C2]" />
                <h2 className="font-bold text-base text-[#191919] dark:text-white">
                  Direct Admin Issuance
                </h2>
              </div>

              <form onSubmit={handleManualIssueSubmit} className="space-y-3 pt-3">
                {scopedStudents.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Registered Student ({adminInstitution})
                    </label>
                    <select
                      value={manualForm.studentUserId}
                      onChange={(e) => setManualForm({ ...manualForm, studentUserId: e.target.value })}
                      className="linkedin-input text-xs font-semibold"
                    >
                      <option value="">-- Or Enter Email / DID Below --</option>
                      {scopedStudents.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.studentId})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {(!manualForm.studentUserId || scopedStudents.length === 0) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-semibold mb-1">Student Email / DID</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g., student@university.edu"
                        value={manualForm.studentLookup}
                        onChange={(e) => setManualForm({ ...manualForm, studentLookup: e.target.value })}
                        className="linkedin-input text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Student Name</label>
                      <input
                        type="text"
                        placeholder="e.g., Jordan Taylor"
                        value={manualForm.studentNameOverride}
                        onChange={(e) => setManualForm({ ...manualForm, studentNameOverride: e.target.value })}
                        className="linkedin-input text-xs"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold mb-1">Certificate Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Robotics & IoT Society President"
                    value={manualForm.achievementTitle}
                    onChange={(e) => setManualForm({ ...manualForm, achievementTitle: e.target.value })}
                    className="linkedin-input text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Issuing Department / Club</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Office of the Registrar"
                    value={manualForm.issuingOrganization}
                    onChange={(e) => setManualForm({ ...manualForm, issuingOrganization: e.target.value })}
                    className="linkedin-input text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Skill area</label>
                    <select
                      value={manualForm.competencyDomain}
                      onChange={(e) => setManualForm({ ...manualForm, competencyDomain: e.target.value })}
                      className="linkedin-input text-xs"
                    >
                      {issueAxes.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">Score (1-100)</label>
                    <input
                      type="number"
                      min="50"
                      max="100"
                      value={manualForm.masteryScore}
                      onChange={(e) => setManualForm({ ...manualForm, masteryScore: e.target.value })}
                      className="linkedin-input text-xs font-mono"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={issuing}
                  className="linkedin-btn-primary w-full py-2.5 text-xs"
                >
                  {issuing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Issue &amp; Mint Soulbound Badge</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: OFFICIAL INSTITUTIONAL LOGO & STAMP REGISTRY */}
      {activeSubTab === 'registry' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 linkedin-card p-4 sm:p-5 space-y-3">
            <h2 className="font-bold text-base text-[#191919] dark:text-white flex items-center gap-2">
              <Stamp className="w-5 h-5 text-[#0A66C2]" />
              <span>Official Institutional Logo &amp; Stamp Registry</span>
            </h2>

            <div className="divide-y divide-[#E0DFDC] dark:divide-[#30363D]">
              {logoRegistry.map((rule) => (
                <div
                  key={rule.id}
                  className="py-3 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-bold text-sm text-[#191919] dark:text-white">
                      {rule.name}
                    </div>
                    <div className="text-xs text-[#666666] dark:text-[#8B949E]">
                      {rule.issuerEntity} • {rule.ruleType} (Min {rule.minConfidenceThreshold}%)
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggleRule(rule.id, !rule.active)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      rule.active
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : 'bg-gray-500/15 text-gray-600'
                    }`}
                  >
                    {rule.active ? 'Active' : 'Disabled'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5 linkedin-card p-4 sm:p-5">
            <h3 className="font-bold text-base text-[#191919] dark:text-white mb-3">
              Add Verification Rule
            </h3>
            <form onSubmit={handleAddRule} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Rule / Stamp Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Robotics Club Official Stamp"
                  value={newRuleForm.name}
                  onChange={(e) => setNewRuleForm({ ...newRuleForm, name: e.target.value })}
                  className="linkedin-input text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Authorized Entity</label>
                <input
                  type="text"
                  required
                  value={newRuleForm.issuerEntity}
                  onChange={(e) => setNewRuleForm({ ...newRuleForm, issuerEntity: e.target.value })}
                  className="linkedin-input text-xs"
                />
              </div>
              <button type="submit" className="linkedin-btn-primary w-full text-xs py-2">
                Add to Registry
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 3: SQL VS. BLOCKCHAIN BENCHMARK */}
      {activeSubTab === 'benchmark' && (
        <div className="linkedin-card p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#E0DFDC] dark:border-[#30363D]">
            <h2 className="font-bold text-base text-[#191919] dark:text-white">
              SQL vs. Blockchain Performance Benchmark
            </h2>
            <div className="flex items-center gap-2">
              <select
                value={maxBenchmarkScale}
                onChange={(e) => setMaxBenchmarkScale(Number(e.target.value))}
                className="linkedin-input w-auto text-xs font-semibold py-1.5"
              >
                <option value={10000}>10,000 Credentials</option>
                <option value={25000}>25,000 Credentials</option>
                <option value={50000}>50,000 Credentials</option>
              </select>
              <button
                onClick={() => handleRunBenchmark(maxBenchmarkScale)}
                disabled={runningBenchmark}
                className="linkedin-btn-primary text-xs py-1.5 px-4"
              >
                {runningBenchmark ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                <span>Run Live Benchmark</span>
              </button>
            </div>
          </div>

          {benchmarkData && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="p-3.5 rounded-xl bg-[#FAF9F7] dark:bg-[#0D1117] border border-[#E0DFDC] dark:border-[#30363D]">
                <h3 className="font-bold text-xs mb-2">1. Latency (ms)</h3>
                <div className="h-56">
                  <Line
                    data={{
                      labels: benchmarkData.latencyData.map((d) => d.label),
                      datasets: [
                        {
                          label: 'IBFT Blockchain (ms)',
                          data: benchmarkData.latencyData.map((d) => d.trustTraceIbftMs),
                          borderColor: '#0A66C2',
                          borderWidth: 2
                        },
                        {
                          label: 'SQL DB (ms)',
                          data: benchmarkData.latencyData.map((d) => d.sqlRelationalMs),
                          borderColor: '#15803D',
                          borderWidth: 2
                        }
                      ]
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { labels: { color: chartTextColor, font: { size: 10 } } } },
                      scales: {
                        x: { ticks: { color: chartTextColor, font: { size: 9 } }, grid: { color: chartGridColor } },
                        y: { ticks: { color: chartTextColor, font: { size: 9 } }, grid: { color: chartGridColor } }
                      }
                    }}
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#FAF9F7] dark:bg-[#0D1117] border border-[#E0DFDC] dark:border-[#30363D]">
                <h3 className="font-bold text-xs mb-2">2. Throughput (TPS)</h3>
                <div className="h-56">
                  <Bar
                    data={{
                      labels: benchmarkData.throughputData.map((d) => d.label),
                      datasets: [
                        {
                          label: 'IBFT PoA (TPS)',
                          data: benchmarkData.throughputData.map((d) => d.trustTraceIbftTps),
                          backgroundColor: '#0A66C2'
                        },
                        {
                          label: 'SQL DB (TPS)',
                          data: benchmarkData.throughputData.map((d) => d.sqlRelationalTps),
                          backgroundColor: '#0F766E'
                        }
                      ]
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { labels: { color: chartTextColor, font: { size: 10 } } } },
                      scales: {
                        x: { ticks: { color: chartTextColor, font: { size: 9 } }, grid: { color: chartGridColor } },
                        y: { ticks: { color: chartTextColor, font: { size: 9 } }, grid: { color: chartGridColor } }
                      }
                    }}
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#FAF9F7] dark:bg-[#0D1117] border border-[#E0DFDC] dark:border-[#30363D]">
                <h3 className="font-bold text-xs mb-2">3. Storage Overhead (MB)</h3>
                <div className="h-56">
                  <Line
                    data={{
                      labels: benchmarkData.storageData.map((d) => d.label),
                      datasets: [
                        {
                          label: 'IPFS + Hash (MB)',
                          data: benchmarkData.storageData.map((d) => d.trustTraceOnChainHashMB),
                          borderColor: '#0A66C2',
                          borderWidth: 2.5
                        },
                        {
                          label: 'SQL Tables (MB)',
                          data: benchmarkData.storageData.map((d) => d.sqlRelationalMB),
                          borderColor: '#D97706',
                          borderWidth: 2
                        }
                      ]
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { labels: { color: chartTextColor, font: { size: 10 } } } },
                      scales: {
                        x: { ticks: { color: chartTextColor, font: { size: 9 } }, grid: { color: chartGridColor } },
                        y: { ticks: { color: chartTextColor, font: { size: 9 } }, grid: { color: chartGridColor } }
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: LIVE LEDGER, ESP32-S3 SERIAL MONITOR & SOLIDITY ERC-5192 SOURCE */}
      {activeSubTab === 'ledger' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-6 linkedin-card p-4 sm:p-5 space-y-3">
            <h2 className="font-bold text-base text-[#191919] dark:text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-[#0A66C2]" />
              <span>Live IBFT &amp; ESP32-S3 Serial Log</span>
            </h2>
            <div className="p-3 rounded-xl bg-[#0D1117] text-gray-200 font-mono text-xs space-y-2 max-h-[420px] overflow-y-auto border border-[#30363D]">
              {txLogs.map((log) => (
                <div key={log.id} className="p-2 rounded bg-[#161B22] border border-[#30363D]">
                  <div className="text-emerald-400 font-bold">
                    [Block #{log.blockNumber}] {log.event}
                  </div>
                  <div className="text-[11px] text-cyan-300 mt-0.5">{log.uartSerialLine}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-6 linkedin-card p-4 sm:p-5 space-y-3">
            <h2 className="font-bold text-base text-[#191919] dark:text-white flex items-center gap-2">
              <Code2 className="w-4 h-4 text-[#0A66C2]" />
              <span>ERC-5192 Smart Contract (<code className="font-mono">TrustTraceSBT.sol</code>)</span>
            </h2>
            <pre className="p-3 rounded-xl bg-[#0D1117] text-emerald-300 font-mono text-[11px] overflow-x-auto max-h-[420px] border border-[#30363D]">
              {soliditySource}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
