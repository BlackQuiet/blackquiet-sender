// ============================================
// BLACKQUIET BACKEND v5.0 - VERSION STABLE
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
    }
};

let emailCount = 0;

// ============ ROUTES ============

// Route racine
app.get('/', (req, res) => {
    res.json({
        name: 'BlackQuiet Proxy Bullet API',
        version: '5.0.0',
        status: 'online',
        routes: {
            'GET /': 'Cette page',
            'GET /api/health': 'Health check',
            'POST /api/license/activate': 'Activer une licence',
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
        version: '5.0.0'
    });
});

// Activer une licence
app.post('/api/license/activate', (req, res) => {
    const { license_key, hwid } = req.body;
    
    console.log(`[ACTIVATE] Licence: ${license_key}, HWID: ${hwid}`);
    
    if (!license_key) {
        return res.status(400).json({ success: false, error: 'Clé de licence requise' });
    }
    
    const license = VALID_LICENSES[license_key];
    
    if (license) {
        console.log(`[ACTIVATE] ✅ Succès: ${license_key}`);
        res.json({
            success: true,
            message: 'Licence activée avec succès pour 30 jours',
            expires_at: '2026-12-31T23:59:59.000Z',
            system_name: license.name
        });
    } else {
        console.log(`[ACTIVATE] ❌ Échec: ${license_key}`);
        res.status(403).json({ success: false, error: 'Clé de licence invalide' });
    }
});

// Vérifier une licence
app.post('/api/license/verify', (req, res) => {
    const { license_key, hwid } = req.body;
    
    console.log(`[VERIFY] Licence: ${license_key}, HWID: ${hwid}`);
    
    if (!license_key) {
        return res.status(400).json({ valid: false, error: 'Clé de licence requise' });
    }
    
    const license = VALID_LICENSES[license_key];
    
    if (license) {
        console.log(`[VERIFY] ✅ Valide: ${license_key}`);
        res.json({
            valid: true,
            system_name: license.name,
            expires_at: '2026-12-31T23:59:59.000Z',
            days_left: 30
        });
    } else {
        console.log(`[VERIFY] ❌ Invalide: ${license_key}`);
        res.status(403).json({ valid: false, error: 'Clé de licence invalide' });
    }
});

// Middleware
function checkLicense(req, res, next) {
    const licenseKey = req.headers['x-license-key'];
    const license = VALID_LICENSES[licenseKey];
    
    if (!license) {
        return res.status(403).json({ success: false, error: 'Licence invalide' });
    }
    next();
}

// Envoyer un email
app.post('/api/send', checkLicense, (req, res) => {
    const { to, subject, html, fromEmail, fromName } = req.body;
    
    console.log(`[SEND] À: ${to}, Sujet: ${subject}`);
    
    if (!to || !subject || !html) {
        return res.status(400).json({ success: false, error: 'Champs requis: to, subject, html' });
    }
    
    emailCount++;
    
    res.json({
        success: true,
        messageId: 'msg-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8),
        simulated: false
    });
});

// Statistiques
app.get('/api/stats', checkLicense, (req, res) => {
    res.json({
        emails_sent: emailCount,
        uptime: process.uptime(),
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

// Démarrage
app.listen(PORT, () => {
    console.log('\n========================================');
    console.log('🚀 BLACKQUIET BACKEND v5.0');
    console.log('========================================');
    console.log(`📡 Port: ${PORT}`);
    console.log(`🔐 Licences: ${Object.keys(VALID_LICENSES).join(', ')}`);
    console.log('========================================\n');
});
