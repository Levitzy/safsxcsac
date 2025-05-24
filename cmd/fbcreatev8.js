const axios = require('axios');
const cheerio = require('cheerio');
const { faker } = require('@faker-js/faker');
const UserAgent = require('user-agents');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { CookieJar } = require('tough-cookie');
const { wrapper: axiosCookieJarSupport } = require('axios-cookiejar-support');

const CONFIG = {
    BASE_FB_URL: 'https://m.facebook.com',
    TEMP_EMAIL_API_URL: 'https://email-six-pearl.vercel.app/',
    DEFAULT_TIMEOUT: 90000,
    OTP_POLL_INTERVAL_SECONDS: 3,
    OTP_POLL_DURATION_MS: 25000,
    BUTTON_COLLECTOR_TIMEOUT_MS: 8 * 60 * 1000,
    MAX_RETRY_ATTEMPTS: 3,
    MAX_CONCURRENT_ACCOUNTS: 5,
    
    DELAYS: {
        VERY_SHORT: { min: 300, max: 800 },
        SHORT_INTERACTION: { min: 1000, max: 2800 },
        NAVIGATION: { min: 2500, max: 6000 },
        SUBMISSION: { min: 6000, max: 12000 },
        STAGGER: { min: 1500, max: 4000 }
    },

    HEADERS: {
        ACCEPT_LANGUAGE: 'en-US,en;q=0.9,en-GB;q=0.8,fr;q=0.7',
        ACCEPT: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
        SEC_FETCH_DEST: 'document',
        SEC_FETCH_MODE: 'navigate',
        SEC_FETCH_SITE: 'same-origin',
        UPGRADE_INSECURE_REQUESTS: '1',
        DNT: '1',
        SEC_GPC: '1'
    }
};

const FALLBACK_USER_AGENTS = [
    'Mozilla/5.0 (Linux; Android 13; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 12; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
];

const createDelay = (config) => {
    const delay = Math.random() * (config.max - config.min) + config.min;
    return new Promise(resolve => setTimeout(resolve, delay));
};

const generateAdvancedUserAgent = () => {
    try {
        const userAgentInstance = new UserAgent({
            deviceCategory: 'mobile',
            platform: /Android|iPhone|iPad/,
            vendor: /Google Inc\.|Apple Computer, Inc\./
        });

        if (!userAgentInstance?.data?.toString()) {
            return createFallbackUserAgent();
        }

        const uaData = userAgentInstance.data;
        const osInfo = userAgentInstance.os;
        
        let platformVersion = '13';
        if (osInfo?.version) {
            const majorVersion = osInfo.version.split('.')[0];
            if (majorVersion && !isNaN(parseInt(majorVersion))) {
                platformVersion = majorVersion;
            }
        }

        const browserVersion = uaData.version ? uaData.version.split('.')[0] : '122';
        const brands = [
            { brand: "Chromium", version: browserVersion },
            { brand: "Not(A:Brand", version: "24" },
            { brand: uaData.browser === "Chrome" ? "Google Chrome" : uaData.browser || "Chrome", version: browserVersion }
        ];

        return {
            mobile: true,
            platform: uaData.platform || 'Android',
            platformVersion: platformVersion,
            architecture: 'arm64',
            model: uaData.deviceName || '',
            brands: brands,
            viewport: {
                width: Math.floor(Math.random() * (414 - 360) + 360),
                height: Math.floor(Math.random() * (896 - 640) + 640)
            },
            toString: () => userAgentInstance.toString()
        };
    } catch (error) {
        return createFallbackUserAgent();
    }
};

const createFallbackUserAgent = () => {
    const fallbackUA = FALLBACK_USER_AGENTS[Math.floor(Math.random() * FALLBACK_USER_AGENTS.length)];
    const browserVersion = '122';
    
    return {
        mobile: true,
        platform: 'Android',
        platformVersion: '13',
        architecture: 'arm64',
        model: '',
        brands: [
            { brand: "Chromium", version: browserVersion },
            { brand: "Not(A:Brand", version: "24" },
            { brand: "Google Chrome", version: browserVersion }
        ],
        viewport: { width: 393, height: 851 },
        toString: () => fallbackUA
    };
};

const generateSecureCredentials = () => ({
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    password: (() => {
        const length = Math.floor(Math.random() * 6) + 12;
        const chars = {
            lower: "abcdefghijklmnopqrstuvwxyz",
            upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", 
            digits: "0123456789",
            special: "!@#$%^&*()_+-=[]{}|;:,.<>?"
        };
        
        let password = '';
        password += chars.lower.charAt(Math.floor(Math.random() * chars.lower.length));
        password += chars.upper.charAt(Math.floor(Math.random() * chars.upper.length));
        password += chars.digits.charAt(Math.floor(Math.random() * chars.digits.length));
        password += chars.special.charAt(Math.floor(Math.random() * chars.special.length));
        
        const allChars = Object.values(chars).join('');
        for (let i = password.length; i < length; i++) {
            password += allChars.charAt(Math.floor(Math.random() * allChars.length));
        }
        
        return password.split('').sort(() => 0.5 - Math.random()).join('');
    })()
});

const validateProxy = (proxyString) => {
    if (!proxyString) return null;
    
    const parts = proxyString.trim().split(':');
    if (parts.length < 2) return null;
    
    const port = parseInt(parts[1], 10);
    if (isNaN(port) || port < 1 || port > 65535) return null;
    
    if (parts.length === 2) {
        return { protocol: 'http', host: parts[0], port };
    } else if (parts.length >= 4) {
        const username = parts[2].startsWith('@') ? parts[2].substring(1) : parts[2];
        return {
            protocol: 'http',
            host: parts[0],
            port,
            auth: { username, password: parts.slice(3).join(':') }
        };
    }
    
    return null;
};

const createEnhancedSession = (userAgentData, proxyString = null) => {
    const jar = new CookieJar();
    const proxyConfig = validateProxy(proxyString);
    const userAgentString = userAgentData.toString();

    const baseHeaders = {
        'User-Agent': userAgentString,
        'Accept': CONFIG.HEADERS.ACCEPT,
        'Accept-Language': CONFIG.HEADERS.ACCEPT_LANGUAGE,
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Sec-Fetch-Dest': CONFIG.HEADERS.SEC_FETCH_DEST,
        'Sec-Fetch-Mode': CONFIG.HEADERS.SEC_FETCH_MODE,
        'Sec-Fetch-Site': CONFIG.HEADERS.SEC_FETCH_SITE,
        'Upgrade-Insecure-Requests': CONFIG.HEADERS.UPGRADE_INSECURE_REQUESTS,
        'DNT': CONFIG.HEADERS.DNT,
        'Sec-GPC': CONFIG.HEADERS.SEC_GPC,
        'Cache-Control': 'max-age=0'
    };

    if (userAgentData.brands?.length > 0) {
        baseHeaders['Sec-CH-UA'] = userAgentData.brands
            .map(b => `"${b.brand}";v="${b.version}"`)
            .join(', ');
        baseHeaders['Sec-CH-UA-Mobile'] = userAgentData.mobile ? '?1' : '?0';
        if (userAgentData.platform) baseHeaders['Sec-CH-UA-Platform'] = `"${userAgentData.platform}"`;
        if (userAgentData.platformVersion) baseHeaders['Sec-CH-UA-Platform-Version'] = `"${userAgentData.platformVersion}"`;
        if (userAgentData.architecture) baseHeaders['Sec-CH-UA-Arch'] = `"${userAgentData.architecture}"`;
        if (userAgentData.model !== undefined) baseHeaders['Sec-CH-UA-Model'] = `"${userAgentData.model}"`;
    }

    if (userAgentData.viewport) {
        baseHeaders['Viewport-Width'] = userAgentData.viewport.width.toString();
    }

    const session = axios.create({
        jar,
        withCredentials: true,
        headers: baseHeaders,
        timeout: CONFIG.DEFAULT_TIMEOUT,
        maxRedirects: 15,
        validateStatus: (status) => status >= 200 && status < 600,
        proxy: proxyConfig
    });

    axiosCookieJarSupport(session);
    return session;
};

const fetchTemporaryEmailAdvanced = async (statusMsg, providerName) => {
    const effectiveProvider = (providerName && providerName.toLowerCase() !== 'random' && providerName.trim()) 
        ? providerName : 'random';
    
    await statusMsg.edit({ 
        content: `📧 Requesting temporary email (Provider: ${effectiveProvider})...` 
    });
    
    await createDelay(CONFIG.DELAYS.SHORT_INTERACTION);
    
    const maxRetries = 3;
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const apiUrl = `${CONFIG.TEMP_EMAIL_API_URL}/gen?provider=${encodeURIComponent(effectiveProvider)}`;
            const response = await axios.get(apiUrl, { 
                timeout: 35000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; EmailBot/1.0)',
                    'Accept': 'application/json'
                }
            });
            
            if (response.data?.email_address && response.data?.api_session_id && response.data?.provider) {
                await statusMsg.edit({ 
                    content: `📬 Email acquired: \`${response.data.email_address}\` (${response.data.provider})` 
                });
                return {
                    email: response.data.email_address,
                    sessionId: response.data.api_session_id,
                    providerName: response.data.provider
                };
            } else {
                throw new Error('Invalid API response structure');
            }
        } catch (error) {
            lastError = error;
            if (attempt < maxRetries) {
                await createDelay({ min: 2000, max: 4000 });
                await statusMsg.edit({ 
                    content: `📧 Email fetch attempt ${attempt} failed, retrying... (Provider: ${effectiveProvider})` 
                });
            }
        }
    }
    
    const errorMessage = `Failed to fetch temporary email after ${maxRetries} attempts (Provider: ${effectiveProvider}): ${lastError?.message || 'Unknown error'}`;
    if (lastError?.response?.data?.detail) {
        throw new Error(`${errorMessage} - API Detail: ${lastError.response.data.detail}`);
    }
    throw new Error(errorMessage);
};

const fetchOtpAdvanced = async (sessionId, statusMsg, emailAddress) => {
    const initialMessage = `⏳ Monitoring for Facebook OTP at \`${emailAddress}\` (${CONFIG.OTP_POLL_DURATION_MS / 1000}s max)...`;
    await statusMsg.edit({ content: initialMessage });

    const otpPatterns = [
        /(?:facebook|fb|meta)[^\w\d\s:-]*(\d{5,8})\b/i,
        /\b(\d{5,8})\s*(?:is|est|es|ist|είναι|เป็น|คือ|adalah|ay|jest|är|er|on|é|является)\s*(?:your|votre|tu|tuo|Ihr|tuo|suo|din|uw|ของคุณ|anda|iyong|twój|din|din|ващ|ton)\s*(?:Facebook|FB|Meta)\s*(?:confirmation|security|login|access|verification|OTP|code)/i,
        /(?:Facebook|FB|Meta)\s*(?:confirmation|security|login|access|verification|OTP|code)[\s:-]*(\d{5,8})\b/i,
        /(?:Your|Votre|Tu|Tuo|Ihr|Su|Din|Uw|Ang iyong|Twój|Ваш|Ton)\s*(?:Facebook|FB|Meta)\s*(?:confirmation|security|login|access|verification|OTP|code)\s*(?:is|est|es|ist|είναι|เป็น|คือ|adalah|ay|jest|är|er|on|é|является)[\s:-]*(\d{5,8})\b/i,
        /(?:Your|Đây là|O seu|Tu|Il tuo|Votre|Dein)\s*(?:Facebook|Meta)?\s*(?:confirmation|verification|access|security)\s*(?:code|código|mã|codice|Code)\s*(?:is|est|là|é|ist)?:?\s*(\d{5,8})/i,
        /(\d{5,8})\s*is your Facebook confirmation code/i,
        /\bFB[_-]?(\d{5,8})\b/i,
        /security.*?code.*?(\d{5,8})/i,
        /\b(\d{5,8})\b/i
    ];

    const startTime = Date.now();
    let lastPollTime = 0;
    let pollCount = 0;

    while (Date.now() - startTime < CONFIG.OTP_POLL_DURATION_MS) {
        const currentTime = Date.now();
        
        if (currentTime - lastPollTime >= (CONFIG.OTP_POLL_INTERVAL_SECONDS * 1000)) {
            pollCount++;
            try {
                const response = await axios.get(
                    `${CONFIG.TEMP_EMAIL_API_URL}/sessions/${sessionId}/messages`, 
                    { timeout: 30000 }
                );
                
                if (response.data && Array.isArray(response.data)) {
                    const sortedMessages = response.data.sort((a, b) => 
                        new Date(b.received_at || b.date || 0) - new Date(a.received_at || a.date || 0)
                    );

                    for (const message of sortedMessages) {
                        let emailContent = message.body || '';
                        if (!emailContent && message.html) {
                            emailContent = cheerio.load(
                                Array.isArray(message.html) ? message.html.join(' ') : String(message.html)
                            ).text();
                        }

                        const emailBody = emailContent.trim().replace(/\s+/g, ' ').replace(/&nbsp;/g, ' ');
                        const emailSubject = (message.subject || '').trim().replace(/\s+/g, ' ');
                        const emailFrom = (message.from || message.from_address || '').toLowerCase();

                        if (emailBody || emailSubject) {
                            const isFacebookEmail = emailFrom.includes('facebook.com') || 
                                                  emailFrom.includes('fb.com') || 
                                                  emailFrom.includes('meta.com') ||
                                                  emailSubject.toLowerCase().includes('facebook') || 
                                                  emailSubject.toLowerCase().includes('fb') || 
                                                  emailSubject.toLowerCase().includes('meta');

                            for (let i = 0; i < otpPatterns.length; i++) {
                                const pattern = otpPatterns[i];
                                const isGenericPattern = i === otpPatterns.length - 1;
                                
                                if (isGenericPattern && !isFacebookEmail && 
                                    !emailBody.toLowerCase().includes('facebook') && 
                                    !emailBody.toLowerCase().includes('meta')) {
                                    continue;
                                }

                                const combinedText = `${emailSubject} ${emailBody}`;
                                const match = combinedText.match(pattern);
                                
                                if (match && match[1] && match[1].length >= 5 && 
                                    match[1].length <= 8 && /^\d+$/.test(match[1])) {
                                    await statusMsg.edit({ 
                                        content: `🔑 OTP \`${match[1]}\` found! From: \`${message.from || message.from_address || 'unknown'}\`` 
                                    });
                                    return match[1];
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                console.log(`OTP polling attempt ${pollCount} failed:`, error.message);
            }
            lastPollTime = currentTime;
        }

        const timeElapsed = Date.now() - startTime;
        const timeLeft = Math.max(0, CONFIG.OTP_POLL_DURATION_MS - timeElapsed);
        const nextPollIn = Math.ceil((lastPollTime + (CONFIG.OTP_POLL_INTERVAL_SECONDS * 1000) - Date.now()) / 1000);
        
        const countdownMsg = nextPollIn > 0 ? `(Next check in ${nextPollIn}s)` : `(Checking...)`;
        await statusMsg.edit({ 
            content: `⏳ Polling for OTP... ${countdownMsg} Time left: ${Math.round(timeLeft/1000)}s (Poll #${pollCount})` 
        }).catch(() => {});
        
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error(`OTP not received within ${CONFIG.OTP_POLL_DURATION_MS / 1000} seconds after ${pollCount} polling attempts.`);
};

const extractFormDataAdvanced = (html, formSelector = 'form[action*="/reg/"], form[id*="reg"]') => {
    const formData = {};
    const $ = cheerio.load(html);
    
    let registrationForm = $(formSelector).first();
    if (registrationForm.length === 0) {
        registrationForm = $('form').filter((i, el) => {
            const action = $(el).attr('action') || '';
            const id = $(el).attr('id') || '';
            const method = $(el).attr('method') || '';
            return action.includes('/reg/') || action.includes('/r.php') || 
                   action.includes('signup') || id.includes('reg') || 
                   id.includes('signup') || method.toLowerCase() === 'post';
        }).first();
    }

    if (registrationForm.length) {
        registrationForm.find('input').each((_, el) => {
            const name = $(el).attr('name');
            const value = $(el).attr('value');
            if (name) formData[name] = value || '';
        });
    }

    const scriptTokens = {};
    $('script').each((_, scriptTag) => {
        const scriptContent = $(scriptTag).html();
        if (!scriptContent) return;

        const tokenPatterns = {
            fb_dtsg: [
                /['"]fb_dtsg['"]\s*:\s*['"]([^'"]+)['"]/,
                /name="fb_dtsg"\s+value="([^"]+)"/,
                /fb_dtsg['"]?\s*[:=]\s*['"]([^'"]+)['"]/,
                /"token":"([^"]+)"/
            ],
            jazoest: [
                /['"]jazoest['"]\s*:\s*['"]([^'"]+)['"]/,
                /name="jazoest"\s+value="([^"]+)"/,
                /jazoest['"]?\s*[:=]\s*['"]([^'"]+)['"]/
            ],
            lsd: [
                /['"]lsd['"]\s*:\s*['"]([^'"]+)['"]/,
                /name="lsd"\s+value="([^"]+)"/,
                /lsd['"]?\s*[:=]\s*['"]([^'"]+)['"]/,
                /LSDToken[^"]*"token":"([^"]+)"/
            ]
        };

        Object.entries(tokenPatterns).forEach(([token, patterns]) => {
            if (!scriptTokens[token]) {
                for (const pattern of patterns) {
                    const match = scriptContent.match(pattern);
                    if (match && match[1]) {
                        scriptTokens[token] = match[1];
                        break;
                    }
                }
            }
        });
    });

    Object.assign(formData, scriptTokens);

    ['fb_dtsg', 'jazoest', 'lsd'].forEach(field => {
        if (!formData[field]) {
            const metaValue = $(`meta[name="${field}"]`).attr('content');
            const inputValue = $(`input[name="${field}"]`).val();
            if (metaValue) formData[field] = metaValue;
            else if (inputValue) formData[field] = inputValue;
        }
    });

    if (!formData.fb_dtsg) {
        formData.fb_dtsg = 'AQH' + Math.random().toString(36).substring(2, 12) + 
                          Math.random().toString(36).substring(2, 8);
    }
    
    if (!formData.jazoest) {
        let sum = 0;
        for (let i = 0; i < (formData.fb_dtsg || '').length; i++) {
            sum += (formData.fb_dtsg || '').charCodeAt(i);
        }
        formData.jazoest = '2' + sum;
    }
    
    if (!formData.lsd) {
        formData.lsd = Math.random().toString(36).substring(2, 15);
    }

    const commonFields = ['reg_instance', 'reg_impression_id', 'logger_id', 'submission_id', 'app_id'];
    commonFields.forEach(field => {
        if (!formData[field]) {
            const val = $(`input[name="${field}"]`).val();
            if (val) formData[field] = val;
        }
    });

    if (!formData.reg_impression_id) {
        formData.reg_impression_id = 'MOBILE_SIGNUP_V8_ENHANCED_' + Date.now();
    }

    return formData;
};

const performInitialNavigationAdvanced = async (session, statusMsg) => {
    await statusMsg.edit({ content: '🌍 Establishing initial connection to Facebook...' });
    await createDelay(CONFIG.DELAYS.NAVIGATION);

    const response = await session.get(CONFIG.BASE_FB_URL + '/', {
        headers: {
            'Referer': 'https://www.google.com/',
            'Sec-Fetch-Site': 'cross-site',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        }
    });

    if (response.status >= 400) {
        throw new Error(`Homepage access failed with status ${response.status}`);
    }

    const responseText = String(response.data).toLowerCase();
    if (responseText.includes("not available on this browser") || 
        responseText.includes("update your browser") ||
        responseText.includes("unsupported browser")) {
        throw new Error("Facebook indicated browser/environment not supported");
    }

    await statusMsg.edit({ content: '🏠 Connection established. Locating registration...' });
    return response;
};

const fetchRegistrationPageAdvanced = async (session, statusMsg, initialReferer) => {
    const registrationUrls = [
        CONFIG.BASE_FB_URL + '/r.php',
        CONFIG.BASE_FB_URL + '/reg/',
        CONFIG.BASE_FB_URL + '/signup/lite/',
        CONFIG.BASE_FB_URL + '/signup/',
        CONFIG.BASE_FB_URL + '/register/'
    ];

    let lastError = null;
    
    for (const url of registrationUrls) {
        try {
            await statusMsg.edit({ 
                content: `📄 Accessing registration: ${new URL(url).pathname}...` 
            });
            await createDelay(CONFIG.DELAYS.NAVIGATION);

            const response = await session.get(url, {
                headers: {
                    'Referer': initialReferer,
                    'Sec-Fetch-Site': 'same-origin',
                    'Sec-Fetch-User': '?1',
                    'Cache-Control': 'max-age=0'
                }
            });

            if (response?.status === 200 && response?.data) {
                const responseData = String(response.data);
                const responseUrl = response.request?.res?.responseUrl || url;

                const validationChecks = [
                    'create new account',
                    'reg_email__',
                    'firstname',
                    'sign up for facebook',
                    'registration_form',
                    'birthday_day'
                ];

                if (validationChecks.some(check => responseData.toLowerCase().includes(check))) {
                    await statusMsg.edit({ content: '🔍 Registration page found. Extracting form data...' });
                    const formData = extractFormDataAdvanced(responseData);
                    
                    if (!formData.fb_dtsg || !formData.jazoest || !formData.lsd) {
                        throw new Error('Critical form tokens missing');
                    }
                    
                    return { formData, responseDataHtml: responseData, responseUrl };
                }
            }
            
            lastError = new Error(`Invalid response from ${url}`);
        } catch (error) {
            lastError = error;
            await createDelay(CONFIG.DELAYS.SHORT_INTERACTION);
        }
    }

    const message = lastError ? 
        `Failed to access registration page. Last error: ${lastError.message}` :
        'No suitable registration page found';
    throw new Error(message);
};

const createSubmissionPayloadAdvanced = (formData, email, password, nameInfo, dob, gender, pageHtml) => {
    const payload = new URLSearchParams();

    payload.append('firstname', nameInfo.firstName);
    payload.append('lastname', nameInfo.lastName);
    payload.append('reg_email__', email);
    payload.append('reg_email_confirmation__', email);
    payload.append('reg_passwd__', password);
    payload.append('birthday_day', dob.day.toString());
    payload.append('birthday_month', dob.month.toString());
    payload.append('birthday_year', dob.year.toString());
    payload.append('sex', gender);
    payload.append('websubmit', '1');
    payload.append('submit', 'Sign Up');

    const $ = cheerio.load(pageHtml);
    $('input[type="hidden"]').each((_, el) => {
        const name = $(el).attr('name');
        const value = $(el).attr('value');
        if (name && value !== undefined && !payload.has(name)) {
            payload.append(name, value);
        }
    });

    Object.entries(formData).forEach(([key, value]) => {
        if (value && typeof value === 'string' && !payload.has(key)) {
            payload.append(key, value);
        }
    });

    ['fb_dtsg', 'jazoest', 'lsd'].forEach(key => {
        if (formData[key]) payload.set(key, formData[key]);
    });

    if (!payload.has('encpass') && password) {
        const timestamp = Math.floor(Date.now() / 1000);
        payload.append('encpass', `#PWD_BROWSER:0:${timestamp}:${password}`);
    }

    if (!payload.has('reg_instance')) {
        payload.append('reg_instance', formData.reg_instance || 
            'MOBILE_ENHANCED_' + Math.random().toString(36).substring(2, 10));
    }

    if (!payload.has('locale')) payload.append('locale', 'en_US');
    if (!payload.has('client_country_code')) payload.append('client_country_code', 'US');

    return payload;
};

const attemptRegistrationAdvanced = async (session, payload, refererUrl, statusMsg, proxyInUse) => {
    const submitEndpoints = [
        CONFIG.BASE_FB_URL + '/reg/submit/',
        CONFIG.BASE_FB_URL + '/signup/account/create/',
        refererUrl
    ];

    let lastError = null;
    let submitResponse = null;
    let responseText = '';
    let success = false;
    let checkpoint = false;
    let humanChallenge = false;
    let finalUrl = refererUrl;

    for (const endpoint of submitEndpoints) {
        if (!endpoint || !endpoint.startsWith('http')) continue;

        try {
            await statusMsg.edit({ 
                content: `📨 Submitting registration to: ${new URL(endpoint).pathname}...` 
            });
            await createDelay(CONFIG.DELAYS.SUBMISSION);

            submitResponse = await session.post(endpoint, payload.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': refererUrl,
                    'Origin': CONFIG.BASE_FB_URL,
                    'Sec-Fetch-Site': 'same-origin',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Dest': 'empty'
                },
                timeout: 120000
            });

            responseText = typeof submitResponse.data === 'string' ? 
                submitResponse.data : JSON.stringify(submitResponse.data);
            finalUrl = submitResponse.request?.res?.responseUrl || endpoint;

            const currentCookies = await session.defaults.jar.getCookieString(finalUrl);

            const challengeIndicators = [
                'confirm you\'re human',
                'confirm that you are not a robot',
                'solve this security check',
                'recaptcha',
                'hcaptcha',
                'security check'
            ];

            const checkpointIndicators = [
                'checkpoint',
                'confirmation_code',
                'confirmemail.php',
                'verifyyouraccount',
                'verify your account',
                'code sent to your email'
            ];

            const successIndicators = [
                'welcome to facebook',
                'profile.php',
                'home.php'
            ];

            if (challengeIndicators.some(indicator => 
                responseText.toLowerCase().includes(indicator) || 
                finalUrl.includes('/challenge/') || 
                finalUrl.includes('/checkpoint/challenge/')
            )) {
                humanChallenge = true;
                checkpoint = true;
                success = false;
            } else if (currentCookies.includes('c_user=') && !currentCookies.includes('c_user=0')) {
                success = true;
            } else if (checkpointIndicators.some(indicator => 
                responseText.toLowerCase().includes(indicator) ||
                currentCookies.includes('checkpoint=')
            )) {
                checkpoint = true;
                success = true;
            } else if (successIndicators.some(indicator => 
                responseText.toLowerCase().includes(indicator)
            )) {
                success = true;
            } else if (submitResponse.status === 302 && 
                       submitResponse.headers.location && 
                       (submitResponse.headers.location.includes('home.php') || 
                        submitResponse.headers.location.includes('profile.php'))) {
                success = true;
            }

            if (submitResponse.status >= 400 && !checkpoint && !humanChallenge) {
                success = false;
                lastError = new Error(`Submission failed with status ${submitResponse.status}`);
            } else if (!humanChallenge) {
                lastError = null;
            }

            if (success || humanChallenge) break;

        } catch (error) {
            lastError = error;
            const isProxyError = proxyInUse && [
                'ECONNRESET', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 
                'ENOTFOUND', 'ECONNREFUSED'
            ].some(code => error.code?.includes(code) || error.message?.includes(code.toLowerCase()));

            if (isProxyError) {
                await statusMsg.edit({ 
                    content: `⚠️ Proxy connection issue with ${new URL(endpoint).pathname}. Trying next...` 
                });
                await createDelay({ min: 3000, max: 5000 });
            }
        }
    }

    if (!success && !humanChallenge && lastError) {
        responseText = `All submission attempts failed. Last error: ${lastError.message}`;
    }

    return { response: submitResponse, responseText, success, checkpoint, humanChallenge, finalUrl };
};

const extractUidAndProfileAdvanced = async (cookieJar, responseText, finalUrl) => {
    let uid = "Not available";
    let profileUrl = "Profile URL not found or confirmation pending.";

    const cookieString = await cookieJar.getCookieString(finalUrl || CONFIG.BASE_FB_URL);
    
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
            } catch (e) {}
        }
    }

    if (uid === "Not available" && responseText) {
        const uidPatterns = [
            /"USER_ID":"(\d+)"/,
            /"actorID":"(\d+)"/,
            /"userID":(\d+)/,
            /"uid":(\d+),/,
            /profile_id=(\d+)/,
            /subject_id=(\d+)/,
            /viewer_id=(\d+)/,
            /\\"uid\\":(\d+)/,
            /\\"user_id\\":\\"(\d+)\\"/,
            /\\"account_id\\":\\"(\d+)\\"/,
            /name="target" value="(\d+)"/,
            /name="id" value="(\d+)"/,
            /"profile_id":(\d+)/,
            /"ent_id":"(\d+)"/
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
        if (urlUidMatch && urlUidMatch[1]) {
            uid = urlUidMatch[1];
        }
    }

    if (uid !== "Not available" && /^\d+$/.test(uid) && uid !== '0') {
        profileUrl = `https://www.facebook.com/profile.php?id=${uid}`;
    }

    return { uid, profileUrl };
};

const sendEnhancedCredentialsMessage = async (
    channel, email, password, uid, profileUrl, accountName, 
    tempEmailProviderName, outcome, proxyUsed, accountNum, 
    totalAccounts, tempEmailData, originalUser
) => {
    const titlePrefix = totalAccounts > 1 ? `Account ${accountNum}/${totalAccounts}: ` : "";
    const embed = new EmbedBuilder()
        .setTitle(titlePrefix + outcome.title)
        .setColor(outcome.color)
        .addFields(
            { name: '👤 Name', value: `\`${accountName.firstName} ${accountName.lastName}\``, inline: true },
            { name: '📧 Email', value: `\`${email}\``, inline: true },
            { name: '🔑 Password', value: `\`${password}\``, inline: true },
            { name: '📨 Email Provider', value: `\`${tempEmailProviderName || 'Unknown'}\``, inline: true }
        );

    if (outcome.otp) {
        embed.addFields({ name: '🔑 OTP Code', value: `\`${outcome.otp}\``, inline: true });
    }

    if (uid && uid !== "Not available" && uid !== "0") {
        embed.addFields({ name: '🆔 User ID', value: `\`${uid}\``, inline: true });
    } else if (outcome.type.startsWith("checkpoint_") || outcome.type === "human_challenge" || outcome.type === "success_otp_fetched") {
        embed.addFields({ name: '🆔 User ID', value: `📬 Available after confirmation`, inline: true });
    } else {
        embed.addFields({ name: '🆔 User ID', value: `\`${uid || 'N/A'}\``, inline: true });
    }

    if (profileUrl && profileUrl.startsWith("https://")) {
        embed.addFields({ name: '🔗 Profile', value: `[View Profile](${profileUrl})`, inline: true });
    } else if (uid && uid !== "Not available" && uid !== "0") {
        embed.addFields({ 
            name: '🔗 Profile', 
            value: `[Potential Profile](https://www.facebook.com/profile.php?id=${uid}) (Verify after confirmation)`, 
            inline: true 
        });
    }

    if (proxyUsed) {
        embed.addFields({ name: '🌐 Proxy', value: `\`${proxyUsed.split(':')[0]}:${proxyUsed.split(':')[1]}\``, inline: true });
    }

    embed.setDescription(outcome.message);
    embed.setTimestamp();

    const components = [];
    const actionRow = new ActionRowBuilder();
    let addedButtons = false;

    if ((outcome.type === "checkpoint_manual_needed" || outcome.type === "success_initial_otp_failed") && 
        tempEmailData?.sessionId) {
        actionRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`retry_otp_${tempEmailData.sessionId}_${email}_${accountNum}`)
                .setLabel('Retry OTP')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔄')
        );
        addedButtons = true;
    }

    if (profileUrl && profileUrl.startsWith("https://")) {
        actionRow.addComponents(
            new ButtonBuilder()
                .setLabel('View Profile')
                .setStyle(ButtonStyle.Link)
                .setURL(profileUrl)
                .setEmoji('👤')
        );
        addedButtons = true;
    }

    actionRow.addComponents(
        new ButtonBuilder()
            .setCustomId(`delete_fb_msg_marker_${accountNum}`)
            .setLabel('Delete Message')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️')
    );
    addedButtons = true;

    if (addedButtons) components.push(actionRow);

    try {
        const sentMessage = await channel.send({ embeds: [embed], components });

        if (sentMessage && originalUser && (outcome.type === "checkpoint_manual_needed" || outcome.type === "success_initial_otp_failed")) {
            const filter = i => (i.customId.startsWith(`retry_otp_`) || i.customId.startsWith(`delete_fb_msg_marker_`)) && 
                               i.user.id === originalUser.id;
            const collector = sentMessage.createMessageComponentCollector({ 
                filter, 
                time: CONFIG.BUTTON_COLLECTOR_TIMEOUT_MS 
            });

            collector.on('collect', async i => {
                if (i.customId.startsWith('retry_otp_')) {
                    const [, , sessionId, emailAddr, accNum] = i.customId.split('_');
                    
                    const currentComponents = i.message.components.map(r => 
                        new ActionRowBuilder().addComponents(
                            r.components.map(b => 
                                ButtonBuilder.from(b).setDisabled(b.customId === i.customId)
                                    .setLabel(b.customId === i.customId ? 'Retrying...' : b.label)
                            )
                        )
                    );
                    await i.update({ components: currentComponents });

                    const otpStatusMsg = await i.message.channel.send({ 
                        content: `⏳ Retrying OTP fetch for account ${accNum} (\`${emailAddr}\`)...` 
                    });

                    try {
                        const otp = await fetchOtpAdvanced(sessionId, otpStatusMsg, emailAddr);
                        
                        const updatedEmbed = EmbedBuilder.from(i.message.embeds[0])
                            .setTitle(`✅ Acc ${accNum}: OTP Retrieved Successfully!`)
                            .setDescription(`Account ready! **OTP Code: \`${otp}\`**\nUse with email \`${emailAddr}\`.`)
                            .setColor(0x00FF00);

                        const fields = updatedEmbed.data.fields || [];
                        const otpFieldIndex = fields.findIndex(field => field.name === '🔑 OTP Code');
                        if (otpFieldIndex > -1) {
                            fields[otpFieldIndex].value = `\`${otp}\``;
                        } else {
                            fields.push({ name: '🔑 OTP Code', value: `\`${otp}\``, inline: true });
                        }
                        updatedEmbed.setFields(fields);

                        const finalComponents = new ActionRowBuilder();
                        i.message.components.forEach(r => r.components.forEach(b => {
                            if (b.customId?.startsWith(`delete_fb_msg_marker_`)) {
                                finalComponents.addComponents(ButtonBuilder.from(b).setDisabled(false));
                            }
                        }));

                        await i.message.edit({ 
                            embeds: [updatedEmbed], 
                            components: finalComponents.components.length > 0 ? [finalComponents] : [] 
                        });
                        await otpStatusMsg.edit({ content: `✅ OTP \`${otp}\` retrieved for account ${accNum}!` });
                    } catch (otpError) {
                        const failedEmbed = EmbedBuilder.from(i.message.embeds[0])
                            .setTitle(`📬 Acc ${accNum}: Manual Confirmation Required`)
                            .setDescription(`OTP retry failed: ${otpError.message.substring(0, 150)}.\nCheck email manually.`)
                            .setColor(0xFFA500);

                        const disabledComponents = i.message.components.map(r => 
                            new ActionRowBuilder().addComponents(
                                r.components.map(b => 
                                    ButtonBuilder.from(b).setDisabled(b.customId?.startsWith('retry_otp_'))
                                        .setLabel(b.customId?.startsWith('retry_otp_') ? 'Retry Failed' : b.label)
                                )
                            )
                        );

                        await i.message.edit({ embeds: [failedEmbed], components: disabledComponents });
                        await otpStatusMsg.edit({ content: `❌ OTP retry failed for account ${accNum}.` });
                    }

                    setTimeout(() => otpStatusMsg?.delete().catch(() => {}), 10000);
                } else if (i.customId.startsWith(`delete_fb_msg_marker_`)) {
                    if (i.user.id === originalUser.id) {
                        await i.message.delete().catch(() => {});
                        collector.stop('message_deleted');
                    } else {
                        await i.reply({ 
                            content: "You don't have permission to delete this message.", 
                            ephemeral: true 
                        });
                    }
                }
            });

            collector.on('end', (collected, reason) => {
                if (reason !== 'message_deleted' && sentMessage.deletable && sentMessage.components.length > 0) {
                    const disabledComponents = sentMessage.components.map(r => 
                        new ActionRowBuilder().addComponents(
                            r.components.map(b => ButtonBuilder.from(b).setDisabled(true))
                        )
                    );
                    sentMessage.edit({ components: disabledComponents }).catch(() => {});
                }
            });
        }

        return sentMessage;
    } catch (sendError) {
        try {
            await channel.send({ 
                content: `Error sending embed for Account ${accountNum}, fallback: ${outcome.title} - Email: ${email} Pass: ${password} UID: ${uid}` 
            });
        } catch (fallbackError) {}
        return null;
    }
};

async function createSingleFacebookAccountAdvanced(
    channel, originalUser, proxyString, userAgentData, 
    accountNum, totalAccounts, providerForEmail
) {
    const credentials = generateSecureCredentials();
    let statusMsg, tempEmailData = null, sessionForProxyCheck;
    let tempEmailProviderActual = 'N/A';
    const userAgentString = userAgentData.toString();

    const initialStatusContent = `⏳ Initializing Enhanced FB Account ${accountNum}/${totalAccounts}${
        providerForEmail !== "random" ? ` (Provider: ${providerForEmail})` : ''
    }${proxyString ? ` with proxy: \`${proxyString.split(':')[0]}:${proxyString.split(':')[1]}\`` : ''}...`;
    
    statusMsg = await channel.send({ content: initialStatusContent });

    try {
        await createDelay(CONFIG.DELAYS.VERY_SHORT);
        tempEmailData = await fetchTemporaryEmailAdvanced(statusMsg, providerForEmail);
        const emailToUse = tempEmailData.email;
        tempEmailProviderActual = tempEmailData.providerName;

        const session = createEnhancedSession(userAgentData, proxyString);
        sessionForProxyCheck = session;

        const proxyStatusMessage = proxyString ? 
            (session.defaults.proxy ? `Proxy \`${proxyString.split(':')[0]}:${proxyString.split(':')[1]}\` active.` : 
             `Proxy "${proxyString}" invalid. No proxy.`) : 'No proxy.';

        await statusMsg.edit({ 
            content: `🔧 Account ${accountNum}/${totalAccounts}: ${proxyStatusMessage}\n📧 Email: \`${emailToUse}\` (${tempEmailProviderActual})` 
        });

        await createDelay(CONFIG.DELAYS.NAVIGATION);
        const initialNavResponse = await performInitialNavigationAdvanced(session, statusMsg);
        await createDelay(CONFIG.DELAYS.SHORT_INTERACTION);

        const initialReferer = initialNavResponse?.request?.res?.responseUrl || CONFIG.BASE_FB_URL + '/';
        const { formData, responseDataHtml, responseUrl } = await fetchRegistrationPageAdvanced(
            session, statusMsg, initialReferer
        );

        if (!formData?.fb_dtsg || !formData?.jazoest || !formData?.lsd) {
            throw new Error('Failed to extract critical form data (fb_dtsg, jazoest, lsd).');
        }

        await createDelay(CONFIG.DELAYS.SHORT_INTERACTION);

        const currentYear = new Date().getFullYear();
        const dobData = {
            day: Math.floor(Math.random() * 28) + 1,
            month: Math.floor(Math.random() * 12) + 1,
            year: currentYear - (Math.floor(Math.random() * (55 - 18 + 1)) + 18)
        };
        const gender = Math.random() > 0.5 ? '1' : '2';

        const payload = createSubmissionPayloadAdvanced(
            formData, emailToUse, credentials.password, credentials, dobData, gender, responseDataHtml
        );

        const submissionResult = await attemptRegistrationAdvanced(
            session, payload, responseUrl, statusMsg, !!(proxyString && session.defaults.proxy)
        );

        const { uid, profileUrl } = await extractUidAndProfileAdvanced(
            session.defaults.jar, submissionResult.responseText, submissionResult.finalUrl
        );

        let outcome;

        if (submissionResult.humanChallenge) {
            outcome = {
                type: "human_challenge",
                title: "🛡️ Human Verification Required!",
                color: 0xFF8C00,
                message: `Account ${accountNum} encountered human verification challenge. Manual intervention needed.`
            };
        } else if (!submissionResult.success && !submissionResult.checkpoint) {
            let errorDetail = "Facebook rejected registration or unknown error.";
            if (submissionResult.responseText) {
                const $ = cheerio.load(submissionResult.responseText);
                errorDetail = $('#reg_error_inner').text().trim() || 
                            $('div[role="alert"]').text().trim() ||
                            $('._585n, ._585r, ._ajax_error_payload').first().text().trim() ||
                            (submissionResult.responseText.length < 300 ? 
                             submissionResult.responseText : 
                             submissionResult.responseText.substring(0, 300) + "...");
                if (!errorDetail || errorDetail.length < 10) {
                    errorDetail = "Facebook response unclear or structure changed.";
                }
            }
            outcome = {
                type: "failure",
                title: "❌ Account Creation Failed!",
                color: 0xFF0000,
                message: `**Reason:** ${errorDetail}`
            };
        } else {
            await statusMsg.edit({ 
                content: `📬 Account ${accountNum}/${totalAccounts}: Registration submitted. Fetching OTP for \`${emailToUse}\`...` 
            });
            
            try {
                const otp = await fetchOtpAdvanced(tempEmailData.sessionId, statusMsg, emailToUse);
                outcome = {
                    type: "success_otp_fetched",
                    otp: otp,
                    title: "✅ Account Created Successfully!",
                    color: 0x00FF00,
                    message: `New Facebook account ready! **OTP Code: \`${otp}\`**. Use with email \`${emailToUse}\`.`
                };
            } catch (otpError) {
                outcome = {
                    type: "checkpoint_manual_needed",
                    title: "📬 Manual Confirmation Required!",
                    color: 0xFFA500,
                    message: `Registration submitted successfully. Failed to fetch OTP for \`${emailToUse}\`: ${otpError.message.substring(0, 120)}.\nCheck email manually for confirmation code.`
                };
            }
        }

        await sendEnhancedCredentialsMessage(
            channel, emailToUse, credentials.password, uid, profileUrl, 
            credentials, tempEmailProviderActual, outcome, 
            proxyString && sessionForProxyCheck?.defaults?.proxy ? proxyString : null,
            accountNum, totalAccounts, tempEmailData, originalUser
        );

        if (statusMsg?.deletable) {
            await statusMsg.delete().catch(() => {});
        }

        return outcome;
    } catch (error) {
        let errorMessage = error.message || "Unexpected critical error.";
        const actualProxyInUse = proxyString && sessionForProxyCheck?.defaults?.proxy;
        
        const proxyRelatedErrorCodes = ['ECONNRESET', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'];
        const proxyRelatedErrorMessages = ['proxy connect', 'proxy authentication required', 'decompression failed', 'parse error', 'socket hang up'];
        
        const isProxyRelatedNetworkError = actualProxyInUse && (
            (error.code && proxyRelatedErrorCodes.some(code => String(error.code).toUpperCase().includes(code))) ||
            (proxyRelatedErrorMessages.some(msg => String(error.message).toLowerCase().includes(msg)))
        );

        if (isProxyRelatedNetworkError) {
            errorMessage = `Connection/proxy error (\`${error.code || 'N/A'}\`) with proxy \`${proxyString}\`: ${error.message}\n\n⚠️ **Proxy issue.** Verify proxy details & stability.`;
        } else if (error.message?.toLowerCase().includes("not available on this browser") || 
                   error.message?.toLowerCase().includes("update your browser")) {
            errorMessage = `Facebook indicated browser/environment not supported: "${error.message}"\n\nTry different User-Agent or proxy.`;
        } else if (error.message?.startsWith('Failed to fetch temporary email:')) {
            errorMessage = `Critical: ${error.message}\nTemp email service issue. Check API or provider name.`;
        } else if (error.response) {
            errorMessage += ` | HTTP Status: ${error.response.status}`;
            if (error.response.data) {
                errorMessage += ` | Response: ${String(error.response.data).substring(0, 150).replace(/\n/g, ' ')}`;
            }
        }

        const criticalFailureOutcome = {
            type: "critical_failure",
            title: "💥 Critical Error During Creation!",
            color: 0xFF0000,
            message: `${errorMessage.substring(0, 1900)}`
        };

        await sendEnhancedCredentialsMessage(
            channel, tempEmailData?.email || "N/A", credentials.password, 
            "N/A", "N/A", credentials, tempEmailProviderActual, criticalFailureOutcome,
            actualProxyInUse ? proxyString : null, accountNum, totalAccounts, 
            tempEmailData, originalUser
        );

        if (statusMsg?.deletable) {
            await statusMsg.delete().catch(() => {});
        }

        throw error;
    }
}

module.exports = {
    name: 'fbcreatev8',
    description: 'Enhanced Facebook account creator with advanced anti-detection, improved error handling, and robust OTP fetching. Usage: !fbcreatev8 [provider] [count] [proxy] OR !fbcreatev8 [count] [proxy]. All parameters optional.',
    admin_only: false,
    async execute(message, args) {
        let initialReplyMessage;
        try {
            let amountAccounts = 1;
            let proxyString = null;
            let providerName = "random";

            if (args.length === 0) {
            } else if (/^\d+$/.test(args[0]) && parseInt(args[0]) > 0) {
                amountAccounts = parseInt(args[0]);
                providerName = "random";
                if (args.length > 1 && typeof args[1] === 'string' && args[1].includes(':')) {
                    proxyString = args[1];
                }
            } else {
                if (typeof args[0] === 'string' && args[0].includes(':')) {
                    proxyString = args[0];
                    providerName = "random";
                    if (args.length > 1 && /^\d+$/.test(args[1]) && parseInt(args[1]) > 0) {
                        amountAccounts = parseInt(args[1]);
                    }
                } else {
                    providerName = args[0];
                    if (args.length > 1) {
                        if (/^\d+$/.test(args[1]) && parseInt(args[1]) > 0) {
                            amountAccounts = parseInt(args[1]);
                            if (args.length > 2 && typeof args[2] === 'string' && args[2].includes(':')) {
                                proxyString = args[2];
                            }
                        } else if (typeof args[1] === 'string' && args[1].includes(':')) {
                            proxyString = args[1];
                        }
                    }
                }
            }

            amountAccounts = Math.max(1, Math.min(amountAccounts, CONFIG.MAX_CONCURRENT_ACCOUNTS));
            
            const providerInfo = providerName !== "random" ? ` (Provider: ${providerName})` : ' (Provider: random)';
            const initialReplyText = `🚀 Starting Enhanced Ultra-Stealth Facebook account creation for ${amountAccounts} account(s)${providerInfo}. Please wait...`;
            
            try {
                initialReplyMessage = await message.reply(initialReplyText);
            } catch (e) {
                initialReplyMessage = await message.channel.send(initialReplyText);
            }

            const accountCreationPromises = [];
            for (let i = 1; i <= amountAccounts; i++) {
                const userAgentDataForThisAccount = generateAdvancedUserAgent();
                accountCreationPromises.push(
                    createSingleFacebookAccountAdvanced(
                        message.channel, message.author, proxyString, 
                        userAgentDataForThisAccount, i, amountAccounts, providerName
                    )
                );
                
                if (i < amountAccounts) {
                    await createDelay(CONFIG.DELAYS.STAGGER);
                }
            }

            const results = await Promise.allSettled(accountCreationPromises);
            let successCount = 0;
            let failureCount = 0;

            results.forEach(result => {
                if (result.status === 'fulfilled') {
                    const outcome = result.value;
                    if (outcome?.type === "success_otp_fetched") {
                        successCount++;
                    } else {
                        failureCount++;
                    }
                } else {
                    failureCount++;
                }
            });

            const finalMessageChannel = initialReplyMessage?.channel || message.channel;
            if (finalMessageChannel?.send) {
                await finalMessageChannel.send(
                    `🏁 Enhanced batch creation completed. ` +
                    `Attempts: ${amountAccounts}, ` +
                    `OTP Verified: ${successCount}, ` +
                    `Checkpoints/Failures: ${failureCount}. ` +
                    `Check individual messages above.`
                );
            }

        } catch (error) {
            try {
                if (message?.channel?.send) {
                    await message.channel.send(`🚨 Critical error in fbcreatev8: ${error.message}.`);
                }
            } catch (e) {}
        }
    }
};