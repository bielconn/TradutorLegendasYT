# Configurao da Dublagem Local com Piper TTS

Este projeto usa o **Piper TTS** para gerar dublagem gratuita e local sem depender de APIs pagas.

## 1. Requisitos
- **Python 3.x** instalado.
- **Node.js** instalado.

## 2. Instalao do Piper
Abra o terminal e execute:
```bash
pip install piper-tts
```

## 3. Baixar uma Voz em Portugus (PT-BR)
Você precisa de um modelo `.onnx` e um arquivo `.json`.
Baixe aqui: [Piper Voices (HuggingFace)](https://huggingface.co/rhasspy/piper-voices/tree/v1.0.0/pt_BR)

Sugesto: `pt_BR-faber-medium.onnx` e `pt_BR-faber-medium.onnx.json`.

Coloque esses arquivos na pasta:
`local-tts-server/models/`

## 4. Configurar o Servidor
Abra o arquivo `local-tts-server/server.js` e ajuste o caminho da voz na constante `PIPER_CONFIG`:

```javascript
const PIPER_CONFIG = {
    modelPath: path.join(__dirname, 'models', 'pt_BR-faber-medium.onnx'),
    piperBinary: 'piper', // ou o caminho completo para o piper.exe
    outputDir: path.join(__dirname, 'audios')
};
```

## 5. Iniciar o Servidor
Na pasta `local-tts-server`, execute:
```bash
npm install
node server.js
```

Ou use o arquivo `start-server.bat` na raiz do projeto.

## 6. Na Extenso
1. Carregue a extenso no Chrome (`chrome://extensions`).
2. Abra o popup.
3. Verifique se o status diz: **Servidor Local: Online**.
4. Clique em **Dublar udio (Piper)** no YouTube.

---
**Nota:** O Piper gera o udio a partir do texto das legendas. A primeira gerao pode demorar alguns segundos dependendo do seu hardware.
