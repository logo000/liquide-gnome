// SPDX-License-Identifier: GPL-3.0-or-later
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class GnomeLiquidePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'Liquid Glass',
            icon_name: 'preferences-desktop-appearance-symbolic',
        });
        window.add(page);

        // ── General ──
        const generalGroup = new Adw.PreferencesGroup({
            title: 'General',
        });
        page.add(generalGroup);

        const enableRow = new Adw.SwitchRow({
            title: 'Apply to Panel',
            subtitle: 'Enable the liquid glass effect on the top panel',
        });
        generalGroup.add(enableRow);
        settings.bind('apply-to-panel', enableRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);

        // ── Refraction ──
        const refractionGroup = new Adw.PreferencesGroup({
            title: 'Refraction',
            description: 'Controls for the glass dome lensing',
        });
        page.add(refractionGroup);

        this._addSpinRow(refractionGroup, settings, {
            key: 'ior',
            title: 'Index of Refraction',
            subtitle: '1.0 = no refraction, 2.0 = heavy',
            min: 1.0, max: 2.0, step: 0.01, digits: 2,
        });

        this._addSpinRow(refractionGroup, settings, {
            key: 'distortion',
            title: 'Distortion Scale',
            subtitle: 'Overall displacement magnitude',
            min: 0.0, max: 3.0, step: 0.05, digits: 2,
        });

        this._addSpinRow(refractionGroup, settings, {
            key: 'chromatic-aberration',
            title: 'Chromatic Aberration',
            subtitle: 'Color fringing at edges (0 = off, saves GPU)',
            min: 0.0, max: 0.05, step: 0.001, digits: 3,
        });

        // ── Appearance ──
        const appearanceGroup = new Adw.PreferencesGroup({
            title: 'Appearance',
            description: 'Visual tuning for the glass surface',
        });
        page.add(appearanceGroup);

        this._addSpinRow(appearanceGroup, settings, {
            key: 'corner-radius',
            title: 'Corner Radius',
            subtitle: 'Rounded corners of the glass shape (px)',
            min: 0.0, max: 100.0, step: 1.0, digits: 0,
        });

        this._addSpinRow(appearanceGroup, settings, {
            key: 'fresnel',
            title: 'Fresnel Edge Glow',
            subtitle: 'Bright rim from Fresnel reflection',
            min: 0.0, max: 1.0, step: 0.01, digits: 2,
        });

        this._addSpinRow(appearanceGroup, settings, {
            key: 'blur',
            title: 'Background Blur',
            subtitle: 'Blur radius (0 = sharp, higher = more GPU load)',
            min: 0.0, max: 10.0, step: 0.5, digits: 1,
        });

        // ── Tint (color picker) ──
        const tintGroup = new Adw.PreferencesGroup({
            title: 'Tint',
        });
        page.add(tintGroup);

        const colorRow = new Adw.ActionRow({
            title: 'Glass Tint Color',
            subtitle: 'Color and opacity of the glass overlay',
        });
        const colorDialog = new Gtk.ColorDialog({
            with_alpha: true,
        });
        const colorButton = new Gtk.ColorDialogButton({
            dialog: colorDialog,
            valign: Gtk.Align.CENTER,
        });

        // Load initial color from settings
        const initRgba = this._hexToRgba(settings.get_string('tint-color'));
        colorButton.set_rgba(initRgba);

        // Save on change
        colorButton.connect('notify::rgba', () => {
            const c = colorButton.get_rgba();
            const hex = this._rgbaToHex(c);
            settings.set_string('tint-color', hex);
        });

        colorRow.add_suffix(colorButton);
        colorRow.set_activatable_widget(colorButton);
        tintGroup.add(colorRow);

        // ── Reset ──
        const resetGroup = new Adw.PreferencesGroup();
        page.add(resetGroup);

        const resetRow = new Adw.ActionRow({
            title: 'Reset All to Defaults',
            subtitle: 'Restore factory settings for all parameters',
        });
        const resetButton = new Gtk.Button({
            label: 'Reset',
            valign: Gtk.Align.CENTER,
            css_classes: ['destructive-action'],
        });
        resetButton.connect('clicked', () => {
            for (const key of [
                'ior', 'chromatic-aberration', 'distortion',
                'corner-radius', 'fresnel', 'blur',
                'tint-color', 'apply-to-panel',
            ]) {
                settings.reset(key);
            }
            // Update color button to match reset value
            colorButton.set_rgba(
                this._hexToRgba(settings.get_string('tint-color'))
            );
        });
        resetRow.add_suffix(resetButton);
        resetGroup.add(resetRow);
    }

    _addSpinRow(group, settings, {key, title, subtitle, min, max, step, digits}) {
        const adjustment = new Gtk.Adjustment({
            lower: min,
            upper: max,
            step_increment: step,
            page_increment: step * 10,
            value: settings.get_double(key),
        });

        const row = new Adw.SpinRow({
            title,
            subtitle,
            adjustment,
            digits,
        });

        settings.bind(key, adjustment, 'value',
            Gio.SettingsBindFlags.DEFAULT);

        group.add(row);
    }

    _hexToRgba(hex) {
        hex = hex.replace('#', '');
        const rgba = new Gdk.RGBA();
        rgba.red = parseInt(hex.substring(0, 2), 16) / 255;
        rgba.green = parseInt(hex.substring(2, 4), 16) / 255;
        rgba.blue = parseInt(hex.substring(4, 6), 16) / 255;
        rgba.alpha = hex.length >= 8
            ? parseInt(hex.substring(6, 8), 16) / 255
            : 1.0;
        return rgba;
    }

    _rgbaToHex(c) {
        const r = Math.round(c.red * 255).toString(16).padStart(2, '0');
        const g = Math.round(c.green * 255).toString(16).padStart(2, '0');
        const b = Math.round(c.blue * 255).toString(16).padStart(2, '0');
        const a = Math.round(c.alpha * 255).toString(16).padStart(2, '0');
        return `#${r}${g}${b}${a}`;
    }
}
