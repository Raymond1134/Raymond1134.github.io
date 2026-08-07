float ditherHash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 bandBreak3(vec3 c, vec2 fc, float seed, float k) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return c + (ditherHash(fc + seed) - 0.5) * min(fwidth(l) * k, 0.08);
}
