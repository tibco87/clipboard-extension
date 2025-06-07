const ExtPay = {
  // Konfigurácia
  config: {
    apiKey: 'YOUR_API_KEY', // Tu vložte váš API kľúč z ExtensionPay
    extensionId: chrome.runtime.id,
    isTestMode: true // Nastavte na false pre produkčné nasadenie
  },

  prices: {
    'US': { amount: 2.99, currency: 'USD' },
    'WE': { amount: 1.99, currency: 'EUR' }, // Western Europe
    'EE': { amount: 0.99, currency: 'EUR' }, // Eastern Europe
    'RU': { amount: 99, currency: 'RUB' },
    'AS': { amount: 0.99, currency: 'USD' }  // Asia
  },
  
  limits: {
    free: {
      items: 100,
      translationsPerDay: 10
    },
    premium: {
      items: Infinity,
      translationsPerDay: Infinity
    }
  },

  async detectRegion() {
    if (this.config.isTestMode) {
      console.log('Test mode: Using US region');
      return 'US';
    }

    try {
      const response = await fetch('https://ipapi.co/json/');
      const data = await response.json();
      
      // Map country codes to our regions
      const regionMap = {
        // Western Europe
        'GB': 'WE', 'FR': 'WE', 'DE': 'WE', 'IT': 'WE', 'ES': 'WE', 'PT': 'WE', 'NL': 'WE', 'BE': 'WE', 'CH': 'WE', 'AT': 'WE',
        // Eastern Europe
        'PL': 'EE', 'CZ': 'EE', 'SK': 'EE', 'HU': 'EE', 'RO': 'EE', 'BG': 'EE', 'HR': 'EE', 'SI': 'EE', 'RS': 'EE', 'UA': 'EE',
        // Russia
        'RU': 'RU',
        // Asia
        'CN': 'AS', 'JP': 'AS', 'KR': 'AS', 'IN': 'AS', 'ID': 'AS', 'MY': 'AS', 'SG': 'AS', 'TH': 'AS', 'VN': 'AS', 'PH': 'AS'
      };

      const region = regionMap[data.country_code] || 'US';
      return region;
    } catch (error) {
      console.error('Error detecting region:', error);
      return 'US'; // Default to US if detection fails
    }
  },

  async initialize() {
    const region = await this.detectRegion();
    const state = {
      isPremium: false,
      region: region
    };
    
    // Load existing state or set default
    const savedState = localStorage.getItem('extpay_state');
    if (savedState) {
      Object.assign(state, JSON.parse(savedState));
    }
    
    // Save state
    localStorage.setItem('extpay_state', JSON.stringify(state));
    
    return state;
  },

  getPrice(region) {
    if (this.config.isTestMode) {
      console.log('Test mode: Using test price');
      return { amount: 0.01, currency: 'USD' };
    }
    return this.prices[region] || this.prices['US'];
  },

  getLimits(isPremium) {
    return isPremium ? this.limits.premium : this.limits.free;
  },

  // Testovacia metóda pre simuláciu platby
  async simulatePayment() {
    if (this.config.isTestMode) {
      console.log('Test mode: Simulating successful payment');
      return {
        success: true,
        paymentId: 'test_' + Date.now()
      };
    }
    return null;
  }
};

export default ExtPay; 