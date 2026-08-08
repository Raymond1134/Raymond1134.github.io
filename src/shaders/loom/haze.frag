precision highp float;

#include ../lib/aerial;
#include ../lib/grade;

uniform float uBreath;
uniform float uHazeL;
uniform float uPulseL;
uniform vec3  uCold;
uniform vec3  uClick;
uniform float uExposure;
uniform vec2  uResolution;

varying float vDepth;
varying float vAcross;
varying float vEnd;
varying float vAdj;
varying float vPulse;
varying float vGlow;
varying vec3  vCol;

void main() {
  float x2 = vAcross * vAcross;
  float sheath = exp(-x2 * 4.5) * 0.34 + exp(-x2 * 16.0) * 0.20;

  vec3 col = mix(uCold, vCol, 0.18);
  col = mix(col, uClick, vAdj * 0.12);
  col = aerialCol(col, vDepth);

  float lum = uHazeL * (0.55 + 0.45 * vAdj) * vGlow + uPulseL * vPulse;
  col *= lum * (0.90 + 0.10 * uBreath);

  float a = sheath * vEnd * aerialGain(vDepth);

#if PHONE_GRADE
  col = aetherGrade(col, uExposure, PHONE_HOLD);
  col *= aetherVignette(gl_FragCoord.xy, uResolution, 0.5);
#endif

  gl_FragColor = vec4(col, a);

  #include <colorspace_fragment>
}
