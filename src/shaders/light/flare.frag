precision highp float;

#include ../lib/grade;

uniform vec2  uLight;
uniform float uInt;
uniform float uAspect;
uniform vec3  uTint;
uniform vec3  uGhostTint;
uniform float uExposure;

varying vec2 vUv;

void main() {
  if (uInt < 0.003) discard;

  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  vec2 lp = vec2(uLight.x * uAspect, uLight.y);
  vec2 d = p - lp;

  float streak = exp(-abs(d.y) * 26.0) * exp(-abs(d.x) * 1.9);
  float glow = exp(-dot(d, d) * 14.0);

  vec2 g1 = p + lp * 0.45;
  vec2 g2 = p + lp * 1.05;
  float ghosts = exp(-dot(g1, g1) * 60.0) * 0.50 + exp(-dot(g2, g2) * 30.0) * 0.35;

  vec3 col = uTint * (streak + glow * 0.8) + uGhostTint * ghosts;
  col *= uInt;

#if PHONE_GRADE
  col = aetherGrade(col, uExposure, PHONE_HOLD);
#endif

  gl_FragColor = vec4(col, 1.0);

  #include <colorspace_fragment>
}
