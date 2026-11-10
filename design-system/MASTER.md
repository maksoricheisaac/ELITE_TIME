# ELITE TIME — Design System (MASTER)

> Référence visuelle unique de l'application. Les fichiers `design-system/pages/*.md` ne
> documentent que les **écarts** par rapport à ce document ; en cas de conflit, la page gagne.
> Les tokens décrits ici sont implémentés dans `apps/web/app/globals.css` (source de vérité du code).

## 0. Méthode et traçabilité

Ce système a été produit avec la skill **UI/UX Pro Max** (v2.15.0), requête
`enterprise HR workforce attendance time tracking dashboard corporate professional`,
réglages `variance 4 · motion 3 · density 8`. Sortie brute conservée dans
`design-system/_generated/ui-ux-pro-max-output/`.

| Recommandation de la skill | Décision |
|---|---|
| Style *Accessible & Ethical* (contraste, focus visible, cibles 44 px, reduced-motion) | **Adopté** comme socle d'accessibilité |
| Navy `#0F172A` + bleu `#0369A1`, fond `#F8FAFC` | **Adapté** : la palette est dérivée du logo ELITE TIME (`#205890` / `#3098D0`, mesurés sur `logo.png`) ; le navy sert d'encre et au mode sombre |
| Typographie Lexend / Source Sans 3 (Google Fonts) | **Remplacé** par *Inter* variable (appariement « Minimal Swiss » de la même base) **auto-hébergé** (`@fontsource-variable/inter`) : pas d'appel à un CDN externe (confidentialité, hors-ligne, CSP) |
| Pattern « Trust & Authority + Conversion » (hero, CTA commercial) | **Rejeté** : pattern de page marketing, hors sujet pour un outil RH interne |
| Cartes avec `translateY` au survol, modales avec `backdrop-filter: blur` | **Rejeté** : effets décoratifs ; ni élévation au survol, ni flou de verre |
| Densité 8/10, tableaux en cartes sur mobile, `Bulk actions`, pas de nav qui recouvre le contenu | **Adopté** |

## 1. Principes

1. **Swiss / data-first** : grille stricte, hiérarchie par la taille et le poids, très peu d'ornements. Le chiffre est le héros.
2. **Une seule couleur de marque** (bleu logo). Les couleurs sémantiques n'expriment que des états (présent, retard, erreur…), jamais de la décoration.
3. **Aucune donnée simulée** : une jauge, une tendance ou un pourcentage n'apparaît que s'il est calculé depuis des données réelles.
4. **Densité maîtrisée** : 8/10 sur desktop, mais lignes de tableau ≥ 40 px et cibles tactiles ≥ 44 px sur mobile.
5. **Mobile = vraie adaptation** (liste/cartes, filtres en feuille basse), pas une réduction homothétique.
6. **Mouvement utile uniquement** (150–200 ms, `ease-out`), désactivé sous `prefers-reduced-motion`.

## 2. Identité

- Nom : **ELITE TIME** (capitales, graisse 600, `tracking-tight`). Logo : `public/logo/logo.png` (bleu `#205890`/`#3098D0` sur fond transparent) — toujours posé sur surface **claire** (`--surface`), jamais sur fond bleu saturé.
- Sidebar **claire** en thème clair (le logo y est lisible) et sombre en thème sombre (logo posé sur pastille claire).

## 3. Couleurs (tokens)

### 3.1 Marque et neutres — thème clair

| Token | Valeur | Usage | Contraste |
|---|---|---|---|
| `--brand-900` | `#0F2A47` | titres forts, texte sur fond clair | 14,6 : 1 sur blanc |
| `--brand-700` / `--primary` | `#205890` | actions primaires, liens, élément actif | 7,3 : 1 sur blanc (AAA) |
| `--brand-800` | `#1A4776` | survol/pressé du primaire | — |
| `--brand-500` / `--chart-1`… | `#3098D0` | **graphiques et pictos seulement** | 3,2 : 1 → jamais pour du texte |
| `--brand-100` | `#D9E8F5` | fond de sélection, ligne active | — |
| `--brand-50` / `--accent` | `#EEF5FB` | survol de ligne, fond doux | — |
| `--background` | `#F6F8FB` | fond de page | — |
| `--card` / `--surface` | `#FFFFFF` | cartes, tableaux, sidebar | — |
| `--foreground` | `#0F172A` | texte principal | 17,9 : 1 |
| `--muted-foreground` | `#5B6B80` | texte secondaire | 5,4 : 1 (AA) |
| `--border` / `--input` | `#E3E8EF` | séparateurs, champs | — |
| `--ring` | `#205890` | anneau de focus 3 px | — |

### 3.2 Sémantique (texte sur fond blanc ≥ 4,5 : 1)

| Rôle | Texte/icône | Fond doux | Contraste |
|---|---|---|---|
| Succès (présent, approuvé) | `#0E7A4F` | `#E7F5EE` | 5,4 / 4,8 |
| Avertissement (retard, en attente) | `#B45309` | `#FEF3C7` (texte `#92400E`) | 5,0 / 6,4 |
| Danger (absent, refusé, erreur) | `#B42318` | `#FDECEA` | 6,6 / 5,8 |
| Information | `#0B6AA2` | `#E6F2FA` | 5,8 |
| Neutre (clôturé, annulé) | `#5B6B80` | `#EEF1F5` | 5,4 |

Règle : **jamais la couleur seule** — chaque état porte aussi un libellé (et une icône dans les graphiques).

### 3.3 Thème sombre

| Token | Valeur | Contraste |
|---|---|---|
| `--background` | `#0B1626` | — |
| `--card` | `#111E31` | — |
| `--border` | `#22324A` | — |
| `--foreground` | `#E5EAF1` | 15,0 : 1 |
| `--muted-foreground` | `#9FB0C6` | 8,2 : 1 |
| `--primary` | `#6FB6E8` | 8,2 : 1 |
| succès / alerte / danger / info | `#34D399` / `#FBBF24` / `#F87171` / `#7DC4F0` | ≥ 7 : 1 |

### 3.4 Graphiques (palette ordonnée, daltonisme-safe)

`--chart-1 #205890` (série principale) · `--chart-2 #3098D0` · `--chart-3 #B45309` (retards) · `--chart-4 #5B6B80` (absences) · `--chart-5 #0E7A4F`.
Présents = bleu marque, absents = gris neutre, retards = ambre. Le vert/rouge saturé est **banni** des graphiques (pas de feu tricolore).

## 4. Typographie

Police : **Inter Variable** (UI) ; chiffres `font-variant-numeric: tabular-nums` partout où l'on compare des valeurs (heures, compteurs, tableaux). Mono : pile système.

| Rôle | Taille / interligne | Graisse |
|---|---|---|
| Page title (h1) | 24/32 (mobile 20/28) | 600 |
| Section title (h2) | 16/24 | 600 |
| Card title / label | 13/20 | 500 |
| Corps | 14/20 (min 16 px dans les champs sur mobile, anti-zoom iOS) | 400 |
| Légende, méta | 12/16 | 400–500 |
| Chiffre KPI | 28/32 (mobile 24/28) | 600, `tabular-nums` |
| Libellé de colonne | 12/16, MAJUSCULES non, `muted-foreground`, 500 | — |

## 5. Espacement, rayons, élévation

- Échelle 4 px : 4 · 8 · 12 · 16 · 24 · 32 · 48. Gouttière de page 16 px (mobile) / 24 px (desktop). Largeur max du contenu 1440 px.
- Rayons : contrôles 6 px (`--radius: 0.375rem`), cartes 10 px, feuilles/modales 14 px, pastilles/avatars pleins.
- Élévation : **bordure 1 px plutôt qu'ombre**. Ombres réservées aux couches flottantes : `--shadow-popover: 0 8px 24px rgb(15 23 42 / 0.12)`. Pas d'ombre sur les cartes au repos, aucun survol qui « lève » une carte.

## 6. Composants

### Boutons
- Primaire : fond `--primary`, texte blanc, hauteur 36 px (44 px tactile), `font-weight 500`. Survol `--brand-800`. Focus : anneau 3 px `--ring` + 2 px de décalage.
- Secondaire : fond `--card`, bordure `--border`. Tertiaire/« ghost » : texte seul. Destructif : texte danger + confirmation modale.
- Un seul bouton primaire par zone. États : repos, survol, focus, actif, désactivé (opacité 50 % + `aria-disabled`), chargement (spinner + libellé conservé).

### Navigation (sidebar + header)
- Sidebar 256 px, réductible à 64 px (icônes + infobulle). Fond `--card`, bordure droite 1 px. Item actif : fond `--brand-50`, texte `--primary`, barre d'accent 2 px à gauche ; `aria-current="page"`.
- **Mobile (< 1024 px)** : tiroir **opaque** (`--card`, voile `rgb(15 23 42 / 0.5)`), fermeture au choix d'une page, au toucher du voile, à `Échap`. Zones ≥ 44 px.
- Header 56 px : déclencheur de menu, fil d'Ariane (jamais l'unique titre de page), heure, alertes, profil, thème. Sticky, fond `--card`, bordure basse.
- Menus pilotés **uniquement par permissions** côté serveur (le front n'est qu'un reflet).

### Cartes KPI
- Libellé (13 px muted), valeur (28 px, tabular), ligne de contexte (12 px) et, si pertinent, **lien « voir »**. Pas de pictogramme décoratif coloré ni de barre de progression sans donnée réelle. Une pastille d'état (point 8 px + libellé) pour la sémantique.
- Grille : 2 colonnes mobile, 4 desktop.

### Tableaux
- En-tête collant, lignes 44 px (compact 36 px), survol `--brand-50`, séparateurs 1 px, nombres alignés à droite en `tabular-nums`, tri visible (icône + `aria-sort`).
- Barre d'outils : recherche, filtres (feuille basse sur mobile), compteur de résultats, export. Pagination 10/25/50. Actions de ligne dans un menu « ⋯ » (clavier-accessible).
- **< 768 px** : chaque ligne devient une carte (titre = 1ʳᵉ colonne, 3 champs clés, badge d'état, menu d'actions). Jamais de défilement horizontal de la page ; si un tableau large est inévitable, le défilement reste confiné au conteneur.

### Badges de statut
Pastille arrondie, fond doux + texte sémantique (§3.2) + point ou icône. Statuts de pointage : `normal` → Succès « À l'heure » · `late` → Avertissement « Retard » · `incomplete` → Danger « Incomplet » · `admin_closed` → Neutre « Clôturé ». Congés : `pending` Avertissement · `approved` Succès · `rejected` Danger · `cancelled` Neutre.

### Formulaires
Étiquette au-dessus, aide en 12 px, erreur en texte danger **et** icône sous le champ (`aria-describedby`), champs 40 px (44 px mobile), police ≥ 16 px sur mobile. Validation Zod + React Hook Form, messages en français concrets (« Saisissez une heure de départ postérieure à l'arrivée »).

### Modales et feuilles
Modale centrée ≤ 560 px, **plafonnée à 90 dvh avec défilement interne** ; sur mobile, feuille basse pleine largeur avec poignée. Fond de voile plein (pas de flou). Piège de focus, `Échap` ferme, focus rendu au déclencheur.

### États transverses
- **Chargement** : squelettes à l'identique de la mise en page (pas de spinner plein écran).
- **Vide** : phrase explicative + action suggérée (« Aucun pointage sur cette période — élargissez les dates »).
- **Erreur** : message en langage clair + « Réessayer » ; jamais de trace technique.

### Graphiques (Recharts)
Axes sans trait, grille horizontale `--border` en pointillé léger, légende textuelle visible, info-bulle clavier-accessible, tableau de données alternatif (`<details>`) pour les lecteurs d'écran. Barres pour comparer, lignes pour des tendances continues (jamais de lissage `monotone` qui invente des valeurs entre deux points). Hauteur min 200 px, labels d'axe ≥ 11 px.

## 7. Responsive

| Point | Largeur | Comportement |
|---|---|---|
| mobile | 375 / 390 / 430 | sidebar en tiroir, KPI 2 col, tableaux → cartes, filtres en feuille |
| tablette | 768 | sidebar réduite (icônes), KPI 4 col |
| laptop | 1024 / 1280 | sidebar dépliée, grille 12 col |
| desktop | ≥ 1440 | contenu centré max 1440 |

Critères de recette : aucun `scrollWidth > innerWidth`, aucun texte tronqué sans `title`/infobulle, cibles ≥ 44 px, `100dvh` (pas `100vh`), zones sûres iOS (`env(safe-area-inset-*)`).

## 8. Accessibilité (WCAG 2.2 AA)

Contrastes §3 ; focus visible 3 px sur tout élément interactif ; navigation clavier complète (sidebar, tableaux, menus, modales) ; lien d'évitement « Aller au contenu » ; landmarks (`header`, `nav`, `main`) ; `aria-live="polite"` pour les toasts et alertes temps réel ; `prefers-reduced-motion` : toutes les transitions ≤ 1 ms, pas d'animation d'entrée ; texte redimensionnable jusqu'à 200 %.

## 9. Mouvement

Durées 120 ms (survol/focus), 200 ms (ouverture panneau/tiroir), `ease-out`. Pas d'animation d'entrée de page ni de compteurs animés. Squelettes sans pulsation sous reduced-motion.

## 10. Interdits

Dégradés violet/rose, effets de verre/flou, ombres portées sur cartes au repos, cartes identiques en rangées sans hiérarchie, jauges/barres/% non issus de données, vert/rouge saturés pleins en graphiques, texte `--brand-500` sur blanc, icônes emoji, tableaux qui débordent de la page, sidebar mobile transparente.

## 11. Correspondance avec le code

`apps/web/app/globals.css` expose ces tokens en variables CSS (`--primary`, `--card`, `--border`, `--chart-1..5`, `--success|warning|danger|info` + `-soft`) et dans `@theme inline` pour Tailwind (`bg-primary`, `text-success`…). Composants partagés : `PageHeader`, `StatCard`, `StatusBadge` (`apps/web/src/components/ui/`).

## 12. Composants partagés ajoutés (passe finale)

- `RowActions` (`ui/row-actions.tsx`) : **colonne « Actions » de tous les tableaux** = bouton « ⋯ » → menu ; actions destructives séparées et en rouge ; indisponibilité expliquée (« Contient des employés ») ; dialogues et confirmations rendus hors du menu. Utilisé par Employés, Départements, Postes (Congés a son équivalent `LeaveRowActions`).
- `StatCard` / `BreakdownCard` : toutes les cartes de synthèse (aucune pastille d'icône colorée). `Card` : bordure 1 px, **aucune ombre ni élévation au survol**.
- Couleurs : plus de classes Tailwind « en dur » (`emerald-600`, `amber-50`…) ; uniquement `success / warning / danger / info` (+ `-soft`) et `muted`, qui gèrent le thème sombre. Titres de page : `text-xl font-semibold tracking-[-0.022em] sm:text-2xl` partout.
