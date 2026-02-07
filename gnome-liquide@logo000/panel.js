// SPDX-License-Identifier: GPL-3.0-or-later
//
// Creates a background capture widget behind the top panel and applies the
// LiquidGlassEffect shader to it.  The approach mirrors blur-my-shell's
// static-blur path:
//
//   1. Create an St.Widget sized to the full monitor
//   2. Use GNOME Shell's BackgroundManager to spawn a Meta.BackgroundActor
//      (desktop wallpaper) inside it
//   3. Clip the widget to the panel's geometry
//   4. Insert as first child of the panel's parent (behind panel content)
//   5. Apply LiquidGlassEffect — the shader refracts the wallpaper texture
//   6. Make the panel's own background transparent via CSS

import Meta from 'gi://Meta';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Background from 'resource:///org/gnome/shell/ui/background.js';

import {LiquidGlassEffect} from './effect.js';

export class PanelGlass {
    constructor(settings) {
        this._settings = settings;
        this._bgManager = null;
        this._bgGroup = null;
        this._bgWidget = null;
        this._effect = null;
        this._signalIds = [];
    }

    enable() {
        if (!this._settings.get_boolean('apply-to-panel'))
            return;

        this._setup();

        // Rebuild when monitors change (resolution, hotplug)
        this._connectSignal(Main.layoutManager, 'monitors-changed',
            () => this._rebuild());

        // Live-update shader uniforms when settings change
        this._connectSetting('ior', () => {
            this._effect.ior = this._settings.get_double('ior');
        });
        this._connectSetting('chromatic-aberration', () => {
            this._effect.ca = this._settings.get_double('chromatic-aberration');
        });
        this._connectSetting('distortion', () => {
            this._effect.dist = this._settings.get_double('distortion');
        });
        this._connectSetting('corner-radius', () => {
            this._effect.cr = this._settings.get_double('corner-radius');
        });
        this._connectSetting('fresnel', () => {
            this._effect.fres = this._settings.get_double('fresnel');
        });
        this._connectSetting('blur', () => {
            this._effect.blur = this._settings.get_double('blur');
        });
        this._connectSetting('tint-color', () => {
            this._effect.tintColor = this._settings.get_string('tint-color');
        });
        this._connectSetting('apply-to-panel', () => {
            if (this._settings.get_boolean('apply-to-panel'))
                this._setup();
            else
                this._teardown();
        });
    }

    disable() {
        this._teardown();

        // Disconnect all GSettings signals
        for (const id of this._settingSignalIds ?? [])
            this._settings.disconnect(id);
        this._settingSignalIds = [];
    }

    // ── Private ──

    _setup() {
        const panel = Main.panel;
        const panelBox = panel.get_parent();
        if (!panelBox)
            return;

        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;

        // Container group (width/height 0 — layout handled by _updateClip)
        this._bgGroup = new Meta.BackgroundGroup({
            name: 'liquid-glass-bg-group',
            width: 0,
            height: 0,
        });

        // Full-monitor widget that will hold the wallpaper actor
        // z_position: 1 prevents z-fighting (blur-my-shell pattern)
        this._bgWidget = new St.Widget({
            name: 'liquid-glass-bg-widget',
            x: 0,
            y: 0,
            width: monitor.width,
            height: monitor.height,
            z_position: 1,
        });

        // GNOME Shell's BackgroundManager creates a Meta.BackgroundActor
        // (the desktop wallpaper) as a child of our widget
        this._bgManager = new Background.BackgroundManager({
            container: this._bgWidget,
            monitorIndex: monitor.index,
            controlPosition: false,
        });

        // Create and apply the liquid glass shader effect
        this._effect = new LiquidGlassEffect({
            ior: this._settings.get_double('ior'),
            ca: this._settings.get_double('chromatic-aberration'),
            dist: this._settings.get_double('distortion'),
            cr: this._settings.get_double('corner-radius'),
            fres: this._settings.get_double('fresnel'),
            blur: this._settings.get_double('blur'),
            tint: this._parseTint(this._settings.get_string('tint-color')),
        });
        this._bgWidget.add_effect(this._effect);

        // Add widget to background group
        this._bgGroup.add_child(this._bgWidget);

        // Insert behind all panel content
        panelBox.insert_child_at_index(this._bgGroup, 0);

        // Clip to panel geometry and track size changes
        this._updateClip();
        this._connectSignal(panel, 'notify::width', () => this._updateClip());
        this._connectSignal(panel, 'notify::height', () => this._updateClip());
        this._connectSignal(panelBox, 'notify::size', () => this._updateClip());
        this._connectSignal(panelBox, 'notify::position', () => this._updateClip());

        // Make the panel's own background transparent
        panel.add_style_class_name('liquid-glass-panel');
    }

    _teardown() {
        // Disconnect actor signals
        for (const {obj, id} of this._signalIds)
            obj.disconnect(id);
        this._signalIds = [];

        // Restore panel background
        Main.panel.remove_style_class_name('liquid-glass-panel');

        // Remove background actor
        if (this._bgManager) {
            this._bgManager.destroy();
            this._bgManager = null;
        }

        // Remove from scene tree
        const panelBox = Main.panel.get_parent();
        if (this._bgGroup && panelBox) {
            panelBox.remove_child(this._bgGroup);
            this._bgGroup.destroy_all_children();
            this._bgGroup.destroy();
        }
        this._bgGroup = null;
        this._bgWidget = null;
        this._effect = null;
    }

    _rebuild() {
        this._teardown();
        if (this._settings.get_boolean('apply-to-panel'))
            this._setup();
    }

    _updateClip() {
        if (!this._bgWidget)
            return;

        const panel = Main.panel;
        const panelBox = panel.get_parent();
        if (!panelBox)
            return;

        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;

        // Guard: actors may not be allocated yet during startup.
        // NaN comparisons with 0 are false, so use > 0 (catches NaN + zero).
        const [boxW, boxH] = panelBox.get_size();
        if (!(boxW > 0) || !(boxH > 0) ||
            !(panel.width > 0) || !(panel.height > 0))
            return;

        // Panel position relative to the monitor
        const [bx, by] = panelBox.get_position();
        const parent = panelBox.get_parent();
        const [px, py] = parent ? parent.get_position() : [0, 0];

        const clipX = bx + px - monitor.x + (boxW - panel.width) / 2;
        const clipY = by + py - monitor.y + (boxH - panel.height) / 2;
        const wx = (boxW - panel.width) / 2 - clipX;
        const wy = (boxH - panel.height) / 2 - clipY;

        // Guard: NaN can occur when actors aren't fully positioned yet
        if (!isFinite(clipX) || !isFinite(clipY) ||
            !isFinite(wx) || !isFinite(wy))
            return;

        this._bgWidget.set_clip(clipX, clipY, panel.width, panel.height);
        this._bgWidget.x = wx;
        this._bgWidget.y = 0.5 + wy;  // sub-pixel alignment (blur-my-shell pattern)
    }

    _parseTint(hex) {
        hex = hex.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16) / 255;
        const g = parseInt(hex.substring(2, 4), 16) / 255;
        const b = parseInt(hex.substring(4, 6), 16) / 255;
        const a = hex.length >= 8 ? parseInt(hex.substring(6, 8), 16) / 255 : 1.0;
        return [r, g, b, a];
    }

    // ── Signal helpers ──

    _connectSignal(obj, signal, callback) {
        const id = obj.connect(signal, callback);
        this._signalIds.push({obj, id});
    }

    _connectSetting(key, callback) {
        if (!this._settingSignalIds)
            this._settingSignalIds = [];
        const id = this._settings.connect(`changed::${key}`, callback);
        this._settingSignalIds.push(id);
    }
}
