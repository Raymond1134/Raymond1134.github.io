precision highp float;

#include ../lib/noise3D;
#include ../lib/grade;
#include ../lib/chroma;

uniform vec3  uCore;
uniform vec3  uEdge;
uniform vec3  uOuter;
uniform float uIntensity;
uniform float uNucleusGain;
uniform float uTime;
uniform float uExposure;

varying vec3 vN;
varying vec3 vV;
varying vec3 vDir;

void main() {
  float f = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);

  float nucleus = pow(f, 9.0);
  float body    = pow(f, 1.6);

  float n = snoise(vDir * 2.2 + vec3(0.0, uTime * 0.11, uTime * 0.07));
  body *= 0.84 + 0.32 * (n * 0.5 + 0.5);

  vec3 col = mix(uOuter, uEdge, smoothstep(0.55, 1.0, f));

  col = gelTint(col, vDir.x * 2.4 + vDir.y * 1.8 + uTime * 0.16, 0.18);
  col = mix(col, uCore * uNucleusGain, nucleus);

  float a = (body * 0.22 + nucleus * 1.25) * uIntensity;

#if PHONE_GRADE
  col = aetherGrade(col, uExposure, PHONE_HOLD);
#endif

  gl_FragColor = vec4(col, a);

  #include <colorspace_fragment>
}
