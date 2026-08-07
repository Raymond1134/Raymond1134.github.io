attribute float aFacet;

varying vec3 vWN;
varying vec3 vWP;
varying vec3 vOP;
varying float vFacet;

void main() {
  vFacet = aFacet;
  vOP = position;
  vWN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
