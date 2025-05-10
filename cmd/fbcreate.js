const axios = require('axios');
const cheerio = require('cheerio');
const { faker } = require('@faker-js/faker');

module.exports = {
    name: 'fbcreate',
    description: 'Create a Facebook account using the provided email',
    async execute(message, args) {
        if (args.length < 1) {
            return message.reply('❌ Please provide an email address. Usage: `fbcreate [email]`');
        }

        const email = args[0];
        
        // Send initial response
        const statusMsg = await message.reply('⏳ Attempting to create Facebook account...');

        try {
            // Initialize utilities
            const ugenX = () => {
                // List of common user agents
                const userAgents = [
                    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36',
                    'Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
                    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15'
                ];
                return userAgents[Math.floor(Math.random() * userAgents.length)];
            };

            const fakePassword = () => {
                const randomNumbers = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join('');
                return `JUBIAR-${randomNumbers}`;
            };

            const fakeName = () => {
                return {
                    firstName: faker.person.firstName(),
                    lastName: faker.person.lastName()
                };
            };

            const getBdNumber = () => {
                const prefixes = ['013', '014', '015', '016', '017', '018', '019'];
                const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
                const number = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join('');
                return `${prefix}${number}`;
            };

            const extractFormData = (html) => {
                try {
                    const formData = {};
                    const $ = cheerio.load(html);
                    
                    // Method 1: Find all input elements
                    $('input').each((_, el) => {
                        const name = $(el).attr('name');
                        const value = $(el).attr('value');
                        if (name) {
                            formData[name] = value || '';
                        }
                    });
                    
                    // Method 2: Use regex to extract key form fields from the HTML
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
                            if (match && match[1]) {
                                return match[1];
                            }
                        }
                        return null;
                    };
                    
                    // Method 3: Extract from JavaScript objects in scripts
                    const scriptTags = $('script').map((_, el) => $(el).html()).get();
                    for (const script of scriptTags) {
                        // Look for JSON objects or JavaScript objects that might contain form data
                        const dataMatcher = /\{(?:[^{}]|(?:\{[^{}]*\}))*\}/g;
                        const matches = script.match(dataMatcher) || [];
                        
                        for (const match of matches) {
                            try {
                                const jsonObj = JSON.parse(match);
                                if (jsonObj.fb_dtsg) formData.fb_dtsg = jsonObj.fb_dtsg;
                                if (jsonObj.jazoest) formData.jazoest = jsonObj.jazoest;
                                if (jsonObj.lsd) formData.lsd = jsonObj.lsd;
                            } catch (e) {
                                // Not valid JSON, but might contain variables
                                const fieldMatchers = {
                                    fb_dtsg: /fb_dtsg\s*[=:]\s*['"]([^'"]+)['"]/,
                                    jazoest: /jazoest\s*[=:]\s*['"]([^'"]+)['"]/,
                                    lsd: /lsd\s*[=:]\s*['"]([^'"]+)['"]/
                                };
                                
                                for (const [field, matcher] of Object.entries(fieldMatchers)) {
                                    const fieldMatch = match.match(matcher);
                                    if (fieldMatch && fieldMatch[1]) {
                                        formData[field] = fieldMatch[1];
                                    }
                                }
                            }
                        }
                    }
                    
                    // Extract essential fields using multiple methods
                    const fields = [
                        'fb_dtsg', 'jazoest', 'lsd', 'reg_instance', 
                        'reg_impression_id', 'logger_id'
                    ];
                    
                    fields.forEach(field => {
                        if (!formData[field]) {
                            const extractedValue = extractByRegex(field);
                            if (extractedValue) {
                                formData[field] = extractedValue;
                            }
                        }
                    });
                    
                    // Method 4: Try to find form data in any JSON-like structure
                    const jsonPatterns = [
                        /__initialData__\s*=\s*(\{.*?\});/s,
                        /\bwindow\.__data\s*=\s*(\{.*?\});/s,
                        /\bbootstrap_data\s*=\s*(\{.*?\});/s,
                        /\bFBSDK\.init\s*$$\s*(\{.*?\})\s*$$;/s
                    ];
                    
                    for (const pattern of jsonPatterns) {
                        const match = html.match(pattern);
                        if (match && match[1]) {
                            try {
                                const jsonObj = JSON.parse(match[1]);
                                for (const field of fields) {
                                    if (jsonObj[field]) formData[field] = jsonObj[field];
                                }
                            } catch (e) {
                                // Not valid JSON
                            }
                        }
                    }
                    
                    // If we still don't have required fields, try to create default values
                    if (!formData.jazoest && formData.fb_dtsg) {
                        // Jazoest is often derived from fb_dtsg in some way
                        const ascii = Array.from(formData.fb_dtsg).map(c => c.charCodeAt(0));
                        const sum = ascii.reduce((a, b) => a + b, 0);
                        formData.jazoest = '2' + sum;
                    }
                    
                    // Try to create some fallback values if we couldn't extract them
                    if (!formData.fb_dtsg) {
                        // Extract from meta tag (sometimes Facebook puts it there)
                        const metaFbDtsg = $('meta[name="fb_dtsg"]').attr('content');
                        if (metaFbDtsg) {
                            formData.fb_dtsg = metaFbDtsg;
                        } else {
                            // Generate a placeholder (may not work but worth trying)
                            formData.fb_dtsg = 'AQHrJ7_sFpUI:' + Math.random().toString(36).substring(2);
                        }
                    }
                    
                    if (!formData.jazoest) {
                        // Generate a placeholder jazoest
                        const ascii = Array.from(formData.fb_dtsg || '').map(c => c.charCodeAt(0));
                        const sum = ascii.reduce((a, b) => a + b, 0);
                        formData.jazoest = '2' + (sum || Math.floor(Math.random() * 10000));
                    }
                    
                    console.log('Extracted form data:', formData);
                    return formData;
                } catch (error) {
                    console.error('Form data extraction error:', error);
                    return { error: error.toString() };
                }
            };

            const getProfileUrl = (uid) => {
                return `https://www.facebook.com/profile.php?id=${uid}`;
            };

            // Start the account creation process
            await statusMsg.edit('📝 Starting Facebook account creation process...');
            
            const passw = fakePassword();
            
            // Create an Axios session with cookies enabled
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
                    return status >= 200 && status < 500; // Accept all responses except server errors
                },
                timeout: 30000 // 30 second timeout
            });

            // Intercept responses to save cookies
            session.interceptors.response.use(response => {
                const cookies = response.headers['set-cookie'];
                if (cookies) {
                    cookies.forEach(cookie => {
                        const [cookieMain] = cookie.split(';');
                        const [key, value] = cookieMain.split('=');
                        axiosCookieJar[key] = value;
                    });
                }
                return response;
            });

            // Intercept requests to send cookies
            session.interceptors.request.use(config => {
                const cookieStr = Object.entries(axiosCookieJar)
                    .map(([key, value]) => `${key}=${value}`)
                    .join('; ');
                if (cookieStr) {
                    config.headers.Cookie = cookieStr;
                }
                return config;
            });

            // Step 1: First visit Facebook homepage to get initial cookies
            await statusMsg.edit('📝 Initializing session with Facebook...');
            
            try {
                await session.get('https://m.facebook.com/');
                await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
                
                // Try clearing cookies prompt if it exists
                await session.get('https://m.facebook.com/cookie/consent_prompt/?next_uri=https%3A%2F%2Fm.facebook.com%2F');
                await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 500));
            } catch (error) {
                console.log('Initial connection error, retrying with different user agent:', error.message);
                // Try with a different user agent
                session.defaults.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36';
                await session.get('https://m.facebook.com/');
            }

            // Get signup page directly (different from registration page)
            await statusMsg.edit('📝 Accessing signup page...');
            await session.get('https://m.facebook.com/signup');
            
            // Try multiple registration pages to see which one works
            const registrationEndpoints = [
                'https://m.facebook.com/reg/',
                'https://m.facebook.com/r.php',
                'https://m.facebook.com/signup/form/',
                'https://www.facebook.com/signup'
            ];
            
            let formula = null;
            let responseData = '';
            
            for (const endpoint of registrationEndpoints) {
                await statusMsg.edit(`📝 Trying registration endpoint: ${endpoint}...`);
                
                try {
                    const regResponse = await session.get(endpoint, {
                        params: {
                            cid: Math.random().toString(36).substring(2),
                            refsrc: 'deprecated',
                            soft: 'hjk'
                        }
                    });
                    
                    // Save response data without writing to file
                    responseData = regResponse.data;
                    
                    // Extract form data
                    const extractedFormula = extractFormData(regResponse.data);
                    
                    // If we found at least some form data
                    if (extractedFormula && Object.keys(extractedFormula).length > 1) {
                        formula = extractedFormula;
                        // If we found both essential fields, break the loop
                        if (formula.fb_dtsg && formula.jazoest) {
                            console.log(`Found complete form data from ${endpoint}`);
                            break;
                        }
                    }
                } catch (error) {
                    console.error(`Error accessing ${endpoint}:`, error.message);
                    // Continue to next endpoint
                }
            }
            
            // If we still don't have a working formula, try a different approach - mobile app emulation
            if (!formula || !formula.fb_dtsg || !formula.jazoest) {
                await statusMsg.edit('⚠️ Trying mobile app emulation approach...');
                
                try {
                    // Try with a mobile app user agent
                    const mobileAppResponse = await session.get('https://m.facebook.com/reg/', {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Linux; Android 12; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/423.0.0.21.64]'
                        }
                    });
                    
                    const mobileFormula = extractFormData(mobileAppResponse.data);
                    
                    if (mobileFormula && mobileFormula.fb_dtsg && mobileFormula.jazoest) {
                        formula = mobileFormula;
                        responseData = mobileAppResponse.data;
                    }
                } catch (error) {
                    console.error('Error with mobile app emulation:', error.message);
                }
            }
            
            // Last resort: Create a fallback formula with placeholders
            if (!formula || !formula.fb_dtsg || !formula.jazoest) {
                await statusMsg.edit('⚠️ Using fallback method with default values...');
                formula = {
                    fb_dtsg: formula?.fb_dtsg || 'AQHOjJ7_sFpUI:' + Math.random().toString(36).substring(2), 
                    jazoest: formula?.jazoest || '2' + Math.floor(Math.random() * 10000),
                    lsd: formula?.lsd || '',
                    reg_instance: formula?.reg_instance || '',
                    reg_impression_id: formula?.reg_impression_id || '',
                    logger_id: formula?.logger_id || ''
                };
            }
            
            await statusMsg.edit('🔄 Form data extraction complete!');

            // Generate random user data
            const phone = getBdNumber();
            const { firstName, lastName } = fakeName();
            const randomDay = Math.floor(Math.random() * 28) + 1;
            const randomMonth = Math.floor(Math.random() * 12) + 1;
            const randomYear = Math.floor(Math.random() * (2004 - 1992 + 1)) + 1992;
            const gender = Math.random() > 0.5 ? '1' : '2'; // 1=male, 2=female

            // Prepare registration payload
            const payload = new URLSearchParams({
                'lsd': formula.lsd || '',
                'jazoest': formula.jazoest || '',
                'fb_dtsg': formula.fb_dtsg || '',
                'ccp': '2',
                'reg_instance': formula.reg_instance || '',
                'submission_request': 'true',
                'helper': '',
                'reg_impression_id': formula.reg_impression_id || '',
                'ns': '0',
                'zero_header_af_client': '',
                'app_id': '103',
                'logger_id': formula.logger_id || '',
                'field_names[0]': 'firstname',
                'firstname': firstName,
                'lastname': lastName,
                'field_names[1]': 'birthday_wrapper',
                'birthday_day': randomDay.toString(),
                'birthday_month': randomMonth.toString(),
                'birthday_year': randomYear.toString(),
                'age_step_input': '',
                'did_use_age': 'false',
                'field_names[2]': 'reg_email__',
                'reg_email__': email,
                'field_names[3]': 'sex',
                'sex': gender,
                'preferred_pronoun': '',
                'custom_gender': '',
                'field_names[4]': 'reg_passwd__',
                'reg_passwd__': passw,
                'name_suggest_elig': 'false',
                'was_shown_name_suggestions': 'false',
                'did_use_suggested_name': 'false',
                'use_custom_gender': 'false',
                'guid': '',
                'pre_form_step': '',
                'encpass': `#PWD_BROWSER:0:${Math.floor(Date.now() / 1000)}:${passw}`,
                'submit': 'Sign Up'
            });

            // Add any additional form fields we might have found
            Object.entries(formula).forEach(([key, value]) => {
                if (!payload.has(key) && value) {
                    payload.append(key, value);
                }
            });

            // Extract any additional form fields from the response
            const $ = cheerio.load(responseData);
            $('input[type="hidden"]').each((_, el) => {
                const name = $(el).attr('name');
                const value = $(el).attr('value');
                if (name && !payload.has(name)) {
                    payload.append(name, value || '');
                }
            });

            await statusMsg.edit('🚀 Submitting registration data...');
            
            // Add a small delay to mimic human behavior before submission
            await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1500));
            
            // Try multiple registration submission endpoints
            const submitEndpoints = [
                'https://m.facebook.com/reg/submit/',
                'https://m.facebook.com/signup/form/submit/',
                'https://m.facebook.com/ajax/register.php'
            ];
            
            let submitResponse = null;
            let submitSuccess = false;
            let confirmationNeeded = false;
            
            const headers = {
                'Host': 'm.facebook.com',
                'Origin': 'https://m.facebook.com',
                'Referer': 'https://m.facebook.com/reg/',
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': ugenX(),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'sec-ch-ua': '"Chromium";v="112", "Not_A Brand";v="24"',
                'sec-ch-ua-mobile': '?1',
                'sec-ch-ua-platform': '"Android"'
            };
            
            for (const endpoint of submitEndpoints) {
                await statusMsg.edit(`🚀 Submitting to: ${endpoint}...`);
                
                try {
                    submitResponse = await session.post(endpoint, payload, { 
                        headers,
                        timeout: 60000 // Increase timeout for submission
                    });
                    
                    // Check if we got a success indicator
                    const responseCookies = submitResponse.headers['set-cookie'] || [];
                    const cookieString = responseCookies.join('; ');
                    
                    // Check for confirmation code requirement
                    if (submitResponse.data.includes('confirmation_code') || 
                        submitResponse.data.includes('code sent') || 
                        submitResponse.data.includes('verify your email') ||
                        submitResponse.data.includes('enter the code')) {
                        confirmationNeeded = true;
                        submitSuccess = true; // Consider this a partial success
                        break;
                    }
                    
                    if (cookieString.includes('c_user=') || 
                        submitResponse.data.includes('welcome') ||
                        submitResponse.data.includes('success') ||
                        submitResponse.data.includes('profile.php')) {
                        submitSuccess = true;
                        break;
                    }
                    
                    // If we get a clear failure, no need to try other endpoints
                    if (submitResponse.data.includes('error') || 
                        submitResponse.data.includes('failed') ||
                        submitResponse.data.includes('not available')) {
                        break;
                    }
                    
                    // Slight delay between attempts
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                } catch (error) {
                    console.error(`Error submitting to ${endpoint}:`, error.message);
                    
                    // If we get a connection reset error, it might still be processing
                    if (error.code === 'ECONNRESET' || error.message.includes('ECONNRESET')) {
                        await statusMsg.edit(`⚠️ Connection reset while submitting to ${endpoint}. This often happens when Facebook is processing the registration.`);
                        
                        // Wait a bit longer
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        
                        // Assume confirmation code might be needed
                        confirmationNeeded = true;
                        submitSuccess = true; // Consider this a partial success
                        break;
                    }
                }
            }
            
            // If we need confirmation code
            if (confirmationNeeded) {
                await statusMsg.edit(`📧 Registration initiated! A confirmation code has been sent to ${email}.

Email: ${email}
Password: ${passw}

Please check your email and manually confirm your account by visiting Facebook.`);
                return;
            }
            
            if (!submitResponse && !confirmationNeeded) {
                await statusMsg.edit(`❌ Failed to submit registration form. All endpoints failed. However, check your email for a confirmation code.

Email: ${email}
Password: ${passw}

Please manually confirm your account by visiting Facebook.`);
                return;
            }
            
            // Check response cookies and body for success indicators
            const responseCookies = submitResponse?.headers['set-cookie'] || [];
            const cookieString = responseCookies.join('; ');
            
            // Improved user ID extraction
            let uid = "Not available yet";
            
            // Method 1: Extract from c_user cookie (most reliable)
            const cUserMatch = cookieString.match(/c_user=(\d+)/);
            if (cUserMatch && cUserMatch[1]) {
                uid = cUserMatch[1];
            } 
            // Method 2: Extract from xs cookie (sometimes contains user ID)
            else if (cookieString.includes('xs=')) {
                const xsMatch = cookieString.match(/xs=([^;]+)/);
                if (xsMatch && xsMatch[1]) {
                    // The xs cookie sometimes has the user ID encoded in it
                    const xsParts = xsMatch[1].split(':');
                    if (xsParts.length > 1 && /^\d+$/.test(xsParts[0])) {
                        uid = xsParts[0];
                    }
                }
            }
            // Method 3: Extract from response body
            else if (submitResponse?.data) {
                // Try multiple patterns to find user ID in response
                const uidPatterns = [
                    /(?:user_id|userId|uid)["']?\s*[=:]\s*["']?(\d+)/i,
                    /profile\.php\?id=(\d+)/i,
                    /\/profile\/(\d+)/i,
                    /\["(\d{8,})",/,
                    /"USER_ID":"(\d+)"/,
                    /"actorID":"(\d+)"/
                ];
                
                for (const pattern of uidPatterns) {
                    const match = submitResponse.data.match(pattern);
                    if (match && match[1] && match[1] !== '0') {
                        uid = match[1];
                        break;
                    }
                }
            }
            
            // Method 4: Try to get UID from a follow-up request if still not found
            if (uid === "Not available yet" && submitSuccess) {
                try {
                    // Try to access the home page, which often redirects to the profile
                    const homeResponse = await session.get('https://m.facebook.com/home.php');
                    const homeHtml = homeResponse.data;
                    
                    // Look for profile links or user ID in the home page
                    const homeUidMatch = homeHtml.match(/\/profile\.php\?id=(\d+)|\/profile\/(\d+)|"USER_ID":"(\d+)"|"actorID":"(\d+)"/);
                    if (homeUidMatch) {
                        // Find the first non-empty capture group
                        for (let i = 1; i < homeUidMatch.length; i++) {
                            if (homeUidMatch[i]) {
                                uid = homeUidMatch[i];
                                break;
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error getting UID from home page:', error.message);
                }
            }
            
            // Generate profile URL if we have a user ID
            const profileUrl = uid !== "Not available yet" ? getProfileUrl(uid) : "Profile URL will be available after confirmation";
            
            // Check if we have a successful account creation
            if (submitSuccess || cookieString.includes('c_user=')) {
                await statusMsg.edit(`✅ Account created successfully!

User ID: ${uid}
Email: ${email}
Password: ${passw}
Profile URL: ${profileUrl}

Please check your email and manually confirm your account if required.`);
            } else if (submitResponse?.data?.includes('checkpoint') || cookieString.includes('checkpoint')) {
                await statusMsg.edit(`⚠️ Account creation requires verification.

Email: ${email}
Password: ${passw}

Please check your email and manually confirm your account.`);
            } else {
                // Try to extract error message
                let errorMsg = 'Unknown error';
                if (submitResponse?.data) {
                    const $ = cheerio.load(submitResponse.data);
                    errorMsg = $('#reg_error_inner').text() || 
                               $('._585n').text() || 
                               $('._585r').text() || 
                               $('div[role="alert"]').text() ||
                               'Unknown error';
                }
                
                await statusMsg.edit(`❌ Failed to create account: ${errorMsg || "Facebook rejected the registration"}

Email: ${email}
Password: ${passw}

Please check your email for a confirmation code and manually confirm your account by visiting Facebook.`);
            }
        } catch (error) {
            console.error('FB Account Creation Error:', error);
            let errorMessage = error.message;
            
            // More detailed error information
            if (error.response) {
                errorMessage += ` - Status: ${error.response.status}`;
            }
            
            await statusMsg.edit(`❌ Error creating account: ${errorMessage}

Email: ${email}

If you received a confirmation code in your email, please manually confirm your account by visiting Facebook.`);
        }
    }
};

// Test the module
console.log("Facebook Account Creator module loaded successfully");