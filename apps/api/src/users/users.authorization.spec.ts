import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';

const admin = { id: 'a1', role: 'admin' };
const manager = { id: 'm1', role: 'manager' };

function service(targetRole: string | null) {
  const prisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue(targetRole ? { id: 't1', role: targetRole } : null),
    },
  };
  return new UsersService(prisma as never);
}

describe('UsersService — contrôle des privilèges (R-01)', () => {
  it('un manager ne peut pas se promouvoir admin', async () => {
    await expect(
      service('manager').assertCanUpdate(manager, 'm1', { role: 'admin' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un manager ne peut pas modifier un rôle, même pour un employé', async () => {
    await expect(
      service('employee').assertCanUpdate(manager, 't1', { role: 'manager' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un manager ne peut pas modifier un compte admin', async () => {
    await expect(
      service('admin').assertCanUpdate(manager, 't1', {
        firstname: 'x',
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un manager peut désactiver un employé', async () => {
    await expect(
      service('employee').assertCanUpdate(manager, 't1', {
        status: 'inactive',
      }),
    ).resolves.toBeUndefined();
  });

  it('un admin ne peut pas modifier son propre rôle', async () => {
    await expect(
      service('admin').assertCanUpdate(admin, 'a1', { role: 'employee' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un admin peut changer le rôle d’un autre compte', async () => {
    await expect(
      service('employee').assertCanUpdate(admin, 't1', { role: 'manager' }),
    ).resolves.toBeUndefined();
  });

  it('rejette un rôle inconnu', async () => {
    await expect(
      service('employee').assertCanUpdate(admin, 't1', { role: 'root' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('un manager ne peut créer qu’un employé', () => {
    const s = service(null);
    expect(() => s.assertCanCreate(manager, { role: 'admin' })).toThrow(
      ForbiddenException,
    );
    expect(() => s.assertCanCreate(manager, {})).not.toThrow();
    expect(() => s.assertCanCreate(admin, { role: 'admin' })).not.toThrow();
  });

  it('un manager ne peut pas supprimer un admin ni lui-même', async () => {
    await expect(
      service('admin').assertCanDelete(manager, 't1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service('manager').assertCanDelete(manager, 'm1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
