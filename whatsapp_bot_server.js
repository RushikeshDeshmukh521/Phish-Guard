// A simple WhatsApp bot server using Node.js and Express.
// It receives messages and echoes them back to the user.

const express = require('express');
const https = require('https');

const app = express();
// Middleware to parse JSON request bodies.
app.use(express.json());

// --- CONFIGURATION ---
// These values are now loaded from Environment Variables for security and flexibility.
const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});


// --- WEBHOOK SETUP ---
// This endpoint is used by Meta to verify your webhook.
app.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            console.error('Failed validation. Make sure the verify tokens match.');
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400);
    }
});


// --- RECEIVE MESSAGES ---
// This endpoint receives the actual messages from users.
app.post('/', (req, res) => {
    const body = req.body;

    console.log('Incoming webhook:', JSON.stringify(body, null, 2));

    if (body.object === 'whatsapp_business_account' && body.entry && body.entry.length > 0) {
        body.entry.forEach(entry => {
            if (entry.changes && entry.changes.length > 0) {
                entry.changes.forEach(change => {
                    if (change.field === 'messages' && change.value.messages && change.value.messages.length > 0) {
                        const message = change.value.messages[0];
                        if (message.type === 'text') {
                            const from = message.from; // Sender's phone number
                            const msg_body = message.text.body; // The message text

                            console.log(`Message from ${from}: ${msg_body}`);
                            sendMessage(from, `You said: "${msg_body}"`);
                        }
                    }
                });
            }
        });
    }

    res.sendStatus(200);
});

// --- SEND MESSAGE FUNCTION ---
function sendMessage(to, text) {
    const data = JSON.stringify({
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: {
            preview_url: false, // Disables link previews for this message
            body: text
        }
    });

    const options = {
        hostname: 'graph.facebook.com',
        path: `/v20.0/${PHONE_NUMBER_ID}/messages`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length,
            'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`
        }
    };

    const req = https.request(options, res => {
        console.log(`statusCode: ${res.statusCode}`);
        let responseBody = '';
        res.on('data', d => {
            responseBody += d;
        });
        res.on('end', () => {
             console.log('Response from WhatsApp API:', responseBody);
        });
    });

    req.on('error', error => {
        console.error('Error sending message:', error);
    });

    req.write(data);
    req.end();
}


app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
    if (!WHATSAPP_API_TOKEN || !VERIFY_TOKEN || !PHONE_NUMBER_ID) {
        console.error("CRITICAL ERROR: Environment variables are not set. Please check your Render configuration.");
    }
});
