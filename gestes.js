// Geste « écarter » : deux doigts qui s'écartent sur mobile, cliquer-glisser vers la droite à la souris.
// Pendant le geste, onMove(p) reçoit son avancement (0 au départ, 1 pour un geste complet) ;
// au relâchement, onEnd() est appelé. Renvoie une fonction qui arrête l'écoute.

const IGNORE = '.lil-gui, button' // les clics sur le panneau et les boutons ne comptent pas

export function ecarter({ onMove, onEnd, actif = () => true }) {
  const doigts = new Map() // pointeurs tactiles posés
  let depart = null // distance entre les doigts, ou position de la souris, au début du geste

  const ecart = () => {
    const [a, b] = [...doigts.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  function down(e) {
    if (!actif() || e.target.closest?.(IGNORE)) return
    if (e.pointerType === 'mouse') {
      depart = e.clientX
    } else {
      doigts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (doigts.size === 2) depart = ecart()
    }
  }

  function move(e) {
    if (depart === null) return
    if (e.pointerType === 'mouse') {
      onMove((e.clientX - depart) / (innerWidth * 0.4)) // 40 % de la largeur d'écran : geste complet
    } else if (doigts.has(e.pointerId)) {
      doigts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (doigts.size === 2) onMove((ecart() - depart) / (Math.min(innerWidth, innerHeight) * 0.5))
    }
  }

  function up(e) {
    if (e.pointerType !== 'mouse') {
      if (!doigts.delete(e.pointerId) || doigts.size !== 1 || depart === null) return
    } else if (depart === null) return
    depart = null
    onEnd()
  }

  // Safari iOS : sans ça, le pincement zoome la page au lieu d'arriver jusqu'ici
  const bloque = (e) => e.preventDefault()
  addEventListener('pointerdown', down)
  addEventListener('pointermove', move)
  addEventListener('pointerup', up)
  addEventListener('pointercancel', up)
  document.addEventListener('gesturestart', bloque)
  return () => {
    removeEventListener('pointerdown', down)
    removeEventListener('pointermove', move)
    removeEventListener('pointerup', up)
    removeEventListener('pointercancel', up)
    document.removeEventListener('gesturestart', bloque)
  }
}

// Geste « avancer » : pencher le téléphone vers l'avant (comme un joystick : plus on penche, plus ça va vite),
// la molette vers le bas sur desktop, ou glisser un doigt vers le haut si le gyroscope n'est pas autorisé.
// onPas(d) reçoit de petits pas d'avancement (négatifs pour reculer). Renvoie une fonction qui arrête l'écoute.
const MORTE = 5 // degrés : en dessous, le téléphone est considéré comme droit
const PLEINE = 25 // degrés au-delà de la zone morte pour aller à pleine vitesse
const VITESSE = 0.3 // avancement par seconde à pleine inclinaison (le trajet complet fait 1)

export function avancer({ onPas, actif = () => true }) {
  // Inclinaison avant / arrière, selon le sens dans lequel on tient le téléphone (comme en scène 1)
  let neutre = null, penche = 0
  function orientation(e) {
    if (e.beta == null || e.gamma == null) return
    const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0
    const y = angle === 90 ? -e.gamma : angle === -90 || angle === 270 ? e.gamma : e.beta
    neutre ??= y // la position au début du geste est la position droite
    penche = neutre - y // > 0 : le haut du téléphone part vers l'avant
  }
  let prec = performance.now(), boucle = 0
  const pas = (now) => {
    const dt = Math.min(0.1, (now - prec) / 1000)
    prec = now
    const fort = Math.min(1, Math.max(0, Math.abs(penche) - MORTE) / PLEINE)
    if (fort > 0 && actif()) onPas(Math.sign(penche) * fort * VITESSE * dt)
    boucle = requestAnimationFrame(pas)
  }
  boucle = requestAnimationFrame(pas)

  const molette = (e) => {
    if (!actif() || e.target.closest?.(IGNORE)) return
    onPas((e.deltaY * (e.deltaMode === 1 ? 40 : 1)) / 1500) // vers le bas : on avance
  }

  let doigt = null // secours tactile : un doigt qui glisse vers le haut
  const down = (e) => { if (e.pointerType !== 'mouse' && actif() && !e.target.closest?.(IGNORE)) doigt = { id: e.pointerId, y: e.clientY } }
  const move = (e) => {
    if (doigt?.id !== e.pointerId) return
    onPas((doigt.y - e.clientY) / (innerHeight * 1.2))
    doigt.y = e.clientY
  }
  const up = (e) => { if (doigt?.id === e.pointerId) doigt = null }

  addEventListener('deviceorientation', orientation)
  addEventListener('wheel', molette, { passive: true })
  addEventListener('pointerdown', down)
  addEventListener('pointermove', move)
  addEventListener('pointerup', up)
  addEventListener('pointercancel', up)
  return () => {
    cancelAnimationFrame(boucle)
    removeEventListener('deviceorientation', orientation)
    removeEventListener('wheel', molette)
    removeEventListener('pointerdown', down)
    removeEventListener('pointermove', move)
    removeEventListener('pointerup', up)
    removeEventListener('pointercancel', up)
  }
}
