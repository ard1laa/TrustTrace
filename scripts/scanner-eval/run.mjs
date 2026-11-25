// Scanner evaluation: runs the real certificate pipeline over labelled samples
// and reports how often it gets the decision right.
//
//   npm run eval:scanner                 # synthetic set (generated if missing)
//   npm run eval:scanner -- --real       # also test-data/scanner/real/
//   npm run eval:scanner -- --strict     # exit 1 on any false rejection or missed forgery
//
// Outcome expectations in manifest.json:
//   verified      genuine and readable → should be auto-verified
//   review        genuine but needs a person (e.g. photographed on a desk)
//   inconclusive  unreadable upload → should NOT be auto-verified or rejected
//   rejected      clear evidence → should be rejected
//   not-verified  forged → rejected OR sent to review (never auto-verified)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
process.chdir(root);
if (!process.argv.includes('--online')) process.env.EVENT_CROSSCHECK = 'off';

const { generateDataset } = await import('./generate.mjs');
const { analyzeCertificateUpload } = await import('../../server/services/aiScanner.js');
const { similarity } = await import('../../server/services/nameMatch.js');

const strict = process.argv.includes('--strict');
const sets = [path.join(root, 'test-data/scanner/generated')];
if (process.argv.includes('--real')) sets.push(path.join(root, 'test-data/scanner/real'));

if (!fs.existsSync(path.join(sets[0], 'manifest.json'))) await generateDataset(sets[0]);

const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const mimeOf = (f) => (/\.pdf$/i.test(f) ? 'application/pdf' : /\.png$/i.test(f) ? 'image/png' : /\.webp$/i.test(f) ? 'image/webp' : 'image/jpeg');

const samples = [];
for (const dir of sets) {
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.log(`(skipping ${path.relative(root, dir)}: no manifest.json)`);
    continue;
  }
  for (const entry of JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))) samples.push({ ...entry, dir, set: path.basename(dir) });
}
// Genuine first, so the registry knows their certificate numbers before copies arrive.
samples.sort((a, b) => (a.category === 'genuine' ? 0 : 1) - (b.category === 'genuine' ? 0 : 1));

const registry = new Map(); // certificate number → holder
const results = [];
for (const s of samples) {
  const buffer = fs.readFileSync(path.join(s.dir, s.file));
  const started = Date.now();
  const r = await analyzeCertificateUpload({
    fileBase64: buffer.toString('base64'),
    fileName: s.file,
    mimeType: mimeOf(s.file),
    studentName: s.holder,
    studentField: 'computer-science',
    registryCheck: async ({ certificateNumber }) => ({
      numberOtherAccount: Boolean(certificateNumber) && registry.has(certificateNumber) && registry.get(certificateNumber) !== s.holder
    })
  });
  const f = r.forensics;
  if (s.category === 'genuine' && f.certificateNumber && !registry.has(f.certificateNumber)) registry.set(f.certificateNumber, s.holder);

  const outcome = f.outcome;
  const correct =
    s.expect === 'not-verified' ? outcome === 'rejected' || outcome === 'review' : outcome === s.expect;
  const x = r.extracted;
  const fields = {};
  // Field accuracy only means something on genuine certificates (forgeries print other values on purpose).
  const want = s.category === 'genuine' ? s.fields || {} : {};
  if (want.title) fields.title = norm(x.achievementTitle) === norm(want.title) || similarity(norm(x.achievementTitle), norm(want.title)) >= 0.9;
  if (want.date) fields.date = x.issuanceDate === want.date;
  if (want.result !== undefined && s.category === 'genuine') fields.result = norm(x.achievementResult) === norm(want.result);
  if (want.type) fields.type = x.achievementType === want.type;
  if (want.issuer) fields.issuer = norm(x.issuingOrganization).includes(norm(want.issuer));
  results.push({
    file: `${s.set}/${s.file}`,
    category: s.category,
    kind: s.kind,
    expect: s.expect,
    outcome,
    correct,
    reasons: f.gates.filter((g) => g.status !== 'pass').map((g) => `${g.statusLabel}`),
    fields,
    ms: Date.now() - started
  });
  console.log(`${correct ? 'ok  ' : 'MISS'} ${outcome.padEnd(12)} ${s.category.padEnd(8)} ${`${s.set}/${s.file}`.padEnd(48)} ${results.at(-1).reasons.join('; ')}`);
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------
const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}% (${n}/${d})` : 'n/a');
const by = (cat) => results.filter((r) => r.category === cat);
const genuine = by('genuine');
const genuineReadable = genuine.filter((r) => r.expect === 'verified');
const forged = by('forged');
const degraded = by('degraded');
const count = (list, o) => list.filter((r) => r.outcome === o).length;

const fieldStats = {};
for (const r of results) {
  for (const [k, v] of Object.entries(r.fields)) {
    fieldStats[k] ||= { right: 0, total: 0 };
    fieldStats[k].total++;
    if (v) fieldStats[k].right++;
  }
}

const metrics = {
  samples: results.length,
  genuineAcceptance: pct(count(genuineReadable, 'verified'), genuineReadable.length),
  genuineFalseRejection: pct(count(genuine, 'rejected'), genuine.length),
  genuineSentToRegistrar: pct(count(genuine, 'review') + count(genuine, 'inconclusive'), genuine.length),
  forgeryStopped: pct(count(forged, 'rejected') + count(forged, 'review'), forged.length),
  forgeryRejectedOutright: pct(count(forged, 'rejected'), forged.length),
  forgeryMissed_falseNegative: pct(count(forged, 'verified'), forged.length),
  forgeryInconclusive: pct(count(forged, 'inconclusive'), forged.length),
  degradedInconclusive: pct(count(degraded, 'inconclusive'), degraded.length),
  degradedWronglyVerified: pct(count(degraded, 'verified'), degraded.length),
  inconclusiveOverall: pct(count(results, 'inconclusive'), results.length),
  fieldAccuracy: Object.fromEntries(Object.entries(fieldStats).map(([k, v]) => [k, pct(v.right, v.total)])),
  medianMsPerCertificate: results.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(results.length / 2)]
};

console.log('\n=== Scanner evaluation ===');
for (const [k, v] of Object.entries(metrics)) console.log(`${k.padEnd(30)} ${typeof v === 'object' ? JSON.stringify(v) : v}`);
const misses = results.filter((r) => !r.correct);
if (misses.length) console.log(`\n${misses.length} sample(s) did not match expectation:`, misses.map((m) => `${m.file} → ${m.outcome} (expected ${m.expect})`).join('\n  '));
console.log('\nNote: synthetic samples prove the pipeline behaves as designed. Real-world accuracy can only be measured on real certificates (test-data/scanner/real/).');

fs.mkdirSync(path.join(root, 'test-data/scanner'), { recursive: true });
fs.writeFileSync(path.join(root, 'test-data/scanner/report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), metrics, results }, null, 2));

if (strict && (count(genuine, 'rejected') > 0 || count(forged, 'verified') > 0)) process.exit(1);
