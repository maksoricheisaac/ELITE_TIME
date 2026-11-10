/* eslint-disable -- doublure Prisma en mémoire : typage volontairement lâche */
process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY ||
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.BUSINESS_TIMEZONE = 'Africa/Brazzaville';

import { BadRequestException } from '@nestjs/common';
import { encrypt, decrypt } from '@elitetime/shared';
import { PointagesService } from './pointages.service';
import { BreaksService } from '../breaks/breaks.service';
import { WorkTimeService } from '../work-time/work-time.service';

type Row = Record<string, any>;

/** Mini Prisma en mémoire : juste ce dont ont besoin pointages / pauses / calcul du temps. */
function fakePrisma() {
  const db = { pointage: [] as Row[], break: [] as Row[] };
  let seq = 0;
  const inRange = (r: Row, w: Row) =>
    (!w.userId || r.userId === w.userId) &&
    (!w.date?.gte || r.date >= w.date.gte) &&
    (!w.date?.lte || r.date <= w.date.lte) &&
    (w.sessionNumber === undefined || r.sessionNumber === w.sessionNumber) &&
    (w.endTime !== null || r.endTime == null) &&
    (w.isActive === undefined || r.isActive === w.isActive) &&
    (w.exitTime !== null || r.exitTime == null);
  const model = (rows: Row[]) => ({
    findMany: async ({ where = {} }: Row = {}) =>
      rows.filter((r) => inRange(r, where)),
    findFirst: async ({ where = {} }: Row = {}) =>
      rows.find((r) => inRange(r, where)) ?? null,
    findUniqueOrThrow: async ({ where }: Row) =>
      rows.find((r) => r.id === where.id)!,
    create: async ({ data }: Row) => {
      const row = {
        id: `id${++seq}`,
        duration: 0,
        isActive: false,
        status: 'normal',
        ...data,
      };
      if (data.user) {
        row.userId = data.user.connect.id;
        delete row.user;
      }
      rows.push(row);
      return row;
    },
    update: async ({ where, data }: Row) =>
      Object.assign(
        rows.find((r) => r.id === where.id)!,
        data,
      ),
    updateMany: async () => ({ count: 0 }),
    deleteMany: async ({ where }: Row) => {
      for (let i = rows.length - 1; i >= 0; i--) {
        if (
          rows[i].userId === where.userId &&
          rows[i].sessionNumber > where.sessionNumber.gt
        )
          rows.splice(i, 1);
      }
    },
  });
  const prisma: Row = {
    pointage: model(db.pointage),
    break: model(db.break),
    systemSettings: {
      findFirst: async () => ({
        workStartTime: '08:45',
        workEndTime: '17:30',
        maxSessionEndTime: '20:00',
        breakDuration: 60,
        holidays: [],
        timezone: 'Africa/Brazzaville',
      }),
    },
    activityLog: { create: async () => ({}) },
    user: { findUnique: async () => null },
    absence: { findFirst: async () => null },
    $executeRaw: async () => 0,
    $transaction: async (fn: (tx: Row) => Promise<unknown>) => fn(prisma),
  };
  return { prisma, db };
}

const day = '2026-11-10'; // mardi
const when = (hm: string) => new Date(`${day}T${hm}:00+01:00`);
const brk = (userId: string, start: string, end: string | null) => ({
  id: `b${start}`,
  userId,
  date: when(start),
  startTime: encrypt(start),
  endTime: end ? encrypt(end) : null,
  duration: null,
});

function setup() {
  const { prisma, db } = fakePrisma();
  const workTime = new WorkTimeService(prisma as any);
  const pointages = new PointagesService(prisma as any, workTime);
  const breaks = new BreaksService(prisma as any, workTime);
  return { prisma, db, workTime, pointages, breaks };
}

describe('PointagesService.managerUpsert — saisie manuelle', () => {
  it("refuse une sortie antérieure ou égale à l'entrée (aucune durée négative en base)", async () => {
    const { pointages, db } = setup();
    await expect(
      pointages.managerUpsert('m', 'u1', day, '17:00', '08:00', null, null),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pointages.managerUpsert('m', 'u1', day, '09:00', '09:00', null, null),
    ).rejects.toThrow(/postérieure/);
    expect(db.pointage).toHaveLength(0);
  });

  it('refuse une heure illisible, une sortie sans entrée, une date invalide', async () => {
    const { pointages } = setup();
    await expect(
      pointages.managerUpsert('m', 'u1', day, '25:00', null, null, null),
    ).rejects.toThrow(/invalide/);
    await expect(
      pointages.managerUpsert('m', 'u1', day, null, '17:00', null, null),
    ).rejects.toThrow(/nécessite/);
    await expect(
      pointages.managerUpsert(
        'm',
        'u1',
        '2026-02-30',
        '08:00',
        '17:00',
        null,
        null,
      ),
    ).rejects.toThrow(/Date invalide/);
    await expect(
      pointages.managerUpsert('m', 'u1', day, '08:00', '17:00', null, null, 0),
    ).rejects.toThrow(/session/);
  });

  it('journée simple sans pause : durée = sortie − entrée (aucun forfait caché)', async () => {
    const { pointages, db } = setup();
    await pointages.managerUpsert('m', 'u1', day, '08:30', '17:30', null, null);
    expect(db.pointage[0].duration).toBe(540);
    expect(db.pointage[0].status).toBe('normal');
  });

  it('retard détecté sur la première session uniquement', async () => {
    const { pointages, db } = setup();
    await pointages.managerUpsert(
      'm',
      'u1',
      day,
      '09:10',
      '12:00',
      null,
      null,
      1,
    );
    await pointages.managerUpsert(
      'm',
      'u1',
      day,
      '13:30',
      '17:30',
      null,
      null,
      2,
    );
    expect(db.pointage.map((p) => p.status)).toEqual(['late', 'normal']);
  });

  it('pause enregistrée dans la session : déduite une fois, et recalculée quand on modifie la journée', async () => {
    const { pointages, db } = setup();
    db.break.push(brk('u1', '12:00', '13:00'));
    await pointages.managerUpsert('m', 'u1', day, '08:00', '17:00', null, null);
    expect(db.pointage[0].duration).toBe(480);
    await pointages.managerUpsert('m', 'u1', day, '08:00', '18:00', null, null); // modification manuelle
    expect(db.pointage[0].duration).toBe(540);
  });

  it('deux sessions + pause entre elles : pas de double déduction', async () => {
    const { pointages, db } = setup();
    db.break.push(brk('u1', '12:00', '13:00'));
    await pointages.managerUpsert(
      'm',
      'u1',
      day,
      '08:45',
      '12:00',
      null,
      null,
      1,
    );
    await pointages.managerUpsert(
      'm',
      'u1',
      day,
      '13:00',
      '17:30',
      null,
      null,
      2,
    );
    expect(db.pointage.map((p) => p.duration)).toEqual([195, 270]);
  });

  it('session sans sortie : durée 0 et statut incomplet', async () => {
    const { pointages, db } = setup();
    await pointages.managerUpsert(
      'm',
      'u1',
      '2026-11-03',
      '08:00',
      null,
      null,
      null,
    );
    expect(db.pointage[0]).toMatchObject({
      duration: 0,
      status: 'incomplete',
      isActive: false,
    });
  });

  it('les heures sont chiffrées en base mais lisibles en retour', async () => {
    const { pointages, db } = setup();
    const res = await pointages.managerUpsert(
      'm',
      'u1',
      day,
      '08:30',
      '17:30',
      null,
      null,
    );
    expect(db.pointage[0].entryTime).not.toBe('08:30');
    expect(decrypt(db.pointage[0].entryTime)).toBe('08:30');
    expect(res.entryTime).toBe('08:30');
  });
});

describe('WorkTimeService.recomputeDay', () => {
  it('corrige une durée historique erronée et reste idempotent', async () => {
    const { pointages, workTime, db } = setup();
    await pointages.managerUpsert('m', 'u1', day, '08:00', '17:00', null, null);
    db.pointage[0].duration = 999; // donnée corrompue
    expect(await workTime.recomputeDay('u1', day)).toBe(1);
    expect(db.pointage[0].duration).toBe(540);
    expect(await workTime.recomputeDay('u1', day)).toBe(0);
  });

  it('ajouter une pause après coup puis recalculer abaisse le temps travaillé', async () => {
    const { pointages, workTime, db } = setup();
    await pointages.managerUpsert('m', 'u1', day, '08:00', '17:00', null, null);
    expect(db.pointage[0].duration).toBe(540);
    db.break.push(brk('u1', '12:00', '13:00'));
    await workTime.recomputeDay('u1', day);
    expect(db.pointage[0].duration).toBe(480);
  });
});
