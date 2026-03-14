# DVR Proxy API

REST API em Node.js + TypeScript para expor dados de câmeras de um sistema DVR. Faz proxy de imagens e streams em tempo real, indexa gravações em SQLite e permite extrair frames de horários específicos.

Projeto criado para permitir acesso do OpenClaw ao sistema de cameras interno usando ClaudFlare Tunels

## Funcionalidades

- **Snapshot** — imagem JPEG em tempo real de qualquer câmera
- **Stream** — stream MJPEG ao vivo
- **Gravações** — lista indexada em SQLite com varredura automática na inicialização
- **Watcher** — detecta novos arquivos adicionados às pastas de gravação em tempo real
- **Frames** — extrai um frame de um horário e data específicos via ffmpeg

## Requisitos

- Node.js 18+
- ffmpeg instalado e disponível no PATH

## Instalação

```bash
npm install
```

## Configuração

Copie o arquivo de exemplo e ajuste as variáveis:

```bash
cp .env.example .env
```

**.env**

```env
PORT=3000
DVR_BASE_URL=http://192.168.68.129:8090
DB_PATH=./dvr.db
RECORDINGS_BASE_PATH=C:/recordings
```

**cameras.json** — defina as câmeras do sistema (use o exemplo como base):

```bash
cp cameras.example.json cameras.json
```

```json
[
  {
    "id": "1",
    "name": "Garagem",
    "description": "Descrição da câmera",
    "recordFolder": "cam1"
  }
]
```

O campo `recordFolder` é relativo ao `RECORDINGS_BASE_PATH` definido no `.env`. Caminhos absolutos também são aceitos.

## Executar

```bash
# Desenvolvimento (hot reload)
npm run dev

# Produção
npm run build
npm start
```

Na inicialização, o servidor varre todas as pastas de gravação e indexa os arquivos de vídeo no SQLite. Novos arquivos são detectados automaticamente via watcher.

## Endpoints

| Método | Rota                                | Descrição                             |
| ------ | ----------------------------------- | ------------------------------------- |
| `GET`  | `/cameras`                          | Lista todas as câmeras configuradas   |
| `GET`  | `/cameras/:id/snapshot`             | Retorna imagem JPEG em tempo real     |
| `GET`  | `/cameras/:id/stream`               | Stream MJPEG ao vivo                  |
| `GET`  | `/cameras/:id/recordings`           | Lista gravações indexadas no SQLite   |
| `GET`  | `/cameras/:id/recordings/:filename` | Retorna o arquivo de vídeo            |
| `GET`  | `/cameras/:id/frames?date=&time=`   | Extrai frame de um horário específico |
| `GET`  | `/health`                           | Status da API                         |

### Parâmetros de query — `/recordings`

| Parâmetro | Formato      | Descrição                     |
| --------- | ------------ | ----------------------------- |
| `date`    | `YYYY-MM-DD` | Filtra gravações por data     |
| `page`    | número       | Paginação (padrão: 1)         |
| `limit`   | número       | Itens por página (padrão: 50) |

### Parâmetros de query — `/frames`

| Parâmetro | Formato      | Descrição        |
| --------- | ------------ | ---------------- |
| `date`    | `YYYY-MM-DD` | Data do frame    |
| `time`    | `HH:MM:SS`   | Horário do frame |

## Formatos de nome de arquivo suportados

O sistema tenta extrair a data/hora de gravação a partir do nome do arquivo. Padrões reconhecidos:

- `20240115_143000.mp4`
- `2024-01-15_14-30-00.mp4`
- `20240115143000.mp4`

Se nenhum padrão for reconhecido, usa a data de modificação do arquivo como fallback.

## Estrutura do projeto

```
src/
├── index.ts                    # Entry point
├── types/camera.ts             # Interfaces TypeScript
├── config/cameras.ts           # Carrega e resolve cameras.json
├── database/db.ts              # Inicialização do SQLite
├── routes/cameras.ts           # Definição de rotas
├── controllers/
│   └── cameraController.ts    # Handlers das rotas
└── services/
    ├── proxyService.ts         # Proxy para o DVR
    ├── recordingService.ts     # Operações no SQLite
    ├── scanService.ts          # Varredura inicial das pastas
    ├── watcherService.ts       # Watcher de novos arquivos
    └── frameService.ts         # Extração de frames via ffmpeg
```
