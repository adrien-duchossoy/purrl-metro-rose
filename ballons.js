import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { params as rp, PORTES, ouvertureVantail } from './rame.js'

// Ballons en aluminium (foil) qui remplissent la rame et débordent sur le quai à l'ouverture des portes.
// Modèle : ~/Downloads/Balloon.obj, allégé dans Blender (1 100 triangles, ruban retiré), public/scene2/ballon.glb,
// diamètre 1, centré sur l'origine.
// Tout est calculé dans le repère du métro (enfants de rame.group) : x le long du train, y vers le haut,
// z vers le quai. Les ballons suivent le train pendant son arrivée.
// Chaque ballon est une petite sphère qui flotte (ou tombe, s'il est dégonflé), freinée par l'air, et repoussée
// par ses voisins. Serrés dans la rame, ils se poussent vers les portes ouvertes et se répandent sur le quai.
// La souris (ou le doigt) pousse ceux qui sont sur le quai.
// Quand plus rien ne bouge, le calcul s'arrête et l'image n'est plus redessinée (cache de scene2.js).

export const params = {
  actifs: true,
  nombre: 700,
  taille: 0.5, // diamètre du corps, en m du repère du métro (× 1,435 à l'écran : 72 cm)
  rose: '#f7cfdc', // rose pastel, proche de la caisse
  bleu: '#cfe2f2', // bleu pastel, proche du filet sous les fenêtres (#d0dee4)
  argent: '#e6e9ee', // presque neutre, à peine froid : la station rose réchauffait l'aluminium jusqu'au doré
  argentClarte: 2.4, // l'argent reflète la station en gris : un peu plus clair pour rester brillant
  argentRugosite: 0.15, // l'argent a sa propre matière : vrai métal, sans éclat de couleur (sinon il passait pour du bleu)
  rugosite: 0.22,
  metal: 0.55, // 1 : tout vient des reflets (couleurs sombres) ; plus bas, la couleur propre du ballon ressort
  lueur: 0.3, // éclat propre de la couleur, indépendant de la lumière : des pastels lumineux même dans la rame
  refletsRame: 1, // reflets de la station sur les ballons restés dans la rame (sombre)
  refletsQuai: 1,
  debit: 2.6, // m/s : vitesse à laquelle les ballons sortent par les portes
  main: 1, // force de la souris ou du doigt
  montee: 1.2, // m/s² : montée des ballons sur le quai, vers la voûte (tous, même les dégonflés)
  freinage: 1.6, // résistance de l'air
  graine: 7,
}

// ---------- Repères mesurés dans mp89.glb et station.glb (repère du métro) ----------
const SOL = -0.026 // plancher de la rame, et aussi du quai (y 0 de la station)
const TOIT = 1.99 // plafond au milieu de l'allée
const X_MIN = -13.0, X_MAX = 11.6 // intérieur des deux voitures, soufflet compris
const Z_INT = 1.107 // paroi intérieure, côté quai (symétrique de l'autre côté)
const Z_EXT = 1.258 // face extérieure de la caisse, au bord du quai
const Z_MUR = (Z_INT + Z_EXT) / 2
const HAUT_PORTE = 1.789
const DEMI_PORTE = 0.8 // demi-largeur de la baie, portes ouvertes
const QUAI_FOND = 6.2 // mur du fond du quai
const QUAI_HAUT = 3.5 // sous la voûte
const QUAI_X = 25
// Demi-largeur de la rame selon la hauteur : les parois se resserrent vers le plafond (porte-bagages, bandeaux)
const PROFIL = [[-0.1, 1.107], [1.3, 1.107], [1.6, 0.836], [1.8, 0.593], [1.9, 0.481], [2.1, 0.481]]
function demiLargeur(y) {
  if (y <= PROFIL[0][0]) return PROFIL[0][1]
  for (let i = 1; i < PROFIL.length; i++) {
    const [y1, w1] = PROFIL[i]
    if (y <= y1) { const [y0, w0] = PROFIL[i - 1]; return w0 + ((w1 - w0) * (y - y0)) / (y1 - y0) }
  }
  return PROFIL.at(-1)[1]
}

// Hasard reproductible : même graine, mêmes ballons
function hasard(graine) {
  let a = graine >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- Matières ----------
// Aluminium : métal lisse dont la couleur teinte les reflets. Dans la rame, les ballons reflètent moins
// la station (comme les autres matières de l'intérieur) ; sur le quai, pleinement.
// Seuls les deux lustres de la station les éclairent (rangés en premier par Three.js, voir rame.js), pas les spots
// des bandeaux : allumés à l'ouverture des portes, ils figeaient des taches de lumière sur les ballons
const lustresSeuls = THREE.ShaderChunk.lights_fragment_begin.replace('for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ )', 'for ( int i = 0; i < 2; i ++ )')
const uLueur = { value: params.lueur }
const uRame = { value: params.refletsRame }, uQuai = { value: params.refletsQuai }
function reflets(m, cle, lueur, gris = { value: 0 }, clarte = { value: 1 }) {
  m.onBeforeCompile = (s) => {
    s.uniforms.uRefletsRame = uRame
    s.uniforms.uRefletsQuai = uQuai
    s.uniforms.uLueur = lueur
    s.uniforms.uGris = gris
    s.uniforms.uClarte = clarte
    s.vertexShader = 'varying float vDedans;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vDedans = 1.0 - smoothstep(${(Z_INT - 0.05).toFixed(3)}, ${(Z_EXT + 0.05).toFixed(3)}, instanceMatrix[3].z);
      #else
        vDedans = 0.0;
      #endif`)
    s.fragmentShader = 'uniform float uRefletsRame, uRefletsQuai, uLueur, uGris, uClarte;\nvarying float vDedans;\n' + s.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += diffuseColor.rgb * uLueur;`).replace('#include <aomap_fragment>', `#include <aomap_fragment>
      float kReflets = mix(uRefletsQuai, uRefletsRame, vDedans);
      reflectedLight.indirectDiffuse *= kReflets;
      reflectedLight.indirectSpecular *= kReflets;
      // Argent : la station rose se reflète en gris (sa luminosité seule), sinon l'alu prend sa couleur
      vec3 luma = vec3(0.2126, 0.7152, 0.0722);
      reflectedLight.indirectSpecular = mix(reflectedLight.indirectSpecular, vec3(dot(reflectedLight.indirectSpecular, luma)), uGris) * uClarte;
      reflectedLight.directSpecular = mix(reflectedLight.directSpecular, vec3(dot(reflectedLight.directSpecular, luma)), uGris) * uClarte;`).replace('#include <lights_fragment_begin>', lustresSeuls)
  }
  m.customProgramCacheKey = () => cle
}
const matCorps = new THREE.MeshStandardMaterial({ metalness: params.metal, roughness: params.rugosite })
const matArgent = new THREE.MeshStandardMaterial({ metalness: 1, roughness: params.argentRugosite })
reflets(matCorps, 'ballon_corps', uLueur)
const uArgentClarte = { value: params.argentClarte }
reflets(matArgent, 'ballon_argent', { value: 0.1 }, { value: 1 }, uArgentClarte) // un léger éclat gris : jamais noir dans les creux

// ---------- État ----------
let racine = null, geoCorps = null, camera = null
let n = 0
let px, py, pz, vx, vy, vz, rad, flotte, lacet, tourne, penteX, penteZ, voisins, ech, sorti
// Caméra dans le repère du métro : les ballons ne la traversent pas
const cam = new THREE.Vector3(1e6, 0, 0), camAvant = new THREE.Vector3(Infinity, 0, 0)
const RAYON_CAM = 0.35
let tranches = [] // { corps, ids } : un InstancedMesh par tranche de 2 m, pour écarter ceux hors du champ
let eveil = 0 // images restantes avant de s'endormir
let changement = false
let ouvAvant = -1
let tAvant = null

// Grille de voisinage : une case vaut au moins la distance d'interaction entre deux des plus gros ballons
let CASE = 0.36, NX = 1, NY = 1, NZ = 1
let tete = new Int32Array(1)
const GX0 = -QUAI_X, GY0 = SOL - 0.1, GZ0 = -1.3
function grille() {
  CASE = Math.max(0.2, 2 * 0.42 * params.taille * 1.15 * 1.1)
  NX = Math.ceil((2 * QUAI_X) / CASE); NY = Math.ceil((QUAI_HAUT + 0.3) / CASE); NZ = Math.ceil((QUAI_FOND + 1.4) / CASE)
  tete = new Int32Array(NX * NY * NZ)
}
let suivant = new Int32Array(0)
const caseDe = (x, y, z) => {
  const i = Math.min(NX - 1, Math.max(0, ((x - GX0) / CASE) | 0))
  const j = Math.min(NY - 1, Math.max(0, ((y - GY0) / CASE) | 0))
  const k = Math.min(NZ - 1, Math.max(0, ((z - GZ0) / CASE) | 0))
  return [i, j, k]
}

export function load(parent, manager, cam) {
  camera = cam
  racine = new THREE.Group()
  racine.name = 'ballons'
  parent.add(racine)
  const loader = new GLTFLoader(manager)
  loader.setDRACOLoader(new DRACOLoader(manager).setDecoderPath('draco/'))
  loader.load(`scene2/ballon.glb?v=${Date.now()}`, (gltf) => {
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return
      if (o.name.startsWith('corps')) geoCorps = o.geometry
    })
    construire()
  })
}

// (Re)crée tous les ballons, serrés dans la rame, portes fermées
export function construire() {
  if (!racine || !geoCorps) return
  for (const t of tranches) { racine.remove(t.corps); t.corps.dispose() }
  tranches = []
  racine.visible = params.actifs
  n = params.actifs ? params.nombre : 0
  px = new Float32Array(n); py = new Float32Array(n); pz = new Float32Array(n)
  vx = new Float32Array(n); vy = new Float32Array(n); vz = new Float32Array(n)
  rad = new Float32Array(n); flotte = new Float32Array(n); ech = new Float32Array(n)
  lacet = new Float32Array(n); tourne = new Float32Array(n); penteX = new Float32Array(n); penteZ = new Float32Array(n)
  voisins = new Uint8Array(n)
  sorti = new Uint8Array(n) // passé sur le quai : il ne rentre plus
  suivant = new Int32Array(n)
  grille()
  const h = hasard(params.graine)
  const couleurs = [params.rose, params.bleu, params.argent].map((c) => new THREE.Color(c))
  const teinte = []
  const genre = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    ech[i] = params.taille * (0.85 + 0.3 * h())
    rad[i] = 0.42 * ech[i] // le corps est un disque épais : un peu moins que son rayon
    px[i] = X_MIN + 0.2 + h() * (X_MAX - X_MIN - 0.4)
    py[i] = 0.3 + h() * (TOIT - 0.4)
    pz[i] = (h() * 2 - 1) * (demiLargeur(py[i]) - rad[i])
    // Trois sur quatre flottent à l'hélium, les autres, un peu dégonflés, tombent
    flotte[i] = h() < 0.75 ? 0.3 + 0.5 * h() : -(0.2 + 0.4 * h())
    lacet[i] = h() * Math.PI * 2
    tourne[i] = (h() - 0.5) * 1.5
    penteX[i] = (h() - 0.5) * 0.3; penteZ[i] = (h() - 0.5) * 0.3
    genre[i] = Math.floor(h() * 3) // 0 rose, 1 bleu, 2 argent
    const c = couleurs[genre[i]].clone()
    c.offsetHSL(0, 0, (h() - 0.5) * 0.06) // pas deux ballons tout à fait pareils
    teinte.push(c)
  }
  // Tranches de 2 m le long du train
  const LARGEUR = 2
  const nb = Math.ceil((X_MAX - X_MIN) / LARGEUR)
  // Une tranche pour les pastels, une pour l'argent (sa propre matière)
  const ids = Array.from({ length: nb * 2 }, () => [])
  for (let i = 0; i < n; i++) ids[Math.min(nb - 1, Math.floor((px[i] - X_MIN) / LARGEUR)) * 2 + (genre[i] === 2 ? 1 : 0)].push(i)
  for (const [b, liste] of ids.entries()) {
    if (!liste.length) continue
    const corps = new THREE.InstancedMesh(geoCorps, b % 2 ? matArgent : matCorps, liste.length)
    corps.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    corps.castShadow = false // 8 cartes d'ombre à redessiner sinon
    corps.receiveShadow = false
    liste.forEach((id, k) => corps.setColorAt(k, teinte[id]))
    racine.add(corps)
    tranches.push({ corps, ids: Int32Array.from(liste) })
  }
  // Les ballons se placent : quelques secondes de calcul d'avance, portes fermées
  for (let s = 0; s < 240; s++) pas(1 / 30, 0)
  for (let i = 0; i < n; i++) { vx[i] = vy[i] = vz[i] = 0 }
  poser()
  eveil = 0
  changement = true
}
export const reinit = construire

// Porte côté quai la plus proche
function porteProche(x) {
  let best = PORTES[0]
  for (const p of PORTES) if (Math.abs(p - x) < Math.abs(best - x)) best = p
  return best
}

function pas(dt, ouvert) {
  const p = params
  const frein = Math.exp(-p.freinage * dt)
  // Voisinage
  tete.fill(-1)
  for (let i = 0; i < n; i++) {
    const [a, b, c] = caseDe(px[i], py[i], pz[i])
    const k = (a * NY + b) * NZ + c
    suivant[i] = tete[k]
    tete[k] = i
  }
  voisins.fill(0)
  for (let i = 0; i < n; i++) {
    const [a, b, c] = caseDe(px[i], py[i], pz[i])
    for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) for (let dc = -1; dc <= 1; dc++) {
      const aa = a + da, bb = b + db, cc = c + dc
      if (aa < 0 || bb < 0 || cc < 0 || aa >= NX || bb >= NY || cc >= NZ) continue
      for (let j = tete[(aa * NY + bb) * NZ + cc]; j !== -1; j = suivant[j]) {
        if (j <= i) continue
        const dx = px[j] - px[i], dy = py[j] - py[i], dz = pz[j] - pz[i]
        const r = rad[i] + rad[j]
        const d2 = dx * dx + dy * dy + dz * dz
        if (d2 >= r * r * 1.21) continue
        if (voisins[i] < 255) voisins[i]++
        if (voisins[j] < 255) voisins[j]++
        if (d2 >= r * r || d2 < 1e-10) continue
        // Recouvrement : chacun recule de la moitié, et leur vitesse l'un vers l'autre est amortie
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, nz = dz / d
        const e = (r - d) * 0.5
        px[i] -= nx * e; py[i] -= ny * e; pz[i] -= nz * e
        px[j] += nx * e; py[j] += ny * e; pz[j] += nz * e
        const vr = (vx[j] - vx[i]) * nx + (vy[j] - vy[i]) * ny + (vz[j] - vz[i]) * nz
        if (vr < 0) {
          const q = vr * 0.5
          vx[i] += nx * q; vy[i] += ny * q; vz[i] += nz * q
          vx[j] -= nx * q; vy[j] -= ny * q; vz[j] -= nz * q
        }
      }
    }
  }
  const demiOuv = Math.min(DEMI_PORTE, ouvert)
  for (let i = 0; i < n; i++) {
    const r = rad[i]
    const dehors = pz[i] > Z_MUR
    // Flottaison (réduite sur le quai), et poussée des ballons serrés
    // Sur le quai, tous montent vers la voûte, un peu plus ou un peu moins vite selon leur gonflage
    let ax = 0, ay = dehors ? p.montee * (0.7 + 0.5 * Math.abs(flotte[i])) : flotte[i], az = 0
    // Écoulement par les portes ouvertes : chaque ballon tend vers une vitesse de sortie (sans à-coup : il y
    // arrive en moins d'une seconde). Tous sortent : la rame est vide en quelques secondes.
    if (demiOuv > r) {
      const ouv = THREE.MathUtils.smoothstep(demiOuv, r, DEMI_PORTE) // le flot grandit avec la baie
      const xp = porteProche(px[i])
      let dx, dy, dz, vise
      if (!dehors) {
        // Vers la porte la plus proche, à hauteur de passage. La flottaison est presque annulée pendant la
        // sortie, sinon les ballons du plafond restent coincés au-dessus de la baie
        ay -= flotte[i] * 0.85 * ouv
        dx = xp - px[i]; dz = Z_EXT + 0.4 - pz[i]; dy = Math.min(0, 1.0 - py[i])
        const l = Math.hypot(dx, dy, dz) || 1
        vise = p.debit * ouv
        dx /= l; dy /= l; dz /= l
      } else {
        // Sur le quai, ils dégagent la porte (jusqu'à 3 m) pour laisser passer les suivants
        dx = px[i] - xp; dz = pz[i] - Z_EXT; dy = 0
        const l = Math.hypot(dx, dz) || 1
        vise = p.debit * ouv * Math.max(0, 1 - l / 3)
        dx /= l; dz /= l
      }
      const manque = vise - (vx[i] * dx + vy[i] * dy + vz[i] * dz)
      if (manque > 0) { const a = manque * 2; ax += a * dx; ay += a * dy; az += a * dz }
    }
    vx[i] = (vx[i] + ax * dt) * frein
    vy[i] = (vy[i] + ay * dt) * frein
    vz[i] = (vz[i] + az * dt) * frein
    px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt

    // Parois
    let x = px[i], y = py[i], z = pz[i]
    if (y < SOL + r) { y = SOL + r; if (vy[i] < 0) vy[i] = 0; vx[i] *= 0.9; vz[i] *= 0.9 }
    const xp = porteProche(x)
    // Dans la baie d'une porte ouverte (un peu de marge en hauteur : il est ramené sous le linteau)
    const dansPorte = demiOuv > r && Math.abs(x - xp) < demiOuv - r && y < HAUT_PORTE - r + 0.1
    if (dansPorte && z > Z_INT - r && z < Z_EXT + r && y > HAUT_PORTE - r) { y = HAUT_PORTE - r; if (vy[i] > 0) vy[i] = 0 }
    if (z < -demiLargeur(y) + r) { z = -demiLargeur(y) + r; if (vz[i] < 0) vz[i] = 0 }
    if (!dansPorte && z > Z_INT - r && z < Z_EXT + r) {
      // Contre la caisse, hors d'une porte ouverte : rejeté du côté où il est
      if (z < Z_MUR) { z = Z_INT - r; if (vz[i] > 0) vz[i] = 0 } else { z = Z_EXT + r; if (vz[i] < 0) vz[i] = 0 }
    }
    if (z < Z_MUR) {
      // Dans la rame
      const w = demiLargeur(y) - r
      if (z > w && !(dansPorte && y < 1.3)) { z = w; if (vz[i] > 0) vz[i] = 0 }
      if (y > TOIT - r) { y = TOIT - r; if (vy[i] > 0) vy[i] = 0; vx[i] *= 0.9; vz[i] *= 0.9 }
      if (x < X_MIN + r) { x = X_MIN + r; if (vx[i] < 0) vx[i] = 0 }
      if (x > X_MAX - r) { x = X_MAX - r; if (vx[i] > 0) vx[i] = 0 }
      if (dansPorte && z > Z_INT - r) {
        // Dans la baie : tenu entre les montants
        x = THREE.MathUtils.clamp(x, xp - demiOuv + r, xp + demiOuv - r)
      }
    } else {
      // Sur le quai
      if (y > QUAI_HAUT - r) { y = QUAI_HAUT - r; if (vy[i] > 0) vy[i] = 0 }
      if (z > QUAI_FOND - r) { z = QUAI_FOND - r; if (vz[i] > 0) vz[i] = 0 }
      x = THREE.MathUtils.clamp(x, -QUAI_X + r, QUAI_X - r)
      if (z < Z_EXT + r && dansPorte) x = THREE.MathUtils.clamp(x, xp - demiOuv + r, xp + demiOuv - r)
    }
    // Une fois sur le quai, il ne rentre plus dans la rame
    if (z > Z_EXT + r) sorti[i] = 1
    else if (sorti[i]) { z = Z_EXT + r; if (vz[i] < 0) vz[i] = 0 }
    // La caméra : une bulle que les ballons contournent (on ne se retrouve jamais dans un ballon)
    const cx = x - cam.x, cy = y - cam.y, cz = z - cam.z, rc = RAYON_CAM + r
    const d2 = cx * cx + cy * cy + cz * cz
    if (d2 < rc * rc) {
      const d = Math.sqrt(d2) || 1e-3, nx = cx / d, ny = cy / d, nz = cz / d
      x = cam.x + nx * rc; y = cam.y + ny * rc; z = cam.z + nz * rc
      const vn = vx[i] * nx + vy[i] * ny + vz[i] * nz
      if (vn < 0) { vx[i] -= vn * nx; vy[i] -= vn * ny; vz[i] -= vn * nz }
    }
    px[i] = x; py[i] = y; pz[i] = z
  }
}

// Matrices des instances
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eul = new THREE.Euler(0, 0, 0, 'YXZ')
const pos = new THREE.Vector3(), sc = new THREE.Vector3()
function poser() {
  for (const t of tranches) {
    t.ids.forEach((i, k) => {
      eul.set(penteX[i] + THREE.MathUtils.clamp(vz[i] * 0.6, -0.5, 0.5), lacet[i], penteZ[i] - THREE.MathUtils.clamp(vx[i] * 0.6, -0.5, 0.5))
      q.setFromEuler(eul)
      pos.set(px[i], py[i], pz[i])
      sc.setScalar(ech[i])
      m4.compose(pos, q, sc)
      t.corps.setMatrixAt(k, m4)
    })
    t.corps.instanceMatrix.needsUpdate = true
    t.corps.computeBoundingSphere()
  }
}

// À chaque image (scene2.js). Calcul seulement si les portes bougent ou si des ballons bougent encore.
export function update(now = performance.now()) {
  const dt = tAvant === null ? 0 : Math.min(1 / 30, (now - tAvant) / 1000)
  tAvant = now
  if (!n || !dt) return
  const ouvert = ouvertureVantail()
  if (ouvert !== ouvAvant) { ouvAvant = ouvert; eveil = Math.max(eveil, 90) }
  if (toucher(dt)) eveil = Math.max(eveil, 90)
  // La caméra a bougé et frôle des ballons : on recalcule
  if (camera) {
    racine.updateMatrixWorld()
    cam.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(versLocal.copy(racine.matrixWorld).invert())
    if (cam.distanceToSquared(camAvant) > 1e-8) {
      camAvant.copy(cam)
      for (let i = 0; i < n; i++) {
        const rc = RAYON_CAM + rad[i] + 0.05
        if ((px[i] - cam.x) ** 2 + (py[i] - cam.y) ** 2 + (pz[i] - cam.z) ** 2 < rc * rc) { eveil = Math.max(eveil, 90); break }
      }
    }
  }
  if (eveil <= 0) return
  // Deux demi-pas quand ça va vite : les ballons ne passent pas les uns à travers les autres
  const sous = vmaxAvant > 1.5 ? 2 : 1
  for (let s = 0; s < sous; s++) pas(dt / sous, ouvert)
  let vmax = 0
  for (let i = 0; i < n; i++) {
    const v2 = vx[i] * vx[i] + vy[i] * vy[i] + vz[i] * vz[i]
    if (v2 > vmax) vmax = v2
    lacet[i] += tourne[i] * dt * Math.min(1, Math.sqrt(v2) * 4)
  }
  vmaxAvant = Math.sqrt(vmax)
  poser()
  changement = true
  // Encore en mouvement : on continue ; sinon, une seconde et demie plus tard, on s'arrête
  if (vmax > 0.02 * 0.02) eveil = Math.max(eveil, 90)
  else eveil--
}

let vmaxAvant = 0

// ---------- Souris et doigt : les ballons du quai sous le pointeur suivent un peu le geste ----------
const pointeur = { x: 0, y: 0, actif: false, bouge: false }
addEventListener('pointermove', (e) => {
  pointeur.x = (e.clientX / innerWidth) * 2 - 1
  pointeur.y = -(e.clientY / innerHeight) * 2 + 1
  pointeur.bouge = true
})
addEventListener('pointerdown', (e) => {
  pointeur.x = (e.clientX / innerWidth) * 2 - 1
  pointeur.y = -(e.clientY / innerHeight) * 2 + 1
  pointeur.actif = false // pas de saut depuis l'ancienne position
  pointeur.bouge = true
})
const finDoigt = (e) => { if (e.pointerType !== 'mouse') pointeur.actif = false }
addEventListener('pointerup', finDoigt)
addEventListener('pointercancel', finDoigt)
document.addEventListener('pointerleave', () => (pointeur.actif = false))

const rayon = new THREE.Ray(), rayonAvant = new THREE.Ray(), versLocal = new THREE.Matrix4()
const _p = new THREE.Vector3()
const RAYON_MAIN = 0.4 // m du repère du métro autour du pointeur
let touches = new Int32Array(0), touchesT = new Float32Array(0)
function toucher(dt) {
  if (!camera || !n || !pointeur.bouge) return false
  pointeur.bouge = false
  camera.updateMatrixWorld()
  racine.updateMatrixWorld()
  versLocal.copy(racine.matrixWorld).invert()
  rayon.origin.setFromMatrixPosition(camera.matrixWorld)
  rayon.direction.set(pointeur.x, pointeur.y, 0.5).applyMatrix4(camera.projectionMatrixInverse).applyMatrix4(camera.matrixWorld).sub(rayon.origin)
  rayon.applyMatrix4(versLocal)
  rayon.direction.normalize()
  const avant = pointeur.actif
  pointeur.actif = true
  if (!avant) { rayonAvant.copy(rayon); return false }
  if (touches.length < n) { touches = new Int32Array(n); touchesT = new Float32Array(n) }
  // Ballons sous le pointeur ; seuls ceux du premier plan (moins d'un mètre derrière le plus proche) sont poussés
  let nb = 0, tmin = Infinity
  const o = rayon.origin, d = rayon.direction
  for (let i = 0; i < n; i++) {
    if (pz[i] < Z_MUR) continue // dans le métro : la main ne les atteint pas
    const wx = px[i] - o.x, wy = py[i] - o.y, wz = pz[i] - o.z
    const t = wx * d.x + wy * d.y + wz * d.z
    if (t < 0.05) continue
    const r = RAYON_MAIN + rad[i]
    if (wx * wx + wy * wy + wz * wz - t * t > r * r) continue
    touches[nb] = i; touchesT[nb] = t; nb++
    if (t < tmin) tmin = t
  }
  let touche = false
  for (let k = 0; k < nb; k++) {
    const i = touches[k], t = touchesT[k]
    if (t > tmin + 1) continue
    // Déplacement du pointeur à cette distance, entre l'image précédente et celle-ci
    rayon.at(t, _p)
    const mx = _p.x, my = _p.y, mz = _p.z
    rayonAvant.at(t, _p)
    let gx = (mx - _p.x) / dt, gy = (my - _p.y) / dt, gz = (mz - _p.z) / dt
    const g = Math.hypot(gx, gy, gz)
    if (g < 0.05) continue
    // Comme une main qui effleure un ballon : il prend au plus une partie de la vitesse de la main (1,2 m/s
    // au plus), progressivement, puis l'air le freine
    const lim = Math.min(1, 1.2 / g)
    gx *= lim; gy *= lim; gz *= lim
    const cx = px[i] - mx, cy = py[i] - my, cz = pz[i] - mz
    const dc = Math.hypot(cx, cy, cz) || 1
    const f = Math.min(1, params.main * 0.25 * Math.max(0, 1 - dc / (RAYON_MAIN + rad[i])))
    vx[i] += (gx - vx[i]) * f
    vy[i] += (gy - vy[i]) * f
    vz[i] += (gz - vz[i]) * f
    touche = true
  }
  rayonAvant.copy(rayon)
  return touche
}

export function prendreChangement() { const c = changement; changement = false; return c }

function majMatieres() {
  matCorps.roughness = params.rugosite
  matCorps.metalness = params.metal
  matArgent.roughness = params.argentRugosite
  uArgentClarte.value = params.argentClarte
  uLueur.value = params.lueur
  uRame.value = params.refletsRame
  uQuai.value = params.refletsQuai
  changement = true
}

export function addGui(gui) {
  const f = gui.addFolder('Ballons')
  f.add(params, 'actifs').name('Ballons').onChange(construire)
  f.add(params, 'nombre', 50, 3000, 10).name('Nombre').onFinishChange(construire)
  f.add(params, 'taille', 0.15, 0.8, 0.01).name('Taille (m)').onFinishChange(construire)
  f.addColor(params, 'rose').name('Rose').onFinishChange(construire)
  f.addColor(params, 'bleu').name('Bleu').onFinishChange(construire)
  f.addColor(params, 'argent').name('Argent').onFinishChange(construire)
  f.add(params, 'argentRugosite', 0, 1, 0.01).name('Argent : rugosité').onChange(majMatieres)
  f.add(params, 'argentClarte', 0.5, 3, 0.01).name('Argent : clarté').onChange(majMatieres)
  f.add(params, 'rugosite', 0, 1, 0.01).name('Rugosité').onChange(majMatieres)
  f.add(params, 'metal', 0, 1, 0.01).name('Métal').onChange(majMatieres)
  f.add(params, 'lueur', 0, 1, 0.01).name('Éclat de la couleur').onChange(majMatieres)
  f.add(params, 'refletsRame', 0, 2, 0.01).name('Reflets dans la rame').onChange(majMatieres)
  f.add(params, 'refletsQuai', 0, 2, 0.01).name('Reflets sur le quai').onChange(majMatieres)
  f.add(params, 'debit', 0, 4, 0.05).name('Vitesse de sortie (m/s)').onChange(() => (eveil = 90))
  f.add(params, 'main', 0, 3, 0.01).name('Force de la souris / du doigt')
  f.add(params, 'montee', 0, 4, 0.05).name('Montée sur le quai').onChange(() => (eveil = 90))
  f.add(params, 'freinage', 0.5, 8, 0.1).name("Résistance de l'air").onChange(() => (eveil = 90))
  f.add(params, 'graine', 1, 99, 1).name('Tirage').onFinishChange(construire)
  f.add({ reinit: construire }, 'reinit').name('↺ Remettre dans la rame')
}
