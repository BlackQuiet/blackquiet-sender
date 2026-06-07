// ============================================
// BLACKQUIET PROXY BULLET - BACKEND PRODUCTION
// AVEC SUPABASE - VERSION 5.0.0
// ============================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { SocksClient } = require('socks');
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');

// ============ INITIALISATION ============
const app = express();

// ============ SÉCURITÉ ============
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    credentials: true
}));

// ============ RATE LIMITING ============
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requêtes par IP
    message: { error: 'Trop de requêtes, veuillez réessayer plus tard' }
});
app.use('/api/', limiter);

// ============ SUPABASE ============
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
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

// ============ STATISTIQUES ============
let stats = {
    emails_sent: 0,
    emails_failed: 0,
    endpoints_generated: 0,
    start_time: new Date().toISOString()
};

// ============ FONCTIONS LICENCE SUPABASE ============

// Logger les activités de licence
async function logLicenseActivity(licenseKey, hwid, action, status, req) {
    try {
        await supabase.from('license_logs').insert({
            license_key: licenseKey,
            hwid: hwid,
            action: action,
            status: status,
            ip_address: req.headers['x-forwarded-for'] || req.ip || 'unknown',
            user_agent: req.headers['user-agent'] || 'unknown'
        });
    } catch (error) {
        console.error('Erreur log:', error.message);
    }
}

// Activer une licence (30 jours)
async function activateLicense(licenseKey, hwid, req) {
    try {
        // 1. Vérifier si la licence existe
        const { data: license, error } = await supabase
            .from('licenses')
            .select('*')
            .eq('license_key', licenseKey)
            .single();
        
        if (error || !license) {
            await logLicenseActivity(licenseKey, hwid, 'ACTIVATE', 'INVALID_KEY', req);
            return { success: false, error: 'Clé de licence invalide' };
        }
        
        // 2. Vérifier si déjà active et non expirée
        if (license.is_active && license.expires_at) {
            const expiresAt = new Date(license.expires_at);
            if (expiresAt > new Date()) {
                await logLicenseActivity(licenseKey, hwid, 'ACTIVATE', 'ALREADY_ACTIVE', req);
                return { 
                    success: false, 
                    error: 'Cette licence est déjà activée',
                    expires_at: license.expires_at
                };
            }
        }
        
        // 3. Activer pour 30 jours
        const activatedAt = new Date();
        const expiresAt = new Date(activatedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
        
        const { data, error: updateError } = await supabase
            .from('licenses')
            .update({
                activated_at: activatedAt.toISOString(),
                expires_at: expiresAt.toISOString(),
                is_active: true,
                hwid: hwid,
                last_seen: activatedAt.toISOString()
            })
            .eq('license_key', licenseKey)
            .select()
            .single();
        
        if (updateError) {
            await logLicenseActivity(licenseKey, hwid, 'ACTIVATE', 'ERROR', req);
            return { success: false, error: updateError.message };
        }
        
        await logLicenseActivity(licenseKey, hwid, 'ACTIVATE', 'SUCCESS', req);
        
        return {
            success: true,
            message: 'Licence activée avec succès pour 30 jours',
            expires_at: expiresAt.toISOString(),
            system_name: data.system_name
        };
        
    } catch (error) {
        console.error('Erreur activation:', error);
        return { success: false, error: 'Erreur serveur' };
    }
}

// Vérifier une licence
async function verifyLicense(licenseKey, hwid, req) {
    try {
        const { data: license, error } = await supabase
            .from('licenses')
            .select('*')
            .eq('license_key', licenseKey)
            .single();
        
        if (error || !license) {
            await logLicenseActivity(licenseKey, hwid, 'VERIFY', 'INVALID_KEY', req);
            return { valid: false, error: 'Clé de licence invalide' };
        }
        
        if (!license.is_active) {
            await logLicenseActivity(licenseKey, hwid, 'VERIFY', 'NOT_ACTIVE', req);
            return { valid: false, error: 'Licence non activée', needs_activation: true };
        }
        
        const expiresAt = new Date(license.expires_at);
        if (expiresAt < new Date()) {
            await logLicenseActivity(licenseKey, hwid, 'VERIFY', 'EXPIRED', req);
            return { 
                valid: false, 
                error: 'Licence expirée. Veuillez contacter votre fournisseur', 
                expired: true 
            };
        }
        
        if (license.hwid && license.hwid !== hwid) {
            await logLicenseActivity(licenseKey, hwid, 'VERIFY', 'HWID_MISMATCH', req);
            return { valid: false, error: 'Cette licence est liée à un autre appareil' };
        }
        
        const daysLeft = Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24));
        
        // Mettre à jour last_seen
        await supabase
            .from('licenses')
            .update({ last_seen: new Date().toISOString() })
            .eq('license_key', licenseKey);
        
        await logLicenseActivity(licenseKey, hwid, 'VERIFY', 'SUCCESS', req);
        
        return {
            valid: true,
            system_name: license.system_name,
            expires_at: license.expires_at,
            days_left: daysLeft
        };
        
    } catch (error) {
        console.error('Erreur vérification:', error);
        return { valid: false, error: 'Erreur serveur' };
    }
}

// Middleware de vérification de licence
async function requireLicense(req, res, next) {
    const licenseKey = req.headers['x-license-key'];
    const hwid = req.headers['x-hwid'];
    
    if (!licenseKey) {
        return res.status(401).json({ success: false, error: 'Clé de licence requise' });
    }
    
    const result = await verifyLicense(licenseKey, hwid || 'unknown', req);
    
    if (!result.valid) {
        return res.status(403).json({ 
            success: false, 
            error: result.error, 
            expired: result.expired || false,
            needs_activation: result.needs_activation || false
        });
    }
    
    req.license = result;
    next();
}

// ============ FONCTIONS D'ENVOI D'EMAIL ============

// Rotation SSID (identique au code original)
function rotateProxySSID(username) {
    const newSsid = crypto.randomBytes(5).toString('hex').toUpperCase();
    stats.endpoints_generated++;
    if (username.includes('-ssid-')) {
        return username.replace(/-ssid-[a-zA-Z0-9]+/, `-ssid-${newSsid}`);
    }
    return `${username}-ssid-${newSsid}`;
}

// Remplacement des placeholders
function replacePlaceholders(text, recipientEmail, link) {
    if (!text) return '';
    let result = text;
    const username = recipientEmail.split('@')[0] || 'client';
    const firstName = username.charAt(0).toUpperCase() + username.slice(1);
    const invoiceNum = 'INV-' + Math.floor(100000 + Math.random() * 900000);
    const amount = '$' + (Math.random() * 5000).toFixed(2);
    
    const replacements = {
        '[FIRST_NAME]': firstName,
        '[REAL_NAME]': firstName + ' ' + ['Smith', 'Johnson', 'Williams'][Math.floor(Math.random() * 3)],
        '[INVOICE_NUM]': invoiceNum,
        '[BALANCE_AMOUNT]': amount,
        '[DEADLINE_DATE]': new Date(Date.now() + 7 * 86400000).toLocaleDateString(),
        '[DATE]': new Date().toLocaleDateString(),
        '[TIME]': new Date().toLocaleTimeString(),
        '[RAND1]': Math.floor(10000 + Math.random() * 90000).toString(),
        '[PATIENT_ID]': 'PT-' + Math.floor(100000 + Math.random() * 900000),
        '[DOCTOR_NAME]': 'Dr ' + ['Martin', 'Bernard', 'Dubois'][Math.floor(Math.random() * 3)],
        '[TRACKING_NUM]': '1Z' + crypto.randomBytes(4).toString('hex').toUpperCase(),
        '[VERIFICATION_CODE]': Math.floor(100000 + Math.random() * 900000).toString(),
        '[IP_ADDRESS]': '192.168.' + Math.floor(1 + Math.random() * 254),
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

// Génération des headers stealth
function generateStealthHeaders(fromEmail, toEmail, proxyHost, subject) {
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
        'X-Auto-Response-Suppress': 'All'
    };
}

// Envoi d'email via tunnel SOCKS5
async function sendEmailViaProxy(mailOptions) {
    let socket = null;
    try {
        const rotatedUser = rotateProxySSID(PROXY_CONFIG.proxy_user_template);
        
        console.log(`[PROXY] Tunnel vers ${PROXY_CONFIG.proxy_host}:${PROXY_CONFIG.proxy_port}`);
        console.log(`[PROXY] Username: ${rotatedUser.substring(0, 60)}...`);
        
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
        console.log(`[SUCCÈS] Email envoyé à ${mailOptions.to}`);
        
        return { success: true, messageId: result.messageId };
        
    } catch (error) {
        stats.emails_failed++;
        console.error(`[ERREUR] ${error.message}`);
        return { success: false, error: error.message };
    } finally {
        if (socket && !socket.destroyed) socket.end();
    }
}

// ============ ROUTES API ============

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'BlackQuiet Sender',
        mode: 'PRODUCTION',
        database: 'Supabase',
        timestamp: new Date().toISOString(),
        version: '5.0.0',
        uptime: process.uptime()
    });
});

// Configuration
app.get('/api/config', (req, res) => {
    res.json({
        mode: 'PRODUCTION',
        version: '5.0.0',
        database: 'Supabase',
        proxy_host: PROXY_CONFIG.proxy_host,
        smtp_host: PROXY_CONFIG.smtp_host,
        license_duration_days: 30
    });
});

// Activer une licence
app.post('/api/license/activate', async (req, res) => {
    const { license_key, hwid } = req.body;
    
    console.log(`[LICENSE] Activation demandée: ${license_key}`);
    
    if (!license_key) {
        return res.status(400).json({ success: false, error: 'Clé de licence requise' });
    }
    
    const result = await activateLicense(license_key, hwid || 'unknown', req);
    res.json(result);
});

// Vérifier une licence
app.post('/api/license/verify', async (req, res) => {
    const { license_key, hwid } = req.body;
    
    console.log(`[LICENSE] Vérification: ${license_key}`);
    
    if (!license_key) {
        return res.status(400).json({ valid: false, error: 'Clé de licence requise' });
    }
    
    const result = await verifyLicense(license_key, hwid || 'unknown', req);
    res.json(result);
});

// Envoyer un email (protégé par licence)
app.post('/api/send', requireLicense, async (req, res) => {
    const { to, subject, html, fromEmail, fromName, link } = req.body;
    
    console.log(`[EMAIL] Envoi à: ${to}`);
    
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
        console.error(`[EMAIL] Erreur: ${error.message}`);
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
            const processedHtml = replacePlaceholders(html, recipient, link);
            const processedSubject = replacePlaceholders(subject, recipient, link);
            
            const mailOptions = {
                from: `"${fromName || 'Service Client'}" <${fromEmail || 'noreply@eastlink.ca'}>`,
                to: recipient,
                subject: processedSubject,
                html: processedHtml,
                headers: generateStealthHeaders(fromEmail, recipient, PROXY_CONFIG.proxy_host, processedSubject)
            };
            
            const result = await sendEmailViaProxy(mailOptions);
            results.push({ recipient, ...result });
            
            if (i < recipients.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
            
        } catch (error) {
            results.push({ recipient, success: false, error: error.message });
        }
    }
    
    res.json({ success: true, results, total: results.length });
});

// Statistiques (protégé par licence)
app.get('/api/stats', requireLicense, (req, res) => {
    res.json({
        license: {
            valid: true,
            system_name: req.license.system_name,
            expires_at: req.license.expires_at,
            days_left: req.license.days_left
        },
        emails_sent: stats.emails_sent,
        emails_failed: stats.emails_failed,
        endpoints_generated: stats.endpoints_generated,
        uptime: process.uptime(),
        start_time: stats.start_time,
        timestamp: new Date().toISOString()
    });
});

// Route racine
app.get('/', (req, res) => {
    res.json({
        name: 'BlackQuiet Proxy Bullet API',
        version: '5.0.0',
        status: 'online',
        mode: 'PRODUCTION',
        database: 'Supabase',
        timestamp: new Date().toISOString()
    });
});

// Route admin pour voir les licences (protégée par token)
app.get('/api/admin/licenses', async (req, res) => {
    const adminToken = req.headers['x-admin-token'];
    
    if (adminToken !== process.env.ADMIN_TOKEN) {
        return res.status(403).json({ error: 'Accès non autorisé' });
    }
    
    const { data, error } = await supabase
        .from('licenses')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ licenses: data });
});

// ============ DÉMARRAGE ============
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('\n========================================');
    console.log('🚀 BLACKQUIET BACKEND - PRODUCTION');
    console.log('========================================');
    console.log(`📡 Port: ${PORT}`);
    console.log(`🔐 Mode: PRODUCTION`);
    console.log(`🗄️ Base de données: Supabase`);
    console.log(`📧 Proxy: ${PROXY_CONFIG.proxy_host}:${PROXY_CONFIG.proxy_port}`);
    console.log(`📧 SMTP: ${PROXY_CONFIG.smtp_host}:${PROXY_CONFIG.smtp_port}`);
    console.log('========================================\n');
});
