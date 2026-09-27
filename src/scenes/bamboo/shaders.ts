// GLSL shared by the grove's materials: the wind that bends every culm (and
// carries its leaves with it), and the shining stalk's rainbow, so that the
// light it throws on its neighbours matches its own bands.

/** Horizontal offset (in units of culm height) at height fraction t of a culm rooted at xz. */
export const swayGlsl = /* glsl */ `
float gustAt(vec2 xz) {
  vec2 wd = normalize(uWind.xz);
  // gust fronts roll through the grove along the wind
  float g = dot(xz, wd) * 0.05 - uTime * 0.42;
  return smoothstep(0.35, 1.0, sin(g) * 0.5 + 0.5) + 0.25 * smoothstep(0.6, 1.0, sin(g * 2.3 + 1.7) * 0.5 + 0.5);
}
vec2 culmSway(vec2 xz, float t, float seed) {
  vec2 wd = normalize(uWind.xz);
  float gust = gustAt(xz);
  float ph = seed * 6.2832;
  float s = sin(uTime * (0.55 + seed * 0.3) + ph) * 0.7 + sin(uTime * 1.7 + ph * 3.0) * 0.2;
  float amp = (0.006 + 0.018 * gust) * t * t;
  return wd * (s * 0.55 + gust * 0.9) * amp + vec2(-wd.y, wd.x) * s * 0.35 * amp;
}`;

/**
 * The shining stalk's colour at height y above its base: each internode is one
 * LED segment, the hues climb the stalk slowly (a gaming pole, but bamboo).
 */
export const stalkHueGlsl = /* glsl */ `
const float STALK_SP = 0.36;
float stalkHue(float y) {
  float seg = floor(y / STALK_SP);
  return fract(seg * 0.045 - uTime * 0.085);
}
float stalkHueSmooth(float y) {
  return fract(y / STALK_SP * 0.045 - uTime * 0.085);
}`;
