require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Events } = require('discord.js');
const http = require('http');
const https = require('https');
const url = require('url');
const { Octokit } = require('@octokit/rest');

const ADMIN_IDS_URL = process.env.ADMIN_IDS_URL || 'https://raw.githubusercontent.com/Levitzy/safsxcsac/refs/heads/main/admin_ids.json';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER;
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME;
const GITHUB_FILE_PATH = process.env.GITHUB_FILE_PATH;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH;

let setup = require('./setup.json');
let PREFIX = typeof setup.PREFIX === 'string' ? setup.PREFIX : '';
let ADMIN_IDS = [];

let octokit;
if (GITHUB_TOKEN && GITHUB_REPO_OWNER && GITHUB_REPO_NAME && GITHUB_FILE_PATH && GITHUB_BRANCH) {
    octokit = new Octokit({ auth: GITHUB_TOKEN });
    console.log('GitHub API client initialized for repository updates.');
} else {
    console.warn('[WARN] GitHub API credentials for writing not fully configured. Admin ID updates to GitHub will be disabled.');
}

async function fetchAdminIDs() {
    return new Promise((resolve, reject) => {
        https.get(ADMIN_IDS_URL, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const adminData = JSON.parse(data);
                    if (Array.isArray(adminData.ADMIN_IDS)) {
                        ADMIN_IDS = adminData.ADMIN_IDS;
                        console.log('Admin IDs loaded from GitHub:', ADMIN_IDS);
                        resolve(ADMIN_IDS);
                    } else {
                        console.error('Invalid admin_ids.json format from GitHub. Expected ADMIN_IDS array.');
                        resolve([]);
                    }
                } catch (error) {
                    console.error('Error parsing admin_ids.json from GitHub:', error);
                    resolve([]);
                }
            });
        }).on('error', (error) => {
            console.error('Error fetching admin IDs from GitHub:', error);
            resolve([]);
        });
    });
}

async function updateAdminFileOnGitHub(newAdminArray) {
    if (!octokit) {
        throw new Error('GitHub API client not configured. Cannot update admin_ids.json on GitHub.');
    }

    const content = JSON.stringify({ ADMIN_IDS: newAdminArray }, null, 2);
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

        const commitMessage = `Update admin_ids.json via bot admin panel - ${new Date().toISOString()}`;
        
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

        console.log('admin_ids.json successfully updated on GitHub.');
        ADMIN_IDS = [...newAdminArray];
        return { success: true, message: 'Admin IDs successfully updated on GitHub.' };
    } catch (error) {
        console.error('Error updating admin_ids.json on GitHub:', error.message);
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

fetchAdminIDs().then(() => {
    console.log('Initial admin IDs loaded from GitHub.');
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

function hasAdminPermission(userId) {
    return ADMIN_IDS.includes(String(userId));
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

    if (command.admin_only && !hasAdminPermission(message.author.id)) {
        return message.reply('❌ You do not have permission to use this command.');
    }

    try {
        await command.execute(message, args);
    } catch (error) {
        console.error('Error executing command:', error);
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
            ADMIN_IDS: ADMIN_IDS,
            ADMIN_IDS_URL: ADMIN_IDS_URL,
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
    } else if (pathname === '/api/admin-ids/refresh' && req.method === 'GET') {
        try {
            await fetchAdminIDs();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                success: true,
                ADMIN_IDS: ADMIN_IDS,
                source: ADMIN_IDS_URL,
                message: 'Admin IDs refreshed from GitHub.'
            }));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: 'Failed to refresh admin IDs',
                message: error.message 
            }));
        }
    } else if (pathname === '/api/admin-ids/update' && req.method === 'POST') {
        if (!octokit) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'GitHub API not configured on server.', message: 'Cannot update admin IDs on GitHub.' }));
        }
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const { admin_ids: newAdminIdsArray } = JSON.parse(body);
                if (!Array.isArray(newAdminIdsArray)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'Invalid data format. Expected { admin_ids: [...] }' }));
                }

                const validatedAdminIds = newAdminIdsArray.map(String).filter(id => /^\d{17,19}$/.test(id));
                
                const result = await updateAdminFileOnGitHub(validatedAdminIds);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ...result, ADMIN_IDS: validatedAdminIds }));
            } catch (error) {
                console.error('Error processing GitHub admin ID update request:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to update admin IDs on GitHub.', message: error.message }));
            }
        });
    } else if (pathname === '/api/commands' && req.method === 'GET') {
        const totalCommands = client.commands.size;
        const adminCommands = Array.from(client.commands.values()).filter(cmd => cmd.admin_only).length;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ total: totalCommands, admin: adminCommands }));
    } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(adminPanelHTML);
    }
});

const PORT = 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Admin panel available at http://0.0.0.0:${PORT}`);
});

client.login(process.env.DISCORD_TOKEN);