// server.js - BACKEND COMPLET AVEC TOUTES LES ROUTES
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// ============ SUPABASE ============
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// ============ CONFIGURATION 9PROXY ============
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

// ============ FONCTIONS DE LICENCE ============
async function logLicenseAttempt(licenseKey, hwid, status, req) {
    try {
        await supabase.from('license_logs').insert({
            license_key: licenseKey,
            hwid: hwid,
            status: status,
            ip_address: req.headers['x-forwarded-for'] || req.ip || 'unknown',
            user_agent: req.headers['user-agent'] || 'unknown'
        });
    } catch (error) {
        console.error('Erreur log:', error.message);
    }
}

async function verifyLicense(licenseKey, hwid, req) {
    try {
        const { data: license, error } = await supabase
            .from('licenses')
            .select('*')
            .eq('license_key', licenseKey)
            .eq('is_active', true)
            .single();
        
        if (error || !license) {
            await logLicenseAttempt(licenseKey, hwid, 'INVALID_KEY', req);
            return { valid: false, error: 'Clé de licence invalide' };
        }
        
        const expiresAt = new Date(license.expires_at);
        const now = new Date();
        
        if (expiresAt < now) {
            await logLicenseAttempt(licenseKey, hwid, 'EXPIRED', req);
            return { valid: false, error: 'Licence expirée', expires_at: license.expires_at };
        }
        
        if (license.hwid && license.hwid !== hwid) {
            await logLicenseAttempt(licenseKey, hwid, 'HWID_MISMATCH', req);
            return { valid: false, error: 'Cette licence est liée à un autre appareil' };
        }
        
        if (!license.hwid && hwid && hwid !== 'unknown') {
            await supabase
                .from('licenses')
                .update({ 
                    hwid: hwid,
                    last_seen: new Date().toISOString(),
                    platform: req.headers['user-agent']?.substring(0, 100)
                })
                .eq('license_key', licenseKey);
        } else {
            await supabase
                .from('licenses')
                .update({ last_seen: new Date().toISOString() })
                .eq('license_key', licenseKey);
        }
        
        await logLicenseAttempt(licenseKey, hwid, 'SUCCESS', req);
        
        return { 
            valid: true, 
            system_name: license.system_name || 'Blackquiet User',
            expires_at: license.expires_at,
            message: 'Licence valide'
        };
        
    } catch (error) {
        console.error('Erreur vérification:', error.message);
        return { valid: false, error: 'Erreur serveur' };
    }
}

async function requireLicense(req, res, next) {
    const licenseKey = req.headers['x-license-key'];
    const hwid = req.headers['x-hwid'];
    
    if (!licenseKey) {
        return res.status(401).json({ success: false, error: 'Clé de licence requise' });
    }
    
    const result = await verifyLicense(licenseKey, hwid || 'unknown', req);
    
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
    
    const replacements = {
        '[FIRST_NAME]': firstName,
        '[REAL_NAME]': firstName + ' Smith',
        '[INVOICE_NUM]': invoiceNum,
        '[BALANCE_AMOUNT]': '$' + (Math.random() * 5000).toFixed(2),
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

// ============ ENVOI D'EMAIL (SIMULATION SANS SOCKS) ============
async function sendEmail(mailOptions) {
    // Mode simulation car SOCKS nécessite des dépendances supplémentaires
    emailSentCount++;
    console.log(`[SIMULATION] Email envoyé à ${mailOptions.to}`);
    return { success: true, messageId: 'sim-' + Date.now(), simulated: true };
}

// ============ ROUTES ============

// Route racine
app.get('/', (req, res) => {
    res.json({
        message: 'BlackQuiet Proxy Bullet API',
        version: '3.0.0',
        endpoints: {
            'GET /': 'Liste des endpoints',
            'GET /api/health': 'Health check',
            'GET /api/config': 'Configuration',
            'POST /api/license/verify': 'Vérifier une licence',
            'POST /api/send': 'Envoyer un email (licence requise)',
            'GET /api/stats': 'Statistiques (licence requise)'
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

// Vérification de licence (ROUTE IMPORTANTE)
app.post('/api/license/verify', async (req, res) => {
    const { license_key, hwid } = req.body;
    
    console.log(`[LICENSE] Requête reçue pour: ${license_key}`);
    
    if (!license_key) {
        return res.status(400).json({ success: false, error: 'Clé de licence requise' });
    }
    
    const result = await verifyLicense(license_key, hwid || 'unknown', req);
    res.json(result);
});

// Envoi d'email (protégé par licence)
app.post('/api/send', requireLicense, async (req, res) => {
    const { to, subject, html, fromEmail, fromName, link } = req.body;
    
    if (!to || !subject || !html) {
        return res.status(400).json({ success: false, error: 'Champs requis: to, subject, html' });
    }
    
    try {
        const processedHtml = replacePlaceholders(html, to, link);
        const processedSubject = replacePlaceholders(subject, to, link);
        const finalFromEmail = fromEmail || 'noreply@eastlink.ca';
        const finalFromName = fromName || 'Service Client';
        
        const mailOptions = {
            from: `"${finalFromName}" <${finalFromEmail}>`,
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
        license: {
            valid: true,
            expires_at: req.license.expires_at,
            system_name: req.license.system_name
        },
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
    console.log(`🔐 Licence requise: OUI`);
    console.log(`🗄️ Supabase: ${process.env.SUPABASE_URL ? 'CONNECTÉ' : 'NON CONNECTÉ'}`);
    console.log(`========================================\n`);
});
