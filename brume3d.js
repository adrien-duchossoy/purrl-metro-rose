import * as THREE from 'three'

// Brume en 3D : de grandes nappes douces qui sortent du tunnel et dérivent vers le quai, en relais de la
// brume plate de la scène 1. Le métro les pousse vraiment : devant son nez, l'air est chassé vers l'avant
// et sur les côtés ; le long de la caisse, il est entraîné ; derrière, il tourbillonne. En sortant du tunnel,
// il expulse une bouffée de brume. Chaque nappe garde son élan et ralentit seule, si bien que la brume
// continue de bouger après l'arrêt du train.
//
// Les nappes sont dessinées dans une image à part (moitié de la résolution), puis posées sur la station
// par le shader de brume de scene2.js. Elles s'effacent en douceur là où elles touchent le décor ou le métro.

export const params = {
  visible: true,
  opacite: 0.3,
  taille: 5, // m, taille moyenne d'une nappe
  etirement: 1, // les nappes rapides s'étirent dans le sens de leur mouvement
  echelle: 0.3, // finesse du motif de la brume (plus grand : volutes plus petites)
  emission: 1.2, // nappes par seconde qui sortent du tunnel au repos
  bouffee: 220, // nappes expulsées du tunnel par le nez du train
  apres: 6, // nappes par seconde qui sortent encore du tunnel juste après le passage du train
  apresDuree: 15, // secondes pour que ce flux redescende au niveau du repos
  souffle: 1, // force de la poussée du train
  tourbillons: 1, // agitation laissée par le passage du train
  calme: 4, // secondes pour qu'une nappe perde son élan
  paillettes: 1, // éclat des paillettes accrochées aux nappes
}

const N = 420 // nappes au plus en même temps
const TUNNEL = { x: [-2, 4.3], y: [-0.8, 3.2] } // bouche du tunnel, dans le mur du fond (z = 0)
const LIMITES = { x: [-8.5, 11.5], y: [-0.8, 6.5], z: [-70, -0.3] } // la station (le tunnel va au-delà de z = 0)

const rnd = (a, b) => a + Math.random() * (b - a)
const puffs = []
for (let i = 0; i < N; i++) {
  puffs.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), drift: new THREE.Vector3(), seed: Math.random() * 100, alive: false })
}

// Les nappes naissent au fond du tunnel, derrière le mur (z > 0) : elles en sortent peu à peu,
// en s'effaçant là où elles touchent encore le mur, comme si elles venaient de l'obscurité du tunnel
const dansTunnel = (P) => P.x > TUNNEL.x[0] && P.x < TUNNEL.x[1] && P.y < TUNNEL.y[1]

// Fait naître une nappe en (x, y, z), avec une vitesse de départ et une agitation
function spawn(x, y, z, vx = 0, vy = 0, vz = 0, agit = 0) {
  let p = puffs.find((q) => !q.alive)
  if (!p) p = puffs.reduce((a, b) => (b.age / b.maxAge > a.age / a.maxAge ? b : a)) // la plus vieille cède sa place
  p.alive = true
  p.pos.set(x, y, z)
  p.vel.set(vx, vy, vz)
  p.drift.set(rnd(-0.1, 0.1), rnd(-0.01, 0.04), -rnd(0.5, 1.1)) // au repos : vers le quai, chacune à son rythme
  p.agit = agit
  p.angle = rnd(0, Math.PI * 2)
  p.spin = rnd(-0.03, 0.03)
  p.scale = rnd(0.6, 1.4)
  p.age = 0
  p.maxAge = rnd(50, 75)
  return p
}
const sortieTunnel = () => [rnd(...TUNNEL.x), rnd(TUNNEL.y[0], TUNNEL.y[1]), rnd(1, 5)]

// ---------- Dessin ----------

const geo = new THREE.InstancedBufferGeometry()
geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3))
geo.setIndex([0, 1, 2, 0, 2, 3])
const aPos = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3)
const aData = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4) // taille, angle, graine, opacité
aPos.setUsage(THREE.DynamicDrawUsage)
aData.setUsage(THREE.DynamicDrawUsage)
geo.setAttribute('iPos', aPos)
geo.setAttribute('iData', aData)
const aVel = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3) // vitesse, pour l'étirement
aVel.setUsage(THREE.DynamicDrawUsage)
geo.setAttribute('iVel', aVel)
geo.instanceCount = N

const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
export const texture = target.texture

const mat = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3,
  transparent: true,
  depthTest: false,
  depthWrite: false,
  // Couleurs prémultipliées : l'image garde la couleur et l'opacité cumulées des nappes
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  uniforms: {
    tDepth: { value: null },
    uNear: { value: 0.05 },
    uFar: { value: 500 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uOpacity: { value: params.opacite },
    uSparkle: { value: params.paillettes },
    uStretch: { value: params.etirement },
    uScale: { value: params.echelle },
  },
  vertexShader: /* glsl */ `
    in vec3 iPos, iVel;
    in vec4 iData;
    uniform float uStretch;
    out vec2 vUv;
    out vec3 vWorld;
    out float vDepth, vSeed, vAlpha;
    void main() {
      vec4 c = viewMatrix * vec4(iPos, 1.0);
      float s = sin(iData.y), co = cos(iData.y);
      vec2 corner = mat2(co, s, -s, co) * position.xy * iData.x; // nappe face à la caméra, tournée sur elle-même
      // Étirée dans le sens de son mouvement à l'écran : plus elle va vite, plus elle s'allonge en traînée
      vec2 v = (mat3(viewMatrix) * iVel).xy;
      float sp = length(v);
      if (sp > 0.05) {
        vec2 dir = v / sp;
        corner += dir * dot(corner, dir) * min(sp * 0.35, 3.0) * uStretch;
      }
      c.xy += corner;
      // Position du point dans la station : le motif de la brume y est calculé, commun à toutes les nappes
      vWorld = (inverse(viewMatrix) * c).xyz;
      vUv = position.xy + 0.5;
      vDepth = -c.z;
      vSeed = iData.z;
      vAlpha = iData.w;
      gl_Position = projectionMatrix * c;
    }`,
  fragmentShader: /* glsl */ `
    precision highp float;
    in vec2 vUv;
    in vec3 vWorld;
    in float vDepth, vSeed, vAlpha;
    out vec4 fragColor;
    uniform sampler2D tDepth;
    uniform float uNear, uFar, uTime, uOpacity, uSparkle, uScale;
    uniform vec2 uRes;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
    }
    float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
    float noise3(vec3 p) {
      vec3 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
                 mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
    }
    float fbm3(vec3 p) {
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 3; i++) { v += a * noise3(p); p = p * 2.07 + 13.0; a *= 0.5; }
      return v / 0.875;
    }

    void main() {
      // Forme : une tache très douce, sans contour visible. La densité vient d'un motif calculé dans
      // l'espace de la station, qui dérive lentement : là où les nappes se chevauchent, elles dessinent
      // une seule masse de brume, avec des zones épaisses et des trouées qui ne suivent pas leurs bords.
      vec2 q = vUv - 0.5;
      float shape = exp(-dot(q, q) * 9.0) - 0.105; // nulle au bord de la nappe
      shape = max(shape, 0.0) / 0.895;
      vec3 w = vWorld * uScale + vec3(0.0, 0.0, uTime * 0.12);
      float n = fbm3(w);
      float dens = smoothstep(0.28, 0.72, n + 0.12 * fbm3(w * 3.1 + 5.0));
      float a = shape * (0.12 + 0.88 * dens);

      // Contact doux avec le décor et le métro, et effacement tout près de la caméra
      float z = texture(tDepth, gl_FragCoord.xy / uRes).r;
      float sceneDepth = -(uNear * uFar) / ((uFar - uNear) * z - uFar);
      a *= smoothstep(0.0, 1.2, sceneDepth - vDepth) * smoothstep(0.6, 2.5, vDepth);
      a *= vAlpha * uOpacity;

      vec3 col = mix(vec3(0.99, 0.86, 0.92), vec3(0.95, 0.78, 0.86), dens); // mêmes roses que la brume de la photo
      fragColor = vec4(col * a, a);

      // Paillettes, comme dans la brume de la photo : de rares points très fins accrochés à la nappe,
      // qui scintillent, avec une étoile à quatre branches. Leur taille est fixe à l'écran (en pixels).
      float inside = a / max(vAlpha * uOpacity, 1e-3); // forme de la nappe, sans son opacité
      if (uSparkle <= 0.0 || inside < 0.08) return;
      vec2 px = 1.0 / max(fwidth(vUv), vec2(1e-5)); // pixels par unité de nappe
      vec2 g = vUv * 7.0;
      vec3 spark = vec3(0.0);
      for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
        vec2 cell = floor(g) + vec2(dx, dy);
        float h = hash(cell + vSeed * 13.1);
        if (h < 0.9) continue; // une case sur dix porte une paillette
        vec2 spot = (cell + 0.2 + 0.6 * vec2(hash(cell + 3.7 + vSeed), hash(cell + 7.1 + vSeed))) / 7.0;
        vec2 d = (vUv - spot) * px; // écart en pixels
        float tw = 0.3 + 0.7 * pow(0.5 + 0.5 * sin(uTime * (0.8 + 1.5 * fract(h * 97.0)) + h * 60.0), 3.0);
        float core = smoothstep(1.4, 0.0, length(d));
        vec2 r = mat2(0.96, -0.28, 0.28, 0.96) * d;
        float len = 9.0 * tw;
        float star = max(0.0, 1.0 - abs(r.x) / len) * smoothstep(0.7, 0.0, abs(r.y))
                   + max(0.0, 1.0 - abs(r.y) / len) * smoothstep(0.7, 0.0, abs(r.x));
        float hue = hash(cell + 13.3 + vSeed);
        vec3 tint = hue < 0.33 ? mix(vec3(0.94, 0.95, 1.0), vec3(1.0, 0.9, 0.62), 0.5 + 0.5 * hue / 0.33) : mix(vec3(0.94, 0.95, 1.0), vec3(1.0, 0.9, 0.62), 0.15 * hue);
        spark += tint * tw * (core + 0.7 * star * star);
      }
      // Ajoutées en lumière (sans changer l'opacité), là où la nappe est présente
      fragColor.rgb += spark * smoothstep(0.08, 0.4, inside) * vAlpha * uSparkle * 0.9;
    }`,
})
const mesh = new THREE.Mesh(geo, mat)
mesh.frustumCulled = false
const scene = new THREE.Scene()
scene.add(mesh)

export function init(depthTexture, camera) {
  mat.uniforms.tDepth.value = depthTexture
  mat.uniforms.uNear.value = camera.near
  mat.uniforms.uFar.value = camera.far
}

export function setSize(w, h) {
  target.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1))
  mat.uniforms.uRes.value.set(target.width, target.height)
}

// ---------- Mouvement ----------

let emis = 0 // nappes à faire naître (fraction cumulée)
let trainee = 0 // 1 juste après le passage du train, puis redescend : le tunnel continue de souffler
const prevCentre = new THREE.Vector3()
let hasPrev = false
const tv = new THREE.Vector3()

// box : boîte du métro dans la station (null s'il n'est pas chargé)
export function update(dt, time, box) {
  mat.uniforms.uTime.value = time
  mat.uniforms.uOpacity.value = params.opacite
  mat.uniforms.uSparkle.value = params.paillettes
  mat.uniforms.uStretch.value = params.etirement
  mat.uniforms.uScale.value = params.echelle
  if (dt <= 0) return

  // Vitesse du train (le long de z), déduite de son déplacement
  let vz = 0
  if (box) {
    const c = box.getCenter(tv)
    if (hasPrev) vz = (c.z - prevCentre.z) / dt
    prevCentre.copy(c)
    hasPrev = true
  }
  const s = Math.abs(vz), dir = Math.sign(vz) // le train avance vers les z négatifs : dir = -1
  const cx = box ? (box.min.x + box.max.x) / 2 : 0
  const hw = box ? (box.max.x - box.min.x) / 2 : 0
  const nose = dir < 0 ? box?.min.z : box?.max.z
  const tail = dir < 0 ? box?.max.z : box?.min.z
  const freinage = 1 - Math.exp(-dt / params.calme)

  // Émission : la brume sort du tunnel au repos ; le nez du train en expulse une bouffée, puis l'air
  // entraîné le long de la caisse en sort encore tant que le train n'est pas sorti du tunnel
  trainee *= Math.exp(-dt / (params.apresDuree / 3))
  if (box && s > 0.5 && (nose > -14 || tail > 0)) trainee = 1
  emis += (params.emission + params.apres * trainee) * dt
  if (box && s > 0.5) {
    if (nose > -14) emis += (params.bouffee / 1.5) * dt * Math.min(1, s / 8)
    else if (tail > 0) emis += 25 * dt
  }
  while (emis >= 1) {
    emis -= 1
    if (box && s > 0.5 && nose > -14) {
      // Devant le nez, encore dans le tunnel, lancée à presque la vitesse du train, et déjà agitée
      const z = nose - rnd(0.3, 4)
      let x = cx + rnd(-hw - 1.5, hw + 1.5), y = rnd(-0.8, box.max.y + 0.5)
      if (z > -0.3) { x = THREE.MathUtils.clamp(x, ...TUNNEL.x); y = Math.min(y, TUNNEL.y[1]) }
      spawn(x, y, z, (Math.sign(x - cx) || 1) * rnd(0, 1.5), rnd(0, 0.5), dir * s * rnd(0.5, 0.9), 1.5)
    } else if (box && s > 0.5 && tail > 0) {
      // Par les côtés et au-dessus de la caisse, entraînée par le train hors du tunnel
      const cote = Math.random() < 0.5 ? -1 : 1
      const x = THREE.MathUtils.clamp(cx + cote * (hw + rnd(0.1, 1)), ...TUNNEL.x)
      spawn(x, rnd(-0.8, TUNNEL.y[1]), rnd(0.5, 3), cote * rnd(0, 0.8), 0, dir * s * rnd(0.3, 0.5), 1)
    } else {
      spawn(...sortieTunnel())
    }
  }

  for (let i = 0; i < N; i++) {
    const p = puffs[i], P = p.pos, V = p.vel
    if (!p.alive) { aData.setXYZW(i, 0, 0, 0, 0); continue }
    p.age += dt
    if (p.age > p.maxAge) { p.alive = false; aData.setXYZW(i, 0, 0, 0, 0); continue }

    if (box && s > 0.05) {
      const side = Math.sign(P.x - cx) || 1
      const dl = Math.hypot(Math.max(Math.abs(P.x - cx) - hw, 0), Math.max(P.y - box.max.y, 0)) // écart à la caisse
      const ahead = (nose - P.z) * -dir // > 0 devant le nez
      const behind = (P.z - tail) * -dir // > 0 derrière la queue
      const k = params.souffle
      if (ahead > 0) {
        // Devant le nez : l'air est chassé vers l'avant, et s'écarte sur les côtés tout près du nez
        const f = Math.exp(-ahead / 5) * Math.exp(-dl / 2.5)
        V.z += (dir * s * 0.8 - V.z) * Math.min(1, f * k * dt * 3)
        V.x += side * s * 0.5 * Math.exp(-ahead / 1.5) * Math.exp(-dl / 1.5) * k * dt * 3
        p.agit += f * s * 0.15 * dt
      } else if (behind < 0) {
        // Le long de la caisse : l'air est entraîné, et se met à tourner
        const f = Math.exp(-dl / 1.2)
        V.z += (dir * s * 0.4 - V.z) * Math.min(1, f * k * dt * 2)
        p.agit += f * s * 0.25 * dt
      } else {
        // Dans le sillage : aspiré derrière le train, et très agité
        const f = Math.exp(-behind / 6) * Math.exp(-dl / 2)
        V.z += dir * s * 0.5 * f * k * dt
        p.agit += f * s * 0.3 * dt
      }
    }

    // Tourbillons : un courant qui change selon l'endroit et le moment, d'autant plus fort que la nappe est agitée
    const t = time * 0.6 + p.seed
    const g = Math.min(p.agit, 3) * params.tourbillons
    V.x += Math.sin(P.z * 0.45 + t) * g * dt * 1.5
    V.y += Math.sin(P.x * 0.6 + t * 1.3 + p.seed) * g * dt * 0.8
    V.z += Math.cos(P.y * 0.7 + t * 0.8) * g * dt * 1.5
    p.spin += Math.sin(t * 1.7) * g * dt * 0.6
    p.agit *= Math.exp(-dt / (params.calme * 1.5))

    // Chaque nappe perd son élan peu à peu et revient à sa dérive lente vers le quai
    V.lerp(p.drift, freinage)
    p.spin *= 1 - freinage * 0.5
    P.addScaledVector(V, dt)
    p.angle += p.spin * dt

    // La nappe ne traverse ni la caisse, ni le sol, ni les murs
    if (box && P.z > box.min.z && P.z < box.max.z && P.y < box.max.y && Math.abs(P.x - cx) < hw + 0.3) {
      P.x = cx + (Math.sign(P.x - cx) || 1) * (hw + 0.3)
      V.x = 0
    }
    if (P.y < LIMITES.y[0]) { P.y = LIMITES.y[0]; V.y = Math.abs(V.y) * 0.3 }
    P.x = THREE.MathUtils.clamp(P.x, ...LIMITES.x)
    P.y = Math.min(P.y, LIMITES.y[1])
    if (P.z > LIMITES.z[1]) {
      if (dansTunnel(P)) P.z = Math.min(P.z, 8) // encore dans le tunnel
      else { P.z = LIMITES.z[1]; V.z = Math.min(V.z, 0) } // contre le mur du fond
    }
    if (P.z < LIMITES.z[0]) p.age = Math.max(p.age, p.maxAge - 3) // sortie de la station : elle s'efface

    // Apparition et disparition en fondu ; elle s'étale un peu en vieillissant
    const alpha = Math.min(1, p.age / 2.5) * Math.min(1, (p.maxAge - p.age) / 6)
    aPos.setXYZ(i, P.x, P.y, P.z)
    aVel.setXYZ(i, V.x, V.y, V.z)
    aData.setXYZW(i, params.taille * p.scale * (1 + 0.5 * p.age / p.maxAge), p.angle, p.seed, alpha)
  }
  aPos.needsUpdate = true
  aVel.needsUpdate = true
  aData.needsUpdate = true
}

const clear = new THREE.Color()
export function render(renderer, camera) {
  renderer.getClearColor(clear)
  const alpha = renderer.getClearAlpha()
  renderer.setRenderTarget(target)
  renderer.setClearColor(0x000000, 0)
  renderer.clear()
  if (params.visible) renderer.render(scene, camera)
  renderer.setClearColor(clear, alpha)
}

export function addGui(gui) {
  const f = gui.addFolder('Brume 3D')
  f.add(params, 'visible').name('Visible')
  f.add(params, 'opacite', 0, 1, 0.01).name('Opacité')
  f.add(params, 'taille', 1, 12, 0.1).name('Taille (m)')
  f.add(params, 'echelle', 0.05, 1, 0.01).name('Finesse des volutes')
  f.add(params, 'etirement', 0, 3, 0.05).name('Étirement au souffle')
  f.add(params, 'emission', 0, 5, 0.1).name('Sortie du tunnel (/s)')
  f.add(params, 'bouffee', 0, 250, 1).name('Bouffée du train')
  f.add(params, 'apres', 0, 20, 0.5).name('Flux après le train (/s)')
  f.add(params, 'apresDuree', 2, 40, 1).name('Durée du flux après (s)')
  f.add(params, 'souffle', 0, 3, 0.05).name('Poussée du train')
  f.add(params, 'tourbillons', 0, 3, 0.05).name('Tourbillons')
  f.add(params, 'calme', 1, 12, 0.5).name('Retour au calme (s)')
  f.add(params, 'paillettes', 0, 3, 0.05).name('Paillettes')
}
