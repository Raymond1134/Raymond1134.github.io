precision highp float;

#include ../lib/grade;
#include ../lib/chroma;

uniform vec3  uColor;
uniform float uTime;
uniform float uBreath;
uniform float uOpacity;
uniform vec2  uSize;
uniform float uExposure;

varying vec2 vUv;

void main() {
  vec2 p = (vUv - 0.5) * uSize;

  vec2 c = uSize * 0.5 - vec2(13.0, 10.0);
  float r = min(c.x, c.y) * 0.5;
  vec2 q = abs(p) - (c - r);
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;

  vec2 m = uSize * 0.5 - abs(p);
  float edgeFade = smoothstep(0.0, 3.0, min(m.x, m.y));

  float glow = exp(-pow(max(d, 0.0) / 2.5, 1.6));
  float mist = 0.5
    + 0.45 * sin(p.x * 0.22 + uTime * 0.55)
           * sin(p.y * 0.21 - uTime * 0.52 + sin(p.x * 0.12 + uTime * 0.11) * 2.0);
  float veil = glow * mist * 0.07;

  float breathe = 0.86 + 0.14 * uBreath;

  float alpha = veil * edgeFade * breathe * uOpacity;
  vec3 col = uColor * (0.6 + veil * 2.2 + glow * 1.5);

  col = gelTint(col, (p.x - p.y) * 0.10 + uTime * 0.13, 0.10);

#if PHONE_GRADE
  col = aetherGrade(col, uExposure, PHONE_HOLD);
#endif

  gl_FragColor = vec4(col, alpha);

  #include <colorspace_fragment>
}
