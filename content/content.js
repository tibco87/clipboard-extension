// ClipSmart Content Script

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'copyToClipboard') {
        // Copy text to clipboard
        copyToClipboard(request.text);
        sendResponse({ success: true });
    }
    if (request.action === "getClipboardText") {
        if (navigator.clipboard && navigator.clipboard.readText) {
            navigator.clipboard.readText()
                .then(text => sendResponse({ text }))
                .catch(() => sendResponse({ text: "" }));
        } else {
            sendResponse({ text: "" });
        }
        return true; // async odpoveď
    }
});

// Helper function to copy text to clipboard
async function copyToClipboard(text) {
    try {
        // Try using the modern clipboard API first
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            showNotification('Copied to clipboard!');
        } else {
            // Fallback method
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showNotification('Copied to clipboard!');
        }
    } catch (error) {
        console.error('Failed to copy:', error);
        showNotification('Failed to copy to clipboard', 'error');
    }
}

// Show notification
function showNotification(message, type = 'success') {
    // Remove any existing notifications
    const existing = document.querySelector('.clipsmart-notification');
    if (existing) {
        existing.remove();
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'clipsmart-notification';
    notification.textContent = message;
    
    // Style the notification
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: ${type === 'success' ? '#ff6b35' : '#ff3b30'};
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 999999;
        animation: clipsmart-slide-in 0.3s ease-out;
    `;

    // Add animation styles
    const style = document.createElement('style');
    style.textContent = `
        @keyframes clipsmart-slide-in {
            from {
                transform: translateY(100%);
                opacity: 0;
            }
            to {
                transform: translateY(0);
                opacity: 1;
            }
        }
        
        @keyframes clipsmart-fade-out {
            from {
                opacity: 1;
            }
            to {
                opacity: 0;
            }
        }
    `;
    
    if (!document.querySelector('#clipsmart-styles')) {
        style.id = 'clipsmart-styles';
        document.head.appendChild(style);
    }

    // Add to page
    document.body.appendChild(notification);

    // Remove after delay
    setTimeout(() => {
        notification.style.animation = 'clipsmart-fade-out 0.3s ease-out';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 2000);
}

// Optional: Add keyboard shortcut handler
document.addEventListener('keydown', (event) => {
    // Example: Ctrl+Shift+V to open ClipSmart
    if (event.ctrlKey && event.shiftKey && event.key === 'V') {
        event.preventDefault();
        chrome.runtime.sendMessage({ action: 'openPopup' });
    }
});