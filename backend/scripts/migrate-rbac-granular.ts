/**
 * MIGRATION RBAC GRANULAIRE — EliteTime
 * ─────────────────────────────────────────────────────────────────────────────
 * Script de migration des données de permissions vers le nouveau modèle RBAC.
 *
 * Exécution :
 *   npx ts-node --project tsconfig.scripts.json scripts/migrate-rbac-granular.ts
 *
 * Ou via npm :
 *   npm run migrate:rbac
 *
 * Ce script est :
 *   • Idempotent   — peut être relancé sans effet de bord
 *   • Transactionnel — rollback complet en cas d'erreur
 *   • Auto-documenté — logs détaillés avec couleurs ANSI
 *
 * Étapes :
 *   1. Seed des 91 permissions granulaires (upsert idempotent)
 *   2. Migration des UserPermissions legacy → granulaires
 *   3. Suppression des permissions legacy de la DB
 *   4. Validation post-migration (audit SQL)
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Chargement des variables d'environnement depuis .env
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

// Prisma 7.x utilise un driver adapter — même pattern que PrismaService
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require('../dist/src/generated/prisma/client');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaPg } = require('@prisma/adapter-pg');

// ─── Types ────────────────────────────────────────────────────────────────────

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface PermissionDef {
  name: string;
  description: string;
  category: string;
  riskLevel: RiskLevel;
}

// ─── Couleurs ANSI ────────────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(level: 'INFO' | 'WARN' | 'ERR' | 'OK', msg: string) {
  const prefix: Record<string, string> = {
    INFO: `${C.cyan}[RBAC]${C.reset}`,
    WARN: `${C.yellow}[WARN]${C.reset}`,
    ERR:  `${C.red}[ERR] ${C.reset}`,
    OK:   `${C.green}[ OK ]${C.reset}`,
  };
  console.log(`${prefix[level]} ${msg}`);
}

function section(title: string) {
  console.log(`\n${C.bold}${C.cyan}━━━ ${title} ━━━${C.reset}`);
}

// ─── Mapping legacy → granulaire ──────────────────────────────────────────────

const LEGACY_MIGRATION_MAP: Record<string, string[]> = {
  manage_absences: [
    'absences.approve', 'absences.reject',
    'absences.create_managed', 'absences.edit_managed', 'absences.delete_managed',
    'absences.view_team', 'absences.view_history', 'absences.export',
    'corrections.view_team', 'corrections.approve', 'corrections.reject',
    'validations.view_team', 'validations.approve', 'validations.reject',
  ],
  manage_pointages: [
    'pointages.create', 'pointages.edit', 'pointages.delete',
    'pointages.close_session', 'pointages.force_checkout',
    'pointages.view_team', 'pointages.validate', 'pointages.export',
    'breaks.view_team', 'breaks.manage',
    'corrections.view_team', 'corrections.approve', 'corrections.reject',
  ],
  view_all_pointages:  ['pointages.view_all', 'pointages.view_team', 'pointages.view_self', 'breaks.view_all', 'breaks.view_team'],
  view_team_pointages: ['pointages.view_team', 'pointages.view_self', 'breaks.view_team', 'breaks.view_self'],
  view_all_absences:   ['absences.view_all', 'absences.view_team'],
  view_team_absences:  ['absences.view_team'],
  view_reports:        ['reports.view_all', 'reports.view_team', 'reports.view_self', 'reports.generate', 'reports.export_pdf', 'reports.export_excel'],
  view_team_reports:   ['reports.view_team', 'reports.view_self'],
  download_reports:    ['reports.export_pdf', 'reports.export_excel'],
  view_employees:      ['employees.view_all', 'employees.view_team', 'employees.export'],
  create_employees:    ['employees.create'],
  edit_employees:      ['employees.edit', 'employees.toggle_reports', 'employees.activate', 'employees.deactivate', 'employees.reset_password', 'employees.change_role'],
  delete_employees:    ['employees.delete', 'employees.deactivate'],
  view_logs:           ['logs.view', 'logs.export', 'logs.view_auth', 'logs.view_security'],
  view_settings:       ['settings.view'],
  edit_system_settings:['settings.work_hours', 'settings.general', 'settings.security', 'settings.email', 'settings.ai', 'settings.notifications'],
  view_emails:         ['emails.view'],
  manage_email_scheduling: ['emails.configure', 'emails.schedule', 'emails.manage_recipients', 'emails.send_now', 'emails.delete_schedule', 'emails.view', 'reports.schedule', 'reports.delete_schedule'],
  view_departments:    ['departments.view'],
  create_department:   ['departments.create'],
  edit_department:     ['departments.edit'],
  delete_department:   ['departments.delete'],
  view_positions:      ['positions.view'],
  create_position:     ['positions.create'],
  edit_position:       ['positions.edit'],
  delete_position:     ['positions.delete'],
  manage_permissions:  ['permissions.view', 'permissions.assign', 'permissions.revoke', 'permissions.reset', 'permissions.audit', 'auth.revoke_all_sessions'],
  manage_ldap:         ['ldap.view', 'ldap.sync', 'ldap.view_users', 'ldap.configure', 'workers.trigger'],
  view_admin_dashboard:   ['dashboard.view_global'],
  view_manager_dashboard: ['dashboard.view_team'],
  view_ai_metrics: ['ai.view_metrics', 'ai.view_history'],
  manage_ai:       ['ai.manage_cache', 'ai.manage_circuit', 'ai.configure'],
};

// Inclut aussi les orphelines sans mapping (suppression directe sans migration de données)
const LEGACY_ORPHANS = ['manage_departments', 'manage_positions', 'edit_pointages', 'edit_settings', 'manage_emails', 'edit_positions'];
const LEGACY_NAMES = [...Object.keys(LEGACY_MIGRATION_MAP), ...LEGACY_ORPHANS];

// ─── Définitions complètes des 91 permissions ─────────────────────────────────

const RISK: Record<string, RiskLevel> = {
  // CRITICAL
  'auth.revoke_all_sessions': 'CRITICAL',
  'employees.delete': 'CRITICAL', 'employees.change_role': 'CRITICAL',
  'employees.reset_password': 'CRITICAL', 'employees.import': 'CRITICAL',
  'permissions.assign': 'CRITICAL', 'permissions.revoke': 'CRITICAL', 'permissions.reset': 'CRITICAL',
  'settings.ldap': 'CRITICAL', 'settings.security': 'CRITICAL',
  'ldap.configure': 'CRITICAL', 'workers.configure': 'CRITICAL', 'ai.configure': 'CRITICAL',
  // HIGH
  'pointages.edit': 'HIGH', 'pointages.delete': 'HIGH', 'pointages.close_session': 'HIGH',
  'pointages.force_checkout': 'HIGH', 'pointages.validate': 'HIGH', 'pointages.import': 'HIGH',
  'absences.delete_managed': 'HIGH', 'absences.approve': 'HIGH', 'absences.reject': 'HIGH',
  'employees.view_sensitive': 'HIGH', 'employees.create': 'HIGH', 'employees.edit': 'HIGH',
  'employees.activate': 'HIGH', 'employees.deactivate': 'HIGH', 'employees.export': 'HIGH',
  'corrections.approve': 'HIGH', 'corrections.reject': 'HIGH',
  'validations.approve': 'HIGH', 'validations.reject': 'HIGH',
  'logs.view_security': 'HIGH',
  'ai.manage_cache': 'HIGH', 'ai.manage_circuit': 'HIGH',
  'ldap.sync': 'HIGH', 'workers.trigger': 'HIGH', 'breaks.manage': 'HIGH',
  // MEDIUM
  'pointages.view_all': 'MEDIUM', 'pointages.create': 'MEDIUM', 'pointages.export': 'MEDIUM',
  'breaks.view_all': 'MEDIUM', 'breaks.export': 'MEDIUM',
  'absences.view_all': 'MEDIUM', 'absences.create_managed': 'MEDIUM', 'absences.edit_managed': 'MEDIUM',
  'absences.export': 'MEDIUM', 'absences.view_history': 'MEDIUM', 'absences.delete': 'MEDIUM',
  'corrections.view_all': 'MEDIUM', 'employees.view_all': 'MEDIUM',
  'departments.create': 'MEDIUM', 'departments.edit': 'MEDIUM', 'departments.delete': 'MEDIUM',
  'positions.create': 'MEDIUM', 'positions.edit': 'MEDIUM', 'positions.delete': 'MEDIUM',
  'reports.view_all': 'MEDIUM', 'reports.generate': 'MEDIUM', 'reports.export_pdf': 'MEDIUM',
  'reports.export_excel': 'MEDIUM', 'reports.schedule': 'MEDIUM', 'reports.delete_schedule': 'MEDIUM',
  'emails.configure': 'MEDIUM', 'emails.schedule': 'MEDIUM', 'emails.manage_recipients': 'MEDIUM',
  'emails.send_now': 'MEDIUM', 'emails.delete_schedule': 'MEDIUM',
  'ldap.view': 'MEDIUM', 'ldap.view_users': 'MEDIUM',
  'logs.export': 'MEDIUM', 'logs.view_auth': 'MEDIUM',
  'settings.work_hours': 'MEDIUM', 'settings.email': 'MEDIUM', 'settings.ai': 'MEDIUM',
  'settings.general': 'MEDIUM', 'settings.notifications': 'MEDIUM',
  'permissions.view': 'MEDIUM', 'permissions.audit': 'MEDIUM',
  'ai.view_metrics': 'MEDIUM', 'ai.view_history': 'MEDIUM',
  'dashboard.view_global': 'MEDIUM', 'workers.view': 'MEDIUM',
};

const PERMISSIONS: PermissionDef[] = [
  { name: 'auth.view_sessions',       description: 'Voir ses propres sessions actives',                       category: 'auth', riskLevel: RISK['auth.view_sessions'] ?? 'LOW' },
  { name: 'auth.revoke_own_sessions', description: 'Révoquer ses propres sessions',                           category: 'auth', riskLevel: RISK['auth.revoke_own_sessions'] ?? 'LOW' },
  { name: 'auth.revoke_all_sessions', description: "Révoquer les sessions de n'importe quel utilisateur",     category: 'auth', riskLevel: 'CRITICAL' },
  { name: 'auth.change_password',     description: 'Changer son propre mot de passe',                         category: 'auth', riskLevel: 'LOW' },

  { name: 'dashboard.view_self',   description: 'Voir son propre dashboard (employé)',         category: 'dashboard', riskLevel: 'LOW' },
  { name: 'dashboard.view_team',   description: 'Voir le dashboard équipe (manager)',          category: 'dashboard', riskLevel: 'LOW' },
  { name: 'dashboard.view_global', description: 'Voir le dashboard global (administrateur)',   category: 'dashboard', riskLevel: 'MEDIUM' },

  { name: 'pointages.view_self',      description: 'Voir ses propres pointages',                         category: 'pointages', riskLevel: 'LOW' },
  { name: 'pointages.view_team',      description: 'Voir les pointages de son équipe',                   category: 'pointages', riskLevel: 'LOW' },
  { name: 'pointages.view_all',       description: 'Voir tous les pointages sans restriction',           category: 'pointages', riskLevel: 'MEDIUM' },
  { name: 'pointages.create',         description: "Créer un pointage pour un employé",                  category: 'pointages', riskLevel: 'MEDIUM' },
  { name: 'pointages.edit',           description: 'Modifier un pointage existant',                      category: 'pointages', riskLevel: 'HIGH' },
  { name: 'pointages.delete',         description: 'Supprimer une session de pointage',                  category: 'pointages', riskLevel: 'HIGH' },
  { name: 'pointages.close_session',  description: "Forcer la clôture d'une session ouverte",            category: 'pointages', riskLevel: 'HIGH' },
  { name: 'pointages.force_checkout', description: "Forcer la sortie d'un employé",                      category: 'pointages', riskLevel: 'HIGH' },
  { name: 'pointages.export',         description: 'Exporter les données de pointage',                   category: 'pointages', riskLevel: 'MEDIUM' },
  { name: 'pointages.validate',       description: 'Valider un pointage',                                category: 'pointages', riskLevel: 'HIGH' },
  { name: 'pointages.import',         description: 'Importer des pointages en masse',                    category: 'pointages', riskLevel: 'CRITICAL' },

  { name: 'breaks.view_self',  description: 'Voir ses propres pauses',            category: 'breaks', riskLevel: 'LOW' },
  { name: 'breaks.view_team',  description: "Voir les pauses de son équipe",      category: 'breaks', riskLevel: 'LOW' },
  { name: 'breaks.view_all',   description: 'Voir toutes les pauses',             category: 'breaks', riskLevel: 'MEDIUM' },
  { name: 'breaks.manage',     description: "Gérer les pauses des employés",      category: 'breaks', riskLevel: 'HIGH' },
  { name: 'breaks.export',     description: 'Exporter les données de pauses',     category: 'breaks', riskLevel: 'MEDIUM' },

  { name: 'absences.view_self',        description: 'Voir ses propres absences',                                category: 'absences', riskLevel: 'LOW' },
  { name: 'absences.view_team',        description: "Voir les absences de son équipe",                          category: 'absences', riskLevel: 'LOW' },
  { name: 'absences.view_all',         description: 'Voir toutes les absences sans restriction',                category: 'absences', riskLevel: 'MEDIUM' },
  { name: 'absences.create',           description: "Créer sa propre demande d'absence",                        category: 'absences', riskLevel: 'LOW' },
  { name: 'absences.edit',             description: 'Modifier sa propre demande (avant approbation)',           category: 'absences', riskLevel: 'LOW' },
  { name: 'absences.delete',           description: 'Supprimer sa propre demande (avant approbation)',          category: 'absences', riskLevel: 'MEDIUM' },
  { name: 'absences.create_managed',   description: "Créer une absence pour un employé (manager)",              category: 'absences', riskLevel: 'MEDIUM' },
  { name: 'absences.edit_managed',     description: "Modifier l'absence d'un employé (manager)",               category: 'absences', riskLevel: 'MEDIUM' },
  { name: 'absences.delete_managed',   description: "Supprimer l'absence d'un employé (manager)",              category: 'absences', riskLevel: 'HIGH' },
  { name: 'absences.approve',          description: "Approuver une demande d'absence",                          category: 'absences', riskLevel: 'HIGH' },
  { name: 'absences.reject',           description: "Rejeter une demande d'absence",                            category: 'absences', riskLevel: 'HIGH' },
  { name: 'absences.export',           description: "Exporter les données d'absences",                          category: 'absences', riskLevel: 'MEDIUM' },
  { name: 'absences.view_history',     description: "Voir l'historique des modifications d'une absence",        category: 'absences', riskLevel: 'MEDIUM' },

  { name: 'corrections.view_self',  description: 'Voir ses propres demandes de correction',      category: 'corrections', riskLevel: 'LOW' },
  { name: 'corrections.view_team',  description: "Voir les corrections de son équipe",           category: 'corrections', riskLevel: 'LOW' },
  { name: 'corrections.view_all',   description: 'Voir toutes les corrections',                  category: 'corrections', riskLevel: 'MEDIUM' },
  { name: 'corrections.create',     description: 'Créer une demande de correction de pointage',  category: 'corrections', riskLevel: 'LOW' },
  { name: 'corrections.approve',    description: 'Approuver une correction de pointage',         category: 'corrections', riskLevel: 'HIGH' },
  { name: 'corrections.reject',     description: 'Rejeter une correction de pointage',           category: 'corrections', riskLevel: 'HIGH' },

  { name: 'employees.view_self',      description: 'Voir son propre profil employé',                         category: 'employes', riskLevel: 'LOW' },
  { name: 'employees.view_team',      description: "Voir les employés de son équipe/département",            category: 'employes', riskLevel: 'LOW' },
  { name: 'employees.view_all',       description: 'Voir tous les employés',                                 category: 'employes', riskLevel: 'MEDIUM' },
  { name: 'employees.view_sensitive', description: 'Voir les données sensibles (email, département)',        category: 'employes', riskLevel: 'HIGH' },
  { name: 'employees.create',         description: 'Créer un nouvel employé',                                category: 'employes', riskLevel: 'HIGH' },
  { name: 'employees.edit',           description: "Modifier les données d'un employé",                     category: 'employes', riskLevel: 'HIGH' },
  { name: 'employees.delete',         description: 'Désactiver un compte employé',                          category: 'employes', riskLevel: 'CRITICAL' },
  { name: 'employees.activate',       description: 'Activer un compte employé',                             category: 'employes', riskLevel: 'HIGH' },
  { name: 'employees.deactivate',     description: 'Désactiver un compte employé',                          category: 'employes', riskLevel: 'HIGH' },
  { name: 'employees.reset_password', description: "Réinitialiser le mot de passe d'un employé",           category: 'employes', riskLevel: 'CRITICAL' },
  { name: 'employees.change_role',    description: "Modifier le rôle d'un employé",                        category: 'employes', riskLevel: 'CRITICAL' },
  { name: 'employees.import',         description: 'Importer des employés en masse',                        category: 'employes', riskLevel: 'CRITICAL' },
  { name: 'employees.export',         description: 'Exporter la liste des employés',                        category: 'employes', riskLevel: 'HIGH' },
  { name: 'employees.toggle_reports', description: "Inclure/exclure un employé des rapports",               category: 'employes', riskLevel: 'LOW' },

  { name: 'departments.view',   description: 'Voir les départements',    category: 'departements', riskLevel: 'LOW' },
  { name: 'departments.create', description: 'Créer un département',     category: 'departements', riskLevel: 'MEDIUM' },
  { name: 'departments.edit',   description: 'Modifier un département',  category: 'departements', riskLevel: 'MEDIUM' },
  { name: 'departments.delete', description: 'Supprimer un département', category: 'departements', riskLevel: 'MEDIUM' },

  { name: 'positions.view',   description: 'Voir les postes',    category: 'postes', riskLevel: 'LOW' },
  { name: 'positions.create', description: 'Créer un poste',     category: 'postes', riskLevel: 'MEDIUM' },
  { name: 'positions.edit',   description: 'Modifier un poste',  category: 'postes', riskLevel: 'MEDIUM' },
  { name: 'positions.delete', description: 'Supprimer un poste', category: 'postes', riskLevel: 'MEDIUM' },

  { name: 'reports.view_self',       description: 'Voir son propre rapport',                      category: 'rapports', riskLevel: 'LOW' },
  { name: 'reports.view_team',       description: "Voir les rapports de son équipe",              category: 'rapports', riskLevel: 'LOW' },
  { name: 'reports.view_all',        description: 'Voir tous les rapports',                       category: 'rapports', riskLevel: 'MEDIUM' },
  { name: 'reports.generate',        description: 'Générer un rapport',                           category: 'rapports', riskLevel: 'MEDIUM' },
  { name: 'reports.export_pdf',      description: 'Exporter un rapport en PDF',                   category: 'rapports', riskLevel: 'MEDIUM' },
  { name: 'reports.export_excel',    description: 'Exporter un rapport en Excel',                 category: 'rapports', riskLevel: 'MEDIUM' },
  { name: 'reports.schedule',        description: "Planifier l'envoi automatique d'un rapport",   category: 'rapports', riskLevel: 'MEDIUM' },
  { name: 'reports.delete_schedule', description: "Supprimer une planification de rapport",       category: 'rapports', riskLevel: 'MEDIUM' },
  { name: 'reports.view_history',    description: "Voir l'historique des envois de rapports",     category: 'rapports', riskLevel: 'LOW' },

  { name: 'emails.view',              description: 'Voir la configuration emails',               category: 'emails', riskLevel: 'LOW' },
  { name: 'emails.configure',         description: "Configurer les paramètres d'envoi",          category: 'emails', riskLevel: 'MEDIUM' },
  { name: 'emails.schedule',          description: "Planifier des envois d'emails",              category: 'emails', riskLevel: 'MEDIUM' },
  { name: 'emails.manage_recipients', description: 'Gérer la liste des destinataires',           category: 'emails', riskLevel: 'MEDIUM' },
  { name: 'emails.send_now',          description: 'Déclencher un envoi immédiat',               category: 'emails', riskLevel: 'MEDIUM' },
  { name: 'emails.delete_schedule',   description: 'Supprimer une planification email',          category: 'emails', riskLevel: 'MEDIUM' },

  { name: 'ldap.view',       description: 'Voir la configuration LDAP',                    category: 'admin', riskLevel: 'MEDIUM' },
  { name: 'ldap.sync',       description: 'Lancer une synchronisation LDAP',               category: 'admin', riskLevel: 'HIGH' },
  { name: 'ldap.view_users', description: "Voir les utilisateurs dans l'annuaire LDAP",    category: 'admin', riskLevel: 'MEDIUM' },
  { name: 'ldap.configure',  description: 'Modifier la configuration du serveur LDAP',     category: 'admin', riskLevel: 'CRITICAL' },

  { name: 'settings.view',          description: 'Voir les paramètres système',                       category: 'parametres', riskLevel: 'LOW' },
  { name: 'settings.work_hours',    description: 'Configurer les horaires de travail',                category: 'parametres', riskLevel: 'MEDIUM' },
  { name: 'settings.notifications', description: 'Configurer les notifications système',              category: 'parametres', riskLevel: 'MEDIUM' },
  { name: 'settings.email',         description: "Configurer l'envoi d'emails système",               category: 'parametres', riskLevel: 'MEDIUM' },
  { name: 'settings.ldap',          description: 'Configurer la connexion LDAP',                      category: 'parametres', riskLevel: 'CRITICAL' },
  { name: 'settings.security',      description: 'Configurer les paramètres de sécurité',             category: 'parametres', riskLevel: 'CRITICAL' },
  { name: 'settings.ai',            description: "Configurer le service d'intelligence artificielle", category: 'parametres', riskLevel: 'MEDIUM' },
  { name: 'settings.general',       description: 'Modifier les paramètres généraux',                  category: 'parametres', riskLevel: 'MEDIUM' },

  { name: 'logs.view',          description: 'Voir les logs système',                   category: 'logs', riskLevel: 'LOW' },
  { name: 'logs.export',        description: 'Exporter les logs',                       category: 'logs', riskLevel: 'MEDIUM' },
  { name: 'logs.view_auth',     description: "Voir les événements d'authentification",   category: 'logs', riskLevel: 'MEDIUM' },
  { name: 'logs.view_security', description: 'Voir les événements de sécurité',          category: 'logs', riskLevel: 'HIGH' },

  { name: 'permissions.view',   description: 'Voir les permissions disponibles et attribuées',      category: 'admin', riskLevel: 'MEDIUM' },
  { name: 'permissions.assign', description: "Attribuer une permission à un utilisateur",           category: 'admin', riskLevel: 'CRITICAL' },
  { name: 'permissions.revoke', description: "Révoquer une permission d'un utilisateur",            category: 'admin', riskLevel: 'CRITICAL' },
  { name: 'permissions.reset',  description: 'Réinitialiser les permissions aux défauts du rôle',   category: 'admin', riskLevel: 'CRITICAL' },
  { name: 'permissions.audit',  description: "Voir l'historique des changements de permissions",    category: 'admin', riskLevel: 'MEDIUM' },

  { name: 'ai.chat',           description: 'Utiliser le chatbot IA',                          category: 'ia', riskLevel: 'LOW' },
  { name: 'ai.view_metrics',   description: 'Consulter les métriques IA en temps réel',        category: 'ia', riskLevel: 'MEDIUM' },
  { name: 'ai.manage_cache',   description: 'Vider le cache du service IA',                    category: 'ia', riskLevel: 'HIGH' },
  { name: 'ai.manage_circuit', description: 'Réinitialiser le circuit breaker du service IA',  category: 'ia', riskLevel: 'HIGH' },
  { name: 'ai.configure',      description: 'Configurer le comportement du service IA',        category: 'ia', riskLevel: 'CRITICAL' },
  { name: 'ai.view_history',   description: "Voir l'historique des requêtes IA",               category: 'ia', riskLevel: 'MEDIUM' },

  { name: 'validations.view_team', description: "Voir les validations en attente pour son équipe",  category: 'validations', riskLevel: 'LOW' },
  { name: 'validations.view_all',  description: 'Voir toutes les validations en attente',           category: 'validations', riskLevel: 'MEDIUM' },
  { name: 'validations.approve',   description: 'Valider une demande',                              category: 'validations', riskLevel: 'HIGH' },
  { name: 'validations.reject',    description: 'Rejeter une demande',                              category: 'validations', riskLevel: 'HIGH' },

  { name: 'notifications.view',      description: 'Voir ses notifications',                          category: 'notifications', riskLevel: 'LOW' },
  { name: 'notifications.configure', description: 'Configurer les préférences de notifications',     category: 'notifications', riskLevel: 'LOW' },

  { name: 'workers.view',      description: "Voir l'état des jobs planifiés",         category: 'workers', riskLevel: 'MEDIUM' },
  { name: 'workers.trigger',   description: 'Déclencher manuellement un job planifié', category: 'workers', riskLevel: 'HIGH' },
  { name: 'workers.configure', description: 'Configurer les jobs planifiés',           category: 'workers', riskLevel: 'CRITICAL' },
];

// ─── Fonctions utilitaires ─────────────────────────────────────────────────────

function deriveModuleAction(name: string): { module: string; action: string } {
  const dotIndex = name.indexOf('.');
  if (dotIndex === -1) return { module: name, action: '' };
  return { module: name.slice(0, dotIndex), action: name.slice(dotIndex + 1) };
}

// ─── Exécution principale ──────────────────────────────────────────────────────

async function main() {
  if (!process.env.DATABASE_URL) {
    log('ERR', 'DATABASE_URL manquant dans les variables d\'environnement');
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  console.log(`\n${C.bold}${C.cyan}╔══════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║  MIGRATION RBAC GRANULAIRE — EliteTime               ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚══════════════════════════════════════════════════════╝${C.reset}`);

  try {
    // ── ÉTAPE 1 : Seed des 91 permissions granulaires ──────────────────────────
    section('ÉTAPE 1/4 — Seed des permissions granulaires');

    let created = 0;
    let updated = 0;

    for (const perm of PERMISSIONS) {
      const { module, action } = deriveModuleAction(perm.name);
      const existing = await prisma.permission.findUnique({ where: { name: perm.name } });

      if (!existing) {
        await prisma.permission.create({
          data: {
            name: perm.name,
            description: perm.description,
            category: perm.category,
            module,
            action,
            riskLevel: perm.riskLevel,
            isSystem: true,
          },
        });
        created++;
      } else {
        // Mettre à jour les champs manquants si la permission existe déjà
        if (!existing.module || !existing.action || existing.riskLevel === 'LOW') {
          await prisma.permission.update({
            where: { name: perm.name },
            data: { module, action, riskLevel: perm.riskLevel, isSystem: true, description: perm.description },
          });
          updated++;
        }
      }
    }

    log('OK', `${created} permissions créées, ${updated} mises à jour, ${PERMISSIONS.length - created - updated} déjà à jour`);

    // ── ÉTAPE 2 : Migration UserPermissions legacy → granulaires ───────────────
    section('ÉTAPE 2/4 — Migration des UserPermissions legacy');

    const legacyPerms = await prisma.permission.findMany({
      where: { name: { in: LEGACY_NAMES } },
    });

    if (legacyPerms.length === 0) {
      log('INFO', `${C.dim}Aucune permission legacy trouvée en base — étape ignorée${C.reset}`);
    } else {
      log('INFO', `${legacyPerms.length} permissions legacy trouvées : ${legacyPerms.map((p: { name: string }) => p.name).join(', ')}`);

      const legacyPermIds = legacyPerms.map((p: { id: string }) => p.id);
      const legacyPermsByName = new Map(legacyPerms.map((p: { name: string; id: string }) => [p.name, p.id]));

      const legacyUserPerms = await prisma.userPermission.findMany({
        where: { permissionId: { in: legacyPermIds } },
        include: { permission: { select: { name: true } } },
      });

      log('INFO', `${legacyUserPerms.length} attributions utilisateurs à migrer`);

      // Charger toutes les permissions granulaires (name → id)
      const allGranularPerms = await prisma.permission.findMany({
        where: { module: { not: null } },
        select: { id: true, name: true },
      });
      const granularIdByName = new Map(allGranularPerms.map((p: { name: string; id: string }) => [p.name, p.id]));

      let granularCreated = 0;
      let granularSkipped = 0;

      // Transaction : créer les nouveaux + supprimer les legacy
      await prisma.$transaction(async (tx: typeof prisma) => {
        for (const up of legacyUserPerms) {
          const legacyName = up.permission.name;
          const granularNames = LEGACY_MIGRATION_MAP[legacyName] ?? [];

          for (const gName of granularNames) {
            const gId = granularIdByName.get(gName);
            if (!gId) {
              log('WARN', `Permission granulaire "${gName}" non trouvée — seed d'abord`);
              granularSkipped++;
              continue;
            }

            const alreadyExists = await tx.userPermission.findUnique({
              where: { userId_permissionId: { userId: up.userId, permissionId: gId } },
            });

            if (!alreadyExists) {
              await tx.userPermission.create({
                data: { userId: up.userId, permissionId: gId, grantedBy: up.grantedBy ?? 'migration' },
              });
              granularCreated++;
            }
          }
        }

        // Supprimer tous les UserPermissions legacy
        const deleted = await tx.userPermission.deleteMany({
          where: { permissionId: { in: legacyPermIds } },
        });

        log('OK', `${granularCreated} attributions granulaires créées, ${deleted.count} legacy supprimées`);
      });

      // ── ÉTAPE 3 : Suppression des Permission legacy ─────────────────────────
      section('ÉTAPE 3/4 — Suppression des permissions legacy');

      const deletedPerms = await prisma.permission.deleteMany({
        where: { id: { in: legacyPermIds } },
      });
      log('OK', `${deletedPerms.count} permissions legacy supprimées de la table Permission`);
    }

    // ── ÉTAPE 4 : Validation post-migration ───────────────────────────────────
    section('ÉTAPE 4/4 — Validation post-migration');

    const totalPerms = await prisma.permission.count();
    log('INFO', `Total permissions en base : ${C.bold}${totalPerms}${C.reset}`);

    const legacyRemaining = await prisma.permission.count({
      where: { name: { in: LEGACY_NAMES } },
    });

    if (legacyRemaining > 0) {
      log('ERR', `${C.red}${legacyRemaining} permissions legacy encore présentes !${C.reset}`);
      process.exit(1);
    }
    log('OK', 'Zéro permission legacy restante');

    const granularCount = await prisma.permission.count({
      where: { module: { not: null } },
    });
    log('OK', `${granularCount} permissions granulaires (format module.action) actives`);

    const criticalCount = await prisma.permission.count({ where: { riskLevel: 'CRITICAL' } });
    const highCount     = await prisma.permission.count({ where: { riskLevel: 'HIGH' } });
    const mediumCount   = await prisma.permission.count({ where: { riskLevel: 'MEDIUM' } });
    const lowCount      = await prisma.permission.count({ where: { riskLevel: 'LOW' } });

    log('INFO', `Distribution des risques — CRITICAL:${criticalCount} HIGH:${highCount} MEDIUM:${mediumCount} LOW:${lowCount}`);

    const orphanedUserPerms = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM "UserPermission" up
      WHERE NOT EXISTS (
        SELECT 1 FROM "Permission" p WHERE p.id = up."permissionId"
      )
    `;
    const orphaned = Number(orphanedUserPerms[0]?.count ?? 0);
    if (orphaned > 0) {
      log('WARN', `${orphaned} UserPermissions orphelines détectées (permissionId introuvable)`);
    } else {
      log('OK', 'Aucune UserPermission orpheline');
    }

    console.log(`\n${C.bold}${C.green}╔══════════════════════════════════════════════════════╗${C.reset}`);
    console.log(`${C.bold}${C.green}║  MIGRATION TERMINÉE AVEC SUCCÈS                      ║${C.reset}`);
    console.log(`${C.bold}${C.green}╚══════════════════════════════════════════════════════╝${C.reset}\n`);

  } catch (err) {
    log('ERR', `Migration échouée : ${String(err)}`);
    if (err instanceof Error) console.error(err.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
