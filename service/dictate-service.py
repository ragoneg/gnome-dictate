#!/usr/bin/env python3
"""
Dictate D-Bus Service
Handles audio recording and transcription via cloud providers.
Supports OpenAI Whisper and Alibaba Qwen3-ASR models.
"""

import os
import sys
import json
import time
import base64
import tempfile
import subprocess
import threading
import dbus
import dbus.service
from dbus.mainloop.glib import DBusGMainLoop
from gi.repository import GLib
import requests

DBusGMainLoop(set_as_default=True)

BUS_NAME = "org.gnome.Shell.Extensions.Dictate"
BUS_PATH = "/org/gnome/Shell/Extensions/Dictate"
BUS_INTERFACE = "org.gnome.Shell.Extensions.Dictate"

SETTINGS_SCHEMA = "org.gnome.shell.extensions.dictate"


class AudioRecorder:
    def __init__(self):
        self.process = None
        self.output_file = None
        self.is_recording = False

    def start(self):
        if self.is_recording:
            return False

        self.output_file = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name

        self.process = subprocess.Popen(
            [
                "ffmpeg",
                "-y",
                "-f",
                "pulse",
                "-i",
                "default",
                "-acodec",
                "pcm_s16le",
                "-ar",
                "16000",
                "-ac",
                "1",
                self.output_file,
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        self.is_recording = True
        return True

    def stop(self):
        if not self.is_recording or not self.process:
            return None

        self.process.terminate()
        self.process.wait(timeout=5)
        self.is_recording = False

        return self.output_file


class TranscriptionService:
    def __init__(self):
        self.settings = self._load_settings()

    def _load_settings(self):
        try:
            result = subprocess.run(
                ["gsettings", "--schema", SETTINGS_SCHEMA, "list-recursively"],
                capture_output=True,
                text=True,
            )
            settings = {}
            for line in result.stdout.strip().split("\n"):
                parts = line.split(maxsplit=2)
                if len(parts) >= 3:
                    key = parts[1]
                    value = parts[2]
                    settings[key] = value.strip("'\"")
            return settings
        except Exception as e:
            print(f"Failed to load settings: {e}")
            return {}

    def _get_proxy(self):
        if self.settings.get("use-proxy") == "true":
            proxy_url = self.settings.get("proxy-url", "")
            if proxy_url:
                return {"http": proxy_url, "https": proxy_url}
        return None

    def transcribe(self, audio_file):
        provider = self.settings.get("provider", "openai")

        if provider == "openai":
            return self._transcribe_openai(audio_file)
        elif provider == "alibaba":
            return self._transcribe_alibaba(audio_file)
        else:
            raise ValueError(f"Unknown provider: {provider}")

    def _transcribe_openai(self, audio_file):
        api_key = self.settings.get("api-key", "")
        if not api_key:
            raise ValueError("OpenAI API key not configured")

        model = self.settings.get("model", "whisper-1")
        language = self.settings.get("language", "auto")

        url = "https://api.openai.com/v1/audio/transcriptions"

        headers = {"Authorization": f"Bearer {api_key}"}

        data = {"model": model}

        if language and language != "auto":
            data["language"] = language

        proxies = self._get_proxy()

        with open(audio_file, "rb") as f:
            files = {"file": ("audio.wav", f, "audio/wav")}
            response = requests.post(
                url, headers=headers, data=data, files=files, proxies=proxies
            )

        if response.status_code == 200:
            return response.json().get("text", "")
        else:
            raise Exception(
                f"OpenAI API error: {response.status_code} - {response.text}"
            )

    def _transcribe_alibaba(self, audio_file):
        api_key = self.settings.get("api-key", "")
        if not api_key:
            raise ValueError("Alibaba API key not configured")

        model = self.settings.get("model", "qwen3-asr-flash")
        language = self.settings.get("language", "auto")

        if "filetrans" in model.lower():
            return self._transcribe_alibaba_filetrans(
                audio_file, api_key, model, language
            )
        else:
            return self._transcribe_alibaba_flash(audio_file, api_key, model, language)

    def _transcribe_alibaba_flash(self, audio_file, api_key, model, language):
        """
        Use Qwen3-ASR-Flash for short audio files (up to 5 minutes).
        Supports direct file upload via base64 encoding.
        Uses Beijing endpoint for China region API keys.
        """
        url = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        with open(audio_file, "rb") as f:
            audio_bytes = f.read()
            audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")

        audio_data_uri = f"data:audio/wav;base64,{audio_base64}"

        messages = [
            {"role": "system", "content": [{"text": ""}]},
            {"role": "user", "content": [{"audio": audio_data_uri}]},
        ]

        payload = {
            "model": model,
            "input": {"messages": messages},
            "parameters": {"asr_options": {"enable_itn": False}},
        }

        if language and language != "auto":
            payload["parameters"]["asr_options"]["language"] = language

        proxies = self._get_proxy()

        response = requests.post(url, headers=headers, json=payload, proxies=proxies)

        if response.status_code == 200:
            result = response.json()
            output = result.get("output", {})
            choices = output.get("choices", [])
            if choices:
                message = choices[0].get("message", {})
                content = message.get("content", [])
                if content:
                    return content[0].get("text", "")
            return ""
        else:
            raise Exception(
                f"Alibaba API error: {response.status_code} - {response.text}"
            )

    def _transcribe_alibaba_filetrans(self, audio_file, api_key, model, language):
        """
        Use Qwen3-ASR-Flash-FileTrans for async transcription.
        Note: This requires uploading the file to a public URL first.
        For local files, we use qwen3-asr-flash instead.
        """
        raise Exception(
            "qwen3-asr-flash-filetrans requires a public URL. "
            "Please use qwen3-asr-flash for local files, or upload your audio to a public URL."
        )


class DictateService(dbus.service.Object):
    def __init__(self):
        bus_name = dbus.service.BusName(BUS_NAME, bus=dbus.SessionBus())
        dbus.service.Object.__init__(self, bus_name, BUS_PATH)

        self.recorder = AudioRecorder()
        self.transcription = TranscriptionService()
        self._recording_thread = None

    @dbus.service.method(BUS_INTERFACE, in_signature="", out_signature="b")
    def StartRecording(self):
        try:
            return self.recorder.start()
        except Exception as e:
            print(f"Failed to start recording: {e}")
            return False

    @dbus.service.method(BUS_INTERFACE, in_signature="", out_signature="b")
    def StopRecording(self):
        try:
            audio_file = self.recorder.stop()
            if audio_file:
                self._recording_thread = threading.Thread(
                    target=self._process_transcription, args=(audio_file,)
                )
                self._recording_thread.start()
                return True
            return False
        except Exception as e:
            print(f"Failed to stop recording: {e}")
            return False

    @dbus.service.method(
        BUS_INTERFACE,
        in_signature="",
        out_signature="b",
        async_callbacks=("success", "error"),
    )
    def StartRecordingRemote(self, success, error):
        try:
            result = self.recorder.start()
            success(result)
        except Exception as e:
            error(dbus.DBusException(str(e)))

    @dbus.service.method(
        BUS_INTERFACE,
        in_signature="",
        out_signature="b",
        async_callbacks=("success", "error"),
    )
    def StopRecordingRemote(self, success, error):
        try:
            audio_file = self.recorder.stop()
            if audio_file:
                self._recording_thread = threading.Thread(
                    target=self._process_transcription, args=(audio_file,)
                )
                self._recording_thread.start()
                success(True)
            else:
                success(False)
        except Exception as e:
            error(dbus.DBusException(str(e)))

    def _process_transcription(self, audio_file):
        try:
            text = self.transcription.transcribe(audio_file)
            self.TranscriptionComplete(text)
        except Exception as e:
            print(f"Transcription error: {e}")
            self.TranscriptionError(str(e))
        finally:
            try:
                os.unlink(audio_file)
            except:
                pass

    @dbus.service.signal(BUS_INTERFACE, signature="s")
    def TranscriptionComplete(self, text):
        pass

    @dbus.service.signal(BUS_INTERFACE, signature="s")
    def TranscriptionError(self, error):
        pass

    @dbus.service.method(BUS_INTERFACE, in_signature="", out_signature="s")
    def GetServiceStatus(self):
        return json.dumps({"recording": self.recorder.is_recording, "version": "1.0.0"})


def main():
    service = DictateService()
    loop = GLib.MainLoop()
    print("Dictate D-Bus service started")
    loop.run()


if __name__ == "__main__":
    main()
