// uid.js

module.exports = {
    name: 'uid',
    description: 'Shows your Discord user ID or the ID of a mentioned user',
    admin_only: true, // This flag tells index.js to perform the admin check using GitHub IDs
    async execute(message, args) { // Changed to async execute
        try {
            // The admin check is handled by index.js because 'admin_only: true' is set.
            
            if (message.mentions.users.size > 0) {
                const mentionedUser = message.mentions.users.first();
                return message.reply(`${mentionedUser.username}'s ID: \`${mentionedUser.id}\``);
            }
            
            return message.reply(`Your ID: \`${message.author.id}\``);
        } catch (error) {
            console.error('Error in uid command:', error);
            message.reply('❌ There was an error getting the user ID.');
        }
    }
};