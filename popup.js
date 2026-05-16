const defaultSettings = {
    showButtons: true,
    preset: 'viral',
    fontColor: '#ffff00',
    fontFamily: 'Roboto',
    fontSize: 37,
    lineHeight: 1.5,
    letterSpacing: 0.5,
    verticalPos: 10,
    strokeWidth: 3,
    shadowX: 2,
    shadowY: 4,
    shadowBlur: 0,
    glowSize: 11,
    glowOpacity: 100,
    geminiKey: ''
};

const presets = {
    viral: {
        fontColor: '#ffff00',
        fontSize: 37,
        strokeWidth: 3,
        shadowX: 2,
        shadowY: 4,
        shadowBlur: 0,
        glowSize: 11,
        glowOpacity: 100
    },
    classico: {
        fontColor: '#ffffff',
        fontSize: 28,
        strokeWidth: 0,
        shadowX: 0,
        shadowY: 0,
        shadowBlur: 0,
        glowSize: 0,
        glowOpacity: 0
    },
    filme: {
        fontColor: '#ffffff',
        fontSize: 24,
        strokeWidth: 1,
        shadowX: 1,
        shadowY: 1,
        shadowBlur: 2,
        glowSize: 5,
        glowOpacity: 50
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const elements = {
        showButtons: document.getElementById('show-buttons'),
        fontColor: document.getElementById('font-color'),
        fontFamily: document.getElementById('font-family'),
        fontSize: document.getElementById('font-size'),
        lineHeight: document.getElementById('line-height'),
        letterSpacing: document.getElementById('letter-spacing'),
        verticalPos: document.getElementById('vertical-pos'),
        strokeWidth: document.getElementById('stroke-width'),
        shadowX: document.getElementById('shadow-x'),
        shadowY: document.getElementById('shadow-y'),
        shadowBlur: document.getElementById('shadow-blur'),
        glowSize: document.getElementById('glow-size'),
        glowOpacity: document.getElementById('glow-opacity'),
        geminiKey: document.getElementById('gemini-key'),
        generateBtn: document.getElementById('generate-btn')
    };

    const valDisplays = {
        fontSize: document.getElementById('val-font-size'),
        lineHeight: document.getElementById('val-line-height'),
        letterSpacing: document.getElementById('val-letter-spacing'),
        verticalPos: document.getElementById('val-vertical-pos'),
        strokeWidth: document.getElementById('val-stroke-width'),
        shadowX: document.getElementById('val-shadow-x'),
        shadowY: document.getElementById('val-shadow-y'),
        shadowBlur: document.getElementById('val-shadow-blur'),
        glowSize: document.getElementById('val-glow-size'),
        glowOpacity: document.getElementById('val-glow-opacity')
    };

    // Load settings
    chrome.storage.local.get(defaultSettings, (settings) => {
        Object.keys(settings).forEach(key => {
            if (elements[key]) {
                if (elements[key].type === 'checkbox') {
                    elements[key].checked = settings[key];
                } else {
                    elements[key].value = settings[key];
                }
                
                if (valDisplays[key]) {
                    valDisplays[key].textContent = settings[key];
                }
            }
        });
        
        updatePresetButtons(settings.preset);
    });

    // Handle Input Changes
    Object.keys(elements).forEach(key => {
        const el = elements[key];
        if (!el || key === 'generateBtn') return;

        el.addEventListener('input', () => {
            const val = el.type === 'checkbox' ? el.checked : el.value;
            
            if (valDisplays[key]) {
                valDisplays[key].textContent = val;
            }

            const update = {};
            update[key] = val;
            chrome.storage.local.set(update);
            
            // Notify content script
            notifyContentScript({ type: 'UPDATE_SETTINGS', settings: update });
        });
    });

    // Presets
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const presetName = btn.id.replace('preset-', '');
            applyPreset(presetName);
        });
    });

    function applyPreset(name) {
        const presetData = presets[name];
        if (!presetData) return;

        chrome.storage.local.set({ ...presetData, preset: name }, () => {
            // Update UI
            Object.keys(presetData).forEach(key => {
                if (elements[key]) {
                    elements[key].value = presetData[key];
                    if (valDisplays[key]) {
                        valDisplays[key].textContent = presetData[key];
                    }
                }
            });
            updatePresetButtons(name);
            
            // Notify content script
            notifyContentScript({ type: 'UPDATE_SETTINGS', settings: { ...presetData, preset: name } });
        });
    }

    function updatePresetButtons(activeName) {
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.classList.toggle('active', btn.id === `preset-${activeName}`);
        });
    }

    // Generate Button
    elements.generateBtn.addEventListener('click', () => {
        const key = elements.geminiKey.value;
        if (!key) {
            alert('Por favor, insira uma chave de API Gemini.');
            return;
        }
        
        chrome.storage.local.set({ geminiKey: key }, () => {
            notifyContentScript({ type: 'GENERATE_SUBTITLES' });
            window.close(); // Optional: close popup after clicking generate
        });
    });

    function notifyContentScript(message) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, message).catch(err => {
                    console.log('Content script not ready or not on YouTube');
                });
            }
        });
    }
});
