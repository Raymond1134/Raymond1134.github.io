precision highp float;

#include ../lib/grade;

uniform vec3  uColor;
uniform float uFlat;
uniform float uTunnel;
uniform float uAspect;

varying vec2 vUv;

void main() {
  vec2 n = vUv * vec2(uAspect, 1.0) / min(uAspect, 1.0);
  float iris = smoothstep(0.32, 1.55, length(n));
  float grain = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float a = clamp(uFlat + uTunnel * iris + (grain - 0.5) / 255.0, 0.0, 0.85);

  vec3 col = uColor;
#if PHONE_GRADE
  col = aetherGrade(col, 1.0, PHONE_HOLD);
#endif

  gl_FragColor = vec4(col, a);

  #include <colorspace_fragment>
}
