#include ../lib/curl;

uniform float uTime;
uniform float uDt;
uniform vec3  uHome;
uniform float uShellRadius;
uniform float uLifeScale;
uniform float uRespawn;   // 1.0 = allow respawns, 0.0 = freeze (used during veil)

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;

  vec4 posData = texture2D(texturePosition, uv);
  vec4 velData = texture2D(textureVelocity, uv);

  vec3 pos  = posData.xyz;
  float life = posData.w;

  pos += velData.xyz * uDt;

  // Continuous turnover hides the seams when the swarm relocates to a new beacon.
  float rate = (0.045 + 0.06 * hash12(uv)) * uLifeScale;
  life -= uDt * rate;

  if (life <= 0.0 && uRespawn > 0.5) {
    // Respawn on a jittered shell around the new home.
    float a = hash12(uv + uTime * 0.137) * 6.2831853;
    float z = hash12(uv.yx + uTime * 0.271) * 2.0 - 1.0;
    float r = sqrt(max(0.0, 1.0 - z * z));
    vec3 dir = vec3(cos(a) * r, z, sin(a) * r);

    float radius = uShellRadius * (0.55 + 0.85 * hash12(uv * 3.7 + uTime * 0.05));
    pos  = uHome + dir * radius;
    life = 1.0;
  }

  gl_FragColor = vec4(pos, life);
}
