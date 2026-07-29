precision highp float;

uniform vec3  uColorCool;
uniform float uIntensity;

varying float vGain;
varying float vTrail;
varying vec3  vColor;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c) * 4.0;
  if (r2 > 1.0) discard;

  // The (1 - r2) factor drives alpha to zero where discard cuts the sprite off;
  // without it every mote carries a faint hard rim.
  float a = (exp(-r2 * 3.2) + exp(-r2 * 1.1) * 0.35) * (1.0 - r2);

  // Partial shift only: taking every wisp the whole way to one cool stop would
  // converge their tails and cost each its colour identity.
  vec3 col = mix(vColor, uColorCool, vTrail * 0.4);

  gl_FragColor = vec4(col, a * vGain * uIntensity * (1.0 - vTrail * 0.72));
}
