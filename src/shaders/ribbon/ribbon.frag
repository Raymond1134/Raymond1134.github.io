precision highp float;

#include ../lib/noise3D;

uniform float uTime;
uniform float uBreath;
uniform vec3  uCold;
uniform vec3  uMid;

varying float vAlong;
varying float vAcross;
varying float vDepth;
varying float vPhase;

void main() {
  // Soft edges, tapered ends — silk, not a road.
  float edge = 1.0 - smoothstep(0.55, 1.0, abs(vAcross));
  float ends = smoothstep(0.0, 0.12, vAlong) * (1.0 - smoothstep(0.88, 1.0, vAlong));

  // Two octaves of tear: the curtain is torn and translucent, never a slab.
  vec2 tq = vec2(vAlong * 6.0 + uTime * 0.02 + vPhase * 3.0, vAcross * 1.5);
  float n = snoise(vec3(tq, vPhase * 19.0)) * 0.65
          + snoise(vec3(tq * 2.3, vPhase * 19.0 + 5.0)) * 0.35;
  float tear = smoothstep(-0.25, 0.65, n);

  // Flying through one is a dissolve, not a wall.
  float nearFade = smoothstep(5.0, 20.0, vDepth);

  vec3 col = mix(uCold, uMid, vAlong) * 0.5;
  float a = edge * ends * tear * nearFade * (0.85 + 0.15 * uBreath);

  gl_FragColor = vec4(col, a * 0.85);

  #include <colorspace_fragment>
}
