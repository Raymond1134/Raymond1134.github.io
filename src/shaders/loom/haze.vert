uniform float uTime;
uniform float uSway;
uniform float uCur;
uniform float uPkSpeed;
uniform float uReveal;
uniform vec3  uRevealOrigin;

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
  vec2 n = normalize(vec2(-tv.y, tv.x) + vec2(1e-5, 0.0));
  float hw = max(0.45, dist * 0.0024);
  mv.xy += n * hw * aSide;
  gl_Position = projectionMatrix * mv;

  vDepth = dist;
  vAcross = aSide;

  vAdj = max(step(abs(aEnds.x - uCur), 0.5), step(abs(aEnds.y - uCur), 0.5));

  float spd = uPkSpeed / max(aLen, 1.0);
  float d1 = (aAlong - fract(uTime * spd + aPhase)) * aLen;
  float d2 = (aAlong - fract(uTime * spd * 0.83 + aPhase + 0.47)) * aLen;
  vPulse = (exp(-d1 * d1 * 0.012) + exp(-d2 * d2 * 0.012) * 0.8)
         * mix(0.75, 1.0, vAdj);

  float w = aAlong * aLen;
  vGlow = 1.0 + 0.28 * uSway
        * sin(w * 0.30 - uTime * 0.8 + aPhase * 6.28)
        * sin(w * 0.11 + uTime * 0.5);

  float reveal = 1.0;
  if (uReveal < 1.0) {
    float front = uReveal * 380.0;
    reveal = smoothstep(front, front - 14.0, distance(p, uRevealOrigin)) * step(0.001, uReveal);
  }

  vEnd = smoothstep(2.5, 9.0, w)
       * smoothstep(2.5, 9.0, aLen - w)
       * smoothstep(8.0, 22.0, dist)
       * min(1.0, 0.45 / hw)
       * reveal;

  vCol = aCol;
}
