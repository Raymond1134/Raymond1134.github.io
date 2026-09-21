precision highp float;

#include ../lib/grade;
#include ../lib/chroma;

uniform vec3  uColor;
uniform float uTime;
uniform float uBreath;
uniform float uOpacity;
uniform vec2  uSize;
uniform float uExposure;
uniform float uDraw;

varying vec2 vUv;

float roundRect(vec2 p, vec2 hs, float r) {
  vec2 q = abs(p) - (hs - r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 p = (vUv - 0.5) * uSize;

  vec2 c = uSize * 0.5 - vec2(13.0, 10.0);
  float d = roundRect(p, c, min(c.x, c.y) * 0.5);

  vec2 m = uSize * 0.5 - abs(p);
  float edgeFade = smoothstep(0.0, 3.0, min(m.x, m.y));

  float glow = exp(-pow(max(d, 0.0) / 2.5, 1.6));

  vec2 rb = uSize * 0.5 - vec2(9.6, 6.2);
  float dr = roundRect(p, rb, 2.5);

  if (glow * edgeFade * uOpacity < 0.002 && abs(dr) > 3.5) discard;

  float mist = 0.5
    + 0.45 * sin(p.x * 0.22 + uTime * 0.55)
           * sin(p.y * 0.21 - uTime * 0.52 + sin(p.x * 0.12 + uTime * 0.11) * 2.0);
  float veil = glow * mist * 0.07;

  float breathe = 0.86 + 0.14 * uBreath;

  float alpha = veil * edgeFade * breathe * uOpacity;
  vec3 col = uColor * (0.6 + veil * 2.2 + glow * 1.5);

  col = gelTint(col, (p.x - p.y) * 0.10 + uTime * 0.13, 0.10);

  float rimA = 0.0;
  vec3 rimCol = vec3(0.0);
  if (abs(dr) < 3.5) {
    float ang = atan(p.x * rb.y / rb.x, p.y);
    float along = abs(ang) / 3.14159265;
    float drawn = smoothstep(along - 0.04, along, uDraw * 1.04);
    float head = exp(-pow((along - uDraw) * 22.0, 2.0)) * (1.0 - uDraw * uDraw);
    float sweep = pow(0.5 + 0.5 * cos(2.0 * (ang - uTime * 0.21)), 24.0);
    float line = exp(-abs(dr) * 5.0) + 0.3 * exp(-abs(dr) * 1.4);
    rimA = line * (drawn * (0.026 + 0.15 * sweep) + head * 0.5) * breathe * uOpacity;

    rimCol = uColor * 1.5 + vec3(0.18);
    rimCol = gelTint(rimCol, ang * 0.8 + uTime * 0.1, 0.25);
#if PHONE_GRADE
    rimCol = aetherGrade(rimCol, uExposure, PHONE_HOLD);
#endif
  }

#if PHONE_GRADE
  col = aetherGrade(col, uExposure, PHONE_HOLD);
#endif

  float aOut = alpha + rimA;
  gl_FragColor = vec4((col * alpha + rimCol * rimA) / max(aOut, 1e-5), aOut);

  #include <colorspace_fragment>
}
