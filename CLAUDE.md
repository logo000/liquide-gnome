# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

WebGL2 refraction playground simulating Apple's Liquid Glass effect, targeting eventual GNOME desktop integration. Single-file, zero dependencies.

## File

- `refraction-playground.html` — the entire project. Open directly in a browser or via local HTTP server.

## Testing

No build step. To verify:
```bash
python3 -m http.server 8765
# then open http://localhost:8765/refraction-playground.html
```
Check browser console for WebGL shader compilation errors.

## Architecture

Everything is in one HTML file, structured as:

1. **CSS** — Dark floating control panel, fullscreen canvas, GNOME-aesthetic styling
2. **GLSL vertex shader** (`VERT`) — Fullscreen quad, passes UV coordinates
3. **GLSL fragment shader** (`FRAG`) — All optical effects: refraction, blur, fresnel, specular, tint
4. **JavaScript** — Canvas2D background rendering, WebGL setup, interaction, controls, animation loop

### Rendering Pipeline

- **Background**: Canvas2D renders a GNOME desktop scene (windows, headerbars, terminal) on an offscreen canvas, uploaded as a WebGL texture each frame
- **Refraction pass**: WebGL2 fullscreen quad shader samples the background texture with optical distortion

### Liquid Glass Dome Model (critical to understand)

The glass surface is a **convex dome** using Apple's squircle profile. The normal at each pixel determines refraction:

- **Height parametrization**: `t = (1 - (x/w)²) · (1 - (y/h)²)` — analytically smooth product of per-axis parabolas, no SDF medial-axis ridges
- **Squircle curve**: `height(t) = (1 - (1-t)⁴)^0.25` — flat center, steep edges
- **Normal**: derived from the analytical gradient of the height function (NOT from the SDF gradient — SDF gradient creates pyramid artifacts)
- **Refraction**: `refract()` with outward-tilting dome normal bends rays **inward** → background content compresses toward center (Apple's "lensing")
- For extreme aspect ratios (GNOME headerbars: 800×46px), the dome naturally becomes a cylindrical lens

### Key Shader Uniforms

`u_ior` (Snell's law), `u_ca` (chromatic aberration), `u_dist` (displacement scale), `u_cr` (corner radius), `u_fres` (fresnel edge glow), `u_tint` (glass color), `u_blur` (background blur), `u_wave` (animated wave perturbation for Liquid preset)

### Interaction

- Pointer drag moves the glass panel
- Corner drag resizes (16px hit zone)
- Scroll wheel over panel adjusts corner radius
- All sliders live-update shader uniforms

## Phase 2 (future): GNOME Port

Two options after playground tuning:
- **Mutter ClutterOffscreenEffect** (recommended) — GLSL directly portable from the playground shader
- **GTK4 GskGLShader** — widget-level only, can't sample behind other windows
