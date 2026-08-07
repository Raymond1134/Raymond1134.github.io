uniform mat4 uProjInv;
uniform mat4 uViewInv;

varying vec3 vDir;

void main() {
  vec4 p = uProjInv * vec4(position.xy, -1.0, 1.0);
  vDir = (uViewInv * vec4(p.xyz / p.w, 0.0)).xyz;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
