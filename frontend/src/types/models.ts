// Types de domaine — remplacent les types générés par Prisma

export type UserRole = "employee" | "manager" | "admin" | "team_lead";
export type UserStatus = "active" | "inactive" | "deleted";
export type PointageStatus = "normal" | "late" | "incomplete" | "admin_closed";
export type PointageSource = "EMPLOYEE" | "ADMIN" | "MANAGER";
export type PointedBy = "employee" | "admin" | "manager";
export type AbsenceType = "conge" | "maladie" | "autre";
export type AbsenceStatus = "pending" | "approved" | "rejected";
export type CorrectionStatus = "pending" | "approved" | "rejected";
export type ActivityType = "auth" | "pointage" | "absence" | "user" | "validation";
export type ScheduledEmailType = "DAILY_REPORT" | "WEEKLY_REPORT" | "MONTHLY_REPORT";
export type DailyReportMode = "TODAY" | "YESTERDAY";

export interface User {
  id: string;
  username: string;
  email: string | null;
  firstname: string | null;
  lastname: string | null;
  role: UserRole;
  status: UserStatus;
  department: string | null;
  position: string | null;
  avatar: string | null;
  isLocal: boolean;
  hiddenFromLists: boolean;
  includeInReports: boolean;
  teamLeadId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  password?: string | null;
}

export interface Pointage {
  id: string;
  userId: string;
  date: Date | string;
  sessionNumber: number;
  entryTime: string | null;
  exitTime: string | null;
  duration: number;
  status: PointageStatus;
  source: PointageSource;
  pointedBy: PointedBy;
  isActive: boolean;
  lateReason: string | null;
  earlyExitReason: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface Break {
  id: string;
  userId: string;
  date: Date | string;
  startTime: string;
  endTime: string | null;
  duration: number | null;
  createdAt: Date | string;
}

export interface Absence {
  id: string;
  userId: string;
  type: AbsenceType;
  startDate: string;
  endDate: string;
  reason: string;
  status: AbsenceStatus;
  comment: string | null;
  createdAt: string;
}

export interface CorrectionRequest {
  id: string;
  userId: string;
  pointageId: string;
  requestDate: Date | string;
  originalEntry: string | null;
  originalExit: string | null;
  newEntry: string;
  newExit: string;
  reason: string;
  status: CorrectionStatus;
  createdAt: Date | string;
}

export interface ActivityLog {
  id: string;
  userId: string | null;
  action: string;
  details: string;
  timestamp: Date | string;
  type: ActivityType;
}

export interface Department {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  positions?: Position[];
}

export interface Position {
  id: string;
  name: string;
  description: string | null;
  departmentId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  department?: Department;
}

export interface Session {
  id: string;
  userId: string;
  sessionToken: string;
  ipAddress: string | null;
  userAgent: string | null;
  expiresAt: Date | string;
  createdAt: Date | string;
}

export interface Permission {
  id: string;
  name: string;
  description: string | null;
  category: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface UserPermission {
  id: string;
  userId: string;
  permissionId: string;
  grantedBy: string;
  grantedAt: Date | string;
  permission: Permission;
}

export interface SystemSettings {
  id: number;
  workStartTime: string;
  workEndTime: string;
  breakDuration: number;
  overtimeThreshold: number;
  holidays: unknown;
  emailNotificationsEnabled: boolean;
  lateAlertsEnabled: boolean;
  notificationsEnabled: boolean;
  pointageRemindersEnabled: boolean;
  maxSessionEndTime: string;
  ldapLastSyncAt: Date | string | null;
  ldapSyncEnabled: boolean;
  ldapSyncIntervalMinutes: number;
  dailyReportMode: DailyReportMode;
  timezone: string;
  updatedAt: Date | string;
}

export interface ScheduledEmailJob {
  id: string;
  type: ScheduledEmailType;
  enabled: boolean;
  hour: number;
  minute: number;
  weekday: number | null;
  weekStartDay: number;
  monthlySendDay: number;
  includePdf: boolean;
  includeExcel: boolean;
  includeCsv: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  recipients?: ScheduledEmailJobRecipient[];
}

export interface ScheduledEmailJobRecipient {
  id: string;
  jobId: string;
  userId: string | null;
  email: string | null;
  user?: User | null;
}

export interface HiddenUsername {
  id: string;
  username: string;
  userId: string | null;
  hidden: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface Page {
  id: string;
  code: string;
  path: string;
  label: string;
  category: string | null;
  allowedRoles: UserRole[];
}
