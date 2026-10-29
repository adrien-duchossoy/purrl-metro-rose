import * as scene1 from './scene1.js'
import * as scene2 from './scene2.js'

// Scène 1 (parallaxe) puis, sur le bouton, scène 2 (rotation de la caméra vers la voie).
// Le bouton remplace pour l'instant le vrai déclencheur (le métro qui arrive).

const $ = (id) => document.getElementById(id)
const btn = $('metro')
const test = new URLSearchParams(location.search)

const SETTLE_MS = 900 // retour de la caméra au centre
const FADE_MS = 1000 // fondu entre les deux scènes, même durée que dans le CSS
const ROTATE_MS = 7000 // rotation vers la voie (elle commence pendant l'arrivée du train, voir rame.js)

// Le bouton apparaît une fois entré sur le quai
$('startBtn').addEventListener('click', () => btn.classList.remove('hidden'))

scene2.ready.then(() => {
  scene2.show(scene1.crop, scene1.fogLevel) // premier rendu, invisible : la carte graphique prépare les textures
  btn.disabled = false
  btn.textContent = 'Le métro arrive'
  if (test.has('rame')) direct()
})

// Test : ?rame ouvre directement la scène 2 face à la voie, avec le panneau de réglages de la rame
function direct() {
  for (const id of ['start', 'gl2']) $(id).style.transition = 'none' // arrivée directe, sans fondu
  $('start').classList.add('hidden')
  $('toggle').classList.add('hidden')
  scene1.stop()
  // ?rame&debut : au départ de la rotation, train encore dans le tunnel (pour « Rejouer la séquence »)
  const debut = test.has('debut')
  scene2.setRotation(debut ? 0 : 1)
  scene2.setArrivee(test.has('avancee') ? Number(test.get('avancee')) : debut ? 0 : 1) // ?avancee=0.2 : train en cours d'arrivée
  scene2.start()
  $('gl2').classList.add('visible')
  scene2.showGui()
  if (test.has('dans')) scene2.setDans(Number(test.get('dans'))) // ?rame&ouv=1&dans=0.5 : caméra en route dans la rame
  if (test.has('jouer')) scene2.sequence().then(scene2.portesAuGeste).then(scene2.avancerAuGeste) // ?rame&debut&jouer : séquence seule
  else scene2.portesAuGeste().then(scene2.avancerAuGeste)
}

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

  await scene2.sequence(ROTATE_MS) // le train arrive, puis la caméra tourne vers lui
  scene2.showGui()
  btn.textContent = 'Revoir'
  btn.classList.remove('hidden')
  scene2.portesAuGeste().then(scene2.avancerAuGeste) // portes ouvertes : on peut entrer dans la rame
})
