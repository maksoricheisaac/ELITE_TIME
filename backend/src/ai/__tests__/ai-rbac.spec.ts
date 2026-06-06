import { ForbiddenException } from '@nestjs/common';
import {
  ALLOWED_AI_ROLES,
  validateAiRole,
  getAllowedToolNames,
  isToolAllowedForRole,
  TOOL_ROLE_PERMISSIONS,
} from '../security/ai-rbac.js';

describe('ai-rbac', () => {
  // ─────────────────────────────────────────────────────────────────
  // validateAiRole
  // ─────────────────────────────────────────────────────────────────
  describe('validateAiRole', () => {
    it.each(ALLOWED_AI_ROLES)('accepte le rôle valide "%s"', (role) => {
      expect(() => validateAiRole(role)).not.toThrow();
      expect(validateAiRole(role)).toBe(role);
    });

    it('rejette un rôle inconnu', () => {
      expect(() => validateAiRole('superadmin')).toThrow(ForbiddenException);
    });

    it('rejette un rôle vide', () => {
      expect(() => validateAiRole('')).toThrow(ForbiddenException);
    });

    it('rejette null', () => {
      expect(() => validateAiRole(null)).toThrow(ForbiddenException);
    });

    it('rejette undefined', () => {
      expect(() => validateAiRole(undefined)).toThrow(ForbiddenException);
    });

    it('rejette un nombre', () => {
      expect(() => validateAiRole(42)).toThrow(ForbiddenException);
    });

    it('rejette un objet', () => {
      expect(() => validateAiRole({ role: 'admin' })).toThrow(
        ForbiddenException,
      );
    });

    it('rejette une tentative de bypass avec espaces', () => {
      expect(() => validateAiRole(' admin ')).toThrow(ForbiddenException);
    });

    it('est sensible à la casse', () => {
      expect(() => validateAiRole('ADMIN')).toThrow(ForbiddenException);
      expect(() => validateAiRole('Admin')).toThrow(ForbiddenException);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // getAllowedToolNames
  // ─────────────────────────────────────────────────────────────────
  describe('getAllowedToolNames', () => {
    it('retourne tous les outils pour admin', () => {
      const tools = getAllowedToolNames('admin');
      expect(tools).toContain('get_my_hours');
      expect(tools).toContain('get_department_statistics');
      expect(tools).toContain('get_absent_today');
      expect(tools.length).toBe(Object.keys(TOOL_ROLE_PERMISSIONS).length);
    });

    it('exclut get_department_statistics pour team_lead', () => {
      const tools = getAllowedToolNames('team_lead');
      expect(tools).not.toContain('get_department_statistics');
    });

    it('employee ne voit que ses propres outils', () => {
      const tools = getAllowedToolNames('employee');
      expect(tools).toContain('get_my_hours');
      expect(tools).toContain('get_my_leaves_summary');
      expect(tools).toContain('get_leave_requests');
      expect(tools).not.toContain('get_absent_today');
      expect(tools).not.toContain('get_late_employees');
      expect(tools).not.toContain('get_team_attendance');
      expect(tools).not.toContain('get_department_statistics');
    });

    it("manager a accès aux outils d'équipe mais pas department_statistics pour employee", () => {
      const managerTools = getAllowedToolNames('manager');
      const employeeTools = getAllowedToolNames('employee');
      expect(managerTools.length).toBeGreaterThan(employeeTools.length);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // isToolAllowedForRole
  // ─────────────────────────────────────────────────────────────────
  describe('isToolAllowedForRole', () => {
    it('autorise get_my_hours pour tous les rôles', () => {
      for (const role of ALLOWED_AI_ROLES) {
        expect(isToolAllowedForRole('get_my_hours', role)).toBe(true);
      }
    });

    it('refuse get_department_statistics pour employee et team_lead', () => {
      expect(
        isToolAllowedForRole('get_department_statistics', 'employee'),
      ).toBe(false);
      expect(
        isToolAllowedForRole('get_department_statistics', 'team_lead'),
      ).toBe(false);
    });

    it('autorise get_department_statistics pour admin et manager', () => {
      expect(isToolAllowedForRole('get_department_statistics', 'admin')).toBe(
        true,
      );
      expect(isToolAllowedForRole('get_department_statistics', 'manager')).toBe(
        true,
      );
    });

    it('refuse un outil inexistant pour tout rôle', () => {
      expect(isToolAllowedForRole('hack_database', 'admin')).toBe(false);
      expect(isToolAllowedForRole('', 'admin')).toBe(false);
    });

    it('refuse get_absent_today pour employee', () => {
      expect(isToolAllowedForRole('get_absent_today', 'employee')).toBe(false);
    });
  });
});
