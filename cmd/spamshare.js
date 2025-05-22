const { EmbedBuilder } = require('discord.js');
const axios = require('axios'); // Make sure to install axios: npm install axios

module.exports = {
    name: 'spamshare',
    description: 'Shares a Facebook post a specified number of times using a provided cookie. USE WITH EXTREME CAUTION.',
    admin_only: false, // Set to true if you want only admins to use this
    async execute(message, args) {
        // #####################################################################
        // ########## ULTRA DEBUG: IS THIS COMMAND EVEN EXECUTING? ##########
        console.log("[SPAMSHARE_ULTRA_DEBUG] >>>>>>>>>>>>>> spamshare.js execute() function STARTED <<<<<<<<<<<<<<");
        // #####################################################################

        if (args.length < 3) {
            console.log("[SPAMSHARE_ULTRA_DEBUG] Not enough arguments.");
            const usageEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('SpamShare Command Usage & Important Warnings')
                .setDescription(
                    '**CRITICAL WARNING:** This command requires your Facebook cookie. Sharing your cookie is a MAJOR SECURITY RISK and can lead to your Facebook account being compromised. Automated sharing can also violate Facebook\'s Terms of Service and result in an account ban.\n\n' +
                    '**This command will ONLY work with a pre-obtained full Facebook cookie string.**'
                )
                .addFields(
                    { name: 'Correct Usage', value: '`!spamshare "<YOUR_FULL_FACEBOOK_COOKIE_STRING>" <facebook_post_url> <number_of_shares>`' },
                    { name: 'Example', value: '`!spamshare "datr=xxxx; sb=yyyy; ..." https://www.facebook.com/user/posts/12345 10`' },
                    { name: 'How to get your cookie (use with caution):', value: 'You can typically find your cookie using browser developer tools. Search for tutorials on "how to get Facebook cookie". **Be extremely careful where you paste this cookie.**' },
                    { name: 'Important Notes', value: '- Wrap your entire cookie string in double quotes if it contains spaces.\n- Use responsibly and at your own immense risk.' }
                )
                .setFooter({ text: 'Misuse can lead to severe consequences for your Facebook account.' });
            return message.reply({ embeds: [usageEmbed] });
        }

        const cookie = args[0];
        const postLink = args[1];
        const shareCount = parseInt(args[2], 10);

        console.log("[SPAMSHARE_ULTRA_DEBUG] Arguments parsed:", { cookieProvided: !!cookie, postLink, shareCount });


        if (!cookie || cookie.length < 20) {
            console.log("[SPAMSHARE_ULTRA_DEBUG] Invalid cookie argument.");
            return message.reply('A valid, full Facebook cookie string is required as the first argument. Please wrap it in quotes if it contains spaces.');
        }
        if (!postLink || (!postLink.startsWith('https://www.facebook.com/') && !postLink.startsWith('https://m.facebook.com/') && !postLink.startsWith('https://mbasic.facebook.com/'))) {
            console.log("[SPAMSHARE_ULTRA_DEBUG] Invalid postLink argument.");
            return message.reply('A valid Facebook post URL is required (e.g., starting with `https://www.facebook.com/`).');
        }
        if (isNaN(shareCount) || shareCount <= 0) {
            console.log("[SPAMSHARE_ULTRA_DEBUG] Invalid shareCount argument.");
            return message.reply('A valid number of shares (greater than 0) is required.');
        }

        const initialMessage = await message.reply(`Attempting to share post ${shareCount} times. This might take a while... Your cookie will be used for this process.`);
        console.log(`[SpamShare] User ${message.author.tag} initiated spamshare. Target: ${postLink}, Count: ${shareCount}. Cookie (first 30 chars): ${cookie.substring(0,30)}...`);

        try {
            console.log("[SPAMSHARE_ULTRA_DEBUG] Entering main try block for token fetching.");
            await initialMessage.edit('Step 1/2: Attempting to retrieve access token using the provided cookie and new method...');
            console.log('[SpamShare] Attempting to get access token from Facebook using new method...');

            let accessToken = null;
            const targetUrl = 'https://business.facebook.com/content_management';
            const tokenFetchingHeaders = {
                'authority': 'business.facebook.com',
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
                'cache-control': 'max-age=0',
                'cookie': cookie,
                'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Safari/537.36',
                'referer': 'https://www.facebook.com/',
                'sec-ch-ua': '".Not/A)Brand";v="99", "Google Chrome";v="103", "Chromium";v="103"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Linux"',
                'sec-fetch-dest': 'document',
                'sec-fetch-mode': 'navigate',
                'sec-fetch-site': 'same-origin',
                'sec-fetch-user': '?1',
                'upgrade-insecure-requests': '1',
            };

            try {
                console.log(`[SpamShare] DEBUG: Trying to fetch token from: ${targetUrl} with new headers.`);
                const response = await axios.get(targetUrl, { headers: tokenFetchingHeaders });
                const responseDataForToken = response.data;
                const responseStatusForToken = response.status;

                console.log(`[SpamShare] DEBUG: Received response from Facebook. Status: ${responseStatusForToken}`);
                console.log(`[SpamShare] DEBUG: Type of responseDataForToken: ${typeof responseDataForToken}`);

                if (typeof responseDataForToken === 'string') {
                    console.log(`[SpamShare] DEBUG: Raw responseDataForToken (first 200 chars): ${responseDataForToken.substring(0,200)}`);
                } else if (responseDataForToken) {
                    console.log(`[SpamShare] DEBUG: Raw responseDataForToken (is not a string, logging as is):`, responseDataForToken);
                } else {
                    console.log(`[SpamShare] DEBUG: responseDataForToken is empty or undefined.`);
                }

                if (responseStatusForToken === 200 && typeof responseDataForToken === 'string') {
                    const tokenMatch = responseDataForToken.match(/"accessToken":\s*"([^"]+)"/);
                    if (tokenMatch && tokenMatch[1]) {
                        accessToken = tokenMatch[1];
                        console.log(`[SpamShare] Access Token Found with new regex from ${targetUrl}:`, accessToken.substring(0, 30) + "...");
                    } else {
                        console.log(`[SpamShare] New regex /"accessToken":\s*"([^"]+)"/ failed to find token in response from ${targetUrl}.`);
                        console.log(`[SpamShare] Attempting fallback EAAG/EAA regex on the same response...`);
                        let fallbackMatch = responseDataForToken.match(/EAAG([a-zA-Z0-9_-]+)/);
                        if (fallbackMatch && fallbackMatch[0]) {
                            accessToken = fallbackMatch[0];
                            console.log(`[SpamShare] Access Token (EAAG type) Found with fallback regex:`, accessToken.substring(0, 30) + "...");
                        } else {
                            fallbackMatch = responseDataForToken.match(/EAA([a-zA-Z0-9_-]+)/);
                            if (fallbackMatch && fallbackMatch[0]) {
                                accessToken = fallbackMatch[0];
                                console.log(`[SpamShare] Access Token (general EAA type) Found with fallback regex:`, accessToken.substring(0, 30) + "...");
                            }
                        }
                    }

                    if (!accessToken) {
                        console.error(`[SpamShare] CRITICAL: Could not find any access token using new method or fallbacks from ${targetUrl}. Status: ${responseStatusForToken}.`);
                        console.error(`[SpamShare] This usually means your cookie is invalid/expired, OR Facebook presented a login page, CAPTCHA, or security checkpoint.`);
                        console.error(`[SpamShare] === VVVV BEGIN FACEBOOK RESPONSE SNIPPET (check for 'login', 'checkpoint', 'captcha', or if it's JSON-like) VVVV ===`);
                        if (typeof responseDataForToken === 'string') {
                            console.error(responseDataForToken.substring(0, 1500));
                        } else {
                            console.error(`[SpamShare] responseDataForToken was not a string. Raw data:`, responseDataForToken);
                        }
                        console.error(`[SpamShare] === ^^^^ END FACEBOOK RESPONSE SNIPPET ^^^^ ===`);
                        await initialMessage.edit(`Error: Could not retrieve a usable access token from Facebook using the new method. The cookie might be invalid/expired, Facebook's page structure changed, or a security challenge was presented. **Please check the bot's console for a snippet of the HTML/data received from Facebook.**`);
                        return;
                    }

                } else {
                     console.error(`[SpamShare] Failed to fetch from ${targetUrl}. HTTP Status: ${responseStatusForToken}. Expected 200 and string data.`);
                     console.error(`[SpamShare] Actual responseDataForToken type: ${typeof responseDataForToken}`);
                     console.error(`[SpamShare] Response data (if available, first 500 chars):`, typeof responseDataForToken === 'string' ? responseDataForToken.substring(0, 500) : responseDataForToken);
                     await initialMessage.edit(`Error: Facebook returned an unexpected status (${responseStatusForToken}) or data type when trying to get an access token. Your cookie may be invalid or Facebook is blocking the request. Check console for details.`);
                     return;
                }
            } catch (error) {
                // #####################################################################
                console.error(`[SPAMSHARE_ULTRA_DEBUG] CATCH BLOCK (token fetching): Error during HTTP request to ${targetUrl} with new method:`, error.message);
                // #####################################################################
                if (error.response) {
                    console.error(`[SpamShare] CATCH BLOCK (token fetching): Facebook Response Status for ${targetUrl}: ${error.response.status}`);
                    console.error(`[SpamShare] CATCH BLOCK (token fetching): Facebook Response Data type: ${typeof error.response.data}`);
                    console.error(`[SpamShare] CATCH BLOCK (token fetching): Facebook Response Data (first 500 chars):`, typeof error.response.data === 'string' ? error.response.data.substring(0, 500) : error.response.data);
                } else {
                    console.error(`[SpamShare] CATCH BLOCK (token fetching): No error.response object. Error details:`, error);
                }
                await initialMessage.edit(`Error fetching data from Facebook for token using new method: ${error.message}. Your cookie might be invalid/expired, or Facebook is blocking. Check console.`);
                return;
            }

            if (accessToken) {
                await initialMessage.edit(`Step 1/2: Access token retrieved successfully using your cookie. Proceeding to share...`);
            } else {
                console.error(`[SpamShare] CRITICAL: No access token obtained after all attempts. This path should ideally not be reached if logic above is correct.`);
                await initialMessage.edit(`Error: Failed to retrieve an access token after all attempts. Please check console logs for details from Facebook's response.`);
                return;
            }

            // --- 2. Share the Post ---
            console.log("[SPAMSHARE_ULTRA_DEBUG] Proceeding to Share the Post section.");
            await initialMessage.edit(`Step 2/2: Starting the sharing process for ${shareCount} shares using the obtained token and your cookie...`);
            console.log(`[SpamShare] Starting to share post ${shareCount} times with token: ${accessToken.substring(0,30)}...`);

            const shareUrl = `https://b-graph.facebook.com/me/feed`;
            const shareHeaders = {
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Safari/537.36',
                'Accept-Encoding': 'gzip, deflate',
                'Cookie': cookie,
                'Content-Type': 'application/x-www-form-urlencoded'
            };

            let successCount = 0;
            let lastStatusMessageTime = Date.now();

            for (let i = 0; i < shareCount; i++) {
                const params = new URLSearchParams();
                params.append('link', postLink);
                params.append('published', '0');
                params.append('access_token', accessToken);

                try {
                    console.log(`[SPAMSHARE_ULTRA_DEBUG] Attempting share ${i + 1}/${shareCount}`);
                    const shareResponse = await axios.post(shareUrl, params, { headers: shareHeaders });

                    if (shareResponse.data && shareResponse.data.id) {
                        successCount++;
                        console.log(`[SpamShare] Share ${i + 1}/${shareCount} successful. Post ID: ${shareResponse.data.id}`);
                        if (Date.now() - lastStatusMessageTime > 3000 || successCount === shareCount) {
                             await initialMessage.edit(`Sharing progress: ${successCount}/${shareCount} shares completed successfully.`);
                             lastStatusMessageTime = Date.now();
                        }
                    } else {
                        console.warn(`[SpamShare] Share ${i + 1}/${shareCount} failed or didn't return an ID. Response:`, JSON.stringify(shareResponse.data));
                    }
                } catch (error) {
                    // #####################################################################
                    console.error(`[SPAMSHARE_ULTRA_DEBUG] CATCH BLOCK (sharing loop, share ${i+1}):`, error.message);
                    // #####################################################################
                    if (error.response) {
                        console.error(`[SpamShare] Facebook Share Error Status: ${error.response.status}`);
                        console.error(`[SpamShare] Facebook Share Error Data:`, JSON.stringify(error.response.data));
                        const fbError = error.response.data?.error;
                        errorMessage += ` Facebook API Error: ${fbError?.message || 'Unknown error'} (Code: ${fbError?.code}, Type: ${fbError?.type}).`; // errorMessage was not defined, fixed

                        if (fbError?.code === 190) {
                            await initialMessage.edit(`Sharing stopped. Facebook OAuthException (Error Code 190): "${fbError.message}". This usually means an issue with the access token. Successfully shared ${successCount} times.`);
                            return;
                        }
                        if (error.response.status === 403 || fbError?.code === 200 || (fbError?.error_subcode === 2018008 && fbError?.code === 803)) {
                             await initialMessage.edit(`Sharing stopped. Facebook returned a Forbidden/Permissions error. Successfully shared ${successCount} times. Details: ${fbError?.message || 'No specific message.'}`);
                             return;
                        }
                         if (error.response.status === 400) {
                             await initialMessage.edit(`Sharing stopped. Facebook returned a Bad Request. Successfully shared ${successCount} times. Error: ${fbError?.message || 'Unknown error'}`);
                             return;
                        }
                    }
                    // errorMessage was not defined here either, fixed
                    let errorMessageForEdit = `Error on share ${i + 1}.`;
                    if (initialMessage.editable) {
                        await initialMessage.edit(`${errorMessageForEdit} Continuing attempts... (${successCount}/${shareCount} successful so far).`).catch(e => console.warn("[SpamShare] Failed to edit message during error reporting:", e.message));
                    }
                }
                if (i < shareCount - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));
                }
            }

            const finalEmbed = new EmbedBuilder()
                .setColor(successCount > 0 ? '#00FF00' : '#FFA500')
                .setTitle('SpamShare Task Completed')
                .setDescription(`Finished attempting to share the post.`)
                .addFields(
                    { name: 'Target Shares', value: shareCount.toString(), inline: true },
                    { name: 'Successful Shares', value: successCount.toString(), inline: true },
                    { name: 'Post Link', value: postLink }
                )
                .setFooter({ text: 'Remember the significant risks associated with using this command.' });
            if (initialMessage.editable) {
                await initialMessage.edit({ content: 'Sharing process finished.', embeds: [finalEmbed] }).catch(e => console.warn("[SpamShare] Failed to edit final message:", e.message));
            } else {
                 message.channel.send({ content: 'Sharing process finished.', embeds: [finalEmbed] });
            }
            console.log(`[SpamShare] Finished for user ${message.author.tag}. Successful shares: ${successCount}/${shareCount}`);

        } catch (error) {
            // #####################################################################
            console.error('[SPAMSHARE_ULTRA_DEBUG] FINAL CATCH BLOCK (outer command execution):', error.message, error.stack);
            // #####################################################################
            if (initialMessage.editable) {
                await initialMessage.edit(`An critical unexpected error occurred: ${error.message}. Please check the bot's console for more details.`).catch(e => console.warn("[SpamShare] Failed to edit message on critical error:", e.message));
            } else {
                message.reply(`An critical unexpected error occurred: ${error.message}. Please check the bot's console for more details.`);
            }
        }
        // #####################################################################
        console.log("[SPAMSHARE_ULTRA_DEBUG] >>>>>>>>>>>>>> spamshare.js execute() function ENDED <<<<<<<<<<<<<<");
        // #####################################################################
    },
};
