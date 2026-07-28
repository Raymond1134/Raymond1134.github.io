uniform sampler2D uPositions;
uniform sampler2D uVelocities;
uniform float uSize;
uniform float uPixelRatio;
uniform float uImplode;

attribute vec2 aRef;   // which texel this vertex reads

varying float vSpeed;
varying float vLife;
varying float vDepth;

void main() {
  vec4 p = texture2D(uPositions, aRef);
  vec3 v = texture2D(uVelocities, aRef).xyz;

  vec4 mv = modelViewMatrix * vec4(p.xyz, 1.0);
  gl_Position = projectionMatrix * mv;

  float dist = max(-mv.z, 0.001);
  // Perspective size attenuation. The 900.0 is a taste constant; tune in Leva.
  gl_PointSize = uSize * uPixelRatio * (900.0 / dist);
  // During the engulf, particles are right on the lens — cap the size or a
  // handful of sprites will cover the whole screen and look like a bug.
  gl_PointSize = min(gl_PointSize, 64.0 * uPixelRatio * (1.0 + uImplode * 1.5));

  vSpeed = length(v);
  vLife  = p.w;
  vDepth = dist;
}