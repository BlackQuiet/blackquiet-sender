// server.js - COPIE/COLLE CE CODE COMPLET
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

// Tentative d'import des dépendances optionnelles
let SocksClient, nodemailer;
try {
    const socksModule = require('socks');
    SocksClient = socksModule.SocksClient;
    nodemailer = require('nodemailer');
    console.log('✅ SOCKS5 et Nodemailer chargés');
} catch (error) {
    console.log('⚠️ SOCKS5 non disponible, mode simulation activé');
}

const app = express();
app.use(cors());
app.use(express.json());

// ============ CONFIGURATION ============
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

// ============ ENVOI VIA SOCKS5 ============
async function sendWithProxyTunnel(proxyConfig, mailOptions) {
    // Si les dépendances ne sont pas disponibles, mode simulation
    if (!SocksClient || !nodemailer) {
        console.log('[SIMULATION] Mode démo - aucun email réel envoyé');
        emailSentCount++;
        return { success: true, messageId: 'demo-' + Date.now(), simulated: true };
    }
    
    let socket = null;
    try {
        const rotatedUser = rotateProxySSID(proxyConfig.proxy_user_template);
        
        console.log(`[PROXY] Tunnel vers ${proxyConfig.proxy_host}:${proxyConfig.proxy_port}`);
        console.log(`[PROXY] Username: ${rotatedUser.substring(0, 50)}...`);
        
        const tunnel = await SocksClient.createConnection({
            proxy: {
                ipaddress: proxyConfig.proxy_host,
                port: parseInt(proxyConfig.proxy_port),
                type: 5,
                userId: rotatedUser,
                password: proxyConfig.proxy_pass
            },
            destination: {
                host: proxyConfig.smtp_host,
                port: parseInt(proxyConfig.smtp_port)
            },
            command: 'connect'
        });
        
        socket = tunnel.socket;
        
        const transporter = nodemailer.createTransport({
            host: proxyConfig.smtp_host,
            port: parseInt(proxyConfig.smtp_port),
            secure: proxyConfig.smtp_port === 465,
            ignoreTLS: proxyConfig.smtp_port === 25,
            connection: socket,
            tls: { rejectUnauthorized: false },
            timeout: 30000
        });
        
        const result = await transporter.sendMail(mailOptions);
        transporter.close();
        emailSentCount++;
        
        console.log(`[SUCCESS] Email envoyé à ${mailOptions.to}`);
        return { success: true, messageId: result.messageId };
        
    } catch (error) {
        emailFailedCount++;
        console.error(`[ERROR] ${error.message}`);
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
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Route d'envoi d'email (IMPORTANTE - CELLE QUI TE MANQUE)
app.post('/api/send', async (req, res) => {
    const { to, subject, html, fromEmail, fromName, link } = req.body;
    
    console.log(`[API] Requête reçue pour: ${to}`);
    
    // Vérification des champs requis
    if (!to || !subject || !html) {
        return res.status(400).json({ 
            success: false, 
            error: 'Champs manquants: to, subject, html sont requis' 
        });
    }
    
    try {
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
        
        const result = await sendWithProxyTunnel(PROXY_CONFIG, mailOptions);
        res.json(result);
        
    } catch (error) {
        console.error(`[API ERROR] ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Route d'envoi multiple (batch)
app.post('/api/batch-send', async (req, res) => {
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
        
        const result = await sendWithProxyTunnel(PROXY_CONFIG, mailOptions);
        results.push({ recipient, ...result });
        
        // Pause entre les envois pour éviter la détection
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    res.json({ success: true, results });
});

// Statistiques
app.get('/api/stats', (req, res) => {
    res.json({
        endpoints_generated: endpointCount,
        emails_sent: emailSentCount,
        emails_failed: emailFailedCount,
        proxy_config: {
            host: PROXY_CONFIG.proxy_host,
            port: PROXY_CONFIG.proxy_port,
            smtp: `${PROXY_CONFIG.smtp_host}:${PROXY_CONFIG.smtp_port}`
        },
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// Route pour vérifier la configuration
app.get('/api/config', (req, res) => {
    res.json({
        proxy_host: PROXY_CONFIG.proxy_host,
        proxy_port: PROXY_CONFIG.proxy_port,
        smtp_host: PROXY_CONFIG.smtp_host,
        smtp_port: PROXY_CONFIG.smtp_port,
        mode: SocksClient ? 'real' : 'simulation'
    });
});

// Route par défaut
app.get('/', (req, res) => {
    res.json({
        message: 'BlackQuiet Proxy Bullet API',
        endpoints: {
            health: 'GET /api/health',
            send: 'POST /api/send',
            batch: 'POST /api/batch-send',
            stats: 'GET /api/stats',
            config: 'GET /api/config'
        }
    });
});

// ============ DÉMARRAGE ============
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`🚀 BLACKQUIET BACKEND`);
    console.log(`========================================`);
    console.log(`📡 Port: ${PORT}`);
    console.log(`🔌 Proxy: ${PROXY_CONFIG.proxy_host}:${PROXY_CONFIG.proxy_port}`);
    console.log(`📧 SMTP: ${PROXY_CONFIG.smtp_host}:${PROXY_CONFIG.smtp_port}`);
    console.log(`🔄 Mode: ${SocksClient ? 'REEL (SOCKS5)' : 'SIMULATION'}`);
    console.log(`========================================\n`);
});
