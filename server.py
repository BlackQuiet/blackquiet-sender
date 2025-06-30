from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import smtplib
from email.message import EmailMessage
import socks
import socket
import mimetypes
import sys
from datetime import datetime

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# Stockage en mémoire de l'historique des emails envoyés
email_history = []

# Route pour l'interface HTML
@app.route('/')
def root():
    return send_from_directory('.', 'index.html')

# Route pour les fichiers statiques
@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)

# Test de connexion SMTP
@app.route('/test_smtp', methods=['POST'])
def test_smtp():
    data = request.get_json()
    host = data.get('host')
    port = int(data.get('port', 587))
    user = data.get('user')
    password = data.get('pass')

    try:
        server = smtplib.SMTP(host, port, timeout=10)
        server.ehlo()
        if port == 587:
            server.starttls()
            server.ehlo()
        server.login(user, password)
        server.quit()
        return jsonify(success=True)
    except Exception as e:
        return jsonify(success=False, error=str(e))


# Envoi d'email sécurisé avec proxy support et enregistrement historique
@app.route('/send_email', methods=['POST'])
def send_email():
    try:
        # Lecture des paramètres SMTP
        smtp_host = request.form['smtp_host']
        smtp_port = int(request.form['smtp_port'])
        smtp_user = request.form['smtp_user']
        smtp_pass = request.form['smtp_pass']

        from_name = request.form.get('from_name', '')
        from_email = request.form.get('from_email', smtp_user)
        to_email = request.form['to']
        subject = request.form.get('subject', '')
        body = request.form.get('body', '')
        reply_to = request.form.get('replyTo', '')
        cc = request.form.get('cc', '')
        bcc = request.form.get('bcc', '')

        # Lecture des paramètres proxy
        proxy_mode = request.form.get('proxyMode', 'none')
        proxy_type = socks.SOCKS5
        proxy_host = request.form.get('proxyHost')
        proxy_port = request.form.get('proxyPort')
        proxy_user = request.form.get('proxyUser')
        proxy_pass = request.form.get('proxyPass')

        # Création du message
        msg = EmailMessage()
        msg['From'] = f"{from_name} <{from_email}>" if from_name else from_email
        msg['To'] = to_email
        if cc:
            msg['Cc'] = cc
        if bcc:
            msg['Bcc'] = bcc
        msg['Subject'] = subject
        if reply_to:
            msg['Reply-To'] = reply_to

        msg.set_content(body, subtype='html')

        # Suppression des headers sensibles
        for h in ['X-Originating-IP', 'X-Client-IP', 'X-Forwarded-For',
                  'X-Mailer', 'User-Agent', 'Received', 'Message-ID']:
            if h in msg:
                del msg[h]

        msg['Message-ID'] = "<secured@anonymous.local>"
        msg['X-Security-Note'] = "Sent via SecureMailer Gateway"

        # Pièces jointes
        for key in request.files:
            file = request.files[key]
            content = file.read()
            mime_type, _ = mimetypes.guess_type(file.filename)
            if mime_type:
                maintype, subtype = mime_type.split('/')
            else:
                maintype, subtype = 'application', 'octet-stream'
            msg.add_attachment(content, maintype=maintype, subtype=subtype, filename=file.filename)

        # Configuration proxy si nécessaire
        if proxy_mode == 'tor':
            socks.set_default_proxy(socks.SOCKS5, "127.0.0.1", 9050)
            socket.socket = socks.socksocket
        elif proxy_mode == 'custom' and proxy_host and proxy_port:
            if proxy_user and proxy_pass:
                socks.set_default_proxy(proxy_type, proxy_host, int(proxy_port), username=proxy_user, password=proxy_pass)
            else:
                socks.set_default_proxy(proxy_type, proxy_host, int(proxy_port))
            socket.socket = socks.socksocket

                # Connexion SMTP et envoi
        server = smtplib.SMTP(smtp_host, smtp_port, timeout=20)
        server.ehlo()
        if smtp_port == 587:
            server.starttls()
            server.ehlo()
        server.login(smtp_user, smtp_pass)

        # Définir Return-Path = reply_to (si fourni) ou smtp_user
        envelope_from = reply_to if reply_to else smtp_user

        # Gérer les destinataires
        recipients = [to_email]
        if cc:
            recipients += [email.strip() for email in cc.split(",") if email.strip()]
        if bcc:
            recipients += [email.strip() for email in bcc.split(",") if email.strip()]

        # Envoi avec Return-Path personnalisé
        server.sendmail(envelope_from, recipients, msg.as_string())
        server.quit()



        # Enregistrement historique - succès (bien indenté dans try)
        email_history.append({
            "email": to_email,
            "status": "Envoyé",
            "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "error": "",
            "delivered": True
        })

        return jsonify(success=True)

    except Exception as e:
        # Enregistrement historique - erreur
        to_email = request.form.get('to', 'unknown')
        email_history.append({
            "email": to_email,
            "status": "Échec",
            "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "error": str(e),
            "delivered": False
        })
        return jsonify(success=False, error=str(e))


# API REST pour gérer l'historique des emails envoyés
@app.route('/api/email-history', methods=['GET'])
def get_email_history():
    return jsonify(email_history)

@app.route('/api/email-history', methods=['POST'])
def add_email_history():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Aucune donnée reçue"}), 400

    required_fields = {"email", "status", "date"}
    if not required_fields.issubset(data.keys()):
        return jsonify({"error": "Champs requis manquants"}), 400

    email_history.append({
        "email": data.get("email"),
        "status": data.get("status"),
        "date": data.get("date"),
        "error": data.get("error", ""),
        "opens": data.get("opens", 0),
        "clicks": data.get("clicks", 0)
    })
    return jsonify({"message": "Historique ajouté"}), 201


# Lancement du serveur
@app.route('/api/reset-history', methods=['POST'])
def reset_history():
    try:
        global email_history
        email_history.clear()  # vide la liste en mémoire
        return jsonify(success=True)
    except Exception as e:
        return jsonify(success=False, error=str(e)), 500

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
    app.run(host='0.0.0.0', port=port, debug=True)
