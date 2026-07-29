uniform float uTime;
uniform float uPixelRatio;
uniform float uOrbitRadius;
uniform float uClusters;
uniform float uClusterSeed;   // per-beacon, so no two beacons share a wisp layout

attribute vec3  aSeed;      // three per-mote constants, 0..1
attribute float aCluster;   // which wisp this mote belongs to
attribute float aTrail;     // raw position along that wisp, 0..1
attribute vec3  aColor;     // the wisp's colour, assigned on the CPU

varying float vGain;
varying float vTrail;   // 0 at the head of a wisp, 1 at the tail
varying vec3  vColor;

float h11(float n) {
  return fract(sin(n * 12.9898 + uClusterSeed) * 43758.5453123);
}

void main() {
  float s0 = aSeed.x;
  float s1 = aSeed.y;
  float s2 = aSeed.z;

  float ci = aCluster;

  // Skewed toward the head: uniform spacing reads as a ring segment, not a comet.
  float u = pow(aTrail, 1.3);

  /* ---- per-cluster orbit, all derived from the cluster index ---- */
  float cid = ci + 1.0;

  // Fibonacci spiral, NOT random normals — random leaves the closest pair only
  // ~18 deg apart on some seeds and the two wisps merge into a band. Per-beacon
  // variety comes from the rigid rotation below; jittering these points instead
  // reintroduces the collision, at ~5 deg worst case.
  float z   = 1.0 - 2.0 * (ci + 0.5) / uClusters;
  float th  = ci * 2.39996323;
  float rxy = sqrt(max(0.0, 1.0 - z * z));
  vec3  N   = vec3(cos(th) * rxy, z, sin(th) * rxy);

  // Rodrigues rotation preserves every pairwise angle, so the spiral's spacing
  // guarantee survives. Axis sampled on the sphere rather than as a raw vec3,
  // which could normalize a near-zero vector to NaN.
  float rz   = h11(101.0) * 2.0 - 1.0;
  float rth  = h11(103.0) * 6.2831853;
  float rxy2 = sqrt(max(0.0, 1.0 - rz * rz));
  vec3  rAxis = vec3(cos(rth) * rxy2, rz, sin(rth) * rxy2);
  float rAng = h11(107.0) * 6.2831853;
  N = N * cos(rAng) + cross(rAxis, N) * sin(rAng)
      + rAxis * dot(rAxis, N) * (1.0 - cos(rAng));

  float radius = uOrbitRadius * (0.78 + h11(cid * 5.1) * 0.5);
  float speed  = (0.22 + h11(cid * 7.9) * 0.16) * (h11(cid * 11.3) < 0.5 ? -1.0 : 1.0);
  float phase  = h11(cid * 13.7) * 6.2831853;
  float wob    = 0.30 + h11(cid * 17.1) * 0.35;
  float prate  = (0.05 + h11(cid * 19.3) * 0.09) * (h11(cid * 23.9) < 0.5 ? -1.0 : 1.0);

  // Precessing orbit basis, derived analytically from the FIXED normal N.
  // Rebuilding the cross-product basis on the moving axis would flip `helper`
  // as it crossed vertical and snap the whole wisp. Orthonormal for every pa.
  vec3 helper = mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), step(0.95, abs(N.y)));
  vec3 e1 = normalize(cross(N, helper));
  vec3 e2 = normalize(cross(N, e1));

  float pa = uTime * prate;
  float cw = cos(wob);
  float sw = sin(wob);
  vec3 radialv = e1 * cos(pa) + e2 * sin(pa);
  vec3 axis =  N * cw + radialv * sw;
  vec3 P    = -N * sw + radialv * cw;
  vec3 Q    = -e1 * sin(pa) + e2 * cos(pa);

  // Signed by `speed`, so the tail trails whichever way the wisp travels.
  float a = uTime * speed + phase - u * 0.55 * sign(speed);

  vec3 pos = (P * cos(a) + Q * sin(a)) * radius;

  // Scatter widens toward the tail, so a wisp frays instead of ending flat.
  vec3 jit = vec3(s0, s1, fract(s0 * 3.7 + s1 * 5.3)) - 0.5;
  pos += jit * (0.28 + u * 0.95);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  float dist = max(-mv.z, 0.001);

  // Squared so the distribution skews small — a linear ramp makes every mote
  // mid-sized and the wisp flattens.
  float sz = fract(s1 * 5.77 + s2 * 2.13);
  gl_PointSize = clamp(
    uPixelRatio * (0.8 + sz * sz * 4.0) * (1.0 - u * 0.45) * (68.0 / dist),
    0.6,
    12.0 * uPixelRatio
  );

  // Own clock per mote, so a wisp shimmers rather than blinking as one body.
  vGain = (0.3 + 0.7 * s2) * (0.55 + 0.45 * sin(uTime * (0.6 + s0 * 1.2) + phase * 3.0));

  vTrail = u;
  vColor = aColor;
}
