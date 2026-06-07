// server.js - BACKEND COMPLET
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// ============ CONFIGURATION ============
const PROXY_CONFIG = {
    proxy_host: process.env.PROXY_HOST || 'niceproxy.io',
    proxy_port: parseInt(process.env.PROXY_PORT) || 17521,
    proxy_user_template: process.env.PROXY_USER || 'black_rIxx-country-CA-isp-as11260_eastlink',
    proxy_pass: process.env.PROXY_PASS || 'Kouame07',
    smtp_host: process.env.SMTP_HOST || 'smtp.eastlink.ca',
    smtp_port: parseInt(process.env.SMTP_PORT) || 25
};

let endpointCount = 0;
let emailSentCount = 0;
let emailFailedCount = 0;

// ============ LICENCE SIMPLE (sans Supabase pour le test) ============
// Liste des licences valides
const VALID_LICENSES = {
    'VALID-KEY-ABC123': { valid: true, system_name: 'Blackquiet User', expires_at: '2026-12-31T23:59:59.000Z' },
    'DEMO-2024-BLACKQUIET': { valid: true, system_name: 'Demo User', expires_at: '2025-12-31T23:59:59.000Z' },
    'TEST-1234': { valid: true, system_name: 'Test User', expires_at: '2026-12-31T23:59:59.000Z' }
};

function verifyLicense(licenseKey, hwid) {
    console.log(`[LICENSE] Vérification: ${licenseKey} (HWID: ${hwid})`);
    
    if (VALID_LICENSES[licenseKey]) {
        return { 
            valid: true, 
            system_name: VALID_LICENSES[licenseKey].system_name,
            expires_at: VALID_LICENSES[licenseKey].expires_at,
            message: 'Licence valide'
        };
    }
    
    return { valid: false, error: 'Clé de licence invalide' };
}

function requireLicense(req, res, next) {
    const licenseKey = req.headers['x-license-key'] || req.body.license_key;
    const hwid = req.headers['x-hwid'] || 'unknown';
    
    if (!licenseKey) {
        return res.status(401).json({ success: false, error: 'Clé de licence requise' });
    }
    
    const result = verifyLicense(licenseKey, hwid);
    
    if (!result.valid) {
        return res.status(403).json({ success: false, error: result.error });
    }
    
    req.license = result;
    next();
}

// ============ ROTATION SSID ============
function rotateProxySSID(username) {
    const newSsid = crypto.randomBytes(5).toString('hex').toUpperCase();
    endpointCount++;
    if (username.includes('-ssid-')) {
        return username.replace(/-ssid-[a-zA-Z0-9]+/, `-ssid-${newSsid}`);
    }
    return `${username}-ssid-${newSsid}`;
}

// ============ REMPLACEMENT PLACEHOLDERS ============
function replacePlaceholders(text, recipientEmail, link) {
    if (!text) return '';
    let result = text;
    const username = recipientEmail.split('@')[0] || 'client';
    const firstName = username.charAt(0).toUpperCase() + username.slice(1);
    const invoiceNum = 'INV-' + Math.floor(100000 + Math.random() * 900000);
    const amount = '$' + (Math.random() * 5000).toFixed(2);
    
    const replacements = {
        '[FIRST_NAME]': firstName,
        '[REAL_NAME]': firstName + ' Smith',
        '[INVOICE_NUM]': invoiceNum,
        '[BALANCE_AMOUNT]': amount,
        '[DATE]': new Date().toLocaleDateString(),
        '[TIME]': new Date().toLocaleTimeString(),
        '[RAND1]': Math.floor(10000 + Math.random() * 90000).toString(),
        '[PATIENT_ID]': 'PT-' + Math.floor(100000 + Math.random() * 900000),
        '[DOCTOR_NAME]': 'Dr Martin',
        '[IP_ADDRESS]': '192.168.' + Math.floor(1 + Math.random() * 254) + '.' + Math.floor(1 + Math.random() * 254),
        '[TRACKING_NUM]': '1Z' + crypto.randomBytes(4).toString('hex').toUpperCase(),
        '[VERIFICATION_CODE]': Math.floor(100000 + Math.random() * 900000).toString(),
        '[EMAIL]': recipientEmail,
        '[DOMAIN]': recipientEmail.split('@')[1] || 'example.ca',
        '[UNAME]': username
    };
    
    for (const [key, value] of Object.entries(replacements)) {
        result = result.replaceAll(key, value);
    }
    
    if (result.includes('[LINK]') && link) {
        result = result.replace('[LINK]', link);
    }
    
    return result;
}

// ============ ENVOI D'EMAIL SIMULÉ ============
async function sendEmail(mailOptions) {
    emailSentCount++;
    console.log(`[EMAIL] Envoyé à ${mailOptions.to}: ${mailOptions.subject}`);
    return { success: true, messageId: 'sim-' + Date.now(), simulated: true };
}

// ============ ROUTES ============

// Route racine
app.get('/', (req, res) => {
    res.json({
        message: 'BlackQuiet Proxy Bullet API',
        version: '3.0.0',
        status: 'online',
        endpoints: {
            'GET /': 'Liste des endpoints',
            'GET /api/health': 'Health check',
            'GET /api/config': 'Configuration',
            'POST /api/license/verify': 'Vérifier une licence',
            'POST /api/send': 'Envoyer un email',
            'GET /api/stats': 'Statistiques'
        }
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        service: 'BlackQuiet Sender',
        timestamp: new Date().toISOString(),
        version: '3.0.0'
    });
});

// Configuration
app.get('/api/config', (req, res) => {
    res.json({
        proxy_host: PROXY_CONFIG.proxy_host,
        proxy_port: PROXY_CONFIG.proxy_port,
        smtp_host: PROXY_CONFIG.smtp_host,
        smtp_port: PROXY_CONFIG.smtp_port,
        mode: 'ready',
        version: '3.0.0'
    });
});

// Vérification de licence (ROUTE CRITIQUE)
app.post('/api/license/verify', (req, res) => {
    const { license_key, hwid } = req.body;
    
    console.log(`[API] Vérification licence: ${license_key}`);
    
    if (!license_key) {
        return res.status(400).json({ success: false, error: 'Clé de licence requise' });
    }
    
    const result = verifyLicense(license_key, hwid || 'unknown');
    res.json(result);
});

// Envoi d'email
app.post('/api/send', requireLicense, async (req, res) => {
    const { to, subject, html, fromEmail, fromName, link } = req.body;
    
    console.log(`[API] Envoi email à: ${to}`);
    
    if (!to || !subject || !html) {
        return res.status(400).json({ success: false, error: 'Champs requis: to, subject, html' });
    }
    
    try {
        const processedHtml = replacePlaceholders(html, to, link);
        const processedSubject = replacePlaceholders(subject, to, link);
        
        const mailOptions = {
            from: `"${fromName || 'Service Client'}" <${fromEmail || 'noreply@eastlink.ca'}>`,
            to: to,
            subject: processedSubject,
            html: processedHtml
        };
        
        const result = await sendEmail(mailOptions);
        res.json(result);
        
    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Statistiques
app.get('/api/stats', requireLicense, (req, res) => {
    res.json({
        license: req.license,
        endpoints_generated: endpointCount,
        emails_sent: emailSentCount,
        emails_failed: emailFailedCount,
        uptime: process.uptime()
    });
});

// ============ DÉMARRAGE ============
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`🚀 BLACKQUIET BACKEND v3.0`);
    console.log(`========================================`);
    console.log(`📡 Port: ${PORT}`);
    console.log(`🔐 Licences valides: ${Object.keys(VALID_LICENSES).join(', ')}`);
    console.log(`========================================\n`);
});
