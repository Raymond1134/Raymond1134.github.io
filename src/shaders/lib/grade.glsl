float aetherCurve(float x) {
  const float B = 0.028;
  const float D = 0.43;
  const float E = 0.031;
  return (x * (x + B)) / (x * (x + D) + E);
}

vec3 aetherGrade(vec3 c, float exposure, float hold) {
  c = max(c * exposure, vec3(0.0));
  vec3 perCh = vec3(aetherCurve(c.r), aetherCurve(c.g), aetherCurve(c.b));
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 hue = clamp(aetherCurve(l) * (c / max(l, 1e-5)), 0.0, 1.0);
  return mix(perCh, hue, hold);
}

float aetherVignette(vec2 fc, vec2 res, float strength) {
  vec2 n = (fc / res - 0.5) * vec2(res.x / max(res.y, 1.0), 1.0);
  return mix(1.0, 1.0 - 0.34 * smoothstep(0.30, 1.05, length(n)), strength);
}

#ifndef PHONE_HOLD
#define PHONE_HOLD 0.55
#endif
