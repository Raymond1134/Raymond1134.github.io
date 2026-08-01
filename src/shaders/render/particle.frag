precision highp float;

uniform vec3  uColorCold;
uniform vec3  uColorMid;
uniform vec3  uColorHot;
uniform vec3  uColorAccent;
uniform float uOpacity;
uniform float uSpeedScale;
uniform float uFogDensity;
uniform vec3  uDeepColor;
uniform float uSoftClip;

varying float vSpeed;
varying float vDepth;
varying float vGain;
varying float vSeed;
varying float vFade;
varying float vClass;
varying float vDefocus;
varying float vLit;
varying vec3  vLitCol;

void main() {
  // `r2` is 0 at the centre, 1 at the edge.
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c) * 4.0;
  if (r2 > 1.0) discard;

  float isFly  = step(0.5, vClass) * (1.0 - step(1.5, vClass));
  float isMote = step(1.5, vClass);
  float isDust = 1.0 - isFly - isMote;

  // Dust: tight gaussian point of light. The (1 - r2) term forces alpha to
  // exactly zero at the edge — without it every sprite has a hard disc rim.
  float dustA = (exp(-r2 * 4.5) + exp(-r2 * 1.6) * 0.30) * (1.0 - r2);

  // Firefly: bokeh disc — flat luminous body whose rim brightens as it
  // drifts close and defocuses. Both terms reach zero at the edge.
  float body = smoothstep(1.0, 0.62, r2);
  float rim  = (smoothstep(0.55, 0.9, r2) - smoothstep(0.9, 1.0, r2)) * 0.5 * vDefocus;
  float flyA = body * 0.85 + rim;

  // Deep mote: a vast, barely-there presence.
  float moteA = exp(-r2 * 1.1) * (1.0 - r2) * 0.45;

  float alpha = isDust * dustA + isFly * flyA + isMote * moteA;

  // --- colour --------------------------------------------------------------
  float heat = smoothstep(0.0, uSpeedScale, vSpeed);

  // Per-particle hue bias, decorrelated from the class split — raw seed would
  // hand every firefly (seed 0.85–0.97) a permanent warm bias on top of its
  // deliberate heat floor, and sparks would stop being rare.
  heat = clamp(heat + (fract(vSeed * 17.13) - 0.5) * 0.5, 0.0, 1.0);

  // Fireflies run warmer: their floor starts where dust tops out.
  heat = min(heat + isFly * 0.25, 1.0);

  // Three-stop analogous ramp: blue -> violet -> rose. Branchless.
  vec3 col = mix(
    mix(uColorCold, uColorMid, smoothstep(0.0, 0.55, heat)),
    uColorHot,
    smoothstep(0.5, 1.0, heat)
  );

  // Warm white, reserved for the fastest few percent — the spark.
  col = mix(col, uColorAccent, smoothstep(0.88, 1.0, heat) * 0.55);

  // Deep motes stay abyssal: pinned cold-violet whatever their speed.
  col = mix(col, mix(uColorCold, uColorMid, fract(vSeed * 3.77)), isMote);

  // Hearthlight reception: within reach of a beacon the sea takes its color.
  col = mix(col, vLitCol, vLit * 0.65);

  float fog = exp(-vDepth * uFogDensity);

  // Aerial perspective: distance dims AND cools — far ribbons dissolve into
  // the same color the dome calls "far", so depth reads as one system.
  col = mix(uDeepColor, col, fog);

  // Only the very nearest are pulled back; the camera flies THROUGH this
  // field, and what streams past is the part worth seeing.
  float near = smoothstep(2.0, 14.0, vDepth);

  // Base floor low: additive blending sums overlapping sprites. Received
  // hearthlight lifts the medium near a beacon above its own floor.
  float base = 0.27 + isFly * 0.15;
  vec3 lit = col * (base + heat * (1.05 + isFly * 0.35)) * (1.0 + vLit * 1.2);

  // Composer-free path: Reinhard soft-clip stands in for ACES, so dense
  // crossings saturate to warm colour instead of clipping white.
  lit = mix(lit, lit / (1.0 + lit), uSoftClip);

  float classGain = isDust + isFly + isMote * 0.12;

  gl_FragColor = vec4(lit, alpha * uOpacity * vGain * fog * near * vFade * classGain);

  #include <colorspace_fragment>
}
