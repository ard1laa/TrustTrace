import React, { useEffect, useRef, useState } from 'react';
import {
  X, Upload, Camera, ShieldCheck, ShieldAlert, Loader2, AlertCircle, RotateCcw, Lock, CheckCircle2, XCircle,
  Clock, FileText, Sun, Focus, Layers, Sparkles, ChevronDown, AlertTriangle, ExternalLink, ArrowRight, Globe2
} from 'lucide-react';
import { analyzeImageDataUrl } from '../../shared/documentGeometry.js';
import { axisNames, resolveField } from '../../shared/skillTaxonomy.js';
import { apiJson, readFileAsDataUrl } from '../lib/api.js';
import { CATEGORY_OPTIONS, categoryStyle } from './CredentialTags.jsx';

const ACCEPT = 'image/png,image/jpeg,image/webp,application/pdf';
const MAX_BYTES = 15 * 1024 * 1024;
const STEPS = ['Upload', 'Verify', 'Details'];
const GATE_NAMES = ['Document layout', 'Recipient identity', 'AI template check', 'Issuer & event', 'File metadata', 'Tamper forensics'];

const TIPS = [
  { icon: Layers, text: 'Flat, well-lit surface' },
  { icon: Sun, text: 'No glare or shadows' },
  { icon: Focus, text: 'All text sharp and readable' }
];

const OUTCOME = {
  verified: { icon: ShieldCheck, title: 'Certificate verified', tone: 'emerald', cls: 'bg-emerald-500/5 border-emerald-500/30', text: 'text-emerald-800 dark:text-emerald-300', badge: 'bg-emerald-600' },
  review: { icon: AlertTriangle, title: 'Needs a registrar check', tone: 'amber', cls: 'bg-amber-500/5 border-amber-500/40', text: 'text-amber-800 dark:text-amber-300', badge: 'bg-amber-500' },
  rejected: { icon: ShieldAlert, title: 'Certificate rejected', tone: 'red', cls: 'bg-red-600/5 border-red-500/50', text: 'text-red-700 dark:text-red-300', badge: 'bg-red-600' }
};

function GateIcon({ status }) {
  if (status === 'running') return <Loader2 className="w-4 h-4 text-[#0A66C2] animate-spin shrink-0" />;
  if (status === 'waiting') return <span className="w-4 h-4 rounded-full border-2 border-[#E0DFDC] dark:border-[#30363D] shrink-0" />;
  if (status === 'warn') return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
  if (status === 'fail') return <XCircle className="w-4 h-4 text-red-600 shrink-0" />;
  return <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />;
}

function Stepper({ index }) {
  return (
    <ol className="flex gap-1.5 mt-3" aria-label="Progress">
      {STEPS.map((s, i) => (
        <li key={s} className="flex-1" aria-current={i === index ? 'step' : undefined}>
          <div className={`h-1 rounded-full transition-colors duration-300 ${i <= index ? 'bg-[#0A66C2] dark:bg-[#58A6FF]' : 'bg-[#E0DFDC] dark:bg-[#30363D]'}`} />
          <span className={`block mt-1 text-[10px] font-semibold ${i === index ? 'text-[#0A66C2] dark:text-[#58A6FF]' : 'text-[#666666] dark:text-[#8B949E]'}`}>{s}</span>
        </li>
      ))}
    </ol>
  );
}

function AutoBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#0A66C2] dark:text-[#58A6FF]">
      <Sparkles className="w-3 h-3" /> Auto
    </span>
  );
}

export default function AIScannerModal({ isOpen, onClose, currentUser, onCredentialIssued }) {
  const fileInput = useRef(null);
  const cameraInput = useRef(null);
  const [step, setStep] = useState('upload'); // upload | scanning | results | details
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [scan, setScan] = useState(null);
  const [form, setForm] = useState({});
  const [auto, setAuto] = useState({});
  const [sendToQueue, setSendToQueue] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [showGates, setShowGates] = useState(false);

  // Steps through the gate list while the server works, so the wait reads as progress.
  useEffect(() => {
    if (step !== 'scanning') return undefined;
    setProgress(0);
    const timer = setInterval(() => setProgress((p) => Math.min(GATE_NAMES.length - 1, p + 1)), 650);
    return () => clearInterval(timer);
  }, [step]);

  if (!isOpen) return null;

  const field = resolveField(currentUser?.fieldOfStudy || currentUser?.program);
  const axes = axisNames(field.id);
  const forensics = scan?.forensics;
  const outcome = forensics?.outcome || (forensics?.passed ? 'verified' : 'rejected');
  const look = OUTCOME[outcome];
  const forcedReview = outcome === 'review';
  const stepIndex = step === 'upload' ? 0 : step === 'details' ? 2 : 1;

  const reset = () => {
    setStep('upload');
    setFile(null);
    setPreview('');
    setScan(null);
    setError('');
    setSendToQueue(false);
    setShowGates(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleFile = async (e) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    if (picked.size > MAX_BYTES) return setError('That file is larger than 15 MB. Please upload a smaller scan or the original PDF.');
    setError('');
    setFile({ name: picked.name, sizeKB: (picked.size / 1024).toFixed(0) });
    setStep('scanning');

    try {
      const dataUrl = await readFileAsDataUrl(picked);
      const isImage = (picked.type || '').startsWith('image/');
      setPreview(isImage ? dataUrl : '');
      const geometry = isImage ? await analyzeImageDataUrl(dataUrl) : null;

      const data = await apiJson('/api/certificates/verify-upload', {
        method: 'POST',
        body: { fileBase64: dataUrl, fileName: picked.name, mimeType: picked.type, clientPixelMetrics: geometry }
      });
      const x = data.extracted || {};
      setScan(data);
      setForm({
        achievementTitle: x.achievementTitle || '',
        issuingOrganization: x.issuingOrganization || currentUser?.university || '',
        issuanceDate: x.issuanceDate || new Date().toISOString().slice(0, 10),
        competencyDomain: axes.includes(x.competencyDomain) ? x.competencyDomain : axes[0],
        achievementType: CATEGORY_OPTIONS.includes(x.achievementType) ? x.achievementType : 'Other',
        requiresScoring: Boolean(x.requiresScoring),
        achievementResult: x.achievementResult || ''
      });
      setAuto({
        achievementTitle: Boolean(x.achievementTitle),
        issuingOrganization: Boolean(x.issuingOrganization),
        issuanceDate: Boolean(x.issuanceDate),
        achievementType: x.achievementType && x.achievementType !== 'Other',
        requiresScoring: Boolean(x.requiresScoring)
      });
      // A clean pass goes straight to the pre-filled form.
      setStep(data.forensics?.outcome === 'verified' ? 'details' : 'results');
    } catch (err) {
      setError(err.message);
      setStep('upload');
    }
  };

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setAuto((a) => ({ ...a, [key]: false }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const data = await apiJson('/api/credentials/issue', {
        method: 'POST',
        body: { ...form, scanId: scan.scanId, validationMode: sendToQueue || forcedReview ? 'queue' : 'auto' }
      });
      onCredentialIssued?.(data.credential, data.message);
      close();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const gates = forensics?.gates || [];
  const eventCheck = forensics?.eventCheck;

  const fileStrip = (
    <div className="flex items-center gap-3 p-2.5 rounded-xl bg-[#F4F2EE]/70 dark:bg-[#0D1117]">
      {preview ? (
        <img src={preview} alt="" className="w-14 h-10 object-cover rounded-lg border border-[#E0DFDC] dark:border-[#30363D] shrink-0" />
      ) : (
        <span className="w-14 h-10 rounded-lg bg-white dark:bg-[#1B1F23] flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5 text-[#0A66C2]" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold truncate">{file?.name}</p>
        <p className="text-[11px] text-[#666666] dark:text-[#8B949E]">
          {file?.sizeKB} KB{forensics ? ` · ${forensics.dimensions}` : ''}
        </p>
      </div>
      {forensics && <span className={`chip text-white ${look.badge}`}>{forensics.overallConfidence}%</span>}
    </div>
  );

  const gateList = (
    <ul className="space-y-2">
      {gates.map((g) => (
        <li key={g.id} className="flex items-start gap-2.5 text-xs">
          <GateIcon status={g.status || (g.passed ? 'pass' : 'fail')} />
          <span className="min-w-0">
            <span className="font-semibold">{g.title.replace(/^Gate \d: /, '')}</span>
            {(g.status !== 'pass' || g.gateNumber === 2 || g.gateNumber === 4 || g.gateNumber === 6) && (
              <span className="block text-[11px] text-[#666666] dark:text-[#8B949E] leading-snug">{g.detail}</span>
            )}
          </span>
        </li>
      ))}
      {eventCheck?.evidence?.length > 0 && (
        <li className="flex flex-wrap gap-1.5 pl-6">
          {eventCheck.evidence.map((ev) => (
            <a key={ev.url} href={ev.url} target="_blank" rel="noreferrer" className="chip bg-[#EBF3FB] dark:bg-[#0A66C2]/20 text-[#0A66C2] dark:text-[#58A6FF] max-w-full">
              <Globe2 className="w-3 h-3 shrink-0" />
              <span className="truncate max-w-[180px]">{ev.title}</span>
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          ))}
        </li>
      )}
    </ul>
  );

  const outcomeBanner = forensics && (
    <div className={`p-4 rounded-2xl border ${look.cls}`}>
      <div className="flex items-center gap-2 font-bold text-sm">
        <look.icon className={`w-5 h-5 ${look.text}`} />
        <span className={look.text}>{look.title}</span>
      </div>
      <p className="mt-1 text-xs text-[#666666] dark:text-[#8B949E]">
        {outcome === 'verified'
          ? 'Passed all six checks.'
          : outcome === 'review'
          ? 'We found signs the certificate may have been edited. You can still submit it — a registrar will review it before it is minted.'
          : 'This file can’t be added to your wallet.'}
      </p>
    </div>
  );

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && step !== 'scanning' && close()}>
      <div className="modal-panel max-w-xl" role="dialog" aria-modal="true" aria-label="Add a certificate">
        <div className="px-5 pt-4 pb-3 border-b border-[#E0DFDC] dark:border-[#30363D] sticky top-0 bg-white/95 dark:bg-[#1B1F23]/95 backdrop-blur z-10">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-base">Add a certificate</h2>
            <button onClick={close} disabled={step === 'scanning'} className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-[#666666]" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
          <Stepper index={stepIndex} />
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div role="alert" className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300 text-xs flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
              {error}
            </div>
          )}

          {step === 'upload' && (
            <>
              <div
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files?.[0]) handleFile({ target: { files: e.dataTransfer.files, value: '' } });
                }}
                className="border-2 border-dashed border-[#0A66C2]/40 hover:border-[#0A66C2] rounded-2xl px-6 py-9 text-center cursor-pointer bg-[#F4F2EE]/50 dark:bg-[#0D1117]/60 transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-[#EBF3FB] dark:bg-[#0A66C2]/20 text-[#0A66C2] flex items-center justify-center mx-auto mb-3">
                  <Upload className="w-5 h-5" />
                </div>
                <p className="font-semibold text-sm">Drop your certificate here</p>
                <p className="text-xs text-[#666666] dark:text-[#8B949E] mt-1">The original PDF works best · PNG, JPG or PDF up to 15 MB</p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <button type="button" onClick={(e) => (e.stopPropagation(), fileInput.current?.click())} className="linkedin-btn-primary text-xs py-2 px-4">
                    <Upload className="w-3.5 h-3.5" /> Choose file
                  </button>
                  <button type="button" onClick={(e) => (e.stopPropagation(), cameraInput.current?.click())} className="linkedin-btn-outline text-xs py-2 px-4 sm:hidden">
                    <Camera className="w-3.5 h-3.5" /> Take photo
                  </button>
                </div>
                <input ref={fileInput} type="file" accept={ACCEPT} onChange={handleFile} className="hidden" />
                <input ref={cameraInput} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
              </div>
              <ul className="grid grid-cols-3 gap-2" aria-label="Photo tips">
                {TIPS.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex flex-col items-center text-center gap-1.5 p-2.5 rounded-xl bg-[#F4F2EE]/60 dark:bg-[#0D1117]/60">
                    <Icon className="w-4 h-4 text-[#0A66C2] dark:text-[#58A6FF]" />
                    <span className="text-[11px] leading-tight text-[#666666] dark:text-[#8B949E]">{text}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {step === 'scanning' && (
            <div className="space-y-4" aria-live="polite">
              {fileStrip}
              <ul className="space-y-2.5 py-1">
                {GATE_NAMES.map((name, i) => (
                  <li key={name} className={`flex items-center gap-2.5 text-xs transition-opacity ${i > progress ? 'opacity-50' : ''}`}>
                    <GateIcon status={i < progress ? 'pass' : i === progress ? 'running' : 'waiting'} />
                    <span className={i === progress ? 'font-semibold' : ''}>{name}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-[#666666] dark:text-[#8B949E]">Reading the text, checking the name region for edits and looking the event up online…</p>
            </div>
          )}

          {step === 'results' && forensics && (
            <div className="space-y-4">
              {fileStrip}
              {outcomeBanner}
              {gateList}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={reset} className="linkedin-btn-neutral text-xs">
                  <RotateCcw className="w-3.5 h-3.5" /> Try a different file
                </button>
                {outcome !== 'rejected' && (
                  <button type="button" onClick={() => setStep('details')} className="linkedin-btn-primary text-xs">
                    Continue <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {step === 'details' && forensics && (
            <form onSubmit={submit} className="space-y-4">
              {fileStrip}
              <div className={`rounded-xl border ${look.cls}`}>
                <button type="button" onClick={() => setShowGates((v) => !v)} className="w-full p-3 flex items-center justify-between gap-2 text-left">
                  <span className={`flex items-center gap-2 text-xs font-bold ${look.text}`}>
                    <look.icon className="w-4 h-4" />
                    {outcome === 'verified' ? 'Verified — all 6 checks passed' : look.title}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-[#666666] transition-transform ${showGates ? 'rotate-180' : ''}`} />
                </button>
                {showGates && <div className="px-3 pb-3">{gateList}</div>}
              </div>

              <p className="text-[11px] text-[#666666] dark:text-[#8B949E] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#0A66C2]" /> Filled in from your certificate — check and adjust if needed.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Recipient</label>
                  <div className="linkedin-input flex items-center justify-between bg-black/[0.03] dark:bg-white/[0.03]">
                    <span className="font-semibold truncate">{currentUser?.name}</span>
                    <Lock className="w-3.5 h-3.5 text-[#666666] shrink-0" />
                  </div>
                </div>
                <div>
                  <label className="flex items-center justify-between text-xs font-semibold mb-1">
                    Title {auto.achievementTitle && <AutoBadge />}
                  </label>
                  <input required value={form.achievementTitle} onChange={(e) => set('achievementTitle', e.target.value)} className="linkedin-input font-medium" />
                </div>

                <div>
                  <span className="flex items-center justify-between text-xs font-semibold mb-1.5">
                    Type {auto.achievementType && <AutoBadge />}
                  </span>
                  <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Certificate type">
                    {CATEGORY_OPTIONS.map((c) => {
                      const { icon: Icon } = categoryStyle(c);
                      const on = form.achievementType === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => set('achievementType', c)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                            on ? 'bg-[#0A66C2] border-[#0A66C2] text-white' : 'border-[#E0DFDC] dark:border-[#30363D] text-[#404040] dark:text-[#C9D1D9] hover:border-[#0A66C2]/60'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" /> {c}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="flex items-center justify-between text-xs font-semibold mb-1">
                      Issued by {auto.issuingOrganization && <AutoBadge />}
                    </label>
                    <input required value={form.issuingOrganization} onChange={(e) => set('issuingOrganization', e.target.value)} className="linkedin-input" />
                  </div>
                  <div>
                    <label className="flex items-center justify-between text-xs font-semibold mb-1">
                      Date {auto.issuanceDate && <AutoBadge />}
                    </label>
                    <input type="date" required value={form.issuanceDate} onChange={(e) => set('issuanceDate', e.target.value)} className="linkedin-input" />
                  </div>
                </div>

                <div className="rounded-xl border border-[#E0DFDC] dark:border-[#30363D] p-3 space-y-2.5">
                  <label className="flex items-center justify-between gap-3 cursor-pointer">
                    <span className="text-xs font-semibold flex items-center gap-2">
                      Includes a result or placement {auto.requiresScoring && <AutoBadge />}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={form.requiresScoring}
                      onClick={() => set('requiresScoring', !form.requiresScoring)}
                      className={`relative w-10 h-6 rounded-full transition-colors ${form.requiresScoring ? 'bg-[#0A66C2]' : 'bg-[#C9C9C9] dark:bg-[#30363D]'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.requiresScoring ? 'translate-x-4' : ''}`} />
                    </button>
                  </label>
                  {form.requiresScoring && (
                    <input
                      required
                      value={form.achievementResult}
                      onChange={(e) => set('achievementResult', e.target.value)}
                      placeholder="e.g. 1st Place, Champion, CGPA 3.85"
                      className="linkedin-input animate-fade-in"
                      maxLength={60}
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Skill area · {field.label}</label>
                  <select value={form.competencyDomain} onChange={(e) => set('competencyDomain', e.target.value)} className="linkedin-input">
                    {axes.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {forcedReview ? (
                <p className="p-3 rounded-xl bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs flex gap-2">
                  <Clock className="w-4 h-4 shrink-0" /> This certificate will be sent to a registrar for review before it’s minted.
                </p>
              ) : (
                <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[#E0DFDC] dark:border-[#30363D] cursor-pointer">
                  <span className="flex items-center gap-2 text-xs font-semibold">
                    <Clock className="w-4 h-4 text-amber-600" /> Ask the registrar to review before minting
                  </span>
                  <input type="checkbox" checked={sendToQueue} onChange={(e) => setSendToQueue(e.target.checked)} className="w-4 h-4 accent-[#0A66C2]" />
                </label>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={reset} className="linkedin-btn-neutral text-xs">
                  <RotateCcw className="w-3.5 h-3.5" /> Start over
                </button>
                <button type="submit" disabled={submitting} className="linkedin-btn-primary text-xs">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : sendToQueue || forcedReview ? <Clock className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                  {sendToQueue || forcedReview ? 'Submit for review' : 'Add to wallet'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
