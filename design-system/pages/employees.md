# Pages — Employés, départements, postes

Hérite de `MASTER.md`.

- **Annuaire** : tableau Employé (avatar initiales + nom + e-mail) · Département · Poste · Rôle · Statut · ⋯. Recherche, filtres département/rôle/statut, tri. Mobile : cartes (avatar, nom, poste, badge de statut).
- **Fiche employé** (panneau ou page) : bandeau d'identité, onglets *Aperçu* (KPI individuels sur la période, présences récentes), *Pointages*, *Congés*, *Compte* (rôle, statut, équipe, permissions). Les actions de rôle/statut respectent les règles serveur (un manager ne modifie pas un rôle ; personne ne modifie son propre rôle).
- **Départements / Postes** : tableaux simples avec effectif par ligne (donnée réelle), création/édition en modale. Suppression avec confirmation et alerte si des employés sont rattachés.
- Les champs chiffrés (identité, e-mail) ne s'affichent que si l'utilisateur dispose de `employees.view_sensitive`.
