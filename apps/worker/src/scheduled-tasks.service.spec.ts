import { ScheduledTasksService } from './scheduled-tasks.service';

// Les imports "api/..." sont mockés : on ne teste ici que l'idempotence propre au worker.
jest.mock('api/ldap/ldap-sync.service', () => ({ LdapSyncService: class {} }));
jest.mock('api/email/scheduled-email.service', () => ({
  ScheduledEmailService: class {},
  getCalendarDateInTZ: () => ({ dow: 1, day: 1 }),
}));
jest.mock('api/pointages/pointages.service', () => ({
  PointagesService: class {},
}));

function build(lockResult: boolean, maxSessionEndTime = '00:00') {
  const prisma = {
    systemSettings: {
      findFirst: jest.fn().mockResolvedValue({ maxSessionEndTime }),
    },
    pointage: {
      findMany: jest.fn().mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]),
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
  };
  const locks = { once: jest.fn().mockResolvedValue(lockResult) };
  const svc = new ScheduledTasksService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    locks as never,
  );
  return { svc, prisma, locks };
}

describe('ScheduledTasksService.autoCloseCheck', () => {
  it('clôture les pointages actifs une fois le seuil atteint et le verrou obtenu', async () => {
    const { svc, prisma } = build(true);
    await expect(svc.autoCloseCheck()).resolves.toEqual({ closed: 2 });
    expect(prisma.pointage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isActive: false, status: 'admin_closed' },
      }),
    );
  });

  it("ne fait rien si une autre instance a déjà traité la journée", async () => {
    const { svc, prisma } = build(false);
    await expect(svc.autoCloseCheck()).resolves.toMatchObject({
      skipped: 'already-done',
    });
    expect(prisma.pointage.updateMany).not.toHaveBeenCalled();
  });

  it("n'agit pas avant l'heure limite", async () => {
    const { svc, locks } = build(true, '23:59');
    const res = await svc.autoCloseCheck();
    // Avant 23:59 : aucun verrou pris, aucune clôture (sauf exécution à 23:59 pile)
    if (new Date().getHours() * 60 + new Date().getMinutes() < 23 * 60 + 59) {
      expect(res).toMatchObject({ skipped: 'before-threshold' });
      expect(locks.once).not.toHaveBeenCalled();
    }
  });
});
