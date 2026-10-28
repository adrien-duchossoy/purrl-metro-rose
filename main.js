import * as scene1 from './scene1.js'
import * as scene2 from './scene2.js'

// Scène 1 (parallaxe) puis, sur le bouton, scène 2 (rotation de la caméra vers la voie).
// Le bouton remplace pour l'instant le vrai déclencheur (le métro qui arrive).

const $ = (id) => document.getElementById(id)
const btn = $('metro')
const test = new URLSearchParams(location.search)

const SETTLE_MS = 900 // retour de la caméra au centre
const FADE_MS = 1000 // fondu entre les deux scènes, même durée que dans le CSS
const ROTATE_MS = 7000 // rotation vers la voie

// Le bouton apparaît une fois entré sur le quai
$('startBtn').addEventListener('click', () => btn.classList.remove('hidden'))

scene2.ready.then(() => {
  scene2.show(scene1.crop, scene1.fogLevel) // premier rendu, invisible : la carte graphique prépare les textures
  btn.disabled = false
  btn.textContent = 'Le métro arrive'
})

// Au survol du bouton, la caméra se place déjà au centre, comme au départ de la 3D :
// au clic, il n'y a plus de recalage visible
btn.addEventListener('pointerenter', () => scene1.hold(true))
btn.addEventListener('pointerleave', () => scene1.hold(false))

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

btn.addEventListener('click', async () => {
  if (btn.textContent === 'Revoir') return location.reload()
  btn.classList.add('hidden')
  $('panel').classList.add('hidden')
  $('toggle').classList.add('hidden')

  await scene1.settle(SETTLE_MS)
  scene2.show(scene1.crop, scene1.fogLevel)
  scene2.start() // la brume continue dans la 3D, à la même heure que dans la scène 1
  $('gl2').classList.add('visible')
  await wait(FADE_MS)
  scene1.stop()
  if (test.has('pause')) return // test : ?pause garde la scène 2 au départ, pour la comparer à la scène 1

  await scene2.rotate(ROTATE_MS)
  btn.textContent = 'Revoir'
  btn.classList.remove('hidden')
})
