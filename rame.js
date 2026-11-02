import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'

// Le métro MP 89 aux couleurs Purrl (survey/scene2/metro/mp89/preparer.py, exporté en
// public/scene2/mp89.glb). ?tram : l'ancien tram, tel qu'il était.
const MP89 = !new URLSearchParams(location.search).has('tram')

// Le métro : le tram rose (survey/scene2/metro/tram_rose.blend, exporté en public/scene2/tram.glb,
// textures 2048 px en WebP). Contrairement à la station, dont la lumière est cuite dans les textures,
// le métro est éclairé en direct : les lumières ci-dessous ne touchent que lui.

// Position d'arrêt réglée à l'œil dans le panneau (28/10). Le tram est modélisé dans l'axe x : tourné de 90°.
// Le métro arrive du tunnel, derrière le mur du fond (z = 0), et avance vers les z négatifs.
export const params = {
  // porte : numéro de la porte placée pile au centre de l'écran en fin de rotation (0 : position libre, z)
  // MP 89 : placement réglé à l'œil dans le panneau (02/11), agrandi de 1,435 par rapport à la taille réelle
  train: MP89
    ? { x: 2.355, y: 0.04, z: -34.226, rotation: 90, echelle: 1.435, porte: 3 }
    : { x: 2.275, y: -0.47, z: -35.825, rotation: 90, echelle: 1.25, porte: 4 },
  arrivee: {
    avancee: 1, // 0 : caché dans le tunnel ; 1 : à la position d'arrêt
    vitesse: 45, // km/h en sortant du tunnel (un métro entre en station vers 40-50 km/h)
    recul: 6, // cm : à l'arrêt, la caisse dépasse un peu puis revient en arrière
    stabilisation: 1.2, // secondes que dure ce petit balancement, après la fin de la rotation de la caméra
    duree: 0, // secondes, calculée à partir des réglages ci-dessus (affichage seul)
  },
  portes: {
    ouverture: Number(new URLSearchParams(location.search).get('ouv')) || 0, // 0 : fermées ; 1 : ouvertes (?ouv=0.5 pour tester)
  },
  lumieres: {
    reflets: 1.2, // force de l'env map : reflets et lumière de la station sur le métro
    station: 1, // part de la station (murs, voûte) dans l'env map
    lustres: 1, // part des lustres dans l'env map
    lustresCouleur: '#ffffff', // teinte appliquée à la lumière des lustres
    ao: 1, // ombres douces dans les creux (ambient occlusion cuite dans le modèle)
    vitres: 2.5, // force des reflets sur les vitres côté quai
    phares: 10, // intensité des feux avant et arrière
    glare: 1, // éblouissement des phares dans l'objectif (halo, traînée, étoile)
    clarte: 1.3, // éclaircit toute la carrosserie (1 : lumière de la station seule)
    plafonniers: 3, // éclat des deux rangées de lampes au plafond de la rame
    interieur: 1.6, // clarté de l'intérieur de la rame, éclairé par ses lampes (1 : lumière de la station seule)
    aoInterieur: 0.5, // ombre cuite de l'intérieur : à pleine force, ses zones fausses font des taches noires
    exposition: 1, // tone mapping Neutral du métro (garde les couleurs) : plus haut, plus lumineux
    tonemapping: 0, // 0 Neutral (garde les couleurs), 1 ACES, 2 AgX, 3 Reinhard : métro seulement
  },
}

// Réglages d'Adrien pour le MP 89 (02/11) : le tram garde ses valeurs validées au-dessus
if (MP89) Object.assign(params.lumieres, {
  reflets: 1.6, station: 0.1, lustres: 0.9, lustresCouleur: '#feeeea', ao: 1, vitres: 6, // ao : au-delà de 1, les raccords de l'ombre cuite se voient
  clarte: 0.7, plafonniers: 4.8, lumierePlafonniers: 0.3, interieur: 0.25, aoInterieur: 1, exposition: 0.9, tonemapping: 3,
})
// Sol de la rame : linoléum Poly Haven « linoleum_brown » (CC0), recoloré. Seuls son motif, sa rugosité et son
// relief sont gardés (public/scene2/tex/lino_motif.jpg et lino_relief.jpg) ; la couleur est réglée ici.
if (MP89) params.sol = {
  couleur: '#d0dee4', // le bleu clair du filet sous les fenêtres (peindre.py)
  motif: 1, // force des nuances du lino (1 : celles de la photo)
  rugosite: 0.2, // rugosité moyenne : lino ciré, satiné (0,65 sur la photo, plus mat)
  rugositeVariation: 1, // variations de brillance du lino (1 : celles de la photo)
  relief: 1, // force du relief
  ao: 1, // ombre des micro-creux du lino (rayures, grain)
  reflet: 1, // reflet des bandeaux du plafond dans le sol (1 : physique)
  taille: 2, // taille d'un motif, en mètres (2 m sur la photo)
}
// Assises des sièges : velours Poly Haven « velour_velvet » (CC0), dans la couleur actuelle des assises (blanc,
// gris pour les places en vis-à-vis). Seuls son grain, sa rugosité, son AO et son relief sont gardés
// (public/scene2/tex/velours_motif.jpg et velours_relief.jpg). Le lustre doux du velours vu de biais : « sheen ».
if (MP89) params.velours = {
  motif: 1, // nuances du velours (1 : celles de la photo)
  rugosite: 0.73, // rugosité moyenne (celle de la photo)
  rugositeVariation: 1,
  relief: 1,
  ao: 1,
  taille: 0.28, // taille d'un motif, en mètres (28 cm sur la photo)
  lustre: 1, // sheen : lustre du velours vu de biais
  lustreRugosite: 0.5, // étalement de ce lustre
}
// Textures ambientCG (CC0) : plastique (Plastic004) sur les parois, cadres des sièges et plafond, caoutchouc
// (Rubber004), métal (Metal046A), chacune dans la couleur de sa matière. Grain, brillance, AO et relief seulement. La rugosité de base reste celle de chaque matière
// (panneau « Matières ») : la texture n'ajoute que ses variations.
if (MP89) params.textures = {
  plastique: { motif: 0.31, rugositeVariation: 1, relief: 1, ao: 1, taille: 0.5 }, // nuances réglées par Adrien (02/11)
  caoutchouc: { motif: 1, rugositeVariation: 1, relief: 1, ao: 1, taille: 0.75 }, // soufflet et joints (validé par Adrien, 02/11)
  // Barres et poignées : brillance réduite par rapport à la photo (rugosité 0,2) : la base reste celle du panneau (0,55)
  metal: { motif: 0.26, rugositeVariation: 1, relief: 1, ao: 1, taille: 0.3 }, // nuances réglées par Adrien (02/11)
}
// Rendu final de l'image (scene2.js) : grain, halo de lumière autour des zones claires (effet dreamy) et
// saturation du métro (Reinhard ternit les couleurs : la saturation les ravive)
params.rendu = {
  grain: 0.01, // force du grain
  halo: 0.15, // force du halo de lumière (0 : aucun)
  seuil: 0.93, // à partir de quelle clarté une zone rayonne
  rayon: 0.5, // étendue du halo
  saturation: 1.84, // couleurs du métro (1 : telles quelles)
  saturationImage: 0.98, // couleurs de toute l'image, station comprise (1 : telles quelles)
}

// Matières extérieures du MP 89, réglables dans le panneau « Matières du métro ». Couleurs en sRGB (celles
// du fichier au départ). reflets : force de l'env map de la station sur cette matière (× Intensité générale).
const GROUPES = {
  peinture: { noms: ['pintura', 'puerta'], label: 'Peinture (caisse, portes)' },
  vitres: { noms: ['verre'], label: 'Vitres' },
  encadrements: { noms: ['metro'], label: 'Fond des encadrements et seuils' },
  joints: { noms: ['rubber', 'rubber.001', 'rubber.002'], label: 'Caoutchouc (cadres des vitres, joint central, soufflet)' },
  metal: { noms: ['metal', 'metalpuerta', 'metal puerta', 'metal.001'], label: 'Métal (poignées, barres intérieures)' },
  plastique: { noms: ['plastic'], label: 'Plastique (bas de caisse)' },
  dessous: { noms: ['metalbogie', 'bogie', 'black', 'black boogie'], label: 'Métal sombre (bogie, porte-bagages)' },
  interieur: { noms: ['interior'], label: 'Intérieur : plastique (parois, sièges)' },
}
if (MP89) params.matieres = {
  reperer: 'aucun', // groupe affiché en cyan, pour voir quelles pièces il couvre
  // Valeurs de matières réelles : laque sous un vernis net, caoutchouc presque noir satiné, inox des poignées
  peinture: { rugosite: 0.08, metal: 0.47, vernis: 1, vernisRugosite: 0.1, reflets: 5 },
  vitres: { opacite: 0.3, rugosite: 0.02, reflets: 1 },
  encadrements: { couleur: '#262626', rugosite: 0.5, metal: 0, reflets: 1 },
  joints: { couleur: '#1a1a1a', rugosite: 0.45, metal: 0, reflets: 1 },
  metal: { couleur: '#969696', rugosite: 0.55, metal: 0.3, reflets: 1 }, // gris mat
  plastique: { couleur: '#2b2b2b', rugosite: 0.55, metal: 0, reflets: 1 },
  dessous: { couleur: '#555555', rugosite: 0.4, metal: 1, reflets: 1 },
  // L'intérieur : le bleu RATP d'origine remplacé par un rose pâle
  interieur: { couleur: '#e5cdd8', rugosite: 0.4, metal: 0, reflets: 1 }, // rose pâle choisi par Adrien (02/11), plastique satiné
}
const matsGroupe = Object.fromEntries(Object.keys(GROUPES).map((g) => [g, new Set()]))
const groupeDe = (nom) => Object.keys(GROUPES).find((g) => GROUPES[g].noms.includes(nom))
function appliquerMatieres() {
  const M = params.matieres
  if (!M) return
  for (const g of Object.keys(GROUPES)) {
    const p = M[g]
    for (const m of matsGroupe[g]) {
      if ('couleur' in p) m.color.set(p.couleur)
      m.roughness = p.rugosite
      if ('metal' in p) m.metalness = p.metal
      if ('vernis' in p) { m.clearcoat = p.vernis; m.clearcoatRoughness = p.vernisRugosite }
      if ('opacite' in p) m.opacity = p.opacite
      // Avec une env map propre à la matière, Three.js utilise son envMapIntensity (et plus l'intensité de la scène)
      m.envMapIntensity = p.reflets * params.lumieres.reflets
      m.emissive?.set(M.reperer === g ? 0x00ffff : 0x000000)
    }
  }
}
// Donne l'env map de la station à chaque matière réglable (sinon leur curseur « Reflets » n'aurait aucun effet)
function envMatieres() {
  const env = envScene?.environment
  if (!env) return
  // La couche de reflet des vitres aussi : sans env map à elle, « Reflets des vitres » n'agissait pas
  if (MP89 && refletVitre.envMap !== env) { const premiere = !refletVitre.envMap; refletVitre.envMap = env; if (premiere) refletVitre.needsUpdate = true }
  for (const set of Object.values(matsGroupe)) for (const m of set) {
    if (m.envMap !== env) { const premiere = !m.envMap; m.envMap = env; if (premiere) m.needsUpdate = true }
  }
}

export const group = new THREE.Group()
let tram = null // la scène du glb : repère du tram, non mis à l'échelle
// Ouvertures de porte côté quai, dans le repère du tram (xmin, xmax, ymin, ymax), pour le bord de la caisse
const NB_OUV = 8
const bordOuv = {
  uOuv: { value: Array.from({ length: NB_OUV }, () => new THREE.Vector4(0, 0, -9, -9)) },
  uVersTram: { value: new THREE.Matrix4() },
  uClarte: { value: params.lumieres.clarte },
}
let lit = [] // matériaux qui portent les feux, pour régler leur intensité
let eclat = 1 // allumage des feux (0 à 1), piloté par la séquence d'arrivée
const aoMats = [] // matériaux qui ont l'ambient occlusion du modèle
const interieurs = [] // matériaux de l'intérieur de la rame
// Avec scene.environment, Three.js ignore envMapIntensity du matériau : la clarté de l'intérieur passe par le shader
const uInterieur = { value: params.lumieres.interieur }
function eclairerInterieur(m) {
  m.onBeforeCompile = (s) => {
    s.uniforms.uInterieur = uInterieur
    s.fragmentShader = 'uniform float uInterieur;\n' + s.fragmentShader.replace('#include <aomap_fragment>', `#include <aomap_fragment>
      reflectedLight.indirectDiffuse *= uInterieur;
      reflectedLight.indirectSpecular *= uInterieur;`)
  }
  m.customProgramCacheKey = () => 'interieur'
}
let demiLongueur = 0 // demi-longueur du tram, avant mise à l'échelle
let boiteLocale = null // boîte du tram dans son propre repère
let cameraZ = null // position de la caméra le long du quai : le centre de l'écran, en fin de rotation, vise ce z

// Milieu de chaque porte côté quai, le long du tram (en m, dans tram_rose.blend), de la cabine avant
// (la petite porte, n° 1) à la cabine arrière
// MP 89 : les six portes côté quai, de la cabine vers l'arrière (axe de chaque porte dans mp89.glb)
const PORTES = MP89
  ? [10.799, 6.634, 2.452, -3.447, -7.606, -11.788]
  : [20.3009, 13.5022, 9.9669, 1.7676, -1.7676, -9.9669, -13.5022, -20.3009]

export function setCameraZ(z) { cameraZ = z; update() }

// ---------- Env map recombinée ----------
let envScene = null, envRenderer = null, envPmrem = null, envRT = null
// Ombres des lustres : calculées du point de vue des lampes, elles ne dépendent pas de la caméra. On ne les
// recalcule que si le métro bouge, si ses portes bougent ou si les lustres changent (8 fois moins de dessins à quai)
const majOmbres = () => { if (envRenderer) envRenderer.shadowMap.needsUpdate = true }
const envMat = new THREE.ShaderMaterial({
  uniforms: { tFull: { value: null }, tBase: { value: null }, uStation: { value: 1 }, uLustres: { value: 1 }, uTeinte: { value: new THREE.Color() } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D tFull, tBase;
    uniform float uStation, uLustres;
    uniform vec3 uTeinte;
    void main() {
      vec3 base = texture2D(tBase, vUv).rgb, full = texture2D(tFull, vUv).rgb;
      gl_FragColor = vec4(base * uStation + max(full - base, 0.0) * uLustres * uTeinte, 1.0);
    }`,
  depthTest: false,
})
const envQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), envMat)
const envCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
let envAttente = null
function majEnv() {
  const u = envMat.uniforms
  if (!envRenderer || !u.tFull.value || !u.tBase.value) return
  clearTimeout(envAttente) // recalcul groupé pendant qu'on bouge un curseur
  envAttente = setTimeout(() => {
    const l = params.lumieres
    u.uStation.value = l.station
    u.uLustres.value = l.lustres
    u.uTeinte.value.set(l.lustresCouleur)
    const img = u.tFull.value.image
    envRT ??= new THREE.WebGLRenderTarget(img.width, img.height, { type: THREE.HalfFloatType })
    const avant = envRenderer.getRenderTarget()
    envRenderer.setRenderTarget(envRT)
    envRenderer.render(envQuad, envCam)
    envRenderer.setRenderTarget(avant)
    envRT.texture.mapping = THREE.EquirectangularReflectionMapping
    envPmrem ??= new THREE.PMREMGenerator(envRenderer)
    const ancien = envScene.environment
    envScene.environment = envPmrem.fromEquirectangular(envRT.texture).texture
    envMatieres()
    ancien?.dispose()
  }, 60)
}

const refletVitre = new THREE.MeshStandardMaterial({
  color: 0x000000, roughness: 0.03, metalness: 0, envMapIntensity: params.lumieres.vitres,
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
})
// Les vitres ignorent les spots cachés dans les bandeaux : sinon chaque source apparaît en point blanc dans le reflet
// (les lustres, des lumières ponctuelles, gardent leur reflet)
function sansSpots(m) {
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <lights_fragment_begin>',
      THREE.ShaderChunk.lights_fragment_begin.replace('#if ( NUM_SPOT_LIGHTS > 0 )', '#if 0'))
  }
  m.customProgramCacheKey = () => 'sansSpots'
}
sansSpots(refletVitre)

// Matières de la carrosserie. Le fichier exporté donne une rugosité de 0 et une métallicité de 0,5 partout
// (sa carte de rugosité est vide) : tout le métro devenait un miroir chromé. On recalcule une carte par zone
// à partir des couleurs de la texture : rouge = vernis, vert = rugosité, bleu = métallicité.
// Soufflets (accordéons) dans la texture, en coordonnées 0 à 1 depuis le haut
const SOUFFLETS = { u: [0.653, 0.687], v: [0.554, 0.711] }
// Canevas carré de N px, avec l'image (ou rien) dessinée dedans
function canevas(N, image) {
  const c = document.createElement('canvas')
  c.width = c.height = N
  const g = c.getContext('2d', { willReadFrequently: true })
  if (image) g.drawImage(image, 0, 0, N, N)
  return { c, g }
}
// Flou d'un masque (tableau de 0 à 1, N×N) : réduit puis agrandi avec lissage, rayon d'environ k px
function flou(masque, N, k) {
  const { c, g } = canevas(N), d = g.createImageData(N, N)
  for (let i = 0; i < N * N; i++) d.data[4 * i] = masque[i] * 255, d.data[4 * i + 3] = 255
  g.putImageData(d, 0, 0)
  const petit = canevas(Math.round(N / k))
  petit.g.imageSmoothingQuality = 'high'
  petit.g.drawImage(c, 0, 0, petit.c.width, petit.c.height)
  g.imageSmoothingQuality = 'high'
  g.drawImage(petit.c, 0, 0, N, N)
  const p = g.getImageData(0, 0, N, N).data, r = new Float32Array(N * N)
  for (let i = 0; i < N * N; i++) r[i] = p[4 * i] / 255
  return r
}
// Bruit doux de 0 à 1 (N×N) : une grille aléatoire de `cases` cases, agrandie avec lissage
function bruitDoux(N, cases) {
  const petit = canevas(cases), d = petit.g.createImageData(cases, cases)
  for (let i = 0; i < cases * cases; i++) d.data[4 * i] = Math.random() * 255, d.data[4 * i + 3] = 255
  petit.g.putImageData(d, 0, 0)
  const { g } = canevas(N)
  g.imageSmoothingQuality = 'high'
  g.drawImage(petit.c, 0, 0, N, N)
  const p = g.getImageData(0, 0, N, N).data, r = new Float32Array(N * N)
  for (let i = 0; i < N * N; i++) r[i] = p[4 * i] / 255
  return r
}
const estNoir = (r, v, b) => Math.max(r, v, b) < 60
function texture(c, srgb) {
  const t = new THREE.CanvasTexture(c)
  t.flipY = false // même sens que les textures glTF
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8 // net de biais, comme les textures d'origine
  return t
}

// Plafonniers : au plafond de la rame, deux rangées de lampes de chaque côté, peintes en blanc dans la texture
// intérieure (zones ci-dessous). On les fait briller : carte d'émission avec seulement ces pixels presque blancs
// (le rose du plafond est plus sombre dans le vert).
const PLAFOND = [ // en coordonnées 0 à 1 depuis le haut : u min, u max, v min, v max
  [0.14, 0.25, 0.0, 0.34], [0.69, 0.99, 0.29, 0.39],
]
function plafonniers(image) {
  const N = 1024, { c, g } = canevas(N, image), d = g.getImageData(0, 0, N, N), p = d.data
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = 4 * (y * N + x), u = x / N, v = y / N
    const lampe = PLAFOND.some(([u0, u1, v0, v1]) => u > u0 && u < u1 && v > v0 && v < v1) &&
      p[i] > 240 && p[i + 1] > 228 && p[i + 2] > 225
    const k = lampe ? 255 : 0
    p[i] = k; p[i + 1] = k * 0.97; p[i + 2] = k * 0.92; p[i + 3] = 255 // blanc à peine chaud
  }
  g.putImageData(d, 0, 0)
  return texture(c, true)
}

// Bas de caisse : dans la texture (rangée à l'envers), c'est la bande grise en haut de chaque rangée de
// panneaux. On la passe dans le prune du nez, en gardant ses détails : les gris neutres seulement.
const PRUNE = [116, 45, 85]
const BAS_DE_CAISSE = [ // en coordonnées 0 à 1 depuis le haut : u max, v min, v max
  [0.62, 0, 0.036], [0.718, 0.193, 0.228], [0.458, 0.389, 0.423],
]
function basDeCaisse(image) {
  const N = image.width, { c, g } = canevas(N, image), d = g.getImageData(0, 0, N, N), p = d.data // pleine résolution
  for (const [u1, v0, v1] of BAS_DE_CAISSE) {
    for (let y = Math.floor(v0 * N); y < v1 * N; y++) for (let x = 0; x < u1 * N; x++) {
      const i = 4 * (y * N + x), r = p[i], v = p[i + 1], b = p[i + 2]
      const l = (r + v + b) / 3
      if (Math.abs(r - v) > 15 || Math.abs(v - b) > 15 || l < 50 || l > 150) continue // pas un gris neutre
      const k = l / 95 // garde les variations du gris d'origine
      p[i] = PRUNE[0] * k; p[i + 1] = PRUNE[1] * k; p[i + 2] = PRUNE[2] * k
    }
  }
  g.putImageData(d, 0, 0)
  return c
}

// Cadres de porte en plastique noir. Dans le fichier, c'est un noir pur (0) sans aucun relief, posé sur
// une plaque plate : il ne renvoyait que la teinte rose de la station, uniforme. On lui redonne une matière
// (noir à ~4 %, marbrures, grain) et des arêtes arrondies (normal map). L'ombre du retrait est dans ombreRetrait().
function cadres(m, image) {
  // Couleur en pleine résolution (4096) ; masques, bruit et relief en 2048 au plus : en 4096, leurs tableaux
  // pèseraient environ 250 Mo au chargement, trop pour un téléphone
  const N = image.width, M = Math.min(N, 2048), k = N / M
  const base = canevas(N, image), d = base.g.getImageData(0, 0, N, N), p = d.data
  const petit = canevas(M, image).g.getImageData(0, 0, M, M).data
  const noir = new Float32Array(M * M)
  for (let i = 0; i < M * M; i++) noir[i] = estNoir(petit[4 * i], petit[4 * i + 1], petit[4 * i + 2]) ? 1 : 0
  const marbre = bruitDoux(M, 48), grain = bruitDoux(M, 700)
  // Couleur : noir plastique un peu chaud, jamais à 0
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x
    if (!estNoir(p[4 * i], p[4 * i + 1], p[4 * i + 2])) continue
    const j = ((y / k) | 0) * M + ((x / k) | 0)
    const n = 34 + 14 * (marbre[j] - 0.5) + 8 * (grain[j] - 0.5)
    p[4 * i] = n + 1; p[4 * i + 1] = n; p[4 * i + 2] = n + 1
  }
  base.g.putImageData(d, 0, 0)
  // Relief : le cadre est une bande bombée, plus haute que la vitre et que la caisse
  const h = flou(noir, M, 3)
  const nm = canevas(M, m.normalMap.image), dn = nm.g.getImageData(0, 0, M, M), q = dn.data
  const FORCE = 3
  for (let y = 1; y < M - 1; y++) for (let x = 1; x < M - 1; x++) {
    const i = y * M + x
    const dx = h[i + 1] - h[i - 1], dy = h[i + M] - h[i - M]
    if (dx === 0 && dy === 0) continue
    let nx = q[4 * i] / 127.5 - 1 - dx * FORCE, ny = q[4 * i + 1] / 127.5 - 1 + dy * FORCE, nz = q[4 * i + 2] / 127.5 - 1
    const l = Math.hypot(nx, ny, nz)
    q[4 * i] = (nx / l + 1) * 127.5; q[4 * i + 1] = (ny / l + 1) * 127.5; q[4 * i + 2] = (nz / l + 1) * 127.5
  }
  nm.g.putImageData(dn, 0, 0)
  return { map: texture(base.c, true), normalMap: texture(nm.c) }
}

function carteMatieres(image) {
  const N = 1024
  const c = document.createElement('canvas')
  c.width = c.height = N
  const g = c.getContext('2d', { willReadFrequently: true })
  g.drawImage(image, 0, 0, N, N)
  const d = g.getImageData(0, 0, N, N), p = d.data
  const bruit = bruitDoux(N, 40)
  for (let i = 0; i < N * N; i++) {
    const r = p[4 * i], v = p[4 * i + 1], b = p[4 * i + 2]
    const x = (i % N) / N, y = Math.floor(i / N) / N
    let vernis, rugo, metal
    if (x > SOUFFLETS.u[0] && x < SOUFFLETS.u[1] && y > SOUFFLETS.v[0] && y < SOUFFLETS.v[1]) {
      vernis = 0; rugo = 0.95; metal = 0 // toile des soufflets : très mate
    } else if (r > 80 && r > v + 30) {
      vernis = 1; rugo = 0.16; metal = 0.5 // peinture rose (caisse et nez) : métallisée et vernie, la station s'y reflète
    } else if (Math.max(r, v, b) < 60) {
      vernis = 0; rugo = 0.5 + 0.3 * (bruit[i] - 0.5); metal = 0 // cadres de porte : plastique satiné, inégal
    } else {
      vernis = 0.3; rugo = 0.55; metal = 0.2 // pièces grises : métal brossé
    }
    p[4 * i] = vernis * 255; p[4 * i + 1] = rugo * 255; p[4 * i + 2] = metal * 255; p[4 * i + 3] = 255
  }
  g.putImageData(d, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.flipY = false // même sens que les textures glTF
  return t
}
function peinture(m) {
  const p = new THREE.MeshPhysicalMaterial({
    name: m.name, map: m.map, normalMap: m.normalMap, normalScale: m.normalScale,
    emissive: m.emissive, emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity,
    transparent: m.transparent, alphaTest: m.alphaTest, depthWrite: m.depthWrite, side: m.side,
    roughness: 1, metalness: 1, clearcoat: 1, clearcoatRoughness: 0.04,
  })
  const image = m.map?.image ? basDeCaisse(m.map.image) : null
  if (image) {
    p.map = texture(image, true)
    const carte = carteMatieres(image)
    p.roughnessMap = p.metalnessMap = p.clearcoatMap = carte
  }
  // Ambient occlusion cuite par l'auteur du modèle : canal rouge de la carte ORM d'origine
  if (m.roughnessMap) { p.aoMap = m.roughnessMap; aoMats.push(p) }
  bordCaisse(p)
  if (m.name === 'glink_exterior01' && m.map?.image && m.normalMap) { // les portes
    const c = cadres(m, image)
    p.map = c.map
    p.normalMap = c.normalMap
  }
  return p
}

// Bord de la caisse autour des portes. Dans le modèle, la tôle s'arrête net au bord de l'ouverture et ses coins
// hauts sont une seule coupe à 45°. En vrai, la tôle s'enroule vers l'intérieur avec un rayon : un lisere clair,
// puis elle fonce jusqu'au joint, et les coins sont arrondis. On le dessine sur la lumière de la station, avec
// un rectangle à coins arrondis par ouverture : à l'intérieur (coins coupés, tranches), presque noir.
const RAYON_COIN = 0.09 // m
const LEVRE = 0.035 // m : largeur du bord enroulé
function bordCaisse(m) {
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, bordOuv)
    s.vertexShader = 'uniform mat4 uVersTram;\nvarying vec3 vTram;\n' + s.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvTram = (uVersTram * modelMatrix * vec4(transformed, 1.0)).xyz;')
    s.fragmentShader = `varying vec3 vTram;
      uniform vec4 uOuv[${NB_OUV}];
      uniform float uClarte;
      float rectArrondi(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      ` + s.fragmentShader.replace('#include <aomap_fragment>', `#include <aomap_fragment>
      // Carrosserie plus claire que ce que donne la station seule
      reflectedLight.indirectDiffuse *= uClarte;
      reflectedLight.indirectSpecular *= uClarte;
      #ifdef USE_CLEARCOAT
        clearcoatSpecularIndirect *= uClarte;
      #endif
      if (vTram.z > 0.5) {
        float d = 1e3;
        for (int i = 0; i < ${NB_OUV}; i++) {
          vec4 o = uOuv[i];
          d = min(d, rectArrondi(vTram.xy - vec2(o.x + o.y, o.z + o.w) * 0.5, vec2(o.y - o.x, o.w - o.z) * 0.5, ${RAYON_COIN.toFixed(3)}));
        }
        float ombre = d < 0.0 ? 0.06 : mix(0.3, 1.0, smoothstep(0.0, ${LEVRE.toFixed(3)}, d));
        float lisere = 1.0 + 1.5 * exp(-pow((d - 0.012) / 0.005, 2.0));
        reflectedLight.indirectDiffuse *= ombre;
        reflectedLight.indirectSpecular *= ombre * lisere;
        #ifdef USE_CLEARCOAT
          clearcoatSpecularIndirect *= ombre * lisere;
        #endif
      }`)
  }
  m.customProgramCacheKey = () => 'bordCaisse'
}

// Ombre du retrait des portes : fermé, chaque battant est 3,3 cm en retrait de la caisse, qui le surplombe.
// Sans ombres portées, rien ne le montrait. On assombrit la lumière de la station sur le pourtour du battant,
// selon la distance à ses bords (plus large en haut, sous le surplomb). Elle s'efface quand le battant sort.
// Le coin haut extérieur du battant est aussi une coupe à 45° : on le découpe en arrondi. Le rayon doit
// rester dans la coupe (au moins 1,7 fois sa taille, 7,5 cm). Le battant a son origine à l'axe de la porte :
// son bord extérieur est le plus loin de 0.
const RAYON_BATTANT = 0.13 // m
function ombreRetrait(o) {
  o.geometry.computeBoundingBox()
  const b = o.geometry.boundingBox, t = b.getSize(new THREE.Vector3()).toArray()
  const ordre = [0, 1, 2].sort((i, j) => t[i] - t[j]) // épaisseur, largeur, hauteur
  const axe = (i) => new THREE.Vector3().setComponent(i, 1)
  const haut = axe(ordre[2]).transformDirection(o.matrixWorld).y > 0 ? 1 : -1
  const u = {
    uMin: { value: b.min }, uMax: { value: b.max }, uL: { value: axe(ordre[1]) }, uH: { value: axe(ordre[2]) },
    uHaut: { value: haut }, uRetrait: { value: 1 },
  }
  const m = o.material.clone()
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u)
    s.vertexShader = 'varying vec3 vPorte;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPorte = transformed;')
    s.fragmentShader = 'varying vec3 vPorte;\nuniform vec3 uMin, uMax, uL, uH;\nuniform float uHaut, uRetrait;\n' +
      s.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      {
        float l = dot(vPorte, uL), h = dot(vPorte, uH), lo = dot(uMin, uL), hi = dot(uMax, uL);
        float ext = abs(lo) > abs(hi) ? lo : hi;
        float dessus = uHaut > 0.0 ? dot(uMax, uH) - h : h - dot(uMin, uH);
        vec2 q = vec2(${RAYON_BATTANT.toFixed(3)}) - vec2(abs(ext - l), dessus);
        if (q.x > 0.0 && q.y > 0.0 && length(q) > ${RAYON_BATTANT.toFixed(3)}) discard;
      }`).replace('#include <aomap_fragment>', `#include <aomap_fragment>
      float l = dot(vPorte, uL), h = dot(vPorte, uH);
      float cote = min(l - dot(uMin, uL), dot(uMax, uL) - l);
      float dessus = uHaut > 0.0 ? dot(uMax, uH) - h : h - dot(uMin, uH);
      float dessous = uHaut > 0.0 ? h - dot(uMin, uH) : dot(uMax, uH) - h;
      float ombre = mix(0.3, 1.0, smoothstep(0.0, 0.035, cote))
                  * mix(0.12, 1.0, smoothstep(0.0, 0.08, dessus))
                  * mix(0.45, 1.0, smoothstep(0.0, 0.025, dessous));
      ombre = mix(1.0, ombre, uRetrait);
      reflectedLight.indirectDiffuse *= ombre;
      reflectedLight.indirectSpecular *= ombre;
      #ifdef USE_CLEARCOAT
        clearcoatSpecularIndirect *= ombre;
      #endif`)
  }
  m.customProgramCacheKey = () => 'ombreRetrait'
  o.material = m
  if (m.aoMap) aoMats.push(m)
  return u.uRetrait
}

// Phares avant (aux deux coins du nez, dans tram_rose.blend : x = 22,06 ; y = ±0,95 ; z = 1,02),
// dans le repère du tram : le nez regarde vers +x
const PHARES = MP89 // MP 89 : les deux feux blancs, bas sur le nez
  ? [new THREE.Vector3(13.9, 0.33, -0.31), new THREE.Vector3(13.9, 0.33, 0.31)]
  : [new THREE.Vector3(22.1, 1.02, -0.95), new THREE.Vector3(22.1, 1.02, 0.95)]
const AVANT = new THREE.Vector3(1, 0, 0)
export function setEclat(x) {
  if (x === eclat) return
  eclat = x
  for (const m of lit) m.emissiveIntensity = params.lumieres.phares * eclat
}
export function phares() {
  if (!boiteLocale) return null
  group.updateMatrixWorld()
  return {
    positions: PHARES.map((p) => p.clone().applyMatrix4(group.matrixWorld)),
    avant: AVANT.clone().transformDirection(group.matrixWorld),
  }
}

// Boîte du tram dans la station (pour la brume qu'il pousse) ; null tant qu'il n'est pas chargé
const boiteMonde = new THREE.Box3()
export function boite() {
  if (!boiteLocale) return null
  group.updateMatrixWorld()
  return boiteMonde.copy(boiteLocale).applyMatrix4(group.matrixWorld)
}

// Ouverture des portes côté quai, recopiée de l'animation open_all_doors de tram_rose.blend (qui n'anime
// que l'autre côté) : chaque battant sort de la caisse, puis coulisse de 73 cm. Les courbes sont relevées
// toutes les 2 images, de l'image 0 à l'image 80 (24 images/s) : la sortie finit à l'image 30.
const SORTIE = [0, 0.013, 0.049, 0.104, 0.175, 0.259, 0.352, 0.45, 0.55, 0.648, 0.741, 0.825, 0.896, 0.951, 0.987, 1]
const GLISSE = [0, 0.005, 0.018, 0.04, 0.069, 0.104, 0.145, 0.191, 0.242, 0.295, 0.352, 0.41, 0.47, 0.53, 0.59,
  0.648, 0.705, 0.758, 0.809, 0.855, 0.896, 0.931, 0.96, 0.982, 0.995, 1]
const COULISSE = MP89 ? 0.84 : 0.73 // m (MP 89 : un vantail fait 88 cm)
const IMAGES = 80
const DUREE_PORTES = IMAGES / 24 // secondes, ouverture complète à la vitesse du fichier
let portes = [] // { o, base, sens (±1 le long du tram), sortie (m) }

// Valeur d'une courbe relevée entre l'image f0 et l'image f1, à l'image f
function courbe(table, f0, f1, f) {
  const x = THREE.MathUtils.clamp((f - f0) / (f1 - f0), 0, 1) * (table.length - 1)
  const i = Math.min(Math.floor(x), table.length - 2)
  return THREE.MathUtils.lerp(table[i], table[i + 1], x - i)
}

function placerPortes() {
  const f = params.portes.ouverture * IMAGES
  const sortie = courbe(SORTIE, 0, 30, f), glisse = courbe(GLISSE, 30, 80, f)
  for (const p of portes) {
    p.o.position.copy(p.base)
    p.o.position.x += p.sens * COULISSE * glisse
    p.o.position.z += p.sortie * sortie // côté quai : vers +z dans le repère du tram
    if (p.ombre) p.ombre.value = 1 - sortie // sorti de la caisse, le battant n'est plus dans l'ombre
    for (const c of p.copies) c.position.copy(p.o.position)
  }
  majOmbres()
  majBandeaux() // allumés à l'ouverture des portes
}

// Après le geste : au-delà de la moitié, les portes finissent de s'ouvrir seules, sinon elles se referment.
// La promesse renvoie true si elles sont ouvertes.
let lectureP = null
export function setOuverture(x) {
  lectureP = null
  params.portes.ouverture = THREE.MathUtils.clamp(x, 0, 1)
  placerPortes()
}
export function finirOuverture() {
  const cible = params.portes.ouverture >= 0.5 ? 1 : 0
  const debut = (lectureP = performance.now())
  let avant = debut
  return new Promise((resolve) => {
    const pas = (now) => {
      if (lectureP !== debut) return resolve(false)
      const o = params.portes.ouverture, d = ((now - avant) / 1000 / DUREE_PORTES) * Math.sign(cible - o)
      avant = now
      params.portes.ouverture = cible ? Math.min(1, o + d) : Math.max(0, o + d)
      placerPortes()
      if (params.portes.ouverture !== cible) requestAnimationFrame(pas)
      else resolve(cible === 1)
    }
    requestAnimationFrame(pas)
  })
}

export function load(scene, renderer, manager) {
  scene.add(group, ...lampes)

  // Reflets et lumière d'ambiance : la station vue à 360° depuis la place du train (survey/scene2/quai.blend,
  // collection « EnvMap (test) ») : la moitié côté tunnel, recopiée en miroir derrière, le trou au-dessus
  // de la caméra comblé par la voûte d'en face, et une lumière sur chaque boule des lustres.
  // La station n'est pas concernée : ses matériaux ignorent la lumière.
  // Elle existe en deux versions, avec et sans les lustres : leur différence est la lumière des lustres seule,
  // dosée et teintée dans le panneau. Les deux sont recombinées puis préparées pour les reflets (PMREM).
  envScene = scene
  envRenderer = renderer
  renderer.shadowMap.autoUpdate = false
  majOmbres()
  const loader = new HDRLoader(manager)
  loader.load('scene2/envmap.hdr', (t) => { envMat.uniforms.tFull.value = t; majEnv() })
  loader.load('scene2/envmap_base.hdr', (t) => { envMat.uniforms.tBase.value = t; majEnv() })

  if (MP89) {
    const loader = new GLTFLoader(manager)
    loader.setDRACOLoader(new DRACOLoader(manager).setDecoderPath('draco/'))
    loader.load(`scene2/mp89.glb?v=${Date.now()}`, (gltf) => preparerMP89(gltf, renderer))
    const chargerAO = (fichier, poser) => new THREE.TextureLoader(manager).load(`scene2/${fichier}?v=${Date.now()}`, (t) => {
      t.channel = 1 // second jeu d'UV (TEXCOORD_1)
      t.flipY = false // même sens que les textures glTF
      t.colorSpace = THREE.NoColorSpace // donnée, pas une couleur
      t.anisotropy = renderer.capabilities.getMaxAnisotropy()
      poser(t)
    })
    for (const [partie, fichier] of [['corps', 'mp89_ao.png'], ['porte', 'mp89_ao_portes.png'], ['interieur', 'mp89_ao_interieur.png']]) {
      chargerAO(fichier, (t) => {
        texAO[partie] = t
        for (const m of matsAO[partie]) { m.aoMap = t; m.aoMapIntensity = params.lumieres.ao; m.needsUpdate = true }
      })
    }
    for (const [nom, { fichier }] of Object.entries(TEXTURES)) {
      for (const [u, f] of [['tTx', `${fichier}_motif.jpg`], ['tTxN', `${fichier}_relief.jpg`]]) {
        new THREE.TextureLoader(manager).load(`scene2/tex/${f}`, (t) => {
          t.wrapS = t.wrapT = THREE.RepeatWrapping
          t.colorSpace = THREE.NoColorSpace // données, pas des couleurs
          t.anisotropy = renderer.capabilities.getMaxAnisotropy()
          texU[nom][u].value = t
          for (const m of matsTexture[nom]) m.needsUpdate = true
        })
      }
    }
    for (const [u, f] of [['tLino', 'lino_motif.jpg'], ['tLinoN', 'lino_relief.jpg']]) {
      new THREE.TextureLoader(manager).load(`scene2/tex/${f}`, (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping
        t.colorSpace = THREE.NoColorSpace // données, pas des couleurs
        t.anisotropy = renderer.capabilities.getMaxAnisotropy() // net vu de biais
        solU[u].value = t
        for (const m of matsSol) m.needsUpdate = true
      })
    }
    new HDRLoader(manager).load(`scene2/mp89_plafonniers.hdr?v=${Date.now()}`, (t) => {
      t.channel = 1
      t.flipY = false // même sens que les images d'ombre
      t.colorSpace = THREE.LinearSRGBColorSpace
      t.minFilter = THREE.LinearMipmapLinearFilter
      t.generateMipmaps = true
      t.anisotropy = renderer.capabilities.getMaxAnisotropy()
      t.needsUpdate = true
      uPlafTex.value = t
    })
    return
  }

  // Téléphone : textures en 2048 (1024 pour les cartes techniques). En 4096, Safari iOS dépassait sa mémoire
  // et fermait la page (« Un problème récurrent est survenu »)
  const fichier = matchMedia('(pointer: coarse)').matches ? 'tram_mobile' : 'tram'
  new GLTFLoader(manager).load(`scene2/${fichier}.glb?v=${Date.now()}`, (gltf) => {
    // Transparence : les vitres sont des objets à part ("window") qui ne contiennent que du verre.
    // Elles reçoivent une copie transparente du matériau ; tout le reste est opaque, et les quelques
    // pixels de verre de ses textures deviennent des découpes nettes. Une seule couche transparente
    // évite les erreurs de tri (caisse entière transparente) ; la transmission coûterait trop cher sur mobile.
    const verre = new Map()
    const mats = new Set()
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return
      const m = o.material
      m.transmission = 0
      if (m.transparent && o.name.includes('window')) {
        // Le verre écrit sa distance et marque l'image comme « métro » (transparence à 1) : la brume
        // de la station ne passe pas à travers les vitres
        if (!verre.has(m)) verre.set(m, Object.assign(m.clone(), {
          depthWrite: true,
          blending: THREE.CustomBlending,
          blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
          blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
        }))
        o.material = verre.get(m)
        o.renderOrder = 1
      }
      mats.add(o.material)
    })
    const copies = new Set(verre.values())
    const remplace = new Map()
    for (const m of mats) {
      if (m.map) m.map.anisotropy = renderer.capabilities.getMaxAnisotropy() // net vu de biais (sièges, sol)
      if (m.transparent && !copies.has(m)) {
        m.transparent = false
        m.depthWrite = true // le chargeur la coupe sur les matériaux transparents
        m.alphaTest = 0.6
      }
      if (copies.has(m)) {
        // verre : lisse, non métallique
        Object.assign(m, { roughness: 0.05, metalness: 0, roughnessMap: null, metalnessMap: null })
      } else if (m.name.startsWith('glink_exterior')) {
        remplace.set(m, peinture(m))
      } else if (m.roughnessMap) {
        // Intérieur : ombre cuite du fichier (posée d'office par le chargeur glTF), à force réduite : à pleine
        // force, ses zones fausses noircissaient des pans entiers (dos des sièges, dessous, bas des portes)
        if (m.map?.image) {
          Object.assign(m, { emissiveMap: plafonniers(m.map.image), emissive: new THREE.Color(1, 1, 1) })
          interieurs.push(m)
          eclairerInterieur(m)
        }
      }
    }
    gltf.scene.traverse((o) => { if (o.isMesh && remplace.has(o.material)) o.material = remplace.get(o.material) })
    for (const m of new Set([...mats].map((m) => remplace.get(m) || m))) if (m.emissiveMap && !interieurs.includes(m)) lit.push(m) // les feux, pas les plafonniers
    // Portes côté quai : les battants (et leurs vitres) sont posés à l'axe de la porte, côté +z.
    // Le centre de leur géométrie dit de quel côté ils coulissent.
    gltf.scene.updateMatrixWorld(true)
    portes = []
    gltf.scene.traverse((o) => {
      if (!o.isMesh || !o.name.includes('_door_') || o.position.z <= 0) return
      const centre = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3())
      portes.push({
        o, base: o.position.clone(),
        sens: Math.sign(centre.x - o.position.x),
        sortie: o.position.z < 1.31 ? 0.0662 : 0.0647, // valeurs du fichier, selon le type de porte
        copies: [], // reflet de la vitre, qui suit le battant
        ombre: o.name.includes('window') ? null : ombreRetrait(o),
      })
    })
    placerPortes()
    // Ouvertures : les battants fermés, réunis deux à deux quand ils se touchent
    tram = gltf.scene
    const versTram = tram.matrixWorld.clone().invert(), ouv = []
    for (const p of portes) {
      if (p.o.name.includes('window')) continue
      const b = new THREE.Box3().setFromObject(p.o).applyMatrix4(versTram)
      const voisin = ouv.find((o) => b.min.x <= o.max.x + 0.01 && b.max.x >= o.min.x - 0.01)
      if (voisin) voisin.union(b); else ouv.push(b)
    }
    ouv.slice(0, NB_OUV).forEach((b, i) => bordOuv.uOuv.value[i].set(b.min.x, b.max.x, b.min.y, b.max.y))
    // Reflets des vitres côté quai : Three.js atténue le reflet d'un verre transparent avec sa couleur.
    // On pose sur chaque vitre une copie qui ne contient que le reflet (base noire, ajoutée à l'image).
    // Côté voie opposée, on s'en passe : on ne les voit qu'à travers la rame.
    const vitres = []
    gltf.scene.traverse((o) => {
      if (!o.isMesh || !o.name.includes('window')) return
      const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3())
      if (c.z > 0.5) vitres.push(o) // côté quai : +z dans le repère du tram
    })
    for (const o of vitres) {
      const r = new THREE.Mesh(o.geometry, refletVitre)
      r.position.copy(o.position); r.quaternion.copy(o.quaternion); r.scale.copy(o.scale)
      r.renderOrder = 2
      o.parent.add(r)
      if (o.name.includes('_door_')) portes.find((p) => p.o === o)?.copies.push(r) // la copie suit la porte
    }
    placerPortes()
    group.add(gltf.scene)
    boiteLocale = new THREE.Box3().setFromObject(gltf.scene)
    demiLongueur = boiteLocale.getSize(new THREE.Vector3()).x / 2
    update()
  })
}

// ---------- MP 89 ----------
// Le modèle n'a pas de textures de matière : couleurs unies et une texture de peinture (paint_purrl.png).
// On garde la même lumière que le tram (env map de la station) et la même peinture vernie.
const INTERIEUR_MP89 = ['interior', 'metro.001', 'asiento', 'piso', 'pupitre']

// Lustres en vraies lumières : les deux lustres au-dessus de la caméra (côté quai) éclairent le métro comme de
// vraies lampes. Three.js calcule pour chaque point sa distance aux lampes (la lumière baisse avec le carré de
// la distance : le toit, plus proche, est plus éclairé que le bas de caisse) et les ombres portées.
// La lumière diffuse de l'env map, la même à toutes les hauteurs, est réduite d'autant ; ses reflets restent.
// Positions : centre de chaque lustre (groupe de 3 boules) dans la station. Couleur : le rose de la lumière de
// la station, celui que compense la peinture. Essayé le 02/11 : les 22 lustres le long du métro avec ombres
// floues (VSM) : 5 images/s et pas plus beau, abandonné.
const LUSTRES = [new THREE.Vector3(8.12, 4.94, -31.49), new THREE.Vector3(8.12, 4.94, -39.51)]
if (MP89) params.lustresReels = {
  actif: true,
  intensite: 115.5, // candelas par lustre
  couleur: '#ffe4e9',
  envDiffus: 0.56, // part restante de la lumière diffuse de l'env map (1 : comme avant)
  ombres: true,
}
const lampes = MP89 ? LUSTRES.map((p) => {
  const l = new THREE.PointLight(0xffffff, 0, 0, 2) // portée infinie, baisse physique (carré de la distance)
  l.position.copy(p)
  l.shadow.mapSize.set(1024, 1024)
  Object.assign(l.shadow.camera, { near: 0.1, far: 30 })
  l.shadow.bias = -0.0005
  l.shadow.normalBias = 0.02
  return l
}) : []
const uEnvDiffus = { value: 1 }
function envDiffus(m) {
  const avant = m.onBeforeCompile, cleAvant = m.customProgramCacheKey
  m.onBeforeCompile = (s, r) => {
    avant.call(m, s, r)
    s.uniforms.uEnvDiffus = uEnvDiffus
    s.fragmentShader = 'uniform float uEnvDiffus;\n' + s.fragmentShader.replace('#include <lights_fragment_maps>',
      '#include <lights_fragment_maps>\n  iblIrradiance *= uEnvDiffus;')
  }
  m.customProgramCacheKey = () => cleAvant.call(m) + '_envDiffus'
}
const solU = {
  tLino: { value: null }, tLinoN: { value: null },
  uLinoRepet: { value: 1 }, uLinoMotif: { value: 1 }, uLinoRug: { value: 1 }, uLinoRelief: { value: 1 }, uLinoAO: { value: 1 },
  uBandes: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, -1)) }, // xmin, xmax, z, demi-largeur
  uBandesY: { value: new Array(8).fill(0) }, uRefletBandes: { value: 1 }, uVersTramSol: bordOuv.uVersTram,
}
const matsSol = []
// Matières texturées (velours des assises, plastiques) : posées par projection selon l'orientation de chaque face
// (les coordonnées de texture du modèle ne sont pas faites pour un motif), dans le repère de chaque pièce.
// <nom>_motif.jpg : rouge = nuances, vert = rugosité, bleu = AO ; <nom>_relief.jpg : normal map (OpenGL).
// Seuls le grain, la brillance, l'AO et le relief de la photo sont gardés : la couleur reste celle de la matière.
// A, B : écarts maximaux des nuances et de la rugosité dans la photo ; ao : moyenne de l'AO (recentrée).
const TEXTURES = {
  velours: { fichier: 'velours', A: 0.3013, B: 0.2581, ao: 0.891 }, // Poly Haven velour_velvet
  plastique: { fichier: 'plastique', A: 0.1435, B: 0.2682, ao: 0.929 }, // ambientCG Plastic004
  caoutchouc: { fichier: 'caoutchouc', A: 0.9354, B: 0.1623, ao: 0.917 }, // ambientCG Rubber004
  metal: { fichier: 'metal', A: 0.2767, B: 0.0835, ao: 0.927 }, // ambientCG Metal046A (martelé)
}
const texU = Object.fromEntries(Object.keys(TEXTURES).map((k) => [k, {
  tTx: { value: null }, tTxN: { value: null }, uTxRepet: { value: 1 }, uTxMotif: { value: 1 }, uTxRug: { value: 1 }, uTxRelief: { value: 1 }, uTxAO: { value: 1 },
}]))
const matsTexture = Object.fromEntries(Object.keys(TEXTURES).map((k) => [k, []]))
const matsVelours = matsTexture.velours
function texturer(m, nom) {
  const U = texU[nom], k = TEXTURES[nom]
  const avant = m.onBeforeCompile, cleAvant = m.customProgramCacheKey
  m.onBeforeCompile = (s, r) => {
    avant.call(m, s, r)
    if (!U.tTx.value || !U.tTxN.value) return // recompilé quand les deux images sont là
    Object.assign(s.uniforms, U)
    s.vertexShader = 'uniform float uTxRepet;\nvarying vec3 vTxPos, vTxNrm, vTxAx, vTxAy, vTxAz;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vTxPos = position * length(modelMatrix[0].xyz) * uTxRepet; // en motifs, à l'échelle réelle
      vTxNrm = normal;
      vTxAx = normalize(normalMatrix * vec3(1.0, 0.0, 0.0));
      vTxAy = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));
      vTxAz = normalize(normalMatrix * vec3(0.0, 0.0, 1.0));`)
    s.fragmentShader = 'uniform sampler2D tTx, tTxN;\nuniform float uTxMotif, uTxRug, uTxRelief, uTxAO;\nvarying vec3 vTxPos, vTxNrm, vTxAx, vTxAy, vTxAz;\n' + s.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
      vec3 txAn = abs(normalize(vTxNrm));
      vec3 txW = pow(txAn, vec3(4.0)); txW /= txW.x + txW.y + txW.z;
      vec2 txUx = vTxPos.zy, txUy = vTxPos.xz, txUz = vTxPos.xy;
      vec3 tx = texture2D(tTx, txUx).rgb * txW.x + texture2D(tTx, txUy).rgb * txW.y + texture2D(tTx, txUz).rgb * txW.z;
      diffuseColor.rgb *= max(0.0, 1.0 + ${k.A.toFixed(4)} * uTxMotif * (2.0 * tx.r - 1.0));`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + ${k.B.toFixed(4)} * uTxRug * (2.0 * tx.g - 1.0), 0.04, 1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        vec2 u = txUz; vec3 T = vTxAx, B = vTxAy;
        if (txAn.x >= txAn.y && txAn.x >= txAn.z) { u = txUx; T = vTxAz; B = vTxAy; }
        else if (txAn.y >= txAn.z) { u = txUy; T = vTxAx; B = vTxAz; }
        vec3 tn = texture2D(tTxN, u).xyz * 2.0 - 1.0;
        tn.xy *= uTxRelief;
        normal = normalize(T * tn.x + B * tn.y + normal * tn.z);
      }`)
      .replace('vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;',
        // AO recentrée sur sa moyenne : la teinte moyenne ne change pas
        `vec3 totalDiffuse = (reflectedLight.directDiffuse + reflectedLight.indirectDiffuse) * mix(1.0, tx.b / ${k.ao.toFixed(3)}, uTxAO);`)
  }
  m.customProgramCacheKey = () => cleAvant.call(m) + (U.tTx.value && U.tTxN.value ? '_' + nom : '')
  matsTexture[nom].push(m)
}
function majTextures() {
  for (const nom of Object.keys(TEXTURES)) {
    const p = nom === 'velours' ? params.velours : params.textures?.[nom]
    if (!p) continue
    const U = texU[nom]
    U.uTxRepet.value = 1 / p.taille
    U.uTxMotif.value = p.motif
    U.uTxRug.value = p.rugositeVariation
    U.uTxRelief.value = p.relief
    U.uTxAO.value = p.ao
  }
  const v = params.velours
  if (v) for (const m of matsVelours) {
    m.roughness = v.rugosite
    m.sheen = v.lustre
    m.sheenRoughness = v.lustreRugosite
    m.sheenColor.copy(m.color) // le lustre prend la couleur du tissu
  }
}
const majVelours = majTextures
// Motif du lino posé vu du dessus (le sol est plat, ses coordonnées de texture ne sont pas faites pour un motif).
// Les écarts sont ceux de la photo : nuances 0,41 et rugosité 0,10 au maximum, autour de la moyenne.
// lino_motif.jpg : rouge = nuances, vert = rugosité, bleu = AO du lino. lino_relief.jpg : normal map (OpenGL).
function lino(m) {
  const avant = m.onBeforeCompile, cleAvant = m.customProgramCacheKey
  m.onBeforeCompile = (s, r) => {
    avant.call(m, s, r)
    if (!solU.tLino.value || !solU.tLinoN.value) return // recompilé quand les deux images sont là
    Object.assign(s.uniforms, solU)
    s.vertexShader = 'uniform float uLinoRepet;\nuniform mat4 uVersTramSol;\nvarying vec2 vLino;\nvarying vec3 vLinoT, vLinoB, vTram;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vLino = position.xz * uLinoRepet;
      vTram = (uVersTramSol * modelMatrix * vec4(position, 1.0)).xyz;
      vLinoT = normalize(normalMatrix * vec3(1.0, 0.0, 0.0));
      vLinoB = normalize(normalMatrix * vec3(0.0, 0.0, 1.0));`)
    s.fragmentShader = 'uniform sampler2D tLino, tLinoN;\nuniform float uLinoMotif, uLinoRug, uLinoRelief, uLinoAO, uRefletBandes, uBandesY[8];\nuniform vec4 uBandes[8];\nuniform mat4 uVersTramSol;\nvarying vec3 vTram;\nvarying vec2 vLino;\nvarying vec3 vLinoT, vLinoB;\n' + s.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
      vec3 lino = texture2D(tLino, vLino).rgb;
      diffuseColor.rgb *= max(0.0, 1.0 + 0.4074 * uLinoMotif * (2.0 * lino.r - 1.0));`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + 0.1012 * uLinoRug * (2.0 * lino.g - 1.0), 0.04, 1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      vec3 ln = texture2D(tLinoN, vLino).xyz * 2.0 - 1.0;
      ln.xy *= uLinoRelief;
      normal = normalize(vLinoT * ln.x + vLinoB * ln.y + normal * ln.z);`)
      .replace('vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;',
        'vec3 totalDiffuse = (reflectedLight.directDiffuse + reflectedLight.indirectDiffuse) * mix(1.0, lino.b, uLinoAO);')
      // Reflet des bandeaux du plafond : leur lumière est cuite (diffuse seulement), ils ne laissaient aucun reflet.
      // Dans le repère du métro, on suit le rayon réfléchi jusqu'à la hauteur de chaque bandeau ; plus le sol est
      // rugueux et le bandeau loin, plus le reflet s'étale (et baisse d'autant). Fresnel : plus fort vu de biais.
      .replace('vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;', `
      vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
      {
        vec3 camT = (uVersTramSol * vec4(cameraPosition, 1.0)).xyz;
        vec3 V = normalize(camT - vTram);
        vec3 N = normalize(mat3(uVersTramSol) * inverseTransformDirection(normal, viewMatrix));
        vec3 R = reflect(-V, N);
        float acc = 0.0;
        if (R.y > 0.02) for (int i = 0; i < 8; i++) {
          vec4 b = uBandes[i];
          if (b.w <= 0.0) continue;
          float t = (uBandesY[i] - vTram.y) / R.y;
          vec3 H = vTram + R * t;
          float d = max(max(b.x - H.x, H.x - b.y), abs(H.z - b.z) - b.w);
          float flou = 0.01 + roughnessFactor * roughnessFactor * t;
          acc += (1.0 - smoothstep(-flou, flou, d)) * b.w / (b.w + flou);
        }
        float F = 0.04 + 0.96 * pow(1.0 - saturate(dot(N, V)), 5.0);
        totalSpecular += uRefletBandes * F * min(acc, 1.0);
      }`)
  }
  m.customProgramCacheKey = () => cleAvant.call(m) + (solU.tLino.value && solU.tLinoN.value ? '_lino' : '')
  matsSol.push(m)
}
function majSol() {
  const p = params.sol
  if (!p) return
  for (const m of matsSol) { m.color.set(p.couleur); m.roughness = p.rugosite }
  solU.uLinoRepet.value = params.train.echelle / p.taille // le modèle est mis à l'échelle : 1 unité = echelle m
  solU.uLinoMotif.value = p.motif
  solU.uLinoRug.value = p.rugositeVariation
  solU.uLinoRelief.value = p.relief
  solU.uLinoAO.value = p.ao
  solU.uRefletBandes.value = p.reflet * params.lumieres.plafonniers // aussi lumineux que les bandeaux
}
// Bandeaux du plafond en vraies lumières, avec ombres portées (barres, reliefs des parois, sièges). Les lumières
// rectangulaires de Three.js (essai du 02/11) n'ont pas d'ombres : ce sont des spots, cachés dans les bandeaux,
// au milieu d'un panneau, tournés comme lui vers l'allée. Deux par côté dans chaque voiture visible depuis la fin
// du parcours. Repère du métro : panneaux centrés à y 1,79, z ±0,61 ; voiture de la porte 3 de x 0 à 11,9, l'autre
// de -13,06 à -1,15. Ombres recalculées seulement quand quelque chose bouge (majOmbres).
if (MP89) params.bandeaux = { actifs: true, intensite: 12, angle: 65, flou: 0.8 } // intensité en candelas
// Un spot par panneau autour de la porte 3 (3 par côté), 1 par côté dans la voiture suivante. Pas plus de 8 :
// avec les 2 lustres et les textures des matières, une matière ne peut pas lire plus de 16 textures (erreur de shader).
const BANDEAUX_X = [4.96, 2.97, 0.99, -4.12]
const bandeaux = []
function poserBandeaux(scene) {
  for (const x of BANDEAUX_X) for (const cote of [1, -1]) {
    const l = new THREE.SpotLight(0xffffff, 0, 0, 1, 0.8, 2)
    l.position.set(x, 1.79, 0.61 * cote)
    l.target.position.set(x, 1.79 - 0.75, 0.61 * cote - 0.67 * cote) // face lumineuse du panneau
    l.castShadow = true
    l.shadow.mapSize.set(2048, 2048) // 1024 : ombres baveuses
    Object.assign(l.shadow.camera, { near: 0.05, far: 12 })
    l.shadow.bias = -0.0005
    l.shadow.normalBias = 0.02
    scene.add(l, l.target)
    bandeaux.push(l)
  }
}
function majBandeaux() {
  const p = params.bandeaux
  if (!p) return
  // Allumés seulement à l'ouverture des portes : avant, à quai, ils ne se voient pas et coûtaient près de la moitié
  // des images par seconde (chaque pixel relit leurs 8 cartes d'ombre). Retirés de la scène, pas mis à 0, sinon ils
  // coûtent quand même. Premier allumage : les shaders se recompilent une fois.
  const allumes = p.actifs && params.portes.ouverture > 0
  for (const l of bandeaux) {
    l.visible = allumes
    l.intensity = p.actifs ? p.intensite : 0
    l.angle = THREE.MathUtils.degToRad(p.angle)
    l.penumbra = p.flou
    l.castShadow = p.actifs
  }
  majOmbres()
}
function majLustres() {
  const p = params.lustresReels
  if (!p) return
  for (const l of lampes) {
    l.intensity = p.actif ? p.intensite : 0
    l.color.set(p.couleur)
    l.castShadow = p.actif && p.ombres
  }
  uEnvDiffus.value = p.actif ? p.envDiffus : 1
  majOmbres()
}

// Ombre de contact (ambient occlusion) cuite par Cycles (survey/scene2/metro/mp89/cuire_ao.py) : le fond des creux
// (poignées, joints, encadrements) reçoit moins de lumière que la surface. Three.js ne le calcule pas lui-même.
// Elle assombrit la lumière de la station et la lumière cuite ; sa force est le réglage « Ombres dans les creux (AO) ».
// Trois images d'ombre, chacune assez fine pour sa partie : la caisse, les portes (une poignée n'avait que
// quelques pixels dans l'image de la caisse) et l'intérieur (parois, sol, sièges, barres)
const matsAO = { corps: [], porte: [], interieur: [] }
const texAO = { corps: null, porte: null, interieur: null }
// Lumière des bandeaux du plafond, cuite par Blender sur l'intérieur (cuire_plafonniers.py) : la lumière reçue,
// avec les ombres et les rebonds, sans la couleur des matières. Noire tant qu'elle n'est pas chargée.
const uPlafTex = { value: new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1) }
uPlafTex.value.needsUpdate = true
const uPlafForce = { value: 1 }
function ombreContact(m, partie) {
  // Three.js n'applique l'ombre de contact qu'à la lumière indirecte (station, lumière cuite) : on l'applique
  // aussi à la lumière directe des lustres, qui éclaire le plus le métro, sinon les creux resteraient en pleine lumière
  const avant = m.onBeforeCompile, cleAvant = m.customProgramCacheKey
  m.onBeforeCompile = (s, r) => {
    avant.call(m, s, r)
    s.fragmentShader = s.fragmentShader.replace('#include <aomap_fragment>', `#include <aomap_fragment>
      #ifdef USE_AOMAP
        reflectedLight.directDiffuse *= ambientOcclusion;
        reflectedLight.directSpecular *= ambientOcclusion;
      #endif
      #if defined(USE_AOMAP) && defined(PLAFONNIERS)
        // Lumière des bandeaux (elle contient déjà ses ombres : l'ombre de contact ne s'y applique pas)
        reflectedLight.directDiffuse += texture2D(tPlaf, vAoMapUv).rgb * uPlaf * diffuseColor.rgb;
      #endif`)
    if (partie === 'interieur') {
      // AO de l'intérieur en puissance (la formule de Three.js devient négative au-delà de 1) : à 1 l'ombre bakée
      // telle quelle, au-dessus des creux de plus en plus sombres, sans passer au noir pur
      s.fragmentShader = s.fragmentShader.replace('#include <aomap_fragment>',
        THREE.ShaderChunk.aomap_fragment.replace('( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0', 'pow( texture2D( aoMap, vAoMapUv ).r, aoMapIntensity )'))
      s.defines = { ...s.defines, PLAFONNIERS: '' }
      s.uniforms.tPlaf = uPlafTex
      s.uniforms.uPlaf = uPlafForce
      s.fragmentShader = 'uniform sampler2D tPlaf;\nuniform float uPlaf;\n' + s.fragmentShader
    }
  }
  m.customProgramCacheKey = () => cleAvant.call(m) + '_ombreContact_' + partie
  if (texAO[partie]) m.aoMap = texAO[partie]
  matsAO[partie].push(m)
  aoMats.push(m)
}

function preparerMP89(gltf, renderer) {
  const remplace = new Map()
  // cuit : la pièce a la lumière cuite (second jeu d'UV) ; elle reçoit sa propre copie de la matière
  const matiere = (m, cuit, partie, siege) => {
    const tissu = siege && (m.name === 'metro.001' || m.name === 'asiento') // assises : le blanc sert aussi au plafond
    const texture = tissu ? 'velours'
      : m.name === 'interior' || m.name === 'metro.001' ? 'plastique' // parois, plafond
      : groupeDe(m.name) === 'joints' ? 'caoutchouc' // soufflet, joints des vitres et des portes
      : groupeDe(m.name) === 'metal' ? 'metal' : null // barres, poignées
    const cle = m.uuid + (cuit ? '_cuit' : '') + '_' + partie + (texture ? '_' + texture : '')
    if (remplace.has(cle)) return remplace.get(cle)
    let r = cuit ? m.clone() : m
    if (tissu) {
      r = new THREE.MeshPhysicalMaterial({ name: m.name, color: m.color, metalness: 0, side: m.side, sheen: 1 })
    }
    if (m.name === 'pintura' || m.name === 'puerta') {
      // Peinture blanche et rose pastel, vernie comme celle du tram. Non métallisée : un blanc métallisé
      // prend la couleur de ce qu'il reflète et vire au gris rose.
      r = new THREE.MeshPhysicalMaterial({
        name: m.name, map: m.map, color: m.color,
        roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05,
      })
      if (r.map) r.map.anisotropy = renderer.capabilities.getMaxAnisotropy()
      bordCaisse(r) // pour la clarté de la carrosserie ; aucune ouverture n'est déclarée (bordOuv reste vide)
    } else if (m.name === 'verre') {
      // Verre : une seule couche transparente, qui écrit sa distance et marque l'image comme « métro »
      r = new THREE.MeshStandardMaterial({
        name: m.name, color: 0x050707, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.3,
        depthWrite: true, blending: THREE.CustomBlending,
        blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
        blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
      })
      sansSpots(r)
    } else if (m.name === 'luz') {
      interieurs.push(r) // plafonniers (et feux avant) : réglés par « Plafonniers de la rame »
    } else if (INTERIEUR_MP89.includes(m.name)) {
      eclairerInterieur(r)
      interieurs.push(r)
    }
    // Ombre de contact cuite : extérieur seulement. La caisse et l'intérieur forment un seul objet dans le modèle,
    // et sur l'intérieur cette ombre était fausse et grossière (taches noires autour des portes)
    const exterieur = groupeDe(m.name) && !['vitres', 'interieur'].includes(groupeDe(m.name))
    if (cuit && m.name !== 'verre') {
      if (partie === 'interieur' || exterieur) ombreContact(r, partie)
    }
    const g = groupeDe(m.name)
    if (g) matsGroupe[g].add(r) // réglé par le panneau « Matières du métro »
    if (g && g !== 'vitres') envDiffus(r) // lumière diffuse de l'env map dosée (« Lustres en vraies lumières »)
    if (m.name === 'piso') lino(r)
    if (texture) texturer(r, texture)
    remplace.set(cle, r)
    return r
  }
  // Soufflet entre les voitures (objet union) : le modèle pose des plaques roses droites devant le vrai soufflet
  // plissé en caoutchouc. Dans un vrai métro on voit le soufflet : on retire les plaques (validé par Adrien, 02/11)
  const plaques = []
  gltf.scene.traverse((o) => { if (o.isMesh && o.parent?.name === 'union' && o.material.name === 'interior') plaques.push(o) })
  for (const o of plaques) o.removeFromParent()
  const vitres = []
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return
    o.castShadow = o.receiveShadow = true // ombres des lustres
    let partie = 'corps', siege = false
    for (let p = o; p; p = p.parent) {
      if (/^sit/.test(p.name)) siege = true
      if (p.name.startsWith('mp_door_')) partie = 'porte'
      if (p.userData.interieur) partie = 'interieur'
    }
    o.material = matiere(o.material, !!o.geometry.attributes.uv1, partie, siege)
    if (o.material.name === 'verre') {
      o.renderOrder = 1
      vitres.push(o)
    }
  })
  gltf.scene.updateMatrixWorld(true)

  // Portes côté quai (+z) : chaque vantail a son origine à l'axe de la porte ; le centre de sa géométrie
  // dit de quel côté il coulisse
  portes = []
  gltf.scene.traverse((o) => {
    if (!o.name.startsWith('mp_door_') || o.position.z <= 0 || !o.parent || o.parent.name.startsWith('mp_door_')) return
    const centre = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3())
    portes.push({ o, base: o.position.clone(), sens: Math.sign(centre.x - o.position.x), sortie: 0.06, copies: [], ombre: null })
  })

  // Reflets des vitres : copie qui ne contient que le reflet, ajoutée à l'image (comme le tram). Les vitres d'une
  // voiture forment un seul objet, des deux côtés : on les prend toutes. Celles du côté voie, vues à travers la
  // rame, tournent le dos à la caméra et ne sont pas dessinées (face avant seulement).
  for (const o of vitres) {
    const r = new THREE.Mesh(o.geometry, refletVitre)
    r.position.copy(o.position); r.quaternion.copy(o.quaternion); r.scale.copy(o.scale)
    r.renderOrder = 2
    o.parent.add(r) // dans le vantail si c'est une vitre de porte : la copie le suit
  }

  for (const m of remplace.values()) if (m.name === 'luzroja') m.emissiveIntensity = 0.3
  // Fond de la rame : le modèle n'a qu'une voiture à cabine et une voiture simple, ouverte à l'arrière (on voyait
  // le tunnel au bout). La voiture à cabine et son soufflet sont dupliqués derrière, tournés de 180° (un MP 89 a
  // une cabine à chaque bout). Géométries et matières partagées : AO et lumière bakées restent valables.
  // Repère du métro : voiture à cabine de x -0,08 à 14 ; voiture simple de -14,3 à -0,91 ; même jeu de 0,83 m.
  gltf.scene.updateMatrixWorld(true)
  const versRame = gltf.scene.matrixWorld.clone().invert(), centre = new THREE.Vector3()
  const arriere = new THREE.Group()
  arriere.name = 'rame_arriere'
  for (const c of [...gltf.scene.children]) {
    const b = new THREE.Box3().setFromObject(c)
    if (b.isEmpty()) continue
    b.applyMatrix4(versRame).getCenter(centre)
    if (centre.x > -0.5 || c.name === 'union') arriere.add(c.clone(true))
  }
  arriere.rotation.y = Math.PI // x → -x, z → -z (la voiture est symétrique gauche-droite)
  arriere.position.x = -15.21 // x' = -15,21 - x : le bout x -0,08 se pose à -15,13, à 0,83 m de la voiture simple
  gltf.scene.add(arriere)
  poserBandeaux(gltf.scene)
  // Bandeaux du plafond (objets light et light2, deux bandes chacun) : leurs faces tournées vers le bas, dans le
  // repère du métro, donnent pour chaque bande sa longueur, son milieu, sa demi-largeur et sa hauteur
  const bandes = []
  const versScene = gltf.scene.matrixWorld.clone().invert()
  gltf.scene.traverse((o) => {
    if (!o.isMesh || (o.name !== 'light' && o.name !== 'light2')) return
    const M = versScene.clone().multiply(o.matrixWorld), pos = o.geometry.attributes.position, idx = o.geometry.index
    const cotes = {}
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3()
    for (let i = 0; i < idx.count; i += 3) {
      a.fromBufferAttribute(pos, idx.getX(i)).applyMatrix4(M)
      b.fromBufferAttribute(pos, idx.getX(i + 1)).applyMatrix4(M)
      c.fromBufferAttribute(pos, idx.getX(i + 2)).applyMatrix4(M)
      n.subVectors(b, a).cross(c.clone().sub(a)).normalize()
      if (n.y > -0.3) continue // seulement la face lumineuse, tournée vers le bas
      const k = Math.sign(a.z + b.z + c.z)
      const box = (cotes[k] ??= new THREE.Box3())
      box.expandByPoint(a); box.expandByPoint(b); box.expandByPoint(c)
    }
    for (const box of Object.values(cotes)) bandes.push(box)
  })
  bandes.slice(0, 8).forEach((box, i) => {
    solU.uBandes.value[i].set(box.min.x, box.max.x, (box.min.z + box.max.z) / 2, (box.max.z - box.min.z) / 2)
    solU.uBandesY.value[i] = (box.min.y + box.max.y) / 2
  })
  envMatieres()
  appliquerMatieres()
  majSol()
  majVelours()
  placerPortes()
  tram = gltf.scene
  group.add(gltf.scene)
  boiteLocale = new THREE.Box3().setFromObject(gltf.scene)
  demiLongueur = boiteLocale.getSize(new THREE.Vector3()).x / 2
  update()
}

// Position de départ : le nez juste derrière le mur du fond, tout le train caché dans le tunnel
const zTunnel = () => demiLongueur * params.train.echelle + 1

// Freinage d'un métro : il sort du tunnel à pleine vitesse et freine tout de suite. La vitesse baisse
// comme (1 - t)^FREIN : au-dessus de 1, le freinage s'adoucit en fin de course, comme un conducteur
// qui relâche le frein pour ne pas secouer les voyageurs.
const FREIN = 1.2
const distance = () => Math.abs(zTunnel() - params.train.z)
export const dureeFreinage = () => ((FREIN + 1) * distance()) / (params.arrivee.vitesse / 3.6)
export const dureeArrivee = () => dureeFreinage() + params.arrivee.stabilisation

// Avancée (0 à 1, un peu plus au moment du dépassement) au temps t, en secondes
function avanceeA(t) {
  const a = params.arrivee, d = distance()
  const recul = a.recul / 100 / d // le dépassement, en part du trajet
  const tf = dureeFreinage()
  if (t < tf) return (1 + recul) * (1 - (1 - t / tf) ** (FREIN + 1))
  // Arrêté un cran trop loin, il revient en arrière un peu au-delà de sa place, puis repart
  // un tout petit peu en avant pour s'y poser. Chaque mouvement part et finit à vitesse nulle.
  const u = Math.min(1, (t - tf) / a.stabilisation)
  const demi = (de, vers, x) => vers + ((de - vers) * (1 + Math.cos(Math.PI * x))) / 2
  return 1 + (u < 0.55 ? demi(recul, -0.3 * recul, u / 0.55) : demi(-0.3 * recul, 0, (u - 0.55) / 0.45))
}

export function update() {
  const t = params.train
  // Le tram tourné de 90° : son axe x devient l'axe -z de la scène
  if (t.porte > 0 && cameraZ !== null) t.z = cameraZ + PORTES[t.porte - 1] * t.echelle
  group.position.set(t.x, t.y, THREE.MathUtils.lerp(zTunnel(), t.z, params.arrivee.avancee))
  group.rotation.y = THREE.MathUtils.degToRad(t.rotation)
  group.scale.setScalar(t.echelle)
  if (tram) { group.updateMatrixWorld(true); bordOuv.uVersTram.value.copy(tram.matrixWorld).invert() }
  params.arrivee.duree = Math.round(dureeArrivee() * 10) / 10

  const l = params.lumieres
  if (group.parent) group.parent.environmentIntensity = l.reflets
  for (const m of lit) m.emissiveIntensity = l.phares * eclat
  for (const m of aoMats) m.aoMapIntensity = l.ao
  refletVitre.envMapIntensity = l.vitres
  bordOuv.uClarte.value = l.clarte
  for (const m of interieurs) { m.emissiveIntensity = l.plafonniers; m.aoMapIntensity = l.aoInterieur }
  uPlafForce.value = l.lumierePlafonniers ?? 0
  uInterieur.value = l.interieur
  appliquerMatieres() // « Intensité générale » agit aussi sur les matières qui ont leur propre env map
  majLustres() // recalcule aussi les ombres : le métro a pu bouger
  majBandeaux()
  majSol()
  majVelours()
}

// Arrivée jouée en entier : le train sort du tunnel puis freine jusqu'à l'arrêt.
// La promesse se termine à l'arrêt.
let lecture = null
export function jouer() {
  const debut = (lecture = performance.now())
  params.arrivee.avancee = 0
  update()
  return new Promise((resolve) => {
    const pas = (now) => {
      if (lecture !== debut) return resolve() // une autre lecture a pris le relais
      const t = Math.max(0, now - debut) / 1000 // l'horodatage de l'image peut précéder le départ
      params.arrivee.avancee = avanceeA(t)
      update()
      if (t < dureeArrivee()) requestAnimationFrame(pas)
      else resolve()
    }
    requestAnimationFrame(pas)
  })
}

export function setArrivee(x) { lecture = null; params.arrivee.avancee = x; update() }

// Réglages du panneau, rangés par catégorie
export function addGui(gui) {
  // ---- Métro : position et arrivée ----
  const pos = gui.addFolder('Métro : position et arrivée')
  const t = pos.addFolder('Placement')
  t.add(params.train, 'x', -3, 5, 0.005).name('Gauche / droite').onChange(update)
  t.add(params.train, 'y', -3, 1, 0.005).name('Hauteur').onChange(update)
  const portes = MP89
    ? { Libre: 0, '1 (cabine)': 1, 2: 2, 3: 3, 4: 4, 5: 5, '6 (arrière)': 6 }
    : { Libre: 0, '1 (petite, cabine)': 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, '8 (cabine arrière)': 8 }
  t.add(params.train, 'porte', portes).name('Porte au centre').listen().onChange(update)
  t.add(params.train, 'z', -70, 40, 0.005).name('Le long du quai (arrêt)').listen()
    .onChange(() => { params.train.porte = 0; update() }) // bouger le curseur repasse en position libre
  t.add(params.train, 'rotation', -180, 180, 0.5).name('Rotation (°)').onChange(update)
  t.add(params.train, 'echelle', 0.5, 2.5, 0.005).name('Échelle').onChange(update)
  const a = pos.addFolder('Arrivée')
  a.add(params.arrivee, 'avancee', 0, 1, 0.001).name('Avancée').listen().onChange(update)
  a.add(params.arrivee, 'vitesse', 20, 80, 1).name('Vitesse d\'entrée (km/h)').onChange(update)
  a.add(params.arrivee, 'recul', 0, 30, 1).name('Recul à l\'arrêt (cm)').onChange(update)
  a.add(params.arrivee, 'stabilisation', 0.3, 3, 0.1).name('Durée du balancement (s)').onChange(update)
  a.add(params.arrivee, 'duree').name('Durée totale (s)').listen().disable()
  a.add({ jouer }, 'jouer').name("▶ Jouer l'arrivée seule")
  const p = pos.addFolder('Portes')
  p.add(params.portes, 'ouverture', 0, 1, 0.001).name('Ouverture').listen().onChange(setOuverture)

  // ---- Éclairage du métro ----
  const ecl = gui.addFolder('Éclairage du métro')
  if (MP89) {
    const lr = ecl.addFolder('Lustres (vraies lumières)')
    lr.add(params.lustresReels, 'actif').name('Allumés').onChange(majLustres)
    lr.add(params.lustresReels, 'intensite', 0, 200, 0.5).name('Intensité (par lustre)').onChange(majLustres)
    lr.addColor(params.lustresReels, 'couleur').name('Couleur').onChange(majLustres)
    lr.add(params.lustresReels, 'ombres').name('Ombres portées (coûteux)').onChange(majLustres)
  }
  const e = ecl.addFolder('Lumière de la station (env map)')
  e.add(params.lumieres, 'reflets', 0, 3, 0.05).name('Intensité générale').onChange(update)
  e.add(params.lumieres, 'station', 0, 3, 0.05).name('Murs et voûte').onChange(majEnv)
  e.add(params.lumieres, 'lustres', 0, 5, 0.05).name('Lustres dans les reflets').onChange(majEnv)
  e.addColor(params.lumieres, 'lustresCouleur').name('Teinte des lustres').onChange(majEnv)
  if (MP89) e.add(params.lustresReels, 'envDiffus', 0, 1, 0.01).name('Lumière diffuse gardée').onChange(majLustres)
  e.add(params.lumieres, 'clarte', 0.5, 2.5, 0.05).name('Clarté de la carrosserie').onChange(update)
  const o = ecl.addFolder('Ombres bakées dans les creux (AO)')
  o.add(params.lumieres, 'ao', 0, 2, 0.05).name('Extérieur (1 : calculé)').onChange(update)
  o.add(params.lumieres, 'aoInterieur', 0, 4, 0.05).name('Intérieur (1 : baké, plus : creux plus sombres)').onChange(update)
  const ph = ecl.addFolder('Phares')
  ph.add(params.lumieres, 'phares', 0, 20, 0.1).name('Intensité')
  ph.add(params.lumieres, 'glare', 0, 3, 0.05).name('Éblouissement').onChange(update)

  // ---- Matières ----
  const M = params.matieres
  const reglerMatiere = (f, p) => {
    if ('couleur' in p) f.addColor(p, 'couleur').name('Couleur').onChange(appliquerMatieres)
    f.add(p, 'rugosite', 0, 1, 0.01).name('Rugosité (0 : lisse)').onChange(appliquerMatieres)
    if ('metal' in p) f.add(p, 'metal', 0, 1, 0.01).name('Métal').onChange(appliquerMatieres)
    f.add(p, 'reflets', 0, 5, 0.05).name('Reflets de la station').onChange(appliquerMatieres)
    if ('vernis' in p) {
      f.add(p, 'vernis', 0, 1, 0.01).name('Vernis').onChange(appliquerMatieres)
      f.add(p, 'vernisRugosite', 0, 1, 0.01).name('Rugosité du vernis').onChange(appliquerMatieres)
    }
    if ('opacite' in p) f.add(p, 'opacite', 0, 1, 0.01).name('Opacité').onChange(appliquerMatieres)
  }
  if (MP89) {
    const mg = gui.addFolder('Matières extérieures')
    const choix = { Aucun: 'aucun', ...Object.fromEntries(Object.entries(GROUPES).map(([g, { label }]) => [label, g])) }
    mg.add(M, 'reperer', choix).name('Repérer en cyan').onChange(appliquerMatieres)
    for (const [g, { label }] of Object.entries(GROUPES)) {
      if (g === 'interieur') continue
      const f = mg.addFolder(label)
      reglerMatiere(f, M[g])
      if (g === 'vitres') f.add(params.lumieres, 'vitres', 0, 6, 0.05).name('Reflets côté quai').onChange(update)
    }
  } else {
    gui.add(params.lumieres, 'vitres', 0, 6, 0.05).name('Reflets des vitres').onChange(update)
  }

  // ---- Intérieur de la rame ----
  const int = gui.addFolder('Intérieur de la rame')
  if (MP89) {
    const pl = int.addFolder('Plastique (parois, sièges)')
    reglerMatiere(pl, M.interieur)
  }
  int.add(params.lumieres, 'plafonniers', 0, 10, 0.1).name('Plafonniers').onChange(update)
  if (MP89) {
    const bd = int.addFolder('Bandeaux en vraies lumières (ombres)')
    bd.add(params.bandeaux, 'actifs').name('Allumés').onChange(majBandeaux)
    bd.add(params.bandeaux, 'intensite', 0, 30, 0.1).name('Intensité (candelas)').onChange(majBandeaux)
    bd.add(params.bandeaux, 'angle', 20, 89, 1).name('Ouverture (°)').onChange(majBandeaux)
    bd.add(params.bandeaux, 'flou', 0, 1, 0.01).name('Bord du faisceau (flou)').onChange(majBandeaux)
  }
  int.add(params.lumieres, 'lumierePlafonniers', 0, 1, 0.01).name('Lumière des plafonniers').onChange(update)
  int.add(params.lumieres, 'interieur', 0, 4, 0.05).name('Clarté de l\'intérieur').onChange(update)
  if (MP89) {
    const so = int.addFolder('Sol (linoléum)')
    so.addColor(params.sol, 'couleur').name('Couleur').onChange(majSol)
    so.add(params.sol, 'motif', 0, 2, 0.01).name('Nuances du lino').onChange(majSol)
    so.add(params.sol, 'rugosite', 0, 1, 0.01).name('Rugosité (0 : lisse)').onChange(majSol)
    so.add(params.sol, 'rugositeVariation', 0, 2, 0.01).name('Variations de brillance').onChange(majSol)
    so.add(params.sol, 'relief', 0, 3, 0.01).name('Relief').onChange(majSol)
    so.add(params.sol, 'ao', 0, 1, 0.01).name('Ombre des micro-creux (AO)').onChange(majSol)
    so.add(params.sol, 'reflet', 0, 3, 0.01).name('Reflet des bandeaux').onChange(majSol)
    const ve = int.addFolder('Assises (velours)')
    ve.add(params.velours, 'motif', 0, 2, 0.01).name('Nuances du velours').onChange(majVelours)
    ve.add(params.velours, 'rugosite', 0, 1, 0.01).name('Rugosité').onChange(majVelours)
    ve.add(params.velours, 'rugositeVariation', 0, 2, 0.01).name('Variations de brillance').onChange(majVelours)
    ve.add(params.velours, 'relief', 0, 3, 0.01).name('Relief').onChange(majVelours)
    ve.add(params.velours, 'ao', 0, 1, 0.01).name('Ombre des fibres (AO)').onChange(majVelours)
    ve.add(params.velours, 'taille', 0.05, 1, 0.01).name('Taille du motif (m)').onChange(majVelours)
    ve.add(params.velours, 'lustre', 0, 2, 0.01).name('Lustre vu de biais (sheen)').onChange(majVelours)
    ve.add(params.velours, 'lustreRugosite', 0, 1, 0.01).name('Étalement du lustre').onChange(majVelours)
    for (const [nom, label] of [['plastique', 'Plastique (parois, cadres, plafond)'], ['caoutchouc', 'Caoutchouc (soufflet, joints)'], ['metal', 'Métal (barres, poignées)']]) {
      const f = int.addFolder(label)
      const p = params.textures[nom]
      f.add(p, 'motif', 0, 2, 0.01).name('Nuances').onChange(majTextures)
      f.add(p, 'rugositeVariation', 0, 2, 0.01).name('Variations de brillance').onChange(majTextures)
      f.add(p, 'relief', 0, 3, 0.01).name('Relief').onChange(majTextures)
      f.add(p, 'ao', 0, 1, 0.01).name('Ombre des creux (AO)').onChange(majTextures)
      f.add(p, 'taille', 0.05, 2, 0.01).name('Taille du motif (m)').onChange(majTextures)
    }
    so.add(params.sol, 'taille', 0.5, 4, 0.05).name('Taille du motif (m)').onChange(majSol)
  }

  // ---- Image finale ----
  const img = gui.addFolder('Image finale')
  img.add(params.lumieres, 'exposition', 0.2, 3, 0.05).name('Exposition du métro')
  img.add(params.lumieres, 'tonemapping', { Neutral: 0, ACES: 1, AgX: 2, Reinhard: 3 }).name('Tone mapping du métro')
  img.add(params.rendu, 'saturation', 0, 3, 0.01).name('Saturation du métro')
  img.add(params.rendu, 'saturationImage', 0, 2, 0.01).name('Saturation de toute l\'image')
  img.add(params.rendu, 'halo', 0, 2, 0.01).name('Halo de lumière (lens glare)')
  img.add(params.rendu, 'seuil', 0, 3, 0.01).name('Seuil du halo')
  img.add(params.rendu, 'rayon', 0.5, 6, 0.1).name('Étendue du halo')
  img.add(params.rendu, 'grain', 0, 0.2, 0.005).name('Grain')
}
