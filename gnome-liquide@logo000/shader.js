// SPDX-License-Identifier: GPL-3.0-or-later
// Cogl GLSL fragment shader for Liquid Glass refraction effect.
// Ported from the WebGL2 playground, optimized for real-time panel compositing.
//
// Performance optimizations vs. playground version:
//   - Blur: 12 samples (down from 22); single-pass when CA is off (12 vs 66)
//   - pow() replaced with sqrt chains (2 sqrts vs exp+log)
//   - Fresnel pow(x,3) replaced with x*x*x
//   - Specular pow(x,80) replaced with 6 multiplies (repeated squaring)
//   - Light vectors precomputed as constants (no per-fragment normalize)
//   - Inverse resolution precomputed once
//   - CA refract() calls skipped entirely when u_ca ~ 0

export const FRAGMENT_SHADER = `
uniform sampler2D tex;
uniform float width;
uniform float height;
uniform float u_ior;
uniform float u_ca;
uniform float u_dist;
uniform float u_cr;
uniform float u_fres;
uniform float u_tint_r;
uniform float u_tint_g;
uniform float u_tint_b;
uniform float u_tint_a;
uniform float u_blur;

// Precomputed: normalize(vec3(-0.4, 0.6, 1.0))
// NOTE: const vec3 is unsupported in Cogl GLSL ~1.10; use #define instead
#define LIGHT_DIR vec3(-0.32444, 0.48666, 0.81110)
// Precomputed: normalize(LIGHT_DIR + vec3(0, 0, 1))
#define HALF_VEC  vec3(-0.17045, 0.25568, 0.95156)

float sdf(vec2 p, vec2 h, float r) {
  r = min(r, min(h.x, h.y));
  vec2 d = abs(p) - h + r;
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - r;
}

// Golden-angle spiral blur, 12 taps.  invRes = 1.0 / resolution.
vec3 tap(vec2 uv, vec2 invRes, float blur) {
  uv = clamp(uv, invRes, 1.0 - invRes);
  if (blur < 0.5) return texture2D(tex, uv).rgb;
  vec3 s = vec3(0.0);
  const int N = 12;
  const float INV_N = 1.0 / 12.0;
  const float GA = 2.39996323;
  for (int i = 0; i < N; i++) {
    float fi = float(i);
    float r = sqrt((fi + 0.5) * INV_N) * blur;
    float a = fi * GA;
    s += texture2D(tex, clamp(uv + vec2(cos(a), sin(a)) * r * invRes,
                               invRes, 1.0 - invRes)).rgb;
  }
  return s * INV_N;
}

void main() {
  vec2 res    = vec2(width, height);
  vec2 invRes = 1.0 / res;
  vec2 v_uv   = cogl_tex_coord_in[0].xy;

  // Pixel coords centred on widget (which IS the lens)
  vec2 p  = v_uv * res - res * 0.5;
  vec2 hs = res * 0.5;
  float cr = min(u_cr, min(hs.x, hs.y));

  float d    = sdf(p, hs, cr);
  float edge = 1.0 - smoothstep(-1.5, 0.5, d);

  // ---- CONVEX DOME (analytically smooth, no SDF ridges) ----
  vec2 invHs2 = 4.0 * invRes * invRes;  // = 1/(hs^2) since hs = res/2

  vec2 q  = min(abs(p) / hs, vec2(1.0));
  float ax = max(1.0 - q.x * q.x, 0.0);
  float ay = max(1.0 - q.y * q.y, 0.0);
  float t  = ax * ay;

  float om  = 1.0 - t;
  float om2 = om * om;
  float om4 = om2 * om2;
  float base = max(1.0 - om4, 1e-6);

  // h(t) = base^0.25 = sqrt(sqrt(base))   [2 sqrts, no pow]
  float sqrtBase = sqrt(base);
  float ht       = sqrt(sqrtBase);

  // h'(t) denominator = base^0.75 = sqrt(base) * base^0.25
  float hpD = max(sqrtBase * ht, 0.08);
  float hp  = om2 * om / hpD;

  // Height gradient -> dome normal
  vec2 hGrad = hp * vec2(-2.0 * p.x * invHs2.x * ay,
                         -2.0 * p.y * invHs2.y * ax);

  vec3 N = normalize(vec3(-hGrad * 50.0, 1.0));

  // ---- SNELL'S LAW REFRACTION ----
  vec3 I = vec3(0.0, 0.0, -1.0);
  vec2 scaleInv = length(res) * 0.1 * u_dist * invRes;

  vec3 rG = refract(I, N, 1.0 / u_ior);
  if (dot(rG, rG) < 0.001) rG = I;
  vec2 uvG = v_uv + rG.xy * scaleInv;

  // Sample background -- skip extra refract() calls when CA is off
  vec3 col;
  if (u_ca > 0.001) {
    vec3 rR = refract(I, N, 1.0 / (u_ior + u_ca * 12.0));
    vec3 rB = refract(I, N, 1.0 / max(u_ior - u_ca * 12.0, 1.001));
    if (dot(rR, rR) < 0.001) rR = rG;
    if (dot(rB, rB) < 0.001) rB = rG;
    col = vec3(
      tap(v_uv + rR.xy * scaleInv, invRes, u_blur).r,
      tap(uvG,                      invRes, u_blur).g,
      tap(v_uv + rB.xy * scaleInv, invRes, u_blur).b
    );
  } else {
    col = tap(uvG, invRes, u_blur);
  }

  // ---- FRESNEL  (x^3 via 2 multiplies, no pow) ----
  float nz    = max(N.z, 0.0);
  float fBase = 1.0 - nz;
  float fres  = fBase * fBase * fBase * u_fres;
  col += fres * vec3(0.85, 0.9, 1.0);

  // ---- SPECULAR  (x^80 via 6 multiplies, no pow) ----
  float sb  = max(dot(N, HALF_VEC), 0.0);
  float s2  = sb  * sb;
  float s4  = s2  * s2;
  float s8  = s4  * s4;
  float s16 = s8  * s8;
  float s32 = s16 * s16;
  float s64 = s32 * s32;
  float spec = s64 * s16 * 0.45;
  col += spec * vec3(1.0, 0.98, 0.95);

  // ---- TINT + edge brightness ----
  col = mix(col, col * vec3(u_tint_r, u_tint_g, u_tint_b), u_tint_a);
  col += (1.0 - ht) * 0.012;

  // ---- COMPOSITE with untouched background at rounded-rect edge ----
  vec3 bg = texture2D(tex, v_uv).rgb;
  cogl_color_out = vec4(mix(bg, col, edge), 1.0);
}
`;

// Minimal test shader: tints wallpaper red to verify pipeline works.
// If this shader produces visible output but FRAGMENT_SHADER does not,
// the bug is in the main shader (e.g. unsupported GLSL features).
export const TEST_SHADER = `
uniform sampler2D tex;
void main() {
  vec4 c = texture2D(tex, cogl_tex_coord_in[0].xy);
  cogl_color_out = vec4(c.r * 1.5, c.g * 0.3, c.b * 0.3, 1.0);
}
`;
