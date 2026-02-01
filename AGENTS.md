# Dictate - GNOME Shell Extension

## Project Overview

Dictate is a GNOME Shell extension that provides speech-to-text dictation using cloud-based transcription services. It supports both batch and real-time transcription modes via OpenAI Whisper and Alibaba Cloud (Qwen3-ASR) APIs.

**Key Features:**
- Speech-to-text transcription using OpenAI or Alibaba Cloud
- Batch mode: Record audio, then transcribe (default)
- Real-time mode: Stream audio via WebSocket while recording (Alibaba Cloud only)
- Global keyboard shortcut to toggle recording (default: Super+Alt+D)
- Auto-typing of transcribed text into active applications
- Panel indicator with recording status

## Technology Stack

- **Frontend (GNOME Extension)**: JavaScript (ES6 modules), GTK4/Adwaita UI
- **Backend Service**: Python 3 with D-Bus (optional)
- **Audio Recording**: ffmpeg via PulseAudio/PipeWire
- **HTTP/WebSocket**: libsoup (GNOME), curl (subprocess)
- **Text Input**: ydotool/wtype/xdotool + clipboard tools (wl-copy/xclip/xsel)
- **Settings**: GSettings (dconf)
- **Supported GNOME Shell**: 45, 46, 47, 48, 49

## Project Structure

```
.
├── extension.js          # Main extension code (~1400 lines)
├── prefs.js              # Preferences/settings UI (~1800 lines)
├── metadata.json         # Extension metadata (UUID, version, dependencies)
├── service/
│   └── dictate-service.py    # D-Bus service for recording/transcription (optional)
├── schemas/
│   ├── org.gnome.shell.extensions.dictate.gschema.xml  # GSettings schema
│   └── gschemas.compiled   # Compiled schema (generated)
├── CHANGES.md            # Changelog
└── AGENTS.md             # This file
```

## File Descriptions

### extension.js
Main extension class (`DictateExtension`) that:
- Creates panel menu button with indicator icon
- Handles keyboard shortcuts via `Main.wm.addKeybinding()`
- Manages recording state and UI (recording indicator with color feedback)
- Implements batch transcription via curl subprocess
- Implements real-time transcription via WebSocket (Soup.Session)
- Auto-types text using clipboard+paste method for instant input

### prefs.js
Preferences window (`DictatePreferences`) using Adw (Adwaita):
- Provider selection (OpenAI/Alibaba)
- API key configuration
- Model and language settings
- Proxy configuration
- Real-time mode toggle
- Typing tool selection

### service/dictate-service.py
Optional D-Bus service providing:
- `AudioRecorder` class using ffmpeg subprocess
- `TranscriptionService` class with OpenAI/Alibaba API clients
- `DictateService` D-Bus interface for remote control
- Signals: `TranscriptionComplete`, `TranscriptionError`

### schemas/org.gnome.shell.extensions.dictate.gschema.xml
GSettings schema defining configuration keys:
- `toggle-key`: Keyboard shortcut (default: `<Super><Alt>d`)
- `provider`: Cloud provider (`openai` or `alibaba`)
- `api-key`: API key for selected provider
- `model`: Model name (default: `whisper-1` for OpenAI)
- `language`: Language code (e.g., `en`, `zh`, `auto`)
- `realtime`: Enable real-time mode (boolean)
- `use-proxy`/`proxy-url`: Proxy configuration
- `alibaba-use-compatible`/`alibaba-endpoint`: Alibaba-specific settings
- `type-tool`: Typing tool preference (`auto`, `ydotool`, `wtype`, `xdotool`, `none`)

## Build and Installation

### Prerequisites

**Required system dependencies:**
```bash
# Audio recording (required)
sudo apt install ffmpeg

# HTTP client for API calls (required)
sudo apt install curl
```

**Typing tools (install at least one for auto-type):**
```bash
# Option 1: ydotool - Works on Wayland and X11 (recommended)
# Note: Requires ydotoold daemon running
sudo apt install ydotool

# Option 2: wtype - Wayland only (direct character typing)
sudo apt install wtype

# Option 3: xdotool - X11 only
sudo apt install xdotool
```

**Clipboard tools (required for instant typing):**
```bash
# For Wayland users (wl-copy from wl-clipboard package)
sudo apt install wl-clipboard

# For X11 users
sudo apt install xclip
# OR
sudo apt install xsel
```

**Optional Python dependencies (for D-Bus service):**
```bash
pip3 install requests dbus-python
```

**GNOME development tools:**
```bash
sudo apt install gnome-shell-extension-prefs
```

### Schema Compilation

After modifying schema XML, recompile:
```bash
glib-compile-schemas schemas/
```

### Installation for Development

```bash
# Create symlink to extensions directory
ln -s $(pwd) ~/.local/share/gnome-shell/extensions/dictate@opencode.local

# Restart GNOME Shell (Alt+F2, type 'r', press Enter on X11)
# Or logout/login on Wayland

# Enable extension
gnome-extensions enable dictate@opencode.local
```

### Reloading After Changes

```bash
# After modifying extension.js or prefs.js, restart GNOME Shell
# On X11: Alt+F2, type 'r', press Enter
# On Wayland: Log out and log back in

# After modifying schema:
glib-compile-schemas schemas/
gnome-extensions disable dictate@opencode.local
gnome-extensions enable dictate@opencode.local
```

## Code Style Guidelines

### JavaScript (GNOME Extension)

- Use ES6 modules with `import`/`export`
- Import GNOME libraries using `gi://` URIs:
  ```javascript
  import GObject from 'gi://GObject';
  import St from 'gi://St';
  import Gio from 'gi://Gio';
  ```
- Extension imports use resource URIs:
  ```javascript
  import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
  import * as Main from 'resource:///org/gnome/shell/ui/main.js';
  ```
- Class naming: PascalCase (e.g., `DictateExtension`)
- Private methods: prefix with `_` (e.g., `_startRecording()`)
- Use `log()` for debug output with `[Dictate]` prefix
- Always wrap user-visible strings with `_()` for i18n

### Python (D-Bus Service)

- Follow PEP 8
- Use type hints where appropriate
- Document classes and public methods with docstrings

## Architecture Details

### Extension Lifecycle

1. `enable()`: Initialize settings, create panel button, setup keybinding
2. `disable()`: Cleanup all resources, remove keybinding, stop recording

### Recording Modes

**Batch Mode:**
1. Start ffmpeg to record to temp WAV file (16kHz, mono, PCM s16le)
2. On stop, send file to API via curl subprocess
3. Parse JSON response, type the transcribed text

**Real-time Mode (Alibaba only):**
1. Connect to WebSocket endpoint (`wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime`)
2. Send session configuration with VAD settings
3. Stream audio chunks as base64-encoded PCM via WebSocket
4. Receive partial and final transcription events
5. Update on-screen text display in real-time

### Text Input

Transcribed text is inserted via clipboard+paste method for instantaneous input:

1. **Clipboard Copy**: Text is copied to system clipboard using:
   - `wl-copy` on Wayland
   - `xclip` or `xsel` on X11

2. **Paste Simulation**: Ctrl+V is simulated to paste instantly:
   - `ydotool`: Simulates keycodes `29:1 47:1 47:0 29:0` (Ctrl+V)
   - `xdotool`: Uses `key ctrl+v` command
   - `wtype`: Falls back to direct character typing (does not support key combinations)

3. **Tool Selection Priority** (when set to "auto"):
   - `ydotool` (if ydotoold is running)
   - `wtype` (Wayland only, skipped on GNOME due to compatibility)
   - `xdotool` (X11 fallback)

### Error Handling

- Display errors via `Main.notify(_('Dictate'), _('Error message'))`
- Log detailed errors with `log('[Dictate] Error: ' + error)`
- Always cleanup resources (processes, files, WebSocket) on error

## Testing

### Manual Testing Checklist

- [ ] Extension enables without errors
- [ ] Panel button appears with microphone icon
- [ ] Keybinding (Super+Alt+D) toggles recording
- [ ] Recording indicator displays while recording
- [ ] Batch transcription works with OpenAI
- [ ] Batch transcription works with Alibaba
- [ ] Real-time transcription works with Alibaba
- [ ] Transcribed text is typed into active window
- [ ] Text is copied to clipboard
- [ ] Preferences window opens and saves settings
- [ ] Extension disables cleanly without errors

### Testing Commands

```bash
# Check extension status
gnome-extensions list
gnome-extensions show dictate@opencode.local

# View extension logs
journalctl -f -o cat GNOME_SHELL_EXTENSION_UUID=dictate@opencode.local

# Test D-Bus service directly
python3 service/dictate-service.py

# Verify schema is compiled
gsettings list-recursively org.gnome.shell.extensions.dictate
```

## Security Considerations

1. **API Keys**: Stored in GSettings (dconf), accessible to user processes only
2. **Temporary Files**: Audio files created in `/tmp`, cleaned up after transcription
3. **Proxy Support**: HTTP/HTTPS proxy can be configured for API requests
4. **Network**: All API communication uses HTTPS/WSS
5. **Permissions**: Extension runs within GNOME Shell context (user privileges)

## Common Issues

1. **ydotool not working**: Ensure `ydotoold` daemon is running (`ydotoold &`)
2. **Text not being typed**: Install clipboard tools (`wl-clipboard` for Wayland, `xclip` for X11)
3. **No audio recorded**: Check ffmpeg is installed and PulseAudio/PipeWire is running
4. **API errors**: Verify API key is set correctly in preferences
5. **Real-time mode fails**: Only works with Alibaba Cloud provider
6. **Extension not loading**: Check GNOME Shell version compatibility in metadata.json
7. **Slow text input**: Ensure clipboard tools are installed for instant paste method

## Resources

- [GNOME Shell Extensions Documentation](https://gjs.guide/extensions/)
- [GJS Guide](https://gjs.guide/)
- [OpenAI Whisper API](https://platform.openai.com/docs/guides/speech-to-text)
- [Alibaba DashScope Documentation](https://www.alibabacloud.com/help/en/model-studio/developer-reference/)
