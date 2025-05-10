require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
const http = require('http');

const setup = require('./setup.json');
const PREFIX = typeof setup.PREFIX === 'string' ? setup.PREFIX : '';

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// Command loader
client.commands = new Map();
const cmdPath = path.join(__dirname, 'cmd');
fs.readdirSync(cmdPath)
    .filter(file => file.endsWith('.js'))
    .forEach(file => {
        const command = require(path.join(cmdPath, file));
        if (command && command.name && typeof command.execute === 'function') {
            client.commands.set(command.name, command);
        }
    });

client.once('ready', () => {
    console.log(`✅ Bot connected as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Prefix handling: if PREFIX is empty, accept just the command name
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
        console.error(error);
        message.reply('❌ There was an error executing the command.');
    }
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