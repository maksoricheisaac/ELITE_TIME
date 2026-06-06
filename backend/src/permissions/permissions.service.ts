import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';

@Injectable()
export class PermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: WebsocketGateway,
  ) {}

  async getAll() {
    return this.prisma.permission.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async getUserPermissions(userId: string) {
    // Retourne les UserPermission avec la Permission imbriquée :
    // { id, permissionId, grantedBy, grantedAt, permission: Permission }
    // Le frontend utilise .permissionId pour les checkboxes et .permission pour l'affichage.
    return this.prisma.userPermission.findMany({
      where: { userId },
      include: { permission: true },
      orderBy: { permission: { name: 'asc' } },
    });
  }

  async grant(userId: string, permissionId: string, grantedBy: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const perm = await this.prisma.permission.findUnique({
      where: { id: permissionId },
    });
    if (!perm) throw new NotFoundException('Permission introuvable');

    const result = await this.prisma.userPermission.upsert({
      where: { userId_permissionId: { userId, permissionId } },
      update: { grantedBy },
      create: { userId, permissionId, grantedBy },
    });

    this.gateway.broadcastPermissionsChanged(userId);
    return result;
  }

  async revoke(userId: string, permissionId: string) {
    await this.prisma.userPermission.deleteMany({
      where: { userId, permissionId },
    });
    this.gateway.broadcastPermissionsChanged(userId);
    return { success: true };
  }

  /**
   * Réinitialise les permissions explicites de l'utilisateur.
   * Les permissions de rôle (ROLE_DEFAULT_PERMISSIONS) sont appliquées
   * dynamiquement par le guard — aucune entrée DB nécessaire.
   */
  async resetToRoleDefaults(userId: string, _grantedBy: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    await this.prisma.userPermission.deleteMany({ where: { userId } });

    this.gateway.broadcastPermissionsChanged(userId);
    return [];
  }
}
