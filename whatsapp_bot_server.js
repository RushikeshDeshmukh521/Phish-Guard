// A WhatsApp bot that uses the Gemini API to detect spam and handles basic conversation.

const express = require('express');
const https = require('https');

const app = express();
app.use(express.json());

// --- CONFIGURATION ---
// Load secrets from Render's Environment Variables
const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const PORT = process.env.PORT || 3000;

// --- GEMINI API FUNCTION (Unchanged) ---
async function analyzeMessageForSpam(messageText) {
    if (!GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY is not set.");
        return "Could not analyze the message. Bot is not configured correctly.";
    }
    const postData = JSON.stringify({
        "contents": [{
            "parts": [{
                "text": `Analyze the following message to determine if it is spam, a scam, or legitimate. Consider common spam tactics like urgency, suspicious links, and unusual requests. Respond with only one of these three words: SPAM, SCAM, or LEGITIMATE.\n\nMessage: "${messageText}"`
            }]
        }]
    });
    const options = {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    };
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    const result = response.candidates[0].content.parts[0].text.trim();
                    resolve(result);
                } catch (error) {
                    console.error("Error parsing Gemini response:", data);
                    reject("Error analyzing message.");
                }
            });
        });
        req.on('error', (e) => {
            console.error("Error calling Gemini API:", e);
            reject("Could not reach analysis service.");
        });
        req.write(postData);
        req.end();
    });
}

// --- WEBHOOK ENDPOINTS (Unchanged) ---
app.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode && token && mode === 'subscribe' && token === VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// --- MAIN MESSAGE HANDLER (UPDATED WITH NEW LOGIC) ---
app.post('/', async (req, res) => {
    const body = req.body;
    if (body.object === 'whatsapp_business_account' && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        const message = body.entry[0].changes[0].value.messages[0];
        if (message.type === 'text') {
            const from = message.from;
            const msg_body = message.text.body;
            const msg_body_lower = msg_body.toLowerCase(); // Convert to lowercase for easy checking

            // *** NEW CONVERSATIONAL LOGIC STARTS HERE ***

            // 1. Check for greetings
            if (msg_body_lower === 'hi' || msg_body_lower === 'hello' || msg_body_lower === 'hey') {
                const welcomeMessage = "Hello there! How can I assist you today? Feel free to send me any message, link, or email content, and I'll analyze it for spam.";
                sendMessage(from, welcomeMessage);
            
            // 2. Check for help requests
            } else if (msg_body_lower === 'help' || msg_body_lower === 'info') {
                const helpMessage = "I am an AI-powered bot designed to help you identify spam. You can forward me suspicious messages, links, or emails. I will analyze them and tell you if they seem like a scam or are legitimate.";
                sendMessage(from, helpMessage);

            // 3. If it's not a greeting or help, analyze for spam
            } else {
                console.log(`Analyzing message from ${from}: "${msg_body}"`);
                try {
                    const analysisResult = await analyzeMessageForSpam(msg_body);
                    let reply_body = "";
                    if (analysisResult.includes("SPAM") || analysisResult.includes("SCAM")) {
                        reply_body = `🚨 *Warning!* This message looks like *${analysisResult}*.\n\nBe careful with links, and do not share personal information.`;
                    } else if (analysisResult.includes("LEGITIMATE")) {
                        reply_body = `✅ This message seems *LEGITIMATE*.\n\nAs always, remain cautious online.`;
                    } else {
                        reply_body = `🤔 Analysis complete. The content appears to be: ${analysisResult}.`;
                    }
                    sendMessage(from, reply_body);
                } catch (error) {
                    console.error("Error during spam analysis:", error);
                    sendMessage(from, "Sorry, I couldn't analyze that message right now.");
                }
            }
            // *** NEW CONVERSATIONAL LOGIC ENDS HERE ***
        }
    }
    res.sendStatus(200);
});

// --- SEND MESSAGE FUNCTION (Unchanged) ---
function sendMessage(to, text) {
    const data = JSON.stringify({
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { 
            preview_url: true,
            body: text 
        }
    });
    const options = {
        hostname: 'graph.facebook.com',
        path: `/v20.0/${PHONE_NUMBER_ID}/messages`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`
        }
    };
    const req = https.request(options, res => {
        console.log(`WhatsApp API statusCode: ${res.statusCode}`);
    });
    req.on('error', error => console.error('Error sending WhatsApp message:', error));
    req.write(data);
    req.end();
}

app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

