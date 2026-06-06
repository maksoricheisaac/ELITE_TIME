/**
 * Design system partagé — tous les rapports EliteTime.
 *
 * Centralise :
 *  - palettes de couleurs Excel (ARGB) et HTML/CSS
 *  - libellés de statut unifiés
 *  - helpers métier sans dépendance externe
 *
 * Règle : ce fichier n'importe rien de ExcelJS ni d'aucun framework.
 * Il doit rester importable depuis les générateurs Excel ET les templates email.
 */

// ── Palette Excel ARGB ────────────────────────────────────────────────────────

export const EXCEL_ARGB = {
  // Lignes employés — couleur sémantique par niveau de ponctualité
  onTime: 'FFE2EFDA', // vert léger   — à l'heure
  lightLate: 'FFFCE4D6', // orange       — retard ≤ 15 min
  heavyLate: 'FFFFB3B3', // rouge clair  — retard > 15 min
  incomplete: 'FFFFF2CC', // jaune        — pointage incomplet

  // Chrome commun
  headerBg: 'FF4472C4', // bleu principal — en-têtes de colonnes
  titleBg: 'FFD9E1F2', // bleu clair     — titre de feuille
  sectionDark: 'FF2E4E7A', // bleu marine    — en-têtes de section
  sectionRed: 'FF7B0C0C', // rouge foncé    — section retards
  sectionBlue: 'FF1F5C99', // bleu foncé     — section heures supplémentaires
  evenRow: 'FFEEF2FA', // gris bleuté    — alternance ligne paire
  separator: 'FFD6DCE4', // gris clair     — séparateur entre journées

  // Synthèse RH — classements
  sumGreen: 'FFE2EFDA', // top ponctualité
  sumRed: 'FFFFCCCC', // top retards
  sumBlue: 'FFDDEEFF', // top heures supplémentaires
} as const;

// ── Palette HTML/CSS ──────────────────────────────────────────────────────────

export const HTML_COLORS = {
  primary: '#4472C4',
  primaryLight: '#EEF2FA',
  border: '#d9e1f2',
  text: '#333333',
  muted: '#666666',
  footer: '#999999',
  lateRed: '#c0392b',
  okGreen: '#2c8a2c',
  overtimeGreen: '#27ae60',
  incompleteOrange: '#ea580c',
  incompleteBg: '#fed7aa',
  presentBg: '#dcfce7',
  presentText: '#166534',
  adminBg: '#bae6fd',
  adminText: '#075985',
  absentBg: '#fee2e2',
  absentText: '#991b1b',
} as const;

// ── Libellés de statut (wording unifié sur toute la plateforme) ───────────────

export const STATUS_LABELS: Record<string, string> = {
  present: 'Présent',
  incomplete: 'Incomplet',
  admin_closed: 'Clôturé admin',
  absent: 'Absent',
};

// ── Priorité de tri par statut ────────────────────────────────────────────────
// 0 → ponctuels & clôturés admin · 1 → incomplets · 2 → absents

export const STATUS_SORT_ORDER: Record<string, number> = {
  present: 0,
  admin_closed: 0,
  incomplete: 1,
  absent: 2,
};

// ── Helper : formater des minutes en "Xh MM" ─────────────────────────────────

export function fmtMin(minutes: number): string {
  if (!minutes || minutes <= 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}

// ── Helper : couleur ARGB sémantique d'une ligne employé (Excel) ──────────────

export function getExcelRowArgb(status: string, lateMinutes: number): string {
  if (status === 'incomplete') return EXCEL_ARGB.incomplete;
  if (lateMinutes === 0) return EXCEL_ARGB.onTime;
  if (lateMinutes <= 15) return EXCEL_ARGB.lightLate;
  return EXCEL_ARGB.heavyLate;
}

// ── Helper : tri des employés par ponctualité d'arrivée ───────────────────────
//
//   Ordre : présent ponctuel → léger retard → gros retard → incomplet → absent
//   À statut égal : heure d'arrivée croissante, puis nom alphabétique.

export function sortEmployeesByArrival<
  T extends {
    status: string;
    checkIn: string;
    fullName: string;
    computation: { lateMinutes: number };
  },
>(employees: T[]): T[] {
  function checkInMin(s: string): number {
    if (!s || s === '—') return 9999;
    const [h, m] = s.split(':').map(Number);
    return isNaN(h) || isNaN(m) ? 9999 : h * 60 + m;
  }
  return [...employees].sort((a, b) => {
    const pa = STATUS_SORT_ORDER[a.status] ?? 2;
    const pb = STATUS_SORT_ORDER[b.status] ?? 2;
    if (pa !== pb) return pa - pb;
    const da = checkInMin(a.checkIn);
    const db = checkInMin(b.checkIn);
    if (da !== db) return da - db;
    return (a.fullName ?? '').localeCompare(b.fullName ?? '', 'fr');
  });
}

// ── Helper : badge HTML de statut ─────────────────────────────────────────────

export function htmlStatusBadge(status: string): string {
  const base =
    'padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;';
  const C = HTML_COLORS;
  switch (status) {
    case 'present':
      return `<span style="${base}background:${C.presentBg};color:${C.presentText};">Présent</span>`;
    case 'incomplete':
      return `<span style="${base}background:${C.incompleteBg};color:${C.incompleteOrange};">Incomplet</span>`;
    case 'admin_closed':
      return `<span style="${base}background:${C.adminBg};color:${C.adminText};">Clôturé</span>`;
    default:
      return `<span style="${base}background:${C.absentBg};color:${C.absentText};">Absent</span>`;
  }
}

// ── Helper : couleur CSS conditionnelle du taux de retard ─────────────────────
// Rouge si > 10 %, vert sinon.

export function htmlLateRateColor(lateRateNum: number): string {
  return lateRateNum > 10 ? HTML_COLORS.lateRed : HTML_COLORS.okGreen;
}

// ── Helper : échapper les caractères HTML ─────────────────────────────────────

export function escHtml(v: string | null | undefined): string {
  return (v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
