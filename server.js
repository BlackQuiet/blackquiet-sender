// ============================================
// BLACKQUIET PROXY BULLET - BACKEND COMPLET
// AVEC GESTION DE LICENCE VIA SUPABASE
// ============================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// ============ INITIALISATION ============
const app = express();
app.use(cors());
app.use(express.json());

// ============ CONFIGURATION SUPABASE ============
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// ============ CONFIGURATION PROXY 9Proxy ============
const PROXY_CONFIG = {
    proxy_host: process.env.PROXY_HOST || 'niceproxy.io',
    proxy_port: process.env.PROXY_PORT || 17521,
    proxy_user_template: process.env.PROXY_USER || 'black_rIxx-country-CA-isp-as11260_eastlink',
    proxy_pass: process.env.PROXY_PASS || 'Kouame07',
    smtp_host: process.env.SMTP_HOST || 'smtp.eastlink.ca',
    smtp_port: process.env.SMTP_PORT || 25
};

// ============ VARIABLES STATISTIQUES ============
let endpointCount = 0;
let emailSentCount = 0;
let emailFailedCount = 0;

// ============ FONCTIONS DE LICENCE ============

// Générer un Hardware ID (simulé côté serveur pour la démo)
function generateHardwareId() {
    return 'HWID-' + crypto.randomBytes(16).toString('hex').toUpperCase();
}

// Vérifier une licence dans Supabase
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
            await logLicenseAttempt(licenseKey, hwid, 'INVALID_KEY', req);
            return { valid: false, error: 'Clé de licence invalide' };
        }
        
        // 2. Vérifier l'expiration
        const expiresAt = new Date(license.expires_at);
        const now = new Date();
        
        if (expiresAt < now) {
            await logLicenseAttempt(licenseKey, hwid, 'EXPIRED', req);
            return { valid: false, error: 'Licence expirée', expires_at: license.expires_at };
        }
        
        // 3. Vérifier le HWID si déjà lié
        if (license.hwid && license.hwid !== hwid) {
            await logLicenseAttempt(licenseKey, hwid, 'HWID_MISMATCH', req);
            return { valid: false, error: 'Cette licence est liée à un autre appareil' };
        }
        
        // 4. Lier le HWID si ce n'est pas déjà fait
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
        
        // 5. Log de succès
        await logLicenseAttempt(licenseKey, hwid, 'SUCCESS', req);
        
        return { 
            valid: true, 
            system_name: license.system_name || 'Blackquiet User',
            expires_at: license.expires_at,
            message: 'Licence valide'
        };
        
    } catch (error) {
        console.error('Erreur vérification licence:', error.message);
        return { valid: false, error: 'Erreur serveur' };
    }
}

// Logger les tentatives de licence
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

// Créer une nouvelle licence (admin)
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

// ============ MIDDLEWARE DE VÉRIFICATION DE LICENCE ============
async function requireLicense(req, res, next) {
    const licenseKey = req.headers['x-license-key'];
    const hwid = req.headers['x-hwid'];
    
    if (!licenseKey) {
        return res.status(401).json({ 
            success: false, 
            error: 'Clé de licence requise',
            code: 'MISSING_LICENSE'
        });
    }
    
    const result = await verifyLicense(licenseKey, hwid || 'unknown', req);
    
    if (!result.valid) {
        return res.status(403).json({ 
            success: false, 
            error: result.error,
            code: result.error === 'Licence expirée' ? 'LICENSE_EXPIRED' : 'INVALID_LICENSE',
            expires_at: result.expires_at
        });
    }
    
    req.license = result;
    next();
}

// ============ FONCTIONS UTILITAIRES ============

// Rotation SSID (identique au code original)
function rotateProxySSID(username) {
    const newSsid = crypto.randomBytes(5).toString('hex').toUpperCase();
    endpointCount++;
    if (username.includes('-ssid-')) {
        return username.replace(/-ssid-[a-zA-Z0-9]+/, `-ssid-${newSsid}`);
    }
    return `${username}-ssid-${newSsid}`;
}

// Remplacement des placeholders (comme dans l'original)
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
        '[RAND2]': Math.floor(10000000 + Math.random() * 90000000).toString(),
        '[PATIENT_ID]': 'PT-' + Math.floor(100000 + Math.random() * 900000),
        '[MEDICAL_RECORD]': 'MRN-' + Math.floor(1000000 + Math.random() * 9000000),
        '[DOCTOR_NAME]': 'Dr ' + ['Martin', 'Bernard', 'Dubois'][Math.floor(Math.random() * 3)],
        '[TRACKING_NUM]': '1Z' + crypto.randomBytes(4).toString('hex').toUpperCase(),
        '[VERIFICATION_CODE]': Math.floor(100000 + Math.random() * 900000).toString(),
        '[IP_ADDRESS]': '192.168.' + Math.floor(1 + Math.random() * 254) + '.' + Math.floor(1 + Math.random() * 254)
    };
    
    for (const [key, value] of Object.entries(replacements)) {
        result = result.replaceAll(key, value);
    }
    
    if (result.includes('[LINK]') && link) {
        result = result.replace('[LINK]', link);
    } else if (result.includes('[LINK]')) {
        result = result.replace('[LINK]', 'https://tinyurl.com/' + Math.random().toString(36).substring(2, 8));
    }
    
    return result;
}

// ============ ENVOI D'EMAIL ============
async function sendEmailWithProxy(mailOptions) {
    // Tentative d'import des modules (s'ils sont installés)
    let SocksClient, nodemailer;
    try {
        SocksClient = require('socks').SocksClient;
        nodemailer = require('nodemailer');
    } catch (error) {
        console.log('[SIMULATION] Modules SOCKS non disponibles');
        emailSentCount++;
        return { success: true, messageId: 'sim-' + Date.now(), simulated: true };
    }
    
    try {
        const rotatedUser = rotateProxySSID(PROXY_CONFIG.proxy_user_template);
        
        console.log(`[PROXY] Tunnel vers ${PROXY_CONFIG.proxy_host}:${PROXY_CONFIG.proxy_port}`);
        
        const tunnel = await SocksClient.createConnection({
            proxy: {
                ipaddress: PROXY_CONFIG.proxy_host,
                port: parseInt(PROXY_CONFIG.proxy_port),
                type: 5,
                userId: rotatedUser,
                password: PROXY_CONFIG.proxy_pass
            },
            destination: {
                host: PROXY_CONFIG.smtp_host,
                port: parseInt(PROXY_CONFIG.smtp_port)
            },
            command: 'connect'
        });
        
        const transporter = nodemailer.createTransport({
            host: PROXY_CONFIG.smtp_host,
            port: parseInt(PROXY_CONFIG.smtp_port),
            secure: PROXY_CONFIG.smtp_port === 465,
            ignoreTLS: PROXY_CONFIG.smtp_port === 25,
            connection: tunnel.socket,
            tls: { rejectUnauthorized: false },
            timeout: 30000
        });
        
        const result = await transporter.sendMail(mailOptions);
        transporter.close();
        tunnel.socket.end();
        
        emailSentCount++;
        console.log(`[SUCCÈS] Email envoyé à ${mailOptions.to}`);
        return { success: true, messageId: result.messageId };
        
    } catch (error) {
        emailFailedCount++;
        console.error(`[ERREUR] ${error.message}`);
        return { success: false, error: error.message };
    }
}

// ============ ROUTES PUBLIQUES ============

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        service: 'BlackQuiet Sender',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        license_required: true
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
        license_required: true,
        version: '2.0.0'
    });
});

// Vérifier une licence (sans authentification)
app.post('/api/license/verify', async (req, res) => {
    const { license_key, hwid } = req.body;
    
    if (!license_key) {
        return res.status(400).json({ success: false, error: 'Clé de licence requise' });
    }
    
    const result = await verifyLicense(license_key, hwid || 'unknown', req);
    res.json(result);
});

// Obtenir un HWID de démonstration
app.get('/api/license/demo-hwid', (req, res) => {
    res.json({ 
        hwid: generateHardwareId(),
        note: "Ce HWID est généré côté serveur. En production, le client doit envoyer son vrai HWID."
    });
});

// Route racine
app.get('/', (req, res) => {
    res.json({
        message: 'BlackQuiet Proxy Bullet API',
        version: '2.0.0',
        license_required: true,
        endpoints: {
            'GET /': 'Liste des endpoints',
            'GET /api/health': 'Health check',
            'GET /api/config': 'Configuration',
            'POST /api/license/verify': 'Vérifier une licence',
            'GET /api/license/demo-hwid': 'Obtenir un HWID de démonstration',
            'POST /api/send': 'Envoyer un email (licence requise)',
            'POST /api/batch-send': 'Envoi multiple (licence requise)',
            'GET /api/stats': 'Statistiques (licence requise)'
        }
    });
});

// ============ ROUTES PROTÉGÉES PAR LICENCE ============

// Envoyer un email
app.post('/api/send', requireLicense, async (req, res) => {
    const { to, subject, html, fromEmail, fromName, link } = req.body;
    
    if (!to || !subject || !html) {
        return res.status(400).json({ success: false, error: 'Champs requis: to, subject, html' });
    }
    
    const processedHtml = replacePlaceholders(html, to, link);
    const processedSubject = replacePlaceholders(subject, to, link);
    
    const mailOptions = {
        from: `"${fromName || 'Service Client'}" <${fromEmail || 'noreply@eastlink.ca'}>`,
        to: to,
        subject: processedSubject,
        html: processedHtml,
        headers: {
            'X-Priority': '3',
            'X-Mailer': 'Microsoft Outlook 16.0',
            'X-MS-Exchange-Organization-AuthAs': 'Internal'
        }
    };
    
    const result = await sendEmailWithProxy(mailOptions);
    res.json(result);
});

// Envoi multiple (batch)
app.post('/api/batch-send', requireLicense, async (req, res) => {
    const { recipients, subject, html, fromEmail, fromName, link } = req.body;
    
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({ success: false, error: 'Liste de destinataires invalide' });
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
        
        const result = await sendEmailWithProxy(mailOptions);
        results.push({ recipient, ...result });
        
        // Pause entre les envois pour éviter la détection
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    res.json({ success: true, results });
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
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// ============ ROUTES ADMIN (protégées par token) ============
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-secret-token';

// Créer une licence (admin)
app.post('/api/admin/license/create', async (req, res) => {
    const { token, license_key, expires_days, system_name } = req.body;
    
    if (token !== ADMIN_TOKEN) {
        return res.status(403).json({ success: false, error: 'Non autorisé' });
    }
    
    if (!license_key) {
        return res.status(400).json({ success: false, error: 'License key required' });
    }
    
    try {
        const license = await createLicense(license_key, expires_days || 365, system_name);
        res.json({ success: true, license });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Lister toutes les licences (admin)
app.get('/api/admin/licenses', async (req, res) => {
    const { token } = req.query;
    
    if (token !== ADMIN_TOKEN) {
        return res.status(403).json({ success: false, error: 'Non autorisé' });
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
    console.log('\n========================================');
    console.log('🚀 BLACKQUIET BACKEND v2.0');
    console.log('========================================');
    console.log(`📡 Port: ${PORT}`);
    console.log(`🔐 Licence requise: OUI`);
    console.log(`📧 Mode: ${PROXY_CONFIG.proxy_host ? 'PRÊT' : 'SIMULATION'}`);
    console.log(`🗄️ Supabase: ${process.env.SUPABASE_URL ? 'CONNECTÉ' : 'NON CONNECTÉ'}`);
    console.log('========================================\n');
});
