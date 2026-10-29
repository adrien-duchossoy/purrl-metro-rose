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
