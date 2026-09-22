precision highp float;

#include ../lib/grade;
#include ../lib/chroma;

uniform vec2  uLight;
uniform float uInt;
uniform float uAspect;
uniform vec3  uTint;
uniform vec3  uGhostTint;
uniform float uExposure;
uniform float uTime;

varying vec2 vUv;

void main() {
  if (uInt < 0.003) discard;

  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  vec2 lp = vec2(uLight.x * uAspect, uLight.y);
  vec2 d = p - lp;

  float streak = exp(-abs(d.y) * 26.0) * exp(-abs(d.x) * mix(1.9, 1.35, smoothstep(0.3, 1.0, uInt)));
  float glow = exp(-dot(d, d) * 14.0);

  vec2 g1 = p + lp * 0.45;
  vec2 g2 = p + lp * 1.05;
  float ghosts = exp(-dot(g1, g1) * 60.0) * 0.50 + exp(-dot(g2, g2) * 30.0) * 0.35;

  vec2 g3 = p + lp * 0.72;
  float band = (length(g3) - 0.2) * 34.0;
  float ring = exp(-band * band) * 0.14 * smoothstep(0.12, 0.45, length(lp));
  vec3 sheen = ring > 1e-4 ? gelSheen(atan(g3.y, g3.x) * 2.0 + uTime * 0.4) : vec3(1.0);

  vec3 col = uTint * (streak + glow * 0.8) + uGhostTint * (ghosts + ring * sheen);
  col *= uInt;

#if PHONE_GRADE
  col = aetherGrade(col, uExposure, PHONE_HOLD);
#endif

  gl_FragColor = vec4(col, 1.0);

  #include <colorspace_fragment>
}
