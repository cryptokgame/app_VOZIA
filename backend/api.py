import os
import sys
import json
import asyncio
import threading
import subprocess
import re
import math
import shutil
import time
from datetime import datetime
from pydub import AudioSegment
from pydub.silence import split_on_silence
import edge_tts
import webview

# Tkinter para el diálogo de archivos (más estable que pywebview en Qt/Windows)
try:
    import tkinter as tk
    from tkinter import filedialog
except ImportError:
    tk = None
    filedialog = None

# Importaciones de IA con manejo de errores para empaquetado seguro
try:
    import whisper
    import torch
except ImportError:
    whisper = None
    torch = None

# Configuración de FFmpeg para pydub
FFMPEG_PATH = r"C:\Users\Katherine\Downloads\ffmpeg-2026-03-12-git-9dc44b43b2-essentials_build\bin\ffmpeg.exe"
FFPROBE_PATH = r"C:\Users\Katherine\Downloads\ffmpeg-2026-03-12-git-9dc44b43b2-essentials_build\bin\ffprobe.exe"
AudioSegment.converter = FFMPEG_PATH
AudioSegment.ffprobe = FFPROBE_PATH

class Api:
    def __init__(self):
        self.cancel_event = threading.Event()
        self.data_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
        if not os.path.exists(self.data_dir):
            os.makedirs(self.data_dir)

    def change_data_dir(self):
        """Permite al usuario elegir una nueva carpeta de trabajo con tkinter."""
        print("Backend: Llamada a change_data_dir recibida.")
        try:
            if tk is None:
                return {"success": False, "error": "tkinter no disponible"}
            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            folder = filedialog.askdirectory(title="Selecciona la carpeta de trabajo")
            root.destroy()
            if not folder:
                return {"success": False, "error": "No se seleccionó ninguna carpeta."}
            self.data_dir = folder
            os.makedirs(self.data_dir, exist_ok=True)
            print(f"Backend: Nueva carpeta: {self.data_dir}")
            return {"success": True, "path": self.data_dir}
        except Exception as e:
            print(f"Backend: Error en change_data_dir: {e}")
            return {"success": False, "error": str(e)}

    def get_safe_filename(self, base_name, extension):
        """Genera un nombre de archivo limpio sin timestamps largos, usando sufijos incrementales."""
        # Limpiar caracteres especiales del nombre base
        clean_name = re.sub(r'[^\w\s-]', '', base_name).strip().replace(' ', '_')
        if not clean_name:
            clean_name = "audio"
        
        target_path = os.path.join(self.data_dir, f"{clean_name}.{extension}")
        
        # Si ya existe, añadir sufijo incremental
        counter = 1
        while os.path.exists(target_path):
            target_path = os.path.join(self.data_dir, f"{clean_name}_{counter}.{extension}")
            counter += 1
            
        return target_path

    def get_library(self):
        """Obtiene la lista de archivos en la carpeta data con metadatos."""
        files = []
        if not os.path.exists(self.data_dir):
            return []
            
        for f in os.listdir(self.data_dir):
            path = os.path.join(self.data_dir, f)
            if os.path.isfile(path):
                stats = os.stat(path)
                ext = f.split('.')[-1].lower()
                kind = ext if ext in ['wav', 'mp3', 'srt', 'txt'] else 'other'
                
                # Intentar obtener duración si es audio
                duration = 0
                if kind in ['wav', 'mp3']:
                    try:
                        audio = AudioSegment.from_file(path)
                        duration = len(audio) / 1000.0
                    except:
                        pass
                
                files.append({
                    "id": f,
                    "name": f,
                    "kind": kind,
                    "path": path,
                    "size": stats.st_size,
                    "date": datetime.fromtimestamp(stats.st_mtime).strftime('%Y-%m-%d %H:%M'),
                    "duration": f"{duration:.1f}s" if duration > 0 else "-"
                })
        
        # Ordenar por fecha (más nuevos arriba)
        files.sort(key=lambda x: os.path.getmtime(x['path']), reverse=True)
        return files

    async def _generate_tts(self, text, voice, output_path):
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(output_path)

    def create_audio(self, text, voice_id, filename=None):
        """Genera audio usando Edge-TTS."""
        try:
            # Mapeo de voces premium y multilenguaje (soporta ID corto y largo)
            voices = {
                "dalia": "es-MX-DaliaNeural",
                "jorge": "es-MX-JorgeNeural",
                "es-MX-DaliaNeural": "es-MX-DaliaNeural",
                "es-MX-JorgeNeural": "es-MX-JorgeNeural",
                "alvaro": "es-ES-AlvaroNeural",
                "es-ES-AlvaroNeural": "es-ES-AlvaroNeural",
                "elvira": "es-ES-ElviraNeural",
                "es-ES-ElviraNeural": "es-ES-ElviraNeural",
                "ava": "en-US-AvaMultilingualNeural",
                "en-US-AvaMultilingualNeural": "en-US-AvaMultilingualNeural",
                "andrew": "en-US-AndrewMultilingualNeural",
                "en-US-AndrewMultilingualNeural": "en-US-AndrewMultilingualNeural",
                "emma": "en-US-EmmaMultilingualNeural",
                "en-US-EmmaMultilingualNeural": "en-US-EmmaMultilingualNeural",
                "brian": "en-US-BrianNeural",
                "en-US-BrianNeural": "en-US-BrianNeural"
            }
            voice = voices.get(voice_id.lower(), voice_id)
            
            base_name = filename if filename else "locucion"
            output_path = self.get_safe_filename(base_name, "wav")
            
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(self._generate_tts(text, voice, output_path))
            loop.close()
            
            return {"success": True, "file": os.path.basename(output_path)}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def remove_silences(self, filename):
        """Elimina silencios del audio con parámetros agresivos."""
        try:
            input_path = os.path.join(self.data_dir, filename)
            audio = AudioSegment.from_file(input_path)
            
            # Parámetros optimizados según feedback previo
            chunks = split_on_silence(
                audio,
                min_silence_len=500,
                silence_thresh=-40,
                keep_silence=100
            )
            
            if not chunks:
                return {"success": False, "error": "No se detectaron partes sonoras."}
                
            combined = sum(chunks)
            output_path = self.get_safe_filename(filename.split('.')[0] + "_limpio", "wav")
            combined.export(output_path, format="wav")
            
            return {"success": True, "file": os.path.basename(output_path)}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def create_subtitles(self, filename, words_per_segment=5, clean_punctuation=True, whisper_model="base"):
        """Genera subtítulos SRT y TXT usando Whisper con segmentación personalizada."""
        if whisper is None:
            return {"success": False, "error": "Módulo Whisper no cargado. Verifica dependencias."}
            
        try:
            input_path = os.path.join(self.data_dir, filename)
            model_name = whisper_model if whisper_model in ["tiny", "base", "small", "medium", "large"] else "base"
            print(f"Backend: Cargando modelo Whisper '{model_name}'...")
            model = whisper.load_model(model_name)
            result = model.transcribe(input_path, word_timestamps=True)
            
            # Recopilar todas las palabras con sus tiempos
            words = []
            for segment in result["segments"]:
                for word in segment.get("words", []):
                    words.append(word)
            
            # Construir los segmentos (compartidos por SRT y TXT)
            segments = []
            for i in range(0, len(words), words_per_segment):
                chunk = words[i:i + words_per_segment]
                if not chunk:
                    continue
                
                start_time = chunk[0]["start"]
                end_time = chunk[-1]["end"]
                
                text_parts = [w["word"].strip() for w in chunk]
                text = " ".join(text_parts)
                
                if clean_punctuation:
                    text = re.sub(r'[.,!?]', '', text).lower()
                
                segments.append({
                    "text": text,
                    "start": start_time,
                    "end": end_time,
                })
            
            # 1. Generar SRT (con timestamps) — mismo nombre base que el audio
            base_name = os.path.splitext(filename)[0]  # e.g. "mi_audio" de "mi_audio.wav"
            srt_path = os.path.join(self.data_dir, base_name + ".srt")
            srt_content = ""
            for idx, seg in enumerate(segments, 1):
                start_str = self._format_timestamp(seg["start"])
                end_str = self._format_timestamp(seg["end"])
                srt_content += f"{idx}\n{start_str} --> {end_str}\n{seg['text']}\n\n"
            with open(srt_path, "w", encoding="utf-8") as f:
                f.write(srt_content)
            
            # 2. Generar TXT — copia EXACTA del .srt (mismo contenido, diferente extensión)
            txt_path = os.path.join(self.data_dir, base_name + ".txt")
            with open(txt_path, "w", encoding="utf-8") as f:
                f.write(srt_content)
            
            return {
                "success": True, 
                "srt": os.path.basename(srt_path),
                "txt": os.path.basename(txt_path)
            }
        except Exception as e:
            return {"success": False, "error": str(e)}


    def _format_timestamp(self, seconds):
        td = datetime.fromtimestamp(seconds) - datetime.fromtimestamp(0)
        total_seconds = int(td.total_seconds())
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        secs = total_seconds % 60
        millis = int(td.microseconds / 1000)
        return f"{hours:02}:{minutes:02}:{secs:02},{millis:03}"

    def open_folder(self):
        """Abre la carpeta de datos en el explorador de archivos."""
        try:
            if sys.platform == 'win32':
                os.startfile(self.data_dir)
            elif sys.platform == 'darwin':
                subprocess.Popen(['open', self.data_dir])
            else:
                subprocess.Popen(['xdg-open', self.data_dir])
        except Exception as e:
            print(f"Error abriendo carpeta: {e}")

    def import_file(self):
        """Permite al usuario seleccionar un archivo y lo importa a la carpeta data."""
        print("Backend: Llamada a import_file recibida.")
        try:
            # Usar tkinter para el diálogo de archivos (pywebview.create_file_dialog crashea en Qt)
            if tk is None:
                return {"success": False, "error": "tkinter no disponible"}
            
            root = tk.Tk()
            root.withdraw()  # Ocultar la ventana principal de tkinter
            root.attributes("-topmost", True)  # Asegurar que el diálogo quede al frente
            
            file_path = filedialog.askopenfilename(
                title="Seleccionar archivo de audio o subtitulos",
                filetypes=[
                    ("Archivos de audio", "*.wav *.mp3"),
                    ("Subtitulos", "*.srt *.txt"),
                    ("Todos los archivos", "*.*"),
                ]
            )
            root.destroy()

            if not file_path:
                return {"success": False, "error": "No se seleccionó ningún archivo."}

            filename = os.path.basename(file_path)
            destination = os.path.join(self.data_dir, filename)

            # Evitar sobreescribir si ya existe
            if os.path.exists(destination):
                ext = filename.rsplit(".", 1)[-1]
                base = filename.rsplit(".", 1)[0]
                destination = self.get_safe_filename(base, ext)

            shutil.copy2(file_path, destination)
            print(f"Backend: Archivo importado: {os.path.basename(destination)}")
            return {"success": True, "file": os.path.basename(destination)}
        except Exception as e:
            print(f"Backend: Error en import_file: {e}")
            return {"success": False, "error": str(e)}

    def delete_file(self, filename):
        """Elimina un archivo de la carpeta data."""
        try:
            path = os.path.join(self.data_dir, filename)
            if os.path.exists(path):
                os.remove(path)
                return {"success": True}
            return {"success": False, "error": "Archivo no encontrado."}
        except Exception as e:
            return {"success": False, "error": str(e)}
