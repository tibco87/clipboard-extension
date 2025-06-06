// ClipSmart Popup Script
class ClipSmart {
    constructor() {
        this.clipboardItems = [];
        this.filteredItems = [];
        this.currentTab = 'recent';
        this.searchQuery = '';
        this.freeItemLimit = 20;
        this.freeTranslationLimit = 50;
        this.translationsUsed = 0;
        this.isPro = false;
        this.defaultTransLangs = ['de', 'es', 'fr'];
        this.tags = new Set();
        this.translationLimit = 10; // Limit prekladov pre free verziu
        this.availableLanguages = ['en', 'sk', 'de'];
        this.sortOrder = 'newest';
        
        this.init();
    }

    async init() {
        await this.loadData();
        await this.loadTags();
        this.setupEventListeners();
        this.applyTheme();
        this.renderContent();
        this.updateItemCount();
    }

    async loadData() {
        try {
            const data = await chrome.storage.local.get(['clipboardItems', 'settings', 'isPro', 'translationsUsed']);
            this.clipboardItems = (data.clipboardItems || []).map(item => {
                if (item.tags && Array.isArray(item.tags)) item.tags = new Set(item.tags);
                return item;
            });
            this.settings = data.settings || this.getDefaultSettings();
            this.isPro = data.isPro || false;
            this.translationsUsed = data.translationsUsed || 0;
            
            // Clean up old items based on auto-delete setting
            await this.cleanupOldItems();
        } catch (error) {
            console.error('Error loading data:', error);
        }
    }

    async loadTags() {
        try {
            const data = await chrome.storage.local.get('tags');
            this.tags = new Set(data.tags || []);
        } catch (error) {
            console.error('Error loading tags:', error);
        }
    }

    getDefaultSettings() {
        return {
            theme: 'auto',
            language: 'en',
            autoDelete: 'never',
            translationLangs: ['en', 'de', 'fr', 'es', 'ru', 'uk', 'zh', 'ja', 'hi', 'pl', 'cs']
        };
    }

    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Search
        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('input', (e) => {
            this.searchQuery = e.target.value;
            this.filterItems();
            this.renderItems();
        });

        // Theme toggle
        document.getElementById('themeToggle').addEventListener('click', () => {
            this.toggleTheme();
        });

        // Settings
        document.getElementById('themeSelect').addEventListener('change', (e) => {
            this.updateSetting('theme', e.target.value);
            this.applyTheme();
        });

        document.getElementById('languageSelect').addEventListener('change', (e) => {
            this.updateSetting('language', e.target.value);
            this.updateUI();
        });

        document.getElementById('autoDeleteSelect').addEventListener('change', (e) => {
            this.updateSetting('autoDelete', e.target.value);
        });

        // Translation language selects
        const langCodes = ['en', 'de', 'fr', 'es', 'ru', 'uk', 'zh', 'ja', 'hi', 'pl', 'cs'];
        ['transLang1', 'transLang2', 'transLang3'].forEach((id, index) => {
            const select = document.getElementById(id);
            // Vymaž existujúce možnosti
            select.innerHTML = '';
            langCodes.forEach(code => {
                const option = document.createElement('option');
                option.value = code;
                option.textContent = code.toUpperCase();
                select.appendChild(option);
            });
            select.value = this.settings.translationLangs[index] || langCodes[index];
            select.addEventListener('change', (e) => {
                this.settings.translationLangs[index] = e.target.value;
                this.updateSetting('translationLangs', this.settings.translationLangs);
            });
        });

        // Clear all button
        document.getElementById('clearAllButton').addEventListener('click', () => {
            if (confirm('Are you sure you want to clear all clipboard items?')) {
                this.clearAllItems();
            }
        });

        // Upgrade button
        document.getElementById('upgradeButton').addEventListener('click', () => {
            this.openUpgradePage();
        });

        // Links
        document.getElementById('privacyLink').addEventListener('click', (e) => {
            e.preventDefault();
            chrome.tabs.create({ url: 'https://clipsmart.app/privacy' });
        });

        document.getElementById('supportLink').addEventListener('click', (e) => {
            e.preventDefault();
            chrome.tabs.create({ url: 'https://clipsmart.app/support' });
        });

        // Premium mode toggle
        document.getElementById('premiumMode').addEventListener('change', (e) => {
            this.togglePremiumMode(e.target.checked);
        });

        // Zoradenie
        const sortSelect = document.getElementById('sortSelect');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.sortOrder = e.target.value;
                this.renderItems();
            });
        }
    }

    switchTab(tab) {
        this.currentTab = tab;
        
        // Update tab buttons
        document.querySelectorAll('.tab-button').forEach(button => {
            button.classList.toggle('active', button.dataset.tab === tab);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tab}Tab`);
        });

        // Show/hide search based on tab
        document.getElementById('searchContainer').style.display = 
            tab === 'settings' ? 'none' : 'block';

        // Render content for the current tab
        this.renderContent();
    }

    renderContent() {
        switch (this.currentTab) {
            case 'recent':
                this.filterItems();
                this.renderItems();
                break;
            case 'pinned':
                this.renderPinnedItems();
                break;
            case 'settings':
                this.renderSettings();
                break;
        }
    }

    filterItems() {
        if (!this.searchQuery) {
            this.filteredItems = this.clipboardItems;
            return;
        }

        const query = this.searchQuery.toLowerCase();

        this.filteredItems = this.clipboardItems.filter(item => {
            return (
                item.text.toLowerCase().includes(query) ||
                (item.tags && Array.from(item.tags).some(tagText => tagText.toLowerCase().includes(query)))
            );
        });
    }

    filterPinnedItems() {
        // Zober len pinned položky
        let pinnedItems = this.clipboardItems.filter(item => item.pinned);
        if (!this.searchQuery) {
            return pinnedItems;
        }
        const query = this.searchQuery.toLowerCase();
        return pinnedItems.filter(item => {
            return (
                item.text.toLowerCase().includes(query) ||
                (item.tags && Array.from(item.tags).some(tagText => tagText.toLowerCase().includes(query)))
            );
        });
    }

    renderItems() {
        const container = document.getElementById('recentList');
        const emptyState = document.getElementById('recentEmpty');
        
        if (this.filteredItems.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'flex';
            return;
        }

        emptyState.style.display = 'none';
        container.innerHTML = '';

        // Zoradenie podľa sortOrder
        let itemsToShow = [...this.filteredItems];
        switch (this.sortOrder) {
            case 'newest':
                itemsToShow.sort((a, b) => b.timestamp - a.timestamp);
                break;
            case 'oldest':
                itemsToShow.sort((a, b) => a.timestamp - b.timestamp);
                break;
            case 'az':
                itemsToShow.sort((a, b) => a.text.localeCompare(b.text));
                break;
            case 'za':
                itemsToShow.sort((a, b) => b.text.localeCompare(a.text));
                break;
            case 'longest':
                itemsToShow.sort((a, b) => b.charCount - a.charCount);
                break;
            case 'shortest':
                itemsToShow.sort((a, b) => a.charCount - b.charCount);
                break;
        }

        // Limit items for free users
        itemsToShow = this.isPro ? itemsToShow : itemsToShow.slice(0, this.freeItemLimit);

        itemsToShow.forEach(item => {
            const element = this.createItemElement(item);
            container.appendChild(element);
        });

        // Show upgrade prompt if there are more items
        if (!this.isPro && this.filteredItems.length > this.freeItemLimit) {
            const upgradePrompt = this.createUpgradePrompt();
            container.appendChild(upgradePrompt);
        }
    }

    renderPinnedItems() {
        const container = document.getElementById('pinnedList');
        const emptyState = document.getElementById('pinnedEmpty');
        
        // Použi filtrované pinned položky
        const filteredPinned = this.filterPinnedItems();
        
        if (filteredPinned.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'flex';
            return;
        }

        emptyState.style.display = 'none';
        container.innerHTML = '';

        filteredPinned.forEach(item => {
            const element = this.createItemElement(item);
            container.appendChild(element);
        });
    }

    createItemElement(item) {
        const template = document.getElementById('clipboardItemTemplate');
        const element = template.content.cloneNode(true).querySelector('.clipboard-item');
        
        // Set data attributes
        element.dataset.id = item.id;
        element.dataset.type = item.type;
        if (item.pinned) element.classList.add('pinned');

        // Set type icon
        const typeIcon = element.querySelector('.item-type-icon');
        typeIcon.textContent = this.getTypeIcon(item.type);

        // Set time
        const timeElement = element.querySelector('.item-time');
        timeElement.textContent = this.formatTime(item.timestamp);

        // Set content
        const contentElement = element.querySelector('.item-content');
        contentElement.textContent = item.text;

        // Set character count
        const charCount = element.querySelector('.item-char-count');
        charCount.textContent = `${item.charCount} characters`;

        // Add tags as heading
        const tagsContainer = element.querySelector('.item-tags');
        tagsContainer.innerHTML = '';
        if (item.tags && item.tags.size > 0) {
            item.tags.forEach(tag => {
                const tagElement = document.createElement('span');
                tagElement.className = 'item-tag';
                tagElement.textContent = tag;
                tagElement.title = tag;
                tagsContainer.appendChild(tagElement);
            });
        }

        // Add tag button handler
        const tagBtn = element.querySelector('.tag-btn');
        tagBtn.addEventListener('click', () => {
            const tag = prompt('Enter tag:');
            if (tag) {
                this.addTag(item.id, tag);
            }
        });

        // Setup action buttons
        this.setupItemActions(element, item);

        return element;
    }

    setupItemActions(element, item) {
        // Copy button
        element.querySelector('.copy-btn').addEventListener('click', () => {
            this.copyToClipboard(item.text);
            this.showNotification('Copied to clipboard!');
        });

        // Pin button
        const pinBtn = element.querySelector('.pin-btn');
        if (item.pinned) {
            pinBtn.innerHTML = '<span>📍</span>';
        }
        pinBtn.addEventListener('click', () => {
            this.togglePin(item.id);
        });

        // Delete button
        element.querySelector('.delete-btn').addEventListener('click', () => {
            this.deleteItem(item.id);
        });

        // Translate button - vždy zobraziť
        const translateBtn = element.querySelector('.translate-btn');
        translateBtn.style.display = '';
        translateBtn.addEventListener('click', () => {
            this.showLanguageSelect(element, item);
        });

        // Export button (exportuje len túto položku)
        const exportBtn = element.querySelector('.export-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportSingleItem(item);
            });
        }
    }

    showLanguageSelect(element, item) {
        // Odstráň starý panel ak existuje
        let oldPanel = element.querySelector('.translation-panel');
        if (oldPanel) oldPanel.remove();

        // Unikátne ID pre select a button
        const selectId = `langSelect-${item.id}`;
        const btnId = `translateGoBtn-${item.id}`;

        // Vytvor panel na výber jazyka
        const panel = document.createElement('div');
        panel.className = 'translation-panel';
        panel.style.display = 'block';
        panel.innerHTML = `
            <div class="translation-list">
                <label for="${selectId}">Vyber jazyk prekladu:</label>
                <select id="${selectId}">
                    <option value="en">Angličtina</option>
                    <option value="de">Nemčina</option>
                    <option value="fr">Francúzština</option>
                    <option value="es">Španielčina</option>
                    <option value="ru">Ruština</option>
                    <option value="uk">Ukrajinčina</option>
                    <option value="zh">Čínština</option>
                    <option value="ja">Japončina</option>
                    <option value="hi">Hindčina</option>
                    <option value="pl">Poľština</option>
                    <option value="cs">Čeština</option>
                </select>
                <button id="${btnId}">Preložiť</button>
                <div class="translation-result"></div>
            </div>
        `;
        element.appendChild(panel);

        const select = panel.querySelector(`#${selectId}`);
        const goBtn = panel.querySelector(`#${btnId}`);
        const resultDiv = panel.querySelector('.translation-result');

        goBtn.addEventListener('click', async () => {
            resultDiv.innerHTML = '<div class="loading">Prekladám...</div>';
            const lang = select.value;
            try {
                const translations = await this.translateText(item.text, lang);
                resultDiv.innerHTML = '';
                const translation = translations[lang];
                if (translation) {
                    const transItem = this.createTranslationElement(lang, translation);
                    resultDiv.appendChild(transItem);
                } else {
                    resultDiv.innerHTML = '<div class="error">Preklad sa nepodaril.</div>';
                }
            } catch (error) {
                resultDiv.innerHTML = '<div class="error">Preklad sa nepodaril.</div>';
            }
        });
    }

    async translateText(text, targetLang) {
        if (!this.isPro && this.translationsUsed >= this.translationLimit) {
            this.showUpgradeModal('Translation limit reached');
            return null;
        }

        try {
            const response = await fetch('https://libretranslate.de/translate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    q: text,
                    source: 'auto',
                    target: targetLang
                })
            });

            if (!response.ok) throw new Error('Translation failed');

            const data = await response.json();
            if (!this.isPro) {
                this.translationsUsed++;
                await chrome.storage.local.set({ translationsUsed: this.translationsUsed });
                this.updateTranslationQuota();
            }
            return data.translatedText;
        } catch (error) {
            console.error('Translation error:', error);
            return null;
        }
    }

    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
        } catch (error) {
            console.error('Copy failed:', error);
        }
    }

    async togglePin(itemId) {
        const item = this.clipboardItems.find(i => i.id === itemId);
        if (item) {
            item.pinned = !item.pinned;
            await this.saveData();
            this.renderContent();
        }
    }

    async deleteItem(itemId) {
        this.clipboardItems = this.clipboardItems.filter(i => i.id !== itemId);
        await this.saveData();
        this.renderContent();
        this.updateItemCount();
        // Aktualizuj badge v backgrounde
        chrome.runtime.sendMessage({ action: 'updateBadge', count: this.clipboardItems.length });
    }

    async clearAllItems() {
        this.clipboardItems = [];
        await this.saveData();
        this.renderContent();
        this.updateItemCount();
    }

    async saveData() {
        try {
            // Pri ukladaní konvertuj Set na pole
            const itemsToSave = this.clipboardItems.map(item => {
                const newItem = { ...item };
                if (item.tags instanceof Set) newItem.tags = Array.from(item.tags);
                return newItem;
            });
            await chrome.storage.local.set({ clipboardItems: itemsToSave });
        } catch (error) {
            console.error('Error saving data:', error);
        }
    }

    updateItemCount() {
        document.getElementById('itemCount').textContent = this.clipboardItems.length;
    }

    renderSettings() {
        // Update theme select
        document.getElementById('themeSelect').value = this.settings.theme;
        
        // Update language select
        document.getElementById('languageSelect').value = this.settings.language;
        
        // Update auto-delete select
        document.getElementById('autoDeleteSelect').value = this.settings.autoDelete;
        
        // Update translation language selects
        const langCodes = ['en', 'de', 'fr', 'es', 'ru', 'uk', 'zh', 'ja', 'hi', 'pl', 'cs'];
        ['transLang1', 'transLang2', 'transLang3'].forEach((id, index) => {
            const select = document.getElementById(id);
            select.innerHTML = '';
            langCodes.forEach(code => {
                const option = document.createElement('option');
                option.value = code;
                option.textContent = code.toUpperCase();
                select.appendChild(option);
            });
            select.value = this.settings.translationLangs[index] || langCodes[index];
        });
        
        // Update translation quota
        this.updateTranslationQuota();
    }

    updateTranslationQuota() {
        const quotaElement = document.getElementById('translationQuota');
        if (this.isPro) {
            quotaElement.innerHTML = '<span class="quota-text">Unlimited translations with Pro!</span>';
        } else {
            quotaElement.innerHTML = `
                <span class="quota-text">Translations used: 
                    <strong>${this.translationsUsed}/${this.freeTranslationLimit}</strong> this month
                </span>
            `;
        }
    }

    async updateSetting(key, value) {
        this.settings[key] = value;
        await chrome.storage.local.set({ settings: this.settings });
    }

    applyTheme() {
        const theme = this.settings.theme;
        const root = document.documentElement;
        
        if (theme === 'auto') {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            root.setAttribute('data-theme', isDark ? 'dark' : 'light');
        } else {
            root.setAttribute('data-theme', theme);
        }
        
        // Update theme icon
        const themeIcon = document.querySelector('.theme-icon');
        themeIcon.textContent = root.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙';
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        this.updateSetting('theme', newTheme);
        this.applyTheme();
    }

    async cleanupOldItems() {
        if (this.settings.autoDelete === 'never') return;
        
        const now = Date.now();
        const days = parseInt(this.settings.autoDelete);
        const cutoff = now - (days * 24 * 60 * 60 * 1000);
        
        this.clipboardItems = this.clipboardItems.filter(item => 
            item.pinned || item.timestamp > cutoff
        );
        
        await this.saveData();
    }

    getTypeIcon(type) {
        const icons = {
            text: '📝',
            url: '🔗',
            email: '✉️',
            code: '💻'
        };
        return icons[type] || '📋';
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${day}.${month}.${year} ${hours}:${minutes}`;
    }

    createUpgradePrompt() {
        const div = document.createElement('div');
        div.className = 'upgrade-prompt';
        div.innerHTML = `
            <div class="upgrade-icon">🔒</div>
            <p class="upgrade-text">
                ${this.clipboardItems.length - this.freeItemLimit} more items available
            </p>
            <button class="upgrade-btn">Upgrade to Pro</button>
        `;
        
        div.querySelector('.upgrade-btn').addEventListener('click', () => {
            this.openUpgradePage();
        });
        
        return div;
    }

    showNotification(message) {
        // Create a simple notification (you can enhance this)
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--accent-color);
            color: white;
            padding: 12px 24px;
            border-radius: 20px;
            font-size: 14px;
            z-index: 1000;
            animation: slideIn 0.3s ease-out;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 2000);
    }

    showUpgradeModal(message) {
        // Show upgrade modal (implement as needed)
        if (confirm(message)) {
            this.openUpgradePage();
        }
    }

    openUpgradePage() {
        chrome.tabs.create({ url: 'https://clipsmart.app/upgrade' });
    }

    updateUI() {
        // Update UI based on language setting
        // This would load translations from _locales
        // For now, keeping English as default
    }

    async togglePremiumMode(enabled) {
        this.isPro = enabled;
        await chrome.storage.local.set({ isPro: enabled });
        this.renderContent();
        this.updateItemCount();
    }

    async addTag(itemId, tag) {
        const item = this.clipboardItems.find(i => i.id === itemId);
        if (item) {
            if (!item.tags) item.tags = new Set();
            if (Array.isArray(item.tags)) item.tags = new Set(item.tags);
            item.tags.add(tag);
            this.tags.add(tag);
            await this.saveData();
            await this.loadTags();
            this.renderContent();
        }
    }

    async removeTag(itemId, tag) {
        const item = this.clipboardItems.find(i => i.id === itemId);
        if (item && item.tags) {
            if (Array.isArray(item.tags)) item.tags = new Set(item.tags);
            item.tags.delete(tag);
            // Check if tag is used by other items
            const isTagUsed = this.clipboardItems.some(i => {
                if (Array.isArray(i.tags)) i.tags = new Set(i.tags);
                return i.tags && i.tags.has(tag);
            });
            if (!isTagUsed) {
                this.tags.delete(tag);
            }
            await this.saveData();
            await this.loadTags();
            this.renderContent();
        }
    }

    async exportData(format) {
        if (!this.isPro) {
            this.showUpgradeModal('Export is a premium feature');
            return;
        }

        const data = this.clipboardItems.map(item => ({
            text: item.text,
            timestamp: this.formatTime(item.timestamp),
            tags: item.tags ? Array.from(item.tags) : [],
            translations: item.translations || {}
        }));

        let content;
        let filename;
        let mimeType;

        if (format === 'csv') {
            content = this.convertToCSV(data);
            filename = 'clipboard-export.csv';
            mimeType = 'text/csv';
        } else {
            content = JSON.stringify(data, null, 2);
            filename = 'clipboard-export.txt';
            mimeType = 'text/plain';
        }

        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    convertToCSV(data) {
        const headers = ['Text', 'Timestamp', 'Tags', 'Translations'];
        const rows = data.map(item => [
            item.text,
            item.timestamp,
            item.tags.join(', '),
            Object.entries(item.translations)
                .map(([lang, text]) => `${lang}: ${text}`)
                .join('; ')
        ]);

        return [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');
    }

    exportSingleItem(item, format = 'txt') {
        if (!this.isPro) {
            this.showUpgradeModal('Export is a premium feature');
            return;
        }
        const data = {
            text: item.text,
            timestamp: this.formatTime(item.timestamp),
            tags: item.tags ? Array.from(item.tags) : [],
            translations: item.translations || {}
        };
        let content, filename, mimeType;
        if (format === 'csv') {
            content = this.convertToCSV([data]);
            filename = 'clipboard-item.csv';
            mimeType = 'text/csv';
        } else {
            content = JSON.stringify(data, null, 2);
            filename = 'clipboard-item.txt';
            mimeType = 'text/plain';
        }
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }
}

// Initialize ClipSmart when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new ClipSmart();
});