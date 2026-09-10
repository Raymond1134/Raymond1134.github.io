float ditherHash(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

vec3 bandBreak3(vec3 c, vec2 fc, float seed, float k) {
  float n = ditherHash(fc + vec2(seed, seed * 1.618)) * 2.0 - 1.0;
  n = sign(n) * (1.0 - sqrt(1.0 - abs(n)));
  vec3 lsb = max(vec3(0.0774), 2.275 * pow(max(c, vec3(1e-6)), vec3(0.5833)));
  return max(c + lsb * (n * k / 255.0), vec3(0.0));
}
