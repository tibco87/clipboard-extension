// ClipSmart Background Service Worker

// Initialize extension
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        // Set default settings on first install
        await chrome.storage.local.set({
            clipboardItems: [],
            settings: {
                theme: 'auto',
                language: 'en',
                autoDelete: 'never',
                translationLangs: ['en', 'de', 'fr']
            },
            isPro: false,
            translationsUsed: 0,
            installDate: Date.now()
        });

        // Open welcome page
        chrome.tabs.create({ url: 'https://clipsmart.app/welcome' });
    }

    // Create context menu
    chrome.contextMenus.remove('save-to-clipsmart', function() {
        chrome.contextMenus.create({
            id: 'save-to-clipsmart',
            title: 'Save to ClipSmart',
            contexts: ['selection']
        });
    });

    // Create alarms
    try {
        await chrome.alarms.create('resetTranslations', {
            periodInMinutes: 60 * 24 * 30 // Monthly
        });
        
        await chrome.alarms.create('cleanup', {
            periodInMinutes: 60 * 24 // Daily
        });

        await chrome.alarms.create('checkClipboard', {
            periodInMinutes: 1/60 // Every second
        });
    } catch (error) {
        console.error('Failed to create alarms:', error);
    }
});

// Handle clipboard monitoring
let clipboardMonitor = {
    lastText: '',
    
    async checkClipboard() {
        try {
            // Získaj aktívny tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !tab.id) return;

            // Pošli správu content scriptu, aby prečítal schránku
            chrome.tabs.sendMessage(tab.id, { action: "getClipboardText" }, async (response) => {
                if (chrome.runtime.lastError) {
                    // Content script nie je načítaný v tomto tabe, ignoruj chybu
                    return;
                }
                const text = response?.text;
                if (text && text !== this.lastText) {
                    await this.addItem(text);
                }
            });
        } catch (error) {
            console.error('Clipboard check error:', error);
        }
    },

    async addItem(text) {
        if (!text || text === this.lastText) return;
        
        this.lastText = text;
        
        // Get current items
        const data = await chrome.storage.local.get(['clipboardItems', 'isPro']);
        let items = data.clipboardItems || [];
        const isPro = data.isPro || false;
        
        // Check if item already exists
        const existingIndex = items.findIndex(item => item.text === text);
        if (existingIndex !== -1) {
            // Move to top
            const [existing] = items.splice(existingIndex, 1);
            existing.timestamp = Date.now();
            items.unshift(existing);
        } else {
            // Create new item
            const newItem = {
                id: this.generateId(),
                text: text,
                type: this.detectType(text),
                timestamp: Date.now(),
                pinned: false,
                charCount: text.length,
                translations: {},
                tags: []
            };
            
            items.unshift(newItem);
            
            // Limit items for free users
            if (!isPro && items.length > 20) {
                // Keep pinned items
                const pinned = items.filter(item => item.pinned);
                const unpinned = items.filter(item => !item.pinned).slice(0, 20 - pinned.length);
                items = [...pinned, ...unpinned];
            }
        }
        
        // Save updated items
        await chrome.storage.local.set({ clipboardItems: items });
        
        // Update badge
        this.updateBadge(items.length);
    },

    detectType(text) {
        // URL detection
        if (/^https?:\/\/|^www\./i.test(text)) {
            return 'url';
        }
        
        // Email detection
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
            return 'email';
        }
        
        // Code detection (simple heuristic)
        if (text.includes('{') || text.includes('}') || 
            text.includes('function') || text.includes('const') ||
            text.includes('=>') || text.includes('import')) {
            return 'code';
        }
        
        return 'text';
    },

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    updateBadge(count) {
        chrome.action.setBadgeText({ text: count > 0 ? count.toString() : '' });
        chrome.action.setBadgeBackgroundColor({ color: '#ff6b35' });
    }
};

// Google Translate API KEY (demo - v produkcii bezpečne uložiť)
const GOOGLE_TRANSLATE_API_KEY = 'AIzaSyBel24LTIb-LYj5I5kcbr2quZkAS35RAD0';

// Listen for messages from popup.js for translation
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'translateText') {
        const { text, targetLang } = request;
        fetch(`https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_TRANSLATE_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                q: text,
                target: targetLang,
                format: 'text'
            })
        })
        .then(res => res.json())
        .then(data => {
            console.log('Google Translate API response:', data);
            if (data && data.data && data.data.translations && data.data.translations[0]) {
                sendResponse({ success: true, translation: data.data.translations[0].translatedText });
            } else {
                sendResponse({ success: false, error: 'No translation found' });
            }
        })
        .catch(err => {
            sendResponse({ success: false, error: err.message });
        });
        return true; // async response
    } else if (request.action === 'getApiKey') {
        // Return API key for translations (stored securely)
        chrome.storage.local.get(['openaiApiKey'], (data) => {
            sendResponse({ apiKey: data.openaiApiKey });
        });
        return true; // Keep message channel open
    } else if (request.action === 'updateBadge') {
        clipboardMonitor.updateBadge(request.count);
        sendResponse({ success: true });
    }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'save-to-clipsmart' && info.selectionText) {
        clipboardMonitor.addItem(info.selectionText);
    }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'copy-last') {
        // Get the last clipboard item
        const data = await chrome.storage.local.get(['clipboardItems']);
        const items = data.clipboardItems || [];
        
        if (items.length > 0) {
            // Send to active tab to copy
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            chrome.tabs.sendMessage(tab.id, {
                action: 'copyToClipboard',
                text: items[0].text
            });
        }
    }
});

// Reset translation count monthly
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'resetTranslations') {
        chrome.storage.local.set({ translationsUsed: 0 });
    } else if (alarm.name === 'cleanup') {
        cleanupOldItems();
    } else if (alarm.name === 'checkClipboard') {
        clipboardMonitor.checkClipboard();
    }
});

// Clean up old items
async function cleanupOldItems() {
    try {
        const data = await chrome.storage.local.get(['clipboardItems', 'settings']);
        const items = data.clipboardItems || [];
        const settings = data.settings || {};
        
        if (settings.autoDelete !== 'never') {
            const days = parseInt(settings.autoDelete);
            const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
            
            const filtered = items.filter(item => 
                item.pinned || item.timestamp > cutoff
            );
            
            if (filtered.length < items.length) {
                await chrome.storage.local.set({ clipboardItems: filtered });
            }
        }
    } catch (error) {
        console.error('Cleanup error:', error);
    }
}

// Initialize badge on startup
chrome.storage.local.get(['clipboardItems'], (data) => {
    const items = data.clipboardItems || [];
    clipboardMonitor.updateBadge(items.length);
});