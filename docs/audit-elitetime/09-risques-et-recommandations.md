# 09 — Risques et recommandations

> Les constats de sécurité détaillés (scénario, preuve, correctif) sont dans `04-authentification-et-securite.md` (S-01 à S-17). Ce document les consolide avec les risques opérationnels, de disponibilité, de données et fonctionnels, puis propose un plan priorisé.
>
> **Gravité** = impact × probabilité. **Confiance** : C = confirmé (code/config/environnement), P = probable, V = à vérifier.

---

## 1. Registre des risques

### 1.1 Sécurité

| ID | Risque | Gravité | Confiance | Réf. |
|---|---|---|---|---|
| R-01 | Escalade manager → admin via `PATCH /api/users/:id` | **Critique** | C | S-01 |
| R-02 | Anti-force brute inopérant (logins illimités, comptes locaux exposés) | Élevée | C | S-02 |
| R-03 | Aucun chiffrement réseau : HTTP, LDAP en clair (mots de passe AD), PostgreSQL sans TLS | Élevée | C | S-03 |
| R-04 | `.env` (clé AES, secret Azure, mot de passe AD/BDD) et dump non chiffré lisibles par tous les utilisateurs locaux ; dossier applicatif inscriptible par les Utilisateurs | Élevée | C | S-04 |
| R-05 | Réactivation d'un compte désactivé/supprimé lors d'une connexion AD | Élevée | C | S-05 |
| R-06 | Exfiltration de rapports nominatifs par ajout d'adresses e-mail externes (managers) | Élevée | C | S-06 |
| R-07 | Cloisonnement équipe/département insuffisant (lecture/écriture de pointages d'autrui, rapport global) | Moyenne–Élevée | C | S-07 |
| R-08 | Next.js (3000) et PostgreSQL (5432) joignables depuis le LAN | Moyenne | C | S-08 |
| R-09 | Dépendances avec vulnérabilités critiques (`next`, `proxy-addr`) | Moyenne–Élevée | C (exploitabilité V) | S-11 |
| R-10 | Déchiffrement « fail-open », absence d'AAD et de versionnement de clé | Moyenne | C | S-09 |
| R-11 | Tokens de session en clair en base, pas de révocation globale | Moyenne | C | S-12 |
| R-12 | Validation des entrées absente sur la majorité des routes | Moyenne | C | S-10 |
| R-13 | Données personnelles en clair dans `ActivityLog` et les journaux, sans rétention | Faible–Moyenne | C | S-13 |

### 1.2 Disponibilité et exploitation

| ID | Risque | Gravité | Confiance | Preuve |
|---|---|---|---|---|
| R-14 | **Application non redémarrée après un reboot** tant que `ut08rm` n'ouvre pas de session ; dépendances (PM2, modèles IA, navigateurs PDF) dans un profil personnel | **Élevée** | C | `05` §2.1 |
| R-15 | **Aucune sauvegarde de base exploitable** ; clé de chiffrement non sauvegardée (à confirmer) ; migrations inutilisables pour reconstruire | **Critique** | C (sauvegarde VM : V) | `07` §5, `03` §8 |
| R-16 | **Dépendance LDAP sans redondance** — incident en cours le 13/10/2026 (DC injoignable) | Élevée | C | `06` §6.1 |
| R-17 | **Fuseaux horaires incohérents** : Windows UTC+1 (`W. Central Africa`), `SystemSettings.timezone` et PostgreSQL `Europe/Paris`. Les heures de pointage, retards et déclenchements utilisent l'heure Windows ; le jour d'envoi des rapports utilise Europe/Paris. Pendant l'heure d'été européenne, un décalage d'1 h existe entre ces référentiels | Moyenne | C | `.env`, `postgresql.conf`, `Get-TimeZone` |
| R-18 | Serveur unique tout-en-un (IIS, 2 Node, PostgreSQL, Ollama, Chromium) sur 8 Go RAM / 1 disque | Moyenne | C | `05` §1 |
| R-19 | Aucune supervision ni alerte ; aucune route de santé | Moyenne | C | `07` §3 |
| R-20 | Journaux sans rotation (≈ 100 Mo cumulés, croissance continue) | Faible–Moyenne | C | `07` §2 |
| R-21 | E-mails planifiés perdus si le backend est indisponible à la minute prévue ; doublons si 2 instances | Moyenne | C | `06` §5 |
| R-22 | Production = poste de développement (clone Git modifiable, outils de dev), aucune recette, aucun CD fonctionnel, pas de retour arrière | Élevée | C | `05` §4 |
| R-23 | Secret Azure à expiration non surveillée → arrêt silencieux des e-mails | Moyenne | P | `06` §6.2 |

### 1.3 Données et fonctionnel

| ID | Risque | Gravité | Confiance | Preuve |
|---|---|---|---|---|
| R-24 | Calculs de temps travaillé incohérents (pause forfaitaire vs réelle ; double déduction multi-sessions ; clôture auto sans heure de sortie) | Moyenne | C | `01` §5.1, §5.4, §5.5 |
| R-25 | Double pointage possible (concurrence) | Faible | C | `01` §5.1 |
| R-26 | Jours fériés ignorés (retards comptés à tort) | Moyenne | C | `01` §5.1 |
| R-27 | Renommage de département sans effet sur les employés (champ chiffré) | Moyenne | C | `06` §2.6 |
| R-28 | Synchro AD : statut des comptes existants jamais mis à jour ; soft delete massif possible si l'AD renvoie une liste partielle ; règle `ut…` codée en dur | Moyenne | C | `01` §5.12 |
| R-29 | Fonctionnalités annoncées mais absentes (corrections, alertes configurables, CSV, intervalle LDAP) — décalage avec le manuel utilisateur | Faible–Moyenne | C | `01` §6 |
| R-30 | Performances dégradées avec la croissance : filtrage/déchiffrement en mémoire de tous les utilisateurs, `ActivityLog` non indexé et interrogé à chaque login | Faible (aujourd'hui) → Moyenne | C | `03` §7 |

---

## 2. Plan d'amélioration priorisé

Coûts indicatifs en jours-personne (j) pour un développeur connaissant le projet ; à affiner.

### Phase 0 — Immédiat (cette semaine)

| # | Action | Risques | Coût | Responsable suggéré |
|---|---|---|---|---|
| 0.1 | Rétablir la connectivité AD (diagnostic réseau/DC) ; prévoir au moins deux contrôleurs dans la configuration | R-16 | Infra | Admin réseau/AD |
| 0.2 | Mettre en place un **`pg_dump` quotidien hors serveur** + **sauvegarde séparée de `ENCRYPTION_KEY`** ; réaliser un **test de restauration** | R-15 | 1 j | Admin système |
| 0.3 | Retirer la modification de `role`/`status` aux managers (correctif de code ciblé) ; auditer les rôles actuels en base | R-01 | 0,5 j | Développeur |
| 0.4 | Restreindre les ACL des `.env` et de `C:\backups` ; supprimer ou chiffrer `elite_time_avant_chiffrement.dump` ; retirer les secrets de `frontend/.env` | R-04 | 0,5 j | Admin système |
| 0.5 | Corriger le comptage des échecs de connexion + `ThrottlerGuard` sur `/auth/login` | R-02 | 0,5 j | Développeur |

### Phase 1 — Court terme (1 mois)

| # | Action | Risques | Coût |
|---|---|---|---|
| 1.1 | Démarrage par un service Windows sous un compte de service dédié ; déplacer modèles IA et navigateurs hors du profil personnel | R-14 | 1 j |
| 1.2 | HTTPS sur IIS (PKI interne), `COOKIE_SECURE=true`, redirection 80→443 ; `ldaps://` ; PostgreSQL `listen_addresses=localhost` (ou TLS) et connexion par `localhost` | R-03, R-08 | 2 j |
| 1.3 | Lier Next.js à `127.0.0.1` ; supprimer les règles pare-feu 3000/4000 ; restreindre `pg_hba.conf` | R-08 | 0,5 j |
| 1.4 | Ne plus réactiver les comptes à la connexion ; propager le statut AD dans la synchro | R-05, R-28 | 1 j |
| 1.5 | Restreindre les destinataires e-mail aux domaines internes, réservé aux admins, journalisé | R-06 | 0,5 j |
| 1.6 | Service d'autorisation centralisé et cloisonnement réel (équipe/département, `null` interdit) sur toutes les routes à `userId`/`employeeId` | R-07 | 3 j |
| 1.7 | Mise à jour des dépendances critiques (`next`, `express`/`proxy-addr`, `socket.io`) en recette puis prod | R-09 | 1 j |
| 1.8 | Route `/api/health` + sonde + alertes ; `pm2-logrotate` | R-19, R-20 | 1 j |
| 1.9 | Aligner les fuseaux (choisir **un** fuseau métier ; `TZ` explicite pour Node ; utiliser `SystemSettings.timezone` partout) | R-17 | 1–2 j |

### Phase 2 — Moyen terme (trimestre)

| # | Action | Risques | Coût |
|---|---|---|---|
| 2.1 | DTO de validation sur toutes les routes | R-12 | 2–3 j |
| 2.2 | Sessions : hash du token, révocation globale, inactivité, purge planifiée | R-11 | 1 j |
| 2.3 | Chiffrement : erreur explicite sur échec, format versionné (`v1:`), AAD, script de rotation de clé, clé dans un coffre (DPAPI/Key Vault) | R-10 | 3 j |
| 2.4 | Environnement de recette + pipeline CD réel (build hors prod, artefacts, migrations, health check bloquant, retour arrière) | R-22 | 3–5 j |
| 2.5 | Migration baseline réelle ; README ; procédure d'exploitation | R-15, R-22 | 1,5 j |
| 2.6 | Unifier les calculs de durée (pauses réelles), corriger la clôture auto, transaction/verrou au pointage, jours fériés | R-24, R-25, R-26 | 3 j |
| 2.7 | Rétention et minimisation des journaux ; `ActivityLog` indexé | R-13, R-30 | 1 j |
| 2.8 | Tests automatisés des gardes, du login, du chiffrement, des calculs ; exécution en CI | Transverse | 4–5 j |

### Phase 3 — Long terme

- Séparer la base sur un serveur dédié ou au minimum un disque dédié ; envisager un worker séparé pour PDF/e-mails/IA.
- Remplacer les champs texte `department`/`position` par des clés étrangères (avec index aveugle si le chiffrement doit être conservé).
- Implémenter le circuit de correction de pointage et les soldes de congés si le besoin métier est confirmé.
- MFA pour les comptes locaux, ou suppression des comptes locaux au profit de l'AD.

---

## 3. Les dix améliorations prioritaires

1. **Sauvegardes quotidiennes externalisées de la base + sauvegarde séparée de la clé de chiffrement + test de restauration** (R-15).
2. **Corriger l'escalade de privilèges** (modification du rôle réservée à l'admin) et auditer les rôles existants (R-01).
3. **Rétablir et fiabiliser l'accès AD** (contrôleurs redondants, LDAPS) (R-16, R-03).
4. **Démarrage automatique via un service Windows** sous un compte de service, hors profil personnel (R-14).
5. **Protéger les secrets** : ACL, suppression du dump en clair, retrait des secrets du frontend, coffre de secrets (R-04).
6. **HTTPS de bout en bout** (IIS, cookie `Secure`, PostgreSQL en local/TLS) et fermeture des ports 3000/5432 au LAN (R-03, R-08).
7. **Réparer la protection anti-force brute** et ajouter un throttling global (R-02).
8. **Centraliser les contrôles d'accès** et appliquer le cloisonnement équipe/département partout ; restreindre les destinataires e-mail (R-07, R-06).
9. **Supervision minimale** : route de santé, sonde, alertes, rotation des journaux (R-19, R-20).
10. **Mettre à jour les dépendances critiques** puis instaurer recette + CD avec retour arrière (R-09, R-22).
