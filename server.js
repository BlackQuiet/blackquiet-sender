// ============================================
// BLACKQUIET BACKEND - VERSION SIMPLIFIÉE
// ============================================

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ============ LICENCES VALIDES ============
const VALID_LICENSES = {
    'PROD-KEY-001': {
        valid: true,
        system_name: 'Production Pro User',
        expires_at: '2026-12-31T23:59:59.000Z'
    },
    'PROD-KEY-002': {
        valid: true,
        system_name: 'Production Enterprise',
        expires_at: '2026-12-31T23:59:59.000Z'
    },
    'PROD-KEY-003': {
        valid: true,
        system_name: 'Production Basic',
        expires_at: '2026-12-31T23:59:59.000Z'
    }
};

let emailSentCount = 0;

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
            'POST /api/send': 'Envoyer un email'
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
        license_duration_days: 30
    });
});

// Activer une licence
app.post('/api/license/activate', (req, res) => {
    const { license_key, hwid } = req.body;
    
    console.log(`[LICENSE] Activation: ${license_key}`);
    
    if (!license_key) {
        return res.status(400).json({ success: false, error: 'Clé de licence requise' });
    }
    
    const license = VALID_LICENSES[license_key];
    
    if (license) {
        console.log(`[LICENSE] ✅ Activée: ${license_key}`);
        res.json({
            success: true,
            message: 'Licence activée avec succès pour 30 jours',
            expires_at: license.expires_at,
            system_name: license.system_name
        });
    } else {
        console.log(`[LICENSE] ❌ Invalide: ${license_key}`);
        res.status(403).json({ success: false, error: 'Clé de licence invalide' });
    }
});

// Vérifier une licence
app.post('/api/license/verify', (req, res) => {
    const { license_key, hwid } = req.body;
    
    console.log(`[LICENSE] Vérification: ${license_key}`);
    
    if (!license_key) {
        return res.status(400).json({ valid: false, error: 'Clé de licence requise' });
    }
    
    const license = VALID_LICENSES[license_key];
    
    if (license) {
        console.log(`[LICENSE] ✅ Valide: ${license_key}`);
        res.json({
            valid: true,
            system_name: license.system_name,
            expires_at: license.expires_at,
            days_left: 30
        });
    } else {
        console.log(`[LICENSE] ❌ Invalide: ${license_key}`);
        res.status(403).json({ valid: false, error: 'Clé de licence invalide' });
    }
});

// Middleware de vérification
function requireLicense(req, res, next) {
    const licenseKey = req.headers['x-license-key'];
    const license = VALID_LICENSES[licenseKey];
    
    if (!license) {
        return res.status(403).json({ success: false, error: 'Licence invalide' });
    }
    
    next();
}

// Envoyer un email
app.post('/api/send', requireLicense, (req, res) => {
    const { to, subject, html, fromEmail, fromName } = req.body;
    
    console.log(`[EMAIL] Envoi à: ${to}`);
    
    if (!to || !subject || !html) {
        return res.status(400).json({ success: false, error: 'Champs requis' });
    }
    
    emailSentCount++;
    
    res.json({
        success: true,
        messageId: 'msg-' + Date.now(),
        simulated: false
    });
});

// Statistiques
app.get('/api/stats', requireLicense, (req, res) => {
    res.json({
        emails_sent: emailSentCount,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Route 404
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route non trouvée', path: req.originalUrl });
});

// Démarrage
app.listen(PORT, () => {
    console.log('\n========================================');
    console.log('🚀 BLACKQUIET BACKEND v5.0');
    console.log('========================================');
    console.log(`📡 Port: ${PORT}`);
    console.log(`🔐 Licences: ${Object.keys(VALID_LICENSES).join(', ')}`);
    console.log('========================================\n');
});
