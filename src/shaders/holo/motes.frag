precision highp float;

uniform vec3  uColor;
uniform vec3  uCool;
uniform float uOpacity;

varying float vGain;
varying float vCool;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c) * 4.0;
  if (r2 > 1.0) discard;

  // The (1 - r2) factor drives alpha to zero where discard cuts the sprite off.
  float a = (exp(-r2 * 3.0) + 0.3 * exp(-r2 * 1.2)) * (1.0 - r2) * 1.5;

  // Whitened centre, so each mote reads as a spark rather than a dot of paint.
  vec3 col = mix(uColor, uCool, vCool);
  col = mix(col, vec3(1.0), exp(-r2 * 6.0) * 0.5);

  gl_FragColor = vec4(col, a * vGain * uOpacity);
}
