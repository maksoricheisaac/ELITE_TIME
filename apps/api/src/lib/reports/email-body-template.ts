import type { GroupedDayData } from './report-service';
import {
  HTML_COLORS,
  fmtMin,
  htmlStatusBadge,
  htmlLateRateColor,
  escHtml,
  sortEmployeesByArrival,
} from './report-design-system';

export interface EmailBodyInput {
  /** 'DAILY_REPORT' | 'WEEKLY_REPORT' | 'MONTHLY_REPORT' */
  reportType: string;
  periodLabel: string;
  groupedDays: GroupedDayData[];
  /** Chaîne déjà formatée pour l'affichage, ex. "29/05/2026 à 08:01:32" */
  generatedAt: string;
}

// ── Stats globales ───────────────────────────────────────────────────────────

interface Stats {
  employeeCount: number;
  totalEmployeeDays: number;
  avgWorkMinutes: number;
  lateRateStr: string;
  lateRateNum: number;
  daysWithPresence: number;
}

function computeStats(groupedDays: GroupedDayData[]): Stats {
  let totalWork = 0;
  let totalLate = 0;
  let totalEmployeeDays = 0;
  const employeeSet = new Set<string>();

  for (const day of groupedDays) {
    for (const emp of day.employees) {
      employeeSet.add(emp.id);
      totalEmployeeDays++;
      totalWork += emp.computation.workMinutes;
      if (emp.computation.lateMinutes > 0) totalLate++;
    }
  }

  const avgWorkMinutes =
    totalEmployeeDays > 0 ? Math.round(totalWork / totalEmployeeDays) : 0;
  const lateRateNum =
    totalEmployeeDays > 0 ? (totalLate / totalEmployeeDays) * 100 : 0;

  return {
    employeeCount: employeeSet.size,
    totalEmployeeDays,
    avgWorkMinutes,
    lateRateStr: lateRateNum.toFixed(1),
    lateRateNum,
    daysWithPresence: groupedDays.length,
  };
}

// ── Tableau quotidien — une ligne par employé ─────────────────────────────────

function buildDailyTable(groupedDays: GroupedDayData[]): string {
  const C = HTML_COLORS;
  const day = groupedDays[0];
  if (!day || day.employees.length === 0) {
    return `<p style="color:${C.muted};font-style:italic;font-size:13px;">Aucun employé présent ce jour.</p>`;
  }

  const thStyle = `padding:10px;text-align:center;font-weight:700;color:white;background:${C.primary};`;

  const rows = sortEmployeesByArrival(day.employees)
    .map((emp, idx) => {
      const bg = idx % 2 === 0 ? C.primaryLight : '#ffffff';
      const td = (content: string, extra = '') =>
        `<td style="padding:9px 10px;border-bottom:1px solid ${C.border};background:${bg};text-align:center;${extra}">${content}</td>`;

      const checkOutDisplay =
        emp.status === 'incomplete'
          ? `<span style="color:${C.incompleteOrange};font-style:italic;font-size:11px;">Non pointé</span>`
          : escHtml(emp.checkOut || '—');

      const lateStyle =
        emp.computation.lateMinutes > 0
          ? `color:${C.lateRed};font-weight:600;`
          : '';
      const overtimeStyle =
        emp.computation.overtimeMinutes > 0
          ? `color:${C.overtimeGreen};font-weight:600;`
          : '';

      const obs = [emp.sessionDetails, emp.lateReason, emp.earlyExitReason]
        .filter(Boolean)
        .join(' | ');

      return `
        <tr>
          ${td(escHtml(emp.fullName || '—'), 'text-align:left;')}
          ${td(escHtml(emp.position || '—'), `text-align:left;color:${C.muted};font-size:12px;`)}
          ${td(htmlStatusBadge(emp.status))}
          ${td(escHtml(emp.checkIn || '—'))}
          ${td(checkOutDisplay)}
          ${td(fmtMin(emp.computation.workMinutes), 'font-weight:600;')}
          ${td(fmtMin(emp.computation.lateMinutes), lateStyle)}
          ${td(fmtMin(emp.computation.overtimeMinutes), overtimeStyle)}
          ${obs ? td(`<span style="font-size:11px;color:${C.muted};">${escHtml(obs)}</span>`, 'text-align:left;') : td('—')}
        </tr>`;
    })
    .join('');

  return `
    <table width="100%" cellpadding="0" cellspacing="0"
           style="border-collapse:collapse;margin:16px 0;font-size:13px;">
      <tr>
        <th style="${thStyle}text-align:left;">Employé</th>
        <th style="${thStyle}text-align:left;">Poste</th>
        <th style="${thStyle}">Statut</th>
        <th style="${thStyle}">Entrée</th>
        <th style="${thStyle}">Sortie</th>
        <th style="${thStyle}">Heures</th>
        <th style="${thStyle}">Retard</th>
        <th style="${thStyle}">H. Sup</th>
        <th style="${thStyle}text-align:left;">Observations</th>
      </tr>
      ${rows}
    </table>`;
}

// ── Tableau période — une ligne par jour ──────────────────────────────────────

function buildPeriodTable(groupedDays: GroupedDayData[]): string {
  const C = HTML_COLORS;
  if (groupedDays.length === 0) {
    return `<p style="color:${C.muted};font-style:italic;font-size:13px;">Aucun pointage enregistré pour cette période.</p>`;
  }

  const thStyle = `padding:10px;text-align:center;font-weight:700;color:white;background:${C.primary};`;

  const rows = groupedDays
    .map((day, idx) => {
      const bg = idx % 2 === 0 ? C.primaryLight : '#ffffff';
      const td = (content: string, extra = '') =>
        `<td style="padding:9px 10px;border-bottom:1px solid ${C.border};background:${bg};text-align:center;${extra}">${content}</td>`;

      const presentCount = day.employees.filter(
        (e) => e.status === 'present' || e.status === 'admin_closed',
      ).length;
      const incompleteCount = day.employees.filter(
        (e) => e.status === 'incomplete',
      ).length;
      const lateCount = day.employees.filter(
        (e) => e.computation.lateMinutes > 0,
      ).length;
      const totalWork = day.employees.reduce(
        (s, e) => s + e.computation.workMinutes,
        0,
      );
      const avgWork =
        day.employees.length > 0
          ? Math.round(totalWork / day.employees.length)
          : 0;

      const incompleteCell =
        incompleteCount > 0
          ? `<strong style="color:${C.incompleteOrange};">${incompleteCount}</strong>`
          : '—';
      const lateCell =
        lateCount > 0
          ? `<strong style="color:${C.lateRed};">${lateCount}</strong>`
          : '—';

      return `
        <tr>
          ${td(escHtml(day.dateLabel), 'text-align:left;font-weight:600;')}
          ${td(String(presentCount))}
          ${td(incompleteCell)}
          ${td(lateCell)}
          ${td(fmtMin(avgWork), 'font-weight:600;')}
        </tr>`;
    })
    .join('');

  return `
    <table width="100%" cellpadding="0" cellspacing="0"
           style="border-collapse:collapse;margin:16px 0;font-size:13px;">
      <tr>
        <th style="${thStyle}text-align:left;">Date</th>
        <th style="${thStyle}">Présents</th>
        <th style="${thStyle}">Incomplets</th>
        <th style="${thStyle}">Retards</th>
        <th style="${thStyle}">Moy. heures</th>
      </tr>
      ${rows}
    </table>`;
}

// ── Fonction principale exportée ─────────────────────────────────────────────

export function buildEmailBodyHtml(input: EmailBodyInput): string {
  const { reportType, periodLabel, groupedDays, generatedAt } = input;
  const C = HTML_COLORS;

  const isDaily = reportType === 'DAILY_REPORT';
  const isMonthly = reportType === 'MONTHLY_REPORT';
  const typeLabel = isDaily
    ? 'quotidien'
    : isMonthly
      ? 'mensuel'
      : 'hebdomadaire';

  const stats = computeStats(groupedDays);
  const lateColor = htmlLateRateColor(stats.lateRateNum);

  const introText = isDaily
    ? `Veuillez trouver ci-joint le rapport complet de présence pour le <strong>${escHtml(periodLabel)}</strong>.`
    : `Veuillez trouver ci-joint le rapport complet de présence pour la période <strong>${escHtml(periodLabel)}</strong>.`;

  const statRow = (
    bg: string,
    label: string,
    value: string,
    valueStyle = '',
  ) => `
    <tr>
      <td style="padding:9px 10px;border-bottom:1px solid ${C.border};background:${bg};">${label}</td>
      <td style="padding:9px 10px;text-align:right;border-bottom:1px solid ${C.border};background:${bg};${valueStyle}"><strong>${value}</strong></td>
    </tr>`;

  const summaryRows = isDaily
    ? [
        statRow(
          C.primaryLight,
          '👥 Employés présents',
          String(stats.employeeCount),
        ),
        statRow(
          '#ffffff',
          '📈 Moyenne heures/employé',
          fmtMin(stats.avgWorkMinutes),
        ),
        statRow(
          C.primaryLight,
          `⚠️ Taux de retard`,
          `${stats.lateRateStr}%`,
          `color:${lateColor};`,
        ),
      ].join('')
    : [
        statRow(
          C.primaryLight,
          '👥 Employés concernés',
          String(stats.employeeCount),
        ),
        statRow(
          '#ffffff',
          '📅 Jours avec présences',
          String(stats.daysWithPresence),
        ),
        statRow(
          C.primaryLight,
          '📈 Moyenne heures/jour/employé',
          fmtMin(stats.avgWorkMinutes),
        ),
        statRow(
          '#ffffff',
          `⚠️ Taux de retard`,
          `${stats.lateRateStr}%`,
          `color:${lateColor};`,
        ),
      ].join('');

  const detailTable = isDaily
    ? buildDailyTable(groupedDays)
    : buildPeriodTable(groupedDays);

  const attachmentNote = isDaily
    ? 'Le fichier joint contient le détail complet avec calcul automatique des retards, heures supplémentaires et observations.'
    : `Le fichier joint contient le détail complet par ${isMonthly ? 'semaine' : 'jour'}, avec calcul automatique des retards, heures supplémentaires et observations.`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Rapport ${typeLabel} — EliteTime</title>
</head>
<body style="font-family:Calibri,Arial,sans-serif;color:${C.text};max-width:700px;margin:0 auto;padding:20px;background:#ffffff;">

  <div style="background:${C.primary};color:white;padding:20px 24px;border-radius:8px 8px 0 0;">
    <h1 style="margin:0;font-size:20px;font-weight:700;">📊 Rapport de présence — EliteTime</h1>
    <p style="margin:6px 0 0;font-size:14px;opacity:0.9;">Période : <strong>${escHtml(periodLabel)}</strong></p>
  </div>

  <div style="border:1px solid #d0d7de;border-top:none;padding:20px;border-radius:0 0 8px 8px;background:#fafbfc;">
    <p style="margin:0 0 16px;">Bonjour,</p>
    <p style="margin:0 0 16px;">${introText}</p>

    <table width="100%" cellpadding="0" cellspacing="0"
           style="border-collapse:collapse;margin:16px 0;font-size:14px;">
      <tr style="background:${C.primary};color:white;">
        <th style="padding:10px;text-align:left;font-weight:700;border-radius:4px 0 0 4px;">Indicateur</th>
        <th style="padding:10px;text-align:right;font-weight:700;border-radius:0 4px 4px 0;">Valeur</th>
      </tr>
      ${summaryRows}
    </table>

    ${detailTable}

    <p style="margin:16px 0 4px;font-size:13px;color:${C.muted};">${attachmentNote}</p>
    <p style="font-size:12px;color:${C.footer};margin:20px 0 0;">
      — EliteTime · Rapport ${typeLabel} généré automatiquement le ${escHtml(generatedAt)}
    </p>
  </div>

</body>
</html>`;
}
