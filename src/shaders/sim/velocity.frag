#include ../lib/curl;

uniform float uTime;
uniform float uDt;
uniform float uCurlFreq;
uniform float uCurlAmp;
uniform float uDamping;
uniform float uMaxSpeed;
uniform float uCondense;
uniform vec3  uTravelDir;
uniform float uTravelBoost;
uniform float uBreath;
uniform vec4  uPointer;
uniform vec3  uViewDir;
uniform vec3  uPulseOrigin;
uniform float uPulseRadius;
uniform float uPulseBand;
uniform float uPulseForce;
uniform vec4  uAttract;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;

  vec4 velData = texture2D(textureVelocity, uv);
  vec3 pos = texture2D(texturePosition, uv).xyz;
  vec3 vel = velData.xyz;
  float seed = velData.w;

  float breathCurl = 1.0 + (uBreath - 0.5) * 0.2;
  float breathCond = 1.0 + (uBreath - 0.5) * 0.3;

  vec3 macro = curlNoise(pos * 0.011 + vec3(0.0, uTime * 0.012, uTime * 0.008), 0.6)
             * (uCurlAmp * 1.4 * breathCurl);

  vec3 gp = pos * 0.012 + vec3(uTime * 0.006, 0.0, uTime * 0.004);
  float n = snoise(gp);
  const float E = 0.25;
  vec3 grad = vec3(
    snoise(gp + vec3(E, 0.0, 0.0)) - n,
    snoise(gp + vec3(0.0, E, 0.0)) - n,
    snoise(gp + vec3(0.0, 0.0, E)) - n
  ) / E;
  vec3 gather = -grad * n * (uCondense * breathCond * (0.4 + 0.6 * seed));

  vec3 micro = curlNoise(pos * uCurlFreq + vec3(0.0, uTime * 0.05, uTime * 0.03), 0.35)
             * (uCurlAmp * 0.4) * (0.55 + 0.9 * seed);

  vel += (macro + gather + micro) * uDt;

  vel += uTravelDir * (uTravelBoost * uDt);

  if (uPointer.w > 0.001) {
    vec3 tp = uPointer.xyz - pos;
    float pd2 = dot(tp, tp);
    if (pd2 < 400.0) {
      float fall = exp(-pd2 / 49.0);
      vec3 away = -tp / max(sqrt(pd2), 1e-3);
      vec3 tang = cross(tp, uViewDir);
      float tl = length(tang);
      if (tl > 1e-4) tang /= tl;
      vel += (0.6 * away + 0.4 * tang) * (uPointer.w * 5.0 * fall * uDt);
    }
  }

  if (uPulseForce > 0.001) {
    vec3 rp = pos - uPulseOrigin;
    float rd = max(length(rp), 1e-3);
    float band = exp(-pow((rd - uPulseRadius) / uPulseBand, 2.0));
    vel += (rp / rd) * (uPulseForce * band * uDt);
  }

  float isFly = step(0.72, seed) * (1.0 - step(0.97, seed));
  if (uAttract.w > 0.001 && isFly > 0.5) {
    vec3 ap = uAttract.xyz - pos;
    float ad2 = dot(ap, ap);
    vel += (ap / max(sqrt(ad2), 1e-3)) * (uAttract.w * exp(-ad2 / 900.0) * uDt);
  }

  vel *= pow(uDamping, uDt * 60.0);
  float sp = length(vel);
  if (sp > uMaxSpeed) vel *= uMaxSpeed / sp;

  gl_FragColor = vec4(vel, seed);
}
