precision highp float;

#include ../lib/noise3D;

uniform vec3  uCore;       // white-hot nucleus
uniform vec3  uEdge;       // the light's own colour
uniform vec3  uOuter;      // cool outer falloff, tying into the field
uniform float uIntensity;
uniform float uTime;

varying vec3 vN;
varying vec3 vV;
varying vec3 vDir;

void main() {
  // 1 where the surface faces us, 0 at the silhouette.
  float f = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);

  // Tune these separately. The steep nucleus is what reads as a light source;
  // the shallow body carries the colour ramp. A dusty-ball look comes from the
  // body's weight, not its width — keep it faint rather than narrow.
  float nucleus = pow(f, 9.0);
  float body    = pow(f, 1.6);

  // Drifting lobes, so the corona isn't a perfect circle. Body only: noise on
  // the nucleus reads as fire rather than light.
  float n = snoise(vDir * 2.2 + vec3(0.0, uTime * 0.11, uTime * 0.07));
  body *= 0.84 + 0.32 * (n * 0.5 + 0.5);

  // Ramp starts at 0.55, not 0. Nearly all visible alpha lives in f = 0.7..1.0,
  // so a ramp anchored at zero spends its range where nothing is bright enough
  // to see and the outer colour never shows.
  vec3 col = mix(uOuter, uEdge, smoothstep(0.55, 1.0, f));
  col = mix(col, uCore, nucleus);

  // Alpha reaches zero AT the silhouette, so the mesh has no visible boundary.
  float a = (body * 0.22 + nucleus * 1.25) * uIntensity;

  gl_FragColor = vec4(col, a);
}
