// Brume rose partagée par la scène 1 (parallaxe) et la scène 2 (3D) : même code, mêmes nuages.
// Le shader qui l'inclut doit déclarer avant : uTime, uFog, uOffset, uFocus.

export const FOG_GLSL = /* glsl */ `
// Scène 2 : à partir de uStop (secondes), plus aucun nuage ne part du fond ; ceux en route finissent leur trajet
#ifndef STOP_NUAGES
const float uStop = 1e9;
#endif

// Bruit doux pour dessiner les nuages
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

const vec3 fogLight = vec3(0.99, 0.86, 0.92); // bords fins du nuage, éclairés
const vec3 fogDeep = vec3(0.95, 0.78, 0.86);  // cœur épais, un peu plus rose et dans l'ombre
const vec3 lilac = vec3(0.84, 0.82, 0.98);    // reflets bleu-violet
const vec3 silver = vec3(0.94, 0.95, 1.0);    // paillettes argentées
const vec3 gold = vec3(1.0, 0.9, 0.62);       // paillettes dorées
const float CYCLE = 30.0;                     // durée moyenne d'un trajet du fond au premier plan, en secondes

// Aspect d'un nuage au point n du motif. erode grignote le nuage (bords des nuages 3D).
// Rend la couleur, l'opacité, et la couverture (0 hors du nuage, 1 dedans).
void cloudLook(vec2 n, float erode, out vec3 fogCol, out float cloud, out float cover) {
  // De grosses masses tordues par un courant, des bosses arrondies sur les bords,
  // et une épaisseur qui varie à l'intérieur (des trous, des parties plus denses)
  vec2 warp = vec2(noise(n * 0.7), noise(n * 0.7 + 9.1)) - 0.5;
  float body = fbm(n * 0.55 + warp * 1.6);
  float puffs = billow(n * 1.6 + 11.0);
  cover = smoothstep(0.44, 0.6, body + (puffs - 0.5) * 0.4 - erode);
  float thick = smoothstep(0.35, 0.85, billow(n * 3.1 + 23.0) * 0.6 + body * 0.6);
  cloud = cover * mix(0.3, 1.0, thick);
  fogCol = mix(fogLight, fogDeep, thick * cover);
  // Reflets bleu-violet : de grandes zones légères qui glissent dans le nuage, surtout là où il est fin
  float sheen = smoothstep(0.5, 0.78, fbm(n * 0.35 + 50.0 + uTime * 0.01));
  fogCol = mix(fogCol, lilac, sheen * 0.32 * (1.0 - 0.5 * thick));
}

// Paillettes : de rares points très fins, accrochés au nuage, qui scintillent.
// local : position dans le nuage, une case par unité. toScreen : taille d'une case à l'écran
// (en hauteur d'écran). prob : part des cases allumées.
vec3 sparkles(vec2 local, float toScreen, vec2 rnd, float prob) {
  vec3 spark = vec3(0.0);
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 cell = floor(local) + vec2(dx, dy); // cases voisines aussi : l'étoile déborde de sa case
      float h = hash(cell + rnd * 91.0);
      if (h < 1.0 - prob) continue;
      vec2 spot = cell + 0.2 + 0.6 * vec2(hash(cell + 3.7), hash(cell + 7.1));
      vec2 dv = (local - spot) * toScreen; // écart au point, à l'échelle de l'écran
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
  return spark;
}

// La brume de la scène 1 : elle sort du fond du tunnel et avance lentement vers le quai, en nuages séparés.
// Six nuages se suivent : chacun naît au fond, avance en profondeur, grossit en approchant
// (perspective, centrée sur le fond du tunnel), puis s'efface au premier plan et repart du fond.
// Chaque passage tire au hasard sa vitesse, sa place, sa forme et parfois ne montre rien,
// pour que le mouvement ne se répète pas. Un nuage n'apparaît que là où le décor est derrière lui.
//
// La brume est décrite par l'angle du regard autour de la caméra, pas par la position dans la photo :
// quand la caméra de la scène 2 tourne, la brume tourne exactement avec le décor, sans se déformer.
// dq : direction du regard vue depuis la caméra de la photo. scene : profondeur du décor (0 loin, 1 près).
const vec2 TUNNEL = vec2(0.481, 0.569); // fond du tunnel dans l'image (point le plus lointain de la depth)

// Direction du regard pour un point uv de la photo (objectif 24 mm, capteur 36 mm, format 2752 x 1536)
vec3 quaiDir(vec2 uv) {
  return normalize(vec3((uv.x - 0.5) / 0.66667, -(uv.y - 0.5) / 1.19444, -1.0));
}

vec3 addFog(vec3 col, vec3 dq, float scene) {
  // Angles du regard, mis à l'échelle de la photo : au centre, c'est la même chose que la position dans l'image
  vec2 uv = vec2(0.5 + 0.66667 * atan(dq.x, -dq.z), 0.5 - 1.19444 * atan(dq.y, length(dq.xz)));
  const int N = 6;
  for (int i = 0; i < N; i++) {
    float fi = float(i);
    // Chaque nuage a sa propre vitesse (de 0,7 à 1,3 fois la moyenne) et son propre départ
    float speed = mix(0.7, 1.3, hash(vec2(fi, 3.1)));
    float life = uTime * speed / CYCLE + hash(vec2(fi, 8.7));
    float k = fract(life);                     // 0 au fond du tunnel, 1 au premier plan
    float pass = floor(life);
    vec2 rnd = vec2(hash(vec2(pass, fi)), hash(vec2(fi, pass + 4.2)));
    if (hash(vec2(pass + 1.7, fi * 3.3)) < 0.35) continue; // un passage sur trois environ : pas de nuage
    if ((pass - hash(vec2(fi, 8.7))) * CYCLE / speed > uStop) continue; // parti après l'arrêt de la brume plate

    // Profondeur du nuage : il va du fond du tunnel jusqu'à nous et nous dépasse (au-delà de 1),
    // pour passer aussi sur le quai à nos pieds
    float fd = mix(0.04, 1.12, k);
    vec2 q = uv + uOffset * (fd - uFocus);
    float grow = 1.0 / max(1.0 - 0.82 * fd, 0.08); // plus le nuage est proche, plus il paraît grand
    vec2 drift = (rnd - 0.5) * vec2(0.5, 0.18) * k; // chaque nuage s'écarte un peu de l'axe du tunnel
    vec2 n = (q - TUNNEL - drift) / grow * vec2(1.78, 1.0) * 3.0 + rnd * 40.0;
    n += vec2(uTime * 0.012, uTime * 0.004);   // les volutes tournent doucement sur elles-mêmes

    float life01 = smoothstep(0.0, 0.18, k) * (1.0 - smoothstep(0.8, 1.0, k)); // apparaît puis s'efface en nous dépassant
    float behind = smoothstep(0.0, 0.08, fd - scene); // 1 si le décor est plus loin que le nuage
    if (behind <= 0.0) continue; // nuage caché ici par le décor : inutile de le calculer

    vec3 fogCol;
    float cloud, cover;
    cloudLook(n, 0.0, fogCol, cloud, cover);
    col = mix(col, fogCol, cloud * behind * life01 * uFog * mix(0.95, 0.55, k));

    // Les paillettes vivent presque tout le trajet du nuage, jusqu'aux bords de l'écran.
    // Les cases grandissent avec la perspective : on en allume plus, pour garder la même densité à l'écran.
    vec2 local = (q - TUNNEL - drift) / grow * vec2(1.78, 1.0) * 140.0;
    float prob = min(0.15, 0.004 * grow * grow);
    float glow = smoothstep(0.03, 0.15, k) * (1.0 - smoothstep(0.88, 1.0, k)) * behind * smoothstep(0.0, 0.35, cover);
    col += sparkles(local, grow / 140.0, rnd, prob) * glow * min(uFog, 1.0) * 0.9;
  }
  return col;
}
`
