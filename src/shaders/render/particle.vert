uniform sampler2D uPositions;
uniform sampler2D uVelocities;
uniform float uSize;
uniform float uPixelRatio;
uniform float uTime;
uniform vec3  uCenter;
uniform float uFadeStart;
uniform float uFadeEnd;
uniform vec4  uLights[6];     // xyz = hearth position, w = reach
uniform vec3  uLightCols[6];

attribute vec2 aRef;   // which texel this vertex reads

varying float vSpeed;
varying float vDepth;
varying float vGain;     // per-particle brightness (class dim * ember breath)
varying float vSeed;     // per-particle constant, 0..1
varying float vFade;     // fades out toward the wrap boundary
varying float vClass;    // 0 dust, 1 firefly, 2 deep mote
varying float vDefocus;  // 1 right at the camera, 0 past ~16 units
varying float vLit;      // how much hearthlight reaches this particle
varying vec3  vLitCol;   // and its blended color

void main() {
  vec4 p = texture2D(uPositions, aRef);
  vec4 vd = texture2D(uVelocities, aRef);
  vec3 v = vd.xyz;
  float seed = vd.w;

  vec4 mv = modelViewMatrix * vec4(p.xyz, 1.0);
  gl_Position = projectionMatrix * mv;

  float dist = max(-mv.z, 0.001);

  // Three kinds of thing, by seed: fine dust (85%), discrete bokeh fireflies
  // (12%), and a few vast, faint deep motes (3%). One field, three scales.
  float isFly  = step(0.85, seed) * (1.0 - step(0.97, seed));
  float isMote = step(0.97, seed);
  float isDust = 1.0 - isFly - isMote;
  vClass = isFly + isMote * 2.0;

  // Fresh within-class parameter, decorrelated from the class split.
  float u = fract(seed * 61.7);

  float sizeClass = isDust * (0.30 + 0.25 * u)
                  + isFly  * (0.9 + 1.3 * u * u)
                  + isMote * (4.0 + 4.0 * u);
  float cap = (isDust * 6.0 + isFly * 13.0 + isMote * 24.0) * uPixelRatio;

  // Near-field defocus: a particle streaming right past the lens swells and
  // softens like true bokeh instead of clamping into a hard bright disc.
  vDefocus = 1.0 - smoothstep(4.0, 16.0, dist);
  float spread = 1.0 + 2.0 * vDefocus;

  // Energy conservation must use the REALIZED growth: near sprites often sit
  // on their cap, and dimming by the nominal spread² would black them out.
  float pxRaw = uSize * uPixelRatio * sizeClass * (130.0 / dist);
  float size0 = min(pxRaw, cap);
  float size1 = min(pxRaw * spread, cap * (1.0 + vDefocus));
  gl_PointSize = size1;

  // Value pyramid: masses of near-black dust, rare bright individuals.
  float dim = isDust * (0.20 + 0.35 * u * u)
            + isFly  * (0.55 + 0.45 * u)
            + isMote;

  // Ember breath, never a twinkle: 0.10–0.20 Hz, each on its own slow clock.
  float omega = mix(0.10, 0.20, fract(seed * 7.31)) * 6.2831853;
  float env = smoothstep(0.15, 0.75, sin(uTime * omega + seed * 40.0));
  float breathe = 1.0 + (env - 0.5) * 2.0 * (isDust * 0.12 + isFly * 0.28);

  // Deep motes breathe in size instead of light.
  gl_PointSize *= 1.0 + isMote * (env - 0.5) * 0.12;

  float grew = size1 / max(size0, 1e-3);
  float defDim = 1.0 / (grew * grew);

  // Gone to nothing before the wrap distance, so the teleport is never seen.
  vFade = 1.0 - smoothstep(uFadeStart, uFadeEnd, length(p.xyz - uCenter));

  // Beyond the fade sphere: fully transparent but still rasterized and
  // blended. Park those outside the clip volume instead.
  if (vFade <= 0.001) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);

  // Sourced light: how much hearthlight reaches this particle. The hearths
  // are static, so this is six distances per vertex and nothing more.
  float lit = 0.0;
  vec3 litCol = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    float att = pow(clamp(1.0 - distance(p.xyz, uLights[i].xyz) / uLights[i].w, 0.0, 1.0), 2.0);
    lit += att;
    litCol += uLightCols[i] * att;
  }
  vLit = min(lit, 1.0) * (1.0 - isMote);   // the deep never warms
  vLitCol = litCol / max(lit, 1e-3);

  vGain  = dim * breathe * defDim;
  vSpeed = length(v);
  vDepth = dist;
  vSeed  = seed;
}
