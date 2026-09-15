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
varying float vTorch;
varying float vReveal;
varying float vGlint;
varying float vPulse;
varying float vPulseS;
varying float vStretch;
varying vec2  vAxis;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float k = 1.0 - vStretch;
  float h = 0.5 * vStretch;
  float sa = dot(c, vAxis);
  float streak = smoothstep(0.0, 0.3, vStretch);
  float thin = 1.0 - 0.45 * smoothstep(0.0, 0.6, vStretch);
  vec2 q = vec2(max(abs(sa) - h, 0.0), dot(c, vec2(-vAxis.y, vAxis.x)) / thin);
  float r2 = dot(q, q) * 4.0 / (k * k);
  if (r2 > 1.0) discard;

  float along = clamp((sa + h) / max(2.0 * h, 1e-4), 0.0, 1.0);
  float taper = mix(1.0, 0.08 + 0.92 * along * along, streak);

  float isFly  = step(0.5, vClass) * (1.0 - step(1.5, vClass));
  float isMote = step(1.5, vClass);
  float isDust = 1.0 - isFly - isMote;

  float dustA = (exp(-r2 * 4.5) + exp(-r2 * 1.6) * 0.30) * (1.0 - r2);
  float glowA = exp(-r2 * 3.0) * (1.0 - r2);

  float body = smoothstep(1.0, 0.62, r2);
  float rim  = (smoothstep(0.55, 0.9, r2) - smoothstep(0.9, 1.0, r2)) * 0.4 * vDefocus;
  float flyA = mix(body * 0.72 + rim, glowA * 0.9, streak);

  float moteA = mix(exp(-r2 * 1.1) * (1.0 - r2), glowA, streak) * 0.45;

  float alpha = (isDust * dustA + isFly * flyA + isMote * moteA) * taper;

  float heat = smoothstep(0.0, uSpeedScale, vSpeed);

  heat = clamp(heat + (fract(vSeed * 17.13) - 0.5) * 0.5, 0.0, 1.0);

  heat = min(heat + isFly * 0.25, 1.0);

  heat = mix(heat * heat, heat, isFly);

  heat = max(heat, vTorch * (0.62 + 0.38 * fract(vSeed * 29.3)));

  vec3 col = mix(
    mix(uColorCold, uColorMid, smoothstep(0.0, 0.55, heat)),
    uColorHot,
    smoothstep(0.5, 1.0, heat)
  );

  col = mix(col, uColorAccent, smoothstep(0.88, 1.0, heat) * 0.55);

  col = mix(col, mix(uColorCold, uColorMid, fract(vSeed * 3.77)), isMote);

  col = mix(col, vLitCol, vLit * 0.45);

  col = mix(col, uColorAccent, streak * 0.4 * along * exp(-r2 * 2.5));

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
