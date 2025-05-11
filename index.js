require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Events } = require('discord.js');
const http = require('http');
const https = require('https');
const url = require('url');
const { Octokit } = require('@octokit/rest');

const ADMIN_CONFIG_URL = process.env.ADMIN_IDS_URL || 'https://raw.githubusercontent.com/Levitzy/safsxcsac/refs/heads/main/admin_ids.json'; // URL should point to new structure
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER;
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME;
const GITHUB_FILE_PATH = process.env.GITHUB_FILE_PATH; // Should be the path to the admin_ids.json file
const GITHUB_BRANCH = process.env.GITHUB_BRANCH;

let setup = require('./setup.json');
let PREFIX = typeof setup.PREFIX === 'string' ? setup.PREFIX : '';
let ADMIN_PERMISSIONS = {}; // Changed from ADMIN_IDS to ADMIN_PERMISSIONS

let octokit;
if (GITHUB_TOKEN && GITHUB_REPO_OWNER && GITHUB_REPO_NAME && GITHUB_FILE_PATH && GITHUB_BRANCH) {
    octokit = new Octokit({ auth: GITHUB_TOKEN });
    console.log('GitHub API client initialized for repository updates.');
} else {
    console.warn('[WARN] GitHub API credentials for writing not fully configured. Admin permission updates to GitHub will be disabled.');
}

async function fetchAdminPermissions() { // Renamed from fetchAdminIDs
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

async function updateAdminPermissionsFileOnGitHub(newAdminPermissionsObject) { // Renamed
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
        ADMIN_PERMISSIONS = { ...newAdminPermissionsObject }; // Update in-memory cache
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

fetchAdminPermissions().then(() => { // Renamed
    console.log('Initial admin permissions loaded.');
});

const handleButtonInteraction = require('./handler/button_interaction');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

client.commands = new Map();
const cmdPath = path.join(__dirname, 'cmd');
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

function hasAdminPermission(userId, commandName) { // Updated function
    const userPerms = ADMIN_PERMISSIONS[String(userId)];
    if (userPerms && Array.isArray(userPerms)) {
        return userPerms.includes('all') || userPerms.includes(commandName);
    }
    return false;
}

client.once(Events.ClientReady, () => {
    console.log(`✅ Bot connected as ${client.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

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

    // Updated permission check
    if (command.admin_only && !hasAdminPermission(message.author.id, command.name)) {
        return message.reply('❌ You do not have permission to use this specific command.');
    }

    try {
        await command.execute(message, args);
    } catch (error) {
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
let adminPanelHTML = '';
try {
    if (fs.existsSync(adminPanelPath)) {
        adminPanelHTML = fs.readFileSync(adminPanelPath, 'utf8');
    } else {
        adminPanelHTML = `<!DOCTYPE html><html><head><title>Admin Panel</title></head><body><h1>Admin Panel Not Found</h1><p>Please create index.html.</p></body></html>`;
        fs.writeFileSync(adminPanelPath, adminPanelHTML);
    }
} catch (error) {
    console.error('Error reading/creating admin panel HTML:', error);
    adminPanelHTML = '<h1>Error loading admin panel</h1>';
}

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    if (pathname === '/api/config' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            PREFIX: PREFIX,
            ADMIN_PERMISSIONS: ADMIN_PERMISSIONS, // Changed
            ADMIN_CONFIG_URL: ADMIN_CONFIG_URL, // Source URL for admin permissions
            GITHUB_CONFIGURED: !!octokit
        }));
    } else if (pathname === '/api/config' && req.method === 'POST') {
        // This endpoint only updates PREFIX for now.
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
    } else if (pathname === '/api/admin-permissions/refresh' && req.method === 'GET') { // Renamed endpoint
        try {
            await fetchAdminPermissions();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                success: true,
                ADMIN_PERMISSIONS: ADMIN_PERMISSIONS, // Changed
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
    } else if (pathname === '/api/admin-permissions/update' && req.method === 'POST') { // Renamed endpoint
        if (!octokit) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'GitHub API not configured on server.', message: 'Cannot update admin permissions on GitHub.' }));
        }
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const { admin_permissions: newAdminPermsObject } = JSON.parse(body); // Expecting admin_permissions
                if (typeof newAdminPermsObject !== 'object' || newAdminPermsObject === null) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'Invalid data format. Expected { admin_permissions: { "USER_ID": ["cmd1"], ... } }' }));
                }

                // Basic validation for the structure
                const validatedPerms = {};
                for (const userId in newAdminPermsObject) {
                    if (/^\d{17,19}$/.test(userId) && Array.isArray(newAdminPermsObject[userId])) {
                        validatedPerms[userId] = newAdminPermsObject[userId].map(String).filter(cmd => cmd.length > 0);
                    } else {
                         // Log invalid entry but continue with valid ones, or reject entirely
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
            admin_only: !!cmd.admin_only // Ensure boolean
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ commands: commandsList }));
    } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(adminPanelHTML);
    }
});

const PORT = process.env.PORT || 5000; // Allow PORT to be set via environment variable
server.listen(PORT, '0.0.0.0', () => { // Changed '0.0.0.0' to 'localhost'
    console.log(`Admin panel is now listening only on localhost.`);
    console.log(`Admin panel available at http://localhost:${PORT}`);
    console.log(`Bot is attempting to log in...`);
});

client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log('Discord client login successful.'))
    .catch(err => console.error('Discord client login failed:', err));