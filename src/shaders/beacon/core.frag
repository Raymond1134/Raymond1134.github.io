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

  // The two terms do different jobs and must not be tuned together. `nucleus`
  // stays very steep — that tight blown-out point is what reads as a light
  // source. `body` is deliberately shallow so the colour ramp below has room to
  // be seen; what made this look like a dusty ball was the body's WEIGHT, not
  // its width, so it is kept faint instead of narrow.
  float nucleus = pow(f, 9.0);
  float body    = pow(f, 1.6);

  // Slow drifting lobes so the corona is not a perfect circle. Applied to the
  // body only: the nucleus has to stay a clean point, and noise on it would
  // read as fire rather than light. Kept gentle — past about +/-0.2 this stops
  // looking ethereal and starts looking like plasma.
  float n = snoise(vDir * 2.2 + vec3(0.0, uTime * 0.11, uTime * 0.07));
  body *= 0.84 + 0.32 * (n * 0.5 + 0.5);

  // Hue shifts across the falloff. A single flat colour is what made this read
  // as tinted dust; real light through dust cools as it thins out.
  //
  // The ramp starts at 0.55, not 0: nearly all the visible alpha lives in
  // f = 0.7..1.0, so a ramp anchored at zero spent its whole range where
  // nothing is bright enough to see and the outer colour never showed. Gold now
  // holds only the hot centre and rose owns the mid-falloff.
  vec3 col = mix(uOuter, uEdge, smoothstep(0.55, 1.0, f));
  col = mix(col, uCore, nucleus);

  // Alpha falls to zero AT the silhouette, so the mesh has no visible boundary
  // — it is a soft body of light rather than a lit ball.
  float a = (body * 0.22 + nucleus * 1.25) * uIntensity;

  gl_FragColor = vec4(col, a);
}
