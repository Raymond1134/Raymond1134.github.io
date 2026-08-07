precision highp float;

#include ../lib/aerial;
#include ../lib/grade;

uniform float uBreath;
uniform float uThreadL;
uniform float uPulseL;
uniform vec3  uCold;
uniform vec3  uClick;
uniform float uExposure;
uniform vec2  uResolution;

varying float vDepth;
varying float vEnd;
varying float vAdj;
varying float vPulse;
varying vec3  vCol;

void main() {
  vec2 q = gl_PointCoord - 0.5;
  float r2 = dot(q, q);
  if (r2 > 0.25) discard;
  float disc = exp(-r2 * 10.0) * (1.0 - r2 * 4.0);

  vec3 col = mix(uCold, vCol, 0.30);
  col = mix(col, uClick, vAdj * 0.45);
  col = aerialCol(col, vDepth);

  float lum = uThreadL * (0.62 + 0.38 * vAdj) + uPulseL * vPulse;
  col *= lum * (0.88 + 0.12 * uBreath);

  float a = disc * vEnd * aerialGain(vDepth);

#if PHONE_GRADE
  col = aetherGrade(col, uExposure, PHONE_HOLD);
  col *= aetherVignette(gl_FragCoord.xy, uResolution, 0.5);
#endif

  gl_FragColor = vec4(col, a);

  #include <colorspace_fragment>
}
