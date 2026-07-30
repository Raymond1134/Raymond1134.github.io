uniform float uDt;
uniform vec3  uCenter;     // the viewer; the field wraps around this
uniform float uBoxHalf;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;

  vec3 pos = texture2D(texturePosition, uv).xyz;
  vec3 vel = texture2D(textureVelocity, uv).xyz;

  pos += vel * uDt;

  // Toroidal wrap around the viewer
  vec3 d = pos - uCenter;
  d = mod(d + uBoxHalf, uBoxHalf * 2.0) - uBoxHalf;
  pos = uCenter + d;

  gl_FragColor = vec4(pos, 1.0);
}
