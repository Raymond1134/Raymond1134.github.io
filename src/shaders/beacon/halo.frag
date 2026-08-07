precision highp float;

#include ../lib/grade;
#include ../lib/chroma;

uniform vec3  uCore;
uniform vec3  uEdge;
uniform float uGain;
uniform float uCoreW;
uniform float uSkirt;
uniform float uExposure;

varying vec2 vQ;

void main() {
  float r2 = dot(vQ, vQ);
  if (r2 > 1.0) discard;

  float w = (exp(-r2 * 4.2) * uCoreW + exp(-r2 * 0.85) * uSkirt) * (1.0 - r2);
  vec3 col = mix(uEdge, uCore, smoothstep(0.35, 0.0, r2));
  col = gelFringe(col, r2, 0.42);

  vec3 lit = col * (uGain * w);

#if PHONE_GRADE
  lit = aetherGrade(lit, uExposure, PHONE_HOLD);
#endif

  gl_FragColor = vec4(lit, 1.0);

  #include <colorspace_fragment>
}
