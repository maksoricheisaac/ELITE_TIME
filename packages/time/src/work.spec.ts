import { aggregateDays, computeDayMetrics, lateMinutesFor, mergeIntervals, sessionInterval, validateSessionTimes } from './work';
import type { DaySettings } from './work';
import { normalizeHolidays } from './calendar';

const SETTINGS: DaySettings = { workStartTime: '08:45', workEndTime: '17:30' };
const TUE = '2026-11-10'; // mardi, jour ouvré
const SAT = '2026-11-14';
const ctx = { now: new Date('2026-11-10T19:00:00Z') };

const day = (sessions: Array<[string | null, string | null]>, breaks: Array<[string, string | null]> = [], settings = SETTINGS, d = TUE) =>
  computeDayMetrics(
    d,
    sessions.map(([entryTime, exitTime], i) => ({ entryTime, exitTime, sessionNumber: i + 1 })),
    breaks.map(([startTime, endTime]) => ({ startTime, endTime })),
    settings,
    ctx,
  );

describe('journée de travail normale', () => {
  it('08:45 → 17:30 sans pause : 8 h 45 de travail, aucun retard', () => {
    const m = day([['08:45', '17:30']]);
    expect(m.grossMinutes).toBe(525);
    expect(m.netMinutes).toBe(525);
    expect(m.lateMinutes).toBe(0);
    expect(m.overtimeMinutes).toBe(0);
    expect(m.earlyExitMinutes).toBe(0);
  });

  it('avec une pause réelle de 60 min : 7 h 45', () => {
    const m = day([['08:45', '17:30']], [['12:30', '13:30']]);
    expect(m.breakMinutes).toBe(60);
    expect(m.netMinutes).toBe(465);
  });
});

describe('retards', () => {
  it.each([
    ['08:50', 5],
    ['09:00', 15],
    ['09:15', 30],
  ])('arrivée à %s → %i min de retard (seuil 08:45)', (entry, late) => {
    const m = day([[entry, '17:30']]);
    expect(m.lateMinutes).toBe(late);
  });

  it('arrivée pile à l\'heure ou en avance : aucun retard (jamais négatif)', () => {
    expect(day([['08:45', '17:30']]).lateMinutes).toBe(0);
    expect(day([['08:10', '17:30']]).lateMinutes).toBe(0);
    expect(day([['00:01', '17:30']]).lateMinutes).toBe(0);
  });

  it('un seul point de retard par jour : seule la PREMIÈRE entrée compte', () => {
    const m = day([['09:00', '12:00'], ['13:30', '17:30']]);
    expect(m.lateMinutes).toBe(15);
  });

  it('pas de retard le week-end ni un jour férié', () => {
    expect(day([['10:00', '14:00']], [], SETTINGS, SAT).lateMinutes).toBe(0);
    const h = normalizeHolidays(['2026-11-10']);
    const m = computeDayMetrics(TUE, [{ entryTime: '10:00', exitTime: '14:00' }], [], SETTINGS, { ...ctx, holidays: h });
    expect(m.lateMinutes).toBe(0);
    expect(m.netMinutes).toBe(240); // le temps travaillé reste compté
    expect(lateMinutesFor(TUE, '10:00', '08:45', h)).toBe(0);
    expect(lateMinutesFor(TUE, '10:00', '08:45')).toBe(75);
  });

  it('un retard sans sortie (session en cours) est quand même détecté', () => {
    const m = day([['09:30', null]]);
    expect(m.lateMinutes).toBe(45);
    expect(m.hasOpenSession).toBe(true);
    expect(m.netMinutes).toBe(0);
  });
});

describe('plusieurs sessions dans une journée', () => {
  it('additionne les sessions sans double comptage (08:00–12:00 + 13:30–17:45)', () => {
    const m = day([['08:00', '12:00'], ['13:30', '17:45']]);
    expect(m.sessions.map((s) => s.netMinutes)).toEqual([240, 255]);
    expect(m.netMinutes).toBe(495);
    expect(m.sessions.reduce((s, x) => s + x.netMinutes, 0)).toBe(m.netMinutes);
  });

  it('fusionne deux sessions qui se chevauchent (aucune minute comptée deux fois)', () => {
    const m = day([['08:00', '12:00'], ['11:00', '14:00']]);
    expect(m.grossMinutes).toBe(360); // 08:00 → 14:00
    expect(m.netMinutes).toBe(360);
  });

  it('ignore le doublon d\'un même numéro de session (doublon base de données)', () => {
    const m = computeDayMetrics(TUE, [
      { entryTime: '08:00', exitTime: '12:00', sessionNumber: 1 },
      { entryTime: '08:00', exitTime: '12:00', sessionNumber: 1 },
    ], [], SETTINGS, ctx);
    expect(m.netMinutes).toBe(240);
  });

  it('une session incomplète n\'ajoute pas de minutes aux autres', () => {
    const m = day([['08:00', '12:00'], ['13:30', null]]);
    expect(m.netMinutes).toBe(240);
    expect(m.hasOpenSession).toBe(true);
  });
});

describe('pauses', () => {
  it('cumule plusieurs pauses', () => {
    const m = day([['08:45', '17:30']], [['10:30', '10:45'], ['12:30', '13:15'], ['15:30', '15:40']]);
    expect(m.breakMinutes).toBe(15 + 45 + 10);
    expect(m.netMinutes).toBe(525 - 70);
  });

  it('fusionne des pauses qui se chevauchent (pas de double déduction)', () => {
    const m = day([['08:45', '17:30']], [['12:00', '13:00'], ['12:30', '13:30']]);
    expect(m.breakMinutes).toBe(90);
    expect(m.netMinutes).toBe(435);
  });

  it('une pause strictement entre deux sessions n\'est PAS déduite (l\'employé était sorti)', () => {
    const m = day([['08:00', '12:00'], ['13:30', '17:30']], [['12:00', '13:30']]);
    expect(m.recordedBreakMinutes).toBe(90);
    expect(m.breakMinutes).toBe(0);
    expect(m.netMinutes).toBe(480);
  });

  it('une pause à cheval sur la fin d\'une session n\'est déduite que pour la part incluse', () => {
    const m = day([['08:00', '12:30'], ['14:00', '17:00']], [['12:00', '13:00']]);
    expect(m.breakMinutes).toBe(30);
    expect(m.netMinutes).toBe(270 - 30 + 180);
  });

  it('une pause en cours est bornée à la fin de la session (jamais d\'infini)', () => {
    const m = day([['08:00', '17:00']], [['16:30', null]]);
    expect(m.breakMinutes).toBe(30);
    expect(m.netMinutes).toBe(540 - 30);
  });

  it('pause incohérente (fin ≤ début) ou invalide : ignorée, jamais de durée négative', () => {
    const m = day([['08:00', '17:00']], [['13:00', '12:00'], ['abc', '14:00']]);
    expect(m.breakMinutes).toBe(0);
    expect(m.netMinutes).toBe(540);
  });

  it('le temps travaillé ne peut jamais être négatif', () => {
    const m = day([['08:00', '08:30']], [['07:00', '09:00']]);
    expect(m.netMinutes).toBe(0);
  });

  it('mode « forfait si aucune pause » : 60 min retirées UNE fois par jour, même avec 2 sessions', () => {
    const settings: DaySettings = { ...SETTINGS, breakDeductionMode: 'recorded_or_flat', flatBreakMinutes: 60 };
    const m = day([['08:00', '12:00'], ['13:30', '17:30']], [], settings);
    expect(m.flatDeductionMinutes).toBe(60);
    expect(m.netMinutes).toBe(480 - 60);
    expect(m.sessions.reduce((s, x) => s + x.netMinutes, 0)).toBe(m.netMinutes);
    // dès qu'une pause réelle existe, le forfait ne s'applique plus
    const withBreak = day([['08:00', '17:30']], [['12:30', '13:00']], settings);
    expect(withBreak.flatDeductionMinutes).toBe(0);
    expect(withBreak.netMinutes).toBe(570 - 30);
  });

  it('le forfait ne dépasse jamais le temps travaillé', () => {
    const settings: DaySettings = { ...SETTINGS, breakDeductionMode: 'recorded_or_flat', flatBreakMinutes: 60 };
    expect(day([['08:00', '08:40']], [], settings).netMinutes).toBe(0);
  });
});

describe('heures supplémentaires et départ anticipé (règle journalière : sortie après l\'heure de fin)', () => {
  it('sortie à 19:10 → 100 min d\'heures sup.', () => {
    expect(day([['08:45', '19:10']]).overtimeMinutes).toBe(100);
  });

  it('une journée longue mais finie à l\'heure n\'est PAS en heures sup. (pas de simple « durée > horaire théorique »)', () => {
    expect(day([['07:00', '17:30']]).overtimeMinutes).toBe(0);
  });

  it('sortie anticipée : 16:00 → 90 min', () => {
    const m = day([['08:45', '16:00']]);
    expect(m.earlyExitMinutes).toBe(90);
    expect(m.overtimeMinutes).toBe(0);
  });

  it('plusieurs sessions : la DERNIÈRE sortie de la journée fait foi', () => {
    expect(day([['08:00', '12:00'], ['13:00', '18:15']]).overtimeMinutes).toBe(45);
  });

  it('sans sortie, ni heures sup. ni départ anticipé', () => {
    const m = day([['08:00', null]]);
    expect(m.overtimeMinutes).toBe(0);
    expect(m.earlyExitMinutes).toBe(0);
  });
});

describe('sessions incomplètes, invalides et traversant minuit', () => {
  it('sortie absente → session ouverte, 0 minute travaillée', () => {
    const m = day([['08:45', null]]);
    expect(m.sessions[0].open).toBe(true);
    expect(m.netMinutes).toBe(0);
  });

  it('entrée absente → session ignorée', () => {
    expect(day([[null, '17:30']]).netMinutes).toBe(0);
  });

  it('sortie ≤ entrée (saisie inversée) → aucune durée négative', () => {
    expect(day([['17:30', '08:45']]).netMinutes).toBe(0);
    expect(day([['10:00', '10:00']]).netMinutes).toBe(0);
    expect(sessionInterval(TUE, { entryTime: '17:30', exitTime: '08:45' })).toBeNull();
  });

  it('valeurs nulles / invalides : jamais NaN', () => {
    const m = day([['n/a', '12:99'], [undefined as unknown as string, null]]);
    expect(Number.isNaN(m.netMinutes)).toBe(false);
    expect(m.netMinutes).toBe(0);
  });

  it('la durée d\'une session est un vrai intervalle, indépendant du jour de la semaine', () => {
    // 2026-03-29 : passage à l'heure d'été en Europe, sans effet à Brazzaville
    const m = computeDayMetrics('2026-03-29', [{ entryTime: '01:00', exitTime: '05:00' }], [], SETTINGS, { ...ctx, tz: 'Africa/Brazzaville' });
    expect(m.netMinutes).toBe(240);
    // dans un fuseau à heure d'été, la même plage « murale » ne dure que 3 h
    const paris = computeDayMetrics('2026-03-29', [{ entryTime: '01:00', exitTime: '05:00' }], [], SETTINGS, { ...ctx, tz: 'Europe/Paris' });
    expect(paris.netMinutes).toBe(180);
  });
});

describe('agrégation sur une période (aucun arrondi intermédiaire)', () => {
  it('additionne des entiers : total, retards, heures sup.', () => {
    const days = [
      day([['08:45', '17:30']]),
      day([['09:00', '17:30']], [['12:30', '13:00']]),
      day([['08:00', '19:00']]),
    ];
    const t = aggregateDays(days);
    expect(t.days).toBe(3);
    expect(t.netMinutes).toBe(525 + (510 - 30) + 660);
    expect(t.lateDays).toBe(1);
    expect(t.lateMinutes).toBe(15);
    expect(t.overtimeMinutes).toBe(90);
    expect(Number.isInteger(t.netMinutes)).toBe(true);
  });

  it('une période vide donne des zéros', () => {
    expect(aggregateDays([])).toMatchObject({ days: 0, netMinutes: 0, lateDays: 0, overtimeMinutes: 0 });
  });
});

describe('intervalles', () => {
  it('fusionne, ignore les invalides', () => {
    expect(mergeIntervals([{ start: 5, end: 10 }, { start: 0, end: 6 }, { start: 20, end: 20 }, { start: Number.NaN, end: 3 }])).toEqual([{ start: 0, end: 10 }]);
  });
});

describe('sessions traversant minuit (équipe de nuit, option explicite)', () => {
  const night = { ...ctx, allowOvernight: true };

  it('22:00 → 02:00 dure 4 h et appartient au jour de l\'entrée', () => {
    const m = computeDayMetrics(TUE, [{ entryTime: '22:00', exitTime: '02:00' }], [], SETTINGS, night);
    expect(m.netMinutes).toBe(240);
    expect(m.day).toBe(TUE);
    expect(m.overtimeMinutes).toBe(0);
    expect(m.earlyExitMinutes).toBe(0);
  });

  it('une pause à cheval sur minuit est déduite', () => {
    const m = computeDayMetrics(TUE, [{ entryTime: '22:00', exitTime: '04:00' }], [{ startTime: '23:30', endTime: '00:30' }], SETTINGS, night);
    expect(m.breakMinutes).toBe(60);
    expect(m.netMinutes).toBe(360 - 60);
  });

  it('par défaut (option désactivée) une sortie avant l\'entrée est refusée, pas devinée', () => {
    const m = computeDayMetrics(TUE, [{ entryTime: '22:00', exitTime: '02:00' }], [], SETTINGS, ctx);
    expect(m.netMinutes).toBe(0);
  });

  it('un changement d\'année pendant la session est correct (31/12 23:00 → 01/01 01:30)', () => {
    const m = computeDayMetrics('2026-12-31', [{ entryTime: '23:00', exitTime: '01:30' }], [], SETTINGS, night);
    expect(m.netMinutes).toBe(150);
  });
});

describe('validation d\'une saisie manuelle', () => {
  it.each([
    ['08:45', '17:30', null],
    ['08:45', null, null],
    [null, null, null],
    ['17:30', '08:45', "L'heure de sortie doit être postérieure à l'heure d'entrée"],
    ['10:00', '10:00', "L'heure de sortie doit être postérieure à l'heure d'entrée"],
    [null, '17:30', "Une heure de sortie nécessite une heure d'entrée"],
    ['25:00', '17:30', "Heure d'entrée invalide (format HH:mm attendu)"],
    ['08:45', '12:75', 'Heure de sortie invalide (format HH:mm attendu)'],
  ])('entrée %s / sortie %s → %s', (entry, exit, expected) => {
    expect(validateSessionTimes(entry, exit)).toBe(expected);
  });
});
