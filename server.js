// server.js - Backend avec gestion de licence
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// ============ CONFIGURATION ============
const app = express();
app.use(cors());
app.use(express.json());

// Initialisation Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// Configuration proxy (optionnelle pour l'envoi d'emails)
const PROXY_CONFIG = {
    proxy_host: process.env.PROXY_HOST || 'niceproxy.io',
    proxy_port: process.env.PROXY_PORT || 17521,
    proxy_user_template: process.env.PROXY_USER || 'black_rIxx-country-CA-isp-as11260_eastlink',
    proxy_pass: process.env.PROXY_PASS || 'Kouame07',
    smtp_host: process.env.SMTP_HOST || 'smtp.eastlink.ca',
    smtp_port: process.env.SMTP_PORT || 25
};

let endpointCount = 0;
let emailSentCount = 0;
let emailFailedCount = 0;

// ============ FONCTIONS DE LICENCE ============

// Générer un Hardware ID (simulé mais cohérent)
function generateHardwareId() {
    // En production, le client envoie son vrai HWID
    // Ici on simule un HWID basé sur l'IP + User-Agent + timestamp
    return 'HWID-' + crypto.randomBytes(16).toString('hex').toUpperCase();
}

// Vérifier une licence
async function verifyLicense(licenseKey, hwid, req) {
    try {
        // 1. Vérifier si la licence existe et est active
        const { data: license, error } = await supabase
            .from('licenses')
            .select('*')
            .eq('license_key', licenseKey)
            .eq('is_active', true)
            .single();
        
        if (error || !license) {
            // Log de la tentative échouée
            await supabase.from('license_logs').insert({
                license_key: licenseKey,
                hwid: hwid,
                status: 'INVALID_KEY',
                ip_address: req.ip,
                user_agent: req.headers['user-agent']
            });
            return { valid: false, error: 'Invalid license key' };
        }
        
        // 2. Vérifier l'expiration
        const expiresAt = new Date(license.expires_at);
        const now = new Date();
        
        if (expiresAt < now) {
            await supabase.from('license_logs').insert({
                license_key: licenseKey,
                hwid: hwid,
                status: 'EXPIRED',
                ip_address: req.ip,
                user_agent: req.headers['user-agent']
            });
            return { valid: false, error: 'License expired', expires_at: license.expires_at };
        }
        
        // 3. Si HWID est défini dans la licence, vérifier qu'il correspond
        if (license.hwid && license.hwid !== hwid) {
            await supabase.from('license_logs').insert({
                license_key: licenseKey,
                hwid: hwid,
                status: 'HWID_MISMATCH',
                ip_address: req.ip,
                user_agent: req.headers['user-agent']
            });
            return { valid: false, error: 'Hardware ID mismatch' };
        }
        
        // 4. Mettre à jour le HWID si vide
        if (!license.hwid && hwid) {
            await supabase
                .from('licenses')
                .update({ 
                    hwid: hwid,
                    last_seen: new Date().toISOString(),
                    platform: req.headers['user-agent']?.substring(0, 100),
                    machine: process.platform
                })
                .eq('license_key', licenseKey);
        } else {
            // Sinon, juste mettre à jour last_seen
            await supabase
                .from('licenses')
                .update({ last_seen: new Date().toISOString() })
                .eq('license_key', licenseKey);
        }
        
        // 5. Log de succès
        await supabase.from('license_logs').insert({
            license_key: licenseKey,
            hwid: hwid,
            status: 'SUCCESS',
            ip_address: req.ip,
            user_agent: req.headers['user-agent']
        });
        
        return { 
            valid: true, 
            system_name: license.system_name || 'Blackquiet User',
            expires_at: license.expires_at,
            message: 'License verified successfully'
        };
        
    } catch (error) {
        console.error('License verification error:', error);
        return { valid: false, error: 'Internal server error' };
    }
}

// Créer une nouvelle licence (admin uniquement - à sécuriser)
async function createLicense(licenseKey, expiresInDays = 365, systemName = null) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    
    const { data, error } = await supabase
        .from('licenses')
        .insert({
            license_key: licenseKey,
            expires_at: expiresAt.toISOString(),
            system_name: systemName,
            is_active: true
        })
        .select()
        .single();
    
    if (error) throw error;
    return data;
}

// ============ ROTATION SSID & PLACEHOLDERS ============
function rotateProxySSID(username) {
    const newSsid = crypto.randomBytes(5).toString('hex').toUpperCase();
    endpointCount++;
    if (username.includes('-ssid-')) {
        return username.replace(/-ssid-[a-zA-Z0-9]+/, `-ssid-${newSsid}`);
    }
    return `${username}-ssid-${newSsid}`;
}

function replacePlaceholders(text, recipientEmail, link) {
    if (!text) return '';
    let result = text;
    const username = recipientEmail.split('@')[0] || 'client';
    const firstName = username.charAt(0).toUpperCase() + username.slice(1);
    const invoiceNum = 'INV-' + Math.floor(100000 + Math.random() * 900000);
    
    const replacements = {
        '[FIRST_NAME]': firstName,
        '[REAL_NAME]': firstName + ' ' + ['Smith', 'Johnson', 'Williams'][Math.floor(Math.random() * 3)],
        '[INVOICE_NUM]': invoiceNum,
        '[BALANCE_AMOUNT]': '$' + (Math.random() * 5000).toFixed(2),
        '[DATE]': new Date().toLocaleDateString(),
        '[TIME]': new Date().toLocaleTimeString(),
        '[RAND1]': Math.floor(10000 + Math.random() * 90000).toString(),
        '[PATIENT_ID]': 'PT-' + Math.floor(100000 + Math.random() * 900000),
        '[TRACKING_NUM]': '1Z' + crypto.randomBytes(4).toString('hex').toUpperCase(),
        '[IP_ADDRESS]': '192.168.' + Math.floor(1 + Math.random() * 254) + '.' + Math.floor(1 + Math.random() * 254)
    };
    
    for (const [key, value] of Object.entries(replacements)) {
        result = result.replaceAll(key, value);
    }
    
    if (result.includes('[LINK]') && link) {
        result = result.replace('[LINK]', link);
    }
    
    return result;
}

// ============ ENVOI D'EMAIL (simulation ou réel) ============
async function sendEmail(mailOptions) {
    // Mode simulation par défaut (sauf si socks et nodemailer sont chargés)
    emailSentCount++;
    return { success: true, messageId: 'sim-' + Date.now(), simulated: true };
}

// ============ MIDDLEWARE DE VÉRIFICATION DE LICENCE ============
async function requireLicense(req, res, next) {
    const licenseKey = req.headers['x-license-key'];
    const hwid = req.headers['x-hwid'];
    
    if (!licenseKey) {
        return res.status(401).json({ 
            success: false, 
            error: 'License key required',
            code: 'MISSING_LICENSE'
        });
    }
    
    const result = await verifyLicense(licenseKey, hwid || 'unknown', req);
    
    if (!result.valid) {
        return res.status(403).json({ 
            success: false, 
            error: result.error,
            code: result.error === 'Expired' ? 'LICENSE_EXPIRED' : 'INVALID_LICENSE',
            expires_at: result.expires_at
        });
    }
    
    req.license = result;
    next();
}

// ============ ROUTES API ============

// Route publique : vérifier une licence (sans authentification)
app.post('/api/license/verify', async (req, res) => {
    const { license_key, hwid } = req.body;
    
    if (!license_key) {
        return res.status(400).json({ success: false, error: 'License key required' });
    }
    
    const result = await verifyLicense(license_key, hwid || 'unknown', req);
    res.json(result);
});

// Route publique : obtenir le HWID de démonstration
app.get('/api/license/demo-hwid', (req, res) => {
    res.json({ 
        hwid: generateHardwareId(),
        note: "Ce HWID est généré côté serveur. En production, le client doit envoyer son vrai HWID."
    });
});

// Route protégée par licence : envoyer un email
app.post('/api/send', requireLicense, async (req, res) => {
    const { to, subject, html, fromEmail, fromName, link } = req.body;
    
    if (!to || !subject || !html) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
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
});

// Route protégée : envoi multiple
app.post('/api/batch-send', requireLicense, async (req, res) => {
    const { recipients, subject, html, fromEmail, fromName, link } = req.body;
    
    if (!recipients || !Array.isArray(recipients)) {
        return res.status(400).json({ success: false, error: 'Invalid recipients' });
    }
    
    const results = [];
    for (const recipient of recipients) {
        const processedHtml = replacePlaceholders(html, recipient, link);
        const processedSubject = replacePlaceholders(subject, recipient, link);
        
        const mailOptions = {
            from: `"${fromName || 'Service Client'}" <${fromEmail || 'noreply@eastlink.ca'}>`,
            to: recipient,
            subject: processedSubject,
            html: processedHtml
        };
        
        const result = await sendEmail(mailOptions);
        results.push({ recipient, ...result });
        
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    res.json({ success: true, results });
});

// Route protégée : statistiques
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

// Route publique : configuration (sans licence)
app.get('/api/config', (req, res) => {
    res.json({
        proxy_host: PROXY_CONFIG.proxy_host,
        proxy_port: PROXY_CONFIG.proxy_port,
        smtp_host: PROXY_CONFIG.smtp_host,
        smtp_port: PROXY_CONFIG.smtp_port,
        mode: 'simulation',
        license_required: true,
        version: '2.0.0'
    });
});

// Route publique : health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        service: 'BlackQuiet Sender',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        license_required: true
    });
});

// Route publique : liste des endpoints
app.get('/', (req, res) => {
    res.json({
        message: 'BlackQuiet Proxy Bullet API',
        version: '2.0.0',
        license_required: true,
        endpoints: {
            'POST /api/license/verify': 'Vérifier une licence',
            'GET /api/license/demo-hwid': 'Obtenir un HWID de démonstration',
            'GET /api/health': 'Health check',
            'GET /api/config': 'Configuration',
            'POST /api/send': 'Envoyer un email (nécessite licence)',
            'POST /api/batch-send': 'Envoi multiple (nécessite licence)',
            'GET /api/stats': 'Statistiques (nécessite licence)'
        }
    });
});

// ============ ADMIN ROUTES (à sécuriser avec un token) ============
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-secret-token';

app.post('/api/admin/license/create', (req, res) => {
    const { token, license_key, expires_days, system_name } = req.body;
    
    if (token !== ADMIN_TOKEN) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    
    createLicense(license_key, expires_days || 365, system_name)
        .then(license => res.json({ success: true, license }))
        .catch(error => res.status(500).json({ success: false, error: error.message }));
});

app.get('/api/admin/licenses', async (req, res) => {
    const { token } = req.query;
    
    if (token !== ADMIN_TOKEN) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    
    const { data, error } = await supabase
        .from('licenses')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, licenses: data });
});

// ============ DÉMARRAGE ============
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`🚀 BLACKQUIET BACKEND v2.0 - LICENCE`);
    console.log(`========================================`);
    console.log(`📡 Port: ${PORT}`);
    console.log(`🔐 Licence requise: OUI`);
    console.log(`📧 Mode: SIMULATION (sans 9Proxy)`);
    console.log(`========================================\n`);
});
