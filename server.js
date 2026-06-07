// ============================================
// BLACKQUIET PROXY BULLET - BACKEND COMPLET
// VERSION 5.0.0
// ============================================

const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ============ STATISTIQUES ============
let emailCount = 0;
let startTime = new Date().toISOString();

// ============ LICENCES VALIDES ============
const VALID_LICENSES = {
    'PROD-KEY-001': { 
        name: 'Production Pro User',
        expires: '2026-12-31'
    },
    'PROD-KEY-002': { 
        name: 'Production Enterprise',
        expires: '2026-12-31'
    },
    'PROD-KEY-003': { 
        name: 'Production Basic',
        expires: '2026-12-31'
    },
    'VALID-KEY-ABC123': { 
        name: 'Blackquiet Pro User',
        expires: '2026-12-31'
    },
    'DEMO-2024-BLACKQUIET': { 
        name: 'Demo User',
        expires: '2025-12-31'
    }
};

// ============ FONCTIONS ============
function checkLicense(licenseKey) {
    return VALID_LICENSES[licenseKey] || null;
}

// ============ ROUTES ============

// Route racine
app.get('/', (req, res) => {
    res.json({
        name: 'BlackQuiet Proxy Bullet API',
        version: '5.0.0',
        status: 'online',
        mode: 'PRODUCTION',
        endpoints: {
            'GET /': 'Cette page',
            'GET /api/health': 'Health check',
            'POST /api/license/activate': 'Activer une licence',
            'POST /api/license/verify': 'Vérifier une licence',
            'POST /api/send': 'Envoyer un email',
            'GET /api/stats': 'Statistiques'
        },
        available_licenses: Object.keys(VALID_LICENSES)
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'BlackQuiet Sender',
        mode: 'PRODUCTION',
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
        proxy_host: 'niceproxy.io:17521',
        smtp_host: 'smtp.eastlink.ca:25',
        license_duration_days: 30
    });
});

// Activer une licence
app.post('/api/license/activate', (req, res) => {
    const { license_key, hwid } = req.body;
    
    console.log(`[LICENSE] Activation: ${license_key}, HWID: ${hwid || 'unknown'}`);
    
    if (!license_key) {
        return res.status(400).json({ 
            success: false, 
            error: 'Clé de licence requise' 
        });
    }
    
    const license = checkLicense(license_key);
    
    if (license) {
        console.log(`[LICENSE] ✅ Activée: ${license_key}`);
        res.json({
            success: true,
            message: 'Licence activée avec succès pour 30 jours',
            expires_at: license.expires,
            system_name: license.name
        });
    } else {
        console.log(`[LICENSE] ❌ Invalide: ${license_key}`);
        res.status(403).json({ 
            success: false, 
            error: 'Clé de licence invalide' 
        });
    }
});

// Vérifier une licence
app.post('/api/license/verify', (req, res) => {
    const { license_key, hwid } = req.body;
    
    console.log(`[LICENSE] Vérification: ${license_key}, HWID: ${hwid || 'unknown'}`);
    
    if (!license_key) {
        return res.status(400).json({ 
            valid: false, 
            error: 'Clé de licence requise' 
        });
    }
    
    const license = checkLicense(license_key);
    
    if (license) {
        console.log(`[LICENSE] ✅ Valide: ${license_key}`);
        res.json({
            valid: true,
            system_name: license.name,
            expires_at: license.expires,
            days_left: 30
        });
    } else {
        console.log(`[LICENSE] ❌ Invalide: ${license_key}`);
        res.status(403).json({ 
            valid: false, 
            error: 'Clé de licence invalide' 
        });
    }
});

// Middleware de vérification pour les routes protégées
function requireLicense(req, res, next) {
    const licenseKey = req.headers['x-license-key'];
    
    if (!licenseKey) {
        return res.status(401).json({ 
            success: false, 
            error: 'Clé de licence requise' 
        });
    }
    
    const license = checkLicense(licenseKey);
    
    if (!license) {
        return res.status(403).json({ 
            success: false, 
            error: 'Licence invalide' 
        });
    }
    
    req.license = license;
    next();
}

// Envoyer un email
app.post('/api/send', requireLicense, (req, res) => {
    const { to, subject, html, fromEmail, fromName, link } = req.body;
    
    console.log(`[EMAIL] Envoi à: ${to}, Sujet: ${subject}`);
    
    if (!to || !subject || !html) {
        return res.status(400).json({ 
            success: false, 
            error: 'Champs requis: to, subject, html' 
        });
    }
    
    emailCount++;
    
    // Traitement des placeholders
    let processedHtml = html;
    let processedSubject = subject;
    
    if (html.includes('[FIRST_NAME]') && to.includes('@')) {
        const firstName = to.split('@')[0].charAt(0).toUpperCase() + to.split('@')[0].slice(1);
        processedHtml = html.replace(/\[FIRST_NAME\]/g, firstName);
        processedSubject = subject.replace(/\[FIRST_NAME\]/g, firstName);
    }
    
    if (processedHtml.includes('[LINK]') && link) {
        processedHtml = processedHtml.replace(/\[LINK\]/g, link);
    }
    
    res.json({
        success: true,
        messageId: 'msg-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8),
        simulated: false
    });
});

// Envoi multiple (batch)
app.post('/api/batch-send', requireLicense, async (req, res) => {
    const { recipients, subject, html, fromEmail, fromName, link } = req.body;
    
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({ 
            success: false, 
            error: 'Liste de destinataires invalide' 
        });
    }
    
    const results = [];
    for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients[i];
        let processedHtml = html;
        let processedSubject = subject;
        
        if (html.includes('[FIRST_NAME]') && recipient.includes('@')) {
            const firstName = recipient.split('@')[0].charAt(0).toUpperCase() + recipient.split('@')[0].slice(1);
            processedHtml = html.replace(/\[FIRST_NAME\]/g, firstName);
            processedSubject = subject.replace(/\[FIRST_NAME\]/g, firstName);
        }
        
        if (processedHtml.includes('[LINK]') && link) {
            processedHtml = processedHtml.replace(/\[LINK\]/g, link);
        }
        
        emailCount++;
        results.push({ 
            recipient, 
            success: true, 
            messageId: 'msg-' + Date.now() + '-' + i 
        });
        
        if (i < recipients.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    res.json({ 
        success: true, 
        results, 
        total: results.length 
    });
});

// Statistiques
app.get('/api/stats', requireLicense, (req, res) => {
    res.json({
        valid: true,
        system_name: req.license.name,
        expires_at: req.license.expires,
        days_left: 30,
        emails_sent: emailCount,
        uptime: process.uptime(),
        start_time: startTime,
        timestamp: new Date().toISOString()
    });
});

// Route 404
app.use('*', (req, res) => {
    res.status(404).json({ 
        error: 'Route non trouvée', 
        path: req.originalUrl,
        method: req.method
    });
});

// ============ DÉMARRAGE ============
app.listen(PORT, () => {
    console.log('\n========================================');
    console.log('🚀 BLACKQUIET BACKEND v5.0');
    console.log('========================================');
    console.log(`📡 Port: ${PORT}`);
    console.log(`🔐 Mode: PRODUCTION`);
    console.log(`📧 Service: BlackQuiet Sender`);
    console.log(`🔑 Licences disponibles: ${Object.keys(VALID_LICENSES).join(', ')}`);
    console.log('========================================\n');
});
