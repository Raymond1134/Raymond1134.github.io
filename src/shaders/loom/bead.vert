uniform float uTime;
uniform float uPixelRatio;
uniform float uSway;
uniform vec4  uThread[THREADS];
uniform float uPkSpeed;
uniform float uReveal;
uniform vec3  uRevealOrigin;
uniform float uRevealFlash;
uniform vec4  uComet;
uniform float uCometTail;
uniform vec4  uRing;
uniform float uRingGain;
uniform vec2  uResolution;

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
varying float vPath;
varying float vHot;
varying float vTw;
varying vec3  vCol;

void main() {
  vec3 p = position;

  p += vec3(
    sin(uTime * 0.19 + aSeed * 23.0),
    sin(uTime * 0.16 + aSeed * 37.0),
    sin(uTime * 0.21 + aSeed * 51.0)
  ) * (0.45 * uSway);

  float reveal = 1.0;
  float hot = 0.0;
  if (uReveal < 1.0) {
    float front = uReveal * 380.0;
    float behind = front - distance(p, uRevealOrigin);
    reveal = smoothstep(0.0, 14.0, behind) * step(0.001, uReveal);
    float b = max(behind, 0.0);
    hot = uRevealFlash * (exp(-b / 30.0) + 0.35 * exp(-b / 100.0)) * (1.0 - smoothstep(0.84, 1.0, uReveal));
  }

  if (uComet.w > 0.001) {
    float dh = (mix(aAlong, 1.0 - aAlong, uComet.y) - uComet.z) * aLen;
    float head = exp(-dh * dh * 0.07);
    float tail = step(dh, 0.0) * exp(min(dh, 0.0) / uCometTail);
    hot += step(abs(aEnds.y - uComet.x), 0.5) * uComet.w * (3.0 * head + 1.1 * tail);
  }

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = max(-mv.z, 0.001);
  vDepth = dist;

  if (uRingGain > 0.001) {
    float rd = (distance(p, uRing.xyz) - uRing.w) / 6.0;
    float od = max(-(modelViewMatrix * vec4(uRing.xyz, 1.0)).z, 20.0);
    hot += uRingGain * 2.0 * exp(-rd * rd) * smoothstep(0.6 * od, 1.4 * od, dist);
  }

  float near = 1.0 - smoothstep(20.0, 180.0, dist);
  float vk = clamp(uResolution.y / (uPixelRatio * 760.0), 0.62, 1.0);
  float px = min(1.5 * uPixelRatio * (130.0 / dist), (4.5 + 2.5 * near) * uPixelRatio) * vk * (1.0 + 0.45 * min(hot, 3.0));
  float size = max(px, 1.5 * uPixelRatio);
  gl_PointSize = reveal > 0.0 ? size : 1.0;
  float tiny = min(1.0, (px * px) / (size * size));

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
  float fwd = exp(-d1 * d1 * 0.041) + exp(-d2 * d2 * 0.041) * 0.8;
  float rev = exp(-r1 * r1 * 0.041) + exp(-r2 * r2 * 0.041) * 0.8;
  vPulse = mix(fwd, rev, smoothstep(0.0, 1.0, th.w))
         * mix(0.75, 1.0, vAdj) * (1.0 + 1.2 * vPath);
  vHot = hot;

  vTw = 1.0 + 0.5 * uSway * sin(uTime * (1.6 + aSeed * 2.4) + aSeed * 61.8);

  vEnd = smoothstep(2.5, 9.0, aAlong * aLen)
       * smoothstep(2.5, 9.0, (1.0 - aAlong) * aLen)
       * smoothstep(8.0, 22.0, dist)
       * (1.0 - 0.45 * smoothstep(80.0, 280.0, dist))
       * tiny * reveal;

  vCol = aCol;
}
