// Builds a labelled synthetic certificate dataset for the scanner evaluation.
//
//   node scripts/scanner-eval/generate.mjs [outDir]
//
// Writes images plus manifest.json to test-data/scanner/generated/ (git-ignored).
// Every forgery is made the way a real forger would: start from a genuine
// certificate and change one thing (name, date, title, …), sometimes editing a
// lossless original so that only one JPEG save remains. Synthetic data proves
// the pipeline behaves as designed; it is NOT a substitute for real samples —
// add those to test-data/scanner/real/ (see README there).
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const W = 1600;
const H = 1130;
const OUT = path.resolve(process.argv[2] || 'test-data/scanner/generated');

// ---------------------------------------------------------------------------
// Certificate templates. Each returns SVG for a given recipient and the
// ground-truth fields, plus the box of each editable field (for forgeries).
// ---------------------------------------------------------------------------
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const text = (x, y, size, content, { family = 'Helvetica', weight = 'normal', style = 'normal', fill = '#333', anchor = 'middle', spacing = 0 } = {}) =>
  `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" font-style="${style}" fill="${fill}" text-anchor="${anchor}" letter-spacing="${spacing}">${esc(content)}</text>`;

// Box around a centred single line of text: [x0, y0, x1, y1] in px.
const lineBox = (y, size, width = 1100) => [800 - width / 2, Math.round(y - size * 0.95), 800 + width / 2, Math.round(y + size * 0.32)];

const TEMPLATES = {
  // Classic hackathon award with placement.
  hackathon: (f) => ({
    bg: '#fbfaf6',
    svg: `<rect width="100%" height="100%" fill="#fbfaf6"/><rect x="34" y="34" width="${W - 68}" height="${H - 68}" fill="none" stroke="#b8862b" stroke-width="10"/>
${text(800, 200, 30, 'FACULTY OF COMPUTING · UNIVERSITI TEKNOLOGI MALAYSIA', { spacing: 3 })}
${text(800, 320, 74, 'CERTIFICATE OF ACHIEVEMENT', { family: 'Georgia', weight: 'bold', fill: '#222' })}
${text(800, 410, 30, 'This certificate is proudly presented to', { fill: '#555' })}
${text(800, 540, 84, f.name, { family: 'Georgia', style: 'italic', fill: '#0b2545' })}
${text(800, 630, 30, f.result ? `for winning ${f.result} in the` : 'for participating in the', { fill: '#555' })}
${text(800, 705, 46, f.title, { weight: 'bold', fill: '#13315c' })}
${text(800, 775, 28, `held on ${f.dateText}, Johor Bahru`, { fill: '#555' })}
${text(420, 960, 24, 'Dean, Faculty of Computing')}${text(1180, 960, 24, 'Programme Director')}`,
    boxes: { name: lineBox(540, 84), title: lineBox(705, 46, 900), date: lineBox(775, 28, 700) },
    fonts: { name: { family: 'Georgia', style: 'italic', size: 84, fill: '#0b2545', y: 540 }, title: { weight: 'bold', size: 46, fill: '#13315c', y: 705 }, date: { size: 28, fill: '#555', y: 775 } }
  }),
  // Workshop participation with a script-font name and textured paper.
  workshop: (f) => ({
    bg: '#f7f1e1',
    svg: `<defs><filter id="t"><feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" seed="4"/><feColorMatrix values="0 0 0 0 0.93  0 0 0 0 0.9  0 0 0 0 0.82  0 0 0 0.35 0"/></filter></defs>
<rect width="100%" height="100%" fill="#f7f1e1"/><rect width="100%" height="100%" filter="url(#t)"/>
<rect x="40" y="40" width="${W - 80}" height="${H - 80}" fill="none" stroke="#b8862b" stroke-width="14"/>
${text(800, 170, 32, 'GOOGLE DEVELOPER STUDENT CLUBS · UNIVERSITI MALAYA', { spacing: 4, fill: '#2b2b2b' })}
${text(800, 290, 76, 'Certificate of Participation', { family: 'Times New Roman', fill: '#2b2b2b' })}
${text(800, 380, 28, 'This is to certify that', { fill: '#555' })}
${text(800, 500, 90, f.name, { family: 'Snell Roundhand, Apple Chancery, cursive', fill: '#9a7322' })}
<line x1="420" y1="530" x2="1180" y2="530" stroke="#b8862b" stroke-width="3"/>
${text(800, 600, 28, 'has actively participated in the hands-on', { fill: '#555' })}
${text(800, 670, 44, f.title, { weight: 'bold', fill: '#1a73e8' })}
${text(800, 730, 26, `organised on ${f.dateText}, Kuala Lumpur`, { fill: '#555' })}
${text(400, 960, 24, 'GDSC Lead')}${text(1200, 960, 24, 'Faculty Advisor')}`,
    boxes: { name: lineBox(500, 90), title: lineBox(670, 44, 900), date: lineBox(730, 26, 760) },
    fonts: { name: { family: 'Snell Roundhand, Apple Chancery, cursive', size: 90, fill: '#9a7322', y: 500 }, title: { weight: 'bold', size: 44, fill: '#1a73e8', y: 670 }, date: { size: 26, fill: '#555', y: 730 } }
  }),
  // Canva-style diagonal ribbons, competition with certificate number.
  ribbons: (f) => ({
    bg: '#ffffff',
    svg: `<rect width="100%" height="100%" fill="#ffffff"/>
<polygon points="0,0 520,0 0,380" fill="#0b2545"/><polygon points="0,0 600,0 0,440" fill="none" stroke="#d4a017" stroke-width="18"/>
<polygon points="${W},${H} ${W - 520},${H} ${W},${H - 380}" fill="#0b2545"/><polygon points="${W},${H} ${W - 600},${H} ${W},${H - 440}" fill="none" stroke="#d4a017" stroke-width="18"/>
${text(800, 230, 30, 'IEEE STUDENT BRANCH · UNIVERSITI TEKNOLOGI MALAYSIA', { spacing: 3, fill: '#2b2b2b' })}
${text(800, 340, 72, 'CERTIFICATE OF ACHIEVEMENT', { family: 'Georgia', weight: 'bold', fill: '#2b2b2b' })}
${text(800, 420, 28, 'This certificate is proudly presented to', { fill: '#555' })}
${text(800, 540, 82, f.name, { family: 'Georgia', style: 'italic', fill: '#0b2545' })}
${text(800, 620, 28, `for winning ${f.result} in the`, { fill: '#555' })}
${text(800, 690, 44, f.title, { weight: 'bold', fill: '#13315c' })}
${text(800, 750, 26, `held on ${f.dateText}, Skudai`, { fill: '#555' })}
${text(800, 840, 22, `Certificate No: ${f.number}`, { family: 'Courier', fill: '#444' })}`,
    boxes: { name: lineBox(540, 82), title: lineBox(690, 44, 900), date: lineBox(750, 26, 640) },
    fonts: { name: { family: 'Georgia', style: 'italic', size: 82, fill: '#0b2545', y: 540 }, title: { weight: 'bold', size: 44, fill: '#13315c', y: 690 }, date: { size: 26, fill: '#555', y: 750 } }
  }),
  // Dark frame + swooshes, seminar.
  swoosh: (f) => ({
    bg: '#ffffff',
    svg: `<rect width="100%" height="100%" fill="#0b2545"/><rect x="60" y="60" width="${W - 120}" height="${H - 120}" fill="#ffffff"/>
<polygon points="60,60 760,60 60,640" fill="#13315c"/><polygon points="60,640 60,${H - 60} 700,${H - 60}" fill="#c9a227"/>
${text(800, 230, 30, 'SCHOOL OF COMPUTING · UNIVERSITI SAINS MALAYSIA', { spacing: 3, fill: '#2b2b2b' })}
${text(800, 340, 70, 'CERTIFICATE OF ATTENDANCE', { family: 'Georgia', weight: 'bold', fill: '#2b2b2b' })}
${text(800, 420, 28, 'This is to certify that', { fill: '#555' })}
${text(800, 540, 80, f.name, { family: 'Georgia', style: 'italic', fill: '#0b2545' })}
${text(800, 620, 28, 'attended the seminar', { fill: '#555' })}
${text(800, 690, 44, f.title, { weight: 'bold', fill: '#13315c' })}
${text(800, 750, 26, `on ${f.dateText}, Penang`, { fill: '#555' })}`,
    boxes: { name: lineBox(540, 80), title: lineBox(690, 44, 900), date: lineBox(750, 26, 520) },
    fonts: { name: { family: 'Georgia', style: 'italic', size: 80, fill: '#0b2545', y: 540 }, title: { weight: 'bold', size: 44, fill: '#13315c', y: 690 }, date: { size: 26, fill: '#555', y: 750 } }
  }),
  // Name on a bold designed ribbon; every element genuine.
  banner: (f) => ({
    bg: '#f6f3ea',
    svg: `<rect width="100%" height="100%" fill="#f6f3ea"/>
${text(800, 200, 30, 'FACULTY OF ENGINEERING · UNIVERSITI MALAYA', { spacing: 3 })}
${text(800, 320, 72, 'Certificate of Completion', { family: 'Georgia', weight: 'bold', fill: '#222' })}
${text(800, 410, 30, 'This is to certify that', { fill: '#555' })}
<rect x="200" y="455" width="1200" height="115" rx="12" fill="#1d3557"/>
${text(800, 540, 78, f.name, { family: 'Georgia', style: 'italic', fill: '#ffffff' })}
${text(800, 640, 30, 'has successfully completed the workshop', { fill: '#555' })}
${text(800, 710, 44, f.title, { weight: 'bold', fill: '#1d3557' })}
${text(800, 770, 28, `held on ${f.dateText}, Kuala Lumpur`, { fill: '#555' })}`,
    boxes: { name: lineBox(540, 78), title: lineBox(710, 44, 900), date: lineBox(770, 28, 700) },
    fonts: { name: { family: 'Georgia', style: 'italic', size: 78, fill: '#ffffff', y: 540 }, title: { weight: 'bold', size: 44, fill: '#1d3557', y: 710 }, date: { size: 28, fill: '#555', y: 770 } }
  })
};

const PEOPLE = ['Nur Aisyah Binti Rahman', 'Muhammad Hafiz Bin Ali', 'Lim Wei Jie', 'Priya Devi Ramasamy', 'Tan Mei Ling', 'Ahmad Faris Bin Zulkifli'];

const FIELDS = {
  hackathon: { title: 'UTM Digital Innovation Hackathon 2025', dateText: '14 March 2025', date: '2025-03-14', result: '1st Place', type: 'Hackathon', issuer: 'Universiti Teknologi Malaysia' },
  workshop: { title: 'Flutter Forward Workshop 2025', dateText: '5th July 2025', date: '2025-07-05', result: '', type: 'Workshop', issuer: 'Universiti Malaya' },
  ribbons: { title: 'Hack the Future Hackathon 2025', dateText: '14 September 2025', date: '2025-09-14', result: '2nd Place', type: 'Hackathon', issuer: 'Universiti Teknologi Malaysia', number: 'IEEE-UTM-2025-0412' },
  swoosh: { title: 'Cloud Security Seminar 2025', dateText: '22 April 2025', date: '2025-04-22', result: '', type: 'Seminar', issuer: 'Universiti Sains Malaysia' },
  banner: { title: 'Applied Machine Learning Bootcamp', dateText: '3 August 2025', date: '2025-08-03', result: '', type: 'Workshop', issuer: 'Universiti Malaya' }
};

const svgDoc = (inner) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${inner}</svg>`);

// ---------------------------------------------------------------------------
// Image operations
// ---------------------------------------------------------------------------
async function addSensorNoise(buffer, amount = 7, seed = 1) {
  const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let s = seed;
  const rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  for (let i = 0; i < data.length; i++) data[i] = Math.max(0, Math.min(255, data[i] + rand() * amount));
  return sharp(data, { raw: info }).png().toBuffer();
}

// Paste new text over a field on a background-coloured patch.
function patchSvg(box, newText, font, patchFill, { dx = 0, dy = 0, angle = 0 } = {}) {
  const [x0, y0, x1, y1] = box;
  const w = x1 - x0;
  const h = y1 - y0;
  const t = text(w / 2 + dx, font.y - y0 + dy, font.size, newText, { family: font.family, weight: font.weight, style: font.style, fill: font.fill });
  return {
    input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${patchFill}"/><g transform="rotate(${angle} ${w / 2} ${h / 2})">${t}</g></svg>`),
    left: x0,
    top: y0
  };
}

async function deskPhoto(buffer, angle = 8) {
  const SW = 2200;
  const SH = 1700;
  const desk = await sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SH}"><defs><filter id="w"><feTurbulence type="fractalNoise" baseFrequency="0.004 0.08" numOctaves="4" seed="3"/><feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.29  0 0 0 0 0.16  0 0 0 0.85 0"/></filter></defs><rect width="100%" height="100%" fill="#6b4423"/><rect width="100%" height="100%" filter="url(#w)"/></svg>`)
  ).png().toBuffer();
  const rotated = await sharp(buffer).rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const m = await sharp(rotated).metadata();
  return sharp(desk).composite([{ input: rotated, left: Math.round((SW - m.width) / 2), top: Math.round((SH - m.height) / 2) }]).jpeg({ quality: 88 }).toBuffer();
}

// ---------------------------------------------------------------------------
// Dataset
// ---------------------------------------------------------------------------
export async function generateDataset(outDir = OUT) {
  fs.mkdirSync(outDir, { recursive: true });
  const manifest = [];
  const write = async (file, buffer, entry) => {
    fs.writeFileSync(path.join(outDir, file), buffer);
    manifest.push({ file, ...entry });
  };
  const truth = (key, extra = {}) => {
    const f = FIELDS[key];
    return { title: f.title, date: f.date, result: f.result, type: f.type, issuer: f.issuer, ...extra };
  };

  let p = 0;
  for (const key of Object.keys(TEMPLATES)) {
    const holder = PEOPLE[p++ % PEOPLE.length];
    const other = PEOPLE[(p + 2) % PEOPLE.length];
    const fields = { ...FIELDS[key], name: holder };
    const tpl = TEMPLATES[key](fields);
    const lossless = await sharp(svgDoc(tpl.svg)).png().toBuffer();
    const digitalJpeg = await sharp(lossless).jpeg({ quality: 82 }).toBuffer();

    // --- Genuine ---------------------------------------------------------
    await write(`${key}_genuine.jpg`, digitalJpeg, { holder, category: 'genuine', kind: 'digital JPEG', expect: 'verified', fields: truth(key) });
    await write(`${key}_genuine.png`, lossless, { holder, category: 'genuine', kind: 'digital PNG', expect: 'verified', fields: truth(key) });
    const photo = await sharp(await addSensorNoise(lossless, 6, p)).blur(0.6).jpeg({ quality: 84 }).toBuffer();
    await write(`${key}_genuine_photo.jpg`, photo, { holder, category: 'genuine', kind: 'phone photo (flat, cropped)', expect: 'verified', fields: truth(key) });
    if (key === 'hackathon' || key === 'swoosh') {
      await write(`${key}_genuine_desk.jpg`, await deskPhoto(lossless, key === 'hackathon' ? 8 : -6), {
        holder,
        category: 'genuine',
        kind: 'photo on a desk (rotated)',
        expect: 'review',
        fields: truth(key)
      });
    }

    // --- Forgeries -------------------------------------------------------
    // The forger owns a genuine certificate issued to someone else and puts their own name on it.
    const original = TEMPLATES[key]({ ...FIELDS[key], name: other });
    const origLossless = await sharp(svgDoc(original.svg)).png().toBuffer();
    const origJpeg = await sharp(origLossless).jpeg({ quality: 75 }).toBuffer();
    const near = (hex) => {
      const n = parseInt(hex.slice(1), 16);
      const c = (v) => Math.max(0, Math.min(255, v - 5)).toString(16).padStart(2, '0');
      return `#${c(n >> 16)}${c((n >> 8) & 255)}${c(n & 255)}`;
    };
    const nameFill = key === 'banner' ? '#1d3557' : near(tpl.bg);

    // F1: name pasted onto the downloaded JPEG, re-saved (double compression).
    await write(`${key}_forged_name_resaved.jpg`, await sharp(origJpeg).composite([patchSvg(original.boxes.name, holder, original.fonts.name, nameFill)]).jpeg({ quality: 93 }).toBuffer(), {
      holder, category: 'forged', kind: 'edited name (JPEG re-saved)', expect: 'not-verified', fields: truth(key)
    });
    // F2: name pasted onto a lossless original, saved once (no compression trace).
    await write(`${key}_forged_name_onesave.jpg`, await sharp(origLossless).composite([patchSvg(original.boxes.name, holder, { ...original.fonts.name, family: 'Helvetica', style: 'normal' }, nameFill)]).jpeg({ quality: 88 }).toBuffer(), {
      holder, category: 'forged', kind: 'edited name (lossless edit, one save, different font)', expect: 'not-verified', fields: truth(key)
    });
    // F3: date changed on the holder's own certificate.
    const own = await sharp(lossless).jpeg({ quality: 75 }).toBuffer();
    const newDate = key === 'workshop' ? '19th July 2025' : '28 November 2025';
    await write(`${key}_forged_date.jpg`, await sharp(own).composite([patchSvg(tpl.boxes.date, original.fonts.date && tpl.boxes.date ? `${key === 'workshop' ? 'organised on' : key === 'swoosh' ? 'on' : 'held on'} ${newDate}` : newDate, tpl.fonts.date, near(tpl.bg))]).jpeg({ quality: 93 }).toBuffer(), {
      holder, category: 'forged', kind: 'edited date', expect: 'not-verified', fields: truth(key)
    });
    // F4: title (qualification) changed.
    await write(`${key}_forged_title.jpg`, await sharp(own).composite([patchSvg(tpl.boxes.title, 'National Robotics Championship 2025', tpl.fonts.title, near(tpl.bg))]).jpeg({ quality: 93 }).toBuffer(), {
      holder, category: 'forged', kind: 'edited title', expect: 'not-verified', fields: truth(key)
    });
    if (key === 'hackathon') {
      // F5: name pasted on a phone photo (patch has no sensor noise).
      const origPhoto = await sharp(await addSensorNoise(origLossless, 7, 9)).jpeg({ quality: 85 }).toBuffer();
      await write(`${key}_forged_name_photo.jpg`, await sharp(origPhoto).composite([patchSvg(original.boxes.name, holder, original.fonts.name, '#f9f8f4')]).jpeg({ quality: 85 }).toBuffer(), {
        holder, category: 'forged', kind: 'edited name on a photo (noise mismatch)', expect: 'not-verified', fields: truth(key)
      });
      // F6: name pasted tilted and off-centre.
      await write(`${key}_forged_name_tilted.jpg`, await sharp(origJpeg).composite([patchSvg(original.boxes.name, holder, original.fonts.name, nameFill, { dx: 120, angle: 3 })]).jpeg({ quality: 90 }).toBuffer(), {
        holder, category: 'forged', kind: 'edited name (tilted, off-centre)', expect: 'not-verified', fields: truth(key)
      });
      // F7: uploading somebody else's certificate unchanged (name mismatch).
      await write(`${key}_someone_else.jpg`, origJpeg, { holder, category: 'forged', kind: "someone else's certificate", expect: 'rejected', fields: truth(key) });
      // F8: AI-generated template content.
      const ai = TEMPLATES.hackathon({ ...FIELDS.hackathon, name: holder, title: 'Global Institute of Artificial Intelligence Award' });
      await write(`ai_template.jpg`, await sharp(svgDoc(ai.svg)).jpeg({ quality: 85 }).toBuffer(), { holder, category: 'forged', kind: 'AI-generated template content', expect: 'rejected', fields: {} });
      // Degraded uploads of a genuine certificate.
      await write(`${key}_blurry.jpg`, await sharp(lossless).blur(4).jpeg({ quality: 80 }).toBuffer(), { holder, category: 'degraded', kind: 'blurry photo', expect: 'inconclusive', fields: truth(key) });
      await write(`${key}_tiny.jpg`, await sharp(lossless).resize(300).jpeg({ quality: 70 }).toBuffer(), { holder, category: 'degraded', kind: 'tiny thumbnail', expect: 'inconclusive', fields: truth(key) });
      await write(`${key}_washed.jpg`, await sharp(lossless).linear(0.25, 180).jpeg().toBuffer(), { holder, category: 'degraded', kind: 'washed-out scan', expect: 'inconclusive', fields: truth(key) });
    }
    if (key === 'ribbons') {
      // F9: copied certificate — same certificate number as another student's genuine one.
      const copy = TEMPLATES.ribbons({ ...FIELDS.ribbons, name: other });
      await write(`${key}_copied_number.jpg`, await sharp(svgDoc(copy.svg)).jpeg({ quality: 85 }).toBuffer(), {
        holder: other,
        category: 'forged',
        kind: 'copied certificate (number already registered)',
        expect: 'not-verified',
        registryFrom: `${key}_genuine.jpg`,
        fields: truth(key)
      });
    }
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return { outDir, count: manifest.length, manifest };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { outDir, count } = await generateDataset();
  console.log(`Wrote ${count} labelled certificates to ${outDir}`);
}
