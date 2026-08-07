precision highp float;

#include ../lib/noise3D;
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

  float margin = min(2.7, uSize.y * 0.155);
  vec2 q = abs(p) - (uSize * 0.5 - margin - 1.5);
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 1.5;

  vec2 m = uSize * 0.5 - abs(p);
  float edgeFade = smoothstep(0.0, 1.5, min(m.x, m.y));

  float well = 0.18 + 0.55 * smoothstep(-uSize.y * 0.5, uSize.y * 0.5, -p.y);

  float rim = 0.0;
  float core = 0.0;
  if (abs(d) < 5.0) {
    float swell   = snoise(vec3(p.x * 0.045 + 31.7, p.y * 0.045, uTime * 0.07));
    float shimmer = snoise(vec3(p.x * 0.14, p.y * 0.14, uTime * 0.16));
    float w = 1.0 + 0.45 * swell;
    core = exp(-(d * d) / 0.15) * (0.15 + 0.85 * smoothstep(-0.1, 0.9, shimmer));
    rim = (core + exp(-(d * d) / (w * w)) * (0.45 + 0.35 * shimmer)) * well;
  }

  float inside = smoothstep(1.0, 5.0, -d);
  float mist = 0.5
    + 0.30 * sin(p.x * 0.30 + uTime * 0.37)
           * sin(p.y * 0.21 - uTime * 0.52 + sin(p.x * 0.12 + uTime * 0.11) * 2.0);
  float veil = inside * mist * 0.045;

  float breathe = 0.86 + 0.14 * uBreath;

  float alpha = (veil + rim * 0.48) * edgeFade * breathe * uOpacity;
  vec3 col = uColor * (0.6 + rim * 1.5 + veil * 3.0) + vec3(core * core * 0.2 * well);

  col = gelTint(col, (p.x - p.y) * 0.10 + uTime * 0.13, 0.22);

#if PHONE_GRADE
  col = aetherGrade(col, uExposure, PHONE_HOLD);
#endif

  gl_FragColor = vec4(col, alpha);

  #include <colorspace_fragment>
}
