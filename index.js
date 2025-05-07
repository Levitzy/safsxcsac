require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.once('ready', () => {
    console.log(`✅ Bot conectado como ${client.user.tag}`);
});

client.on('messageCreate', message => {
    if (message.author.bot) return;

    if (message.content === '!hola') {
        message.channel.send(`¡Hola, ${message.author.username}! 👋`);
    }

    if (message.content === '!hora') {
        const hora = new Date().toLocaleTimeString();
        message.channel.send(`🕒 La hora actual es: ${hora}`);
    }

    if (message.content === '!comandos') {
        message.channel.send(`📋 Comandos disponibles:\n!hola\n!hora\n!comandos`);
    }
});

client.login(process.env.DISCORD_TOKEN);
