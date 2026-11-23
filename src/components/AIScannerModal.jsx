import React, { useRef, useState } from 'react';
import { X, Upload, Camera, FileCheck2, ShieldCheck, ShieldAlert, Loader2, AlertCircle, RotateCcw, Lock, CheckCircle2, XCircle, Clock, FileText } from 'lucide-react';
import { analyzeImageDataUrl } from '../../shared/documentGeometry.js';
import { axisNames, resolveField } from '../../shared/skillTaxonomy.js';
import { apiJson } from '../lib/api.js';

const ACCEPT = 'image/png,image/jpeg,image/webp,application/pdf';
const MAX_BYTES = 15 * 1024 * 1024;

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

export default function AIScannerModal({ isOpen, onClose, currentUser, onCredentialIssued }) {
  const fileInput = useRef(null);
  const cameraInput = useRef(null);
  const [step, setStep] = useState('upload'); // upload | scanning | review
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [scan, setScan] = useState(null);
  const [form, setForm] = useState({});
  const [sendToQueue, setSendToQueue] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const field = resolveField(currentUser?.fieldOfStudy || currentUser?.program);
  const axes = axisNames(field.id);

  const reset = () => {
    setStep('upload');
    setFile(null);
    setPreview('');
    setScan(null);
    setError('');
    setSendToQueue(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleFile = async (e) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    if (picked.size > MAX_BYTES) {
      setError('That file is larger than 15 MB. Please upload a smaller scan or the original PDF.');
      return;
    }
    setError('');
    setFile({ name: picked.name, type: picked.type || 'application/octet-stream', sizeKB: (picked.size / 1024).toFixed(0) });
    setStep('scanning');

    try {
      const dataUrl = await readAsDataUrl(picked);
      const isImage = (picked.type || '').startsWith('image/');
      setPreview(isImage ? dataUrl : '');
      const geometry = isImage ? await analyzeImageDataUrl(dataUrl) : null;

      const data = await apiJson('/api/certificates/verify-upload', {
        method: 'POST',
        body: { fileBase64: dataUrl, fileName: picked.name, mimeType: picked.type, clientPixelMetrics: geometry }
      });
      setScan(data);
      setForm({
        achievementTitle: data.extracted?.achievementTitle || '',
        issuingOrganization: data.extracted?.issuingOrganization || currentUser?.university || '',
        issuanceDate: data.extracted?.issuanceDate || new Date().toISOString().slice(0, 10),
        competencyDomain: axes.includes(data.extracted?.competencyDomain) ? data.extracted.competencyDomain : axes[0]
      });
      setStep('review');
    } catch (err) {
      setError(err.message);
      setStep('upload');
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const data = await apiJson('/api/credentials/issue', {
        method: 'POST',
        body: { ...form, scanId: scan.scanId, validationMode: sendToQueue ? 'queue' : 'auto' }
      });
      onCredentialIssued?.(data.credential, data.message);
      close();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const forensics = scan?.forensics;
  const passed = Boolean(forensics?.passed);
  const gates = forensics?.gates || [];

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && step !== 'scanning' && close()}>
      <div className="modal-panel max-w-xl" role="dialog" aria-modal="true" aria-label="Add a certificate">
        <div className="px-5 py-4 border-b border-[#E0DFDC] dark:border-[#30363D] flex items-center justify-between sticky top-0 bg-white/95 dark:bg-[#1B1F23]/95 backdrop-blur z-10">
          <div>
            <h2 className="font-bold text-base">Add a certificate</h2>
            <p className="text-[11px] text-[#666666] dark:text-[#8B949E]">Checked automatically before it's minted to your wallet</p>
          </div>
          <button onClick={close} disabled={step === 'scanning'} className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-[#666666]" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div role="alert" className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300 text-xs flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
              {error}
            </div>
          )}

          {step === 'upload' && (
            <div
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files?.[0]) handleFile({ target: { files: e.dataTransfer.files, value: '' } });
              }}
              className="border-2 border-dashed border-[#0A66C2]/40 hover:border-[#0A66C2] rounded-2xl p-8 text-center cursor-pointer bg-[#F4F2EE]/50 dark:bg-[#0D1117]/60 transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-[#EBF3FB] dark:bg-[#0A66C2]/20 text-[#0A66C2] flex items-center justify-center mx-auto mb-3">
                <Upload className="w-5 h-5" />
              </div>
              <p className="font-semibold text-sm">Drop your certificate here</p>
              <p className="text-xs text-[#666666] dark:text-[#8B949E] mt-1">The original PDF or a flat scan works best · PNG, JPG, PDF up to 15 MB</p>
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
          )}

          {step === 'scanning' && (
            <div className="py-12 text-center space-y-3" aria-live="polite">
              <Loader2 className="w-9 h-9 text-[#0A66C2] animate-spin mx-auto" />
              <p className="font-bold text-sm">Verifying {file?.name}</p>
              <p className="text-xs text-[#666666] dark:text-[#8B949E]">Checking layout, recipient name, issuer and file metadata…</p>
            </div>
          )}

          {step === 'review' && forensics && (
            <form onSubmit={submit} className="space-y-4">
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-[#F4F2EE]/70 dark:bg-[#0D1117]">
                {preview ? (
                  <img src={preview} alt="" className="w-16 h-12 object-cover rounded-lg border border-[#E0DFDC] dark:border-[#30363D] shrink-0" />
                ) : (
                  <span className="w-16 h-12 rounded-lg bg-white dark:bg-[#1B1F23] flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-[#0A66C2]" />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate">{file?.name}</p>
                  <p className="text-[11px] text-[#666666] dark:text-[#8B949E]">
                    {file?.sizeKB} KB · {forensics.dimensions}
                  </p>
                </div>
              </div>

              <div className={`p-4 rounded-2xl border ${passed ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-red-600/5 border-red-500/50'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    {passed ? <ShieldCheck className="w-5 h-5 text-emerald-600" /> : <ShieldAlert className="w-5 h-5 text-red-600" />}
                    <span className={passed ? 'text-emerald-800 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}>{passed ? 'Certificate verified' : 'Certificate rejected'}</span>
                  </div>
                  <span className={`chip text-white ${passed ? 'bg-emerald-600' : 'bg-red-600'}`}>{forensics.overallConfidence}%</span>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {gates.map((g) => (
                    <li key={g.id} className="flex items-start gap-2 text-xs">
                      {g.passed ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <XCircle className="w-4 h-4 text-red-600 shrink-0" />}
                      <span className="min-w-0">
                        <span className="font-semibold">{g.title.replace(/^Gate \d: /, '')}</span>
                        {(!g.passed || g.gateNumber === 2) && <span className="block text-[11px] text-[#666666] dark:text-[#8B949E]">{g.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {passed && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold mb-1">Recipient</label>
                      <div className="linkedin-input flex items-center justify-between bg-black/[0.03] dark:bg-white/[0.03]">
                        <span className="font-semibold truncate">{currentUser?.name}</span>
                        <Lock className="w-3.5 h-3.5 text-[#666666] shrink-0" />
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold mb-1">Certificate title</label>
                      <input required value={form.achievementTitle} onChange={(e) => setForm({ ...form, achievementTitle: e.target.value })} className="linkedin-input font-medium" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Issued by</label>
                      <input required value={form.issuingOrganization} onChange={(e) => setForm({ ...form, issuingOrganization: e.target.value })} className="linkedin-input" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Issue date</label>
                      <input type="date" required value={form.issuanceDate} onChange={(e) => setForm({ ...form, issuanceDate: e.target.value })} className="linkedin-input" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold mb-1">Skill area ({field.label})</label>
                      <select value={form.competencyDomain} onChange={(e) => setForm({ ...form, competencyDomain: e.target.value })} className="linkedin-input">
                        {axes.map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[#E0DFDC] dark:border-[#30363D] cursor-pointer">
                    <span className="flex items-center gap-2 text-xs font-semibold">
                      <Clock className="w-4 h-4 text-amber-600" /> Ask the registrar to review before minting
                    </span>
                    <input type="checkbox" checked={sendToQueue} onChange={(e) => setSendToQueue(e.target.checked)} className="w-4 h-4 accent-[#0A66C2]" />
                  </label>
                </>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={reset} className="linkedin-btn-neutral text-xs">
                  <RotateCcw className="w-3.5 h-3.5" />
                  {passed ? 'Choose another file' : 'Try a different file'}
                </button>
                {passed && (
                  <button type="submit" disabled={submitting} className="linkedin-btn-primary text-xs">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : sendToQueue ? <Clock className="w-4 h-4" /> : <FileCheck2 className="w-4 h-4" />}
                    {sendToQueue ? 'Submit for review' : 'Add to wallet'}
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
