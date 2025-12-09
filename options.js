document.addEventListener('DOMContentLoaded', () => {
    const passwordDisplay = document.getElementById('generated-password');
    const autofillButton = document.getElementById('autofill-password');
    const copyButton = document.getElementById('copy-password');
    const regenerateButton = document.getElementById('regenerate-password');
    const includeSymbolsCheckbox = document.getElementById('include-symbols');
    const addToBlacklistButton = document.getElementById('add-to-blacklist');
    const manageBlacklistLink = document.getElementById('manage-blacklist');

    let currentPassword = '';

    // 初始化弹出窗口
    function initializePopup() {
        // 1. 获取当前设置
        chrome.runtime.sendMessage({ type: 'getPasswordSettings' }, (settings) => {
            if (settings) {
                includeSymbolsCheckbox.checked = settings.includeSymbols;
            }
            
            // 2. 获取已生成的密码
            chrome.runtime.sendMessage({ type: 'getGeneratedPassword' }, (response) => {
                if (response && response.password) {
                    currentPassword = response.password;
                    passwordDisplay.textContent = currentPassword;
                } else {
                    // 如果会话中没有密码，则根据当前设置生成一个
                    generateNewPassword(settings);
                }
            });
        });
    }

    // 生成新密码并更新UI
    function generateNewPassword(currentSettings) {
        const settingsToUse = currentSettings || { includeSymbols: includeSymbolsCheckbox.checked };
        chrome.runtime.sendMessage({ type: 'generatePassword', settings: settingsToUse }, (response) => {
            if (response && response.password) {
                currentPassword = response.password;
                passwordDisplay.textContent = currentPassword;
            }
        });
    }

    // --- 事件监听器 ---

    // 自动填充
    autofillButton.addEventListener('click', () => {
        // 先复制密码到剪贴板
        navigator.clipboard.writeText(currentPassword).then(() => {
            chrome.runtime.sendMessage({ type: 'requestAutoFill' }, () => {
                window.close(); // 发送消息后立即关闭弹窗
            });
        });
    });

    // 复制
    copyButton.addEventListener('click', () => {
        navigator.clipboard.writeText(currentPassword).then(() => {
            copyButton.textContent = '已复制!';
            setTimeout(() => { copyButton.textContent = '复制'; }, 1500);
        });
    });

    // 重新生成
    regenerateButton.addEventListener('click', () => generateNewPassword());

    // 切换设置
    includeSymbolsCheckbox.addEventListener('change', () => {
        const newSettings = { includeSymbols: includeSymbolsCheckbox.checked };
        chrome.runtime.sendMessage({ type: 'savePasswordSettings', settings: newSettings }, () => {
            generateNewPassword(newSettings); // 保存后用新设置生成密码
        });
    });

    // 添加到黑名单
    addToBlacklistButton.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const currentTab = tabs[0];
            if (currentTab && currentTab.url) {
                const hostname = new URL(currentTab.url).hostname;
                chrome.runtime.sendMessage({ type: 'addSiteToBlacklist', domain: hostname }, () => {
                    window.close();
                });
            } else {
                 addToBlacklistButton.textContent = '无法获取域名';
            }
        });
    });

    // 管理黑名单链接
    manageBlacklistLink.addEventListener('click', (event) => {
        event.preventDefault();
        chrome.runtime.openOptionsPage(); // 打开独立的黑名单管理页面
    });

    // 执行初始化
    initializePopup();
});
