process.on('uncaughtException', (error, origin) => {
  console.error('!!!!!!!!!! Uncaught Exception !!!!!!!!!!!');
  console.error('Error:', error);
  console.error('Origin:', origin);
  console.error('Stack:', error.stack);
  process.exit(1); 
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('!!!!!!!!!! Unhandled Rejection !!!!!!!!!!!');
  console.error('Reason:', reason);
  if (reason instanceof Error && reason.stack) {
    console.error('Stack:', reason.stack);
  }
  console.error('Promise:', promise);
  // Consider exiting if a critical promise is unhandled: process.exit(1);
});

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Events } = require('discord.js');
const express = require('express');
const https = require('https');
const { Octokit } = require('@octokit/rest');
const crypto = require('crypto');

const SERVER_START_TIME = new Date();
const ADMIN_CONFIG_URL = process.env.ADMIN_IDS_URL || 'https://raw.githubusercontent.com/Levitzy/safsxcsac/refs/heads/main/admin_ids.json';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER;
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME;
const GITHUB_FILE_PATH = process.env.GITHUB_FILE_PATH;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH;

const ENV_PORT = process.env.PORT;
console.log(`Raw process.env.PORT: ${ENV_PORT} (type: ${typeof ENV_PORT})`);
const PORT = ENV_PORT ? parseInt(ENV_PORT, 10) : 5000;
if (isNaN(PORT)) {
    console.error(`!!!!!!!!!! Invalid PORT: ${ENV_PORT} resulted in NaN. Defaulting to 5000. !!!!!!!!!!!`);
    PORT = 5000;
}
console.log(`Using port: ${PORT} (type: ${typeof PORT})`);


const DEFAULT_ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'AdminJubiar';
const ADMIN_TOKENS = new Set([DEFAULT_ADMIN_TOKEN]);
const SESSION_TOKENS = new Map(); 

let setup = {};
try {
    setup = require('./setup.json');
} catch (e) {
    console.error("!!!!!!!!!! Failed to load setup.json !!!!!!!!!!!", e);
    setup = { PREFIX: "!" }; // Default prefix if setup.json is missing/corrupt
    console.log("Using default prefix due to error loading setup.json:", setup.PREFIX);
}

let PREFIX = typeof setup.PREFIX === 'string' ? setup.PREFIX : '';
let ADMIN_PERMISSIONS = {};
let systemStats = {
  commandsExecuted: 0,
  lastCommandTime: null,
  errors: 0,
  activeUsers: new Set()
};

let octokit;
if (GITHUB_TOKEN && GITHUB_REPO_OWNER && GITHUB_REPO_NAME && GITHUB_FILE_PATH && GITHUB_BRANCH) {
    try {
        octokit = new Octokit({ auth: GITHUB_TOKEN });
        console.log('GitHub API client initialized for repository updates.');
    } catch (e) {
        console.error("!!!!!!!!!! Failed to initialize Octokit !!!!!!!!!!!", e);
    }
} else {
    console.warn('[WARN] GitHub API credentials for writing not fully configured. Admin permission updates to GitHub will be disabled.');
}

async function fetchAdminPermissions() {
    console.log('Attempting to fetch admin permissions from:', ADMIN_CONFIG_URL);
    return new Promise((resolve) => { // Removed reject as it was always resolving
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
                        console.log('Admin permissions loaded from GitHub:', Object.keys(ADMIN_PERMISSIONS).length + " entries.");
                        resolve(ADMIN_PERMISSIONS);
                    } else {
                        console.error('Invalid admin_ids.json format from GitHub. Expected ADMIN_PERMISSIONS object. Data received:', jsonDataToParse.substring(0, 100));
                        ADMIN_PERMISSIONS = {}; 
                        resolve({});
                    }
                } catch (error) {
                    console.error('Error parsing admin_ids.json from GitHub:', error);
                    ADMIN_PERMISSIONS = {};
                    resolve({});
                }
            });
        }).on('error', (error) => {
            console.error('Error fetching admin permissions from GitHub (https.get error):', error);
            ADMIN_PERMISSIONS = {};
            resolve({});
        });
    });
}

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

function generateSessionToken() {
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = Date.now() + (24 * 60 * 60 * 1000); 
    SESSION_TOKENS.set(token, { expiry });
    return token;
}

function validateSessionToken(token) {
    if (!SESSION_TOKENS.has(token)) return false;
    
    const session = SESSION_TOKENS.get(token);
    if (Date.now() > session.expiry) {
        SESSION_TOKENS.delete(token);
        return false;
    }
    
    return true;
}

function hasAdminPermission(userId, commandName) {
    const userPerms = ADMIN_PERMISSIONS[String(userId)];
    if (userPerms && Array.isArray(userPerms)) {
        return userPerms.includes('all') || userPerms.includes(commandName);
    }
    return false;
}

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

function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
}

fetchAdminPermissions().then(() => {
    console.log('Initial admin permissions processing completed.');
}).catch(err => {
    console.error("!!!!!!!!!! Error in fetchAdminPermissions().then() chain !!!!!!!!!!!", err);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

let handleButtonInteraction;
try {
    handleButtonInteraction = require('./handler/button_interaction');
    console.log('Button interaction handler loaded successfully.');
} catch (error) {
    console.warn('Button interaction handler not found or failed to load:', error.message);
    handleButtonInteraction = async () => console.log('Button interaction received but handler not available');
}

client.commands = new Map();
const cmdPath = path.join(__dirname, 'cmd');
console.log('Looking for commands in:', cmdPath);
if (fs.existsSync(cmdPath)) {
    fs.readdirSync(cmdPath)
        .filter(file => file.endsWith('.js'))
        .forEach(file => {
            try {
                const commandFilePath = path.join(cmdPath, file);
                console.log('Loading command:', commandFilePath);
                const command = require(commandFilePath);
                if (command && command.name && typeof command.execute === 'function') {
                    client.commands.set(command.name, command);
                } else {
                    console.warn(`[WARN] The command at ${commandFilePath} is missing a required "name" or "execute" property.`);
                }
            } catch (error) {
                console.error(`[ERROR] Could not load command at ${path.join(cmdPath, file)}:`, error);
            }
        });
    console.log(`Loaded ${client.commands.size} commands.`);
} else {
    console.warn(`[WARN] Command directory not found at ${cmdPath}`);
}

client.once(Events.ClientReady, () => {
    console.log(`✅ Bot connected as ${client.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    systemStats.activeUsers.add(message.author.id);

    const raw = message.content.trim();
    let args, commandName;
    if (PREFIX && raw.startsWith(PREFIX)) {
        args = raw.slice(PREFIX.length).trim().split(/ +/);
        commandName = args.shift().toLowerCase();
    } else if (!PREFIX) {
        args = raw.split(/ +/);
        commandName = args.shift().toLowerCase();
    } else {
        return;
    }

    const command = client.commands.get(commandName);
    if (!command) return;

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

const adminPanelPath = path.join(__dirname, 'index.html');
const loginPath = path.join(__dirname, 'login.html');


const app = express();
console.log('Express app initialized.');
app.use(express.json()); 
console.log('Express.json middleware configured.');

app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        
        if (req.method === 'OPTIONS') {
            return res.sendStatus(200);
        }
    }
    next();
});
console.log('CORS middleware configured.');

const authenticateRequest = (req, res, next) => {
    const isProtectedEndpoint = 
        (req.path.startsWith('/api/') && req.path !== '/api/auth') || 
        (req.path === '/' && !req.query.token);

    if (!isProtectedEndpoint) {
        return next();
    }

    const authHeader = req.headers.authorization;
    const urlToken = req.query.token;
    
    let isAuthenticated = false;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        isAuthenticated = validateSessionToken(token);
    }
    
    if (!isAuthenticated && urlToken) {
        isAuthenticated = validateSessionToken(urlToken);
    }
    
    if (!isAuthenticated && req.path !== '/') {
        return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
    }
    
    if (!isAuthenticated && req.path === '/') {
        return res.redirect('/login.html');
    }
    next();
};

app.use(authenticateRequest);
console.log('Authentication middleware configured.');

app.post('/api/auth', (req, res) => {
    try {
        const { token } = req.body;
        
        if (ADMIN_TOKENS.has(token)) {
            const sessionToken = generateSessionToken();
            res.status(200).json({ 
                success: true, 
                token: sessionToken,
                message: 'Authentication successful' 
            });
        } else {
            res.status(401).json({ 
                error: 'Invalid token', 
                message: 'The provided authentication token is invalid' 
            });
        }
    } catch (error) {
        res.status(400).json({ error: 'Invalid request', message: error.message });
    }
});

app.get('/api/uptime', (req, res) => {
    res.status(200).json({
        serverStartTime: SERVER_START_TIME.toISOString(),
        uptime: Date.now() - SERVER_START_TIME.getTime(),
        formattedUptime: formatUptime(Date.now() - SERVER_START_TIME.getTime())
    });
});

app.get('/api/stats', (req, res) => {
    res.status(200).json(getSystemStats());
});

app.get('/api/config', (req, res) => {
    res.status(200).json({
        PREFIX: PREFIX,
        ADMIN_PERMISSIONS: ADMIN_PERMISSIONS,
        ADMIN_CONFIG_URL: ADMIN_CONFIG_URL,
        GITHUB_CONFIGURED: !!octokit
    });
});

app.post('/api/config', (req, res) => {
    try {
        const newConfig = req.body;
        if (typeof newConfig !== 'object') {
            return res.status(400).json({ error: 'Invalid configuration format' });
        }
        
        let prefixUpdated = false;
        if (newConfig.PREFIX !== undefined && newConfig.PREFIX !== PREFIX) {
            setup.PREFIX = newConfig.PREFIX;
            fs.writeFileSync(path.join(__dirname, 'setup.json'), JSON.stringify(setup, null, 2));
            PREFIX = newConfig.PREFIX;
            prefixUpdated = true;
        }
        
        if (prefixUpdated) {
            res.status(200).json({ success: true, message: 'Prefix updated successfully.' });
        } else {
            res.status(200).json({ success: true, message: 'No changes to prefix.' });
        }
    } catch (error) {
        console.error('Error updating prefix config:', error);
        res.status(500).json({ error: 'Failed to update prefix configuration' });
    }
});

app.get('/api/admin-permissions/refresh', async (req, res) => {
    try {
        await fetchAdminPermissions();
        res.status(200).json({ 
            success: true,
            ADMIN_PERMISSIONS: ADMIN_PERMISSIONS,
            source: ADMIN_CONFIG_URL,
            message: 'Admin permissions refreshed from GitHub.'
        });
    } catch (error) {
        res.status(500).json({ 
            error: 'Failed to refresh admin permissions',
            message: error.message 
        });
    }
});

app.post('/api/admin-permissions/update', async (req, res) => {
    if (!octokit) {
        return res.status(503).json({ error: 'GitHub API not configured on server.', message: 'Cannot update admin permissions on GitHub.' });
    }
    try {
        const { admin_permissions: newAdminPermsObject } = req.body;
        if (typeof newAdminPermsObject !== 'object' || newAdminPermsObject === null) {
            return res.status(400).json({ error: 'Invalid data format. Expected { admin_permissions: { "USER_ID": ["cmd1"], ... } }' });
        }

        const validatedPerms = {};
        for (const userId in newAdminPermsObject) {
            if (/^\d{17,19}$/.test(userId) && Array.isArray(newAdminPermsObject[userId])) {
                validatedPerms[userId] = newAdminPermsObject[userId].map(String).filter(cmd => cmd.length > 0);
            } else {
                console.warn(`Invalid entry for user ID ${userId} in admin permissions update.`);
            }
        }
        
        const result = await updateAdminPermissionsFileOnGitHub(validatedPerms);
        res.status(200).json({ ...result, ADMIN_PERMISSIONS: validatedPerms });
    } catch (error) {
        console.error('Error processing GitHub admin permissions update request:', error);
        res.status(500).json({ error: 'Failed to update admin permissions on GitHub.', message: error.message });
    }
});

app.get('/api/commands', (req, res) => {
    const commandsList = Array.from(client.commands.values()).map(cmd => ({
        name: cmd.name,
        description: cmd.description || 'No description available.',
        admin_only: !!cmd.admin_only
    }));
    res.status(200).json({ commands: commandsList });
});
console.log('API routes configured.');

app.get('/login.html', (req, res) => {
    fs.readFile(loginPath, 'utf8', (err, data) => {
        if (err) {
            if (fs.existsSync(loginPath)) { 
                 console.error('Error reading login HTML:', err);
                 return res.status(500).send('<h1>Error loading login page</h1>');
            }
            const basicLoginHTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Discord Bot Admin Panel - Login</title><style>body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background-color:#36393F}.login-card{background:white;padding:2rem;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,0.1);width:100%;max-width:400px}h1{margin-top:0}input{width:100%;padding:8px;margin:8px 0;box-sizing:border-box}button{background:#5865F2;color:white;border:none;padding:10px;width:100%;cursor:pointer;border-radius:4px}button:hover{background:#4752C4}.error{color:red;display:none}</style></head><body><div class="login-card"><h1>Admin Login</h1><div id="error" class="error">Invalid token</div><form id="login-form"><div><label for="token">Admin Token</label><input type="password" id="token" required></div><button type="submit">Login</button></form></div><script>document.getElementById('login-form').addEventListener('submit',function(e){e.preventDefault();const t=document.getElementById('token').value;fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:t})}).then(e=>e.json()).then(e=>{e.success?(localStorage.setItem('adminToken',e.token),window.location.href='/?token='+e.token):document.getElementById('error').style.display='block'}).catch(e=>{console.error('Login error:',e),document.getElementById('error').style.display='block'})})</script></body></html>`;
            fs.writeFile(loginPath, basicLoginHTML, (writeErr) => {
                if (writeErr) {
                    console.error('Error creating login HTML:', writeErr);
                    return res.status(500).send('<h1>Error loading login page</h1>');
                }
                res.setHeader('Content-Type', 'text/html');
                res.send(basicLoginHTML);
            });
        } else {
            res.setHeader('Content-Type', 'text/html');
            res.send(data);
        }
    });
});

app.get('/', (req, res) => {
     fs.readFile(adminPanelPath, 'utf8', (err, data) => {
        if (err) {
            if (fs.existsSync(adminPanelPath)) { 
                 console.error('Error reading admin panel HTML:', err);
                 return res.status(500).send('<h1>Error loading admin panel</h1>');
            }
            const basicAdminPanelHTML = `<!DOCTYPE html><html><head><title>Admin Panel</title></head><body><h1>Admin Panel Not Found</h1><p>Please create index.html.</p></body></html>`;
            fs.writeFile(adminPanelPath, basicAdminPanelHTML, (writeErr) => {
                if (writeErr) {
                    console.error('Error creating admin panel HTML:', writeErr);
                    return res.status(500).send('<h1>Error loading admin panel</h1>');
                }
                res.setHeader('Content-Type', 'text/html');
                res.send(basicAdminPanelHTML);
            });
        } else {
            res.setHeader('Content-Type', 'text/html');
            res.send(data);
        }
    });
});
console.log('HTML serving routes configured.');

app.use(express.static(__dirname));
console.log('Static file serving configured for directory:', __dirname);

app.use((req, res, next) => {
    res.status(404).send("<h1>404 Not Found</h1><p>The requested resource could not be found.</p>");
});
console.log('404 handler configured.');

console.log('Express app fully configured. Attempting to start server...');
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅✅✅ Admin panel is NOW LISTENING on host 0.0.0.0 and port ${PORT} ✅✅✅`);
    console.log(`Admin panel should be available at http://localhost:${PORT} (locally) or your Render URL.`);
    console.log('Bot is attempting to log in to Discord...');
});
console.log('app.listen command issued. Waiting for server to be ready or error.');

server.on('error', (err) => {
    console.error('!!!!!!!!!! HTTP Server Error !!!!!!!!!!!');
    console.error('Error Code:', err.code);
    console.error('Error Message:', err.message);
    console.error('Stack:', err.stack);
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Ensure no other service is using it or try a different port.`);
    }
    process.exit(1); 
});


client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log('Discord client login successful.'))
    .catch(err => {
        console.error('!!!!!!!!!! Discord client login failed: !!!!!!!!!!!', err);
        // Depending on your app's logic, you might want to exit if Discord login is critical
        // process.exit(1); 
    });

process.on('SIGINT', () => {
    console.log('SIGINT received. Shutting down server...');
    server.close(() => {
        console.log('HTTP server closed.');
        client.destroy();
        console.log('Discord client destroyed.');
        process.exit(0);
    });
});
