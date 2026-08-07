#include ../lib/noise3D;

uniform float uDt;
uniform vec3  uCenter;
uniform float uBoxHalf;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;

  vec3 pos = texture2D(texturePosition, uv).xyz;
  vec3 vel = texture2D(textureVelocity, uv).xyz;

  pos += vel * uDt;

  vec3 d = pos - uCenter;
  d = mod(d + uBoxHalf, uBoxHalf * 2.0) - uBoxHalf;
  pos = uCenter + d;

  float voidN = snoise(pos * 0.006);

  gl_FragColor = vec4(pos, voidN);
}
