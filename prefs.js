import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import Adw from 'gi://Adw';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// ============================================================================
// DEFAULT PROVIDER DATA WITH PRICING
// ============================================================================

const DEFAULT_PROVIDERS = [
    {
        id: 'openai',
        name: 'OpenAI',
        apiKey: '',
        baseUrl: 'https://api.openai.com/v1',
        region: null,
        proxyEnabled: false,
        proxyUrl: '',
        models: [
            {
                id: 'whisper-1',
                name: 'Whisper-1',
                description: 'Open source ASR model trained on 680,000 hours of multilingual data. Excellent for general transcription with support for 99 languages.',
                releaseDate: '2022-09',
                price: 0.36,
                currency: 'USD',
                priceUnit: 'hour',
                supportsBatch: true,
                supportsRealtime: false,
                languages: ['auto', 'en', 'zh', 'es', 'fr', 'de', 'it', 'ja', 'ko', 'pt', 'ru']
            },
            {
                id: 'gpt-4o-transcribe',
                name: 'GPT-4o Transcribe',
                description: 'Next-gen speech-to-text with improved word error rate. Uses GPT-4o architecture for better language understanding and noise handling.',
                releaseDate: '2025-03',
                price: 0.36,
                currency: 'USD',
                priceUnit: 'hour',
                supportsBatch: true,
                supportsRealtime: false,
                languages: ['auto', 'en', 'zh', 'es', 'fr', 'de', 'it', 'ja', 'ko', 'pt', 'ru']
            },
            {
                id: 'gpt-4o-mini-transcribe',
                name: 'GPT-4o Mini Transcribe',
                description: 'Cost-efficient version of GPT-4o Transcribe with 50% lower price. Great for high-volume transcription with good accuracy.',
                releaseDate: '2025-03',
                price: 0.18,
                currency: 'USD',
                priceUnit: 'hour',
                supportsBatch: true,
                supportsRealtime: false,
                languages: ['auto', 'en', 'zh', 'es', 'fr', 'de', 'it', 'ja', 'ko', 'pt', 'ru']
            }
        ]
    },
    {
        id: 'alibaba',
        name: 'Alibaba Cloud',
        apiKey: '',
        baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
        region: 'beijing',
        proxyEnabled: false,
        proxyUrl: '',
        models: [
            {
                id: 'qwen3-asr-flash',
                name: 'Qwen3-ASR-Flash (Batch)',
                description: 'Alibaba\'s latest ASR model with lower WER than GPT-4o-transcribe. Optimized for Chinese with support for Cantonese and Sichuan dialects.',
                releaseDate: '2025-09',
                price: 0.8,
                currency: 'CNY',
                priceUnit: 'hour',
                supportsBatch: true,
                supportsRealtime: false,
                languages: ['auto', 'zh', 'en', 'yue', 'sichuan']
            },
            {
                id: 'qwen3-asr-flash-realtime',
                name: 'Qwen3-ASR-Flash-Realtime',
                description: 'Real-time streaming version of Qwen3-ASR with WebSocket support. Low latency with excellent Chinese/English bilingual recognition.',
                releaseDate: '2025-09',
                price: 1.5,
                currency: 'CNY',
                priceUnit: 'hour',
                supportsBatch: false,
                supportsRealtime: true,
                languages: ['auto', 'zh', 'en', 'yue', 'sichuan']
            },
            {
                id: 'qwen3-asr-flash-realtime-2025-10-27',
                name: 'Qwen3-ASR-Flash-Realtime (Snapshot)',
                description: 'Stable snapshot version of Qwen3-ASR-Realtime from Oct 2025. Use this for production stability.',
                releaseDate: '2025-10',
                price: 1.5,
                currency: 'CNY',
                priceUnit: 'hour',
                supportsBatch: false,
                supportsRealtime: true,
                languages: ['auto', 'zh', 'en', 'yue', 'sichuan']
            },
            {
                id: 'qwen3-asr-flash-filetrans',
                name: 'Qwen3-ASR-Flash-FileTrans',
                description: 'File transcription variant of Qwen3-ASR-Flash. Optimized for long audio files with improved punctuation and speaker diarization.',
                releaseDate: '2025-09',
                price: 0.8,
                currency: 'CNY',
                priceUnit: 'hour',
                supportsBatch: true,
                supportsRealtime: false,
                languages: ['auto', 'zh', 'en', 'yue', 'sichuan']
            },
            {
                id: 'paraformer-realtime-v2',
                name: 'Paraformer Realtime V2',
                description: 'Non-autoregressive end-to-end ASR model from Alibaba DAMO Academy. Real-time streaming with good accuracy for Chinese and English.',
                releaseDate: '2023-10',
                price: 1.2,
                currency: 'CNY',
                priceUnit: 'hour',
                supportsBatch: false,
                supportsRealtime: true,
                languages: ['zh', 'en']
            },
            {
                id: 'paraformer-v2',
                name: 'Paraformer V2 (Batch)',
                description: 'Batch version of Paraformer V2. Cost-effective solution for file-based transcription. Best for Chinese audio files.',
                releaseDate: '2023-10',
                price: 0.6,
                currency: 'CNY',
                priceUnit: 'hour',
                supportsBatch: true,
                supportsRealtime: false,
                languages: ['zh', 'en']
            }
        ]
    }
];

const REGIONS = {
    alibaba: [
        { id: 'beijing', name: 'Beijing (Mainland China)', wsEndpoint: 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime' },
        { id: 'singapore', name: 'Singapore (International)', wsEndpoint: 'wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime' }
    ]
};

const CURRENCIES = {
    USD: { symbol: '$', name: 'US Dollar' },
    CNY: { symbol: '¥', name: 'Chinese Yuan' },
    EUR: { symbol: '€', name: 'Euro' }
};

// ============================================================================
// PROVIDER MANAGER DIALOG
// ============================================================================

class ProviderManagerDialog extends Adw.Window {
    static {
        GObject.registerClass(this);
    }

    constructor(settings, parentWindow) {
        super({
            title: _('Manage Providers'),
            transientFor: parentWindow,
            modal: true,
            defaultWidth: 700,
            defaultHeight: 500
        });

        this._settings = settings;
        this._providers = this._loadProviders();

        this._buildUI();
    }

    _loadProviders() {
        const config = this._settings.get_string('providers-config');
        try {
            const data = JSON.parse(config);
            if (data.providers && data.providers.length > 0) {
                // Ensure backward compatibility: add missing properties with defaults
                return data.providers.map(provider => ({
                    ...provider,
                    proxyEnabled: provider.proxyEnabled ?? false,
                    proxyUrl: provider.proxyUrl ?? ''
                }));
            }
        } catch (e) {
            log('[Dictate] Failed to parse providers config: ' + e.message);
        }
        // Return defaults if empty or error
        return JSON.parse(JSON.stringify(DEFAULT_PROVIDERS));
    }

    _saveProviders() {
        const config = JSON.stringify({ providers: this._providers });
        this._settings.set_string('providers-config', config);
    }

    _buildUI() {
        const toolbarView = new Adw.ToolbarView();
        this.set_content(toolbarView);

        // Header bar
        const headerBar = new Adw.HeaderBar({
            titleWidget: new Adw.WindowTitle({ title: _('Manage Providers') })
        });
        toolbarView.add_top_bar(headerBar);

        // Add button in header
        const addButton = new Gtk.Button({
            iconName: 'list-add-symbolic',
            tooltipText: _('Add Provider'),
            cssClasses: ['suggested-action']
        });
        addButton.connect('clicked', () => this._showAddProviderDialog());
        headerBar.pack_start(addButton);

        // Main content
        const scrolledWindow = new Gtk.ScrolledWindow({
            hscrollbarPolicy: Gtk.PolicyType.NEVER,
            vexpand: true
        });
        toolbarView.set_content(scrolledWindow);

        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            marginTop: 12,
            marginBottom: 12,
            marginStart: 12,
            marginEnd: 12
        });
        scrolledWindow.set_child(mainBox);

        // Description label
        const descLabel = new Gtk.Label({
            label: _('Add, edit or remove transcription providers. Click on a provider to edit API keys and models.'),
            wrap: true,
            xalign: 0,
            cssClasses: ['dim-label']
        });
        mainBox.append(descLabel);

        // Provider list group
        this._providerListGroup = new Adw.PreferencesGroup({
            title: _('Configured Providers')
        });
        mainBox.append(this._providerListGroup);

        // Restore defaults button at bottom
        const restoreButton = new Gtk.Button({
            label: _('Restore Default Providers'),
            marginTop: 12,
            halign: Gtk.Align.CENTER
        });
        restoreButton.connect('clicked', () => this._restoreDefaults());
        mainBox.append(restoreButton);

        this._refreshProviderList();
    }

    _showAddProviderDialog() {
        const dialog = new Adw.AlertDialog({
            heading: _('Add Provider'),
            closeResponse: 'cancel'
        });

        const listBox = new Gtk.ListBox({
            selectionMode: Gtk.SelectionMode.NONE,
            cssClasses: ['boxed-list']
        });

        // OpenAI option
        const openaiRow = new Adw.ActionRow({
            title: _('OpenAI'),
            subtitle: _('Whisper, GPT-4o Transcribe models'),
            iconName: 'audio-input-microphone-symbolic'
        });
        openaiRow.activatable = true;
        openaiRow.connect('activated', () => {
            dialog.close();
            this._addPresetProvider('openai');
        });
        listBox.append(openaiRow);

        // Alibaba option
        const alibabaRow = new Adw.ActionRow({
            title: _('Alibaba Cloud'),
            subtitle: _('Qwen3-ASR, Paraformer models with real-time support'),
            iconName: 'network-server-symbolic'
        });
        alibabaRow.activatable = true;
        alibabaRow.connect('activated', () => {
            dialog.close();
            this._addPresetProvider('alibaba');
        });
        listBox.append(alibabaRow);

        // Custom option
        const customRow = new Adw.ActionRow({
            title: _('Custom Provider'),
            subtitle: _('Configure your own provider'),
            iconName: 'preferences-system-symbolic'
        });
        customRow.activatable = true;
        customRow.connect('activated', () => {
            dialog.close();
            this._addCustomProvider();
        });
        listBox.append(customRow);

        dialog.set_extra_child(listBox);
        dialog.add_response('cancel', _('Cancel'));

        dialog.present(this);
    }

    _addPresetProvider(presetId) {
        const preset = DEFAULT_PROVIDERS.find(p => p.id === presetId);
        if (!preset) return;

        // Check if already exists
        if (this._providers.some(p => p.id === presetId)) {
            // Show edit dialog instead
            this._editProvider(presetId);
            return;
        }

        // Add with new ID to avoid conflicts
        const newProvider = JSON.parse(JSON.stringify(preset));
        newProvider.id = presetId + '-' + Date.now();
        newProvider.name = preset.name + ' ' + _('(Custom)');
        
        this._providers.push(newProvider);
        this._saveProviders();
        this._editProvider(newProvider.id);
    }

    _addCustomProvider() {
        const newProvider = {
            id: 'custom-' + Date.now(),
            name: _('New Provider'),
            apiKey: '',
            baseUrl: '',
            region: null,
            proxyEnabled: false,
            proxyUrl: '',
            models: []
        };
        this._providers.push(newProvider);
        this._saveProviders();
        this._editProvider(newProvider.id);
    }

    _restoreDefaults() {
        const dialog = new Adw.AlertDialog({
            heading: _('Restore Default Providers?'),
            body: _('This will replace all current provider configurations with the defaults. Your API keys will be lost.'),
            closeResponse: 'cancel'
        });
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('restore', _('Restore'));
        dialog.set_response_appearance('restore', Adw.ResponseAppearance.DESTRUCTIVE);

        dialog.connect('response', (_, response) => {
            if (response === 'restore') {
                this._providers = JSON.parse(JSON.stringify(DEFAULT_PROVIDERS));
                this._saveProviders();
                this._refreshProviderList();
                
                // Clear selection since IDs might have changed
                this._settings.set_string('selected-provider', '');
                this._settings.set_string('selected-model', '');
            }
        });

        dialog.present(this);
    }

    _refreshProviderList() {
        // Clear existing rows by tracking them
        if (!this._providerRows) {
            this._providerRows = [];
        }
        
        // Remove all previously created rows
        this._providerRows.forEach(row => {
            this._providerListGroup.remove(row);
        });
        this._providerRows = [];

        if (this._providers.length === 0) {
            const emptyRow = new Adw.ActionRow({
                title: _('No providers configured'),
                subtitle: _('Click + to add a provider')
            });
            this._providerListGroup.add(emptyRow);
            this._providerRows.push(emptyRow);
            return;
        }

        this._providers.forEach(provider => {
            const row = new Adw.ExpanderRow({
                title: provider.name,
                subtitle: _('%d models configured').format(provider.models.length)
            });

            // Status indicator
            const statusBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 8,
                valign: Gtk.Align.CENTER
            });

            const hasKey = provider.apiKey && provider.apiKey.length > 0;
            const statusLabel = new Gtk.Label({
                label: hasKey ? _('✓ Active') : _('⚠ No API Key'),
                cssClasses: hasKey ? ['success'] : ['warning']
            });
            statusBox.append(statusLabel);

            if (provider.region) {
                const regionLabel = new Gtk.Label({
                    label: _('Region: %s').format(provider.region),
                    cssClasses: ['dim-label']
                });
                statusBox.append(regionLabel);
            }

            // Edit button
            const editButton = new Gtk.Button({
                iconName: 'document-edit-symbolic',
                valign: Gtk.Align.CENTER,
                tooltipText: _('Edit provider')
            });
            editButton.connect('clicked', () => {
                log(`[Dictate] Edit button clicked for provider: ${provider.id}`);
                this._editProvider(provider.id);
            });
            statusBox.append(editButton);

            // Delete button
            const deleteButton = new Gtk.Button({
                iconName: 'user-trash-symbolic',
                valign: Gtk.Align.CENTER,
                tooltipText: _('Remove provider'),
                cssClasses: ['destructive-action']
            });
            deleteButton.connect('clicked', () => this._deleteProvider(provider.id));
            statusBox.append(deleteButton);

            row.add_suffix(statusBox);

            // Models list inside expander
            provider.models.forEach(model => {
                const modelRow = new Adw.ActionRow({
                    title: model.name,
                    subtitle: this._formatModelCapabilities(model) + ' • ' + this._formatPrice(model)
                });
                row.add_row(modelRow);
            });

            this._providerListGroup.add(row);
            this._providerRows.push(row);
        });
    }

    _formatModelCapabilities(model) {
        const caps = [];
        if (model.supportsBatch) caps.push(_('Batch'));
        if (model.supportsRealtime) caps.push(_('Real-time'));
        return caps.join(' + ') || _('Unknown');
    }

    _formatPrice(model) {
        const currency = CURRENCIES[model.currency] || CURRENCIES.USD;
        return currency.symbol + model.price + '/' + model.priceUnit;
    }

    _editProvider(providerId) {
        log(`[Dictate] _editProvider called with id: ${providerId}`);
        const provider = this._providers.find(p => p.id === providerId);
        if (!provider) {
            log(`[Dictate] Provider not found: ${providerId}`);
            return;
        }
        log(`[Dictate] Opening editor for provider: ${provider.name}`);

        const editor = new ProviderEditorDialog(this._settings, provider, (updatedProvider) => {
            const index = this._providers.findIndex(p => p.id === updatedProvider.id);
            if (index >= 0) {
                this._providers[index] = updatedProvider;
                this._saveProviders();
                this._refreshProviderList();
            }
        }, this);
        editor.present(this);
    }

    _deleteProvider(providerId) {
        const dialog = new Adw.AlertDialog({
            heading: _('Remove Provider?'),
            body: _('This provider configuration will be permanently deleted.'),
            closeResponse: 'cancel'
        });
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('delete', _('Delete'));
        dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);

        dialog.connect('response', (_, response) => {
            if (response === 'delete') {
                this._providers = this._providers.filter(p => p.id !== providerId);
                this._saveProviders();
                this._refreshProviderList();
                
                // Clear selection if this was the selected provider
                if (this._settings.get_string('selected-provider') === providerId) {
                    this._settings.set_string('selected-provider', '');
                    this._settings.set_string('selected-model', '');
                }
            }
        });

        dialog.present(this);
    }
}

// ============================================================================
// PROVIDER EDITOR DIALOG
// ============================================================================

class ProviderEditorDialog extends Adw.Window {
    static {
        GObject.registerClass(this);
    }

    constructor(settings, provider, onSave, parentWindow) {
        super({
            title: _('Edit Provider'),
            transientFor: parentWindow,
            modal: true,
            defaultWidth: 700,
            defaultHeight: 600
        });

        this._settings = settings;
        
        // Ensure provider has all required fields
        const defaultProvider = {
            id: '',
            name: '',
            apiKey: '',
            baseUrl: '',
            region: null,
            proxyEnabled: false,
            proxyUrl: '',
            models: []
        };
        this._provider = JSON.parse(JSON.stringify({ ...defaultProvider, ...provider }));
        this._onSave = onSave;
        this._editedModels = [...this._provider.models];

        this._buildUI();
    }

    _buildUI() {
        const toolbarView = new Adw.ToolbarView();
        this.set_content(toolbarView);

        // Header bar
        const headerBar = new Adw.HeaderBar({
            titleWidget: new Adw.WindowTitle({ title: _('Edit Provider') })
        });
        toolbarView.add_top_bar(headerBar);

        // Save button in header
        const saveButton = new Gtk.Button({
            label: _('Save'),
            cssClasses: ['suggested-action']
        });
        saveButton.connect('clicked', () => {
            this._provider.models = this._editedModels;
            this._onSave(this._provider);
            this.close();
        });
        headerBar.pack_end(saveButton);

        // Main content
        const scrolledWindow = new Gtk.ScrolledWindow({
            hscrollbarPolicy: Gtk.PolicyType.NEVER,
            vexpand: true
        });
        toolbarView.set_content(scrolledWindow);

        const contentBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            marginTop: 12,
            marginBottom: 12,
            marginStart: 12,
            marginEnd: 12
        });
        scrolledWindow.set_child(contentBox);

        const page = new Adw.PreferencesPage();
        contentBox.append(page);

        // Basic Info Group
        const basicGroup = new Adw.PreferencesGroup({
            title: _('Basic Information')
        });
        page.add(basicGroup);

        // Name
        const nameRow = new Adw.ActionRow({ title: _('Provider Name') });
        const nameEntry = new Gtk.Entry({
            text: this._provider.name,
            valign: Gtk.Align.CENTER,
            hexpand: true
        });
        nameEntry.connect('changed', () => {
            this._provider.name = nameEntry.text;
        });
        nameRow.add_suffix(nameEntry);
        basicGroup.add(nameRow);

        // API Key
        const apiKeyRow = new Adw.ActionRow({ title: _('API Key') });
        const apiKeyEntry = new Gtk.Entry({
            text: this._provider.apiKey,
            valign: Gtk.Align.CENTER,
            hexpand: true,
            visibility: false,
            inputPurpose: Gtk.InputPurpose.PASSWORD
        });
        apiKeyEntry.connect('changed', () => {
            this._provider.apiKey = apiKeyEntry.text;
        });
        apiKeyRow.add_suffix(apiKeyEntry);
        basicGroup.add(apiKeyRow);

        // Base URL
        const baseUrlRow = new Adw.ActionRow({ 
            title: _('Base URL / Endpoint'),
            subtitle: _('API endpoint URL')
        });
        const baseUrlEntry = new Gtk.Entry({
            text: this._provider.baseUrl || '',
            valign: Gtk.Align.CENTER,
            hexpand: true
        });
        baseUrlEntry.connect('changed', () => {
            this._provider.baseUrl = baseUrlEntry.text;
        });
        baseUrlRow.add_suffix(baseUrlEntry);
        basicGroup.add(baseUrlRow);

        // Region (if applicable)
        if (this._provider.id.startsWith('alibaba') || this._hasRegionSupport()) {
            const regionRow = new Adw.ComboRow({
                title: _('Region'),
                subtitle: _('Select API region (affects endpoint)')
            });
            
            const regionModel = new Gtk.StringList();
            const regions = REGIONS.alibaba;
            regions.forEach(r => regionModel.append(r.name));
            regionRow.model = regionModel;

            const currentRegion = this._provider.region || 'beijing';
            const regionIndex = regions.findIndex(r => r.id === currentRegion);
            regionRow.selected = regionIndex >= 0 ? regionIndex : 0;

            regionRow.connect('notify::selected', () => {
                this._provider.region = regions[regionRow.selected].id;
                // Update base URL based on region
                if (this._provider.id.includes('alibaba')) {
                    this._provider.baseUrl = regions[regionRow.selected].id === 'beijing'
                        ? 'https://dashscope.aliyuncs.com/api/v1'
                        : 'https://dashscope-intl.aliyuncs.com/api/v1';
                    baseUrlEntry.text = this._provider.baseUrl;
                }
            });
            basicGroup.add(regionRow);
        }

        // Proxy Settings
        const proxyGroup = new Adw.PreferencesGroup({
            title: _('Proxy Configuration')
        });
        page.add(proxyGroup);

        // Proxy URL row first (referenced in switch callback)
        const proxyEnabled = this._provider.proxyEnabled || false;
        const proxyUrlRow = new Adw.ActionRow({
            title: _('Proxy URL'),
            subtitle: _('e.g., http://proxy.example.com:8080')
        });
        const proxyUrlEntry = new Gtk.Entry({
            text: this._provider.proxyUrl || '',
            valign: Gtk.Align.CENTER,
            hexpand: true,
            sensitive: proxyEnabled
        });
        proxyUrlEntry.connect('changed', () => {
            this._provider.proxyUrl = proxyUrlEntry.text;
        });
        proxyUrlRow.add_suffix(proxyUrlEntry);

        const proxySwitchRow = new Adw.SwitchRow({
            title: _('Use Proxy'),
            subtitle: _('Enable proxy for API requests'),
            active: proxyEnabled
        });
        proxySwitchRow.connect('notify::active', () => {
            this._provider.proxyEnabled = proxySwitchRow.active;
            proxyUrlEntry.sensitive = proxySwitchRow.active;
        });
        
        proxyGroup.add(proxySwitchRow);
        proxyGroup.add(proxyUrlRow);

        // Models Group
        const modelsGroup = new Adw.PreferencesGroup({
            title: _('Models'),
            description: _('Configure available models for this provider')
        });
        page.add(modelsGroup);

        this._modelsListBox = new Gtk.ListBox({
            selectionMode: Gtk.SelectionMode.NONE,
            cssClasses: ['boxed-list']
        });
        modelsGroup.add(this._modelsListBox);

        this._refreshModelsList();

        // Add model button
        const addModelRow = new Adw.ActionRow({
            title: _('Add Model'),
            cssClasses: ['property']
        });
        const addModelButton = new Gtk.Button({
            iconName: 'list-add-symbolic',
            valign: Gtk.Align.CENTER,
            cssClasses: ['circular', 'suggested-action']
        });
        addModelButton.connect('clicked', () => this._showAddModelDialog());
        addModelRow.add_suffix(addModelButton);
        modelsGroup.add(addModelRow);

        // Test Connection Group
        const testGroup = new Adw.PreferencesGroup({
            title: _('Connection Test')
        });
        page.add(testGroup);

        const testRow = new Adw.ActionRow({
            title: _('Test Connection'),
            subtitle: _('Verify API credentials and connectivity')
        });
        testGroup.add(testRow);

        const testButton = new Gtk.Button({
            label: _('Test'),
            valign: Gtk.Align.CENTER
        });
        testButton.connect('clicked', () => this._testConnection(testButton));
        testRow.add_suffix(testButton);

        this._testResultLabel = new Gtk.Label({
            label: '',
            marginTop: 8
        });
        testGroup.add(this._testResultLabel);
    }

    _hasRegionSupport() {
        return this._provider.baseUrl && (
            this._provider.baseUrl.includes('aliyun') ||
            this._provider.baseUrl.includes('alibabacloud')
        );
    }

    _refreshModelsList() {
        // Clear list
        let child = this._modelsListBox.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            this._modelsListBox.remove(child);
            child = next;
        }

        if (this._editedModels.length === 0) {
            const emptyRow = new Adw.ActionRow({
                title: _('No models configured'),
                subtitle: _('Add at least one model to use this provider')
            });
            this._modelsListBox.append(emptyRow);
            return;
        }

        this._editedModels.forEach((model, index) => {
            const row = new Adw.ActionRow({
                title: model.name,
                subtitle: this._formatModelSubtitle(model)
            });

            const editButton = new Gtk.Button({
                iconName: 'document-edit-symbolic',
                valign: Gtk.Align.CENTER,
                tooltipText: _('Edit model')
            });
            editButton.connect('clicked', () => this._editModel(index));
            row.add_suffix(editButton);

            const deleteButton = new Gtk.Button({
                iconName: 'user-trash-symbolic',
                valign: Gtk.Align.CENTER,
                tooltipText: _('Remove model'),
                cssClasses: ['destructive-action']
            });
            deleteButton.connect('clicked', () => this._deleteModel(index));
            row.add_suffix(deleteButton);

            this._modelsListBox.append(row);
        });
    }

    _formatModelSubtitle(model) {
        const caps = [];
        if (model.supportsBatch) caps.push(_('Batch'));
        if (model.supportsRealtime) caps.push(_('Real-time'));
        const currency = CURRENCIES[model.currency] || CURRENCIES.USD;
        return caps.join(' + ') + ' • ' + currency.symbol + model.price + '/' + model.priceUnit;
    }

    _showAddModelDialog() {
        const dialog = new ModelEditorDialog(null, (model) => {
            this._editedModels.push(model);
            this._refreshModelsList();
        });
        dialog.present(this);
    }

    _editModel(index) {
        const dialog = new ModelEditorDialog(this._editedModels[index], (model) => {
            this._editedModels[index] = model;
            this._refreshModelsList();
        });
        dialog.present(this);
    }

    _deleteModel(index) {
        this._editedModels.splice(index, 1);
        this._refreshModelsList();
    }

    _testConnection(button) {
        button.sensitive = false;
        this._testResultLabel.label = _('Testing...');
        this._testResultLabel.cssClasses = [];

        // Simple validation test
        setTimeout(() => {
            if (!this._provider.apiKey || this._provider.apiKey.length < 10) {
                this._testResultLabel.label = _('❌ Invalid or missing API Key');
                this._testResultLabel.cssClasses = ['error'];
            } else if (!this._provider.baseUrl) {
                this._testResultLabel.label = _('❌ Base URL not configured');
                this._testResultLabel.cssClasses = ['error'];
            } else if (this._editedModels.length === 0) {
                this._testResultLabel.label = _('⚠ No models configured');
                this._testResultLabel.cssClasses = ['warning'];
            } else {
                this._testResultLabel.label = _('✓ Configuration looks valid (actual test requires extension)');
                this._testResultLabel.cssClasses = ['success'];
            }
            button.sensitive = true;
        }, 500);
    }
}

// ============================================================================
// MODEL EDITOR DIALOG
// ============================================================================

class ModelEditorDialog extends Adw.AlertDialog {
    static {
        GObject.registerClass(this);
    }

    constructor(model, onSave) {
        super({
            heading: model ? _('Edit Model') : _('Add Model'),
            closeResponse: 'cancel'
        });

        this._model = model || {
            id: '',
            name: '',
            price: 0,
            currency: 'USD',
            priceUnit: 'hour',
            supportsBatch: true,
            supportsRealtime: false,
            languages: ['auto', 'en']
        };
        this._onSave = onSave;

        this._buildContent();
        this._setupResponses();
    }

    _buildContent() {
        const contentBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12
        });

        // Model ID
        const idRow = new Adw.ActionRow({ title: _('Model ID') });
        const idEntry = new Gtk.Entry({
            text: this._model.id,
            valign: Gtk.Align.CENTER,
            hexpand: true
        });
        idEntry.connect('changed', () => {
            this._model.id = idEntry.text;
        });
        idRow.add_suffix(idEntry);
        contentBox.append(idRow);

        // Model Name
        const nameRow = new Adw.ActionRow({ title: _('Display Name') });
        const nameEntry = new Gtk.Entry({
            text: this._model.name,
            valign: Gtk.Align.CENTER,
            hexpand: true
        });
        nameEntry.connect('changed', () => {
            this._model.name = nameEntry.text;
        });
        nameRow.add_suffix(nameEntry);
        contentBox.append(nameRow);

        // Capabilities
        const capsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 16,
            marginTop: 8
        });

        const batchCheck = new Gtk.CheckButton({
            label: _('Supports Batch'),
            active: this._model.supportsBatch
        });
        batchCheck.connect('toggled', () => {
            this._model.supportsBatch = batchCheck.active;
        });
        capsBox.append(batchCheck);

        const realtimeCheck = new Gtk.CheckButton({
            label: _('Supports Real-time'),
            active: this._model.supportsRealtime
        });
        realtimeCheck.connect('toggled', () => {
            this._model.supportsRealtime = realtimeCheck.active;
        });
        capsBox.append(realtimeCheck);

        contentBox.append(capsBox);

        // Pricing
        const priceBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
            marginTop: 8
        });

        const priceEntry = new Gtk.Entry({
            text: this._model.price.toString(),
            widthChars: 10,
            inputPurpose: Gtk.InputPurpose.NUMBER
        });
        priceEntry.connect('changed', () => {
            const val = parseFloat(priceEntry.text);
            this._model.price = isNaN(val) ? 0 : val;
        });
        priceBox.append(new Gtk.Label({ label: _('Price:') }));
        priceBox.append(priceEntry);

        // Currency dropdown
        const currencyDrop = new Gtk.DropDown({
            model: Gtk.StringList.new(['USD', 'CNY', 'EUR']),
            selected: ['USD', 'CNY', 'EUR'].indexOf(this._model.currency) || 0
        });
        currencyDrop.connect('notify::selected', () => {
            this._model.currency = ['USD', 'CNY', 'EUR'][currencyDrop.selected];
        });
        priceBox.append(currencyDrop);

        priceBox.append(new Gtk.Label({ label: _('/') }));

        // Unit dropdown
        const unitDrop = new Gtk.DropDown({
            model: Gtk.StringList.new(['hour', 'minute', '1K tokens']),
            selected: ['hour', 'minute', '1K tokens'].indexOf(this._model.priceUnit) || 0
        });
        unitDrop.connect('notify::selected', () => {
            this._model.priceUnit = ['hour', 'minute', '1K tokens'][unitDrop.selected];
        });
        priceBox.append(unitDrop);

        contentBox.append(priceBox);

        // Preset prices info
        const presetLabel = new Gtk.Label({
            label: _('<small>Common prices: OpenAI $0.36/h, Alibaba ¥0.8-2/h</small>'),
            useMarkup: true,
            halign: Gtk.Align.START,
            marginTop: 4
        });
        contentBox.append(presetLabel);

        this.set_extra_child(contentBox);
    }

    _setupResponses() {
        this.add_response('cancel', _('Cancel'));
        this.add_response('save', _('Save'));
        this.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);

        this.connect('response', (_, response) => {
            if (response === 'save' && this._model.id && this._model.name) {
                this._onSave(this._model);
            }
        });
    }
}

// ============================================================================
// MAIN PREFERENCES CLASS
// ============================================================================

export default class DictatePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        // Set larger default size for the preferences window
        window.set_default_size(1000, 750);
        
        const settings = this.getSettings();

        // Migrate legacy settings if needed
        this._migrateLegacySettings(settings);

        // Initialize default providers if empty
        this._initializeDefaultProviders(settings);

        const page = new Adw.PreferencesPage({
            title: _('Dictate Settings'),
            iconName: 'audio-input-microphone-symbolic'
        });
        window.add(page);

        // ===== General Settings Group =====
        const generalGroup = new Adw.PreferencesGroup({
            title: _('General Settings')
        });
        page.add(generalGroup);

        const keybindingRow = new Adw.ActionRow({
            title: _('Toggle Keybinding'),
            subtitle: _('Keyboard shortcut to start/stop recording')
        });
        generalGroup.add(keybindingRow);

        const keybindingEntry = new Gtk.Entry({
            text: settings.get_strv('toggle-key')[0] || '<Super><Alt>d',
            valign: Gtk.Align.CENTER
        });
        keybindingRow.add_suffix(keybindingEntry);

        keybindingEntry.connect('changed', () => {
            settings.set_strv('toggle-key', [keybindingEntry.text]);
        });

        // ===== Provider Management Group =====
        const providerManageGroup = new Adw.PreferencesGroup({
            title: _('Transcription Providers'),
            description: _('Configure and select your transcription service')
        });
        page.add(providerManageGroup);

        // Manage providers button
        const manageRow = new Adw.ActionRow({
            title: _('Manage Providers'),
            subtitle: _('Add, edit or remove provider configurations')
        });
        providerManageGroup.add(manageRow);

        const manageButton = new Gtk.Button({
            label: _('Configure...'),
            valign: Gtk.Align.CENTER
        });
        manageButton.connect('clicked', () => {
            const dialog = new ProviderManagerDialog(settings, window);
            dialog.present();
        });
        manageRow.add_suffix(manageButton);

        // Provider Selection
        const providerRow = new Adw.ComboRow({
            title: _('Active Provider'),
            subtitle: _('Select the provider to use for transcription')
        });
        providerManageGroup.add(providerRow);

        // Model Selection
        const modelRow = new Adw.ComboRow({
            title: _('Model'),
            subtitle: _('Select the model for transcription')
        });
        providerManageGroup.add(modelRow);

        // Model Info - Price and capabilities
        const modelInfoRow = new Adw.ActionRow({
            title: _('Model Information')
        });
        providerManageGroup.add(modelInfoRow);

        const modelInfoLabel = new Gtk.Label({
            label: '',
            valign: Gtk.Align.CENTER,
            cssClasses: ['dim-label']
        });
        modelInfoRow.add_suffix(modelInfoLabel);

        // Model Description - Separate row with wrapped text
        const modelDescRow = new Adw.ActionRow({
            title: _('Description')
        });
        providerManageGroup.add(modelDescRow);

        const modelDescLabel = new Gtk.Label({
            label: '',
            valign: Gtk.Align.CENTER,
            halign: Gtk.Align.END,
            wrap: true,
            wrapMode: Gtk.WrapMode.WORD,
            maxWidthChars: 60,
            cssClasses: ['dim-label']
        });
        modelDescRow.add_suffix(modelDescLabel);

        // Mode Selection (Batch vs Real-time)
        const modeRow = new Adw.ComboRow({
            title: _('Transcription Mode'),
            subtitle: _('Choose between batch or real-time transcription')
        });
        providerManageGroup.add(modeRow);

        const modeModel = new Gtk.StringList();
        modeModel.append(_('Batch (record then transcribe)'));
        modeModel.append(_('Real-time (stream while recording)'));
        modeRow.model = modeModel;

        // Update mode based on settings
        const currentMode = settings.get_string('transcription-mode');
        modeRow.selected = currentMode === 'realtime' ? 1 : 0;

        modeRow.connect('notify::selected', () => {
            const mode = modeRow.selected === 1 ? 'realtime' : 'batch';
            settings.set_string('transcription-mode', mode);
            this._updateProviderUI(settings, providerRow, modelRow, modelInfoLabel, modeRow, modelInfoRow, modelDescLabel);
        });

        // ===== Language Settings Group =====
        const languageGroup = new Adw.PreferencesGroup({
            title: _('Language Settings')
        });
        page.add(languageGroup);

        const languageRow = new Adw.ComboRow({
            title: _('Language'),
            subtitle: _('Select transcription language')
        });
        languageGroup.add(languageRow);

        const languageModel = new Gtk.StringList();
        languageModel.append(_('Auto-detect'));
        languageModel.append(_('Chinese (zh)'));
        languageModel.append(_('English (en)'));
        languageModel.append(_('Japanese (ja)'));
        languageModel.append(_('Korean (ko)'));
        languageModel.append(_('Italian (it)'));
        languageModel.append(_('German (de)'));
        languageModel.append(_('French (fr)'));
        languageModel.append(_('Spanish (es)'));
        languageRow.model = languageModel;

        const languages = ['auto', 'zh', 'en', 'ja', 'ko', 'it', 'de', 'fr', 'es'];
        const currentLanguage = settings.get_string('language') || 'auto';
        const languageIndex = languages.indexOf(currentLanguage);
        languageRow.selected = languageIndex >= 0 ? languageIndex : 0;

        languageRow.connect('notify::selected', () => {
            settings.set_string('language', languages[languageRow.selected]);
        });

        // ===== Typing Tool Group =====
        const typingGroup = new Adw.PreferencesGroup({
            title: _('Text Input Settings'),
            description: _('Configure how transcribed text is inserted')
        });
        page.add(typingGroup);

        const typeToolRow = new Adw.ComboRow({
            title: _('Typing Tool'),
            subtitle: _('Tool to use for typing text into applications')
        });
        typingGroup.add(typeToolRow);

        const typeToolModel = new Gtk.StringList();
        typeToolModel.append(_('Auto (detect available tool)'));
        typeToolModel.append('wtype (Wayland)');
        typeToolModel.append('ydotool (Wayland/X11)');
        typeToolModel.append('xdotool (X11)');
        typeToolModel.append(_('None (clipboard only)'));
        typeToolRow.model = typeToolModel;

        const typeTools = ['auto', 'wtype', 'ydotool', 'xdotool', 'none'];
        const currentTypeTool = settings.get_string('type-tool') || 'auto';
        const typeToolIndex = typeTools.indexOf(currentTypeTool);
        typeToolRow.selected = typeToolIndex >= 0 ? typeToolIndex : 0;

        typeToolRow.connect('notify::selected', () => {
            settings.set_string('type-tool', typeTools[typeToolRow.selected]);
        });

        // Initialize provider UI
        this._updateProviderUI(settings, providerRow, modelRow, modelInfoLabel, modeRow, modelInfoRow, modelDescLabel);

        // Refresh UI when providers change
        const refreshHandler = () => {
            this._updateProviderUI(settings, providerRow, modelRow, modelInfoLabel, modeRow, modelInfoRow, modelDescLabel);
        };
        settings.connect('changed::providers-config', refreshHandler);
        settings.connect('changed::selected-provider', refreshHandler);
        settings.connect('changed::selected-model', refreshHandler);

        // Provider change handler
        providerRow.connect('notify::selected', () => {
            const providers = this._getProviders(settings);
            if (providerRow.selected >= 0 && providerRow.selected < providers.length) {
                const provider = providers[providerRow.selected];
                settings.set_string('selected-provider', provider.id);
                settings.set_string('selected-model', ''); // Reset model
                this._updateProviderUI(settings, providerRow, modelRow, modelInfoLabel, modeRow, modelInfoRow, modelDescLabel);
            }
        });

        // Model change handler
        modelRow.connect('notify::selected', () => {
            const providers = this._getProviders(settings);
            const selectedProviderId = settings.get_string('selected-provider');
            const currentMode = settings.get_string('transcription-mode');
            const provider = providers.find(p => p.id === selectedProviderId);
            
            if (provider) {
                // Filter models based on current mode (same logic as _updateProviderUI)
                const availableModels = provider.models.filter(m => {
                    if (currentMode === 'realtime') {
                        return m.supportsRealtime;
                    }
                    return m.supportsBatch;
                });
                
                if (modelRow.selected >= 0 && modelRow.selected < availableModels.length) {
                    const model = availableModels[modelRow.selected];
                    settings.set_string('selected-model', model.id);
                    this._updateProviderUI(settings, providerRow, modelRow, modelInfoLabel, modeRow, modelInfoRow, modelDescLabel);
                }
            }
        });
    }

    _migrateLegacySettings(settings) {
        // Check if already migrated
        const providersConfig = settings.get_string('providers-config');
        try {
            const config = JSON.parse(providersConfig);
            if (config.providers && config.providers.length > 0) {
                return; // Already has providers
            }
        } catch (e) {
            // Continue with migration
        }

        // Get legacy values
        const legacyProvider = settings.get_string('provider');
        const legacyApiKey = settings.get_string('api-key');
        const legacyModel = settings.get_string('model');
        const legacyRegion = settings.get_string('alibaba-region') || 'beijing';
        const legacyProxyEnabled = settings.get_boolean('use-proxy');
        const legacyProxyUrl = settings.get_string('proxy-url');
        const legacyRealtime = settings.get_boolean('realtime');

        // Find default provider to migrate to
        const providers = JSON.parse(JSON.stringify(DEFAULT_PROVIDERS));
        const targetProvider = providers.find(p => p.id === legacyProvider);

        if (targetProvider) {
            targetProvider.apiKey = legacyApiKey;
            targetProvider.proxyEnabled = legacyProxyEnabled;
            targetProvider.proxyUrl = legacyProxyUrl;

            if (legacyProvider === 'alibaba') {
                targetProvider.region = legacyRegion;
                targetProvider.baseUrl = legacyRegion === 'beijing'
                    ? 'https://dashscope.aliyuncs.com/api/v1'
                    : 'https://dashscope-intl.aliyuncs.com/api/v1';
            }

            // Set migrated config
            settings.set_string('providers-config', JSON.stringify({ providers }));
            settings.set_string('selected-provider', targetProvider.id);
            settings.set_string('selected-model', legacyModel || targetProvider.models[0]?.id || '');
            settings.set_string('transcription-mode', legacyRealtime ? 'realtime' : 'batch');
        }
    }

    _initializeDefaultProviders(settings) {
        const config = settings.get_string('providers-config');
        try {
            const data = JSON.parse(config);
            if (!data.providers || data.providers.length === 0) {
                settings.set_string('providers-config', JSON.stringify({ providers: DEFAULT_PROVIDERS }));
                // Set default selection
                settings.set_string('selected-provider', DEFAULT_PROVIDERS[0].id);
                settings.set_string('selected-model', DEFAULT_PROVIDERS[0].models[0].id);
            }
        } catch (e) {
            settings.set_string('providers-config', JSON.stringify({ providers: DEFAULT_PROVIDERS }));
        }
    }

    _getProviders(settings) {
        const config = settings.get_string('providers-config');
        try {
            const data = JSON.parse(config);
            if (!data.providers || data.providers.length === 0) {
                return DEFAULT_PROVIDERS;
            }
            
            // Merge saved providers with defaults to add missing fields (description, releaseDate)
            return data.providers.map(savedProvider => {
                const defaultProvider = DEFAULT_PROVIDERS.find(p => p.id === savedProvider.id);
                if (!defaultProvider) return savedProvider;
                
                // Merge models to add description and releaseDate
                const mergedModels = savedProvider.models.map(savedModel => {
                    const defaultModel = defaultProvider.models.find(m => m.id === savedModel.id);
                    if (!defaultModel) return savedModel;
                    
                    return {
                        ...defaultModel,  // Use defaults for description, releaseDate, etc.
                        ...savedModel,    // Override with saved values (apiKey, etc.)
                        description: defaultModel.description || '',
                        releaseDate: defaultModel.releaseDate || ''
                    };
                });
                
                return {
                    ...savedProvider,
                    models: mergedModels
                };
            });
        } catch (e) {
            return DEFAULT_PROVIDERS;
        }
    }

    _updateProviderUI(settings, providerRow, modelRow, infoLabel, modeRow, modelInfoRow, modelDescLabel) {
        // Prevent recursive updates
        if (this._updatingUI) return;
        this._updatingUI = true;

        try {
            const providers = this._getProviders(settings);
            const selectedProviderId = settings.get_string('selected-provider');
            const selectedModelId = settings.get_string('selected-model');
            const currentMode = settings.get_string('transcription-mode');

            // Build provider model only if needed
            const currentProviderNames = [];
            if (providerRow.model) {
                for (let i = 0; i < providerRow.model.get_n_items(); i++) {
                    currentProviderNames.push(providerRow.model.get_string(i));
                }
            }
            const newProviderNames = providers.map(p => p.name);
            
            const providersChanged = currentProviderNames.length !== newProviderNames.length ||
                                     !currentProviderNames.every((name, i) => name === newProviderNames[i]);

            if (providersChanged) {
                const providerModel = new Gtk.StringList();
                providers.forEach(p => providerModel.append(p.name));
                providerRow.model = providerModel;
            }

            const providerIndex = providers.findIndex(p => p.id === selectedProviderId);
            if (providerIndex >= 0) {
                providerRow.selected = providerIndex;
            } else if (providers.length > 0) {
                providerRow.selected = 0;
                settings.set_string('selected-provider', providers[0].id);
            }

            const currentProvider = providers[providerRow.selected];
            if (!currentProvider) {
                this._updatingUI = false;
                return;
            }

            // Filter models based on mode
            let availableModels = currentProvider.models.filter(m => {
                if (currentMode === 'realtime') {
                    return m.supportsRealtime;
                }
                return m.supportsBatch;
            });

            // If no models available for current mode, try the other mode
            if (availableModels.length === 0) {
                const otherMode = currentMode === 'realtime' ? 'batch' : 'realtime';
                const otherModels = currentProvider.models.filter(m => {
                    if (otherMode === 'realtime') {
                        return m.supportsRealtime;
                    }
                    return m.supportsBatch;
                });
                
                if (otherModels.length > 0) {
                    // Switch to the other mode
                    availableModels = otherModels;
                    modeRow.selected = otherMode === 'realtime' ? 1 : 0;
                    settings.set_string('transcription-mode', otherMode);
                }
            }

            // Build model list only if needed
            const currentModelNames = [];
            if (modelRow.model) {
                for (let i = 0; i < modelRow.model.get_n_items(); i++) {
                    currentModelNames.push(modelRow.model.get_string(i));
                }
            }
            const newModelNames = availableModels.map(m => m.name);
            
            const modelsChanged = currentModelNames.length !== newModelNames.length ||
                                  !currentModelNames.every((name, i) => name === newModelNames[i]);

            if (modelsChanged) {
                const modelList = new Gtk.StringList();
                availableModels.forEach(m => modelList.append(m.name));
                modelRow.model = modelList;
            }

            const modelIndex = availableModels.findIndex(m => m.id === selectedModelId);
            if (modelIndex >= 0) {
                modelRow.selected = modelIndex;
            } else if (availableModels.length > 0) {
                modelRow.selected = 0;
                settings.set_string('selected-model', availableModels[0].id);
            }

            // Update info label
            const currentModel = availableModels[modelRow.selected];
            if (currentModel) {
                const currency = CURRENCIES[currentModel.currency] || CURRENCIES.USD;
                const caps = [];
                if (currentModel.supportsBatch) caps.push(_('Batch'));
                if (currentModel.supportsRealtime) caps.push(_('Real-time'));
                
                // Build info text with description and release date
                let infoText = currency.symbol + currentModel.price + '/' + currentModel.priceUnit + 
                              ' • ' + caps.join(' + ');
                
                if (currentModel.releaseDate) {
                    infoText += ' • ' + _('Released: %s').format(currentModel.releaseDate);
                }
                
                infoLabel.label = infoText;
                
                // Update the model description label
                if (modelDescLabel) {
                    modelDescLabel.label = currentModel.description || '';
                }
                
                // Update model row subtitle with full model name for tooltip effect
                if (currentModel.name) {
                    modelRow.subtitle = currentModel.name;
                }

                // Check if current mode is supported by this model
                const modeSupported = currentMode === 'realtime' ? 
                    currentModel.supportsRealtime : currentModel.supportsBatch;
                
                // If not supported, switch to the supported mode
                if (!modeSupported) {
                    if (currentModel.supportsBatch) {
                        modeRow.selected = 0;
                        settings.set_string('transcription-mode', 'batch');
                    } else if (currentModel.supportsRealtime) {
                        modeRow.selected = 1;
                        settings.set_string('transcription-mode', 'realtime');
                    }
                }
                
                // Mode switch is always enabled - changing mode will update the model list
                modeRow.sensitive = true;
            } else {
                infoLabel.label = _('No models available for this mode');
                if (modelDescLabel) {
                    modelDescLabel.label = '';
                }
                modelRow.subtitle = _('Select the model for transcription');
            }
        } finally {
            this._updatingUI = false;
        }
    }
}
