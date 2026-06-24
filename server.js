const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Cache directory setup
const cacheDir = path.join(__dirname, 'cache');
if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir);
}

// Global state
let activeToken = (process.env.CARDTRADER_TOKEN || '').trim();
let syncState = {
    status: 'idle',
    total: 0,
    cached: 0,
    supportedGames: [1, 4, 5, 15]
};

// Count initial cached blueprints
try {
    const files = fs.readdirSync(cacheDir);
    syncState.cached = files.filter(f => f.startsWith('blueprints_') && f.endsWith('.json')).length;
} catch (e) { }

// Logger
function writeLog(msg) {
    try {
        const time = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
        fs.appendFileSync(path.join(cacheDir, 'indexer.log'), `[ ${time} ] ${msg}\n`);
    } catch (e) { }
}

// Background Indexer
async function backgroundIndexer() {
    writeLog("Indexer started.");
    while (true) {
        if (!activeToken) {
            syncState.status = 'idle_no_token';
            await new Promise(r => setTimeout(r, 3000));
            continue;
        }

        syncState.status = 'loading_expansions';
        const expansionsFile = path.join(cacheDir, 'expansions.json');
        let expansionsData = null;

        if (fs.existsSync(expansionsFile)) {
            try {
                expansionsData = JSON.parse(fs.readFileSync(expansionsFile, 'utf8'));
            } catch (e) { writeLog("Error reading expansions.json"); }
        } else {
            try {
                writeLog("Fetching expansions from API...");
                const res = await fetch("https://api.cardtrader.com/api/v2/expansions", {
                    headers: { "Authorization": `Bearer ${activeToken}`, "User-Agent": "NodeProxy/1.0" }
                });
                if (res.ok) {
                    const text = await res.text();
                    fs.writeFileSync(expansionsFile, text);
                    expansionsData = JSON.parse(text);
                }
            } catch (e) { writeLog("Expansions fetch error: " + e.message); }
        }

        if (!expansionsData) {
            syncState.status = 'error_expansions';
            await new Promise(r => setTimeout(r, 10000));
            continue;
        }

        let targetExpansions = [];
        try {
            const arr = expansionsData.array || expansionsData;
            targetExpansions = arr.filter(e => syncState.supportedGames.includes(e.game_id));
            syncState.total = targetExpansions.length;
        } catch (e) {
            syncState.status = 'error_parse';
            await new Promise(r => setTimeout(r, 10000));
            continue;
        }

        syncState.status = 'indexing';

        for (const exp of targetExpansions) {
            if (!activeToken) {
                syncState.status = 'paused_no_token';
                break;
            }

            const cacheFile = path.join(cacheDir, `blueprints_${exp.id}.json`);
            if (!fs.existsSync(cacheFile)) {
                syncState.status = 'indexing_fetching';
                try {
                    const res = await fetch(`https://api.cardtrader.com/api/v2/blueprints/export?expansion_id=${exp.id}`, {
                        headers: { "Authorization": `Bearer ${activeToken}`, "User-Agent": "NodeProxy/1.0" }
                    });
                    if (res.ok) {
                        const text = await res.text();
                        fs.writeFileSync(cacheFile, text);
                        writeLog(`Saved blueprints cache for expansion ${exp.id}`);
                    } else {
                        writeLog(`Failed to fetch blueprints for ${exp.id}. Status: ${res.status}`);
                        await new Promise(r => setTimeout(r, 5000));
                        continue;
                    }
                } catch (e) {
                    writeLog(`Exception fetching blueprints for ${exp.id}: ${e.message}`);
                }
                await new Promise(r => setTimeout(r, 3000));
            }

            try {
                const files = fs.readdirSync(cacheDir);
                syncState.cached = files.filter(f => f.startsWith('blueprints_') && f.endsWith('.json')).length;
            } catch (e) { }
        }

        syncState.status = 'completed';
        writeLog("Indexing cycle completed. Next run in 1 hour.");
        await new Promise(r => setTimeout(r, 3600000));
    }
}

// Start indexer loop
backgroundIndexer();

// Middleware to capture token and proxy requests
const proxyRequest = async (req, res, targetUrl) => {
    const clientToken = req.headers['x-cardtrader-token'];
    const token = clientToken || activeToken;
    
    if (clientToken && clientToken !== activeToken) {
        activeToken = clientToken;
    }

    if (!token) {
        console.error("Proxy error: CARDTRADER_TOKEN is missing on server!");
        return res.status(401).json({ error: "Unauthorized: CardTrader API token is missing on Render server." });
    }

    try {
        const fetchRes = await fetch(targetUrl, {
            headers: {
                "Authorization": `Bearer ${token}`,
                "User-Agent": "NodeProxy/1.0"
            }
        });
        
        const data = await fetchRes.text();
        
        if (fetchRes.ok) {
            res.status(200).type('application/json').send(data);
        } else {
            console.error(`CardTrader API rejected the token. Status: ${fetchRes.status}`);
            res.status(fetchRes.status).json({ error: `CardTrader API Error HTTP ${fetchRes.status}: ${data}` });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// API Endpoints
app.get('/api/games', (req, res) => {
    proxyRequest(req, res, "https://api.cardtrader.com/api/v2/games");
});

app.get('/api/expansions', (req, res) => {
    proxyRequest(req, res, "https://api.cardtrader.com/api/v2/expansions");
});

app.get('/api/blueprints', (req, res) => {
    const expansionId = req.query.expansion_id;
    if (!expansionId) return res.status(400).json({ error: "expansion_id query parameter is required." });

    const cacheFile = path.join(cacheDir, `blueprints_${expansionId}.json`);
    if (fs.existsSync(cacheFile)) {
        res.sendFile(cacheFile);
    } else {
        proxyRequest(req, res, `https://api.cardtrader.com/api/v2/blueprints/export?expansion_id=${expansionId}`).then(() => {
            // After successful proxy, maybe we should cache it? The proxyRequest sends it directly. 
            // In Node, we can just let the indexer handle caching, or we can fetch, save, and send.
            // For simplicity and matching PowerShell, we'll let indexer cache it eventually, or we could cache it here.
            // Let's just proxy for now if missing.
        });
    }
});

app.get('/api/products', (req, res) => {
    const blueprintId = req.query.blueprint_id;
    const expansionId = req.query.expansion_id;

    if (!blueprintId && !expansionId) {
        return res.status(400).json({ error: "Either blueprint_id or expansion_id query parameter is required." });
    } else if (blueprintId) {
        proxyRequest(req, res, `https://api.cardtrader.com/api/v2/marketplace/products?blueprint_id=${blueprintId}`);
    } else {
        proxyRequest(req, res, `https://api.cardtrader.com/api/v2/marketplace/products?expansion_id=${expansionId}`);
    }
});

// Remove diacritics function
const normalizeString = (str) => {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

app.get('/api/search', (req, res) => {
    let query = req.query.q || "";
    query = decodeURIComponent(query).trim();
    const requestedGameId = req.query.game_id;

    if (query.length < 2) {
        return res.status(400).json({ error: "Search query 'q' must be at least 2 characters long." });
    }

    let expansionsMap = {};
    const expansionsFile = path.join(cacheDir, 'expansions.json');
    if (fs.existsSync(expansionsFile)) {
        try {
            const data = JSON.parse(fs.readFileSync(expansionsFile, 'utf8'));
            const arr = data.array || data;
            arr.forEach(exp => {
                if (exp.id != null) expansionsMap[exp.id.toString()] = exp;
            });
        } catch (e) { }
    }

    const normalizedQuery = normalizeString(query);
    const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 0);
    const results = [];

    try {
        const files = fs.readdirSync(cacheDir);
        for (const file of files) {
            if (results.length >= 300) break;
            
            const match = file.match(/blueprints_(\d+)\.json/);
            if (!match) continue;
            
            const fileExpansionId = match[1];

            if (requestedGameId && fileExpansionId) {
                if (expansionsMap[fileExpansionId]) {
                    if (expansionsMap[fileExpansionId].game_id != parseInt(requestedGameId)) {
                        continue;
                    }
                } else {
                    continue;
                }
            }

            const filePath = path.join(cacheDir, file);
            let content = fs.readFileSync(filePath, 'utf8');
            const contentLower = content.toLowerCase();

            let fileMatches = true;
            for (const word of queryWords) {
                if (!contentLower.includes(word)) {
                    fileMatches = false;
                    break;
                }
            }

            if (fileMatches) {
                const blueprints = JSON.parse(content);
                for (const bp of blueprints) {
                    let bpSearchTarget = normalizeString(bp.name || "");
                    if (bp.version) bpSearchTarget += " " + bp.version.toLowerCase();
                    if (bp.fixed_properties && bp.fixed_properties.collector_number) {
                        bpSearchTarget += " " + bp.fixed_properties.collector_number.toLowerCase();
                    }

                    let bpMatches = true;
                    for (const word of queryWords) {
                        if (!bpSearchTarget.includes(word)) {
                            bpMatches = false;
                            break;
                        }
                    }

                    if (bpMatches) {
                        const expInfo = expansionsMap[bp.expansion_id.toString()];
                        results.push({
                            id: bp.id,
                            name: bp.name,
                            version: bp.version,
                            image_url: bp.image_url,
                            expansion_id: bp.expansion_id,
                            expansion_name: expInfo ? expInfo.name : "Unknown Set",
                            expansion_code: expInfo ? expInfo.code : "",
                            slug: bp.slug
                        });
                        if (results.length >= 300) break;
                    }
                }
            }
        }
    } catch (e) {
        console.error(e);
    }

    res.json(results);
});

app.get('/api/index-status', (req, res) => {
    res.json({
        totalExpansions: syncState.total,
        cachedExpansions: syncState.cached,
        status: syncState.status
    });
});

// Fallback to serving index.html for SPA routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`=============================================`);
    console.log(` CardPrice Node.js Proxy Server Running`);
    console.log(` URL: http://localhost:${PORT}/`);
    console.log(`=============================================`);
});
