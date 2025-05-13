const axios = require('axios');
const cheerio = require('cheerio');
const { faker } = require('@faker-js/faker');
// user-agents library is good, but for more explicit control and variety,
// we'll define a list. If you prefer the library, you can switch back.
// const UserAgent = require('user-agents');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { CookieJar } = require('tough-cookie');
const { wrapper: axiosCookieJarSupport } = require('axios-cookiejar-support');

const BASE_FB_MOBILE_URL = 'https://m.facebook.com';
const TEMP_EMAIL_API_URL = 'https://email-api-tv55.onrender.com'; // Consider making this configurable or having fallbacks
const DEFAULT_TIMEOUT = 60000; // Increased default timeout for network operations
const OTP_POLL_INTERVAL = 4 * 1000; // Slightly increased poll interval
const OTP_POLL_DURATION = 1.5 * 60 * 1000; // Slightly increased OTP wait time

// List of diverse and recent mobile User-Agents
const USER_AGENTS = [
    "Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 13; SM-A536U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 12; SM-G991U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 12; Pixel 6 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/112.0.5615.46 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 11; SM-A125F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 13; M2101K6G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36"
];

const generateUserAgent = () => {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
};

// Helper function for more human-like delays
const humanLikeDelay = (minMilliseconds = 1000, maxMilliseconds = 3000) => {
    const delay = Math.random() * (maxMilliseconds - minMilliseconds) + minMilliseconds;
    return new Promise(resolve => setTimeout(resolve, delay));
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
        if (parts.length === 2) { // host:port
            axiosProxyConfig = { protocol: 'http', host: parts[0], port: parseInt(parts[1], 10) };
        } else if (parts.length >= 4) { // host:port:user:pass
            let username = parts[2].startsWith('@') ? parts[2].substring(1) : parts[2]; // Handle if user accidentally adds @
            axiosProxyConfig = { protocol: 'http', host: parts[0], port: parseInt(parts[1], 10), auth: { username: username, password: parts.slice(3).join(':') } };
        }
        // Validate parsed proxy config
        if (axiosProxyConfig && (isNaN(axiosProxyConfig.port) || !axiosProxyConfig.host)) {
            axiosProxyConfig = null; // Invalid proxy format
        }
    }

    const baseHeaders = {
        'User-Agent': userAgentString,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9', // Common accept language
        // 'Sec-CH-UA': '"Chromium";v="112", "Google Chrome";v="112", "Not:A-Brand";v="99"', // Example Client Hint, careful with static values
        // 'Sec-CH-UA-Mobile': '?1',
        // 'Sec-CH-UA-Platform': '"Android"',
        // Client Hints are powerful but hard to manage without a browser.
        // Keeping them commented out unless you have a dynamic way to set them matching the UA.
    };

    // Accept-Encoding: Let Axios handle this by default, but if issues with proxies arise,
    // you might need to set it to 'gzip, deflate, br' or 'identity' if proxy mangles compressed responses.
    if (axiosProxyConfig) {
        // Some proxies might have issues with compression, 'identity' can be a fallback.
        // However, 'gzip, deflate, br' is standard. Test what works best with your proxies.
        baseHeaders['Accept-Encoding'] = 'gzip, deflate, br';
    } else {
        baseHeaders['Accept-Encoding'] = 'gzip, deflate, br';
    }

    const session = axios.create({
        jar: jar,
        withCredentials: true,
        headers: baseHeaders,
        timeout: DEFAULT_TIMEOUT,
        maxRedirects: 10, // Standard number of redirects
        validateStatus: (status) => status >= 200 && status < 501, // Accept a wide range of success/redirect/server error statuses for analysis
        proxy: axiosProxyConfig,
    });
    axiosCookieJarSupport(session); // Apply cookie jar support
    return session;
};

const fetchTemporaryEmail = async (statusMsg) => {
    await statusMsg.edit({ content: '📧 Requesting a temporary email address...' });
    await humanLikeDelay(500, 1500); // Small delay before API call
    try {
        const response = await axios.get(`${TEMP_EMAIL_API_URL}/gen?provider_name=random`, { timeout: 25000 });
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
    // Comprehensive OTP patterns, ensure they are effective
    const otpPatterns = [
        /\bFB[- ]?(\d{5,8})\b/i, // FB-12345 or FB 12345
        /(\d{5,8})\s+is\s+your\s+Facebook\s+(?:confirmation|security|login|access|verification)\s+code/i,
        /Your\s+Facebook\s+(?:confirmation|security|login|access|verification)\s+code\s+is\s+(\d{5,8})/i,
        /Facebook\s+(?:confirmation|security|login|access|verification)\s+code:\s*(\d{5,8})/i,
        /G-(\d{6,8})/i, // Google related, sometimes FB uses similar format via Google Auth
        /\b(\d{5,8})\b\s*(?:is\syour|is\sthe|is)\s*Facebook.*?code/i,
        /Facebook.*?(?:code|OTP|token)\s*is\s*\b(\d{5,8})\b/i,
        /Facebook.*?\b(\d{5,8})\b\s*is\s*(?:your|the)\s*.*?code/i,
        /Enter\s+this\s+code\s+to\s+(?:confirm|verify)\s+your\s+account:\s*(\d{5,8})/i,
        /(?:confirmation|verification|security|access|login)\s+code\s*:\s*\b(\d{5,8})\b/i,
        /Your\s+(?:code|OTP)\s+is\s+\b(\d{5,8})\b/i,
        /Facebook[^\w\d]*\b(\d{5,8})\b/i, // OTP near "Facebook" with non-alphanumeric separators
        /\b(\d{5,8})\b[^\w\d]*Facebook/i, // OTP before "Facebook"
        /\b(\d{5,8})\b/i // Generic 5-8 digit code (last resort, ensure it's from a Facebook email)
    ];

    while (Date.now() - startTime < OTP_POLL_DURATION) {
        try {
            await humanLikeDelay(OTP_POLL_INTERVAL - 500, OTP_POLL_INTERVAL + 500); // Slightly randomized poll interval
            const response = await axios.get(`${TEMP_EMAIL_API_URL}/sessions/${tempEmailSessionId}/messages`, { timeout: 20000 });
            if (response.data && Array.isArray(response.data)) {
                for (const message of response.data) {
                    let emailTextContent = message.body || '';
                    if (!emailTextContent && message.html) { // Extract text from HTML if body is empty
                        if (Array.isArray(message.html)) {
                            emailTextContent = cheerio.load(message.html.join(' ')).text();
                        } else if (typeof message.html === 'string') {
                            emailTextContent = cheerio.load(message.html).text();
                        }
                    }
                    const emailBody = emailTextContent.trim();

                    if (emailBody) {
                        // Prioritize emails clearly from Facebook for the generic OTP pattern
                        const fromFacebook = message.from && typeof message.from === 'string' && message.from.toLowerCase().includes('facebook');
                        const subjectFacebook = message.subject && typeof message.subject === 'string' && message.subject.toLowerCase().includes('facebook');

                        for (let i = 0; i < otpPatterns.length; i++) {
                            const pattern = otpPatterns[i];
                            const isLastPattern = i === otpPatterns.length - 1; // The most generic pattern

                            // For the last, most generic pattern, be more certain it's a Facebook email
                            if (isLastPattern && !(fromFacebook || subjectFacebook || emailBody.toLowerCase().includes('facebook'))) {
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
            // Log low-level errors if needed, but continue polling
            // console.error("Error polling for OTP:", error.message);
        }
        const timeLeft = Math.max(0, OTP_POLL_DURATION - (Date.now() - startTime));
        await statusMsg.edit({ content: `⏳ Waiting for Facebook OTP... (Checking again in ~${Math.round(OTP_POLL_INTERVAL / 1000)}s. Time left: ~${Math.round(timeLeft/1000)}s)` });
    }
    throw new Error('OTP not received within the time limit.');
};

const extractFormDataV2 = (html, formSelector = 'form[action*="/reg/"], form[id="registration_form"]') => {
    const formData = {};
    const $ = cheerio.load(html);
    let registrationForm = $(formSelector).first();

    // Broader selection for registration form if initial selector fails
    if (registrationForm.length === 0) {
        registrationForm = $('form').filter((i, el) => {
            const action = $(el).attr('action');
            const id = $(el).attr('id');
            return (action && (action.includes('/reg/') || action.includes('/r.php') || action.includes('signup'))) ||
                   (id && (id.includes('reg') || id.includes('signup')));
        }).first();
    }
    
    if (registrationForm.length) {
        registrationForm.find('input').each((_, el) => {
            const name = $(el).attr('name');
            const value = $(el).attr('value');
            if (name) formData[name] = value || ''; // Store even if value is empty, might be intended
        });
    }

    // Attempt to extract fb_dtsg, jazoest, lsd from various script and meta locations
    // This part is crucial for anti-detection as these tokens are often validated
    $('script').each((_, scriptTag) => {
        const scriptContent = $(scriptTag).html();
        if (!scriptContent) return;
        try {
            // Try parsing JSON-like structures within scripts
            const jsonMatches = scriptContent.match(/\{(?:[^{}]|(?:\{[^{}]*\}))*\}/g) || [];
            for (const match of jsonMatches) {
                try {
                    const jsonObj = JSON.parse(match);
                    if (jsonObj.fb_dtsg && !formData.fb_dtsg) formData.fb_dtsg = jsonObj.fb_dtsg;
                    if (jsonObj.jazoest && !formData.jazoest) formData.jazoest = jsonObj.jazoest;
                    if (jsonObj.lsd && !formData.lsd) formData.lsd = jsonObj.lsd;
                } catch (e) { /* Suppress JSON parse errors for non-JSON parts */ }
            }
        } catch(e) { /* Suppress errors from script content processing */ }

        // Regex for direct assignment if JSON parsing fails or isn't applicable
        if (!formData.fb_dtsg) formData.fb_dtsg = (scriptContent.match(/['"]fb_dtsg['"]\s*:\s*['"]([^'"]+)['"]/) || [])[1] || (scriptContent.match(/name="fb_dtsg" value="([^"]+)"/) || [])[1];
        if (!formData.jazoest) formData.jazoest = (scriptContent.match(/['"]jazoest['"]\s*:\s*['"]([^'"]+)['"]/) || [])[1] || (scriptContent.match(/name="jazoest" value="([^"]+)"/) || [])[1];
        if (!formData.lsd) formData.lsd = (scriptContent.match(/['"]lsd['"]\s*:\s*['"]([^'"]+)['"]/) || [])[1] || (scriptContent.match(/name="lsd" value="([^"]+)"/) || [])[1];
    });

    // Fallback to meta tags or input fields if not found in scripts
    if (!formData.fb_dtsg) formData.fb_dtsg = $('meta[name="fb_dtsg"]').attr('content') || $('input[name="fb_dtsg"]').val();
    if (!formData.jazoest) formData.jazoest = $('meta[name="jazoest"]').attr('content') || $('input[name="jazoest"]').val();
    if (!formData.lsd) formData.lsd = $('input[name="lsd"]').val(); // Prioritize lsd from input if available

    // Fallback generation if tokens are still missing - this is a weak point for detection but necessary if not found
    // Facebook's actual generation is complex and JS-based. These are simplified approximations.
    if (!formData.fb_dtsg) {
        formData.fb_dtsg = 'AQH' + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
        // console.warn("Warning: fb_dtsg not found on page, generated fallback.");
    }
    if (!formData.jazoest) {
        let sum = 0;
        for (let i = 0; i < (formData.fb_dtsg || '').length; i++) sum += (formData.fb_dtsg || '').charCodeAt(i);
        formData.jazoest = '2' + sum;
        // console.warn("Warning: jazoest not found on page, generated fallback based on fb_dtsg.");
    }
    if (typeof formData.lsd === 'undefined' || !formData.lsd) { // Ensure lsd is not an empty string before fallback
        formData.lsd = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2,5); // Slightly longer lsd
        // console.warn("Warning: lsd not found on page or was empty, generated fallback.");
    }
    
    // Ensure common registration fields are present
    const commonFields = ['reg_instance', 'reg_impression_id', 'logger_id', 'submission_id'];
    commonFields.forEach(field => { if (!formData[field]) { const val = $(`input[name="${field}"]`).val(); if (val) formData[field] = val; }});
    if (!formData.reg_impression_id) formData.reg_impression_id = 'MOBILE_SIGNUP_V2'; // Updated impression ID

    return formData;
};

const performInitialNavigation = async (session, statusMsg) => {
    let homeResponse;
    try {
        await statusMsg.edit({ content: '🌍 Navigating to Facebook homepage (initial visit)...' });
        await humanLikeDelay(1500, 3500); // Human-like pause before navigation
        homeResponse = await session.get(BASE_FB_MOBILE_URL + '/', {
            headers: { // Mimic browser headers for an initial visit
                'Referer': 'https://www.google.com/', // Common referer
                'Sec-Fetch-Site': 'cross-site',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-User': '?1',
                'Cache-Control': 'no-cache', // Request fresh page
                'Pragma': 'no-cache'
            }
        });
        await humanLikeDelay(2500, 5000); // Longer pause after loading homepage, simulating user reading/deciding

        if (homeResponse.status >= 400) {
            throw new Error(`Homepage visit failed with status ${homeResponse.status}. Response: ${String(homeResponse.data).substring(0, 200)}`);
        }
        if (String(homeResponse.data).toLowerCase().includes("not available on this browser") || String(homeResponse.data).toLowerCase().includes("update your browser")) {
            throw new Error("Facebook indicated browser not supported on homepage visit. Try a different User-Agent.");
        }
        await statusMsg.edit({ content: '🏠 Homepage visited. Proceeding to find signup...' });
    } catch (error) {
        throw error; // Rethrow to be caught by main try-catch
    }
    return homeResponse;
};

const fetchRegistrationPageAndData = async (session, statusMsg, initialReferer = BASE_FB_MOBILE_URL + '/') => {
    await statusMsg.edit({ content: '📄 Navigating to a Facebook signup page...' });
    let regPageResponse;
    const regUrls = [ // Try multiple common registration endpoints
        BASE_FB_MOBILE_URL + '/r.php',
        BASE_FB_MOBILE_URL + '/reg/',
        BASE_FB_MOBILE_URL + '/signup/lite/',
        BASE_FB_MOBILE_URL + '/signup/',
        BASE_FB_MOBILE_URL + '/checkpoint/block/?next=' + encodeURIComponent(BASE_FB_MOBILE_URL + '/r.php') // A more complex path sometimes seen
    ];
    let responseData = '';
    let responseUrl = '';
    let lastError = null;

    for (const url of regUrls) {
        try {
            await statusMsg.edit({ content: `📄 Trying signup page: ${new URL(url).pathname}...` });
            await humanLikeDelay(1000, 2500); // Pause before trying each URL
            regPageResponse = await session.get(url, {
                headers: {
                    'Referer': initialReferer, // Referer from previous FB page or initial visit
                    'Sec-Fetch-Site': 'same-origin',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-User': '?1',
                    'Cache-Control': 'max-age=0', // Often seen for navigation
                }
            });

            if (regPageResponse && regPageResponse.status === 200 && regPageResponse.data) {
                responseData = String(regPageResponse.data);
                responseUrl = regPageResponse.request.res.responseUrl || url; // Actual URL after redirects
                // Check for common registration form elements
                if (responseData.toLowerCase().includes("create new account") || responseData.includes("reg_email__") || responseData.includes("firstname") || responseData.includes("sign up for facebook")) {
                    lastError = null; // Found a suitable page
                    break;
                } else {
                    lastError = new Error(`Content check failed for ${url}. Status: ${regPageResponse.status}. Does not appear to be a signup page. Preview: ${responseData.substring(0,150)}`);
                }
            } else if (regPageResponse) {
                lastError = new Error(`Failed to load ${url} with status ${regPageResponse.status}. Data: ${String(regPageResponse.data).substring(0, 200)}`);
            }
        } catch (err) {
            lastError = err;
        }
        await humanLikeDelay(1200, 1800); // Pause if an attempt fails
    }

    if (!responseData || !responseUrl) {
        const baseMessage = 'Failed to load any suitable Facebook registration page or extract its URL after trying multiple attempts.';
        if (lastError) {
            throw new Error(`${baseMessage} Last error: ${lastError.message}`);
        }
        throw new Error(baseMessage);
    }
    if (String(responseData).toLowerCase().includes("not available on this browser") || String(responseData).toLowerCase().includes("update your browser")) {
        throw new Error("Facebook indicated browser not supported on registration page visit. Try a different User-Agent.");
    }

    await statusMsg.edit({ content: '🔍 Extracting registration form details from page...' });
    await humanLikeDelay(500, 1500); // Pause before extraction
    let formData = extractFormDataV2(responseData);
    
    // Re-validate and ensure critical tokens are present, log if using fallbacks
    if (!formData.fb_dtsg || formData.fb_dtsg.startsWith('AQH') && formData.fb_dtsg.length > 20) { /* Check if it's likely a fallback */ }
    // No specific action here, just be aware. extractFormDataV2 already logs if verbose.

    await statusMsg.edit({ content: '✨ Form data acquired. Preparing submission payload...' });
    return { formData, responseDataHtml: responseData, responseUrl };
};

const prepareSubmissionPayload = (formData, email, password, nameInfo, dob, gender, pageHtml) => {
    const payload = new URLSearchParams();
    // Basic fields
    payload.append('firstname', nameInfo.firstName);
    payload.append('lastname', nameInfo.lastName);
    payload.append('reg_email__', email);
    payload.append('reg_passwd__', password);
    payload.append('birthday_day', dob.day.toString());
    payload.append('birthday_month', dob.month.toString());
    payload.append('birthday_year', dob.year.toString());
    payload.append('sex', gender); // '1' for female, '2' for male, '-1' for custom (if supported)
    payload.append('websubmit', '1'); // Standard form submission indicator
    payload.append('submit', formData.submit || 'Sign Up'); // Use submit button value from form if available
    payload.append('ns', formData.ns || '0'); // Often '0' or '1'

    // Load page HTML to find all hidden fields from the specific form
    const $formPage = cheerio.load(pageHtml);
    let formElement = $formPage('form[action*="/reg/"], form[id="registration_form"], form[action*="signup"]').first();
     if (formElement.length === 0) { // Broader search if specific form not found
        formElement = $formPage('form').filter((i, el) => {
            const action = $formPage(el).attr('action');
            return action && (action.includes('/reg/') || action.includes('/r.php') || action.includes('signup'));
        }).first();
    }

    // Add all hidden input fields from the identified form
    formElement.find('input[type="hidden"]').each((_, el) => {
        const inputName = $formPage(el).attr('name');
        const inputValue = $formPage(el).attr('value');
        if (inputName && typeof inputValue !== 'undefined' && !payload.has(inputName)) {
            payload.append(inputName, inputValue);
        }
    });
    
    // Add other formData elements extracted previously, prioritizing hidden fields from form
    Object.entries(formData).forEach(([key, value]) => {
        if (value && typeof value === 'string' && !payload.has(key)) {
            payload.append(key, value);
        }
    });

    // Ensure critical tokens are set correctly, overriding if necessary from formData
    if (formData.fb_dtsg) payload.set('fb_dtsg', formData.fb_dtsg);
    if (formData.jazoest) payload.set('jazoest', formData.jazoest);
    if (formData.lsd) payload.set('lsd', formData.lsd);

    // Encrypted password field, format can vary. This is a common one.
    if (!payload.has('encpass') && password) {
        const timestamp = Math.floor(Date.now() / 1000); // Current epoch time
        payload.append('encpass', `#PWD_BROWSER:0:${timestamp}:${password}`);
    }
    // Ensure other common registration parameters
    if (!payload.has('reg_instance')) payload.append('reg_instance', formData.reg_instance || Math.random().toString(36).substring(2,12));
    if (!payload.has('reg_impression_id')) payload.append('reg_impression_id', formData.reg_impression_id || 'MOBILE_SIGNUP_V2_ATTEMPT'); // Consistent ID

    return payload;
};

const attemptRegistrationSubmission = async (session, payload, refererUrl, statusMsg, proxyInUse) => {
    // Try multiple common submission endpoints
    const submitEndpoints = [
        BASE_FB_MOBILE_URL + '/reg/submit/',
        BASE_FB_MOBILE_URL + '/signup/account/actor/', // Another endpoint seen
        refererUrl // Sometimes submission is to the same URL as the form page
    ];
    let submitResponse = null;
    let responseText = '';
    let success = false;
    let checkpoint = false;
    let finalUrl = refererUrl; // URL after submission
    let lastError = null;

    for (const endpoint of submitEndpoints) {
        if (!endpoint || !endpoint.startsWith('http')) continue; // Skip invalid endpoints

        try {
            await statusMsg.edit({ content: `📨 Submitting registration to: ${new URL(endpoint).pathname}...` });
            await humanLikeDelay(3000, 6000); // Longer delay before actual submission, simulating final review

            submitResponse = await session.post(endpoint, payload.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': refererUrl, // Referer should be the page where the form was loaded
                    'Origin': BASE_FB_MOBILE_URL, // Origin is the base FB URL
                    'Sec-Fetch-Site': 'same-origin',
                    'X-Requested-With': 'XMLHttpRequest', // Often used for form submissions via JS
                    'Sec-Fetch-Mode': 'cors', // or 'navigate' if it's a full page reload
                    'Sec-Fetch-Dest': 'empty', // or 'document'
                },
                timeout: 75000 // Increased timeout for submission
            });

            responseText = (typeof submitResponse.data === 'string') ? submitResponse.data : JSON.stringify(submitResponse.data);
            finalUrl = submitResponse.request?.res?.responseUrl || endpoint;
            const currentCookies = await session.defaults.jar.getCookieString(finalUrl);

            // Check for success indicators
            if (currentCookies.includes('c_user=') && !currentCookies.includes('c_user=0')) success = true;
            
            // Check for checkpoint indicators
            if (responseText.toLowerCase().includes('checkpoint') ||
                responseText.includes('confirmation_code') || // Needs email/phone confirmation
                responseText.includes('confirmemail.php') ||
                responseText.includes('verifyyouraccount') || // No space
                responseText.includes('verify your account') ||
                responseText.includes('code sent to your email') ||
                currentCookies.includes('checkpoint=')) {
                checkpoint = true;
                success = true; // Checkpoint is a form of "success" in terms of account creation pending verification
            }
            
            // More success indicators
            if (responseText.includes('Welcome to Facebook') || responseText.includes('profile.php') || responseText.includes('home.php')) success = true;
            if (submitResponse.status === 302 && submitResponse.headers.location && (submitResponse.headers.location.includes('home.php') || submitResponse.headers.location.includes('profile.php'))) success = true;

            if (submitResponse.status >= 400 && !checkpoint) { // Handle HTTP errors if not a checkpoint
                success = false; // Explicitly set success to false on error
                lastError = new Error(`Submission to ${endpoint} failed with status ${submitResponse.status}. Data: ${responseText.substring(0,150)}`);
            } else {
                lastError = null; // Clear last error if successful or checkpoint
            }
            
            if (success) break; // Exit loop if successful

        } catch (error) {
            responseText = error.message;
            lastError = error;
            if (error.response && error.response.data) {
                responseText += ' | Response: ' + (typeof error.response.data === 'string' ? error.response.data.substring(0, 200) : JSON.stringify(error.response.data));
            }
            // More robust proxy error detection
            const proxyRelatedMessages = ['ECONNRESET', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'Decompression failed', 'Parse Error', 'socket hang up', 'HPE_INVALID_CONSTANT', 'ERR_BAD_RESPONSE', 'proxy connect'];
            if (proxyInUse && proxyRelatedMessages.some(msg => (error.code && String(error.code).toUpperCase().includes(msg.toUpperCase())) || (String(error.message).toUpperCase().includes(msg.toUpperCase())) )) {
                await statusMsg.edit({ content: `⚠️ Connection/Proxy issue with ${new URL(endpoint).pathname} (${error.message.substring(0,60)}...). Trying next if available.` });
                await humanLikeDelay(2000, 3000); // Delay before retrying with another endpoint
            }
        }
    }
    if (!success && lastError) responseText = `Attempted all submission endpoints. Last error: ${lastError.message.substring(0,250)}`;

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
        // Fallback for UID from 'xs' cookie if 'c_user' is not immediately set (e.g. during checkpoint)
        const xsMatch = cookieString.match(/xs=([^;]+)/);
        if (xsMatch && xsMatch[1]) {
            try {
                const xsDecoded = decodeURIComponent(xsMatch[1]);
                // The UID is often the first part of the 'xs' cookie value, separated by '%3A' (:)
                const xsParts = xsDecoded.split('%3A'); 
                if (xsParts.length > 1 && /^\d{10,}$/.test(xsParts[0]) && xsParts[0] !== '0') { // Check if it looks like a UID
                    uid = xsParts[0];
                }
            } catch (e) { /* console.error("Error decoding xs cookie:", e); */ }
        }
    }

    // Try extracting UID from response text if not found in cookies (common in checkpoint scenarios)
    if (uid === "Not available" && responseText) {
        const uidPatterns = [
            /"USER_ID":"(\d+)"/, /"actorID":"(\d+)"/, /"userID":(\d+)/, /"uid":(\d+),/,
            /profile_id=(\d+)/, /subject_id=(\d+)/, /viewer_id=(\d+)/,
            /\\"uid\\":(\d+)/, /\\"user_id\\":\\"(\d+)\\"/, /\\"account_id\\":\\"(\d+)\\"/,
            /name="target" value="(\d+)"/, /name="id" value="(\d+)"/, // From form fields
            /<input type="hidden" name="id" value="(\d+)"/, // HTML input
            /\["LWI","setUID","(\d+)"\]/, // JS array structure
            /"profile_id":(\d+)/, /"ent_id":"(\d+)"/
        ];
        for (const pattern of uidPatterns) {
            const match = responseText.match(pattern);
            if (match && match[1] && /^\d+$/.test(match[1]) && match[1] !== '0') {
                uid = match[1];
                break;
            }
        }
    }
    // Try extracting UID from final URL if it's a profile redirect
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
        .setFooter({ text: `Facebook Account Creation (v4) | ${new Date().toLocaleString()}${proxyUsed ? ' | Proxy: ' + proxyUsed : ''}` });

    if (uid && uid !== "Not available" && uid !== "0") {
        embed.addFields({ name: '🆔 User ID', value: `\`${uid}\``, inline: true });
    } else if (outcome.type === "checkpoint_otp_fetched" || outcome.type === "checkpoint_manual_needed" || outcome.type === "checkpoint_unknown_uid") {
        embed.addFields({ name: '🆔 User ID', value: `📬 Manual confirmation likely needed. UID may appear after confirmation.`, inline: true });
    } else {
        embed.addFields({ name: '🆔 User ID', value: `\`${uid || 'N/A'}\``, inline: true });
    }

    if (profileUrl && profileUrl.startsWith("https://") && profileUrl !== "Profile URL not found or confirmation pending.") {
        embed.addFields({ name: '🔗 Profile', value: `[View Profile](${profileUrl})`, inline: true });
    } else if (uid && uid !== "Not available" && uid !== "0") { // Offer potential link even if profileUrl isn't fully confirmed
        embed.addFields({ name: '🔗 Profile', value: `[Potential Profile Link](${getProfileUrl(uid)}) (Verify after confirmation)`, inline: true });
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
        // console.warn("Failed to reply, trying to send to channel:", replyError.message);
        try {
            await message.channel.send({ embeds: [embed], components: components });
        } catch (channelSendError) {
            // console.error("Failed to send credentials message to channel:", channelSendError.message);
        }
    }
};

module.exports = {
    name: 'fbcreatev4',
    description: 'Creates a Facebook account (v4) using a temporary email, with improved anti-detection and proxy support. Displays OTP if checkpointed.',
    admin_only: false, // Or based on your permission system
    async execute(message, args) {
        let proxyString = args.length > 0 ? args[0] : null;
        const genPassword = fakePassword();
        const genName = fakeName();
        let statusMsg;
        let tempEmailData = null;
        let sessionForProxyCheck; // To check if proxy was effectively used
        let tempEmailProvider = 'N/A';

        try {
            statusMsg = await message.reply({ content: `⏳ Initializing Facebook account creation (v4)${proxyString ? ' with proxy: `' + proxyString + '`' : ''}...` });

            tempEmailData = await fetchTemporaryEmail(statusMsg);
            const emailToUse = tempEmailData.email;
            tempEmailProvider = tempEmailData.providerName; 

            const userAgentString = generateUserAgent(); // Use new UA generator
            const session = createAxiosSession(userAgentString, proxyString);
            sessionForProxyCheck = session; // Keep a reference to check effective proxy usage later

            if (proxyString) {
                if (session.defaults.proxy) { // Check if proxy was successfully configured in axios
                    await statusMsg.edit({content: `🔧 Proxy configured: \`${proxyString}\`.\n👤 User-Agent: \`${userAgentString.substring(0,70)}...\`\n📧 Using temp email: \`${emailToUse}\` (Provider: ${tempEmailProvider})`});
                } else {
                    await statusMsg.edit({ content: `⚠️ Proxy string "${proxyString}" was invalid or could not be parsed. Proceeding without proxy.\n👤 User-Agent: \`${userAgentString.substring(0,70)}...\`\n📧 Using temp email: \`${emailToUse}\` (Provider: ${tempEmailProvider})`});
                    proxyString = null; // Nullify if not parsed correctly
                    await humanLikeDelay(3000, 4000);
                }
            } else {
                await statusMsg.edit({content: `🚀 Proceeding without proxy.\n👤 User-Agent: \`${userAgentString.substring(0,70)}...\`\n📧 Using temp email: \`${emailToUse}\` (Provider: ${tempEmailProvider})`});
            }
            await humanLikeDelay(1000, 2000); // Short pause after initial setup

            const initialNavResponse = await performInitialNavigation(session, statusMsg);
            // Determine referer for the next step from the actual URL visited
            const initialReferer = initialNavResponse?.request?.res?.responseUrl || BASE_FB_MOBILE_URL + '/';

            const { formData, responseDataHtml, responseUrl } = await fetchRegistrationPageAndData(session, statusMsg, initialReferer);
            if (!formData || !formData.fb_dtsg || !formData.jazoest || !formData.lsd) { // Check all critical tokens
                throw new Error('Failed to extract critical form data (fb_dtsg, jazoest, lsd) even after fallbacks. This is often due to page structure changes or anti-bot measures by Facebook.');
            }

            // Generate realistic DOB (e.g., 18-50 years old)
            const randomDay = Math.floor(Math.random() * 28) + 1; // Day 1-28
            const randomMonth = Math.floor(Math.random() * 12) + 1; // Month 1-12
            const currentYear = new Date().getFullYear();
            const randomYear = currentYear - (Math.floor(Math.random() * (50 - 18 + 1)) + 18); // Age 18 to 50
            const gender = Math.random() > 0.5 ? '1' : '2'; // 1 for female, 2 for male

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
                        color: 0x00BFFF, // Light Blue
                        message: `Account created, but it requires manual confirmation. ${uid !== "Not available" && uid !== '0' ? `UID (likely): \`${uid}\`. ` : 'UID not immediately available. '}**OTP Code: \`${otp}\`**\nPlease use this code to confirm your account on Facebook using email \`${emailToUse}\`.` 
                    };
                } catch (otpError) {
                    outcome = { 
                        type: "checkpoint_manual_needed", 
                        title: "📬 Account Needs Manual Confirmation (OTP Fetch Failed)!", 
                        color: 0xFFA500, // Orange
                        message: `Account created but requires manual confirmation. ${uid !== "Not available" && uid !== '0' ? `UID (likely): \`${uid}\`. ` : 'UID not immediately available. '}Failed to automatically fetch OTP for \`${emailToUse}\`: ${otpError.message.substring(0,120)}.\nPlease check email \`${emailToUse}\` manually for the code.` 
                    };
                }
            } else { 
                // More detailed error extraction from response
                let errorDetail = "Facebook rejected the registration or an unknown error occurred.";
                if (submissionResult.responseText) {
                    const $$ = cheerio.load(submissionResult.responseText);
                    // Try to find common error message containers
                    errorDetail = $$('#reg_error_inner').text().trim() || // Common registration error div
                                  $$('div[role="alert"]').text().trim() || // Alert roles
                                  $$('._585n, ._585r, ._ajax_error_payload').first().text().trim() || // Other common error classes/structures
                                  (submissionResult.responseText.length < 300 ? submissionResult.responseText : submissionResult.responseText.substring(0, 300) + "..."); // Fallback to raw response snippet
                    if (!errorDetail || errorDetail.length < 10) errorDetail = "Facebook's response did not contain a clear error message, or the structure changed.";
                }
                outcome = { type: "failure", title: "❌ Account Creation Failed!", color: 0xFF0000, message: `**Reason:** ${errorDetail}` };
            }

            // Determine if proxy was effectively used for the final message
            const effectivelyUsedProxy = proxyString && sessionForProxyCheck && sessionForProxyCheck.defaults.proxy ? proxyString : null;
            await sendCredentialsMessage(message, emailToUse, genPassword, uid, profileUrl, genName, tempEmailProvider, outcome, effectivelyUsedProxy);
            if (statusMsg && statusMsg.deletable) await statusMsg.delete().catch(e => { /* console.warn("Could not delete status message:", e.message) */ });

        } catch (error) {
            let errorMessage = error.message || "An unexpected critical error occurred during account creation.";
            const effectiveProxyInUse = proxyString && sessionForProxyCheck && sessionForProxyCheck.defaults.proxy;
            
            // Enhanced proxy error detection
            const proxyRelatedErrorCodes = ['ECONNRESET', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'];
            const proxyRelatedErrorMessages = ['proxy connect', 'proxy authentication required', 'decompression failed', 'parse error', 'socket hang up', 'hpe_invalid_constant', 'err_bad_response'];
            
            const isProxyRelatedNetworkError = effectiveProxyInUse && 
                ( (error.code && proxyRelatedErrorCodes.some(code => String(error.code).toUpperCase().includes(code))) ||
                  (proxyRelatedErrorMessages.some(msg => String(error.message).toLowerCase().includes(msg))) );

            if (isProxyRelatedNetworkError) {
                let specificErrorType = "general connection/proxy processing error";
                if (String(error.message).toLowerCase().includes('hpe_invalid_constant') || String(error.message).toLowerCase().includes('parse error')) specificErrorType = "HTTP parsing error (malformed response from proxy)";
                else if (String(error.message).toLowerCase().includes('err_bad_response') || (error.response && error.response.status === 500 && error.config?.url?.includes(sessionForProxyCheck.defaults.proxy.host))) specificErrorType = "bad response from proxy (e.g., HTTP 500)";
                else if (String(error.code).toUpperCase().includes('ENOTFOUND') || String(error.code).toUpperCase().includes('EAI_AGAIN')) specificErrorType = "DNS resolution error for proxy host";
                else if (error.response && error.response.status === 407 || String(error.message).toLowerCase().includes('proxy authentication required')) specificErrorType = "Proxy Authentication Required (check user/pass)";
                else if (String(error.code).toUpperCase().includes('ECONNREFUSED')) specificErrorType = "Connection refused by proxy server";
                
                errorMessage = `A ${specificErrorType} (\`${error.code || 'N/A'}\`) occurred with proxy \`${proxyString}\`: ${error.message}\n\n` +
                               `⚠️ **This strongly indicates an issue with the proxy itself, its configuration, or network path to it.**\n` +
                               `  - Verify the proxy server is online, stable, and not overloaded.\n` +
                               `  - Ensure proxy host, port, and credentials (if any) are correct.\n` +
                               `  - The proxy might be blocked by Facebook or your network.\n` +
                               `  - **Recommendation:** Test the proxy independently. Try a different, high-quality proxy.`;
            } else if (error.message && (error.message.toLowerCase().includes("not available on this browser") || error.message.toLowerCase().includes("update your browser") || error.message.toLowerCase().includes("browser not supported"))) {
                errorMessage = `Facebook indicated the browser/environment is not supported: "${error.message}"\n\nThis can be due to the User-Agent being flagged or too old, or the IP (via proxy or direct) being heavily restricted. Try a different User-Agent from the internal list or a different proxy.`;
            } else if (error.message && error.message.includes('Failed to load any suitable Facebook registration page')) {
                errorMessage = `Critical: ${error.message}\nThis usually means all attempts to reach Facebook's registration pages failed. If using a proxy, it's a very likely cause. If not, your server's IP might be temporarily blocked by Facebook, or there's a significant network issue preventing access to Facebook.`;
            } else if (error.response && error.response.status === 404) {
                 errorMessage = `Received HTTP 404 (Not Found) for URL: ${error.config?.url || error.request?.path || 'Unknown URL' }. This means Facebook reports the page doesn't exist. This could be due to outdated registration paths.`;
            } else if (error.message && error.message.startsWith('Failed to fetch temporary email:')) {
                errorMessage = `Critical: ${error.message}\nCould not obtain a temporary email. The temporary email service might be down or changed its API. Check the \`TEMP_EMAIL_API_URL\`.`;
            } else if (error.message && error.message.startsWith('OTP not received')) {
                errorMessage = `OTP Fetch Error: ${error.message}\nManual intervention will be required for this account if it was partially created. The temporary email provider might not be receiving emails from Facebook, or OTP patterns need an update.`;
            } else if (error.message && error.message.includes('Failed to extract critical form data')) {
                 errorMessage = `Critical Form Data Error: ${error.message}\nThis is a significant issue, likely meaning Facebook has changed its registration page structure, and the script can no longer find essential tokens like fb_dtsg, jazoest, or lsd. The script needs an update to adapt to these changes.`;
            } else if (error.response) { // General HTTP error from Axios
                errorMessage += ` | HTTP Status: ${error.response.status}`;
                if (error.response.data) errorMessage += ` | Response Data Snippet: ${String(error.response.data).substring(0,150).replace(/\n/g, ' ')}`;
            }
            // Add context about the User-Agent used during the error
            errorMessage += `\n(User-Agent used: ${userAgentString || "Not set before error"})`;
            
            const criticalFailureOutcome = { type: "critical_failure", title: "💥 Critical Error During Creation!", color: 0xFF0000, message: `${errorMessage.substring(0, 1900)}` }; // Limit length for Discord embed
            await sendCredentialsMessage(message, tempEmailData ? tempEmailData.email : "N/A (Email fetch failed)", genPassword, "N/A", "N/A", genName, tempEmailProvider, criticalFailureOutcome, effectiveProxyInUse ? proxyString : null);
            if (statusMsg && statusMsg.deletable) await statusMsg.delete().catch(e => { /* console.warn("Could not delete status message on error:", e.message) */ });
        }
    }
};
