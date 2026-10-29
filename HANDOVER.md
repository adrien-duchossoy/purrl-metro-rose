# Handover : réalisme du tram (scène 2)

À lire en début de nouvelle conversation, avec `CLAUDE.md` (racine survey) et `metro/ETAT.md`.

## Avant toute chose : charger les skills
1. `threejs-skill-router` en premier. Il rappelle la règle clé : **trouver le système manquant avant d'ajouter du post-traitement**.
2. Puis selon le sujet :
   - `superpowers:systematic-debugging` pour les contours de porte (deux corrections sans effet visible : il faut diagnostiquer, pas deviner).
   - `threejs-exposure-color-grading` pour l'aspect brumeux (tone mapping, exposition, sortie couleur).
   - `threejs-screen-space-ambient-occlusion` si on ajoute de l'AO écran (GTAO).
   - `threejs-shadow-systems` ou `threejs-impl-shadows` pour de vraies ombres.
   - `threejs-image-pipeline` avant de toucher à l'ordre des passes dans `scene2.js`.
   - `threejs-visual-validation` pour les captures avant/après à vue fixe.
   - `threejs-errors-performance` pour la perf iPhone.

## Comment travailler avec Adrien
Réponses courtes, en français. Pas d'em dash. Guidage pas à pas. Il est exigeant sur le réalisme. Il a constaté deux fois « aucune différence » alors que je disais avoir corrigé : **toujours prouver par une capture avant/après au même cadrage, zoomée sur la zone**, et la lui montrer (copier l'image dans `survey/scene2/vue-porte/` puis `open`, le scratchpad ne lui est pas accessible).

Règles : aucun appel fal sans validation. Ne rien commiter sans demande. `survey/scene2/quai.blend` est ouvert dans Blender avec des modifications non enregistrées (collection « EnvMap (test) ») : ne pas enregistrer ni écraser sans accord.

## Lancer et capturer
- `cd metro && npm run dev` → https://localhost:5175/?rame (train arrêté, GUI ouverte). `?rame&debut&jouer` rejoue la séquence. iPhone : https://192.168.1.58:5175.
- Capture headless : Chrome `--headless --ignore-certificate-errors --use-angle=metal --virtual-time-budget=20000 --window-size=1280,800 --screenshot=...`. Ajouter `--enable-logging=stderr --v=0` et filtrer `CONSOLE` pour voir les erreurs.

## Où en est le rendu
Fichiers : `metro/rame.js` (modèle, matériaux, env map, GUI), `metro/scene2.js` (rendu dans une cible HalfFloat MSAA 4, puis shader de post : brume plate, tone mapping Neutral sur les pixels métro seulement, brume 3D, glare des phares).

- Modèle : `public/scene2/tram.glb`, exporté de `scene2/metro/tram_rose.blend` (Jotrain, CC-BY 4.0, crédit « Created by Jotrain – www.jotrain.com.au » **pas encore ajouté**).
- Éclairage : uniquement l'env map HDR de la station (`envmap.hdr` + `envmap_base.hdr`, recombinées dans `rame.js`, validées par Adrien). Lumières directes à 0. Pas d'ombres. Pas d'AO écran. Seule l'AO cuite du modèle (canal R des cartes ORM) est utilisée.
- Matériaux : `carteMatieres()` dans `rame.js` recalcule rugosité, métal et vernis à partir des couleurs de la texture de base (le glb d'origine avait rugosité 0 / métal 0,5 partout). `peinture()` crée un MeshPhysicalMaterial avec clearcoat.
- Vitres côté quai : couche additive `refletVitre`. **Adrien voit la différence, ça marche.**

## Problème 1 : contours de porte toujours noirs, sans reflet
Adrien ne voit aucun changement après le passage en « noir laqué » (rugosité 0,25, vernis 1, métal 0). Je pensais voir une teinte bordeaux sur ma capture, lui non. Hypothèses à vérifier dans l'ordre, avec un mode debug :
1. Les joints de porte ne sont peut-être **pas** dans la texture extérieure traitée par `peinture()` : matériau séparé (caoutchouc sans texture, intérieur, autre image). Lister les matériaux par mesh et vérifier lequel couvre le cadre (raycast sur le cadre ou coloration debug par nom de matériau).
2. Le seuil `Math.max(r, v, b) < 60` ne capte peut-être pas les pixels du cadre (gris foncé, ou zone du logo). Afficher la carte calculée en couleur sur le modèle pour voir quelle classe reçoit le cadre.
3. Un noir à albédo quasi nul ne montre un reflet qu'à angle rasant ou face à une source forte. Avec une env map diffuse et sans lumière directe, il peut rester plat. Il faut peut-être un vrai reflet spéculaire net (lustres plus intenses dans l'env map, ou une lumière directe ciblée).
4. Vérifier que l'aoMap (ORM) n'écrase pas tout le spéculaire dans les creux (aoMap n'affecte normalement que l'indirect diffus, mais avec `envMap` elle atténue aussi le spéculaire indirect : c'est précisément notre seul éclairage).

## Problème 2 : tout paraît brumeux
Toujours présent après le passage d'AgX à Neutral. Pistes, sans ajouter d'effet avant d'avoir trouvé la cause :
1. **Manque de contraste d'éclairage** : seule une env map omnidirectionnelle, aucune ombre, aucune occlusion de contact. Le train « flotte » dans une lumière plate. Candidats : GTAO, ombre sous caisse, lumière directe des lustres.
2. **Voiles par-dessus le métro** dans le shader de post : vérifier que la brume 3D (`tPuffs`, `brume3d.js`) et le glare des phares ne recouvrent pas le train en permanence. Test simple : couper la brume 3D, le glare et le slider brume, comparer.
3. **Chaîne couleur** : vérifier qu'il n'y a pas de double conversion sRGB ou de noir relevé (le Neutral soustrait 0,04 en bas, voir `neutral()` dans `scene2.js`). Mesurer la valeur d'un pixel noir du train sur capture : s'il est loin de 0, c'est la cause.
4. Exposition et intensité de l'env map trop hautes, qui écrasent tout vers le clair.

## Autres choses restantes
- Perf iPhone (MeshPhysical + clearcoat + MSAA 4 + brume 3D à vérifier), compression Draco du glb.
- Ouverture du tunnel dans le mur du fond.
- Crédit CC-BY à afficher.
- Mettre à jour `metro/ETAT.md` une fois ces points réglés.
