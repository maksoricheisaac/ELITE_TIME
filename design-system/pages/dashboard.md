# Page — Tableau de bord

Hérite de `MASTER.md`. Écarts uniquement.

## Admin / Manager
- Rangée 1 — **KPI du jour** (6 cartes, 2 col mobile / 3 tablette / 6 desktop) : Effectif · Présents · Absents · En congé · Retards du jour · Pointages incomplets. Chaque carte renvoie vers la liste filtrée correspondante.
- Rangée 2 — **À traiter** (2 cartes-liste) : demandes de congé en attente (jusqu'à 5, action « Voir ») · demandes de correction en attente. Masquées si l'utilisateur n'a pas la permission.
- Rangée 3 — **Évolution des présences** (barres empilées présents/absents, 2/3 de largeur) + **Retards** (barres, 1/3).
- Rangée 4 — **Répartition par département** (barres horizontales triées) + **Activité récente** (journal, 8 lignes, heure relative).
- Sélecteur de période dans l'en-tête de page (7 j / 30 j / mois / personnalisé), synchronisé avec l'URL.
- Aucune barre de progression décorative : une barre n'existe que si elle représente un ratio réel (ex. présents / effectif).

## Employé
- Bloc **Aujourd'hui** dominant : statut (à l'heure / retard / absent / en congé), heure d'arrivée, heure de départ, temps de travail en cours, bouton principal Arrivée/Départ (≥ 44 px, un seul).
- Semaine : heures, retards, heures supplémentaires. Pauses du jour. Pointages incomplets à régulariser (alerte). Demandes en attente.

## Temps réel
Alertes de retard et rappels via Socket.IO : bandeau `aria-live="polite"` non bloquant.
