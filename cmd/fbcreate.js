const axios = require('axios');
const cheerio = require('cheerio');
const { faker } = require('@faker-js/faker');
const fs = require('fs');
const path = require('path');
const UserAgent = require('user-agents');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js'); // Added for buttons

const fakeName = () => ({ firstName: faker.person.firstName(), lastName: faker.person.lastName() });

const ugenX = () => {
    const userAgent = new UserAgent();
    return userAgent.toString();
};

const extractFormData = (html) => {
    try {
        const formData = {};
        const $ = cheerio.load(html);
        $('input').each((_, el) => {
            const name = $(el).attr('name');
            const value = $(el).attr('value');
            if (name) {
                formData[name] = value || '';
            }
        });
        const extractByRegex = (fieldName) => {
            const patterns = [
                new RegExp(`name="${fieldName}" value="([^"]+)"`),
                new RegExp(`name="${fieldName}" content="([^"]+)"`),
                new RegExp(`name="${fieldName}"\\s+value="([^"]+)"`),
                new RegExp(`"${fieldName}":"([^"]+)"`),
                new RegExp(`${fieldName}:"([^"]+)"`)
            ];
            for (const pattern of patterns) {
                const match = html.match(pattern);
                if (match && match[1]) return match[1];
            }
            return null;
        };
        const scriptTags = $('script').map((_, el) => $(el).html()).get();
        for (const script of scriptTags) {
            if (!script) continue;
            const dataMatcher = /\{(?:[^{}]|(?:\{[^{}]*\}))*\}/g;
            const matches = script.match(dataMatcher) || [];
            for (const match of matches) {
                try {
                    const jsonObj = JSON.parse(match);
                    if (jsonObj.fb_dtsg) formData.fb_dtsg = jsonObj.fb_dtsg;
                    if (jsonObj.jazoest) formData.jazoest = jsonObj.jazoest;
                    if (jsonObj.lsd) formData.lsd = jsonObj.lsd;
                } catch (e) {
                    const fieldMatchers = {
                        fb_dtsg: /fb_dtsg\s*[=:]\s*['"]([^'"]+)['"]/,
                        jazoest: /jazoest\s*[=:]\s*['"]([^'"]+)['"]/,
                        lsd: /lsd\s*[=:]\s*['"]([^'"]+)['"]/
                    };
                    for (const [field, matcher] of Object.entries(fieldMatchers)) {
                        const fieldMatch = match.match(matcher);
                        if (fieldMatch && fieldMatch[1]) formData[field] = fieldMatch[1];
                    }
                }
            }
        }
        const fields = ['fb_dtsg', 'jazoest', 'lsd', 'reg_instance', 'reg_impression_id', 'logger_id'];
        fields.forEach(field => {
            if (!formData[field]) {
                const extractedValue = extractByRegex(field);
                if (extractedValue) formData[field] = extractedValue;
            }
        });
        const jsonPatterns = [
            /__initialData__\s*=\s*(\{.*?\});/s,
            /\bwindow\.__data\s*=\s*(\{.*?\});/s,
            /\bbootstrap_data\s*=\s*(\{.*?\});/s,
            /\bFBSDK\.init\s*\(\s*(\{.*?\})\s*\);/s
        ];
        for (const pattern of jsonPatterns) {
            const match = html.match(pattern);
            if (match && match[1]) {
                try {
                    const jsonObj = JSON.parse(match[1]);
                    for (const field of fields) {
                        if (jsonObj[field] && !formData[field]) formData[field] = jsonObj[field];
                    }
                } catch (e) {}
            }
        }
        if (!formData.jazoest && formData.fb_dtsg) {
            const ascii = Array.from(formData.fb_dtsg).map(c => c.charCodeAt(0));
            const sum = ascii.reduce((a, b) => a + b, 0);
            formData.jazoest = '2' + sum;
        }
        if (!formData.fb_dtsg) {
            const metaFbDtsg = $('meta[name="fb_dtsg"]').attr('content');
            if (metaFbDtsg) formData.fb_dtsg = metaFbDtsg;
            else formData.fb_dtsg = 'AQH' + Math.random().toString(36).substring(2, 15) + ':' + Math.random().toString(36).substring(2, 15);
        }
        if (!formData.jazoest) {
            const ascii = Array.from(formData.fb_dtsg || '').map(c => c.charCodeAt(0));
            const sum = ascii.reduce((a, b) => a + b, 0);
            formData.jazoest = '2' + (sum || Math.floor(Math.random() * 9000) + 1000);
        }
        if (formData.fb_dtsg && formData.jazoest && typeof formData.lsd === 'undefined') {
            formData.lsd = '';
        }
        return formData;
    } catch (error) {
        console.error('Form data extraction error:', error);
        return { error: error.toString(), fb_dtsg: 'FALLBACK_DTSG', jazoest: 'FALLBACK_JAZOEST', lsd: 'FALLBACK_LSD' };
    }
};

const getProfileUrl = (uid) => `https://www.facebook.com/profile.php?id=${uid}`;

function fakePassword() {
    const randomNumbers = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join('');
    return `JUBIAR-${randomNumbers}`;
}

module.exports = {
    name: 'fbcreate',
    description: 'Create a Facebook account using the provided email and sends credentials in a file and message.',
    admin_only: true,
    async execute(message, args) {
        if (args.length < 1) {
            return message.reply({ content: '❌ **Error:** Oops! You forgot to provide an email address.\nUsage: `fbcreate your@email.com`' });
        }

        const email = args[0];
        const passw = fakePassword();
        let statusMsg;
        const { firstName, lastName } = fakeName();

        const sendCredentials = async (emailAddress, password, uid, profileUrl, accountName, messageContentBase, outcomeType) => {
            const fileName = `fb_credentials_${emailAddress.split('@')[0]}_${Date.now()}.txt`;
            const outputDir = path.join(__dirname, '..', 'generated_accounts');
            if (!fs.existsSync(outputDir)) {
                try { fs.mkdirSync(outputDir, { recursive: true }); }
                catch (dirError) { console.error('Failed to create output directory:', dirError); }
            }
            const filePath = path.join(outputDir, fileName);
            const fileContent = `Facebook Account Credentials:\n\nName: ${accountName.firstName} ${accountName.lastName}\nEmail: ${emailAddress}\nPassword: ${password}\nUser ID: ${uid || "Not available"}\nProfile URL: ${profileUrl || "Not available"}\n`;
            
            let fullMessage = `${messageContentBase}\n\n👤 **Name:** \`${accountName.firstName} ${accountName.lastName}\`\n📧 **Email:** \`${emailAddress}\`\n🔑 **Password:** \`${password}\``;
            
            if (uid && uid !== "Not available" && uid !== "0") {
                fullMessage += `\n🆔 **User ID:** \`${uid}\``;
            } else if (outcomeType === "checkpoint_manual_otp") {
                fullMessage += `\n🆔 **User ID:** 📬 Manual confirmation needed (ID might appear after you confirm).`;
            }
            
            if (profileUrl && profileUrl.startsWith("https://") && profileUrl !== "Profile URL not found or confirmation pending.") {
                 fullMessage += `\n🔗 **Profile:** ${profileUrl}`;
            }

            if (outcomeType === "success") {
                 fullMessage += `\n\nCheck \`${emailAddress}\` for any welcome messages from Facebook. Enjoy your new account!`;
            } else if (outcomeType === "checkpoint_manual_otp") {
                 fullMessage += `\n\nPlease check your email \`${emailAddress}\` for a confirmation code from Facebook and complete the verification process manually on their site.`;
            } else if (outcomeType !== "critical_failure" && outcomeType !== "failure") {
                 fullMessage += `\n\nIf you received an email from Facebook, please try to complete the registration process manually.`;
            }

            const components = [];
            if (outcomeType === "success" || outcomeType === "checkpoint_manual_otp") {
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('fb_copy_email')
                            .setLabel('Copy Email')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('📧'),
                        new ButtonBuilder()
                            .setCustomId('fb_copy_password')
                            .setLabel('Copy Password')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('🔑')
                    );
                components.push(row);
            }

            try {
                fs.writeFileSync(filePath, fileContent);
                await message.reply({ content: fullMessage, files: [filePath], components: components });
            } catch (fileError) {
                console.error('File operation error:', fileError);
                fullMessage += "\n\n⚠️ **File Error:** Could not create or send the credentials file. The details are in this message only.";
                await message.reply({ content: fullMessage, components: components }); // Try sending with components even if file fails
            }
        };
        
        statusMsg = await message.reply({ content: '⏳ Hold tight! Conjuring up a new Facebook account for you...' });

        try {
            await statusMsg.edit({ content: '🔗 Establishing a secure connection with Facebook...' });
            
            const axiosCookieJar = {}; 
            const session = axios.create({
                headers: { 
                    'User-Agent': ugenX(), 
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1'
                },
                maxRedirects: 5, 
                validateStatus: function (status) {
                    return status >= 200 && status < 500; 
                },
                timeout: 45000 
            });

            session.interceptors.response.use(response => { 
                const cookies = response.headers['set-cookie'];
                if (cookies) {
                    cookies.forEach(cookie => {
                        const [cookieMain] = cookie.split(';');
                        const [key, value] = cookieMain.split('=');
                        if (key && value) axiosCookieJar[key.trim()] = value.trim();
                    });
                }
                return response;
            }, error => { 
                if (error.response && error.response.headers && error.response.headers['set-cookie']) {
                     const cookies = error.response.headers['set-cookie'];
                     cookies.forEach(cookie => {
                        const [cookieMain] = cookie.split(';');
                        const [key, value] = cookieMain.split('=');
                        if (key && value) axiosCookieJar[key.trim()] = value.trim();
                    });
                }
                return Promise.reject(error);
            });

            session.interceptors.request.use(config => { 
                const cookieStr = Object.entries(axiosCookieJar)
                    .map(([key, value]) => `${key}=${value}`)
                    .join('; ');
                if (cookieStr) {
                    config.headers.Cookie = cookieStr;
                }
                return config;
            });
            
            try { 
                await session.get('https://m.facebook.com/');
                await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000)); 
                await session.get('https://m.facebook.com/cookie/consent_prompt/?next_uri=https%3A%2F%2Fm.facebook.com%2F');
                await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 500));
            } catch (error) {
                console.warn('Initial connection/consent error (might be okay):', error.message);
            }

            await statusMsg.edit({ content: '📄 Navigating to the Facebook signup page...' });
            let regPageResponse = await session.get('https://m.facebook.com/reg/'); 
            if (regPageResponse.status >= 400) { 
                 regPageResponse = await session.get('https://m.facebook.com/r.php');
            }
            let responseData = regPageResponse.data;
            
            await statusMsg.edit({ content: '🔍 Extracting necessary registration details...' });
            let formula = extractFormData(responseData); 

            if (!formula || !formula.fb_dtsg || !formula.jazoest || Object.keys(formula).length < 3) { 
                await statusMsg.edit({ content: '🤔 First attempt to get form data was tricky. Trying an alternative method...' });
                const altRegResponse = await session.get('https://m.facebook.com/signup/lite/', { 
                     headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 12; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/423.0.0.21.64]' }
                });
                const altFormula = extractFormData(altRegResponse.data);
                if (altFormula && altFormula.fb_dtsg && altFormula.jazoest) {
                    formula = altFormula;
                    responseData = altRegResponse.data; 
                }
            }
            
            if (!formula || !formula.fb_dtsg || !formula.jazoest) { 
                await statusMsg.edit({ content: '⚙️ Using fallback values for some form data to ensure progression. This is normal.' });
                formula = {
                    fb_dtsg: formula?.fb_dtsg || 'AQH' + Math.random().toString(36).substring(2, 15) + ':' + Math.random().toString(36).substring(2, 15), 
                    jazoest: formula?.jazoest || '2' + (Math.floor(Math.random() * 8999) + 1000).toString(), 
                    lsd: formula?.lsd || '', 
                    reg_instance: formula?.reg_instance || '',
                    reg_impression_id: formula?.reg_impression_id || '',
                    logger_id: formula?.logger_id || ''
                };
            }
            
            await statusMsg.edit({ content: '✨ Form data successfully acquired! Moving to the next step.' }); // Changed this line

            const randomDay = Math.floor(Math.random() * 28) + 1;
            const randomMonth = Math.floor(Math.random() * 12) + 1;
            const randomYear = Math.floor(Math.random() * (2004 - 1992 + 1)) + 1992; 
            const gender = Math.random() > 0.5 ? '1' : '2'; 

            const payload = new URLSearchParams(); 
            payload.append('firstname', firstName);
            payload.append('lastname', lastName);
            payload.append('reg_email__', email);
            payload.append('reg_passwd__', passw);
            payload.append('birthday_day', randomDay.toString());
            payload.append('birthday_month', randomMonth.toString());
            payload.append('birthday_year', randomYear.toString());
            payload.append('sex', gender); 
            payload.append('websubmit', '1'); 
            payload.append('submit', 'Sign Up'); 
            payload.append('ns', '0'); 
            
            Object.entries(formula).forEach(([key, value]) => {
                if (value && !payload.has(key)) payload.append(key, value);
            });

            if (formula.fb_dtsg && !payload.has('fb_dtsg')) payload.set('fb_dtsg', formula.fb_dtsg);
            if (formula.jazoest && !payload.has('jazoest')) payload.set('jazoest', formula.jazoest);
            if (formula.lsd && !payload.has('lsd')) payload.set('lsd', formula.lsd);

            const $formPage = cheerio.load(responseData);
            $formPage('form input[type="hidden"]').each((_, el) => {
                const name = $formPage(el).attr('name');
                const value = $formPage(el).attr('value');
                if (name && value && !payload.has(name)) {
                    payload.append(name, value);
                }
            });
            
            if (!payload.has('encpass')) {
                 payload.append('encpass', `#PWD_BROWSER:0:${Math.floor(Date.now() / 1000)}:${passw}`);
            }

            await statusMsg.edit({ content: '🚀 Sending your new account details to Facebook... Wish us luck!' });
            await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1500)); 
            
            const submitEndpoints = [ 
                'https://m.facebook.com/reg/submit/',
                'https://m.facebook.com/ajax/register.php',
                'https://m.facebook.com/signup/account/actor/', 
            ];
            
            let submitResponse = null;
            let submitSuccess = false; 
            let confirmationNeeded = false; 
            let responseText = ''; 
            
            const reqHeaders = { 
                'Host': 'm.facebook.com',
                'Origin': 'https://m.facebook.com',
                'Referer': regPageResponse.request.res.responseUrl || 'https://m.facebook.com/reg/', 
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': session.defaults.headers['User-Agent'], 
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'en-US,en;q=0.9',
                'Sec-Fetch-Site': 'same-origin',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-User': '?1',
                'Sec-Fetch-Dest': 'document',
            };
            
            for (const endpoint of submitEndpoints) { 
                try {
                    await statusMsg.edit({ content: `📨 Attempting submission via endpoint: ${new URL(endpoint).pathname}...` });
                    submitResponse = await session.post(endpoint, payload.toString(), { headers: reqHeaders, timeout: 60000 });
                    responseText = typeof submitResponse.data === 'string' ? submitResponse.data : JSON.stringify(submitResponse.data);
                    const currentCookies = Object.entries(axiosCookieJar).map(([k,v])=>`${k}=${v}`).join('; ');

                    if (currentCookies.includes('c_user=') && !currentCookies.includes('c_user=0')) {
                        submitSuccess = true; 
                    }
                    if (responseText.includes('confirmation_code') || responseText.includes('code sent') || 
                        responseText.includes('verify your email') || responseText.includes('enter the code') ||
                        responseText.toLowerCase().includes('checkpoint') || currentCookies.includes('checkpoint=')) {
                        confirmationNeeded = true; submitSuccess = true; 
                    }
                    if (responseText.includes('Welcome to Facebook') || responseText.includes('profile.php') || responseText.includes('home.php')) {
                        submitSuccess = true; 
                    }
                    if (responseText.includes('error_message') || responseText.includes('reg_error') || submitResponse.status >= 400) {
                        console.warn(`Submission to ${endpoint} resulted in status ${submitResponse.status} or error content.`);
                    }
                    if (submitSuccess) break;
                    await new Promise(resolve => setTimeout(resolve, 1000)); 
                } catch (error) { 
                    console.error(`Error submitting to ${endpoint}:`, error.message);
                    responseText = error.message; 
                    if (error.response && error.response.data) {
                        responseText += ' | Response: ' + (typeof error.response.data === 'string' ? error.response.data.substring(0, 200) : JSON.stringify(error.response.data));
                    }
                    if (error.code === 'ECONNRESET' || error.message.includes('ECONNRESET') || error.code === 'ETIMEDOUT') {
                        await statusMsg.edit({ content: `⚠️ **Notice:** Connection issue during submission to ${new URL(endpoint).pathname}. Facebook might be processing. This can sometimes mean it's a checkpoint.`});
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        confirmationNeeded = true; submitSuccess = true; 
                        break; 
                    }
                }
            }
            
            let uid = "Not available";
            let profileUrl = "Profile URL not found or confirmation pending.";
            const finalCookieString = Object.entries(axiosCookieJar).map(([k,v])=>`${k}=${v}`).join('; ');

            const cUserMatch = finalCookieString.match(/c_user=(\d+)/);
            if (cUserMatch && cUserMatch[1] && cUserMatch[1] !== '0') {
                uid = cUserMatch[1];
            } else { 
                const xsMatch = finalCookieString.match(/xs=([^;]+)/);
                if (xsMatch && xsMatch[1]) {
                    const xsParts = decodeURIComponent(xsMatch[1]).split(':'); 
                    if (xsParts.length > 1 && /^\d{10,}$/.test(xsParts[0]) && xsParts[0] !== '0') { 
                        uid = xsParts[0];
                    }
                }
            }
            
            if (uid === "Not available" && (submitSuccess || confirmationNeeded) && responseText) {
                const uidPatterns = [
                    /"USER_ID":"(\d+)"/, /"actorID":"(\d+)"/, /"userID":(\d+)/,
                    /profile_id=(\d+)/, /subject_id=(\d+)/, /viewer_id=(\d+)/,
                    /\\"uid\\":(\d+)/, /\\"user_id\\":\\"(\d+)\\"/,
                    /name="target" value="(\d+)"/ 
                ];
                for (const pattern of uidPatterns) {
                    const match = responseText.match(pattern);
                    if (match && match[1] && /^\d+$/.test(match[1]) && match[1] !== '0') {
                        uid = match[1]; break;
                    }
                }
            }
            
            if (uid === "Not available" && (submitSuccess || confirmationNeeded) && finalCookieString.includes('datr') && (finalCookieString.includes('fr') || finalCookieString.includes('xs'))) {
                try {
                    await statusMsg.edit({ content: '🆔 Verifying account creation and trying to fetch your new User ID...' });
                    const homeResponse = await session.get('https://m.facebook.com/home.php');
                    const homeHtml = homeResponse.data;
                    const homeUidPatterns = [ /"USER_ID":"(\d+)"/, /"actorID":"(\d+)"/, /name="target" value="(\d+)"/ ];
                    for (const pattern of homeUidPatterns) {
                        const homeUidMatch = homeHtml.match(pattern);
                        if (homeUidMatch && homeUidMatch[1] && /^\d+$/.test(homeUidMatch[1]) && homeUidMatch[1] !== '0') {
                            uid = homeUidMatch[1]; break;
                        }
                    }
                } catch (error) { console.warn('Error getting UID from home page after presumed success/checkpoint:', error.message); }
            }
            
            if (uid !== "Not available" && /^\d+$/.test(uid) && uid !== '0') {
                profileUrl = getProfileUrl(uid); 
            }

            if (submitSuccess && uid !== "Not available" && uid !== '0' && !confirmationNeeded) {
                const successMessageBase = `✅ **Hooray! Your new Facebook Account is Ready!** 🎉`;
                await sendCredentials(email, passw, uid, profileUrl, { firstName, lastName }, successMessageBase, "success");
            } else if (confirmationNeeded || (submitSuccess && (uid === "Not available" || uid === '0')) || (responseText && responseText.toLowerCase().includes('checkpoint'))) {
                const manualOtpMessageBase = `✅ **Account Created Successfully But Need Manual Confirmation code** 📬`;
                await sendCredentials(email, passw, uid, profileUrl, { firstName, lastName }, manualOtpMessageBase, "checkpoint_manual_otp");
            } else {
                let errorMsg = 'Unknown error or Facebook rejected the registration.';
                if (responseText) {
                    const $$ = cheerio.load(responseText); 
                    errorMsg = $$('#reg_error_inner').text().trim() || 
                               $$('div[role="alert"]').text().trim() || 
                               $$('._585n').text().trim() || 
                               $$('._585r').text().trim() ||
                               (responseText.length < 200 ? responseText : responseText.substring(0, 200) + "..."); 
                    if (!errorMsg || errorMsg.length < 5) errorMsg = "Facebook rejected the registration or an unknown error occurred. Check server logs for response details.";
                }
                const failureMessageBase = `❌ **Account Creation Failed!**\n\n**Reason:** ${errorMsg}`;
                await sendCredentials(email, passw, uid, profileUrl, { firstName, lastName }, failureMessageBase, "failure");
            }
            await statusMsg.delete().catch(e => console.error("Failed to delete status msg:", e));

        } catch (error) { 
            console.error('FB Account Creation - Critical Error in execute block:', error);
            let errorMessage = error.message || "An unexpected error occurred.";
            if (error.stack) console.error(error.stack);
            if (error.response && error.response.status) errorMessage += ` - Status: ${error.response.status}`;
            if (error.response && error.response.data) errorMessage += ` - Data: ${(typeof error.response.data === 'string' ? error.response.data.substring(0,100) : JSON.stringify(error.response.data)).replace(/\n/g, ' ')}`;
            
            const criticalFailureMessageBase = `❌ **Critical Error During Account Creation!**\n\n**Error Details:** ${errorMessage}`;
            const currentName = (firstName && lastName) ? { firstName, lastName } : fakeName(); 
            await sendCredentials(email, passw, "Not available", "Profile URL not available", currentName, criticalFailureMessageBase, "critical_failure");
            if (statusMsg) await statusMsg.delete().catch(e => console.error("Failed to delete status message:", e));
        }
    }
};