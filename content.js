// Settings and State
let settings = {};
let styleTag = null;

// Initialize
chrome.storage.local.get(null, (data) => {
    settings = data;
    if (settings.showButtons !== false) {
        injectButtons();
    }
    updateNativeStyles();
});

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'UPDATE_SETTINGS') {
        settings = { ...settings, ...message.settings };
        if (settings.showButtons) {
            injectButtons();
        } else {
            removeButtons();
        }
        updateNativeStyles();
    } else if (message.type === 'GENERATE_SUBTITLES') {
        // This is triggered by the popup's "Gerar Legendas" button
        activateNativeSubtitles('video', true);
    }
});

function injectButtons() {
    if (document.getElementById('gemini-trans-buttons')) return;

    const player = document.querySelector('.html5-video-player');
    if (!player) {
        setTimeout(injectButtons, 1000);
        return;
    }

    const container = document.createElement('div');
    container.id = 'gemini-trans-buttons';
    container.style.cssText = `
        position: absolute;
        top: 20px;
        left: 20px;
        z-index: 1000;
        display: flex;
        gap: 10px;
        pointer-events: auto;
    `;

    const btnVideo = createButton('<span style="background:#fff;color:#000;padding:0 2px;border-radius:2px;font-size:10px;margin-right:4px;">BR</span> Traduzir Vídeo', 'icon-video');
    const btnAudio = createButton('🎧 Traduzir Áudio', 'icon-audio');

    btnVideo.onclick = () => activateNativeSubtitles('video', false);
    btnAudio.onclick = () => activateNativeSubtitles('audio', false);

    container.appendChild(btnVideo);
    container.appendChild(btnAudio);
    player.appendChild(container);
}

function createButton(text, iconClass) {
    const btn = document.createElement('button');
    btn.className = 'gemini-trans-btn';
    btn.innerHTML = `<span>${text}</span>`;
    btn.style.cssText = `
        background: rgba(0, 0, 0, 0.6);
        color: white;
        border: 1px solid rgba(255, 255, 255, 0.2);
        padding: 6px 12px;
        border-radius: 20px;
        font-family: 'Outfit', sans-serif;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        backdrop-filter: blur(4px);
        transition: all 0.2s;
    `;
    btn.onmouseover = () => btn.style.background = 'rgba(204, 0, 0, 0.8)';
    btn.onmouseout = () => btn.style.background = 'rgba(0, 0, 0, 0.6)';
    return btn;
}

function removeButtons() {
    const el = document.getElementById('gemini-trans-buttons');
    if (el) el.remove();
}

// --- Automation Logic ---

// Dubbing State
let dubbingCache = new Map();
let currentAudio = null;
let isDubbingActive = false;

// ... (previous functions: injectButtons, createButton, removeButtons)

// --- Automation & Dubbing Logic ---

async function activateNativeSubtitles(mode, showNotification = false) {
    console.log('Iniciando automação de legendas...');
    
    // 1. Native Subtitles (Visuals)
    const video = document.querySelector('video');
    if (video) {
        const subBtn = document.querySelector('.ytp-subtitles-button');
        if (subBtn && subBtn.getAttribute('aria-pressed') === 'false') {
            subBtn.click();
        }
    }

    const settingsBtn = document.querySelector('.ytp-settings-button');
    if (settingsBtn) {
        settingsBtn.click();
        await sleep(300);
        const menuItems = document.querySelectorAll('.ytp-menuitem');
        let subMenu = Array.from(menuItems).find(i => i.textContent.includes('Legendas') || i.textContent.includes('Subtitles'));
        
        if (subMenu) {
            subMenu.click();
            await sleep(300);
            const subOptions = document.querySelectorAll('.ytp-menuitem');
            let ptOption = Array.from(subOptions).find(i => i.textContent.includes('Português'));

            if (ptOption) {
                ptOption.click();
                if (showNotification) showSuccessNotification();
            } else {
                let autoTrans = Array.from(subOptions).find(i => i.textContent.includes('Tradução automática') || i.textContent.includes('Auto-translate'));
                if (autoTrans) {
                    autoTrans.click();
                    await sleep(500);
                    const langOptions = document.querySelectorAll('.ytp-menuitem');
                    let ptAuto = Array.from(langOptions).find(i => i.textContent.trim() === 'Português');
                    if (ptAuto) {
                        ptAuto.click();
                        if (showNotification) showSuccessNotification();
                    }
                }
            }
        }
        if (document.querySelector('.ytp-settings-menu[style*="display: block"]')) {
            settingsBtn.click();
        }
    }

    // 2. IA Dubbing (Audio)
    if (settings.enableDubbing && settings.elevenKey) {
        startIADubbing();
    }
}

async function startIADubbing() {
    const videoId = new URLSearchParams(window.location.search).get('v');
    if (!videoId || isDubbingActive) return;

    isDubbingActive = true;
    console.log('Iniciando Dublagem IA...');

    try {
        const events = await fetchTranscript(videoId);
        if (!events) return;

        // Sync audio with video time
        const video = document.querySelector('video');
        video.addEventListener('timeupdate', async () => {
            if (!settings.enableDubbing) return;

            const currentTime = video.currentTime * 1000;
            const event = events.find(e => currentTime >= e.tStartMs && currentTime <= (e.tStartMs + 2000));

            if (event && event.segs && !dubbingCache.has(event.tStartMs)) {
                const text = event.segs.map(s => s.utf8).join('');
                if (text.trim().length < 2) return;

                // Mark as processing to avoid duplicate calls
                dubbingCache.set(event.tStartMs, 'processing');
                
                // 1. Translate Segment
                const translated = await translateText(text);
                
                // 2. Generate Audio (ElevenLabs)
                const audioUrl = await generateElevenLabsAudio(translated);
                if (audioUrl) {
                    dubbingCache.set(event.tStartMs, audioUrl);
                }
            }

            // Play buffered audio
            const readyAudioUrl = dubbingCache.get(Math.floor(currentTime / 1000) * 1000); // Rough sync
            if (readyAudioUrl && typeof readyAudioUrl === 'string' && readyAudioUrl !== 'processing') {
                playDubbing(readyAudioUrl);
                dubbingCache.delete(Math.floor(currentTime / 1000) * 1000); // Play once
            }
        });

    } catch (e) {
        console.error('Erro na dublagem:', e);
        isDubbingActive = false;
    }
}

async function translateText(text) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${settings.geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: `Traduza para dublagem em PT-BR (natural): ${text}` }] }]
        })
    });
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

async function generateElevenLabsAudio(text) {
    try {
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${settings.elevenVoice}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'xi-api-key': settings.elevenKey
            },
            body: JSON.stringify({
                text: text,
                model_id: "eleven_multilingual_v2",
                voice_settings: { stability: 0.5, similarity_boost: 0.75 }
            })
        });
        const blob = await response.blob();
        return URL.createObjectURL(blob);
    } catch (e) {
        return null;
    }
}

function playDubbing(url) {
    if (currentAudio) currentAudio.pause();
    
    const video = document.querySelector('video');
    const originalVolume = video.volume;
    
    // Ducking effect
    video.volume = originalVolume * 0.2;
    
    currentAudio = new Audio(url);
    currentAudio.play();
    
    currentAudio.onended = () => {
        video.volume = originalVolume;
    };
}

async function fetchTranscript(videoId) {
    try {
        const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
        const html = await response.text();
        const captionsMatch = html.match(/"captionTracks":\[(.*?)\]/);
        if (!captionsMatch) return null;
        const captionTracks = JSON.parse(`[${captionsMatch[1]}]`);
        const track = captionTracks.find(t => t.languageCode === 'en') || captionTracks[0];
        const subResponse = await fetch(track.baseUrl + '&fmt=json3');
        const subData = await subResponse.json();
        return subData.events;
    } catch (e) { return null; }
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function showSuccessNotification() {
    alert('Legendas e Dublagem IA ativadas!');
}

// --- Native Styling Logic ---
// ... (updateNativeStyles function remains the same)

// --- Native Styling Logic ---

function updateNativeStyles() {
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'gemini-native-styles';
        document.head.appendChild(styleTag);
    }

    const s = settings;
    if (!s.fontColor) return; // Wait for settings

    const glowColor = `rgba(0, 0, 0, ${s.glowOpacity / 100})`;
    
    // Target both the segments and the window background
    const css = `
        /* Hide original background and window styles */
        .ytp-caption-window-container .ytp-caption-segment {
            background: transparent !important;
            box-shadow: none !important;
            font-family: "${s.fontFamily}", "Outfit", sans-serif !important;
            font-size: ${s.fontSize}px !important;
            color: ${s.fontColor} !important;
            line-height: ${s.lineHeight} !important;
            letter-spacing: ${s.letterSpacing}px !important;
            font-weight: 700 !important;
            text-align: center !important;
            display: inline-block !important;
            text-shadow: 
                ${s.shadowX}px ${s.shadowY}px ${s.shadowBlur}px rgba(0,0,0,0.8),
                0 0 ${s.glowSize}px ${glowColor} !important;
            -webkit-text-stroke: ${s.strokeWidth}px black !important;
            paint-order: stroke fill !important;
            white-space: pre-wrap !important;
        }

        .ytp-caption-window-container .caption-window {
            background: transparent !important;
            bottom: ${s.verticalPos}% !important;
            margin-bottom: 5px !important;
            width: 100% !important;
            left: 0 !important;
            right: 0 !important;
            margin-left: 0 !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            text-align: center !important;
        }
        
        /* Force container to ignore YouTube's internal positioning */
        .ytp-caption-window-container {
            display: flex !important;
            justify-content: center !important;
            width: 100% !important;
            left: 0 !important;
        }
        
        /* Ensure subtitles are visible even if YouTube tries to hide them */
        .ytp-subtitles-button[aria-pressed="false"] + .ytp-caption-window-container {
            display: none !important;
        }

        /* Auto-hide buttons with controls */
        .html5-video-player.ytp-autohide #gemini-trans-buttons {
            opacity: 0 !important;
            pointer-events: none !important;
            transition: opacity 0.2s cubic-bezier(0.4, 0.0, 1, 1) !important;
        }

        #gemini-trans-buttons {
            transition: opacity 0.2s cubic-bezier(0.0, 0.0, 0.2, 1) !important;
        }
    `;
    
    styleTag.innerHTML = css;
}

// Observe for page changes (YouTube is a SPA)
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        if (url.includes('watch')) {
            setTimeout(injectButtons, 2000);
        }
    }
}).observe(document, { subtree: true, childList: true });
