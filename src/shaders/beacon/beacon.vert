varying vec3 vN;
varying vec3 vV;
varying vec3 vDir;

void main() {
  // The icosahedron's own normals are per-face, which makes the fresnel terms
  // in core.frag visibly faceted. For a sphere on the origin this is the exact
  // smooth normal, so the geometry stays cheap and the shading doesn't.
  vec3 n = normalize(position);

  // Object space, so the corona is anchored to the beacon rather than swimming
  // whenever the camera moves.
  vDir = n;

  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * n);
  vV = normalize(-mv.xyz);

  gl_Position = projectionMatrix * mv;
}
