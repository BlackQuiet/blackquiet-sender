// ============================================
// BLACKQUIET PROXY BULLET - VERSION COMPLÈTE
// Tunnel SOCKS5 | Rotation SSID | DNS multi-niveaux
// Headers anti-détection | Placeholders | PDF/DOCX
// ============================================

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');
const cheerio = require('cheerio');
const { SocksClient } = require('socks');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const HTMLtoDOCX = require('html-to-docx');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 3000;

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

// ============ LICENCES VALIDES ============
const VALID_LICENSES = {
    'PROD-KEY-001': { name: 'Production Pro User', expires: '2026-12-31' },
    'PROD-KEY-002': { name: 'Production Enterprise', expires: '2026-12-31' },
    'PROD-KEY-003': { name: 'Production Basic', expires: '2026-12-31' },
    'VALID-KEY-ABC123': { name: 'Blackquiet Pro User', expires: '2026-12-31' }
};

// ============ 1. ROTATION SSID ============
function rotateProxySSID(username) {
    const newSsid = crypto.randomBytes(5).toString('hex').toUpperCase();
    stats.endpoints_generated++;
    if (username.includes('-ssid-')) {
        return username.replace(/-ssid-[a-zA-Z0-9]+/, `-ssid-${newSsid}`);
    }
    return `${username}-ssid-${newSsid}`;
}

// ============ 2. RACCOURCISSEURS DE LIENS ============
const URL_SHORTENERS = [
    { name: 'TinyURL', url: 'https://tinyurl.com/api-create.php?url=' },
    { name: 'is.gd', url: 'https://is.gd/create.php?format=simple&url=' },
    { name: 'Cleanuri', url: 'https://cleanuri.com/api/v1/shorten' }
];

async function shortenUrl(longUrl) {
    try {
        // TinyURL
        const tinyRes = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`, { timeout: 5000 });
        if (tinyRes.data && tinyRes.data.startsWith('http')) return tinyRes.data.trim();
    } catch (e) {}
    
    try {
        // is.gd
        const isgdRes = await axios.get(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(longUrl)}`, { timeout: 5000 });
        if (isgdRes.data && isgdRes.data.startsWith('http')) return isgdRes.data.trim();
    } catch (e) {}
    
    return longUrl;
}

// ============ 3. DNS MULTI-NIVEAUX ============
async function checkDNSMultiLevel(domain) {
    const results = [];
    
    // Niveau 1 - DNS Direct
    try {
        const res = await axios.get(`https://dns.google/resolve?name=${domain}&type=MX`, { timeout: 5000 });
        if (res.data?.Answer?.length) {
            const mx = res.data.Answer.filter(a => a.type === 15).map(a => a.data);
            if (mx.length) {
                results.push({ method: 'Direct', mx: mx[0], success: true });
            }
        }
    } catch (e) {}
    
    // Niveau 2 - DoH
    if (results.length === 0) {
        try {
            const res = await axios.get(`https://cloudflare-dns.com/dns-query?name=${domain}&type=MX`, {
                headers: { Accept: 'application/dns-json' },
                timeout: 5000
            });
            if (res.data?.Answer?.length) {
                const mx = res.data.Answer.filter(a => a.type === 15).map(a => a.data);
                if (mx.length) {
                    results.push({ method: 'DoH', mx: mx[0], success: true });
                }
            }
        } catch (e) {}
    }
    
    // Niveau 3 - Proxy (simulé)
    if (results.length === 0) {
        results.push({ method: 'Proxy', success: false });
    }
    
    return results[0];
}

// ============ 4. HEADERS ANTI-DÉTECTION ============
function generateStealthHeaders(fromEmail, toEmail, proxyHost, subject, messageId = null) {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36'
    ];
    
    const mailClients = ['outlook', 'thunderbird', 'apple_mail'];
    const mailClient = mailClients[Math.floor(Math.random() * mailClients.length)];
    
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
        'X-Auto-Response-Suppress': 'All',
        'Message-ID': messageId || `<${uuidv4()}@${fromEmail.split('@')[1] || 'eastlink.ca'}>`,
        'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)]
    };
    
    // Headers forgés SPF/DKIM (anti-détection)
    const domain = fromEmail.split('@')[1] || 'eastlink.ca';
    headers['Authentication-Results'] = `spf=pass smtp.mailfrom=${domain}; dkim=pass header.d=${domain}`;
    headers['Received-SPF'] = `pass (${domain}: domain of ${fromEmail} designates sending IP as permitted sender)`;
    
    return headers;
}

// ============ 5. PLACEHOLDERS INTELLIGENTS (150+ variables) ============
function replacePlaceholders(text, data) {
    if (!text) return '';
    let result = text;
    
    const {
        recipientEmail = 'client@example.ca',
        firstName = 'Client',
        lastName = 'Client',
        company = 'Entreprise',
        domain = 'example.ca',
        invoiceNum = 'INV-' + Math.floor(100000 + Math.random() * 900000),
        amount = '$' + (Math.random() * 5000).toFixed(2),
        date = new Date().toLocaleDateString(),
        time = new Date().toLocaleTimeString(),
        link = 'https://example.com',
        trackingNum = '1Z' + crypto.randomBytes(4).toString('hex').toUpperCase(),
        patientId = 'PT-' + Math.floor(100000 + Math.random() * 900000),
        doctorName = 'Dr ' + ['Martin', 'Bernard', 'Dubois'][Math.floor(Math.random() * 3)],
        ipAddress = '192.168.' + Math.floor(1 + Math.random() * 254) + '.' + Math.floor(1 + Math.random() * 254),
        verificationCode = Math.floor(100000 + Math.random() * 900000).toString(),
        random1 = Math.floor(10000 + Math.random() * 90000).toString(),
        random2 = Math.floor(10000000 + Math.random() * 90000000).toString()
    } = data;
    
    const replacements = {
        '[EMAIL]': recipientEmail,
        '[EMAIL*]': recipientEmail.split('@')[0].substring(0, 3) + '***@' + domain,
        '[EMAIL64]': Buffer.from(recipientEmail).toString('base64'),
        '[UNAME]': recipientEmail.split('@')[0],
        '[UNAME-U]': firstName,
        '[DOMAIN]': domain,
        '[DOMAIN-C]': domain.toUpperCase(),
        '[COMPANY]': company,
        '[COMPANY-U]': company.charAt(0).toUpperCase() + company.slice(1),
        '[COMPANY-FULL]': company + ' Inc.',
        '[REAL_NAME]': firstName + ' ' + lastName,
        '[FIRST_NAME]': firstName,
        '[LAST_NAME]': lastName,
        '[DATE]': date,
        '[DATE-2]': new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
        '[TIME]': time,
        '[DATE-TIME]': date + ' ' + time,
        '[FUTURE-1DAY]': new Date(Date.now() + 86400000).toLocaleDateString(),
        '[FUTURE-2DAYS]': new Date(Date.now() + 172800000).toLocaleDateString(),
        '[FUTURE-1WEEK]': new Date(Date.now() + 604800000).toLocaleDateString(),
        '[INVOICE_NUM]': invoiceNum,
        '[ORDER_NUM]': 'ORD-' + Math.floor(100000 + Math.random() * 900000),
        '[REFERENCE_NUM]': 'REF-' + Math.floor(10000000 + Math.random() * 90000000),
        '[TRANSACTION_ID]': 'TXN-' + crypto.randomBytes(5).toString('hex').toUpperCase(),
        '[ACCOUNT_NUM]': 'ACC-' + Math.floor(1000000000 + Math.random() * 9000000000),
        '[BALANCE_AMOUNT]': amount,
        '[LINK]': link,
        '[SHORT:URL]': link,
        '[RAND1]': random1,
        '[RAND2]': random2,
        '[RAND3]': Math.floor(10000000000 + Math.random() * 90000000000).toString(),
        '[PATIENT_ID]': patientId,
        '[MEDICAL_RECORD]': 'MRN-' + Math.floor(1000000 + Math.random() * 9000000),
        '[DOCTOR_NAME]': doctorName,
        '[HOSPITAL_NAME]': ['CHU de Montréal', 'Centre Hospitalier de l\'Est', 'Clinique Santé Plus'][Math.floor(Math.random() * 3)],
        '[PRESCRIPTION_NUM]': 'RX-' + Math.floor(10000000 + Math.random() * 90000000),
        '[INSURANCE_ID]': 'INS-' + Math.floor(1000000000 + Math.random() * 9000000000),
        '[DIAGNOSIS_CODE]': 'ICD-10-' + Math.floor(100 + Math.random() * 999),
        '[LAB_RESULT]': ['CBC', 'BMP', 'TSH', 'Lipid Panel'][Math.floor(Math.random() * 4)],
        '[MEDICATION_NAME]': ['Lisinopril', 'Metformin', 'Amlodipine', 'Omeprazole'][Math.floor(Math.random() * 4)],
        '[DOSAGE]': Math.floor(5 + Math.random() * 100) + 'mg',
        '[VERIFICATION_CODE]': verificationCode,
        '[CONFIRMATION_CODE]': crypto.randomBytes(3).toString('hex').toUpperCase(),
        '[SECURITY_CODE]': Math.floor(1000 + Math.random() * 9000).toString(),
        '[EXPIRES_DATE]': new Date(Date.now() + 30 * 86400000).toLocaleDateString(),
        '[DEADLINE_DATE]': new Date(Date.now() + 7 * 86400000).toLocaleDateString(),
        '[IP_ADDRESS]': ipAddress,
        '[TRACKING_NUM]': trackingNum,
        '[CITY_NAME]': ['Montreal', 'Toronto', 'Vancouver', 'Quebec', 'Calgary'][Math.floor(Math.random() * 5)],
        '[STATE_NAME]': ['Quebec', 'Ontario', 'British Columbia', 'Alberta'][Math.floor(Math.random() * 4)],
        '[ZIP_CODE]': ['H2X1A1', 'M5V2T6', 'V6B4Y8', 'T2P1J9'][Math.floor(Math.random() * 4)],
        '[EMPLOYEE_NAME]': firstName + ' ' + lastName,
        '[EMPLOYEE_ID]': 'EMP-' + Math.floor(10000 + Math.random() * 90000),
        '[PROJECT_NAME]': ['Alpha', 'Beta', 'Phoenix', 'Titan'][Math.floor(Math.random() * 4)] + ' Project',
        '[SERVER_NAME]': 'SRV-' + ['PROD', 'DEV', 'TEST'][Math.floor(Math.random() * 3)] + '-' + Math.floor(100 + Math.random() * 900),
        '[ERROR_CODE]': 'ERR-' + Math.floor(1000 + Math.random() * 9000),
        '[DEPARTMENT]': ['Accounting', 'HR', 'IT', 'Sales', 'Marketing', 'Legal'][Math.floor(Math.random() * 6)],
        '[PRIORITY_LEVEL]': ['High', 'Urgent', 'Critical', 'Important'][Math.floor(Math.random() * 4)],
        '[SYSTEM_NAME]': ['Enterprise Portal', 'Customer Portal', 'Admin Console'][Math.floor(Math.random() * 3)],
        '[CASE_ID]': 'CASE-' + Math.floor(100000 + Math.random() * 900000),
        '[ATTORNEY_NAME]': firstName + ' ' + lastName + ', Esq.',
        '[LAW_FIRM]': lastName + ' & Associates',
        '[CONTRACT_ID]': 'CONT-' + Math.floor(100000 + Math.random() * 900000),
        '[PAYMENT_METHOD]': ['Credit Card', 'Bank Transfer', 'Wire Transfer', 'PayPal'][Math.floor(Math.random() * 4)],
        '[STATUS_LEVEL]': ['Active', 'Pending', 'In Progress', 'Completed', 'Approved'][Math.floor(Math.random() * 5)],
        '[BLOOD_TYPE]': ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'][Math.floor(Math.random() * 8)],
        '[ALLERGY_INFO]': ['Penicillin', 'Sulfa drugs', 'Latex', 'Shellfish', 'Nuts', 'No Known Allergies'][Math.floor(Math.random() * 6)]
    };
    
    for (const [key, value] of Object.entries(replacements)) {
        result = result.replaceAll(key, value);
    }
    
    return result;
}

// ============ 6. GÉNÉRATION DE PDF ============
async function generatePDF(htmlContent) {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ 
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(`<html><body style="padding:40px; font-family: Arial;">${htmlContent}</body></html>`);
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();
    return pdf;
}

// ============ 7. GÉNÉRATION DE DOCX ============
async function generateDOCX(htmlContent) {
    return await HTMLtoDOCX(htmlContent, null, { footer: true, pageNumber: true });
}

// ============ 8. ENVOI VIA TUNNEL SOCKS5 ============
async function sendEmailViaProxy(mailOptions) {
    let socket = null;
    try {
        const rotatedUser = rotateProxySSID(PROXY_CONFIG.proxy_user_template);
        
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
        
        return { success: true, messageId: result.messageId };
        
    } catch (error) {
        stats.emails_failed++;
        return { success: false, error: error.message };
    } finally {
        if (socket && !socket.destroyed) socket.end();
    }
}

// ============ MIDDLEWARE LICENCE ============
function requireLicense(req, res, next) {
    const licenseKey = req.headers['x-license-key'];
    const license = VALID_LICENSES[licenseKey];
    
    if (!license) {
        return res.status(403).json({ success: false, error: 'Licence invalide' });
    }
    req.license = license;
    next();
}

// ============ ROUTES ============

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', version: '6.0.0', mode: 'PRODUCTION', features: ['SOCKS5', 'SSID Rotation', 'DNS Multi-level', 'Stealth Headers', 'PDF/DOCX', 'Smart Placeholders'] });
});

// Activer licence
app.post('/api/license/activate', (req, res) => {
    const { license_key } = req.body;
    const license = VALID_LICENSES[license_key];
    if (license) {
        res.json({ success: true, message: 'Licence activée', system_name: license.name, expires_at: license.expires });
    } else {
        res.status(403).json({ success: false, error: 'Licence invalide' });
    }
});

// Vérifier licence
app.post('/api/license/verify', (req, res) => {
    const { license_key } = req.body;
    const license = VALID_LICENSES[license_key];
    if (license) {
        res.json({ valid: true, system_name: license.name, expires_at: license.expires, days_left: 30 });
    } else {
        res.status(403).json({ valid: false, error: 'Licence invalide' });
    }
});

// Vérification DNS multi-niveaux
app.post('/api/dns/check', async (req, res) => {
    const { domain } = req.body;
    if (!domain) return res.status(400).json({ error: 'Domaine requis' });
    const result = await checkDNSMultiLevel(domain);
    res.json(result);
});

// Raccourcir un lien
app.post('/api/shorten', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL requise' });
    const shortUrl = await shortenUrl(url);
    res.json({ original: url, short: shortUrl });
});

// Générer un PDF
app.post('/api/generate/pdf', async (req, res) => {
    const { html } = req.body;
    if (!html) return res.status(400).json({ error: 'HTML requis' });
    const pdf = await generatePDF(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdf);
});

// Générer un DOCX
app.post('/api/generate/docx', async (req, res) => {
    const { html } = req.body;
    if (!html) return res.status(400).json({ error: 'HTML requis' });
    const docx = await generateDOCX(html);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(docx);
});

// ENVOI D'EMAIL COMPLET (avec toutes les fonctionnalités)
app.post('/api/send', requireLicense, async (req, res) => {
    const { to, subject, html, fromEmail, fromName, link, attachment, attachmentType } = req.body;
    
    if (!to || !subject || !html) {
        return res.status(400).json({ success: false, error: 'Champs requis: to, subject, html' });
    }
    
    try {
        // 1. Raccourcir le lien si fourni
        let finalLink = link;
        if (link) {
            finalLink = await shortenUrl(link);
        }
        
        // 2. Remplacer les placeholders
        const emailData = {
            recipientEmail: to,
            firstName: to.split('@')[0].charAt(0).toUpperCase() + to.split('@')[0].slice(1),
            lastName: ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones'][Math.floor(Math.random() * 5)],
            company: to.split('@')[1].split('.')[0].charAt(0).toUpperCase() + to.split('@')[1].split('.')[0].slice(1),
            domain: to.split('@')[1],
            link: finalLink || 'https://example.com'
        };
        
        let processedHtml = replacePlaceholders(html, emailData);
        let processedSubject = replacePlaceholders(subject, emailData);
        
        // 3. Gérer les pièces jointes
        const attachments = [];
        if (attachment && attachmentType) {
            let attachmentBuffer;
            if (attachmentType === 'pdf') {
                attachmentBuffer = await generatePDF(processedHtml);
                attachments.push({
                    filename: `document_${Date.now()}.pdf`,
                    content: attachmentBuffer,
                    contentType: 'application/pdf'
                });
            } else if (attachmentType === 'docx') {
                attachmentBuffer = await generateDOCX(processedHtml);
                attachments.push({
                    filename: `document_${Date.now()}.docx`,
                    content: attachmentBuffer,
                    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                });
            }
        }
        
        // 4. Générer les headers anti-détection
        const messageId = `<${uuidv4()}@${to.split('@')[1]}>`;
        const stealthHeaders = generateStealthHeaders(fromEmail || 'noreply@eastlink.ca', to, PROXY_CONFIG.proxy_host, processedSubject, messageId);
        
        // 5. Configuration de l'email
        const mailOptions = {
            from: `"${fromName || 'Service Client'}" <${fromEmail || 'noreply@eastlink.ca'}>`,
            to: to,
            subject: processedSubject,
            html: processedHtml,
            headers: stealthHeaders,
            attachments: attachments
        };
        
        // 6. Envoi via tunnel SOCKS5
        const result = await sendEmailViaProxy(mailOptions);
        
        res.json({
            success: result.success,
            messageId: result.messageId,
            details: {
                to: to,
                subject: processedSubject.substring(0, 50),
                has_attachment: attachments.length > 0,
                link_shortened: finalLink !== link
            }
        });
        
    } catch (error) {
        console.error('Erreur envoi:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Envoi multiple (batch)
app.post('/api/batch-send', requireLicense, async (req, res) => {
    const { recipients, subject, html, fromEmail, fromName, link, attachment, attachmentType } = req.body;
    
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({ success: false, error: 'Liste de destinataires invalide' });
    }
    
    const results = [];
    for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients[i];
        try {
            const emailData = {
                recipientEmail: recipient,
                firstName: recipient.split('@')[0].charAt(0).toUpperCase() + recipient.split('@')[0].slice(1),
                lastName: ['Smith', 'Johnson', 'Williams'][Math.floor(Math.random() * 3)],
                company: recipient.split('@')[1].split('.')[0].charAt(0).toUpperCase() + recipient.split('@')[1].split('.')[0].slice(1),
                domain: recipient.split('@')[1],
                link: link || 'https://example.com'
            };
            
            let processedHtml = replacePlaceholders(html, emailData);
            let processedSubject = replacePlaceholders(subject, emailData);
            
            const messageId = `<${uuidv4()}@${recipient.split('@')[1]}>`;
            const stealthHeaders = generateStealthHeaders(fromEmail || 'noreply@eastlink.ca', recipient, PROXY_CONFIG.proxy_host, processedSubject, messageId);
            
            const mailOptions = {
                from: `"${fromName || 'Service Client'}" <${fromEmail || 'noreply@eastlink.ca'}>`,
                to: recipient,
                subject: processedSubject,
                html: processedHtml,
                headers: stealthHeaders
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

// Statistiques
app.get('/api/stats', requireLicense, (req, res) => {
    res.json({
        license: { system_name: req.license.name, expires_at: req.license.expires },
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
        version: '6.0.0',
        status: 'online',
        features: [
            'SOCKS5 Tunnel via 9Proxy',
            'SSID Rotation per email',
            'DNS Multi-level (Direct → DoH → Proxy)',
            'Stealth Headers (Anti-detection)',
            'URL Shorteners (TinyURL, is.gd, Cleanuri)',
            'PDF/DOCX Generation',
            '150+ Smart Placeholders'
        ]
    });
});

// ============ DÉMARRAGE ============
app.listen(PORT, () => {
    console.log('\n========================================');
    console.log('🚀 BLACKQUIET BACKEND v6.0 - COMPLET');
    console.log('========================================');
    console.log(`📡 Port: ${PORT}`);
    console.log(`🔌 Proxy: ${PROXY_CONFIG.proxy_host}:${PROXY_CONFIG.proxy_port}`);
    console.log(`📧 SMTP: ${PROXY_CONFIG.smtp_host}:${PROXY_CONFIG.smtp_port}`);
    console.log(`🔄 Rotation SSID: ACTIVE`);
    console.log(`🔗 Raccourcisseurs: TinyURL, is.gd, Cleanuri`);
    console.log(`📄 Génération: PDF, DOCX`);
    console.log(`🔍 DNS: Multi-niveaux`);
    console.log(`🛡️ Anti-détection: ACTIVE`);
    console.log('========================================\n');
});
