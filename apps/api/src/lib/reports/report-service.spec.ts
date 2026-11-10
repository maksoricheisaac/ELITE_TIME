import type { Break, Pointage, User } from '@elitetime/database';
import { aggregateDays, computeDayMetrics } from '@elitetime/time';
import { groupPointagesByDay } from './report-service';
import { ReportCalculator } from './report-calculator';
import { generateNewExcelReport } from './new-excel-generator';
import { renderNewPointagesReportHtml } from './new-pointages-report-template';

const TZ = 'Africa/Brazzaville';
const thresholds = {
  lateThreshold: '08:45',
  overtimeThreshold: '17:30',
  tz: TZ,
};

const user = {
  id: 'u1',
  firstname: 'Awa',
  lastname: 'Ngoma',
  position: 'Comptable',
  department: 'Finance',
} as unknown as User;

/** « HH:mm » à Brazzaville (UTC+1) → instant UTC du pointage */
const at = (day: string, hm: string) => new Date(`${day}T${hm}:00+01:00`);

function p(
  day: string,
  n: number,
  entry: string | null,
  exit: string | null,
  extra: Partial<Pointage> = {},
): Pointage {
  return {
    id: `${day}-${n}`,
    userId: 'u1',
    date: at(day, entry && /^\d{2}:\d{2}$/.test(entry) ? entry : '08:00'),
    sessionNumber: n,
    entryTime: entry,
    exitTime: exit,
    duration: 0, // volontairement faux : le rapport ne doit PAS se fier à la valeur stockée
    status: 'normal',
    isActive: false,
    lateReason: null,
    earlyExitReason: null,
    ...extra,
  } as unknown as Pointage;
}

function b(day: string, start: string, end: string | null): Break {
  return {
    id: `${day}-${start}`,
    userId: 'u1',
    date: at(day, start),
    startTime: start,
    endTime: end,
    duration: null,
  } as unknown as Break;
}

const one = (pointages: Pointage[], breaks: Break[] = [], th = thresholds) =>
  groupPointagesByDay([user], pointages, breaks, undefined, th);

describe('rapports : calculs via le moteur commun', () => {
  it('journée normale : 08:30 → 17:30, pause 1 h = 8 h de travail', () => {
    const [day] = one(
      [p('2026-11-10', 1, '08:30', '17:30')],
      [b('2026-11-10', '12:00', '13:00')],
    );
    const c = day.employees[0].computation;
    expect(c).toMatchObject({
      workMinutes: 480,
      breakMinutes: 60,
      lateMinutes: 0,
      overtimeMinutes: 0,
      earlyExitMinutes: 0,
    });
  });

  it.each([
    ['5 minutes', '08:50', 5],
    ['15 minutes', '09:00', 15],
    ['30 minutes', '09:15', 30],
  ])('retard de %s', (_l, entry, late) => {
    const [day] = one([p('2026-11-10', 1, entry, '17:30')]);
    expect(day.employees[0].computation.lateMinutes).toBe(late);
  });

  it("entrée pile à l'heure ou en avance : pas de retard", () => {
    expect(
      one([p('2026-11-10', 1, '08:45', '17:30')])[0].employees[0].computation
        .lateMinutes,
    ).toBe(0);
    expect(
      one([p('2026-11-10', 1, '08:00', '17:30')])[0].employees[0].computation
        .lateMinutes,
    ).toBe(0);
  });

  it("plusieurs sessions : la pause ENTRE les sessions n'est pas déduite deux fois", () => {
    const [day] = one(
      [
        p('2026-11-10', 1, '08:45', '12:00'),
        p('2026-11-10', 2, '13:00', '17:30'),
      ],
      [b('2026-11-10', '12:00', '13:00')],
    );
    const c = day.employees[0].computation;
    expect(c.workMinutes).toBe(195 + 270); // 465 : la pause est déjà « hors session »
    expect(c.breakMinutes).toBe(0);
    expect(day.employees[0].sessionDetails).toBe(
      'S1: 08:45→12:00, S2: 13:00→17:30',
    );
  });

  it("une pause au milieu d'une session est déduite une seule fois", () => {
    const [day] = one(
      [p('2026-11-10', 1, '08:00', '17:00')],
      [b('2026-11-10', '12:00', '13:00')],
    );
    expect(day.employees[0].computation.workMinutes).toBe(480);
  });

  it("heures supplémentaires : sortie après l'heure de fin", () => {
    const [day] = one([p('2026-11-10', 1, '08:30', '19:00')]);
    expect(day.employees[0].computation.overtimeMinutes).toBe(90);
  });

  it('départ anticipé', () => {
    const [day] = one([p('2026-11-10', 1, '08:30', '16:00')]);
    expect(day.employees[0].computation.earlyExitMinutes).toBe(90);
  });

  it('samedi : jamais de retard ; dimanche : exclu du rapport', () => {
    const days = one([
      p('2026-11-07', 1, '10:00', '14:00'),
      p('2026-11-08', 1, '09:00', '12:00'),
    ]);
    expect(days).toHaveLength(1);
    expect(days[0].dateLabel).toBe('Samedi 07/11/2026');
    expect(days[0].employees[0].computation.lateMinutes).toBe(0);
  });

  it('jour férié : pas de retard', () => {
    const [day] = one([p('2026-11-11', 1, '10:00', '17:30')], [], {
      ...thresholds,
      holidays: new Set(['2026-11-11']),
    } as typeof thresholds);
    expect(day.employees[0].computation.lateMinutes).toBe(0);
  });

  it('session incomplète : aucun temps ni heures sup. inventés', () => {
    const [day] = one([
      p('2026-11-10', 1, '09:00', null, { status: 'incomplete' }),
    ]);
    expect(day.employees[0].status).toBe('incomplete');
    expect(day.employees[0].checkOut).toBe('Départ non pointé');
    expect(day.employees[0].computation).toMatchObject({
      workMinutes: 0,
      overtimeMinutes: 0,
      earlyExitMinutes: 0,
      lateMinutes: 15,
    });
  });

  it('données invalides ou nulles : jamais de NaN ni de durée négative', () => {
    const [day] = one([
      p('2026-11-10', 1, 'abc', '12:00'),
      p('2026-11-10', 2, '14:00', '13:00'),
    ]);
    const c = day.employees[0].computation;
    for (const v of Object.values(c)) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('pointage proche de minuit : rattaché au jour de Brazzaville, pas au jour UTC', () => {
    // 23:30 UTC le 9 = 00:30 le 10 à Brazzaville
    const row = {
      ...p('2026-11-10', 1, '00:30', '02:00'),
      date: new Date('2026-11-09T23:30:00Z'),
    };
    const days = one([row]);
    expect(days[0].dateLabel).toBe('Mardi 10/11/2026');
  });

  it('ne dépend pas du fuseau du processus', () => {
    const before = process.env.TZ;
    const fixture = [p('2026-11-10', 1, '08:30', '17:30')];
    const brk = [b('2026-11-10', '12:00', '13:00')];
    const results = ['UTC', 'America/New_York', 'Pacific/Auckland'].map((z) => {
      process.env.TZ = z;
      return JSON.stringify(
        one(fixture, brk).map((d) => [d.dateLabel, d.employees[0].computation]),
      );
    });
    process.env.TZ = before;
    expect(new Set(results).size).toBe(1);
  });

  it('règle historique `recorded_or_flat` : forfait une seule fois par jour, uniquement sans pause enregistrée', () => {
    const th = {
      ...thresholds,
      breakMode: 'recorded_or_flat' as const,
      flatBreakMinutes: 60,
    };
    const noBreak = one(
      [
        p('2026-11-10', 1, '08:00', '12:00'),
        p('2026-11-10', 2, '13:00', '17:00'),
      ],
      [],
      th,
    );
    expect(noBreak[0].employees[0].computation.workMinutes).toBe(480 - 60);
    const withBreak = one(
      [p('2026-11-10', 1, '08:00', '17:00')],
      [b('2026-11-10', '12:00', '13:00')],
      th,
    );
    expect(withBreak[0].employees[0].computation.workMinutes).toBe(480);
  });
});

describe('cohérence rapport ↔ moteur ↔ totaux', () => {
  const rows = [
    p('2026-11-09', 1, '08:45', '17:30'),
    p('2026-11-10', 1, '09:15', '12:00'),
    p('2026-11-10', 2, '13:00', '18:30'),
    p('2026-11-12', 1, '08:00', '16:30'),
  ];
  const brks = [
    b('2026-11-09', '12:00', '13:00'),
    b('2026-11-12', '12:30', '13:00'),
  ];

  it("le total du rapport égale l'agrégat du moteur sur les mêmes données", () => {
    const days = one(rows, brks);
    const reportTotal = days.reduce(
      (s, d) => s + d.employees[0].computation.workMinutes,
      0,
    );
    const reportLate = days.reduce(
      (s, d) => s + (d.employees[0].computation.lateMinutes > 0 ? 1 : 0),
      0,
    );
    const reportOvertime = days.reduce(
      (s, d) => s + d.employees[0].computation.overtimeMinutes,
      0,
    );

    const engine = aggregateDays(
      ['2026-11-09', '2026-11-10', '2026-11-12'].map((d) =>
        computeDayMetrics(
          d,
          rows
            .filter((r) => r.date.toISOString() && r.id.startsWith(d))
            .map((r) => ({
              sessionNumber: r.sessionNumber,
              entryTime: r.entryTime,
              exitTime: r.exitTime,
            })),
          brks
            .filter((x) => x.id.startsWith(d))
            .map((x) => ({
              day: d,
              startTime: x.startTime,
              endTime: x.endTime,
            })),
          { workStartTime: '08:45', workEndTime: '17:30' },
          { tz: TZ },
        ),
      ),
    );
    expect(reportTotal).toBe(engine.netMinutes);
    expect(reportLate).toBe(engine.lateDays);
    expect(reportOvertime).toBe(engine.overtimeMinutes);
    // valeurs attendues « à la main » : 8h45 − 1h = 7h45 ; (2h45 + 5h30) ; 8h30 − 30 min
    expect(reportTotal).toBe(465 + (165 + 330) + 480);
  });

  it('le calculateur unitaire reste cohérent avec le rapport pour une session simple', () => {
    const c = ReportCalculator.compute(
      '08:30',
      '17:30',
      60,
      undefined,
      new Date('2026-11-10T08:00:00+01:00'),
      thresholds,
    );
    expect(c).toMatchObject({
      workMinutes: 480,
      lateMinutes: 0,
      overtimeMinutes: 0,
    });
    expect(ReportCalculator.compute('abc', null).workMinutes).toBe(0);
  });
});

describe('exports', () => {
  const days = one(
    [
      p('2026-11-09', 1, '08:45', '17:30'),
      p('2026-11-10', 1, '09:15', '19:00', { status: 'late' }),
    ],
    [b('2026-11-09', '12:00', '13:00'), b('2026-11-10', '12:00', '13:00')],
  );

  it('Excel : génère un classeur non vide pour un jour et pour plusieurs jours', async () => {
    const multi = await generateNewExcelReport('09/11/2026 – 10/11/2026', days);
    const single = await generateNewExcelReport('09/11/2026', days.slice(0, 1));
    expect(multi.length).toBeGreaterThan(1000);
    expect(single.length).toBeGreaterThan(1000);
    expect(multi.subarray(0, 2).toString()).toBe('PK'); // fichier xlsx = archive zip
  });

  it('HTML/PDF : affiche les mêmes durées que le calcul', () => {
    const view = days.map((d) => ({
      dateLabel: d.dateLabel,
      employees: d.employees.map((e) => {
        const f = ReportCalculator.formatComputation(e.computation);
        return {
          fullName: e.fullName,
          position: e.position,
          checkIn: e.checkIn,
          checkOut: e.checkOut,
          sessionCount: e.sessionCount,
          workDuration: f.workDuration,
          breakDuration: f.breakDuration,
          lateLabel: f.lateLabel,
          earlyExitLabel: f.earlyExitLabel,
          overtimeLabel: f.overtimeLabel,
          status: e.status,
        };
      }),
    }));
    const html = renderNewPointagesReportHtml({
      periodLabel: 'x',
      generatedAtLabel: 'y',
      days: view,
    });
    expect(html).toContain('7h45min'); // 8h45 − 1h
    expect(html).toContain('8h45min'); // 09:15 → 19:00 − 1 h
  });
});
