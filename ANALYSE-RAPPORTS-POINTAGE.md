# Analyse complète du système de génération des rapports de pointage — EliteTime

> Généré le 2026-05-22 — basé sur le code source réel du projet

---

## Table des matières

1. [Architecture globale](#1-architecture-globale)
2. [Inventaire des fichiers impliqués](#2-inventaire-des-fichiers-impliqués)
3. [Analyse détaillée du script `envoyer-rapport-email.js`](#3-analyse-détaillée-du-script-envoyer-rapport-emailjs)
4. [Pipeline de données : de la base vers les rapports](#4-pipeline-de-données--de-la-base-vers-les-rapports)
5. [Flux du module de pointage manuel (frontend)](#5-flux-du-module-de-pointage-manuel-frontend)
6. [Comparaison : pointage manuel vs rapports](#6-comparaison--pointage-manuel-vs-rapports)
7. [Bugs identifiés — causes précises](#7-bugs-identifiés--causes-précises)
8. [Corrections proposées](#8-corrections-proposées)

---

## 1. Architecture globale

Le système EliteTime est organisé en monorepo avec deux applications :

```
c:\APPS\ELITE_TIME\
├── backend/              ← NestJS (API REST + WebSocket + Scheduler)
│   ├── src/
│   │   ├── pointages/    ← Gestion des pointages (CRUD)
│   │   ├── reports/      ← Endpoints API pour générer PDF/Excel
│   │   ├── email/        ← Service d'envoi d'emails planifiés
│   │   ├── email-scheduling/  ← Configuration des jobs planifiés
│   │   ├── scheduler/    ← Cron jobs (auto-clôture, rappels, envoi emails)
│   │   └── lib/
│   │       ├── reports/  ← Moteur de génération des rapports
│   │       ├── crypto.ts ← Chiffrement AES-256-GCM
│   │       └── email.ts  ← Envoi via Microsoft Graph API
│   └── scripts/          ← Scripts autonomes Node.js
│       └── envoyer-rapport-email.js  ← Script d'envoi manuel des rapports
└── frontend/             ← Next.js (App Router)
    └── src/
        ├── features/manager/  ← Interfaces manager
        └── actions/manager/   ← Server actions Next.js
```

### Deux voies de génération de rapports coexistent

| Voie | Déclencheur | Générateur Excel | Groupement semaines |
|------|------------|-----------------|-------------------|
| **Script standalone** | `node scripts/envoyer-rapport-email.js` | Fonction locale `generateExcel()` | `getMondayKey()` — vraies semaines Lun-Sam |
| **API NestJS** | Endpoint `/reports/excel` ou job planifié | `generateNewExcelReport()` dans `new-excel-generator.ts` | `Math.ceil(date.getDate()/7)` — blocs de 7 jours |

Ces deux voies ont des **algorithmes différents**, ce qui explique les incohérences entre rapports.

---

## 2. Inventaire des fichiers impliqués

### 2.1 Scripts autonomes

#### `backend/scripts/envoyer-rapport-email.js`
Script Node.js **standalone** (pas de NestJS). Se connecte directement à PostgreSQL via `pg`. Génère et envoie les rapports Excel pour Mars, Avril et les 3 premières semaines de Mai 2026.

Rôle : point d'entrée principal pour l'envoi manuel des rapports par email.

#### `backend/scripts/pointages-incomplets.js`
Audit des pointages incomplets (entrée sans sortie). Filtre par date/employé/statut.

#### `backend/scripts/corriger-statuts-incomplets.js`
Corrige les statuts marqués "incomplete" qui ont en réalité une entrée ET une sortie. Recalcule `normal` ou `late` selon que l'entrée est avant ou après 08h45.

---

### 2.2 Moteur de rapports (NestJS) — `backend/src/lib/reports/`

#### `report-calculator.ts`
**Calculateur de métriques** pour un employé sur une journée.

```typescript
ReportCalculator.compute(entryTime, exitTime, breakMinutes, pointage?, date?)
// → { workMinutes, breakMinutes, lateMinutes, overtimeMinutes, earlyExitMinutes }
```

Seuils :
- `LATE_THRESHOLD = "08:45"` — retard si arrivée > 08h45 (jours de semaine uniquement)
- `OVERTIME_THRESHOLD = "17:30"` — heures supp si départ > 17h30

Formule : `workMinutes = max(0, exit - entry - breakMinutes)`

#### `report-service.ts`
**Regroupement par jour.** Fonction centrale `groupPointagesByDay(users, pointages, breaks, tz?)`.

Retourne un tableau `GroupedDayData[]` : pour chaque jour ayant des données, liste tous les employés avec leur statut, horaires, et métriques calculées.

Particularité critique : inclut **tous les employés** pour chaque jour (présents ET absents).

#### `new-excel-generator.ts`
**Générateur Excel NestJS** (utilisé par l'API). Crée un classeur ExcelJS avec un onglet par semaine.

Problème : utilise `Math.ceil(date.getDate()/7)` pour déterminer la semaine.

#### `excel-generators.ts`
Générateurs Excel **legacy** (ancienne version). Contient `generateMonthlyExcel()`, `generateDailyExcel()`, `generateDailyCsv()`. Moins utilisé mais toujours présent.

#### `new-pointages-report-template.ts`
**Template HTML** pour le rapport PDF. Génère une page A4 paysage par jour avec un tableau des employés, badges colorés par statut, et couleurs pour retards/sorties anticipées/heures supplémentaires.

#### `html-to-pdf.ts`
Convertit le HTML en PDF via **Playwright/Chromium**. Format A4 paysage, marges 12mm.

---

### 2.3 Service de rapports (NestJS) — `backend/src/reports/`

#### `reports.service.ts`
Orchestre la génération PDF/Excel via l'API :
1. `fetchData()` — charge les employés/pointages/pauses depuis Prisma
2. `groupPointagesByDay()` — groupe les données
3. `generateNewExcelReport()` ou `renderNewPointagesReportHtml()` + `renderPdfFromHtml()`

Endpoints exposés :
- `GET /reports/pdf?from=X&to=Y` → PDF
- `GET /reports/excel?from=X&to=Y` → Excel
- `GET /reports/team?days=90` → données JSON pour le dashboard

---

### 2.4 Service de pointages — `backend/src/pointages/`

#### `pointages.service.ts`
Gestion CRUD des pointages :
- `start()` — crée un pointage d'entrée (timestamp courant, détection retard)
- `end()` — crée un pointage de sortie (calcul durée, détection sortie anticipée)
- `getManagerByDate()` — récupère les pointages d'une date pour le manager
- `managerUpsert()` — crée ou met à jour un pointage manuellement (manager)
- `deleteExtraSessions()` — supprime les sessions > 1

---

### 2.5 Envoi d'emails planifiés — `backend/src/email/`

#### `scheduled-email.service.ts`
Exécute les jobs d'email planifiés. Construit la période (quotidien/hebdo/mensuel), charge les données, génère PDF et/ou Excel, envoie via Graph API.

Particularité critique : appelle `groupPointagesByDay(users, pointages, breaks, tz)` **avec un fuseau horaire**, déclenchant un chemin de code différent (et bugué) pour le calcul des horaires.

---

### 2.6 Scheduler — `backend/src/scheduler/`

#### `scheduler.service.ts`
Jobs automatiques :
- **17h25** : envoi rappels WebSocket de sortie aux employés actifs
- **Toutes les 60s** : auto-clôture des sessions ouvertes après `maxSessionEndTime` (20h00)
- **Toutes les 30s** : vérification si un job email planifié correspond à l'heure courante
- **Toutes les 60min** : synchronisation LDAP (si activée)

---

### 2.7 Frontend — `frontend/src/`

#### `features/manager/manual-pointage-form.tsx`
Formulaire de saisie manuelle des pointages. Interface tableau Excel-like avec navigation clavier (flèches, Tab, Entrée). Charge les pointages existants pour la date sélectionnée via l'API, permet de modifier/créer des sessions 1 et 2.

#### `actions/manager/pointages.ts`
Server Actions Next.js :
- `managerGetManualPointagesByDateWithSessions()` → `GET /pointages/manager/by-date`
- `submitManualPointage()` → `POST /pointages/manager`
- `deleteExtraPointageSessions()` → `DELETE /pointages/manager/extra-sessions`

---

## 3. Analyse détaillée du script `envoyer-rapport-email.js`

### 3.1 Mode d'exécution

```
node scripts/envoyer-rapport-email.js              ← DRY RUN (simulation, aucun email)
node scripts/envoyer-rapport-email.js --envoyer    ← ENVOI RÉEL
```

Le flag `DRY_RUN = !process.argv.includes('--envoyer')` détermine si l'envoi réel a lieu.

### 3.2 Connexion à la base de données

Le script charge le fichier `backend/.env` manuellement (regex sur chaque ligne). Il instancie ensuite un client PostgreSQL `pg` directement :

```javascript
const db = new PgClient({ connectionString: process.env.DATABASE_URL });
await db.connect();
```

Pas de Prisma, pas de NestJS. Requêtes SQL brutes.

### 3.3 Chiffrement — `decrypt()` et `decryptUser()` / `decryptPointage()`

Les champs sensibles sont chiffrés en AES-256-GCM dans la base. Le script les déchiffre localement :

```
Buffer base64 → [IV (12 bytes)][AuthTag (16 bytes)][Ciphertext]
```

Clé lue depuis `process.env.ENCRYPTION_KEY` (hex 64 chars = 256 bits).

Champs déchiffrés pour les **utilisateurs** : `email`, `username`, `firstname`, `lastname`, `department`, `position`.

Champs déchiffrés pour les **pointages** : `entryTime`, `exitTime`, `lateReason`, `earlyExitReason`.

Note : le script gère la casse mixte (`p.entryTime ?? p.entrytime`) pour compatibilité avec les colonnes retournées par `pg` en minuscule ou camelCase.

### 3.4 Récupération des données — requêtes SQL

#### Employés actifs
```sql
SELECT id, email, username, firstname, lastname, department, position, role, status
FROM "User"
WHERE status = 'active'
  AND "hiddenFromLists" = false
  AND "includeInReports" = true
  AND role = 'employee'
ORDER BY lastname, firstname
```

Filtres : actif + visible + inclus dans les rapports + rôle employé.

#### Pointages par période
```sql
SELECT id, "userId", date, "entryTime", "exitTime", duration, status,
       "isActive", "sessionNumber", source, "pointedBy",
       "lateReason", "earlyExitReason"
FROM "Pointage"
WHERE "userId" IN ($1, $2, ...)
  AND date >= $N
  AND date <= $M
ORDER BY date ASC, "userId" ASC, "sessionNumber" ASC
```

#### Pauses par période
```sql
SELECT id, "userId", date, "startTime", "endTime", duration
FROM "Break"
WHERE "userId" IN ($1, $2, ...)
  AND date >= $N
  AND date <= $M
ORDER BY date ASC
```

### 3.5 Gestion des fuseaux horaires — `toLocalDateStr()` et `localDateFromStr()`

Point **critique**. Les timestamps PostgreSQL sont retournés en UTC par le driver `pg`. Mais les dates représentent des jours locaux (France, UTC+1 ou UTC+2 en été).

Le script utilise systématiquement les **getters locaux JavaScript** pour extraire les dates :

```javascript
function toLocalDateStr(d) {
  const date = d instanceof Date ? d : new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  //           ↑ getFullYear()       ↑ getMonth()                                  ↑ getDate()
  //        Tous ces getters utilisent le fuseau horaire LOCAL du process Node.js
}
```

Et pour créer une date à partir d'une chaîne `"YYYY-MM-DD"` :
```javascript
function localDateFromStr(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d); // new Date(année, mois, jour) = minuit LOCAL
}
```

La différence avec `new Date("YYYY-MM-DD")` qui crée **minuit UTC** est fondamentale (voir section 7).

### 3.6 Calcul des semaines — `getMondayKey()`

```javascript
function getMondayKey(date) {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  const day = d.getDay(); // 0=Dim, 1=Lun, ..., 6=Sam
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); // recule au lundi
  return toLocalDateStr(d);
}
```

Algorithme : pour n'importe quel jour, recule jusqu'au lundi de sa semaine. Regroupe tous les jours par leur clé de lundi. Assigne ensuite des labels séquentiels `Semaine 1`, `Semaine 2`, etc. dans l'ordre chronologique.

Ce calcul correspond aux **vraies semaines calendaires** (Lundi → Dimanche).

### 3.7 Regroupement par jour — `groupByDay()`

```javascript
function groupByDay(users, pointages, breaks) {
  const allDates = new Set();
  pointages.forEach(p => allDates.add(toLocalDateStr(p.date)));
  // ↑ N'inclut PAS les dates des pauses

  const days = [];
  for (const dayStr of Array.from(allDates).sort()) {
    const date = localDateFromStr(dayStr); // minuit LOCAL
    if (date.getDay() === 0) continue; // FILTRE DIMANCHES

    const employees = [];
    for (const u of users) {
      const userPts = pointages.filter(p => p.userId === u.id && toLocalDateStr(p.date) === dayStr)
                               .sort((a, b) => (a.sessionNumber||1) - (b.sessionNumber||1));

      if (userPts.length === 0) continue; // FILTRE EMPLOYÉS SANS POINTAGE

      const first = userPts[0];
      const last  = userPts[userPts.length - 1];
      // ...
      employees.push({ ... });
    }
    if (employees.length > 0) days.push({ date, dateLabel, employees });
  }
  return days;
}
```

Comportements clés :
- **Dimanches exclus** explicitement
- **Seuls les employés avec des pointages** sont inclus (pas d'absents)
- **Dates générées depuis les pointages uniquement** (pas les pauses)

### 3.8 Calcul de l'heure d'entrée et de sortie

```javascript
const entryTime = first.entryTime || '—';  // Premier pointage du jour, heure d'entrée
const exitTime  = last.exitTime  || '—';   // Dernier pointage du jour, heure de sortie
```

Pour un pointage incomplet (aucune sortie, non actif, statut 'incomplete') :
```javascript
const isIncomplete = userPts.every(p => !p.exitTime && !p.isActive && p.status === 'incomplete');
// checkOut affiché : 'Départ non pointé'
// workMinutes = 0 (mais lateMinutes calculé quand même)
```

Le champ `duration` stocké en base est utilisé pour les heures travaillées (cumul des sessions) :
```javascript
computation: {
  workMinutes: isIncomplete ? 0 : totalWorkMin, // totalWorkMin = somme des p.duration
  ...
}
```

### 3.9 Génération Excel — `generateExcel()`

#### Conversion des heures en fraction Excel

**Méthode clé** pour éviter le décalage horaire :
```javascript
function timeStrToFraction(s) {
  const [h, m] = s.split(':').map(Number);
  return (h * 60 + m) / 1440; // fraction de 0 à 1 (1440 min/jour)
}
```

La valeur est une fraction pure (pas un objet `Date`). ExcelJS stocke cette fraction directement sans conversion UTC, ce qui donne l'heure exacte dans Excel quelle que soit la timezone du serveur.

```javascript
const e5 = wr.getCell(5);
e5.value = arrivee;    // fraction ex: 0.354167 pour 08:30
e5.numFmt = 'hh:mm';  // format correct (minutes après heures)
```

#### Formules Excel calculées

| Colonne | Formule | Description |
|---------|---------|-------------|
| G (Heures travaillées) | `IF(OR(E="",F=""),"",(MOD(F,1)-MOD(E,1)))` | Différence départ-arrivée (fractions) |
| H (Durée retard min) | `IF(E="",0,MAX(0,(MOD(E,1)-TIME(8,45,0))*1440))` | Minutes au-delà de 08h45 |
| I (Retard Oui/Non) | `IF(H>0,"Oui","Non")` | Indicateur booléen |
| J (Heures supp) | `IF(F="",0,MAX(0,MOD(F,1)-TIME(17,30,0)))` | Au-delà de 17h30 |

Les colonnes H et I sont forcées à 0/Non pour les weekends.

#### Structure du classeur

- 1 onglet par semaine (`Semaine 1`, `Semaine 2`, etc.)
- Lignes 1-6 : titre fusionné (D2:H5)
- Ligne 7 : en-têtes colonnes (fond bleu #4472C4)
- Lignes 8+ : données (alternance fond gris/blanc)
- Séparateur de 6px entre chaque journée

### 3.10 Envoi via Microsoft Graph API

```javascript
async function getGraphToken()
// POST https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token
// Credentials: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET

async function sendGraphEmail(token, senderEmail, to, subject, htmlBody, attachments)
// POST https://graph.microsoft.com/v1.0/users/{senderEmail}/sendMail
// Pièces jointes : contentBytes en base64
```

Variables d'environnement requises : `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `GRAPH_SENDER_EMAIL`.

---

## 4. Pipeline de données : de la base vers les rapports

### 4.1 Stockage en base (PostgreSQL via Prisma)

```
Table "Pointage"
├── id         : UUID
├── userId     : UUID (FK → User)
├── date       : DateTime  ← ATTENTION : stockage différent selon la source
│                           Employee auto : timestamp courant (new Date())
│                           Manager manuel : minuit UTC du jour saisi (new Date("YYYY-MM-DD"))
├── sessionNumber : Int    (1 pour la première session, 2 pour la deuxième)
├── entryTime  : String    (chiffré AES-256-GCM, format "HH:MM")
├── exitTime   : String?   (chiffré, null si pas encore sorti)
├── duration   : Int       (minutes travaillées, déjà soustrait la pause)
├── status     : Enum      (normal | late | incomplete | admin_closed)
├── isActive   : Boolean   (true si session en cours)
├── lateReason : String?   (chiffré)
└── earlyExitReason : String? (chiffré)
```

Point critique sur le champ `date` :
- **Pointage employé** (`start()`) : `date: now` où `now = new Date()` = timestamp précis du moment de pointage
- **Pointage manager** (`managerUpsert()`) : `date: new Date(dateStr)` où `dateStr = "2026-05-22"` = **minuit UTC**

Cette différence de stockage est à l'origine de certains bugs dans les fonctions qui utilisent `date` pour recalculer les horaires.

### 4.2 Récupération (service NestJS `reports.service.ts`)

```typescript
// fetchData() dans reports.service.ts
const from = new Date(params.from); from.setHours(0,0,0,0);
const to   = new Date(params.to);   to.setHours(23,59,59,999);

const pointages = await prisma.pointage.findMany({
  where: { userId: { in: ids }, date: { gte: from, lte: to } },
  orderBy: { date: 'asc' },
});

// Décryptage
pointages.map(p => decryptPointage(p))
// → entryTime, exitTime, lateReason, earlyExitReason déchiffrés
```

### 4.3 Groupement — `groupPointagesByDay()` dans `report-service.ts`

C'est ici que se produisent les principaux bugs. Analyse étape par étape :

**Étape 1 : Construction de l'ensemble des dates**
```typescript
const allDates = new Set<string>();
pointages.forEach(p => allDates.add(new Date(p.date).toISOString().slice(0, 10)));
breaks.forEach(b => allDates.add(new Date(b.date).toISOString().slice(0, 10)));
//                                ↑ .toISOString() retourne TOUJOURS UTC
//             + les dates des pauses sont aussi ajoutées (source de jours fantômes)
```

**Étape 2 : Pour chaque date, construction des données de la journée**
```typescript
for (const dayStr of sortedDates) {
  const date = new Date(dayStr); // "2026-05-22" → 2026-05-22T00:00:00Z (minuit UTC)
  // ↑ PAS filtré dimanche, PAS new Date(y,m,d) = minuit local

  const employeesInDay = users.map((u) => {
    // ↑ .map() = TOUS les employés, même absents
    const userPointages = pointages.filter(ptr => {
      const pDate = new Date(ptr.date).toISOString().slice(0, 10);
      return ptr.userId === u.id && pDate === dayStr;
    });

    const hasPointage = userPointages.length > 0;
    // ...
    const employeeStatus = isIncomplete ? 'incomplete'
      : isAdminClosed ? 'admin_closed'
      : hasPointage ? 'present'
      : 'absent'; // ← les absents sont inclus

    return { ..., status: employeeStatus };
  });

  if (employeesInDay.length > 0) { // ← toujours true (tous les users sont inclus)
    daysMap.set(dayStr, { date, employees: employeesInDay });
  }
}
```

**Étape 3 : Calcul de `checkIn` et `checkOut`**

Cas 1 — Sans fuseau horaire (chemin normal, appelé depuis `reports.service.ts`) :
```typescript
checkIn  = firstPointage.entryTime || '—';  // ← chaîne déchiffrée correcte
checkOut = lastPointage.exitTime || '—';    // ← chaîne déchiffrée correcte
```

Cas 2 — Avec fuseau horaire `tz` (appelé depuis `scheduled-email.service.ts`) :
```typescript
checkIn = formatTimeInTZ(new Date(firstPointage.date), tz);
// Pour pointage manager : new Date(midnight UTC) → formatTimeInTZ → "01:00" ou "02:00" (FAUX!)
// Pour pointage employé : new Date(timestamp entrée) → formatTimeInTZ → heure d'entrée (correct)

checkOut = formatTimeInTZ(new Date(lastPointage.date).getTime() + duration * 60_000, tz);
// Pour pointage manager : midnight + durée = heure décalée depuis minuit (FAUX!)
```

### 4.4 Génération Excel via NestJS — `generateNewExcelReport()`

**Regroupement par semaine :**
```typescript
function getWeekOfMonth(date: Date): number {
  return Math.ceil(date.getDate() / 7);
  // 1er-7  → Semaine 1
  // 8-14   → Semaine 2
  // 15-21  → Semaine 3
  // 22-28  → Semaine 4
  // 29-31  → Semaine 5
}
// Ce n'est PAS le numéro de semaine calendaire Lun-Dim
```

Par exemple, si mai commence un vendredi :
- Vendredi 1/5 → Semaine 1
- Lundi 4/5 → Semaine 1 (mais c'est la même semaine calendaire que le 2/5 et 3/5)
- Jeudi 8/5 → Semaine 2 (mais calendairement, fait partie de la semaine du lun 5/5)

**Conversion des heures en Excel :**
```typescript
function timeStringToDate(timeStr, baseDate) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const date = new Date(baseDate); // copie de new Date("2026-05-22") = minuit UTC
  date.setHours(hours, minutes, 0, 0); // setHours() utilise le FUSEAU LOCAL
  return date; // objet Date
}

// ExcelJS convertit ensuite ce Date en fraction UTC :
// Sur serveur UTC+2 : setHours(8,30) = 06:30 UTC → fraction = 6.5/24 → Excel affiche 06:30 !
// Sur serveur UTC   : setHours(8,30) = 08:30 UTC → fraction = 8.5/24 → Excel affiche 08:30 ✓
```

---

## 5. Flux du module de pointage manuel (frontend)

### 5.1 Sélection d'une date par le manager

```
ManualPointageForm (frontend)
  → dateValue change (useWatch)
  → managerGetManualPointagesByDateWithSessions(dateStr, userIds)
    → serverGet(`/pointages/manager/by-date?date=${dateStr}&userIds=...`)
      → PointagesService.getManagerByDate(dateStr, userIds)
        → prisma.pointage.findMany({ where: { date: { gte: start, lte: end } } })
        → rows.map(p => decryptPointage(p))
        → retour : [{userId, entryTime, exitTime, lateReason, earlyExitReason, sessionNumber, status, ...}]
```

Les données retournées sont les **chaînes déchiffrées directement issues de la base** : `entryTime = "08:30"`, `exitTime = "17:25"`. Pas de transformation, pas de fuseau horaire.

### 5.2 Affichage dans le formulaire

```typescript
// Pour chaque employé :
form.setValue(`rows.${index}.entryTime`, s1?.entryTime ?? "", { shouldDirty: false });
form.setValue(`rows.${index}.exitTime`, s1?.exitTime ?? "", { shouldDirty: false });
```

Les valeurs sont directement affichées dans des `<Input type="time">`. C'est pourquoi l'affichage est **toujours correct** : aucune conversion de fuseau, aucun calcul intermédiaire.

### 5.3 Sauvegarde d'un pointage manuel

```
submitManualPointage(formData)
  → upsertManualPointage(managerId, userId, date, entryTime, exitTime, ...)
    → serverPost("/pointages/manager", { userId, date, entryTime, exitTime, ... })
      → PointagesService.managerUpsert()
        → duration = (exitH*60+exitM) - (entryH*60+entryM) - breakDuration
        → encryptPointage({ entryTime, exitTime, lateReason, earlyExitReason })
        → prisma.pointage.create({ date: new Date(dateStr), ... })
        //                        ↑ new Date("2026-05-22") = minuit UTC
```

La chaîne de saisie `"08:30"` est chiffrée et stockée dans `entryTime`. Le champ `date` est mis à minuit UTC du jour sélectionné.

---

## 6. Comparaison : pointage manuel vs rapports

### 6.1 Source des données

| Élément | Page pointage manuel | Rapports (API NestJS) | Script standalone |
|---------|---------------------|----------------------|------------------|
| Heure d'entrée | `entryTime` déchiffré direct | `entryTime` déchiffré (sans tz) ou `formatTimeInTZ(date, tz)` (avec tz) | `entryTime` déchiffré direct |
| Heure de sortie | `exitTime` déchiffré direct | `exitTime` déchiffré (sans tz) ou calculé depuis durée (avec tz) | `exitTime` déchiffré direct |
| Filtre dimanches | N/A (saisie par date) | Non filtré | Filtré explicitement |
| Employés absents | N/A (saisie par liste) | Inclus (status='absent') | Exclus |
| Source dates | Retour direct Prisma | `.toISOString().slice(0,10)` | Getters locaux `getDate()` |

### 6.2 Format du nom complet

| Module | Format | Exemple |
|--------|--------|---------|
| Page pointage manuel | `${firstname} ${lastname}` | "Jean DUPONT" |
| API NestJS (`report-service.ts`) | `${firstname} ${lastname}` | "Jean DUPONT" |
| Script standalone | `${LASTNAME.toUpperCase()} ${firstname}` | "DUPONT Jean" |

### 6.3 Regroupement par semaine

| Module | Algorithme | Résultat pour mai 2026 (1er = vendredi) |
|--------|------------|----------------------------------------|
| Script standalone | Recule au lundi de la semaine | S1: lun 27/04–sam 02/05, S2: lun 04/05–sam 09/05, etc. |
| NestJS `generateNewExcelReport` | `Math.ceil(getDate()/7)` | S1: 1–7 mai, S2: 8–14 mai, S3: 15–21 mai |

Les semaines du script correspondent à des vraies semaines de travail (lundi-samedi). Celles du NestJS sont des blocs fixes de 7 jours du calendrier.

---

## 7. Bugs identifiés — causes précises

### Bug #1 — Décalage des horaires dans Excel (NestJS uniquement)

**Fichier** : `backend/src/lib/reports/new-excel-generator.ts`, ligne 29–39 (`timeStringToDate`) et lignes 144–153.

**Cause** :
```typescript
function timeStringToDate(timeStr, baseDate) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const date = new Date(baseDate); // new Date("2026-05-22") = minuit UTC
  date.setHours(hours, minutes, 0, 0); // ← fixe l'heure en temps LOCAL
  return date; // ExcelJS lit ensuite ce Date en UTC
}
```

Sur un serveur en `Europe/Paris` (UTC+2 en été) :
- `setHours(8, 30)` fixe 08h30 heure locale = 06h30 UTC
- ExcelJS calcule la fraction : `(6*60+30)/1440 = 0.270833`
- Excel affiche **06:30** au lieu de **08:30** → décalage de 2h

Le script standalone n'a pas ce bug car il utilise des fractions pures :
```javascript
timeStrToFraction("08:30") = (8*60+30)/1440 = 0.354167 → Excel affiche 08:30 ✓
```

**Symptôme observé** : Horaires décalés de -1h (hiver, UTC+1) ou -2h (été, UTC+2).

---

### Bug #2 — Regroupement par semaine incorrect (NestJS uniquement)

**Fichier** : `backend/src/lib/reports/new-excel-generator.ts`, ligne 25–27 (`getWeekOfMonth`).

**Cause** :
```typescript
function getWeekOfMonth(date: Date): number {
  return Math.ceil(date.getDate() / 7); // blocs de 7 jours depuis le 1er du mois
}
```

Pour mai 2026 qui commence un **vendredi** :
- Vendredi 1/5 et Lundi 4/5 sont dans la même semaine calendaire → mais le script les met dans S1 (1/5) et S1 (4/5 ≤ 7) → OK par coïncidence
- Mais lundi 4/5 et mercredi 6/5 → S1, jeudi 8/5 → S2 (alors que calendairement S2 = 5/5–11/5)

Pour mars 2026 qui commence un **dimanche** :
- Dimanche 1/3 → S1 du script (jamais travaillé)
- Lundi 2/3 → S1 du script (mais c'est la S1 de mars)
- Lundi 9/3 → S2 du script
- En réalité la semaine du lundi 2/3 va jusqu'au samedi 7/3

**Symptôme observé** : Semaines incomplètes (ex. une semaine avec seulement vendredi et lundi), jours mal attribués.

---

### Bug #3 — Employés absents inclus pour chaque journée (NestJS uniquement)

**Fichier** : `backend/src/lib/reports/report-service.ts`, lignes 57–186.

**Cause** :
```typescript
const employeesInDay = users.map((u: any) => { // .map() inclut TOUS les users
  // ...
  const employeeStatus = hasPointage ? 'present' : 'absent'; // status='absent' si pas de pointage
  return { ..., status: employeeStatus };
});

if (employeesInDay.length > 0) { // toujours true
  daysMap.set(dayStr, { ..., employees: employeesInDay });
}
```

Résultat : pour un jour où seuls 5 des 20 employés ont pointé, les 20 employés apparaissent dans le rapport (15 marqués "Absent"). Si des pauses existent pour des jours sans pointages (voir bug #4), ces jours apparaissent avec **tous les employés absents**.

Le script standalone filtre correctement :
```javascript
if (userPts.length === 0) continue; // skip si pas de pointage
```

**Symptôme observé** : Lignes d'employés absents dans le rapport, parfois plus de lignes que prévu.

---

### Bug #4 — Jours fantômes créés par les dates de pauses

**Fichier** : `backend/src/lib/reports/report-service.ts`, lignes 42–44.

**Cause** :
```typescript
breaks.forEach((b: any) =>
  allDates.add(new Date(b.date).toISOString().slice(0, 10)),
);
```

Si des enregistrements de pause (`Break`) existent pour une date où **aucun pointage n'existe** (incohérence de données, bug passé, pause non liée), cette date apparaît dans le rapport avec tous les employés marqués absents.

Le script standalone n'ajoute pas les dates de pauses :
```javascript
pointages.forEach(p => allDates.add(toLocalDateStr(p.date)));
// Aucun ajout de dates depuis breaks
```

**Symptôme observé** : Dates apparaissant dans le rapport alors qu'aucun employé n'a pointé.

---

### Bug #5 — Dimanches non filtrés (NestJS uniquement)

**Fichier** : `backend/src/lib/reports/report-service.ts` — absence de filtre.

**Cause** : Le service ne filtre pas les dimanches. Si des données existent pour un dimanche (quelle qu'en soit la raison), la journée du dimanche apparaît dans le rapport.

Le script exclut explicitement :
```javascript
if (date.getDay() === 0) continue; // Dimanches exclus
```

**Symptôme observé** : Des dimanches peuvent apparaître dans les rapports générés via l'API.

---

### Bug #6 — Calcul des horaires brisé pour les emails planifiés

**Fichier** : `backend/src/email/scheduled-email.service.ts`, ligne 324 + `backend/src/lib/reports/report-service.ts`, lignes 96–110.

**Cause** : `scheduled-email.service.ts` appelle `groupPointagesByDay` avec le paramètre `tz` :
```typescript
const groupedDays = groupPointagesByDay(decryptedUsers, decryptedPointages, decryptedBreaks, tz);
```

Ce qui déclenche dans `groupPointagesByDay` :
```typescript
if (tz && firstPointage.date) {
  checkIn = formatTimeInTZ(new Date(firstPointage.date), tz);
  // Pour pointages manager : firstPointage.date = minuit UTC
  // formatTimeInTZ(minuit UTC, "Europe/Paris") = "01:00" ou "02:00" ← FAUX
}

if (tz && lastPointage.date && lastPointage.duration > 0) {
  const exitMs = new Date(lastPointage.date).getTime() + lastPointage.duration * 60_000;
  checkOut = formatTimeInTZ(new Date(exitMs), tz);
  // Pour pointages manager : minuit + durée = heure incorrecte
  // Ex: durée = 480 min → 00:00 + 480 min = 08:00 ← FAUX (devrait être 17:00)
}
```

**Symptôme observé** : Dans les emails planifiés automatiques, les heures d'entrée affichent "01:00" ou "02:00", les heures de sortie sont complètement fausses pour les pointages saisis manuellement par le manager.

---

### Bug #7 — Format des heures dans `numFmt` (mineur)

**Fichier** : `backend/src/lib/reports/new-excel-generator.ts`, ligne 149.

```typescript
cellE.numFmt = 'HH:MM'; // MM majuscule peut être interprété comme "mois"
```

vs le script :
```javascript
e5.numFmt = 'hh:mm'; // minuscules, standard
```

Dans les format codes Excel, `M` après `H` est interprété comme minutes, mais `HH:MM` n'est pas le format standard. La conformité peut varier selon la version d'Excel ou d'ExcelJS.

---

### Synthèse des bugs par symptôme observé

| Symptôme signalé | Bug(s) responsable(s) | Fichier(s) |
|-----------------|----------------------|-----------|
| Jours incorrects | Bug #2 (regroupement semaine) | `new-excel-generator.ts` |
| Horaires décalés | Bug #1 (timezone setHours) + Bug #6 (tz path) | `new-excel-generator.ts`, `report-service.ts` |
| Jours manquants | Bug #2 (mauvais regroupement) | `new-excel-generator.ts` |
| Semaines incomplètes | Bug #2 (blocs fixes au lieu de vraies semaines) | `new-excel-generator.ts` |
| Dates ajoutées sans pointage | Bug #4 (dates de pauses) + Bug #3 (absents inclus) | `report-service.ts` |
| Employés en trop | Bug #3 (absents inclus) | `report-service.ts` |
| Mauvaises heures dans emails | Bug #6 (chemin tz pour manager pointages) | `report-service.ts`, `scheduled-email.service.ts` |

---

## 8. Corrections proposées

### Correction Bug #1 — Décalage horaire dans `new-excel-generator.ts`

Remplacer `timeStringToDate` par une conversion en fraction, identique au script standalone :

```typescript
// REMPLACER timeStringToDate() par :
function timeStrToExcelFraction(timeStr: string | null | undefined): number | null {
  if (!timeStr || timeStr === '—' || !timeStr.includes(':')) return null;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return (h * 60 + m) / 1440;
}

// Dans la boucle de génération, remplacer :
// cellE.value = arrivee; cellE.numFmt = 'HH:MM';
// Par :
const arriveeFraction = timeStrToExcelFraction(emp.checkIn);
const departFraction  = timeStrToExcelFraction(emp.checkOut);
cellE.value = arriveeFraction; cellE.numFmt = 'hh:mm';
cellF.value = departFraction;  cellF.numFmt = 'hh:mm';
```

---

### Correction Bug #2 — Regroupement par semaine dans `new-excel-generator.ts`

Remplacer `getWeekOfMonth` par la même logique que le script :

```typescript
// REMPLACER getWeekOfMonth() par :
function getMondayKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun ... 6=Sat
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); // recule au lundi
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD" du lundi
}

// Dans generateNewExcelReport(), remplacer le bloc weeksMap :
const weeksMap = new Map<string, { label: string; days: GroupedDayData[] }>();
days.forEach((day) => {
  const key = getMondayKey(day.date);
  if (!weeksMap.has(key)) weeksMap.set(key, { label: '', days: [] });
  weeksMap.get(key)!.days.push(day);
});
const sortedKeys = Array.from(weeksMap.keys()).sort();
sortedKeys.forEach((key, i) => { weeksMap.get(key)!.label = `Semaine ${i + 1}`; });
```

---

### Correction Bug #3 — Exclure les employés absents dans `report-service.ts`

```typescript
// Remplacer .map() par un filtre :
const employeesInDay = users
  .map((u: any) => {
    // ... calcul identique ...
    return { ..., status: employeeStatus };
  })
  .filter((emp) => emp.status !== 'absent'); // N'inclure que les employés présents/incomplets/clôturés

if (employeesInDay.length > 0) {
  daysMap.set(dayStr, { ..., employees: employeesInDay });
}
```

---

### Correction Bug #4 — Ne pas ajouter les dates de pauses dans `report-service.ts`

```typescript
// Supprimer ces 3 lignes :
breaks.forEach((b: any) =>
  allDates.add(new Date(b.date).toISOString().slice(0, 10)),
);
// Les pauses restent accessibles pour le calcul des durées, mais ne créent plus de jours fantômes.
```

---

### Correction Bug #5 — Filtrer les dimanches dans `report-service.ts`

```typescript
for (const dayStr of sortedDates) {
  const date = new Date(dayStr);
  if (date.getDay() === 0) continue; // Filtrer les dimanches
  // ... suite du code
}
```

---

### Correction Bug #6 — Calcul des horaires avec tz dans `report-service.ts`

La détection du chemin `tz` est incorrecte pour les pointages manager. La solution la plus sûre est d'**utiliser toujours `entryTime` et `exitTime` directement**, et de n'utiliser le champ `date` que pour identifier le jour :

```typescript
// Remplacer le bloc checkIn/checkOut par :
if (hasPointage) {
  const firstPointage = userPointages[0];
  const lastPointage = userPointages[userPointages.length - 1];

  // Toujours utiliser les champs entryTime/exitTime stockés (jamais date pour les heures)
  checkIn  = firstPointage.entryTime || '—';
  checkOut = isIncomplete ? 'Départ non pointé' : (lastPointage.exitTime || '—');

  // Si tz est fourni ET que entryTime manque (cas edge), fallback sur date
  if (checkIn === '—' && tz && firstPointage.date) {
    checkIn = formatTimeInTZ(new Date(firstPointage.date), tz);
  }
  // ...
}
```

---

### Correction globale recommandée — Aligner `report-service.ts` sur le script

Le script `envoyer-rapport-email.js` implémente correctement toutes ces logiques. La correction la plus fiable serait de **porter sa fonction `groupByDay()` en TypeScript** dans `report-service.ts`, en remplaçant l'implémentation actuelle de `groupPointagesByDay`. Les différences clés à reprendre :

1. Dates extraites via getters locaux, pas `.toISOString()`
2. Dimanches filtrés
3. Seuls les employés avec pointages inclus
4. Dates générées depuis pointages seulement (pas pauses)
5. Horaires toujours depuis `entryTime`/`exitTime` déchiffrés

---

*Fin de l'analyse — EliteTime v2026-05-22*
