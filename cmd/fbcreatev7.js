const axios = require('axios');
const cheerio = require('cheerio');
const { faker } = require('@faker-js/faker');
const UserAgent = require('user-agents');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { CookieJar } = require('tough-cookie');
const { wrapper: axiosCookieJarSupport } = require('axios-cookiejar-support');

const BASE_FB_URL = 'https://m.facebook.com';
const DEFAULT_TIMEOUT = 180000;
const BUTTON_COLLECTOR_TIMEOUT_MS = 10 * 60 * 1000;

let CUSTOM_TOKENS = {
    fb_dtsg: null,
    jazoest: null,
    lsd: null
};

const REALISTIC_MOBILE_UAS = [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_7_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 13; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 14; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1'
];

const ACCEPT_LANGUAGES = [
    'en-US,en;q=0.9',
    'en-GB,en-US;q=0.9,en;q=0.8', 
    'en-US,en;q=0.8,es;q=0.6',
    'en-AU,en-GB;q=0.9,en;q=0.8'
];

const getRandomUA = () => REALISTIC_MOBILE_UAS[Math.floor(Math.random() * REALISTIC_MOBILE_UAS.length)];
const getRandomLang = () => ACCEPT_LANGUAGES[Math.floor(Math.random() * ACCEPT_LANGUAGES.length)];

const humanDelay = async (min = 8000, max = 16000) => {
    const delay = Math.random() * (max - min) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
};

const shortDelay = async (min = 3000, max = 6000) => {
    const delay = Math.random() * (max - min) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
};

const microDelay = async (min = 500, max = 1500) => {
    const delay = Math.random() * (max - min) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
};

const generateName = () => ({
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName()
});

const generatePassword = (length = 18) => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
};

const validateEmail = (email) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email) && email.length > 5 && email.length < 100;
};

const createAdvancedSession = (userAgent, proxy = null) => {
    const jar = new CookieJar();
    let proxyConfig = null;
    
    if (proxy) {
        const parts = proxy.trim().split(':');
        if (parts.length === 2) {
            proxyConfig = { protocol: 'http', host: parts[0], port: parseInt(parts[1], 10) };
        } else if (parts.length >= 4) {
            proxyConfig = {
                protocol: 'http',
                host: parts[0], 
                port: parseInt(parts[1], 10),
                auth: { username: parts[2], password: parts.slice(3).join(':') }
            };
        }
    }

    const acceptLang = getRandomLang();
    const isIOS = userAgent.includes('iPhone');
    
    const realisticHeaders = {
        'User-Agent': userAgent,
        'Accept': isIOS ? 
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' :
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': acceptLang,
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'max-age=0',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1'
    };

    if (!isIOS) {
        realisticHeaders['sec-ch-ua'] = '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"';
        realisticHeaders['sec-ch-ua-mobile'] = '?1';
        realisticHeaders['sec-ch-ua-platform'] = '"Android"';
    }

    const session = axios.create({
        jar: jar,
        withCredentials: true,
        headers: realisticHeaders,
        timeout: DEFAULT_TIMEOUT,
        maxRedirects: 30,
        validateStatus: (status) => status < 500,
        proxy: proxyConfig
    });

    axiosCookieJarSupport(session);
    
    session.interceptors.request.use(config => {
        if (config.url && config.url.includes('facebook.com')) {
            config.headers['Sec-Fetch-Site'] = 'same-origin';
        }
        return config;
    });

    return session;
};

const simulateRealBrowsing = async (session, statusMsg) => {
    try {
        await statusMsg.edit({ content: '🔍 Starting realistic browsing simulation...' });
        await humanDelay(2000, 4000);

        await statusMsg.edit({ content: '🌐 Visiting Google first (like real users)...' });
        
        try {
            await session.get('https://www.google.com/', {
                headers: {
                    'Referer': undefined,
                    'Sec-Fetch-Site': 'none'
                },
                timeout: 30000
            });
            await microDelay();
        } catch (googleError) {
            console.warn('[FB] Google visit failed, continuing...');
        }

        await humanDelay(5000, 9000);

        await statusMsg.edit({ content: '🔍 Searching for Facebook...' });
        
        try {
            await session.get('https://www.google.com/search?q=facebook+login', {
                headers: {
                    'Referer': 'https://www.google.com/',
                    'Sec-Fetch-Site': 'same-origin'
                },
                timeout: 30000
            });
            await shortDelay();
        } catch (searchError) {
            console.warn('[FB] Google search failed, continuing...');
        }

        await humanDelay(6000, 12000);

        await statusMsg.edit({ content: '📱 Accessing Facebook mobile (natural flow)...' });

        const fbUrls = [
            'https://facebook.com/',
            'https://www.facebook.com/',
            'https://m.facebook.com/'
        ];

        let homeResponse = null;
        let lastError = null;

        for (const fbUrl of fbUrls) {
            try {
                const response = await session.get(fbUrl, {
                    headers: {
                        'Referer': 'https://www.google.com/search?q=facebook+login',
                        'Sec-Fetch-Site': 'cross-site',
                        'Sec-Fetch-User': '?1'
                    },
                    timeout: 60000
                });

                if (response.status === 200) {
                    homeResponse = response;
                    console.log(`[FB] Successfully accessed: ${fbUrl}`);
                    break;
                } else {
                    lastError = new Error(`HTTP ${response.status} from ${fbUrl}`);
                }

            } catch (error) {
                lastError = error;
                console.warn(`[FB] Failed to access ${fbUrl}: ${error.message}`);
            }

            await microDelay();
        }

        if (!homeResponse) {
            throw new Error(`All Facebook URLs failed. Last error: ${lastError?.message || 'Unknown'}`);
        }

        await humanDelay(4000, 8000);

        return homeResponse;

    } catch (error) {
        throw new Error(`Browsing simulation failed: ${error.message}`);
    }
};

const findRegistrationForm = async (session, statusMsg, homeReferer) => {
    const regEndpoints = [
        BASE_FB_URL + '/reg/?privacy_mutation_token=',
        BASE_FB_URL + '/r.php',
        BASE_FB_URL + '/mobile/register/',
        BASE_FB_URL + '/signup/',
        BASE_FB_URL + '/reg/',
        'https://www.facebook.com/r.php',
        'https://facebook.com/r.php'
    ];

    let bestResponse = null;
    let bestContent = '';
    let bestUrl = '';

    for (const endpoint of regEndpoints) {
        try {
            await statusMsg.edit({ content: `📝 Checking registration: ${new URL(endpoint).pathname}...` });
            await shortDelay(3000, 6000);

            const response = await session.get(endpoint, {
                headers: {
                    'Referer': homeReferer,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Sec-Fetch-Site': 'same-origin',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-User': '?1'
                },
                timeout: 90000
            });

            if (response.status === 200 && response.data) {
                const content = String(response.data);
                const url = response.request?.res?.responseUrl || endpoint;
                
                const hasRequiredFields = [
                    'firstname', 'lastname', 'reg_email__', 'reg_passwd__'
                ].every(field => content.includes(field));
                
                const hasBirthdayFields = content.includes('birthday_day') || content.includes('birthday_month');
                const hasFormIndicators = content.includes('Sign Up') || content.includes('Create') || content.includes('registration');
                
                if (hasRequiredFields && hasBirthdayFields && hasFormIndicators) {
                    console.log(`[FB] Found complete registration form at: ${endpoint}`);
                    bestResponse = response;
                    bestContent = content;
                    bestUrl = url;
                    break;
                } else {
                    console.warn(`[FB] Incomplete form at ${endpoint} - Required: ${hasRequiredFields}, Birthday: ${hasBirthdayFields}, Indicators: ${hasFormIndicators}`);
                }
            }

        } catch (error) {
            console.warn(`[FB] Error accessing ${endpoint}: ${error.message}`);
        }
    }

    if (!bestResponse || !bestContent) {
        throw new Error('No valid Facebook registration form found after trying all endpoints');
    }

    await statusMsg.edit({ content: '🔑 Extracting security tokens...' });
    const tokens = extractAdvancedTokens(bestContent);
    
    console.log(`[FB] Registration form loaded from: ${bestUrl}`);
    console.log(`[FB] Tokens - fb_dtsg: ${tokens.fb_dtsg?.substring(0,15)}..., jazoest: ${tokens.jazoest}, lsd: ${tokens.lsd?.substring(0,10)}...`);

    return { tokens, html: bestContent, url: bestUrl };
};

const extractAdvancedTokens = (html) => {
    const $ = cheerio.load(html);
    const tokens = { fb_dtsg: null, jazoest: null, lsd: null };

    if (CUSTOM_TOKENS.fb_dtsg) tokens.fb_dtsg = CUSTOM_TOKENS.fb_dtsg;
    if (CUSTOM_TOKENS.jazoest) tokens.jazoest = CUSTOM_TOKENS.jazoest;
    if (CUSTOM_TOKENS.lsd) tokens.lsd = CUSTOM_TOKENS.lsd;

    const ultraAdvancedPatterns = {
        fb_dtsg: [
            /"fb_dtsg":"([^"]{15,})"/g,
            /"token":"([A-Za-z0-9:_-]{20,})"/g,
            /fb_dtsg['"]\s*:\s*['"]([^'"]{15,})['"]/g,
            /name="fb_dtsg"\s+value="([^"]{15,})"/g,
            /"dtsg":\s*{\s*"token":\s*"([^"]{15,})"/g,
            /DTSGInitialData.*?"token":"([^"]{15,})"/g,
            /_js_datr.*?"([A-Za-z0-9_-]{20,})"/g,
            /window\._sharedData.*?"fb_dtsg":"([^"]{15,})"/g,
            /\["DTSGInitialData",\[\],\{"token":"([^"]{15,})"/g
        ],
        jazoest: [
            /"jazoest":"?(\d{4,8})"?/g,
            /jazoest['"]\s*:\s*['"]?(\d{4,8})['"]?/g,
            /name="jazoest"\s+value="(\d{4,8})"/g,
            /"jazoest":\s*"?(\d{4,8})"?/g,
            /jazoest=(\d{4,8})/g,
            /window\._sharedData.*?"jazoest":"?(\d{4,8})"?/g
        ],
        lsd: [
            /"lsd":"([^"]{6,25})"/g,
            /"LSD"[^}]+?"token":"([^"]{6,25})"/g,
            /lsd['"]\s*:\s*['"]([^'"]{6,25})['"]/g,
            /name="lsd"\s+value="([^"]{6,25})"/g,
            /LSDToken.*?"token":"([^"]{6,25})"/g,
            /"spinnerToken":"([^"]{6,25})"/g,
            /window\._sharedData.*?"lsd":"([^"]{6,25})"/g,
            /\["LSD",\[\],\{"token":"([^"]{6,25})"/g
        ]
    };

    $('script').each((_, script) => {
        const content = $(script).html() || '';
        
        Object.entries(ultraAdvancedPatterns).forEach(([tokenName, patterns]) => {
            if (tokens[tokenName]) return;
            
            patterns.forEach(pattern => {
                if (tokens[tokenName]) return;
                
                const matches = [...content.matchAll(pattern)];
                for (const match of matches) {
                    if (match[1] && match[1].length >= 6) {
                        if (tokenName === 'jazoest' && !/^\d+$/.test(match[1])) continue;
                        if (tokenName === 'fb_dtsg' && match[1].length < 15) continue;
                        if (tokenName === 'lsd' && match[1].length < 6) continue;
                        
                        tokens[tokenName] = match[1];
                        console.log(`[FB] Extracted ${tokenName}: ${match[1].substring(0, 12)}...`);
                        break;
                    }
                }
            });
        });

        try {
            const windowDataMatch = content.match(/window\._sharedData\s*=\s*({.+?});/);
            if (windowDataMatch) {
                const sharedData = JSON.parse(windowDataMatch[1]);
                if (sharedData.fb_dtsg && !tokens.fb_dtsg) tokens.fb_dtsg = sharedData.fb_dtsg;
                if (sharedData.jazoest && !tokens.jazoest) tokens.jazoest = sharedData.jazoest;
                if (sharedData.lsd && !tokens.lsd) tokens.lsd = sharedData.lsd;
            }
        } catch (e) {}

        try {
            const jsonMatches = content.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g) || [];
            for (const match of jsonMatches) {
                try {
                    const jsonObj = JSON.parse(match);
                    Object.keys(tokens).forEach(tokenKey => {
                        if (!tokens[tokenKey] && jsonObj[tokenKey] && 
                            (tokenKey !== 'jazoest' || /^\d+$/.test(jsonObj[tokenKey])) &&
                            String(jsonObj[tokenKey]).length >= 6) {
                            tokens[tokenKey] = jsonObj[tokenKey];
                        }
                    });
                } catch (e) {}
            }
        } catch(e) {}
    });

    ['fb_dtsg', 'jazoest', 'lsd'].forEach(tokenName => {
        if (!tokens[tokenName]) {
            const input = $(`input[name="${tokenName}"]`).attr('value');
            const meta = $(`meta[name="${tokenName}"]`).attr('content');
            if (input && (tokenName !== 'jazoest' || /^\d+$/.test(input))) {
                tokens[tokenName] = input;
            } else if (meta && (tokenName !== 'jazoest' || /^\d+$/.test(meta))) {
                tokens[tokenName] = meta;
            }
        }
    });

    if (!tokens.fb_dtsg) {
        const timestamp = Date.now().toString();
        tokens.fb_dtsg = 'AQHm' + timestamp.slice(-8) + Math.random().toString(36).slice(2, 18);
        console.warn('[FB] Generated enhanced fallback fb_dtsg');
    }
    
    if (!tokens.jazoest) {
        let sum = 0;
        for (let char of tokens.fb_dtsg) sum += char.charCodeAt(0);
        tokens.jazoest = '2' + sum.toString().slice(-4);
        console.warn('[FB] Generated enhanced fallback jazoest');
    }
    
    if (!tokens.lsd) {
        tokens.lsd = 'AVq' + Math.random().toString(36).slice(2, 14);
        console.warn('[FB] Generated enhanced fallback lsd');
    }

    return tokens;
};

const buildAdvancedPayload = (tokens, email, password, name, dob, gender, pageHtml) => {
    const payload = new URLSearchParams();
    
    const coreFields = {
        'firstname': name.firstName,
        'lastname': name.lastName,
        'reg_email__': email,
        'reg_email_confirmation__': email,
        'reg_passwd__': password,
        'birthday_day': dob.day,
        'birthday_month': dob.month,
        'birthday_year': dob.year,
        'sex': gender
    };

    Object.entries(coreFields).forEach(([key, value]) => {
        payload.append(key, String(value));
    });

    const $formPage = cheerio.load(pageHtml);
    
    $formPage('form').each((_, form) => {
        const action = $formPage(form).attr('action');
        if (action && (action.includes('reg') || action.includes('signup'))) {
            $formPage(form).find('input[type="hidden"]').each((_, input) => {
                const name = $formPage(input).attr('name');
                const value = $formPage(input).attr('value');
                if (name && value && !payload.has(name)) {
                    payload.append(name, value);
                }
            });
        }
    });

    Object.entries(tokens).forEach(([key, value]) => {
        if (value) payload.set(key, value);
    });

    const enhancedFields = {
        'websubmit': '1',
        'submit': 'Sign Up',
        'reg_instance': 'mobile_' + Math.random().toString(36).substring(2, 18),
        'reg_impression_id': 'MOBILE_REG_ENHANCED_' + Date.now(),
        'encpass': `#PWD_BROWSER:0:${Math.floor(Date.now() / 1000)}:${password}`,
        'source': 'mobile_registration',
        'locale': 'en_US',
        'client_country_code': 'US',
        'ns': '0',
        'logger_id': Math.random().toString(36).substring(2, 12),
        'submission_id': Math.random().toString(36).substring(2, 12)
    };

    Object.entries(enhancedFields).forEach(([key, value]) => {
        if (!payload.has(key)) payload.append(key, value);
    });

    return payload;
};

const submitWithRetry = async (session, payload, refererUrl, statusMsg) => {
    const submitEndpoints = [
        BASE_FB_URL + '/reg/submit/',
        BASE_FB_URL + '/registration/submit/',
        BASE_FB_URL + '/mobile/registration/submit/',
        BASE_FB_URL + '/signup/account/',
        'https://www.facebook.com/reg/submit/',
        'https://facebook.com/reg/submit/'
    ];

    let bestResult = null;
    let successFound = false;

    for (const submitUrl of submitEndpoints) {
        if (successFound) break;

        try {
            await statusMsg.edit({ content: `📤 Submitting to: ${new URL(submitUrl).pathname}...` });
            await humanDelay(10000, 18000);

            const response = await session.post(submitUrl, payload.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': refererUrl,
                    'Origin': new URL(refererUrl).origin,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Sec-Fetch-Site': 'same-origin',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-User': '?1',
                    'X-Requested-With': undefined
                },
                timeout: 150000,
                maxRedirects: 20
            });

            const responseText = String(response.data);
            const finalUrl = response.request?.res?.responseUrl || submitUrl;
            const cookies = await session.defaults.jar.getCookieString(finalUrl);

            console.log(`[FB] Submit to ${submitUrl} - Status: ${response.status}, Final: ${finalUrl.substring(0, 60)}...`);

            const textLower = responseText.toLowerCase();
            const urlLower = finalUrl.toLowerCase();

            const challengeTerms = [
                'security check', 'captcha', 'human verification', 'prove you',
                'complete this step', 'confirm you\'re human', 'solve this',
                'verify that you', 'checkpoint/challenge'
            ];

            const successTerms = [
                'welcome to facebook', 'confirmation code', 'verify your email',
                'check your email', 'home.php', 'profile.php', 'code sent',
                'account created', 'registration complete'
            ];

            let status = 'unknown';

            if (challengeTerms.some(term => textLower.includes(term) || urlLower.includes(term))) {
                status = 'challenge';
            } else if (successTerms.some(term => textLower.includes(term) || urlLower.includes(term)) ||
                      (cookies.includes('c_user=') && !cookies.includes('c_user=0'))) {
                status = 'success';
                successFound = true;
            } else if (textLower.includes('checkpoint') || cookies.includes('checkpoint=')) {
                status = 'checkpoint';
                successFound = true;
            } else if (response.status === 302) {
                const location = response.headers.location || '';
                if (location.includes('home.php') || location.includes('profile.php')) {
                    status = 'success';
                    successFound = true;
                } else {
                    status = 'checkpoint';
                    successFound = true;
                }
            } else if (response.status >= 200 && response.status < 400) {
                status = 'success';
                successFound = true;
            } else {
                status = 'error';
            }

            const result = {
                status,
                responseText,
                finalUrl,
                cookies,
                httpStatus: response.status,
                submitUrl
            };

            if (status === 'success' || status === 'checkpoint') {
                bestResult = result;
                console.log(`[FB] SUCCESS with ${submitUrl}: ${status}`);
                break;
            } else if (!bestResult || bestResult.status === 'unknown') {
                bestResult = result;
            }

        } catch (error) {
            console.error(`[FB] Submit error for ${submitUrl}: ${error.message}`);
            
            if (!bestResult) {
                bestResult = {
                    status: 'error',
                    error: error.message,
                    httpStatus: error.response?.status || 0,
                    submitUrl
                };
            }
        }

        if (!successFound) {
            await shortDelay(2000, 4000);
        }
    }

    return bestResult || {
        status: 'error',
        error: 'All submission endpoints failed',
        httpStatus: 0
    };
};

const extractAccountData = async (cookieJar, responseText, finalUrl) => {
    let uid = null;
    let profileUrl = null;

    try {
        const cookies = await cookieJar.getCookieString(finalUrl || BASE_FB_URL);
        
        const cUserMatch = cookies.match(/c_user=(\d{10,})/);
        if (cUserMatch?.[1] && cUserMatch[1] !== '0') {
            uid = cUserMatch[1];
            console.log(`[FB] Found UID in cookies: ${uid}`);
        }

        if (!uid && responseText) {
            const uidPatterns = [
                /"USER_ID":"(\d{10,})"/,
                /"viewer_id":(\d{10,})/,
                /profile\.php\?id=(\d{10,})/,
                /"profile_id":(\d{10,})/,
                /"account_id":"(\d{10,})"/,
                /user\.php\?id=(\d{10,})/
            ];

            for (const pattern of uidPatterns) {
                const match = responseText.match(pattern);
                if (match?.[1] && /^\d{10,}$/.test(match[1])) {
                    uid = match[1];
                    console.log(`[FB] Found UID in response: ${uid}`);
                    break;
                }
            }
        }

        if (uid) {
            profileUrl = `https://www.facebook.com/profile.php?id=${uid}`;
        }

    } catch (error) {
        console.error(`[FB] Account data extraction error: ${error.message}`);
    }

    return { uid, profileUrl };
};

const createTokenModal = () => {
    const modal = new ModalBuilder()
        .setCustomId('token_setup_modal')
        .setTitle('Facebook Token Setup');

    const guideText = `📖 HOW TO GET TOKENS:

1. Open m.facebook.com/r.php in Chrome
2. Press F12 → Console tab
3. Paste this code:

console.log('fb_dtsg:', document.querySelector('[name="fb_dtsg"]')?.value);
console.log('jazoest:', document.querySelector('[name="jazoest"]')?.value);
console.log('lsd:', document.querySelector('[name="lsd"]')?.value);

4. Copy the values below 👇`;

    const guideInput = new TextInputBuilder()
        .setCustomId('guide_display')
        .setLabel('📖 Step-by-Step Guide')
        .setValue(guideText)
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);

    const dtsgInput = new TextInputBuilder()
        .setCustomId('fb_dtsg_input')
        .setLabel('FB_DTSG Token (starts with AQH...)')
        .setPlaceholder('Paste fb_dtsg value here')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const jazoestInput = new TextInputBuilder()
        .setCustomId('jazoest_input')
        .setLabel('JAZOEST Token (numbers only)')
        .setPlaceholder('Paste jazoest value here')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const lsdInput = new TextInputBuilder()
        .setCustomId('lsd_input')
        .setLabel('LSD Token')
        .setPlaceholder('Paste lsd value here')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(guideInput),
        new ActionRowBuilder().addComponents(dtsgInput),
        new ActionRowBuilder().addComponents(jazoestInput),
        new ActionRowBuilder().addComponents(lsdInput)
    );

    return modal;
};

const sendResult = async (channel, email, password, uid, profileUrl, name, outcome, accountNum, totalAccounts, user) => {
    const prefix = totalAccounts > 1 ? `Account ${accountNum}/${totalAccounts}: ` : "";
    
    const embed = new EmbedBuilder()
        .setTitle(prefix + outcome.title)
        .setColor(outcome.color)
        .addFields(
            { name: '👤 Name', value: `\`${name.firstName} ${name.lastName}\``, inline: true },
            { name: '📧 Email', value: `\`${email}\``, inline: true },
            { name: '🔑 Password', value: `\`${password}\``, inline: true }
        );

    if (uid) {
        embed.addFields({ name: '🆔 User ID', value: `\`${uid}\``, inline: true });
    }

    if (profileUrl) {
        embed.addFields({ name: '🔗 Profile', value: `[View Profile](${profileUrl})`, inline: true });
    }

    embed.setDescription(outcome.message);

    const row = new ActionRowBuilder();
    
    if (profileUrl) {
        row.addComponents(
            new ButtonBuilder()
                .setLabel('Profile')
                .setStyle(ButtonStyle.Link)
                .setURL(profileUrl)
                .setEmoji('👤')
        );
    }

    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`delete_${accountNum}`)
            .setLabel('Delete')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️')
    );

    try {
        const message = await channel.send({ embeds: [embed], components: [row] });

        const collector = message.createMessageComponentCollector({
            filter: i => i.customId.startsWith('delete_') && i.user.id === user.id,
            time: BUTTON_COLLECTOR_TIMEOUT_MS
        });

        collector.on('collect', async interaction => {
            await interaction.message.delete().catch(() => {});
        });

        return message;

    } catch (error) {
        await channel.send(`**Account ${accountNum}**: ${email} | ${password} | ${outcome.title}`);
        return null;
    }
};

const createAccount = async (channel, user, proxy, userAgent, accountNum, totalAccounts, email) => {
    const password = generatePassword();
    const name = generateName();
    let statusMsg;

    try {
        statusMsg = await channel.send({ 
            content: `🚀 Creating account ${accountNum}/${totalAccounts}: \`${email}\`` 
        });

        const session = createAdvancedSession(userAgent, proxy);
        
        const homeResponse = await simulateRealBrowsing(session, statusMsg);
        const homeReferer = homeResponse.request?.res?.responseUrl || 'https://m.facebook.com/';

        const { tokens, html, url } = await findRegistrationForm(session, statusMsg, homeReferer);

        await statusMsg.edit({ content: '🔧 Building registration payload...' });
        await shortDelay();

        const randomDay = Math.floor(Math.random() * 28) + 1;
        const randomMonth = Math.floor(Math.random() * 12) + 1;
        const currentYear = new Date().getFullYear();
        const randomYear = currentYear - (Math.floor(Math.random() * 25) + 18);
        const gender = Math.random() > 0.5 ? '1' : '2';

        const dob = { day: randomDay, month: randomMonth, year: randomYear };
        const payload = buildAdvancedPayload(tokens, email, password, name, dob, gender, html);

        const result = await submitWithRetry(session, payload, url, statusMsg);
        const { uid, profileUrl } = await extractAccountData(session.defaults.jar, result.responseText, result.finalUrl);

        let outcome;
        if (result.status === 'success' || result.status === 'checkpoint') {
            outcome = {
                type: 'success',
                title: '✅ Account Created Successfully',
                color: 0x00FF00,
                message: `Account created! Check email \`${email}\` for confirmation code to activate.`
            };
        } else if (result.status === 'challenge') {
            outcome = {
                type: 'challenge',
                title: '🛡️ Security Challenge',
                color: 0xFF8C00,
                message: `Account hit security check. Try with different email/proxy or wait.`
            };
        } else {
            let errorMsg = 'Registration failed for unknown reason';
            if (result.error) {
                errorMsg = result.error;
            } else if (result.responseText) {
                const $ = cheerio.load(result.responseText);
                const fbError = $('#reg_error_inner').text().trim() || 
                               $('div[role="alert"]').text().trim() ||
                               $('._585n').first().text().trim();
                if (fbError) errorMsg = fbError;
            }

            outcome = {
                type: 'failed',
                title: '❌ Creation Failed',
                color: 0xFF0000,
                message: errorMsg.substring(0, 350)
            };
        }

        await sendResult(channel, email, password, uid, profileUrl, name, outcome, accountNum, totalAccounts, user);
        
        if (statusMsg?.deletable) {
            setTimeout(() => statusMsg.delete().catch(() => {}), 8000);
        }

        return outcome;

    } catch (error) {
        console.error(`[FB] Account ${accountNum} error: ${error.message}`);
        
        const errorOutcome = {
            type: 'error',
            title: '💥 System Error',
            color: 0xFF0000,
            message: error.message.substring(0, 400)
        };

        await sendResult(channel, email, password, null, null, name, errorOutcome, accountNum, totalAccounts, user);
        
        if (statusMsg?.deletable) {
            setTimeout(() => statusMsg.delete().catch(() => {}), 5000);
        }

        return errorOutcome;
    }
};

module.exports = {
    name: 'fbcreatev7',
    description: 'Advanced Facebook account creator with ultra-realistic browsing simulation',
    admin_only: false,
    
    async execute(message, args) {
        try {
            if (args.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle('🚀 Facebook Account Creator v7 - Ultra Enhanced')
                    .setColor(0x1877F2)
                    .setDescription('**Most advanced Facebook account creator with realistic human simulation**')
                    .addFields(
                        { 
                            name: '📝 Usage', 
                            value: '`fbcreatev7 user@gmail.com`\n`fbcreatev7 user1@gmail.com;user2@yahoo.com`\n`fbcreatev7 user@gmail.com proxy:port:user:pass`\n`fbcreatev7 settokens` - Custom token setup', 
                            inline: false 
                        },
                        { 
                            name: '🛡️ Anti-Detection Features', 
                            value: '• Ultra-realistic browsing simulation\n• Google → Facebook natural flow\n• Advanced header rotation\n• Enhanced token extraction\n• Multiple endpoint fallbacks', 
                            inline: false 
                        }
                    );

                return message.reply({ embeds: [embed] });
            }

            if (args[0].toLowerCase() === 'settokens') {
                const modal = createTokenModal();
                
                const embed = new EmbedBuilder()
                    .setTitle('🔑 Custom Token Setup')
                    .setColor(0x1877F2)
                    .setDescription('**Click below to open token setup dialog with complete guide**');

                const button = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('open_token_modal')
                            .setLabel('Open Token Setup')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('🔑')
                    );

                const reply = await message.reply({ embeds: [embed], components: [button] });

                const collector = reply.createMessageComponentCollector({
                    filter: i => i.user.id === message.author.id,
                    time: 120000
                });

                collector.on('collect', async interaction => {
                    if (interaction.customId === 'open_token_modal') {
                        await interaction.showModal(modal);

                        try {
                            const submitted = await interaction.awaitModalSubmit({ time: 300000 });
                            
                            CUSTOM_TOKENS.fb_dtsg = submitted.fields.getTextInputValue('fb_dtsg_input');
                            CUSTOM_TOKENS.jazoest = submitted.fields.getTextInputValue('jazoest_input'); 
                            CUSTOM_TOKENS.lsd = submitted.fields.getTextInputValue('lsd_input');

                            await submitted.reply({
                                content: `✅ **Custom tokens configured!**\n\n🔑 **Active Tokens:**\n• fb_dtsg: \`${CUSTOM_TOKENS.fb_dtsg.substring(0, 20)}...\`\n• jazoest: \`${CUSTOM_TOKENS.jazoest}\`\n• lsd: \`${CUSTOM_TOKENS.lsd.substring(0, 12)}...\`\n\n**These will be used for all account creations.**`,
                                ephemeral: true
                            });

                            await reply.edit({ 
                                content: '✅ **Custom tokens successfully configured!** Ready for account creation.', 
                                embeds: [], 
                                components: [] 
                            });

                        } catch (error) {
                            console.error('Token modal error:', error.message);
                        }
                    }
                });

                return;
            }

            if (args[0].toLowerCase() === 'cleartokens') {
                CUSTOM_TOKENS = { fb_dtsg: null, jazoest: null, lsd: null };
                return message.reply('✅ **Custom tokens cleared!** Bot will auto-extract tokens from Facebook.');
            }

            let emailsString = args[0];
            let proxyString = args.length > 1 && args[1].includes(':') ? args[1] : null;

            const emails = emailsString.split(';').map(e => e.trim()).filter(e => e.length > 0);
            const invalidEmails = emails.filter(e => !validateEmail(e));

            if (invalidEmails.length > 0) {
                return message.reply(`❌ **Invalid email format:** ${invalidEmails.join(', ')}`);
            }

            const maxAccounts = 4;
            const validEmails = emails.slice(0, maxAccounts);
            const count = validEmails.length;

            if (emails.length > maxAccounts) {
                await message.reply(`⚠️ **Limited to ${maxAccounts} accounts for stability.** Using first ${maxAccounts}.`);
            }

            const statusEmbed = new EmbedBuilder()
                .setTitle('🚀 Ultra-Enhanced Account Creation Started')
                .setColor(0x1877F2)
                .addFields(
                    { name: '📊 Accounts', value: `${count}`, inline: true },
                    { name: '🔧 Tokens', value: CUSTOM_TOKENS.fb_dtsg ? 'Custom' : 'Auto-Extract', inline: true },
                    { name: '🌐 Proxy', value: proxyString ? 'Enabled' : 'Direct', inline: true }
                )
                .setDescription('⏳ **Ultra-realistic browsing simulation in progress...**\n🔍 Google → Facebook natural flow\n🛡️ Advanced anti-detection active');

            await message.reply({ embeds: [statusEmbed] });

            const promises = validEmails.map((email, index) => {
                const userAgent = getRandomUA();
                return new Promise(resolve => {
                    setTimeout(() => {
                        resolve(createAccount(message.channel, message.author, proxyString, userAgent, index + 1, count, email));
                    }, index * 8000);
                });
            });

            const results = await Promise.allSettled(promises);
            
            let successCount = 0;
            let challengeCount = 0;
            let failureCount = 0;

            results.forEach(result => {
                if (result.status === 'fulfilled') {
                    if (result.value?.type === 'success') successCount++;
                    else if (result.value?.type === 'challenge') challengeCount++;
                    else failureCount++;
                } else {
                    failureCount++;
                }
            });

            const finalEmbed = new EmbedBuilder()
                .setTitle('🏁 Ultra-Enhanced Creation Complete')
                .setColor(successCount > 0 ? 0x00FF00 : challengeCount > 0 ? 0xFF8C00 : 0xFF0000)
                .addFields(
                    { name: '✅ Success', value: `${successCount}`, inline: true },
                    { name: '🛡️ Challenges', value: `${challengeCount}`, inline: true },
                    { name: '❌ Failed', value: `${failureCount}`, inline: true }
                )
                .setDescription('**Check your emails for Facebook confirmation codes!**');

            await message.channel.send({ embeds: [finalEmbed] });

        } catch (error) {
            console.error('[FB] Command error:', error);
            await message.channel.send(`🚨 **Critical Error:** ${error.message.substring(0, 300)}`);
        }
    }
};