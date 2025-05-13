const axios = require('axios');
const { EmbedBuilder } = require('discord.js');
const UserAgent = require('user-agents');

const PROXY_INFO_URL = 'http://ip-api.com/json/?fields=status,message,query,country,city,org,latency';
const TARGET_HOST_URL = 'https://www.facebook.com/';
const PROXY_REQUEST_TIMEOUT = 20000;
const URL_FETCH_TIMEOUT = 10000;

const generateUserAgent = () => {
    const userAgent = new UserAgent({ deviceCategory: 'mobile' });
    return userAgent.toString();
};

function parseProxyForAxios(proxyString) {
    if (!proxyString || typeof proxyString !== 'string') return null;
    const parts = proxyString.trim().split(':');
    let proxyConfig = null;
    if (parts.length === 2) {
        const host = parts[0];
        const port = parseInt(parts[1], 10);
        if (host && !isNaN(port)) {
            proxyConfig = { protocol: 'http', host, port };
        }
    } else if (parts.length >= 4) {
        const host = parts[0];
        const port = parseInt(parts[1], 10);
        let username = parts[2];
        let password = parts.slice(3).join(':');
        if (parts[2].startsWith('@')) {
            username = parts[2].substring(1);
        }
        if (host && !isNaN(port) && username) {
            proxyConfig = { protocol: 'http', host, port, auth: { username, password } };
        }
    }
    return (proxyConfig && !isNaN(proxyConfig.port)) ? proxyConfig : null;
}

function maskProxyString(proxyString) {
    if (!proxyString || typeof proxyString !== 'string') return 'N/A';
    const parts = proxyString.split(':');
    if (parts.length >= 4) {
        const host = parts[0];
        const port = parts[1];
        const user = parts[2].startsWith('@') ? parts[2].substring(1) : parts[2];
        const pass = parts.slice(3).join(':');
        const maskedUser = user.length > 0 ? user.charAt(0) + '***' : '***';
        const maskedPass = pass.length > 0 ? pass.charAt(0) + '***' : '***';
        const at = parts[2].startsWith('@') ? '@' : '';
        return `${host}:${port}:${at}${maskedUser}:${maskedPass}`;
    }
    return proxyString;
}

async function testSingleProxy(proxyConfig, originalProxyString) {
    const result = {
        proxy: originalProxyString,
        ip: 'N/A',
        ipDetails: 'N/A',
        ipInfoError: null,
        latencyIpInfoMs: -1,
        canAccessTarget: false,
        targetStatus: 'N/A',
        targetError: null,
        targetAccessDetails: 'No attempt or failed fetch',
        latencyTargetHostMs: -1,
        parseError: null,
    };

    if (!proxyConfig) {
        result.parseError = 'Invalid proxy format provided to test function.';
        return result;
    }

    const userAgent = generateUserAgent();
    const axiosInstance = axios.create({
        timeout: PROXY_REQUEST_TIMEOUT,
        proxy: proxyConfig,
        headers: {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1'
        },
        validateStatus: (status) => status >= 200 && status < 600,
    });

    let startTime;

    try {
        startTime = Date.now();
        const infoResponse = await axiosInstance.get(PROXY_INFO_URL);
        result.latencyIpInfoMs = Date.now() - startTime;
        if (infoResponse.data && infoResponse.data.status === 'success') {
            result.ip = infoResponse.data.query || 'Unknown IP';
            result.ipDetails = `${infoResponse.data.city || 'Unknown City'}, ${infoResponse.data.country || 'Unknown Country'} (${infoResponse.data.org || 'Unknown ISP'})`;
        } else {
            result.ipInfoError = infoResponse.data.message || 'Proxy info service failed.';
        }
    } catch (error) {
        if (startTime) result.latencyIpInfoMs = Date.now() - startTime;
        if (error.code) result.ipInfoError = `IP Info Error: ${error.code}`;
        else if (error.response) result.ipInfoError = `IP Info HTTP Error: ${error.response.status}`;
        else result.ipInfoError = `IP Info Request failed: ${error.message.substring(0,100)}`;
        if (error.message?.toLowerCase().includes('timeout')) result.ipInfoError = 'Timeout (Info Service)';
        if (error.response?.status === 407) result.ipInfoError += ' (Proxy Auth Failed/Required for Info Service)';
    }

    try {
        startTime = Date.now();
        const targetResponse = await axiosInstance.get(TARGET_HOST_URL);
        result.latencyTargetHostMs = Date.now() - startTime;
        result.targetStatus = `HTTP ${targetResponse.status}`;

        if (targetResponse.status >= 200 && targetResponse.status < 400) {
            const contentType = targetResponse.headers['content-type'];
            if (contentType && contentType.includes('text/html')) {
                const htmlContent = targetResponse.data;
                if (typeof htmlContent === 'string' && htmlContent.toLowerCase().includes('facebook')) {
                     result.canAccessTarget = true;
                     result.targetAccessDetails = 'Successfully loaded, "facebook" string found in HTML.';
                } else if (typeof htmlContent === 'string') {
                    result.canAccessTarget = false;
                    result.targetError = `HTTP ${targetResponse.status}. Content check failed.`;
                    result.targetAccessDetails = 'Loaded HTML, but "facebook" string not found.';
                } else {
                     result.canAccessTarget = false;
                     result.targetError = `HTTP ${targetResponse.status}. Invalid content type.`;
                     result.targetAccessDetails = 'Successfully loaded, but content not a string or not HTML.';
                }
            } else {
                result.canAccessTarget = false;
                result.targetError = `HTTP ${targetResponse.status}. Not HTML.`;
                result.targetAccessDetails = 'Successfully loaded, but not HTML content. Cannot verify "facebook" string.';
            }
        } else {
            result.canAccessTarget = false;
            result.targetError = `HTTP ${targetResponse.status}.`;
            if (targetResponse.status === 403) {
                result.targetAccessDetails = `Access denied by Facebook (HTTP 403). Likely IP block.`;
            } else if (targetResponse.status === 407) {
                result.targetAccessDetails = `Proxy authentication failed/required for Facebook (HTTP 407).`;
            } else if (targetResponse.status >= 400 && targetResponse.status < 500) {
                result.targetAccessDetails = `Client error (HTTP ${targetResponse.status}).`;
            } else if (targetResponse.status >= 500) {
                result.targetAccessDetails = `Server error (HTTP ${targetResponse.status}) from Facebook.`;
            } else {
                 result.targetAccessDetails = `Unexpected status (HTTP ${targetResponse.status}).`;
            }
        }

    } catch (error) {
        if (startTime) result.latencyTargetHostMs = Date.now() - startTime;
        result.canAccessTarget = false;
        if (error.code) result.targetError = `Target Error: ${error.code}`;
        else if (error.response) result.targetError = `Target HTTP Error: ${error.response.status}`;
        else result.targetError = `Target Request failed: ${error.message.substring(0,100)}`;

        if (error.message?.toLowerCase().includes('timeout')) {
            result.targetError = 'Timeout (Facebook)';
            result.targetAccessDetails = 'Request to Facebook timed out.';
        } else if (error.response?.status === 407) {
            result.targetError += ' (Proxy Auth Failed/Required for Facebook)';
            result.targetAccessDetails = 'Proxy authentication error for Facebook.';
        } else {
            result.targetAccessDetails = `Exception during Facebook fetch: ${error.message?.substring(0,100)}`;
        }
    }
    return result;
}

module.exports = {
    name: 'proxytest',
    description: 'Tests proxies for Facebook.com access, IP, and ping.',
    admin_only: false,

    async execute(message, args) {
        let proxiesToTestStrings = [];
        const urlsToFetch = [];
        const directProxies = [];

        for (const arg of args) {
            try { new URL(arg); urlsToFetch.push(arg); }
            catch (_) { directProxies.push(arg); }
        }
        proxiesToTestStrings.push(...directProxies);

        if (urlsToFetch.length > 0) {
            const urlFetchStatusMsg = await message.reply(`🔗 Fetching proxies from ${urlsToFetch.length} URL(s)...`);
            let fetchedCount = 0; let successfulUrls = 0;
            for (const url of urlsToFetch) {
                try {
                    const response = await axios.get(url, { timeout: URL_FETCH_TIMEOUT });
                    if (typeof response.data === 'string') {
                        const lines = response.data.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
                        proxiesToTestStrings.push(...lines);
                        fetchedCount += lines.length; successfulUrls++;
                    } else { message.channel.send(`⚠️ Content from \`${url}\` not plain text.`); }
                } catch (error) {
                    console.error(`Error fetching from URL ${url}:`, error);
                    message.channel.send(`❌ Failed to fetch from \`${url}\`. Error: ${error.message}`);
                }
            }
            if (urlFetchStatusMsg.deletable) await urlFetchStatusMsg.delete().catch(console.error);
            if (fetchedCount > 0) await message.reply(`📄 Loaded ${fetchedCount} proxies from ${successfulUrls} URL(s).`);
            else if (urlsToFetch.length > 0 && successfulUrls === 0) await message.reply(`⚠️ No proxies loaded from URL(s).`);
        }

        if (message.attachments.size > 0) {
            const attachment = message.attachments.first();
            if (attachment.name.endsWith('.txt')) {
                try {
                    const response = await axios.get(attachment.url, { timeout: URL_FETCH_TIMEOUT });
                    if (typeof response.data === 'string') {
                        const lines = response.data.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
                        proxiesToTestStrings.push(...lines);
                        await message.reply(`📄 Loaded ${lines.length} from \`${attachment.name}\`.`);
                    } else { await message.reply(`⚠️ Content from \`${attachment.name}\` not plain text.`); }
                } catch (error) {
                    console.error("Error reading attachment:", error);
                    return message.reply(`❌ Failed to read \`${attachment.name}\`. Error: ${error.message}`);
                }
            } else { await message.reply('⚠️ Attachment not a .txt file.'); }
        }

        if (proxiesToTestStrings.length === 0) {
            return message.reply('Provide proxies (e.g., ip:port), attach .txt, or give URLs.\nUsage: `proxytestfb ip:port ...`');
        }

        const uniqueProxyStrings = [...new Set(proxiesToTestStrings.filter(p => p.length > 0))];
        if (uniqueProxyStrings.length === 0) {
            return message.reply('No unique, non-empty proxies found.');
        }

        const statusMsg = await message.reply(`🧪 Testing ${uniqueProxyStrings.length} unique prox${uniqueProxyStrings.length === 1 ? 'y' : 'ies'} for Facebook.com access, IP, and ping...`);

        const allTestResults = [];
        const parsedProxiesForTesting = [];

        for (const proxyStr of uniqueProxyStrings) {
            const parsedConfig = parseProxyForAxios(proxyStr);
            if (parsedConfig) {
                parsedProxiesForTesting.push({ config: parsedConfig, original: proxyStr });
            } else {
                allTestResults.push({
                    proxy: proxyStr, ip: 'N/A', ipDetails: 'N/A', ipInfoError: null, latencyIpInfoMs: -1,
                    canAccessTarget: false, targetStatus: 'N/A', targetError: null, targetAccessDetails: 'N/A', latencyTargetHostMs: -1,
                    parseError: 'Invalid proxy string format.',
                });
            }
        }

        const testPromises = parsedProxiesForTesting.map(p => testSingleProxy(p.config, p.original));
        const settledHttpResults = await Promise.allSettled(testPromises);

        settledHttpResults.forEach((settledResult, index) => {
            const originalProxyString = parsedProxiesForTesting[index].original;
            if (settledResult.status === 'fulfilled') {
                allTestResults.push(settledResult.value);
            } else {
                allTestResults.push({
                    proxy: originalProxyString, ip: 'N/A', ipDetails: 'N/A', ipInfoError: null, latencyIpInfoMs: -1,
                    canAccessTarget: false, targetStatus: 'Test System Error', targetError: `Critical error: ${settledResult.reason}`,
                    targetAccessDetails: 'Promise rejected', latencyTargetHostMs: -1, parseError: null,
                });
            }
        });

        allTestResults.sort((a, b) => {
            if (a.parseError && !b.parseError) return 1; if (!a.parseError && b.parseError) return -1;
            if (a.canAccessTarget && !b.canAccessTarget) return -1; if (!a.canAccessTarget && b.canAccessTarget) return 1;
            if (a.canAccessTarget && b.canAccessTarget) {
                if (a.latencyTargetHostMs === -1 && b.latencyTargetHostMs !== -1) return 1;
                if (a.latencyTargetHostMs !== -1 && b.latencyTargetHostMs === -1) return -1;
                if (a.latencyTargetHostMs !== -1 && b.latencyTargetHostMs !== -1) return a.latencyTargetHostMs - b.latencyTargetHostMs;
            }
            return a.proxy.localeCompare(b.proxy);
        });

        const workingProxiesResults = allTestResults.filter(r => r.canAccessTarget);
        const workingCount = workingProxiesResults.length;
        const totalTestedEffectively = allTestResults.length;
        const failedOrUnparsedCount = totalTestedEffectively - workingCount;

        let avgPingFacebook = -1;
        if (workingCount > 0) {
            const validLatencies = workingProxiesResults.map(r => r.latencyTargetHostMs).filter(l => l !== -1 && l !== undefined);
            if (validLatencies.length > 0) {
                avgPingFacebook = Math.round(validLatencies.reduce((sum, val) => sum + val, 0) / validLatencies.length);
            }
        }

        const embed = new EmbedBuilder()
            .setTitle('Proxy Test Results: Facebook.com Access, IP & Ping')
            .setColor(workingCount > 0 ? 0x00FF00 : 0xFF0000)
            .setTimestamp();

        let summaryDescription = `Tested ${totalTestedEffectively} unique proxy strings for ${TARGET_HOST_URL}.\n\n`;
        summaryDescription += `✅ **Accessible Proxies:** ${workingCount}\n`;
        if (workingCount > 0 && avgPingFacebook !== -1) {
            summaryDescription += `   ▻ Avg. Ping (Facebook): \`${avgPingFacebook}ms\`\n`;
        }
        summaryDescription += `❌ **Failed or Issues:** ${failedOrUnparsedCount}\n\n`;
        summaryDescription += `See attached files for detailed results:`;
        if (workingCount > 0) {
            summaryDescription += `\n- \`working_facebook_proxies.txt\``;
        }
        summaryDescription += `\n- \`full_facebook_report.txt\``;

        embed.setDescription(summaryDescription);
        embed.setFooter({ text: `Inputs: ${uniqueProxyStrings.length} | Tested: ${totalTestedEffectively} | Accessible for Facebook: ${workingCount}` });

        const filesToSend = [];

        if (workingCount > 0) {
            let workingProxiesContent = `Proxies that successfully accessed ${TARGET_HOST_URL} (sorted by ping to Facebook):\n\n`;
            workingProxiesResults.forEach(res => {
                workingProxiesContent += `Proxy: ${maskProxyString(res.proxy)}\n`;
                workingProxiesContent += `Status: Accessible (${res.targetStatus})\n`;
                workingProxiesContent += `Ping (Facebook): ${res.latencyTargetHostMs === -1 ? 'N/A' : res.latencyTargetHostMs + 'ms'}\n`;
                workingProxiesContent += `Access Details: ${res.targetAccessDetails}\n`;
                workingProxiesContent += `Outgoing IP: ${res.ip} (${res.ipDetails})\n`;
                workingProxiesContent += `Ping (IP Info): ${res.latencyIpInfoMs === -1 ? 'N/A' : res.latencyIpInfoMs + 'ms'}\n`;
                if (res.ipInfoError) workingProxiesContent += `IP Info Note: ${res.ipInfoError}\n`;
                workingProxiesContent += "---\n";
            });
            filesToSend.push({ attachment: Buffer.from(workingProxiesContent), name: 'working_facebook_proxies.txt' });
        }

        let fullReportContent = `Full proxy test report for ${TARGET_HOST_URL} access, IP, and ping:\n\n`;
        allTestResults.forEach(res => {
            fullReportContent += `Proxy: ${maskProxyString(res.proxy)}\n`;
            if (res.parseError) {
                fullReportContent += `Status: Parse Error - ${res.parseError}\n`;
            } else {
                fullReportContent += `Facebook Accessible: ${res.canAccessTarget ? 'Yes' : 'No'} (${res.targetStatus})\n`;
                fullReportContent += `Ping (Facebook): ${res.latencyTargetHostMs === -1 ? 'N/A' : res.latencyTargetHostMs + 'ms'}\n`;
                fullReportContent += `Access Details: ${res.targetAccessDetails}\n`;
                if (res.targetError && !res.canAccessTarget) fullReportContent += `Facebook Access Error: ${res.targetError}\n`;
                fullReportContent += `Outgoing IP: ${res.ip} (${res.ipDetails})\n`;
                fullReportContent += `Ping (IP Info): ${res.latencyIpInfoMs === -1 ? 'N/A' : res.latencyIpInfoMs + 'ms'}\n`;
                if (res.ipInfoError) fullReportContent += `IP Info Error: ${res.ipInfoError}\n`;
            }
            fullReportContent += "---\n";
        });
        filesToSend.push({ attachment: Buffer.from(fullReportContent), name: 'full_facebook_report.txt' });

        let finalMessageContent = `📊 Test complete. ${workingCount} prox${workingCount === 1 ? 'y' : 'ies'} can access ${TARGET_HOST_URL}. ${failedOrUnparsedCount} failed or had issues.`;
        if (workingCount > 0 && avgPingFacebook !== -1) {
             finalMessageContent += ` Average Facebook ping for working proxies: ${avgPingFacebook}ms.`;
        }
        if (filesToSend.length > 0) {
            finalMessageContent += " See attached files for details.";
        }

        await statusMsg.edit({ content: finalMessageContent, embeds: [embed], files: filesToSend }).catch(async editError => {
            console.error("Failed to edit status message, sending new one:", editError);
            await message.channel.send({ content: finalMessageContent, embeds: [embed], files: filesToSend });
        });
    }
};