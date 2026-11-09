'use strict';

require('isomorphic-fetch');

const path    = require('path');
const fs      = require('fs');
const JSZip   = require('jszip');
const { Client: PgClient, types: pgTypes } = require('pg');

// Prisma sets timezone='UTC' on its connections and interprets TIMESTAMP WITHOUT TZ
// as UTC moments. The raw pg driver uses local-time constructor instead, which shifts
// days when the server is UTC+. Override the parser to match Prisma's behavior.
pgTypes.setTypeParser(1114, (val) => new Date(val.replace(' ', 'T') + 'Z'));
const ExcelJS = require('exceljs');

// ─── Injection de graphiques OOXML ────────────────────────────────────────────
// Même logique que src/lib/reports/excel-chart-injector.ts, portée en JS pur.

function _esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _trunc(s, max) { return s.length > max ? s.slice(0, max-1)+'…' : s; }
function _strLit(items) {
  const pts = items.map((v,i) => `<c:pt idx="${i}"><c:v>${_esc(v)}</c:v></c:pt>`).join('');
  return `<c:strLit><c:ptCount val="${items.length}"/>${pts}</c:strLit>`;
}
function _numLit(values, fmt='General') {
  const pts = values.map((v,i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('');
  return `<c:numLit><c:formatCode>${fmt}</c:formatCode><c:ptCount val="${values.length}"/>${pts}</c:numLit>`;
}
function _title(text) {
  return `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/>` +
    `<a:p><a:pPr><a:defRPr b="1" sz="1100"/></a:pPr>` +
    `<a:r><a:rPr lang="fr-FR" b="1"/><a:t>${_esc(text)}</a:t></a:r>` +
    `</a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
}
const _NS = `xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" ` +
  `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
  `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`;
function _chartSpace(body) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<c:chartSpace ${_NS}>\n<c:roundedCorners val="0"/>\n${body}\n` +
    `<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>` +
    `<a:ln><a:solidFill><a:srgbClr val="D9E1F2"/></a:solidFill></a:ln></c:spPr>\n` +
    `</c:chartSpace>`;
}
function _fill(hex) { return `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`; }

function _buildPieChart(ci) {
  const COLORS = ['4CAF50','FF9800','F44336'];
  const raw = [
    { l:'Jamais en retard',    v: ci.neverLate     },
    { l:'Parfois (1–3 jours)', v: ci.sometimesLate },
    { l:'Souvent (> 3 jours)', v: ci.oftenLate     },
  ].filter(x => x.v > 0);
  if (!raw.length) raw.push({ l:'Aucun retard', v:1 });
  const dpt = raw.map((x,i) =>
    `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/>` +
    `<c:spPr>${_fill(COLORS[i]??'9E9E9E')}</c:spPr></c:dPt>`).join('');
  const dLbls = `<c:dLbls><c:spPr><a:noFill/></c:spPr>` +
    `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr b="1" sz="900"/></a:pPr></a:p></c:txPr>` +
    `<c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/>` +
    `<c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/></c:dLbls>`;
  const ser = `<c:ser><c:idx val="0"/><c:order val="0"/>${dpt}${dLbls}` +
    `<c:cat>${_strLit(raw.map(x=>x.l))}</c:cat>` +
    `<c:val>${_numLit(raw.map(x=>x.v))}</c:val></c:ser>`;
  return _chartSpace(
    `<c:chart>${_title('Répartition de la ponctualité')}` +
    `<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>` +
    `<c:pieChart><c:varyColors val="1"/>${ser}<c:firstSliceAng val="0"/></c:pieChart>` +
    `</c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>` +
    `<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>`);
}

function _buildBarChart(ci) {
  const items = [...ci.punctualityRanking.slice(0,10)].reverse();
  const names = items.map(e => _trunc(e.name, 22));
  const rates = items.map(e => parseFloat((e.rate/100).toFixed(4)));
  const ser = `<c:ser><c:idx val="0"/><c:order val="0"/>` +
    `<c:spPr>${_fill('4472C4')}</c:spPr>` +
    `<c:cat>${_strLit(names)}</c:cat><c:val>${_numLit(rates,'0%')}</c:val></c:ser>`;
  const axes =
    `<c:catAx><c:axId val="2001"/><c:scaling><c:orientation val="minMax"/></c:scaling>` +
    `<c:delete val="0"/><c:axPos val="l"/><c:numFmt formatCode="General" sourceLinked="0"/>` +
    `<c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>` +
    `<c:crossAx val="2002"/><c:crosses val="autoZero"/></c:catAx>` +
    `<c:valAx><c:axId val="2002"/><c:scaling><c:orientation val="minMax"/></c:scaling>` +
    `<c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="0%" sourceLinked="0"/>` +
    `<c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>` +
    `<c:crossAx val="2001"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;
  return _chartSpace(
    `<c:chart>${_title('Taux de ponctualité par employé')}` +
    `<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>` +
    `<c:barChart><c:barDir val="bar"/><c:grouping val="clustered"/><c:varyColors val="0"/>` +
    `${ser}<c:axId val="2001"/><c:axId val="2002"/></c:barChart>${axes}</c:plotArea>` +
    `<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>` +
    `<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>`);
}

function _buildColumnChart(ci) {
  if (!ci.lateRanking.length) return _buildPieChart(ci);
  const items = ci.lateRanking.slice(0,5);
  const names  = items.map(e => _trunc(e.name, 18));
  const values = items.map(e => Math.round(e.totalLateMin));
  const ser = `<c:ser><c:idx val="0"/><c:order val="0"/>` +
    `<c:spPr>${_fill('C0392B')}</c:spPr>` +
    `<c:cat>${_strLit(names)}</c:cat><c:val>${_numLit(values,'0')}</c:val></c:ser>`;
  const axes =
    `<c:catAx><c:axId val="3001"/><c:scaling><c:orientation val="minMax"/></c:scaling>` +
    `<c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="0"/>` +
    `<c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>` +
    `<c:crossAx val="3002"/><c:crosses val="autoZero"/></c:catAx>` +
    `<c:valAx><c:axId val="3002"/><c:scaling><c:orientation val="minMax"/></c:scaling>` +
    `<c:delete val="0"/><c:axPos val="l"/><c:numFmt formatCode="0" sourceLinked="0"/>` +
    `<c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>` +
    `<c:crossAx val="3001"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;
  return _chartSpace(
    `<c:chart>${_title('Top 5 — Retards cumulés (min)')}` +
    `<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>` +
    `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>` +
    `${ser}<c:axId val="3001"/><c:axId val="3002"/></c:barChart>${axes}</c:plotArea>` +
    `<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>` +
    `<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>`);
}

function _anchor(id, name, rId, fc, fr, tc, tr) {
  return `<xdr:twoCellAnchor moveWithCells="0" sizeWithCells="0">` +
    `<xdr:from><xdr:col>${fc}</xdr:col><xdr:colOff>0</xdr:colOff>` +
    `<xdr:row>${fr}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
    `<xdr:to><xdr:col>${tc}</xdr:col><xdr:colOff>0</xdr:colOff>` +
    `<xdr:row>${tr}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
    `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr>` +
    `<xdr:cNvPr id="${id}" name="${name}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>` +
    `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic>` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">` +
    `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="${rId}"/>` +
    `</a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
}

const _DRAWING_NS =
  `xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" ` +
  `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
  `xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" ` +
  `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`;
const _CHART_T = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart';
const _DRAW_T  = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing';
const _REL_NS  = `xmlns="http://schemas.openxmlformats.org/package/2006/relationships"`;

async function injectCharts(buffer, ci) {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const wbXml  = await zip.file('xl/workbook.xml').async('text');
    const sheets  = wbXml.match(/<sheet [^/]+\/>/g) ?? [];
    const target  = sheets.find(s => s.includes('📊 Synthèse RH') || s.includes('Synthèse RH'));
    if (!target) return buffer;
    const rIdM = target.match(/r:id="(rId\d+)"/);
    if (!rIdM) return buffer;
    const sheetRId = rIdM[1];

    const wbRels  = await zip.file('xl/_rels/workbook.xml.rels').async('text');
    const relM    = wbRels.match(new RegExp(`Id="${sheetRId}"[^>]*Target="([^"]+)"`));
    if (!relM) return buffer;
    const sheetTarget  = relM[1].replace(/^(\.\/|\/+)/, '');
    const sheetFile    = `xl/${sheetTarget}`;
    const sheetBase    = sheetFile.split('/').pop();
    const sheetRelsPath = `xl/worksheets/_rels/${sheetBase}.rels`;

    zip.file('xl/charts/chart1.xml', _buildPieChart(ci));
    zip.file('xl/charts/chart2.xml', _buildBarChart(ci));
    zip.file('xl/charts/chart3.xml', _buildColumnChart(ci));
    const emptyRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships ${_REL_NS}/>`;
    zip.file('xl/charts/_rels/chart1.xml.rels', emptyRels);
    zip.file('xl/charts/_rels/chart2.xml.rels', emptyRels);
    zip.file('xl/charts/_rels/chart3.xml.rels', emptyRels);

    const drawing = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<xdr:wsDr ${_DRAWING_NS}>\n` +
      _anchor(2,'Chart Ponctualité','rId1', 9, 1, 17, 18) + '\n' +
      _anchor(3,'Chart Employés',   'rId2', 9, 20, 17, 39) + '\n' +
      _anchor(4,'Chart Retards',    'rId3', 9, 41, 17, 56) + '\n' +
      `</xdr:wsDr>`;
    zip.file('xl/drawings/drawing1.xml', drawing);
    zip.file('xl/drawings/_rels/drawing1.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships ${_REL_NS}>` +
      `<Relationship Id="rId1" Type="${_CHART_T}" Target="../charts/chart1.xml"/>` +
      `<Relationship Id="rId2" Type="${_CHART_T}" Target="../charts/chart2.xml"/>` +
      `<Relationship Id="rId3" Type="${_CHART_T}" Target="../charts/chart3.xml"/>` +
      `</Relationships>`);

    let sheetXml = await zip.file(sheetFile).async('text');
    if (!sheetXml.includes('<drawing ')) {
      sheetXml = sheetXml.replace('</worksheet>', '<drawing r:id="rId_draw1"/></worksheet>');
      zip.file(sheetFile, sheetXml);
    }

    const drawRel = `<Relationship Id="rId_draw1" Type="${_DRAW_T}" Target="../drawings/drawing1.xml"/>`;
    const existingRels = zip.file(sheetRelsPath);
    if (existingRels) {
      let relsXml = await existingRels.async('text');
      if (!relsXml.includes('drawing1.xml')) {
        zip.file(sheetRelsPath, relsXml.replace('</Relationships>', drawRel + '</Relationships>'));
      }
    } else {
      zip.file(sheetRelsPath,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<Relationships ${_REL_NS}>${drawRel}</Relationships>`);
    }

    let ctXml = await zip.file('[Content_Types].xml').async('text');
    if (!ctXml.includes('chart1.xml')) {
      const additions =
        `<Override PartName="/xl/drawings/drawing1.xml" ` +
        `ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` +
        `<Override PartName="/xl/charts/chart1.xml" ` +
        `ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>` +
        `<Override PartName="/xl/charts/chart2.xml" ` +
        `ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>` +
        `<Override PartName="/xl/charts/chart3.xml" ` +
        `ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`;
      zip.file('[Content_Types].xml', ctXml.replace('</Types>', additions + '</Types>'));
    }

    return await zip.generateAsync({ type:'nodebuffer', compression:'DEFLATE', compressionOptions:{ level:6 } });
  } catch (err) {
    console.warn('[chart-injector] Injection échouée, buffer original retourné :', err.message);
    return buffer;
  }
}

// ─── Charger le .env ─────────────────────────────────────────────────────────
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
    const m = line.match(/^([^#=\s][^=]*?)=(.*)$/);
    if (m && !process.env[m[1]]) {
      let val = m[2].trim();
      if (/^["'].*["']$/.test(val)) val = val.slice(1, -1);
      process.env[m[1]] = val;
    }
  });
}

// ─── Config ───────────────────────────────────────────────────────────────────
const DESTINATAIRE = 'p.wilfrand@elitenetwork.pro';
const DRY_RUN      = !process.argv.includes('--envoyer');

// FIX #1 : chaînes ISO pures (pas de Date object) → pas de décalage UTC dans les requêtes SQL
const PERIODES = [
  {
    label:    'Mars 2026',
    fromStr:  '2026-03-01',
    toStr:    '2026-03-31',
    filename: 'rapport-mars-2026.xlsx',
  },
  {
    label:    'Avril 2026',
    fromStr:  '2026-04-01',
    toStr:    '2026-04-30',
    filename: 'rapport-avril-2026.xlsx',
  },
  {
    label:    'Mai 2026',
    fromStr:  '2026-05-01',
    toStr:    '2026-05-31',
    filename: 'rapport-mai-2026.xlsx',
  },
];

// ─── Couleurs console ─────────────────────────────────────────────────────────
const C = {
  reset:'\x1b[0m', bold:'\x1b[1m', dim:'\x1b[2m',
  red:'\x1b[31m', green:'\x1b[32m', yellow:'\x1b[33m', cyan:'\x1b[36m',
};
const c = (col, t) => `${C[col]}${t}${C.reset}`;

// ─── Crypto ───────────────────────────────────────────────────────────────────
const IV_LEN = 12, TAG_LEN = 16;
function decrypt(value) {
  if (!value) return value;
  const key = process.env.ENCRYPTION_KEY;
  if (!key) return value;
  try {
    const buf = Buffer.from(value, 'base64');
    if (buf.length < IV_LEN + TAG_LEN + 1) return value;
    const iv  = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ct  = buf.subarray(IV_LEN + TAG_LEN);
    const dec = require('crypto').createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
    dec.setAuthTag(tag);
    return Buffer.concat([dec.update(ct), dec.final()]).toString('utf8');
  } catch { return value; }
}
function decryptUser(u) {
  return { ...u,
    email:      decrypt(u.email),
    username:   decrypt(u.username),
    firstname:  decrypt(u.firstname),
    lastname:   decrypt(u.lastname),
    department: decrypt(u.department),
    position:   decrypt(u.position),
  };
}
function decryptPointage(p) {
  return { ...p,
    entryTime:       decrypt(p.entryTime  ?? p.entrytime),
    exitTime:        decrypt(p.exitTime   ?? p.exittime),
    lateReason:      decrypt(p.lateReason ?? p.latereason),
    earlyExitReason: decrypt(p.earlyExitReason ?? p.earlyexitreason),
  };
}

// ─── Seuils dynamiques (FIX #2 : chargés depuis SystemSettings en BDD) ───────
let LATE_THRESHOLD     = 8 * 60 + 45;   // fallback 08h45
let OVERTIME_THRESHOLD = 17 * 60 + 30;  // fallback 17h30

function parseHM(timeStr) {
  const parts = (timeStr || '').split(':').map(Number);
  if (parts.length < 2 || parts.some(isNaN)) return 0;
  return parts[0] * 60 + parts[1];
}

function toMin(timeStr) {
  if (!timeStr || timeStr === '—') return null;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

// FIX #4 : overtime aussi exclu le week-end
function compute(entryTime, exitTime, date) {
  const entry = toMin(entryTime);
  const exit  = toMin(exitTime);
  const isWeekend = date ? (date.getDay() === 0 || date.getDay() === 6) : false;
  let lateMinutes = 0, overtimeMinutes = 0;
  if (entry !== null && !isWeekend && entry > LATE_THRESHOLD)
    lateMinutes = entry - LATE_THRESHOLD;
  if (exit !== null && !isWeekend && exit > OVERTIME_THRESHOLD)
    overtimeMinutes = exit - OVERTIME_THRESHOLD;
  return { lateMinutes, overtimeMinutes };
}

function fmtMin(min) {
  if (!min || min <= 0) return '—';
  const h = Math.floor(min / 60), m = min % 60;
  return `${h}h${String(m).padStart(2,'0')}`;
}

// ─── Helpers date ─────────────────────────────────────────────────────────────
function toLocalDateStr(d) {
  const date = d instanceof Date ? d : new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function localDateFromStr(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
const JOURS_FR = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
function formatDateLabel(date) {
  const j = String(date.getDate()).padStart(2,'0');
  const m = String(date.getMonth()+1).padStart(2,'0');
  return `${JOURS_FR[date.getDay()]} ${j}/${m}/${date.getFullYear()}`;
}
function getMondayKey(date) {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return toLocalDateStr(d);
}

// ─── Regroupement par jour ────────────────────────────────────────────────────
function groupByDay(users, pointages, breaks) {
  const allDates = new Set();
  pointages.forEach(p => allDates.add(toLocalDateStr(p.date)));

  const days = [];
  for (const dayStr of Array.from(allDates).sort()) {
    const date = localDateFromStr(dayStr);
    if (date.getDay() === 0) continue;
    const dateLabel = formatDateLabel(date);

    const employees = [];
    for (const u of users) {
      const userPts = pointages
        .filter(p => p.userId === u.id && toLocalDateStr(p.date) === dayStr)
        .sort((a, b) => (a.sessionNumber || 1) - (b.sessionNumber || 1));

      if (userPts.length === 0) continue;

      const userBreaks = breaks.filter(b =>
        b.userId === u.id && toLocalDateStr(b.date) === dayStr
      );
      const totalBreakMin = userBreaks.reduce((s, b) => s + (b.duration || 0), 0);

      const first = userPts[0];
      const last  = userPts[userPts.length - 1];

      const isIncomplete  = userPts.every(p => !p.exitTime && !p.isActive && p.status === 'incomplete');
      const isAdminClosed = !isIncomplete && userPts.some(p => p.status === 'admin_closed');

      // FIX #3 : somme des durées DB par session (correct pour multi-pointage)
      // La formule Excel exit-entry comptait les pauses inter-sessions comme du travail
      const totalWorkMin = isIncomplete ? 0 : userPts.reduce((s, p) => s + (p.duration || 0), 0);

      const { lateMinutes, overtimeMinutes } = compute(
        first.entryTime || null,
        isIncomplete ? null : (last.exitTime || null),
        date,
      );

      // Dédupliquer par sessionNumber : plusieurs enregistrements pour un même
      // numéro de session (corrections ou doublons BDD) ne doivent apparaître
      // qu'une seule fois dans les observations.
      const sessionMap = new Map();
      userPts.forEach(p => sessionMap.set(p.sessionNumber || 1, p));
      const uniqueSessions = Array.from(sessionMap.values())
        .sort((a, b) => (a.sessionNumber || 1) - (b.sessionNumber || 1));

      const sessionDetails = uniqueSessions.length > 1
        ? uniqueSessions.map(p => `S${p.sessionNumber}: ${p.entryTime || '?'}→${p.exitTime || '?'}`).join(', ')
        : null;

      employees.push({
        id:           u.id,
        fullName:     `${u.firstname || ''} ${u.lastname || ''}`.trim(),
        position:     u.position || u.department || '—',
        checkIn:      first.entryTime || '—',
        checkOut:     isIncomplete ? 'Départ non pointé' : (last.exitTime || '—'),
        sessionCount: uniqueSessions.length,
        sessionDetails,
        lateReason:      [...new Set(userPts.map(p => p.lateReason).filter(Boolean))].join(' | '),
        earlyExitReason: [...new Set(userPts.map(p => p.earlyExitReason).filter(Boolean))].join(' | '),
        computation: {
          workMinutes:     totalWorkMin,
          breakMinutes:    totalBreakMin,
          lateMinutes,
          overtimeMinutes,
        },
        status: isIncomplete ? 'incomplete' : isAdminClosed ? 'admin_closed' : 'present',
      });
    }

    if (employees.length > 0) days.push({ date, dateLabel, employees });
  }
  return days;
}

// ─── Génération Excel ─────────────────────────────────────────────────────────
function isWeekendDate(date) { const d = date.getDay(); return d === 0 || d === 6; }

function timeStrToFraction(s) {
  if (!s || s === '—' || !s.includes(':')) return null;
  const [h, m] = s.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return (h * 60 + m) / 1440;
}

const borderStyle = {
  top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'}
};
const headerFont = { name:'Calibri', size:11, bold:true, color:{argb:'FFFFFFFF'} };
const dataFont   = { name:'Calibri', size:11 };

// ─── Tri par ponctualité d'arrivée ────────────────────────────────────────────
//   Ordre : présent ponctuel → léger retard → gros retard → incomplet
//   À statut égal : heure croissante, puis nom alphabétique.

const STATUS_SORT = { present:0, admin_closed:0, incomplete:1 };

function sortEmployees(emps) {
  function toMin(s) {
    if (!s || s === '—') return 9999;
    const [h, m] = s.split(':').map(Number);
    return isNaN(h) || isNaN(m) ? 9999 : h * 60 + m;
  }
  return [...emps].sort((a, b) => {
    const pa = STATUS_SORT[a.status] ?? 2, pb = STATUS_SORT[b.status] ?? 2;
    if (pa !== pb) return pa - pb;
    const da = toMin(a.checkIn), db = toMin(b.checkIn);
    if (da !== db) return da - db;
    return (a.fullName ?? '').localeCompare(b.fullName ?? '', 'fr');
  });
}

// ─── Couleur sémantique par ligne ─────────────────────────────────────────────

function getEmpColor(emp) {
  if (emp.status === 'incomplete')       return 'FFFFF2CC'; // jaune
  const late = emp.computation.lateMinutes || 0;
  if (late === 0)                        return 'FFE2EFDA'; // vert   — ponctuel
  if (late <= 15)                        return 'FFFCE4D6'; // orange — léger retard
  return                                        'FFFFB3B3'; // rouge  — gros retard
}

// ─── Feuille Synthèse RH ──────────────────────────────────────────────────────

function populateSummarySheet(ws, periodLabel, empStats) {
  ws.columns = [
    { width:8 }, { width:36 }, { width:28 },
    { width:16 }, { width:16 }, { width:16 },
    { width:16 }, { width:16 }, { width:16 },
  ];

  function applyCell(row, col, value, bgArgb, align = 'center', bold = false) {
    const cell = ws.getCell(row, col);
    cell.value = value;
    cell.font  = { name:'Calibri', size:11, bold };
    cell.fill  = { type:'pattern', pattern:'solid', fgColor:{ argb: bgArgb } };
    cell.alignment = { horizontal: align, vertical:'middle' };
    cell.border = borderStyle;
  }

  function sectionHeader(row, text, cols, bgArgb) {
    ws.mergeCells(row, 1, row, cols);
    const cell = ws.getCell(row, 1);
    cell.value = text;
    cell.font  = { name:'Calibri', size:12, bold:true, color:{ argb:'FFFFFFFF' } };
    cell.fill  = { type:'pattern', pattern:'solid', fgColor:{ argb: bgArgb } };
    cell.alignment = { horizontal:'left', vertical:'middle', indent:1 };
    ws.getRow(row).height = 26;
  }

  function tableHeaders(row, headers, nbCols) {
    const r = ws.getRow(row);
    r.height = 36;
    headers.forEach((h, i) => {
      const cell = r.getCell(i + 1);
      cell.value = h;
      cell.font  = headerFont;
      cell.fill  = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF4472C4' } };
      cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
      cell.border = borderStyle;
    });
    ws.autoFilter = { from:{ row, column:1 }, to:{ row, column:nbCols } };
  }

  // Titre
  ws.mergeCells('B2:I5');
  const tc = ws.getCell('B2');
  tc.value = `Synthèse RH — ${periodLabel}`;
  tc.font  = { name:'Calibri', size:16, bold:true, color:{ argb:'FFFFFFFF' } };
  tc.fill  = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF4472C4' } };
  tc.alignment = { horizontal:'center', vertical:'middle' };
  ws.getRow(2).height = 20;
  ws.getRow(5).height = 20;

  // Stats globales
  const entries = Array.from(empStats.values());
  const totPres  = entries.reduce((s, e) => s + e.daysPresent, 0);
  const totLate  = entries.reduce((s, e) => s + e.daysLate, 0);
  const totLateM = entries.reduce((s, e) => s + e.totalLateMinutes, 0);
  const totWorkM = entries.reduce((s, e) => s + e.totalWorkMinutes, 0);
  const globalPct = totPres > 0
    ? ((totPres - totLate) / totPres * 100).toFixed(1) : '100.0';
  const avgLate = totLate > 0 ? Math.round(totLateM / totLate) : 0;
  const avgWork = totPres > 0 ? Math.round(totWorkM / totPres) : 0;

  let r = 7;
  sectionHeader(r, '📊  Indicateurs globaux de la période', 9, 'FF2E4E7A'); r++;

  [
    ["👥  Nombre d'employés actifs",            String(entries.length)],
    ['✅  Taux global de ponctualité',           `${globalPct} %`],
    ['⚠️  Retard moyen (sur jours en retard)',  fmtMin(avgLate)],
    ['🕐  Moyenne heures travaillées / jour',   fmtMin(avgWork)],
  ].forEach(([label, value], i) => {
    const bg = i % 2 === 0 ? 'FFEEF2FA' : 'FFFFFFFF';
    ws.getRow(r).height = 22;
    ws.mergeCells(r, 1, r, 6);
    applyCell(r, 1, label, bg, 'left');
    ws.mergeCells(r, 7, r, 9);
    applyCell(r, 7, value, bg, 'right', true);
    r++;
  });

  r += 2;

  // Classements
  const computed = Array.from(empStats.entries()).map(([id, s]) => ({
    id,
    fullName:             s.fullName,
    position:             s.position,
    daysPresent:          s.daysPresent,
    daysLate:             s.daysLate,
    totalLateMinutes:     s.totalLateMinutes,
    totalOvertimeMinutes: s.totalOvertimeMinutes,
    totalWorkMinutes:     s.totalWorkMinutes,
    punctualityRate: s.daysPresent > 0 ? (s.daysPresent - s.daysLate) / s.daysPresent : 1,
    avgWorkMin: s.daysPresent > 0 ? Math.round(s.totalWorkMinutes / s.daysPresent) : 0,
    avgLateMin: s.daysLate    > 0 ? Math.round(s.totalLateMinutes  / s.daysLate)   : 0,
  }));

  const byPunctuality = [...computed].sort((a, b) =>
    b.punctualityRate - a.punctualityRate || b.daysPresent - a.daysPresent ||
    a.fullName.localeCompare(b.fullName, 'fr'));
  const byLate = [...computed].filter(e => e.daysLate > 0)
    .sort((a, b) => b.totalLateMinutes - a.totalLateMinutes || b.daysLate - a.daysLate);
  const byOvertime = [...computed].filter(e => e.totalOvertimeMinutes > 0)
    .sort((a, b) => b.totalOvertimeMinutes - a.totalOvertimeMinutes);

  const n5 = Math.min(5, computed.length);
  const top5PunctualIds = new Set(byPunctuality.slice(0, n5).map(e => e.id));
  const top5LateIds     = new Set(byLate.slice(0, n5).map(e => e.id));

  // Classement général ponctualité
  sectionHeader(r, '🏆  Classement général — Ponctualité', 9, 'FF2E4E7A'); r++;
  tableHeaders(r, [
    'Rang','Employé','Service','Jours présents',
    'Jours retard','Ponctualité','Retard moy.','H.Sup total','Moy. H.Trav',
  ], 9);
  r++;

  const rankingStart = r;
  byPunctuality.forEach((emp, idx) => {
    ws.getRow(r).height = 20;
    const bg = top5PunctualIds.has(emp.id) ? 'FFE2EFDA'
             : top5LateIds.has(emp.id)     ? 'FFFFCCCC'
             : idx % 2 === 0               ? 'FFEEF2FA' : 'FFFFFFFF';
    [
      [idx + 1,                                                   'center'],
      [emp.fullName,                                              'left'  ],
      [emp.position,                                              'left'  ],
      [emp.daysPresent,                                           'center'],
      [emp.daysLate,                                              'center'],
      [`${(emp.punctualityRate * 100).toFixed(1)} %`,             'center'],
      [emp.avgLateMin > 0 ? fmtMin(emp.avgLateMin) : '—',        'center'],
      [emp.totalOvertimeMinutes > 0 ? fmtMin(emp.totalOvertimeMinutes) : '—', 'center'],
      [fmtMin(emp.avgWorkMin),                                    'center'],
    ].forEach(([val, align], i) => applyCell(r, i + 1, val, bg, align));
    r++;
  });

  // Légende
  ws.getRow(r).height = 18;
  [['FFE2EFDA','🟢 Top 5 Ponctualité'], ['FFFFCCCC','🔴 Top 5 Retards cumulés']]
    .forEach(([bg, text], i) => {
      const cell = ws.getCell(r, i * 4 + 1);
      cell.value = text;
      cell.font  = { name:'Calibri', size:9, italic:true };
      cell.fill  = { type:'pattern', pattern:'solid', fgColor:{ argb: bg } };
    });
  r += 2;

  // Top 5 Retards
  if (byLate.length > 0) {
    sectionHeader(r, '⚠️  Top 5 — Employés les plus en retard', 6, 'FF7B0C0C'); r++;
    tableHeaders(r, ['Rang','Employé','Service','Jours retard','Retard total','Retard moy.'], 6); r++;
    byLate.slice(0, 5).forEach((emp, idx) => {
      ws.getRow(r).height = 20;
      [[idx+1,'center'],[emp.fullName,'left'],[emp.position,'left'],
       [emp.daysLate,'center'],[fmtMin(emp.totalLateMinutes),'center'],[fmtMin(emp.avgLateMin),'center']]
        .forEach(([val, align], i) => applyCell(r, i+1, val, 'FFFFCCCC', align));
      r++;
    });
    r += 2;
  }

  // Top 5 Heures Sup
  if (byOvertime.length > 0) {
    sectionHeader(r, '⏰  Top 5 — Heures supplémentaires', 5, 'FF1F5C99'); r++;
    tableHeaders(r, ['Rang','Employé','Service','H.Sup total','Jours présents'], 5); r++;
    byOvertime.slice(0, 5).forEach((emp, idx) => {
      ws.getRow(r).height = 20;
      [[idx+1,'center'],[emp.fullName,'left'],[emp.position,'left'],
       [fmtMin(emp.totalOvertimeMinutes),'center'],[emp.daysPresent,'center']]
        .forEach(([val, align], i) => applyCell(r, i+1, val, 'FFDDEEFF', align));
      r++;
    });
  }

  ws.views = [{
    state:'frozen', xSplit:0, ySplit: rankingStart - 1,
    topLeftCell:`A${rankingStart}`, activeCell:'A1',
  }];
}

async function generateExcel(periodLabel, days) {
  const empStats = new Map();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EliteTime';
  wb.created = new Date();

  // Synthèse RH en premier onglet (actif à l'ouverture du fichier)
  const summaryWs = wb.addWorksheet('📊 Synthèse RH');

  const weeksMap = new Map();
  days.forEach(day => {
    const key = getMondayKey(day.date);
    if (!weeksMap.has(key)) weeksMap.set(key, { days: [] });
    weeksMap.get(key).days.push(day);
  });
  const sortedWeekKeys = Array.from(weeksMap.keys()).sort();
  sortedWeekKeys.forEach((key, i) => { weeksMap.get(key).label = `Semaine ${i + 1}`; });

  for (const key of sortedWeekKeys) {
    const wkData = weeksMap.get(key);
    const ws = wb.addWorksheet(wkData.label);

    ws.columns = [
      { key:'no',          width: 6  },
      { key:'date',        width: 24 },
      { key:'nom',         width: 40 },
      { key:'fonction',    width: 35 },
      { key:'arrivee',     width: 16 },
      { key:'depart',      width: 16 },
      { key:'travaillees', width: 18 },
      { key:'retard_min',  width: 22 },
      { key:'retard_bool', width: 10 },
      { key:'supp',        width: 22 },
      { key:'statut',      width: 18 },
      { key:'obs',         width: 45 },
    ];

    ws.mergeCells('D2:H5');
    const titleCell = ws.getCell('D2');
    titleCell.value = `Heures employés — Période : ${periodLabel} (${wkData.label})`;
    titleCell.font  = { name:'Comic Sans MS', size:11, bold:true };
    titleCell.alignment = { horizontal:'center', vertical:'middle' };
    titleCell.fill  = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFD9E1F2' } };

    const headerRow = ws.getRow(7);
    headerRow.height = 40;
    [
      'N°','Date','Noms et prénoms','Fonction/Service',
      "Heure d'arrivée",'Heure de départ','Heures travaillées',
      'Durée du retard ( En minutes )','Retard',
      'Heures supplémentaires','Statut administratif','Observations'
    ].forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font  = headerFont;
      cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
      cell.fill  = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF4472C4' } };
      cell.border = borderStyle;
    });

    let row = 8;
    for (const day of wkData.days) {
      const wkd = isWeekendDate(day.date);

      // Tri intelligent : ponctuels → légers retards → gros retards → incomplets
      const sortedEmps = sortEmployees(day.employees);

      sortedEmps.forEach((emp, idx) => {
        // Accumulation des stats RH
        if (!empStats.has(emp.id)) {
          empStats.set(emp.id, {
            fullName: emp.fullName, position: emp.position,
            daysPresent:0, daysLate:0, daysIncomplete:0,
            totalLateMinutes:0, totalOvertimeMinutes:0, totalWorkMinutes:0,
          });
        }
        const st = empStats.get(emp.id);
        st.daysPresent++;
        if (emp.computation.lateMinutes > 0) st.daysLate++;
        if (emp.status === 'incomplete') st.daysIncomplete++;
        st.totalLateMinutes     += emp.computation.lateMinutes;
        st.totalOvertimeMinutes += emp.computation.overtimeMinutes;
        st.totalWorkMinutes     += emp.computation.workMinutes;

        // Couleur sémantique (remplace l'alternance neutre)
        const bg  = getEmpColor(emp);
        const wr  = ws.getRow(row);
        wr.height = 20;

        wr.getCell(1).value = idx + 1;
        wr.getCell(2).value = formatDateLabel(day.date);
        wr.getCell(2).font  = { ...dataFont, bold:true, italic:true };
        wr.getCell(3).value = emp.fullName;
        wr.getCell(4).value = emp.position;

        const arrivee = timeStrToFraction(emp.checkIn);
        const depart  = emp.status === 'incomplete' ? null : timeStrToFraction(emp.checkOut);
        const e5 = wr.getCell(5); e5.value = arrivee; e5.numFmt = 'hh:mm';
        const e6 = wr.getCell(6); e6.value = depart;  e6.numFmt = 'hh:mm';

        const workFraction = emp.computation.workMinutes > 0
          ? emp.computation.workMinutes / 1440 : null;
        wr.getCell(7).value  = workFraction;
        wr.getCell(7).numFmt = '[h]:mm';

        wr.getCell(8).value  = wkd ? 0 : emp.computation.lateMinutes;
        wr.getCell(8).numFmt = '0';
        wr.getCell(9).value  = (!wkd && emp.computation.lateMinutes > 0) ? 'Oui' : 'Non';

        const overtimeFraction = (!wkd && emp.computation.overtimeMinutes > 0)
          ? emp.computation.overtimeMinutes / 1440 : null;
        wr.getCell(10).value  = overtimeFraction;
        wr.getCell(10).numFmt = '[h]:mm';

        wr.getCell(11).value =
          emp.status === 'present'      ? 'Présent' :
          emp.status === 'incomplete'   ? 'Incomplet' :
          emp.status === 'admin_closed' ? 'Clôturé admin' : 'Absent';

        wr.getCell(12).value = [
          emp.sessionDetails,
          emp.lateReason,
          emp.earlyExitReason,
          emp.status === 'incomplete'   ? 'Départ non pointé'          : null,
          emp.status === 'admin_closed' ? 'Sortie clôturée par admin'  : null,
        ].filter(Boolean).join(' | ');

        for (let col = 1; col <= 12; col++) {
          const cell = wr.getCell(col);
          if (!cell.font) cell.font = dataFont;
          cell.alignment = { horizontal:'center', vertical:'middle' };
          cell.border = borderStyle;
          cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb: bg } };
        }
        // Alignement gauche pour nom et poste
        wr.getCell(3).alignment = { horizontal:'left', vertical:'middle' };
        wr.getCell(4).alignment = { horizontal:'left', vertical:'middle' };

        row++;
      });

      ws.mergeCells(`A${row}:L${row}`);
      ws.getRow(row).height = 6;
      ws.getCell(`A${row}`).fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFD6DCE4' } };
      row++;
    }

    // Filtre automatique + gel de la ligne d'en-tête
    ws.autoFilter = 'A7:L7';
    ws.views = [{ state:'frozen', xSplit:0, ySplit:7, topLeftCell:'A8', activeCell:'A8' }];
  }

  // Remplissage de la feuille Synthèse RH (créée en premier onglet)
  populateSummarySheet(summaryWs, periodLabel, empStats);

  const rawBuffer = Buffer.from(await wb.xlsx.writeBuffer());

  // Injection des graphiques Excel via JSZip
  const statsArr  = Array.from(empStats.values());
  const allComp   = Array.from(empStats.entries()).map(([,s]) => ({
    fullName:         s.fullName,
    daysLate:         s.daysLate,
    totalLateMinutes: s.totalLateMinutes,
    punctualityRate:  s.daysPresent > 0 ? (s.daysPresent - s.daysLate) / s.daysPresent : 1,
  }));

  const chartInput = {
    neverLate:     statsArr.filter(s => s.daysLate === 0).length,
    sometimesLate: statsArr.filter(s => s.daysLate >= 1 && s.daysLate <= 3).length,
    oftenLate:     statsArr.filter(s => s.daysLate > 3).length,
    punctualityRanking: [...allComp]
      .sort((a,b) => b.punctualityRate - a.punctualityRate)
      .slice(0, 10)
      .map(e => ({ name: e.fullName, rate: parseFloat((e.punctualityRate*100).toFixed(1)) })),
    lateRanking: allComp
      .filter(e => e.daysLate > 0)
      .sort((a,b) => b.totalLateMinutes - a.totalLateMinutes)
      .slice(0, 5)
      .map(e => ({ name: e.fullName, totalLateMin: e.totalLateMinutes })),
  };

  return injectCharts(rawBuffer, chartInput);
}

// ─── Envoi via Microsoft Graph API ───────────────────────────────────────────
async function getGraphToken() {
  const { tenantId, clientId, clientSecret } = {
    tenantId:     process.env.AZURE_TENANT_ID,
    clientId:     process.env.AZURE_CLIENT_ID,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
  };
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Variables Azure manquantes dans .env (AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET)');
  }
  const url  = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id:     clientId,
    client_secret: clientSecret,
    scope:         'https://graph.microsoft.com/.default',
    grant_type:    'client_credentials',
  });
  const res = await fetch(url, { method:'POST', body });
  if (!res.ok) throw new Error(`Impossible d'obtenir un token Azure: ${await res.text()}`);
  return (await res.json()).access_token;
}

async function sendGraphEmail(token, senderEmail, to, subject, htmlBody, attachments) {
  const message = {
    subject,
    body: { contentType: 'html', content: htmlBody },
    toRecipients: [{ emailAddress: { address: to } }],
    attachments: attachments.map(a => ({
      '@odata.type':  '#microsoft.graph.fileAttachment',
      name:           a.filename,
      contentBytes:   Buffer.from(a.content).toString('base64'),
      contentType:    a.contentType,
    })),
  };
  const url = `https://graph.microsoft.com/v1.0/users/${senderEmail}/sendMail`;
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });
  if (!res.ok) throw new Error(`Erreur Graph API sendMail (${res.status}): ${await res.text()}`);
}

// ─── Palette HTML (cohérente avec email-body-template.ts) ────────────────────
const HC = {
  primary: '#4472C4', primaryLight: '#EEF2FA', border: '#d9e1f2',
  muted: '#666666', footer: '#999999',
  lateRed: '#c0392b', okGreen: '#2c8a2c', overtimeGreen: '#27ae60',
  incompleteOrange: '#ea580c', incompleteBg: '#fed7aa',
  presentBg: '#dcfce7', presentText: '#166534',
  adminBg: '#bae6fd', adminText: '#075985',
  absentBg: '#fee2e2', absentText: '#991b1b',
};

function _escHtml(v) {
  return (v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _badge(status) {
  const b = 'padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;';
  switch (status) {
    case 'present':      return `<span style="${b}background:${HC.presentBg};color:${HC.presentText};">Présent</span>`;
    case 'incomplete':   return `<span style="${b}background:${HC.incompleteBg};color:${HC.incompleteOrange};">Incomplet</span>`;
    case 'admin_closed': return `<span style="${b}background:${HC.adminBg};color:${HC.adminText};">Clôturé</span>`;
    default:             return `<span style="${b}background:${HC.absentBg};color:${HC.absentText};">Absent</span>`;
  }
}

// ─── Email complet (KPIs + tableau détaillé par jour) ────────────────────────
function buildSummaryHtml(periodLabel, days, fromDate, toDate) {
  let totalWork = 0, totalLate = 0, totalEmployeeDays = 0;
  const employeeSet = new Set();
  for (const day of days) {
    for (const emp of day.employees) {
      employeeSet.add(emp.id);
      totalEmployeeDays++;
      totalWork += emp.computation.workMinutes;
      if (emp.computation.lateMinutes > 0) totalLate++;
    }
  }
  let businessDays = 0;
  const dc = new Date(fromDate);
  while (dc <= toDate) {
    if (dc.getDay() !== 0 && dc.getDay() !== 6) businessDays++;
    dc.setDate(dc.getDate() + 1);
  }
  const avgWork   = totalEmployeeDays > 0 ? Math.round(totalWork / totalEmployeeDays) : 0;
  const lateRateN = totalEmployeeDays > 0 ? (totalLate / totalEmployeeDays) * 100 : 0;
  const lateRate  = lateRateN.toFixed(1);
  const lateColor = lateRateN > 10 ? HC.lateRed : HC.okGreen;

  const thS = `padding:10px;text-align:center;font-weight:700;color:white;background:${HC.primary};`;

  // Tableau par jour (une ligne = un jour)
  const periodRows = days.map((day, idx) => {
    const bg            = idx % 2 === 0 ? HC.primaryLight : '#ffffff';
    const presentCount  = day.employees.filter(e => e.status === 'present' || e.status === 'admin_closed').length;
    const incCount      = day.employees.filter(e => e.status === 'incomplete').length;
    const lateCount     = day.employees.filter(e => e.computation.lateMinutes > 0).length;
    const dayTotalWork  = day.employees.reduce((s, e) => s + e.computation.workMinutes, 0);
    const dayAvgWork    = day.employees.length > 0 ? Math.round(dayTotalWork / day.employees.length) : 0;
    const td = (v, extra='') =>
      `<td style="padding:9px 10px;border-bottom:1px solid ${HC.border};background:${bg};text-align:center;${extra}">${v}</td>`;
    return `<tr>
      ${td(_escHtml(day.dateLabel), 'text-align:left;font-weight:600;')}
      ${td(presentCount)}
      ${td(incCount > 0 ? `<strong style="color:${HC.incompleteOrange};">${incCount}</strong>` : '—')}
      ${td(lateCount > 0 ? `<strong style="color:${HC.lateRed};">${lateCount}</strong>` : '—')}
      ${td(`<strong>${fmtMin(dayAvgWork)}</strong>`)}
    </tr>`;
  }).join('');

  const periodTable = days.length === 0 ? '' : `
    <h3 style="margin:24px 0 8px;font-size:14px;color:#333;border-bottom:2px solid ${HC.primary};padding-bottom:6px;">
      📅 Détail par jour
    </h3>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="border-collapse:collapse;margin:0 0 20px;font-size:13px;">
      <tr>
        <th style="${thS}text-align:left;">Date</th>
        <th style="${thS}">Présents</th>
        <th style="${thS}">Incomplets</th>
        <th style="${thS}">Retards</th>
        <th style="${thS}">Moy. heures</th>
      </tr>
      ${periodRows}
    </table>`;

  const now = new Date();

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Rapport mensuel — EliteTime</title>
</head>
<body style="font-family:Calibri,Arial,sans-serif;color:#333;max-width:700px;margin:0 auto;padding:20px;background:#ffffff;">

  <div style="background:${HC.primary};color:white;padding:20px 24px;border-radius:8px 8px 0 0;">
    <h1 style="margin:0;font-size:20px;font-weight:700;">📊 Rapport de présence — EliteTime</h1>
    <p style="margin:6px 0 0;font-size:14px;opacity:0.9;">Période : <strong>${_escHtml(periodLabel)}</strong></p>
  </div>

  <div style="border:1px solid #d0d7de;border-top:none;padding:20px;border-radius:0 0 8px 8px;background:#fafbfc;">
    <p style="margin:0 0 16px;">Bonjour,</p>
    <p style="margin:0 0 16px;">Veuillez trouver ci-joint le rapport complet de présence pour la période <strong>${_escHtml(periodLabel)}</strong>.</p>

    <table width="100%" cellpadding="0" cellspacing="0"
           style="border-collapse:collapse;margin:16px 0;font-size:14px;">
      <tr style="background:${HC.primary};color:white;">
        <th style="padding:10px;text-align:left;font-weight:700;border-radius:4px 0 0 4px;">Indicateur</th>
        <th style="padding:10px;text-align:right;font-weight:700;border-radius:0 4px 4px 0;">Valeur</th>
      </tr>
      <tr style="background:${HC.primaryLight};">
        <td style="padding:9px 10px;border-bottom:1px solid ${HC.border};">📅 Jours ouvrés dans la période</td>
        <td style="padding:9px 10px;text-align:right;border-bottom:1px solid ${HC.border};"><strong>${businessDays}</strong></td>
      </tr>
      <tr style="background:#fff;">
        <td style="padding:9px 10px;border-bottom:1px solid ${HC.border};">👥 Employés concernés</td>
        <td style="padding:9px 10px;text-align:right;border-bottom:1px solid ${HC.border};"><strong>${employeeSet.size}</strong></td>
      </tr>
      <tr style="background:${HC.primaryLight};">
        <td style="padding:9px 10px;border-bottom:1px solid ${HC.border};">📅 Jours avec présences</td>
        <td style="padding:9px 10px;text-align:right;border-bottom:1px solid ${HC.border};"><strong>${days.length}</strong></td>
      </tr>
      <tr style="background:#fff;">
        <td style="padding:9px 10px;border-bottom:1px solid ${HC.border};">📈 Moyenne heures/jour/employé</td>
        <td style="padding:9px 10px;text-align:right;border-bottom:1px solid ${HC.border};"><strong>${fmtMin(avgWork)}</strong></td>
      </tr>
      <tr style="background:${HC.primaryLight};">
        <td style="padding:9px 10px;">⚠️ Taux de retard</td>
        <td style="padding:9px 10px;text-align:right;color:${lateColor};"><strong>${lateRate}%</strong></td>
      </tr>
    </table>

    ${periodTable}

    <p style="margin:16px 0 4px;font-size:13px;color:${HC.muted};">
      Le fichier Excel joint contient le détail complet par semaine, avec calcul automatique des retards,
      heures supplémentaires et observations.
    </p>
    <p style="font-size:12px;color:${HC.footer};margin:20px 0 0;">
      — EliteTime · Rapport mensuel généré automatiquement le ${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR')}
    </p>
  </div>

</body>
</html>`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log();
  console.log(c('bold', '═'.repeat(80)));
  console.log(c('bold', c('cyan', '  ENVOI RAPPORTS EXCEL — EliteTime')));
  if (DRY_RUN) {
    console.log(c('yellow', '  ⚠  MODE SIMULATION — aucun email ne sera envoyé'));
    console.log(c('dim',    '  Pour envoyer : node scripts/envoyer-rapport-email.js --envoyer'));
  } else {
    console.log(c('green', '  ✔  MODE ENVOI RÉEL'));
  }
  console.log(c('bold', '═'.repeat(80)));
  console.log();

  const senderEmail = process.env.GRAPH_SENDER_EMAIL;
  if (!senderEmail) {
    console.error(c('red', '[ERREUR] GRAPH_SENDER_EMAIL non configuré dans .env'));
    process.exit(1);
  }

  const db = new PgClient({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  // Align session timezone with Prisma's behavior: all TIMESTAMP WITHOUT TZ values
  // are stored/compared as UTC moments regardless of the server's local timezone.
  await db.query("SET timezone = 'UTC'");
  console.log(c('green', '  ✔  Connexion base de données OK'));

  // FIX #2 : charger workStartTime / workEndTime depuis SystemSettings
  const { rows: settingsRows } = await db.query(
    'SELECT "workStartTime", "workEndTime" FROM "SystemSettings" LIMIT 1'
  );
  if (settingsRows.length > 0) {
    LATE_THRESHOLD     = parseHM(settingsRows[0].workStartTime);
    OVERTIME_THRESHOLD = parseHM(settingsRows[0].workEndTime);
    console.log(c('green', `  ✔  Seuils BDD : début=${settingsRows[0].workStartTime}  fin=${settingsRows[0].workEndTime}`));
  } else {
    console.log(c('yellow', '  ⚠  SystemSettings absent — seuils par défaut 08h45 / 17h30'));
  }
  console.log();

  let token = null;
  if (!DRY_RUN) {
    console.log('  ⏳ Récupération du token Azure...');
    token = await getGraphToken();
    console.log(c('green', '  ✔  Token Azure obtenu'));
  }
  console.log();

  try {
    // FIX #5 : pas de filtre includeInReports — identique à la page de saisie manuelle
    const { rows: usersRaw } = await db.query(`
      SELECT id, email, username, firstname, lastname, department, position, role, status
      FROM "User"
      WHERE status = 'active'
        AND "hiddenFromLists" = false
        AND role = 'employee'
      ORDER BY lastname, firstname
    `);

    const users = usersRaw.map(u => decryptUser({ ...u }));

    console.log(c('bold', `  Employés actifs : ${c('cyan', users.length)}`));
    for (const u of users) {
      console.log(c('dim', `    • ${(u.lastname || '').toUpperCase()} ${u.firstname || ''} — ${u.department || '—'}`));
    }
    console.log();

    const userIds = users.map(u => u.id);
    if (userIds.length === 0) {
      console.error(c('red', '[ERREUR] Aucun employé actif trouvé.'));
      process.exit(1);
    }

    const placeholders = userIds.map((_, i) => `$${i + 1}`).join(', ');

    for (const periode of PERIODES) {
      console.log(c('bold', `  ─── Période : ${periode.label} ───`));
      console.log(`       Du ${periode.fromStr} au ${periode.toStr}`);

      // Plage datetime complète identique à fetchData() du service NestJS/Prisma.
      // date::date était insuffisant pour les pointages manager stockés en UTC :
      // minuit local UTC+2 = 22:00 UTC → date::date retourne le jour précédent.
      const fromTs = new Date(periode.fromStr + 'T00:00:00');
      fromTs.setHours(0, 0, 0, 0);
      const toTs = new Date(periode.toStr + 'T00:00:00');
      toTs.setHours(23, 59, 59, 999);

      const { rows: ptsRaw } = await db.query(`
        SELECT id, "userId", date, "entryTime", "exitTime", duration, status,
               "isActive", "sessionNumber", source, "pointedBy",
               "lateReason", "earlyExitReason"
        FROM "Pointage"
        WHERE "userId" IN (${placeholders})
          AND date >= $${userIds.length + 1}
          AND date <= $${userIds.length + 2}
        ORDER BY date ASC, "userId" ASC, "sessionNumber" ASC
      `, [...userIds, fromTs, toTs]);

      const pointages = ptsRaw.map(p => ({
        ...decryptPointage(p),
        userId:        p.userId ?? p.userid,
        date:          p.date,
        duration:      p.duration,
        status:        p.status,
        isActive:      p.isActive ?? p.isactive,
        sessionNumber: p.sessionNumber ?? p.sessionnumber,
      }));

      const { rows: bksRaw } = await db.query(`
        SELECT id, "userId", date, "startTime", "endTime", duration
        FROM "Break"
        WHERE "userId" IN (${placeholders})
          AND date >= $${userIds.length + 1}
          AND date <= $${userIds.length + 2}
        ORDER BY date ASC
      `, [...userIds, fromTs, toTs]);

      const breaks = bksRaw.map(b => ({
        ...b,
        userId:   b.userId ?? b.userid,
        date:     b.date,
        duration: b.duration,
      }));

      console.log(`       Pointages : ${c('cyan', pointages.length)}  |  Pauses : ${c('cyan', breaks.length)}`);

      if (pointages.length === 0) {
        console.log(c('yellow', '       ⚠  Aucun pointage pour cette période — email ignoré.'));
        console.log();
        continue;
      }

      const days = groupByDay(users, pointages, breaks);
      console.log(`       Jours avec présences : ${c('cyan', days.length)}`);

      console.log('       ⏳ Génération du fichier Excel...');
      const fromDate    = localDateFromStr(periode.fromStr);
      const toDate      = localDateFromStr(periode.toStr);
      const periodLabel = `${fromDate.toLocaleDateString('fr-FR')} – ${toDate.toLocaleDateString('fr-FR')}`;
      const excelBuf    = await generateExcel(periodLabel, days);
      const excelSizeKo = Math.round(Buffer.from(excelBuf).length / 1024);
      console.log(c('green', `       ✔  Excel généré (${excelSizeKo} Ko)`));

      const htmlBody = buildSummaryHtml(periode.label, days, fromDate, toDate);
      const subject  = `[EliteTime] Rapport de présence — ${periode.label}`;

      if (DRY_RUN) {
        console.log(c('yellow', `       [DRY-RUN] Email simulé :`));
        console.log(c('dim',    `         De      : ${senderEmail}`));
        console.log(c('dim',    `         À       : ${DESTINATAIRE}`));
        console.log(c('dim',    `         Objet   : ${subject}`));
        console.log(c('dim',    `         Pièce   : ${periode.filename} (${excelSizeKo} Ko)`));
      } else {
        console.log(`       ⏳ Envoi de l'email...`);
        await sendGraphEmail(token, senderEmail, DESTINATAIRE, subject, htmlBody, [{
          filename:    periode.filename,
          content:     Buffer.from(excelBuf),
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }]);
        console.log(c('green', `       ✔  Email envoyé à ${DESTINATAIRE}`));
      }
      console.log();
    }

    console.log('═'.repeat(80));
    if (DRY_RUN) {
      console.log(c('yellow', `  SIMULATION TERMINÉE — 3 rapports prêts à envoyer`));
      console.log(c('dim',    `  Relancez avec --envoyer pour effectuer l'envoi réel`));
    } else {
      console.log(c('green', `  ✔  TERMINÉ — 3 rapports Excel envoyés à ${DESTINATAIRE}`));
    }
    console.log('═'.repeat(80));
    console.log();

  } finally {
    await db.end();
  }
}

main().catch(err => {
  console.error('\n' + c('red', '[ERREUR FATALE]'), err.message || err);
  process.exit(1);
});
