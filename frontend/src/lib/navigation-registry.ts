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
  ClipboardCheck,
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
        // Masqué pour les managers/admins qui ont la vue équipe (pointages.view_team ou view_all)
        // Ces rôles utilisent /pointages à la place.
        excludeWhenHasAny: ['pointages.view_team', 'pointages.view_all'],
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
        id: 'conges',
        to: '/conges',
        icon: CheckCircle,
        label: 'Congés',
        requiredPermissions: ['absences.view_all']
        // Ce sera accessible à tous bientôt
      },
      {
        id: 'validations',
        to: '/validations',
        icon: ClipboardCheck,
        label: 'Validations',
        requiredPermissions: ['validations.view_team', 'validations.view_all'],
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
