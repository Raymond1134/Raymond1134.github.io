precision highp float;

#include ../lib/grade;
#include ../lib/chroma;

uniform float uTime;
uniform vec3  uColorCold;
uniform vec3  uColorMid;
uniform vec3  uColorHot;
uniform vec3  uColorAccent;
uniform float uOpacity;
uniform float uSpeedScale;
uniform float uFogDensity;
uniform vec3  uDeepColor;
uniform vec2  uResolution;
uniform float uExposure;
uniform float uSeaScale;

varying float vSpeed;
varying float vDepth;
varying float vGain;
varying float vSeed;
varying float vFade;
varying float vClass;
varying float vDefocus;
varying float vLit;
varying vec3  vLitCol;
varying float vReveal;
varying float vGlint;
varying float vPulse;
varying float vPulseS;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c) * 4.0;
  if (r2 > 1.0) discard;

  float isFly  = step(0.5, vClass) * (1.0 - step(1.5, vClass));
  float isMote = step(1.5, vClass);
  float isDust = 1.0 - isFly - isMote;

  float dustA = (exp(-r2 * 4.5) + exp(-r2 * 1.6) * 0.30) * (1.0 - r2);

  float body = smoothstep(1.0, 0.62, r2);
  float rim  = (smoothstep(0.55, 0.9, r2) - smoothstep(0.9, 1.0, r2)) * 0.4 * vDefocus;
  float flyA = body * 0.72 + rim;

  float moteA = exp(-r2 * 1.1) * (1.0 - r2) * 0.45;

  float alpha = isDust * dustA + isFly * flyA + isMote * moteA;

  float heat = smoothstep(0.0, uSpeedScale, vSpeed);

  heat = clamp(heat + (fract(vSeed * 17.13) - 0.5) * 0.5, 0.0, 1.0);

  heat = min(heat + isFly * 0.25, 1.0);

  heat = mix(heat * heat, heat, isFly);

  vec3 col = mix(
    mix(uColorCold, uColorMid, smoothstep(0.0, 0.55, heat)),
    uColorHot,
    smoothstep(0.5, 1.0, heat)
  );

  col = mix(col, uColorAccent, smoothstep(0.88, 1.0, heat) * 0.55);

  col = mix(col, mix(uColorCold, uColorMid, fract(vSeed * 3.77)), isMote);

  col = mix(col, vLitCol, vLit * 0.45);

  col = gelTint(col, vSeed * 40.0 + uTime * 0.25, isFly * (0.16 + 0.26 * vDefocus) + isDust * 0.10);
  col = gelFringe(col, r2, isFly * (0.18 + 0.35 * vDefocus));

  float fog = exp(-vDepth * uFogDensity);

  col = mix(uDeepColor, col, fog);

  float near = smoothstep(1.0, 6.0, vDepth);

  float base = 0.10 + isFly * 0.12;
  vec3 lit = col * (base + heat * (1.05 + isFly * 0.35)) * (1.0 + vLit * 0.9);

  lit *= 1.0 + vPulse * mix(vec3(0.78, 0.96, 1.30), vec3(1.26, 1.02, 0.74), 0.5 + 0.5 * vPulseS);

  lit += uColorAccent * vGlint;

  lit *= uSeaScale;

#if PHONE_GRADE
  lit = aetherGrade(lit, uExposure, PHONE_HOLD);
  lit *= aetherVignette(gl_FragCoord.xy, uResolution, 0.5);
#endif

  float classGain = isDust + isFly + isMote * 0.12;

  gl_FragColor = vec4(lit, alpha * uOpacity * vGain * fog * near * vFade * classGain * vReveal);

  #include <colorspace_fragment>
}
