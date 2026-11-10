import {
  REPORT_CONFIG,
  ReportCalculator,
  ReportThresholds,
} from './report-calculator';
import type { User, Pointage, Break } from '@elitetime/database';
import {
  BUSINESS_TIME_ZONE,
  computeDayMetrics,
  dayKeyOf,
  weekdayOf,
  zonedTimeToDate,
} from '@elitetime/time';
import type { DayKey } from '@elitetime/time';

export interface GroupedDayData {
  date: Date;
  dateLabel: string;
  employees: Array<{
    id: string;
    fullName: string;
    position: string;
    checkIn: string;
    checkOut: string;
    sessionCount: number;
    /** Détail des sessions multiples, ex. "S1: 08:00→12:00, S2: 13:30→17:45". Null si session unique. */
    sessionDetails: string | null;
    breakMinutes: number;
    lateReason?: string;
    earlyExitReason?: string;
    computation: ReturnType<typeof ReportCalculator.compute>;
    status: 'present' | 'absent' | 'incomplete' | 'admin_closed';
  }>;
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

/** « Lundi 09/11/2026 » à partir d'une clé de jour (aucun fuseau impliqué : le jour est déjà calendaire). */
function buildDateLabel(day: DayKey): string {
  const [y, m, d] = day.split('-');
  return `${JOURS_FR[weekdayOf(day)]} ${d}/${m}/${y}`;
}

export function groupPointagesByDay(
  users: User[],
  pointages: Pointage[],
  breaks: Break[],
  tzParam?: string,
  thresholds?: Partial<ReportThresholds>,
): GroupedDayData[] {
  const tz = tzParam ?? thresholds?.tz ?? BUSINESS_TIME_ZONE;
  const daySettings = {
    workStartTime: thresholds?.lateThreshold ?? REPORT_CONFIG.LATE_THRESHOLD,
    workEndTime:
      thresholds?.overtimeThreshold ?? REPORT_CONFIG.OVERTIME_THRESHOLD,
    breakDeductionMode: thresholds?.breakMode ?? ('recorded' as const),
    flatBreakMinutes:
      thresholds?.flatBreakMinutes ?? REPORT_CONFIG.DEFAULT_BREAK_MINUTES,
  };

  // 1. Jours existants UNIQUEMENT depuis les pointages (jour calendaire du fuseau métier).
  //    Les pauses (Break) ne créent jamais une journée dans le rapport.
  const allDates = new Set<DayKey>();
  // Un pointage dont la date est illisible est ignoré (jamais d'exception ni de jour inventé).
  pointages = pointages.filter(
    (p) => !Number.isNaN(new Date(p.date).getTime()),
  );
  breaks = breaks.filter((b) => !Number.isNaN(new Date(b.date).getTime()));
  pointages.forEach((p) => allDates.add(dayKeyOf(new Date(p.date), tz)));

  const days: GroupedDayData[] = [];

  for (const dayStr of Array.from(allDates).sort()) {
    // 2. Dimanches exclus — jamais travaillés, même si des données existent.
    if (weekdayOf(dayStr) === 0) continue;
    const date = zonedTimeToDate(dayStr, 0, tz);

    const employees: GroupedDayData['employees'] = [];

    for (const u of users) {
      // 3. Pointages de cet employé pour ce jour, triés par session.
      const userPointages = pointages
        .filter(
          (p) => p.userId === u.id && dayKeyOf(new Date(p.date), tz) === dayStr,
        )
        .sort((a, b) => (a.sessionNumber || 1) - (b.sessionNumber || 1));

      // 4. Aucun pointage ce jour → employé absent → exclu du rapport.
      //    On n'ajoute jamais de lignes "Absent" artificielles.
      if (userPointages.length === 0) continue;

      const firstPointage = userPointages[0];
      const lastPointage = userPointages[userPointages.length - 1];

      // 5. Pauses du jour — utilisées pour le calcul de durée uniquement,
      //    jamais pour construire des journées.
      const userBreaks = breaks.filter(
        (b) => b.userId === u.id && dayKeyOf(new Date(b.date), tz) === dayStr,
      );

      // 6. Statut de la journée.
      // Un jour est incomplet seulement si la dernière session active n'a pas
      // de sortie pointée. Si au moins une session a un exitTime, la journée
      // est considérée complète (présent ou admin_closed selon le statut).
      const lastSession = userPointages[userPointages.length - 1];
      const isIncomplete =
        !lastSession.exitTime &&
        !lastSession.isActive &&
        lastSession.status === 'incomplete';
      const isAdminClosed =
        !isIncomplete && userPointages.some((p) => p.status === 'admin_closed');

      // 7. Horaires : TOUJOURS depuis les champs métier entryTime / exitTime.
      const checkIn = firstPointage.entryTime || '—';
      const checkOut = isIncomplete
        ? 'Départ non pointé'
        : lastPointage.exitTime || (isAdminClosed ? 'Fermé auto.' : '—');

      // 8. Raisons — dédupliquées pour éviter la répétition quand plusieurs
      //    enregistrements partagent la même raison (corrections, doublons BDD).
      const lateReason = [
        ...new Set(userPointages.map((p) => p.lateReason).filter(Boolean)),
      ].join(' | ');
      const earlyExitReason = [
        ...new Set(userPointages.map((p) => p.earlyExitReason).filter(Boolean)),
      ].join(' | ');

      // 8b. Détail des sessions — affiché en observations si > 1 session.
      //     Déduplique par sessionNumber pour ignorer les doublons BDD.
      const sessionMap = new Map<number, (typeof userPointages)[0]>();
      userPointages.forEach((p) => sessionMap.set(p.sessionNumber || 1, p));
      const uniqueSessions = Array.from(sessionMap.values()).sort(
        (a, b) => (a.sessionNumber || 1) - (b.sessionNumber || 1),
      );
      const sessionDetails =
        uniqueSessions.length > 1
          ? uniqueSessions
              .map(
                (p) =>
                  `S${p.sessionNumber}: ${p.entryTime || '?'}→${p.exitTime || '?'}`,
              )
              .join(', ')
          : null;

      // 9. Métriques : MOTEUR COMMUN (@elitetime/time) — mêmes règles que les écrans et l'API.
      //    Temps travaillé = sessions valides − pauses incluses dans ces sessions (jamais de double déduction).
      const m = computeDayMetrics(
        dayStr,
        userPointages.map((p) => ({
          sessionNumber: p.sessionNumber || 1,
          entryTime: p.entryTime,
          exitTime: p.exitTime,
        })),
        userBreaks.map((b) => ({
          day: dayStr,
          startTime: b.startTime,
          endTime: b.endTime,
        })),
        daySettings,
        { tz, holidays: thresholds?.holidays },
      );
      const computation: ReturnType<typeof ReportCalculator.compute> = {
        workMinutes: m.netMinutes,
        breakMinutes: m.breakMinutes + m.flatDeductionMinutes,
        lateMinutes: m.lateMinutes,
        // Départ non pointé : l'heure de fin réelle est inconnue → ni heures sup. ni départ anticipé.
        overtimeMinutes: isIncomplete ? 0 : m.overtimeMinutes,
        earlyExitMinutes: isIncomplete ? 0 : m.earlyExitMinutes,
      };

      employees.push({
        id: u.id,
        fullName: `${u.firstname ?? ''} ${u.lastname ?? ''}`.trim(),
        position: u.position ?? u.department ?? '—',
        checkIn,
        checkOut,
        sessionCount: userPointages.length,
        sessionDetails,
        lateReason,
        earlyExitReason,
        breakMinutes: computation.breakMinutes,
        computation,
        status: isIncomplete
          ? 'incomplete'
          : isAdminClosed
            ? 'admin_closed'
            : 'present',
      });
    }

    if (employees.length > 0) {
      days.push({ date, dateLabel: buildDateLabel(dayStr), employees });
    }
  }

  return days;
}
