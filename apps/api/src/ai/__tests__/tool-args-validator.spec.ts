import {
  validateGetMyHoursArgs,
  validateGetAbsentTodayArgs,
  validateGetLateEmployeesArgs,
  validateGetLeaveRequestsArgs,
  validateGetTeamAttendanceArgs,
  validateGetDepartmentStatisticsArgs,
  validateGetMyLeavesSummaryArgs,
} from '../tools/tool-args.validator.js';

/** Date YYYY-MM-DD dans le passé récent */
const TODAY = new Date().toISOString().slice(0, 10);
const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const CURRENT_YEAR = String(new Date().getFullYear());
const FUTURE_DATE = new Date(Date.now() + 2 * 86_400_000)
  .toISOString()
  .slice(0, 10);

describe('tool-args-validator', () => {
  // ─────────────────────────────────────────────────────────────────
  // get_my_hours
  // ─────────────────────────────────────────────────────────────────
  describe('validateGetMyHoursArgs', () => {
    it('accepte "today"', () => {
      const r = validateGetMyHoursArgs({ period: 'today' });
      expect(r.valid).toBe(true);
      expect(r.sanitized.period).toBe('today');
    });

    it('accepte "week"', () => {
      expect(validateGetMyHoursArgs({ period: 'week' }).valid).toBe(true);
    });

    it('accepte "month"', () => {
      expect(validateGetMyHoursArgs({ period: 'month' }).valid).toBe(true);
    });

    it('défaut à "week" quand period absent', () => {
      const r = validateGetMyHoursArgs({});
      expect(r.valid).toBe(true);
      expect(r.sanitized.period).toBe('week');
    });

    it('rejette une période inconnue', () => {
      const r = validateGetMyHoursArgs({ period: 'year' });
      expect(r.valid).toBe(false);
      expect(r.error).toBeDefined();
    });

    it('rejette un nombre comme period', () => {
      const r = validateGetMyHoursArgs({ period: 7 });
      expect(r.valid).toBe(false);
    });

    it("rejette une tentative d'injection via period", () => {
      const r = validateGetMyHoursArgs({
        period: "week'; DROP TABLE users;--",
      });
      expect(r.valid).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // get_absent_today
  // ─────────────────────────────────────────────────────────────────
  describe('validateGetAbsentTodayArgs', () => {
    it('accepte sans département', () => {
      const r = validateGetAbsentTodayArgs({});
      expect(r.valid).toBe(true);
      expect(r.sanitized.department).toBeUndefined();
    });

    it('accepte un département valide', () => {
      const r = validateGetAbsentTodayArgs({ department: 'IT' });
      expect(r.valid).toBe(true);
      expect(r.sanitized.department).toBe('IT');
    });

    it('trim le département', () => {
      const r = validateGetAbsentTodayArgs({ department: '  RH  ' });
      expect(r.valid).toBe(true);
      expect(r.sanitized.department).toBe('RH');
    });

    it('rejette un département trop long', () => {
      const r = validateGetAbsentTodayArgs({ department: 'A'.repeat(101) });
      expect(r.valid).toBe(false);
    });

    it('rejette un département non-string', () => {
      const r = validateGetAbsentTodayArgs({ department: 123 });
      expect(r.valid).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // get_late_employees
  // ─────────────────────────────────────────────────────────────────
  describe('validateGetLateEmployeesArgs', () => {
    it('accepte sans date (default)', () => {
      const r = validateGetLateEmployeesArgs({});
      expect(r.valid).toBe(true);
    });

    it("accepte aujourd'hui", () => {
      const r = validateGetLateEmployeesArgs({ date: TODAY });
      expect(r.valid).toBe(true);
      expect(r.sanitized.date).toBe(TODAY);
    });

    it('accepte hier', () => {
      expect(validateGetLateEmployeesArgs({ date: YESTERDAY }).valid).toBe(
        true,
      );
    });

    it('rejette une date future', () => {
      const r = validateGetLateEmployeesArgs({ date: FUTURE_DATE });
      expect(r.valid).toBe(false);
    });

    it('rejette un format invalide', () => {
      expect(validateGetLateEmployeesArgs({ date: '01/01/2025' }).valid).toBe(
        false,
      );
      expect(validateGetLateEmployeesArgs({ date: '2025-13-01' }).valid).toBe(
        false,
      );
      expect(validateGetLateEmployeesArgs({ date: 'hier' }).valid).toBe(false);
    });

    it('rejette une injection via date', () => {
      const r = validateGetLateEmployeesArgs({
        date: '2025-01-01; DROP TABLE pointage;--',
      });
      expect(r.valid).toBe(false);
    });

    it('rejette un nombre', () => {
      expect(validateGetLateEmployeesArgs({ date: 20250101 }).valid).toBe(
        false,
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // get_leave_requests
  // ─────────────────────────────────────────────────────────────────
  describe('validateGetLeaveRequestsArgs', () => {
    it('accepte sans status', () => {
      expect(validateGetLeaveRequestsArgs({}).valid).toBe(true);
    });

    it.each(['pending', 'approved', 'rejected'])(
      'accepte le statut valide "%s"',
      (s) => {
        const r = validateGetLeaveRequestsArgs({ status: s });
        expect(r.valid).toBe(true);
        expect(r.sanitized.status).toBe(s);
      },
    );

    it('rejette un statut inconnu', () => {
      expect(validateGetLeaveRequestsArgs({ status: 'cancelled' }).valid).toBe(
        false,
      );
      expect(validateGetLeaveRequestsArgs({ status: 'ALL' }).valid).toBe(false);
    });

    it('rejette une injection SQL', () => {
      const r = validateGetLeaveRequestsArgs({ status: "pending' OR 1=1--" });
      expect(r.valid).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // get_team_attendance
  // ─────────────────────────────────────────────────────────────────
  describe('validateGetTeamAttendanceArgs', () => {
    it('accepte sans date', () => {
      expect(validateGetTeamAttendanceArgs({}).valid).toBe(true);
    });

    it('accepte une date valide passée', () => {
      expect(validateGetTeamAttendanceArgs({ date: YESTERDAY }).valid).toBe(
        true,
      );
    });

    it('rejette une date future', () => {
      expect(validateGetTeamAttendanceArgs({ date: FUTURE_DATE }).valid).toBe(
        false,
      );
    });

    it('rejette un format invalide', () => {
      expect(validateGetTeamAttendanceArgs({ date: '2025/01/01' }).valid).toBe(
        false,
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // get_department_statistics
  // ─────────────────────────────────────────────────────────────────
  describe('validateGetDepartmentStatisticsArgs', () => {
    it("est toujours valide (pas d'arguments)", () => {
      expect(validateGetDepartmentStatisticsArgs({}).valid).toBe(true);
      expect(
        validateGetDepartmentStatisticsArgs({ malicious: 'payload' }).valid,
      ).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // get_my_leaves_summary
  // ─────────────────────────────────────────────────────────────────
  describe('validateGetMyLeavesSummaryArgs', () => {
    it('accepte sans année (default)', () => {
      expect(validateGetMyLeavesSummaryArgs({}).valid).toBe(true);
    });

    it("accepte l'année courante", () => {
      const r = validateGetMyLeavesSummaryArgs({ year: CURRENT_YEAR });
      expect(r.valid).toBe(true);
      expect(r.sanitized.year).toBe(CURRENT_YEAR);
    });

    it('accepte 2000', () => {
      expect(validateGetMyLeavesSummaryArgs({ year: '2000' }).valid).toBe(true);
    });

    it('accepte un nombre entier comme année', () => {
      const r = validateGetMyLeavesSummaryArgs({ year: 2024 });
      expect(r.valid).toBe(true);
      expect(r.sanitized.year).toBe('2024');
    });

    it('rejette une année avant 2000', () => {
      expect(validateGetMyLeavesSummaryArgs({ year: '1999' }).valid).toBe(
        false,
      );
    });

    it('rejette une année trop future', () => {
      const futureYear = String(new Date().getFullYear() + 5);
      expect(validateGetMyLeavesSummaryArgs({ year: futureYear }).valid).toBe(
        false,
      );
    });

    it('rejette un format non-numérique', () => {
      expect(
        validateGetMyLeavesSummaryArgs({ year: 'vingt-vingt' }).valid,
      ).toBe(false);
      expect(validateGetMyLeavesSummaryArgs({ year: '20.25' }).valid).toBe(
        false,
      );
    });

    it('rejette une injection via year', () => {
      const r = validateGetMyLeavesSummaryArgs({
        year: '2025; DROP TABLE absence;--',
      });
      expect(r.valid).toBe(false);
    });
  });
});
