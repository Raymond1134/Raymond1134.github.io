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
uniform vec2  uAuroraFrame;
uniform vec2  uResolution;
uniform vec3  uLightDir[DEPTHS_LIGHTS];
uniform vec3  uLightCol[DEPTHS_LIGHTS];
uniform float uLightW[DEPTHS_LIGHTS];

uniform float uBendAmp;
uniform float uBendT;

varying vec3 vDir;

const vec3 AURORA_HEM = vec3(0.30, 1.20, 0.95);
#if PHONE_GRADE
const float AURORA_K = 0.075;
#else
const float AURORA_K = 0.115;
#endif

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

  if (uAuroraGain > 0.001) {
    vec2 az = normalize(uAuroraDir.xz + vec2(1e-4));
    float x = d.x * az.y - d.z * az.x;
    float at = uBendT;
#if DEPTHS_OCT > 0
    float wav = snoise(vec3(x * 3.6, 1.7, at * 0.05));
    float kink = snoise(vec3(x * 19.0, 5.3, at * 0.08));
#else
    float wav = 0.6 * sin(x * 7.3 + at * 0.11) + 0.3 * sin(x * 15.7 - at * 0.07);
    float kink = 0.6 * sin(x * 23.0 - at * 0.13) + 0.4 * sin(x * 37.0 + at * 0.09);
#endif
    float rise = d.y - (uAuroraFrame.x + 0.06 * wav + 0.035 * sin(x * 8.3 + at * 0.13));
    float up = max(rise, 0.0);
    float drop = up * uAuroraFrame.y;
    float r1 = 0.5 + 0.5 * sin(x * 130.0 + wav * 9.0 + kink * 2.4 + up * 8.0 + at * 0.3);
    float r2 = 0.5 + 0.5 * sin(x * 83.0 - wav * 7.0 + kink * 3.3 + up * 5.0 - at * 0.21);
    float rays = max(r1 * r1 * r1, 0.8 * r2 * r2 * r2 * r2)
               * (0.35 + 0.65 * smoothstep(-0.2, 0.9, sin(x * 37.0 + wav * 5.0 - at * 0.12)));
    float flick = 0.55 + 0.45 * sin(x * 311.0 + wav * 13.0 + kink * 4.0 - at * 0.7);
    float fold = 0.3 + 0.7 * smoothstep(-0.4, 0.9, sin(x * 7.0 + wav * 3.0 + at * 0.06));
    float body = exp(-drop * 6.5) * (0.06 + 0.94 * rays * flick);
    float lip = exp(-up * 30.0) * (0.45 + 0.55 * rays);
    float lobe = pow(max(dot(d, uAuroraDir), 0.0), 3.0);
    vec3 lw = vec3(0.2126, 0.7152, 0.0722);
    vec3 hue = mix(AURORA_HEM, uVeilCold / dot(uVeilCold, lw), smoothstep(0.03, 0.16, drop));
    hue = mix(hue, uVeilMid / dot(uVeilMid, lw), smoothstep(0.14, 0.34, drop));
    hue *= mix(vec3(1.0), gelSheen(x * 2.3 + at * 0.04), 0.35);
    col += (hue * body + AURORA_HEM * (1.2 * lip))
         * (AURORA_K * uAuroraGain * uDomeGain * lobe * fold * smoothstep(-0.02, 0.01, rise));
  }

  for (int i = 0; i < DEPTHS_LIGHTS; i++) {
    vec3 stain = uLightCol[i] * uLightW[i];
    col += stain * vec3(
      pow(max(dot(aR, uLightDir[i]), 0.0), 24.0),
      pow(max(dot(dG, uLightDir[i]), 0.0), 24.0),
      pow(max(dot(aB, uLightDir[i]), 0.0), 24.0));
  }

  col = softClamp(col, uEnvSourcedClamp);

#if PHONE_GRADE
  col = aetherGrade(col, uExposure, PHONE_HOLD);
  col *= aetherVignette(gl_FragCoord.xy, uResolution, 1.0);
  col = bandBreak3(col, gl_FragCoord.xy, 0.0, DITHER_K);
#endif

  gl_FragColor = vec4(col, 1.0);

  #include <colorspace_fragment>
}
