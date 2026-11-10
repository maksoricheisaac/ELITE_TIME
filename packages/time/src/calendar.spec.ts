import { classifyPeriod, countWorkingDays, isWorkingDay, leaveBreakdown, normalizeHolidays } from './calendar';

describe('jours ouvrés et jours fériés', () => {
  it('les week-ends ne sont pas ouvrés', () => {
    expect(isWorkingDay('2026-11-07')).toBe(false); // samedi
    expect(isWorkingDay('2026-11-08')).toBe(false); // dimanche
    expect(isWorkingDay('2026-11-09')).toBe(true); // lundi
  });

  it('lit tolérament le réglage « holidays » et ignore les valeurs invalides', () => {
    const h = normalizeHolidays(['2026-12-25', '2026-02-30', 'noël', null, 42, { date: '2027-01-01T00:00:00.000Z' }]);
    expect([...h].sort()).toEqual(['2026-12-25', '2027-01-01']);
    expect(normalizeHolidays(undefined).size).toBe(0);
    expect(normalizeHolidays('2026-12-25').size).toBe(0);
  });

  it('exclut les fériés des jours ouvrés', () => {
    const h = normalizeHolidays(['2026-11-11']);
    expect(isWorkingDay('2026-11-11', h)).toBe(false);
    expect(countWorkingDays('2026-11-09', '2026-11-13')).toBe(5);
    expect(countWorkingDays('2026-11-09', '2026-11-13', h)).toBe(4);
  });

  it('compte une semaine complète (lundi→dimanche) = 5 jours ouvrés', () => {
    expect(countWorkingDays('2026-11-09', '2026-11-15')).toBe(5);
  });
});

describe('congés', () => {
  it('compte les jours d\'un congé de plusieurs jours (week-end exclu des jours ouvrés)', () => {
    // vendredi 13 → mardi 17 : 5 jours calendaires, 3 ouvrés (ven, lun, mar)
    const r = leaveBreakdown({ startDate: '2026-11-13T00:00:00+01:00', endDate: '2026-11-17T00:00:00+01:00' });
    expect(r.calendarDays).toBe(5);
    expect(r.workingDays).toBe(3);
    expect(r.workingDayKeys).toEqual(['2026-11-13', '2026-11-16', '2026-11-17']);
  });

  it('un congé d\'un seul jour compte pour 1', () => {
    expect(leaveBreakdown({ startDate: '2026-11-10T00:00:00+01:00', endDate: '2026-11-10T00:00:00+01:00' }).workingDays).toBe(1);
  });

  it('retire un férié du décompte', () => {
    const h = normalizeHolidays(['2026-11-11']);
    const r = leaveBreakdown({ startDate: '2026-11-09T00:00:00+01:00', endDate: '2026-11-13T00:00:00+01:00' }, { holidays: h });
    expect(r.workingDays).toBe(4);
  });

  it('répartit un congé à cheval sur deux mois sans double comptage', () => {
    const leave = { startDate: '2026-11-26T00:00:00+01:00', endDate: '2026-12-04T00:00:00+01:00' };
    const nov = leaveBreakdown(leave, { within: { from: '2026-11-01', to: '2026-11-30' } });
    const dec = leaveBreakdown(leave, { within: { from: '2026-12-01', to: '2026-12-31' } });
    const all = leaveBreakdown(leave);
    expect(nov.workingDays).toBe(3); // jeu 26, ven 27, lun 30
    expect(dec.workingDays).toBe(4); // mar 1, mer 2, jeu 3, ven 4
    expect(nov.workingDays + dec.workingDays).toBe(all.workingDays);
  });

  it('répartit un congé à cheval sur deux années', () => {
    const leave = { startDate: '2026-12-29T00:00:00+01:00', endDate: '2027-01-05T00:00:00+01:00' };
    const y26 = leaveBreakdown(leave, { within: { from: '2026-01-01', to: '2026-12-31' } });
    const y27 = leaveBreakdown(leave, { within: { from: '2027-01-01', to: '2027-12-31' } });
    expect(y26.workingDays).toBe(3); // mar 29, mer 30, jeu 31
    expect(y27.workingDays).toBe(3); // ven 1, lun 4, mar 5
    expect(y26.workingDays + y27.workingDays).toBe(leaveBreakdown(leave).workingDays);
  });

  it('rattache les bornes au jour de Brazzaville, pas au jour UTC', () => {
    // 22:30Z le 9 = 23:30 le 9 à Brazzaville ; 23:30Z le 9 = 00:30 le 10
    const r = leaveBreakdown({ startDate: '2026-11-09T23:30:00Z', endDate: '2026-11-10T22:30:00Z' });
    expect(r.workingDayKeys).toEqual(['2026-11-10']);
  });

  it('renvoie 0 pour des dates invalides ou inversées', () => {
    expect(leaveBreakdown({ startDate: 'x', endDate: 'y' }).workingDays).toBe(0);
    expect(leaveBreakdown({ startDate: '2026-11-12T00:00:00+01:00', endDate: '2026-11-10T00:00:00+01:00' }).workingDays).toBe(0);
  });
});

describe('classement des jours d\'une période', () => {
  const base = { from: '2026-11-09', to: '2026-11-15', today: '2026-11-15' };

  it('journée sans pointage = absence ; congé approuvé = congé (jamais les deux)', () => {
    const r = classifyPeriod({
      ...base,
      workedDayKeys: new Set(['2026-11-09', '2026-11-10']),
      approvedLeaveDayKeys: new Set(['2026-11-11', '2026-11-12']),
    });
    expect(r).toMatchObject({ workingDays: 5, elapsedWorkingDays: 5, workedDays: 2, leaveDays: 2, absentDays: 1 });
    expect(r.absentDayKeys).toEqual(['2026-11-13']);
    expect(r.workedDays + r.leaveDays + r.absentDays).toBe(r.elapsedWorkingDays);
  });

  it('un jour futur n\'est jamais une absence', () => {
    const r = classifyPeriod({ ...base, today: '2026-11-10', workedDayKeys: new Set(['2026-11-09', '2026-11-10']), approvedLeaveDayKeys: new Set() });
    expect(r.workingDays).toBe(5);
    expect(r.elapsedWorkingDays).toBe(2);
    expect(r.absentDays).toBe(0);
  });

  it('un jour de congé travaillé reste un jour travaillé (pas de double comptage)', () => {
    const r = classifyPeriod({ ...base, workedDayKeys: new Set(['2026-11-09']), approvedLeaveDayKeys: new Set(['2026-11-09']) });
    expect(r.workedDays).toBe(1);
    expect(r.leaveDays).toBe(0);
  });

  it('un jour férié sans pointage n\'est pas une absence', () => {
    const r = classifyPeriod({ ...base, workedDayKeys: new Set(), approvedLeaveDayKeys: new Set(), holidays: normalizeHolidays(['2026-11-11']) });
    expect(r.workingDays).toBe(4);
    expect(r.absentDays).toBe(4);
  });

  it('signale le travail effectué un jour non ouvré sans le transformer en retard ou absence', () => {
    const r = classifyPeriod({ ...base, workedDayKeys: new Set(['2026-11-14']), approvedLeaveDayKeys: new Set() });
    expect(r.workedOffDays).toBe(1);
  });

  it('période d\'un seul jour et période vide', () => {
    expect(classifyPeriod({ from: '2026-11-10', to: '2026-11-10', today: '2026-11-10', workedDayKeys: new Set(), approvedLeaveDayKeys: new Set() }).absentDays).toBe(1);
    expect(classifyPeriod({ from: '2026-11-10', to: '2026-11-09', today: '2026-11-10', workedDayKeys: new Set(), approvedLeaveDayKeys: new Set() }).workingDays).toBe(0);
  });

  it('traverse deux mois et deux années', () => {
    const r = classifyPeriod({ from: '2026-12-28', to: '2027-01-08', today: '2027-01-08', workedDayKeys: new Set(), approvedLeaveDayKeys: new Set() });
    expect(r.workingDays).toBe(10);
  });
});
