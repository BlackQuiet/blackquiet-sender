// ============================================
// BLACKQUIET PROXY BULLET - BACKEND RÉEL
// AVEC TUNNEL SOCKS5 VERS 9PROXY
// GESTION DE LICENCE VIA SUPABASE
// ============================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { SocksClient } = require('socks');
const nodemailer = require('nodemailer');
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

// ============ CONFIGURATION 9PROXY ============
const PROXY_CONFIG = {
    proxy_host: process.env.PROXY_HOST || 'niceproxy.io',
    proxy_port: parseInt(process.env.PROXY_PORT) || 17521,
    proxy_user_template: process.env.PROXY_USER || 'black_rIxx-country-CA-isp-as11260_eastlink',
    proxy_pass: process.env.PROXY_PASS || 'Kouame07',
    smtp_host: process.env.SMTP_HOST || 'smtp.eastlink.ca',
    smtp_port: parseInt(process.env.SMTP_PORT) || 25
};

// ============ VARIABLES STATISTIQUES ============
let endpointCount = 0;
let emailSentCount = 0;
let emailFailedCount = 0;

// ============ FONCTIONS DE LICENCE ============

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
            expires_at: license.expires_at
        };
        
    } catch (error) {
        console.error('Erreur vérification licence:', error.message);
        return { valid: false, error: 'Erreur serveur' };
    }
}

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
            code: result.error === 'Licence expirée' ? 'LICENSE_EXPIRED' : 'INVALID_LICENSE'
        });
    }
    
    req.license = result;
    next();
}

// ============ ROTATION SSID (CODE ORIGINAL) ============
function rotateProxySSID(username) {
    const newSsid = crypto.randomBytes(5).toString('hex').toUpperCase();
    endpointCount++;
    if (username.includes('-ssid-')) {
        return username.replace(/-ssid-[a-zA-Z0-9]+/, `-ssid-${newSsid}`);
    }
    return `${username}-ssid-${newSsid}`;
}

// ============ REMPLACEMENT DES PLACEHOLDERS ============
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
        '[IP_ADDRESS]': '192.168.' + Math.floor(1 + Math.random() * 254) + '.' + Math.floor(1 + Math.random() * 254),
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

// ============ ENVOI D'EMAIL VIA TUNNEL SOCKS5 RÉEL ============
async function sendEmailViaProxy(mailOptions) {
    let socket = null;
    
    try {
        const rotatedUser = rotateProxySSID(PROXY_CONFIG.proxy_user_template);
        
        console.log(`[PROXY] Tunnel SOCKS5 vers ${PROXY_CONFIG.proxy_host}:${PROXY_CONFIG.proxy_port}`);
        console.log(`[PROXY] Username: ${rotatedUser.substring(0, 60)}...`);
        console.log(`[PROXY] Destination: ${PROXY_CONFIG.smtp_host}:${PROXY_CONFIG.smtp_port}`);
        
        // Création du tunnel SOCKS5
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
        
        // Création du transporteur Nodemailer via le tunnel
        const transporter = nodemailer.createTransport({
            host: PROXY_CONFIG.smtp_host,
            port: PROXY_CONFIG.smtp_port,
            secure: PROXY_CONFIG.smtp_port === 465,
            ignoreTLS: PROXY_CONFIG.smtp_port === 25,
            connection: socket,
            tls: { rejectUnauthorized: false },
            timeout: 30000,
            socketTimeout: 30000
        });
        
        // Envoi de l'email
        const result = await transporter.sendMail(mailOptions);
        transporter.close();
        
        emailSentCount++;
        console.log(`[SUCCÈS] Email envoyé à ${mailOptions.to}`);
        console.log(`[SUCCÈS] Message ID: ${result.messageId}`);
        
        return { success: true, messageId: result.messageId };
        
    } catch (error) {
        emailFailedCount++;
        console.error(`[ERREUR] ${error.message}`);
        return { success: false, error: error.message };
    } finally {
        if (socket && !socket.destroyed) {
            socket.end();
        }
    }
}

// ============ GÉNÉRATION DES HEADERS STEALTH ============
function generateStealthHeaders(fromEmail, toEmail, proxyHost, subject) {
    const headers = {
        'Date': new Date().toUTCString(),
        'MIME-Version': '1.0',
        'Content-Language': 'en-US',
        'X-Priority': '3',
        'X-Mailer': 'Microsoft Outlook 16.0',
        'X-MimeOLE': 'Produced By Microsoft MimeOLE V16.0.0.0',
        'X-MS-Exchange-Organization-AuthAs': 'Internal',
        'X-MS-Exchange-Organization-AuthMechanism': '04',
        'Thread-Topic': subject,
        'X-Auto-Response-Suppress': 'All'
    };
    
    if (proxyHost) {
        headers['X-Originating-IP'] = `[${proxyHost}]`;
    }
    
    return headers;
}

// ============ ROUTES PUBLIQUES ============

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        service: 'BlackQuiet Sender',
        timestamp: new Date().toISOString(),
        version: '3.0.0',
        license_required: true,
        mode: 'REAL'
    });
});

app.get('/api/config', (req, res) => {
    res.json({
        proxy_host: PROXY_CONFIG.proxy_host,
        proxy_port: PROXY_CONFIG.proxy_port,
        smtp_host: PROXY_CONFIG.smtp_host,
        smtp_port: PROXY_CONFIG.smtp_port,
        mode: 'REAL',
        license_required: true,
        version: '3.0.0'
    });
});

app.post('/api/license/verify', async (req, res) => {
    const { license_key, hwid } = req.body;
    
    if (!license_key) {
        return res.status(400).json({ success: false, error: 'Clé de licence requise' });
    }
    
    const result = await verifyLicense(license_key, hwid || 'unknown', req);
    res.json(result);
});

app.get('/', (req, res) => {
    res.json({
        message: 'BlackQuiet Proxy Bullet API - MODE RÉEL',
        version: '3.0.0',
        license_required: true,
        mode: 'REAL - Tunnel SOCKS5 actif',
        endpoints: {
            'GET /': 'Liste des endpoints',
            'GET /api/health': 'Health check',
            'GET /api/config': 'Configuration',
            'POST /api/license/verify': 'Vérifier une licence',
            'POST /api/send': 'Envoyer un email (licence requise)',
            'POST /api/batch-send': 'Envoi multiple (licence requise)',
            'GET /api/stats': 'Statistiques (licence requise)',
            'POST /api/admin/license/create': 'Créer une licence (admin)',
            'GET /api/admin/licenses': 'Lister les licences (admin)'
        }
    });
});

// ============ ROUTES PROTÉGÉES ============

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
            html: processedHtml,
            headers: generateStealthHeaders(finalFromEmail, to, PROXY_CONFIG.proxy_host, processedSubject)
        };
        
        const result = await sendEmailViaProxy(mailOptions);
        res.json(result);
        
    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/batch-send', requireLicense, async (req, res) => {
    const { recipients, subject, html, fromEmail, fromName, link } = req.body;
    
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({ success: false, error: 'Liste de destinataires invalide' });
    }
    
    const results = [];
    for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients[i];
        try {
            const processedHtml = replacePlaceholders(html, recipient, link);
            const processedSubject = replacePlaceholders(subject, recipient, link);
            const finalFromEmail = fromEmail || 'noreply@eastlink.ca';
            const finalFromName = fromName || 'Service Client';
            
            const mailOptions = {
                from: `"${finalFromName}" <${finalFromEmail}>`,
                to: recipient,
                subject: processedSubject,
                html: processedHtml,
                headers: generateStealthHeaders(finalFromEmail, recipient, PROXY_CONFIG.proxy_host, processedSubject)
            };
            
            const result = await sendEmailViaProxy(mailOptions);
            results.push({ recipient, ...result });
            
            // Pause entre les envois pour éviter la détection
            if (i < recipients.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
            
        } catch (error) {
            results.push({ recipient, success: false, error: error.message });
        }
    }
    
    res.json({ success: true, results });
});

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
        success_rate: emailSentCount + emailFailedCount > 0 
            ? ((emailSentCount / (emailSentCount + emailFailedCount)) * 100).toFixed(2) + '%'
            : '0%',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// ============ ROUTES ADMIN ============
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-secret-token';

app.post('/api/admin/license/create', async (req, res) => {
    const { token, license_key, expires_days, system_name } = req.body;
    
    if (token !== ADMIN_TOKEN) {
        return res.status(403).json({ success: false, error: 'Non autorisé' });
    }
    
    if (!license_key) {
        return res.status(400).json({ success: false, error: 'License key required' });
    }
    
    try {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + (expires_days || 365));
        
        const { data, error } = await supabase
            .from('licenses')
            .insert({
                license_key: license_key,
                expires_at: expiresAt.toISOString(),
                system_name: system_name || null,
                is_active: true
            })
            .select()
            .single();
        
        if (error) throw error;
        res.json({ success: true, license: data });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

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
    console.log('🚀 BLACKQUIET BACKEND v3.0 - MODE RÉEL');
    console.log('========================================');
    console.log(`📡 Port: ${PORT}`);
    console.log(`🔐 Licence requise: OUI`);
    console.log(`🔌 Proxy: ${PROXY_CONFIG.proxy_host}:${PROXY_CONFIG.proxy_port}`);
    console.log(`📧 SMTP: ${PROXY_CONFIG.smtp_host}:${PROXY_CONFIG.smtp_port}`);
    console.log(`🔄 Rotation SSID: ACTIVE`);
    console.log(`🗄️ Supabase: ${process.env.SUPABASE_URL ? 'CONNECTÉ' : 'NON CONNECTÉ'}`);
    console.log('========================================\n');
});
