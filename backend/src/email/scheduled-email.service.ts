import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { sendEmail } from '../lib/email';
import {
  decryptUser,
  decryptPointage,
  decryptBreak,
  decryptScheduledEmailJobRecipient,
} from '../lib/prisma-crypto.helper';
import { groupPointagesByDay } from '../lib/reports/report-service';
import { ReportCalculator } from '../lib/reports/report-calculator';
import { renderNewPointagesReportHtml } from '../lib/reports/new-pointages-report-template';
import { generateNewExcelReport } from '../lib/reports/new-excel-generator';
import { renderPdfFromHtml } from '../lib/reports/html-to-pdf';
import { buildEmailBodyHtml } from '../lib/reports/email-body-template';
import type { DailyReportMode } from 'src/generated/prisma/client';

// ── Helpers timezone ────────────────────────────────────────────────────────

function getTZOffsetMs(utcDate: Date, tz: string): number {
  const utcStr = utcDate.toLocaleString('sv-SE', { timeZone: 'UTC' });
  const tzStr = utcDate.toLocaleString('sv-SE', { timeZone: tz });
  return new Date(tzStr + 'Z').getTime() - new Date(utcStr + 'Z').getTime();
}

export function getCalendarDateInTZ(
  date: Date,
  tz: string,
): { year: number; month: number; day: number; dow: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    get('weekday'),
  );
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    dow,
  };
}

function startOfDayUTC(
  year: number,
  month: number,
  day: number,
  tz: string,
): Date {
  const noonUTC = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const offsetMs = getTZOffsetMs(noonUTC, tz);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMs);
}

function endOfDayUTC(
  year: number,
  month: number,
  day: number,
  tz: string,
): Date {
  const noonUTC = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const offsetMs = getTZOffsetMs(noonUTC, tz);
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - offsetMs);
}

function addCalendarDays(
  year: number,
  month: number,
  day: number,
  delta: number,
  tz: string,
) {
  const mid = new Date(Date.UTC(year, month - 1, day + delta, 12, 0, 0));
  return getCalendarDateInTZ(mid, tz);
}

// ── Period builders ─────────────────────────────────────────────────────────

function getDailyPeriod(mode: DailyReportMode, tz: string) {
  const now = new Date();
  let d = getCalendarDateInTZ(now, tz);
  if (mode === 'YESTERDAY') {
    d = addCalendarDays(d.year, d.month, d.day, -1, tz);
  }
  const from = startOfDayUTC(d.year, d.month, d.day, tz);
  const to = endOfDayUTC(d.year, d.month, d.day, tz);
  const label = from.toLocaleDateString('fr-FR', { timeZone: tz });
  return { from, to, label };
}

function getCurrentWeekPeriod(weekStartDay: number, tz: string) {
  const now = new Date();
  const today = getCalendarDateInTZ(now, tz);
  const daysSinceStart = (today.dow - weekStartDay + 7) % 7;
  const currentWeekStart = addCalendarDays(
    today.year,
    today.month,
    today.day,
    -daysSinceStart,
    tz,
  );
  const currentWeekEnd = addCalendarDays(
    currentWeekStart.year,
    currentWeekStart.month,
    currentWeekStart.day,
    6,
    tz,
  );
  const from = startOfDayUTC(
    currentWeekStart.year,
    currentWeekStart.month,
    currentWeekStart.day,
    tz,
  );
  const to = endOfDayUTC(
    currentWeekEnd.year,
    currentWeekEnd.month,
    currentWeekEnd.day,
    tz,
  );
  const label = `${from.toLocaleDateString('fr-FR', { timeZone: tz })} – ${to.toLocaleDateString('fr-FR', { timeZone: tz })}`;
  return { from, to, label };
}

function getLastWeekPeriod(weekStartDay: number, tz: string) {
  const now = new Date();
  const today = getCalendarDateInTZ(now, tz);
  const daysSinceStart = (today.dow - weekStartDay + 7) % 7;
  const currentWeekStart = addCalendarDays(
    today.year,
    today.month,
    today.day,
    -daysSinceStart,
    tz,
  );
  const lastWeekStart = addCalendarDays(
    currentWeekStart.year,
    currentWeekStart.month,
    currentWeekStart.day,
    -7,
    tz,
  );
  const lastWeekEnd = addCalendarDays(
    lastWeekStart.year,
    lastWeekStart.month,
    lastWeekStart.day,
    6,
    tz,
  );
  const from = startOfDayUTC(
    lastWeekStart.year,
    lastWeekStart.month,
    lastWeekStart.day,
    tz,
  );
  const to = endOfDayUTC(
    lastWeekEnd.year,
    lastWeekEnd.month,
    lastWeekEnd.day,
    tz,
  );
  const label = `${from.toLocaleDateString('fr-FR', { timeZone: tz })} – ${to.toLocaleDateString('fr-FR', { timeZone: tz })}`;
  return { from, to, label };
}

function getWeeklyPeriod(weekday: number, weekStartDay: number, tz: string) {
  const daysIntoWeek = (weekday - weekStartDay + 7) % 7;
  return daysIntoWeek === 0
    ? getLastWeekPeriod(weekStartDay, tz)
    : getCurrentWeekPeriod(weekStartDay, tz);
}

function getLastMonthPeriod(tz: string) {
  const now = new Date();
  const today = getCalendarDateInTZ(now, tz);
  const lastMonthYear = today.month === 1 ? today.year - 1 : today.year;
  const lastMonth = today.month === 1 ? 12 : today.month - 1;
  const from = startOfDayUTC(lastMonthYear, lastMonth, 1, tz);
  const lastDayUTC = new Date(Date.UTC(lastMonthYear, lastMonth, 0, 12, 0, 0));
  const lastDayInTZ = getCalendarDateInTZ(lastDayUTC, tz);
  const to = endOfDayUTC(
    lastDayInTZ.year,
    lastDayInTZ.month,
    lastDayInTZ.day,
    tz,
  );
  const label = new Date(
    Date.UTC(lastMonthYear, lastMonth - 1, 1),
  ).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: tz,
  });
  return { from, to, label };
}

// ── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class ScheduledEmailService {
  private readonly logger = new Logger(ScheduledEmailService.name);

  constructor(private readonly prisma: PrismaService) {}

  async runJob(jobId: string): Promise<void> {
    const job = await this.prisma.scheduledEmailJob.findUnique({
      where: { id: jobId },
      include: { recipients: { include: { user: true } } },
    });

    if (!job || !job.enabled) {
      this.logger.log(`job ${jobId} non trouvé ou désactivé`);
      return;
    }

    const settings = await this.prisma.systemSettings.findFirst();
    const tz: string = settings?.timezone ?? 'Europe/Paris';
    const thresholds = {
      lateThreshold: settings?.workStartTime ?? '08:45',
      overtimeThreshold: settings?.workEndTime ?? '17:30',
    };

    if (job.type === 'WEEKLY_REPORT' && job.weekday != null) {
      const todayWeekday = getCalendarDateInTZ(new Date(), tz).dow;
      if (todayWeekday !== job.weekday) {
        this.logger.log(
          `weekly job ${job.id} ignoré (weekday ${todayWeekday} != ${job.weekday})`,
        );
        return;
      }
    }

    const to = Array.from(
      new Set([
        ...job.recipients
          .filter((r) => !r.user || r.user.hiddenFromLists !== true)
          .map((r) => {
            const user = r.user ? decryptUser(r.user) : null;
            return user?.email;
          })
          .filter((v): v is string => Boolean(v))
          .map((v) => v.trim().toLowerCase()),
        ...job.recipients
          .map((r) => {
            if (r.userId) return null;
            try {
              const decrypted = decryptScheduledEmailJobRecipient(r);
              return decrypted.email;
            } catch {
              return r.email;
            }
          })
          .filter((v): v is string => Boolean(v))
          .map((v) => v.trim().toLowerCase()),
      ]),
    );

    if (to.length === 0) {
      this.logger.log(`job ${job.id} sans destinataires, ignoré`);
      return;
    }

    this.logger.log(
      `running ${job.type} (${job.id}) -> ${to.length} destinataire(s)`,
    );

    let from: Date;
    let toDate: Date;
    let periodLabel: string;

    if (job.type === 'DAILY_REPORT') {
      const mode: DailyReportMode = settings?.dailyReportMode ?? 'YESTERDAY';
      const period = getDailyPeriod(mode, tz);
      from = period.from;
      toDate = period.to;
      periodLabel = period.label;
    } else if (job.type === 'WEEKLY_REPORT') {
      const weekStartDay: number = job.weekStartDay ?? 1;
      const weekday: number = job.weekday ?? weekStartDay;
      const period = getWeeklyPeriod(weekday, weekStartDay, tz);
      from = period.from;
      toDate = period.to;
      periodLabel = period.label;
    } else {
      const period = getLastMonthPeriod(tz);
      from = period.from;
      toDate = period.to;
      periodLabel = period.label;
    }

    // Filtre unifié avec ReportsService.fetchData() :
    // le champ includeInReports contrôle qui apparaît dans les rapports,
    // indépendamment du rôle. Si un manager/admin ne doit pas figurer dans les
    // rapports, l'admin positionne includeInReports = false pour cet utilisateur.
    const users = await this.prisma.user.findMany({
      where: {
        status: 'active',
        hiddenFromLists: false,
        includeInReports: true,
      },
    });

    const decryptedUsers = users.map((u) => decryptUser(u));
    const userIds = decryptedUsers.map((u) => u.id);

    const pointages = await this.prisma.pointage.findMany({
      where: { userId: { in: userIds }, date: { gte: from, lte: toDate } },
      orderBy: { date: 'asc' },
    });

    const decryptedPointages = pointages.map((p) => decryptPointage(p));

    const breaks = await this.prisma.break.findMany({
      where: { userId: { in: userIds }, date: { gte: from, lte: toDate } },
      orderBy: { date: 'asc' },
    });

    const decryptedBreaks = breaks.map((b) => decryptBreak(b));

    const title =
      job.type === 'DAILY_REPORT'
        ? `Rapport quotidien des pointages (${periodLabel})`
        : job.type === 'WEEKLY_REPORT'
          ? `Rapport hebdomadaire des pointages (${periodLabel})`
          : `Rapport mensuel des pointages (${periodLabel})`;

    const groupedDays = groupPointagesByDay(
      decryptedUsers,
      decryptedPointages,
      decryptedBreaks,
      undefined,
      thresholds,
    );

    const reportDays = groupedDays.map((day) => ({
      dateLabel: day.dateLabel,
      employees: day.employees.map((emp) => {
        const formatted = ReportCalculator.formatComputation(emp.computation);
        return {
          fullName: emp.fullName,
          position: emp.position,
          checkIn: emp.checkIn,
          checkOut: emp.checkOut,
          sessionCount: emp.sessionCount || 1,
          workDuration: formatted.workDuration,
          breakDuration: formatted.breakDuration,
          lateLabel: formatted.lateLabel,
          earlyExitLabel: formatted.earlyExitLabel,
          overtimeLabel: formatted.overtimeLabel,
          status: emp.status,
          lateReason: emp.lateReason,
          earlyExitReason: emp.earlyExitReason,
        };
      }),
    }));

    const html = renderNewPointagesReportHtml({
      periodLabel,
      generatedAtLabel: new Date().toLocaleString('fr-FR', { timeZone: tz }),
      days: reportDays,
    });

    const pdfBytes = await renderPdfFromHtml({ html });

    const includeExcel = job.includeExcel ?? false;
    let excelBuffer: Buffer | null = null;
    if (includeExcel) {
      excelBuffer = await generateNewExcelReport(periodLabel, groupedDays);
    }

    const fileNameBase =
      job.type === 'DAILY_REPORT'
        ? 'rapport_quotidien'
        : job.type === 'WEEKLY_REPORT'
          ? 'rapport_hebdomadaire'
          : 'rapport_mensuel';

    const dateStr = new Date()
      .toLocaleString('sv-SE', { timeZone: tz })
      .slice(0, 10);

    const attachments: Array<{
      filename: string;
      content: Buffer;
      contentType: string;
    }> = [];
    if (job.includePdf ?? true) {
      attachments.push({
        filename: `${fileNameBase}_${dateStr}.pdf`,
        content: Buffer.from(pdfBytes),
        contentType: 'application/pdf',
      });
    }
    if (includeExcel && excelBuffer) {
      attachments.push({
        filename: `${fileNameBase}_${dateStr}.xlsx`,
        content: excelBuffer,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    }

    this.logger.log(
      `envoi ${job.type} (${job.id}) avec ${attachments.length} pièce(s) jointe(s)`,
    );

    const emailHtml = buildEmailBodyHtml({
      reportType: job.type,
      periodLabel,
      groupedDays,
      generatedAt: new Date().toLocaleString('fr-FR', { timeZone: tz }),
    });

    await sendEmail({ to, subject: title, html: emailHtml, attachments });

    this.logger.log(
      `email envoyé pour ${job.type} (${job.id}) -> ${to.join(',')}`,
    );
  }
}
