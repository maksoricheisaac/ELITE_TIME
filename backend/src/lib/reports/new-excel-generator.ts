import * as ExcelJS from 'exceljs';
import { GroupedDayData } from './report-service';
import { injectExcelCharts, type ChartInput } from './excel-chart-injector';
import {
  EXCEL_ARGB,
  fmtMin,
  getExcelRowArgb,
  sortEmployeesByArrival,
  STATUS_LABELS,
} from './report-design-system';

// ── Types privés ──────────────────────────────────────────────────────────────

interface EmployeeStat {
  fullName: string;
  position: string;
  daysPresent: number;
  daysLate: number;
  daysIncomplete: number;
  totalLateMinutes: number;
  totalOvertimeMinutes: number;
  totalWorkMinutes: number;
}

type HAlign = 'left' | 'center' | 'right';

// ── Styles ExcelJS partagés ───────────────────────────────────────────────────

const titleFont = { name: 'Comic Sans MS', size: 11, bold: true };
const headerFont = {
  name: 'Calibri',
  size: 11,
  bold: true,
  color: { argb: 'FFFFFFFF' },
};
const dataFont = { name: 'Calibri', size: 11 };
const borderStyle: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

// ── Helpers calendrier / format ───────────────────────────────────────────────

function getMondayKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return (
    `${d.getFullYear()}-` +
    `${String(d.getMonth() + 1).padStart(2, '0')}-` +
    `${String(d.getDate()).padStart(2, '0')}`
  );
}

function timeStrToExcelFraction(s: string | null | undefined): number | null {
  if (!s || s === '—' || !s.includes(':')) return null;
  const [h, m] = s.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return (h * 60 + m) / 1440;
}

const JOURS_FR = [
  'Dimanche',
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
];

function formatDateLabel(date: Date): string {
  const j = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${JOURS_FR[date.getDay()]} ${j}/${m}/${date.getFullYear()}`;
}

// ── Accumulation des stats RH par employé ─────────────────────────────────────

function collectEmpStats(
  stats: Map<string, EmployeeStat>,
  emp: GroupedDayData['employees'][0],
): void {
  if (!stats.has(emp.id)) {
    stats.set(emp.id, {
      fullName: emp.fullName,
      position: emp.position,
      daysPresent: 0,
      daysLate: 0,
      daysIncomplete: 0,
      totalLateMinutes: 0,
      totalOvertimeMinutes: 0,
      totalWorkMinutes: 0,
    });
  }
  const s = stats.get(emp.id)!;
  s.daysPresent++;
  if (emp.computation.lateMinutes > 0) s.daysLate++;
  if (emp.status === 'incomplete') s.daysIncomplete++;
  s.totalLateMinutes += emp.computation.lateMinutes;
  s.totalOvertimeMinutes += emp.computation.overtimeMinutes;
  s.totalWorkMinutes += emp.computation.workMinutes;
}

// ── Feuille Synthèse RH ───────────────────────────────────────────────────────

function populateSummarySheet(
  ws: ExcelJS.Worksheet,
  periodLabel: string,
  stats: Map<string, EmployeeStat>,
): void {
  ws.columns = [
    { width: 8 },
    { width: 36 },
    { width: 28 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
  ];

  function applyCell(
    row: number,
    col: number,
    value: ExcelJS.CellValue,
    bgArgb: string,
    align: HAlign = 'center',
    font: Partial<ExcelJS.Font> = dataFont,
  ) {
    const cell = ws.getCell(row, col);
    cell.value = value;
    cell.font = { ...dataFont, ...font };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: bgArgb },
    };
    cell.alignment = { horizontal: align, vertical: 'middle' };
    cell.border = borderStyle;
  }

  function sectionHeader(
    row: number,
    text: string,
    cols: number,
    bgArgb: string,
  ) {
    ws.mergeCells(row, 1, row, cols);
    const cell = ws.getCell(row, 1);
    cell.value = text;
    cell.font = {
      name: 'Calibri',
      size: 12,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: bgArgb },
    };
    cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    ws.getRow(row).height = 26;
  }

  function tableHeaders(row: number, headers: string[], nbCols: number) {
    const r = ws.getRow(row);
    r.height = 36;
    headers.forEach((h, i) => {
      const cell = r.getCell(i + 1);
      cell.value = h;
      cell.font = headerFont;
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: EXCEL_ARGB.headerBg },
      };
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };
      cell.border = borderStyle;
    });
    ws.autoFilter = { from: { row, column: 1 }, to: { row, column: nbCols } };
  }

  // ── Titre ─────────────────────────────────────────────────────────────────

  ws.mergeCells('B2:I5');
  const titleCell = ws.getCell('B2');
  titleCell.value = `Synthèse RH — ${periodLabel}`;
  titleCell.font = {
    name: 'Calibri',
    size: 16,
    bold: true,
    color: { argb: 'FFFFFFFF' },
  };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: EXCEL_ARGB.headerBg },
  };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 20;
  ws.getRow(5).height = 20;

  // ── Statistiques globales ─────────────────────────────────────────────────

  const entries = Array.from(stats.values());
  const totalPresenceDays = entries.reduce((s, e) => s + e.daysPresent, 0);
  const totalLateDays = entries.reduce((s, e) => s + e.daysLate, 0);
  const totalLateMinutes = entries.reduce((s, e) => s + e.totalLateMinutes, 0);
  const totalWorkMinutes = entries.reduce((s, e) => s + e.totalWorkMinutes, 0);
  const globalPunctuality =
    totalPresenceDays > 0
      ? (
          ((totalPresenceDays - totalLateDays) / totalPresenceDays) *
          100
        ).toFixed(1)
      : '100.0';
  const avgLateGlobal =
    totalLateDays > 0 ? Math.round(totalLateMinutes / totalLateDays) : 0;
  const avgWorkGlobal =
    totalPresenceDays > 0
      ? Math.round(totalWorkMinutes / totalPresenceDays)
      : 0;

  let r = 7;
  sectionHeader(
    r,
    '📊  Indicateurs globaux de la période',
    9,
    EXCEL_ARGB.sectionDark,
  );
  r++;

  const kpis: [string, string][] = [
    ["👥  Nombre d'employés actifs", String(entries.length)],
    ['✅  Taux global de ponctualité', `${globalPunctuality} %`],
    ['⚠️  Retard moyen (sur jours en retard)', fmtMin(avgLateGlobal)],
    ['🕐  Moyenne heures travaillées / jour', fmtMin(avgWorkGlobal)],
  ];

  kpis.forEach(([label, value], i) => {
    const bg = i % 2 === 0 ? EXCEL_ARGB.evenRow : 'FFFFFFFF';
    ws.getRow(r).height = 22;
    ws.mergeCells(r, 1, r, 6);
    applyCell(r, 1, label, bg, 'left');
    ws.mergeCells(r, 7, r, 9);
    applyCell(r, 7, value, bg, 'right', { ...dataFont, bold: true });
    r++;
  });

  r += 2;

  // ── Calcul des classements ────────────────────────────────────────────────

  const computed = Array.from(stats.entries()).map(([id, s]) => ({
    id,
    fullName: s.fullName,
    position: s.position,
    daysPresent: s.daysPresent,
    daysLate: s.daysLate,
    daysIncomplete: s.daysIncomplete,
    totalLateMinutes: s.totalLateMinutes,
    totalOvertimeMinutes: s.totalOvertimeMinutes,
    totalWorkMinutes: s.totalWorkMinutes,
    punctualityRate:
      s.daysPresent > 0 ? (s.daysPresent - s.daysLate) / s.daysPresent : 1,
    avgWorkMin:
      s.daysPresent > 0 ? Math.round(s.totalWorkMinutes / s.daysPresent) : 0,
    avgLateMin:
      s.daysLate > 0 ? Math.round(s.totalLateMinutes / s.daysLate) : 0,
  }));

  const byPunctuality = [...computed].sort(
    (a, b) =>
      b.punctualityRate - a.punctualityRate ||
      b.daysPresent - a.daysPresent ||
      a.fullName.localeCompare(b.fullName, 'fr'),
  );
  const byLate = [...computed]
    .filter((e) => e.daysLate > 0)
    .sort(
      (a, b) =>
        b.totalLateMinutes - a.totalLateMinutes || b.daysLate - a.daysLate,
    );
  const byOvertime = [...computed]
    .filter((e) => e.totalOvertimeMinutes > 0)
    .sort((a, b) => b.totalOvertimeMinutes - a.totalOvertimeMinutes);

  const n5 = Math.min(5, computed.length);
  const top5PunctualIds = new Set(byPunctuality.slice(0, n5).map((e) => e.id));
  const top5LateIds = new Set(byLate.slice(0, n5).map((e) => e.id));

  // ── Classement général ponctualité ────────────────────────────────────────

  sectionHeader(
    r,
    '🏆  Classement général — Ponctualité',
    9,
    EXCEL_ARGB.sectionDark,
  );
  r++;
  tableHeaders(
    r,
    [
      'Rang',
      'Employé',
      'Service',
      'Jours présents',
      'Jours retard',
      'Ponctualité',
      'Retard moy.',
      'H.Sup total',
      'Moy. H.Trav',
    ],
    9,
  );
  r++;

  const rankingStartRow = r;

  byPunctuality.forEach((emp, idx) => {
    ws.getRow(r).height = 20;
    let bg: string;
    if (top5PunctualIds.has(emp.id)) bg = EXCEL_ARGB.sumGreen;
    else if (top5LateIds.has(emp.id)) bg = EXCEL_ARGB.sumRed;
    else bg = idx % 2 === 0 ? EXCEL_ARGB.evenRow : 'FFFFFFFF';

    (
      [
        [idx + 1, 'center'],
        [emp.fullName, 'left'],
        [emp.position, 'left'],
        [emp.daysPresent, 'center'],
        [emp.daysLate, 'center'],
        [`${(emp.punctualityRate * 100).toFixed(1)} %`, 'center'],
        [emp.avgLateMin > 0 ? fmtMin(emp.avgLateMin) : '—', 'center'],
        [
          emp.totalOvertimeMinutes > 0 ? fmtMin(emp.totalOvertimeMinutes) : '—',
          'center',
        ],
        [fmtMin(emp.avgWorkMin), 'center'],
      ] as [ExcelJS.CellValue, HAlign][]
    ).forEach(([val, align], i) => applyCell(r, i + 1, val, bg, align));
    r++;
  });

  ws.getRow(r).height = 18;
  (
    [
      [EXCEL_ARGB.sumGreen, '🟢 Top 5 Ponctualité'],
      [EXCEL_ARGB.sumRed, '🔴 Top 5 Retards cumulés'],
    ] as [string, string][]
  ).forEach(([bg, text], i) => {
    const cell = ws.getCell(r, i * 4 + 1);
    cell.value = text;
    cell.font = { name: 'Calibri', size: 9, italic: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
  });
  r += 2;

  // ── Top 5 Retards ─────────────────────────────────────────────────────────

  if (byLate.length > 0) {
    sectionHeader(
      r,
      '⚠️  Top 5 — Employés les plus en retard',
      6,
      EXCEL_ARGB.sectionRed,
    );
    r++;
    tableHeaders(
      r,
      [
        'Rang',
        'Employé',
        'Service',
        'Jours retard',
        'Retard total',
        'Retard moy.',
      ],
      6,
    );
    r++;
    byLate.slice(0, 5).forEach((emp, idx) => {
      ws.getRow(r).height = 20;
      (
        [
          [idx + 1, 'center'],
          [emp.fullName, 'left'],
          [emp.position, 'left'],
          [emp.daysLate, 'center'],
          [fmtMin(emp.totalLateMinutes), 'center'],
          [fmtMin(emp.avgLateMin), 'center'],
        ] as [ExcelJS.CellValue, HAlign][]
      ).forEach(([val, align], i) =>
        applyCell(r, i + 1, val, EXCEL_ARGB.sumRed, align),
      );
      r++;
    });
    r += 2;
  }

  // ── Top 5 Heures supplémentaires ─────────────────────────────────────────

  if (byOvertime.length > 0) {
    sectionHeader(
      r,
      '⏰  Top 5 — Heures supplémentaires',
      5,
      EXCEL_ARGB.sectionBlue,
    );
    r++;
    tableHeaders(
      r,
      ['Rang', 'Employé', 'Service', 'H.Sup total', 'Jours présents'],
      5,
    );
    r++;
    byOvertime.slice(0, 5).forEach((emp, idx) => {
      ws.getRow(r).height = 20;
      (
        [
          [idx + 1, 'center'],
          [emp.fullName, 'left'],
          [emp.position, 'left'],
          [fmtMin(emp.totalOvertimeMinutes), 'center'],
          [emp.daysPresent, 'center'],
        ] as [ExcelJS.CellValue, HAlign][]
      ).forEach(([val, align], i) =>
        applyCell(r, i + 1, val, EXCEL_ARGB.sumBlue, align),
      );
      r++;
    });
  }

  ws.views = [
    {
      state: 'frozen',
      xSplit: 0,
      ySplit: rankingStartRow - 1,
      topLeftCell: `A${rankingStartRow}`,
      activeCell: 'A1',
    },
  ];
}

// ── Générateur principal ──────────────────────────────────────────────────────

export async function generateNewExcelReport(
  periodLabel: string,
  days: GroupedDayData[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'EliteTime';
  workbook.created = new Date();

  const isMultiDay = days.length > 1;
  const empStats = new Map<string, EmployeeStat>();

  // Synthèse RH en premier onglet (actif à l'ouverture du fichier)
  const summaryWs = isMultiDay ? workbook.addWorksheet('📊 Synthèse RH') : null;

  // ── Regroupement par semaines calendaires ────────────────────────────────

  const weeksMap = new Map<string, { label: string; days: GroupedDayData[] }>();
  if (isMultiDay) {
    days.forEach((day) => {
      const key = getMondayKey(day.date);
      if (!weeksMap.has(key)) weeksMap.set(key, { label: '', days: [] });
      weeksMap.get(key)!.days.push(day);
    });
    Array.from(weeksMap.keys())
      .sort()
      .forEach((key, i) => {
        weeksMap.get(key)!.label = `Semaine ${i + 1}`;
      });
  } else {
    weeksMap.set('single', { label: 'Rapport', days });
  }

  // ── Feuilles hebdomadaires ───────────────────────────────────────────────

  for (const weekKey of Array.from(weeksMap.keys()).sort()) {
    const weekData = weeksMap.get(weekKey)!;
    const ws = workbook.addWorksheet(weekData.label);

    ws.columns = [
      { key: 'no', width: 6 },
      { key: 'date', width: 24 },
      { key: 'nom', width: 40 },
      { key: 'fonction', width: 35 },
      { key: 'arrivee', width: 16 },
      { key: 'depart', width: 16 },
      { key: 'travaillees', width: 18 },
      { key: 'retard_min', width: 22 },
      { key: 'retard_bool', width: 10 },
      { key: 'supp', width: 22 },
      { key: 'statut', width: 18 },
      { key: 'obs', width: 45 },
    ];

    ws.mergeCells('D2:H5');
    const titleCell = ws.getCell('D2');
    titleCell.value = isMultiDay
      ? `Heures employés — Période : ${periodLabel} (${weekData.label})`
      : `Registre Journalier - Le ${days[0].dateLabel}`;
    titleCell.font = titleFont;
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: EXCEL_ARGB.titleBg },
    };

    const headerRow = ws.getRow(7);
    headerRow.height = 40;
    [
      'N°',
      'Date',
      'Noms et prénoms',
      'Fonction/Service',
      "Heure d'arrivée",
      'Heure de départ',
      'Heures travaillées',
      'Durée du retard ( En minutes )',
      'Retard',
      'Heures supplémentaires',
      'Statut administratif',
      'Observations',
    ].forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = headerFont;
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: EXCEL_ARGB.headerBg },
      };
      cell.border = borderStyle;
    });

    let currentRow = 8;

    for (const day of weekData.days) {
      const sortedEmps = sortEmployeesByArrival(day.employees);

      sortedEmps.forEach((emp, index) => {
        if (isMultiDay) collectEmpStats(empStats, emp);

        const bgArgb = getExcelRowArgb(emp.status, emp.computation.lateMinutes);
        const row = ws.getRow(currentRow);
        row.height = 20;

        row.getCell(1).value = index + 1;
        row.getCell(2).value = formatDateLabel(day.date);
        row.getCell(2).font = { ...dataFont, bold: true, italic: true };
        row.getCell(3).value = emp.fullName;
        row.getCell(4).value = emp.position;

        const cellE = row.getCell(5);
        cellE.value = timeStrToExcelFraction(emp.checkIn);
        cellE.numFmt = 'hh:mm';

        const cellF = row.getCell(6);
        cellF.value = timeStrToExcelFraction(emp.checkOut);
        cellF.numFmt = 'hh:mm';

        const workMin = emp.computation.workMinutes;
        const lateMin = emp.computation.lateMinutes;
        const overtimeMin = emp.computation.overtimeMinutes;

        if (workMin > 0) {
          row.getCell(7).value = workMin / 1440;
          row.getCell(7).numFmt = '[h]:mm';
        } else {
          row.getCell(7).value = '';
        }

        row.getCell(8).value = lateMin;
        row.getCell(8).numFmt = '0';
        row.getCell(9).value = lateMin > 0 ? 'Oui' : 'Non';

        if (overtimeMin > 0) {
          row.getCell(10).value = overtimeMin / 1440;
          row.getCell(10).numFmt = '[h]:mm';
        } else {
          row.getCell(10).value = '';
        }

        row.getCell(11).value = STATUS_LABELS[emp.status] ?? 'Absent';

        row.getCell(12).value = [
          emp.sessionDetails,
          emp.lateReason,
          emp.earlyExitReason,
          emp.status === 'incomplete' ? 'Départ non pointé' : '',
          emp.status === 'admin_closed' ? 'Sortie clôturée par admin' : '',
        ]
          .filter(Boolean)
          .join(' | ');

        for (let i = 1; i <= 12; i++) {
          const cell = row.getCell(i);
          if (!cell.font) cell.font = dataFont;
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = borderStyle;
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: bgArgb },
          };
        }
        row.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };
        row.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };

        currentRow++;
      });

      ws.mergeCells(`A${currentRow}:L${currentRow}`);
      ws.getRow(currentRow).height = 6;
      ws.getCell(`A${currentRow}`).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: EXCEL_ARGB.separator },
      };
      currentRow++;
    }

    ws.autoFilter = 'A7:L7';
    ws.views = [
      {
        state: 'frozen',
        xSplit: 0,
        ySplit: 7,
        topLeftCell: 'A8',
        activeCell: 'A8',
      },
    ];
  }

  // ── Feuille Synthèse RH ──────────────────────────────────────────────────

  if (summaryWs && empStats.size > 0) {
    populateSummarySheet(summaryWs, periodLabel, empStats);
  } else if (summaryWs) {
    workbook.removeWorksheet(summaryWs.id);
  }

  const rawBuffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;

  if (!isMultiDay || empStats.size === 0) return rawBuffer;

  // ── Injection des graphiques ─────────────────────────────────────────────

  const statsArr = Array.from(empStats.values());
  const allComp = Array.from(empStats.entries()).map(([, s]) => ({
    fullName: s.fullName,
    daysLate: s.daysLate,
    totalLateMinutes: s.totalLateMinutes,
    punctualityRate:
      s.daysPresent > 0 ? (s.daysPresent - s.daysLate) / s.daysPresent : 1,
  }));

  const chartInput: ChartInput = {
    neverLate: statsArr.filter((s) => s.daysLate === 0).length,
    sometimesLate: statsArr.filter((s) => s.daysLate >= 1 && s.daysLate <= 3)
      .length,
    oftenLate: statsArr.filter((s) => s.daysLate > 3).length,
    punctualityRanking: [...allComp]
      .sort((a, b) => b.punctualityRate - a.punctualityRate)
      .slice(0, 10)
      .map((e) => ({
        name: e.fullName,
        rate: parseFloat((e.punctualityRate * 100).toFixed(1)),
      })),
    lateRanking: allComp
      .filter((e) => e.daysLate > 0)
      .sort((a, b) => b.totalLateMinutes - a.totalLateMinutes)
      .slice(0, 5)
      .map((e) => ({ name: e.fullName, totalLateMin: e.totalLateMinutes })),
  };

  return injectExcelCharts(rawBuffer, '📊 Synthèse RH', chartInput);
}
