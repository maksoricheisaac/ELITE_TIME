import { cookies } from "next/headers";

const SESSION_COOKIE_NAME = "elitetime_session";
const API_URL = process.env.API_URL || "http://127.0.0.1:4000";

// ── Types ─────────────────────────────────────────────────────────────────────

export type UserRole = "employee" | "manager" | "admin" | "team_lead";
export type UserStatus = "active" | "inactive" | "deleted";

export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string | null;
  firstname: string | null;
  lastname: string | null;
  role: UserRole;
  status: UserStatus;
  department: string | null;
}

export interface AuthContext {
  user: AuthenticatedUser;
  sessionToken: string;
}

export type PermissionRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface Permission {
  id: string;
  name: string;
  description: string | null;
  category: string;
  module: string | null;
  action: string | null;
  riskLevel: PermissionRisk;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPermission {
  id: string;
  userId: string;
  permissionId: string;
  grantedBy: string;
  grantedAt: Date;
  permission: Permission;
}

// ── Errors ────────────────────────────────────────────────────────────────────

export class AuthenticationError extends Error {
  constructor(message = "Non authentifié") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  constructor(message = "Non autorisé") {
    super(message);
    this.name = "AuthorizationError";
  }
}

// ── Core auth — appel NestJS ──────────────────────────────────────────────────

export async function getAuthenticatedUser(): Promise<AuthContext> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionToken) {
    throw new AuthenticationError();
  }

  const res = await fetch(`${API_URL}/auth/me`, {
    headers: { Cookie: `${SESSION_COOKIE_NAME}=${sessionToken}` },
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403) {
    throw new AuthenticationError();
  }

  if (!res.ok) {
    throw new AuthenticationError("Erreur service d'authentification");
  }

  const data = await res.json();
  const user = data.user as AuthenticatedUser;

  if (!user || user.status !== "active") {
    throw new AuthenticationError("Compte inactif");
  }

  return { user, sessionToken };
}

// ── Permission helpers — appel NestJS ─────────────────────────────────────────

/**
 * Retourne la liste des noms de permissions de l'utilisateur courant.
 * Le backend renvoie un tableau de strings (format module.action).
 * Le paramètre _userId est ignoré : la session cookie sert d'identification.
 */
export async function getUserPermissions(_userId: string): Promise<string[]> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionToken) return [];

  const res = await fetch(`${API_URL}/auth/permissions`, {
    headers: { Cookie: `${SESSION_COOKIE_NAME}=${sessionToken}` },
    cache: "no-store",
  });

  if (!res.ok) return [];
  const data = await res.json();
  return data.permissions ?? [];
}

export async function hasUserPermission(
  userId: string,
  permissionName: string,
): Promise<boolean> {
  const perms = await getUserPermissions(userId);
  return perms.includes(permissionName);
}

/**
 * Retourne les noms de permissions d'un module donné (préfixe avant le point).
 * Ex: getUserPermissionsInModule(id, 'absences') → ['absences.approve', 'absences.view_team', ...]
 */
export async function getUserPermissionsInModule(
  userId: string,
  module: string,
): Promise<string[]> {
  const perms = await getUserPermissions(userId);
  return perms.filter((p) => p.startsWith(`${module}.`));
}

/** @deprecated Utiliser getUserPermissionsInModule à la place */
export async function hasUserPermissionsInCategory(
  userId: string,
  category: string,
): Promise<Permission[]> {
  // Compatibilité : retourne des objets Permission partiels basés sur les noms
  const perms = await getUserPermissions(userId);
  return perms
    .filter((p) => p.startsWith(`${category}.`))
    .map((name) => {
      const [module, action] = name.split('.');
      return {
        id: '',
        name,
        description: null,
        category,
        module: module ?? null,
        action: action ?? null,
        riskLevel: 'LOW' as PermissionRisk,
        isSystem: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });
}

// ── Role guards ───────────────────────────────────────────────────────────────

export function requireRole(allowedRoles: UserRole[]) {
  return async (): Promise<AuthContext> => {
    const auth = await getAuthenticatedUser();
    if (!allowedRoles.includes(auth.user.role)) {
      throw new AuthorizationError(`Rôle ${auth.user.role} non autorisé`);
    }
    return auth;
  };
}

export const requireAdmin = requireRole(["admin"]);
export const requireManagerOrAdmin = requireRole(["manager", "admin"]);
export const requireEmployeeOrAbove = requireRole([
  "employee",
  "manager",
  "admin",
  "team_lead",
]);

// ── Permission guards ─────────────────────────────────────────────────────────

export function requirePermission(permissionName: string) {
  return async (): Promise<AuthContext> => {
    const auth = await getAuthenticatedUser();
    if (auth.user.role === "admin") return auth;
    const has = await hasUserPermission(auth.user.id, permissionName);
    if (!has) throw new AuthorizationError(`Permission '${permissionName}' requise`);
    return auth;
  };
}

export function requireAnyPermission(permissionNames: string[]) {
  return async (): Promise<AuthContext> => {
    const auth = await getAuthenticatedUser();
    if (auth.user.role === "admin") return auth;
    for (const name of permissionNames) {
      if (await hasUserPermission(auth.user.id, name)) return auth;
    }
    throw new AuthorizationError(
      `Une des permissions suivantes est requise : ${permissionNames.join(", ")}`,
    );
  };
}

export function requirePermissionInCategory(category: string) {
  return async (): Promise<AuthContext> => {
    const auth = await getAuthenticatedUser();
    if (auth.user.role === "admin") return auth;
    const perms = await hasUserPermissionsInCategory(auth.user.id, category);
    if (perms.length === 0) {
      throw new AuthorizationError(
        `Permissions dans la catégorie '${category}' requises`,
      );
    }
    return auth;
  };
}

// ── ABAC ──────────────────────────────────────────────────────────────────────

export function canAccessUserData(
  requesterRole: UserRole,
  targetUserId: string,
  requesterId: string,
): boolean {
  if (requesterRole === "admin" || requesterRole === "manager") return true;
  return targetUserId === requesterId;
}

export async function validateUserAccess(
  userId: string,
  requester: AuthContext,
): Promise<string> {
  if (
    requester.user.role === "admin" ||
    requester.user.role === "manager"
  ) {
    return userId;
  }
  if (userId === requester.user.id) return userId;
  throw new AuthorizationError("Accès non autorisé");
}

// ── Stubs conservés pour compatibilité ───────────────────────────────────────
// Ces fonctions sont maintenant gérées côté NestJS.

export async function logSecurityEvent(
  _userId: string | null,
  _action: string,
  _details: string,
  _ipAddress?: string,
  _userAgent?: string,
): Promise<void> {
  // Géré par NestJS AuthService
}

export async function checkRateLimit(
  _identifier: string,
  _maxAttempts?: number,
  _windowMinutes?: number,
): Promise<boolean> {
  // Géré par NestJS AuthService — always allow here
  return true;
}

export async function markLoginAttempt(
  _identifier: string,
  _success: boolean,
): Promise<void> {
  // Géré par NestJS AuthService
}

export async function grantPermission(
  _userId: string,
  _permissionId: string,
  _grantedBy: string,
): Promise<void> {
  // Géré par NestJS PermissionsModule
}

export async function revokePermission(
  _userId: string,
  _permissionId: string,
): Promise<void> {
  // Géré par NestJS PermissionsModule
}

export async function grantDefaultManagerPermissions(
  _userId: string,
): Promise<void> {
  // Géré par NestJS PermissionsModule
}

export async function resetPermissionsToRoleDefaults(
  _userId: string,
  _role: UserRole,
): Promise<void> {
  // Géré par NestJS PermissionsModule
}
