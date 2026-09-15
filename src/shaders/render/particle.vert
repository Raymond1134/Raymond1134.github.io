uniform sampler2D uPositions;
uniform sampler2D uVelocities;
uniform float uSize;
uniform float uPixelRatio;
uniform float uTime;
uniform vec3  uCenter;
uniform float uFadeStart;
uniform float uFadeEnd;
uniform vec4  uLights[6];
uniform vec3  uLightCols[6];
uniform float uTorch;
uniform float uReveal;
uniform vec3  uRevealOrigin;
uniform vec3  uPulseOrigin;
uniform float uPulseRadius;
uniform float uPulseBand;
uniform float uPulseGlow;
uniform vec2  uResolution;
uniform vec3  uCamVel;
uniform float uStreak;
uniform float uStreakCap;
uniform float uPointMax;

attribute vec2 aRef;

varying float vSpeed;
varying float vDepth;
varying float vGain;
varying float vSeed;
varying float vFade;
varying float vClass;
varying float vDefocus;
varying float vLit;
varying vec3  vLitCol;
varying float vTorch;
varying float vReveal;
varying float vGlint;
varying float vPulse;
varying float vPulseS;
varying float vStretch;
varying vec2  vAxis;

const float STREAK_T = 0.018;

void main() {
  vec4 p = texture2D(uPositions, aRef);
  vec4 vd = texture2D(uVelocities, aRef);
  vec3 v = vd.xyz;
  float seed = vd.w;

  vec4 mv = modelViewMatrix * vec4(p.xyz, 1.0);
  gl_Position = projectionMatrix * mv;

  float dist = max(-mv.z, 0.001);

  float isFly  = step(0.78, seed) * (1.0 - step(0.97, seed));
  float isMote = step(0.97, seed);
  float isDust = 1.0 - isFly - isMote;
  vClass = isFly + isMote * 2.0;

  float u = fract(seed * 61.7);

  float sizeClass = isDust * (0.42 + 0.30 * u)
                  + isFly  * (1.0 + 1.4 * u * u)
                  + isMote * (4.0 + 4.0 * u);
  float cap = (isDust * 7.0 + isFly * 14.0 + isMote * 24.0) * uPixelRatio;

  vDefocus = 1.0 - smoothstep(3.0, 18.0, dist);
  float spread = 1.0 + 1.6 * vDefocus;

  float pxRaw = uSize * uPixelRatio * sizeClass * (130.0 / dist);
  float size0 = min(pxRaw, cap);
  float size1 = min(pxRaw * spread, cap * (1.0 + vDefocus));

  float dim = isDust * (0.30 + 0.48 * u * u)
            + isFly  * (0.62 + 0.50 * u)
            + isMote;

  float omega = mix(0.10, 0.20, fract(seed * 7.31)) * 6.2831853;
  float env = smoothstep(0.15, 0.75, sin(uTime * omega + seed * 40.0));
  float breathe = 1.0 + (env - 0.5) * 2.0 * (isDust * 0.12 + isFly * 0.28);

  vTorch = 0.0;
  if (uTorch > 0.001) {
    vec3 ax = uLights[5].xyz - cameraPosition;
    float al = max(length(ax), 1e-3);
    ax /= al;
    vec3 rp = p.xyz - cameraPosition;
    float depth = dot(rp, ax);
    float cone = uLights[5].w * max(depth, 0.0) / al;
    float ta = clamp(1.0 - length(rp - ax * depth) / max(cone, 1e-3), 0.0, 1.0);
    float reach = smoothstep(3.0, 9.0, depth) * (1.0 - smoothstep(al * 1.3, al * 2.4, depth));
    vTorch = uTorch * ta * ta * reach * (1.0 - isMote);
  }

  float sizePx = size1 * (1.0 + isMote * (env - 0.5) * 0.12) * (1.0 + 0.3 * vTorch);

  float px = max(sizePx, 1.5 * uPixelRatio);
  float tiny = min(1.0, (sizePx * sizePx) / (px * px));

  float grew = size1 / max(size0, 1e-3);

  float defDim = 1.0 / pow(grew, 1.2);

  vFade = 1.0 - smoothstep(uFadeStart, uFadeEnd, length(p.xyz - uCenter));

  vec2 axis = vec2(1.0, 0.0);
  float L = 0.0;
  if (uStreak > 0.001 && vFade > 0.02 && gl_Position.w > 0.05) {
    vec4 c1 = projectionMatrix * (modelViewMatrix * vec4(p.xyz - (v - uCamVel) * STREAK_T, 1.0));
    vec2 dpx = (gl_Position.xy / gl_Position.w - c1.xy / max(c1.w, 0.05)) * 0.5 * uResolution;
    float dl = length(dpx);
    L = min(dl * uStreak, min(uStreakCap * uPixelRatio, max(uPointMax - px, 0.0)));
    if (L > 0.75) {
      vec2 dir = dpx / dl;
      axis = dir * vec2(1.0, -1.0);
      gl_Position.xy -= dir * (L / uResolution) * gl_Position.w;
    } else {
      L = 0.0;
    }
  }
  gl_PointSize = px + L;
  vStretch = L / (px + L);
  vAxis = axis;
  float streakGain = pow(px / (px + 0.35 * L), 0.5);

  if (vFade <= 0.001) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);

  float lit = 0.0;
  vec3 litCol = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    float att = pow(clamp(1.0 - distance(p.xyz, uLights[i].xyz) / uLights[i].w, 0.0, 1.0), 2.0);
    lit += att;
    litCol += uLightCols[i] * att;
  }
  vLit = min(lit, 1.0) * (1.0 - isMote);
  vLitCol = litCol / max(lit, 1e-3);

  float voidGate = 0.35 + 0.65 * smoothstep(-0.3, 0.5, p.w);

  if (uReveal >= 1.0) {
    vReveal = 1.0;
    vGlint = 0.0;
  } else {
    float front = uReveal * 380.0;
    float d0 = distance(p.xyz, uRevealOrigin);
    vReveal = smoothstep(front, front - 14.0, d0) * step(0.001, uReveal);
    vGlint = exp(-abs(d0 - front) / 6.0) * 0.35 * step(0.001, uReveal);
  }

  vPulse = 0.0;
  vPulseS = 0.0;
  if (uPulseGlow > 0.001) {
    float pd = distance(p.xyz, uPulseOrigin);
    vPulse = uPulseGlow * exp(-pow((pd - uPulseRadius) / uPulseBand, 2.0));
    vPulseS = clamp((pd - uPulseRadius) / uPulseBand, -1.0, 1.0);
  }

  vGain  = dim * breathe * defDim * voidGate * tiny * streakGain * (1.0 + 0.8 * vTorch);
  vSpeed = length(v);
  vDepth = dist;
  vSeed  = seed;
}
