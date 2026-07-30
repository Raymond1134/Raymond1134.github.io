#include ../lib/noise3D;

uniform float uTime;
uniform float uPixelRatio;
uniform vec2  uSize;     // panel size in world units
uniform vec3  uAnchor;   // the beacon, in panel-local space

attribute vec3 aSeed;    // per-mote constants, 0..1

varying float vGain;
varying float vCool;

const float TAU = 6.2831853;

/* A point on the aura's centreline: rectangle blended toward its inscribed
   ellipse, which rounds the corners. Motes are soft enough to hide the seam. */
vec2 rimPoint(float ang, vec2 halfRim) {
  vec2 e = vec2(cos(ang), sin(ang));
  vec2 rect = e / max(abs(e.x) / halfRim.x, abs(e.y) / halfRim.y);
  return mix(rect, halfRim * e, 0.35);
}

void main() {
  float s0 = aSeed.x;
  float s1 = aSeed.y;
  float s2 = aSeed.z;
  float s3 = fract(s0 * 7.31 + s1 * 3.97);

  // Mirrors the aura's scale-aware margin in panel.frag.
  vec2 halfRim = uSize * 0.5 - min(2.7, uSize.y * 0.155);

  vec3 pos;
  float path;    // alpha profile along the journey
  float sizeC;   // size class

  if (s2 < 0.55) {
    // Tether: light streaming out of the beacon, arcing forward into the rim —
    // the beacon visibly conjuring its own panel.
    float u = fract(uTime * (0.10 + 0.11 * s0) + s1 * 7.0);
    vec3 A = uAnchor;
    // Endpoints sweep the sides and bottom only — sparks crossing the top
    // edge would scatter behind the title.
    vec3 E = vec3(rimPoint(3.14159 * (0.85 + 1.3 * s0), halfRim), 0.0);
    vec3 C = vec3(E.xy * 0.25, A.z * 0.45);
    pos = mix(mix(A, C, u), mix(C, E, u), u);
    path = smoothstep(0.03, 0.2, u) * (1.0 - smoothstep(0.8, 1.0, u));
    sizeC = 1.9 - 1.0 * u;
    vCool = 0.15 + 0.45 * u;
  } else {
    // Rim drifters: circulating the aura, breathing with the same noise.
    float dir = mix(-1.0, 1.0, step(0.5, s3));
    float u = fract(s1 + uTime * (0.018 + 0.030 * s0) * dir);
    vec2 rp = rimPoint(u * TAU, halfRim);
    float n = snoise(vec3(rp * 0.2, uTime * 0.22 + s1 * 13.0));
    pos = vec3(rp * (1.0 + 0.045 * n), 0.5 * n);
    path = 0.85 + 0.15 * n;
    sizeC = 0.7 + 1.4 * s3 * s3;
    vCool = 0.3 + 0.5 * s1;
  }

  // Gentle per-mote wander, so nothing tracks its path like a bead on a wire.
  pos += vec3(
    sin(uTime * 1.21 + s1 * 43.0),
    cos(uTime * 0.97 + s0 * 37.0),
    sin(uTime * 1.43 + s3 * 51.0)
  ) * 0.16;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = max(-mv.z, 0.001);

  gl_PointSize = clamp(uPixelRatio * sizeC * (110.0 / dist), 0.5, 12.0 * uPixelRatio);

  float twinkle = 0.68 + 0.32 * sin(uTime * (0.6 + s0 * 1.4) + s1 * 40.0);
  vGain = path * twinkle * (0.45 + 0.55 * s3);
}
