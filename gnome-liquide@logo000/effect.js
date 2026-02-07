// SPDX-License-Identifier: GPL-3.0-or-later
//
// Clutter.ShaderEffect subclass for the Liquid Glass refraction effect.
// Uses set_shader_source() pattern (same approach as blur-my-shell) to avoid
// Clutter.ShaderType enum accessibility issues in GNOME 48.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

import {FRAGMENT_SHADER, TEST_SHADER} from './shader.js';

// Set to true to use a minimal red-tint shader for pipeline debugging
const USE_TEST_SHADER = false;

/**
 * Parse a hex color string (#RRGGBBAA or #RRGGBB) to [r, g, b, a] in 0-1.
 */
function parseColor(hex) {
    hex = hex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    const a = hex.length >= 8 ? parseInt(hex.substring(6, 8), 16) / 255 : 1.0;
    return [r, g, b, a];
}

export const LiquidGlassEffect = GObject.registerClass({
    GTypeName: 'LiquidGlassEffect',
}, class LiquidGlassEffect extends Clutter.ShaderEffect {

    _init(params = {}) {
        // Don't pass shader_type — default is FRAGMENT_SHADER
        super._init();

        // Set shader source (blur-my-shell pattern)
        this.set_shader_source(USE_TEST_SHADER ? TEST_SHADER : FRAGMENT_SHADER);

        // Uniform values
        this._ior = params.ior ?? 1.45;
        this._ca = params.ca ?? 0.008;
        this._dist = params.dist ?? 0.8;
        this._cr = params.cr ?? 12.0;
        this._fres = params.fres ?? 0.25;
        this._blur = params.blur ?? 2.0;
        this._tint = params.tint ?? [1.0, 1.0, 1.0, 0.8];

        // Dirty tracking: skip set_uniform_value when nothing changed
        this._dirty = true;      // all uniforms need initial upload
        this._lastW = -1;
        this._lastH = -1;
    }

    vfunc_paint_target(node, paintContext) {
        const actor = this.get_actor();
        if (!actor)
            return;

        const w = actor.get_width();
        const h = actor.get_height();

        // Skip rendering when actor has no size (startup race)
        if (w <= 0 || h <= 0)
            return;

        // Only update size uniforms when actor dimensions change
        if (w !== this._lastW || h !== this._lastH) {
            // Subtract epsilon to ensure GJS passes as float, not int
            // (blur-my-shell pattern: parseFloat(value - 1e-6))
            this.set_uniform_value('width', parseFloat(w - 1e-6));
            this.set_uniform_value('height', parseFloat(h - 1e-6));
            this._lastW = w;
            this._lastH = h;
        }

        // Only push shader-parameter uniforms when a setting changed
        if (this._dirty) {
            this.set_uniform_value('u_ior', parseFloat(this._ior - 1e-6));
            this.set_uniform_value('u_ca', parseFloat(this._ca - 1e-6));
            this.set_uniform_value('u_dist', parseFloat(this._dist - 1e-6));
            this.set_uniform_value('u_cr', parseFloat(this._cr - 1e-6));
            this.set_uniform_value('u_fres', parseFloat(this._fres - 1e-6));
            this.set_uniform_value('u_blur', parseFloat(this._blur - 1e-6));
            this.set_uniform_value('u_tint_r', parseFloat(this._tint[0] - 1e-6));
            this.set_uniform_value('u_tint_g', parseFloat(this._tint[1] - 1e-6));
            this.set_uniform_value('u_tint_b', parseFloat(this._tint[2] - 1e-6));
            this.set_uniform_value('u_tint_a', parseFloat(this._tint[3] - 1e-6));
            this._dirty = false;
        }

        super.vfunc_paint_target(node, paintContext);
    }

    // Property setters — mark dirty + trigger repaint

    set ior(v) {
        if (v === this._ior) return;
        this._ior = v;
        this._dirty = true;
        this.queue_repaint();
    }

    set ca(v) {
        if (v === this._ca) return;
        this._ca = v;
        this._dirty = true;
        this.queue_repaint();
    }

    set dist(v) {
        if (v === this._dist) return;
        this._dist = v;
        this._dirty = true;
        this.queue_repaint();
    }

    set cr(v) {
        if (v === this._cr) return;
        this._cr = v;
        this._dirty = true;
        this.queue_repaint();
    }

    set fres(v) {
        if (v === this._fres) return;
        this._fres = v;
        this._dirty = true;
        this.queue_repaint();
    }

    set blur(v) {
        if (v === this._blur) return;
        this._blur = v;
        this._dirty = true;
        this.queue_repaint();
    }

    set tintColor(hex) {
        this._tint = parseColor(hex);
        this._dirty = true;
        this.queue_repaint();
    }
});
