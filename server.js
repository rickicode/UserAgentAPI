const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Set EJS as the templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API configuration
const API_BASE_URL = 'https://api.apilayer.com/user_agent/generate';

// Available device types
const DEVICE_TYPES = [
    'android', 'chrome', 'desktop', 'firefox', 'ie', 
    'linux', 'mac', 'mobile', 'tablet', 'windows'
];

// Routes
app.get('/', (req, res) => {
    res.render('index', { deviceTypes: DEVICE_TYPES });
});

// Store connected clients for Server-Sent Events and active scraping processes
const clients = new Set();
const activeScrapingProcesses = new Map(); // clientId -> {shouldStop: boolean, processId: string}

// Server-Sent Events route for real-time updates
app.get('/stream', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Generate unique client ID
    const clientId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    res.clientId = clientId;

    // Send initial connection message
    res.write(`data: {"type": "connected", "message": "Connected to stream", "clientId": "${clientId}"}\n\n`);

    // Add client to the set
    clients.add(res);

    // Remove client when connection closes
    req.on('close', () => {
        clients.delete(res);
        activeScrapingProcesses.delete(clientId);
        console.log('Client disconnected from stream');
    });

    // Handle client disconnect
    res.on('close', () => {
        clients.delete(res);
        activeScrapingProcesses.delete(clientId);
    });
});

// Stop scraping endpoint
app.post('/stop-scraping', (req, res) => {
    const { clientId } = req.body;
    
    if (!clientId) {
        return res.status(400).json({ error: 'Client ID is required' });
    }
    
    // Mark the scraping process as stopped
    if (activeScrapingProcesses.has(clientId)) {
        activeScrapingProcesses.get(clientId).shouldStop = true;
        res.json({ success: true, message: 'Scraping stop requested' });
    } else {
        res.status(404).json({ error: 'No active scraping process found for this client' });
    }
});

// API route for scraping user agents
app.post('/scrape', async (req, res) => {
    const { maxCount, selectedDevices, apiKey, clientId } = req.body;
    
    // Validate input
    if (!apiKey || apiKey.trim() === '') {
        return res.status(400).json({ error: 'API key is required' });
    }

    if (!maxCount || maxCount < 1 || maxCount > 20000) {
        return res.status(400).json({ error: 'Max count must be between 1 and 20,000' });
    }

    if (!selectedDevices || selectedDevices.length === 0) {
        return res.status(400).json({ error: 'At least one device type must be selected' });
    }

    if (!clientId) {
        return res.status(400).json({ error: 'Client ID is required' });
    }

    // Validate device types
    const invalidDevices = selectedDevices.filter(device => !DEVICE_TYPES.includes(device));
    if (invalidDevices.length > 0) {
        return res.status(400).json({ error: `Invalid device types: ${invalidDevices.join(', ')}` });
    }

    // Register scraping process
    const processId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    activeScrapingProcesses.set(clientId, { shouldStop: false, processId });

    res.json({ success: true, message: 'Scraping started', processId });

    // Start concurrent scraping process
    scrapUserAgentsConcurrent(maxCount, selectedDevices, apiKey, clientId);
});

// Cache for validated API keys (key -> {valid: boolean, timestamp: number})
const apiKeyCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// API key validation route
app.post('/validate-api-key', async (req, res) => {
    const { apiKey } = req.body;
    
    if (!apiKey || apiKey.trim() === '') {
        return res.status(400).json({ error: 'API key is required' });
    }
    
    const trimmedKey = apiKey.trim();
    
    // Check cache first
    const cached = apiKeyCache.get(trimmedKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
        if (cached.valid) {
            return res.json({
                success: true,
                message: 'API key is valid and working!',
                cached: true
            });
        } else {
            return res.status(401).json({
                error: 'Invalid API key',
                message: 'The provided API key is not valid or has been revoked',
                cached: true
            });
        }
    }
    
    try {
        // Test API key with a simple request and timeout
        const testUrl = `${API_BASE_URL}?chrome=true`;
        const response = await axios.get(testUrl, {
            headers: {
                'apikey': trimmedKey
            },
            timeout: 5000 // 5 second timeout
        });
        
        if (response.status === 200) {
            // Cache successful validation
            apiKeyCache.set(trimmedKey, {
                valid: true,
                timestamp: Date.now()
            });
            
            res.json({
                success: true,
                message: 'API key is valid and working!',
                cached: false
            });
        } else {
            // Cache failed validation
            apiKeyCache.set(trimmedKey, {
                valid: false,
                timestamp: Date.now()
            });
            
            res.status(400).json({
                error: 'API key validation failed',
                message: 'Invalid response from API'
            });
        }
        
    } catch (error) {
        console.error('API key validation error:', error.message);
        
        if (error.response) {
            if (error.response.status === 401) {
                // Cache invalid API key
                apiKeyCache.set(trimmedKey, {
                    valid: false,
                    timestamp: Date.now()
                });
                
                res.status(401).json({
                    error: 'Invalid API key',
                    message: 'The provided API key is not valid or has been revoked'
                });
            } else if (error.response.status === 429) {
                res.status(429).json({
                    error: 'Rate limit exceeded',
                    message: 'Too many requests. Please try again later'
                });
            } else {
                res.status(400).json({
                    error: 'API validation failed',
                    message: `API returned status ${error.response.status}`
                });
            }
        } else if (error.code === 'ECONNABORTED') {
            res.status(408).json({
                error: 'Request timeout',
                message: 'API validation timed out. Please try again'
            });
        } else {
            res.status(500).json({
                error: 'Validation error',
                message: 'Network error or API service unavailable'
            });
        }
    }
});

// Clean up expired cache entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of apiKeyCache.entries()) {
        if (now - value.timestamp > CACHE_DURATION) {
            apiKeyCache.delete(key);
        }
    }
}, 60000); // Clean up every minute

// Function to scrape user agents with concurrent requests
async function scrapUserAgentsConcurrent(maxCount, selectedDevices, apiKey, clientId) {
    const userAgents = [];
    let successCount = 0;
    let errorCount = 0;
    let processedCount = 0;

    // Build query parameters with true/false values
    const params = new URLSearchParams();
    selectedDevices.forEach(device => {
        params.append(device, 'true');
    });

    const apiUrl = `${API_BASE_URL}?${params.toString()}`;
    
    // Calculate concurrent requests based on maxCount
    const concurrentRequests = Math.min(Math.max(1, Math.floor(maxCount / 100)), 10); // 1-10 concurrent requests
    const batchSize = Math.ceil(maxCount / concurrentRequests);
    
    console.log(`Starting concurrent scraping: ${concurrentRequests} concurrent requests, batch size: ${batchSize}`);

    // Create batches for concurrent processing
    const batches = [];
    for (let i = 0; i < maxCount; i += batchSize) {
        const end = Math.min(i + batchSize, maxCount);
        batches.push({ start: i, end, count: end - i });
    }

    // Process batches concurrently
    const batchPromises = batches.map(async (batch, batchIndex) => {
        for (let i = batch.start; i < batch.end; i++) {
            // Check if scraping should stop
            const process = activeScrapingProcesses.get(clientId);
            if (!process || process.shouldStop) {
                console.log(`Scraping stopped for client ${clientId}`);
                return;
            }

            try {
                const response = await axios.get(apiUrl, {
                    headers: {
                        'apikey': apiKey
                    },
                    timeout: 10000 // 10 second timeout
                });

                const userAgentData = response.data;
                userAgents.push(userAgentData);
                successCount++;
                processedCount++;

                // Format the user agent data for display
                const formattedData = {
                    userAgent: userAgentData.ua,
                    browser: `${userAgentData.browser.name} ${userAgentData.browser.version}`,
                    os: userAgentData.os.name || 'Unknown',
                    device: userAgentData.device.name || 'Unknown',
                    type: Object.keys(userAgentData.type).filter(key => userAgentData.type[key]).join(', '),
                    fullData: userAgentData
                };

                // Send update via SSE to specific client
                broadcastUpdateToClient(clientId, {
                    type: 'userAgent',
                    data: formattedData,
                    progress: {
                        current: processedCount,
                        total: maxCount,
                        success: successCount,
                        errors: errorCount
                    }
                });

                // Reduced delay for concurrent requests
                await new Promise(resolve => setTimeout(resolve, 50));

            } catch (error) {
                console.error('Error fetching user agent:', error.message);
                errorCount++;
                processedCount++;

                // Send error update via SSE
                broadcastUpdateToClient(clientId, {
                    type: 'error',
                    message: `Error fetching user agent: ${error.message}`,
                    progress: {
                        current: processedCount,
                        total: maxCount,
                        success: successCount,
                        errors: errorCount
                    }
                });

                // Add delay even on error
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
    });

    // Wait for all batches to complete
    await Promise.all(batchPromises);

    // Check if process was stopped
    const process = activeScrapingProcesses.get(clientId);
    if (process && process.shouldStop) {
        broadcastUpdateToClient(clientId, {
            type: 'complete',
            message: `Scraping stopped by user. Processed ${processedCount} requests with ${successCount} successful and ${errorCount} errors.`,
            data: {
                total: maxCount,
                processed: processedCount,
                success: successCount,
                errors: errorCount,
                userAgents: userAgents
            }
        });
    } else {
        // Send completion message
        broadcastUpdateToClient(clientId, {
            type: 'complete',
            message: `Scraping complete! Successfully fetched ${successCount} user agents with ${errorCount} errors.`,
            data: {
                total: maxCount,
                processed: processedCount,
                success: successCount,
                errors: errorCount,
                userAgents: userAgents
            }
        });
    }

    // Clean up
    activeScrapingProcesses.delete(clientId);
}

// Function to broadcast updates to all connected clients
function broadcastUpdate(data) {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    
    // Send to all connected clients
    clients.forEach(client => {
        try {
            client.write(message);
        } catch (error) {
            console.error('Error sending message to client:', error);
            // Remove client if there's an error
            clients.delete(client);
        }
    });
    
    console.log(`Broadcasting to ${clients.size} clients:`, data.type);
}

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
// Function to broadcast updates to a specific client
function broadcastUpdateToClient(clientId, update) {
    const message = `data: ${JSON.stringify(update)}\n\n`;
    
    for (const client of clients) {
        if (client.clientId === clientId) {
            try {
                client.write(message);
                break;
            } catch (error) {
                console.error('Error broadcasting to client:', error.message);
                clients.delete(client);
            }
        }
    }
}
