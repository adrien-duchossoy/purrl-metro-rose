# Handover : le métro 3D de la scène 2

Mis à jour le 3 novembre 2026. À lire en début de conversation, avec `CLAUDE.md` (racine survey) et `metro/ETAT.md`.

## Où on en est

La scène 2 (arrivée du MP 89, portes, entrée dans la rame) tourne en 3D temps réel dans Three.js. Elle est validée par Adrien et publiée.

- Branche de travail : `feat/mp89-metro`. Seule `main` publie sur GitHub Pages : fusion en avance rapide, push, puis `gh run watch`.
- Version publiée : https://adrien-duchossoy.github.io/purrl-metro-rose/?rame
- Dernier commit publié : `1185588` (geste des portes plus court, pincement pour refermer). `main` et `feat/mp89-metro` sont au même point, rien de non commité.
- Performance : 60 i/s tout le long sur iPhone. Sur le MacBook M1 dans Chrome, c'est plus lent que sur le téléphone, cause non vérifiée (nombre de pixels, Chrome contre Safari).
- À faire confirmer par Adrien sur iPhone : plus de saccade à la première ouverture des portes, nouveau geste.

## La suite

1. **Ranger les dossiers.** Voir la liste plus bas. Ne rien supprimer sans l'accord d'Adrien, et ne jamais toucher à `quai.blend`.
2. **Remplir la rame de modèles 3D qui débordent sur le quai.** Quand les portes s'ouvrent, des objets sortent du métro et se répandent sur le quai. Rien n'est commencé. Questions à poser à Adrien avant de coder : quels modèles (mascottes Purrl, objets de la marque, autre), d'où ils viennent (ses fichiers, bibliothèques gratuites, génération fal après validation et coût annoncé), combien, figés ou animés, et à quel moment ils débordent (à l'ouverture, pendant l'entrée dans la rame).

### Pistes techniques pour le remplissage

- Le budget est serré. Le quai portes ouvertes était le moment le plus lourd. Chaque modèle ajouté compte : viser des modèles légers (Draco, textures 1024 ou moins), et `InstancedMesh` si un même objet se répète.
- Les 8 spots des bandeaux portent des ombres. Un objet qui projette une ombre est redessiné dans chaque carte d'ombre : mettre `castShadow` seulement sur les gros objets. Les ombres ne sont recalculées que quand quelque chose bouge (`majOmbres` dans `rame.js`). Si les objets bougent, il faudra appeler `majOmbres` pendant le mouvement, et ça coûte.
- Le cache d'image de `scene2.js` ne redessine que si la caméra, le train ou les réglages changent (`rame.prendreChangement()`). Un objet animé doit signaler son changement, sinon il restera figé à l'écran.
- La première ouverture des portes est préchauffée (`prechauffer()` dans `scene2.js`). Les nouveaux objets doivent être dans la scène avant cet appel, sinon leurs shaders se compilent à l'ouverture et la saccade revient.
- Repères du train : x 2,355 ; y 0,04 ; échelle 1,435 ; porte 3 à z -34,2256 ; nez vers +x. Un point de vue dans la rame : caméra (2,38 ; 1,55 ; -35,3), cible (2,38 ; 1,1 ; -40).
- Chargement : `rame.js` charge déjà des GLB Draco (`public/draco`). Mettre les nouveaux modèles dans `public/scene2/`.

## Ranger les dossiers : état des lieux

Dans `survey/metro/` (dépôt git) :
- `gold_coast_glink_light_rail_tram_flexity_2.glb` (41 Mo) : ancien modèle du tram, ignoré par git, plus utilisé.
- `dist/` : sortie de `vite build`, ignorée par git.
- Fichiers de `public/` que le code ne cite pas par leur nom (à vérifier avant de retirer, un nom peut être construit dans le code) : `decor_depth_brut.png`, `decor_depth_doux.png`, `decor_depth_fort.png`, `decor_depth_moyen.png`, `glow.png`, `objects.json`, `objects_ids.png`, `scene2/tram_mobile.glb`.
- `tram.glb` sert encore à `?tram` (étiquette git `tram-avant-mp89`). Le garder ou retirer l'option, au choix d'Adrien.
- `ETAT.md` date du 28 octobre (scène 1 et ancienne station) : à fusionner avec ce fichier ou à mettre à jour.

Hors dépôt, dans `survey/` :
- Captures d'écran à la racine de `survey/` et dans `survey/scene2/`.
- `survey/scene2/metro/` : `rame_rose.blend`, `tram_rose.blend`, `tex_tram/` (ancien tram), et les `.blend1` de sauvegarde partout.
- `survey/scene2/metro/mp89/` : `cuire_lumiere.py` (abandonné), `mp89_cuisson.blend`, `sauvegardes/`.
- `survey/tools/` est vide. `survey/proto/parallax` : prototype de la scène 1.
- `survey/scene2/quai.blend` : **ne jamais l'enregistrer ni le déplacer**, Adrien peut l'avoir ouvert avec des modifications.

## Ce qui a été fait le 3 novembre

- **Cache d'image** : la 3D n'est redessinée que si quelque chose change. Scène finale à 60 i/s.
- **Lustres** : passés de lumières ponctuelles (6 passes d'ombre chacune) à des spots (1 passe), même rendu.
- **Spots des bandeaux** : la carrosserie et les vitres n'en calculent que 2 sur 10 (`lustresSeuls` dans `rame.js`).
- **Brume** (`brume3d.js`) : bruit précalculé dans une texture 3D 128³, fragments cachés écartés tôt, paillettes limitées aux cases voisines, nappes en octogones, nappes trop proches de la caméra écartées, plus d'émission une fois les portes ouvertes. Résolution gardée à la moitié de l'écran (le quart est refusé : « horrible »).
- **Préchauffage** : la scène est dessinée une fois au chargement avec les bandeaux allumés, pour compiler les shaders et créer les cartes d'ombre avant l'ouverture.
- **Portes** : l'entrebâillement de 1,55 cm entre les vantaux est refermé (chaque vantail décalé de la moitié).
- **Logo Purrl** : retiré de la peinture de la caisse (`paint_sans_logo.png`) et posé sur le vantail gauche de chaque porte, partie blanche du bas, il suit le vantail. Réglage : « Logo sur les portes > Largeur (part du vantail) », 0,8. Image `logo_purrl.png` à couleur constante et bords lissés en alpha, sans liseré rose.
- **Gestes** (`gestes.js`) : écartement plus court (28 % de la largeur à la souris, 35 % du petit côté au doigt), pincement pour refermer tant qu'on est sur le quai, deux doigts annulent le pas en avant.

### Essayé et retiré le 3 novembre

- Brume au quart de la résolution : laide.
- Ombres recalculées une image sur trois : saccade visible.
- Lustres éteints, puis allumés en fondu avec ombres figées : moins beau, puis plus lent.
- Fusion des géométries : deux fois moins d'appels de dessin, aucun gain d'images par seconde (les morceaux fusionnés ne sont plus écartés par carte d'ombre).

## Le code

- `rame.js` : `MP89 = !has('tram')`, `preparerMP89()`. `matiere(m, cuit, partie)` avec partie corps, porte ou interieur. `ombreContact(m, partie)` applique l'AO aussi à la lumière directe, plus la lumière des bandeaux pour l'intérieur. 2 lustres en spots avec ombres, aux (8,12 ; 4,94 ; -31,49) et (8,12 ; 4,94 ; -39,51). 8 spots dans les bandeaux, allumés à l'ouverture (`poserBandeaux`, `avecBandeaux`). Logo des portes : `marquerLogo`, `logoPortes`. Valeurs d'Adrien dans le `Object.assign(params.lumieres, …)` en haut du fichier.
- `scene2.js` : ombres PCFSoft, cache d'image, `prechauffer()`, passe finale (tone mapping, saturations, halo, grain), compteur de performance, gestes des portes et de l'avancée.
- `brume3d.js` : nappes de brume en 3D, poussées par le train, coupées dans la rame.
- `gestes.js` : écartement et pincement, souris et doigts.
- Panneau lil-gui toujours visible.

## Le modèle MP 89 et les scripts Blender

- CGTrader n° 677325 (materielpneu), 49,50 $. Livré sans les textures PBR annoncées : Adrien a fait une réclamation.
- Source : `mp89cc.blend` dans `survey/scene2/metro/mp89/`.
- Scripts dans `survey/scene2/metro/mp89/` :
  - `peindre.py` : `paint_purrl.png`, `public/scene2/paint_sans_logo.png` et `public/scene2/logo_purrl.png`.
  - `preparer.py` : `mp89_purrl.blend` et `public/scene2/mp89.glb` (Draco).
  - `cuire_ao.py`, `cuire_plafonniers.py` (environ 15 min, la machine fait du bruit : prévenir Adrien). Après chaque bake intérieur : `lisser_ao.py`, copie dans `sauvegardes/`, `corriger3.py`, `remplir_fond.py`.
  - Blender en arrière-plan : `/Applications/Blender.app/Contents/MacOS/Blender -b mp89_purrl.blend --python script.py`.

## Points encore ouverts (non demandés pour l'instant)

- AO de la carrosserie et des portes encore encodée sRGB.
- `?v=Date.now()` sur les fichiers : à remplacer par un numéro de version.
- Textures plus légères pour le téléphone.
- Couleur du soufflet.

## Lancer

- `cd survey/metro && npm run dev`, puis http://localhost:5175/?rame. Options : `?ouv=1` portes ouvertes, `?rame&debut&jouer` rejoue l'arrivée, `?nofps`, `?tram`, `?nobrume`, `?debug` (expose `window.__scene`).
- Passer sur `main` fait redémarrer Vite : vérifier http://localhost:5175 après, `touch vite.config.js` si besoin.
- Capture, seulement si indispensable : `node survey/outils/capture.mjs "<url>&debug" <sortie.png> [reglages.js] [l] [h]`. Pièges : sans `&debug`, le script n'attend pas la scène ; importer `/scene2.js` depuis un script crée une deuxième copie de la scène (Vite ajoute `?t=`), retrouver l'URL exacte avec `performance.getEntriesByType('resource')`.

## Comment travailler avec Adrien

- Réponses courtes, en français, sans tiret cadratin. Il est débutant en Three.js.
- Faire exactement ce qu'il demande, rien de plus. Ne rien affirmer sans l'avoir vérifié. Ne pas lui expliquer qu'un défaut qu'il voit est « normal ».
- **Pas de séries de captures ni de mesures headless** : ça coûte des tokens et du temps. Faire le changement, `node --check`, et le laisser tester dans son navigateur. Une seule vérification si le changement est risqué.
- Dire « bake », jamais « cuire » ou « cuisson ».
- Toujours un retour en arrière possible (git, case du panneau, option d'URL).
- Ne pas changer « Clarté de l'intérieur » (0,25) sans lui.
- Aucun appel fal sans validation et coût annoncé. Ne rien commiter sans son accord. Commits conventionnels en anglais.
- Pas d'extension Claude in Chrome.

## Skills à charger

`threejs-skill-router` en premier. Pour le remplissage : `threejs-syntax-loaders`, `threejs-agents-model-optimizer`, `threejs-errors-performance`. Pour les ombres : `threejs-impl-shadows`.
