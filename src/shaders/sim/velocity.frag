// curl.glsl already pulls in noise3D; including both redefines snoise.
#include ../lib/curl;

uniform float uTime;
uniform float uDt;
uniform float uCurlFreq;
uniform float uCurlAmp;
uniform float uDamping;
uniform float uMaxSpeed;

// `resolution` is #defined by GPUComputationRenderer; the texturePosition and
// textureVelocity samplers are injected automatically.

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;

  vec4 velData = texture2D(textureVelocity, uv);
  vec3 pos = texture2D(texturePosition, uv).xyz;
  vec3 vel = velData.xyz;
  float seed = velData.w;

  vel += force * uDt;

  vel *= pow(uDamping, uDt * 60.0);   // frame-rate independent
  float sp = length(vel);
  if (sp > uMaxSpeed) vel *= uMaxSpeed / sp;

  gl_FragColor = vec4(vel, seed);
}
