require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Events } = require('discord.js');
const http = require('http');
const https = require('https');
const url = require('url');
const { Octokit } = require('@octokit/rest');
const crypto = require('crypto');

// Constants
const SERVER_START_TIME = new Date();
const ADMIN_CONFIG_URL = process.env.ADMIN_IDS_URL || 'https://raw.githubusercontent.com/Levitzy/safsxcsac/refs/heads/main/admin_ids.json';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER;
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME;
const GITHUB_FILE_PATH = process.env.GITHUB_FILE_PATH;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH;
const PORT = process.env.PORT || 5000;

// Authentication
const DEFAULT_ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'AdminJubiar';
const ADMIN_TOKENS = new Set([DEFAULT_ADMIN_TOKEN]);
const SESSION_TOKENS = new Map(); // Map to store valid session tokens

let setup = {};
try {
    const setupPath = path.join(__dirname, 'setup.json'); 
    if (fs.existsSync(setupPath)) {
        setup = require(setupPath);
    } else {
        console.warn("[WARN] setup.json not found. Using default prefix (empty string for prefixless).");
        setup.PREFIX = '';
    }
} catch (e) {
    console.warn("[WARN] setup.json is invalid or unreadable. Using default prefix (empty string for prefixless). Error:", e.message);
    setup.PREFIX = '';
}
let PREFIX = typeof setup.PREFIX === 'string' ? setup.PREFIX.trim() : ''; 

let ADMIN_PERMISSIONS = {};
let systemStats = {
  commandsExecuted: 0,
  lastCommandTime: null,
  errors: 0,
  activeUsers: new Set()
};

// Initialize GitHub client
let octokit;
if (GITHUB_TOKEN && GITHUB_REPO_OWNER && GITHUB_REPO_NAME && GITHUB_FILE_PATH && GITHUB_BRANCH) {
    octokit = new Octokit({ auth: GITHUB_TOKEN });
    console.log('GitHub API client initialized for repository updates.');
} else {
    console.warn('[WARN] GitHub API credentials for writing not fully configured. Admin permission updates to GitHub will be disabled.');
}

/**
 * Fetch admin permissions from GitHub
 * @returns {Promise<Object>} Admin permissions object
 */
async function fetchAdminPermissions() {
    return new Promise((resolve, reject) => {
        https.get(ADMIN_CONFIG_URL, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    let jsonDataToParse = data.trim();
                    if (jsonDataToParse.charCodeAt(0) === 0xFEFF) { 
                        jsonDataToParse = jsonDataToParse.substring(1);
                    }
                    
                    const adminData = JSON.parse(jsonDataToParse);
                    if (adminData && typeof adminData.ADMIN_PERMISSIONS === 'object' && adminData.ADMIN_PERMISSIONS !== null) {
                        ADMIN_PERMISSIONS = adminData.ADMIN_PERMISSIONS;
                        console.log('Admin permissions loaded from GitHub:', ADMIN_PERMISSIONS);
                        resolve(ADMIN_PERMISSIONS);
                    } else {
                        console.error('Invalid admin_ids.json format from GitHub. Expected ADMIN_PERMISSIONS object.');
                        ADMIN_PERMISSIONS = {}; // Reset to empty if format is wrong
                        resolve({});
                    }
                } catch (error) {
                    console.error('Error parsing admin_ids.json from GitHub:', error);
                    ADMIN_PERMISSIONS = {};
                    resolve({});
                }
            });
        }).on('error', (error) => {
            console.error('Error fetching admin permissions from GitHub:', error);
            ADMIN_PERMISSIONS = {};
            resolve({});
        });
    });
}

/**
 * Update admin permissions file on GitHub
 * @param {Object} newAdminPermissionsObject - New admin permissions object
 * @returns {Promise<Object>} Result object
 */
async function updateAdminPermissionsFileOnGitHub(newAdminPermissionsObject) {
    if (!octokit) {
        throw new Error('GitHub API client not configured. Cannot update admin_ids.json on GitHub.');
    }

    const content = JSON.stringify({ ADMIN_PERMISSIONS: newAdminPermissionsObject }, null, 2);
    const contentEncoded = Buffer.from(content).toString('base64');
    let fileSha;

    try {
        try {
            const { data: fileData } = await octokit.repos.getContent({
                owner: GITHUB_REPO_OWNER,
                repo: GITHUB_REPO_NAME,
                path: GITHUB_FILE_PATH,
                ref: GITHUB_BRANCH,
            });
            fileSha = fileData.sha;
        } catch (error) {
            if (error.status !== 404) {
                throw error;
            }
            console.log(`File ${GITHUB_FILE_PATH} not found on branch ${GITHUB_BRANCH}. Will attempt to create it.`);
        }

        const commitMessage = `Update admin_ids.json (permissions) via bot admin panel - ${new Date().toISOString()}`;
        
        await octokit.repos.createOrUpdateFileContents({
            owner: GITHUB_REPO_OWNER,
            repo: GITHUB_REPO_NAME,
            path: GITHUB_FILE_PATH,
            message: commitMessage,
            content: contentEncoded,
            sha: fileSha,
            branch: GITHUB_BRANCH,
            committer: {
                name: 'Discord Bot Admin Panel',
                email: 'bot@example.com'
            },
            author: {
                name: 'Discord Bot Admin Panel',
                email: 'bot@example.com'
            }
        });

        console.log('admin_ids.json (permissions) successfully updated on GitHub.');
        ADMIN_PERMISSIONS = { ...newAdminPermissionsObject };
        return { success: true, message: 'Admin permissions successfully updated on GitHub.' };
    } catch (error) {
        console.error('Error updating admin_ids.json (permissions) on GitHub:', error.message);
        let detailedError = error.message;
        if (error.response && error.response.data && error.response.data.message) {
            detailedError = error.response.data.message;
        }
        throw new Error(`Failed to update admin_ids.json on GitHub: ${detailedError}`);
    }
}

/**
 * Reload configuration from setup.json
 * @returns {boolean} Success status
 */
function reloadConfig() {
    try {
        delete require.cache[require.resolve('./setup.json')];
        setup = require('./setup.json');
        PREFIX = typeof setup.PREFIX === 'string' ? setup.PREFIX : '';
        console.log('Configuration reloaded (PREFIX only):', { PREFIX });
        return true;
    } catch (error) {
        console.error('Error reloading configuration:', error);
        return false;
    }
}

/**
 * Generate a session token for authenticated users
 * @returns {string} Session token
 */
function generateSessionToken() {
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
    SESSION_TOKENS.set(token, { expiry });
    return token;
}

/**
 * Validate a session token
 * @param {string} token - Session token to validate
 * @returns {boolean} Is token valid
 */
function validateSessionToken(token) {
    if (!SESSION_TOKENS.has(token)) return false;
    
    const session = SESSION_TOKENS.get(token);
    if (Date.now() > session.expiry) {
        SESSION_TOKENS.delete(token);
        return false;
    }
    
    return true;
}

/**
 * Check if a user has admin permission for a command
 * @param {string} userId - Discord user ID
 * @param {string} commandName - Command name
 * @returns {boolean} Has permission
 */
function hasAdminPermission(userId, commandName) {
    const userPerms = ADMIN_PERMISSIONS[String(userId)];
    if (userPerms && Array.isArray(userPerms)) {
        return userPerms.includes('all') || userPerms.includes(commandName);
    }
    return false;
}

/**
 * Get system runtime statistics
 * @returns {Object} System stats
 */
function getSystemStats() {
    const uptime = Date.now() - SERVER_START_TIME.getTime();
    const memoryUsage = process.memoryUsage();
    
    return {
        uptime,
        uptimeFormatted: formatUptime(uptime),
        serverStartTime: SERVER_START_TIME.toISOString(),
        memory: {
            rss: Math.round(memoryUsage.rss / 1024 / 1024),
            heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
            heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        },
        commandsExecuted: systemStats.commandsExecuted,
        lastCommandTime: systemStats.lastCommandTime,
        errors: systemStats.errors,
        activeUsers: systemStats.activeUsers.size,
        adminCount: Object.keys(ADMIN_PERMISSIONS).length,
        commandCount: client ? client.commands.size : 0
    };
}

/**
 * Format uptime in human-readable format
 * @param {number} ms - Uptime in milliseconds
 * @returns {string} Formatted uptime
 */
function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
}

// Initialize admin permissions
fetchAdminPermissions().then(() => {
    console.log('Initial admin permissions loaded.');
});

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

// Load button interaction handler
let handleButtonInteraction;
try {
    handleButtonInteraction = require('./handler/button_interaction');
    console.log('Button interaction handler loaded successfully.');
} catch (error) {
    console.warn('Button interaction handler not found or failed to load:', error.message);
    handleButtonInteraction = async () => console.log('Button interaction received but handler not available');
}

// Load commands
client.commands = new Map();
const cmdPath = path.join(__dirname, 'cmd');
if (fs.existsSync(cmdPath)) {
    fs.readdirSync(cmdPath)
        .filter(file => file.endsWith('.js'))
        .forEach(file => {
            try {
                const command = require(path.join(cmdPath, file));
                if (command && command.name && typeof command.execute === 'function') {
                    client.commands.set(command.name, command);
                } else {
                    console.warn(`[WARN] The command at ${path.join(cmdPath, file)} is missing a required "name" or "execute" property.`);
                }
            } catch (error) {
                console.error(`[ERROR] Could not load command at ${path.join(cmdPath, file)}: ${error.message}`);
            }
        });
    console.log(`Loaded ${client.commands.size} commands.`);
} else {
    console.warn(`[WARN] Command directory not found at ${cmdPath}`);
}

// Discord client event handlers
client.once(Events.ClientReady, () => {
    console.log(`✅ Bot connected as ${client.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    // Track active users
    systemStats.activeUsers.add(message.author.id);

    const rawContent = message.content.trim();
    let args;
    let commandName;

    if (PREFIX && rawContent.toLowerCase().startsWith(PREFIX.toLowerCase())) {
        args = rawContent.slice(PREFIX.length).trim().split(/ +/);
        commandName = args.shift().toLowerCase();
    } 
    else if (!PREFIX || (PREFIX && !rawContent.toLowerCase().startsWith(PREFIX.toLowerCase()))) {
        const potentialCommandParts = rawContent.split(/ +/);
        const potentialCommandName = potentialCommandParts[0].toLowerCase();

        if (client.commands.has(potentialCommandName)) {
            commandName = potentialCommandName;
            args = potentialCommandParts.slice(1);
        } else {
            return;
        }
    } else {
        return;
    }

    const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
    
    if (!command) return;

<<<<<<< HEAD
    // Permission check
=======
    if (command.guildOnly && !message.guild) {
        return message.reply('ℹ️ This command can only be used inside a server.');
    }

>>>>>>> 8db4e2b160b4824421d5d7a64017713d7ed809fe
    if (command.admin_only && !hasAdminPermission(message.author.id, command.name)) {
        return message.reply('❌ You do not have permission to use this specific command.');
    }

    try {
        systemStats.commandsExecuted++;
        systemStats.lastCommandTime = new Date().toISOString();
        await command.execute(message, args);
    } catch (error) {
        systemStats.errors++;
        console.error(`Error executing command '${commandName}':`, error);
        try {
            await message.reply('❌ There was an error executing that command. Please try again later.');
        } catch (replyError) {
            console.error('Error sending error reply to user:', replyError);
        }
    }
});


client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
    }
});

// Load admin panel HTML
const adminPanelPath = path.join(__dirname, 'index.html');
let adminPanelHTML = '';
try {
    if (fs.existsSync(adminPanelPath)) {
        adminPanelHTML = fs.readFileSync(adminPanelPath, 'utf8');
    } else {
<<<<<<< HEAD
        adminPanelHTML = `<!DOCTYPE html><html><head><title>Admin Panel</title></head><body><h1>Admin Panel Not Found</h1><p>Please create index.html.</p></body></html>`;
        fs.writeFileSync(adminPanelPath, adminPanelHTML);
=======
        adminPanelHTML = `<!DOCTYPE html><html><head><title>Admin Panel</title></head><body><h1>Admin Panel Not Found</h1><p>Please create index.html in the root directory.</p></body></html>`;
        console.warn('Admin panel index.html not found. Serving placeholder. Please create index.html.');
>>>>>>> 8db4e2b160b4824421d5d7a64017713d7ed809fe
    }
} catch (error) {
    console.error('Error reading/creating admin panel HTML:', error);
    adminPanelHTML = '<h1>Error loading admin panel</h1>';
}

// Load login HTML
const loginPath = path.join(__dirname, 'login.html');
let loginHTML = '';
try {
    if (fs.existsSync(loginPath)) {
        loginHTML = fs.readFileSync(loginPath, 'utf8');
    } else {
        // Create a basic login page if it doesn't exist
        loginHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Discord Bot Admin Panel - Login</title>
    <style>
        body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #36393F; }
        .login-card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
        h1 { margin-top: 0; }
        input { width: 100%; padding: 8px; margin: 8px 0; box-sizing: border-box; }
        button { background: #5865F2; color: white; border: none; padding: 10px; width: 100%; cursor: pointer; border-radius: 4px; }
        button:hover { background: #4752C4; }
        .error { color: red; display: none; }
    </style>
</head>
<body>
    <div class="login-card">
        <h1>Admin Login</h1>
        <div id="error" class="error">Invalid token</div>
        <form id="login-form">
            <div>
                <label for="token">Admin Token</label>
                <input type="password" id="token" required>
            </div>
            <button type="submit">Login</button>
        </form>
    </div>
    <script>
        document.getElementById('login-form').addEventListener('submit', function(e) {
            e.preventDefault();
            const token = document.getElementById('token').value;
            
            fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    localStorage.setItem('adminToken', data.token);
                    window.location.href = '/?token=' + data.token;
                } else {
                    document.getElementById('error').style.display = 'block';
                }
            })
            .catch(error => {
                console.error('Login error:', error);
                document.getElementById('error').style.display = 'block';
            });
        });
    </script>
</body>
</html>`;
<<<<<<< HEAD
        fs.writeFileSync(loginPath, loginHTML);
=======
        console.warn('Admin panel login.html not found. Serving placeholder. Please create login.html.');
>>>>>>> 8db4e2b160b4824421d5d7a64017713d7ed809fe
    }
} catch (error) {
    console.error('Error reading/creating login HTML:', error);
    loginHTML = '<h1>Error loading login page</h1>';
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    
    // CORS headers for API endpoints
    if (pathname.startsWith('/api/')) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }
    }
    
    // Authentication middleware for protected endpoints
    const isProtectedEndpoint = 
        (pathname.startsWith('/api/') && pathname !== '/api/auth') || 
        (pathname === '/' && !parsedUrl.query.token);
    
    if (isProtectedEndpoint) {
        const authHeader = req.headers.authorization;
        const urlToken = parsedUrl.query.token;
        
        let isAuthenticated = false;
        
        // Check Authorization header
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            isAuthenticated = validateSessionToken(token);
        }
<<<<<<< HEAD
        
        // Check URL token
        if (!isAuthenticated && urlToken) {
            isAuthenticated = validateSessionToken(urlToken);
        }
        
        if (!isAuthenticated && pathname !== '/') {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized', message: 'Authentication required' }));
            return;
        }
        
        // Redirect to login if accessing main page without auth
        if (!isAuthenticated && pathname === '/') {
            res.writeHead(302, { 'Location': '/login.html' });
            res.end();
=======

        if (!validateSessionToken(sessionToken)) {
            if (isApiEndpoint) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Unauthorized', message: 'Valid session token required.' }));
            } else { 
                res.writeHead(302, { 'Location': '/login.html' });
                res.end();
            }
>>>>>>> 8db4e2b160b4824421d5d7a64017713d7ed809fe
            return;
        }
    }
    
    // Handle API endpoints
    if (pathname === '/api/auth' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const { token } = JSON.parse(body);
                
                if (ADMIN_TOKENS.has(token)) {
                    const sessionToken = generateSessionToken();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        success: true, 
                        token: sessionToken,
                        message: 'Authentication successful' 
                    }));
                } else {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        error: 'Invalid token', 
                        message: 'The provided authentication token is invalid' 
                    }));
                }
            } catch (error) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid request', message: error.message }));
            }
        });
    } else if (pathname === '/api/uptime' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            serverStartTime: SERVER_START_TIME.toISOString(),
            uptime: Date.now() - SERVER_START_TIME.getTime(),
            formattedUptime: formatUptime(Date.now() - SERVER_START_TIME.getTime())
        }));
    } else if (pathname === '/api/stats' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(getSystemStats()));
    } else if (pathname === '/api/config' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            PREFIX: PREFIX,
            ADMIN_PERMISSIONS: ADMIN_PERMISSIONS,
            ADMIN_CONFIG_URL: ADMIN_CONFIG_URL,
            GITHUB_CONFIGURED: !!octokit
        }));
    } else if (pathname === '/api/config' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const newConfig = JSON.parse(body);
                if (typeof newConfig !== 'object') {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'Invalid configuration format' }));
                }
                
                let prefixUpdated = false;
                if (newConfig.PREFIX !== undefined && newConfig.PREFIX !== PREFIX) {
                    setup.PREFIX = newConfig.PREFIX;
                    fs.writeFileSync(path.join(__dirname, 'setup.json'), JSON.stringify(setup, null, 2));
                    PREFIX = newConfig.PREFIX;
                    prefixUpdated = true;
                }
                
                if (prefixUpdated) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: 'Prefix updated successfully.' }));
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: 'No changes to prefix.' }));
                }
            } catch (error) {
                console.error('Error updating prefix config:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to update prefix configuration' }));
            }
        });
    } else if (pathname === '/api/admin-permissions/refresh' && req.method === 'GET') {
        try {
            await fetchAdminPermissions();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                success: true,
                ADMIN_PERMISSIONS: ADMIN_PERMISSIONS,
                source: ADMIN_CONFIG_URL,
                message: 'Admin permissions refreshed from GitHub.'
            }));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: 'Failed to refresh admin permissions',
                message: error.message 
            }));
        }
    } else if (pathname === '/api/admin-permissions/update' && req.method === 'POST') {
        if (!octokit) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'GitHub API not configured on server.', message: 'Cannot update admin permissions on GitHub.' }));
        }
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const { admin_permissions: newAdminPermsObject } = JSON.parse(body);
                if (typeof newAdminPermsObject !== 'object' || newAdminPermsObject === null) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'Invalid data format. Expected { admin_permissions: { "USER_ID": ["cmd1"], ... } }' }));
                }

                // Basic validation for the structure
                const validatedPerms = {};
                for (const userId in newAdminPermsObject) {
                    if (/^\d{17,19}$/.test(userId) && Array.isArray(newAdminPermsObject[userId])) {
<<<<<<< HEAD
                        validatedPerms[userId] = newAdminPermsObject[userId].map(String).filter(cmd => cmd.length > 0);
=======
                        validatedPerms[userId] = newAdminPermsObject[userId].map(String).filter(cmd => cmd.length > 0 && cmd.length < 50);
>>>>>>> 8db4e2b160b4824421d5d7a64017713d7ed809fe
                    } else {
                        console.warn(`Invalid entry for user ID ${userId} in admin permissions update.`);
                    }
                }
                
                const result = await updateAdminPermissionsFileOnGitHub(validatedPerms);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ...result, ADMIN_PERMISSIONS: validatedPerms }));
            } catch (error) {
                console.error('Error processing GitHub admin permissions update request:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to update admin permissions on GitHub.', message: error.message }));
            }
        });
    } else if (pathname === '/api/commands' && req.method === 'GET') {
        const commandsList = Array.from(client.commands.values()).map(cmd => ({
            name: cmd.name,
            description: cmd.description || 'No description available.',
            admin_only: !!cmd.admin_only
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ commands: commandsList }));
    } else if (pathname === '/login.html') {
        // Serve login page
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(loginHTML);
    } else if (pathname === '/') {
        // Serve main admin panel
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(adminPanelHTML);
    } else {
        // Serve static files
        const filePath = path.join(__dirname, pathname.substring(1));
        fs.stat(filePath, (err, stats) => {
            if (err || !stats.isFile()) {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1><p>The requested resource could not be found.</p>');
                return;
            }

            const ext = path.extname(filePath).toLowerCase();
            const contentType = {
                '.html': 'text/html',
                '.js': 'text/javascript',
                '.css': 'text/css',
                '.json': 'application/json',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.gif': 'image/gif',
                '.svg': 'image/svg+xml',
                '.ico': 'image/x-icon'
            }[ext] || 'application/octet-stream';

            fs.readFile(filePath, (err, content) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'text/html' });
                    res.end('<h1>500 Internal Server Error</h1><p>Error reading file.</p>');
                    return;
                }

                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content);
            });
        });
    }
});

// Start HTTP server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Admin panel is now listening on port ${PORT}`);
    console.log(`Admin panel available at http://localhost:${PORT}`);
    console.log(`Bot is attempting to log in...`);
});

<<<<<<< HEAD
// Login Discord client
client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log('Discord client login successful.'))
    .catch(err => console.error('Discord client login failed:', err));
=======
server.on('error', (error) => {
    console.error('HTTP Server Error:', error);
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Please ensure no other application is using this port or change the PORT environment variable.`);
    }
    process.exit(1);
});


client.login(process.env.DISCORD_TOKEN)
    .then(() => {
        console.log('Discord client login successful.');
    })
    .catch(err => {
        console.error('Discord client login failed:', err);
        console.error('Please check your DISCORD_TOKEN environment variable.');
    });
>>>>>>> 8db4e2b160b4824421d5d7a64017713d7ed809fe

// Cleanup on exit
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    server.close(() => {
        console.log('HTTP server closed.');
        client.destroy();
        console.log('Discord client destroyed.');
        process.exit(0);
    });
<<<<<<< HEAD
});
=======
});

process.on('SIGTERM', () => {
    console.log('Shutting down server (SIGTERM)...');
    server.close(() => {
        console.log('HTTP server closed.');
        client.destroy();
        console.log('Discord client destroyed.');
        process.exit(0);
    });
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});
>>>>>>> 8db4e2b160b4824421d5d7a64017713d7ed809fe
