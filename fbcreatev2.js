const axios = require('axios');
const cheerio = require('cheerio');
const { faker } = require('@faker-js/faker');
const UserAgent = require('user-agents');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { CookieJar } = require('tough-cookie');
const { wrapper: axiosCookieJarSupport } = require('axios-cookiejar-support');

const BASE_FB_MOBILE_URL = 'https://m.facebook.com';
const DEFAULT_TIMEOUT = 45000;

const generateUserAgent = () => {
    const userAgent = new UserAgent({ deviceCategory: 'mobile' });
    return userAgent.toString();
};

const fakeName = () => ({
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
});

const fakePassword = (length = 12) => {
    const prefix = "FbAcc";
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let password = prefix;
    for (let i = 0; i < length - prefix.length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    const randomNumber = Math.floor(Math.random() * 9000) + 1000;
    return `${password}${randomNumber}!`;
};

const getProfileUrl = (uid) => `https://www.facebook.com/profile.php?id=${uid}`;

const createAxiosSession = (userAgentString, proxyString = null) => {
    const jar = new CookieJar();
    let proxyConfig = null;

    if (proxyString) {
        const parts = proxyString.split(':');
        if (parts.length === 2) {
            proxyConfig = {
                protocol: 'http',
                host: parts[0],
                port: parseInt(parts[1], 10),
            };
        } else if (parts.length >= 4 && parts[2].startsWith('@')) {
            const host = parts[0];
            const port = parseInt(parts[1], 10);
            const username = parts[2].substring(1);
            const password = parts.slice(3).join(':');
            if (host && !isNaN(port) && username) {
                 proxyConfig = {
                    protocol: 'http',
                    host: host,
                    port: port,
                    auth: {
                        username: username,
                        password: password,
                    },
                };
            } else {
                 console.warn(`Invalid proxy format for auth: ${proxyString}. Using no proxy.`);
            }
        } else if (parts.length === 4) {
             proxyConfig = {
                protocol: 'http',
                host: parts[0],
                port: parseInt(parts[1], 10),
                auth: {
                    username: parts[2],
                    password: parts[3],
                },
            };
        }
        else {
            console.warn(`Invalid proxy format: ${proxyString}. Expected ip:port or ip:port:@user:pass. Using no proxy.`);
        }
    }

    const session = axios.create({
        jar: jar,
        withCredentials: true,
        headers: {
            'User-Agent': userAgentString,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
        },
        timeout: DEFAULT_TIMEOUT,
        maxRedirects: 10,
        validateStatus: (status) => status >= 200 && status < 500,
        proxy: proxyConfig,
    });
    axiosCookieJarSupport(session);
    return session;
};

const extractFormDataV2 = (html, formSelector = 'form[action*="/reg/"], form[id="registration_form"]') => {
    const formData = {};
    const $ = cheerio.load(html);

    let registrationForm = $(formSelector).first();
    if (registrationForm.length) {
        registrationForm.find('input').each((_, el) => {
            const name = $(el).attr('name');
            const value = $(el).attr('value');
            if (name) {
                formData[name] = value || '';
            }
        });
    }

    const extractByRegex = (fieldName, sourceHtml) => {
        const patterns = [
            new RegExp(`name="${fieldName}" value="([^"]+)"`),
            new RegExp(`name="${fieldName}" content="([^"]+)"`),
            new RegExp(`name="${fieldName}"\\s+value="([^"]+)"`),
            new RegExp(`"${fieldName}":"([^"]+)"`),
            new RegExp(`${fieldName}:"([^"]+)"`)
        ];
        for (const pattern of patterns) {
            const match = sourceHtml.match(pattern);
            if (match && match[1]) return match[1];
        }
        return null;
    };

    $('script').each((_, scriptTag) => {
        const scriptContent = $(scriptTag).html();
        if (!scriptContent) return;

        try {
            const jsonMatches = scriptContent.match(/\{(?:[^{}]|(?:\{[^{}]*\}))*\}/g) || [];
            for (const match of jsonMatches) {
                try {
                    const jsonObj = JSON.parse(match);
                    if (jsonObj.fb_dtsg && !formData.fb_dtsg) formData.fb_dtsg = jsonObj.fb_dtsg;
                    if (jsonObj.jazoest && !formData.jazoest) formData.jazoest = jsonObj.jazoest;
                    if (jsonObj.lsd && !formData.lsd) formData.lsd = jsonObj.lsd;
                } catch (e) { }
            }
        } catch(e) { }

        if (!formData.fb_dtsg) formData.fb_dtsg = (scriptContent.match(/['"]fb_dtsg['"]\s*:\s*['"]([^'"]+)['"]/) || [])[1];
        if (!formData.jazoest) formData.jazoest = (scriptContent.match(/['"]jazoest['"]\s*:\s*['"]([^'"]+)['"]/) || [])[1];
        if (!formData.lsd) formData.lsd = (scriptContent.match(/['"]lsd['"]\s*:\s*['"]([^'"]+)['"]/) || [])[1];
    });

    if (!formData.fb_dtsg) formData.fb_dtsg = $('meta[name="fb_dtsg"]').attr('content');
    if (!formData.jazoest) formData.jazoest = $('meta[name="jazoest"]').attr('content');

    if (!formData.fb_dtsg) {
        formData.fb_dtsg = 'AQH' + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
    }
    if (!formData.jazoest) {
        let sum = 0;
        for (let i = 0; i < formData.fb_dtsg.length; i++) sum += formData.fb_dtsg.charCodeAt(i);
        formData.jazoest = '2' + sum;
    }
    if (typeof formData.lsd === 'undefined') {
        formData.lsd = '';
    }
    
    const commonFields = ['reg_instance', 'reg_impression_id', 'logger_id'];
    commonFields.forEach(field => {
        if (!formData[field]) {
            const extractedValue = extractByRegex(field, html);
            if (extractedValue) formData[field] = extractedValue;
        }
    });

    return formData;
};

const performInitialNavigation = async (session, statusMsg) => {
    try {
        await statusMsg.edit({ content: '🌍 Connecting to Facebook...' });
        await session.get(BASE_FB_MOBILE_URL + '/');
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1500));

        const consentUrl = BASE_FB_MOBILE_URL + '/cookie/consent_prompt/?next_uri=' + encodeURIComponent(BASE_FB_MOBILE_URL + '/');
        await session.get(consentUrl, { headers: { 'Referer': BASE_FB_MOBILE_URL + '/' } });
        await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1000));
        await statusMsg.edit({ content: '🍪 Cookie consent page visited (if applicable).' });
    } catch (error) {
        console.warn('Initial navigation/consent error (might be okay):', error.message);
    }
};

const fetchRegistrationPageAndData = async (session, statusMsg) => {
    await statusMsg.edit({ content: '📄 Navigating to the Facebook signup page...' });
    let regPageResponse;
    const regUrls = [BASE_FB_MOBILE_URL + '/reg/', BASE_FB_MOBILE_URL + '/r.php'];

    for (const url of regUrls) {
        try {
            regPageResponse = await session.get(url, { headers: { 'Referer': BASE_FB_MOBILE_URL + '/' } });
            if (regPageResponse && regPageResponse.status === 200 && regPageResponse.data) {
                break;
            }
        } catch (err) {
            console.warn(`Failed to load ${url}: ${err.message}`);
        }
    }

    if (!regPageResponse || regPageResponse.status >= 400 || !regPageResponse.data) {
        throw new Error('Failed to load any Facebook registration page.');
    }
    
    const responseData = regPageResponse.data;
    const responseUrl = regPageResponse.request.res.responseUrl || regUrls[0];

    await statusMsg.edit({ content: '🔍 Extracting registration form details...' });
    let formData = extractFormDataV2(responseData);

    if (!formData.fb_dtsg || !formData.jazoest || Object.keys(formData).length < 3) {
        await statusMsg.edit({ content: '🤔 Initial form data seems sparse. Trying alternative signup page...' });
        try {
            const altRegResponse = await session.get(BASE_FB_MOBILE_URL + '/signup/lite/', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 12; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/423.0.0.21.64]',
                    'Referer': responseUrl
                }
            });
            if (altRegResponse && altRegResponse.data) {
                const altFormula = extractFormDataV2(altRegResponse.data);
                if (altFormula && altFormula.fb_dtsg && altFormula.jazoest) {
                    formData = { ...formData, ...altFormula };
                }
            }
        } catch (altErr) {
            console.warn("Error fetching/processing alt signup page:", altErr.message);
        }
    }
    
    if (!formData.fb_dtsg) formData.fb_dtsg = 'AQH' + Math.random().toString(36).substring(2,15) + ':' + Math.random().toString(36).substring(2,15);
    if (!formData.jazoest) {
        const ascii = Array.from(formData.fb_dtsg).map(c => c.charCodeAt(0));
        formData.jazoest = '2' + ascii.reduce((a, b) => a + b, 0);
    }
    if (typeof formData.lsd === 'undefined') formData.lsd = '';

    await statusMsg.edit({ content: '✨ Form data acquired. Preparing submission...' });
    return { formData, responseData, responseUrl };
};

const prepareSubmissionPayload = (formData, email, password, nameInfo, dob, gender, pageHtml) => {
    const payload = new URLSearchParams();
    payload.append('firstname', nameInfo.firstName);
    payload.append('lastname', nameInfo.lastName);
    payload.append('reg_email__', email);
    payload.append('reg_passwd__', password);
    payload.append('birthday_day', dob.day.toString());
    payload.append('birthday_month', dob.month.toString());
    payload.append('birthday_year', dob.year.toString());
    payload.append('sex', gender);
    payload.append('websubmit', '1');
    payload.append('submit', 'Sign Up');
    payload.append('ns', '0');

    Object.entries(formData).forEach(([key, value]) => {
        if (value && !payload.has(key)) {
            payload.append(key, value);
        }
    });
    
    if (formData.fb_dtsg) payload.set('fb_dtsg', formData.fb_dtsg);
    if (formData.jazoest) payload.set('jazoest', formData.jazoest);
    if (formData.lsd !== undefined) payload.set('lsd', formData.lsd);

    const $formPage = cheerio.load(pageHtml);
    $formPage('form[action*="/reg/"] input[type="hidden"], form[id="registration_form"] input[type="hidden"]').each((_, el) => {
        const inputName = $formPage(el).attr('name');
        const inputValue = $formPage(el).attr('value');
        if (inputName && inputValue && !payload.has(inputName)) {
            payload.append(inputName, inputValue);
        }
    });

    if (!payload.has('encpass')) {
        const timestamp = Math.floor(Date.now() / 1000);
        payload.append('encpass', `#PWD_BROWSER:0:${timestamp}:${password}`);
    }
    
    return payload;
};

const attemptRegistrationSubmission = async (session, payload, refererUrl, statusMsg) => {
    const submitEndpoints = [
        BASE_FB_MOBILE_URL + '/reg/submit/',
        BASE_FB_MOBILE_URL + '/ajax/register.php',
        BASE_FB_MOBILE_URL + '/signup/account/actor/',
    ];

    let submitResponse = null;
    let responseText = '';
    let success = false;
    let checkpoint = false;
    let finalUrl = '';

    const baseHeaders = session.defaults.headers;

    for (const endpoint of submitEndpoints) {
        try {
            await statusMsg.edit({ content: `📨 Attempting submission to: ${new URL(endpoint).pathname}...` });
            await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));

            submitResponse = await session.post(endpoint, payload.toString(), {
                headers: {
                    ...baseHeaders.common,
                    ...baseHeaders.post,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': refererUrl,
                    'Origin': BASE_FB_MOBILE_URL,
                    'Sec-Fetch-Site': 'same-origin',
                },
                timeout: 60000
            });

            responseText = (typeof submitResponse.data === 'string') ? submitResponse.data : JSON.stringify(submitResponse.data);
            finalUrl = submitResponse.request?.res?.responseUrl || endpoint;

            const currentCookies = await session.defaults.jar.getCookieString(finalUrl);
            if (currentCookies.includes('c_user=') && !currentCookies.includes('c_user=0')) {
                success = true;
            }
            if (responseText.toLowerCase().includes('checkpoint') ||
                responseText.includes('confirmation_code') ||
                responseText.includes('verify your email') ||
                responseText.includes('code sent') ||
                currentCookies.includes('checkpoint=')) {
                checkpoint = true;
                success = true;
            }
            if (responseText.includes('Welcome to Facebook') || responseText.includes('profile.php') || responseText.includes('home.php')) {
                success = true;
            }

            if (submitResponse.status >= 400 && !checkpoint) {
                 success = false;
            }

            if (success) break;

        } catch (error) {
            console.error(`Error submitting to ${endpoint}:`, error.message);
            responseText = error.message;
            if (error.response && error.response.data) {
                responseText += ' | Response: ' + (typeof error.response.data === 'string' ? error.response.data.substring(0, 200) : JSON.stringify(error.response.data));
            }
            if (error.code === 'ECONNRESET' || error.message.includes('ECONNRESET') || error.code === 'ETIMEDOUT' || error.message.includes('ETIMEDOUT')) {
                await statusMsg.edit({ content: `⚠️ Connection issue with ${new URL(endpoint).pathname}. This might indicate a checkpoint. Assuming checkpoint for now.` });
                await new Promise(resolve => setTimeout(resolve, 2000));
                checkpoint = true; success = true;
                break;
            }
        }
    }
    return { response: submitResponse, responseText, success, checkpoint, finalUrl };
};

const extractUidAndProfile = async (cookieJar, responseText, finalUrl) => {
    let uid = "Not available";
    let profileUrl = "Profile URL not found or confirmation pending.";

    const cookieString = await cookieJar.getCookieString(finalUrl || BASE_FB_MOBILE_URL);

    const cUserMatch = cookieString.match(/c_user=(\d+)/);
    if (cUserMatch && cUserMatch[1] && cUserMatch[1] !== '0') {
        uid = cUserMatch[1];
    } else {
        const xsMatch = cookieString.match(/xs=([^;]+)/);
        if (xsMatch && xsMatch[1]) {
            try {
                const xsDecoded = decodeURIComponent(xsMatch[1]);
                const xsParts = xsDecoded.split(':');
                if (xsParts.length > 1 && /^\d{10,}$/.test(xsParts[0]) && xsParts[0] !== '0') {
                    uid = xsParts[0];
                }
            } catch (e) { console.warn("Error decoding xs cookie:", e); }
        }
    }
    
    if (uid === "Not available" && responseText) {
        const uidPatterns = [
            /"USER_ID":"(\d+)"/, /"actorID":"(\d+)"/, /"userID":(\d+)/,
            /profile_id=(\d+)/, /subject_id=(\d+)/, /viewer_id=(\d+)/,
            /\\"uid\\":(\d+)/, /\\"user_id\\":\\"(\d+)\\"/,
            /name="target" value="(\d+)"/, /["LWI","setUID","(\d+)"]/
        ];
        for (const pattern of uidPatterns) {
            const match = responseText.match(pattern);
            if (match && match[1] && /^\d+$/.test(match[1]) && match[1] !== '0') {
                uid = match[1];
                break;
            }
        }
    }

    if (uid !== "Not available" && /^\d+$/.test(uid) && uid !== '0') {
        profileUrl = getProfileUrl(uid);
    }

    return { uid, profileUrl };
};

const sendCredentialsMessage = async (message, email, password, uid, profileUrl, accountName, outcome) => {
    const embed = new EmbedBuilder()
        .setTitle(outcome.title)
        .setColor(outcome.color)
        .addFields(
            { name: '👤 Name', value: `\`${accountName.firstName} ${accountName.lastName}\``, inline: true },
            { name: '📧 Email', value: `\`${email}\``, inline: true },
            { name: '🔑 Password', value: `\`${password}\``, inline: true }
        )
        .setFooter({ text: `Facebook Account Creation | ${new Date().toLocaleString()}` });

    if (uid && uid !== "Not available" && uid !== "0") {
        embed.addFields({ name: '🆔 User ID', value: `\`${uid}\``, inline: true });
    } else if (outcome.type === "checkpoint_manual_otp") {
         embed.addFields({ name: '🆔 User ID', value: `📬 Manual confirmation needed (ID might appear after you confirm).`, inline: true });
    }

    if (profileUrl && profileUrl.startsWith("https://") && profileUrl !== "Profile URL not found or confirmation pending.") {
        embed.addFields({ name: '🔗 Profile', value: `[View Profile](${profileUrl})`, inline: true });
    }
    
    embed.setDescription(outcome.message);

    const components = [];
    if (outcome.type === "success" || outcome.type === "checkpoint_manual_otp") {
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('fb_copy_email').setLabel('Copy Email').setStyle(ButtonStyle.Primary).setEmoji('📧'),
                new ButtonBuilder().setCustomId('fb_copy_password').setLabel('Copy Password').setStyle(ButtonStyle.Primary).setEmoji('🔑')
            );
        components.push(row);
    }

    try {
        await message.reply({ embeds: [embed], components: components });
    } catch (replyError) {
        console.error('Failed to send reply message:', replyError);
        try {
            await message.channel.send({ embeds: [embed], components: components });
        } catch (channelSendError) {
            console.error('Failed to send message to channel as fallback:', channelSendError);
        }
    }
};

module.exports = {
    name: 'fbcreatev2',
    description: 'Creates a Facebook account (v2) with proxy support and sends credentials via message.',
    admin_only: true,
    async execute(message, args) {
        if (args.length < 1) {
            return message.reply({ content: '❌ **Error:** Please provide an email address.\nUsage: `fbcreatev2 your@email.com [proxy_ip:port]` or `fbcreatev2 your@email.com [proxy_ip:port:@user:pass]`' });
        }

        const email = args[0];
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return message.reply({ content: '❌ **Error:** Invalid email address format.' });
        }

        let proxyString = null;
        if (args.length > 1) {
            proxyString = args[1];
        }

        const genPassword = fakePassword();
        const genName = fakeName();
        let statusMsg;

        try {
            statusMsg = await message.reply({ content: `⏳ Initializing Facebook account creation (v2)${proxyString ? ' with proxy' : ''}...` });

            const userAgentString = generateUserAgent();
            const session = createAxiosSession(userAgentString, proxyString);
            if (proxyString && !session.defaults.proxy) {
                 await statusMsg.edit({ content: `⚠️ Proxy string "${proxyString}" was invalid or could not be parsed. Proceeding without proxy.`});
                 await new Promise(resolve => setTimeout(resolve, 3000));
            }


            await performInitialNavigation(session, statusMsg);

            const { formData, responseData, responseUrl } = await fetchRegistrationPageAndData(session, statusMsg);
            
            if (!formData || !formData.fb_dtsg || !formData.jazoest) {
                 throw new Error('Failed to extract critical form data (fb_dtsg, jazoest) even after fallbacks.');
            }

            const randomDay = Math.floor(Math.random() * 28) + 1;
            const randomMonth = Math.floor(Math.random() * 12) + 1;
            const currentYear = new Date().getFullYear();
            const randomYear = currentYear - (Math.floor(Math.random() * (30 - 18 + 1)) + 18);
            const gender = Math.random() > 0.5 ? '1' : '2';

            const payload = prepareSubmissionPayload(
                formData, email, genPassword, genName,
                { day: randomDay, month: randomMonth, year: randomYear },
                gender, responseData
            );

            const submissionResult = await attemptRegistrationSubmission(session, payload, responseUrl, statusMsg);

            const { uid, profileUrl } = await extractUidAndProfile(session.defaults.jar, submissionResult.responseText, submissionResult.finalUrl);

            let outcome;
            if (submissionResult.success && uid !== "Not available" && uid !== '0' && !submissionResult.checkpoint) {
                outcome = {
                    type: "success",
                    title: "✅ Account Created Successfully!",
                    color: 0x00FF00,
                    message: `Your new Facebook account is ready!\nCheck \`${email}\` for any welcome messages. Enjoy!`
                };
            } else if (submissionResult.checkpoint || (submissionResult.success && (uid === "Not available" || uid === '0'))) {
                outcome = {
                    type: "checkpoint_manual_otp",
                    title: "📬 Account Needs Manual Confirmation!",
                    color: 0xFFA500,
                    message: `Account created, but it requires manual confirmation. Please check your email \`${email}\` for a code from Facebook and complete verification on their site.`
                };
            } else {
                let errorDetail = "Facebook rejected the registration or an unknown error occurred.";
                if (submissionResult.responseText) {
                    const $$ = cheerio.load(submissionResult.responseText);
                    errorDetail = $$('#reg_error_inner').text().trim() ||
                                  $$('div[role="alert"]').text().trim() ||
                                  $$('._585n').text().trim() || $$('._585r').text().trim() ||
                                  (submissionResult.responseText.length < 250 ? submissionResult.responseText : submissionResult.responseText.substring(0, 250) + "...");
                    if (!errorDetail || errorDetail.length < 10) errorDetail = "Facebook's response did not contain a clear error message. Check server logs.";
                }
                 outcome = {
                    type: "failure",
                    title: "❌ Account Creation Failed!",
                    color: 0xFF0000,
                    message: `**Reason:** ${errorDetail}`
                };
            }
            
            await sendCredentialsMessage(message, email, genPassword, uid, profileUrl, genName, outcome);
            if (statusMsg) await statusMsg.delete().catch(e => console.error("Failed to delete status msg:", e));

        } catch (error) {
            console.error('FB Account Creation (v2) - Critical Error:', error);
            let errorMessage = error.message || "An unexpected critical error occurred.";
            if (error.stack) console.error(error.stack);
            if (error.response) {
                errorMessage += ` | Status: ${error.response.status}`;
                if (error.response.data) {
                    const responseDataPreview = (typeof error.response.data === 'string' ? error.response.data.substring(0,150) : JSON.stringify(error.response.data)).replace(/\n/g, ' ');
                    errorMessage += ` | Data: ${responseDataPreview}`;
                }
            }
            
            const criticalFailureOutcome = {
                type: "critical_failure",
                title: "💥 Critical Error During Creation!",
                color: 0xFF0000,
                message: `A critical error stopped the process: ${errorMessage}`
            };
            await sendCredentialsMessage(message, email, genPassword, "N/A", "N/A", genName, criticalFailureOutcome);
            if (statusMsg) await statusMsg.delete().catch(e => console.error("Failed to delete status message:", e));
        }
    }
};