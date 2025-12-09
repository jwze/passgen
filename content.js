// 全局变量
let isPasswordFieldActive = false;
let lastFocusedPasswordField = null; // 存储最后聚焦的密码输入框元素
let currentLogoButton = null; // 当前显示的logo按钮

const PASSWORD_KEYWORDS = ['password', '密码', 'пароль', 'contraseña', 'senha', 'mot de passe', 'passwort'];

/**
 * 检查扩展上下文是否有效
 */
function isExtensionContextValid() {
    return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
}

/**
 * 检查单个 input 是否是密码输入框，并标记它
 * @returns {boolean} 是否是密码输入框
 */
function checkAndMarkPasswordField(input) {
    if (!input || input.tagName !== 'INPUT' || input.readOnly) return false;

    // 已经标记过的直接返回结果
    if (input.getAttribute('data-ap-processed') === 'true') {
        return input.getAttribute('data-ap-is-password') === 'true';
    }

    input.setAttribute('data-ap-processed', 'true');
    const inputType = (input.type || 'text').toLowerCase();

    if (inputType === 'password') {
        input.setAttribute('data-ap-is-password', 'true');
        return true;
    }

    if (inputType === 'text') {
        const lowerPlaceholder = (input.placeholder || '').toLowerCase();
        const lowerAriaLabel = (input.getAttribute('aria-label') || '').toLowerCase();

        if (PASSWORD_KEYWORDS.some(kw => lowerPlaceholder.includes(kw) || lowerAriaLabel.includes(kw))) {
            input.setAttribute('data-ap-is-password', 'true');
            return true;
        }

        const label = input.id ? document.querySelector(`label[for="${input.id}"]`) : input.closest('label');
        if (label) {
            const lowerLabelText = (label.textContent || '').toLowerCase();
            if (PASSWORD_KEYWORDS.some(kw => lowerLabelText.includes(kw))) {
                input.setAttribute('data-ap-is-password', 'true');
                return true;
            }
        }
    }

    return false;
}

/**
 * 扫描页面以查找并标记密码输入框
 */
function scanForPasswordFields() {
    const inputs = document.querySelectorAll('input:not([data-ap-processed])');
    inputs.forEach(input => checkAndMarkPasswordField(input));
}

/**
 * 创建并显示logo按钮
 */
function showLogoButton(inputField) {
    // 检查扩展上下文是否有效
    if (!isExtensionContextValid()) return;

    // 先移除已存在的按钮
    hideLogoButton();

    const button = document.createElement('div');
    button.id = 'ap-logo-button';
    button.title = '点击生成并填充密码';

    // 设置按钮样式
    Object.assign(button.style, {
        position: 'absolute',
        width: '20px',
        height: '20px',
        cursor: 'pointer',
        zIndex: '2147483647',
        backgroundImage: `url(${chrome.runtime.getURL('icons/icon16.png')})`,
        backgroundSize: 'contain',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        opacity: '0.8',
        transition: 'opacity 0.2s'
    });

    button.addEventListener('mouseenter', () => button.style.opacity = '1');
    button.addEventListener('mouseleave', () => button.style.opacity = '0.8');

    // 点击事件：生成密码、复制、填充
    button.addEventListener('mousedown', (e) => {
        e.preventDefault(); // 防止输入框失焦
        e.stopPropagation();

        if (!isExtensionContextValid()) return;

        // 向后台请求生成密码
        chrome.runtime.sendMessage({ type: 'getGeneratedPassword' }, (response) => {
            if (chrome.runtime.lastError) return;
            if (response && response.password) {
                const password = response.password;

                // 复制到剪贴板
                navigator.clipboard.writeText(password);

                // 填充到输入框
                inputField.value = password;
                inputField.dispatchEvent(new InputEvent('input', { bubbles: true }));
                inputField.dispatchEvent(new Event('change', { bubbles: true }));

                // 隐藏按钮
                hideLogoButton();
            }
        });
    });

    document.body.appendChild(button);
    currentLogoButton = button;

    // 定位按钮
    positionLogoButton(inputField);
}

/**
 * 定位logo按钮到输入框右侧
 */
function positionLogoButton(inputField) {
    if (!currentLogoButton || !inputField) return;

    const rect = inputField.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    currentLogoButton.style.left = `${rect.right + scrollX - 26}px`;
    currentLogoButton.style.top = `${rect.top + scrollY + (rect.height - 20) / 2}px`;
}

/**
 * 隐藏logo按钮
 */
function hideLogoButton() {
    if (currentLogoButton) {
        currentLogoButton.remove();
        currentLogoButton = null;
    }
}

// --- 事件监听 ---

// 监听 focusin，通知后台
document.addEventListener('focusin', (event) => {
    const target = event.target;
    // 先检查并标记（解决动态弹窗的时序问题）
    if (checkAndMarkPasswordField(target)) {
        lastFocusedPasswordField = target;
        // 显示logo按钮
        showLogoButton(target);
        if (!isPasswordFieldActive && isExtensionContextValid()) {
            chrome.runtime.sendMessage({ type: 'passwordFieldFocused', hostname: window.location.hostname });
            isPasswordFieldActive = true;
        }
    }
}, true);

// 监听 focusout，通知后台
document.addEventListener('focusout', (event) => {
    if (isPasswordFieldActive) {
        // 使用一个短暂的延迟来处理点击扩展图标或logo按钮导致焦点丢失的情况
        setTimeout(() => {
            // 如果焦点没有回到另一个密码框，则认为焦点已离开
            if (document.activeElement && !checkAndMarkPasswordField(document.activeElement)) {
                 if (isExtensionContextValid()) {
                     chrome.runtime.sendMessage({ type: 'passwordFieldBlurred' });
                 }
                 isPasswordFieldActive = false;
                 hideLogoButton();
                 // 关键：此处不清除 lastFocusedPasswordField
            }
        }, 150); // 150ms 延迟，给logo按钮点击留出时间
    }
}, true);

// 监听来自后台的填充命令
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'fillPassword') {
        console.log('[AutoPass Fill Diagnostic] Received fill command. lastFocusedPasswordField:', lastFocusedPasswordField); // 诊断日志
        if (lastFocusedPasswordField && request.password) {
            const inputEvent = new InputEvent('input', { bubbles: true });
            lastFocusedPasswordField.value = request.password;
            lastFocusedPasswordField.dispatchEvent(inputEvent);
            
            const changeEvent = new Event('change', { bubbles: true });
            lastFocusedPasswordField.dispatchEvent(changeEvent);
            
            lastFocusedPasswordField = null; // 填充后清除引用
            sendResponse({ success: true });
        } else {
            sendResponse({ success: false, error: 'No focused password field or password provided.' });
        }
        return true;
    }
});

// --- 初始化 ---
scanForPasswordFields();

// 使用 MutationObserver 监视 DOM 变化
const observer = new MutationObserver(() => scanForPasswordFields());
observer.observe(document.body, { childList: true, subtree: true });

// 监听滚动和窗口调整，重新定位logo按钮
window.addEventListener('scroll', () => {
    if (currentLogoButton && lastFocusedPasswordField) {
        positionLogoButton(lastFocusedPasswordField);
    }
}, true);

window.addEventListener('resize', () => {
    if (currentLogoButton && lastFocusedPasswordField) {
        positionLogoButton(lastFocusedPasswordField);
    }
});
