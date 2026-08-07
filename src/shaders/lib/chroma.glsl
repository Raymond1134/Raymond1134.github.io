vec3 gelSheen(float phase) {
  float w = fract(phase * 0.15915494) * 4.0;
  vec3 T = vec3(0.74, 1.05, 1.32);
  vec3 V = vec3(1.16, 0.89, 1.42);
  vec3 R = vec3(1.32, 0.88, 1.08);
  vec3 G = vec3(1.20, 0.99, 0.58);
  return w < 1.0 ? mix(T, V, smoothstep(0.0, 1.0, w))
       : w < 2.0 ? mix(V, R, smoothstep(0.0, 1.0, w - 1.0))
       : w < 3.0 ? mix(R, G, smoothstep(0.0, 1.0, w - 2.0))
       :           mix(G, T, smoothstep(0.0, 1.0, w - 3.0));
}

vec3 gelTint(vec3 c, float phase, float amt) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return mix(c, l * gelSheen(phase), amt);
}

vec3 gelFringe(vec3 c, float r2, float amt) {
  return mix(c, c * vec3(0.70, 0.94, 1.42), smoothstep(0.55, 1.0, r2) * amt);
}
