#include ../lib/chroma;

uniform float uTime;
uniform float uBreath;
uniform float uPixelRatio;
uniform float uDrift;
uniform float uReveal;
uniform vec3  uRevealOrigin;
uniform vec2  uResolution;

attribute float aSize;
attribute float aSeed;
attribute float aRole;
attribute vec3  aColor;

varying vec3  vCol;
varying float vA;

const vec3 STAR = vec3(0.30, 0.34, 0.52);

void main() {
  vec3 p = position;

  p += vec3(
    sin(uTime * 0.125 + aSeed * 17.0),
    sin(uTime * 0.11  + aSeed * 29.0),
    sin(uTime * 0.14  + aSeed * 41.0)
  ) * (0.4 * uDrift);

  float edge = 1.0;
  if (aRole > 0.5) {
    float rate = 6.0 + 5.0 * fract(aSeed * 0.13);
    p.y = -460.0 + mod(uTime * rate * uDrift + aSeed * 91.7, 340.0);
    edge = smoothstep(-460.0, -420.0, p.y) * (1.0 - smoothstep(-170.0, -122.0, p.y));
  }

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = max(-mv.z, 0.001);

  float vk = clamp(uResolution.y / (uPixelRatio * 760.0), 0.62, 1.0);
  float px = min(aSize * uPixelRatio * (130.0 / dist), 4.0 * uPixelRatio) * vk;
  float size = max(px, 1.5 * uPixelRatio);
  float tiny = min(1.0, (px * px) / (size * size));

  float reveal = 1.0;
  float glint = 0.0;
  if (uReveal < 1.0) {
    float front = uReveal * (380.0 + 520.0 * uReveal * uReveal * uReveal);
    float d = distance(p, uRevealOrigin);
    float on = step(0.001, uReveal);
    reveal = smoothstep(front, front - 40.0, d) * on;
    glint = exp(-abs(d - front + 18.0) / 20.0) * on;
  }

  float tw = (1.0 - aRole) * step(0.62, fract(aSeed * 7.13))
           * pow(max(0.5 + 0.5 * sin(uTime * (0.6 + 1.2 * fract(aSeed * 3.17)) + aSeed * 11.0), 0.0), 24.0);
  float spark = max(tw, glint) * uDrift;

  gl_PointSize = max(size, (1.5 + 1.5 * spark) * uPixelRatio);

  vA = (0.9 + 0.2 * (uBreath - 0.5)) * smoothstep(40.0, 80.0, dist) * reveal * mix(tiny, 1.0, spark)
     * edge * (1.0 + 0.35 * aRole) * (1.0 + 7.0 * spark);

  vCol = mix(gelTint(aColor, aSeed * 60.0 + uTime * 0.08, 0.28), STAR, 0.5 * spark);
}
