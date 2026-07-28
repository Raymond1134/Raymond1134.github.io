// curl.glsl already pulls in noise3D — including both defines snoise twice,
// which is a GLSL redefinition error.
#include ../lib/curl;

uniform float uTime;
uniform float uDt;

uniform vec3  uHome;       // beacon we are orbiting (world space)
uniform vec3  uFocus;      // implosion target — the camera
uniform float uImplode;    // 0 idle .. 1 fully engulfed

uniform float uShellRadius;   // preferred distance from uHome
uniform float uShellSoftness;
uniform float uCurlFreq;
uniform float uCurlAmp;
uniform float uSwirl;
uniform float uDamping;
uniform float uMaxSpeed;

// `resolution` is #defined by GPUComputationRenderer.
// `texturePosition` and `textureVelocity` samplers are injected automatically.

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;

  vec4 posData = texture2D(texturePosition, uv);
  vec4 velData = texture2D(textureVelocity, uv);
  vec3 pos = posData.xyz;
  vec3 vel = velData.xyz;

  float seed = velData.w;                 // per-particle constant 0..1
  float scaleJitter = 0.6 + 1.1 * seed;   // some particles ride bigger eddies

  vec3 force = vec3(0.0);

  // --- 1. Ambient flow field: the "dance" ---------------------------------
  vec3 samplePoint = pos * (uCurlFreq * scaleJitter) + vec3(0.0, uTime * 0.05, uTime * 0.03);
  force += curlNoise(samplePoint, 0.35) * uCurlAmp;

  // --- 2. Shell spring: keeps the swarm around the beacon ------------------
  vec3 toHome = uHome - pos;
  float dist = length(toHome) + 1e-4;
  vec3 radial = toHome / dist;
  // Signed distance from the preferred shell. Positive = too far out.
  float shellError = dist - uShellRadius;
  force += radial * shellError * uShellSoftness;

  // --- 3. Tangential swirl: the spiral ------------------------------------
  // Cross the radial direction with a slowly precessing axis so the vortex
  // never settles into a flat, obviously-procedural disc.
  vec3 axis = normalize(vec3(sin(uTime * 0.07), 1.0, cos(uTime * 0.05)));
  vec3 tangent = normalize(cross(radial, axis) + 1e-5);
  force += tangent * uSwirl * (0.5 + 0.9 * seed);

  // --- 4. Implosion: everything collapses onto the camera ------------------
  if (uImplode > 0.001) {
    vec3 toFocus = uFocus - pos;
    float fd = length(toFocus) + 1e-4;
    vec3 fdir = toFocus / fd;

    // Spiral inward rather than falling straight in — much more magical.
    vec3 spiral = normalize(cross(fdir, vec3(0.0, 1.0, 0.0)) + 1e-5);
    float pull = uImplode * uImplode * 240.0;

    force += fdir * pull;
    force += spiral * uImplode * 70.0 * (0.4 + seed);
    // Suppress ambient forces so the collapse reads as deliberate.
    force *= mix(1.0, 1.9, uImplode);
  }

  vel += force * uDt;

  // Damping (frame-rate independent) + speed clamp.
  vel *= pow(uDamping, uDt * 60.0);
  float sp = length(vel);
  if (sp > uMaxSpeed) vel *= uMaxSpeed / sp;

  gl_FragColor = vec4(vel, seed);
}