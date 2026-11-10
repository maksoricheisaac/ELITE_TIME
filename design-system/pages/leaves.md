# Pages — Congés et absences

Hérite de `MASTER.md`.

- **Employé** : bouton primaire « Nouvelle demande » (feuille/modale : type, dates, motif ; nombre de jours ouvrés affiché). Liste de ses demandes avec badge d'état ; détail (décision, commentaire, dates de traitement) ; **Modifier / Annuler** visibles uniquement quand le statut et les permissions l'autorisent.
- **Manager / Admin** : file « À traiter » en tête (en attente, plus anciennes d'abord) avec **Approuver / Refuser** et champ **commentaire de décision** (obligatoire au refus). Ajout de congé pour un tiers via action dédiée.
- **Vue calendrier** : mois en grille (semaine commençant le lundi), barres de congés par employé (couleur = statut, jamais par personne), jours fériés/week-ends grisés, légende textuelle. Mobile : agenda en liste groupée par jour.
- **Historique** : tableau filtrable (employé, type, statut, période) avec export.
- États : vide (« Aucune demande en attente »), erreur de chevauchement expliquée en clair.
