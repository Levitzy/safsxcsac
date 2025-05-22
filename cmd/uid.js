module.exports = {
    name: 'uid',
    description: 'Shows your Discord user ID or the ID of a mentioned user',
    admin_only: false,
    async execute(message, args) {
        const user = message.mentions.users.first() || message.author;
        const member = message.guild ? await message.guild.members.fetch(user.id).catch(() => null) : null;

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('User Information')
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'User', value: user.tag, inline: true },
                { name: 'User ID', value: user.id, inline: true }
            )
            .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
            .setTimestamp();

        embed.addFields({ name: 'Account Created', value: user.createdAt.toLocaleDateString(), inline: true });

        if (member && member.joinedAt) {
            embed.addFields({ name: 'Joined Server', value: member.joinedAt.toLocaleDateString(), inline: true });
        }

        if (member && member.nickname) {
            embed.addFields({ name: 'Nickname', value: member.nickname, inline: true });
        }
        
        const roles = member ? member.roles.cache
            .filter(role => role.id !== message.guild.id)
            .map(role => role.name)
            .join(', ') : 'N/A (Not in a server or roles inaccessible)';

        if (member) {
             embed.addFields({ name: 'Roles', value: roles.length > 0 ? roles : 'None', inline: false });
        }


        try {
            await message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error executing uid command:', error);
            await message.reply('There was an error trying to execute that command!');
        }
    },
};