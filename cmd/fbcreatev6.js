const axios = require('axios');
const cheerio =require('cheerio');
const { faker } = require('@faker-js/faker');
const UserAgent = require('user-agents');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, InteractionType } = require('discord.js');
const { CookieJar } = require('tough-cookie');
const { wrapper: axiosCookieJarSupport } = require('axios-cookiejar-support');

const BASE_FB_URL = 'https://m.facebook.com';
const TEMP_EMAIL_API_URL = 'https://email-api-tv55.onrender.com';
const DEFAULT_TIMEOUT = 60000;
const OTP_POLL_INTERVAL_SECONDS = 2;
const OTP_POLL_DURATION_MS = 30000;
const DELAY_BETWEEN_ACCOUNTS_MS = 5000;
const BUTTON_COLLECTOR_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const generateUserAgent = () => {
    const userAgent = new UserAgent({ deviceCategory: 'mobile' });
    return userAgent.toString();
};

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
        'Accept-Language': 'en-US,en;q=0.9,fr-FR;q=0.8,fr;q=0.7,es-ES;q=0.6,es;q=0.5',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Upgrade-Insecure-Requests': '1',
    };

    if (axiosProxyConfig) {
        baseHeaders['Accept-Encoding'] = 'gzip, deflate, br';
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
    await humanLikeDelay(500, 1500);
    try {
        const response = await axios.get(`${TEMP_EMAIL_API_URL}/gen?provider_name=random`, { timeout: 30000 });
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

const fetchOtpFromTempEmail = async (tempEmailSessionId, statusMsg, emailAddress) => {
    const initialMessage = `⏳ Waiting for Facebook OTP for \`${emailAddress}\`... (Checking email API for up to ${OTP_POLL_DURATION_MS / 1000}s)`;
    await statusMsg.edit({ content: initialMessage });
    const startTime = Date.now();
    const otpPatterns = [
        /(?:fb|facebook|meta)[^\w\d\s:-]*(\d{5,8})\b/i,
        /\b(\d{5,8})\s*(?:is|est|es|ist|είναι|เป็น|คือ|adalah|ay|jest|är|er|on|é|является)\s*(?:your|votre|tu|tuo|Ihr|tuo|suo|din|uw|ของคุณ|anda|iyong|twój|din|din|ващ|ton)\s*(?:Facebook|FB|Meta)\s*(?:confirmation|security|login|access|verification|OTP|code|código|codice|Code|Κωδικός|รหัส|kode|kod|kod|код|code)/i,
        /(?:Facebook|FB|Meta)\s*(?:confirmation|security|login|access|verification|OTP|code|código|codice|Code|Κωδικός|รหัส|kode|kod|kod|код|code)[\s:-]*(\d{5,8})\b/i,
        /(?:Your|Votre|Tu|Tuo|Ihr|Su|Din|Uw|Ang iyong|Twój|Din|Din|Ваш|Ton)\s*(?:Facebook|FB|Meta)\s*(?:confirmation|security|login|access|verification|OTP|code|código|codice|Code|Κωδικός|รหัส|kode|kod|kod|код|code)\s*(?:is|est|es|ist|είναι|เป็น|คือ|adalah|ay|jest|är|er|on|é|является)[\s:-]*(\d{5,8})\b/i,
        /(?:Your|Đây là|O seu|Tu|Il tuo|Votre|Dein)\s*(?:Facebook|Meta)?\s*(?:confirmation|verification|access|security)\s*(?:code|código|mã|codice|Code)\s*(?:is|est|là|é|ist)?:?\s*(\d{5,8})/i,
        /G-(\d{6,8})\b/i,
        /\bFB-(\d{5,8})\b/i,
        /\bFacebook\s*OTP:\s*(\d{5,8})\b/i,
        /\bMeta\s*OTP:\s*(\d{5,8})\b/i,
        /Your code: (\d{5,8})/i,
        /(?:Facebook|Meta)\s*(?:authentication|verification|access)\s*code:\s*(\d{5,8})/i,
        /(\d{5,8})\s*is your\s*(?:Facebook|Meta)\s*verification code/i,
        /\b(\d{5,8})\s*is your Facebook code/i,
        /(?:security|verification|confirmation|login|access|otp)\s*(?:code|código|codice|Code|Κωδικός|รหัส|kode|kod|kod|код)[\s:-]*(\d{5,8})\b/i,
        /コ ー ド は (\d{5,8}) で す/i,
        /コード：(\d{5,8})/i,
        /码：(\d{5,8})/i,
        /رمز फेसबुक الخاص بك هو (\d{5,8})/i,
        /رمز التحقق الخاص بك هو: (\d{5,8})/i,
        /Ваш код Facebook: (\d{5,8})/i,
        /O seu código do Facebook é (\d{5,8})/i,
        /Tu código de Facebook es (\d{5,8})/i,
        /Dein Facebook-Code lautet (\d{5,8})/i,
        /Il tuo codice Facebook è (\d{5,8})/i,
        /Votre code Facebook est (\d{5,8})/i,
        /Facebook kodunuz (\d{5,8})/i,
        /Mã Facebook của bạn là (\d{5,8})/i,
        /Kode Facebook Anda adalah (\d{5,8})/i,
        /รหัส Facebook ของคุณคือ (\d{5,8})/i,
        /Ang iyong Facebook code ay (\d{5,8})/i,
        /\b(\d{5,8})\b[^\w\d\s]*(?:Facebook|FB|Meta)/i,
        /(?:Facebook|FB|Meta)[^\w\d\s]*\b(\d{5,8})\b/i,
        /(?:Enter|Utiliser|Usa|Geben Sie|Masukkan|ป้อน|Въведете|Введіть|Wprowadź)\s*(?:this|ce|questo|diesen|ini|นี้|този|цей|ten)\s*(?:code|código|codice|Code|Κωδικός|รหัส|kode|kod|kod|код)[\s\w]*(?:to confirm|pour confirmer|per confermare|bestätigen|untuk mengonfirmasi|เพื่อยืนยัน|щоб підтвердити|aby potwierdzić)[\s\w:]*(\d{5,8})/i,
        /(?:Don't share this code|Ne partagez pas ce code|Non condividere questo codice|Teile diesen Code nicht|Jangan bagikan kode ini|ห้ามแชร์รหัสนี้|Не споделяйте този код|Не передавайте цей код нікому|Nie udostępniaj tego kodu).*\b(\d{5,8})\b/i,
        /\b(\d{5,8})\b/i
    ];

    let lastPollTime = 0;

    while (Date.now() - startTime < OTP_POLL_DURATION_MS) {
        const currentTime = Date.now();
        if (currentTime - lastPollTime >= (OTP_POLL_INTERVAL_SECONDS * 1000)) {
            try {
                const response = await axios.get(`${TEMP_EMAIL_API_URL}/sessions/${tempEmailSessionId}/messages`, { timeout: 25000 });
                if (response.data && Array.isArray(response.data)) {
                    for (const message of response.data.sort((a, b) => new Date(b.received_at || 0) - new Date(a.received_at || 0))) {
                        let emailTextContent = message.body || '';
                        if (!emailTextContent && message.html) {
                            if (Array.isArray(message.html)) {
                                emailTextContent = cheerio.load(message.html.join(' ')).text();
                            } else if (typeof message.html === 'string') {
                                emailTextContent = cheerio.load(message.html).text();
                            }
                        }
                        const emailBody = emailTextContent.trim().replace(/\s+/g, ' ').replace(/&nbsp;/g, ' ');
                        const emailSubject = (message.subject || '').trim().replace(/\s+/g, ' ');
                        const emailFrom = (message.from || '').toLowerCase();

                        if (emailBody || emailSubject) {
                            const isLikelyFacebookEmail = emailFrom.includes('facebook.com') || emailFrom.includes('fb.com') || emailFrom.includes('meta.com') ||
                                                        emailSubject.toLowerCase().includes('facebook') || emailSubject.toLowerCase().includes('fb') || emailSubject.toLowerCase().includes('meta');

                            for (let i = 0; i < otpPatterns.length; i++) {
                                const pattern = otpPatterns[i];
                                const isLastPattern = i === otpPatterns.length - 1;

                                if (isLastPattern && !isLikelyFacebookEmail && !emailBody.toLowerCase().includes('facebook') && !emailBody.toLowerCase().includes('meta')) {
                                    continue;
                                }

                                let combinedText = `${emailSubject} ${emailBody}`;
                                const match = combinedText.match(pattern);

                                if (match && match[1] && match[1].length >= 5 && match[1].length <= 8 && /^\d+$/.test(match[1])) {
                                    await statusMsg.edit({ content: `🔑 OTP \`${match[1]}\` found in email from \`${message.from || 'unknown'}\` (Subject: \`${emailSubject || 'N/A'}\`)!` });
                                    return match[1];
                                }
                            }
                        }
                    }
                }
            } catch (error) { }
            lastPollTime = currentTime;
        }

        const timeElapsed = Date.now() - startTime;
        const timeLeftOverallMs = Math.max(0, OTP_POLL_DURATION_MS - timeElapsed);

        const nextPollCountdownStart = Math.ceil((lastPollTime + (OTP_POLL_INTERVAL_SECONDS * 1000) - Date.now()) / 1000);
        let countdownMsg = "";
        if (nextPollCountdownStart > 0) {
            countdownMsg = `(Checking again in ${nextPollCountdownStart}s...)`;
        } else {
            countdownMsg = `(Checking now...)`;
        }

        await statusMsg.edit({ content: `⏳ Waiting for Facebook OTP for \`${emailAddress}\`. ${countdownMsg} Time left: ~${Math.round(timeLeftOverallMs/1000)}s` }).catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 1000));
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
            const id = $(el).attr('id');
            return (action && (action.includes('/reg/') || action.includes('/r.php') || action.includes('signup'))) ||
                   (id && (id.includes('reg') || id.includes('signup')));
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

        if (!formData.fb_dtsg) formData.fb_dtsg = (scriptContent.match(/['"]fb_dtsg['"]\s*:\s*['"]([^'"]+)['"]/) || [])[1] || (scriptContent.match(/name="fb_dtsg" value="([^"]+)"/) || [])[1];
        if (!formData.jazoest) formData.jazoest = (scriptContent.match(/['"]jazoest['"]\s*:\s*['"]([^'"]+)['"]/) || [])[1] || (scriptContent.match(/name="jazoest" value="([^"]+)"/) || [])[1];
        if (!formData.lsd) formData.lsd = (scriptContent.match(/['"]lsd['"]\s*:\s*['"]([^'"]+)['"]/) || [])[1] || (scriptContent.match(/name="lsd" value="([^"]+)"/) || [])[1];
    });

    if (!formData.fb_dtsg) formData.fb_dtsg = $('meta[name="fb_dtsg"]').attr('content') || $('input[name="fb_dtsg"]').val();
    if (!formData.jazoest) formData.jazoest = $('meta[name="jazoest"]').attr('content') || $('input[name="jazoest"]').val();
    if (!formData.lsd) formData.lsd = $('input[name="lsd"]').val();

    if (!formData.fb_dtsg) {
        formData.fb_dtsg = 'AQH' + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
    }
    if (!formData.jazoest) {
        let sum = 0;
        for (let i = 0; i < (formData.fb_dtsg || '').length; i++) sum += (formData.fb_dtsg || '').charCodeAt(i);
        formData.jazoest = '2' + sum;
    }
    if (typeof formData.lsd === 'undefined' || !formData.lsd) {
        formData.lsd = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2,5);
    }

    const commonFields = ['reg_instance', 'reg_impression_id', 'logger_id', 'submission_id'];
    commonFields.forEach(field => { if (!formData[field]) { const val = $(`input[name="${field}"]`).val(); if (val) formData[field] = val; }});
    if (!formData.reg_impression_id) formData.reg_impression_id = 'MOBILE_SIGNUP_V6';

    return formData;
};

const performInitialNavigation = async (session, statusMsg) => {
    let homeResponse;
    try {
        await statusMsg.edit({ content: '🌍 Navigating to Facebook homepage (initial visit)...' });
        await humanLikeDelay(1500, 3500);
        homeResponse = await session.get(BASE_FB_URL + '/', {
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
        await humanLikeDelay(2500, 5000);

        if (homeResponse.status >= 400) {
            throw new Error(`Homepage visit failed with status ${homeResponse.status}. Response: ${String(homeResponse.data).substring(0, 200)}`);
        }
        if (String(homeResponse.data).toLowerCase().includes("not available on this browser") || String(homeResponse.data).toLowerCase().includes("update your browser")) {
            throw new Error("Facebook indicated browser not supported on homepage visit. Try a different User-Agent.");
        }
        await statusMsg.edit({ content: '🏠 Homepage visited. Proceeding to find signup...' });
    } catch (error) {
        throw error;
    }
    return homeResponse;
};

const fetchRegistrationPageAndData = async (session, statusMsg, initialReferer = BASE_FB_URL + '/') => {
    await statusMsg.edit({ content: '📄 Navigating to a Facebook signup page...' });
    let regPageResponse;
    const regUrls = [
        BASE_FB_URL + '/r.php',
        BASE_FB_URL + '/reg/',
        BASE_FB_URL + '/signup/lite/',
        BASE_FB_URL + '/signup/',
        BASE_FB_URL + '/checkpoint/block/?next=' + encodeURIComponent(BASE_FB_URL + '/r.php')
    ];
    let responseData = '';
    let responseUrl = '';
    let lastError = null;

    for (const url of regUrls) {
        try {
            await statusMsg.edit({ content: `📄 Trying signup page: ${new URL(url).pathname}...` });
            await humanLikeDelay(1000, 2500);
            regPageResponse = await session.get(url, {
                headers: {
                    'Referer': initialReferer,
                    'Sec-Fetch-Site': 'same-origin',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-User': '?1',
                    'Cache-Control': 'max-age=0',
                }
            });

            if (regPageResponse && regPageResponse.status === 200 && regPageResponse.data) {
                responseData = String(regPageResponse.data);
                responseUrl = regPageResponse.request.res.responseUrl || url;
                if (responseData.toLowerCase().includes("create new account") || responseData.includes("reg_email__") || responseData.includes("firstname") || responseData.includes("sign up for facebook")) {
                    lastError = null;
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
        await humanLikeDelay(1200, 1800);
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
    await humanLikeDelay(500, 1500);
    let formData = extractFormDataV2(responseData);

    await statusMsg.edit({ content: '✨ Form data acquired. Preparing submission payload...' });
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
    let formElement = $formPage('form[action*="/reg/"], form[id="registration_form"], form[action*="signup"]').first();
     if (formElement.length === 0) {
        formElement = $formPage('form').filter((i, el) => {
            const action = $formPage(el).attr('action');
            return action && (action.includes('/reg/') || action.includes('/r.php') || action.includes('signup'));
        }).first();
    }

    formElement.find('input[type="hidden"]').each((_, el) => {
        const inputName = $formPage(el).attr('name');
        const inputValue = $formPage(el).attr('value');
        if (inputName && typeof inputValue !== 'undefined' && !payload.has(inputName)) {
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
    if (!payload.has('reg_instance')) payload.append('reg_instance', formData.reg_instance || Math.random().toString(36).substring(2,12));
    if (!payload.has('reg_impression_id')) payload.append('reg_impression_id', formData.reg_impression_id || 'MOBILE_SIGNUP_V6_ATTEMPT');

    return payload;
};

const attemptRegistrationSubmission = async (session, payload, refererUrl, statusMsg, proxyInUse) => {
    const submitEndpoints = [
        BASE_FB_URL + '/reg/submit/',
        BASE_FB_URL + '/signup/account/actor/',
        refererUrl
    ];
    let submitResponse = null;
    let responseText = '';
    let success = false;
    let checkpoint = false;
    let finalUrl = refererUrl;
    let lastError = null;

    for (const endpoint of submitEndpoints) {
        if (!endpoint || !endpoint.startsWith('http')) continue;

        try {
            await statusMsg.edit({ content: `📨 Submitting registration to: ${new URL(endpoint).pathname}...` });
            await humanLikeDelay(3000, 6000);

            submitResponse = await session.post(endpoint, payload.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': refererUrl,
                    'Origin': BASE_FB_URL,
                    'Sec-Fetch-Site': 'same-origin',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Dest': 'empty',
                },
                timeout: 75000
            });

            responseText = (typeof submitResponse.data === 'string') ? submitResponse.data : JSON.stringify(submitResponse.data);
            finalUrl = submitResponse.request?.res?.responseUrl || endpoint;
            const currentCookies = await session.defaults.jar.getCookieString(finalUrl);

            if (currentCookies.includes('c_user=') && !currentCookies.includes('c_user=0')) success = true;

            if (responseText.toLowerCase().includes('checkpoint') ||
                responseText.includes('confirmation_code') ||
                responseText.includes('confirmemail.php') ||
                responseText.includes('verifyyouraccount') ||
                responseText.includes('verify your account') ||
                responseText.includes('code sent to your email') ||
                currentCookies.includes('checkpoint=')) {
                checkpoint = true;
                success = true;
            }

            if (responseText.includes('Welcome to Facebook') || responseText.includes('profile.php') || responseText.includes('home.php')) success = true;
            if (submitResponse.status === 302 && submitResponse.headers.location && (submitResponse.headers.location.includes('home.php') || submitResponse.headers.location.includes('profile.php'))) success = true;

            if (submitResponse.status >= 400 && !checkpoint) {
                success = false;
                lastError = new Error(`Submission to ${endpoint} failed with status ${submitResponse.status}. Data: ${responseText.substring(0,150)}`);
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
            const proxyRelatedMessages = ['ECONNRESET', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'Decompression failed', 'Parse Error', 'socket hang up', 'HPE_INVALID_CONSTANT', 'ERR_BAD_RESPONSE', 'proxy connect'];
            if (proxyInUse && proxyRelatedMessages.some(msg => (error.code && String(error.code).toUpperCase().includes(msg.toUpperCase())) || (String(error.message).toUpperCase().includes(msg.toUpperCase())) )) {
                await statusMsg.edit({ content: `⚠️ Connection/Proxy issue with ${new URL(endpoint).pathname} (${error.message.substring(0,60)}...). Trying next if available.` });
                await humanLikeDelay(2000, 3000);
            }
        }
    }
    if (!success && lastError) responseText = `Attempted all submission endpoints. Last error: ${lastError.message.substring(0,250)}`;

    return { response: submitResponse, responseText, success, checkpoint, finalUrl };
};

const extractUidAndProfile = async (cookieJar, responseText, finalUrl) => {
    let uid = "Not available";
    let profileUrl = "Profile URL not found or confirmation pending.";

    const cookieString = await cookieJar.getCookieString(finalUrl || BASE_FB_URL);
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
            /\["LWI","setUID","(\d+)"\]/,
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
     if (uid === "Not available" && finalUrl && finalUrl.includes("profile.php?id=")) {
        const urlUidMatch = finalUrl.match(/profile\.php\?id=(\d+)/);
        if (urlUidMatch && urlUidMatch[1]) uid = urlUidMatch[1];
    }

    if (uid !== "Not available" && /^\d+$/.test(uid) && uid !== '0') {
        profileUrl = getProfileUrl(uid);
    }
    return { uid, profileUrl };
};

const sendCredentialsMessage = async (replyInterface, email, password, uid, profileUrl, accountName, tempEmailProviderName, outcome, proxyUsed, accountNum, totalAccounts, tempEmailDataForButton = null) => {
    const titlePrefix = totalAccounts > 1 ? `Account ${accountNum}/${totalAccounts}: ` : "";
    const embed = new EmbedBuilder()
        .setTitle(titlePrefix + outcome.title)
        .setColor(outcome.color)
        .addFields(
            { name: '👤 Name', value: `\`${accountName.firstName} ${accountName.lastName}\``, inline: true },
            { name: '📧 Email', value: `\`${email}\``, inline: true },
            { name: '🔑 Password', value: `\`${password}\``, inline: true },
            { name: '📨 Temp Email Provider', value: `\`${tempEmailProviderName || 'Unknown'}\``, inline: true }
        )
        .setFooter({ text: `Facebook Account Creation (v6) | ${new Date().toLocaleString()}${proxyUsed ? ' | Proxy: ' + proxyUsed : ''}` });

    if (uid && uid !== "Not available" && uid !== "0") {
        embed.addFields({ name: '🆔 User ID', value: `\`${uid}\``, inline: true });
    } else if (outcome.type === "checkpoint_otp_fetched" || outcome.type === "checkpoint_manual_needed" || outcome.type === "checkpoint_unknown_uid" || outcome.type === "checkpoint_otp_fetched_retry" || outcome.type === "checkpoint_manual_needed_retry") {
        embed.addFields({ name: '🆔 User ID', value: `📬 Manual confirmation likely needed. UID may appear after confirmation.`, inline: true });
    } else {
        embed.addFields({ name: '🆔 User ID', value: `\`${uid || 'N/A'}\``, inline: true });
    }

    if (profileUrl && profileUrl.startsWith("https://") && profileUrl !== "Profile URL not found or confirmation pending.") {
        embed.addFields({ name: '🔗 Profile', value: `[View Profile](${profileUrl})`, inline: true });
    } else if (uid && uid !== "Not available" && uid !== "0") {
        embed.addFields({ name: '🔗 Profile', value: `[Potential Profile Link](${getProfileUrl(uid)}) (Verify after confirmation)`, inline: true });
    }

    embed.setDescription(outcome.message);

    const components = [];
    const actionRow = new ActionRowBuilder();
    let addedButtons = false;

    if (outcome.type === "checkpoint_manual_needed" && tempEmailDataForButton && tempEmailDataForButton.sessionId) {
        actionRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`retry_otp_${tempEmailDataForButton.sessionId}_${email}_${accountNum}`)
                .setLabel('Retry OTP Fetch')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔄')
        );
        addedButtons = true;
    }

    if (profileUrl && profileUrl.startsWith("https://") && profileUrl !== "Profile URL not found or confirmation pending.") {
        actionRow.addComponents(
            new ButtonBuilder().setLabel('View Profile').setStyle(ButtonStyle.Link).setURL(profileUrl).setEmoji('👤')
        );
         addedButtons = true;
    }
    
    actionRow.addComponents(
        new ButtonBuilder()
            .setCustomId(`delete_fb_msg_marker`) // Static marker, collector on message will handle deletion of THAT message
            .setLabel('Delete this Message')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️')
    );
    addedButtons = true;


    if (addedButtons) {
        components.push(actionRow);
    }
    
    let sentMessage;
    try {
        if (replyInterface.channel) {
            sentMessage = await replyInterface.channel.send({ embeds: [embed], components: components });
        } else {
            sentMessage = await replyInterface.reply({ embeds: [embed], components: components, fetchReply: true });
        }
        return sentMessage;
    } catch (sendError) {
        try {
             if (replyInterface.channel) {
                await replyInterface.channel.send({ content: `Error sending embed, fallback: ${outcome.title} - Email: ${email} Pass: ${password} UID: ${uid}`});
             } else {
                await replyInterface.followUp({ content: `Error sending embed, fallback: ${outcome.title} - Email: ${email} Pass: ${password} UID: ${uid}` });
             }
        } catch (fallbackError) {}
        return null;
    }
};

async function createSingleFacebookAccount(message, effectiveProxyString, userAgentString, accountNum, totalAccounts) {
    const genPassword = fakePassword();
    const genName = fakeName();
    let statusMsg;
    let tempEmailData = null;
    let sessionForProxyCheck;
    let tempEmailProvider = 'N/A';

    const initialStatusContent = `⏳ Initializing FB Account ${accountNum}/${totalAccounts}${effectiveProxyString ? ' with proxy: `' + effectiveProxyString + '`' : ''}...`;
    if (accountNum === 1 && totalAccounts === 1 && message.type !== InteractionType.ApplicationCommand) { // Avoid replying to interactions if already replied
        statusMsg = await message.reply({ content: initialStatusContent });
    } else {
        statusMsg = await message.channel.send({ content: initialStatusContent });
    }

    try {
        tempEmailData = await fetchTemporaryEmail(statusMsg);
        const emailToUse = tempEmailData.email;
        tempEmailProvider = tempEmailData.providerName;

        const session = createAxiosSession(userAgentString, effectiveProxyString);
        sessionForProxyCheck = session;

        if (effectiveProxyString) {
            if (session.defaults.proxy) {
                await statusMsg.edit({ content: `🔧 Account ${accountNum}/${totalAccounts}: Proxy \`${effectiveProxyString}\`.\n👤 User-Agent: \`${userAgentString.substring(0, 45)}...\`\n📧 Temp email: \`${emailToUse}\`` });
            } else {
                await statusMsg.edit({ content: `⚠️ Account ${accountNum}/${totalAccounts}: Proxy "${effectiveProxyString}" invalid. No proxy.\n👤 UA: \`${userAgentString.substring(0, 45)}...\`\n📧 Email: \`${emailToUse}\`` });
                effectiveProxyString = null;
            }
        } else {
            await statusMsg.edit({ content: `🚀 Account ${accountNum}/${totalAccounts}: No proxy.\n👤 User-Agent: \`${userAgentString.substring(0, 45)}...\`\n📧 Temp email: \`${emailToUse}\`` });
        }
        await humanLikeDelay(1000, 2000);

        const initialNavResponse = await performInitialNavigation(session, statusMsg);
        const initialReferer = initialNavResponse?.request?.res?.responseUrl || BASE_FB_URL + '/';

        const { formData, responseDataHtml, responseUrl } = await fetchRegistrationPageAndData(session, statusMsg, initialReferer);
        if (!formData || !formData.fb_dtsg || !formData.jazoest || !formData.lsd) {
            throw new Error('Failed to extract critical form data (fb_dtsg, jazoest, lsd). FB page structure might have changed.');
        }

        const randomDay = Math.floor(Math.random() * 28) + 1;
        const randomMonth = Math.floor(Math.random() * 12) + 1;
        const currentYear = new Date().getFullYear();
        const randomYear = currentYear - (Math.floor(Math.random() * (50 - 18 + 1)) + 18);
        const gender = Math.random() > 0.5 ? '1' : '2';

        const payload = prepareSubmissionPayload(
            formData, emailToUse, genPassword, genName,
            { day: randomDay, month: randomMonth, year: randomYear },
            gender, responseDataHtml
        );

        let submissionResult = await attemptRegistrationSubmission(session, payload, responseUrl, statusMsg, !!(effectiveProxyString && session.defaults.proxy));
        let { uid, profileUrl } = await extractUidAndProfile(session.defaults.jar, submissionResult.responseText, submissionResult.finalUrl);
        let outcome;

        if (submissionResult.success && !submissionResult.checkpoint) {
            outcome = { type: "success", title: "✅ Account Created Successfully!", color: 0x00FF00, message: `New Facebook account ready!\nCheck \`${emailToUse}\` for welcome messages. UID: \`${uid}\`.` };
        } else if (submissionResult.checkpoint) {
            await statusMsg.edit({ content: `📬 Account ${accountNum}/${totalAccounts}: Needs email confirmation. Fetching OTP for \`${emailToUse}\`...` });
            try {
                const otp = await fetchOtpFromTempEmail(tempEmailData.sessionId, statusMsg, emailToUse);
                outcome = {
                    type: "checkpoint_otp_fetched",
                    title: "📬 Manual Confirmation Needed (OTP Fetched)!",
                    color: 0x00BFFF,
                    message: `Account created, but needs manual confirmation. ${uid !== "Not available" && uid !== '0' ? `UID (likely): \`${uid}\`. ` : 'UID not immediately available. '}**OTP Code: \`${otp}\`**\nUse this code on Facebook with email \`${emailToUse}\`.`
                };
            } catch (otpError) {
                outcome = {
                    type: "checkpoint_manual_needed",
                    title: "📬 Manual Confirmation Needed (OTP Fetch Failed)!",
                    color: 0xFFA500,
                    message: `Account created but needs manual confirmation. ${uid !== "Not available" && uid !== '0' ? `UID (likely): \`${uid}\`. ` : 'UID not available. '}Failed to fetch OTP for \`${emailToUse}\`: ${otpError.message.substring(0, 120)}.\nCheck email \`${emailToUse}\` manually.`
                };
            }
        } else {
            let errorDetail = "Facebook rejected registration or unknown error.";
            if (submissionResult.responseText) {
                const $$ = cheerio.load(submissionResult.responseText);
                errorDetail = $$('#reg_error_inner').text().trim() ||
                    $$('div[role="alert"]').text().trim() ||
                    $$('._585n, ._585r, ._ajax_error_payload').first().text().trim() ||
                    (submissionResult.responseText.length < 300 ? submissionResult.responseText : submissionResult.responseText.substring(0, 300) + "...");
                if (!errorDetail || errorDetail.length < 10) errorDetail = "FB response unclear or structure changed.";
            }
            outcome = { type: "failure", title: "❌ Account Creation Failed!", color: 0xFF0000, message: `**Reason:** ${errorDetail}` };
        }

        const resultMessage = await sendCredentialsMessage(message, emailToUse, genPassword, uid, profileUrl, genName, tempEmailProvider, outcome, effectiveProxyString && sessionForProxyCheck && sessionForProxyCheck.defaults.proxy ? effectiveProxyString : null, accountNum, totalAccounts, tempEmailData);
        
        if (statusMsg && statusMsg.deletable) await statusMsg.delete().catch(e => { });

        if (resultMessage && (outcome.type === "checkpoint_manual_needed" || actionRowHasButtons(resultMessage))) {
            const filter = i => {
                return (i.customId.startsWith(`retry_otp_`) || i.customId === `delete_fb_msg_marker`) && i.user.id === message.author.id;
            };

            const collector = resultMessage.createMessageComponentCollector({ filter, time: BUTTON_COLLECTOR_TIMEOUT_MS });

            collector.on('collect', async i => {
                if (i.customId.startsWith('retry_otp_')) {
                    const parts = i.customId.split('_');
                    const tempEmailSessionIdFromButton = parts[2];
                    const emailAddressFromButton = parts[3];
                    const accNumFromButton = parts[4];

                    const originalButtonMessage = i.message;
                    const currentComponents = originalButtonMessage.components.map(actionRow => {
                        const newActionRow = new ActionRowBuilder();
                        actionRow.components.forEach(buttonComponent => {
                            const newButton = ButtonBuilder.from(buttonComponent);
                            if (buttonComponent.customId === i.customId) {
                                newButton.setDisabled(true).setLabel('Retrying OTP...');
                            }
                            newActionRow.addComponents(newButton);
                        });
                        return newActionRow;
                    });
                    await i.update({ components: currentComponents });

                    const otpPollingStatusMsg = await originalButtonMessage.channel.send({ content: `⏳ Starting OTP retry for account ${accNumFromButton} (\`${emailAddressFromButton}\`)... (this message will self-destruct)`});

                    try {
                        const otp = await fetchOtpFromTempEmail(tempEmailSessionIdFromButton, otpPollingStatusMsg, emailAddressFromButton);
                        const updatedEmbed = EmbedBuilder.from(originalButtonMessage.embeds[0])
                            .setTitle(`📬 Acc ${accNumFromButton}: Manual Confirmation (OTP Fetched on Retry)!`)
                            .setDescription(`Account created, needs manual confirmation. **OTP Code: \`${otp}\`**\nUse with email \`${emailAddressFromButton}\`. UID might appear after confirmation.`)
                            .setColor(0x00BFFF);
                        
                        const finalComponents = new ActionRowBuilder();
                        let deleteButtonFound = false;
                         originalButtonMessage.components.forEach(row => {
                            row.components.forEach(button => {
                                if (button.customId === `delete_fb_msg_marker`) { // Keep delete button
                                    finalComponents.addComponents(ButtonBuilder.from(button).setDisabled(false));
                                    deleteButtonFound = true;
                                }
                            });
                        });
                        await originalButtonMessage.edit({ embeds: [updatedEmbed], components: deleteButtonFound ? [finalComponents] : [] });
                        await otpPollingStatusMsg.edit({ content: `✅ OTP \`${otp}\` fetched for acc ${accNumFromButton} on retry! Original message updated.` });
                    } catch (otpRetryError) {
                        const updatedEmbed = EmbedBuilder.from(originalButtonMessage.embeds[0])
                            .setTitle(`📬 Acc ${accNumFromButton}: Manual Confirmation (Retry Failed)!`)
                            .setDescription(`Failed to fetch OTP for \`${emailAddressFromButton}\` on retry: ${otpRetryError.message.substring(0,150)}.\nCheck email manually.`)
                            .setColor(0xFFA500);
                        
                        const componentsAfterFailedRetry = originalButtonMessage.components.map(actionRow => {
                            const newActionRow = new ActionRowBuilder();
                            actionRow.components.forEach(buttonComponent => {
                                const newButton = ButtonBuilder.from(buttonComponent);
                                if (buttonComponent.customId.startsWith('retry_otp_')) {
                                    newButton.setDisabled(true).setLabel('OTP Retry Failed');
                                }
                                newActionRow.addComponents(newButton);
                            });
                            return newActionRow;
                        });
                        await originalButtonMessage.edit({ embeds: [updatedEmbed], components: componentsAfterFailedRetry });
                        await otpPollingStatusMsg.edit({ content: `❌ OTP fetch retry failed for acc ${accNumFromButton}. Original message updated.` });
                    } finally {
                        setTimeout(() => otpPollingStatusMsg.delete().catch(() => {}), 10000);
                    }
                } else if (i.customId === `delete_fb_msg_marker`) {
                    if (i.user.id === message.author.id) {
                        await i.message.delete().catch(() => {});
                        collector.stop('message_deleted');
                    } else {
                        await i.reply({ content: "You don't have permission to delete this message.", ephemeral: true });
                    }
                }
            });

            collector.on('end', (collected, reason) => {
                if (reason !== 'message_deleted' && resultMessage.deletable && resultMessage.components.length > 0) {
                     const disabledComponents = resultMessage.components.map(row =>
                        new ActionRowBuilder().addComponents(
                            row.components.map(button => ButtonBuilder.from(button).setDisabled(true))
                        )
                    );
                    resultMessage.edit({ components: disabledComponents }).catch(() => {});
                }
            });
        }

    } catch (error) {
        let errorMessage = error.message || "Unexpected critical error.";
        const actualProxyInUse = effectiveProxyString && sessionForProxyCheck && sessionForProxyCheck.defaults.proxy;
        const proxyRelatedErrorCodes = ['ECONNRESET', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'];
        const proxyRelatedErrorMessages = ['proxy connect', 'proxy authentication required', 'decompression failed', 'parse error', 'socket hang up', 'hpe_invalid_constant', 'err_bad_response'];

        const isProxyRelatedNetworkError = actualProxyInUse &&
            ((error.code && proxyRelatedErrorCodes.some(code => String(error.code).toUpperCase().includes(code))) ||
                (proxyRelatedErrorMessages.some(msg => String(error.message).toLowerCase().includes(msg))));

        if (isProxyRelatedNetworkError) {
            let specificErrorType = "general connection/proxy error";
            if (String(error.message).toLowerCase().includes('hpe_invalid_constant') || String(error.message).toLowerCase().includes('parse error')) specificErrorType = "HTTP parsing error (proxy response malformed)";
            else if (String(error.message).toLowerCase().includes('err_bad_response') || (error.response && error.response.status === 500 && error.config?.url?.includes(sessionForProxyCheck.defaults.proxy.host))) specificErrorType = "bad response from proxy";
            else if (String(error.code).toUpperCase().includes('ENOTFOUND') || String(error.code).toUpperCase().includes('EAI_AGAIN')) specificErrorType = "DNS resolution error for proxy";
            else if (error.response && error.response.status === 407 || String(error.message).toLowerCase().includes('proxy authentication required')) specificErrorType = "Proxy Authentication Required";
            else if (String(error.code).toUpperCase().includes('ECONNREFUSED')) specificErrorType = "Connection refused by proxy";
            errorMessage = `A ${specificErrorType} (\`${error.code || 'N/A'}\`) with proxy \`${effectiveProxyString}\`: ${error.message}\n\n⚠️ **Proxy issue.** Verify proxy details & stability. Try a different one.`;
        } else if (error.message && (error.message.toLowerCase().includes("not available on this browser") || error.message.toLowerCase().includes("update your browser") || error.message.toLowerCase().includes("browser not supported"))) {
            errorMessage = `Facebook indicated browser/environment not supported: "${error.message}"\n\nTry different User-Agent or proxy.`;
        } else if (error.message && error.message.includes('Failed to load any suitable Facebook registration page')) {
            errorMessage = `Critical: ${error.message}\nLikely proxy issue or IP block by Facebook.`;
        } else if (error.response && error.response.status === 404) {
            errorMessage = `HTTP 404 (Not Found) for URL: ${error.config?.url || error.request?.path || 'Unknown'}. FB page may not exist.`;
        } else if (error.message && error.message.startsWith('Failed to fetch temporary email:')) {
            errorMessage = `Critical: ${error.message}\nTemp email service issue. Check \`TEMP_EMAIL_API_URL\`.`;
        } else if (error.message && error.message.startsWith('OTP not received')) {
            errorMessage = `OTP Fetch Error: ${error.message}\nManual intervention needed. Temp email or OTP patterns may need update.`;
        } else if (error.message && error.message.includes('Failed to extract critical form data')) {
            errorMessage = `Critical Form Data Error: ${error.message}\nFB page structure likely changed. Script needs update.`;
        } else if (error.response) {
            errorMessage += ` | HTTP Status: ${error.response.status}`;
            if (error.response.data) errorMessage += ` | Response Data: ${String(error.response.data).substring(0, 150).replace(/\n/g, ' ')}`;
        }
        errorMessage += `\n(User-Agent: ${userAgentString || "Not set"})`;

        const criticalFailureOutcome = { type: "critical_failure", title: "💥 Critical Error During Creation!", color: 0xFF0000, message: `${errorMessage.substring(0, 1900)}` };
        await sendCredentialsMessage(message, tempEmailData ? tempEmailData.email : "N/A", genPassword, "N/A", "N/A", genName, tempEmailProvider, criticalFailureOutcome, actualProxyInUse ? effectiveProxyString : null, accountNum, totalAccounts, tempEmailData);
        if (statusMsg && statusMsg.deletable) await statusMsg.delete().catch(e => { });
    }
}

function actionRowHasButtons(message) {
    if (!message || !message.components || message.components.length === 0) {
        return false;
    }
    for (const row of message.components) {
        if (row.components && row.components.some(comp => comp.type === 2)) { // 2 is Button
            return true;
        }
    }
    return false;
}


module.exports = {
    name: 'fbcreatev6',
    description: 'Creates multiple Facebook accounts (v6) with individual UAs, OTP countdown, and optional proxy. Usage: !fbcreatev6 [amount] [proxy_string_optional]',
    admin_only: false,
    async execute(message, args) {
        let amountAccounts = 1;
        let proxyString = null; // This is the variable that holds the proxy string from args

        if (args.length > 0) {
            const firstArgInt = parseInt(args[0]);
            if (!isNaN(firstArgInt) && firstArgInt > 0) {
                amountAccounts = firstArgInt;
                if (args.length > 1) {
                    proxyString = args[1];
                }
            } else {
                proxyString = args[0];
                if (args.length > 1) {
                     const secondArgInt = parseInt(args[1]);
                     if (!isNaN(secondArgInt) && secondArgInt > 0) {
                        amountAccounts = secondArgInt;
                     }
                }
            }
        }

        amountAccounts = Math.max(1, Math.min(amountAccounts, 10));
        
        const initialReply = await message.reply(`🚀 Starting creation process for ${amountAccounts} Facebook account(s). Each account will be processed sequentially. This may take some time...`);

        for (let i = 1; i <= amountAccounts; i++) {
            const userAgentForThisAccount = generateUserAgent();
            try {
                await message.channel.send(`--- Starting Account ${i}/${amountAccounts} ---`);
                // FIX: Pass 'proxyString' instead of 'effectiveProxyString'
                await createSingleFacebookAccount(message, proxyString, userAgentForThisAccount, i, amountAccounts);
            } catch (batchError) {
                await message.channel.send(`❌ Critical error during batch processing for account ${i}/${amountAccounts}: ${batchError.message}. Moving to next if any.`);
            }
            if (i < amountAccounts) {
                await message.channel.send(`--- Delaying ${DELAY_BETWEEN_ACCOUNTS_MS / 1000}s before next account ---`);
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_ACCOUNTS_MS));
            }
        }
        // Use channel of initial reply or original message for final status
        const finalMessageChannel = initialReply ? initialReply.channel : message.channel;
        await finalMessageChannel.send(`🏁 Batch creation process finished for ${amountAccounts} account(s).`);
    }
};
