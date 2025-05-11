const setup = require('../setup.json');

module.exports = {
    name: 'uid',
    description: 'Shows your Discord user ID or the ID of a mentioned user',
    admin_only: true, // Mark this as an admin-only command
    execute(message, args) {
        try {
            // Check if the user is an admin
            const adminIds = setup.ADMIN_IDS || [];
            if (!adminIds.includes(message.author.id)) {
                return message.reply('❌ You do not have permission to use this command.');
            }
            
            // If a user is mentioned, get their ID
            if (message.mentions.users.size > 0) {
                const mentionedUser = message.mentions.users.first();
                return message.reply(`${mentionedUser.username}'s ID: \`${mentionedUser.id}\``);
            }
            
            // Otherwise, return the message author's ID
            return message.reply(`Your ID: \`${message.author.id}\``);
        } catch (error) {
            console.error('Error in uid command:', error);
            message.reply('❌ There was an error getting the user ID.');
        }
    }
};