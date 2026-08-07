#include ../lib/grade;
#include ../lib/dither;

uniform float uExposure;
uniform float uHold;
uniform vec2  uRes;
uniform float uDitherK;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 fc = uv * uRes;

  vec3 col = aetherGrade(inputColor.rgb, uExposure, uHold);

  col *= aetherVignette(fc, uRes, 1.0);

  col = bandBreak3(col, fc, 17.0, uDitherK);

  outputColor = vec4(col, inputColor.a);
}
