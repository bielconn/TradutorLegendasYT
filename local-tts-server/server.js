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

// Teste de Sanidade: Verificar se o Piper está no PATH
exec(`${PIPER_CONFIG.piperBinary} --version`, (err, stdout) => {
    if (err) {
        console.warn('⚠️ AVISO: Comando "piper" não encontrado no seu sistema.');
        console.warn('Certifique-se de que rodou: pip install piper-tts');
        console.warn('Se o erro persistir, coloque o caminho completo do piper.exe no server.js');
    } else {
        console.log('✅ Piper TTS detectado com sucesso!');
    }
});

app.post('/generate', async (req, res) => {
    const { segments } = req.body;
    
    if (!segments || !Array.isArray(segments)) {
        return res.status(400).json({ error: 'Segmentos inválidos' });
    }

    console.log(`\n--- Nova geração iniciada: ${segments.length} segmentos ---`);

    try {
        const results = [];
        
        for (const segment of segments) {
            const fileName = `${segment.id}.wav`;
            const filePath = path.join(PIPER_CONFIG.outputDir, fileName);
            
            // Pular se o áudio já existir (cache)
            if (fs.existsSync(filePath)) {
                results.push({
                    id: segment.id,
                    audioUrl: `http://localhost:${PORT}/audios/${fileName}`,
                    start: segment.start,
                    end: segment.end
                });
                continue;
            }

            // Limpeza do texto
            const cleanText = segment.text.replace(/["\\]/g, ''); 
            
            // Comando mais seguro para Windows
            // Usando aspas duplas no texto e escapando se necessário
            const command = `echo ${cleanText} | ${PIPER_CONFIG.piperBinary} --model "${PIPER_CONFIG.modelPath}" --output_file "${filePath}"`;
            
            console.log(`Gerando [${segment.id}]: "${cleanText.substring(0, 30)}..."`);

            await new Promise((resolve, reject) => {
                exec(command, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`❌ Erro no Piper para [${segment.id}]:`, stderr);
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

        console.log('✅ Todos os áudios gerados com sucesso!');
        res.json({ audios: results });
    } catch (error) {
        console.error('❌ Falha crítica na geração:', error);
        res.status(500).json({ error: 'Erro ao gerar áudio com Piper. Verifique o console do servidor.' });
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
