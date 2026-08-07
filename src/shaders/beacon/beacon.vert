varying vec3 vN;
varying vec3 vV;
varying vec3 vDir;

void main() {
  vec3 n = normalize(position);

  vDir = n;

  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * n);
  vV = normalize(-mv.xyz);

  gl_Position = projectionMatrix * mv;
}
