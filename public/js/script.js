class UserAgentScraper {
    constructor() {
        this.eventSource = null;
        this.isScrapingActive = false;
        this.isValidatingKey = false;
        this.isKeyValid = false;
        this.userAgents = [];
        
        this.initializeElements();
        this.bindEvents();
        this.initializeDefaults();
    }
    
    initializeElements() {
        // Form elements
        this.form = document.getElementById('scraperForm');
        this.apiKeyInput = document.getElementById('apiKey');
        this.validateBtn = document.getElementById('validateBtn');
        this.validateText = document.querySelector('.validate-text');
        this.validateLoader = document.querySelector('.validate-loader');
        this.validationStatus = document.getElementById('validationStatus');
        this.maxCountInput = document.getElementById('maxCount');
        this.scrapeBtn = document.getElementById('scrapeBtn');
        this.btnText = document.querySelector('.btn-text');
        this.btnLoader = document.querySelector('.btn-loader');
        
        // Device filter elements
        this.deviceCheckboxes = document.querySelectorAll('input[name="selectedDevices"]');
        this.selectAllBtn = document.getElementById('selectAll');
        this.deselectAllBtn = document.getElementById('deselectAll');
        
        // Results elements
        this.resultsArea = document.getElementById('resultsArea');
        this.copyBtn = document.getElementById('copyBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.completionStatus = document.getElementById('completionStatus');
        
        // Progress elements
        this.progressContainer = document.querySelector('.progress-bar-container');
        this.progressFill = document.querySelector('.progress-fill');
        this.progressText = document.querySelector('.progress-text');
        
        // Stats elements
        this.statsContainer = document.querySelector('.stats-container');
        this.successCount = document.getElementById('successCount');
        this.errorCount = document.getElementById('errorCount');
        this.totalCount = document.getElementById('totalCount');
    }
    
    bindEvents() {
        // Form submission
        this.form.addEventListener('submit', (e) => this.handleFormSubmit(e));
        
        // API key validation
        this.validateBtn.addEventListener('click', () => this.validateApiKey());
        
        // Device filter controls
        this.selectAllBtn.addEventListener('click', () => this.selectAllDevices());
        this.deselectAllBtn.addEventListener('click', () => this.deselectAllDevices());
        
        // Results controls
        this.copyBtn.addEventListener('click', () => this.copyToClipboard());
        this.clearBtn.addEventListener('click', () => this.clearResults());
        
        // Real-time validation
        this.apiKeyInput.addEventListener('input', () => this.resetApiKeyValidation());
        this.maxCountInput.addEventListener('input', () => {
            this.validateMaxCount();
            this.saveMaxCount();
        });
        this.deviceCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.validateDeviceSelection();
                this.saveDeviceFilters();
            });
        });
    }
    
    initializeDefaults() {
        // Load saved API key from localStorage
        const savedApiKey = localStorage.getItem('userAgentScraperApiKey');
        if (savedApiKey) {
            this.apiKeyInput.value = savedApiKey;
        }
        
        // Load saved maximum user agents count from localStorage
        const savedMaxCount = localStorage.getItem('userAgentScraperMaxCount');
        if (savedMaxCount) {
            this.maxCountInput.value = savedMaxCount;
        }
        
        // Load saved device filters from localStorage
        const savedDeviceFilters = localStorage.getItem('userAgentScraperDeviceFilters');
        if (savedDeviceFilters) {
            try {
                const selectedDevices = JSON.parse(savedDeviceFilters);
                this.deviceCheckboxes.forEach(checkbox => {
                    checkbox.checked = selectedDevices.includes(checkbox.value);
                });
            } catch (error) {
                console.error('Error parsing saved device filters:', error);
                this.setDefaultDeviceFilters();
            }
        } else {
            this.setDefaultDeviceFilters();
        }
        
        this.validateForm();
    }
    
    setDefaultDeviceFilters() {
        // Select first few devices by default
        const defaultDevices = ['chrome', 'firefox', 'desktop', 'mobile'];
        this.deviceCheckboxes.forEach(checkbox => {
            checkbox.checked = defaultDevices.includes(checkbox.value);
        });
    }
    
    async handleFormSubmit(e) {
        e.preventDefault();
        
        if (this.isScrapingActive) {
            this.stopScraping();
            return;
        }
        
        if (!this.validateForm()) {
            return;
        }
        
        const formData = this.getFormData();
        await this.startScraping(formData);
    }
    
    getFormData() {
        const apiKey = this.apiKeyInput.value.trim();
        const maxCount = parseInt(this.maxCountInput.value);
        const selectedDevices = Array.from(this.deviceCheckboxes)
            .filter(checkbox => checkbox.checked)
            .map(checkbox => checkbox.value);
        
        return { apiKey, maxCount, selectedDevices };
    }
    
    validateForm() {
        const isApiKeyPresent = this.apiKeyInput.value.trim().length > 0;
        const isMaxCountValid = this.validateMaxCount();
        const isDeviceSelectionValid = this.validateDeviceSelection();
        
        const isValid = isApiKeyPresent && this.isKeyValid && isMaxCountValid && isDeviceSelectionValid;
        this.scrapeBtn.disabled = !isValid || this.isScrapingActive;
        
        return isValid;
    }
    
    resetApiKeyValidation() {
        this.isKeyValid = false;
        this.validationStatus.className = 'validation-status empty';
        this.validationStatus.textContent = '';
        this.saveApiKey();
        this.validateForm();
    }
    
    saveApiKey() {
        const apiKey = this.apiKeyInput.value.trim();
        if (apiKey) {
            localStorage.setItem('userAgentScraperApiKey', apiKey);
        } else {
            localStorage.removeItem('userAgentScraperApiKey');
        }
    }
    
    saveDeviceFilters() {
        const selectedDevices = Array.from(this.deviceCheckboxes)
            .filter(checkbox => checkbox.checked)
            .map(checkbox => checkbox.value);
        
        localStorage.setItem('userAgentScraperDeviceFilters', JSON.stringify(selectedDevices));
    }
    
    saveMaxCount() {
        const maxCount = this.maxCountInput.value;
        if (maxCount) {
            localStorage.setItem('userAgentScraperMaxCount', maxCount);
        }
    }
    
    async validateApiKey() {
        const apiKey = this.apiKeyInput.value.trim();
        
        if (!apiKey) {
            this.showValidationStatus('error', 'Please enter an API key');
            return;
        }
        
        this.isValidatingKey = true;
        this.updateValidateButton(true);
        
        try {
            const response = await fetch('/validate-api-key', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ apiKey })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.isKeyValid = true;
                this.showValidationStatus('success', data.message);
                this.saveApiKey(); // Save valid API key
            } else {
                this.isKeyValid = false;
                this.showValidationStatus('error', data.message || data.error);
            }
            
        } catch (error) {
            this.isKeyValid = false;
            this.showValidationStatus('error', 'Failed to validate API key. Please try again.');
            console.error('API key validation error:', error);
        } finally {
            this.isValidatingKey = false;
            this.updateValidateButton(false);
            this.validateForm();
        }
    }
    
    showValidationStatus(type, message) {
        this.validationStatus.className = `validation-status ${type}`;
        this.validationStatus.textContent = message;
    }
    
    updateValidateButton(isValidating) {
        this.validateBtn.disabled = isValidating;
        this.validateText.style.display = isValidating ? 'none' : 'inline';
        this.validateLoader.style.display = isValidating ? 'inline' : 'none';
    }
    
    validateMaxCount() {
        const value = parseInt(this.maxCountInput.value);
        const isValid = value >= 1 && value <= 20000;
        
        this.maxCountInput.style.borderColor = isValid ? '#e1e5e9' : '#dc3545';
        
        return isValid;
    }
    
    validateDeviceSelection() {
        const selectedCount = Array.from(this.deviceCheckboxes)
            .filter(checkbox => checkbox.checked).length;
        
        const isValid = selectedCount > 0;
        
        // Visual feedback for device selection
        const checkboxGrid = document.querySelector('.checkbox-grid');
        checkboxGrid.style.borderColor = isValid ? 'transparent' : '#dc3545';
        
        return isValid;
    }
    
    selectAllDevices() {
        this.deviceCheckboxes.forEach(checkbox => {
            checkbox.checked = true;
        });
        this.saveDeviceFilters();
        this.validateForm();
    }
    
    deselectAllDevices() {
        this.deviceCheckboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
        this.saveDeviceFilters();
        this.validateForm();
    }
    
    async startScraping(formData) {
        try {
            this.isScrapingActive = true;
            this.updateScrapingUI(true);
            this.clearResults();
            this.showProgress();
            this.userAgents = [];
            
            // Initialize Server-Sent Events
            this.initializeEventSource();
            
            // Start scraping
            const response = await fetch('/scrape', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to start scraping');
            }
            
            // Update total count
            this.updateStats(0, 0, formData.maxCount);
            
        } catch (error) {
            console.error('Error starting scraping:', error);
            this.appendToResults(`Error: ${error.message}\n`);
            this.stopScraping();
        }
    }
    
    initializeEventSource() {
        if (this.eventSource) {
            this.eventSource.close();
        }
        
        this.eventSource = new EventSource('/stream');
        
        this.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleServerMessage(data);
            } catch (error) {
                console.error('Error parsing server message:', error);
            }
        };
        
        this.eventSource.onerror = (error) => {
            console.error('EventSource error:', error);
            if (this.eventSource.readyState === EventSource.CLOSED) {
                this.stopScraping();
            }
        };
    }
    
    handleServerMessage(data) {
        switch (data.type) {
            case 'connected':
                console.log('Connected to server stream');
                break;
                
            case 'userAgent':
                this.handleUserAgentReceived(data);
                break;
                
            case 'error':
                this.handleErrorReceived(data);
                break;
                
            case 'complete':
                this.handleScrapingComplete(data);
                break;
                
            default:
                console.log('Unknown message type:', data.type);
        }
    }
    
    handleUserAgentReceived(data) {
        const userAgentData = data.data;
        this.userAgents.push(userAgentData.userAgent);
        
        // Only display the user agent string
        this.appendToResults(`${userAgentData.userAgent}\n`);
        
        if (data.progress) {
            this.updateProgress(data.progress);
            this.updateStats(data.progress.success, data.progress.errors, data.progress.total);
        }
    }
    
    handleErrorReceived(data) {
        this.appendToResults(`[ERROR] ${data.message}\n`);
        
        if (data.progress) {
            this.updateProgress(data.progress);
            this.updateStats(data.progress.success, data.progress.errors, data.progress.total);
        }
    }
    
    handleScrapingComplete(data) {
        // Show completion message outside the textarea
        this.completionStatus.textContent = `--- Scraping Complete ---\n${data.message}`;
        this.completionStatus.style.display = 'block';
        this.stopScraping();
    }
    
    updateProgress(progress) {
        const percentage = (progress.current / progress.total) * 100;
        this.progressFill.style.width = `${percentage}%`;
        this.progressText.textContent = `${progress.current} / ${progress.total} (${Math.round(percentage)}% complete)`;
    }
    
    updateStats(success, errors, total) {
        this.successCount.textContent = success;
        this.errorCount.textContent = errors;
        this.totalCount.textContent = total;
    }
    
    stopScraping() {
        this.isScrapingActive = false;
        this.updateScrapingUI(false);
        this.hideProgress();
        
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
        
        // Enable copy button if we have results
        this.copyBtn.disabled = this.userAgents.length === 0;
    }
    
    updateScrapingUI(isActive) {
        this.scrapeBtn.disabled = isActive;
        this.btnText.style.display = isActive ? 'none' : 'inline';
        this.btnLoader.style.display = isActive ? 'inline' : 'none';
        
        // Update button text
        if (isActive) {
            this.scrapeBtn.innerHTML = '<span class="btn-loader">🔄 Scraping...</span>';
        } else {
            this.scrapeBtn.innerHTML = '<span class="btn-text">Start Scraping</span>';
        }
        
        // Disable form controls during scraping
        this.apiKeyInput.disabled = isActive;
        this.validateBtn.disabled = isActive || this.isValidatingKey;
        this.maxCountInput.disabled = isActive;
        this.deviceCheckboxes.forEach(checkbox => {
            checkbox.disabled = isActive;
        });
        this.selectAllBtn.disabled = isActive;
        this.deselectAllBtn.disabled = isActive;
    }
    
    showProgress() {
        this.progressContainer.style.display = 'block';
        this.statsContainer.style.display = 'flex';
        this.progressFill.style.width = '0%';
        this.progressText.textContent = '0 / 0 (0% complete)';
    }
    
    hideProgress() {
        this.progressContainer.style.display = 'none';
        this.statsContainer.style.display = 'none';
    }
    
    appendToResults(text) {
        this.resultsArea.value += text;
        this.resultsArea.scrollTop = this.resultsArea.scrollHeight;
    }
    
    clearResults() {
        this.resultsArea.value = '';
        this.userAgents = [];
        this.copyBtn.disabled = true;
        this.hideProgress();
        this.updateStats(0, 0, 0);
        this.completionStatus.style.display = 'none';
        this.completionStatus.textContent = '';
    }
    
    async copyToClipboard() {
        try {
            await navigator.clipboard.writeText(this.resultsArea.value);
            
            // Visual feedback
            const originalText = this.copyBtn.textContent;
            this.copyBtn.textContent = '✅ Copied!';
            this.copyBtn.style.backgroundColor = '#28a745';
            
            setTimeout(() => {
                this.copyBtn.textContent = originalText;
                this.copyBtn.style.backgroundColor = '';
            }, 2000);
            
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            
            // Fallback: select text
            this.resultsArea.select();
            this.resultsArea.setSelectionRange(0, 99999);
            
            // Visual feedback for fallback
            const originalText = this.copyBtn.textContent;
            this.copyBtn.textContent = '📋 Selected!';
            
            setTimeout(() => {
                this.copyBtn.textContent = originalText;
            }, 2000);
        }
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new UserAgentScraper();
});