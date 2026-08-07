#include noise3D;

vec3 aetherPotential(vec3 p) {
  return vec3(
    snoise(p),
    snoise(p + vec3(123.4, 56.7, 89.1)),
    snoise(p + vec3(-45.6, 78.9, -12.3))
  );
}

vec3 curlNoise(vec3 p, float eps) {
  float h = 2.0 * eps;

  vec3 p0 = aetherPotential(p);
  vec3 px = aetherPotential(p + vec3(h, 0.0, 0.0));
  vec3 py = aetherPotential(p + vec3(0.0, h, 0.0));
  vec3 pz = aetherPotential(p + vec3(0.0, 0.0, h));

  float x = (py.z - p0.z) - (pz.y - p0.y);
  float y = (pz.x - p0.x) - (px.z - p0.z);
  float z = (px.y - p0.y) - (py.x - p0.x);

  return vec3(x, y, z) / h;
}
