precision highp float;

#include ../lib/grade;
#include ../lib/chroma;

uniform vec3  uCore;
uniform vec3  uEdge;
uniform float uGain;
uniform float uCoreW;
uniform float uSkirt;
uniform float uExposure;
uniform float uSpan;
uniform vec2  uRing;
uniform vec2  uRingGain;

varying vec2 vQ;

void main() {
  if (dot(vQ, vQ) > 1.0) discard;

  vec2 q = vQ * uSpan;
  float r2 = dot(q, q);

  float w = (exp(-r2 * 4.2) * uCoreW + exp(-r2 * 0.85) * uSkirt) * max(1.0 - r2, 0.0);
  vec3 col = mix(uEdge, uCore, smoothstep(0.35, 0.0, r2));
  col = gelFringe(col, r2, 0.42);

  vec3 lit = col * (uGain * w);

  if (uRingGain.x + uRingGain.y > 0.0) {
    vec2 dr = vec2(sqrt(r2)) - uRing;
    vec2 sharp = mix(vec2(4.0), vec2(16.0), step(0.0, dr));
    vec2 band = exp(-(dr * sharp) * (dr * sharp)) * uRingGain;
    vec2 front = band * smoothstep(-0.12, 0.03, dr);
    vec2 trail = band - front;
    vec3 frontCol = mix(uCore, vec3(1.0), 0.4);
    vec3 trailCol = gelFringe(uEdge, 1.0, 0.5);
    lit += frontCol * (front.x + front.y) + trailCol * ((trail.x + trail.y) * 0.8);
  }

#if PHONE_GRADE
  lit = aetherGrade(lit, uExposure, PHONE_HOLD);
#endif

  gl_FragColor = vec4(lit, 1.0);

  #include <colorspace_fragment>
}
