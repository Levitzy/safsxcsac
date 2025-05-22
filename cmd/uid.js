const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'uid',
    description: 'Shows detailed information about your Discord account or a mentioned user.',
    aliases: ['userid', 'userinfo'],
    admin_only: false,
    guildOnly: false,
    async execute(message, args) {
        const targetUser = message.mentions.users.first() || message.author;
        let targetMember = null;

        if (message.guild) {
            try {
                targetMember = await message.guild.members.fetch(targetUser.id);
            } catch (err) {
                console.warn(`Could not fetch member ${targetUser.id} in guild ${message.guild.id}:`, err.message);
            }
        }

        const embed = new EmbedBuilder()
            .setColor(targetMember ? targetMember.displayHexColor === '#000000' ? '#0099ff' : targetMember.displayHexColor : '#0099ff')
            .setTitle(`User Information: ${targetUser.username}`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
                { name: '👤 Username', value: `\`${targetUser.tag}\``, inline: true },
                { name: '🆔 User ID', value: `\`${targetUser.id}\``, inline: true },
                { name: '🤖 Bot Account', value: targetUser.bot ? 'Yes' : 'No', inline: true },
                { name: '📅 Account Created', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:F> (<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>)`, inline: false }
            )
            .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
            .setTimestamp();

        if (targetMember) {
            embed.addFields(
                { name: '🗓️ Joined Server', value: `<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:F> (<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:R>)`, inline: false }
            );

            if (targetMember.nickname) {
                embed.addFields({ name: '📝 Nickname', value: `\`${targetMember.nickname}\``, inline: true });
            }

            const roles = targetMember.roles.cache
                .filter(role => role.id !== message.guild.id)
                .sort((a, b) => b.position - a.position)
                .map(role => role.toString());

            if (roles.length > 0) {
                let rolesString = roles.join(', ');
                if (rolesString.length > 1024) {
                     rolesString = rolesString.substring(0, 1020) + '...';
                }
                embed.addFields({ name: `🎭 Roles (${roles.length})`, value: rolesString, inline: false });
            } else {
                embed.addFields({ name: '🎭 Roles', value: 'No roles in this server.', inline: false });
            }
            
            const fetchedUserWithBanner = await targetUser.fetch({ force: true }).catch(() => null);
            if (fetchedUserWithBanner && fetchedUserWithBanner.banner) {
                embed.setImage(fetchedUserWithBanner.bannerURL({ dynamic: true, size: 4096 }));
            }

        } else {
            embed.addFields({ name: 'ℹ️ Note', value: 'This user is not currently in this server (or an error occurred fetching member details). Some information may be unavailable.', inline: false });
        }

        try {
            await message.reply({ embeds: [embed] });
        } catch (error) {
            console.error(`Error executing 'uid' command for ${targetUser.tag}:`, error);
            try {
                await message.reply(`User: ${targetUser.tag}\nID: ${targetUser.id}`);
            } catch (fallbackError) {
                console.error('Error sending fallback reply for uid command:', fallbackError);
            }
        }
    },
};
