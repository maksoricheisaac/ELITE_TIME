import { ForbiddenException } from '@nestjs/common';
import type { ToolContext } from '../interfaces/tool-context.interface.js';

/** Liste blanche des rôles autorisés à accéder au module IA — deny by default */
export const ALLOWED_AI_ROLES = [
  'admin',
  'manager',
  'team_lead',
  'employee',
] as const;
export type AllowedAiRole = (typeof ALLOWED_AI_ROLES)[number];

/**
 * Valide le rôle utilisateur et retourne un rôle typé strict.
 * Lève ForbiddenException (403) pour tout rôle inconnu ou manquant.
 * Ne jamais utiliser `as ToolContext['role']` sans passer par cette fonction.
 */
export function validateAiRole(role: unknown): ToolContext['role'] {
  if (typeof role !== 'string' || !role) {
    throw new ForbiddenException('Accès refusé : rôle utilisateur manquant.');
  }
  if (!(ALLOWED_AI_ROLES as readonly string[]).includes(role)) {
    throw new ForbiddenException('Accès refusé : rôle non autorisé.');
  }
  return role as ToolContext['role'];
}

/**
 * Matrice des permissions : outil → rôles autorisés.
 * Source de vérité unique pour le RBAC IA.
 * Tout outil absent de cette map est INTERDIT pour tous les rôles.
 */
export const TOOL_ROLE_PERMISSIONS: Readonly<
  Record<string, readonly AllowedAiRole[]>
> = {
  get_my_hours: ['admin', 'manager', 'team_lead', 'employee'],
  get_my_leaves_summary: ['admin', 'manager', 'team_lead', 'employee'],
  get_my_pointage_history: ['admin', 'manager', 'team_lead', 'employee'],
  get_leave_requests: ['admin', 'manager', 'team_lead', 'employee'],
  get_absent_today: ['admin', 'manager', 'team_lead'],
  get_late_employees: ['admin', 'manager', 'team_lead'],
  get_team_attendance: ['admin', 'manager', 'team_lead'],
  search_employee: ['admin', 'manager', 'team_lead'],
  get_department_statistics: ['admin', 'manager'],
} as const;

/** Retourne la liste des noms d'outils accessibles pour un rôle donné */
export function getAllowedToolNames(role: AllowedAiRole): string[] {
  return Object.entries(TOOL_ROLE_PERMISSIONS)
    .filter(([, roles]) => roles.includes(role))
    .map(([name]) => name);
}

/** Vérifie si un outil est accessible pour un rôle donné */
export function isToolAllowedForRole(
  toolName: string,
  role: AllowedAiRole,
): boolean {
  const allowed = TOOL_ROLE_PERMISSIONS[toolName];
  return (
    Array.isArray(allowed) && (allowed as readonly string[]).includes(role)
  );
}
