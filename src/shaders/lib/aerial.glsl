const float AERIAL_K = 0.0042;
const vec3 AERIAL_DEEP = vec3(0.0048, 0.0044, 0.0295);

vec3 aerialCol(vec3 c, float d) {
  float f = exp(-d * AERIAL_K);
  return mix(AERIAL_DEEP * dot(c, vec3(0.33)), c, f);
}

float aerialGain(float d) {
  return mix(0.30, 1.0, exp(-d * AERIAL_K));
}
