import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAll() {
    return this.prisma.department.findMany({
      include: { positions: true },
      orderBy: { name: 'asc' },
    });
  }

  async getById(id: string) {
    const d = await this.prisma.department.findUnique({
      where: { id },
      include: { positions: true },
    });
    if (!d) throw new NotFoundException('Département introuvable');
    return d;
  }

  async create(data: { name: string; description?: string }) {
    const existing = await this.prisma.department.findUnique({
      where: { name: data.name },
    });
    if (existing) throw new ConflictException('Ce département existe déjà');
    return this.prisma.department.create({ data });
  }

  async update(id: string, data: { name?: string; description?: string }) {
    const dept = await this.prisma.department.findUnique({ where: { id } });
    if (!dept) throw new NotFoundException('Département introuvable');

    if (data.name && data.name !== dept.name) {
      await this.prisma.$transaction([
        this.prisma.department.update({ where: { id }, data }),
        this.prisma.user.updateMany({
          where: { department: dept.name },
          data: { department: data.name },
        }),
      ]);
    } else {
      await this.prisma.department.update({ where: { id }, data });
    }

    return this.prisma.department.findUnique({
      where: { id },
      include: { positions: true },
    });
  }

  async delete(id: string) {
    const dept = await this.prisma.department.findUnique({
      where: { id },
      include: { positions: true },
    });
    if (!dept) throw new NotFoundException('Département introuvable');
    await this.prisma.department.delete({ where: { id } });
    return { success: true };
  }
}
