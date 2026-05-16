// Configuração e Estado
let settings = {};
let styleTag = null;
let dubbingEvents = [];
let audioMap = new Map();
let currentAudio = null;
let isDubbingActive = false;

// Inicialização
chrome.storage.local.get(null, (data) => {
    settings = data;
    if (settings.showButtons !== false) injectButtons();
    updateNativeStyles();
});

// Listener de Mensagens
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'UPDATE_SETTINGS') {
        settings = { ...settings, ...message.settings };
        updateNativeStyles();
    } else if (message.type === 'START_PIPER_DUBBING') {
        startPiperDubbing();
    }
});

function injectButtons() {
    if (document.getElementById('gemini-trans-buttons')) return;
    const player = document.querySelector('.html5-video-player');
    if (!player) { setTimeout(injectButtons, 1000); return; }

    const container = document.createElement('div');
    container.id = 'gemini-trans-buttons';
    container.style.cssText = `position: absolute; top: 20px; left: 20px; z-index: 1000; display: flex; gap: 10px; pointer-events: auto;`;

    const btnDub = createButton('🎙️ Dublar Áudio', 'icon-dub');
    btnDub.onclick = () => startPiperDubbing();

    container.appendChild(btnDub);
    player.appendChild(container);
}

function createButton(text) {
    const btn = document.createElement('button');
    btn.className = 'gemini-trans-btn';
    btn.innerHTML = `<span>${text}</span>`;
    btn.style.cssText = `background: rgba(0, 0, 0, 0.6); color: white; border: 1px solid rgba(255, 255, 255, 0.2); padding: 6px 12px; border-radius: 20px; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; backdrop-filter: blur(4px); transition: all 0.2s;`;
    btn.onmouseover = () => btn.style.background = 'rgba(204, 0, 0, 0.8)';
    btn.onmouseout = () => btn.style.background = 'rgba(0, 0, 0, 0.6)';
    return btn;
}

// --- LÓGICA DE DUBLAGEM PIPER ---

async function startPiperDubbing() {
    const videoId = new URLSearchParams(window.location.search).get('v');
    if (!videoId) return;

    console.log('Iniciando Dublagem Piper Local...');
    
    try {
        // 1. Capturar legendas (Transcript)
        const events = await fetchTranscript(videoId);
        if (!events) { alert('Legendas não encontradas para este vídeo.'); return; }

        // 2. Humanizar e preparar segmentos
        const segments = events
            .filter(e => e.segs)
            .map((e, index) => ({
                id: `seg_${index}`,
                text: humanizeText(e.segs.map(s => s.utf8).join('')),
                start: e.tStartMs / 1000,
                end: (e.tStartMs + (e.dDurationMs || 3000)) / 1000
            }))
            .filter(s => s.text.length > 1);

        // 3. Enviar para o servidor local
        const response = await fetch(`${settings.ttsServerUrl}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ segments: segments.slice(0, 50) }) // Limitamos os primeiros 50 para teste rápido
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error);

        // 4. Mapear áudios recebidos
        data.audios.forEach(audio => {
            audioMap.set(Math.floor(audio.start), audio);
        });

        dubbingEvents = segments;
        isDubbingActive = true;
        
        // 5. Iniciar Sincronização
        setupSync();
        alert('Dublagem Piper pronta e sincronizada!');

    } catch (e) {
        console.error('Erro na dublagem Piper:', e);
        alert('Erro ao conectar com servidor local Piper. Certifique-se de que o servidor Node.js está rodando na porta 3001.');
    }
}

function humanizeText(text) {
    return text
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '') // Remove emojis
        .replace(/\n/g, ' ') // Remove quebras de linha
        .replace(/\s+/g, ' ') // Remove espaços duplos
        .trim();
}

function setupSync() {
    const video = document.querySelector('video');
    if (!video) return;

    video.addEventListener('timeupdate', () => {
        if (!isDubbingActive) return;

        const currentTime = Math.floor(video.currentTime);
        const audioData = audioMap.get(currentTime);

        if (audioData && !audioData.played) {
            playAudio(audioData);
            audioData.played = true;
        }
    });

    // Resetar se o usuário voltar o vídeo
    video.addEventListener('seeked', () => {
        audioMap.forEach(audio => audio.played = false);
    });

    // Pausar/Retomar
    video.addEventListener('pause', () => currentAudio?.pause());
    video.addEventListener('play', () => {
        if (video.currentTime >= (currentAudio?.currentTime || 0)) {
            currentAudio?.play();
        }
    });
}

function playAudio(audioData) {
    if (currentAudio) currentAudio.pause();

    const video = document.querySelector('video');
    const originalVol = video.volume;

    if (settings.reduceOriginal) video.volume = originalVol * 0.2;

    currentAudio = new Audio(audioData.audioUrl);
    currentAudio.volume = (settings.dubVolume || 80) / 100;
    
    currentAudio.play();
    
    currentAudio.onended = () => {
        if (settings.reduceOriginal) video.volume = originalVol;
    };
}

async function fetchTranscript(videoId) {
    try {
        const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
        const html = await response.text();
        const captionsMatch = html.match(/"captionTracks":\[(.*?)\]/);
        if (!captionsMatch) return null;
        const captionTracks = JSON.parse(`[${captionsMatch[1]}]`);
        const track = captionTracks.find(t => t.languageCode === 'en') || captionTracks.find(t => t.languageCode === 'pt') || captionTracks[0];
        const subResponse = await fetch(track.baseUrl + '&fmt=json3');
        return (await subResponse.json()).events;
    } catch (e) { return null; }
}

function updateNativeStyles() {
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'gemini-native-styles';
        document.head.appendChild(styleTag);
    }
    const s = settings;
    if (!s.fontColor) return;
    const glowColor = `rgba(0, 0, 0, ${s.glowOpacity / 100})`;
    styleTag.innerHTML = `
        .ytp-caption-window-container .ytp-caption-segment {
            background: transparent !important; box-shadow: none !important;
            font-family: "${s.fontFamily}", sans-serif !important; font-size: ${s.fontSize}px !important;
            color: ${s.fontColor} !important; line-height: ${s.lineHeight} !important;
            letter-spacing: ${s.letterSpacing}px !important; font-weight: 700 !important;
            text-align: center !important; display: inline-block !important;
            text-shadow: ${s.shadowX}px ${s.shadowY}px ${s.shadowBlur}px rgba(0,0,0,0.8), 0 0 ${s.glowSize}px ${glowColor} !important;
            -webkit-text-stroke: ${s.strokeWidth}px black !important; paint-order: stroke fill !important;
            white-space: pre-wrap !important;
        }
        .ytp-caption-window-container .caption-window {
            background: transparent !important; bottom: ${s.verticalPos}% !important;
            margin-bottom: 5px !important; width: 100% !important; left: 0 !important; right: 0 !important;
            display: flex !important; justify-content: center !important; align-items: center !important;
        }
        .html5-video-player.ytp-autohide #gemini-trans-buttons { opacity: 0 !important; pointer-events: none !important; transition: opacity 0.2s !important; }
        #gemini-trans-buttons { transition: opacity 0.2s !important; }
    `;
}

// Observe for page changes
let lastUrl = location.href;
new MutationObserver(() => {
    if (location.href !== lastUrl) {
        lastUrl = location.href;
        if (location.href.includes('watch')) setTimeout(injectButtons, 2000);
    }
}).observe(document, { subtree: true, childList: true });
