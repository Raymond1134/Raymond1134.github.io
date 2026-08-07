precision highp float;

#include ../lib/grade;

uniform float uAlpha;
uniform float uExposure;

varying vec3  vCol;
varying float vA;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c) * 4.0;
  if (r2 > 1.0) discard;
  float a = exp(-r2 * 2.2) * (1.0 - r2);

  vec3 col = vCol;
#if PHONE_GRADE
  col = aetherGrade(col, uExposure, PHONE_HOLD);
#endif

  gl_FragColor = vec4(col, a * vA * uAlpha);
  #include <colorspace_fragment>
}
