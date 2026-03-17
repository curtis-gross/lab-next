import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Modality, MediaResolution } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '50mb' }));
const port = process.env.PORT || 8080;

let ai;
try {
    const project = process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
    const location = process.env.GCP_REGION || process.env.GOOGLE_CLOUD_REGION || 'us-central1';
    
    if (project) {
        console.log(`Initializing GoogleGenAI with Vertex AI (Project: ${project}, Location: ${location})`);
        ai = new GoogleGenAI({ vertexai: { project, location } });
    } else if (process.env.GEMINI_API_KEY) {
        console.log("Fallback to GEMINI_API_KEY for local dev without project set.");
        ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY.replace(/["']/g, '') });
    } else {
        console.warn("No GCP_PROJECT or GEMINI_API_KEY found. GenAI endpoints will fail.");
    }
} catch (e) {
    console.error("Failed to initialize GoogleGenAI:", e);
}

const checkAi = (req, res, next) => {
    if (!ai) return res.status(500).json({ error: "GoogleGenAI client not initialized on server." });
    next();
};

console.log(`Starting server configuration. Port: ${port}`);

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// --- API Routes ---

app.get('/api/key', (req, res) => {
    res.json({ apiKey: process.env.VITE_GEMINI_API_KEY || '' });
});

app.post('/api/genai/generateContent', checkAi, async (req, res) => {
    try {
        let { model, contents, config, systemInstruction } = req.body;
        
        console.log(`\n--- [Backend Proxy] /api/genai/generateContent ---`);
        console.log(`Model: ${model}`);
        if (contents) {
            const preview = JSON.stringify(contents).substring(0, 300);
            console.log(`Contents preview: ${preview}${preview.length >= 300 ? '...' : ''}`);
        }
        console.log(`----------------------------------------------------\n`);
        
        // Normalize contents array to satisfy Vertex strict role requirements
        if (contents && !Array.isArray(contents) && contents.parts) {
            contents = [{ role: "user", parts: contents.parts }];
        } else if (Array.isArray(contents)) {
            contents = contents.map(c => {
                if (!c.role && c.parts) {
                    return { ...c, role: "user" };
                }
                if (!c.parts && !c.role) { // e.g., if array of parts was sent directly
                   return { role: "user", parts: [c] };
                }
                return c;
            });
        }
        
        const response = await ai.models.generateContent({ model, contents, config, systemInstruction });
        res.json(response);
    } catch (e) {
        console.error("generateContent error:", e);
        res.status(500).json({ error: e.message || "Failed to generate content" });
    }
});

app.post('/api/genai/generateVideos', checkAi, async (req, res) => {
    try {
        const { model, prompt, image, config } = req.body;
        const response = await ai.models.generateVideos({ model, prompt, image, config });
        res.json(response);
    } catch (e) {
        console.error("generateVideos error:", e);
        res.status(500).json({ error: e.message || "Failed to generate videos" });
    }
});

app.post('/api/save-image', (req, res) => {
    try {
        const { image, filename } = req.body;
        if (!image || !filename) {
            return res.status(400).json({ error: 'Image and filename are required' });
        }

        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');

        // Save to public (source) so it can be committed
        const publicDir = path.join(__dirname, 'public', 'images', 'generated');
        if (!fs.existsSync(publicDir)) {
            fs.mkdirSync(publicDir, { recursive: true });
        }
        fs.writeFileSync(path.join(publicDir, filename), buffer);

        // Save to dist (serving) so it works immediately
        const distDir = path.join(__dirname, 'dist', 'images', 'generated');
        if (!fs.existsSync(distDir)) {
            fs.mkdirSync(distDir, { recursive: true });
        }
        const filePath = path.join(distDir, filename);
        fs.writeFileSync(filePath, buffer);

        console.log(`Saved image to ${filePath} and public source`);
        res.json({ url: `/images/generated/${filename}` });
    } catch (error) {
        console.error('Failed to save image:', error);
        res.status(500).json({ error: 'Failed to save image' });
    }
}
);

app.post('/api/save-video', async (req, res) => {
    try {
        const { video, videoUrl, filename } = req.body;
        if ((!video && !videoUrl) || !filename) {
            return res.status(400).json({ error: 'Video (or videoUrl) and filename are required' });
        }

        let buffer;
        if (videoUrl) {
            console.log(`Fetching video from URL: ${videoUrl}`);
            const vidRes = await fetch(videoUrl);
            if (!vidRes.ok) throw new Error(`Failed to fetch video: ${vidRes.statusText}`);
            const arrayBuffer = await vidRes.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
        } else {
            // Handle base64 string
            const base64Data = video.replace(/^data:video\/\w+;base64,/, "");
            buffer = Buffer.from(base64Data, 'base64');
        }

        // Save to public (source)
        const publicDir = path.join(__dirname, 'public', 'videos', 'generated');
        if (!fs.existsSync(publicDir)) {
            fs.mkdirSync(publicDir, { recursive: true });
        }
        fs.writeFileSync(path.join(publicDir, filename), buffer);

        // Save to dist (serving)
        const distDir = path.join(__dirname, 'dist', 'videos', 'generated');
        if (!fs.existsSync(distDir)) {
            fs.mkdirSync(distDir, { recursive: true });
        }
        const filePath = path.join(distDir, filename);
        fs.writeFileSync(filePath, buffer);

        console.log(`Saved video to ${filePath} and public source`);
        res.json({ url: `/videos/generated/${filename}` });
    } catch (error) {
        console.error('Failed to save video:', error);
        res.status(500).json({ error: 'Failed to save video' });
    }
});



// Audience Persistence
const AUDIENCES_FILE = path.join(__dirname, 'public', 'data', 'audiences.json');

app.get('/api/audiences', (req, res) => {
    if (fs.existsSync(AUDIENCES_FILE)) {
        try {
            const data = fs.readFileSync(AUDIENCES_FILE, 'utf8');
            res.json(JSON.parse(data));
        } catch (e) {
            console.error("Error reading audiences:", e);
            res.status(500).json({ error: "Failed to read audiences" });
        }
    } else {
        res.json([]); // Return empty if no file
    }
});

app.post('/api/audiences', (req, res) => {
    try {
        const dir = path.dirname(AUDIENCES_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(AUDIENCES_FILE, JSON.stringify(req.body, null, 2));

        // Also update dist if it exists so changes are reflected in current serve without rebuild
        const distFile = path.join(__dirname, 'dist', 'data', 'audiences.json');
        const distDir = path.dirname(distFile);
        if (fs.existsSync(path.join(__dirname, 'dist'))) {
            if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
            fs.writeFileSync(distFile, JSON.stringify(req.body, null, 2));
        }

        res.json({ success: true });
    } catch (e) {
        console.error("Error saving audiences:", e);
        res.status(500).json({ error: "Failed to save audiences" });
    }
});

// Email Campaigns Persistence
const EMAIL_CAMPAIGNS_FILE = path.join(__dirname, 'public', 'data', 'email_campaigns.json');

app.get('/api/load-email-campaigns', (req, res) => {
    if (fs.existsSync(EMAIL_CAMPAIGNS_FILE)) {
        try {
            const data = fs.readFileSync(EMAIL_CAMPAIGNS_FILE, 'utf8');
            res.json(JSON.parse(data));
        } catch (e) {
            console.error("Error reading email campaigns:", e);
            res.json([]); // Return empty on error to avoid breaking UI
        }
    } else {
        res.json([]); // Return empty if no file
    }
});

app.post('/api/save-email-campaigns', (req, res) => {
    try {
        const campaigns = req.body;
        if (!Array.isArray(campaigns)) {
            return res.status(400).json({ error: "Campaigns must be an array" });
        }

        const dir = path.dirname(EMAIL_CAMPAIGNS_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(EMAIL_CAMPAIGNS_FILE, JSON.stringify(campaigns, null, 2));

        // Update dist
        const distFile = path.join(__dirname, 'dist', 'data', 'email_campaigns.json');
        const distDir = path.dirname(distFile);
        if (fs.existsSync(path.join(__dirname, 'dist'))) {
            if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
            fs.writeFileSync(distFile, JSON.stringify(campaigns, null, 2));
        }

        res.json({ success: true });
    } catch (e) {
        console.error("Error saving email campaigns:", e);
        res.status(500).json({ error: "Failed to save email campaigns" });
    }
});

// Generic Run Persistence
const getRunFile = (featureId) => path.join(__dirname, 'public', 'data', `${featureId}_run.json`);

app.get('/api/load-run/:featureId', (req, res) => {
    const { featureId } = req.params;
    const filePath = getRunFile(featureId);

    if (fs.existsSync(filePath)) {
        try {
            const data = fs.readFileSync(filePath, 'utf8');
            res.json(JSON.parse(data));
        } catch (e) {
            console.error(`Error reading ${featureId} run:`, e);
            res.status(500).json({ error: "Failed to read run" });
        }
    } else {
        res.status(404).json({ error: "No saved run found" });
    }
});

app.post('/api/save-run', (req, res) => {
    try {
        const { featureId, data } = req.body;
        if (!featureId) return res.status(400).json({ error: "featureId is required" });

        const filePath = getRunFile(featureId);
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

        // Update dist
        const distFile = path.join(__dirname, 'dist', 'data', `${featureId}_run.json`);
        const distDir = path.dirname(distFile);
        if (fs.existsSync(path.join(__dirname, 'dist'))) {
            if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
            fs.writeFileSync(distFile, JSON.stringify(data, null, 2));
        }

        res.json({ success: true });
    } catch (e) {
        console.error("Error saving run:", e);
        res.status(500).json({ error: "Failed to save run" });
    }
});

// Add application specific API routes here
// app.post('/api/some-feature', async (req, res) => { ... });

// ------------------

// Image Proxy Endpoint to bypass CORS
app.post('/api/proxy-image', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL is required' });

        console.log(`Proxying image request for: ${url}`);

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch upstream image: ${response.status} ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString('base64');
        const mimeType = response.headers.get('content-type') || 'image/png';

        res.json({ base64, mimeType });
    } catch (error) {
        console.error("Proxy error:", error);
        res.status(500).json({ error: "Failed to proxy image" });
    }
});

// Debug Log Endpoint
app.post('/api/debug-log', async (req, res) => {
    try {
        const { prompt, imageUrl, timestamp } = req.body;
        console.log(`Received debug log request for ${imageUrl}`);

        let imageHtml = '<p>Image loading...</p>';
        try {
            const imgRes = await fetch(imageUrl);
            if (imgRes.ok) {
                const arrayBuffer = await imgRes.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const base64 = buffer.toString('base64');
                const mime = imgRes.headers.get('content-type') || 'image/png';
                imageHtml = `<img src="data:${mime};base64,${base64}" style="max-width: 100%; border: 1px solid #ccc;" />`;
            } else {
                imageHtml = `<p style="color:red">Failed to fetch image: ${imgRes.status} ${imgRes.statusText}</p>`;
            }
        } catch (fetchError) {
            imageHtml = `<p style="color:red">Error fetching image: ${fetchError.message}</p>`;
        }

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Debug Log</title>
                <style>
                    body { font-family: sans-serif; padding: 20px; max-width: 800px; mx-auto; }
                    .card { border: 1px solid #ddd; padding: 20px; border-radius: 8px; background: #f9f9f9; }
                    h1 { color: #000000; }
                    pre { background: #eee; padding: 10px; overflow-x: auto; }
                </style>
            </head>
            <body>
                <h1>Debug Log</h1>
                <p><strong>Timestamp:</strong> ${timestamp}</p>
                
                <div class="card">
                    <h3>Prompt Sent to Service:</h3>
                    <pre>${prompt}</pre>
                </div>

                <div class="card" style="margin-top: 20px;">
                    <h3>Reference Image Sent to Service:</h3>
                    <p>Source URL: <a href="${imageUrl}">${imageUrl}</a></p>
                    ${imageHtml}
                </div>
            </body>
            </html>
        `;

        const publicPath = path.join(__dirname, 'public', 'debug.html');
        const distPath = path.join(__dirname, 'dist', 'debug.html');

        fs.writeFileSync(publicPath, htmlContent);
        // Ensure dist exists before writing
        if (fs.existsSync(path.join(__dirname, 'dist'))) {
            fs.writeFileSync(distPath, htmlContent);
        }

        console.log('Debug HTML generated at /debug.html');
        res.json({ success: true, url: '/debug.html' });

    } catch (error) {
        console.error("Debug log error:", error);
        res.status(500).json({ error: "Failed to generate debug log" });
    }
});

app.post('/api/generate-audio-summary', async (req, res) => {
    try {
        const { textData, voiceName = 'Zephyr', language = 'english' } = req.body;
        if (!textData) return res.status(400).json({ error: "No text data provided" });

        // This specific feature requires the Gemini Developer API Key (AI Studio) 
        // because the gemini-2.5-flash-native-audio-preview model is not fully available on Vertex AI yet.
        if (!process.env.GEMINI_API_KEY) {
            console.warn("[Audio Generator] Missing GEMINI_API_KEY. This feature requires it to connect to AI Studio.");
            return res.status(400).json({ error: "The Live Audio generation feature requires a GEMINI_API_KEY in your .env file." });
        }

        const model = 'models/gemini-2.5-flash-native-audio-preview-09-2025';

        const config = {
            responseModalities: [Modality.AUDIO],
            mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: {
                        voiceName: voiceName,
                    }
                }
            },
            contextWindowCompression: {
                triggerTokens: '104857',
                slidingWindow: { targetTokens: '52428' },
            },
        };

        const responseQueue = [];
        const audioParts = [];
        let mimeTypeStr = '';
        
        // Isolate the client to strictly route to AI Studio
        const liveAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY.replace(/["']/g, '') });

        console.log(`[Audio Generator] Attempting to connect to Gemini Live (AI Studio)...`);
        console.log(`[Audio Generator] Auth Context: API Key Length=${process.env.GEMINI_API_KEY.length}`);

        const session = await liveAi.live.connect({
            model,
            callbacks: {
                onmessage: (message) => {
                    responseQueue.push(message);
                },
                onerror: (e) => console.error('[Audio Generator] Live Audio Session Error Event:', e),
                onclose: (e) => console.log('[Audio Generator] Live Audio Session Closed:', e),
            },
            config
        });
        console.log(`[Audio Generator] Connected to Gemini Live.`);

        const langInstruction = language === 'mandarin' 
            ? "Speak the entire summary fluently in Mandarin Chinese." 
            : "Speak the entire summary fluently in English.";
            
        const promptParam = `Here is the customer data for a client. Act as a Healthco Concierge Director and give a highly engaging, professional spoken summary of this client's profile in 2-3 sentences. Talk directly to the Concierge preparing for the call. ${langInstruction}\n${textData}`;

        session.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: promptParam }] }],
            turnComplete: true
        });

        // Wait loop handler
        let done = false;
        let timeout = 0;
        console.log(`[Audio Generator] Starting Gemini Live connection for ${language}...`);
        
        while (!done && timeout < 300) { // 300 * 50ms = 15 seconds max wait
            let message;
            if (responseQueue.length > 0) {
                message = responseQueue.shift();
                
                if (message?.serverContent?.modelTurn?.parts) {
                    const part = message.serverContent.modelTurn.parts[0];
                    if (part?.inlineData) {
                        if (audioParts.length === 0) {
                             console.log(`[Audio Generator] Receiving first audio chunks...`);
                        }
                        audioParts.push(part.inlineData.data);
                        if (!mimeTypeStr) mimeTypeStr = part.inlineData.mimeType;
                    }
                }
                if (message?.serverContent?.turnComplete) {
                    console.log(`[Audio Generator] Turn complete received. Total chunks: ${audioParts.length}`);
                    done = true;
                }
            } else {
                await new Promise(r => setTimeout(r, 50));
                timeout++;
            }
        }
        
        if (timeout >= 300) {
            console.warn(`[Audio Generator] WARNING: Timeout reached without turnComplete signal. Processing ${audioParts.length} received chunks.`);
        }

        session.close();

        if (audioParts.length > 0) {
            // Function to handle Wav generation
            const convertToWavBuffer = (rawData, mimeType) => {
                const parseMimeType = (mime) => {
                    const [fileType, ...params] = mime.split(';').map(s => s.trim());
                    const [, format] = fileType.split('/');
                    const options = { numChannels: 1, bitsPerSample: 16, sampleRate: 24000 };

                    if (format && format.startsWith('L')) {
                        const bits = parseInt(format.slice(1), 10);
                        if (!isNaN(bits)) options.bitsPerSample = bits;
                    }
                    for (const param of params) {
                        const [key, value] = param.split('=').map(s => s.trim());
                        if (key === 'rate') options.sampleRate = parseInt(value, 10);
                    }
                    return options;
                };

                const createHeader = (dataLength, opts) => {
                    const { numChannels, sampleRate, bitsPerSample } = opts;
                    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
                    const blockAlign = numChannels * bitsPerSample / 8;
                    const b = Buffer.alloc(44);
                    b.write('RIFF', 0); b.writeUInt32LE(36 + dataLength, 4);
                    b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16);
                    b.writeUInt16LE(1, 20); b.writeUInt16LE(numChannels, 22);
                    b.writeUInt32LE(sampleRate, 24); b.writeUInt32LE(byteRate, 28);
                    b.writeUInt16LE(blockAlign, 32); b.writeUInt16LE(bitsPerSample, 34);
                    b.write('data', 36); b.writeUInt32LE(dataLength, 40);
                    return b;
                };

                const buffers = rawData.map(d => Buffer.from(d, 'base64'));
                const actualDataLength = buffers.reduce((a, b) => a + b.length, 0);
                const opts = parseMimeType(mimeType);
                const wavHeader = createHeader(actualDataLength, opts);
                return Buffer.concat([wavHeader, ...buffers]);
            };

            const finalBuffer = convertToWavBuffer(audioParts, mimeTypeStr || 'audio/pcm;rate=24000');

            const filename = `summary_${Date.now()}.wav`;
            const publicDir = path.join(__dirname, 'public', 'audio', 'generated');
            if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
            fs.writeFileSync(path.join(publicDir, filename), finalBuffer);

            const distDir = path.join(__dirname, 'dist', 'audio', 'generated');
            if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
            fs.writeFileSync(path.join(distDir, filename), finalBuffer);

            res.json({ audioUrl: `/audio/generated/${filename}` });
        } else {
            res.status(500).json({ error: "Failed to generate audio" });
        }
    } catch (e) {
        console.error("Audio summary generation error:", e);
        require('fs').writeFileSync(__dirname + '/audio_error_log.txt', String(e.stack || e));
        res.status(500).json({ error: "Failed to generate audio summary", details: String(e) });
    }
});

// Serve static files from the React app
app.use(express.static(path.join(__dirname, 'dist')));

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on port ${port}`);
});

process.on('SIGINT', () => {
    console.log('Server shutting down');
    process.exit(0);
});
