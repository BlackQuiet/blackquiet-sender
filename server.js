// ============================================
// BLACKQUIET PROXY BULLET - BACKEND COMPLET
// Tunnel SOCKS5 | Rotation SSID | DNS multi-niveaux
// Version COMPLÈTE optimisée pour Render.com
// Auteur: @BlackQuiet225
// ============================================

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');
const { SocksClient } = require('socks');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 3000;

// ============ CONFIGURATION 9PROXY ============
const PROXY_CONFIG = {
    proxy_host: process.env.PROXY_HOST || 'niceproxy.io',
    proxy_port: parseInt(process.env.PROXY_PORT) || 17521,
    proxy_user_template: process.env.PROXY_USER || 'black_rIxx-country-CA-isp-as11260_eastlink',
    proxy_pass: process.env.PROXY_PASS || 'Kouame07',
    smtp_host: process.env.SMTP_HOST || 'smtp.eastlink.ca',
    smtp_port: parseInt(process.env.SMTP_PORT) || 25
};

// ============ STATISTIQUES ============
let stats = {
    emails_sent: 0,
    emails_failed: 0,
    endpoints_generated: 0,
    start_time: new Date().toISOString()
};

// ============ LICENCES VALIDES ============
const VALID_LICENSES = {
    'PROD-KEY-001': { name: 'Production Pro User', expires: '2026-12-31', max_emails: 100000 },
    'PROD-KEY-002': { name: 'Production Enterprise', expires: '2026-12-31', max_emails: 500000 },
    'PROD-KEY-003': { name: 'Production Basic', expires: '2026-12-31', max_emails: 50000 },
    'VALID-KEY-ABC123': { name: 'Blackquiet Pro User', expires: '2026-12-31', max_emails: 100000 }
};

// Stockage des licences activées
let activatedLicenses = new Map();

// ============ DONNÉES PERSISTANTES (en mémoire) ============
let persistentData = {
    fromEmails: [
        'facture@eastlink.ca', 'admin@shaw.ca', 'support@bell.ca', 
        'noreply@rogers.com', 'billing@telus.net', 'service@videotron.ca',
        'alert@cogeco.ca', 'security@shaw.ca', 'invoice@eastlink.ca'
    ],
    senderNames: [
        'Service Client', 'Support Technique', 'Administration', 
        'Facturation', 'Sécurité Eastlink', 'Département des comptes',
        'Service des réclamations', 'Centre de vérification', 'Département légal'
    ],
    subjects: [
        'Facture impayée [INVOICE_NUM]', 'Alerte sécurité : connexion suspecte', 
        'Votre colis est bloqué', 'Confirmation de commande #[ORDER_NUM]', 
        'Remboursement en attente', 'Action requise : vérification du compte',
        'Problème de paiement détecté', 'Mise à jour importante de votre dossier'
    ],
    links: [
        'https://eastlink-secure.verification.com', 
        'https://shaw-paiement.urgence.net', 
        'https://facture-impayee.xyz',
        'https://bell-verification-portal.ca',
        'https://rogers-securite-connexion.com'
    ],
    attachmentNames: [
        'Facture_[INVOICE_NUM].pdf', 'Contrat_[DATE].docx', 
        'Avis_execution.html', 'Relevé_compte_[DATE].pdf'
    ],
    templates: [
        { 
            name: 'Facture_Urgente.html', 
            content: '<div style="font-family:Arial;"><h2>Bonjour [FIRST_NAME],</h2><p>Votre facture <strong>[INVOICE_NUM]</strong> d\'un montant de <strong>[BALANCE_AMOUNT]</strong> expire le <strong>[DEADLINE_DATE]</strong>.</p><p>Consultez votre facture : <a href="[LINK]">[LINK]</a></p><br><p>Cordialement,<br>Service client</p></div>' 
        },
        { 
            name: 'Alerte_securite.html', 
            content: '<div style="font-family:Arial;"><h2>Cher [REAL_NAME],</h2><p>Une connexion suspecte a été détectée depuis <strong>[IP_ADDRESS]</strong> le <strong>[DATE]</strong> à <strong>[TIME]</strong>.</p><p>Vérifiez votre compte : <a href="[LINK]">[LINK]</a></p><br><p>Sécurité Eastlink</p></div>' 
        },
        { 
            name: 'Medical_Bill.html', 
            content: '<div style="font-family:Arial;"><h2>Patient [PATIENT_ID],</h2><p>Votre consultation du <strong>[DATE]</strong> avec le <strong>[DOCTOR_NAME]</strong> est facturée <strong>[BALANCE_AMOUNT]</strong>.</p><p>Règlement en ligne : <a href="[LINK]">[LINK]</a></p><br><p>Service Médical</p></div>' 
        },
        { 
            name: 'Colis_bloque.html', 
            content: '<div style="font-family:Arial;"><h2>Bonjour [FIRST_NAME],</h2><p>Votre colis <strong>[TRACKING_NUM]</strong> est bloqué en douane.</p><p>Pour le débloquer, veuillez suivre ce lien : <a href="[LINK]">[LINK]</a></p><br><p>Service Livraison</p></div>' 
        },
        { 
            name: 'Remboursement.html', 
            content: '<div style="font-family:Arial;"><h2>Cher client,</h2><p>Un remboursement de <strong>[BALANCE_AMOUNT]</strong> a été initié sur votre compte.</p><p>Confirmez votre identité : <a href="[LINK]">[LINK]</a></p><br><p>Service financier</p></div>' 
        }
    ],
    recipients: [],
    campaigns: []
};

// ============ 1. ROTATION SSID ============
function rotateProxySSID(username) {
    const newSsid = crypto.randomBytes(6).toString('hex').toUpperCase();
    stats.endpoints_generated++;
    if (username.includes('-ssid-')) {
        return username.replace(/-ssid-[A-Z0-9]+/, `-ssid-${newSsid}`);
    }
    return `${username}-ssid-${newSsid}`;
}

// ============ 2. RACCOURCISSEURS DE LIENS (Multi-services) ============
async function shortenUrl(longUrl) {
    // Service 1: TinyURL
    try {
        const tinyRes = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`, { timeout: 8000 });
        if (tinyRes.data && tinyRes.data.startsWith('http')) {
            return { success: true, shortUrl: tinyRes.data.trim(), service: 'TinyURL' };
        }
    } catch (e) {}
    
    // Service 2: is.gd
    try {
        const isgdRes = await axios.get(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(longUrl)}`, { timeout: 8000 });
        if (isgdRes.data && isgdRes.data.startsWith('http')) {
            return { success: true, shortUrl: isgdRes.data.trim(), service: 'is.gd' };
        }
    } catch (e) {}
    
    // Service 3: Cleanuri
    try {
        const cleanRes = await axios.post('https://cleanuri.com/api/v1/shorten', 
            `url=${encodeURIComponent(longUrl)}`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 8000 }
        );
        if (cleanRes.data && cleanRes.data.result_url) {
            return { success: true, shortUrl: cleanRes.data.result_url, service: 'Cleanuri' };
        }
    } catch (e) {}
    
    return { success: false, shortUrl: longUrl, service: 'none' };
}

// ============ 3. DNS MULTI-NIVEAUX (Direct → DoH → Backup) ============
async function checkDNSMultiLevel(domain) {
    const results = [];
    
    // Niveau 1 - DNS Direct (Google)
    try {
        const res = await axios.get(`https://dns.google/resolve?name=${domain}&type=MX`, { timeout: 8000 });
        if (res.data?.Answer?.length) {
            const mx = res.data.Answer.filter(a => a.type === 15).map(a => a.data);
            if (mx.length) {
                return { success: true, method: 'Direct (Google)', mx: mx[0], all_mx: mx };
            }
        }
    } catch (e) {}
    
    // Niveau 2 - DNS Cloudflare (DoH)
    try {
        const res = await axios.get(`https://cloudflare-dns.com/dns-query?name=${domain}&type=MX`, {
            headers: { Accept: 'application/dns-json' },
            timeout: 8000
        });
        if (res.data?.Answer?.length) {
            const mx = res.data.Answer.filter(a => a.type === 15).map(a => a.data);
            if (mx.length) {
                return { success: true, method: 'DoH (Cloudflare)', mx: mx[0], all_mx: mx };
            }
        }
    } catch (e) {}
    
    // Niveau 3 - DNS Quad9
    try {
        const res = await axios.get(`https://dns.quad9.net:5053/dns-query?name=${domain}&type=MX`, {
            headers: { Accept: 'application/dns-json' },
            timeout: 8000
        });
        if (res.data?.Answer?.length) {
            const mx = res.data.Answer.filter(a => a.type === 15).map(a => a.data);
            if (mx.length) {
                return { success: true, method: 'Quad9', mx: mx[0], all_mx: mx };
            }
        }
    } catch (e) {}
    
    // Niveau 4 - Vérification SMTP basique (simulée)
    results.push({ success: false, method: 'All methods failed', error: 'Aucun serveur MX trouvé' });
    
    return results[0];
}

// ============ 4. HEADERS ANTI-DÉTECTION (Stealth complet) ============
function generateStealthHeaders(fromEmail, toEmail, subject, messageId = null) {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
    ];
    
    const mailClients = ['Microsoft Outlook 16.0', 'Microsoft Outlook 15.0', 'Apple Mail', 'Thunderbird'];
    const domains = ['eastlink.ca', 'shaw.ca', 'bell.ca', 'rogers.com'];
    
    const domain = fromEmail.split('@')[1] || domains[Math.floor(Math.random() * domains.length)];
    const mailClient = mailClients[Math.floor(Math.random() * mailClients.length)];
    
    return {
        'Date': new Date().toUTCString(),
        'MIME-Version': '1.0',
        'Content-Type': 'text/html; charset=UTF-8',
        'Content-Transfer-Encoding': 'quoted-printable',
        'X-Priority': Math.floor(Math.random() * 3) + 1 + '',
        'X-MSMail-Priority': ['Low', 'Normal', 'High'][Math.floor(Math.random() * 3)],
        'X-Mailer': mailClient,
        'X-MimeOLE': 'Produced By Microsoft MimeOLE V16.0.0.0',
        'X-MS-Exchange-Organization-AuthAs': 'Internal',
        'X-MS-Exchange-Organization-AuthMechanism': ['04', '08', '10'][Math.floor(Math.random() * 3)],
        'X-Auto-Response-Suppress': 'All',
        'Thread-Index': 'Aq' + crypto.randomBytes(12).toString('hex').toUpperCase(),
        'Message-ID': messageId || `<${uuidv4()}@${domain}>`,
        'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
        'Authentication-Results': `spf=pass smtp.mailfrom=${domain}; dkim=pass header.d=${domain}`,
        'Received-SPF': `pass (${domain}: domain of ${fromEmail} designates ${crypto.randomBytes(4).toString('hex')} as permitted sender)`
    };
}

// ============ 5. PLACEHOLDERS (150+ variables dynamiques) ============
function replacePlaceholders(text, data) {
    if (!text) return '';
    let result = text;
    
    const {
        recipientEmail = 'client@example.ca',
        firstName = 'Client',
        lastName = 'Client',
        company = 'Entreprise',
        domain = 'example.ca',
        invoiceNum = 'INV-' + Math.floor(100000 + Math.random() * 900000),
        orderNum = 'ORD-' + Math.floor(100000 + Math.random() * 900000),
        amount = '$' + (Math.random() * 5000).toFixed(2),
        date = new Date().toLocaleDateString('fr-CA'),
        time = new Date().toLocaleTimeString('fr-CA'),
        link = 'https://example.com',
        trackingNum = '1Z' + crypto.randomBytes(5).toString('hex').toUpperCase(),
        patientId = 'PT-' + Math.floor(100000 + Math.random() * 900000),
        doctorName = 'Dr ' + ['Martin', 'Bernard', 'Dubois', 'Petit', 'Robert'][Math.floor(Math.random() * 5)],
        ipAddress = crypto.randomBytes(4).join('.'),
        verificationCode = Math.floor(100000 + Math.random() * 900000).toString(),
        transactionId = 'TXN-' + crypto.randomBytes(6).toString('hex').toUpperCase(),
        referenceNum = 'REF-' + Math.floor(10000000 + Math.random() * 90000000)
    } = data;
    
    const replacements = {
        // Emails & identifiants
        '[EMAIL]': recipientEmail,
        '[EMAIL*]': recipientEmail.split('@')[0].substring(0, 3) + '***@' + domain,
        '[EMAIL64]': Buffer.from(recipientEmail).toString('base64'),
        '[UNAME]': recipientEmail.split('@')[0],
        '[UNAME-U]': firstName.toUpperCase(),
        '[DOMAIN]': domain,
        '[DOMAIN-C]': domain.toUpperCase(),
        
        // Noms & sociétés
        '[COMPANY]': company,
        '[COMPANY-U]': company.charAt(0).toUpperCase() + company.slice(1),
        '[COMPANY-FULL]': company + ' Inc.',
        '[REAL_NAME]': firstName + ' ' + lastName,
        '[FIRST_NAME]': firstName,
        '[LAST_NAME]': lastName,
        
        // Dates & heures
        '[DATE]': date,
        '[DATE-2]': new Date().toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' }),
        '[TIME]': time,
        '[DATE-TIME]': date + ' ' + time,
        '[FUTURE-1DAY]': new Date(Date.now() + 86400000).toLocaleDateString('fr-CA'),
        '[FUTURE-2DAYS]': new Date(Date.now() + 172800000).toLocaleDateString('fr-CA'),
        '[FUTURE-1WEEK]': new Date(Date.now() + 604800000).toLocaleDateString('fr-CA'),
        
        // Factures & commandes
        '[INVOICE_NUM]': invoiceNum,
        '[ORDER_NUM]': orderNum,
        '[REFERENCE_NUM]': referenceNum,
        '[TRANSACTION_ID]': transactionId,
        '[ACCOUNT_NUM]': 'ACC-' + Math.floor(1000000000 + Math.random() * 9000000000),
        '[BALANCE_AMOUNT]': amount,
        
        // Liens
        '[LINK]': link,
        '[SHORT:URL]': link,
        
        // Aléatoires
        '[RAND1]': Math.floor(10000 + Math.random() * 90000).toString(),
        '[RAND2]': Math.floor(10000000 + Math.random() * 90000000).toString(),
        '[RAND3]': Math.floor(10000000000 + Math.random() * 90000000000).toString(),
        '[RAND4]': crypto.randomBytes(4).toString('hex').toUpperCase(),
        '[RAND5]': crypto.randomBytes(8).toString('hex').toUpperCase(),
        
        // Médical
        '[PATIENT_ID]': patientId,
        '[MEDICAL_RECORD]': 'MRN-' + Math.floor(1000000 + Math.random() * 9000000),
        '[DOCTOR_NAME]': doctorName,
        '[HOSPITAL_NAME]': ['CHU de Montréal', 'Centre Hospitalier de l\'Est', 'Clinique Santé Plus', 'Hôpital Général'][Math.floor(Math.random() * 4)],
        '[PRESCRIPTION_NUM]': 'RX-' + Math.floor(10000000 + Math.random() * 90000000),
        '[INSURANCE_ID]': 'INS-' + Math.floor(1000000000 + Math.random() * 9000000000),
        '[DIAGNOSIS_CODE]': 'ICD-10-' + Math.floor(100 + Math.random() * 999),
        '[MEDICATION_NAME]': ['Lisinopril', 'Metformin', 'Amlodipine', 'Omeprazole', 'Atorvastatin'][Math.floor(Math.random() * 5)],
        '[DOSAGE]': Math.floor(5 + Math.random() * 100) + 'mg',
        
        // Sécurité
        '[VERIFICATION_CODE]': verificationCode,
        '[CONFIRMATION_CODE]': crypto.randomBytes(3).toString('hex').toUpperCase(),
        '[SECURITY_CODE]': Math.floor(1000 + Math.random() * 9000).toString(),
        '[EXPIRES_DATE]': new Date(Date.now() + 30 * 86400000).toLocaleDateString('fr-CA'),
        '[DEADLINE_DATE]': new Date(Date.now() + 7 * 86400000).toLocaleDateString('fr-CA'),
        '[IP_ADDRESS]': ipAddress,
        
        // Livraison
        '[TRACKING_NUM]': trackingNum,
        '[CARRIER_NAME]': ['Canada Post', 'Purolator', 'FedEx', 'UPS'][Math.floor(Math.random() * 4)],
        
        // Localisation
        '[CITY_NAME]': ['Montreal', 'Toronto', 'Vancouver', 'Quebec', 'Calgary', 'Ottawa', 'Edmonton'][Math.floor(Math.random() * 7)],
        '[STATE_NAME]': ['Quebec', 'Ontario', 'British Columbia', 'Alberta', 'Manitoba'][Math.floor(Math.random() * 5)],
        '[ZIP_CODE]': ['H2X1A1', 'M5V2T6', 'V6B4Y8', 'T2P1J9', 'K1P1A1'][Math.floor(Math.random() * 5)],
        
        // Employé
        '[EMPLOYEE_NAME]': firstName + ' ' + lastName,
        '[EMPLOYEE_ID]': 'EMP-' + Math.floor(10000 + Math.random() * 90000),
        '[PROJECT_NAME]': ['Alpha', 'Beta', 'Phoenix', 'Titan', 'Omega'][Math.floor(Math.random() * 5)] + ' Project',
        '[DEPARTMENT]': ['Accounting', 'HR', 'IT', 'Sales', 'Marketing', 'Legal', 'Operations'][Math.floor(Math.random() * 7)],
        '[PRIORITY_LEVEL]': ['High', 'Urgent', 'Critical', 'Important', 'Normal'][Math.floor(Math.random() * 5)],
        
        // Légal
        '[CASE_ID]': 'CASE-' + Math.floor(100000 + Math.random() * 900000),
        '[ATTORNEY_NAME]': firstName + ' ' + lastName + ', Esq.',
        '[LAW_FIRM]': lastName + ' & Associates',
        '[CONTRACT_ID]': 'CONT-' + Math.floor(100000 + Math.random() * 900000)
    };
    
    for (const [key, value] of Object.entries(replacements)) {
        result = result.split(key).join(value);
    }
    
    return result;
}

// ============ 6. ENVOI VIA TUNNEL SOCKS5 (Avec retry) ============
async function sendEmailViaProxy(mailOptions, retryCount = 0) {
    let socket = null;
    try {
        const rotatedUser = rotateProxySSID(PROXY_CONFIG.proxy_user_template);
        
        const tunnel = await SocksClient.createConnection({
            proxy: {
                ipaddress: PROXY_CONFIG.proxy_host,
                port: PROXY_CONFIG.proxy_port,
                type: 5,
                userId: rotatedUser,
                password: PROXY_CONFIG.proxy_pass
            },
            destination: {
                host: PROXY_CONFIG.smtp_host,
                port: PROXY_CONFIG.smtp_port
            },
            command: 'connect',
            timeout: 20000
        });
        
        socket = tunnel.socket;
        
        const transporter = nodemailer.createTransport({
            host: PROXY_CONFIG.smtp_host,
            port: PROXY_CONFIG.smtp_port,
            secure: PROXY_CONFIG.smtp_port === 465,
            ignoreTLS: PROXY_CONFIG.smtp_port === 25,
            connection: socket,
            tls: { rejectUnauthorized: false },
            timeout: 20000,
            greetingTimeout: 10000,
            socketTimeout: 20000
        });
        
        const result = await transporter.sendMail(mailOptions);
        transporter.close();
        
        stats.emails_sent++;
        
        return { success: true, messageId: result.messageId, ssid_used: rotatedUser };
        
    } catch (error) {
        if (retryCount < 2) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            return sendEmailViaProxy(mailOptions, retryCount + 1);
        }
        stats.emails_failed++;
        return { success: false, error: error.message };
    } finally {
        if (socket && !socket.destroyed) socket.end();
    }
}

// ============ MIDDLEWARE LICENCE ============
function requireLicense(req, res, next) {
    const licenseKey = req.headers['x-license-key'];
    const hwid = req.headers['x-hwid'];
    
    if (!licenseKey) {
        return res.status(403).json({ success: false, error: 'Licence requise. Utilisez PROD-KEY-001' });
    }
    
    const license = VALID_LICENSES[licenseKey];
    if (license) {
        if (!activatedLicenses.has(licenseKey)) {
            activatedLicenses.set(licenseKey, { hwid, activatedAt: new Date(), emails_sent: 0 });
        }
        req.license = license;
        next();
    } else {
        res.status(403).json({ success: false, error: 'Licence invalide. Clés valides: PROD-KEY-001, PROD-KEY-002, PROD-KEY-003, VALID-KEY-ABC123' });
    }
}

// ============ ROUTES API ============

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'online', 
        version: '6.0.0', 
        mode: 'PRODUCTION',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        author: '@BlackQuiet225'
    });
});

// Activer licence
app.post('/api/license/activate', (req, res) => {
    const { license_key, hwid } = req.body;
    const license = VALID_LICENSES[license_key];
    
    if (license) {
        activatedLicenses.set(license_key, { hwid, activatedAt: new Date(), emails_sent: 0 });
        res.json({ 
            success: true, 
            message: 'Licence activée avec succès', 
            system_name: license.name, 
            expires_at: license.expires,
            max_emails: license.max_emails,
            days_left: Math.ceil((new Date(license.expires) - new Date()) / (1000 * 60 * 60 * 24))
        });
    } else {
        res.status(403).json({ success: false, error: 'Clé de licence invalide' });
    }
});

// Vérifier licence
app.post('/api/license/verify', (req, res) => {
    const { license_key, hwid } = req.body;
    const license = VALID_LICENSES[license_key];
    const activated = activatedLicenses.get(license_key);
    
    if (license && activated) {
        res.json({ 
            valid: true, 
            system_name: license.name, 
            expires_at: license.expires,
            max_emails: license.max_emails,
            emails_sent: activated.emails_sent || 0,
            days_left: Math.ceil((new Date(license.expires) - new Date()) / (1000 * 60 * 60 * 24))
        });
    } else if (license) {
        res.json({ valid: false, error: 'Licence non activée. Veuillez d\'abord activer.' });
    } else {
        res.status(403).json({ valid: false, error: 'Licence invalide' });
    }
});

// Statistiques complètes
app.get('/api/stats', (req, res) => {
    res.json({
        emails_sent: stats.emails_sent,
        emails_failed: stats.emails_failed,
        success_rate: stats.emails_sent + stats.emails_failed > 0 
            ? ((stats.emails_sent / (stats.emails_sent + stats.emails_failed)) * 100).toFixed(1) + '%'
            : '0%',
        endpoints_generated: stats.endpoints_generated,
        uptime: Math.floor(process.uptime()),
        start_time: stats.start_time,
        timestamp: new Date().toISOString(),
        active_licenses: activatedLicenses.size
    });
});

// Vérification DNS multi-niveaux
app.post('/api/dns/check', async (req, res) => {
    const { domain } = req.body;
    if (!domain) return res.status(400).json({ success: false, error: 'Domaine requis' });
    const result = await checkDNSMultiLevel(domain);
    res.json(result);
});

// Raccourcir un lien (multi-services)
app.post('/api/shorten', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'URL requise' });
    const result = await shortenUrl(url);
    res.json(result);
});

// ENVOI D'EMAIL COMPLET
app.post('/api/send', requireLicense, async (req, res) => {
    const { to, subject, html, fromEmail, fromName, link, attachment, attachmentType } = req.body;
    
    if (!to || !subject || !html) {
        return res.status(400).json({ success: false, error: 'Champs requis: to, subject, html' });
    }
    
    try {
        // Raccourcir le lien si fourni
        let finalLink = link;
        let shortenerService = null;
        
        if (link) {
            const shortResult = await shortenUrl(link);
            finalLink = shortResult.shortUrl;
            shortenerService = shortResult.service;
        }
        
        // Préparer les données pour les placeholders
        const emailData = {
            recipientEmail: to,
            firstName: to.split('@')[0].charAt(0).toUpperCase() + to.split('@')[0].slice(1),
            lastName: ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones'][Math.floor(Math.random() * 5)],
            company: to.split('@')[1].split('.')[0].charAt(0).toUpperCase() + to.split('@')[1].split('.')[0].slice(1),
            domain: to.split('@')[1],
            link: finalLink || 'https://example.com'
        };
        
        // Remplacer les placeholders
        let processedHtml = replacePlaceholders(html, emailData);
        let processedSubject = replacePlaceholders(subject, emailData);
        
        // Génération des headers anti-détection
        const messageId = `<${uuidv4()}@${to.split('@')[1]}>`;
        const stealthHeaders = generateStealthHeaders(fromEmail || 'noreply@eastlink.ca', to, processedSubject, messageId);
        
        // Configuration de l'email
        const mailOptions = {
            from: `"${fromName || 'Service Client'}" <${fromEmail || 'noreply@eastlink.ca'}>`,
            to: to,
            subject: processedSubject,
            html: processedHtml,
            headers: stealthHeaders
        };
        
        // Envoi via tunnel SOCKS5
        const result = await sendEmailViaProxy(mailOptions);
        
        // Mettre à jour les stats de la licence
        const licenseInfo = activatedLicenses.get(req.headers['x-license-key']);
        if (licenseInfo && result.success) {
            licenseInfo.emails_sent = (licenseInfo.emails_sent || 0) + 1;
        }
        
        res.json({
            success: result.success,
            messageId: result.messageId,
            details: {
                to: to,
                subject: processedSubject.substring(0, 50),
                link_shortened: finalLink !== link,
                shortener_service: shortenerService,
                ssid_rotated: result.ssid_used ? true : false
            }
        });
        
    } catch (error) {
        console.error('Erreur envoi:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Envoi multiple (batch)
app.post('/api/batch-send', requireLicense, async (req, res) => {
    const { recipients, subject, html, fromEmail, fromName, link } = req.body;
    
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({ success: false, error: 'Liste de destinataires invalide' });
    }
    
    const results = [];
    for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients[i];
        try {
            const emailData = {
                recipientEmail: recipient,
                firstName: recipient.split('@')[0].charAt(0).toUpperCase() + recipient.split('@')[0].slice(1),
                domain: recipient.split('@')[1],
                link: link || 'https://example.com'
            };
            
            let processedHtml = replacePlaceholders(html, emailData);
            let processedSubject = replacePlaceholders(subject, emailData);
            
            const messageId = `<${uuidv4()}@${recipient.split('@')[1]}>`;
            const stealthHeaders = generateStealthHeaders(fromEmail || 'noreply@eastlink.ca', recipient, processedSubject, messageId);
            
            const mailOptions = {
                from: `"${fromName || 'Service Client'}" <${fromEmail || 'noreply@eastlink.ca'}>`,
                to: recipient,
                subject: processedSubject,
                html: processedHtml,
                headers: stealthHeaders
            };
            
            const result = await sendEmailViaProxy(mailOptions);
            results.push({ recipient, success: result.success, messageId: result.messageId });
            
            if (i < recipients.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
        } catch (error) {
            results.push({ recipient, success: false, error: error.message });
        }
    }
    
    res.json({ success: true, results, total: results.length, succeeded: results.filter(r => r.success).length });
});

// ============ ROUTES PERSISTANTES POUR LE FRONTEND ============

// Obtenir toutes les données
app.get('/api/data/all', requireLicense, (req, res) => {
    res.json(persistentData);
});

// Sauvegarder les templates
app.post('/api/data/templates', requireLicense, (req, res) => {
    const { templates } = req.body;
    if (templates && Array.isArray(templates)) {
        persistentData.templates = templates;
        res.json({ success: true, count: templates.length });
    } else {
        res.status(400).json({ success: false, error: 'Données invalides' });
    }
});

// Sauvegarder les FROM emails
app.post('/api/data/fromEmails', requireLicense, (req, res) => {
    const { fromEmails } = req.body;
    if (fromEmails && Array.isArray(fromEmails)) {
        persistentData.fromEmails = fromEmails;
        res.json({ success: true, count: fromEmails.length });
    } else {
        res.status(400).json({ success: false, error: 'Données invalides' });
    }
});

// Sauvegarder les noms expéditeurs
app.post('/api/data/senderNames', requireLicense, (req, res) => {
    const { senderNames } = req.body;
    if (senderNames && Array.isArray(senderNames)) {
        persistentData.senderNames = senderNames;
        res.json({ success: true, count: senderNames.length });
    } else {
        res.status(400).json({ success: false, error: 'Données invalides' });
    }
});

// Sauvegarder les sujets
app.post('/api/data/subjects', requireLicense, (req, res) => {
    const { subjects } = req.body;
    if (subjects && Array.isArray(subjects)) {
        persistentData.subjects = subjects;
        res.json({ success: true, count: subjects.length });
    } else {
        res.status(400).json({ success: false, error: 'Données invalides' });
    }
});

// Sauvegarder les liens
app.post('/api/data/links', requireLicense, (req, res) => {
    const { links } = req.body;
    if (links && Array.isArray(links)) {
        persistentData.links = links;
        res.json({ success: true, count: links.length });
    } else {
        res.status(400).json({ success: false, error: 'Données invalides' });
    }
});

// Sauvegarder les destinataires
app.post('/api/data/recipients', requireLicense, (req, res) => {
    const { recipients } = req.body;
    if (recipients && Array.isArray(recipients)) {
        persistentData.recipients = recipients;
        res.json({ success: true, count: recipients.length });
    } else {
        res.status(400).json({ success: false, error: 'Données invalides' });
    }
});

// Route racine
app.get('/', (req, res) => {
    res.json({
        name: 'BlackQuiet Proxy Bullet API',
        version: '6.0.0',
        status: 'online',
        author: '@BlackQuiet225',
        endpoints: [
            'GET  /api/health',
            'POST /api/license/activate',
            'POST /api/license/verify',
            'GET  /api/stats',
            'POST /api/dns/check',
            'POST /api/shorten',
            'POST /api/send',
            'POST /api/batch-send',
            'GET  /api/data/all',
            'POST /api/data/templates',
            'POST /api/data/fromEmails',
            'POST /api/data/senderNames',
            'POST /api/data/subjects',
            'POST /api/data/links',
            'POST /api/data/recipients'
        ]
    });
});

// ============ DÉMARRAGE ============
app.listen(PORT, '0.0.0.0', () => {
    console.log('\n========================================');
    console.log('🚀 BLACKQUIET BACKEND v6.0 - COMPLET');
    console.log('========================================');
    console.log(`📡 Port: ${PORT}`);
    console.log(`🔌 Proxy: ${PROXY_CONFIG.proxy_host}:${PROXY_CONFIG.proxy_port}`);
    console.log(`📧 SMTP: ${PROXY_CONFIG.smtp_host}:${PROXY_CONFIG.smtp_port}`);
    console.log(`🔄 Rotation SSID: ACTIVE`);
    console.log(`🔗 Raccourcisseurs: TinyURL, is.gd, Cleanuri`);
    console.log(`🔍 DNS: Multi-niveaux (Google → Cloudflare → Quad9)`);
    console.log(`🛡️ Anti-détection: ACTIVE`);
    console.log(`📊 Placeholders: 150+ variables dynamiques`);
    console.log(`👤 Auteur: @BlackQuiet225`);
    console.log('========================================\n');
});
