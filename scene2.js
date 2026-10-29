import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import GUI from 'lil-gui'
import { FOG_GLSL } from './fog.js'
import * as rame from './rame.js'
import { ecarter } from './gestes.js'
import * as brume3d from './brume3d.js'

// Scène 2 : la station en 3D, avec les images cuites par survey/scene2/bake_tex.py.
// La caméra reste à la place de la caméra fSpy et tourne sur elle-même vers la voie.
// La brume de la scène 1 continue, calculée avec le même code (fog.js) : elle tourne avec le décor.

const LENS_START = 24 // même objectif que la photo de la scène 1
const LENS_END = 14 // plan desserré face à la voie
const SENSOR = 36 // largeur du capteur, comme dans Blender
const FRAME_AR = 2752 / 1536 // format de la photo de la scène 1

const canvas = document.getElementById('gl2')
const renderer = new THREE.WebGLRenderer({ canvas })
// Résolution adaptative : on part de la pleine résolution (2 au plus) et on la baisse par crans si l'appareil
// ne suit pas (voir adapter()). Tout le rendu est calculé par pixel : c'est le réglage qui pèse le plus.
const DPR_MAX = Math.min(devicePixelRatio || 1, 2)
let dpr = DPR_MAX
renderer.setPixelRatio(dpr)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(50, FRAME_AR, 0.05, 500)
const qStart = new THREE.Quaternion()
const qEnd = new THREE.Quaternion()

// Cadrage de départ : la partie de la photo que la scène 1 montre à l'écran
let from = { w: 1, h: 1, cx: 0.5 }
let k = 0 // avancement de la rotation, de 0 à 1

// Courbe de la rotation, façon mouvement de caméra de cinéma : départ très progressif, puis un long
// atterrissage. L'accélération est nulle aux deux bouts (pas d'à-coup) et la vitesse culmine avant
// la moitié, pour que la caméra se pose en douceur pendant que le train finit de freiner.
const ease = (x) => {
  const w = 1 - (1 - x) ** 1.5
  return w * w * w * (w * (w * 6 - 15) + 10)
}
const lerp = THREE.MathUtils.lerp

// Cadrage d'arrivée : le cadre de la photo tient en hauteur, on rogne les côtés
function endCrop(aspect) {
  return aspect < FRAME_AR ? { w: aspect / FRAME_AR, h: 1 } : { w: 1, h: FRAME_AR / aspect }
}

function apply() {
  if (view.libre) return // la vue libre est pilotée par la souris (OrbitControls)
  const aspect = innerWidth / innerHeight
  const e = ease(k)
  camera.quaternion.slerpQuaternions(qStart, qEnd, e)

  // L'objectif règle tout le cadre de la photo ; on n'en affiche qu'une partie, qui glisse
  // du cadrage de la scène 1 vers le cadrage centré de la fin
  const lens = lerp(LENS_START, LENS_END, e)
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(SENSOR / 2 / lens / FRAME_AR))
  camera.aspect = FRAME_AR
  const h = lerp(from.h, endCrop(aspect).h, e)
  const w = (h * aspect) / FRAME_AR
  const cx = lerp(from.cx, 0.5, e)
  const FW = 10000, FH = FW / FRAME_AR
  camera.setViewOffset(FW, FH, (cx - w / 2) * FW, (0.5 - h / 2) * FH, w * FW, h * FH)
  camera.updateMatrixWorld()
}

// ---------- La station ----------

// Textures cuites : elles remplacent celles du .glb
const BAKED = ['Voute', 'MurFond', 'QuaiNous', 'QuaiFace', 'Voie', 'BordFace', 'BordNous']
const v = Date.now() // force le navigateur à reprendre la dernière version cuite
const manager = new THREE.LoadingManager()
const texLoader = new THREE.TextureLoader(manager)

// Profondeur de la scène 1 telle qu'affichée (fond + lustres) : la brume s'y cache au départ comme en scène 1
const depth1 = texLoader.load('/scene1_depth.png')
depth1.minFilter = THREE.LinearFilter
depth1.generateMipmaps = false

export const ready = new Promise((resolve) => {
  manager.onLoad = resolve
  new GLTFLoader(manager).load(`scene2/station.glb?v=${v}`, (gltf) => {
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return
      // Les textures contiennent déjà toute la lumière : aucun éclairage à calculer
      let map = o.material.map
      const name = BAKED.find((n) => o.name.startsWith(n))
      if (name) {
        map = texLoader.load(`scene2/tex/${name}.jpg?v=${v}`)
        map.flipY = false // même sens que les textures glTF
      }
      map.colorSpace = THREE.SRGBColorSpace
      map.anisotropy = renderer.capabilities.getMaxAnisotropy()
      // Deux faces : certaines surfaces sont orientées vers l'extérieur dans Blender
      o.material = new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide })
      // La station laisse la transparence de l'image à 0, le métro la met à 1 : la brume sait ainsi
      // quels pixels montrent le métro
      o.material.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  gl_FragColor.a = 0.0;')
      }
    })
    scene.add(gltf.scene)
    gltf.scene.updateMatrixWorld(true)
    const start = gltf.scene.getObjectByName('CamQuai')
    const end = gltf.scene.getObjectByName('CamEtape2XW')
    start.getWorldPosition(camera.position)
    start.getWorldQuaternion(qStart)
    end.getWorldQuaternion(qEnd)
    post.uniforms.uQuaiInv.value.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(qStart)).transpose()
    camHome.copy(camera.position)
    rame.setCameraZ(camera.position.z) // pour caler une porte au centre de l'écran
  })
  rame.load(scene, renderer, manager)
})

// ---------- La brume, ajoutée par-dessus l'image de la station ----------

// La station est d'abord dessinée dans une image hors écran, avec la distance de chaque pixel
// samples : anti-aliasing (MSAA), les bords du métro et du décor sont lissés
const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })
target.depthTexture = new THREE.DepthTexture(1, 1)
brume3d.init(target.depthTexture, camera)

const post = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3,
  depthTest: false,
  depthWrite: false,
  uniforms: {
    tColor: { value: target.texture },
    tDepth: { value: target.depthTexture },
    tDepth1: { value: depth1 },
    tPuffs: { value: brume3d.texture },
    uProjInv: { value: new THREE.Matrix4() },
    uCamWorld: { value: new THREE.Matrix4() },
    uQuaiInv: { value: new THREE.Matrix3() },
    uNear: { value: camera.near },
    uFar: { value: camera.far },
    uTime: { value: 0 },
    uFog: { value: 0.7 },
    uOffset: { value: new THREE.Vector2() }, // la parallaxe est au repos pendant la 3D
    uFocus: { value: 0 },
    uStop: { value: 1e9 },
    uPhare: { value: [new THREE.Vector4(), new THREE.Vector4()] }, // x, y à l'écran (0 à 1), distance, intensité
    uAspect: { value: 1 },
    uExpo: { value: 1 },
  },
  vertexShader: /* glsl */ `
    out vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    precision highp float;
    in vec2 vUv;
    out vec4 fragColor;
    uniform sampler2D tColor, tDepth, tDepth1, tPuffs;
    uniform mat4 uProjInv, uCamWorld;
    uniform mat3 uQuaiInv;
    uniform float uNear, uFar, uTime, uFog, uFocus;
    uniform vec2 uOffset;
    #define STOP_NUAGES
    uniform float uStop, uAspect, uExpo;
    uniform vec4 uPhare[2];

    ${FOG_GLSL}

    // Éblouissement d'un phare dans l'objectif, façon rêve : un cœur brillant, un large halo rosé,
    // une longue traînée horizontale lilas et une étoile fine. Caché si le décor passe devant le phare.
    vec3 glare(vec2 uv, vec4 L) {
      if (L.w <= 0.0) return vec3(0.0);
      float zl = texture(tDepth, L.xy).r;
      float dl = -(uNear * uFar) / ((uFar - uNear) * zl - uFar); // profondeur du décor devant le phare
      float vis = smoothstep(-0.6, -0.1, dl - L.z);
      if (vis <= 0.0) return vec3(0.0);
      float s = clamp(12.0 / L.z, 0.35, 1.8); // plus le phare est proche, plus l'éblouissement est grand
      vec2 d = (uv - L.xy) * vec2(uAspect, 1.0) / s;
      float r = length(d);
      float core = exp(-r * r * 6000.0) * 1.4;
      float halo = exp(-r * 14.0) * 0.55 + exp(-r * 4.0) * 0.12;
      float streak = exp(-abs(d.y) * 260.0) * exp(-abs(d.x) * 2.5) * 0.7;
      vec2 q = mat2(0.7071, -0.7071, 0.7071, 0.7071) * d;
      float star = (exp(-abs(q.x) * 500.0) * exp(-abs(q.y) * 14.0) + exp(-abs(q.y) * 500.0) * exp(-abs(q.x) * 14.0)) * 0.35;
      vec3 c = vec3(1.0, 0.95, 0.97) * core + vec3(1.0, 0.84, 0.91) * halo + vec3(0.86, 0.82, 1.0) * streak + vec3(1.0, 0.92, 0.85) * star;
      // Dans la brume épaisse, le phare est voilé : même aspect, intensité réduite selon la brume devant lui
      float voile = mix(1.0, 0.35, clamp(1.5 * texture(tPuffs, L.xy).a, 0.0, 1.0));
      return c * L.w * vis * voile;
    }

    // Tone mapping Neutral (Khronos PBR Neutral, repris de THREE.NeutralToneMapping) : garde les couleurs
    // des matériaux telles quelles et n'adoucit que les lumières très fortes, sans voile ni désaturation.
    // Appliqué au métro seulement : la station garde les couleurs de la photo.
    vec3 neutral(vec3 color) {
      const float START = 0.8 - 0.04, DESAT = 0.15;
      color *= uExpo;
      float x = min(color.r, min(color.g, color.b));
      color -= x < 0.08 ? x - 6.25 * x * x : 0.04;
      float peak = max(color.r, max(color.g, color.b));
      if (peak < START) return color;
      float d = 1.0 - START;
      float newPeak = 1.0 - d * d / (peak + d - START);
      color *= newPeak / peak;
      return mix(color, vec3(newPeak), 1.0 - 1.0 / (DESAT * (peak - newPeak) + 1.0));
    }
    vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }

    // Profondeur façon scène 1 (0 loin, 1 près) à partir d'une distance en mètres,
    // relevée sur la photo et la 3D (survey/scene2, ajustement du 27/10)
    float depthFromDist(float d) {
      const float D[9] = float[9](4.0, 5.5, 7.7, 11.0, 15.5, 21.5, 30.0, 42.0, 80.0);
      const float P[9] = float[9](1.0, 0.925, 0.714, 0.561, 0.447, 0.333, 0.208, 0.153, 0.05);
      if (d <= D[0]) return P[0];
      for (int i = 1; i < 9; i++) if (d < D[i]) return mix(P[i - 1], P[i], (d - D[i - 1]) / (D[i] - D[i - 1]));
      return P[8];
    }

    void main() {
      // Les calculs de brume se font comme en scène 1, sur des couleurs sRGB
      vec4 src = texture(tColor, vUv);
      vec3 col = toSRGB(mix(src.rgb, neutral(src.rgb), clamp(src.a, 0.0, 1.0)));

      // Direction du regard pour ce pixel, et distance du décor dans cette direction
      vec4 vp = uProjInv * vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
      vec3 dirV = normalize(vp.xyz / vp.w);
      float z = texture(tDepth, vUv).r;
      float viewZ = (uNear * uFar) / ((uFar - uNear) * z - uFar);
      float sceneDist = viewZ / dirV.z;
      vec3 rd = normalize(mat3(uCamWorld) * dirV);

      // La brume de la scène 1, calculée pour la direction du regard : elle tourne avec le décor.
      // Elle se cache derrière le décor : dans la photo, avec la profondeur de la scène 1 ; ailleurs,
      // avec la profondeur déduite de la 3D
      vec3 dq = uQuaiInv * rd; // direction vue depuis la caméra de la photo
      float sd = depthFromDist(sceneDist);
      if (dq.z < -0.05) {
        vec2 uvImg = vec2(0.5 + 0.66667 * dq.x / -dq.z, 0.5 - 1.19444 * dq.y / -dq.z);
        vec2 e = min(uvImg, 1.0 - uvImg);
        float inside = smoothstep(0.0, 0.03, min(e.x, e.y));
        sd = mix(sd, texture(tDepth1, vec2(uvImg.x, 1.0 - uvImg.y)).r, inside);
      }
      // Le métro n'est pas dans la profondeur de la photo : là où on le voit (vitres comprises), les nuages
      // de la station ne passent jamais.
      float metro = clamp(texture(tColor, vUv).a, 0.0, 1.0);
      sd = mix(sd, 2.0, metro);
      col = addFog(col, dq, sd);
      // Nappes de brume en 3D, déjà dessinées avec leur opacité (couleurs prémultipliées)
      vec4 puffs = texture(tPuffs, vUv);
      col = col * (1.0 - puffs.a) + puffs.rgb;
      col += glare(vUv, uPhare[0]) + glare(vUv, uPhare[1]);
      fragColor = vec4(col, 1.0);
    }`,
})
const postScene = new THREE.Scene()
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post))
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

let fogLevel = () => 0.7

// ---------- Panneau de réglages (caché pendant le parcours, affiché par showGui) ----------

// Test : ?nobrume démarre sans brume
const view = { rotation: 0, libre: false, brume: !new URLSearchParams(location.search).has('nobrume') }
const camHome = new THREE.Vector3()
const controls = new OrbitControls(camera, canvas)
controls.enabled = false

function setFree(on) {
  controls.enabled = on
  canvas.style.pointerEvents = on ? 'auto' : '' // le canvas laisse passer les clics hors vue libre
  if (on) {
    camera.clearViewOffset()
    camera.fov = 50
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
    controls.target.copy(rame.group.position).setY(1)
    controls.update()
  } else {
    camera.position.copy(camHome)
  }
}

const gui = new GUI({ title: 'Réglages scène 2' })
gui.hide()
const v2 = gui.addFolder('Vue')
v2.add(view, 'rotation', 0, 1, 0.001).name('Rotation caméra').listen().onChange((x) => { k = x })
v2.add(view, 'libre').name('Vue libre (souris)').onChange(setFree)
v2.add(view, 'brume').name('Brume visible')
v2.add({ sequence: () => sequence().then(portesAuGeste) }, 'sequence').name('▶ Rejouer la séquence')
rame.addGui(gui)
brume3d.addGui(gui)
gui.add({
  copier() {
    const txt = JSON.stringify(rame.params, null, 2)
    navigator.clipboard.writeText(txt).then(() => {
      copyBtn.name('Copié ✓')
      setTimeout(() => copyBtn.name('Copier les valeurs'), 1500)
    })
  },
}, 'copier').name('Copier les valeurs')
const copyBtn = gui.controllers.at(-1)

export function showGui() { gui.show() }

// Apparition des phares : pendant la séquence, ils restent éteints tant que le train est dans le tunnel,
// puis montent en douceur dès que son nez passe le mur ('attente' : pas encore sorti ; null : allumés)
let allumage = null
const DUREE_ALLUMAGE = 1.5 // secondes

// Position des phares à l'écran pour l'éblouissement : il est d'autant plus fort que le phare regarde la caméra
const camPos = new THREE.Vector3(), versCam = new THREE.Vector3(), ecran = new THREE.Vector3()
function majPhares() {
  const ph = rame.phares()
  const u = post.uniforms
  if (allumage === 'attente' && rame.boite()?.min.z < -0.3) allumage = performance.now()
  const x = allumage === null ? 1 : allumage === 'attente' ? 0 : Math.min(1, (performance.now() - allumage) / 1000 / DUREE_ALLUMAGE)
  const eclat = x * x * (3 - 2 * x) // départ et arrivée en douceur
  if (x >= 1) allumage = null
  rame.setEclat(eclat)
  u.uAspect.value = innerWidth / innerHeight
  camera.getWorldPosition(camPos)
  for (let i = 0; i < 2; i++) {
    const L = u.uPhare.value[i]
    L.w = 0
    if (!ph) continue
    const p = ph.positions[i]
    const face = versCam.subVectors(camPos, p).normalize().dot(ph.avant)
    ecran.copy(p).project(camera)
    const prof = -p.clone().applyMatrix4(camera.matrixWorldInverse).z
    if (prof <= 0 || Math.abs(ecran.x) > 1.5 || Math.abs(ecran.y) > 1.5) continue
    // De près, l'éblouissement grossit et noie la scène : son intensité baisse quand le train approche
    const proche = THREE.MathUtils.lerp(0.35, 1, THREE.MathUtils.smoothstep(prof, 5, 40))
    L.set((ecran.x + 1) / 2, (ecran.y + 1) / 2, prof, THREE.MathUtils.smoothstep(face, 0.2, 0.9) * rame.params.lumieres.glare * eclat * proche)
  }
}

// Baisse la résolution d'un cran quand les images prennent en moyenne plus de 22 ms (moins de 45 par seconde)
// deux secondes de suite (une seule seconde lente peut venir de la compilation d'un shader).
// On ne la remonte pas : ça évite qu'elle oscille.
let adaptT0 = 0, adaptImages = 0, adaptPrec = 0, lentes = 0
function adapter(now) {
  const dt = now - adaptPrec
  adaptPrec = now
  if (dt > 100) { adaptT0 = now; adaptImages = 0; return } // onglet en arrière-plan, chargement : on ne compte pas
  adaptImages++
  if (now - adaptT0 < 1000) return
  const ms = (now - adaptT0) / adaptImages
  adaptT0 = now; adaptImages = 0
  lentes = ms > 22 ? lentes + 1 : 0
  if (lentes >= 2 && dpr > 1) {
    lentes = 0
    dpr = Math.max(1, dpr - 0.25)
    renderer.setPixelRatio(dpr)
    resize()
  }
}

// ?perf : mesures affichées à l'écran toutes les secondes (lisibles sur iPhone)
const PERF = new URLSearchParams(location.search).has('perf')
let perfT0 = 0, perfImages = 0, perfDiv = null
function perf(now) {
  const i = renderer.info
  if (perfImages > 0 && now - perfT0 > 1000) {
    perfDiv ??= Object.assign(document.body.appendChild(document.createElement('div')), {
      style: 'position:fixed;left:8px;top:8px;z-index:9;font:12px ui-monospace,monospace;color:#fff;background:#0009;padding:6px 8px;border-radius:6px;white-space:pre',
    })
    const ms = (now - perfT0) / perfImages
    perfDiv.textContent = `${(1000 / ms).toFixed(0)} i/s  ${ms.toFixed(1)} ms\nrésolution ${dpr} (max ${DPR_MAX})\n${i.render.calls} appels  ${(i.render.triangles / 1000).toFixed(0)} k triangles`
    perfT0 = now; perfImages = 0
  }
  if (!perfT0) perfT0 = now
  perfImages++
  i.autoReset = false
  i.reset()
}

let lastFrame = null
function render(now = performance.now()) {
  apply()
  const time = now / 1000 // même horloge que la scène 1
  const u = post.uniforms
  u.uTime.value = time
  u.uFog.value = view.brume ? fogLevel() : 0
  view.rotation = k
  majPhares()
  u.uExpo.value = rame.params.lumieres.exposition
  u.uProjInv.value.copy(camera.projectionMatrixInverse)
  u.uCamWorld.value.copy(camera.matrixWorld)

  adapter(now)
  if (PERF) perf(now)
  renderer.setRenderTarget(target)
  renderer.render(scene, camera)
  brume3d.update(lastFrame === null ? 0 : Math.min(0.1, (now - lastFrame) / 1000), time, rame.boite())
  lastFrame = now
  brume3d.render(renderer, camera)
  renderer.setRenderTarget(null)
  renderer.render(postScene, postCam)
}

// Affiche la scène 2 au départ de la rotation, avec le cadrage et la brume de la scène 1,
// puis l'anime en continu : la brume continue de bouger avant, pendant et après la rotation
export function show(crop, getFog) {
  from = { ...crop }
  if (getFog) fogLevel = getFog
  k = 0
  rame.setArrivee(0) // le train attend dans le tunnel
  render()
}

// Place directement la caméra à un point de la rotation (0 : face au quai, 1 : face à la voie)
export function setRotation(x) { k = x }
export const setArrivee = rame.setArrivee

export function start() {
  // La brume plate de la scène 1 ne lance plus de nuages : la brume 3D prend le relais
  post.uniforms.uStop.value = performance.now() / 1000
  renderer.setAnimationLoop((now) => render(now))
}

// Lance la rotation ; la promesse se termine quand la caméra est face à la voie
let rotation = null
export function rotate(ms) {
  return new Promise((resolve) => { rotation = { t0: performance.now(), ms, resolve } })
}

// Séquence complète : la brume se forme devant le tunnel, puis le train en sort et freine ; la caméra tourne
// pendant le freinage et s'arrête en même temps que lui. Le petit recul de la caisse vient ensuite, caméra immobile.
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
export async function sequence(ms = 7000) {
  rotation = null
  k = 0
  rame.setOuverture(0)
  rame.setArrivee(0) // le train attend dans le tunnel que le rideau de brume se forme
  allumage = 'attente'
  await wait(brume3d.params.montee * 1000)
  const arret = rame.jouer()
  await wait(Math.max(0, rame.dureeFreinage() * 1000 - ms))
  await Promise.all([rotate(ms), arret])
}

// Ouverture des portes au geste (écarter deux doigts, ou glisser vers la droite à la souris) :
// les portes suivent le geste, puis finissent seules au-delà de la moitié.
// La promesse se termine quand elles sont ouvertes.
let stopGeste = () => {}
export function portesAuGeste() {
  stopGeste() // une seule écoute à la fois (séquence rejouée depuis le panneau)
  return new Promise((resolve) => {
    let depart = null
    const stop = (stopGeste = ecarter({
      actif: () => !view.libre,
      onMove: (p) => {
        if (depart === null) depart = rame.params.portes.ouverture // on reprend où en sont les portes
        rame.setOuverture(depart + p)
      },
      onEnd: async () => {
        depart = null
        if (await rame.finirOuverture()) { stop(); resolve() }
      },
    }))
  })
}

const tick = () => {
  if (rotation) {
    k = Math.min(1, (performance.now() - rotation.t0) / rotation.ms)
    if (k >= 1) { rotation.resolve(); rotation = null }
  }
  requestAnimationFrame(tick)
}
tick()

function resize() {
  renderer.setSize(innerWidth, innerHeight, false)
  if (view.libre) { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix() }
  const size = renderer.getDrawingBufferSize(new THREE.Vector2())
  target.setSize(size.x, size.y)
  brume3d.setSize(size.x, size.y)
  render()
}
addEventListener('resize', resize)
resize()
