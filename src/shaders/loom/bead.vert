uniform float uTime;
uniform float uPixelRatio;
uniform float uSway;
uniform float uCur;
uniform float uPkSpeed;
uniform float uReveal;
uniform vec3  uRevealOrigin;

attribute float aAlong;
attribute float aSeed;
attribute vec2  aEnds;
attribute float aLen;
attribute float aPhase;
attribute vec3  aCol;

varying float vDepth;
varying float vEnd;
varying float vAdj;
varying float vPulse;
varying float vTw;
varying vec3  vCol;

void main() {
  vec3 p = position;

  p += vec3(
    sin(uTime * 0.19 + aSeed * 23.0),
    sin(uTime * 0.16 + aSeed * 37.0),
    sin(uTime * 0.21 + aSeed * 51.0)
  ) * (0.45 * uSway);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = max(-mv.z, 0.001);
  vDepth = dist;

  float near = 1.0 - smoothstep(20.0, 180.0, dist);
  float px = min(1.5 * uPixelRatio * (130.0 / dist), (4.5 + 2.5 * near) * uPixelRatio);
  float size = max(px, 1.5 * uPixelRatio);
  gl_PointSize = size;
  float tiny = min(1.0, (px * px) / (size * size));

  vAdj = max(step(abs(aEnds.x - uCur), 0.5), step(abs(aEnds.y - uCur), 0.5));

  float spd = uPkSpeed / max(aLen, 1.0);
  float d1 = (aAlong - fract(uTime * spd + aPhase)) * aLen;
  float d2 = (aAlong - fract(uTime * spd * 0.83 + aPhase + 0.47)) * aLen;
  vPulse = (exp(-d1 * d1 * 0.041) + exp(-d2 * d2 * 0.041) * 0.8)
         * mix(0.75, 1.0, vAdj);

  vTw = 1.0 + 0.5 * uSway * sin(uTime * (1.6 + aSeed * 2.4) + aSeed * 61.8);

  float reveal = 1.0;
  if (uReveal < 1.0) {
    float front = uReveal * 380.0;
    reveal = smoothstep(front, front - 14.0, distance(p, uRevealOrigin)) * step(0.001, uReveal);
  }

  vEnd = smoothstep(2.5, 9.0, aAlong * aLen)
       * smoothstep(2.5, 9.0, (1.0 - aAlong) * aLen)
       * smoothstep(8.0, 22.0, dist)
       * (1.0 - 0.45 * smoothstep(80.0, 280.0, dist))
       * tiny * reveal;

  vCol = aCol;
}
