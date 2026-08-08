precision highp float;

#include ../lib/noise3D;
#include ../lib/grade;
#include ../lib/chroma;
#include ../lib/dither;

uniform vec3  uNadir;
uniform vec3  uMid;
uniform vec3  uZenith;
uniform vec3  uVeilCold;
uniform vec3  uVeilMid;
uniform float uTime;
uniform float uBreath;
uniform float uDomeGain;
uniform float uVeils;
uniform float uEnvAmbientClamp;
uniform float uEnvSourcedClamp;
uniform float uExposure;
uniform vec3  uAuroraDir;
uniform float uAuroraGain;
uniform vec2  uResolution;
uniform vec3  uLightDir[DEPTHS_LIGHTS];
uniform vec3  uLightCol[DEPTHS_LIGHTS];
uniform float uLightW[DEPTHS_LIGHTS];

uniform float uBendAmp;
uniform float uBendT;

varying vec3 vDir;

#if DEPTHS_BEND
vec3 skyOffset(vec3 d, float t) {
  vec3 q = vec3(d.x * 1.9, d.y * 0.55, d.z * 1.9);
  float lift = snoise(q + vec3(0.0, t * 0.019, t * 0.011));
  float chop = snoise(q * 2.74 + vec3(t * 0.041, 0.0, -t * 0.026));
  vec3 T = normalize(cross(d, vec3(0.0, 1.0, 0.0)) + vec3(1e-4));
  vec3 B = cross(d, T);
  return T * (chop * 0.32) + B * (lift * 0.68);
}
#endif

float gradCh(float y, float nadir, float mid, float zenith) {
  return mix(mix(nadir, mid, smoothstep(-0.75, 0.22, y)), zenith, smoothstep(0.10, 0.90, y));
}

vec3 softClamp(vec3 c, float k) {
  float kn = k * 0.65;
  float soft = k * 0.35;
  return min(c, kn + soft * (1.0 - exp(-max(c - kn, vec3(0.0)) / soft)));
}

void main() {
  vec3 d = normalize(vDir);

#if DEPTHS_BEND
  vec3 off = skyOffset(d, uBendT);
  float bendK = min(uBendAmp, 0.13);
  vec3 dR = normalize(d + off * (bendK * 0.955));
  vec3 dG = normalize(d + off * bendK);
  vec3 dB = normalize(d + off * (bendK * 1.072));
  vec3 aR = normalize(d + off * (bendK * 0.865));
  vec3 aB = normalize(d + off * (bendK * 1.216));
#else
  vec3 dR = d; vec3 dG = d; vec3 dB = d;
  vec3 aR = d; vec3 aB = d;
#endif

  vec3 col = vec3(
    gradCh(dR.y, uNadir.r, uMid.r, uZenith.r),
    gradCh(dG.y, uNadir.g, uMid.g, uZenith.g),
    gradCh(dB.y, uNadir.b, uMid.b, uZenith.b));

  col = gelTint(col, d.x * 1.6 - d.y * 2.4 + uTime * 0.015, 0.22);

#if DEPTHS_OCT > 0
  vec3 q = dG * 2.3 + vec3(0.0, uTime * 0.008, uTime * 0.005);
#if DEPTHS_WARP
  q += 0.6 * vec3(
    snoise(d * 1.7 + vec3(uTime * 0.010, 0.0, 0.0)),
    snoise(d * 1.9 + vec3(0.0, -uTime * 0.008, 0.0)),
    0.0
  );
#endif
  float n = 0.0;
  float amp = 1.0;
  float tot = 0.0;
  for (int i = 0; i < DEPTHS_OCT; i++) {
    n += amp * snoise(q);
    tot += amp;
    amp *= 0.5;
    q *= 2.1;
  }
  float veil = smoothstep(0.52, 0.95, n / tot * 0.5 + 0.5);

  float lobe = pow(max(dot(d, uAuroraDir), 0.0), 6.0);
  float aurora = 1.0 + uAuroraGain * lobe;

  vec3 veilCol = uVeilCold * (uVeils + 0.05 * uAuroraGain * lobe) + uVeilMid * 0.018;
  veilCol = gelTint(veilCol, d.x * 2.0 + d.y * 3.0 + uTime * 0.035, 0.62);
  col += veilCol * veil * aurora;
#endif

  col *= (0.92 + 0.08 * uBreath) * uDomeGain;

  col = softClamp(col, uEnvAmbientClamp);

  for (int i = 0; i < DEPTHS_LIGHTS; i++) {
    vec3 stain = uLightCol[i] * uLightW[i];
    col += stain * vec3(
      pow(max(dot(aR, uLightDir[i]), 0.0), 24.0),
      pow(max(dot(dG, uLightDir[i]), 0.0), 24.0),
      pow(max(dot(aB, uLightDir[i]), 0.0), 24.0));
  }

  col = softClamp(col, uEnvSourcedClamp);

  col = bandBreak3(col, gl_FragCoord.xy, 0.0, DITHER_K);

#if PHONE_GRADE
  col = aetherGrade(col, uExposure, PHONE_HOLD);
  col *= aetherVignette(gl_FragCoord.xy, uResolution, 1.0);
#endif

  gl_FragColor = vec4(col, 1.0);

  #include <colorspace_fragment>
}
