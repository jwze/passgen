// 插件安装或更新时，初始化默认设置
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get('passwordSettings', (data) => {
        if (!data.passwordSettings) {
            chrome.storage.local.set({ passwordSettings: { includeSymbols: true } });
        }
    });
});

// 监听消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.type) {
        case 'passwordFieldFocused':
            handlePasswordFieldFocused(request.hostname, sender);
            break;

        case 'passwordFieldBlurred':
            chrome.action.setBadgeText({ text: '' });
            break;

        case 'getGeneratedPassword':
            chrome.storage.session.get(['generatedPassword', 'passwordSettings'], (data) => {
                // 如果会话中没有密码，立即生成一个
                if (!data.generatedPassword) {
                    const newPassword = generateRandomPassword(data.passwordSettings);
                    chrome.storage.session.set({ generatedPassword: newPassword }, () => {
                        sendResponse({ password: newPassword, settings: data.passwordSettings });
                    });
                } else {
                    sendResponse({ password: data.generatedPassword, settings: data.passwordSettings });
                }
            });
            return true; // 异步

        case 'generatePassword':
            const settingsToUse = request.settings;
            const newPassword = generateRandomPassword(settingsToUse);
            chrome.storage.session.set({ generatedPassword: newPassword }, () => {
                sendResponse({ password: newPassword, settings: settingsToUse });
            });
            return true; // 异步
        
        case 'requestAutoFill':
            handleRequestAutoFill(sender, sendResponse);
            return true; // 异步

        // --- 黑名单管理 ---
        case 'getBlacklist':
            getBlacklist().then(blacklist => sendResponse(blacklist));
            return true; // 异步
        
        case 'addSiteToBlacklist':
            addSiteToBlacklist(request.domain).then(() => {
                chrome.action.setBadgeText({ text: '' });
                sendResponse();
            });
            return true; // 异步

        case 'removeFromBlacklist':
            removeFromBlacklist(request.domain).then(() => sendResponse());
            return true; // 异步

        // --- 密码生成设置管理 ---
        case 'getPasswordSettings':
            chrome.storage.local.get('passwordSettings', (data) => {
                sendResponse(data.passwordSettings);
            });
            return true; // 异步
        
        case 'savePasswordSettings':
            chrome.storage.local.set({ passwordSettings: request.settings }, () => {
                sendResponse();
            });
            return true; // 异步
    }
});


async function handlePasswordFieldFocused(hostname, sender) {
    const isBlacklisted = await isSiteBlacklisted(hostname);
    if (!isBlacklisted) {
        const settings = await getSettingsFromStorage();
        const newPassword = generateRandomPassword(settings);
        // 保存密码、设置和当前标签页ID
        await chrome.storage.session.set({ 
            generatedPassword: newPassword, 
            passwordSettings: settings,
            activeTabId: sender.tab.id 
        });
        await chrome.action.setBadgeText({ text: 'PW' });
        await chrome.action.setBadgeBackgroundColor({ color: '#28a745' });
    } else {
        await chrome.action.setBadgeText({ text: '' });
    }
}

async function handleRequestAutoFill(sender, sendResponse) {
    const data = await chrome.storage.session.get(['generatedPassword', 'activeTabId']);
    if (data.activeTabId && data.generatedPassword) {
        chrome.tabs.sendMessage(data.activeTabId, { type: 'fillPassword', password: data.generatedPassword }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Auto-fill error:', chrome.runtime.lastError.message);
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else if (response && response.success) {
                chrome.storage.session.remove(['generatedPassword', 'activeTabId']);
                chrome.action.setBadgeText({ text: '' });
                sendResponse({ success: true });
            } else {
                sendResponse({ success: false, error: (response ? response.error : 'Unknown error') });
            }
        });
    } else {
        sendResponse({ success: false, error: 'No active tab or password in session to fill.' });
    }
}

function getSettingsFromStorage() {
    return new Promise(resolve => {
        chrome.storage.local.get('passwordSettings', (data) => {
            resolve(data.passwordSettings || { includeSymbols: true });
        });
    });
}

function generateRandomPassword(options = {}) {
    const { includeSymbols = true, length = 16 } = options;
    const alphaNum = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const symbols = "!@#$%^&*()_+~`|}{[]:;?><,./-=";
    const charset = includeSymbols ? alphaNum + symbols : alphaNum;
    let password = "";
    for (let i = 0, n = charset.length; i < length; ++i) {
        password += charset.charAt(Math.floor(Math.random() * n));
    }
    return password;
}

async function getBlacklist() {
    const result = await chrome.storage.local.get('blacklist');
    return result.blacklist || [];
}

async function addSiteToBlacklist(hostname) {
    if (!hostname) return;
    const blacklist = await getBlacklist();
    const mainDomain = hostname.split('.').slice(-2).join('.'); 
    if (!blacklist.includes(mainDomain)) {
        blacklist.push(mainDomain);
        await chrome.storage.local.set({ 'blacklist': blacklist });
    }
}

async function removeFromBlacklist(domain) {
    let blacklist = await getBlacklist();
    blacklist = blacklist.filter(item => item !== domain);
    await chrome.storage.local.set({ 'blacklist': blacklist });
}

async function isSiteBlacklisted(hostname) {
    if (!hostname) return true;
    const blacklist = await getBlacklist();
    const mainDomain = hostname.split('.').slice(-2).join('.');
    return blacklist.some(blacklistedDomain => hostname.endsWith(blacklistedDomain));
}
