// ============================================
// BLACKQUIET BACKEND v6.0 - AVEC RÔLES CORRIGÉS
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

// ============ LICENCES AVEC RÔLES (CORRIGÉ) ============
const VALID_LICENSES = {
    // ADMIN - Accès total
    'VALID-KEY-ABC123': {
        name: 'Master Admin',
        role: 'admin',  // <-- IMPORTANT: role doit être 'admin'
        expires: '2026-12-31'
    },
    // USERS - Accès limité
    'PROD-KEY-001': {
        name: 'Production User',
        role: 'user',
        expires: '2026-12-31'
    },
    'PROD-KEY-002': {
        name: 'Enterprise User',
        role: 'user',
        expires: '2026-12-31'
    },
    'PROD-KEY-003': {
        name: 'Basic User',
        role: 'user',
        expires: '2026-12-31'
    }
};

// ============ CONFIGURATION PROXY PAR DÉFAUT ============
const DEFAULT_PROXY_CONFIG = {
    proxy_host: 'niceproxy.io',
    proxy_port: 17521,
    proxy_user: 'black_rIxx-country-CA-isp-as11260_eastlink',
    proxy_pass: 'Kouame07',
    smtp_host: 'smtp.eastlink.ca',
    smtp_port: 25
};

// Stockage des configurations
let globalProxyConfig = { ...DEFAULT_PROXY_CONFIG };
let globalLists = {
    fromEmails: ['facture@eastlink.ca', 'admin@shaw.ca', 'support@bell.ca'],
    senderNames: ['Service Client', 'Support Technique', 'Administration'],
    subjects: ['Facture impayée [INVOICE_NUM]', 'Alerte sécurité', 'Votre colis est bloqué'],
    links: ['https://eastlink-secure.verification.com', 'https://shaw-paiement.urgence.net'],
    templates: [
        { name: 'Facture_Urgente.html', content: '<div><h2>Bonjour [FIRST_NAME],</h2><p>Votre facture <strong>[INVOICE_NUM]</strong> de <strong>[BALANCE_AMOUNT]</strong> expire le <strong>[DEADLINE_DATE]</strong>.</p><p><a href="[LINK]">Consulter ma facture</a></p></div>' },
        { name: 'Alerte_securite.html', content: '<div><h2>Cher [REAL_NAME],</h2><p>Connexion suspecte depuis <strong>[IP_ADDRESS]</strong> le <strong>[DATE]</strong>.</p><p><a href="[LINK]">Vérifier mon compte</a></p></div>' }
    ],
    recipients: []
};

// ============ STATISTIQUES ============
let stats = {
    emails_sent: 0,
    emails_failed: 0,
    endpoints_generated: 0,
    start_time: new Date().toISOString()
};

// ============ FONCTIONS ============
function rotateProxySSID(username) {
    const newSsid = crypto.randomBytes(5).toString('hex').toUpperCase();
    stats.endpoints_generated++;
    if (username.includes('-ssid-')) {
        return username.replace(/-ssid-[a-zA-Z0-9]+/, `-ssid-${newSsid}`);
    }
    return `${username}-ssid-${newSsid}`;
}

function replacePlaceholders(text, data) {
    if (!text) return '';
    let result = text;
    const { recipientEmail = 'client@example.ca', link = 'https://example.com' } = data;
    const username = recipientEmail.split('@')[0];
    const firstName = username.charAt(0).toUpperCase() + username.slice(1);
    const invoiceNum = 'INV-' + Math.floor(100000 + Math.random() * 900000);
    const amount = '$' + (Math.random() * 5000).toFixed(2);
    
    const replacements = {
        '[FIRST_NAME]': firstName,
        '[REAL_NAME]': firstName + ' Smith',
        '[INVOICE_NUM]': invoiceNum,
        '[BALANCE_AMOUNT]': amount,
        '[DEADLINE_DATE]': new Date(Date.now() + 7 * 86400000).toLocaleDateString(),
        '[DATE]': new Date().toLocaleDateString(),
        '[TIME]': new Date().toLocaleTimeString(),
        '[RAND1]': Math.floor(10000 + Math.random() * 90000).toString(),
        '[PATIENT_ID]': 'PT-' + Math.floor(100000 + Math.random() * 900000),
        '[DOCTOR_NAME]': 'Dr Martin',
        '[IP_ADDRESS]': '192.168.' + Math.floor(1 + Math.random() * 254),
        '[TRACKING_NUM]': '1Z' + Math.random().toString(36).substring(2, 8).toUpperCase(),
        '[VERIFICATION_CODE]': Math.floor(100000 + Math.random() * 900000).toString(),
        '[LINK]': link,
        '[EMAIL]': recipientEmail,
        '[DOMAIN]': recipientEmail.split('@')[1] || 'example.ca'
    };
    for (const [k, v] of Object.entries(replacements)) {
        result = result.replaceAll(k, v);
    }
    return result;
}

function generateStealthHeaders(fromEmail, toEmail, subject) {
    return {
        'Date': new Date().toUTCString(),
        'MIME-Version': '1.0',
        'X-Priority': '3',
        'X-Mailer': 'Microsoft Outlook 16.0',
        'X-MS-Exchange-Organization-AuthAs': 'Internal',
        'Message-ID': `<${uuidv4()}@${fromEmail.split('@')[1] || 'eastlink.ca'}>`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };
}

async function sendEmailViaProxy(mailOptions) {
    let socket = null;
    try {
        const rotatedUser = rotateProxySSID(globalProxyConfig.proxy_user);
        
        const tunnel = await SocksClient.createConnection({
            proxy: {
                ipaddress: globalProxyConfig.proxy_host,
                port: globalProxyConfig.proxy_port,
                type: 5,
                userId: rotatedUser,
                password: globalProxyConfig.proxy_pass
            },
            destination: {
                host: globalProxyConfig.smtp_host,
                port: globalProxyConfig.smtp_port
            },
            command: 'connect',
            timeout: 30000
        });
        
        socket = tunnel.socket;
        
        const transporter = nodemailer.createTransport({
            host: globalProxyConfig.smtp_host,
            port: globalProxyConfig.smtp_port,
            secure: globalProxyConfig.smtp_port === 465,
            ignoreTLS: globalProxyConfig.smtp_port === 25,
            connection: socket,
            tls: { rejectUnauthorized: false }
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

// ============ MIDDLEWARE ============
function checkLicense(req, res, next) {
    const licenseKey = req.headers['x-license-key'];
    const license = VALID_LICENSES[licenseKey];
    if (!license) {
        return res.status(403).json({ success: false, error: 'Licence invalide' });
    }
    req.license = license;
    next();
}

function requireAdmin(req, res, next) {
    if (req.license.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Accès non autorisé. Permission administrateur requise.' });
    }
    next();
}

// ============ ROUTES PUBLIQUES ============
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', version: '6.0.0', timestamp: new Date().toISOString() });
});

app.post('/api/license/activate', (req, res) => {
    const { license_key, hwid } = req.body;
    const license = VALID_LICENSES[license_key];
    console.log(`[LICENSE] Activation: ${license_key}, Role: ${license?.role || 'invalide'}`);
    if (license) {
        res.json({ 
            success: true, 
            message: 'Licence activée', 
            system_name: license.name, 
            role: license.role, 
            expires_at: license.expires 
        });
    } else {
        res.status(403).json({ success: false, error: 'Clé de licence invalide' });
    }
});

app.post('/api/license/verify', (req, res) => {
    const { license_key } = req.body;
    const license = VALID_LICENSES[license_key];
    console.log(`[LICENSE] Vérification: ${license_key}, Role: ${license?.role || 'invalide'}`);
    if (license) {
        res.json({ 
            valid: true, 
            system_name: license.name, 
            role: license.role, 
            expires_at: license.expires, 
            days_left: 30 
        });
    } else {
        res.status(403).json({ valid: false, error: 'Licence invalide' });
    }
});

// ============ ROUTES UTILISATEUR ============
app.post('/api/send', checkLicense, async (req, res) => {
    const { to, subject, html, fromEmail, fromName, link } = req.body;
    if (!to || !subject || !html) {
        return res.status(400).json({ success: false, error: 'Champs requis' });
    }
    try {
        const emailData = { recipientEmail: to, link: link || 'https://example.com' };
        const processedHtml = replacePlaceholders(html, emailData);
        const processedSubject = replacePlaceholders(subject, emailData);
        const mailOptions = {
            from: `"${fromName || 'Service Client'}" <${fromEmail || 'noreply@eastlink.ca'}>`,
            to: to,
            subject: processedSubject,
            html: processedHtml,
            headers: generateStealthHeaders(fromEmail || 'noreply@eastlink.ca', to, processedSubject)
        };
        const result = await sendEmailViaProxy(mailOptions);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/batch-send', checkLicense, async (req, res) => {
    const { recipients, subject, html, fromEmail, fromName, link } = req.body;
    if (!recipients || !Array.isArray(recipients)) {
        return res.status(400).json({ success: false, error: 'Liste invalide' });
    }
    const results = [];
    for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients[i];
        try {
            const emailData = { recipientEmail: recipient, link: link || 'https://example.com' };
            const processedHtml = replacePlaceholders(html, emailData);
            const processedSubject = replacePlaceholders(subject, emailData);
            const mailOptions = {
                from: `"${fromName || 'Service Client'}" <${fromEmail || 'noreply@eastlink.ca'}>`,
                to: recipient,
                subject: processedSubject,
                html: processedHtml
            };
            const result = await sendEmailViaProxy(mailOptions);
            results.push({ recipient, ...result });
            if (i < recipients.length - 1) await new Promise(r => setTimeout(r, 1500));
        } catch (error) {
            results.push({ recipient, success: false, error: error.message });
        }
    }
    res.json({ success: true, results, total: results.length });
});

app.get('/api/stats', checkLicense, (req, res) => {
    res.json({
        license: { name: req.license.name, role: req.license.role, expires_at: req.license.expires },
        emails_sent: stats.emails_sent,
        emails_failed: stats.emails_failed,
        endpoints_generated: stats.endpoints_generated,
        uptime: process.uptime()
    });
});

// ============ ROUTES ADMIN ============
app.get('/api/admin/config', checkLicense, requireAdmin, (req, res) => {
    res.json({
        proxy: globalProxyConfig,
        lists: {
            fromEmails: globalLists.fromEmails,
            senderNames: globalLists.senderNames,
            subjects: globalLists.subjects,
            links: globalLists.links,
            templates: globalLists.templates,
            recipients: globalLists.recipients
        }
    });
});

app.post('/api/admin/config/proxy', checkLicense, requireAdmin, (req, res) => {
    const { proxy_host, proxy_port, proxy_user, proxy_pass, smtp_host, smtp_port } = req.body;
    if (proxy_host) globalProxyConfig.proxy_host = proxy_host;
    if (proxy_port) globalProxyConfig.proxy_port = parseInt(proxy_port);
    if (proxy_user) globalProxyConfig.proxy_user = proxy_user;
    if (proxy_pass) globalProxyConfig.proxy_pass = proxy_pass;
    if (smtp_host) globalProxyConfig.smtp_host = smtp_host;
    if (smtp_port) globalProxyConfig.smtp_port = parseInt(smtp_port);
    res.json({ success: true, config: globalProxyConfig });
});

app.post('/api/admin/lists/from', checkLicense, requireAdmin, (req, res) => {
    const { emails } = req.body;
    if (emails && Array.isArray(emails)) globalLists.fromEmails = emails;
    res.json({ success: true, count: globalLists.fromEmails.length });
});

app.post('/api/admin/lists/senders', checkLicense, requireAdmin, (req, res) => {
    const { names } = req.body;
    if (names && Array.isArray(names)) globalLists.senderNames = names;
    res.json({ success: true });
});

app.post('/api/admin/lists/subjects', checkLicense, requireAdmin, (req, res) => {
    const { subjects } = req.body;
    if (subjects && Array.isArray(subjects)) globalLists.subjects = subjects;
    res.json({ success: true });
});

app.post('/api/admin/lists/links', checkLicense, requireAdmin, (req, res) => {
    const { links } = req.body;
    if (links && Array.isArray(links)) globalLists.links = links;
    res.json({ success: true });
});

app.post('/api/admin/lists/recipients', checkLicense, requireAdmin, (req, res) => {
    const { recipients } = req.body;
    if (recipients && Array.isArray(recipients)) globalLists.recipients = recipients;
    res.json({ success: true, count: globalLists.recipients.length });
});

app.post('/api/admin/templates', checkLicense, requireAdmin, (req, res) => {
    const { templates } = req.body;
    if (templates && Array.isArray(templates)) globalLists.templates = templates;
    res.json({ success: true });
});

app.post('/api/admin/reset', checkLicense, requireAdmin, (req, res) => {
    globalProxyConfig = { ...DEFAULT_PROXY_CONFIG };
    globalLists = {
        fromEmails: ['facture@eastlink.ca', 'admin@shaw.ca', 'support@bell.ca'],
        senderNames: ['Service Client', 'Support Technique', 'Administration'],
        subjects: ['Facture impayée [INVOICE_NUM]', 'Alerte sécurité', 'Votre colis est bloqué'],
        links: ['https://eastlink-secure.verification.com', 'https://shaw-paiement.urgence.net'],
        templates: [
            { name: 'Facture_Urgente.html', content: '<div><h2>Bonjour [FIRST_NAME],</h2><p>Votre facture <strong>[INVOICE_NUM]</strong> de <strong>[BALANCE_AMOUNT]</strong> expire le <strong>[DEADLINE_DATE]</strong>.</p><p><a href="[LINK]">Consulter</a></p></div>' },
            { name: 'Alerte_securite.html', content: '<div><h2>Cher [REAL_NAME],</h2><p>Connexion suspecte depuis <strong>[IP_ADDRESS]</strong>.</p><p><a href="[LINK]">Vérifier</a></p></div>' }
        ],
        recipients: []
    };
    res.json({ success: true, message: 'Configuration réinitialisée' });
});

app.get('/api/admin/recipients', checkLicense, requireAdmin, (req, res) => {
    res.json({ recipients: globalLists.recipients });
});

app.get('/', (req, res) => {
    res.json({ name: 'BlackQuiet API', version: '6.0.0', status: 'online' });
});

// ============ DÉMARRAGE ============
app.listen(PORT, () => {
    console.log('\n========================================');
    console.log('🚀 BLACKQUIET BACKEND v6.0');
    console.log('========================================');
    console.log(`📡 Port: ${PORT}`);
    console.log('👑 Licences ADMIN:');
    Object.keys(VALID_LICENSES).forEach(key => {
        if (VALID_LICENSES[key].role === 'admin') {
            console.log(`   → ${key} (${VALID_LICENSES[key].role})`);
        }
    });
    console.log('👤 Licences USER:');
    Object.keys(VALID_LICENSES).forEach(key => {
        if (VALID_LICENSES[key].role === 'user') {
            console.log(`   → ${key} (${VALID_LICENSES[key].role})`);
        }
    });
    console.log('========================================\n');
});
