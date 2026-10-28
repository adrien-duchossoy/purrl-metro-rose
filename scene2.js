import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { FOG_GLSL } from './fog.js'

// Scène 2 : la station en 3D, avec les images cuites par survey/scene2/bake_tex.py.
// La caméra reste à la place de la caméra fSpy et tourne sur elle-même vers la voie.
// La brume de la scène 1 continue, calculée avec le même code (fog.js) : elle tourne avec le décor.

const LENS_START = 24 // même objectif que la photo de la scène 1
const LENS_END = 14 // plan desserré face à la voie
const SENSOR = 36 // largeur du capteur, comme dans Blender
const FRAME_AR = 2752 / 1536 // format de la photo de la scène 1

const canvas = document.getElementById('gl2')
const renderer = new THREE.WebGLRenderer({ canvas })
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2))

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(50, FRAME_AR, 0.05, 500)
const qStart = new THREE.Quaternion()
const qEnd = new THREE.Quaternion()

// Cadrage de départ : la partie de la photo que la scène 1 montre à l'écran
let from = { w: 1, h: 1, cx: 0.5 }
let k = 0 // avancement de la rotation, de 0 à 1

const ease = (x) => x * x * (3 - 2 * x)
const lerp = THREE.MathUtils.lerp

// Cadrage d'arrivée : le cadre de la photo tient en hauteur, on rogne les côtés
function endCrop(aspect) {
  return aspect < FRAME_AR ? { w: aspect / FRAME_AR, h: 1 } : { w: 1, h: FRAME_AR / aspect }
}

function apply() {
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
  new GLTFLoader(manager).load(`/scene2/station.glb?v=${v}`, (gltf) => {
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return
      // Les textures contiennent déjà toute la lumière : aucun éclairage à calculer
      let map = o.material.map
      const name = BAKED.find((n) => o.name.startsWith(n))
      if (name) {
        map = texLoader.load(`/scene2/tex/${name}.jpg?v=${v}`)
        map.flipY = false // même sens que les textures glTF
      }
      map.colorSpace = THREE.SRGBColorSpace
      map.anisotropy = renderer.capabilities.getMaxAnisotropy()
      // Deux faces : certaines surfaces sont orientées vers l'extérieur dans Blender
      o.material = new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide })
    })
    scene.add(gltf.scene)
    gltf.scene.updateMatrixWorld(true)
    const start = gltf.scene.getObjectByName('CamQuai')
    const end = gltf.scene.getObjectByName('CamEtape2XW')
    start.getWorldPosition(camera.position)
    start.getWorldQuaternion(qStart)
    end.getWorldQuaternion(qEnd)
    post.uniforms.uQuaiInv.value.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(qStart)).transpose()
  })
})

// ---------- La brume, ajoutée par-dessus l'image de la station ----------

// La station est d'abord dessinée dans une image hors écran, avec la distance de chaque pixel
const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
target.depthTexture = new THREE.DepthTexture(1, 1)

const post = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3,
  depthTest: false,
  depthWrite: false,
  uniforms: {
    tColor: { value: target.texture },
    tDepth: { value: target.depthTexture },
    tDepth1: { value: depth1 },
    uProjInv: { value: new THREE.Matrix4() },
    uCamWorld: { value: new THREE.Matrix4() },
    uQuaiInv: { value: new THREE.Matrix3() },
    uNear: { value: camera.near },
    uFar: { value: camera.far },
    uTime: { value: 0 },
    uFog: { value: 0.7 },
    uOffset: { value: new THREE.Vector2() }, // la parallaxe est au repos pendant la 3D
    uFocus: { value: 0 },
  },
  vertexShader: /* glsl */ `
    out vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    precision highp float;
    in vec2 vUv;
    out vec4 fragColor;
    uniform sampler2D tColor, tDepth, tDepth1;
    uniform mat4 uProjInv, uCamWorld;
    uniform mat3 uQuaiInv;
    uniform float uNear, uFar, uTime, uFog, uFocus;
    uniform vec2 uOffset;

    ${FOG_GLSL}

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
      vec3 col = toSRGB(texture(tColor, vUv).rgb);

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
      col = addFog(col, dq, sd);
      fragColor = vec4(col, 1.0);
    }`,
})
const postScene = new THREE.Scene()
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post))
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

let fogLevel = () => 0.7

function render(now = performance.now()) {
  apply()
  const time = now / 1000 // même horloge que la scène 1
  const u = post.uniforms
  u.uTime.value = time
  u.uFog.value = fogLevel()
  u.uProjInv.value.copy(camera.projectionMatrixInverse)
  u.uCamWorld.value.copy(camera.matrixWorld)

  renderer.setRenderTarget(target)
  renderer.render(scene, camera)
  renderer.setRenderTarget(null)
  renderer.render(postScene, postCam)
}

// Affiche la scène 2 au départ de la rotation, avec le cadrage et la brume de la scène 1,
// puis l'anime en continu : la brume continue de bouger avant, pendant et après la rotation
export function show(crop, getFog) {
  from = { ...crop }
  if (getFog) fogLevel = getFog
  k = 0
  render()
}

export function start() {
  renderer.setAnimationLoop((now) => render(now))
}

// Lance la rotation ; la promesse se termine quand la caméra est face à la voie
let rotation = null
export function rotate(ms) {
  return new Promise((resolve) => { rotation = { t0: performance.now(), ms, resolve } })
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
  const size = renderer.getDrawingBufferSize(new THREE.Vector2())
  target.setSize(size.x, size.y)
  render()
}
addEventListener('resize', resize)
resize()
