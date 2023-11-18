import { Setting } from "obsidian";
import { SettingsTab } from "../SettingsTab";

export default (tab: SettingsTab, containerEl: HTMLElement) => {
    containerEl.createEl('h3', { text: 'V lang Settings' });
    new Setting(containerEl)
        .setName('V lang path')
        .setDesc('The path to your V lang installation.')
        .addText(text => text
            .setValue(tab.plugin.settings.vlangPath)
            .onChange(async (value) => {
                const sanitized = tab.sanitizePath(value);
                tab.plugin.settings.vlangPath = sanitized;
                console.log('V lang path set to: ' + sanitized);
                await tab.plugin.saveSettings();
            }));
    new Setting(containerEl)
        .setName('V lang arguments')
        .addText(text => text
            .setValue(tab.plugin.settings.vlangArgs)
            .onChange(async (value) => {
                tab.plugin.settings.vlangArgs = value;
                console.log('V lang args set to: ' + value);
                await tab.plugin.saveSettings();
            }));
    tab.makeInjectSetting(containerEl, "v");
}