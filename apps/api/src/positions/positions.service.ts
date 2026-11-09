import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PositionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAll() {
    return this.prisma.position.findMany({
      include: { department: true },
      orderBy: { name: 'asc' },
    });
  }

  async getByDepartment(departmentId: string) {
    return this.prisma.position.findMany({
      where: { departmentId },
      orderBy: { name: 'asc' },
    });
  }

  async create(data: {
    name: string;
    departmentId: string;
    description?: string;
  }) {
    return this.prisma.position.create({ data });
  }

  async update(
    id: string,
    data: { name?: string; departmentId?: string; description?: string },
  ) {
    const p = await this.prisma.position.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Poste introuvable');
    return this.prisma.position.update({ where: { id }, data });
  }

  async delete(id: string) {
    const p = await this.prisma.position.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Poste introuvable');
    await this.prisma.position.delete({ where: { id } });
    return { success: true };
  }
}
