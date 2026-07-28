uniform sampler2D uPositions;
uniform sampler2D uVelocities;
uniform float uSize;
uniform float uPixelRatio;
uniform float uImplode;
uniform float uTime;

attribute vec2 aRef;   // which texel this vertex reads

varying float vSpeed;
varying float vLife;
varying float vDepth;
varying float vGain;   // per-particle brightness (size class * twinkle)
varying float vSeed;   // per-particle constant, 0..1

void main() {
  vec4 p = texture2D(uPositions, aRef);
  vec4 vd = texture2D(uVelocities, aRef);
  vec3 v = vd.xyz;
  float seed = vd.w;

  vec4 mv = modelViewMatrix * vec4(p.xyz, 1.0);
  gl_Position = projectionMatrix * mv;

  float dist = max(-mv.z, 0.001);

  // --- size ----------------------------------------------------------------
  // Skewed low, so most particles are fine dust and only a few are large.
  float sizeClass = 0.35 + 1.15 * seed * seed;

  // 130.0 is calibrated to this world scale: camera ~19 units from the beacon,
  // particle shell at ~46. Yields ~6px at the shell and ~2px in the far field.
  gl_PointSize = uSize * uPixelRatio * sizeClass * (130.0 / dist);

  // Anything on the lens must stay small or a handful of sprites cover the
  // screen. The implode term lets them swell during the engulf, where that IS
  // the intended effect.
  gl_PointSize = min(gl_PointSize, 12.0 * uPixelRatio * (1.0 + uImplode * 4.0));

  // --- brightness ----------------------------------------------------------
  // Biased downward so most particles sit dim and a minority burn bright. The
  // 0.30 floor keeps the dim majority visible.
  float dim = 0.30 + 0.70 * pow(seed, 1.4);

  // Rate and phase both keyed off the seed, so no two particles pulse together.
  float twinkle = 0.78 + 0.22 * sin(uTime * (0.5 + seed * 1.6) + seed * 43.0);

  vGain  = dim * twinkle;
  vSpeed = length(v);
  vLife  = p.w;
  vDepth = dist;
  vSeed  = seed;
}
