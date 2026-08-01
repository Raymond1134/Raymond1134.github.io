#include ../lib/noise3D;

uniform float uTime;

attribute float aAlong;    // 0..1 along the silk
attribute float aAcross;   // -1..1 across it
attribute float aPhase;    // per-ribbon constant

varying float vAlong;
varying float vAcross;
varying float vDepth;
varying float vPhase;

void main() {
  vec3 p = position;

  // Slow silk sway. A sheet needs no divergence-free motion — three phased
  // noises are enough for cloth-in-water.
  float t = uTime * 0.13;
  vec3 q = vec3(aAlong * 3.1 + aPhase * 7.0, aAcross * 0.8, aPhase * 13.0);
  p.x += snoise(q + vec3(t * 0.9, 0.0, 0.0)) * 6.0;
  p.y += snoise(q + vec3(0.0, t * 0.7, 17.0)) * 6.0;
  p.z += snoise(q + vec3(0.0, 0.0, t * 0.8 + 31.0)) * 6.0;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  vDepth = -mv.z;
  vAlong = aAlong;
  vAcross = aAcross;
  vPhase = aPhase;
}
