precision highp float;

#include ../lib/grade;
#include ../lib/aerial;
#include ../lib/chroma;

uniform vec3  uNadir;
uniform vec3  uMid;
uniform vec3  uZenith;
uniform float uNucleusGain;
uniform float uIntensity;
uniform float uTime;
uniform float uExposure;

varying vec3 vWN;
varying vec3 vWP;
varying vec3 vOP;
varying float vFacet;

float domeCh(float y, float nadir, float mid, float zenith) {
  return mix(mix(nadir, mid, smoothstep(-0.75, 0.22, y)), zenith, smoothstep(0.10, 0.90, y));
}

void main() {
  vec3 N = normalize(vWN);
  vec3 V = normalize(cameraPosition - vWP);
  vec3 I = -V;

  vec3 rR = refract(I, N, 1.0 / 1.598);
  vec3 rG = refract(I, N, 1.0 / 1.620);
  vec3 rB = refract(I, N, 1.0 / 1.658);
  vec3 sky = vec3(
    domeCh(rR.y, uNadir.r, uMid.r, uZenith.r),
    domeCh(rG.y, uNadir.g, uMid.g, uZenith.g),
    domeCh(rB.y, uNadir.b, uMid.b, uZenith.b)) * 2.4;

  float p2 = dot(vOP, vOP);
  float dR = p2 - dot(vOP, rR) * dot(vOP, rR);
  float dG = p2 - dot(vOP, rG) * dot(vOP, rG);
  float dB = p2 - dot(vOP, rB) * dot(vOP, rB);
  vec3 nuc = vec3(exp(-dR * 9.0), exp(-dG * 9.0), exp(-dB * 9.0)) * (uNucleusGain * 0.30);

  float fr = pow(1.0 - max(dot(N, V), 0.0), 3.4) * 0.90;
  vec3 sheen = gelSheen(vFacet * 1.7 + uTime * 0.09) * fr;

  vec3 col = AERIAL_DEEP * 0.6 + (sky + nuc + sheen) * uIntensity;

#if PHONE_GRADE
  col = aetherGrade(col, uExposure, PHONE_HOLD);
#endif

  gl_FragColor = vec4(col, 1.0);

  #include <colorspace_fragment>
}
