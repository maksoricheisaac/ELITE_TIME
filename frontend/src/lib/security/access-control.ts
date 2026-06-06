import {
  getAuthenticatedUser,
  hasUserPermission,
  validateUserAccess,
  AuthorizationError,
} from "./rbac";
import type { UserRole } from "@/types/models";

export interface AccessContext {
  userId?: string;
  targetUserId?: string;
  permission?: string;
  role?: UserRole;
}

export const AccessControl = {
  async can(permission: string): Promise<boolean> {
    try {
      const auth = await getAuthenticatedUser();
      if (auth.user.role === "admin") return true;
      return await hasUserPermission(auth.user.id, permission);
    } catch {
      return false;
    }
  },

  async canAccessUser(targetUserId: string): Promise<boolean> {
    try {
      const auth = await getAuthenticatedUser();
      await validateUserAccess(targetUserId, auth);
      return true;
    } catch {
      return false;
    }
  },

  async require(permission: string) {
    const auth = await getAuthenticatedUser();
    if (auth.user.role === "admin") return auth;

    const hasPermission = await hasUserPermission(auth.user.id, permission);
    if (!hasPermission) {
      throw new AuthorizationError(`Permission '${permission}' requise`);
    }
    return auth;
  },

  async requireUserAccess(targetUserId: string) {
    const auth = await getAuthenticatedUser();
    await validateUserAccess(targetUserId, auth);
    return auth;
  },
};
