uniform sampler2D uPositions;
uniform sampler2D uVelocities;
uniform float uSize;
uniform float uPixelRatio;
uniform float uTime;
uniform vec3  uCenter;
uniform float uFadeStart;
uniform float uFadeEnd;

attribute vec2 aRef;   // which texel this vertex reads

varying float vSpeed;
varying float vDepth;
varying float vGain;   // per-particle brightness (size class * twinkle)
varying float vSeed;   // per-particle constant, 0..1
varying float vFade;   // fades out toward the wrap boundary

void main() {
  vec4 p = texture2D(uPositions, aRef);
  vec4 vd = texture2D(uVelocities, aRef);
  vec3 v = vd.xyz;
  float seed = vd.w;

  vec4 mv = modelViewMatrix * vec4(p.xyz, 1.0);
  gl_Position = projectionMatrix * mv;

  float dist = max(-mv.z, 0.001);

  // Skewed low, so most particles are fine dust and only a few are large.
  float sizeClass = 0.35 + 1.15 * seed * seed;

  // 130.0 is calibrated to this world scale. The cap matters more now that the
  // camera flies through the field: without it a particle passing close fills
  // the viewport for a frame.
  gl_PointSize = uSize * uPixelRatio * sizeClass * (130.0 / dist);
  gl_PointSize = min(gl_PointSize, 12.0 * uPixelRatio);

  // Biased downward so most particles sit dim and a minority burn bright. The
  // 0.30 floor keeps the dim majority visible.
  float dim = 0.30 + 0.70 * pow(seed, 1.4);

  // Rate and phase both keyed off the seed, so no two particles pulse together.
  float twinkle = 0.78 + 0.22 * sin(uTime * (0.5 + seed * 1.6) + seed * 43.0);

  // Gone to nothing before the wrap distance, so the teleport is never seen.
  // This replaces the old birth/death lifetime fade, which cannot exist in a
  // field that is meant to persist.
  vFade = 1.0 - smoothstep(uFadeStart, uFadeEnd, length(p.xyz - uCenter));

  vGain  = dim * twinkle;
  vSpeed = length(v);
  vDepth = dist;
  vSeed  = seed;
}
