// SPDX-License-Identifier: GPL-3.0-or-later
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {PanelGlass} from './panel.js';

export default class GnomeLiquideExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._panelGlass = new PanelGlass(this._settings);
        this._panelGlass.enable();
    }

    disable() {
        this._panelGlass?.disable();
        this._panelGlass = null;
        this._settings = null;
    }
}
