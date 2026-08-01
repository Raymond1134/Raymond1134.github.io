precision highp float;

#include ../lib/noise3D;

uniform vec3  uNadir;
uniform vec3  uMid;
uniform vec3  uZenith;
uniform vec3  uVeilCold;
uniform vec3  uVeilMid;
uniform float uTime;
uniform float uBreath;
uniform float uEnvGain;
uniform vec3  uLightDir[DEPTHS_LIGHTS];
uniform vec3  uLightCol[DEPTHS_LIGHTS];
uniform float uLightW[DEPTHS_LIGHTS];

varying vec3 vDir;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec3 d = normalize(vDir);

  // Vertical script: violet-black beneath, THE color of "far" at eye level,
  // a broad slate lift far above. No horizon line anywhere.
  vec3 col = mix(uNadir, uMid, smoothstep(-0.65, 0.10, d.y));
  col = mix(col, uZenith, smoothstep(0.05, 0.85, d.y));

#if DEPTHS_OCT > 0
  vec3 q = d * 2.3 + vec3(0.0, uTime * 0.008, uTime * 0.005);
#if DEPTHS_WARP
  // Domain warp: turns banded fbm into slow drifting veils.
  q += 0.6 * vec3(
    snoise(d * 1.7 + vec3(uTime * 0.010, 0.0, 0.0)),
    snoise(d * 1.9 + vec3(0.0, -uTime * 0.008, 0.0)),
    0.0
  );
#endif
  float n = 0.0;
  float amp = 1.0;
  float tot = 0.0;
  for (int i = 0; i < DEPTHS_OCT; i++) {
    n += amp * snoise(q);
    tot += amp;
    amp *= 0.5;
    q *= 2.1;
  }
  float veil = smoothstep(0.35, 0.85, n / tot * 0.5 + 0.5);
  col += (uVeilCold * 0.055 + uVeilMid * 0.030) * veil;
#endif

  // Sourced warmth: each hearth stains the water toward itself, weighted by
  // its distance. This is the only warm thing the environment ever does.
  for (int i = 0; i < DEPTHS_LIGHTS; i++) {
    col += uLightCol[i] * (uLightW[i] * pow(max(dot(d, uLightDir[i]), 0.0), 24.0));
  }

  col *= (0.92 + 0.08 * uBreath) * uEnvGain;

  // The environment is a stage, never a light: hard ceiling, then a dither
  // so the deep gradients don't band on 8-bit output.
  col = min(col, vec3(0.30));
  col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);

  // sRGB-encodes only when writing straight to the canvas (the composer-free
  // path); into the composer's linear HalfFloat target three compiles this to
  // identity. Without it, custom shaders render gamma-crushed on phones.
  #include <colorspace_fragment>
}
