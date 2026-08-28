# Auris

Captura áudio do sistema (loopback WASAPI no Windows, fonte `.monitor` do
PulseAudio/PipeWire no Linux) + microfone, transcreve via Whisper e envia
para o LLM com contexto jurídico brasileiro. Overlay sempre no topo, não
rouba foco.

Roda em Windows 10/11 e Linux.

Stack: Electron + Vite + React + Tailwind no front; Python sidecar com
`faster-whisper` + `soundcard` para captura/transcrição; Anthropic SDK no
processo principal.

## Pré-requisitos

- Windows 10/11 **ou** Linux com PulseAudio/PipeWire
- Node.js 20+
- Python 3.11+ (testado em 3.11 no Windows e 3.12 no Linux)
- Acesso ao proxy Auris (login Supabase) ou uma chave Groq própria

No Linux a captura de "áudio do sistema" usa a fonte `.monitor` que o
PulseAudio/PipeWire expõe para o sink padrão — o equivalente do loopback
WASAPI. Confirme que o servidor de áudio responde antes de começar:

```bash
pactl info                    # deve responder sem erro
pactl list short sources      # deve listar ao menos uma fonte `.monitor`
```

## Setup

### 1. Sidecar Python

**Windows:**

```pwsh
cd python-sidecar
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python auris_sidecar.py --diagnose   # confere se WASAPI e mic estão visíveis
```

**Linux:**

```bash
cd python-sidecar
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python auris_sidecar.py --diagnose   # lista monitores e mics
```

O `--diagnose` deve mostrar pelo menos uma linha marcada `[LOOPBACK]`. Se
não mostrar, o sidecar não tem o que capturar e o app vai reportar
`no_loopback`.

`faster-whisper` (no fim do `requirements.txt`) só é necessário para o
backend de transcrição **local**. Se você usa o proxy — o caminho padrão —
o import é lazy e pode ser omitido, o que economiza uns 700MB de
dependências (ctranslate2, av, tokenizers).

### 2. Aplicação Electron

```bash
npm install
npm run dev
```

A janela abre transparente, sempre no topo. Na primeira execução pede a
chave da API (validada com uma chamada-teste antes de salvar criptografada
via `safeStorage`).

## Arquitetura

```
Microfone + saída do sistema (WASAPI loopback)
        │
        ▼
Python sidecar  ──────────►  stdout JSON-line
(soundcard + webrtcvad +     {"type":"transcript", ...}
 faster-whisper base int8)
        │
        ▼
Electron main process
  • spawn supervisado do sidecar (auto-restart com backoff)
  • Anthropic SDK (claude-sonnet-4-6, streaming, prompt cache)
  • API key cifrada via safeStorage
        │  IPC via preload contextBridge
        ▼
Renderer React + Tailwind
  • Overlay com TopBar + TranscriptArea + ResponseCard
  • frame-less, transparente, draggable, always-on-top
  • CSP estrita, nodeIntegration:false, sandbox:true
```

## Arquivos importantes

| Caminho | Papel |
|---|---|
| `python-sidecar/auris_sidecar.py` | Entry-point do sidecar |
| `python-sidecar/audio.py` | Captura + mixer (mic + WASAPI loopback) |
| `python-sidecar/transcribe.py` | Whisper + VAD + worker thread |
| `electron/main/index.ts` | Lifecycle, CSP, registro IPC |
| `electron/main/sidecar.ts` | Spawn supervisado do Python |
| `electron/main/claude.ts` | Anthropic streaming, prompt caching, debounce |
| `electron/main/secrets.ts` | safeStorage para API key |
| `electron/preload/index.ts` | contextBridge — única ponte renderer↔main |
| `src/App.tsx` | Composição da overlay |
| `src/components/Overlay.tsx` | Janela principal (TopBar + Transcript + Response) |
| `src/components/ApiKeySetup.tsx` | Tela de setup da chave |
| `src/components/logo/AurisLogo.tsx` | SVG completo animado |
| `src/components/logo/AurisIconMark.tsx` | SVG compacto (topbar) |

## Notas de segurança

- `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` em
  todas as `webPreferences`.
- O renderer só conhece `window.auris.*` — não tem acesso a `require`,
  `process`, ao SDK Anthropic, nem ao filesystem.
- API key cifrada com a API segura do Windows (DPAPI via `safeStorage`).
- CSP aplicada em duas camadas: `<meta>` no `index.html` e header injetado
  via `session.defaultSession.webRequest.onHeadersReceived`.
- Sidecar Python spawnado com `shell: false` (sem interpolação de shell).

## Limitações conhecidas e próximos passos

- **Tray icon**: o ícone padrão é vazio (sem PNG); funciona mas é
  invisível. Adicionar `resources/tray-icon.png` 32×32 para uso real.
- **Empacotamento**: configurado para Windows (NSIS) e Linux (AppImage).
  PyInstaller não faz cross-compile, então cada instalador precisa ser
  gerado no seu próprio sistema:

  ```bash
  npm run package        # sidecar + app, para o SO atual
  ```

  Saída em `release/`: `Auris-Setup-<versão>.exe` no Windows,
  `Auris-<versão>-x64.AppImage` no Linux. Para gerar um `.deb` também,
  acrescente `"deb"` ao array `build.linux.target` no `package.json` (exige
  `dpkg` e `fakeroot` instalados).

  Em dev mode o sidecar roda direto via `python-sidecar/.venv`, sem
  PyInstaller.
- **Validação manual end-to-end**: requer falar PT-BR no mic + estar logado
  (ou ter chave Groq configurada).
- **Auto-update no Linux**: `electron-updater` só sabe atualizar o formato
  AppImage. Um `.deb` instalado não se atualiza sozinho.
- **`setContentProtection` no Linux**: é no-op. A opção de esconder a
  overlay de compartilhamento de tela só tem efeito no Windows.
