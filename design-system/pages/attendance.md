# Pages — Pointages (liste, détail, saisie manuelle, historique personnel)

Hérite de `MASTER.md`.

- **Barre d'outils unique** : recherche (nom), période, département, statut, source ; filtres avancés dans un panneau (feuille basse sur mobile) ; chips des filtres actifs ; compteur « 128 pointages ».
- **Tableau** : Employé · Date · Entrée · Sortie · Pauses · Durée · Statut · ⋯. Heures et durées en `tabular-nums`, alignées à droite. Sessions multiples d'un même jour : sous-lignes repliables (« 2 sessions »), pas de colonnes supplémentaires.
- **Détail** : panneau latéral (feuille basse mobile) avec chronologie des sessions et pauses, motifs (retard, sortie anticipée), source (employé / manager / admin), historique de correction. Pas de navigation vers une autre page pour une simple consultation.
- **Mobile** : carte = employé + date + plage horaire + durée + badge ; tap ouvre le détail.
- **Saisie manuelle** : formulaire à une colonne, sélecteur d'heure natif, validation « sortie > entrée », aperçu de la durée calculée avant enregistrement.
- **Export** : menu Excel / PDF respectant les filtres courants ; état de chargement explicite.
- **Règles de calcul inchangées** (durée, retard, pause) : l'UI les affiche, ne les modifie pas.
