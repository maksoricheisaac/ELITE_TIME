export interface GroupedDayData {
  dateLabel: string;
  employees: Array<{
    fullName: string;
    position: string;
    checkIn: string;
    checkOut: string;
    sessionCount: number;
    workDuration: string;
    breakDuration: string;
    lateLabel: string;
    earlyExitLabel: string;
    overtimeLabel: string;
    status: 'present' | 'absent' | 'incomplete' | 'admin_closed';
    lateReason?: string;
    earlyExitReason?: string;
  }>;
}

export interface NewPointagesReportTemplateInput {
  periodLabel: string;
  generatedAtLabel: string;
  days: GroupedDayData[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cell(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  return v && v !== '—' ? escapeHtml(v) : '<span class="empty-cell">—</span>';
}

export function renderNewPointagesReportHtml(
  input: NewPointagesReportTemplateInput,
): string {
  const daysHtml = input.days
    .map(
      (day) => `
    <div class="day-section">
      <h2 class="day-title">${escapeHtml(day.dateLabel)}</h2>
      <div class="card">
        <table>
          <thead>
            <tr>
              <th class="col-name">Employé</th>
              <th class="col-position">Poste</th>
              <th class="col-status">Statut</th>
              <th class="col-sess">Sess.</th>
              <th class="col-time">Entrée</th>
              <th class="col-time">Sortie</th>
              <th class="col-duration">Travail</th>
              <th class="col-meta">Retard</th>
              <th class="col-meta">S. Ant.</th>
              <th class="col-meta">H. Sup</th>
              <th class="col-name">Motifs</th>
            </tr>
          </thead>
          <tbody>
            ${day.employees
              .map((emp) => {
                const isIncomplete = emp.status === 'incomplete';
                const isAdminClosed = emp.status === 'admin_closed';
                const isAbsent = emp.status === 'absent';
                const rowClass = isAbsent
                  ? 'row-absent'
                  : isIncomplete
                    ? 'row-incomplete'
                    : isAdminClosed
                      ? 'row-admin-closed'
                      : '';
                const statusBadge = isAbsent
                  ? '<span class="badge-absent">Absent</span>'
                  : isIncomplete
                    ? '<span class="badge-incomplete">Incomplet</span>'
                    : isAdminClosed
                      ? '<span class="badge-admin-closed">Clôturé admin</span>'
                      : '<span class="badge-present">Présent</span>';
                const checkOutDisplay = isIncomplete
                  ? '<span class="text-incomplete">Départ non pointé</span>'
                  : cell(emp.checkOut);
                const overtimeDisplay = isIncomplete
                  ? cell('—')
                  : cell(emp.overtimeLabel);
                const overtimeClass =
                  !isIncomplete && emp.overtimeLabel !== '—'
                    ? 'text-green'
                    : '';
                const reasons = [
                  emp.lateReason,
                  emp.earlyExitReason,
                  isIncomplete ? 'Départ non pointé' : '',
                  isAdminClosed ? 'Sortie clôturée par admin' : '',
                ]
                  .filter(Boolean)
                  .join(' | ');
                return `
              <tr class="${rowClass}">
                <td class="col-name">${cell(emp.fullName)}</td>
                <td class="col-position">${cell(emp.position)}</td>
                <td class="col-status">${statusBadge}</td>
                <td class="col-sess">${emp.sessionCount || 1}</td>
                <td class="col-time">${cell(emp.checkIn)}</td>
                <td class="col-time">${checkOutDisplay}</td>
                <td class="col-duration">${isIncomplete ? cell('—') : cell(emp.workDuration)}</td>
                <td class="col-meta ${emp.lateLabel !== '—' ? 'text-red' : ''}">${cell(emp.lateLabel)}</td>
                <td class="col-meta ${emp.earlyExitLabel !== '—' ? 'text-blue' : ''}">${cell(emp.earlyExitLabel)}</td>
                <td class="col-meta ${overtimeClass}">${overtimeDisplay}</td>
                <td class="col-name">
                  <div class="reason-text">${escapeHtml(reasons)}</div>
                </td>
              </tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  `,
    )
    .join('');

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Rapport des pointages par jour</title>
    <style>
      @page { size: A4 landscape; margin: 15mm; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; color: #0f172a; margin: 0; background: #fff; }
      .container { width: 100%; }
      .header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 20px; border-bottom: 2px solid #e2e8f0; margin-bottom: 30px; }
      .brand { font-size: 24px; font-weight: 800; color: #2f6bff; }
      .report-title { font-size: 18px; font-weight: 700; text-transform: uppercase; color: #64748b; }
      .day-section { margin-bottom: 40px; page-break-inside: avoid; }
      .day-title { font-size: 16px; font-weight: 800; color: #1e293b; background: #f8fafc; padding: 10px 15px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #2f6bff; }
      .card { border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      thead th { background: #2f6bff; color: #ffffff; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 12px 10px; text-align: left; }
      tbody td { padding: 10px; border-bottom: 1px solid #f1f5f9; font-size: 12px; vertical-align: middle; }
      tbody tr:nth-child(even) { background: #fcfcfd; }
      .col-name { width: 15%; } .col-position { width: 12%; color: #64748b; } .col-status { width: 8%; text-align: center; }
      .col-sess { width: 4%; text-align: center; font-weight: 600; } .col-time { width: 7%; text-align: center; }
      .col-duration { width: 8%; text-align: center; font-weight: 600; } .col-meta { width: 8%; text-align: center; font-weight: 600; }
      .text-red { color: #ef4444; } .text-blue { color: #3b82f6; } .text-green { color: #10b981; }
      .empty-cell { color: #cbd5e1; }
      .reason-text { font-size: 10px; color: #64748b; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .row-absent { background: #fef2f2 !important; } .row-absent td { color: #991b1b; }
      .row-incomplete { background: #fff7ed !important; } .row-incomplete td { color: #9a3412; }
      .badge-absent { display: inline-block; padding: 2px 8px; background: #fee2e2; color: #991b1b; border-radius: 4px; font-size: 10px; font-weight: 600; text-transform: uppercase; }
      .badge-present { display: inline-block; padding: 2px 8px; background: #dcfce7; color: #166534; border-radius: 4px; font-size: 10px; font-weight: 600; text-transform: uppercase; }
      .badge-incomplete { display: inline-block; padding: 2px 8px; background: #fed7aa; color: #9a3412; border-radius: 4px; font-size: 10px; font-weight: 600; text-transform: uppercase; }
      .text-incomplete { color: #ea580c; font-style: italic; font-size: 10px; }
      .row-admin-closed { background: #f0f9ff !important; } .row-admin-closed td { color: #075985; }
      .badge-admin-closed { display: inline-block; padding: 2px 8px; background: #bae6fd; color: #075985; border-radius: 4px; font-size: 10px; font-weight: 600; text-transform: uppercase; }
      .footer { position: fixed; bottom: 0; width: 100%; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; padding-top: 10px; border-top: 1px solid #f1f5f9; }
      thead { display: table-header-group; }
    </style>
  </head>
  <body>
    <div class="container">
      <header class="header">
        <div class="brand">Elite Time</div>
        <div class="report-title">Rapport des pointages par jour</div>
        <div style="text-align: right">
          <div style="font-size: 12px; font-weight: 600">${escapeHtml(input.periodLabel)}</div>
          <div style="font-size: 10px; color: #64748b">Généré le ${escapeHtml(input.generatedAtLabel)}</div>
        </div>
      </header>
      ${daysHtml}
      <div class="footer">
        <div>Elite Time · Système de gestion des temps</div>
        <div>Page <span class="page-number"></span></div>
      </div>
    </div>
  </body>
</html>`;
}
