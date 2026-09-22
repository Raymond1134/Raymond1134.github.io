#include ../lib/noise3D;

uniform float uDt;
uniform vec3  uCenter;
uniform float uBoxHalf;
uniform float uVoidTick;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;

  vec4 prev = texture2D(texturePosition, uv);
  vec3 pos = prev.xyz;
  vec3 vel = texture2D(textureVelocity, uv).xyz;

  pos += vel * uDt;

  vec3 d = pos - uCenter;
  d = mod(d + uBoxHalf, uBoxHalf * 2.0) - uBoxHalf;
  pos = uCenter + d;

  float voidN = prev.w;
  if (uVoidTick > 0.5) voidN = snoise(pos * 0.006);

  gl_FragColor = vec4(pos, voidN);
}
