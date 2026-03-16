import os
import webview
from api import Api

def main():
    api = Api()
    
    # Determinar si estamos en modo desarrollo o empaquetado/build
    current_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(current_dir)
    frontend_dist = os.path.join(project_root, "frontend", "dist", "index.html")
    
    if os.path.exists(frontend_dist):
        url = frontend_dist
        print(f"Cargando frontend desde: {url}")
    else:
        # En desarrollo usaremos el puerto 5173 de Vite
        url = "http://localhost:5173"
        print("Frontend dist no encontrado. Asegúrate de haber ejecutado 'npm run build' o tener Vite corriendo en localhost:5173")

    window = webview.create_window(
        'VOZIA - Estudio de Voz IA (Reborn)',
        url,
        js_api=api,
        width=1280,
        height=850,
        background_color='#020617',
        min_size=(1000, 700)
    )
    
    # Iniciar pywebview. Forzamos 'qt' (PySide6) para evitar el error de pythonnet/winforms.
    webview.start(gui='qt', debug=False)

if __name__ == '__main__':
    main()
