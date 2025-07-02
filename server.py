from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import smtplib
from email.message import EmailMessage
import socks
import socket
import mimetypes
import sys
import random
import string
from datetime import datetime, timedelta
from flask import request
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)
# === Liste des proxies ===
PROXIES = []
@app.route("/save_proxies", methods=["POST"])
def save_proxies():
    global PROXIES
    data = request.get_json()
    proxies = data.get("proxies", [])
    # Vérification basique
    PROXIES = [p for p in proxies if p.get("type") and p.get("host") and isinstance(p.get("port"), int)]
    return jsonify({"success": True})

@app.route("/test_proxy", methods=["POST"])
def test_proxy():
    data = request.json
    proxy_type = data.get("type")
    host = data.get("host")
    port = data.get("port")

    if not proxy_type or not host or not port:
        return jsonify(success=False, error="Paramètres manquants"), 400

    # Définir le type proxy SOCKS ou HTTP
    proxy_types_map = {
        "socks5": socks.SOCKS5,
        "socks4": socks.SOCKS4,
        "http": socks.HTTP
    }
    p_type = proxy_types_map.get(proxy_type.lower(), socks.SOCKS5)

    try:
        socks.set_default_proxy(p_type, host, int(port))
        socks.wrapmodule(smtplib)

        # Test connexion SMTP simple (exemple google SMTP, à adapter)
        server = smtplib.SMTP("smtp.gmail.com", 587, timeout=10)
        server.starttls()
        server.quit()

        return jsonify(success=True)

    except Exception as e:
        return jsonify(success=False, error=str(e))


# === Fonction pour envoyer un email via un proxy rotatif ===
def send_email_with_rotating_proxy(smtp_host, smtp_port, smtp_user, smtp_pass,
                                   to_email, subject="Test Proxy Rotation", body="Message de test."):
    random.shuffle(PROXIES)  # Mélange les proxies à chaque appel

    for proxy in PROXIES:
        try:
            print(f"🔁 Tentative avec proxy {proxy['host']}:{proxy['port']} ({proxy['type']})")

            # Déterminer le type de proxy
            proxy_type = {
                "socks5": socks.SOCKS5,
                "socks4": socks.SOCKS4,
                "http": socks.HTTP
            }.get(proxy["type"].lower(), socks.SOCKS5)

            # Appliquer globalement le proxy
            socks.set_default_proxy(proxy_type, proxy["host"], proxy["port"])
            socks.wrapmodule(smtplib)

            # Construire le message email
            msg = MIMEMultipart()
            msg["From"] = smtp_user
            msg["To"] = to_email
            msg["Subject"] = subject
            msg.attach(MIMEText(body, "plain"))

            # Connexion et envoi
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=20)
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)
            server.quit()

            print(f"✅ Email envoyé via proxy {proxy['host']}:{proxy['port']}")
            return True

        except Exception as e:
            print(f"❌ Échec avec proxy {proxy['host']}:{proxy['port']} : {e}")

    print("❌ Tous les proxies ont échoué.")
    return False

# === Endpoint Flask pour appeler l'envoi via proxy ===
@app.route("/send_proxy_email", methods=["POST"])
def send_proxy_email():
    data = request.json

    required_fields = ["host", "port", "user", "pass", "to"]
    for field in required_fields:
        if field not in data:
            return jsonify({"success": False, "error": f"Champ manquant : {field}"}), 400

    success = send_email_with_rotating_proxy(
        smtp_host=data["host"],
        smtp_port=int(data["port"]),
        smtp_user=data["user"],
        smtp_pass=data["pass"],
        to_email=data["to"],
        subject=data.get("subject", "Test Proxy SMTP"),
        body=data.get("body", "Message envoyé via proxy.")
    )

    return jsonify({"success": success})

# Stockage en mémoire de l'historique des emails envoyés
email_history = []

# Données fake pour les tags dynamiques
FAKE_NAMES = [
  "Quentin Maillard", "Marine Bailly", "Mélanie Pires", "Inès Adam", "Sarah Lemoine",
  "Laura Fournier", "Lucas Picard", "Thomas Mercier", "Maxime Garnier", "Camille Blanchard",
  "Paul Faure", "Eva Dupont", "Axel Chevalier", "Julie Leroy", "Julien Lopez",
  "Antoine Guerin", "Manon Marchand", "David Fabre", "Alexandre Perrin", "Clara Henry",
  "Martin Nicolas", "Lucie Gomez", "Marion Colin", "Simon Adam", "Louis Vidal",
  "Emma Jacquet", "Nathan Pascal", "Léa Renard", "Nicolas Weber", "Sophie Rolland",
  "Justine Bonnet", "Amélie Vidal", "Océane Clement", "Hugo Rodriguez", "Vincent Langlois",
  "Charlotte Gonzalez", "Florian Leclerc", "Céline Maillard", "Kevin Marchand", "Amandine Delmas",
  "Guillaume Gaillard", "Chloé Pascal", "Romain Morin", "Anaïs Renaud", "Benoît Gomez",
  "Elodie Cousin", "Sarah Lopez", "Mathieu Jacquet", "Julie Picard", "Benoît Dupont"
]

FAKE_ADDRESSES = [
  "47 Rue de Tolbiac, 26660 Lille, France",
  "248 Rue de la Paix, 17861 Nice, France",
  "131 Rue de Rome, 34181 Strasbourg, France",
  "203 Rue du Bac, 56303 Paris, France",
  "72 Rue Victor Hugo, 75101 Marseille, France",
  "12 Rue des Écoles, 42100 Toulouse, France",
  "98 Rue Oberkampf, 67000 Strasbourg, France",
  "77 Boulevard Saint-Michel, 86000 Poitiers, France",
  "26 Avenue Victor Hugo, 59800 Lille, France",
  "33 Rue de Sèvres, 69006 Lyon, France",
  "91 Rue des Martyrs, 49000 Angers, France",
  "17 Rue Saint-Honoré, 17000 La Rochelle, France",
  "8 Rue du Faubourg Saint-Antoine, 86000 Poitiers, France",
  "119 Avenue de la Liberté, 75011 Paris, France",
  "145 Rue Monge, 57000 Metz, France",
  "62 Rue du Commerce, 68000 Colmar, France",
  "154 Rue Lafayette, 33000 Bordeaux, France",
  "34 Rue Saint-Maur, 29200 Brest, France",
  "89 Rue Damrémont, 63000 Clermont-Ferrand, France",
  "144 Rue Blomet, 34000 Montpellier, France",
  "25 Rue Ordener, 13000 Marseille, France",
  "18 Rue Daguerre, 59000 Lille, France",
  "49 Rue de la Convention, 54000 Nancy, France",
  "213 Rue Lecourbe, 72000 Le Mans, France",
  "90 Rue de la Gaité, 31000 Toulouse, France",
  "118 Rue de Clichy, 92100 Boulogne-Billancourt, France",
  "6 Rue du Château, 92000 Nanterre, France",
  "76 Rue de Vaugirard, 69000 Lyon, France",
  "32 Avenue du Général Leclerc, 37000 Tours, France",
  "64 Boulevard Barbès, 87000 Limoges, France",
  "129 Rue Réaumur, 94000 Créteil, France",
  "208 Rue du Théâtre, 34000 Montpellier, France",
  "43 Rue du Dragon, 57000 Metz, France",
  "11 Rue d’Alésia, 60000 Beauvais, France",
  "73 Rue Saint-Dominique, 13000 Marseille, France",
  "141 Rue Belleville, 14000 Caen, France",
  "121 Rue de la République, 25000 Besançon, France",
  "58 Rue Oberkampf, 86000 Poitiers, France",
  "83 Rue des Pyrénées, 18000 Bourges, France",
  "149 Rue de Rivoli, 75001 Paris, France",
  "102 Rue Saint-Antoine, 64000 Pau, France",
  "137 Rue du Cherche-Midi, 71000 Mâcon, France",
  "39 Rue Saint-Maur, 67000 Strasbourg, France",
  "198 Rue de Lappe, 10000 Troyes, France",
  "188 Rue Mozart, 65000 Tarbes, France",
  "124 Avenue Jean Jaurès, 57000 Metz, France",
  "67 Rue de la République, 54000 Nancy, France",
  "14 Rue de Belleville, 08000 Charleville-Mézières, France",
  "88 Rue de Rome, 68000 Colmar, France",
  "91 Boulevard Haussmann, 75009 Paris, France"
]

FAKE_IPS = [
  "74.214.181.89", "56.180.37.139", "66.250.155.29", "135.120.44.138", "193.156.44.141",
  "82.125.87.200", "91.180.12.95", "213.56.45.77", "92.104.57.13", "88.122.99.208",
  "80.215.64.14", "176.140.17.68", "87.97.200.104", "37.170.28.222", "90.76.157.26",
  "195.154.87.213", "62.210.84.221", "78.192.11.79", "212.198.48.91", "188.165.43.74",
  "46.105.51.178", "91.134.187.220", "145.239.88.55", "51.83.89.157", "176.31.123.200",
  "94.23.65.90", "213.186.33.5", "213.186.33.17", "213.186.33.24", "37.187.27.132",
  "213.186.33.16", "212.129.45.32", "5.196.76.129", "213.186.33.18", "213.186.33.23",
  "213.186.33.4", "213.186.33.3", "213.186.33.2", "213.186.33.1", "213.186.33.19",
  "212.129.45.33", "5.135.8.9", "46.105.58.99", "37.59.118.190", "87.98.162.88",
  "51.210.0.233", "46.105.142.145", "37.187.60.26", "5.135.164.72", "51.255.40.158",
  "145.239.91.180", "5.39.94.53", "137.74.198.180", "192.99.18.152", "51.68.123.45",
  "51.254.25.2", "164.132.235.17", "91.121.210.232", "151.80.50.193", "51.38.82.165",
  "54.36.91.62", "51.77.215.205", "137.74.122.195", "5.135.222.186", "37.59.118.190",
  "91.121.23.167", "145.239.84.204", "46.105.42.99", "151.80.96.115", "151.80.219.36",
  "51.91.79.225", "147.135.250.129", "54.36.70.168", "137.74.42.81", "54.38.80.10",
  "149.202.94.148", "5.39.84.5", "51.255.100.233", "54.37.163.213", "137.74.187.104",
  "54.36.166.67", "164.132.220.254", "54.38.34.203", "91.121.223.54", "54.38.228.132",
  "51.83.44.67", "51.83.10.240", "91.134.209.154", "91.121.22.106", "149.202.94.148",
  "91.121.223.64", "51.91.75.23", "51.254.103.33", "51.77.200.89", "54.36.91.236",
  "51.210.158.92", "145.239.76.97", "51.91.80.33", "91.121.224.51", "51.210.1.56"
]

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Safari/605.1.15",
    "Mozilla/5.0 (Linux; Android 13; SM-G990B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
]
COMPANIES = [
    "TechCorp", "FuturaWeb", "CryptoLab", "XSoft", "NeoVision",
    "SkyNetWorks", "DataNova", "AlturaDigital", "WebAxis", "InfiniDev"
]
PHONES = [
  "+33 6 74 39 73 96", "+34 7 83 75 47 01", "+49 7 66 56 32 33", "+41 6 38 11 22 11", "+39 6 45 71 92 68",
  "+32 6 17 22 38 51", "+352 7 34 53 88 12", "+351 6 21 44 59 30", "+420 6 11 73 88 40", "+48 7 83 66 41 90",
  "+33 7 89 23 55 12", "+34 6 74 88 62 44", "+49 6 15 33 92 38", "+41 7 93 00 26 10", "+39 7 12 66 54 99",
  "+32 6 29 93 31 81", "+352 6 42 73 19 05", "+351 7 65 19 20 66", "+420 6 56 77 19 11", "+48 6 74 82 63 37",
  "+33 6 84 74 17 13", "+34 7 56 49 91 24", "+49 7 43 19 55 18", "+41 6 17 20 84 45", "+39 7 95 30 11 33",
  "+32 6 11 53 37 92", "+352 7 75 80 41 66", "+351 6 33 92 16 24", "+420 7 33 69 88 17", "+48 6 45 12 94 73",
  "+33 7 35 83 20 02", "+34 7 45 14 71 55", "+49 6 86 41 10 60", "+41 6 94 89 37 21", "+39 6 20 94 55 78",
  "+32 7 48 53 93 29", "+352 6 15 75 21 03", "+351 6 49 28 71 84", "+420 6 13 98 76 55", "+48 7 11 58 45 13",
  "+33 6 91 44 39 98", "+34 7 84 28 19 06", "+49 7 59 30 66 74", "+41 6 47 70 18 77", "+39 6 32 55 14 66",
  "+32 6 19 94 75 01", "+352 7 69 64 42 77", "+351 7 88 13 90 99", "+420 7 91 33 24 10", "+48 7 46 76 29 17"
]

def generate_fake(tag):
    if tag == "##FAKE_NAME##":
        return random.choice(FAKE_NAMES)
    elif tag == "##FAKE_ADRESS##":
        return random.choice(FAKE_ADDRESSES)
    elif tag == "##FAKE_IP##":
        return random.choice(FAKE_IPS)
    elif tag == "##USER_AGENT##":
        return random.choice(USER_AGENTS)
    elif tag == "##COMPANY##":
        return random.choice(COMPANIES)
    elif tag == "##PHONE##":
        return random.choice(PHONES)
    elif tag == "##DATE##":
        return datetime.now().strftime("%d/%m/%Y")
    elif tag == "##DATEULTERIEUR##":
        return (datetime.now() + timedelta(days=7)).strftime("%d/%m/%Y")
    elif tag == "##PAYS##":
        return "France"
    elif tag.startswith("##NUM"):
        try:
            n = int(tag.replace("##NUM", "").replace("##", ""))
            return str(random.randint(10**(n-1), 10**n - 1))
        except:
            return "000"
    elif tag.startswith("##CART"):
        try:
            n = int(tag.replace("##CART", "").replace("##", ""))
            return ''.join(random.choices(string.ascii_uppercase + string.digits, k=n))
        except:
            return "XXX"
    elif tag == "##LINK##":
        return request.form.get("link", "https://exemple.com")
    return tag

def replace_tags(text, to_email):
    username = to_email.split('@')[0] if '@' in to_email else to_email

    base_tags = [
        "##EMAIL##", "##USERNAME##", "##FAKE_NAME##", "##FAKE_ADRESS##", "##FAKE_IP##", "##USER_AGENT##",
        "##COMPANY##", "##PHONE##", "##DATE##", "##DATEULTERIEUR##", "##PAYS##",
        "##NUM3##", "##NUM4##", "##NUM5##", "##NUM8##",
        "##CART3##", "##CART4##", "##CART5##", "##CART8##",
        "##LINK##"
    ]

    replacements = { tag: generate_fake(tag) for tag in base_tags }
    replacements["##EMAIL##"] = to_email
    replacements["##USERNAME##"] = username

    for tag, val in replacements.items():
        text = text.replace(tag, val)

    return text

# Routes

@app.route('/')
def root():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)

@app.route('/test_smtp', methods=['POST'])
def test_smtp():
    data = request.get_json()
    host = data.get('host')
    port = int(data.get('port', 587))
    user = data.get('user')
    password = data.get('pass')

    try:
        if port == 465:
            server = smtplib.SMTP_SSL(host, port, timeout=10)
        else:
            server = smtplib.SMTP(host, port, timeout=10)
            server.ehlo()
            if port == 587:
                server.starttls()
                server.ehlo()

        server.login(user, password)
        server.quit()
        return jsonify(success=True)
    except Exception as e:
        print(f"[SMTP TEST ERROR] {host}:{port} -> {e}")
        return jsonify(success=False, error=str(e))


@app.route('/send_email', methods=['POST'])
def send_email():
    try:
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

        # Remplacement des tags dynamiques
        subject = replace_tags(subject, to_email)
        body = replace_tags(body, to_email)

        # Appliquer un proxy si disponible
        if PROXIES:
            selected = random.choice(PROXIES)
            proxy_type = {
                "socks5": socks.SOCKS5,
                "socks4": socks.SOCKS4,
                "http": socks.HTTP
            }.get(selected["type"].lower(), socks.SOCKS5)

            print(f"🔁 Proxy actif : {selected['type']}://{selected['host']}:{selected['port']}")
            socks.set_default_proxy(proxy_type, selected["host"], selected["port"])
            socks.wrapmodule(smtplib)
        else:
            print("🚫 Aucun proxy configuré, envoi direct.")

        # Préparer l'email
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

        # Supprimer certains headers
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
            maintype, subtype = mime_type.split('/') if mime_type else ('application', 'octet-stream')
            filename = replace_tags(file.filename, to_email)
            msg.add_attachment(content, maintype=maintype, subtype=subtype, filename=filename)

        # Connexion SMTP
        server = smtplib.SMTP(smtp_host, smtp_port, timeout=20)
        server.ehlo()
        if smtp_port == 587:
            server.starttls()
            server.ehlo()
        server.login(smtp_user, smtp_pass)

        # Gestion destinataires
        envelope_from = reply_to if reply_to else smtp_user
        recipients = [to_email]
        if cc:
            recipients += [email.strip() for email in cc.split(",") if email.strip()]
        if bcc:
            recipients += [email.strip() for email in bcc.split(",") if email.strip()]

        server.sendmail(envelope_from, recipients, msg.as_string())
        server.quit()

        email_history.append({
            "email": to_email,
            "status": "Envoyé",
            "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "error": "",
            "delivered": True
        })

        return jsonify(success=True)

    except Exception as e:
        to_email = request.form.get('to', 'unknown')
        email_history.append({
            "email": to_email,
            "status": "Échec",
            "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "error": str(e),
            "delivered": False
        })
        return jsonify(success=False, error=str(e))


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

@app.route('/api/reset-history', methods=['POST'])
def reset_history():
    try:
        global email_history
        email_history.clear()
        return jsonify(success=True)
    except Exception as e:
        return jsonify(success=False, error=str(e)), 500

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
    app.run(host='0.0.0.0', port=port, debug=True)
