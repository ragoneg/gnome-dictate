import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import Soup from 'gi://Soup';
import Gdk from 'gi://Gdk';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export default class DictateExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._isRecording = false;
        this._recordingIndicator = null;
        this._audioFile = null;
        this._recordingProcess = null;
        this._realtimeMode = false;
        this._websocket = null;
        this._audioStream = null;
        this._transcribedText = '';
        this._partialText = '';
        this._textDisplay = null;

        this._panelButton = new PanelMenu.Button(0.0, _('Dictate'));

        this._icon = new St.Icon({
            iconName: 'audio-input-microphone-symbolic',
            styleClass: 'system-status-icon'
        });

        this._panelButton.add_child(this._icon);

        this._addMenuItems();
        Main.panel.addToStatusArea('dictate', this._panelButton);

        this._setupKeybinding();
    }

    disable() {
        this._removeKeybinding();

        if (this._isRecording) {
            this._stopRecording();
        }

        if (this._websocket) {
            this._websocket.close(1000, 'Extension disabled');
            this._websocket = null;
        }

        if (this._recordingIndicator) {
            this._recordingIndicator.destroy();
            this._recordingIndicator = null;
        }

        if (this._textDisplay) {
            this._textDisplay.destroy();
            this._textDisplay = null;
        }

        if (this._panelButton) {
            this._panelButton.destroy();
            this._panelButton = null;
        }

        this._settings = null;
    }

    _addMenuItems() {
        this._recordItem = new PopupMenu.PopupMenuItem(_('Start Recording'));
        this._recordItem.connect('activate', () => this._toggleRecording());
        this._panelButton.menu.addMenuItem(this._recordItem);

        this._panelButton.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const settingsItem = new PopupMenu.PopupMenuItem(_('Settings'));
        settingsItem.connect('activate', () => {
            GLib.spawn_command_line_async('gnome-extensions prefs dictate@opencode.local');
        });
        this._panelButton.menu.addMenuItem(settingsItem);
    }

    _setupKeybinding() {
        Main.wm.addKeybinding(
            'toggle-key',
            this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.ALL,
            () => this._toggleRecording()
        );
    }

    _removeKeybinding() {
        Main.wm.removeKeybinding('toggle-key');
    }

    _showTransientNotification(message, durationSeconds = 2) {
        // Show a notification that auto-dismisses after specified seconds
        const notification = Main.notify(_('Dictate'), message);
        
        // Auto-dismiss after duration
        GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, durationSeconds, () => {
            try {
                // Close the notification if it exists
                if (notification && notification.destroy) {
                    notification.destroy();
                }
            } catch (e) {
                // Notification might already be closed
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _setRecordingIcon(active) {
        if (active) {
            this._icon.set_style('color: #ff4444;');
        } else {
            this._icon.set_style('');
        }
    }

    _showSuccessFeedback() {
        // Flash green for 2 seconds to indicate completion
        this._icon.set_style('color: #44ff44;');
        
        GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
            this._icon.set_style('');
            return GLib.SOURCE_REMOVE;
        });
    }

    _toggleRecording() {
        if (this._isRecording) {
            this._stopRecording();
        } else {
            this._startRecording();
        }
    }

    // ===== NEW: Get provider configuration from settings =====
    _getProviderConfig() {
        const configStr = this._settings.get_string('providers-config');
        try {
            return JSON.parse(configStr);
        } catch (e) {
            log('[Dictate] Failed to parse providers config: ' + e.message);
            return { providers: [] };
        }
    }

    _getSelectedProvider() {
        const config = this._getProviderConfig();
        const selectedId = this._settings.get_string('selected-provider');
        return config.providers.find(p => p.id === selectedId) || config.providers[0];
    }

    _getSelectedModel(provider) {
        if (!provider) return null;
        const selectedModelId = this._settings.get_string('selected-model');
        return provider.models.find(m => m.id === selectedModelId) || provider.models[0];
    }

    _isRealtimeMode() {
        return this._settings.get_string('transcription-mode') === 'realtime';
    }

    // ===== END NEW =====

    _startRecording() {
        // Reset any stuck state from previous sessions
        if (this._isRecording) {
            log('[Dictate] Warning: _startRecording called while already recording, resetting state');
            this._stopRecording();
            return;
        }

        // Use new settings
        this._realtimeMode = this._isRealtimeMode();
        this._transcribedText = '';
        this._partialText = '';

        const provider = this._getSelectedProvider();
        const model = this._getSelectedModel(provider);

        if (!provider || !model) {
            Main.notify(_('Dictate'), _('Please configure a provider and model in settings'));
            return;
        }

        // Check if model supports the requested mode
        if (this._realtimeMode && !model.supportsRealtime) {
            Main.notify(_('Dictate'), _('Selected model does not support real-time mode'));
            this._realtimeMode = false;
        }

        if (this._realtimeMode) {
            this._startRealtimeRecording(provider, model);
        } else {
            this._startBatchRecording();
        }
    }

    _startBatchRecording() {
        try {
            const [fd, tempFile] = GLib.file_open_tmp('dictate-XXXXXX.wav');
            GLib.close(fd);
            this._audioFile = tempFile;

            this._recordingProcess = Gio.Subprocess.new(
                [
                    'ffmpeg', '-y', '-f', 'pulse', '-i', 'default',
                    '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1',
                    this._audioFile
                ],
                Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE
            );

            this._isRecording = true;
            this._icon.icon_name = 'media-record-symbolic';
            this._recordItem.label.text = _('Stop Recording');
            this._setRecordingIcon(true);  // Red pulsing effect

            this._showRecordingIndicator();
            // Icon turns red - no notification needed

        } catch (e) {
            Main.notify(_('Dictate'), _('Failed to start: ' + e.message));
        }
    }

    _startRealtimeRecording(provider, model) {
        if (!model || !model.supportsRealtime) {
            Main.notify(_('Dictate'), _('Real-time mode not supported by selected model'));
            this._realtimeMode = false;
            this._startBatchRecording();
            return;
        }

        // Check if provider supports realtime (currently only Alibaba)
        const isAlibaba = provider.id.includes('alibaba') || 
                         provider.baseUrl?.includes('aliyun') ||
                         provider.baseUrl?.includes('dashscope');
        
        if (!isAlibaba) {
            Main.notify(_('Dictate'), _('Real-time mode currently only supported with Alibaba Cloud'));
            this._realtimeMode = false;
            this._startBatchRecording();
            return;
        }

        try {
            this._isRecording = true;
            this._icon.icon_name = 'media-record-symbolic';
            this._recordItem.label.text = _('Stop Recording');
            this._setRecordingIcon(true);  // Red pulsing effect

            this._showRecordingIndicator();
            this._showTextDisplay();
            
            // Icon turns red - no notification needed
            this._connectRealtimeWebSocket(provider, model);

        } catch (e) {
            Main.notify(_('Dictate'), _('Failed to start real-time: ' + e.message));
            this._isRecording = false;
        }
    }

    _getRealtimeEndpoint(provider) {
        // Determine WebSocket endpoint based on provider region
        if (provider.region === 'singapore' || provider.baseUrl?.includes('intl')) {
            return 'wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime';
        }
        return 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime';
    }

    _connectRealtimeWebSocket(provider, model) {
        const apiKey = provider.apiKey;
        if (!apiKey) {
            Main.notify(_('Dictate'), _('API key not configured for provider'));
            this._stopRecording();
            return;
        }

        const language = this._settings.get_string('language') || 'auto';
        
        const endpoint = this._getRealtimeEndpoint(provider);
        const modelId = model?.id || 'qwen3-asr-flash-realtime';
        const url = `${endpoint}?model=${modelId}`;
        const origin = endpoint.replace('wss://', 'https://');

        log(`[Dictate] Connecting to WebSocket: ${url}`);
        log(`[Dictate] Using origin: ${origin}`);
        log(`[Dictate] Region: ${provider.region || 'beijing'}`);

        try {
            const session = new Soup.Session();
            
            // Configure proxy if enabled
            if (provider.proxyEnabled && provider.proxyUrl) {
                log(`[Dictate] Using proxy: ${provider.proxyUrl}`);
                session.set_proxy_resolver(Gio.ProxyResolver.get_default());
            }
            
            const message = Soup.Message.new('GET', url);
            
            if (!message) {
                throw new Error('Failed to create Soup.Message');
            }
            
            message.requestHeaders.replace('Authorization', `bearer ${apiKey}`);
            message.requestHeaders.replace('OpenAI-Beta', 'realtime=v1');
            
            log(`[Dictate] Headers set - Authorization: bearer ${apiKey.substring(0, 10)}...`);

            session.websocket_connect_async(
                message,
                origin,
                null,
                GLib.PRIORITY_DEFAULT,
                null,
                (session, result) => {
                    try {
                        this._websocket = session.websocket_connect_finish(result);
                        if (!this._websocket) {
                            throw new Error('WebSocket connection returned null');
                        }
                        log(`[Dictate] WebSocket state: ${this._websocket.get_state()}`);
                        this._onWebSocketConnected(language, modelId);
                    } catch (e) {
                        log(`[Dictate] WebSocket connection failed: ${e.message}`);
                        log(`[Dictate] Response status: ${message.status_code}`);
                        log(`[Dictate] Response reason: ${message.reason_phrase}`);
                        if (message.response_headers) {
                            message.response_headers.foreach((name, value) => {
                                log(`[Dictate] Response header: ${name}: ${value}`);
                            });
                        }
                        try {
                            const responseBody = message.get_response_body();
                            if (responseBody) {
                                const bodyData = responseBody.get_data();
                                if (bodyData) {
                                    const bodyText = new TextDecoder().decode(bodyData);
                                    log(`[Dictate] Response body: ${bodyText}`);
                                }
                            }
                        } catch (bodyError) {
                            log(`[Dictate] Could not read response body: ${bodyError.message}`);
                        }
                        Main.notify(_('Dictate'), _('Real-time connection failed: ' + e.message));
                        this._stopRecording();
                    }
                }
            );
        } catch (e) {
            log(`[Dictate] Error setting up WebSocket: ${e.message}`);
            Main.notify(_('Dictate'), _('WebSocket setup failed: ' + e.message));
            this._stopRecording();
        }
    }

    testWebSocketConnection() {
        const provider = this._getSelectedProvider();
        const model = this._getSelectedModel(provider);
        
        if (!provider || !model) {
            return Promise.reject(new Error(_('Provider or model not configured')));
        }

        return new Promise((resolve, reject) => {
            const apiKey = provider.apiKey;
            if (!apiKey) {
                reject(new Error(_('API key not configured')));
                return;
            }

            const endpoint = this._getRealtimeEndpoint(provider);
            const url = `${endpoint}?model=${model.id}`;
            const origin = endpoint.replace('wss://', 'https://');

            log(`[Dictate] Testing WebSocket connection to: ${url}`);

            try {
                const session = new Soup.Session();
                const message = Soup.Message.new('GET', url);
                
                if (!message) {
                    reject(new Error('Failed to create Soup.Message'));
                    return;
                }
                
                message.requestHeaders.replace('Authorization', `bearer ${apiKey}`);
                message.requestHeaders.replace('OpenAI-Beta', 'realtime=v1');

                session.websocket_connect_async(
                    message,
                    origin,
                    null,
                    GLib.PRIORITY_DEFAULT,
                    null,
                    (session, result) => {
                        try {
                            const websocket = session.websocket_connect_finish(result);
                            if (!websocket) {
                                reject(new Error('WebSocket connection returned null'));
                                return;
                            }
                            
                            log(`[Dictate] Test connection successful, state: ${websocket.get_state()}`);
                            
                            // Close the test connection after a short delay
                            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                                if (websocket.get_state() === Soup.WebsocketState.OPEN) {
                                    websocket.close(1000, 'Test complete');
                                }
                                return GLib.SOURCE_REMOVE;
                            });
                            
                            resolve({
                                success: true,
                                endpoint: endpoint,
                                model: model.id,
                                state: websocket.get_state()
                            });
                        } catch (e) {
                            log(`[Dictate] Test connection failed: ${e.message}`);
                            reject(new Error(e.message));
                        }
                    }
                );
            } catch (e) {
                log(`[Dictate] Test setup failed: ${e.message}`);
                reject(new Error(e.message));
            }
        });
    }

    _onWebSocketConnected(language, model) {
        log('[Dictate] WebSocket connected');

        this._websocket.connect('message', (connection, type, message) => {
            if (type === Soup.WebsocketDataType.TEXT) {
                const data = JSON.parse(new TextDecoder().decode(message.get_data()));
                this._handleRealtimeMessage(data);
            }
        });

        this._websocket.connect('closed', () => {
            log('[Dictate] WebSocket closed');
            if (this._isRecording) {
                this._stopRecording();
            }
        });

        this._websocket.connect('error', (connection, error) => {
            log(`[Dictate] WebSocket error: ${error.message}`);
            Main.notify(_('Dictate'), _('Real-time error: ' + error.message));
        });

        // Build session update according to Alibaba documentation
        const sessionUpdate = {
            event_id: 'event_' + Date.now(),
            type: 'session.update',
            session: {
                modalities: ['text'],
                input_audio_format: 'pcm',
                input_audio_transcription: {
                    model: model,
                    language: language !== 'auto' ? language : null
                },
                turn_detection: {
                    type: 'server_vad',
                    threshold: 0.5,
                    silence_duration_ms: 400
                }
            }
        };

        // Remove null language if auto
        if (!sessionUpdate.session.input_audio_transcription.language) {
            delete sessionUpdate.session.input_audio_transcription.language;
        }

        this._websocket.send_text(JSON.stringify(sessionUpdate));
        log('[Dictate] Session update sent: ' + JSON.stringify(sessionUpdate));

        this._startAudioStreaming();
    }

    _startAudioStreaming() {
        const [fd, tempFile] = GLib.file_open_tmp('dictate-realtime-XXXXXX.pcm');
        GLib.close(fd);
        this._audioFile = tempFile;

        this._recordingProcess = Gio.Subprocess.new(
            [
                'ffmpeg', '-y', '-f', 'pulse', '-i', 'default',
                '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1',
                '-f', 's16le', 'pipe:1'
            ],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
        );

        this._audioStream = Gio.DataInputStream.new(
            this._recordingProcess.get_stdout_pipe()
        );

        this._readAudioChunks();
    }

    _readAudioChunks() {
        if (!this._isRecording || !this._websocket) return;

        this._recordingProcess.get_stdout_pipe().read_bytes_async(
            3200,
            GLib.PRIORITY_DEFAULT,
            null,
            (stream, result) => {
                try {
                    const bytes = stream.read_bytes_finish(result);
                    if (bytes && bytes.get_size() > 0) {
                        const base64Audio = GLib.base64_encode(bytes.get_data());
                        
                        const audioEvent = {
                            event_id: 'event_' + Date.now(),
                            type: 'input_audio_buffer.append',
                            audio: base64Audio
                        };

                        if (this._websocket && this._websocket.get_state() === Soup.WebsocketState.OPEN) {
                            this._websocket.send_text(JSON.stringify(audioEvent));
                        }

                        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                            this._readAudioChunks();
                            return GLib.SOURCE_REMOVE;
                        });
                    }
                } catch (e) {
                    log(`[Dictate] Error reading audio: ${e.message}`);
                }
            }
        );
    }

    _handleRealtimeMessage(data) {
        log(`[Dictate] Real-time message: ${data.type}`);

        switch (data.type) {
            case 'session.created':
                log(`[Dictate] Session created: ${data.session?.id}`);
                break;
                
            case 'input_audio_buffer.speech_started':
                log('[Dictate] Speech started');
                break;
                
            case 'input_audio_buffer.speech_stopped':
                log('[Dictate] Speech stopped');
                break;
                
            case 'conversation.item.input_audio_transcription.text':
                if (data.text) {
                    this._partialText = data.text;
                    this._updateTextDisplay();
                }
                break;
                
            case 'conversation.item.input_audio_transcription.completed':
                if (data.transcript) {
                    this._transcribedText += (this._transcribedText ? ' ' : '') + data.transcript;
                    this._partialText = '';
                    this._updateTextDisplay();
                    
                    this._typeText(data.transcript);
                }
                break;
                
            case 'error':
                log(`[Dictate] Real-time error: ${data.error?.message}`);
                Main.notify(_('Dictate'), _('Error: ' + (data.error?.message || 'Unknown error')));
                break;
        }
    }

    _showTextDisplay() {
        if (!this._textDisplay) {
            this._textDisplay = new St.Label({
                text: '',
                styleClass: 'dictate-text-display'
            });
            Main.uiGroup.add_child(this._textDisplay);
        }
        this._updateTextDisplay();
    }

    _updateTextDisplay() {
        if (!this._textDisplay) return;
        
        const displayText = this._transcribedText + (this._partialText ? ' ' + this._partialText : '');
        this._textDisplay.text = displayText || _('Listening...');
        
        const monitor = Main.layoutManager.primaryMonitor;
        this._textDisplay.set_position(
            monitor.x + Math.floor(monitor.width / 2 - this._textDisplay.width / 2),
            monitor.y + Math.floor(monitor.height * 0.2)
        );
    }

    _hideTextDisplay() {
        if (this._textDisplay) {
            this._textDisplay.destroy();
            this._textDisplay = null;
        }
    }

    _stopRecording() {
        log(`[Dictate] _stopRecording called, _isRecording=${this._isRecording}`);
        
        if (!this._isRecording) {
            log('[Dictate] Not recording, ignoring stop request');
            return;
        }

        // Always reset icon state, even if errors occur
        const resetIcon = () => {
            log('[Dictate] Resetting icon state');
            this._isRecording = false;
            this._icon.icon_name = 'audio-input-microphone-symbolic';
            this._recordItem.label.text = _('Start Recording');
            this._setRecordingIcon(false);
            this._hideRecordingIndicator();
            this._hideTextDisplay();
        };

        try {
            if (this._realtimeMode && this._websocket) {
                if (this._websocket.get_state() === Soup.WebsocketState.OPEN) {
                    const finishEvent = {
                        event_id: 'event_' + Date.now(),
                        type: 'session.finish'
                    };
                    this._websocket.send_text(JSON.stringify(finishEvent));
                    
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
                        if (this._websocket) {
                            this._websocket.close(1000, 'Recording stopped');
                            this._websocket = null;
                        }
                        return GLib.SOURCE_REMOVE;
                    });
                }
            }

            if (this._recordingProcess) {
                try {
                    this._recordingProcess.send_signal(15);
                    this._recordingProcess.wait(null);
                } catch (e) {
                    log(`[Dictate] Error stopping recording process: ${e.message}`);
                }
                this._recordingProcess = null;
            }

            // Reset icon state
            resetIcon();
            log('[Dictate] Icon reset complete');

            if (!this._realtimeMode) {
                log('[Dictate] Starting batch transcription');
                this._transcribeAudio();
            } else {
                const finalText = this._transcribedText + (this._partialText ? ' ' + this._partialText : '');
                if (finalText.trim()) {
                    const clipboard = St.Clipboard.get_default();
                    clipboard.set_text(St.ClipboardType.CLIPBOARD, finalText.trim());
                    // Show green flash for completion
                    this._showSuccessFeedback();
                }
                this._cleanupAudioFile();
            }

        } catch (e) {
            log(`[Dictate] Error in _stopRecording: ${e.message}`);
            Main.notify(_('Dictate'), _('Error: ' + e.message));
            // Ensure icon is reset even on error
            resetIcon();
        }
    }

    _cleanupAudioFile() {
        if (this._audioFile) {
            try {
                GLib.unlink(this._audioFile);
            } catch (e) {
                log(`[Dictate] Failed to cleanup audio file: ${e.message}`);
            }
            this._audioFile = null;
        }
    }

    async _transcribeAudio() {
        const provider = this._getSelectedProvider();
        
        if (!provider) {
            Main.notify(_('Dictate'), _('No provider configured'));
            return;
        }

        const apiKey = provider.apiKey;
        if (!apiKey) {
            Main.notify(_('Dictate'), _('API key not configured for provider'));
            return;
        }

        const model = this._getSelectedModel(provider);
        if (!model) {
            Main.notify(_('Dictate'), _('No model selected'));
            return;
        }

        try {
            let text;
            const isOpenAI = provider.id.includes('openai') || 
                            provider.baseUrl?.includes('openai.com');
            
            if (isOpenAI) {
                text = await this._transcribeOpenAI(apiKey, provider, model);
            } else {
                text = await this._transcribeAlibaba(apiKey, provider, model);
            }

            this._handleTranscriptionResult(text);
        } catch (e) {
            Main.notify(_('Dictate'), _('Transcription error: ' + e.message));
        } finally {
            this._cleanupAudioFile();
        }
    }

    _transcribeOpenAI(apiKey, provider, model) {
        return new Promise((resolve, reject) => {
            const language = this._settings.get_string('language');
            const baseUrl = provider.baseUrl || 'https://api.openai.com/v1';

            const args = [
                'curl', '-s', '-X', 'POST',
                `${baseUrl}/audio/transcriptions`,
                '-H', `Authorization: Bearer ${apiKey}`,
                '-F', `file=@${this._audioFile}`,
                '-F', `model=${model.id}`
            ];

            if (language && language !== 'auto') {
                args.push('-F', `language=${language}`);
            }

            if (provider.proxyEnabled && provider.proxyUrl) {
                args.push('--proxy', provider.proxyUrl);
            }

            const subprocess = Gio.Subprocess.new(
                args,
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );

            subprocess.communicate_utf8_async(null, null, (subprocess, result) => {
                let stdout;
                try {
                    const [, out, stderr] = subprocess.communicate_utf8_finish(result);
                    stdout = out;

                    if (!subprocess.get_successful()) {
                        reject(new Error(stderr || 'curl failed'));
                        return;
                    }

                    if (!stdout || stdout.trim() === '') {
                        reject(new Error('Empty response from API'));
                        return;
                    }

                    log(`[Dictate] OpenAI response: ${stdout.substring(0, 200)}`);

                    const response = JSON.parse(stdout);
                    if (response.error) {
                        reject(new Error(response.error.message));
                        return;
                    }

                    resolve(response.text || '');
                } catch (e) {
                    log(`[Dictate] OpenAI parse error: ${e.message}, stdout: ${stdout}`);
                    reject(e);
                }
            });
        });
    }

    _transcribeAlibaba(apiKey, provider, model) {
        return new Promise((resolve, reject) => {
            const language = this._settings.get_string('language');
            const baseUrl = provider.baseUrl || 'https://dashscope.aliyuncs.com/api/v1';

            const audioFile = Gio.File.new_for_path(this._audioFile);
            const [success, audioBytes] = audioFile.load_contents(null);
            if (!success) {
                reject(new Error('Failed to read audio file'));
                return;
            }

            const base64Audio = GLib.base64_encode(audioBytes);
            const dataUri = `data:audio/wav;base64,${base64Audio}`;

            // Use native DashScope API (non-compatible mode)
            const endpoint = `${baseUrl}/services/aigc/multimodal-generation/generation`;
            const requestBody = {
                model: model.id,
                input: {
                    messages: [
                        {
                            role: 'system',
                            content: [{ text: '' }]
                        },
                        {
                            role: 'user',
                            content: [{ audio: dataUri }]
                        }
                    ]
                },
                parameters: {
                    asr_options: {
                        enable_itn: false
                    }
                }
            };

            if (language && language !== 'auto') {
                const langMap = {
                    'zh': 'zh', 'en': 'en', 'ja': 'ja', 'ko': 'ko',
                    'it': 'it', 'de': 'de', 'fr': 'fr', 'es': 'es'
                };
                const lang = langMap[language] || language;
                requestBody.parameters.asr_options.language = lang;
            }

            const requestJson = JSON.stringify(requestBody);

            const [fd, tempFile] = GLib.file_open_tmp('dictate-request-XXXXXX.json');
            const tempFileObj = Gio.File.new_for_path(tempFile);
            const outputStream = tempFileObj.replace(null, false, Gio.FileCreateFlags.NONE, null);
            outputStream.write_all(requestJson, null);
            outputStream.close(null);
            GLib.close(fd);

            const args = [
                'curl', '-s', '-X', 'POST',
                endpoint,
                '-H', `Authorization: Bearer ${apiKey}`,
                '-H', 'Content-Type: application/json',
                '-d', `@${tempFile}`
            ];

            if (provider.proxyEnabled && provider.proxyUrl) {
                args.push('--proxy', provider.proxyUrl);
            }

            const subprocess = Gio.Subprocess.new(
                args,
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );

            subprocess.communicate_utf8_async(null, null, (subprocess, result) => {
                let stdout;
                try {
                    GLib.unlink(tempFile);
                } catch (e) {
                    log(`[Dictate] Failed to cleanup temp file: ${e.message}`);
                }

                try {
                    const [, out, stderr] = subprocess.communicate_utf8_finish(result);
                    stdout = out;

                    if (!subprocess.get_successful()) {
                        reject(new Error(stderr || 'curl failed'));
                        return;
                    }

                    if (!stdout || stdout.trim() === '') {
                        reject(new Error('Empty response from API'));
                        return;
                    }

                    log(`[Dictate] Alibaba response: ${stdout.substring(0, 200)}`);

                    const response = JSON.parse(stdout);
                    if (response.error) {
                        reject(new Error(response.error.message));
                        return;
                    }

                    if (response.output && response.output.choices && response.output.choices[0]) {
                        const choice = response.output.choices[0];
                        if (choice.message && choice.message.content && choice.message.content[0]) {
                            resolve(choice.message.content[0].text || '');
                            return;
                        }
                    }

                    resolve('');
                } catch (e) {
                    log(`[Dictate] Alibaba parse error: ${e.message}, stdout: ${stdout}`);
                    reject(e);
                }
            });
        });
    }

    _handleTranscriptionResult(text) {
        log(`[Dictate] _handleTranscriptionResult called with text length: ${text?.length || 0}`);
        
        if (!text || !text.trim()) {
            log('[Dictate] No text detected');
            Main.notify(_('Dictate'), _('No speech detected'));
            return;
        }

        const clipboard = St.Clipboard.get_default();
        clipboard.set_text(St.ClipboardType.CLIPBOARD, text);
        log('[Dictate] Text copied to clipboard');

        this._typeText(text);
        // Show green flash for completion
        this._showSuccessFeedback();
    }

    _typeText(text) {
        log(`[Dictate] _typeText called, text length: ${text?.length || 0}`);
        const typeTool = this._settings.get_string('type-tool') || 'auto';
        log(`[Dictate] Type tool: ${typeTool}`);

        if (typeTool === 'none') {
            log('[Dictate] Type tool is none, skipping');
            return;
        }

        // Use fast paste method: copy to clipboard and paste with Ctrl+V
        this._fastTypeText(text, typeTool);
    }

    _fastTypeText(text, typeTool) {
        log(`[Dictate] _fastTypeText called`);
        const ydotooldRunning = this._isYdotooldRunning();
        log(`[Dictate] ydotoold running: ${ydotooldRunning}`);

        const tools = typeTool === 'auto'
            ? ['ydotool', 'wtype', 'xdotool']
            : [typeTool];
        
        log(`[Dictate] Trying tools: ${tools.join(', ')}`);

        for (const tool of tools) {
            const toolPath = GLib.find_program_in_path(tool);
            if (!toolPath) continue;

            if (tool === 'ydotool' && !ydotooldRunning) {
                log('[Dictate] ydotoold daemon not running, skipping ydotool');
                continue;
            }

            if (tool === 'wtype' && this._isGnome()) {
                log('[Dictate] wtype not supported on GNOME, skipping');
                continue;
            }

            try {
                if (tool === 'wtype') {
                    // wtype doesn't support paste, use direct typing
                    GLib.spawn_command_line_async(`${toolPath} ${GLib.shell_quote(text)}`);
                } else if (tool === 'ydotool') {
                    // Use clipboard paste method for instant typing
                    this._pasteWithYdotool(text, toolPath);
                } else if (tool === 'xdotool') {
                    // Use paste method for xdotool (works well on X11)
                    this._pasteWithClipboard(text, toolPath, 'xdotool');
                }
                log(`[Dictate] Typed text using ${tool}`);
                return;
            } catch (e) {
                log(`[Dictate] Failed to type with ${tool}: ${e.message}`);
            }
        }

        log('[Dictate] No typing tool available, text copied to clipboard only');

        // Always notify that text is in clipboard (helpful for terminals)
        if (text && text.trim()) {
            Main.notify(_('Dictate'), _('Text copied to clipboard. Paste with Ctrl+V or Shift+Ctrl+V in terminals.'));
        }

        if (!ydotooldRunning && GLib.find_program_in_path('ydotool')) {
            Main.notify(_('Dictate'), _('To auto-type, run: ydotoold'));
        }
    }

    _pasteWithClipboard(text, toolPath, tool) {
        log(`[Dictate] _pasteWithClipboard called with tool: ${tool}`);
        // Use xclip/xsel for X11 clipboard, then paste with Ctrl+V
        this._copyToClipboard(text);
        
        // Small delay to ensure clipboard is set, then paste
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            try {
                if (tool === 'xdotool') {
                    // For xdotool, activate the active window first, then paste
                    // Try Ctrl+V first, then Shift+Ctrl+V for terminals
                    GLib.spawn_command_line_async(`${toolPath} key ctrl+v`);
                    
                    // Try Shift+Ctrl+V after a short delay (for terminals)
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
                        try {
                            GLib.spawn_command_line_async(`${toolPath} key shift+ctrl+v`);
                        } catch (e) {
                            // Ignore error
                        }
                        return GLib.SOURCE_REMOVE;
                    });
                } else {
                    // Simulate Ctrl+V with other tools
                    GLib.spawn_command_line_async(`${toolPath} key ctrl+v`);
                }
            } catch (e) {
                log(`[Dictate] Failed to paste with ${tool}: ${e.message}`);
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _pasteWithYdotool(text, toolPath) {
        log('[Dictate] _pasteWithYdotool called');
        // Copy to clipboard using wl-copy (Wayland) or xclip (X11), then paste with ydotool
        this._copyToClipboard(text);
        
        // Small delay to ensure clipboard is set, then paste with Ctrl+V
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            try {
                // Simulate Ctrl+V with ydotool (key codes: 29=Ctrl, 47=v)
                GLib.spawn_command_line_async(`${toolPath} key 29:1 47:1 47:0 29:0`);
                
                // Also try Shift+Ctrl+V for terminals (key codes: 42=Shift, 29=Ctrl, 47=v)
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
                    try {
                        GLib.spawn_command_line_async(`${toolPath} key 42:1 29:1 47:1 47:0 29:0 42:0`);
                    } catch (e) {
                        // Ignore error
                    }
                    return GLib.SOURCE_REMOVE;
                });
            } catch (e) {
                log(`[Dictate] Failed to paste with ydotool: ${e.message}`);
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _copyToClipboard(text) {
        try {
            // Try wl-copy first (Wayland)
            const wlCopy = GLib.find_program_in_path('wl-copy');
            if (wlCopy) {
                const proc = Gio.Subprocess.new(
                    ['wl-copy'],
                    Gio.SubprocessFlags.STDIN_PIPE
                );
                const stdin = proc.get_stdin_pipe();
                const bytes = GLib.Bytes.new(text);
                const stream = Gio.DataOutputStream.new(stdin);
                stream.write_bytes(bytes, null);
                stream.close(null);
                log('[Dictate] Copied to clipboard using wl-copy');
                return;
            }
            
            // Fallback to xclip (X11)
            const xclip = GLib.find_program_in_path('xclip');
            if (xclip) {
                const proc = Gio.Subprocess.new(
                    ['xclip', '-selection', 'clipboard', '-in'],
                    Gio.SubprocessFlags.STDIN_PIPE
                );
                const stdin = proc.get_stdin_pipe();
                const bytes = GLib.Bytes.new(text);
                const stream = Gio.DataOutputStream.new(stdin);
                stream.write_bytes(bytes, null);
                stream.close(null);
                log('[Dictate] Copied to clipboard using xclip');
                return;
            }
            
            // Fallback to xsel
            const xsel = GLib.find_program_in_path('xsel');
            if (xsel) {
                const proc = Gio.Subprocess.new(
                    ['xsel', '--clipboard', '--input'],
                    Gio.SubprocessFlags.STDIN_PIPE
                );
                const stdin = proc.get_stdin_pipe();
                const bytes = GLib.Bytes.new(text);
                const stream = Gio.DataOutputStream.new(stdin);
                stream.write_bytes(bytes, null);
                stream.close(null);
                log('[Dictate] Copied to clipboard using xsel');
                return;
            }
            
            log('[Dictate] No clipboard tool found (wl-copy, xclip, xsel)');
        } catch (e) {
            log(`[Dictate] Failed to copy to clipboard: ${e.message}`);
        }
    }

    _isYdotooldRunning() {
        try {
            const uid = this._getUid();
            const socketPath = `/run/user/${uid}/.ydotool_socket`;
            const socketFile = Gio.File.new_for_path(socketPath);
            const exists = socketFile.query_exists(null);
            log(`[Dictate] Checking ydotool socket at ${socketPath}: ${exists}`);
            return exists;
        } catch (e) {
            log(`[Dictate] Error checking ydotoold: ${e.message}`);
            return false;
        }
    }

    _getUid() {
        try {
            const [success, stdout] = GLib.spawn_command_line_sync('id -u');
            if (success) {
                return stdout.toString().trim();
            }
        } catch (e) {
            log(`[Dictate] Failed to get UID: ${e.message}`);
        }
        return '';
    }

    _isGnome() {
        const desktop = GLib.getenv('XDG_CURRENT_DESKTOP') || '';
        return desktop.toLowerCase().includes('gnome');
    }

    _showRecordingIndicator() {
        if (!this._recordingIndicator) {
            this._recordingIndicator = new St.Label({
                text: _(' Recording... '),
                styleClass: 'dictate-recording-indicator'
            });
            Main.uiGroup.add_child(this._recordingIndicator);
        }

        const monitor = Main.layoutManager.primaryMonitor;
        this._recordingIndicator.set_position(
            monitor.x + Math.floor(monitor.width / 2 - this._recordingIndicator.width / 2),
            monitor.y + Math.floor(monitor.height * 0.1)
        );
    }

    _hideRecordingIndicator() {
        if (this._recordingIndicator) {
            this._recordingIndicator.destroy();
            this._recordingIndicator = null;
        }
    }
}
