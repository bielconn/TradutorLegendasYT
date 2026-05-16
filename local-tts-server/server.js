const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3001;

// --- CONFIGURAÇÃO DO PIPER ---
// Altere os caminhos abaixo para os locais onde você salvou o modelo e o binário do Piper
const PIPER_CONFIG = {
    modelPath: path.join(__dirname, 'models', 'pt_BR-faber-medium.onnx'), // Exemplo de caminho
    piperBinary: 'piper', // Se estiver no seu PATH, apenas 'piper'. Caso contrário, use o caminho completo.
    outputDir: path.join(__dirname, 'audios')
};

app.use(cors());
app.use(bodyParser.json());
app.use('/audios', express.static(PIPER_CONFIG.outputDir));

// Garantir que a pasta de áudios existe
if (!fs.existsSync(PIPER_CONFIG.outputDir)) {
    fs.mkdirSync(PIPER_CONFIG.outputDir);
}

app.post('/generate', async (req, res) => {
    const { segments } = req.body;
    
    if (!segments || !Array.isArray(segments)) {
        return res.status(400).json({ error: 'Segmentos inválidos' });
    }

    console.log(`Recebido pedido para gerar ${segments.length} áudios...`);

    try {
        const results = [];
        
        for (const segment of segments) {
            const fileName = `${segment.id}.wav`;
            const filePath = path.join(PIPER_CONFIG.outputDir, fileName);
            
            // Limpeza básica do texto para o shell
            const cleanText = segment.text.replace(/"/g, '').replace(/`/g, '');
            
            // Comando Piper
            // echo "texto" | piper --model model.onnx --output_file output.wav
            const command = `echo "${cleanText}" | ${PIPER_CONFIG.piperBinary} --model "${PIPER_CONFIG.modelPath}" --output_file "${filePath}"`;
            
            await new Promise((resolve, reject) => {
                exec(command, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`Erro ao gerar áudio ${segment.id}:`, stderr);
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });

            results.push({
                id: segment.id,
                audioUrl: `http://localhost:${PORT}/audios/${fileName}`,
                start: segment.start,
                end: segment.end
            });
        }

        res.json({ audios: results });
    } catch (error) {
        console.error('Erro geral no servidor TTS:', error);
        res.status(500).json({ error: 'Falha ao gerar dublagem local. Verifique se o Piper está instalado e o modelo configurado.' });
    }
});

app.listen(PORT, () => {
    console.log(`
==================================================
   SERVIDOR TTS LOCAL (PIPER) RODANDO
   URL: http://localhost:${PORT}
==================================================
1. Certifique-se de que o Piper está instalado: pip install piper-tts
2. Configure o caminho do seu modelo .onnx no arquivo server.js
3. A extensão enviará as legendas para cá automaticamente.
==================================================
    `);
});
