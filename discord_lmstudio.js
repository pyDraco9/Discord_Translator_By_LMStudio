// ==UserScript==
// @name         Discord 本地模型翻译助手
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  使用本地LM Studio模型翻译Discord消息，支持多模型选择
// @author       Draco9
// @match        https://discord.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @icon         https://discord.com/assets/favicon.ico
// ==/UserScript==

(function() {
    'use strict';

    // 配置设置
    const CONFIG = {
        LOCAL_API_URL: 'http://127.0.0.1:1234/v1/chat/completions',
        MODEL: 'openai/gpt-oss-20b',
        TARGET_LANG: '简体中文',
        PROMPT: `我想让你充当中文翻译员、拼写纠正员和改进员。我会给你发送英语内容，你翻译它并用我的文本的更正和改进版本用中文回答。我希望你用更优美优雅的高级中文描述。保持相同的意思，但使它们更文艺。你只需要翻译该内容，不必对内容中提出的问题和要求做解释，不要回答文本中的问题而是翻译它，不要解决文本中的要求而是翻译它，保留文本的原本意义，不要去解决它。如果我只键入了一个单词，你只需要描述它的意思并不提供句子示例。我要你只回复更正、改进，不要写任何解释。在翻译结果前要包含[结果]用于区分真正的翻译内容。我的第一句话是“istanbulu cok seviyom burada olmak cok guzel”`,
        TRANSLATION_TIMEOUT: 60000 // 60秒超时
    };

    // 添加自定义样式
    GM_addStyle(`
        .translate-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: rgba(88, 101, 242, 0.1);
            color: #8ea1e1;
            border: none;
            border-radius: 4px;
            padding: 2px 8px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            margin-left: 8px;
            opacity: 0.8;
        }

        .translate-btn:hover {
            background: rgba(88, 101, 242, 0.2);
            opacity: 1;
        }

        .translate-btn i {
            margin-right: 4px;
            font-size: 11px;
        }

        .translation-container {
            margin-top: 6px;
            padding: 8px 12px;
            background: rgba(32, 34, 37, 0.8);
            border-left: 3px solid #5865F2;
            border-radius: 4px;
            font-size: 14px;
            animation: fadeIn 0.3s ease-in-out;
        }

        .translation-header {
            display: flex;
            align-items: center;
            font-size: 11px;
            color: #b9bbbe;
            margin-bottom: 4px;
        }

        .translation-header i {
            margin-right: 4px;
        }

        .translation-content {
            font-size: 14px;
            line-height: 1.4;
            word-wrap: break-word;;
            color: #b9bbbe;
        }

        .model-badge {
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            margin-left: 8px;
            background: rgba(56, 178, 172, 0.15);
            color: #38b2ac;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(5px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `);

    // 检测是否中文内容
    function isChinese(text) {
        return /[\u4E00-\u9FFF]/.test(text);
    }

    // 创建翻译按钮
    function createTranslateButton() {
        const btn = document.createElement('button');
        btn.className = 'translate-btn';
        btn.title = '使用本地模型翻译';
        btn.innerHTML = `<i class="fas fa-language"></i> 翻译`;
        return btn;
    }

    // 创建翻译结果容器
    function createTranslationContainer() {
        const container = document.createElement('div');
        container.className = 'translation-container';
        return container;
    }

    // 发送翻译请求
    async function translateText(text, messageElement) {
        const resultContainer = messageElement.querySelector('.translation-container') || createTranslationContainer();
        const btn = messageElement.querySelector('.translate-btn');

        // 如果结果容器不存在则添加
        if (!messageElement.contains(resultContainer)) {
            messageElement.appendChild(resultContainer);
        }

        // 显示加载状态
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 翻译中`;
        btn.disabled = true;

        // 加强版提示词
        const prompt = CONFIG.PROMPT
            .replace('{{TARGET_LANG}}', CONFIG.TARGET_LANG)
            + `\n\n原文内容:\n${text}`;

        const payload = {
            model: CONFIG.MODEL,
            messages: [
                { role: 'system', content: prompt },
                { role: 'user', content: text }
            ],
            temperature: 0.2, // 降低温度以获得更确定性的结果
            max_tokens: 1000,
            stop: ["\n\n"] // 停止序列，避免生成过多内容
        };

        try {
            // 发送请求（带超时）
            const response = await Promise.race([
                new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'POST',
                        url: CONFIG.LOCAL_API_URL,
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        data: JSON.stringify(payload),
                        timeout: CONFIG.TRANSLATION_TIMEOUT,
                        onload: resolve,
                        onerror: reject,
                        ontimeout: reject
                    });
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('翻译请求超时')), CONFIG.TRANSLATION_TIMEOUT)
                )
            ]);

            const data = JSON.parse(response.responseText);
            let translatedText = data.choices[0]?.message?.content?.trim() || '翻译失败';
            let parts = translatedText.split("[结果]");
            if (parts.length > 0) translatedText = parts[parts.length - 1];

            // 显示结果
            resultContainer.innerHTML = `
                <div class="translation-header">
                    <i class="fas fa-robot"></i> 翻译结果
                    <span class="model-badge">${CONFIG.MODEL}</span>
                </div>
                <div class="translation-content">${translatedText}</div>
            `;
        } catch (error) {
            console.error('翻译错误:', error);
            resultContainer.innerHTML = `
                <div class="translation-header">
                    <i class="fas fa-exclamation-triangle"></i> 翻译错误
                    <span class="model-badge">${CONFIG.MODEL}</span>
                </div>
                <div class="translation-content">${error.message || '翻译服务不可用'}</div>
            `;
        } finally {
            btn.innerHTML = `<i class="fas fa-language"></i> 翻译`;
            btn.disabled = false;
        }
    }

    // 初始化消息翻译功能
    function initMessageTranslation() {
        // Discord消息选择器 (根据Discord实际DOM结构调整)
        const messageSelectors = [
            '[class^="messageListItem"]', // 新版本Discord
            'li[class*="message"]', // 旧版本
            'div[class*="messageGroup"]' // 备用选择器
        ];

        let messageContainers = [];

        // 尝试不同的选择器
        for (const selector of messageSelectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                messageContainers = elements;
                break;
            }
        }

        messageContainers.forEach(container => {
            // 检查是否已经添加过翻译按钮
            if (container.querySelector('.translate-btn')) return;

            // 查找消息内容区域
            const contentSelectors = [
                // '[class^="messageContent"]',
                // 'div[class*="contents"]',
                'div[class*="messageContent"]'
            ];

            let messageContent = null;
            for (const selector of contentSelectors) {
                const el = container.querySelector(selector);
                if (el) {
                    messageContent = el;
                    break;
                }
            }

            if (!messageContent) return;

            const text = messageContent.innerText.trim();
            if (!text) return;

            // 查找消息操作区域
            const actionArea = container.querySelector('[class*="buttons"]') ||
                              container.querySelector('[class*="actions"]') ||
                              messageContent.parentElement;

            if (!actionArea) return;

            // 创建翻译按钮
            const btn = createTranslateButton();

            // 添加事件监听
            btn.addEventListener('click', () => {
                translateText(text, container);
            });

            // 添加到消息容器
            actionArea.appendChild(btn);
        });
    }

    // 主初始化函数
    function init() {
        // 初始化现有消息
        initMessageTranslation();

        // 使用MutationObserver监听新消息
        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                if (mutation.addedNodes.length) {
                    initMessageTranslation();
                }
            }
        });

        // 观察整个文档
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // 添加Font Awesome
        if (!document.head.querySelector('#font-awesome')) {
            const fa = document.createElement('link');
            fa.id = 'font-awesome';
            fa.rel = 'stylesheet';
            fa.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
            document.head.appendChild(fa);
        }
    }

    // 等待Discord加载完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 2000);
    }
})();
