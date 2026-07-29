// curl.glsl already pulls in noise3D; including both redefines snoise.
#include ../lib/curl;

uniform float uTime;
uniform float uDt;

uniform vec3  uHome;       // beacon we are orbiting (world space)
uniform vec3  uFocus;      // implosion target — the camera
uniform float uImplode;    // 0 idle .. 1 fully engulfed

uniform float uShellRadius;   // preferred distance from uHome
uniform float uShellSoftness;
uniform vec3  uNoiseOffset;   // per-beacon, so beacons don't share a pattern
uniform float uCurlFreq;
uniform float uCurlAmp;
uniform float uSwirl;
uniform float uDamping;
uniform float uMaxSpeed;

// `resolution` is #defined by GPUComputationRenderer; the texturePosition and
// textureVelocity samplers are injected automatically.

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;

  vec4 posData = texture2D(texturePosition, uv);
  vec4 velData = texture2D(textureVelocity, uv);
  vec3 pos = posData.xyz;
  vec3 vel = velData.xyz;

  float seed = velData.w;                 // per-particle constant 0..1
  float scaleJitter = 0.6 + 1.1 * seed;   // some particles ride bigger eddies

  vec3 force = vec3(0.0);
  vec3 local = pos - uHome;

  // --- 1. Ambient flow field ----------------------------------------------
  // Sampled in beacon-local space: scaleJitter multiplies the sample point, so
  // pivoting at the world origin spreads neighbouring particles apart in
  // proportion to the beacon's distance from it, past the noise's correlation
  // length. uNoiseOffset is added after the scaling for the same reason.
  // uTime arrives pre-divided by TAU, so the field churns at the same rate the
  // particles move; slowing one alone would change how much structure a
  // particle sees over its life.
  vec3 samplePoint = local * (uCurlFreq * scaleJitter)
                   + uNoiseOffset
                   + vec3(0.0, uTime * 0.05, uTime * 0.03);
  force += curlNoise(samplePoint, 0.35) * uCurlAmp;

  // --- 2. Shell spring -----------------------------------------------------
  float dist = length(local) + 1e-4;
  vec3 radial = -local / dist;
  float shellError = dist - uShellRadius;   // positive = too far out
  force += radial * shellError * uShellSoftness;

  // --- 3. Tangential swirl -------------------------------------------------
  // The axis precesses so the vortex never settles into a flat, obviously
  // procedural disc.
  vec3 axis = normalize(vec3(sin(uTime * 0.07), 1.0, cos(uTime * 0.05)));
  vec3 tangent = normalize(cross(radial, axis) + 1e-5);
  force += tangent * uSwirl * (0.5 + 0.9 * seed);

  // --- 4. Implosion onto the camera ---------------------------------------
  if (uImplode > 0.001) {
    // Must precede the implosion terms, or it scales those too.
    force *= (1.0 - 0.78 * uImplode);

    vec3 toFocus = uFocus - pos;
    float fd = length(toFocus) + 1e-4;
    vec3 fdir = toFocus / fd;

    vec3 spiral = normalize(cross(fdir, vec3(0.0, 1.0, 0.0)) + 1e-5);
    float pull = uImplode * uImplode * 240.0;

    force += fdir * pull;
    force += spiral * uImplode * 70.0 * (0.4 + seed);
  }

  vel += force * uDt;

  vel *= pow(uDamping, uDt * 60.0);   // frame-rate independent
  float sp = length(vel);
  if (sp > uMaxSpeed) vel *= uMaxSpeed / sp;

  gl_FragColor = vec4(vel, seed);
}
