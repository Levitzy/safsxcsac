const { MessageFlags } = require('discord.js');

async function handleButtonInteraction(interaction) {
    if (!interaction.isButton()) return;

    if (!interaction.message.embeds || interaction.message.embeds.length === 0) {
        try {
            await interaction.reply({
                content: 'Could not find the necessary information in the original message to perform this action.',
                ephemeral: true
            });
        } catch (e) {
            console.error("Failed to send ephemeral reply for missing embed:", e);
        }
        return;
    }

    const embed = interaction.message.embeds[0];

    if (interaction.customId === 'fb_copy_email') {
        const emailField = embed.fields && embed.fields.find(field => field.name && field.name.includes('Email'));
        if (emailField && emailField.value) {
            const emailMatch = emailField.value.match(/`([^`]+)`/);
            if (emailMatch && emailMatch[1]) {
                try {
                    await interaction.reply({
                        content: `📧 **Email:** \`${emailMatch[1]}\`\n(You can copy this directly)`,
                        ephemeral: true
                    });
                } catch (e) {
                    console.error("Failed to send ephemeral reply for email:", e);
                    try {
                        await interaction.followUp({
                            content: `Could not send the email privately. Please copy it from the original message.`,
                            ephemeral: true
                        });
                    } catch (followUpError) {
                        console.error("Failed to send follow-up error for email:", followUpError);
                    }
                }
            } else {
                try {
                    await interaction.reply({
                        content: 'Could not extract email from the message details. Please copy it manually.',
                        ephemeral: true
                    });
                } catch (e) {
                    console.error("Failed to send ephemeral error reply for email (match failed):", e);
                }
            }
        } else {
            try {
                await interaction.reply({
                    content: 'Could not find email field in the message. Please copy it manually.',
                    ephemeral: true
                });
            } catch (e) {
                console.error("Failed to send ephemeral error reply for email (field not found):", e);
            }
        }
    } else if (interaction.customId === 'fb_copy_password') {
        const passwordField = embed.fields && embed.fields.find(field => field.name && field.name.includes('Password'));
        if (passwordField && passwordField.value) {
            const passwordMatch = passwordField.value.match(/`([^`]+)`/);
            if (passwordMatch && passwordMatch[1]) {
                try {
                    await interaction.reply({
                        content: `🔑 **Password:** \`${passwordMatch[1]}\`\n(You can copy this directly)`,
                        ephemeral: true
                    });
                } catch (e) {
                    console.error("Failed to send ephemeral reply for password:", e);
                    try {
                        await interaction.followUp({
                            content: `Could not send the password privately. Please copy it from the original message.`,
                            ephemeral: true
                        });
                    } catch (followUpError) {
                        console.error("Failed to send follow-up error for password:", followUpError);
                    }
                }
            } else {
                try {
                    await interaction.reply({
                        content: 'Could not extract password from the message details. Please copy it manually.',
                        ephemeral: true
                    });
                } catch (e) {
                    console.error("Failed to send ephemeral error reply for password (match failed):", e);
                }
            }
        } else {
            try {
                await interaction.reply({
                    content: 'Could not find password field in the message. Please copy it manually.',
                    ephemeral: true
                });
            } catch (e) {
                console.error("Failed to send ephemeral error reply for password (field not found):", e);
            }
        }
    }
}

module.exports = handleButtonInteraction;