document.addEventListener('DOMContentLoaded', () => {
    const blacklistContainer = document.getElementById('blacklist-container');
    const emptyMessage = document.getElementById('empty-message');

    // 加载并渲染黑名单列表
    function renderBlacklist() {
        blacklistContainer.innerHTML = ''; // 清空现有列表

        chrome.runtime.sendMessage({ type: 'getBlacklist' }, (blacklist) => {
            if (blacklist && blacklist.length > 0) {
                emptyMessage.style.display = 'none';
                blacklist.forEach(domain => {
                    const listItem = document.createElement('li');
                    
                    const domainSpan = document.createElement('span');
                    domainSpan.className = 'domain';
                    domainSpan.textContent = domain;

                    const removeButton = document.createElement('button');
                    removeButton.textContent = '移除';
                    removeButton.dataset.domain = domain; // 将域名存储在按钮上

                    removeButton.addEventListener('click', handleRemoveClick);

                    listItem.appendChild(domainSpan);
                    listItem.appendChild(removeButton);
                    blacklistContainer.appendChild(listItem);
                });
            } else {
                emptyMessage.style.display = 'block'; // 如果列表为空，显示提示信息
            }
        });
    }

    // 处理移除按钮的点击事件
    function handleRemoveClick(event) {
        const domainToRemove = event.target.dataset.domain;
        if (domainToRemove) {
            chrome.runtime.sendMessage({ type: 'removeFromBlacklist', domain: domainToRemove }, () => {
                renderBlacklist(); // 移除成功后，重新渲染列表
            });
        }
    }

    renderBlacklist(); // 页面加载时立即渲染列表
});
