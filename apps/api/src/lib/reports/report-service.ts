import { ReportCalculator, ReportThresholds } from './report-calculator';
import type { User, Pointage, Break } from '../../generated/prisma/client';

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

// Extrait "YYYY-MM-DD" en utilisant les getters locaux du process Node.js.
// Contrairement à .toISOString() qui retourne toujours UTC, cette fonction
// respecte le fuseau horaire système — indispensable pour que les pointages
// enregistrés en heure locale soient rattachés au bon jour calendaire.
function toLocalDateStr(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return (
    `${date.getFullYear()}-` +
    `${String(date.getMonth() + 1).padStart(2, '0')}-` +
    `${String(date.getDate()).padStart(2, '0')}`
  );
}

// Crée une Date à minuit LOCAL pour un "YYYY-MM-DD".
// new Date("YYYY-MM-DD") crée minuit UTC, ce qui peut décaler getDay() d'un jour
// sur un serveur en UTC+. new Date(y, m-1, d) crée minuit local — getDay() fiable.
function localDateFromStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
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

function buildDateLabel(date: Date): string {
  const j = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${JOURS_FR[date.getDay()]} ${j}/${m}/${date.getFullYear()}`;
}

export function groupPointagesByDay(
  users: User[],
  pointages: Pointage[],
  breaks: Break[],
  _tz?: string, // conservé pour compatibilité de signature — ignoré volontairement
  thresholds?: Partial<ReportThresholds>,
): GroupedDayData[] {
  // 1. Jours existants UNIQUEMENT depuis les pointages.
  //    Les pauses (Break) ne créent jamais une journée dans le rapport.
  const allDates = new Set<string>();
  pointages.forEach((p) => allDates.add(toLocalDateStr(p.date)));

  const days: GroupedDayData[] = [];

  for (const dayStr of Array.from(allDates).sort()) {
    const date = localDateFromStr(dayStr);

    // 2. Dimanches exclus — jamais travaillés, même si des données existent.
    if (date.getDay() === 0) continue;

    const employees: GroupedDayData['employees'] = [];

    for (const u of users) {
      // 3. Pointages de cet employé pour ce jour, triés par session.
      const userPointages = pointages
        .filter((p) => p.userId === u.id && toLocalDateStr(p.date) === dayStr)
        .sort((a, b) => (a.sessionNumber || 1) - (b.sessionNumber || 1));

      // 4. Aucun pointage ce jour → employé absent → exclu du rapport.
      //    On n'ajoute jamais de lignes "Absent" artificielles.
      if (userPointages.length === 0) continue;

      const firstPointage = userPointages[0];
      const lastPointage = userPointages[userPointages.length - 1];

      // 5. Pauses du jour — utilisées pour le calcul de durée uniquement,
      //    jamais pour construire des journées.
      const userBreaks = breaks.filter(
        (b) => b.userId === u.id && toLocalDateStr(b.date) === dayStr,
      );
      const totalBreakMinutes = userBreaks.reduce(
        (sum, b) => sum + (b.duration || 0),
        0,
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
      //    Le champ `date` n'est utilisé que pour identifier le jour, jamais
      //    pour reconstruire des horaires (il vaut minuit UTC pour les pointages
      //    manager, ce qui rendrait tout recalcul incorrect).
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

      // 9. Métriques calculées.
      let computation: ReturnType<typeof ReportCalculator.compute>;
      if (isIncomplete) {
        const lateComp = ReportCalculator.compute(
          firstPointage.entryTime,
          null,
          0,
          undefined,
          date,
          thresholds,
        );
        computation = {
          workMinutes: 0,
          breakMinutes: 0,
          lateMinutes: lateComp.lateMinutes,
          overtimeMinutes: 0,
          earlyExitMinutes: 0,
        };
      } else {
        const totalWorkMinutes = userPointages.reduce(
          (sum, p) => sum + (p.duration || 0),
          0,
        );
        const baseComp = ReportCalculator.compute(
          firstPointage.entryTime,
          lastPointage.exitTime,
          totalBreakMinutes,
          undefined,
          date,
          thresholds,
        );
        computation = { ...baseComp, workMinutes: totalWorkMinutes };
      }

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
        breakMinutes: totalBreakMinutes,
        computation,
        status: isIncomplete
          ? 'incomplete'
          : isAdminClosed
            ? 'admin_closed'
            : 'present',
      });
    }

    if (employees.length > 0) {
      days.push({ date, dateLabel: buildDateLabel(date), employees });
    }
  }

  return days;
}
