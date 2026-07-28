precision highp float;

uniform vec3  uColorCold;
uniform vec3  uColorHot;
uniform vec3  uColorAccent;
uniform float uOpacity;
uniform float uSpeedScale;
uniform float uFogDensity;

varying float vSpeed;
varying float vLife;
varying float vDepth;

void main() {
  // Soft round sprite, no texture needed.
  vec2 c = gl_PointCoord - 0.5;
  float d2 = dot(c, c);
  if (d2 > 0.25) discard;

  float core = exp(-d2 * 14.0);        // tight bright centre
  float halo = exp(-d2 * 4.0) * 0.35;  // soft surrounding glow
  float alpha = core + halo;

  // Fast particles run hot. This is what sells "energy".
  float heat = smoothstep(0.0, uSpeedScale, vSpeed);
  vec3 col = mix(uColorCold, uColorHot, heat);
  col = mix(col, uColorAccent, smoothstep(0.75, 1.0, heat) * 0.6);

  // Fade in on spawn (life near 1), fade out on death (life near 0).
  float birth = smoothstep(1.0, 0.88, vLife);
  float death = smoothstep(0.0, 0.14, vLife);

  // Exponential distance fade so the far field dissolves into the void.
  float fog = exp(-vDepth * uFogDensity);

  gl_FragColor = vec4(col * (0.6 + heat * 1.4), alpha * uOpacity * birth * death * fog);
}