#include ../lib/grade;
#include ../lib/dither;

uniform float uExposure;
uniform float uHold;
uniform float uRush;
uniform vec2  uRes;
uniform float uDitherK;

vec3 rushTint(vec2 uv) {
  vec2 q = (uv - 0.5) * uRes / max(min(uRes.x, uRes.y), 1.0);
  float r = length(q);
  float core = 1.0 - smoothstep(0.0, 0.42, r);
  float rim = smoothstep(0.28, 0.95, r);
  vec3 warm = 1.0 + core * vec3(0.26, 0.16, 0.04);
  vec3 cool = mix(vec3(1.0), vec3(0.74, 0.87, 1.14), rim);
  return mix(vec3(1.0), warm * cool, uRush);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 fc = uv * uRes;

  vec3 src = inputColor.rgb;
  if (uRush > 0.001) src *= rushTint(uv);

  vec3 col = aetherGrade(src, uExposure, uHold);

  col *= aetherVignette(fc, uRes, 1.0);

  col = bandBreak3(col, fc, 17.0, uDitherK);

  outputColor = vec4(col, inputColor.a);
}
