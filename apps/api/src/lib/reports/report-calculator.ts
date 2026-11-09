import { formatMinutesHuman } from '../time-format';

export interface TimeComputation {
  workMinutes: number;
  breakMinutes: number;
  lateMinutes: number;
  overtimeMinutes: number;
  earlyExitMinutes: number;
}

// Valeurs par défaut — utilisées uniquement quand les SystemSettings ne sont
// pas disponibles (tests unitaires, appels legacy sans paramètre).
// NE PAS modifier ces constantes pour "configurer" l'application : passer les
// thresholds via le paramètre optionnel de compute().
export const REPORT_CONFIG = {
  LATE_THRESHOLD: '08:45',
  OVERTIME_THRESHOLD: '17:30',
  DEFAULT_BREAK_MINUTES: 60,
};

export interface ReportThresholds {
  lateThreshold: string; // ex. '08:45'
  overtimeThreshold: string; // ex. '17:30'
}

export class ReportCalculator {
  static timeToMinutes(timeStr: string | null | undefined): number | null {
    if (!timeStr) return null;
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return null;
    return hours * 60 + minutes;
  }

  // thresholds : si fourni, écrase les constantes REPORT_CONFIG.
  // Les appelants ayant accès aux SystemSettings doivent toujours passer
  // { lateThreshold: settings.workStartTime, overtimeThreshold: settings.workEndTime }.
  static compute(
    entryTime: string | null | undefined,
    exitTime: string | null | undefined,
    actualBreakMinutes?: number,
    pointage?: any,
    date?: Date,
    thresholds?: Partial<ReportThresholds>,
  ): TimeComputation {
    const lateThresholdStr =
      thresholds?.lateThreshold ?? REPORT_CONFIG.LATE_THRESHOLD;
    const overtimeThresholdStr =
      thresholds?.overtimeThreshold ?? REPORT_CONFIG.OVERTIME_THRESHOLD;

    const entry = this.timeToMinutes(entryTime);
    const exit = this.timeToMinutes(exitTime);

    let workMinutes = 0;
    let lateMinutes = 0;
    let overtimeMinutes = 0;
    let earlyExitMinutes = 0;
    const breakMinutes = actualBreakMinutes ?? 0;

    const isWeekend = date ? date.getDay() === 0 || date.getDay() === 6 : false;

    if (entry !== null && !isWeekend) {
      const threshold = this.timeToMinutes(lateThresholdStr)!;
      if (entry > threshold) {
        lateMinutes = entry - threshold;
      }
    }

    if (exit !== null) {
      const overtimeThreshold = this.timeToMinutes(overtimeThresholdStr)!;
      if (exit > overtimeThreshold) {
        overtimeMinutes = exit - overtimeThreshold;
      } else if (exit < overtimeThreshold - 1) {
        earlyExitMinutes = overtimeThreshold - exit;
      }
    }

    if (entry !== null && exit !== null) {
      workMinutes = Math.max(0, exit - entry - breakMinutes);
    }

    return {
      workMinutes,
      breakMinutes,
      lateMinutes,
      overtimeMinutes,
      earlyExitMinutes,
    };
  }

  static formatComputation(comp: TimeComputation) {
    return {
      workDuration:
        comp.workMinutes > 0 ? formatMinutesHuman(comp.workMinutes) : '—',
      breakDuration:
        comp.breakMinutes > 0 ? formatMinutesHuman(comp.breakMinutes) : '—',
      lateLabel:
        comp.lateMinutes > 0 ? formatMinutesHuman(comp.lateMinutes) : '—',
      overtimeLabel:
        comp.overtimeMinutes > 0
          ? formatMinutesHuman(comp.overtimeMinutes)
          : '—',
      earlyExitLabel:
        comp.earlyExitMinutes > 0
          ? formatMinutesHuman(comp.earlyExitMinutes)
          : '—',
    };
  }
}
