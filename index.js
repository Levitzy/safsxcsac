require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Events } = require('discord.js');
const http = require('http');
const https = require('https');
const url = require('url');

// GitHub raw URL for admin_ids.json
// Replace this with your actual GitHub raw URL when you have it
const ADMIN_IDS_URL = process.env.ADMIN_IDS_URL || 'https://raw.githubusercontent.com/yourusername/yourrepo/main/admin_ids.json';

// Load setup.json
let setup = require('./setup.json');
let PREFIX = typeof setup.PREFIX === 'string' ? setup.PREFIX : '';
let ADMIN_IDS = [];

// Function to fetch admin IDs from GitHub
async function fetchAdminIDs() {
    return new Promise((resolve, reject) => {
        https.get(ADMIN_IDS_URL, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const adminData = JSON.parse(data);
                    if (Array.isArray(adminData.ADMIN_IDS)) {
                        ADMIN_IDS = adminData.ADMIN_IDS;
                        console.log('Admin IDs loaded from GitHub:', ADMIN_IDS);
                        resolve(ADMIN_IDS);
                    } else {
                        console.error('Invalid admin_ids.json format. Expected ADMIN_IDS array.');
                        resolve([]);
                    }
                } catch (error) {
                    console.error('Error parsing admin_ids.json:', error);
                    resolve([]);
                }
            });
        }).on('error', (error) => {
            console.error('Error fetching admin IDs from GitHub:', error);
            resolve([]);
        });
    });
}

// Function to save admin IDs to a local file (as a backup)
function saveAdminIDsLocally(adminIDs) {
    try {
        fs.writeFileSync(
            path.join(__dirname, 'admin_ids_backup.json'), 
            JSON.stringify({ ADMIN_IDS: adminIDs }, null, 2)
        );
        console.log('Admin IDs saved to local backup file');
        return true;
    } catch (error) {
        console.error('Error saving admin IDs locally:', error);
        return false;
    }
}

// Function to reload configuration
function reloadConfig() {
    try {
        // Clear require cache to force reload
        delete require.cache[require.resolve('./setup.json')];
        // Reload setup.json
        setup = require('./setup.json');
        PREFIX = typeof setup.PREFIX === 'string' ? setup.PREFIX : '';
        
        // No need to reload ADMIN_IDS from setup.json anymore
        // We'll just use the in-memory version that we got from GitHub
        
        console.log('Configuration reloaded:', { PREFIX });
        return true;
    } catch (error) {
        console.error('Error reloading configuration:', error);
        return false;
    }
}

// Load admin IDs on startup
fetchAdminIDs().then(() => {
    console.log('Initial admin IDs loaded');
});

// Require the button interaction handler
const handleButtonInteraction = require('./handler/button_interaction'); // Path to your new handler

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

// Command loader
client.commands = new Map();
const cmdPath = path.join(__dirname, 'cmd');
fs.readdirSync(cmdPath)
    .filter(file => file.endsWith('.js'))
    .forEach(file => {
        try { // Added try-catch for command loading
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

// Check if a user has permission to use an admin command
function hasAdminPermission(userId) {
    return ADMIN_IDS.includes(userId);
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

    // Check if the command is admin-only and if the user has permission
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

// Interaction handler
client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isButton()) {
        await handleButtonInteraction(interaction); // Call the handler
    }
    // You can add handlers for other interaction types here (e.g., slash commands, select menus)
    // else if (interaction.isCommand()) { /* handle slash command */ }
});

// Read the HTML file
const adminPanelPath = path.join(__dirname, 'index.html');
let adminPanelHTML = '';

try {
    if (fs.existsSync(adminPanelPath)) {
        adminPanelHTML = fs.readFileSync(adminPanelPath, 'utf8');
    } else {
        // Create a basic HTML file if it doesn't exist
        adminPanelHTML = `<!DOCTYPE html>
<html>
<head>
    <title>Discord Bot Admin Panel</title>
</head>
<body>
    <h1>Discord Bot Admin Panel</h1>
    <p>Please create an index.html file with your admin panel content.</p>
</body>
</html>`;
        fs.writeFileSync(adminPanelPath, adminPanelHTML);
        console.log(`Created basic admin panel at ${adminPanelPath}`);
    }
} catch (error) {
    console.error('Error reading/creating admin panel HTML:', error);
    adminPanelHTML = '<h1>Error loading admin panel</h1>';
}

// Create HTTP server to serve the admin panel
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // API endpoint to get current configuration
    if (pathname === '/api/config' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        // Include both PREFIX from setup.json and ADMIN_IDS from GitHub
        res.end(JSON.stringify({
            PREFIX: PREFIX,
            ADMIN_IDS: ADMIN_IDS
        }));
    }
    // API endpoint to update configuration
    else if (pathname === '/api/config' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const newConfig = JSON.parse(body);
                
                // Basic validation
                if (typeof newConfig !== 'object') {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'Invalid configuration format' }));
                }
                
                // Handle PREFIX update (still in setup.json)
                if (newConfig.PREFIX !== undefined) {
                    setup.PREFIX = newConfig.PREFIX;
                    fs.writeFileSync(
                        path.join(__dirname, 'setup.json'), 
                        JSON.stringify(setup, null, 2)
                    );
                    PREFIX = newConfig.PREFIX;
                }
                
                // Handle ADMIN_IDS update (now separate from setup.json)
                if (newConfig.ADMIN_IDS && Array.isArray(newConfig.ADMIN_IDS)) {
                    ADMIN_IDS = newConfig.ADMIN_IDS;
                    // Save locally as a backup
                    saveAdminIDsLocally(ADMIN_IDS);
                }
                
                // For the admins, we're not actually updating the GitHub file
                // since that would require GitHub authentication
                // Instead, we'll just update the in-memory version and save locally
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: true, 
                    message: 'Configuration updated successfully. Note: Admin IDs are updated in-memory only.',
                    note: 'To persist admin IDs, update your GitHub admin_ids.json file.'
                }));
            } catch (error) {
                console.error('Error updating config:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to update configuration' }));
            }
        });
    }
    // API endpoint for admin ID operations
    else if (pathname === '/api/admin-ids' && req.method === 'GET') {
        // Refresh admin IDs from GitHub
        fetchAdminIDs().then(() => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                success: true,
                ADMIN_IDS: ADMIN_IDS
            }));
        }).catch(error => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: 'Failed to refresh admin IDs',
                message: error.message
            }));
        });
    }
    // API endpoint to get command information
    else if (pathname === '/api/commands' && req.method === 'GET') {
        const totalCommands = client.commands.size;
        const adminCommands = Array.from(client.commands.values()).filter(cmd => cmd.admin_only).length;
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            total: totalCommands,
            admin: adminCommands
        }));
    }
    // Serve the admin panel HTML for all other requests
    else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(adminPanelHTML);
    }
});

// Start the server on localhost
const PORT = process.env.PORT || 3000;
server.listen(PORT, 'localhost', () => {
    console.log(`Admin panel available at http://localhost:${PORT}`);
});

// Start the Discord bot
client.login(process.env.DISCORD_TOKEN);