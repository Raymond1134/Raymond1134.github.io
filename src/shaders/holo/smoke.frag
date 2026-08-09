precision highp float;

uniform vec2  uSize;
uniform float uOpacity;
uniform vec3  uColor;

varying vec2 vUv;

void main() {
  vec2 p = (vUv - 0.5) * uSize;
  vec2 c = uSize * 0.5 - vec2(13.0, 10.0);
  float r = min(c.x, c.y) * 0.5;
  vec2 q = abs(p) - (c - r);
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  vec2 m = uSize * 0.5 - abs(p);
  float edgeFade = smoothstep(0.0, 3.0, min(m.x, m.y));
  float mask = 0.94 * exp(-pow(max(d, 0.0) / 2.0, 1.6)) * edgeFade;
  vec3 ink = vec3(0.0009, 0.0018, 0.0046) + uColor * uColor * 0.045;
  gl_FragColor = vec4(ink, mask * uOpacity);
  #include <colorspace_fragment>
}
