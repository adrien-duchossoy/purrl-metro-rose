import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

// Scène 2 : la station en 3D, avec les images cuites par survey/scene2/bake_tex.py.
// La caméra reste à la place de la caméra fSpy et tourne sur elle-même vers la voie.

const LENS_START = 24 // même objectif que la photo de la scène 1
const LENS_END = 14 // plan desserré face à la voie
const SENSOR = 36 // largeur du capteur, comme dans Blender
const FRAME_AR = 2752 / 1536 // format de la photo de la scène 1

const canvas = document.getElementById('gl2')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace

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
}

// Textures cuites : elles remplacent celles du .glb
const BAKED = ['Voute', 'MurFond', 'QuaiNous', 'QuaiFace', 'Voie', 'BordFace', 'BordNous']
const v = Date.now() // force le navigateur à reprendre la dernière version cuite
const manager = new THREE.LoadingManager()
const texLoader = new THREE.TextureLoader(manager)

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
  })
})

function render() {
  apply()
  renderer.render(scene, camera)
}

// Affiche la scène 2 au départ de la rotation, avec le cadrage de la scène 1
export function show(crop) {
  from = { ...crop }
  k = 0
  render()
}

// Lance la rotation ; la promesse se termine quand la caméra est face à la voie
export function rotate(ms) {
  return new Promise((resolve) => {
    const t0 = performance.now()
    renderer.setAnimationLoop((now) => {
      k = Math.min(1, (now - t0) / ms)
      render()
      if (k >= 1) {
        renderer.setAnimationLoop(null)
        resolve()
      }
    })
  })
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false)
  render()
}
addEventListener('resize', resize)
resize()
