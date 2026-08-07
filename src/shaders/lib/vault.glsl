const vec3  VAULT_C = vec3(0.0, 150.0, -170.0);
const float R_VAULT = 820.0;
const vec3  ORACLE_DIR = normalize(vec3(0.22, 0.94, -0.26));
const float FLOOR_Y = -380.0;

const float HORIZON_R = 625.7;

float vaultHit(vec3 ro, vec3 rd) {
  vec3 oc = ro - VAULT_C;
  float b = dot(oc, rd);
  float c = dot(oc, oc) - R_VAULT * R_VAULT;
  return -b + sqrt(b * b - c);
}

float vaultPresence(vec3 n) {
  return smoothstep(-0.02, 0.42, n.y);
}

float vaultAperture(vec3 n) {
  float c = max(dot(n, ORACLE_DIR), 0.0);
  float c2 = c * c;
  return c2 * c2 * c2;
}

vec2 vaultQuarter(vec3 n, vec3 u, vec3 v) {
  float cd = dot(n, ORACLE_DIR);
  vec3 tang = n - ORACLE_DIR * cd;
  float tl = max(length(tang), 1e-4);
  float cp = dot(tang, u) / tl;
  float sp = dot(tang, v) / tl;

  float wOracle = smoothstep(0.30, 0.62, cd);
  float wMouth = smoothstep(-0.20, -0.55, cd);
  float rest = (1.0 - wOracle) * (1.0 - wMouth);
  float wChoir = rest * smoothstep(0.55, 0.95, sp);
  float wRiven = rest * smoothstep(0.60, 0.97, -cp);
  float wBase = max(0.0, rest - wChoir - wRiven);

  vec2 q = vec2(0.0);
  q += vec2(1.00, 3.9) * wOracle;
  q += vec2(0.55, 0.2) * wChoir;
  q += vec2(0.30, 1.4) * wRiven;
  q += vec2(0.06, 2.6) * wMouth;
  q += vec2(0.34, 1.0) * wBase;
  return q / max(wOracle + wChoir + wRiven + wMouth + wBase, 1e-4);
}

float vaultFloorH(vec2 xz) {
  float z = xz.y + 170.0;
  float zc = z + 60.0 * sin(xz.x * 0.0011);
  float sig = 150.0 * (0.8 + 0.35 * sin(xz.x * 0.0009 + 2.0));
  float cw = exp(-zc * zc / (2.0 * sig * sig));
  float canyon = -170.0 * cw;
  float ts = canyon / 60.0;
  canyon = mix(canyon, (floor(ts) + smoothstep(0.28, 0.72, fract(ts))) * 60.0, 0.45);
  vec2 q = vec2(xz.x * 0.0021, zc * 0.0089);
  float r1 = 1.0 - abs(snoise(vec3(q, 0.0)));
  float r2 = 1.0 - abs(snoise(vec3(q * 2.3, 4.7)));
  float ridge = 46.0 * (r1 * r1 * 0.68 + r2 * 0.32) - 18.0;
  return FLOOR_Y + canyon + ridge * (1.0 - 0.72 * cw);
}
