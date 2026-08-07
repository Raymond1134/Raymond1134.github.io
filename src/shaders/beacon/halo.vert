uniform float uWorld;

varying vec2 vQ;

void main() {
  vQ = position.xy;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * uWorld;
  gl_Position = projectionMatrix * mv;
}
