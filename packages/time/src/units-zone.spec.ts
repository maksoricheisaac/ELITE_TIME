import {
  formatDurationHuman,
  formatHM,
  hoursToMinutes,
  msToMinutes,
  parseHM,
  percent,
  toSafeMinutes,
} from './units';
import {
  addDays,
  dayEnd,
  dayKeyOf,
  dayStart,
  daysInclusive,
  eachDay,
  isValidDayKey,
  minuteOfDay,
  startOfWeek,
  weekdayOf,
  zonedParts,
  zonedTimeToDate,
} from './zone';

const BZV = 'Africa/Brazzaville';

describe('unités et conversions', () => {
  it('convertit les millisecondes en minutes entières (troncature)', () => {
    expect(msToMinutes(60_000)).toBe(1);
    expect(msToMinutes(59_999)).toBe(0);
    expect(msToMinutes(8 * 3_600_000 + 15 * 60_000)).toBe(495);
  });

  it('refuse les valeurs invalides sans produire NaN ni durée négative', () => {
    expect(msToMinutes(-5)).toBe(0);
    expect(msToMinutes(Number.NaN)).toBe(0);
    expect(msToMinutes(Infinity)).toBe(0);
    expect(toSafeMinutes(null)).toBe(0);
    expect(toSafeMinutes(undefined)).toBe(0);
    expect(toSafeMinutes('abc')).toBe(0);
    expect(toSafeMinutes(-30)).toBe(0);
    expect(toSafeMinutes(Infinity)).toBe(0);
    expect(toSafeMinutes(12.6)).toBe(13);
  });

  it('convertit les heures décimales en minutes sans perte (7,75 h = 465 min)', () => {
    expect(hoursToMinutes(7.75)).toBe(465);
    expect(hoursToMinutes(0.1 + 0.2)).toBe(18); // 0,30000000000000004 h → 18 min, pas 17
    expect(hoursToMinutes(-1)).toBe(0);
  });

  it('distingue une HEURE de la journée d\'une DURÉE', () => {
    expect(parseHM('08:45')).toBe(525);
    expect(parseHM('8:45')).toBe(525);
    expect(parseHM('17:30:59')).toBe(1050);
    expect(parseHM('24:00')).toBeNull();
    expect(parseHM('12:60')).toBeNull();
    expect(parseHM('')).toBeNull();
    expect(parseHM(null)).toBeNull();
    expect(parseHM('abc')).toBeNull();
    expect(formatHM(525)).toBe('08:45');
    expect(formatHM(41 * 60 + 8)).toBe('41:08'); // une durée peut dépasser 24 h
  });

  it('formate les durées lisibles', () => {
    expect(formatDurationHuman(0)).toBe('0 min');
    expect(formatDurationHuman(45)).toBe('45 min');
    expect(formatDurationHuman(120)).toBe('2h');
    expect(formatDurationHuman(465)).toBe('7h45min');
    expect(formatDurationHuman(-10)).toBe('0 min');
  });

  it('calcule des pourcentages sans NaN ni division par zéro', () => {
    expect(percent(5, 20)).toBe(25);
    expect(percent(5, 0)).toBe(0);
    expect(percent(Number.NaN, 10)).toBe(0);
    expect(percent(30, 20)).toBe(100);
  });
});

describe('fuseau métier Africa/Brazzaville (UTC+1, sans heure d\'été)', () => {
  it('convertit UTC ↔ heure de Brazzaville', () => {
    const utc = new Date('2026-11-10T07:45:00Z'); // 08:45 à Brazzaville
    expect(minuteOfDay(utc, BZV)).toBe(525);
    expect(dayKeyOf(utc, BZV)).toBe('2026-11-10');
    expect(zonedTimeToDate('2026-11-10', 525, BZV).toISOString()).toBe('2026-11-10T07:45:00.000Z');
  });

  it('rattache au bon jour les instants proches de minuit', () => {
    // 23:30 UTC le 9 = 00:30 le 10 à Brazzaville
    expect(dayKeyOf(new Date('2026-11-09T23:30:00Z'), BZV)).toBe('2026-11-10');
    // 22:59:59 UTC le 9 = 23:59:59 le 9 à Brazzaville
    expect(dayKeyOf(new Date('2026-11-09T22:59:59Z'), BZV)).toBe('2026-11-09');
    // `toISOString().slice(0,10)` (UTC) se tromperait ici : c'est pourquoi on ne l'utilise jamais
    expect(new Date('2026-11-09T23:30:00Z').toISOString().slice(0, 10)).toBe('2026-11-09');
  });

  it('borne la journée : début 00:00, fin 23:59:59.999 (heure locale)', () => {
    expect(dayStart('2026-11-10', BZV).toISOString()).toBe('2026-11-09T23:00:00.000Z');
    expect(dayEnd('2026-11-10', BZV).toISOString()).toBe('2026-11-10T22:59:59.999Z');
  });

  it('est stable toute l\'année (aucun décalage saisonnier)', () => {
    expect(minuteOfDay(new Date('2026-01-15T08:00:00Z'), BZV)).toBe(9 * 60);
    expect(minuteOfDay(new Date('2026-07-15T08:00:00Z'), BZV)).toBe(9 * 60);
  });

  it('montre le piège Europe/Paris : +1 h l\'hiver, +2 h l\'été (raison pour laquelle le fuseau métier est fixe)', () => {
    expect(minuteOfDay(new Date('2026-01-15T08:00:00Z'), 'Europe/Paris')).toBe(9 * 60);
    expect(minuteOfDay(new Date('2026-07-15T08:00:00Z'), 'Europe/Paris')).toBe(10 * 60);
  });

  it('gère un fuseau à heure d\'été sans erreur à la bascule', () => {
    const start = dayStart('2026-03-29', 'Europe/Paris'); // jour du passage à l'heure d'été
    const end = dayEnd('2026-03-29', 'Europe/Paris');
    expect(msToMinutes(end.getTime() - start.getTime() + 1)).toBe(23 * 60); // journée de 23 h
  });

  it('décompose un instant', () => {
    const p = zonedParts(new Date('2026-11-10T07:45:30Z'), BZV);
    expect(p).toMatchObject({ year: 2026, month: 11, day: 10, hour: 8, minute: 45, second: 30, weekday: 2 });
  });

  it('refuse une date invalide', () => {
    expect(() => zonedParts(new Date('x'), BZV)).toThrow(RangeError);
  });
});

describe('arithmétique calendaire', () => {
  it('valide les jours réels', () => {
    expect(isValidDayKey('2026-02-28')).toBe(true);
    expect(isValidDayKey('2026-02-30')).toBe(false);
    expect(isValidDayKey('2028-02-29')).toBe(true); // bissextile
    expect(isValidDayKey('2026-13-01')).toBe(false);
    expect(isValidDayKey('26-01-01')).toBe(false);
    expect(isValidDayKey(null)).toBe(false);
  });

  it('traverse un changement de mois et d\'année', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('compte les jours inclusifs', () => {
    expect(daysInclusive('2026-11-10', '2026-11-10')).toBe(1);
    expect(daysInclusive('2026-12-30', '2027-01-02')).toBe(4);
    expect(daysInclusive('2026-11-10', '2026-11-09')).toBe(0);
    expect(eachDay('2026-12-30', '2027-01-01')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01']);
  });

  it('donne le jour de la semaine indépendamment du fuseau', () => {
    expect(weekdayOf('2026-11-10')).toBe(2); // mardi
    expect(weekdayOf('2026-11-08')).toBe(0); // dimanche
    expect(startOfWeek('2026-11-10')).toBe('2026-11-09'); // lundi
    expect(startOfWeek('2026-11-08')).toBe('2026-11-02'); // le dimanche appartient à la semaine du lundi précédent
  });
});
