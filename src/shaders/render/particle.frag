precision highp float;

uniform vec3  uColorCold;
uniform vec3  uColorMid;
uniform vec3  uColorHot;
uniform vec3  uColorAccent;
uniform float uOpacity;
uniform float uSpeedScale;
uniform float uFogDensity;

varying float vSpeed;
varying float vDepth;
varying float vGain;
varying float vSeed;
varying float vFade;

void main() {
  // Soft round sprite, no texture needed. `r2` is 0 at the centre, 1 at the edge.
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c) * 4.0;
  if (r2 > 1.0) discard;

  float core = exp(-r2 * 4.5);         // tight bright centre
  float halo = exp(-r2 * 1.6) * 0.30;  // soft surrounding glow

  // The (1 - r2) term forces alpha to exactly zero at the edge. Without it the
  // sprite still has ~0.16 alpha where `discard` cuts it off, leaving a visible
  // hard disc rim on every particle.
  float alpha = (core + halo) * (1.0 - r2);

  // --- colour --------------------------------------------------------------
  float heat = smoothstep(0.0, uSpeedScale, vSpeed);

  // Per-particle hue bias. Without it colour is a pure function of velocity and
  // clusters spatially into clean bands — one region entirely blue, another
  // entirely violet.
  heat = clamp(heat + (vSeed - 0.5) * 0.5, 0.0, 1.0);

  // Three-stop analogous ramp: blue -> violet -> rose. Branchless.
  vec3 col = mix(
    mix(uColorCold, uColorMid, smoothstep(0.0, 0.55, heat)),
    uColorHot,
    smoothstep(0.5, 1.0, heat)
  );

  // Warm white, reserved for the fastest few percent. Rare by design — this is
  // the "spark", and it stops working the moment it's common.
  col = mix(col, uColorAccent, smoothstep(0.88, 1.0, heat) * 0.55);

  float fog = exp(-vDepth * uFogDensity);

  // Only the very nearest are pulled back. The camera flies THROUGH this field,
  // so motes have to stay visible as they stream past — the old 6..26 fade
  // blanked out everything you were passing, which is the part worth seeing.
  float near = smoothstep(1.0, 10.0, vDepth);

  // Base brightness is deliberately low: additive blending sums overlapping
  // sprites, so a high floor saturates to white once the field gets dense. Only
  // fast particles push above 1.0.
  vec3 lit = col * (0.30 + heat * 1.05);

  gl_FragColor = vec4(lit, alpha * uOpacity * vGain * fog * near * vFade);
}
