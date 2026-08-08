#include ../lib/noise3D;

uniform float uTime;
uniform float uPixelRatio;
uniform vec2  uSize;

attribute vec3 aSeed;

varying float vGain;
varying float vCool;

const float TAU = 6.2831853;

void main() {
  float s0 = aSeed.x;
  float s1 = aSeed.y;
  float s2 = aSeed.z;
  float s3 = fract(s0 * 7.31 + s1 * 3.97);

  float dir = mix(-1.0, 1.0, step(0.5, s3));
  float ang = s1 * TAU + uTime * (0.008 + 0.014 * s0) * dir;
  float rho = 0.45 + 1.15 * pow(s2, 0.75);

  vec2 halfR = uSize * 0.5;
  vec3 pos = vec3(cos(ang) * halfR.x * rho, sin(ang) * halfR.y * rho, (s0 - 0.5) * 5.0);

  float n = snoise(vec3(pos.xy * 0.14, uTime * 0.16 + s1 * 9.0));
  pos += vec3(
    sin(uTime * 0.31 + s1 * 43.0),
    cos(uTime * 0.26 + s0 * 37.0),
    sin(uTime * 0.37 + s3 * 51.0)
  ) * (0.5 + 0.3 * n);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = max(-mv.z, 0.001);

  float sizeC = 0.5 + 0.9 * s3 * s3;
  gl_PointSize = clamp(uPixelRatio * sizeC * (110.0 / dist), 0.5, 12.0 * uPixelRatio);

  float halo = exp(-max(rho - 1.0, 0.0) * 4.0);
  float clearing = 0.35 + 0.65 * smoothstep(0.55, 0.95, rho);
  float twinkle = 0.85 + 0.15 * sin(uTime * (0.5 + s0 * 1.2) + s1 * 40.0);
  vGain = halo * clearing * twinkle * (0.4 + 0.6 * s3);
  vCool = 0.25 + 0.55 * s1;
}
