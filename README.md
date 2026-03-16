# VOZIA AI - Audio & Subtitles Studio

VOZIA es una potente aplicación de escritorio diseñada para agilizar la creación de contenido audiovisual de cualquier tipo. Combina la síntesis de voz de alta calidad con la transcripción inteligente para ofrecer un flujo de trabajo rápido, profesional y versátil.

## 📸 Vista Previa

![Librería de Archivos](screenshots/library.png)
*Gestión centralizada de audios y subtítulos.*

![Conversión Texto a Voz](screenshots/tts.png)
*Generación de voces premium con Edge-TTS.*

![Generación de Subtítulos](screenshots/subtitles.png)
*Transcripción inteligente con Whisper (Base/Medium).*

## 🚀 Características Principales

- **TTS Premium (Edge-TTS)**: Genera locuciones naturales con voces premium de Microsoft.
- **Transcripción con Whisper**: Crea subtítulos precisos de forma local usando modelos `base` o `medium` de OpenAI Whisper.
- **Gestión de Silencios**: Herramienta automática para eliminar silencios de archivos de audio.
- **Formatos Profesionales**: Generación simultánea de archivos `.srt` y `.txt` (copias exactas con timestamps).
- **Interfaz Moderna**: Diseño premium con soporte para modo oscuro, optimizado para productividad.
- **Procesamiento Local**: Máxima privacidad; tus audios no salen de tu computadora.

## 🛠️ Requisitos

- Python 3.10+
- FFmpeg (instalado y configurado en el PATH)
- Node.js (solo si deseas modificar el frontend)

## 📦 Instalación

1.  **Clonar el repositorio**:
    ```bash
    git clone https://github.com/TU_USUARIO/app_VOZIA.git
    cd app_VOZIA
    ```

2.  **Crear entorno virtual**:
    ```bash
    python -m venv venv
    venv\Scripts\activate
    ```

3.  **Instalar dependencias**:
    ```bash
    pip install -r requirements.txt
    ```

## 📂 Estructura del Proyecto

- `backend/`: Lógica del servidor Python y APIs de IA.
- `frontend/`: Aplicación React (Vite + TailwindCSS).
- `data/`: Carpeta local para audios y subtítulos generados.
- `venv/`: Entorno virtual de Python (no incluido en el repo).

## 🏃 Cómo ejecutar

Simplemente ejecuta el archivo `.bat` o usa el comando:
```bash
python backend/main.py
```

---
*Desarrollado para agilizar y profesionalizar la creación de contenido digital.*
