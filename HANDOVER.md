# Handover : le métro 3D de la scène 2

Mis à jour le 2 novembre 2026. À lire en début de conversation, avec `CLAUDE.md` (racine survey) et `metro/ETAT.md`.

## Où on en est

La scène 2 (arrivée du métro, portes, entrée dans la rame) reste **en 3D temps réel dans Three.js**. Les pistes vidéo IA et rendu Blender des 30 octobre au 1er novembre sont abandonnées (détail plus bas).

Adrien vient d'acheter un nouveau modèle : un **MP 89 CC** (métro parisien sur pneus, lignes 1 et 14). **Prochaine étape : le retravailler et l'intégrer à la scène Three.js à la place du tram.**

Ce qu'Adrien veut garder tel quel : l'éclairage et le rendu actuels de `rame.js` et `scene2.js` (commit `263e90d`). Il les préfère, largement, à tout ce qui a été tenté le 1er novembre. Le seul levier de réalisme restant est la géométrie du modèle.

## Le nouveau modèle

- CGTrader, « Paris Subway Train 3D model », auteur materielpneu, modèle n° 677325, publié le 15/01/2017. Acheté 49,50 $.
- Licence Royalty Free, sans IA. Pas de crédit obligatoire (contrairement au tram Jotrain en CC-BY).
- Formats : STL, OBJ, FBX, **BLEND**. Partir du `.blend`.
- 536 965 polygones, 848 539 sommets, pour deux voitures (dont une avec cabine), l'intérieur complet, la cabine et les voies.
- Textures PBR en puissances de 2. Le créateur indique des UV qui se chevauchent : sans gêne pour les textures, mais à refaire si on veut cuire de la lumière.
- Pièces mobiles modélisées à part (portes à vérifier).
- La forme exacte du métro n'importe pas à Adrien : un MP 89 lui va.
- Le fichier n'est pas encore dans le projet. Lui demander de le déposer dans `survey/scene2/metro/`.

## Plan d'intégration (à valider pas à pas avec Adrien)

1. **Inventaire** dans Blender en arrière-plan (`/Applications/Blender.app/Contents/MacOS/Blender -b fichier.blend --python script.py`) : objets, matériaux, textures et leurs tailles, portes séparées ou non, échelle réelle.
2. **Nettoyage** : retirer les voies (la station a les siennes). Garder l'intérieur, utile pour l'entrée dans la rame, mais le séparer de l'extérieur.
3. **Allègement** : viser environ 100 000 à 150 000 polygones pour l'extérieur vu du quai, et une version téléphone plus légère, comme `tram_mobile.glb` aujourd'hui. Textures en 2048 sur ordinateur, 1024 à 2048 sur téléphone : en 4096, Safari iOS dépassait sa mémoire.
4. **Peinture rose** avec le liseré, sans numéros ni logos (Adrien ne veut aucun texte).
5. **Export glb** (compression Draco ou meshopt) dans `public/scene2/`, à la place de `tram.glb` et `tram_mobile.glb`.
6. **Adapter `rame.js`**. Beaucoup de constantes sont propres au tram et à son atlas de textures, et sont à refaire pour le MP 89 :
   - `PORTES` (milieu de chaque porte côté quai) et `params.train.porte` ;
   - `SOUFFLETS`, `BAS_DE_CAISSE`, `PLAFOND` (zones repérées dans les textures du tram) ;
   - `PHARES` (position des feux avant) ;
   - les noms d'objets et de matériaux testés dans le code : `_door_`, `window`, `glink_exterior`, `glink_interior` ;
   - les sorties de porte `0.0662` et `0.0647` dans `placerPortes`, et l'ouverture `uOuv` du bord de caisse ;
   - `params.train` : x 2,275 ; y -0,47 ; échelle 1,25. Le tram était plus grand qu'une rame parisienne, alors que le MP 89 est à l'échelle réelle : reprendre l'échelle à 1 et recaler sur notre voie, qui fait 6,25 m de large.
7. **Garder l'éclairage actuel** (env map 1024 `envmap.hdr` et `envmap_base.hdr`, sans lumière directe) et le traitement validé : `peinture()` avec vernis, `refletVitre`, `bordCaisse` et `ombreRetrait` si les portes du MP 89 en ont besoin.
8. Vérifier la fluidité sur un vrai iPhone.
9. Retirer le tram et son crédit CC-BY, qui devient sans objet.

## Ce qui a été essayé et n'a pas marché

### Vidéos IA de l'arrivée (30 octobre au 1er novembre)
Détail dans `survey/scene2/PASSATION_VIDEO.md`. Fichiers 72 à 83 dans `survey/scene2/vue-porte/`. Environ 3,30 $ de vidéos et 0,45 $ d'images.
- **Kling 3 Pro** (de `decor-base` à l'image des portes) : rendu flou, presque dessiné, un objet inventé au premier plan pour cacher la transition.
- **Gemini Omni Flash 1.1** (Google, 0,03 $/s, bien moins cher que Kling à 0,14 $/s) : rendu très réaliste jusqu'au virage de la caméra. Le modèle ne sait pas tourner la caméra entre deux images éloignées : il coupe ou fait surgir un second train, à chaque essai, quel que soit le prompt. Avec une image de raccord au milieu, le train ralentit avant le raccord puis repart. Le logo, présent seulement sur l'image de fin, apparaît d'un coup.
- **Gemini en texte seul**, sans image : ambiance correcte, mais il ajoute des panneaux de station et des logos RATP malgré les consignes, et commence à ouvrir les portes sans finir.
- **Nano Banana Pro** pour refaire l'image des portes : il ignore les consignes de déplacement de caméra et, avec plusieurs images en entrée, recopie celle de son choix. Il faut lui donner un guide de cadrage rendu dans Blender (`survey/scene2/guides/clay_CamPorteBord.png`).

### Tram rendu dans Blender et posé sur la photo (1er novembre)
Rendu Cycles dans `quai.blend`, gare en shadow catcher, puis brume, halo et grain ajoutés en post : `survey/scene2/vue-porte/84_test_tram_3d_dans_gare.jpg`. Jugé « nul », bien en dessous de la scène Three.js. Erreur de méthode : être reparti de zéro au lieu de partir des matières déjà réglées dans `rame.js`.

### Matière et lumière de la carrosserie dans Three.js (1er novembre, tout annulé)
Tout a été codé dans `rame.js`, comparé au même cadrage, puis annulé à la demande d'Adrien (`git checkout rame.js`). Images de comparaison : 85 à 88 dans `survey/scene2/vue-porte/`.
- **Env map en 4096 × 2048**, rendue dans Blender depuis le même point (Blender 2,3 ; 35,5 ; 1,6), avec la même lumière moyenne : quasi invisible de face. Les fichiers sont gardés hors du projet, dans le scratchpad de la session du 1er novembre.
- **Reflets calés sur la boîte de la station** (box projection de l'env map) : changement minime.
- **Peinture non métallisée** (métal 0 au lieu de 0,5) : rose plus franc, plus « plastique ».
- **Peau d'orange, ondulation des tôles, salissure, vernis terni** (procédural dans le repère du tram) : à peine visible de face, car un vernis ne reflète que 4 % de la lumière.
- **Lustres en vraies lumières** (6 groupes) et **ombres portées** (2 spots) : la lumière directe a fait réapparaître la coupe à 45° des coins de porte (corrigée en appliquant l'ombre du bord de caisse aux lumières directes). Gain visuel faible, coût en performance. **Adrien préfère largement le rendu d'avant.**
- Leçon : sur ce tram, ni la lumière ni les textures n'étaient le vrai frein. C'est la géométrie (caisse sans arrondis, soufflet peint à plat, détails dessinés), d'où l'achat du MP 89.

## Données utiles

- **Coordonnées** : un point Blender (x, y, z) devient (x, z, -y) dans Three.js.
- **Caméras** de `quai.blend` : toutes au point (7,996 ; 37,744 ; 1,6) dans Blender. `decor-base` correspond exactement à `CamQuai` (24 mm, lacet 168,9°), avec une corrélation de 0,988 au rendu.
- **Station** dans Blender : notre quai de x 4,25 à 11,5, les voies de x -2 à 4,25, voûte jusqu'à z 7, mur du tunnel en y = 0.
- **Env map** actuelle (1024 × 512) : prise du centre de la voie (Blender 2,3 ; 35,5 ; 1,6), la moitié côté tunnel recopiée en miroir au-delà de y = 35,5 (collection « EnvMap (test) » de `quai.blend`).
- **Lustres côté quai**, groupes de 3 boules, en coordonnées Three.js : (5,84 ; 6,15 ; -27,08), (8,12 ; 4,94 ; -31,49), (8,12 ; 4,94 ; -39,51), (5,84 ; 6,15 ; -43,92). Luminance 12, rayon d'environ 0,47 m.

## Lancer et capturer

- `cd survey/metro && npm run dev`, puis https://localhost:5175/?rame (train arrêté, panneau ouvert). `?rame&debut&jouer` rejoue la séquence, `?rame&avancee=0.9` montre le train en fin d'arrivée. iPhone : https://192.168.1.58:5175.
- **La capture Chrome sans interface ne marche plus** : elle reste bloquée sur l'écran d'accueil. Utiliser l'extension Claude in Chrome (skill `claude-in-chrome`), cacher le panneau avec `document.querySelectorAll('.lil-gui.root').forEach(e => e.style.display = 'none')`, puis faire la capture.
- Blender en arrière-plan : forcer le GPU (`compute_device_type = 'METAL'`, puis `refresh_devices()`), sinon Cycles plante sur le CPU avec les textures 4K. Ne jamais nommer un script Python `inspect.py` ou `enum.py` : il masque le module du même nom.

## Comment travailler avec Adrien

- Réponses courtes, en français, sans tiret cadratin. Guidage pas à pas, il est débutant en Three.js.
- Il est exigeant sur le réalisme. **Toujours prouver par une capture avant/après au même cadrage, zoomée sur la zone**, copiée dans `survey/scene2/vue-porte/` (numérotée, dernier numéro : 88) puis ouverte avec `open`. Le scratchpad ne lui est pas accessible.
- Lui montrer plutôt que conclure à sa place. Il refuse les essais en série : vérifier soi-même avant de montrer.
- Toujours prévoir un retour en arrière (git, ou option d'URL) avant de changer le rendu.
- Aucun appel fal sans validation et coût annoncé. Ne rien commiter sans demande.
- `quai.blend` peut être ouvert dans son Blender avec des modifications non enregistrées (collections « EnvMap (test) » et, depuis le 1er novembre, « GuideTrainBord » et la caméra `CamPorteBord`) : ne pas l'enregistrer ni l'écraser sans accord.

## Skills à charger

`threejs-skill-router` en premier, puis selon le sujet : `threejs-errors-performance` (allègement, perf iPhone), `threejs-visual-validation` (captures à vue fixe), `threejs-image-pipeline` avant de toucher aux passes de `scene2.js`.
