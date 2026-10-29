import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'

// Le métro : le tram rose (survey/scene2/metro/tram_rose.blend, exporté en public/scene2/tram.glb,
// textures 2048 px en WebP). Contrairement à la station, dont la lumière est cuite dans les textures,
// le métro est éclairé en direct : les lumières ci-dessous ne touchent que lui.

// Position d'arrêt réglée à l'œil dans le panneau (28/10). Le tram est modélisé dans l'axe x : tourné de 90°.
// Le métro arrive du tunnel, derrière le mur du fond (z = 0), et avance vers les z négatifs.
export const params = {
  // porte : numéro de la porte placée pile au centre de l'écran en fin de rotation (0 : position libre, z)
  train: { x: 2.275, y: -0.47, z: -35.825, rotation: 90, echelle: 1.25, porte: 4 },
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
    ambiance: 0, // lumières génériques en plus de la station (coupées : la station éclaire seule)
    ambianceCouleur: '#ffe4ee',
    principale: 0,
    principaleCouleur: '#fff1f5',
    azimut: 60, // direction de la lumière principale, en degrés autour du métro
    hauteur: 50, // en degrés au-dessus de l'horizon
    phares: 10, // intensité des feux avant et arrière
    glare: 1, // éblouissement des phares dans l'objectif (halo, traînée, étoile)
    clarte: 1.3, // éclaircit toute la carrosserie (1 : lumière de la station seule)
    exposition: 1, // tone mapping Neutral du métro (garde les couleurs) : plus haut, plus lumineux
  },
}

export const group = new THREE.Group()
const ambient = new THREE.AmbientLight()
const sun = new THREE.DirectionalLight()
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
let demiLongueur = 0 // demi-longueur du tram, avant mise à l'échelle
let boiteLocale = null // boîte du tram dans son propre repère
let cameraZ = null // position de la caméra le long du quai : le centre de l'écran, en fin de rotation, vise ce z

// Milieu de chaque porte côté quai, le long du tram (en m, dans tram_rose.blend), de la cabine avant
// (la petite porte, n° 1) à la cabine arrière
const PORTES = [20.3009, 13.5022, 9.9669, 1.7676, -1.7676, -9.9669, -13.5022, -20.3009]

export function setCameraZ(z) { cameraZ = z; update() }

// ---------- Env map recombinée ----------
let envScene = null, envRenderer = null, envPmrem = null, envRT = null
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
    ancien?.dispose()
  }, 60)
}

const refletVitre = new THREE.MeshStandardMaterial({
  color: 0x000000, roughness: 0.03, metalness: 0, envMapIntensity: params.lumieres.vitres,
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
})

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

// Bas de caisse : dans la texture (rangée à l'envers), c'est la bande grise en haut de chaque rangée de
// panneaux. On la passe dans le prune du nez, en gardant ses détails : les gris neutres seulement.
const PRUNE = [116, 45, 85]
const BAS_DE_CAISSE = [ // en coordonnées 0 à 1 depuis le haut : u max, v min, v max
  [0.62, 0, 0.036], [0.718, 0.193, 0.228], [0.458, 0.389, 0.423],
]
function basDeCaisse(image) {
  const N = N_CADRE, { c, g } = canevas(N, image), d = g.getImageData(0, 0, N, N), p = d.data
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
const N_CADRE = 2048
function cadres(m, image) {
  const N = N_CADRE, base = canevas(N, image), d = base.g.getImageData(0, 0, N, N), p = d.data
  const noir = new Float32Array(N * N)
  for (let i = 0; i < N * N; i++) noir[i] = estNoir(p[4 * i], p[4 * i + 1], p[4 * i + 2]) ? 1 : 0
  const marbre = bruitDoux(N, 48), grain = bruitDoux(N, 700)
  // Couleur : noir plastique un peu chaud, jamais à 0
  for (let i = 0; i < N * N; i++) {
    if (!noir[i]) continue
    const n = 34 + 14 * (marbre[i] - 0.5) + 8 * (grain[i] - 0.5)
    p[4 * i] = n + 1; p[4 * i + 1] = n; p[4 * i + 2] = n + 1
  }
  base.g.putImageData(d, 0, 0)
  // Relief : le cadre est une bande bombée, plus haute que la vitre et que la caisse
  const h = flou(noir, N, 3)
  const nm = canevas(N, m.normalMap.image), dn = nm.g.getImageData(0, 0, N, N), q = dn.data
  const FORCE = 3
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    const i = y * N + x
    const dx = h[i + 1] - h[i - 1], dy = h[i + N] - h[i - N]
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
const PHARES = [new THREE.Vector3(22.1, 1.02, -0.95), new THREE.Vector3(22.1, 1.02, 0.95)]
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
const COULISSE = 0.73 // m
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
  scene.add(group, ambient, sun, sun.target)

  // Reflets et lumière d'ambiance : la station vue à 360° depuis la place du train (survey/scene2/quai.blend,
  // collection « EnvMap (test) ») : la moitié côté tunnel, recopiée en miroir derrière, le trou au-dessus
  // de la caméra comblé par la voûte d'en face, et une lumière sur chaque boule des lustres.
  // La station n'est pas concernée : ses matériaux ignorent la lumière.
  // Elle existe en deux versions, avec et sans les lustres : leur différence est la lumière des lustres seule,
  // dosée et teintée dans le panneau. Les deux sont recombinées puis préparées pour les reflets (PMREM).
  envScene = scene
  envRenderer = renderer
  const loader = new HDRLoader(manager)
  loader.load('scene2/envmap.hdr', (t) => { envMat.uniforms.tFull.value = t; majEnv() })
  loader.load('scene2/envmap_base.hdr', (t) => { envMat.uniforms.tBase.value = t; majEnv() })

  new GLTFLoader(manager).load(`scene2/tram.glb?v=${Date.now()}`, (gltf) => {
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
      if (m.map) m.anisotropy = renderer.capabilities.getMaxAnisotropy()
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
        m.aoMap = m.roughnessMap // intérieur : même carte ORM (occlusion dans le rouge)
        aoMats.push(m)
      }
    }
    gltf.scene.traverse((o) => { if (o.isMesh && remplace.has(o.material)) o.material = remplace.get(o.material) })
    for (const m of new Set([...mats].map((m) => remplace.get(m) || m))) if (m.emissiveMap) lit.push(m)
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
  ambient.intensity = l.ambiance
  ambient.color.set(l.ambianceCouleur)
  sun.intensity = l.principale
  sun.color.set(l.principaleCouleur)
  const az = THREE.MathUtils.degToRad(l.azimut), el = THREE.MathUtils.degToRad(l.hauteur)
  sun.target.position.copy(group.position)
  sun.position.copy(group.position).add(new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).multiplyScalar(20))
  for (const m of lit) m.emissiveIntensity = l.phares * eclat
  for (const m of aoMats) m.aoMapIntensity = l.ao
  refletVitre.envMapIntensity = l.vitres
  bordOuv.uClarte.value = l.clarte
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
  const t = gui.addFolder('Train')
  t.add(params.train, 'x', -3, 5, 0.005).name('Gauche / droite').onChange(update)
  t.add(params.train, 'y', -3, 1, 0.005).name('Hauteur').onChange(update)
  const portes = { Libre: 0, '1 (petite, cabine)': 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, '8 (cabine arrière)': 8 }
  t.add(params.train, 'porte', portes).name('Porte au centre').listen().onChange(update)
  t.add(params.train, 'z', -70, 40, 0.005).name('Le long du quai (arrêt)').listen()
    .onChange(() => { params.train.porte = 0; update() }) // bouger le curseur repasse en position libre
  t.add(params.train, 'rotation', -180, 180, 0.5).name('Rotation (°)').onChange(update)
  t.add(params.train, 'echelle', 1, 2.5, 0.005).name('Échelle').onChange(update)

  const a = gui.addFolder('Arrivée')
  a.add(params.arrivee, 'avancee', 0, 1, 0.001).name('Avancée').listen().onChange(update)
  a.add(params.arrivee, 'vitesse', 20, 80, 1).name('Vitesse d\'entrée (km/h)').onChange(update)
  a.add(params.arrivee, 'recul', 0, 30, 1).name('Recul à l\'arrêt (cm)').onChange(update)
  a.add(params.arrivee, 'stabilisation', 0.3, 3, 0.1).name('Durée du balancement (s)').onChange(update)
  a.add(params.arrivee, 'duree').name('Durée totale (s)').listen().disable()
  a.add({ jouer }, 'jouer').name("▶ Jouer l'arrivée seule")

  const p = gui.addFolder('Portes')
  p.add(params.portes, 'ouverture', 0, 1, 0.001).name('Ouverture').listen().onChange(setOuverture)

  const e = gui.addFolder('Lumière de la station (env map)')
  e.add(params.lumieres, 'reflets', 0, 3, 0.05).name('Intensité générale').onChange(update)
  e.add(params.lumieres, 'station', 0, 3, 0.05).name('Murs et voûte').onChange(majEnv)
  e.add(params.lumieres, 'lustres', 0, 5, 0.05).name('Lustres').onChange(majEnv)
  e.addColor(params.lumieres, 'lustresCouleur').name('Teinte des lustres').onChange(majEnv)
  e.add(params.lumieres, 'exposition', 0.2, 3, 0.05).name('Exposition métro')
  e.add(params.lumieres, 'ao', 0, 2, 0.05).name('Ombres dans les creux (AO)').onChange(update)
  e.add(params.lumieres, 'vitres', 0, 6, 0.05).name('Reflets des vitres').onChange(update)
  e.add(params.lumieres, 'clarte', 0.5, 2.5, 0.05).name('Clarté de la carrosserie').onChange(update)

  const l = gui.addFolder('Lumières directes')
  l.close()
  l.add(params.lumieres, 'ambiance', 0, 3, 0.05).name('Ambiance').onChange(update)
  l.addColor(params.lumieres, 'ambianceCouleur').name('Couleur ambiance').onChange(update)
  l.add(params.lumieres, 'principale', 0, 6, 0.05).name('Principale').onChange(update)
  l.addColor(params.lumieres, 'principaleCouleur').name('Couleur principale').onChange(update)
  l.add(params.lumieres, 'azimut', -180, 180, 1).name('Direction (°)').onChange(update)
  l.add(params.lumieres, 'hauteur', 0, 90, 1).name('Hauteur (°)').onChange(update)
  l.add(params.lumieres, 'phares', 0, 20, 0.1).name('Phares')
  l.add(params.lumieres, 'glare', 0, 3, 0.05).name('Éblouissement phares').onChange(update)
}
