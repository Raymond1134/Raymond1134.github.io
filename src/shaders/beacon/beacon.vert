varying vec3 vN;
varying vec3 vV;
varying vec3 vDir;

void main() {
  // normalize(position) is the exact smooth normal for a sphere centred on the
  // origin. The icosahedron's own normals are per-face, which makes the fresnel
  // terms below visibly faceted — the geometry stays cheap, the shading doesn't.
  vec3 n = normalize(position);

  // Object space, so the corona is anchored to the beacon and drifts on its own
  // clock rather than swimming whenever the camera moves.
  vDir = n;

  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * n);
  vV = normalize(-mv.xyz);

  gl_Position = projectionMatrix * mv;
}
