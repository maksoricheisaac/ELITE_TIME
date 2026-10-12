import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import {
  encryptAbsence,
  decryptAbsence,
  decryptUser,
} from '../lib/prisma-crypto.helper';
import { decrypt } from '../lib/crypto';
import type { AbsenceType } from '../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';

type DecisionAuthor = {
  id: string;
  firstname: string;
  lastname: string;
} | null;

function decryptDecisionAuthor(
  user: {
    id: string;
    firstname: string | null;
    lastname: string | null;
  } | null,
): DecisionAuthor {
  if (!user) return null;
  return {
    id: user.id,
    firstname: user.firstname ? decrypt(user.firstname) : '',
    lastname: user.lastname ? decrypt(user.lastname) : '',
  };
}

@Injectable()
export class AbsencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: WebsocketGateway,
  ) {}

  async getForUser(userId: string) {
    const rows = await this.prisma.absence.findMany({
      where: { userId, hidden: false },
      orderBy: { startDate: 'desc' },
      include: {
        approvedBy: { select: { id: true, firstname: true, lastname: true } },
        rejectedBy: { select: { id: true, firstname: true, lastname: true } },
      },
    });
    return rows.map((a) => ({
      ...decryptAbsence(a),
      approvedBy: decryptDecisionAuthor(a.approvedBy),
      rejectedBy: decryptDecisionAuthor(a.rejectedBy),
    }));
  }

  /**
   * @param hasFullAccess Si true (admin, ou permission absences.view_all
   * accordée individuellement), retourne les absences de TOUS les employés
   * sans filtre de département — indépendamment du rôle du demandeur.
   */
  async getTeamAbsences(
    requesterId: string,
    requesterRole: string,
    hasFullAccess = false,
  ) {
    const candidates = await this.prisma.user.findMany({
      where: { status: 'active', hiddenFromLists: false },
      select: { id: true, department: true },
    });

    let teamIds: string[];
    if (
      !hasFullAccess &&
      (requesterRole === 'manager' || requesterRole === 'team_lead')
    ) {
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
      where: { userId: { in: teamIds }, hidden: false },
      orderBy: { startDate: 'asc' },
      include: {
        approvedBy: { select: { id: true, firstname: true, lastname: true } },
        rejectedBy: { select: { id: true, firstname: true, lastname: true } },
      },
    });
    return rows.map((a) => ({
      ...decryptAbsence(a),
      approvedBy: decryptDecisionAuthor(a.approvedBy),
      rejectedBy: decryptDecisionAuthor(a.rejectedBy),
    }));
  }

  /** Valide qu'une plage de dates est bien formée (dates valides, fin >= début). */
  private validateDateRange(startDate: string, endDate: string): void {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Dates invalides');
    }
    if (end < start) {
      throw new BadRequestException(
        'La date de fin doit être postérieure ou égale à la date de début',
      );
    }
  }

  /** Empêche deux absences (hors rejetées) de se chevaucher pour un même employé. */
  private async assertNoOverlap(
    userId: string,
    start: Date,
    end: Date,
    excludeAbsenceId?: string,
  ): Promise<void> {
    const overlapping = await this.prisma.absence.findFirst({
      where: {
        userId,
        status: { notIn: ['rejected', 'cancelled'] },
        ...(excludeAbsenceId ? { id: { not: excludeAbsenceId } } : {}),
        startDate: { lte: end },
        endDate: { gte: start },
      },
    });
    if (overlapping) {
      throw new BadRequestException(
        'Une période de congé chevauchante existe déjà pour cet employé',
      );
    }
  }

  private async logActivity(
    userId: string,
    action: string,
    details: string,
  ): Promise<void> {
    await this.prisma.activityLog.create({
      data: {
        userId,
        action,
        details,
        timestamp: new Date(),
        type: 'absence',
      },
    });
  }

  async request(
    userId: string,
    data: { type: string; startDate: string; endDate: string; reason: string },
  ) {
    this.validateDateRange(data.startDate, data.endDate);
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    await this.assertNoOverlap(userId, start, end);

    const enc = encryptAbsence({ reason: data.reason });
    const a = await this.prisma.absence.create({
      data: {
        userId,
        type: data.type as AbsenceType,
        startDate: start,
        endDate: end,
        reason: enc.reason!,
        status: 'pending',
      },
    });

    await this.logActivity(
      userId,
      'Demande de congé créée',
      `Absence ${a.id} demandée (${data.type}, ${data.startDate} → ${data.endDate})`,
    );

    const requester = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (requester) {
      const decrypted = decryptUser(requester);
      this.gateway.broadcastLeaveRequestCreated({
        absenceId: a.id,
        userId,
        userName:
          `${decrypted.firstname ?? ''} ${decrypted.lastname ?? ''}`.trim(),
        department: decrypted.department ?? null,
      });
    }

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

  /**
   * Vérifie qu'une absence est encore "pending" avant une transition d'état.
   * Les admins peuvent bypasser cette contrainte pour updateManaged/deleteManaged
   * (correction exceptionnelle d'une absence déjà traitée), mais PAS pour
   * approve/reject qui doivent toujours partir d'un état "pending".
   */
  private assertPending(
    absence: { status: string },
    requester: AuthenticatedUser,
    { allowAdminBypass }: { allowAdminBypass: boolean },
  ): void {
    if (absence.status === 'pending') return;
    if (allowAdminBypass && requester.role === 'admin') return;
    throw new BadRequestException(
      'Cette demande de congé a déjà été traitée et ne peut plus être modifiée dans cet état',
    );
  }

  async approve(absenceId: string, requester: AuthenticatedUser) {
    await this.assertDepartmentScope(absenceId, requester);
    const a = await this.prisma.absence.findUnique({
      where: { id: absenceId },
    });
    if (!a) throw new NotFoundException('Absence introuvable');
    this.assertPending(a, requester, { allowAdminBypass: false });
    const updated = await this.prisma.absence.update({
      where: { id: absenceId },
      data: { status: 'approved', approvedById: requester.id },
    });
    await this.logActivity(
      requester.id,
      'Congé approuvé',
      `Absence ${absenceId} approuvée`,
    );
    this.gateway.broadcastLeaveStatusChanged(a.userId, {
      absenceId,
      status: 'approved',
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
    this.assertPending(a, requester, { allowAdminBypass: false });
    const enc = encryptAbsence({ comment: comment || '' });
    const updated = await this.prisma.absence.update({
      where: { id: absenceId },
      data: {
        status: 'rejected',
        comment: enc.comment,
        rejectedById: requester.id,
      },
    });
    await this.logActivity(
      requester.id,
      'Congé refusé',
      comment
        ? `Absence ${absenceId} refusée — motif : ${comment}`
        : `Absence ${absenceId} refusée`,
    );
    this.gateway.broadcastLeaveStatusChanged(a.userId, {
      absenceId,
      status: 'rejected',
      comment,
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

    this.validateDateRange(data.startDate, data.endDate);
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    await this.assertNoOverlap(data.userId, start, end);

    const enc = encryptAbsence({ reason: data.reason });
    const a = await this.prisma.absence.create({
      data: {
        userId: data.userId,
        type: data.type as AbsenceType,
        startDate: start,
        endDate: end,
        reason: enc.reason!,
        status: 'approved',
        approvedById: requester.id,
      },
    });

    await this.logActivity(
      requester.id,
      'Congé créé par un manager',
      `Absence ${a.id} créée pour l'employé ${data.userId}`,
    );

    return decryptAbsence(a);
  }

  async updateManaged(
    absenceId: string,
    data: { startDate?: string; endDate?: string; reason?: string },
    requester: AuthenticatedUser,
  ) {
    await this.assertDepartmentScope(absenceId, requester);
    const existing = await this.prisma.absence.findUnique({
      where: { id: absenceId },
    });
    if (!existing) throw new NotFoundException('Absence introuvable');
    this.assertPending(existing, requester, { allowAdminBypass: true });

    const nextStart = data.startDate
      ? new Date(data.startDate)
      : existing.startDate;
    const nextEnd = data.endDate ? new Date(data.endDate) : existing.endDate;
    if (data.startDate || data.endDate) {
      if (isNaN(nextStart.getTime()) || isNaN(nextEnd.getTime())) {
        throw new BadRequestException('Dates invalides');
      }
      if (nextEnd < nextStart) {
        throw new BadRequestException(
          'La date de fin doit être postérieure ou égale à la date de début',
        );
      }
      await this.assertNoOverlap(
        existing.userId,
        nextStart,
        nextEnd,
        absenceId,
      );
    }

    const enc = encryptAbsence({ reason: data.reason });
    const updated = await this.prisma.absence.update({
      where: { id: absenceId },
      data: {
        ...(data.startDate ? { startDate: nextStart } : {}),
        ...(data.endDate ? { endDate: nextEnd } : {}),
        ...(data.reason ? { reason: enc.reason } : {}),
      },
    });

    await this.logActivity(
      requester.id,
      'Congé modifié par un manager',
      `Absence ${absenceId} modifiée`,
    );

    return decryptAbsence(updated);
  }

  async deleteManaged(absenceId: string, requester: AuthenticatedUser) {
    await this.assertDepartmentScope(absenceId, requester);
    const existing = await this.prisma.absence.findUnique({
      where: { id: absenceId },
    });
    if (!existing) throw new NotFoundException('Absence introuvable');
    this.assertPending(existing, requester, { allowAdminBypass: true });

    const updated = await this.prisma.absence.update({
      where: { id: absenceId },
      data: { status: 'cancelled' },
    });
    await this.logActivity(
      requester.id,
      'Congé annulé par un manager',
      `Absence ${absenceId} annulée (soft-delete) par le manager`,
    );
    this.gateway.broadcastLeaveStatusChanged(existing.userId, {
      absenceId,
      status: 'cancelled',
    });
    return decryptAbsence(updated);
  }

  /**
   * Retire une absence des vues (manager, employé) sans en changer le statut
   * métier ni la supprimer physiquement — la ligne reste intégralement
   * récupérable en base de données (masquage d'affichage uniquement).
   * Aucune contrainte de statut : applicable quel que soit l'état de la
   * demande (pending, approved, rejected, cancelled).
   */
  async hideManaged(absenceId: string, requester: AuthenticatedUser) {
    await this.assertDepartmentScope(absenceId, requester);
    const existing = await this.prisma.absence.findUnique({
      where: { id: absenceId },
    });
    if (!existing) throw new NotFoundException('Absence introuvable');

    const updated = await this.prisma.absence.update({
      where: { id: absenceId },
      data: { hidden: true },
    });
    await this.logActivity(
      requester.id,
      'Congé retiré de la liste par un manager',
      `Absence ${absenceId} masquée (hidden=true, donnée conservée en base) par le manager`,
    );
    return decryptAbsence(updated);
  }

  /** Vérifie que l'absence appartient bien à l'appelant et est encore en attente. */
  private async assertOwnPending(
    absenceId: string,
    userId: string,
  ): Promise<{ id: string; userId: string; startDate: Date; endDate: Date }> {
    const absence = await this.prisma.absence.findUnique({
      where: { id: absenceId },
    });
    if (!absence) throw new NotFoundException('Absence introuvable');
    if (absence.userId !== userId) {
      throw new ForbiddenException('Cette demande ne vous appartient pas');
    }
    if (absence.status !== 'pending') {
      throw new BadRequestException(
        'Impossible de modifier une demande déjà traitée',
      );
    }
    return absence;
  }

  async updateOwn(
    absenceId: string,
    data: { startDate?: string; endDate?: string; reason?: string },
    requester: AuthenticatedUser,
  ) {
    const existing = await this.assertOwnPending(absenceId, requester.id);

    const nextStart = data.startDate
      ? new Date(data.startDate)
      : existing.startDate;
    const nextEnd = data.endDate ? new Date(data.endDate) : existing.endDate;
    if (data.startDate || data.endDate) {
      if (isNaN(nextStart.getTime()) || isNaN(nextEnd.getTime())) {
        throw new BadRequestException('Dates invalides');
      }
      if (nextEnd < nextStart) {
        throw new BadRequestException(
          'La date de fin doit être postérieure ou égale à la date de début',
        );
      }
      await this.assertNoOverlap(
        existing.userId,
        nextStart,
        nextEnd,
        absenceId,
      );
    }

    const enc = encryptAbsence({ reason: data.reason });
    const updated = await this.prisma.absence.update({
      where: { id: absenceId },
      data: {
        ...(data.startDate ? { startDate: nextStart } : {}),
        ...(data.endDate ? { endDate: nextEnd } : {}),
        ...(data.reason ? { reason: enc.reason } : {}),
      },
    });

    await this.logActivity(
      requester.id,
      'Demande de congé modifiée',
      `Absence ${absenceId} modifiée par son auteur`,
    );

    return decryptAbsence(updated);
  }

  async deleteOwn(absenceId: string, requester: AuthenticatedUser) {
    await this.assertOwnPending(absenceId, requester.id);
    const updated = await this.prisma.absence.update({
      where: { id: absenceId },
      data: { status: 'cancelled' },
    });
    await this.logActivity(
      requester.id,
      'Demande de congé annulée',
      `Absence ${absenceId} annulée par son auteur`,
    );
    return decryptAbsence(updated);
  }
}
