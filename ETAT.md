# Métro rose : état du projet (28/10/2026)

À lire en début de nouvelle discussion.

## Lancer

```
cd survey/metro
npm run dev
```

- Mac : https://localhost:5175
- iPhone (même wifi) : https://192.168.1.58:5175 (l'adresse peut changer : `ipconfig getifaddr en0`)
- Dépôt privé : https://github.com/adrien-duchossoy/purrl-metro-rose

## Ce qui marche (validé)

1. **Scène 1** : la photo du quai en parallaxe 2.5D (depth map + lustres en calques), pilotée par la souris ou le gyroscope.
2. **Brume** : des nuages roses qui sortent du tunnel et avancent jusqu'à nous, avec des reflets lilas et des paillettes argentées ou dorées à effet étoilé. Elle passe aussi sur le quai à nos pieds.
3. **Bouton « Le métro arrive »** : au survol, la caméra se cale au centre. Au clic, fondu de 1 s vers la 3D, puis rotation de 7 s vers la voie (24 → 14 mm).
4. **Scène 2** : la station en 3D, textures cuites. Le passage depuis la scène 1 ne saute pas (vérifié au pixel près). La brume continue sans coupure pendant et après la rotation.

## Les fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | la page, les deux canvas, le bouton |
| `main.js` | l'enchaînement scène 1 → scène 2 |
| `scene1.js` | la parallaxe (WebGL2 brut) |
| `scene2.js` | la station 3D (Three.js), la rotation, la brume par-dessus |
| `fog.js` | **la brume, partagée par les deux scènes** (un seul code, mêmes nuages) |
| `public/scene2/station.glb` | la station (export Blender) |
| `public/scene2/tex/` | textures cuites de la station |
| `public/scene1_depth.png` | profondeur de la scène 1 telle qu'affichée (lustres compris), pour cacher la brume dans la 3D |

Réglages de la brume, dans `fog.js` : `CYCLE` (vitesse), `smoothstep(0.44, 0.6, …)` (quantité de nuages), `0.004` dans `prob` (quantité de paillettes), `0.7 * star` (force de l'étoile). La densité se règle aussi avec le curseur « Brume ».

Test : `?pause` garde la 3D au départ de la rotation, pour la comparer à la scène 1.

## Recuire les textures de la station

```
cd survey/scene2
python bake_tex.py metro
```

Il part de `survey/scene2/etapes/scene1_rendu.png` (la scène 1 capturée au centre, sans brume). Si on change les lustres ou le cadrage de la scène 1, il faut refaire cette capture, et aussi `public/scene1_depth.png`.

## La rame (en cours)

- **Un seul fichier** : `survey/scene2/metro/rame_rose.blend` (hors dépôt git). Source : `survey/visual research/metro.glb` (modèle Sketchfab d'une station, dont on n'a gardé que la voiture).
- 3 voitures de 23,4 m (copies liées de la même voiture), espacées de 0,6 m. Textures d'origine teintées en rose (75 %).
- Voiture de tête (collection `Voiture1_tete`) : face avant refaite avec un grand pare-brise, phares, feux, girouette lumineuse (vide), pare-chocs. Cabine fermée par une cloison à 3,4 m du nez, avec une vraie porte, un pupitre et un siège.

## Prochaines étapes

1. Exporter la rame en `.glb` et la poser sur notre voie dans la scène 2 (attention : Blender a Z vers le haut, Three.js Y ; une position Blender (x, y, z) devient (x, z, -y)).
2. Régler l'échelle : la voiture est plus grande qu'une rame parisienne (23,4 × 3,8 m contre 15 × 2,4 m). Notre voie fait 6,25 m de large.
3. L'éclairer dans Three.js (la station n'a pas de lumière : tout est cuit dans les textures).
4. L'animation : le métro sort du tunnel et se gare. Le mur du fond de la station est plein, il faudra une ouverture.
5. Plus tard : texte sur la girouette, lustres de la scène 2 (peints à plat), test sur iPhone.

## Règles de travail

- **Aucun appel fal sans validation** : montrer le prompt, attendre le feu vert, 2 essais maximum.
- **Un seul fichier par sujet** : modifier le fichier existant, pas de copies. Demander de fermer le fichier dans Blender avant de l'écraser.
- `quai.blend` est ouvert dans Blender avec des modifications non enregistrées : ne pas l'ouvrir ni l'écraser sans demander. Pour le reste, utiliser Blender en arrière-plan (`Blender -b --python …`).
