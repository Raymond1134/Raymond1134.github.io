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

  // Sampled from WORLD position at a fixed frequency, so the field belongs to
  // the universe rather than the viewer. Per-particle variety is amplitude
  // only — scaling the sample point instead would drag neighbours onto
  // unrelated parts of the noise and the medium stops reading as continuous.
  vec3 samplePoint = pos * uCurlFreq + vec3(0.0, uTime * 0.05, uTime * 0.03);
  vec3 force = curlNoise(samplePoint, 0.35) * uCurlAmp * (0.55 + 0.9 * seed);

  vel += force * uDt;

  vel *= pow(uDamping, uDt * 60.0);   // frame-rate independent
  float sp = length(vel);
  if (sp > uMaxSpeed) vel *= uMaxSpeed / sp;

  gl_FragColor = vec4(vel, seed);
}
