import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { encrypt } from '../lib/crypto';
import type { PermissionRisk } from '../generated/prisma/enums';

type RawPermDef = {
  name: string;
  description: string;
  category: string;
  riskLevel?: PermissionRisk;
};

/** Dérive automatiquement module et action depuis le nom module.action */
function perm(p: RawPermDef) {
  const dot = p.name.indexOf('.');
  return {
    name: p.name,
    description: p.description,
    category: p.category,
    module: dot >= 0 ? p.name.slice(0, dot) : p.name,
    action: dot >= 0 ? p.name.slice(dot + 1) : '',
    riskLevel: p.riskLevel ?? ('LOW' as const),
    isSystem: true,
  };
}

/**
 * MODÈLE RBAC GRANULAIRE — format module.action
 * Toutes les permissions de l'application EliteTime.
 * Aucune permission legacy ne doit figurer ici.
 */
const PERMISSIONS = [
  // ── AUTH ─────────────────────────────────────────────────────────────────────
  perm({
    name: 'auth.view_sessions',
    description: 'Voir ses propres sessions actives',
    category: 'auth',
  }),
  perm({
    name: 'auth.revoke_own_sessions',
    description: 'Révoquer ses propres sessions',
    category: 'auth',
  }),
  perm({
    name: 'auth.revoke_all_sessions',
    description: "Révoquer les sessions de n'importe quel utilisateur",
    category: 'auth',
    riskLevel: 'CRITICAL',
  }),
  perm({
    name: 'auth.change_password',
    description: 'Changer son propre mot de passe',
    category: 'auth',
  }),

  // ── DASHBOARD ────────────────────────────────────────────────────────────────
  perm({
    name: 'dashboard.view_self',
    description: 'Voir son propre dashboard (employé)',
    category: 'dashboard',
  }),
  perm({
    name: 'dashboard.view_team',
    description: 'Voir le dashboard équipe (manager)',
    category: 'dashboard',
  }),
  perm({
    name: 'dashboard.view_global',
    description: 'Voir le dashboard global (administrateur)',
    category: 'dashboard',
    riskLevel: 'MEDIUM',
  }),

  // ── POINTAGES ────────────────────────────────────────────────────────────────
  perm({
    name: 'pointages.view_self',
    description: 'Voir ses propres pointages',
    category: 'pointages',
  }),
  perm({
    name: 'pointages.view_team',
    description: 'Voir les pointages de son équipe',
    category: 'pointages',
  }),
  perm({
    name: 'pointages.view_all',
    description: 'Voir tous les pointages sans restriction',
    category: 'pointages',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'pointages.create',
    description: 'Créer un pointage pour un employé',
    category: 'pointages',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'pointages.edit',
    description: 'Modifier un pointage existant',
    category: 'pointages',
    riskLevel: 'HIGH',
  }),
  perm({
    name: 'pointages.delete',
    description: 'Supprimer une session de pointage',
    category: 'pointages',
    riskLevel: 'HIGH',
  }),
  perm({
    name: 'pointages.close_session',
    description: "Forcer la clôture d'une session ouverte",
    category: 'pointages',
    riskLevel: 'HIGH',
  }),
  perm({
    name: 'pointages.force_checkout',
    description: "Forcer la sortie d'un employé",
    category: 'pointages',
    riskLevel: 'HIGH',
  }),
  perm({
    name: 'pointages.export',
    description: 'Exporter les données de pointage',
    category: 'pointages',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'pointages.validate',
    description: 'Valider un pointage',
    category: 'pointages',
    riskLevel: 'HIGH',
  }),
  perm({
    name: 'pointages.import',
    description: 'Importer des pointages en masse',
    category: 'pointages',
    riskLevel: 'CRITICAL',
  }),

  // ── PAUSES ───────────────────────────────────────────────────────────────────
  perm({
    name: 'breaks.view_self',
    description: 'Voir ses propres pauses',
    category: 'breaks',
  }),
  perm({
    name: 'breaks.view_team',
    description: 'Voir les pauses de son équipe',
    category: 'breaks',
  }),
  perm({
    name: 'breaks.view_all',
    description: 'Voir toutes les pauses',
    category: 'breaks',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'breaks.manage',
    description: 'Gérer les pauses des employés',
    category: 'breaks',
    riskLevel: 'HIGH',
  }),
  perm({
    name: 'breaks.export',
    description: 'Exporter les données de pauses',
    category: 'breaks',
    riskLevel: 'MEDIUM',
  }),

  // ── ABSENCES ─────────────────────────────────────────────────────────────────
  perm({
    name: 'absences.view_self',
    description: 'Voir ses propres absences',
    category: 'absences',
  }),
  perm({
    name: 'absences.view_team',
    description: 'Voir les absences de son équipe',
    category: 'absences',
  }),
  perm({
    name: 'absences.view_all',
    description: 'Voir toutes les absences sans restriction',
    category: 'absences',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'absences.create',
    description: "Créer sa propre demande d'absence",
    category: 'absences',
  }),
  perm({
    name: 'absences.edit',
    description: 'Modifier sa propre demande (avant approbation)',
    category: 'absences',
  }),
  perm({
    name: 'absences.delete',
    description: 'Supprimer sa propre demande (avant approbation)',
    category: 'absences',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'absences.create_managed',
    description: 'Créer une absence pour un employé (manager)',
    category: 'absences',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'absences.edit_managed',
    description: "Modifier l'absence d'un employé (manager)",
    category: 'absences',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'absences.delete_managed',
    description: "Supprimer l'absence d'un employé (manager)",
    category: 'absences',
    riskLevel: 'HIGH',
  }),
  perm({
    name: 'absences.approve',
    description: "Approuver une demande d'absence",
    category: 'absences',
    riskLevel: 'HIGH',
  }),
  perm({
    name: 'absences.reject',
    description: "Rejeter une demande d'absence",
    category: 'absences',
    riskLevel: 'HIGH',
  }),
  perm({
    name: 'absences.export',
    description: "Exporter les données d'absences",
    category: 'absences',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'absences.view_history',
    description: "Voir l'historique des modifications d'une absence",
    category: 'absences',
    riskLevel: 'MEDIUM',
  }),

  // ── CORRECTIONS ──────────────────────────────────────────────────────────────
  perm({
    name: 'corrections.view_self',
    description: 'Voir ses propres demandes de correction',
    category: 'corrections',
  }),
  perm({
    name: 'corrections.view_team',
    description: 'Voir les corrections de son équipe',
    category: 'corrections',
  }),
  perm({
    name: 'corrections.view_all',
    description: 'Voir toutes les corrections',
    category: 'corrections',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'corrections.create',
    description: 'Créer une demande de correction de pointage',
    category: 'corrections',
  }),
  perm({
    name: 'corrections.approve',
    description: 'Approuver une correction de pointage',
    category: 'corrections',
    riskLevel: 'HIGH',
  }),
  perm({
    name: 'corrections.reject',
    description: 'Rejeter une correction de pointage',
    category: 'corrections',
    riskLevel: 'HIGH',
  }),

  // ── EMPLOYÉS ─────────────────────────────────────────────────────────────────
  perm({
    name: 'employees.view_self',
    description: 'Voir son propre profil employé',
    category: 'employes',
  }),
  perm({
    name: 'employees.view_team',
    description: 'Voir les employés de son équipe/département',
    category: 'employes',
  }),
  perm({
    name: 'employees.view_all',
    description: 'Voir tous les employés',
    category: 'employes',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'employees.view_sensitive',
    description: 'Voir les données sensibles (email, département)',
    category: 'employes',
    riskLevel: 'HIGH',
  }),
  perm({
    name: 'employees.create',
    description: 'Créer un nouvel employé',
    category: 'employes',
    riskLevel: 'HIGH',
  }),
  perm({
    name: 'employees.edit',
    description: "Modifier les données d'un employé",
    category: 'employes',
    riskLevel: 'HIGH',
  }),
  perm({
    name: 'employees.delete',
    description: 'Désactiver un compte employé',
    category: 'employes',
    riskLevel: 'CRITICAL',
  }),
  perm({
    name: 'employees.activate',
    description: 'Activer un compte employé',
    category: 'employes',
    riskLevel: 'HIGH',
  }),
  perm({
    name: 'employees.deactivate',
    description: 'Désactiver un compte employé',
    category: 'employes',
    riskLevel: 'HIGH',
  }),
  perm({
    name: 'employees.reset_password',
    description: "Réinitialiser le mot de passe d'un employé",
    category: 'employes',
    riskLevel: 'CRITICAL',
  }),
  perm({
    name: 'employees.change_role',
    description: "Modifier le rôle d'un employé",
    category: 'employes',
    riskLevel: 'CRITICAL',
  }),
  perm({
    name: 'employees.import',
    description: 'Importer des employés en masse',
    category: 'employes',
    riskLevel: 'CRITICAL',
  }),
  perm({
    name: 'employees.export',
    description: 'Exporter la liste des employés',
    category: 'employes',
    riskLevel: 'HIGH',
  }),
  perm({
    name: 'employees.toggle_reports',
    description: 'Inclure/exclure un employé des rapports',
    category: 'employes',
  }),

  // ── DÉPARTEMENTS ─────────────────────────────────────────────────────────────
  perm({
    name: 'departments.view',
    description: 'Voir les départements',
    category: 'departements',
  }),
  perm({
    name: 'departments.create',
    description: 'Créer un département',
    category: 'departements',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'departments.edit',
    description: 'Modifier un département',
    category: 'departements',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'departments.delete',
    description: 'Supprimer un département',
    category: 'departements',
    riskLevel: 'MEDIUM',
  }),

  // ── POSTES ───────────────────────────────────────────────────────────────────
  perm({
    name: 'positions.view',
    description: 'Voir les postes',
    category: 'postes',
  }),
  perm({
    name: 'positions.create',
    description: 'Créer un poste',
    category: 'postes',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'positions.edit',
    description: 'Modifier un poste',
    category: 'postes',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'positions.delete',
    description: 'Supprimer un poste',
    category: 'postes',
    riskLevel: 'MEDIUM',
  }),

  // ── RAPPORTS ─────────────────────────────────────────────────────────────────
  perm({
    name: 'reports.view_self',
    description: 'Voir son propre rapport',
    category: 'rapports',
  }),
  perm({
    name: 'reports.view_team',
    description: 'Voir les rapports de son équipe',
    category: 'rapports',
  }),
  perm({
    name: 'reports.view_all',
    description: 'Voir tous les rapports',
    category: 'rapports',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'reports.generate',
    description: 'Générer un rapport',
    category: 'rapports',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'reports.export_pdf',
    description: 'Exporter un rapport en PDF',
    category: 'rapports',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'reports.export_excel',
    description: 'Exporter un rapport en Excel',
    category: 'rapports',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'reports.schedule',
    description: "Planifier l'envoi automatique d'un rapport",
    category: 'rapports',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'reports.delete_schedule',
    description: 'Supprimer une planification de rapport',
    category: 'rapports',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'reports.view_history',
    description: "Voir l'historique des envois de rapports",
    category: 'rapports',
  }),

  // ── EMAILS ───────────────────────────────────────────────────────────────────
  perm({
    name: 'emails.view',
    description: 'Voir la configuration emails',
    category: 'emails',
  }),
  perm({
    name: 'emails.configure',
    description: "Configurer les paramètres d'envoi",
    category: 'emails',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'emails.schedule',
    description: "Planifier des envois d'emails",
    category: 'emails',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'emails.manage_recipients',
    description: 'Gérer la liste des destinataires',
    category: 'emails',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'emails.send_now',
    description: 'Déclencher un envoi immédiat',
    category: 'emails',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'emails.delete_schedule',
    description: 'Supprimer une planification email',
    category: 'emails',
    riskLevel: 'MEDIUM',
  }),

  // ── LDAP ─────────────────────────────────────────────────────────────────────
  perm({
    name: 'ldap.view',
    description: 'Voir la configuration LDAP',
    category: 'admin',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'ldap.sync',
    description: 'Lancer une synchronisation LDAP',
    category: 'admin',
    riskLevel: 'HIGH',
  }),
  perm({
    name: 'ldap.view_users',
    description: "Voir les utilisateurs dans l'annuaire LDAP",
    category: 'admin',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'ldap.configure',
    description: 'Modifier la configuration du serveur LDAP',
    category: 'admin',
    riskLevel: 'CRITICAL',
  }),

  // ── PARAMÈTRES ───────────────────────────────────────────────────────────────
  perm({
    name: 'settings.view',
    description: 'Voir les paramètres système',
    category: 'parametres',
  }),
  perm({
    name: 'settings.work_hours',
    description: 'Configurer les horaires de travail',
    category: 'parametres',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'settings.notifications',
    description: 'Configurer les notifications système',
    category: 'parametres',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'settings.email',
    description: "Configurer l'envoi d'emails système",
    category: 'parametres',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'settings.ldap',
    description: 'Configurer la connexion LDAP',
    category: 'parametres',
    riskLevel: 'CRITICAL',
  }),
  perm({
    name: 'settings.security',
    description: 'Configurer les paramètres de sécurité',
    category: 'parametres',
    riskLevel: 'CRITICAL',
  }),
  perm({
    name: 'settings.ai',
    description: "Configurer le service d'intelligence artificielle",
    category: 'parametres',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'settings.general',
    description: 'Modifier les paramètres généraux',
    category: 'parametres',
    riskLevel: 'MEDIUM',
  }),

  // ── LOGS / AUDIT ─────────────────────────────────────────────────────────────
  perm({
    name: 'logs.view',
    description: 'Voir les logs système',
    category: 'logs',
  }),
  perm({
    name: 'logs.export',
    description: 'Exporter les logs',
    category: 'logs',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'logs.view_auth',
    description: "Voir les événements d'authentification",
    category: 'logs',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'logs.view_security',
    description: 'Voir les événements de sécurité',
    category: 'logs',
    riskLevel: 'HIGH',
  }),

  // ── PERMISSIONS ──────────────────────────────────────────────────────────────
  perm({
    name: 'permissions.view',
    description: 'Voir les permissions disponibles et attribuées',
    category: 'admin',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'permissions.assign',
    description: 'Attribuer une permission à un utilisateur',
    category: 'admin',
    riskLevel: 'CRITICAL',
  }),
  perm({
    name: 'permissions.revoke',
    description: "Révoquer une permission d'un utilisateur",
    category: 'admin',
    riskLevel: 'CRITICAL',
  }),
  perm({
    name: 'permissions.reset',
    description: 'Réinitialiser les permissions aux défauts du rôle',
    category: 'admin',
    riskLevel: 'CRITICAL',
  }),
  perm({
    name: 'permissions.audit',
    description: "Voir l'historique des changements de permissions",
    category: 'admin',
    riskLevel: 'MEDIUM',
  }),

  // ── INTELLIGENCE ARTIFICIELLE ────────────────────────────────────────────────
  perm({
    name: 'ai.chat',
    description: 'Utiliser le chatbot IA',
    category: 'ia',
  }),
  perm({
    name: 'ai.view_metrics',
    description: 'Consulter les métriques IA en temps réel',
    category: 'ia',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'ai.manage_cache',
    description: 'Vider le cache du service IA',
    category: 'ia',
    riskLevel: 'HIGH',
  }),
  perm({
    name: 'ai.manage_circuit',
    description: 'Réinitialiser le circuit breaker du service IA',
    category: 'ia',
    riskLevel: 'HIGH',
  }),
  perm({
    name: 'ai.configure',
    description: 'Configurer le comportement du service IA',
    category: 'ia',
    riskLevel: 'CRITICAL',
  }),
  perm({
    name: 'ai.view_history',
    description: "Voir l'historique des requêtes IA",
    category: 'ia',
    riskLevel: 'MEDIUM',
  }),

  // ── VALIDATIONS ──────────────────────────────────────────────────────────────
  perm({
    name: 'validations.view_team',
    description: 'Voir les validations en attente pour son équipe',
    category: 'validations',
  }),
  perm({
    name: 'validations.view_all',
    description: 'Voir toutes les validations en attente',
    category: 'validations',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'validations.approve',
    description: 'Valider une demande',
    category: 'validations',
    riskLevel: 'HIGH',
  }),
  perm({
    name: 'validations.reject',
    description: 'Rejeter une demande',
    category: 'validations',
    riskLevel: 'HIGH',
  }),

  // ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
  perm({
    name: 'notifications.view',
    description: 'Voir ses notifications',
    category: 'notifications',
  }),
  perm({
    name: 'notifications.configure',
    description: 'Configurer les préférences de notifications',
    category: 'notifications',
  }),

  // ── WORKERS / SCHEDULER ──────────────────────────────────────────────────────
  perm({
    name: 'workers.view',
    description: "Voir l'état des jobs planifiés",
    category: 'workers',
    riskLevel: 'MEDIUM',
  }),
  perm({
    name: 'workers.trigger',
    description: 'Déclencher manuellement un job planifié',
    category: 'workers',
    riskLevel: 'HIGH',
  }),
  perm({
    name: 'workers.configure',
    description: 'Configurer les jobs planifiés',
    category: 'workers',
    riskLevel: 'CRITICAL',
  }),
];

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async seedPermissions() {
    this.logger.log('Seeding permissions...');
    for (const perm of PERMISSIONS) {
      await this.prisma.permission.upsert({
        where: { name: perm.name },
        update: perm,
        create: perm,
      });
    }
    this.logger.log(`${PERMISSIONS.length} permissions seeded`);
    return { created: PERMISSIONS.length };
  }

  async seedFirstAdmin() {
    const username = 'admin';
    const email = 'admin@elitetime.local';
    const password = 'AdminPassword123!';

    const existing = await this.prisma.hiddenUsername.findUnique({
      where: { username },
    });
    if (existing?.userId) {
      return { message: 'Admin already exists', userId: existing.userId };
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: {
        username: encrypt(username),
        email: encrypt(email),
        firstname: encrypt('Admin'),
        lastname: encrypt('EliteTime'),
        password: hashed,
        isLocal: true,
        role: 'admin',
        status: 'active',
      },
    });

    await this.prisma.hiddenUsername.upsert({
      where: { username },
      update: { userId: user.id, hidden: false },
      create: { username, userId: user.id, hidden: false },
    });

    this.logger.log(`First admin created: ${username}`);
    return { message: 'Admin created', userId: user.id, username };
  }

  async grantAllPermissionsToAdmins() {
    const admins = await this.prisma.user.findMany({
      where: { role: 'admin', status: 'active' },
    });
    const permissions = await this.prisma.permission.findMany();

    let granted = 0;
    for (const admin of admins) {
      for (const perm of permissions) {
        try {
          await this.prisma.userPermission.upsert({
            where: {
              userId_permissionId: { userId: admin.id, permissionId: perm.id },
            },
            update: {},
            create: {
              userId: admin.id,
              permissionId: perm.id,
              grantedBy: 'seed',
            },
          });
          granted++;
        } catch {
          /* permission already granted */
        }
      }
    }

    return { granted, admins: admins.length, permissions: permissions.length };
  }
}
