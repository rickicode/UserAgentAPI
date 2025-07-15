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

// Store connected clients for Server-Sent Events
const clients = new Set();

// Server-Sent Events route for real-time updates
app.get('/stream', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send initial connection message
    res.write('data: {"type": "connected", "message": "Connected to stream"}\n\n');

    // Add client to the set
    clients.add(res);

    // Remove client when connection closes
    req.on('close', () => {
        clients.delete(res);
        console.log('Client disconnected from stream');
    });

    // Handle client disconnect
    res.on('close', () => {
        clients.delete(res);
    });
});

// API route for scraping user agents
app.post('/scrape', async (req, res) => {
    const { maxCount, selectedDevices, apiKey } = req.body;
    
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

    // Validate device types
    const invalidDevices = selectedDevices.filter(device => !DEVICE_TYPES.includes(device));
    if (invalidDevices.length > 0) {
        return res.status(400).json({ error: `Invalid device types: ${invalidDevices.join(', ')}` });
    }

    res.json({ success: true, message: 'Scraping started' });

    // Start scraping process
    scrapUserAgents(maxCount, selectedDevices, apiKey);
});

// API key validation route
app.post('/validate-api-key', async (req, res) => {
    const { apiKey } = req.body;
    
    if (!apiKey || apiKey.trim() === '') {
        return res.status(400).json({ error: 'API key is required' });
    }
    
    try {
        // Test API key with a simple request
        const testUrl = `${API_BASE_URL}?chrome=chrome`;
        const response = await axios.get(testUrl, {
            headers: {
                'apikey': apiKey.trim()
            }
        });
        
        if (response.status === 200) {
            res.json({
                success: true,
                message: 'API key is valid and working!',
                sampleResponse: response.data
            });
        } else {
            res.status(400).json({
                error: 'API key validation failed',
                message: 'Invalid response from API'
            });
        }
        
    } catch (error) {
        console.error('API key validation error:', error.message);
        
        if (error.response) {
            if (error.response.status === 401) {
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
        } else {
            res.status(500).json({
                error: 'Validation error',
                message: 'Network error or API service unavailable'
            });
        }
    }
});

// Function to scrape user agents
async function scrapUserAgents(maxCount, selectedDevices, apiKey) {
    const userAgents = [];
    let successCount = 0;
    let errorCount = 0;

    // Build query parameters
    const params = new URLSearchParams();
    selectedDevices.forEach(device => {
        params.append(device, device);
    });

    const apiUrl = `${API_BASE_URL}?${params.toString()}`;
    
    for (let i = 0; i < maxCount; i++) {
        try {
            const response = await axios.get(apiUrl, {
                headers: {
                    'apikey': apiKey
                }
            });

            const userAgentData = response.data;
            userAgents.push(userAgentData);
            successCount++;

            // Format the user agent data for display
            const formattedData = {
                userAgent: userAgentData.ua,
                browser: `${userAgentData.browser.name} ${userAgentData.browser.version}`,
                os: userAgentData.os.name || 'Unknown',
                device: userAgentData.device.name || 'Unknown',
                type: Object.keys(userAgentData.type).filter(key => userAgentData.type[key]).join(', '),
                fullData: userAgentData
            };

            // Send update via SSE (if client is connected)
            broadcastUpdate({
                type: 'userAgent',
                data: formattedData,
                progress: {
                    current: i + 1,
                    total: maxCount,
                    success: successCount,
                    errors: errorCount
                }
            });

            // Add delay to prevent rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));

        } catch (error) {
            errorCount++;
            console.error(`Error fetching user agent ${i + 1}:`, error.message);
            
            // Send error update via SSE
            broadcastUpdate({
                type: 'error',
                message: `Error fetching user agent ${i + 1}: ${error.message}`,
                progress: {
                    current: i + 1,
                    total: maxCount,
                    success: successCount,
                    errors: errorCount
                }
            });
        }
    }

    // Send completion message
    broadcastUpdate({
        type: 'complete',
        message: `Scraping completed. Success: ${successCount}, Errors: ${errorCount}`,
        userAgents: userAgents
    });
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