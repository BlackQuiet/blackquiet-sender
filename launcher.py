import subprocess
import webbrowser
import sys
import time
import os

# Récupérer le port passé en argument, sinon défaut à 5000
PORT = sys.argv[1] if len(sys.argv) > 1 else "5000"

# Détecter le chemin complet du script actuel
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))

# Chemin vers le python de l'environnement virtuel
PYTHON_PATH = os.path.join(CURRENT_DIR, "venv", "Scripts", "python.exe")
SERVER_PATH = os.path.join(CURRENT_DIR, "server.py")

# Lancer server.py en arrière-plan (sans fenêtre console)
subprocess.Popen(
    [PYTHON_PATH, SERVER_PATH, PORT],
    creationflags=subprocess.CREATE_NO_WINDOW,
    cwd=CURRENT_DIR
)

# Petite pause pour laisser le serveur démarrer
time.sleep(2)

# Ouvrir le navigateur automatiquement sur l'URL locale
webbrowser.open(f"http://127.0.0.1:{PORT}")
