# Handover : le métro 3D de la scène 2

Mis à jour le 2 novembre 2026 au soir. À lire en début de conversation, avec `CLAUDE.md` (racine survey) et `metro/ETAT.md`.

## Où on en est

La scène 2 (arrivée du métro, portes, entrée dans la rame) est **en 3D temps réel dans Three.js**, avec le **MP 89** à la place du tram. L'ancien tram reste accessible avec `?tram` (étiquette git `tram-avant-mp89`).

- Branche de travail : `feat/mp89-metro`. Seule `main` publie sur GitHub Pages : fusion en avance rapide, puis push, et suivre avec `gh run`. Version publiée : https://adrien-duchossoy.github.io/purrl-metro-rose/?rame. Adrien l'a testée sur iPhone : 60 i/s à quai, 50 au début.
- Dernier commit publié : `3b96280` (compteur d'images par seconde).
- **Non commité depuis** (à faire valider puis commiter) : panneau de réglages réorganisé, intérieur séparé avec sa propre ombre cuite, couleur intérieure `#e5cdd8` (choisie par Adrien), brume qui ne rentre plus dans le train, lumière cuite des bandeaux du plafond, accès `?debug`.

## Problèmes ouverts, par priorité

1. **Lumière des bandeaux du plafond : trop forte, et Adrien trouve le rendu « vraiment pas joli ».** Elle vient d'une cuisson Blender (`cuire_plafonniers.py`, plus bas) affichée dans `ombreContact` de `rame.js` : `directDiffuse += texture(tPlaf) * uPlaf * diffuseColor`. La force se règle dans « Intérieur de la rame > Lumière des plafonniers » (`params.lumieres.lumierePlafonniers`, 0,3 par défaut ; 0 l'éteint). Mesures au même cadrage, sol / plafond (0 à 255) : sans 98 / 63, à 0,3 139 / 144, à 1 194 / 222. Captures 107 à 109 de `vue-porte`. Défauts connus : les portes et les murs près des portes ne la reçoivent pas (ils ont leur propre atlas, non cuit) ; les pieds des sièges sortent presque blancs (cause non trouvée). Demander à Adrien ce qu'il attend avant de recuire : il veut que les bandeaux éclairent l'intérieur et y portent des ombres, mais sans ce rendu délavé.
2. **Traits noirs sur les sièges : RÉGLÉ le 2 novembre au soir, validé par Adrien.** Vraie cause : 74 % de l'atlas d'ombre intérieur était un fond noir pur ; vues en biais, les faces fines lisent un mipmap où elles se mélangent à ce fond. Correction : `remplir_fond.py` (remplit le fond par push-pull, texels cuits inchangés) sur `mp89_ao_interieur.png` et `mp89_plafonniers.hdr`, après `corriger3.py` (repeint les faces de sièges presque noires ou très contrastées). Originaux dans `scene2/metro/mp89/sauvegardes/`. À refaire après toute recuisson. Le curseur « Intérieur : plancher » (0 par défaut) est devenu inutile. Captures 112 à 114. Ancienne note : (capture d'Adrien : `~/Desktop/Screenshot 2026-11-02 at 16.43.13.png`, entourés en rose). Petits traits en haut des dossiers et au fond des assises, près de la paroi. Prouvé : ils disparaissent quand on met « Ombres cuites dans les creux > Intérieur » à 0. Ce sont des faces très fines tournées vers la fente entre l'assise et le dossier, que l'ombre cuite (`mp89_ao_interieur.png`) met en noir complet. Une fermeture d'image (maximum puis minimum sur 5 px) n'a rien changé et a été annulée. Pistes non essayées : plancher d'ombre pour l'intérieur dans le shader, ou recuisson de l'AO avec ces faces exclues. Les sièges n'ont ni texture ni tissu : ne pas en parler comme s'ils en avaient.
3. **Brume** : Adrien a demandé seulement qu'elle n'entre pas dans le wagon, **sans changer son aspect**. Fait dans `brume3d.js` : un point de nappe situé dans la boîte du train est effacé (fondu sur 30 cm) ; ailleurs, l'image est identique au pixel près (mesuré). Case « Pas dans le train » dans « Brume 3D » pour comparer. Pas encore de capture avec de la brume devant une porte ouverte. Une première version (nappes traitées comme des boules) changeait l'aspect devant le train : refusée et retirée.
4. Version téléphone : AO en 2048 ou 1024, ombres des lustres coupées, test sur iPhone. En 4096, Safari iOS a déjà fermé la page avec le tram.
5. Bandes claires le long des bords de porte (reflet du rebord), décor, mascottes Purrl dans la rame : questions ouvertes.

## Textures de l'intérieur (2 novembre au soir)

Toutes recolorées : on garde grain, brillance, AO et relief, la couleur reste celle de la matière. Images dans `public/scene2/tex/` (`<nom>_motif.jpg` : R nuances, V rugosité, B AO ; `<nom>_relief.jpg` : normal map). Projection selon l'orientation des faces (`texturer` dans `rame.js`), sauf le sol (vu du dessus, `lino`).
- Sol : Poly Haven `linoleum_brown`, bleu `#d0dee4`, rugosité 0,2, reflet calculé des bandeaux du plafond (sol seulement).
- Assises : Poly Haven `velour_velvet`, couleurs d'origine, sheen. Matière à part pour les sièges (le blanc `metro.001` sert aussi au plafond).
- Plastiques (parois, cadres, plafond) : ambientCG `Plastic004`. Plastic003 et Plastic018B essayés puis refusés (« moche »).
- Caoutchouc (soufflet, joints des vitres et des portes) : ambientCG `Rubber004`, motif 75 cm.
- Métal (barres, poignées) : ambientCG `Metal046A` (martelé), rugosité de base 0,55 (moins brillant que la photo), nuances 0,26.
- Soufflet : les plaques roses droites du modèle (`union` / matière `interior`) sont retirées dans `preparerMP89` ; on voit le vrai soufflet en caoutchouc.

## Lumière et ombres de l'intérieur (2 novembre, fin de soirée, validé par Adrien)

- **8 spots avec ombres cachés dans les bandeaux** (`poserBandeaux`, `BANDEAUX_X` dans `rame.js`) : 3 par côté autour de la porte 3, 1 par côté dans la voiture suivante, tournés comme les panneaux, ombres 2048 px. Pas plus de 8 : au-delà, une matière dépasse 16 textures (erreur de shader). Les `RectAreaLight` (essai) n'ont pas d'ombres dans Three.js. Allumés seulement à l'ouverture des portes (retirés de la scène avant). Les vitres les ignorent (`sansSpots`). Coût mesuré (M1 Pro) : 60 i/s à quai, environ 30 dans la rame.
- Éclairage uniforme de l'intérieur (« Clarté de l'intérieur ») à 0,25 : au-dessus, les ombres disparaissent. Ne pas le changer sans Adrien.
- Bakes refaits (`cuire_ao.py`, `cuire_plafonniers.py`, dans `survey/scene2/metro/mp89/`) : plaques du soufflet retirées pendant le bake, **548 + 528 faces des parois retournées** (normales vers l'extérieur : le bake se faisait dans le creux de la paroi, montants noirs), AO intérieure en Non-Color (avant : encodée sRGB, lue trop claire) avec un rayon de 70 cm, bandeaux à 2 rebonds. AO de la carrosserie rebakée sans les plaques, encodage d'origine gardé. Après chaque bake intérieur : `lisser_ao.py`, copie dans `sauvegardes/…_avant_traits`, `corriger3.py`, `remplir_fond.py`.
- AO intérieure en puissance dans le shader (curseur 0 à 4, 1 = baké).
- Fond de la rame : la voiture à cabine (et son soufflet) est dupliquée à l'arrière, tournée de 180° (`rame_arriere`).
- Brume coupée dans la rame (entre 40 et 60 % de l'avancée).
- Panneau de réglages toujours visible.
- Reste ouvert : test iPhone dans la rame (8 spots probablement trop lourds), AO extérieure encore encodée sRGB, cache des fichiers.

## Le modèle MP 89

- CGTrader n° 677325 (materielpneu), Royalty Free, 49,50 $. Annoncé avec textures PBR mais livré sans : Adrien a fait une réclamation.
- Source : `metro model 3D/paris-subway-train-…/Blend/mp89cc.blend`, copié dans `survey/scene2/metro/mp89/` avec `paint.png` et `gauge.jpg`.
- Placement validé : x 2,355 ; y 0,04 ; échelle 1,435 ; porte 3 (z -34,2256) ; rotation 90.

### Scripts (dans `survey/scene2/metro/mp89/`)

- `peindre.py` → `paint_purrl.png` (4096 × 1024) : blanc (244, 241, 238), bandeau rose (242, 197, 205), filet (208, 222, 228), logo PURRL rose (222, 150, 168) depuis `identity/logo/logo-validated.svg`.
- `preparer.py` → `mp89_purrl.blend` et `public/scene2/mp89.glb` (Draco). Retire voie, décor, bogies 1 à 3. Vantaux séparés `mp_door_N_a/_b` (origine à l'axe). Intérieur séparé en objets `…_int` marqués `interieur = 1`. Second jeu d'UV « lumiere » en 3 atlas (caisse, portes, intérieur). Nez vers +x. 134 082 polygones.
- `cuire_ao.py` (`PARTIES=corps,portes,interieur`) → `mp89_ao.png` (4096), `mp89_ao_portes.png` (2048), `mp89_ao_interieur.png` (4096, 128 échantillons). Puis `lisser_ao.py mp89_ao_interieur.png` (médian 5 px) contre les points noirs.
- `cuire_plafonniers.py` → `public/scene2/mp89_plafonniers.hdr` (2048, 512 échantillons, environ 15 min, la machine fait du bruit). Monde noir, seule la matière `luz` émet (force 10), passe Diffuse directe + indirecte sans couleur, sur les 36 objets intérieurs. Les bandeaux sont les objets `light` et `light2`.
- `cuire_lumiere.py` (cuisson de la lumière de la station) : abandonné, sans gain dans Three.js. Son code (`?cuisson`) est retiré ; `mp89_lumiere.hdr` (24 Mo) est rangé dans `scene2/metro/mp89/sauvegardes/`.
- Lancer Blender en arrière-plan : `/Applications/Blender.app/Contents/MacOS/Blender -b mp89_purrl.blend --python script.py`. `mp89_purrl.blend` n'est pas modifié par les cuissons.

## Le code

- `rame.js` : `MP89 = !has('tram')`, `preparerMP89()`. `matiere(m, cuit, partie)` avec partie corps, porte ou interieur. `ombreContact(m, partie)` applique l'AO aussi à la lumière directe, plus la lumière des bandeaux pour l'intérieur. `GROUPES` et `appliquerMatieres` pour les matières extérieures. 2 lustres en vraies lumières avec ombres, aux (8,12 ; 4,94 ; -31,49) et (8,12 ; 4,94 ; -39,51). Valeurs d'Adrien pour le MP 89 dans le `Object.assign(params.lumieres, …)` en haut du fichier.
- `scene2.js` : ombres PCFSoft, passe finale (tone mapping au choix, saturations, halo, grain), compteur de performance.
- `brume3d.js` : nappes de brume en 3D, poussées par le train.
- Panneau : tout fermé par défaut. Vue ; Métro : position et arrivée ; Éclairage du métro ; Matières extérieures ; Intérieur de la rame ; Image finale ; Brume 3D ; « Copier les valeurs ».
- Performance (M1 Pro) : les ombres des lustres ne sont recalculées que si le métro, ses portes ou les lustres changent (`majOmbres` dans `rame.js`, `shadowMap.autoUpdate = false`). À quai : 116 appels de dessin au lieu de 994, image identique (captures 115 à 118). Lumière d'ambiance et lumière principale (« Lumière directe (essais) », à 0) retirées le 2 novembre. Pas encore fait : cache des fichiers (`?v=Date.now()` à remplacer par un numéro de version quand tout sera propre), poids des images pour le téléphone.

## Ce qui a été essayé et n'a pas marché

- **Vidéos IA de l'arrivée** (30 octobre au 1er novembre), détail dans `survey/scene2/PASSATION_VIDEO.md`. Abandonné.
- **Tram rendu dans Blender et posé sur la photo** (1er novembre) : jugé « nul ».
- **Retouches de la carrosserie du tram dans Three.js** (1er novembre) : gain invisible, tout annulé.
- **Cuisson de la lumière de la station sur le MP 89** (2 novembre) : présentée à partir d'un rendu Cycles, sans gain une fois dans Three.js. Leçon : ne jamais présenter un rendu Cycles comme preuve.
- **22 lustres en vraies lumières (ombres VSM)** : 5 i/s, abandonné.
- **Dégradé de lumière peint à la main** présenté comme une ombre : refusé par Adrien.
- **AO avec un seul atlas pour tout le métro** : trop grossière. AO au-dessus de 1 : les raccords se voient.

## Lancer et capturer

- `cd survey/metro && npm run dev`, puis http://localhost:5175/?rame (HTTP ; le téléphone se teste sur la version publiée). Options : `?ouv=1` portes ouvertes, `?rame&debut&jouer` rejoue l'arrivée, `?nofps` masque le compteur, `?tram` l'ancien tram, `?nobrume`.
- `?debug` expose `window.__scene = { camera, controls, setFree, rame, scene }`. Pour entrer dans la rame : cocher « Vue libre (souris) » dans « Vue », puis par exemple `camera.position.set(2.38, 1.55, -35.3)`, `controls.target.set(2.38, 1.1, -40)`, `controls.update()`.
- Capture : `node survey/outils/capture.mjs <url> <sortie.png> [reglages.js]` (Chrome headless à part, GPU Metal, panneau caché). **Ne plus utiliser l'extension Claude in Chrome** (bandeau gênant pour Adrien), sauf demande explicite.
- Pour régler un contrôle depuis la console, toujours viser son dossier : plusieurs contrôles portent le même nom (« Opacité » existe pour les vitres et pour la brume). Un `import('/brume3d.js')` depuis la console peut donner une autre copie du module que celle de la page : passer par le panneau.
- Passer sur `main` fait redémarrer Vite : vérifier http://localhost:5175 après, et faire `touch vite.config.js` si besoin.

## Comment travailler avec Adrien

- Réponses courtes, en français, sans tiret cadratin. Guidage pas à pas, il est débutant en Three.js.
- **Faire exactement ce qu'il demande, rien de plus.** Le 2 novembre, il a demandé que la brume ne rentre pas dans le wagon, et l'aspect de la brume a été changé : il l'a très mal pris.
- **Ne pas inventer** ce qu'on n'a pas vérifié (exemple : « tissu » des sièges, qui n'existe pas). Si on ne trouve pas un défaut qu'il signale, lui demander sa capture tout de suite.
- **Preuve dans Three.js** : capture avant/après au même cadrage, zoomée, mesurée, copiée dans `survey/scene2/vue-porte/` (numérotée, dernier numéro : 109) puis ouverte avec `open`. Dire ce qui est calculé et ce qui est réglé à la main.
- Une demande répétée est une priorité : il a dû demander trois fois que les bandeaux éclairent.
- Ne pas lancer de cuisson Blender pendant qu'il regarde la scène sans le prévenir de la durée et du bruit. Pas d'essais en série. Toujours un retour en arrière (git, case du panneau ou option d'URL).
- Aucun appel fal sans validation et coût annoncé. Ne rien commiter sans son accord. Commits conventionnels en anglais.
- `quai.blend` peut être ouvert dans son Blender avec des modifications non enregistrées : ne jamais l'enregistrer ni l'écraser.

## Skills à charger

`threejs-skill-router` en premier, puis selon le sujet : `threejs-impl-lighting` et `threejs-shadow-systems` (bandeaux), `threejs-errors-performance` (version téléphone), `threejs-visual-validation` (captures à vue fixe), `threejs-image-pipeline` avant de toucher aux passes de `scene2.js`.
