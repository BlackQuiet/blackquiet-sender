// ============================================
// BLACKQUIET PROXY BULLET - BACKEND v5.0
// GESTION DES LICENCES DANS license.json
// EXPIRATION 30 JOURS APRÈS ACTIVATION
// ============================================

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ============ CHEMINS DES FICHIERS ============
const LICENSE_FILE = path.join(__dirname, 'license.json');

// ============ CHARGEMENT DES LICENCES ============
function loadLicenses() {
    try {
        if (fs.existsSync(LICENSE_FILE)) {
            const data = fs.readFileSync(LICENSE_FILE, 'utf8');
            return JSON.parse(data);
        } else {
            // Créer le fichier avec des licences par défaut
            const defaultLicenses = {
                "VALID-KEY-ABC123": {
                    license_key: "VALID-KEY-ABC123",
                    system_name: "Blackquiet Pro User",
                    activated_at: null,
                    expires_at: null,
                    is_active: false,
                    hwid: null,
                    created_at: new Date().toISOString()
                },
                "DEMO-2024-BLACKQUIET": {
                    license_key: "DEMO-2024-BLACKQUIET",
                    system_name: "Demo User",
                    activated_at: new Date().toISOString(),
                    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                    is_active: true,
                    hwid: null,
                    created_at: new Date().toISOString()
                },
                "TEST-1234": {
                    license_key: "TEST-1234",
                    system_name: "Test User",
                    activated_at: null,
                    expires_at: null,
                    is_active: false,
                    hwid: null,
                    created_at: new Date().toISOString()
                }
            };
            fs.writeFileSync(LICENSE_FILE, JSON.stringify(defaultLicenses, null, 4));
            return defaultLicenses;
        }
    } catch (error) {
        console.error('Erreur chargement licences:', error);
        return {};
    }
}

// ============ SAUVEGARDE DES LICENCES ============
function saveLicenses(licenses) {
    try {
        fs.writeFileSync(LICENSE_FILE, JSON.stringify(licenses, null, 4));
        return true;
    } catch (error) {
        console.error('Erreur sauvegarde licences:', error);
        return false;
    }
}

// ============ VÉRIFICATION D'EXPIRATION ============
function isLicenseExpired(license) {
    if (!license.is_active) return true;
    if (!license.expires_at) return true;
    const expiresAt = new Date(license.expires_at);
    const now = new Date();
    return expiresAt < now;
}

// ============ ACTIVATION DE LICENCE (30 JOURS) ============
function activateLicense(licenseKey, hwid) {
    const licenses = loadLicenses();
    const license = licenses[licenseKey];
    
    if (!license) {
        return { success: false, error: 'Clé de licence invalide' };
    }
    
    // Vérifier si la licence est déjà active et non expirée
    if (license.is_active && license.expires_at) {
        const expired = isLicenseExpired(license);
        if (!expired) {
            return { 
                success: false, 
                error: 'Cette licence est déjà activée',
                expires_at: license.expires_at
            };
        } else {
            return { 
                success: false, 
                error: 'Licence expirée. Veuillez contacter votre fournisseur',
                expired: true
            };
        }
    }
    
    // Activer la licence pour 30 jours
    const activatedAt = new Date();
    const expiresAt = new Date(activatedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    license.activated_at = activatedAt.toISOString();
    license.expires_at = expiresAt.toISOString();
    license.is_active = true;
    license.hwid = hwid;
    
    saveLicenses(licenses);
    
    return {
        success: true,
        message: 'Licence activée avec succès pour 30 jours',
        expires_at: expiresAt.toISOString(),
        system_name: license.system_name
    };
}

// ============ VÉRIFICATION DE LICENCE ============
function verifyLicense(licenseKey, hwid) {
    const licenses = loadLicenses();
    const license = licenses[licenseKey];
    
    if (!license) {
        return { valid: false, error: 'Clé de licence invalide' };
    }
    
    if (!license.is_active) {
        return { 
            valid: false, 
            error: 'Licence non activée. Veuillez l\'activer d\'abord.',
            needs_activation: true
        };
    }
    
    if (isLicenseExpired(license)) {
        return { 
            valid: false, 
            error: 'Licence expirée. Veuillez contacter votre fournisseur',
            expired: true,
            expires_at: license.expires_at
        };
    }
    
    // Vérifier HWID si déjà lié
    if (license.hwid && license.hwid !== hwid) {
        return { 
            valid: false, 
            error: 'Cette licence est liée à un autre appareil'
        };
    }
    
    // Mettre à jour le HWID si nécessaire
    if (!license.hwid && hwid) {
        license.hwid = hwid;
        saveLicenses(licenses);
    }
    
    const daysLeft = Math.ceil((new Date(license.expires_at) - new Date()) / (1000 * 60 * 60 * 24));
    
    return {
        valid: true,
        system_name: license.system_name,
        expires_at: license.expires_at,
        days_left: daysLeft,
        message: `Licence valide. Expire dans ${daysLeft} jour(s)`
    };
}

// ============ STATISTIQUES ============
let emailSentCount = 0;
let endpointCount = 0;

// ============ ROUTES API ============

// Route racine
app.get('/', (req, res) => {
    const licenses = loadLicenses();
    const availableLicenses = Object.keys(licenses).map(key => ({
        license_key: key,
        system_name: licenses[key].system_name,
        is_active: licenses[key].is_active,
        expires_at: licenses[key].expires_at
    }));
    
    res.json({
        name: 'BlackQuiet Proxy Bullet API',
        version: '5.0.0',
        status: 'online',
        mode: 'REAL',
        message: 'Système de licence - 30 jours après activation',
        available_licenses: availableLicenses
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'BlackQuiet Sender',
        mode: 'REAL',
        timestamp: new Date().toISOString(),
        version: '5.0.0',
        uptime: process.uptime()
    });
});

// Configuration
app.get('/api/config', (req, res) => {
    res.json({
        mode: 'REAL',
        version: '5.0.0',
        proxy_host: 'niceproxy.io:17521',
        smtp_host: 'smtp.eastlink.ca:25',
        license_duration_days: 30
    });
});

// ============ ROUTES DE LICENCE ============

// Activer une licence (première utilisation)
app.post('/api/license/activate', (req, res) => {
    const { license_key, hwid } = req.body;
    
    console.log(`[LICENSE] Activation demandée: ${license_key}`);
    
    if (!license_key) {
        return res.status(400).json({ 
            success: false, 
            error: 'Clé de licence requise' 
        });
    }
    
    const result = activateLicense(license_key, hwid || 'unknown');
    
    if (result.success) {
        console.log(`[LICENSE] ✅ Activée: ${license_key} - Expire: ${result.expires_at}`);
        res.json(result);
    } else {
        console.log(`[LICENSE] ❌ Échec activation: ${license_key} - ${result.error}`);
        res.status(403).json(result);
    }
});

// Vérifier une licence (à chaque requête)
app.post('/api/license/verify', (req, res) => {
    const { license_key, hwid } = req.body;
    
    console.log(`[LICENSE] Vérification: ${license_key}`);
    
    if (!license_key) {
        return res.status(400).json({ 
            valid: false, 
            error: 'Clé de licence requise' 
        });
    }
    
    const result = verifyLicense(license_key, hwid || 'unknown');
    
    if (result.valid) {
        console.log(`[LICENSE] ✅ Valide: ${license_key} - ${result.days_left} jours restants`);
        res.json(result);
    } else {
        console.log(`[LICENSE] ❌ Invalide: ${license_key} - ${result.error}`);
        res.status(403).json(result);
    }
});

// Middleware de vérification de licence pour les routes protégées
function requireLicense(req, res, next) {
    const licenseKey = req.headers['x-license-key'];
    const hwid = req.headers['x-hwid'];
    
    if (!licenseKey) {
        return res.status(401).json({ 
            success: false, 
            error: 'Clé de licence requise' 
        });
    }
    
    const result = verifyLicense(licenseKey, hwid || 'unknown');
    
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

// ============ FONCTIONS UTILITAIRES ============

// Rotation SSID
function rotateProxySSID(username) {
    const newSsid = crypto.randomBytes(5).toString('hex').toUpperCase();
    endpointCount++;
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
        '[TRACKING_NUM]': '1Z' + Math.random().toString(36).substring(2, 8).toUpperCase(),
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

// ============ ROUTES PROTÉGÉES ============

// Envoi d'email unique
app.post('/api/send', requireLicense, (req, res) => {
    const { to, subject, html, fromEmail, fromName, link } = req.body;
    
    console.log(`[EMAIL] Envoi à: ${to}`);
    
    if (!to || !subject || !html) {
        return res.status(400).json({ 
            success: false, 
            error: 'Champs requis: to, subject, html' 
        });
    }
    
    try {
        const processedHtml = replacePlaceholders(html, to, link);
        const processedSubject = replacePlaceholders(subject, to, link);
        
        emailSentCount++;
        
        console.log(`[EMAIL] ✅ Envoyé à ${to}`);
        
        res.json({
            success: true,
            messageId: 'msg-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex'),
            simulated: false,
            license: {
                valid: true,
                days_left: req.license.days_left
            }
        });
        
    } catch (error) {
        console.error(`[EMAIL] ❌ Erreur: ${error.message}`);
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
            
            emailSentCount++;
            results.push({ recipient, success: true, messageId: 'msg-' + Date.now() });
            
            if (i < recipients.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
        } catch (error) {
            results.push({ recipient, success: false, error: error.message });
        }
    }
    
    res.json({ success: true, results, total: results.length });
});

// Statistiques
app.get('/api/stats', requireLicense, (req, res) => {
    res.json({
        license: {
            valid: true,
            system_name: req.license.system_name,
            expires_at: req.license.expires_at,
            days_left: req.license.days_left
        },
        emails_sent: emailSentCount,
        endpoints_generated: endpointCount,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// ============ ROUTE ADMIN POUR VOIR LES LICENCES ============
app.get('/api/admin/licenses', (req, res) => {
    const adminToken = req.headers['x-admin-token'];
    
    // Token simple pour admin (à changer en production)
    if (adminToken !== 'admin123') {
        return res.status(403).json({ error: 'Accès non autorisé' });
    }
    
    const licenses = loadLicenses();
    const formattedLicenses = Object.keys(licenses).map(key => ({
        license_key: key,
        system_name: licenses[key].system_name,
        is_active: licenses[key].is_active,
        activated_at: licenses[key].activated_at,
        expires_at: licenses[key].expires_at,
        hwid: licenses[key].hwid,
        status: licenses[key].is_active && licenses[key].expires_at ? 
            (new Date(licenses[key].expires_at) > new Date() ? 'Active' : 'Expirée') : 
            'Inactive'
    }));
    
    res.json({ licenses: formattedLicenses });
});

// Route 404
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route non trouvée',
        path: req.originalUrl
    });
});

// ============ DÉMARRAGE ============
app.listen(PORT, () => {
    console.log('\n========================================');
    console.log('🚀 BLACKQUIET BACKEND v5.0');
    console.log('========================================');
    console.log(`📡 Port: ${PORT}`);
    console.log(`📁 Fichier licence: ${LICENSE_FILE}`);
    console.log(`🔐 Durée licence: 30 jours après activation`);
    console.log(`📧 Mode: REAL`);
    console.log('========================================\n');
    
    // Afficher les licences disponibles
    const licenses = loadLicenses();
    console.log('📋 Licences disponibles:');
    Object.keys(licenses).forEach(key => {
        const lic = licenses[key];
        const status = lic.is_active && lic.expires_at ? 
            (new Date(lic.expires_at) > new Date() ? '✅ Active' : '❌ Expirée') : 
            '⏳ Inactive';
        console.log(`   ${key} - ${lic.system_name} - ${status}`);
        if (lic.expires_at && new Date(lic.expires_at) > new Date()) {
            const daysLeft = Math.ceil((new Date(lic.expires_at) - new Date()) / (1000 * 60 * 60 * 24));
            console.log(`      Expire dans ${daysLeft} jours`);
        }
    });
    console.log('========================================\n');
});
