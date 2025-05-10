const { MessageFlags } = require('discord.js');

async function handleButtonInteraction(interaction) {
    if (!interaction.isButton()) return;

    const messageContent = interaction.message.content;

    if (interaction.customId === 'fb_copy_email') {
        const emailMatch = messageContent.match(/📧 \*\*Email:\*\* `([^`]+)`/);
        if (emailMatch && emailMatch[1]) {
            try {
                await interaction.reply({ 
                    content: `📧 **Email:** \`${emailMatch[1]}\`\n(You can copy this directly)`, 
                    flags: [MessageFlags.Ephemeral] // Use flags for ephemeral
                });
            } catch (e) {
                console.error("Failed to send ephemeral reply for email:", e);
                try {
                    await interaction.followUp({ 
                        content: `Could not send the email privately. Please copy it from the original message.`, 
                        flags: [MessageFlags.Ephemeral] 
                    });
                } catch (followUpError) {
                     console.error("Failed to send follow-up error for email:", followUpError);
                }
            }
        } else {
            try {
                await interaction.reply({ 
                    content: 'Could not extract email from the message. Please copy it manually.', 
                    flags: [MessageFlags.Ephemeral] 
                });
            } catch (e) {
                console.error("Failed to send ephemeral error reply for email (extraction failed):", e);
            }
        }
    } else if (interaction.customId === 'fb_copy_password') {
        const passwordMatch = messageContent.match(/🔑 \*\*Password:\*\* `([^`]+)`/);
        if (passwordMatch && passwordMatch[1]) {
            try {
                await interaction.reply({ 
                    content: `🔑 **Password:** \`${passwordMatch[1]}\`\n(You can copy this directly)`, 
                    flags: [MessageFlags.Ephemeral] // Use flags for ephemeral
                });
            } catch (e) {
                console.error("Failed to send ephemeral reply for password:", e);
                 try {
                    await interaction.followUp({ 
                        content: `Could not send the password privately. Please copy it from the original message.`, 
                        flags: [MessageFlags.Ephemeral] 
                    });
                } catch (followUpError) {
                     console.error("Failed to send follow-up error for password:", followUpError);
                }
            }
        } else {
            try {
                await interaction.reply({ 
                    content: 'Could not extract password from the message. Please copy it manually.', 
                    flags: [MessageFlags.Ephemeral] 
                });
            } catch (e) {
                console.error("Failed to send ephemeral error reply for password (extraction failed):", e);
            }
        }
    }
    // Add more button handlers here if needed with else if (interaction.customId === '...')
}

module.exports = handleButtonInteraction;