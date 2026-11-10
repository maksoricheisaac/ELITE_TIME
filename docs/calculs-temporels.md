# Calculs temporels — règles, audit et corrections

> Audit global des calculs de durée, de date et de période d'ELITE TIME.
> Source unique des règles : le package `@elitetime/time` (`packages/time`). Côté serveur, tout passe par
> `WorkTimeService` (`apps/api/src/work-time`). Ce document décrit les règles, les anomalies trouvées,
> les corrections, les décisions métier à confirmer et le plan de migration des données historiques.

## 1. Stratégie de fuseau horaire

| Élément | Règle |
|---|---|
| Fuseau métier | `Africa/Brazzaville` (UTC+1, sans heure d'été). Variable `BUSINESS_TIMEZONE`. |
| Base de données | Instants stockés en UTC (`DateTime`). Les heures `entryTime`/`exitTime`/`startTime`/`endTime` sont des « HH:mm » **dans le fuseau métier** (chiffrées). |
| Jour calendaire | Toujours `dayKeyOf(instant, tz)` → `AAAA-MM-JJ`. **Jamais** `toISOString().slice(0,10)` (jour UTC) ni `getDate()` du serveur. |
| Bornes d'un jour | `dayStart(jour, tz)` = 00:00:00.000 local, `dayEnd(jour, tz)` = 23:59:59.999 local. |
| Processus Node | `TZ` forcé à `BUSINESS_TIMEZONE` au démarrage (API et worker) ; les calculs métier n'en dépendent pas (fuseau toujours explicite). |
| `SystemSettings.timezone` | **Ignoré** pour les calculs (un avertissement est journalisé s'il diffère). Défaut corrigé en `Africa/Brazzaville`. |
| Navigateur | Les écrans comparent à l'heure de Brazzaville, pas à celle du poste (`BUSINESS_TIME_ZONE`). |

## 2. Règles de calcul (moteur `computeDayMetrics`)

* Toutes les durées sont des **minutes entières** ; une heure du jour est un nombre de minutes depuis minuit. Aucune valeur négative, `NaN` ou `null` ne sort du moteur.
* **Temps travaillé = union des sessions valides − pauses comprises dans ces sessions.** Les sessions qui se chevauchent sont fusionnées ; une pause entre deux sessions n'est pas déduite (elle est déjà hors session) ; deux pauses qui se chevauchent comptent une fois ; une pause ouverte est bornée à la fin de la session.
* Session sans sortie : 0 minute, signalée « ouverte » ; sortie ≤ entrée : refusée à la saisie (`validateSessionTimes`) et ignorée par les calculs.
* **Retard** = première entrée de la journée − heure de début, uniquement un **jour ouvré** (lundi–vendredi hors fériés). Pas de tolérance (aucun réglage n'existe).
* **Heures supplémentaires (journalières)** = dernière sortie − heure de fin. **Départ anticipé** = heure de fin − dernière sortie (si > 1 min).
* **Congés** : décomptés en jours **ouvrés** (`leaveBreakdown`), fériés exclus, répartis sans double comptage à cheval sur deux mois/années (`within`), approuvés uniquement.
* **Absence** = jour ouvré **écoulé** sans pointage et sans congé approuvé ; un jour futur n'est jamais une absence ; travaillé / congé / absent sont mutuellement exclusifs (`classifyPeriod`).
* Semaine = calendaire (lundi → dimanche), le dimanche appartient à la semaine du lundi précédent.

## 3. Décisions métier À CONFIRMER (impact avant décision)

| # | Sujet | Situation avant | Choix actuel (code) | Impact |
|---|---|---|---|---|
| 1 | **Déduction des pauses** | Incohérente : `end()` retirait le forfait `breakDuration` (60 min) par session si brut > forfait ; la saisie manager le retirait **toujours** (même sans pause, même à chaque session) ; les rapports PDF/Excel retiraient les pauses *enregistrées*. | `BREAK_DEDUCTION_MODE=recorded` (défaut) : seules les pauses enregistrées sont déduites. `recorded_or_flat` : ancien forfait, **une fois par jour**, seulement si aucune pause enregistrée. | En `recorded`, un employé qui ne pointe pas ses pauses gagne ~60 min/jour de temps travaillé par rapport à l'affichage historique. **À valider avec la direction/RH.** Le script d'audit chiffre l'écart (`LEGACY_FLAT_BREAK`). |
| 2 | **Définition des heures sup.** | Deux définitions coexistent : journalière après l'heure de fin (rapports PDF/Excel) et hebdomadaire > 40 h (`getWeekStats`, écrans manager `overtimeThreshold`). | Les deux sont conservées telles quelles (`overtime` = > 40 h, `overtimeMinutes` = journalier) — non unifiées faute de règle tranchée. | Chiffres différents selon l'écran. À trancher. |
| 3 | **`overtimeThreshold`** | Unité incohérente : défaut serveur 480 (minutes ?), écrans web `?? 40` (heures/semaine). | Inchangé. | Si 480 est lu comme des heures, l'heure sup. est toujours 0. Vérifier la valeur réelle en base. |
| 4 | **Tolérance de retard** | Aucun réglage. | Aucune tolérance. | — |
| 5 | **Jours fériés** | `SystemSettings.holidays` existe (défaut `[]`) mais n'était lu nulle part. | Désormais pris en compte (retard, absence, congés). | Sans effet tant que la liste est vide. |
| 6 | **Congés en jours** | Affichés en jours calendaires. | Affichés en jours ouvrés. | Un congé ven→mar affichait 5 j, affiche 3 j. |
| 7 | **Samedi** | Compté dans les rapports, jamais « en retard », heures sup. possibles. | Inchangé (dimanche exclu des rapports). | — |
| 8 | **Travail de nuit** | Non supporté (sortie < entrée = erreur). | Option moteur `allowOvernight` prête mais **non activée**. | Une équipe de nuit ne peut pas pointer à cheval sur minuit. |

## 4. Anomalies trouvées → causes → corrections

| Anomalie | Cause technique | Correction |
|---|---|---|
| Durée différente selon l'écran/le rapport | 4 formules : `end()`, saisie manager, fermeture auto, rapport (somme de `duration` stockée) | `duration` recalculée par le moteur après chaque écriture (sortie, pause, saisie manuelle, suppression) ; les rapports recalculent depuis les heures et pauses, jamais depuis `duration`. |
| Forfait de pause déduit à chaque session / sans pause | `managerUpsert` : `− breakDuration` inconditionnel par session | Supprimé ; règle unique `recorded` (voir §3-1). |
| Pause qui se termine ne met pas la durée à jour | `BreaksService.end` ne touchait pas aux pointages | `recomputeDay` appelé dans la même transaction. |
| Fermeture automatique sans pauses | durée = max − entrée | Passage par `recomputeDay`. |
| Jour décalé près de minuit / hors Brazzaville | `getHours()`, `setHours()`, `toDateString()`, `toTimeString()` dépendant du fuseau du serveur ; rapports planifiés en `Europe/Paris` (défaut) | Fuseau explicite partout, `TZ` forcé, défaut `Africa/Brazzaville`, scheduler/worker/e-mails sur `businessTimeZone()`. |
| `new Date('AAAA-MM-JJ')` + `setHours` | Parse UTC puis bornes locales | Bornes calculées par clé de jour (`dayStart/dayEnd`). |
| Heures saisies incohérentes acceptées | Aucune validation (`17:00 → 08:00` donnait 0, `25:99` possible) | `validateSessionTimes` → HTTP 400 ; date et numéro de session validés. |
| Retard calculé le week-end (statut) / sur 2e session | Contrôles locaux dupliqués | `lateMinutesFor` + 1re session uniquement + jours ouvrés/fériés. |
| Course : double clic = 2 sessions / 2 pauses ouvertes | Lecture puis écriture sans verrou | `pg_advisory_xact_lock` par employé (`withUserLock`) autour de start/end/pause/saisie manuelle. |
| Semaine glissante 7 j + `floor(heures) − 40` | `getWeekStats` | Semaine calendaire via le moteur (`minutes` exact ; `hours`/`overtime` conservés pour compatibilité). |
| Assistant IA : fenêtres « 7/30 derniers jours », sessions comptées comme des jours | `get_my_hours` | Semaine/mois **en cours**, jours distincts, mêmes règles que les dashboards. |
| Rapports : absences comptées sur des jours futurs, week-ends comptés, `toDateString()` navigateur | Boucles dupliquées dans `reports.tsx`, `reports/[employeeId]`, `mon-rapport` | `summarizePeriod` (moteur) — exclusif, sans futur, fériés pris en compte. |
| Taux de présence > 100 % | jours pointés (week-end inclus) / jours ouvrés | Jours ouvrés pointés / jours ouvrés écoulés, plafonné à 100 %. |
| Pauses du rapport détaillé fausses | Page détail appelait `/breaks/today` pour toute une période | Nouvelle route `GET /breaks?from&to` (mêmes droits). |
| Absents le week-end (graphe manager) | Aucun test jour ouvré | Corrigé. |
| Temps « live » du dashboard employé faux hors UTC+1 | Heure du navigateur | Heure de Brazzaville. |

## 5. Fichiers modifiés / créés

* **Nouveau** `packages/time/` (units, zone, calendar, work + 83 tests), `apps/api/src/work-time/` (service, module, enforce-timezone), `apps/web/src/lib/period-stats.ts`, `apps/api/scripts/audit-durees.js`.
* **API** : `pointages/pointages.service.ts`, `breaks/breaks.{service,controller}.ts`, `lib/reports/report-{calculator,service}.ts`, `reports/reports.service.ts`, `dashboard/dashboard.service.ts`, `ai/tools/get-{my-hours,late-employees}.tool.ts`, `email/scheduled-email.service.ts`, `email-scheduling`, `scheduler`, `settings`, `main.ts`, `app.module.ts`.
* **Worker** : `worker.module.ts`, `scheduled-tasks.service.ts`, `main.ts`.
* **Web** : `mon-rapport` (page + client), `reports` (liste + détail), `leaves`, `manager/pointages`, `employee/dashboard`.
* **Infra** : `TZ`/`BUSINESS_TIMEZONE`/`BREAK_DEDUCTION_MODE` dans `.env.example`, compose, Dockerfiles (+ `packages/time`).

## 6. Tests

| Suite | Contenu |
|---|---|
| `packages/time` (83) | conversions UTC↔Brazzaville, minuit, bissextile, mois/années, jours ouvrés/fériés, congés multi-jours et à cheval, classement présence/absence, journée normale, retards 5/15/30, multi-sessions, pauses (incluses, entre sessions, chevauchées, ouvertes), session incomplète, passage de minuit, heures sup., valeurs nulles/invalides. |
| `apps/api/src/lib/reports/report-service.spec.ts` (20) | rapports = moteur, indépendance vis-à-vis du `TZ` du processus, Excel (xlsx non vide), HTML/PDF (durées affichées), cohérence totaux. |
| `apps/api/src/pointages/pointages.service.spec.ts` (10) | validation de saisie, durée nette avec pauses, plusieurs sessions, retard 1re session, recalcul idempotent, chiffrement. |

Exécution : `pnpm --filter @elitetime/time test`, `cd apps/api && npx jest`.
Les 4 échecs restants dans `apps/api` (`tool-args-validator`, `tool-orchestrator`) **existaient avant ces travaux** (vérifié par `git stash`) et ne concernent pas les calculs de temps.

## 7. Données historiques — risques et migration

Rien n'a été modifié en base. Procédure recommandée :

1. Sur une **copie** de la production : `node scripts/audit-durees.js --csv ecarts.csv` (session PostgreSQL en lecture seule). Catégories : `LEGACY_FLAT_BREAK`, `MULTI_SESSION_FLAT`, `STALE_DURATION`, `STATUS_MISMATCH`, `NEGATIVE_OR_INVALID`, `OPEN_WITH_DURATION`.
2. Trancher la décision §3-1 avec la direction/RH (sur le jeu de démonstration, 48 de 54 sessions sont concernées : l'historique est stocké « moins 60 min »).
3. Si la règle `recorded` est validée : script de recalcul ciblé (`recomputeDay` par jour-employé), après sauvegarde, sans toucher aux heures d'entrée/sortie ; exécuter d'abord en simulation. Les statuts `late/normal` incohérents se corrigent de la même façon.
4. Jusqu'à décision, `BREAK_DEDUCTION_MODE=recorded_or_flat` reproduit au plus près l'ancienne règle pour les nouvelles écritures.

Risques : totaux hebdo/mensuels qui varient après recalcul ; rapports déjà envoyés par e-mail non rectifiés ; le changement de `TZ` du processus déplace l'heure d'exécution des tâches planifiées si le serveur n'était pas déjà à l'heure de Brazzaville.

## 8. Anomalies restantes (hors périmètre ou non tranchées)

* Décisions §3 (pauses, heures sup., unité de `overtimeThreshold`, tolérance, travail de nuit).
* Les sélecteurs de période de l'interface (`setHours` du navigateur) utilisent encore l'heure locale du poste ; correct tant que les utilisateurs sont en UTC+1, à migrer vers des clés de jour sinon.
* Les outils IA `get_absent_today` / `get_department_statistics` s'appuient sur `setHours` du processus (aligné sur le fuseau métier grâce à `TZ` forcé) et sur le statut stocké.
* Aucun test d'intégration sur PostgreSQL réel pour la concurrence (le verrou est validé en lecture de code et sur l'API de démonstration).
