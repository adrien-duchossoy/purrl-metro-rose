// Scène 1 : parallaxe par depth map, pilotée par la souris (desktop)
// ou par l'inclinaison du téléphone (mobile).
//
// Principe : chaque pixel est décalé selon sa profondeur.
// Proche (blanc) = bouge beaucoup, loin (noir) = bouge peu.

const IMAGE_URL = '/decor.jpg'
const depthUrl = (name) => `/decor_depth_${name}.png`
const query = new URLSearchParams(location.search)

const $ = (id) => document.getElementById(id)
const canvas = $('gl1')
const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false })
if (!gl) document.body.innerHTML = '<p style="padding:20px">WebGL2 indisponible sur ce navigateur.</p>'

// ---------- Shaders ----------

const vert = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

const frag = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uImage;     // mode une image : le décor
uniform sampler2D uDepth;     // mode une image : sa depth map
uniform sampler2D uBg;        // mode calques : fond sans les lampes
uniform sampler2D uBgDepth;
uniform sampler2D uObj;       // mode calques : lampes + halo (RGBA)
uniform sampler2D uObjDepth;
uniform float uDepths[16];    // profondeur de chaque lampe (une seule valeur : la lampe est rigide)
uniform int uOrder[16];       // lampes triées de la plus lointaine à la plus proche
uniform int uCount;
uniform sampler2D uAtlas;     // chaque lustre recadré, avec ses parties cachées complétées
uniform vec4 uBox[16];        // position du lustre dans le décor (x, y, largeur, hauteur), en 0-1
uniform vec4 uRect[16];       // position du lustre dans l'atlas, en 0-1
uniform float uLayered;
uniform vec2 uOffset;     // direction et force du mouvement de caméra
uniform float uFocus;     // profondeur qui reste immobile (le pivot)
uniform vec2 uCoverScale; // remplissage de l'écran sans déformation
uniform vec2 uCoverShift; // cadrage (où on coupe sur mobile)
uniform float uShowDepth;
uniform float uTime;      // secondes, pour faire dériver la brume
uniform float uFog;       // densité de la brume (0 = aucune)

// On cherche le point de l'image qui, une fois décalé, tombe sur ce pixel.
// Quelques itérations suffisent pour un mouvement léger.
vec2 displace(sampler2D depth, vec2 uv) {
  vec2 p = uv;
  for (int i = 0; i < 8; i++) {
    p = uv + uOffset * (texture(depth, p).r - uFocus);
  }
  return p;
}

// Bruit doux pour dessiner les nappes de brume
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return v;
}
// Bruit « en choux-fleurs » : des bosses arrondies serrées, comme le bord d'un nuage
float billow(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * (1.0 - abs(2.0 * noise(p) - 1.0)); p = p * 2.07 + 31.0; a *= 0.5; }
  return v;
}

// La brume sort du fond du tunnel et avance lentement vers le quai, en nuages séparés.
// Six nuages se suivent : chacun naît au fond, avance en profondeur, grossit en approchant
// (perspective, centrée sur le fond du tunnel), puis s'efface au premier plan et repart du fond.
// Chaque passage tire au hasard sa vitesse, sa place, sa forme et parfois ne montre rien,
// pour que le mouvement ne se répète pas. Un nuage n'apparaît que là où le décor est derrière lui.
const vec2 TUNNEL = vec2(0.481, 0.569); // fond du tunnel dans l'image (point le plus lointain de la depth)
const float CYCLE = 30.0;               // durée moyenne d'un trajet du fond au premier plan, en secondes

vec3 addFog(vec3 col, vec2 uv, float scene) {
  const vec3 fogLight = vec3(0.99, 0.86, 0.92); // bords fins du nuage, éclairés
  const vec3 fogDeep = vec3(0.95, 0.78, 0.86);  // cœur épais, un peu plus rose et dans l'ombre
  const vec3 lilac = vec3(0.84, 0.82, 0.98);    // reflets bleu-violet
  const vec3 silver = vec3(0.94, 0.95, 1.0);    // paillettes argentées
  const vec3 gold = vec3(1.0, 0.9, 0.62);       // paillettes dorées
  const int N = 6;
  for (int i = 0; i < N; i++) {
    float fi = float(i);
    // Chaque nuage a sa propre vitesse (de 0,7 à 1,3 fois la moyenne) et son propre départ
    float speed = mix(0.7, 1.3, hash(vec2(fi, 3.1)));
    float life = uTime * speed / CYCLE + hash(vec2(fi, 8.7));
    float k = fract(life);                     // 0 au fond du tunnel, 1 au premier plan
    float pass = floor(life);
    vec2 rnd = vec2(hash(vec2(pass, fi)), hash(vec2(fi, pass + 4.2)));
    if (hash(vec2(pass + 1.7, fi * 3.3)) < 0.25) continue; // un passage sur quatre : pas de nuage

    float fd = mix(0.04, 0.97, k);             // profondeur du nuage
    vec2 q = uv + uOffset * (fd - uFocus);
    float grow = 1.0 / (1.0 - 0.82 * fd);      // plus le nuage est proche, plus il paraît grand
    vec2 drift = (rnd - 0.5) * vec2(0.5, 0.18) * k; // chaque nuage s'écarte un peu de l'axe du tunnel
    vec2 n = (q - TUNNEL - drift) / grow * vec2(1.78, 1.0) * 3.0 + rnd * 40.0;
    n += vec2(uTime * 0.012, uTime * 0.004);   // les volutes tournent doucement sur elles-mêmes

    // Forme : de grosses masses tordues par un courant, des bosses arrondies sur les bords,
    // et une épaisseur qui varie à l'intérieur (des trous, des parties plus denses)
    vec2 warp = vec2(noise(n * 0.7), noise(n * 0.7 + 9.1)) - 0.5;
    float body = fbm(n * 0.55 + warp * 1.6);
    float puffs = billow(n * 1.6 + 11.0);
    float cover = smoothstep(0.44, 0.6, body + (puffs - 0.5) * 0.4);
    float thick = smoothstep(0.35, 0.85, billow(n * 3.1 + 23.0) * 0.6 + body * 0.6);
    float cloud = cover * mix(0.3, 1.0, thick);

    float life01 = smoothstep(0.0, 0.18, k) * (1.0 - smoothstep(0.65, 1.0, k)); // apparaît puis s'efface
    float behind = smoothstep(0.0, 0.08, fd - scene); // 1 si le décor est plus loin que le nuage
    vec3 fogCol = mix(fogLight, fogDeep, thick * cover);
    // Reflets bleu-violet : de grandes zones légères qui glissent dans le nuage, surtout là où il est fin
    float sheen = smoothstep(0.5, 0.78, fbm(n * 0.35 + 50.0 + uTime * 0.01));
    fogCol = mix(fogCol, lilac, sheen * 0.32 * (1.0 - 0.5 * thick));
    float show = behind * life01;
    col = mix(col, fogCol, cloud * show * uFog * mix(0.95, 0.55, k));

    // Paillettes : de rares points très fins, accrochés au nuage, qui scintillent.
    // Elles vivent presque tout le trajet du nuage, jusqu'aux bords de l'écran.
    // Les cases grandissent avec la perspective : on en allume plus, pour garder la même densité à l'écran.
    vec2 local = (q - TUNNEL - drift) / grow * vec2(1.78, 1.0) * 140.0;
    float prob = min(0.15, 0.004 * grow * grow);
    float glow = smoothstep(0.03, 0.15, k) * (1.0 - smoothstep(0.88, 1.0, k)) * behind * smoothstep(0.0, 0.35, cover);
    vec3 spark = vec3(0.0);
    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        vec2 cell = floor(local) + vec2(dx, dy); // cases voisines aussi : l'étoile déborde de sa case
        float h = hash(cell + rnd * 91.0);
        if (h < 1.0 - prob) continue;
        vec2 spot = cell + 0.2 + 0.6 * vec2(hash(cell + 3.7), hash(cell + 7.1));
        vec2 dv = (local - spot) * grow / 140.0; // écart au point, à l'échelle de l'écran
        float tw = 0.3 + 0.7 * pow(0.5 + 0.5 * sin(uTime * (0.8 + 1.5 * fract(h * 97.0)) + h * 60.0), 3.0);
        float core = smoothstep(0.0018, 0.0, length(dv));
        // Étoile de l'objectif : quatre branches fines, un peu inclinées, qui s'allongent quand le point brille
        vec2 r = mat2(0.96, -0.28, 0.28, 0.96) * dv;
        float len = 0.017 * tw;
        float star = max(0.0, 1.0 - abs(r.x) / len) * smoothstep(0.0009, 0.0, abs(r.y))
                   + max(0.0, 1.0 - abs(r.y) / len) * smoothstep(0.0009, 0.0, abs(r.x));
        // Couleur propre à chaque paillette : surtout argentée, un tiers tire vers le doré
        float hue = hash(cell + 13.3);
        vec3 tint = hue < 0.33 ? mix(silver, gold, 0.5 + 0.5 * hue / 0.33) : mix(silver, gold, 0.15 * hue);
        spark += tint * tw * (core + 0.7 * star * star);
      }
    }
    col += spark * glow * min(uFog, 1.0) * 0.9;
  }
  return col;
}

void main() {
  // Coordonnées écran -> coordonnées image (mode "cover")
  vec2 uv = (vUv - 0.5) * uCoverScale + 0.5 + uCoverShift;
  uv.y = 1.0 - uv.y;

  vec3 col;
  float shown;
  if (uLayered > 0.5) {
    // Le fond se déforme selon sa depth map (c'est une surface continue)
    vec2 pb = displace(uBgDepth, uv);
    col = texture(uBg, pb).rgb;
    shown = texture(uBgDepth, pb).r;

    // Chaque lampe glisse d'un bloc selon sa propre profondeur, de la plus lointaine à la plus proche
    for (int k = 0; k < 16; k++) {
      if (k >= uCount) break;
      int id = uOrder[k];
      float dk = uDepths[id];
      vec2 q = uv + uOffset * (dk - uFocus);
      // Le lustre (et son halo) vient de son propre calque, tel que dessiné à la main
      vec2 local = (q - uBox[id].xy) / uBox[id].zw;
      vec4 obj = vec4(0.0);
      if (all(greaterThanEqual(local, vec2(0.0))) && all(lessThanEqual(local, vec2(1.0))))
        obj = texture(uAtlas, uRect[id].xy + local * uRect[id].zw);
      col = mix(col, obj.rgb, obj.a);
      shown = mix(shown, dk, obj.a);
    }
  } else {
    vec2 p = displace(uDepth, uv);
    col = texture(uImage, p).rgb;
    shown = texture(uDepth, p).r;
  }
  col = addFog(col, uv, shown);
  if (uShowDepth > 0.5) col = vec3(shown);
  outColor = vec4(col, 1.0);
}`

function compile(type, src) {
  const s = gl.createShader(type)
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
  return s
}

const prog = gl.createProgram()
gl.attachShader(prog, compile(gl.VERTEX_SHADER, vert))
gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag))
gl.linkProgram(prog)
gl.useProgram(prog)

const quad = gl.createBuffer()
gl.bindBuffer(gl.ARRAY_BUFFER, quad)
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
const aPos = gl.getAttribLocation(prog, 'aPos')
gl.enableVertexAttribArray(aPos)
gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

const u = Object.fromEntries(
  [
    'uImage', 'uDepth', 'uBg', 'uBgDepth', 'uObj', 'uObjDepth', 'uDepths', 'uOrder', 'uCount', 'uAtlas', 'uBox', 'uRect',
    'uLayered', 'uOffset', 'uFocus', 'uCoverScale', 'uCoverShift', 'uShowDepth', 'uTime', 'uFog',
  ].map((n) => [n, gl.getUniformLocation(prog, n)])
)

// Unité de texture de chaque image
const TEX = { uImage: 0, uDepth: 1, uBg: 2, uBgDepth: 3, uObj: 4, uObjDepth: 5, uAtlas: 6 }

// exact = true pour une carte de numéros : aucun lissage ni conversion de couleur,
// sinon deux numéros voisins se mélangeraient en un troisième qui n'existe pas
function loadTexture(url, unit, exact = false) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const tex = gl.createTexture()
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, exact ? gl.NONE : gl.BROWSER_DEFAULT_WEBGL)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
      if (exact) {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      } else {
        gl.generateMipmap(gl.TEXTURE_2D)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      resolve({ w: img.naturalWidth, h: img.naturalHeight })
    }
    img.onerror = reject
    img.src = url
  })
}

// ---------- Réglages ----------

let imgSize = { w: 16, h: 9 }

// Partie de la photo visible à l'écran (largeur, hauteur, centre en x), de 0 à 1
export const crop = { w: 1, h: 1, cx: 0.5 }

const params = {
  strength: 0, focus: 0, smooth: 0, gyro: 0, focusX: 0, fog: 0,
  showDepth: false, idle: false,
}
const sliders = { strength: 'vStrength', focus: 'vFocus', smooth: 'vSmooth', gyro: 'vGyro', focusX: 'vFocusX', fog: 'vFog' }

// Valeurs validées au test sur iPhone (26/10)
const MOBILE_DEFAULTS = { strength: 0.055, focus: 0.12, smooth: 0.17, gyro: 18, focusX: 0.39 }
if (matchMedia('(pointer: coarse)').matches) {
  for (const [key, value] of Object.entries(MOBILE_DEFAULTS)) $(key).value = value
}

for (const [key, label] of Object.entries(sliders)) {
  const el = $(key)
  const sync = () => {
    params[key] = parseFloat(el.value)
    $(label).textContent = el.value
    if (key === 'focusX' || key === 'strength' || key === 'focus') resize()
  }
  el.addEventListener('input', sync)
  sync()
}
$('showDepth').onclick = () => {
  params.showDepth = !params.showDepth
  $('showDepth').textContent = params.showDepth ? "Voir l'image" : 'Voir la depth'
}
$('idle').onclick = () => {
  params.idle = !params.idle
  $('idle').textContent = `Balancement : ${params.idle ? 'on' : 'off'}`
}
$('toggle').onclick = () => $('panel').classList.toggle('hidden')

// « calques » = fond + lampes séparés ; sinon une seule image avec la depth map choisie
const depthSel = $('depthSel')
if (query.get('depth')) depthSel.value = query.get('depth')
const isLayered = () => depthSel.value === 'calques'
depthSel.onchange = () => {
  if (!isLayered()) loadTexture(depthUrl(depthSel.value), TEX.uDepth)
}

// ---------- Entrées : souris et gyroscope ----------

const target = { x: 0, y: 0 } // -1..1
const current = { x: 0, y: 0 }
let gyroOn = false
let base = null

window.addEventListener('pointermove', (e) => {
  if (gyroOn || e.pointerType === 'touch') return
  target.x = (e.clientX / innerWidth) * 2 - 1
  target.y = (e.clientY / innerHeight) * 2 - 1
})
document.addEventListener('pointerleave', () => { if (!gyroOn) { target.x = 0; target.y = 0 } })

function onOrientation(e) {
  if (e.beta == null || e.gamma == null) return
  // L'inclinaison dépend du sens dans lequel on tient le téléphone
  const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0
  let x = e.gamma, y = e.beta
  if (angle === 90) { x = e.beta; y = -e.gamma }
  else if (angle === -90 || angle === 270) { x = -e.beta; y = e.gamma }
  if (!base) base = { x, y }
  const range = params.gyro
  target.x = Math.max(-1, Math.min(1, (x - base.x) / range))
  target.y = Math.max(-1, Math.min(1, (y - base.y) / range))
  gyroOn = true
}

$('recenter').onclick = () => { base = null }

async function enableMotion() {
  const isTouch = matchMedia('(pointer: coarse)').matches
  if (!isTouch) { $('status').textContent = 'Desktop : la souris pilote la caméra.'; return }
  try {
    // iPhone : autorisation obligatoire, uniquement après un toucher
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const res = await DeviceOrientationEvent.requestPermission()
      if (res !== 'granted') { $('status').textContent = 'Gyroscope refusé. Réglages > Safari > Mouvement.'; return }
    }
    window.addEventListener('deviceorientation', onOrientation)
    $('status').textContent = "Gyroscope actif. Penche le téléphone. « Recentrer » reprend la position actuelle comme neutre."
  } catch (err) {
    $('status').textContent = `Gyroscope indisponible : ${err.message}`
  }
}

$('startBtn').onclick = async () => {
  await enableMotion()
  $('start').classList.add('hidden')
}

// ---------- Rendu ----------

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2)
  canvas.width = Math.round(innerWidth * dpr)
  canvas.height = Math.round(innerHeight * dpr)
  gl.viewport(0, 0, canvas.width, canvas.height)

  // Mode "cover" : l'image remplit l'écran sans déformation
  const screenAR = innerWidth / innerHeight
  const imageAR = imgSize.w / imgSize.h
  let sx = 1, sy = 1
  if (screenAR < imageAR) sx = screenAR / imageAR
  else sy = imageAR / screenAR

  // Marge réservée au mouvement : le décalage maximal d'un pixel, sur chaque axe.
  // Sans elle, le bord de l'image s'étire en traînées quand on penche à fond.
  const reach = params.strength * Math.max(params.focus, 1 - params.focus) * 1.05
  const mx = reach, my = reach * 0.6
  const zoom = Math.max(1, sx / (1 - 2 * mx), sy / (1 - 2 * my))
  sx /= zoom
  sy /= zoom
  gl.uniform2f(u.uCoverScale, sx, sy)

  // Cadrage horizontal : utile sur mobile où l'on ne voit qu'une partie de l'image
  const freeX = Math.max(0, (1 - sx) / 2 - mx)
  const shift = (params.focusX - 0.5) * 2 * freeX
  gl.uniform2f(u.uCoverShift, shift, 0)

  // Partie de la photo visible à l'écran : la scène 2 reprend exactement ce cadrage
  crop.w = sx
  crop.h = sy
  crop.cx = 0.5 + shift
}
window.addEventListener('resize', resize)

// Test : ?pose=1,0 force la caméra dans une position (de -1 à 1)
const pose = query.get('pose')?.split(',').map(Number)

// Avant de passer à la scène 2 : la caméra revient au centre et la brume s'efface,
// pour que l'image redevienne exactement la photo d'origine
let settling = null
let running = true
let fogMul = 1

export function settle(ms) {
  return new Promise((resolve) => { settling = { start: performance.now(), ms, resolve } })
}

export function stop() { running = false }

// Tant que hold(true) est actif, la caméra revient au centre et y reste
let holding = false
export function hold(on) { holding = on }

function frame(t) {
  if (!running) return
  let tx = target.x, ty = target.y
  if (pose) { tx = pose[0]; ty = pose[1] ?? 0 }
  if (params.idle && !gyroOn) {
    tx += Math.sin(t * 0.0004) * 0.6
    ty += Math.sin(t * 0.0003 + 1.3) * 0.3
  }
  if (holding) {
    tx = 0
    ty = 0
  }
  if (settling) {
    const k = Math.min(1, (t - settling.start) / settling.ms)
    tx = 0
    ty = 0
    fogMul = 1 - k
    if (k >= 1) {
      current.x = 0
      current.y = 0
      settling.resolve()
      settling = null
    }
  }
  // Lissage : la caméra rattrape la cible en douceur
  current.x += (tx - current.x) * params.smooth
  current.y += (ty - current.y) * params.smooth

  const s = params.strength
  gl.uniform2f(u.uOffset, current.x * s, -current.y * s * 0.6)
  gl.uniform1f(u.uFocus, params.focus)
  gl.uniform1f(u.uShowDepth, params.showDepth ? 1 : 0)
  gl.uniform1f(u.uTime, t / 1000)
  gl.uniform1f(u.uFog, params.fog * fogMul)
  gl.uniform1f(u.uLayered, isLayered() ? 1 : 0)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  requestAnimationFrame(frame)
}

for (const [name, unit] of Object.entries(TEX)) gl.uniform1i(u[name], unit)

Promise.all([
  loadTexture(IMAGE_URL, TEX.uImage),
  loadTexture(depthUrl(isLayered() ? 'moyen' : depthSel.value), TEX.uDepth),
  loadTexture('/bg.jpg', TEX.uBg),
  loadTexture('/bg_depth.png', TEX.uBgDepth),
  loadTexture('/objects.png', TEX.uObj),
  loadTexture('/objects_depth.png', TEX.uObjDepth),
  loadTexture('/lamps_atlas.png', TEX.uAtlas),
  fetch('/lamps.json').then((r) => r.json()).then(({ image: [W, H], atlas: [AW, AH], lamps }) => {
    // Les lustres sont rangés du plus lointain au plus proche : c'est l'ordre d'affichage
    const pad = (arr) => [...arr, ...new Array(16 * 4 - arr.length).fill(0)]
    gl.uniform1fv(u.uDepths, new Float32Array(16).map((_, i) => lamps[i]?.depth ?? 0))
    gl.uniform1iv(u.uOrder, new Int32Array(16).map((_, i) => i))
    gl.uniform1i(u.uCount, Math.min(lamps.length, 16))
    gl.uniform4fv(u.uBox, new Float32Array(pad(lamps.flatMap(({ box: [x, y, w, h] }) => [x / W, y / H, w / W, h / H]))))
    gl.uniform4fv(u.uRect, new Float32Array(pad(lamps.flatMap(({ atlas: [x, y, w, h] }) => [x / AW, y / AH, w / AW, h / AH]))))
  }),
]).then(([img]) => {
  imgSize = img
  resize()
  requestAnimationFrame(frame)
})
