const axios = require('axios');
const cheerio = require('cheerio');
const { faker } = require('@faker-js/faker');
const UserAgent = require('user-agents');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { CookieJar } = require('tough-cookie');
const { wrapper: axiosCookieJarSupport } = require('axios-cookiejar-support');

const BASE_FB_MOBILE_URL = 'https://m.facebook.com';
const TEMP_EMAIL_API_URL = 'https://email-api-tv55.onrender.com';
const DEFAULT_TIMEOUT = 45000;
const OTP_POLL_INTERVAL = 3 * 1000; 
const OTP_POLL_DURATION = 1 * 60 * 1000;

const generateUserAgent = () => {
    const userAgent = new UserAgent({ deviceCategory: 'mobile' });
    return userAgent.toString();
};

const fakeName = () => ({
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
});

const fakePassword = (length = 12) => {
    const lower = "abcdefghijklmnopqrstuvwxyz";
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const digits = "0123456789";
    const special = "!@#$%^&*()_+-=[]{}|;:,.<>?";
    let allChars = lower + upper + digits + special;
    let password = "";
    password += lower.charAt(Math.floor(Math.random() * lower.length));
    password += upper.charAt(Math.floor(Math.random() * upper.length));
    password += digits.charAt(Math.floor(Math.random() * digits.length));
    password += special.charAt(Math.floor(Math.random() * special.length));
    for (let i = password.length; i < length; i++) {
        password += allChars.charAt(Math.floor(Math.random() * allChars.length));
    }
    password = password.split('').sort(() => 0.5 - Math.random()).join('');
    return password;
};

const getProfileUrl = (uid) => `https://www.facebook.com/profile.php?id=${uid}`;

const createAxiosSession = (userAgentString, proxyString = null) => {
    const jar = new CookieJar();
    let axiosProxyConfig = null;

    if (proxyString) {
        const parts = proxyString.trim().split(':');
        if (parts.length === 2) {
            axiosProxyConfig = { protocol: 'http', host: parts[0], port: parseInt(parts[1], 10) };
        } else if (parts.length >= 4) {
            let username = parts[2].startsWith('@') ? parts[2].substring(1) : parts[2];
            axiosProxyConfig = { protocol: 'http', host: parts[0], port: parseInt(parts[1], 10), auth: { username: username, password: parts.slice(3).join(':') } };
        }
        if (axiosProxyConfig && (isNaN(axiosProxyConfig.port) || !axiosProxyConfig.host)) {
            axiosProxyConfig = null;
        }
    }

    const baseHeaders = {
        'User-Agent': userAgentString,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
    };

    if (axiosProxyConfig) {
        baseHeaders['Accept-Encoding'] = 'identity';
    } else {
        baseHeaders['Accept-Encoding'] = 'gzip, deflate, br';
    }

    const session = axios.create({
        jar: jar,
        withCredentials: true,
        headers: baseHeaders,
        timeout: DEFAULT_TIMEOUT,
        maxRedirects: 10,
        validateStatus: (status) => status >= 200 && status < 501,
        proxy: axiosProxyConfig,
    });
    axiosCookieJarSupport(session);
    return session;
};

const fetchTemporaryEmail = async (statusMsg) => {
    await statusMsg.edit({ content: '📧 Requesting a temporary email address...' });
    try {
        const response = await axios.get(`${TEMP_EMAIL_API_URL}/gen?provider_name=random`, { timeout: 20000 });
        if (response.data && response.data.email_address && response.data.api_session_id && response.data.provider) {
            await statusMsg.edit({ content: `📬 Temporary email received: \`${response.data.email_address}\` (Provider: ${response.data.provider})` });
            return { 
                email: response.data.email_address, 
                sessionId: response.data.api_session_id,
                providerName: response.data.provider 
            };
        } else {
            throw new Error('Invalid response from temporary email API (missing email, session ID, or provider).');
        }
    } catch (error) {
        throw new Error(`Failed to fetch temporary email: ${error.message}`);
    }
};

const fetchOtpFromTempEmail = async (tempEmailSessionId, statusMsg) => {
    await statusMsg.edit({ content: `⏳ Waiting for Facebook OTP... (Checking email API for up to ${OTP_POLL_DURATION / 60000} minute(s))` });
    const startTime = Date.now();
    const otpPatterns = [
        /\bFB[- ]?(\d{5,8})\b/i,
        /(\d{5,8})\s+is\s+your\s+Facebook\s+(?:confirmation|security|login|access|verification)\s+code/i,
        /Your\s+Facebook\s+(?:confirmation|security|login|access|verification)\s+code\s+is\s+(\d{5,8})/i,
        /Facebook\s+(?:confirmation|security|login|access|verification)\s+code:\s*(\d{5,8})/i,
        /G-(\d{6,8})/i,
        /\b(\d{5,8})\b\s*(?:is\syour|is\sthe|is)\s*Facebook.*?code/i,
        /Facebook.*?(?:code|OTP|token)\s*is\s*\b(\d{5,8})\b/i,
        /Facebook.*?\b(\d{5,8})\b\s*is\s*(?:your|the)\s*.*?code/i,
        /Enter\s+this\s+code\s+to\s+(?:confirm|verify)\s+your\s+account:\s*(\d{5,8})/i,
        /(?:confirmation|verification|security|access|login)\s+code\s*:\s*\b(\d{5,8})\b/i,
        /Your\s+(?:code|OTP)\s+is\s+\b(\d{5,8})\b/i,
        /Facebook[^\w\d]*\b(\d{5,8})\b/i,
        /\b(\d{5,8})\b[^\w\d]*Facebook/i,
        /\b(\d{5,8})\b/i 
    ];

    while (Date.now() - startTime < OTP_POLL_DURATION) {
        try {
            const response = await axios.get(`${TEMP_EMAIL_API_URL}/sessions/${tempEmailSessionId}/messages`, { timeout: 15000 });
            if (response.data && Array.isArray(response.data)) {
                for (const message of response.data) {
                    let emailTextContent = message.body || '';
                    if (!emailTextContent && message.html) {
                        if (Array.isArray(message.html)) {
                            emailTextContent = cheerio.load(message.html.join(' ')).text();
                        } else if (typeof message.html === 'string') {
                            emailTextContent = cheerio.load(message.html).text();
                        }
                    }
                    const emailBody = emailTextContent.trim();

                    if (emailBody) {
                        for (let i = 0; i < otpPatterns.length; i++) {
                            const pattern = otpPatterns[i];
                            const isLastPattern = i === otpPatterns.length - 1;

                            if (isLastPattern && !emailBody.toLowerCase().includes('facebook')) {
                                continue;
                            }

                            const match = emailBody.match(pattern);
                            if (match && match[1] && match[1].length >= 5 && match[1].length <= 8) {
                                await statusMsg.edit({ content: `🔑 OTP \`${match[1]}\` found in email!` });
                                return match[1];
                            }
                        }
                    }
                }
            }
        } catch (error) {
        }
        const timeLeft = Math.max(0, OTP_POLL_DURATION - (Date.now() - startTime));
        await statusMsg.edit({ content: `⏳ Waiting for Facebook OTP... (Checking again in ${OTP_POLL_INTERVAL / 1000}s. Time left: ~${Math.round(timeLeft/1000)}s)` });
        await new Promise(resolve => setTimeout(resolve, OTP_POLL_INTERVAL));
    }
    throw new Error('OTP not received within the time limit.');
};

const extractFormDataV2 = (html, formSelector = 'form[action*="/reg/"], form[id="registration_form"]') => {
    const formData = {};
    const $ = cheerio.load(html);
    let registrationForm = $(formSelector).first();

    if (registrationForm.length === 0) {
        registrationForm = $('form').filter((i, el) => {
            const action = $(el).attr('action');
            return action && (action.includes('/reg/') || action.includes('/r.php') || action.includes('signup'));
        }).first();
    }
    
    if (registrationForm.length) {
        registrationForm.find('input').each((_, el) => {
            const name = $(el).attr('name');
            const value = $(el).attr('value');
            if (name) formData[name] = value || '';
        });
    }

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

    if (!formData.fb_dtsg) formData.fb_dtsg = $('meta[name="fb_dtsg"]').attr('content') || $('input[name="fb_dtsg"]').val();
    if (!formData.jazoest) formData.jazoest = $('meta[name="jazoest"]').attr('content') || $('input[name="jazoest"]').val();
    if (!formData.lsd) formData.lsd = $('input[name="lsd"]').val();

    if (!formData.fb_dtsg) formData.fb_dtsg = 'AQH' + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
    if (!formData.jazoest) { let sum = 0; for (let i = 0; i < formData.fb_dtsg.length; i++) sum += formData.fb_dtsg.charCodeAt(i); formData.jazoest = '2' + sum; }
    if (typeof formData.lsd === 'undefined') formData.lsd = Math.random().toString(36).substring(2, 10);

    const commonFields = ['reg_instance', 'reg_impression_id', 'logger_id', 'submission_id'];
    commonFields.forEach(field => { if (!formData[field]) { const val = $(`input[name="${field}"]`).val(); if (val) formData[field] = val; }});
    if (!formData.reg_impression_id) formData.reg_impression_id = 'MOBILE_SIGNUP';

    return formData;
};

const performInitialNavigation = async (session, statusMsg) => {
    let homeResponse;
    try {
        await statusMsg.edit({ content: '🌍 Navigating to Facebook homepage...' });
        homeResponse = await session.get(BASE_FB_MOBILE_URL + '/', {
            headers: {
                'Referer': 'https://www.google.com/',
                'Sec-Fetch-Site': 'cross-site',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-User': '?1',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));

        if (homeResponse.status >= 400) {
            throw new Error(`Homepage visit failed with status ${homeResponse.status}. Response: ${String(homeResponse.data).substring(0, 200)}`);
        }
        if (String(homeResponse.data).toLowerCase().includes("not available on this browser")) {
            throw new Error("Facebook indicated browser not supported on homepage visit.");
        }
        await statusMsg.edit({ content: '🏠 Homepage visited. Proceeding...' });
    } catch (error) {
        throw error;
    }
    return homeResponse;
};

const fetchRegistrationPageAndData = async (session, statusMsg, initialReferer = BASE_FB_MOBILE_URL + '/') => {
    await statusMsg.edit({ content: '📄 Navigating to a Facebook signup page...' });
    let regPageResponse;
    const regUrls = [
        BASE_FB_MOBILE_URL + '/r.php', 
        BASE_FB_MOBILE_URL + '/reg/', 
        BASE_FB_MOBILE_URL + '/signup/lite/',
        BASE_FB_MOBILE_URL + '/signup/'
    ];
    let responseData = '';
    let responseUrl = '';
    let lastError = null;

    for (const url of regUrls) {
        try {
            await statusMsg.edit({ content: `📄 Trying signup page: ${new URL(url).pathname}...` });
            regPageResponse = await session.get(url, {
                headers: {
                    'Referer': initialReferer,
                    'Sec-Fetch-Site': 'same-origin',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-User': '?1',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            });

            if (regPageResponse && regPageResponse.status === 200 && regPageResponse.data) {
                responseData = String(regPageResponse.data);
                responseUrl = regPageResponse.request.res.responseUrl || url;
                if (responseData.toLowerCase().includes("create new account") || responseData.includes("reg_email__") || responseData.includes("firstname")) {
                    lastError = null;
                    break;
                } else {
                    lastError = new Error(`Content check failed for ${url}. Status: ${regPageResponse.status}. Data: ${responseData.substring(0,100)}`);
                }
            } else if (regPageResponse) {
                lastError = new Error(`Failed to load ${url} with status ${regPageResponse.status}. Data: ${String(regPageResponse.data).substring(0, 200)}`);
            }
        } catch (err) {
            lastError = err;
        }
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1500));
    }

    if (!responseData || !responseUrl) {
        const baseMessage = 'Failed to load any suitable Facebook registration page or extract its URL after trying multiple attempts.';
        if (lastError) {
            throw new Error(`${baseMessage} Last error: ${lastError.message}`);
        }
        throw new Error(baseMessage);
    }
    if (String(responseData).toLowerCase().includes("not available on this browser")) {
        throw new Error("Facebook indicated browser not supported on registration page visit.");
    }

    await statusMsg.edit({ content: '🔍 Extracting registration form details...' });
    let formData = extractFormDataV2(responseData);
    if (!formData.fb_dtsg) formData.fb_dtsg = 'AQH' + Math.random().toString(36).substring(2,15) + ':' + Math.random().toString(36).substring(2,15);
    if (!formData.jazoest) { const ascii = Array.from(formData.fb_dtsg).map(c => c.charCodeAt(0)); formData.jazoest = '2' + ascii.reduce((a, b) => a + b, 0); }
    if (typeof formData.lsd === 'undefined' || !formData.lsd) formData.lsd = Math.random().toString(36).substring(2,12);

    await statusMsg.edit({ content: '✨ Form data acquired. Preparing submission...' });
    return { formData, responseDataHtml: responseData, responseUrl };
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
    payload.append('submit', formData.submit || 'Sign Up');
    payload.append('ns', formData.ns || '0');

    const $formPage = cheerio.load(pageHtml);
    let formElement = $formPage('form[action*="/reg/"], form[id="registration_form"]').first();
    if (formElement.length === 0) {
        formElement = $formPage('form').filter((i, el) => {
            const action = $(el).attr('action');
            return action && (action.includes('/reg/') || action.includes('/r.php') || action.includes('signup'));
        }).first();
    }

    formElement.find('input[type="hidden"]').each((_, el) => {
        const inputName = $formPage(el).attr('name');
        const inputValue = $formPage(el).attr('value');
        if (inputName && inputValue && !payload.has(inputName)) {
            payload.append(inputName, inputValue);
        }
    });
    
    Object.entries(formData).forEach(([key, value]) => {
        if (value && typeof value === 'string' && !payload.has(key)) {
            payload.append(key, value);
        }
    });

    if (formData.fb_dtsg) payload.set('fb_dtsg', formData.fb_dtsg);
    if (formData.jazoest) payload.set('jazoest', formData.jazoest);
    if (formData.lsd) payload.set('lsd', formData.lsd);

    if (!payload.has('encpass') && password) {
        const timestamp = Math.floor(Date.now() / 1000);
        payload.append('encpass', `#PWD_BROWSER:0:${timestamp}:${password}`);
    }
    if (!payload.has('reg_instance')) payload.append('reg_instance', Math.random().toString(36).substring(2,12));
    if (!payload.has('reg_impression_id')) payload.append('reg_impression_id', formData.reg_impression_id || 'MOBILE_SIGNUP_INITIAL');

    return payload;
};

const attemptRegistrationSubmission = async (session, payload, refererUrl, statusMsg, proxyInUse) => {
    const submitEndpoints = [
        BASE_FB_MOBILE_URL + '/reg/submit/',
        BASE_FB_MOBILE_URL + '/signup/account/actor/'
    ];
    let submitResponse = null;
    let responseText = '';
    let success = false;
    let checkpoint = false;
    let finalUrl = refererUrl;
    let lastError = null;

    for (const endpoint of submitEndpoints) {
        try {
            await statusMsg.edit({ content: `📨 Submitting registration to: ${new URL(endpoint).pathname}...` });
            await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 4000));

            submitResponse = await session.post(endpoint, payload.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': refererUrl,
                    'Origin': BASE_FB_MOBILE_URL,
                    'Sec-Fetch-Site': 'same-origin',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                timeout: 60000 
            });

            responseText = (typeof submitResponse.data === 'string') ? submitResponse.data : JSON.stringify(submitResponse.data);
            finalUrl = submitResponse.request?.res?.responseUrl || endpoint;
            const currentCookies = await session.defaults.jar.getCookieString(finalUrl);

            if (currentCookies.includes('c_user=') && !currentCookies.includes('c_user=0')) success = true;
            if (responseText.toLowerCase().includes('checkpoint') ||
                responseText.includes('confirmation_code') ||
                responseText.includes('confirmemail.php') ||
                responseText.includes('verify your account') ||
                responseText.includes('code sent') ||
                currentCookies.includes('checkpoint=')) {
                checkpoint = true;
                success = true; 
            }
            if (responseText.includes('Welcome to Facebook') || responseText.includes('profile.php') || responseText.includes('home.php')) success = true;
            if (submitResponse.status === 302 && submitResponse.headers.location && (submitResponse.headers.location.includes('home.php') || submitResponse.headers.location.includes('profile.php'))) success = true;

            if (submitResponse.status >= 400 && !checkpoint) {
                success = false;
                lastError = new Error(`Submission to ${endpoint} failed with status ${submitResponse.status}. Data: ${responseText.substring(0,100)}`);
            } else {
                lastError = null;
            }
            
            if (success) break;

        } catch (error) {
            responseText = error.message;
            lastError = error;
            if (error.response && error.response.data) {
                responseText += ' | Response: ' + (typeof error.response.data === 'string' ? error.response.data.substring(0, 200) : JSON.stringify(error.response.data));
            }
            const proxyRelatedMessages = ['ECONNRESET', 'ETIMEDOUT', 'Decompression failed', 'Parse Error', 'socket hang up', 'HPE_INVALID_CONSTANT', 'ERR_BAD_RESPONSE'];
            if (proxyInUse && proxyRelatedMessages.some(msg => (error.code && String(error.code).includes(msg)) || (String(error.message).includes(msg)) )) {
                await statusMsg.edit({ content: `⚠️ Connection/Proxy issue with ${new URL(endpoint).pathname} (${error.message.substring(0,50)}). Trying next if available.` });
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }
    if (!success && lastError) responseText = `Attempted all submission endpoints. Last error: ${lastError.message.substring(0,200)}`;

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
                const xsParts = xsDecoded.split('%3A');
                if (xsParts.length > 1 && /^\d{10,}$/.test(xsParts[0]) && xsParts[0] !== '0') {
                    uid = xsParts[0];
                }
            } catch (e) { }
        }
    }

    if (uid === "Not available" && responseText) {
        const uidPatterns = [
            /"USER_ID":"(\d+)"/, /"actorID":"(\d+)"/, /"userID":(\d+)/, /"uid":(\d+),/,
            /profile_id=(\d+)/, /subject_id=(\d+)/, /viewer_id=(\d+)/,
            /\\"uid\\":(\d+)/, /\\"user_id\\":\\"(\d+)\\"/, /\\"account_id\\":\\"(\d+)\\"/,
            /name="target" value="(\d+)"/, /name="id" value="(\d+)"/,
            /<input type="hidden" name="id" value="(\d+)"/,
            /["LWI","setUID","(\d+)"]/,
            /"profile_id":(\d+)/
        ];
        for (const pattern of uidPatterns) {
            const match = responseText.match(pattern);
            if (match && match[1] && /^\d+$/.test(match[1]) && match[1] !== '0') {
                uid = match[1];
                break;
            }
        }
    }
     if (uid === "Not available" && finalUrl && finalUrl.includes("profile.php?id=")) {
        const urlUidMatch = finalUrl.match(/profile\.php\?id=(\d+)/);
        if (urlUidMatch && urlUidMatch[1]) uid = urlUidMatch[1];
    }

    if (uid !== "Not available" && /^\d+$/.test(uid) && uid !== '0') {
        profileUrl = getProfileUrl(uid);
    }
    return { uid, profileUrl };
};

const sendCredentialsMessage = async (message, email, password, uid, profileUrl, accountName, tempEmailProviderName, outcome, proxyUsed) => {
    const embed = new EmbedBuilder()
        .setTitle(outcome.title)
        .setColor(outcome.color)
        .addFields(
            { name: '👤 Name', value: `\`${accountName.firstName} ${accountName.lastName}\``, inline: true },
            { name: '📧 Email', value: `\`${email}\``, inline: true },
            { name: '🔑 Password', value: `\`${password}\``, inline: true },
            { name: '📨 Temp Email Provider', value: `\`${tempEmailProviderName || 'Unknown'}\``, inline: true }
        )
        .setFooter({ text: `Facebook Account Creation (v3) | ${new Date().toLocaleString()}${proxyUsed ? ' | Proxy: ' + proxyUsed : ''}` });

    if (uid && uid !== "Not available" && uid !== "0") {
        embed.addFields({ name: '🆔 User ID', value: `\`${uid}\``, inline: true });
    } else if (outcome.type === "checkpoint_otp_fetched" || outcome.type === "checkpoint_manual_needed") {
        embed.addFields({ name: '🆔 User ID', value: `📬 Manual confirmation likely needed.`, inline: true });
    } else {
        embed.addFields({ name: '🆔 User ID', value: `\`${uid || 'N/A'}\``, inline: true });
    }

    if (profileUrl && profileUrl.startsWith("https://") && profileUrl !== "Profile URL not found or confirmation pending.") {
        embed.addFields({ name: '🔗 Profile', value: `[View Profile](${profileUrl})`, inline: true });
    } else if (uid && uid !== "Not available" && uid !== "0") {
        embed.addFields({ name: '🔗 Profile', value: `[Potential Profile Link](${getProfileUrl(uid)}) (Verify)`, inline: true });
    }
    
    embed.setDescription(outcome.message);

    const components = [];
    if (profileUrl && profileUrl.startsWith("https://") && profileUrl !== "Profile URL not found or confirmation pending.") {
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setLabel('View Profile').setStyle(ButtonStyle.Link).setURL(profileUrl).setEmoji('👤')
            );
        components.push(row);
    }

    try {
        await message.reply({ embeds: [embed], components: components });
    } catch (replyError) {
        try {
            await message.channel.send({ embeds: [embed], components: components });
        } catch (channelSendError) {
        }
    }
};

module.exports = {
    name: 'fbcreatev3',
    description: 'Creates a Facebook account (v3) using a temporary email, with proxy support. Displays OTP if checkpointed.',
    admin_only: true,
    async execute(message, args) {
        let proxyString = args.length > 0 ? args[0] : null;
        const genPassword = fakePassword();
        const genName = fakeName();
        let statusMsg;
        let tempEmailData = null;
        let sessionForProxyCheck;
        let tempEmailProvider = 'N/A';

        try {
            statusMsg = await message.reply({ content: `⏳ Initializing Facebook account creation (v3)${proxyString ? ' with proxy: `' + proxyString + '`' : ''}...` });

            tempEmailData = await fetchTemporaryEmail(statusMsg);
            const emailToUse = tempEmailData.email;
            tempEmailProvider = tempEmailData.providerName; 

            const userAgentString = generateUserAgent();
            const session = createAxiosSession(userAgentString, proxyString);
            sessionForProxyCheck = session;

            if (proxyString) {
                if (session.defaults.proxy) {
                    await statusMsg.edit({content: `🔧 Proxy configured: \`${proxyString}\`. User-Agent: \`${userAgentString.substring(0,70)}...\`\n📧 Using temp email: \`${emailToUse}\` (Provider: ${tempEmailProvider})`});
                } else {
                    await statusMsg.edit({ content: `⚠️ Proxy string "${proxyString}" was invalid or could not be parsed. Proceeding without proxy.\n📧 Using temp email: \`${emailToUse}\` (Provider: ${tempEmailProvider})`});
                    proxyString = null;
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            } else {
                await statusMsg.edit({content: `🚀 Proceeding without proxy. User-Agent: \`${userAgentString.substring(0,70)}...\`\n📧 Using temp email: \`${emailToUse}\` (Provider: ${tempEmailProvider})`});
            }

            const initialNavResponse = await performInitialNavigation(session, statusMsg);
            const initialReferer = initialNavResponse?.request?.res?.responseUrl || BASE_FB_MOBILE_URL + '/';

            const { formData, responseDataHtml, responseUrl } = await fetchRegistrationPageAndData(session, statusMsg, initialReferer);
            if (!formData || !formData.fb_dtsg || !formData.jazoest) {
                throw new Error('Failed to extract critical form data (fb_dtsg, jazoest) even after fallbacks.');
            }

            const randomDay = Math.floor(Math.random() * 28) + 1;
            const randomMonth = Math.floor(Math.random() * 12) + 1;
            const currentYear = new Date().getFullYear();
            const randomYear = currentYear - (Math.floor(Math.random() * (35 - 18 + 1)) + 18);
            const gender = Math.random() > 0.5 ? '1' : '2';

            const payload = prepareSubmissionPayload(
                formData, emailToUse, genPassword, genName,
                { day: randomDay, month: randomMonth, year: randomYear },
                gender, responseDataHtml
            );

            let submissionResult = await attemptRegistrationSubmission(session, payload, responseUrl, statusMsg, !!(proxyString && session.defaults.proxy));
            let { uid, profileUrl } = await extractUidAndProfile(session.defaults.jar, submissionResult.responseText, submissionResult.finalUrl);
            let outcome;

            if (submissionResult.success && !submissionResult.checkpoint) {
                outcome = { type: "success", title: "✅ Account Created Successfully!", color: 0x00FF00, message: `Your new Facebook account is ready!\nCheck \`${emailToUse}\` for any welcome messages. UID: \`${uid}\`. Enjoy!` };
            } else if (submissionResult.checkpoint) {
                await statusMsg.edit({ content: `📬 Account requires email confirmation. Attempting to fetch OTP for \`${emailToUse}\` (Provider: ${tempEmailProvider})...` });
                try {
                    const otp = await fetchOtpFromTempEmail(tempEmailData.sessionId, statusMsg);
                    outcome = { 
                        type: "checkpoint_otp_fetched", 
                        title: "📬 Account Needs Manual Confirmation (OTP Fetched)!", 
                        color: 0x00BFFF,
                        message: `Account created, but it requires manual confirmation. UID (possibly): \`${uid}\`.\n**OTP Code: \`${otp}\`**\nPlease use this code to confirm your account on Facebook using email \`${emailToUse}\`.` 
                    };
                } catch (otpError) {
                    outcome = { 
                        type: "checkpoint_manual_needed", 
                        title: "📬 Account Needs Manual Confirmation (OTP Fetch Failed)!", 
                        color: 0xFFA500,
                        message: `Account created but requires manual confirmation. ${uid !== "Not available" && uid !== '0' ? `UID (possibly): \`${uid}\`. ` : ''}Failed to automatically fetch OTP for \`${emailToUse}\`: ${otpError.message.substring(0,100)}.\nPlease check email \`${emailToUse}\` manually for the code.` 
                    };
                }
            } else { 
                let errorDetail = "Facebook rejected the registration or an unknown error occurred.";
                if (submissionResult.responseText) {
                    const $$ = cheerio.load(submissionResult.responseText);
                    errorDetail = $$('#reg_error_inner').text().trim() ||
                                  $$('div[role="alert"]').text().trim() ||
                                  $$('._585n').text().trim() ||
                                  $$('._585r').text().trim() ||
                                  (submissionResult.responseText.length < 250 ? submissionResult.responseText : submissionResult.responseText.substring(0, 250) + "...");
                    if (!errorDetail || errorDetail.length < 10) errorDetail = "Facebook's response did not contain a clear error message.";
                }
                outcome = { type: "failure", title: "❌ Account Creation Failed!", color: 0xFF0000, message: `**Reason:** ${errorDetail}` };
            }

            await sendCredentialsMessage(message, emailToUse, genPassword, uid, profileUrl, genName, tempEmailProvider, outcome, proxyString && sessionForProxyCheck && sessionForProxyCheck.defaults.proxy ? proxyString : null);
            if (statusMsg && statusMsg.deletable) await statusMsg.delete().catch(e => { });

        } catch (error) {
            let errorMessage = error.message || "An unexpected critical error occurred.";
            const effectiveProxyInUse = proxyString && sessionForProxyCheck && sessionForProxyCheck.defaults.proxy;
            const proxyRelatedMessages = ['ECONNRESET', 'ETIMEDOUT', 'Decompression failed', 'Parse Error', 'socket hang up', 'HPE_INVALID_CONSTANT', 'ERR_BAD_RESPONSE', 'ENOTFOUND', 'EAI_AGAIN', 'Proxy Authentication Required'];
            const isProxyRelatedNetworkError = effectiveProxyInUse && proxyRelatedMessages.some(msg => (error.code && String(error.code).toLowerCase().includes(msg.toLowerCase())) || (String(error.message).toLowerCase().includes(msg.toLowerCase())) );

            if (isProxyRelatedNetworkError) {
                let specificErrorType = "general connection/proxy processing error";
                if (String(error.message).toLowerCase().includes('hpe_invalid_constant') || String(error.message).toLowerCase().includes('parse error')) specificErrorType = "HTTP parsing error (malformed response from proxy)";
                else if (String(error.message).toLowerCase().includes('err_bad_response') || (error.response && error.response.status === 500 && error.config?.url?.includes(sessionForProxyCheck.defaults.proxy.host))) specificErrorType = "bad response from proxy (e.g., HTTP 500)";
                else if (String(error.code).toLowerCase().includes('enotfound') || String(error.code).toLowerCase().includes('eai_again')) specificErrorType = "DNS resolution error for proxy host";
                else if (error.response && error.response.status === 407) specificErrorType = "Proxy Authentication Required (check user/pass)";
                errorMessage = `A ${specificErrorType} (\`${error.code || 'N/A'}\`) occurred with proxy \`${proxyString}\`: ${error.message}\n\n` + `⚠️ **This strongly indicates an issue with the proxy itself or its connection.**\n` + `  - The proxy server might be offline, unstable, misconfigured, or its hostname unresolvable.\n` + `  - If authentication is used, ensure credentials are correct.\n`+ `  - **Recommendation:** Verify the proxy details and try a different, high-quality proxy.`;
            } else if (error.message && (error.message.toLowerCase().includes("not available on this browser") || error.message.toLowerCase().includes("browser not supported"))) {
                errorMessage = `Facebook indicated the browser/environment is not supported: "${error.message}"\n\nThis can be due to the User-Agent or the IP (via proxy or direct) being flagged. Try a different User-Agent or proxy.`;
            } else if (error.message && error.message.includes('Failed to load any suitable Facebook registration page')) {
                errorMessage = `Critical: ${error.message}\nThis usually happens if all attempts to reach Facebook's registration pages failed. If using a proxy, it's a likely cause. If not, your server IP might be blocked by Facebook, or there's a network problem.`;
            } else if (error.response && error.response.status === 404) {
                 errorMessage = `Received HTTP 404 (Not Found) for URL: ${error.config?.url || error.request?.path || 'Unknown URL' }. This means Facebook reports the page doesn't exist.`;
            } else if (error.message && error.message.startsWith('Failed to fetch temporary email:')) {
                errorMessage = `Critical: ${error.message}\nCould not obtain a temporary email. Check the temporary email API status.`;
            } else if (error.message && error.message.startsWith('OTP not received')) {
                errorMessage = `OTP Fetch Error: ${error.message}\nManual intervention will be required for this account.`;
            } else if (error.response) {
                errorMessage += ` | Status: ${error.response.status}`;
                if (error.response.data) errorMessage += ` | Data: ${String(error.response.data).substring(0,150).replace(/\n/g, ' ')}`;
            }
            
            const criticalFailureOutcome = { type: "critical_failure", title: "💥 Critical Error During Creation!", color: 0xFF0000, message: `${errorMessage}` };
            await sendCredentialsMessage(message, tempEmailData ? tempEmailData.email : "N/A (Email fetch failed)", genPassword, "N/A", "N/A", genName, tempEmailProvider, criticalFailureOutcome, effectiveProxyInUse ? proxyString : null);
            if (statusMsg && statusMsg.deletable) await statusMsg.delete().catch(e => { });
        }
    }
};