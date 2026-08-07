precision highp float;

#include ../lib/noise3D;
#include ../lib/vault;
#include ../lib/aerial;
#include ../lib/chroma;
#include ../lib/grade;
#include ../lib/dither;

uniform float uTime;
uniform float uBreath;
uniform vec3  uGlassCol;
uniform vec3  uOracleCol;
uniform vec3  uStoneCol;
uniform vec3  uRimCol;
uniform vec3  uOracleU;
uniform vec3  uOracleV;
uniform float uVaultGain;
uniform float uGlassL;
uniform float uApertureL;
uniform float uHorizonL;
uniform float uCrestL;
uniform vec3  uAbyssCol;
uniform float uAbyssL;
uniform float uExposure;
uniform vec2  uResolution;

varying vec3 vDir;
varying vec3 vRo;

void main() {
  vec3 ro = vRo;
  vec3 rd = normalize(vDir);

  float t = vaultHit(ro, rd);

  vec3 p = ro + rd * t;
  vec3 n = (p - VAULT_C) / R_VAULT;

  vec2 q = vaultQuarter(n, uOracleU, uOracleV);
  float present = vaultPresence(n);

  float glass = present * q.x;
  float az = atan(n.z, n.x);

  vec3 glassCol = gelTint(uGlassCol, az * 3.1 + n.y * 5.0 + uTime * 0.055 + q.y, 0.45);
  vec3 emis = uGlassL * glass * glassCol * (0.90 + 0.10 * uBreath);

  emis += uApertureL * vaultAperture(n) * uOracleCol;

  vec3 shellRgb = emis * aerialGain(t);
  float shellA = 0.0;

  float denom = min(rd.y, -0.02);
  float tf = (FLOOR_Y - ro.y) / denom;
#if FLOOR_STEPS > 0
  for (int i = 0; i < FLOOR_STEPS; i++) {
    tf = (vaultFloorH((ro + rd * tf).xz) - ro.y) / denom;
  }
#endif
  vec3 pf = ro + rd * tf;

  float h0 = vaultFloorH(pf.xz);
  float hx = vaultFloorH(pf.xz + vec2(4.0, 0.0));
  float hz = vaultFloorH(pf.xz + vec2(0.0, 4.0));
  vec3 nf = normalize(vec3(h0 - hx, 4.0, h0 - hz));

  float lit = max(dot(nf, ORACLE_DIR), 0.0);
  float steep = 1.0 - nf.y;
  float ao = 1.0 - 0.55 * smoothstep(0.10, 0.55, steep);
  vec3 floorCol = uStoneCol * (mix(0.0009, uCrestL, smoothstep(0.30, 0.75, lit)) * ao);

  float graze = pow(1.0 - max(dot(nf, -rd), 0.0), 3.0);
  floorCol += uRimCol * (uCrestL * 1.5 * graze * smoothstep(0.12, 0.5, steep) * (0.3 + 0.7 * lit));

  float rel = h0 - FLOOR_Y;
  float depthW = max(smoothstep(-40.0, -200.0, rel), 0.30 * smoothstep(4.0, -14.0, rel));
  float mistN = 0.7 + 0.3 * snoise(vec3(pf.xz * 0.012, uTime * 0.05));
  float pulse = 0.75 + 0.25 * sin(pf.x * 0.010 - uTime * 0.16);
  floorCol += uAbyssCol * (uAbyssL * depthW * pulse * mistN * (0.8 + 0.2 * uBreath));

  float rr = length(pf.xz - vec2(0.0, -170.0));
  float rim = exp(-abs(rr - HORIZON_R) / 34.0) * uHorizonL;
  rim *= mix(1.0, 0.35, smoothstep(600.0, 1400.0, tf));
  floorCol = aerialCol(floorCol + uRimCol * rim, tf);

  float floorA = smoothstep(260.0, 560.0, tf) * (1.0 - smoothstep(750.0, 1200.0, tf))
               * (0.30 + 0.38 * mistN);
  float onFloor = step(rd.y, -0.02) * step(tf, t) * step(0.0, tf);

  vec3 col = mix(shellRgb, floorCol * floorA, onFloor);
  float a = mix(shellA, floorA, onFloor);

  col *= uVaultGain;
  col = bandBreak3(col, gl_FragCoord.xy, 41.0, DITHER_K);

#if PHONE_GRADE
  col = aetherGrade(col, uExposure, PHONE_HOLD);
  col *= aetherVignette(gl_FragCoord.xy, uResolution, 1.0);
#endif

  gl_FragColor = vec4(col, a);

  #include <colorspace_fragment>
}
