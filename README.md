# Dictate - GNOME Shell Voice Dictation Extension

A GNOME Shell extension that provides speech-to-text dictation using cloud-based transcription services. Supports both OpenAI Whisper and Alibaba Cloud (Qwen3-ASR) APIs.

![GNOME Version](https://img.shields.io/badge/GNOME-45%2B-blue)
![License](https://img.shields.io/badge/License-GPL--3.0-green)

## Features

- 🎙️ **Voice Dictation** - Convert speech to text instantly
- 🌐 **Multiple Providers** - OpenAI Whisper and Alibaba Cloud support
- ⚡ **Real-time Mode** - Stream transcription while speaking (Alibaba only)
- 📋 **Batch Mode** - Record then transcribe (both providers)
- 🎯 **Global Hotkey** - Toggle recording with Super+Alt+D (customizable)
- 🚀 **Instant Typing** - Uses clipboard+paste for lightning-fast text input
- 🎨 **Visual Feedback** - Icon changes color during recording (red) and completion (green)

## Installation

### Prerequisites

**Required:**
```bash
# Audio recording
sudo apt install ffmpeg

# HTTP client
sudo apt install curl

# Clipboard tools (for instant typing)
# For Wayland:
sudo apt install wl-clipboard
# For X11:
sudo apt install xclip
```

**Typing Tools (at least one for auto-type):**
```bash
# Recommended: ydotool (Wayland & X11, requires daemon)
sudo apt install ydotool
# Then start the daemon:
ydotoold &

# Alternative: wtype (Wayland only)
sudo apt install wtype

# Alternative: xdotool (X11 only)
sudo apt install xdotool
```

### Install Extension

```bash
# Clone the repository
git clone https://github.com/ragoneg/gnome-dictate.git

# Create symlink to GNOME extensions directory
ln -s $(pwd)/gnome-dictate ~/.local/share/gnome-shell/extensions/dictate@opencode.local

# Compile GSettings schema
cd gnome-dictate
glib-compile-schemas schemas/

# Enable extension
gnome-extensions enable dictate@opencode.local
```

**Note:** On Wayland, you need to log out and log back in. On X11, press Alt+F2, type `r`, and press Enter.

## Configuration

1. Open **Settings** → **Dictate**
2. Select your **Provider** (OpenAI or Alibaba Cloud)
3. Enter your **API Key**
4. Select a **Model**:
   - OpenAI: whisper-1, gpt-4o-transcribe, gpt-4o-mini-transcribe
   - Alibaba: qwen3-asr-flash, qwen3-asr-flash-realtime
5. Choose **Language** (or leave as "auto" for automatic detection)
6. Enable **Real-time Mode** if supported by your model

### Keyboard Shortcut

Default: `Super+Alt+D` (customizable in Settings)

## Usage

1. Place your cursor where you want the text
2. Press `Super+Alt+D` to start recording
3. The microphone icon turns **red** 🔴
4. Speak clearly
5. Press `Super+Alt+D` again to stop
6. The icon flashes **green** ✅ and text appears instantly

### Terminal Support

When using terminals (GNOME Terminal, Quake, etc.), the extension automatically tries both:
- `Ctrl+V` (standard paste)
- `Shift+Ctrl+V` (terminal paste)

If auto-type doesn't work in a specific application, the text is always copied to your clipboard for manual pasting.

## Troubleshooting

### Text not being typed automatically
- **Wayland**: Make sure `wl-clipboard` is installed and `ydotoold` is running
- **X11**: Make sure `xclip` is installed
- Check that you have at least one typing tool installed (ydotool, xdotool, or wtype)

### Microphone icon stays red
- Check `ydotoold` is running: `ydotoold &`
- Check API key is configured correctly
- Check model supports the selected mode (real-time vs batch)

### No audio recorded
- Verify `ffmpeg` is installed
- Check PulseAudio or PipeWire is running
- Check microphone permissions

### View logs
```bash
journalctl -f -o cat GNOME_SHELL_EXTENSION_UUID=dictate@opencode.local
```

## API Providers

### OpenAI
- **Models**: whisper-1, gpt-4o-transcribe, gpt-4o-mini-transcribe
- **Website**: https://platform.openai.com
- **Pricing**: Pay-per-use

### Alibaba Cloud (DashScope)
- **Models**: qwen3-asr-flash, qwen3-asr-flash-realtime, paraformer-realtime-v2
- **Website**: https://www.alibabacloud.com/help/en/model-studio/developer-reference/
- **Regions**: Beijing (China) or Singapore (International)
- **Pricing**: Pay-per-use

## Technical Details

### Architecture
- **Frontend**: JavaScript (GJS) using GTK4/Adwaita
- **Audio**: ffmpeg via PulseAudio/PipeWire
- **HTTP**: curl subprocess for API calls
- **WebSocket**: libsoup for real-time streaming
- **Text Input**: clipboard+paste method for instant typing

### File Structure
```
.
├── extension.js      # Main extension logic
├── prefs.js          # Settings UI
├── metadata.json     # Extension metadata
├── service/          # Optional D-Bus service
├── schemas/          # GSettings schema
└── README.md         # This file
```

## Development

### Schema Changes
After modifying `schemas/org.gnome.shell.extensions.dictate.gschema.xml`:
```bash
glib-compile-schemas schemas/
```

### Reload Extension
```bash
gnome-extensions disable dictate@opencode.local
gnome-extensions enable dictate@opencode.local
```

## License

GPL-3.0 - See LICENSE file for details

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## Acknowledgments

- OpenAI for Whisper API
- Alibaba Cloud for DashScope/Qwen3-ASR
- GNOME Shell extension community
