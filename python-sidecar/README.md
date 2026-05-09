# Auris Python Sidecar

Captura áudio do microfone + áudio do sistema (WASAPI loopback) simultaneamente,
roda transcrição em tempo real com `faster-whisper`, e emite eventos JSON pelo stdout.

## Setup (Windows, PowerShell)

```pwsh
cd c:\Users\Allison\Documents\AURIS\python-sidecar
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install --upgrade pip
pip install -r requirements.txt
```

## Uso standalone

### Diagnóstico de áudio
```pwsh
python auris_sidecar.py --diagnose
```
Imprime no stderr todos os host APIs e dispositivos. Confirme que existe
`Windows WASAPI` com `default_output_device` válido.

### Transcrição ao vivo
```pwsh
python auris_sidecar.py
```
Cada linha do stdout é um JSON, por exemplo:
```json
{"type": "ready", "ts": 1731234567.12, "model": "base"}
{"type": "transcript", "ts": 1731234570.45, "text": "olá teste", "final": false}
{"type": "transcript", "ts": 1731234572.10, "text": "olá teste um dois três", "final": true}
```

### Modelo alternativo
```pwsh
python auris_sidecar.py --model tiny    # mais rápido, menor qualidade
python auris_sidecar.py --model small   # mais preciso, ~3× mais lento
```

## Códigos de saída

| Code | Significado |
|------|-------------|
| 0 | Saída limpa |
| 2 | Sem permissão de áudio (microfone bloqueado pelo Windows) |
| 3 | Erro de runtime (modelo, captura, etc.) |

## Eventos no stdout

| `type` | Campos extras | Quando |
|--------|---------------|--------|
| `ready` | `model` | Após carregar o modelo Whisper |
| `transcript` | `text`, `final` | Parcial a cada ~800ms; final após silêncio |
| `error` | `code`, `message` | Falha recuperável ou fatal |
| `stopped` | — | Pouco antes de sair |

## Encerramento

Ctrl+C no terminal (SIGINT) ou kill (SIGTERM) — o sidecar fecha as streams
e imprime `{"type":"stopped"}` antes de retornar.
