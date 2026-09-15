uniform float uTime;
uniform float uSway;
uniform vec4  uThread[THREADS];
uniform float uPkSpeed;
uniform float uReveal;
uniform vec3  uRevealOrigin;
uniform float uRevealFlash;

attribute vec3  aDir;
attribute float aSide;
attribute float aAlong;
attribute vec2  aEnds;
attribute float aLen;
attribute float aPhase;
attribute vec3  aCol;

varying float vDepth;
varying float vAcross;
varying float vEnd;
varying float vAdj;
varying float vPulse;
varying float vPath;
varying float vHot;
varying float vGlow;
varying vec3  vCol;

void main() {
  vec3 p = position;

  p += vec3(
    sin(uTime * 0.11 + aPhase * 31.0 + aAlong * 2.6),
    sin(uTime * 0.09 + aPhase * 47.0 + aAlong * 3.1),
    sin(uTime * 0.13 + aPhase * 59.0 + aAlong * 2.2)
  ) * (0.30 * uSway);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = max(-mv.z, 0.001);
  vec3 tv = mat3(modelViewMatrix) * aDir;
  vec2 sd = tv.xy * dist + mv.xy * tv.z;
  float sl = length(sd);
  vec2 n = sl > 1e-6 * dist ? vec2(-sd.y, sd.x) / sl : vec2(0.0, 1.0);
  float near = 1.0 - smoothstep(20.0, 180.0, dist);
  float hw = max(0.45, dist * 0.0024) * (1.0 + 1.3 * near);
  mv.xy += n * hw * aSide;
  gl_Position = projectionMatrix * mv;

  vDepth = dist;
  vAcross = aSide;

  vec4 th = uThread[int(aEnds.y + 0.5)];
  vAdj = smoothstep(0.0, 1.0, th.x);
  vPath = smoothstep(0.0, 1.0, th.y);

  float spd = uPkSpeed / max(aLen, 1.0);
  float tp = uTime + th.z;
  float ph1 = fract(tp * spd + aPhase);
  float ph2 = fract(tp * spd * 0.83 + aPhase + 0.47);
  float d1 = (aAlong - ph1) * aLen;
  float d2 = (aAlong - ph2) * aLen;
  float r1 = (1.0 - aAlong - ph1) * aLen;
  float r2 = (1.0 - aAlong - ph2) * aLen;
  float fwd = exp(-d1 * d1 * 0.012) + exp(-d2 * d2 * 0.012) * 0.8;
  float rev = exp(-r1 * r1 * 0.012) + exp(-r2 * r2 * 0.012) * 0.8;
  vPulse = mix(fwd, rev, smoothstep(0.0, 1.0, th.w))
         * mix(0.75, 1.0, vAdj) * (1.0 + 1.2 * vPath);

  float w = aAlong * aLen;
  vGlow = 1.0 + 0.28 * uSway
        * sin(w * 0.30 - uTime * 0.8 + aPhase * 6.28)
        * sin(w * 0.11 + uTime * 0.5);

  float reveal = 1.0;
  vHot = 0.0;
  if (uReveal < 1.0) {
    float front = uReveal * 380.0;
    float behind = front - distance(p, uRevealOrigin);
    reveal = smoothstep(0.0, 14.0, behind) * step(0.001, uReveal);
    float b = max(behind, 0.0);
    vHot = uRevealFlash * (exp(-b / 40.0) + 0.35 * exp(-b / 110.0)) * (1.0 - smoothstep(0.84, 1.0, uReveal));
  }

  vEnd = smoothstep(2.5, 9.0, w)
       * smoothstep(2.5, 9.0, aLen - w)
       * smoothstep(8.0, 22.0, dist)
       * min(1.0, pow(0.45 / hw, 0.6))
       * (1.0 - 0.45 * smoothstep(80.0, 280.0, dist))
       * smoothstep(0.03, 0.12, sl / dist)
       * reveal;

  vCol = aCol;
}
