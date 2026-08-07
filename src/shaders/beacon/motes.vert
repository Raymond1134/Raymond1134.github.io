uniform float uTime;
uniform float uPixelRatio;
uniform float uOrbitRadius;
uniform float uClusters;
uniform float uClusterSeed;
uniform float uScale;

attribute vec3  aSeed;
attribute float aCluster;
attribute float aTrail;
attribute vec3  aColor;

varying float vGain;
varying float vTrail;
varying vec3  vColor;

float h11(float n) {
  return fract(sin(n * 12.9898 + uClusterSeed) * 43758.5453123);
}

void main() {
  float s0 = aSeed.x;
  float s1 = aSeed.y;
  float s2 = aSeed.z;

  float ci = aCluster;

  float u = pow(aTrail, 1.3);

  float cid = ci + 1.0;

  float z   = 1.0 - 2.0 * (ci + 0.5) / uClusters;
  float th  = ci * 2.39996323;
  float rxy = sqrt(max(0.0, 1.0 - z * z));
  vec3  N   = vec3(cos(th) * rxy, z, sin(th) * rxy);

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

  float a = uTime * speed + phase - u * 0.55 * sign(speed);

  vec3 pos = (P * cos(a) + Q * sin(a)) * radius;

  vec3 jit = vec3(s0, s1, fract(s0 * 3.7 + s1 * 5.3)) - 0.5;
  pos += jit * (0.28 + u * 0.95);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  float dist = max(-mv.z, 0.001);

  float sz = fract(s1 * 5.77 + s2 * 2.13);
  gl_PointSize = clamp(
    uPixelRatio * (0.8 + sz * sz * 4.0) * (1.0 - u * 0.45) * (68.0 * uScale / dist),
    0.6,
    12.0 * uPixelRatio * uScale
  );

  vGain = (0.3 + 0.7 * s2) * (0.55 + 0.45 * sin(uTime * (0.6 + s0 * 1.2) + phase * 3.0));

  vTrail = u;
  vColor = aColor;
}
