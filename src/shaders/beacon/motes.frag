precision highp float;

#include ../lib/chroma;
#include ../lib/grade;

uniform vec3  uColorCool;
uniform float uIntensity;
uniform float uTime;
uniform float uExposure;

varying float vGain;
varying float vTrail;
varying vec3  vColor;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c) * 4.0;
  if (r2 > 1.0) discard;

  float a = (exp(-r2 * 3.2) + exp(-r2 * 1.1) * 0.35) * (1.0 - r2);

  vec3 col = mix(vColor, uColorCool, vTrail * 0.4);

  col = gelTint(col, vTrail * 9.0 + uTime * 0.22, 0.22 * vTrail);

#if PHONE_GRADE
  col = aetherGrade(col, uExposure, PHONE_HOLD);
#endif

  gl_FragColor = vec4(col, a * vGain * uIntensity * (1.0 - vTrail * 0.72));

  #include <colorspace_fragment>
}
