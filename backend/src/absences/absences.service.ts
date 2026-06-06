import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  encryptAbsence,
  decryptAbsence,
  decryptUser,
} from '../lib/prisma-crypto.helper';
import type { AbsenceType } from '../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';

@Injectable()
export class AbsencesService {
  constructor(private readonly prisma: PrismaService) {}

  async getForUser(userId: string) {
    const rows = await this.prisma.absence.findMany({
      where: { userId },
      orderBy: { startDate: 'desc' },
    });
    return rows.map((a) => decryptAbsence(a));
  }

  async getTeamAbsences(requesterId: string, requesterRole: string) {
    const candidates = await this.prisma.user.findMany({
      where: { status: 'active', hiddenFromLists: false },
      select: { id: true, department: true },
    });

    let teamIds: string[];
    if (requesterRole === 'manager' || requesterRole === 'team_lead') {
      const requester = await this.prisma.user.findUnique({
        where: { id: requesterId },
      });
      const dept = requester
        ? (decryptUser(requester).department ?? null)
        : null;
      teamIds = dept
        ? candidates
            .filter((u) => {
              try {
                return decryptUser(u).department === dept;
              } catch {
                return false;
              }
            })
            .map((u) => u.id)
        : candidates.map((u) => u.id);
    } else {
      teamIds = candidates.map((u) => u.id);
    }

    if (teamIds.length === 0) return [];
    const rows = await this.prisma.absence.findMany({
      where: { userId: { in: teamIds }, status: 'approved' },
      orderBy: { startDate: 'asc' },
    });
    return rows.map((a) => decryptAbsence(a));
  }

  async request(
    userId: string,
    data: { type: string; startDate: string; endDate: string; reason: string },
  ) {
    const enc = encryptAbsence({ reason: data.reason });
    const a = await this.prisma.absence.create({
      data: {
        userId,
        type: data.type as AbsenceType,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        reason: enc.reason!,
        status: 'pending',
      },
    });
    return decryptAbsence(a);
  }

  /**
   * Vérifie que l'absence concernée appartient à un employé du même département
   * que le manager demandeur. Les admins sont exemptés de cette restriction.
   */
  private async assertDepartmentScope(
    absenceId: string,
    requester: AuthenticatedUser,
  ): Promise<void> {
    if (requester.role === 'admin') return;
    const absence = await this.prisma.absence.findUnique({
      where: { id: absenceId },
      select: { userId: true },
    });
    if (!absence) throw new NotFoundException('Absence introuvable');

    const employee = await this.prisma.user.findUnique({
      where: { id: absence.userId },
    });
    if (!employee) return;

    const employeeDept = decryptUser(employee).department ?? null;
    if (employeeDept !== requester.department) {
      throw new ForbiddenException(
        "Accès refusé : cet employé n'appartient pas à votre département",
      );
    }
  }

  async approve(absenceId: string, requester: AuthenticatedUser) {
    await this.assertDepartmentScope(absenceId, requester);
    const a = await this.prisma.absence.findUnique({
      where: { id: absenceId },
    });
    if (!a) throw new NotFoundException('Absence introuvable');
    const updated = await this.prisma.absence.update({
      where: { id: absenceId },
      data: { status: 'approved' },
    });
    await this.prisma.activityLog.create({
      data: {
        userId: requester.id,
        action: 'Congé approuvé',
        details: `Absence ${absenceId} approuvée`,
        timestamp: new Date(),
        type: 'absence',
      },
    });
    return decryptAbsence(updated);
  }

  async reject(
    absenceId: string,
    requester: AuthenticatedUser,
    comment?: string,
  ) {
    await this.assertDepartmentScope(absenceId, requester);
    const a = await this.prisma.absence.findUnique({
      where: { id: absenceId },
    });
    if (!a) throw new NotFoundException('Absence introuvable');
    const enc = encryptAbsence({ comment: comment || '' });
    const updated = await this.prisma.absence.update({
      where: { id: absenceId },
      data: { status: 'rejected', comment: enc.comment },
    });
    await this.prisma.activityLog.create({
      data: {
        userId: requester.id,
        action: 'Congé refusé',
        details: `Absence ${absenceId} refusée`,
        timestamp: new Date(),
        type: 'absence',
      },
    });
    return decryptAbsence(updated);
  }

  async createManaged(
    requester: AuthenticatedUser,
    data: {
      userId: string;
      type: string;
      startDate: string;
      endDate: string;
      reason: string;
    },
  ) {
    // Vérifier que l'employé cible est dans le département du manager
    if (requester.role !== 'admin') {
      const employee = await this.prisma.user.findUnique({
        where: { id: data.userId },
      });
      if (employee) {
        const employeeDept = decryptUser(employee).department ?? null;
        if (employeeDept !== requester.department) {
          throw new ForbiddenException(
            "Accès refusé : cet employé n'appartient pas à votre département",
          );
        }
      }
    }

    const enc = encryptAbsence({ reason: data.reason });
    const a = await this.prisma.absence.create({
      data: {
        userId: data.userId,
        type: data.type as AbsenceType,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        reason: enc.reason!,
        status: 'approved',
      },
    });
    return decryptAbsence(a);
  }

  async updateManaged(
    absenceId: string,
    data: { startDate?: string; endDate?: string; reason?: string },
    requester: AuthenticatedUser,
  ) {
    await this.assertDepartmentScope(absenceId, requester);
    const enc = encryptAbsence({ reason: data.reason });
    const updated = await this.prisma.absence.update({
      where: { id: absenceId },
      data: {
        ...(data.startDate ? { startDate: new Date(data.startDate) } : {}),
        ...(data.endDate ? { endDate: new Date(data.endDate) } : {}),
        ...(data.reason ? { reason: enc.reason } : {}),
      },
    });
    return decryptAbsence(updated);
  }

  async deleteManaged(absenceId: string, requester: AuthenticatedUser) {
    await this.assertDepartmentScope(absenceId, requester);
    await this.prisma.absence.delete({ where: { id: absenceId } });
    return { success: true };
  }
}
