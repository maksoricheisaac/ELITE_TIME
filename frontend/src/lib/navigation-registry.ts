import type { UserRole as PrismaUserRole } from '@/types/models';
import {
  LayoutDashboard,
  Users,
  FileText,
  Activity,
  Settings,
  Clock,
  CheckCircle,
  Shield,
  Mail,
  Building2,
  Briefcase,
} from 'lucide-react';

export type UserRole = PrismaUserRole;

export type NavigationItem = {
  id: string;
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  /**
   * L'utilisateur doit posséder AU MOINS UNE de ces permissions pour voir l'item.
   * Si absent → accessible à tout utilisateur authentifié.
   */
  requiredPermissions?: string[];
  /**
   * Masquer l'item si l'utilisateur possède AU MOINS UNE de ces permissions.
   * Utilisé pour exclure les vues "self" quand l'utilisateur a déjà un accès
   * "team" ou "global" plus complet.
   * Ex : "Mes pointages" devient inutile quand on a déjà la vue équipe.
   */
  excludeWhenHasAny?: string[];
  /**
   * Ne pas afficher cet item dans la sidebar (guard interne uniquement).
   * Utile pour les sous-pages dynamiques qui ont leurs propres règles d'accès.
   */
  hiddenFromSidebar?: boolean;
  /**
   * L'utilisateur doit avoir l'un de ces rôles (indépendamment de ses permissions)
   * pour voir/accéder à cet item. À utiliser uniquement quand l'accès dépend de la
   * nature du rôle (ex : seuls les employés pointent) et non des permissions
   * accordées, qui peuvent varier indépendamment du rôle.
   */
  requiredRoles?: UserRole[];
};

export type NavigationGroup = {
  id: string;
  label: string;
  items: NavigationItem[];
};

export const navigationRegistry: NavigationGroup[] = [
  {
    id: 'core',
    label: 'Navigation principale',
    items: [
      {
        id: 'dashboard',
        to: '/dashboard',
        icon: LayoutDashboard,
        label: 'Dashboard',
      },
      {
        id: 'mes-pointages',
        to: '/mes-pointages',
        icon: Clock,
        label: 'Mes pointages',
        // Toujours accessible à un employé, quelles que soient ses permissions
        // individuelles (ex : pointages.view_team accordé sans changer de rôle).
        // Réservé au rôle "employee" : l'admin ne pointe pas ses propres horaires
        // (il n'a donc pas de pointages personnels à consulter), et manager/
        // team_lead utilisent /pointages (vue équipe) à la place.
        requiredRoles: ['employee'],
      },
      {
        id: 'pointages',
        to: '/pointages',
        icon: Clock,
        label: 'Pointages',
        requiredPermissions: ['pointages.view_all', 'pointages.view_team'],
      }
    ],
  },
  {
    id: 'operations',
    label: 'Opérations',
    items: [
      {
        id: 'employees',
        to: '/employees',
        icon: Users,
        label: 'Employés',
        requiredPermissions: ['employees.view_all', 'employees.view_team'],
      },
      {
        id: 'departements',
        to: '/departements',
        icon: Building2,
        label: 'Départements',
        requiredPermissions: ['departments.view'],
      },
      {
        id: 'postes',
        to: '/postes',
        icon: Briefcase,
        label: 'Postes',
        requiredPermissions: ['positions.view'],
      },
      {
        id: 'reports',
        to: '/reports',
        icon: FileText,
        label: 'Rapports',
        requiredPermissions: ['reports.view_all', 'reports.view_team', 'reports.view_self'],
      },
      {
        id: 'mon-rapport',
        to: '/mon-rapport',
        icon: FileText,
        label: 'Mon rapport',
        // Tableau de bord personnel basé sur les pointages de l'utilisateur.
        // Seuls les employés pointent : réservé au rôle "employee", quelles que
        // soient ses permissions individuelles (voir requiredRoles ci-dessous).
        // Ne PAS utiliser excludeWhenHasAny/requiredPermissions ici : un employé
        // peut recevoir des permissions élevées (ex: pointages.view_team) sans
        // changer de rôle, et doit quand même conserver l'accès à cette page.
        requiredRoles: ['employee'],
      },
      {
        // Guard interne — non visible dans la sidebar
        // Utilisé pour protéger /reports/[employeeId] (rapport individuel)
        id: 'reports-detail',
        to: '/reports',
        icon: FileText,
        label: 'Rapport individuel',
        requiredPermissions: ['reports.view_team', 'reports.view_all'],
        hiddenFromSidebar: true,
      },
      {
        id: 'mes-conges',
        to: '/mes-conges',
        icon: CheckCircle,
        label: 'Mes congés',
        // Demande/suivi de ses propres congés. Réservé aux utilisateurs n'ayant
        // pas de vue équipe/globale sur les congés (sinon ils utilisent /conges),
        // SAUF l'admin qui garde l'accès à ses propres congés même s'il possède
        // aussi les permissions de vue équipe/globale (voir l'exception admin
        // dans canAccess()/isVisible() qui neutralise excludeWhenHasAny pour lui).
        requiredPermissions: ['absences.view_self'],
        excludeWhenHasAny: ['absences.view_team', 'absences.view_all', 'absences.approve'],
      },
      {
        id: 'conges',
        to: '/conges',
        icon: CheckCircle,
        label: 'Congés',
        requiredPermissions: ['absences.view_all', 'absences.view_team', 'absences.approve'],
      },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    items: [
      {
        id: 'permissions',
        to: '/permissions',
        icon: Shield,
        label: 'Permissions',
        requiredPermissions: ['permissions.view'],
      },
      {
        id: 'settings',
        to: '/settings',
        icon: Settings,
        label: 'Paramètres',
        requiredPermissions: ['settings.view'],
      },
      {
        id: 'emails',
        to: '/emails',
        icon: Mail,
        label: 'Emails',
        requiredPermissions: ['emails.view'],
      },
      {
        id: 'logs',
        to: '/logs',
        icon: Activity,
        label: 'Logs',
        requiredPermissions: ['logs.view'],
      },
    ],
  },
];
