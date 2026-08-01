// curl.glsl already pulls in noise3D; including both redefines snoise.
#include ../lib/curl;

uniform float uTime;
uniform float uDt;
uniform float uCurlFreq;
uniform float uCurlAmp;
uniform float uDamping;
uniform float uMaxSpeed;
uniform float uCondense;
uniform vec3  uTravelDir;
uniform float uTravelBoost;
uniform float uBreath;

// `resolution` is #defined by GPUComputationRenderer; the texturePosition and
// textureVelocity samplers are injected automatically.

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;

  vec4 velData = texture2D(textureVelocity, uv);
  vec3 pos = texture2D(texturePosition, uv).xyz;
  vec3 vel = velData.xyz;
  float seed = velData.w;

  // The one breath: currents swell ±10%, the gather ±15%, in phase with the
  // dome and the bloom. Inhale draws the sea together.
  float breathCurl = 1.0 + (uBreath - 0.5) * 0.2;
  float breathCond = 1.0 + (uBreath - 0.5) * 0.3;

  // (a) Macro river: one world-scale current, shared by every particle, so
  // the sea organizes into a few readable streams. Wavelength ~91 units —
  // under the 120-unit wrap box, so no kink at the seam.
  vec3 macro = curlNoise(pos * 0.011 + vec3(0.0, uTime * 0.012, uTime * 0.008), 0.6)
             * (uCurlAmp * 1.4 * breathCurl);

  // (b) Condensation: gradient descent onto the zero level-set of a slow
  // noise — particles gather into veil-like sheets with emptier water
  // between them. This is what turns fuzz into structure.
  vec3 gp = pos * 0.012 + vec3(uTime * 0.006, 0.0, uTime * 0.004);
  float n = snoise(gp);
  const float E = 0.25;   // in noise space: world-space diffs vanish at this frequency
  vec3 grad = vec3(
    snoise(gp + vec3(E, 0.0, 0.0)) - n,
    snoise(gp + vec3(0.0, E, 0.0)) - n,
    snoise(gp + vec3(0.0, 0.0, E)) - n
  ) / E;
  vec3 gather = -grad * n * (uCondense * breathCond * (0.4 + 0.6 * seed));

  // (c) Micro shimmer, demoted: fine per-particle life on top of the rivers.
  // Sampled from WORLD position at a fixed frequency, so the field belongs
  // to the universe rather than the viewer.
  vec3 micro = curlNoise(pos * uCurlFreq + vec3(0.0, uTime * 0.05, uTime * 0.03), 0.35)
             * (uCurlAmp * 0.55) * (0.55 + 0.9 * seed);

  vel += (macro + gather + micro) * uDt;

  // (d) Travel current: while you fly, the whole medium streams with you.
  vel += uTravelDir * (uTravelBoost * uDt);

  vel *= pow(uDamping, uDt * 60.0);   // frame-rate independent
  float sp = length(vel);
  if (sp > uMaxSpeed) vel *= uMaxSpeed / sp;

  gl_FragColor = vec4(vel, seed);
}
