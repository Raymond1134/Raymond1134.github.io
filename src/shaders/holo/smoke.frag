precision highp float;

uniform vec2  uSize;
uniform float uOpacity;

varying vec2 vUv;

void main() {
  vec2 p = (vUv - 0.5) * uSize;
  vec2 q = abs(p) - (uSize * 0.5 - 3.5 - 1.5);
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 1.5;
  float mask = 1.0 - smoothstep(-3.0, 1.0, d);
  gl_FragColor = vec4(vec3(0.0009, 0.0018, 0.0046), mask * uOpacity);
  #include <colorspace_fragment>
}
