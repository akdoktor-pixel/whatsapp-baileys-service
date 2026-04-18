const { makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const express = require('express');
const pino = require('pino');

const app = express();
app.use(express.json());

let sock = null;
let isConnected = false;

// WhatsApp bağlantısı
async function connectWhatsApp() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('./auth');
        
        sock = makeWASocket({
            auth: state,
            logger: pino({ level: 'debug' }),
            browser: ["Chrome", "Windows", "10.0.0"],
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            printQRInTerminal: true,
            connectTimeoutMs: 60000,
            qrTimeout: 60000,
            defaultQueryTimeoutMs: undefined,
            keepAliveIntervalMs: 30000,
        });

        sock.ev.on('connection.update', (update) => {
            console.log('Connection update:', JSON.stringify(update, null, 2));
            
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log('QR Code:');
                qrcode.generate(qr, { small: true });
            }
            
            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('Connection closed. Reconnecting...', shouldReconnect);
                console.log('Last disconnect error:', lastDisconnect.error);
                if (shouldReconnect) {
                    setTimeout(() => connectWhatsApp(), 5000);
                }
            } else if (connection === 'open') {
                console.log('WhatsApp connected!');
                isConnected = true;
            }
        });

        sock.ev.on('creds.update', saveCreds);
        
        sock.ev.on('error', (error) => {
            console.error('Socket error:', error);
        });
        
    } catch (error) {
        console.error('Connection error:', error);
        setTimeout(() => connectWhatsApp(), 5000);
    }
}

// Mesaj gönderme endpoint
app.post('/send', async (req, res) => {
    const { phone, message } = req.body;
    
    if (!sock || !isConnected) {
        return res.status(503).json({ error: 'WhatsApp not connected' });
    }
    
    try {
        const jid = phone.includes('@s.whatsapp.net') ? phone : `${phone}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text: message });
        res.json({ success: true });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: error.message });
    }
});

// Status endpoint
app.get('/status', (req, res) => {
    res.json({ connected: isConnected });
});

// Sunucuyu başlat
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`WhatsApp service running on port ${PORT}`);
    connectWhatsApp();
});
