# Auris

Captura áudio do
sistema (WASAPI loopback) + microfone, transcreve com `faster-whisper`
localmente, e envia para Claude (Anthropic) com contexto jurídico
brasileiro. Overlay sempre no topo, não rouba foco.

Stack: Electron + Vite + React + Tailwind no front; Python sidecar com
`faster-whisper` + `soundcard` para captura/transcrição; Anthropic SDK no
processo principal.

## Pré-requisitos

- Windows 10/11
- Node.js 20+
- Python 3.11 (já instalado)
- Chave da API Anthropic (`sk-ant-...`)

## Setup

### 1. Sidecar Python

```pwsh
cd python-sidecar
.\.venv\Scripts\Activate.ps1   # já criado durante o setup inicial
python auris_sidecar.py --diagnose   # confere se WASAPI e mic estão visíveis
```

Se você quiser recriar do zero:

```pwsh
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 2. Aplicação Electron

```pwsh
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
- **Empacotamento**: Phase 6 (PyInstaller + electron-builder) ainda não
  configurado. Em dev mode o sidecar roda direto via `python-sidecar/.venv`.
- **Validação manual end-to-end**: requer falar PT-BR no mic + ter chave
  Claude válida configurada.
