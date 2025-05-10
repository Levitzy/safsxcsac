require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Events } = require('discord.js');
const http = require('http');

const setup = require('./setup.json');
const PREFIX = typeof setup.PREFIX === 'string' ? setup.PREFIX : '';

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

// Create HTTP server
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Facebook Account Creator Bot is running!');
});

// Start the server
server.listen(5000, '0.0.0.0', () => {
    console.log('HTTP server running on http://0.0.0.0:5000');
});

// Start the Discord bot
client.login(process.env.DISCORD_TOKEN);