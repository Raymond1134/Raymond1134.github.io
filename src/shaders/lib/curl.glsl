#include noise3D;

/**
 * A 3-component vector potential built from three decorrelated noise samples.
 * The large offsets keep the three channels from correlating.
 */
vec3 aetherPotential(vec3 p) {
  return vec3(
    snoise(p),
    snoise(p + vec3(123.4, 56.7, 89.1)),
    snoise(p + vec3(-45.6, 78.9, -12.3))
  );
}

/**
 * curl(F) = ( dFz/dy - dFy/dz,  dFx/dz - dFz/dx,  dFy/dx - dFx/dy )
 *
 * Central differences. The result is divergence-free, which is exactly why
 * particles form long coherent filaments instead of clumping and gapping.
 *
 * Cost: 6 potential evaluations = 18 snoise calls per particle per frame.
 * This is the single most expensive thing in the project. See Phase 10.3 for
 * the optimisation levers — don't reach for them until you've measured.
 */
vec3 curlNoise(vec3 p, float eps) {
  vec3 dx = vec3(eps, 0.0, 0.0);
  vec3 dy = vec3(0.0, eps, 0.0);
  vec3 dz = vec3(0.0, 0.0, eps);

  vec3 px1 = aetherPotential(p + dx), px0 = aetherPotential(p - dx);
  vec3 py1 = aetherPotential(p + dy), py0 = aetherPotential(p - dy);
  vec3 pz1 = aetherPotential(p + dz), pz0 = aetherPotential(p - dz);

  float x = (py1.z - py0.z) - (pz1.y - pz0.y);
  float y = (pz1.x - pz0.x) - (px1.z - px0.z);
  float z = (px1.y - px0.y) - (py1.x - py0.x);

  return vec3(x, y, z) / (2.0 * eps);
}

/** Cheap hash for per-particle randomness, keyed off the particle's texel UV. */
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
