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
        
        this.init();
    }

    async init() {
        await this.loadData();
        this.setupEventListeners();
        this.applyTheme();
        this.renderContent();
        this.updateItemCount();
    }

    async loadData() {
        try {
            const data = await chrome.storage.local.get(['clipboardItems', 'settings', 'isPro', 'translationsUsed']);
            this.clipboardItems = data.clipboardItems || [];
            this.settings = data.settings || this.getDefaultSettings();
            this.isPro = data.isPro || false;
            this.translationsUsed = data.translationsUsed || 0;
            
            // Clean up old items based on auto-delete setting
            await this.cleanupOldItems();
        } catch (error) {
            console.error('Error loading data:', error);
        }
    }

    getDefaultSettings() {
        return {
            theme: 'auto',
            language: 'en',
            autoDelete: 'never',
            translationLangs: ['de', 'es', 'fr']
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
        ['transLang1', 'transLang2', 'transLang3'].forEach((id, index) => {
            document.getElementById(id).addEventListener('change', (e) => {
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
        this.filteredItems = this.clipboardItems.filter(item => 
            item.text.toLowerCase().includes(query)
        );
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

        // Limit items for free users
        const itemsToShow = this.isPro ? this.filteredItems : 
            this.filteredItems.slice(0, this.freeItemLimit);

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
        
        const pinnedItems = this.clipboardItems.filter(item => item.pinned);
        
        if (pinnedItems.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'flex';
            return;
        }

        emptyState.style.display = 'none';
        container.innerHTML = '';

        pinnedItems.forEach(item => {
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

        // Translate button (only for text ≤150 chars)
        const translateBtn = element.querySelector('.translate-btn');
        if (item.charCount > 150) {
            translateBtn.style.display = 'none';
        } else {
            translateBtn.addEventListener('click', () => {
                this.toggleTranslation(element, item);
            });
        }
    }

    async toggleTranslation(element, item) {
        const panel = element.querySelector('.translation-panel');
        
        if (panel.style.display === 'none') {
            // Check translation limit for free users
            if (!this.isPro && this.translationsUsed >= this.freeTranslationLimit) {
                this.showUpgradeModal('You\'ve reached the free translation limit. Upgrade to Pro for unlimited translations!');
                return;
            }

            // Show loading state
            panel.style.display = 'block';
            const list = panel.querySelector('.translation-list');
            list.innerHTML = '<div class="loading">Translating...</div>';

            try {
                // Get translations
                const translations = await this.translateText(item.text, item.id);
                
                // Render translations
                list.innerHTML = '';
                this.settings.translationLangs.forEach((lang, index) => {
                    const translation = translations[lang];
                    if (translation) {
                        const transItem = this.createTranslationElement(lang, translation);
                        list.appendChild(transItem);
                    }
                });

                // Update usage count
                if (!this.isPro) {
                    this.translationsUsed++;
                    await chrome.storage.local.set({ translationsUsed: this.translationsUsed });
                    this.updateTranslationQuota();
                }

            } catch (error) {
                list.innerHTML = '<div class="error">Translation failed. Please try again.</div>';
                console.error('Translation error:', error);
            }
        } else {
            panel.style.display = 'none';
        }
    }

    createTranslationElement(lang, text) {
        const div = document.createElement('div');
        div.className = 'translation-item';
        div.innerHTML = `
            <span class="translation-lang">${lang.toUpperCase()}</span>
            <span class="translation-text">${text}</span>
            <div class="translation-actions">
                <button class="action-btn" title="Copy">
                    <span>📋</span>
                </button>
            </div>
        `;

        // Copy button
        div.querySelector('.action-btn').addEventListener('click', () => {
            this.copyToClipboard(text);
            this.showNotification('Translation copied!');
        });

        return div;
    }

    async translateText(text, itemId) {
        // Check if translations already exist for this item
        const item = this.clipboardItems.find(i => i.id === itemId);
        if (item.translations && Object.keys(item.translations).length > 0) {
            return item.translations;
        }

        // Simulate API call (replace with actual OpenAI API call)
        // For demo purposes, returning mock translations
        const translations = {};
        const mockTranslations = {
            de: 'Deutsche Übersetzung von: ' + text.substring(0, 20),
            es: 'Traducción española de: ' + text.substring(0, 20),
            fr: 'Traduction française de: ' + text.substring(0, 20),
            zh: '中文翻译: ' + text.substring(0, 20),
            ja: '日本語訳: ' + text.substring(0, 20)
        };

        this.settings.translationLangs.forEach(lang => {
            translations[lang] = mockTranslations[lang] || text;
        });

        // Save translations to the item
        item.translations = translations;
        await this.saveData();

        return translations;
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
    }

    async clearAllItems() {
        this.clipboardItems = [];
        await this.saveData();
        this.renderContent();
        this.updateItemCount();
    }

    async saveData() {
        try {
            await chrome.storage.local.set({ clipboardItems: this.clipboardItems });
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
        ['transLang1', 'transLang2', 'transLang3'].forEach((id, index) => {
            document.getElementById(id).value = this.settings.translationLangs[index];
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
        const now = Date.now();
        const diff = now - timestamp;
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return `${Math.floor(diff / 86400000)}d ago`;
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
}

// Initialize ClipSmart when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new ClipSmart();
});