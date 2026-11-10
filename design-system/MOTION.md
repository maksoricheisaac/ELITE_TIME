# ELITE TIME — Motion, matériaux et gestes (passe « Apple Design »)

Complète `MASTER.md` (§9). Référence : skill `apple-design` (WWDC *Designing Fluid Interfaces*), traduite pour une application RH de bureau et mobile. Toute la définition du mouvement est centralisée dans `apps/web/app/motion.css` et `apps/web/src/hooks/use-drag-dismiss.ts` ; ne pas dupliquer ces règles dans les composants.

## Règles

| Principe | Application dans ELITE TIME |
|---|---|
| Réponse immédiate | `Button` : compression `scale(0.97)` dès `:active` (75 ms), retour 150 ms. Aucune élévation au survol. |
| Interruptibilité | Les gestes (feuille basse, tiroir) reprennent depuis la position **affichée** ; une nouvelle prise stoppe l'animation en cours. |
| Ressorts | Uniquement là où l'utilisateur touche : `useDragDismiss` utilise un ressort **critique** (`bounce: 0`, 0,35 s) avec la vitesse du doigt. Aucun rebond : l'élan vient d'un geste de fermeture, pas d'un jet. |
| Projection d'élan | Au relâchement : position finale projetée `(v/1000)·d/(1−d)`, `d = 0,998` ; fermeture si projetée > 50 % de la taille ou vitesse > 700 px/s ; une inversion nette annule. |
| Rubber-banding | Résistance progressive quand on tire dans le sens opposé à la fermeture. |
| Cohérence spatiale | Une feuille sort par le bord d'où elle est entrée ; dialogue mobile = feuille basse (entrée/sortie par le bas). Menus et popovers partent de leur déclencheur (`transform-origin` Radix). |
| Durées | Menus/popups ≈ 150 ms · dialogue 220 ms (fermeture 140 ms) · feuille 300/320 ms (fermeture 220/240 ms) · page 180 ms. Pas de transition > 350 ms en navigation. |
| Propriétés | `opacity`, `translate`, `scale`, `transform` uniquement ; jamais `width/height/top/left` animés. |

## Matériaux (profondeur)

- `.material-chrome` : **en-tête uniquement** (translucide + flou 14 px) ; la bordure basse n'apparaît que lorsque du contenu défile dessous (« scroll edge »). Sidebar, tableaux, formulaires, notifications : surfaces **pleines**.
- Voile des dialogues/feuilles : `--scrim` + flou 1,5 px (arrière-plan atténué, pas masqué).

## Préférences système (toutes testées)

- `prefers-reduced-motion` : plus de déplacement ni d'échelle ; fondus seuls (150 ms) ; `MotionConfig reducedMotion="user"` pour la bibliothèque Motion ; ressort du geste ramené à ~0 ms.
- `prefers-reduced-transparency` : voile plus opaque, plus de flou, en-tête plein.
- `prefers-contrast: more` : surfaces pleines, bordure d'en-tête contrastée, voile quasi opaque.

## Gestes (utilité réelle seulement)

- **Dialogues sur mobile** : poignée (zone tactile 28 px) → glisser vers le bas pour fermer. Les boutons « Annuler/Fermer » restent présents (découvrabilité).
- **Menu latéral mobile** : balayage vers le bord pour fermer (toucher/stylet uniquement ; le défilement vertical reste au navigateur).
- Aucun autre geste n'a été ajouté.

## Notifications

Sonner, thème unique dans `ui/sonner.tsx` : fond doux sémantique + texte contrasté + **icône propre à chaque nature** ; durées dans `notification-context.tsx` (confirmation 3,5 s · information 4,5 s · avertissement 6 s · erreur 7 s · « en cours » persistante).
