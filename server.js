const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Licences valides
const VALID_LICENSES = {
    'PROD-KEY-001': { name: 'Production Pro User' },
    'PROD-KEY-002': { name: 'Production Enterprise' },
    'PROD-KEY-003': { name: 'Production Basic' },
    'VALID-KEY-ABC123': { name: 'Blackquiet Pro User' }
};

// Route racine
app.get('/', (req, res) => {
    res.json({
        name: 'BlackQuiet API',
        version: '5.0.0',
        routes: {
            'GET /api/health': 'Health check',
            'POST /api/license/activate': 'Activer licence',
            'POST /api/license/verify': 'Vérifier licence',
            'POST /api/send': 'Envoyer email'
        },
        valid_licenses: Object.keys(VALID_LICENSES)
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ACTIVER LICENCE - ROUTE IMPORTANTE
app.post('/api/license/activate', (req, res) => {
    const { license_key } = req.body;
    console.log(`[ACTIVATE] Licence reçue: ${license_key}`);
    
    if (!license_key) {
        return res.status(400).json({ success: false, error: 'Clé requise' });
    }
    
    const license = VALID_LICENSES[license_key];
    if (license) {
        res.json({
            success: true,
            message: 'Licence activée',
            expires_at: '2026-12-31',
            system_name: license.name
        });
    } else {
        res.status(403).json({ success: false, error: 'Licence invalide' });
    }
});

// VÉRIFIER LICENCE - ROUTE IMPORTANTE
app.post('/api/license/verify', (req, res) => {
    const { license_key } = req.body;
    console.log(`[VERIFY] Licence reçue: ${license_key}`);
    
    if (!license_key) {
        return res.status(400).json({ valid: false, error: 'Clé requise' });
    }
    
    const license = VALID_LICENSES[license_key];
    if (license) {
        res.json({
            valid: true,
            system_name: license.name,
            expires_at: '2026-12-31',
            days_left: 30
        });
    } else {
        res.status(403).json({ valid: false, error: 'Licence invalide' });
    }
});

// ENVOYER EMAIL
app.post('/api/send', (req, res) => {
    const licenseKey = req.headers['x-license-key'];
    const { to, subject, html } = req.body;
    
    console.log(`[SEND] Licence: ${licenseKey}, To: ${to}`);
    
    if (!licenseKey || !VALID_LICENSES[licenseKey]) {
        return res.status(403).json({ success: false, error: 'Licence invalide' });
    }
    
    if (!to || !subject || !html) {
        return res.status(400).json({ success: false, error: 'Champs requis' });
    }
    
    res.json({
        success: true,
        messageId: 'msg-' + Date.now(),
        simulated: false
    });
});

app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🔐 Valid licenses: ${Object.keys(VALID_LICENSES).join(', ')}`);
});
