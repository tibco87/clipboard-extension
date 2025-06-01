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
                translationLangs: ['de', 'es', 'fr']
            },
            isPro: false,
            translationsUsed: 0,
            installDate: Date.now()
        });

        // Open welcome page
        chrome.tabs.create({ url: 'https://clipsmart.app/welcome' });
    }

    // Create context menu
    chrome.contextMenus.create({
        id: 'save-to-clipsmart',
        title: 'Save to ClipSmart',
        contexts: ['selection']
    });

    // Create alarms
    try {
        await chrome.alarms.create('resetTranslations', {
            periodInMinutes: 60 * 24 * 30 // Monthly
        });
        
        await chrome.alarms.create('cleanup', {
            periodInMinutes: 60 * 24 // Daily
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
            const text = await navigator.clipboard.readText();
            if (text && text !== this.lastText) {
                await this.addItem(text);
            }
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
                translations: {}
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

// Start clipboard monitoring
setInterval(() => {
    clipboardMonitor.checkClipboard();
}, 1000); // Check every second

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'saveClipboard') {
        clipboardMonitor.addItem(request.text);
        sendResponse({ success: true });
    } else if (request.action === 'getApiKey') {
        // Return API key for translations (stored securely)
        chrome.storage.local.get(['openaiApiKey'], (data) => {
            sendResponse({ apiKey: data.openaiApiKey });
        });
        return true; // Keep message channel open
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

// Handle extension icon click (when popup is not set)
chrome.action.onClicked.addListener((tab) => {
    // This won't fire if popup is set in manifest
    // But useful for programmatic control
});

// Initialize badge on startup
chrome.storage.local.get(['clipboardItems'], (data) => {
    const items = data.clipboardItems || [];
    clipboardMonitor.updateBadge(items.length);
});