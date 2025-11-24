
# Tabular Review for Bulk Document Analysis

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/framework-React-61DAFB.svg)
![AI](https://img.shields.io/badge/AI-OpenAI%20Standard-412991.svg)

An AI-powered document review workspace that transforms unstructured legal contracts into structured, queryable datasets. Designed for legal professionals, auditors, and procurement teams to accelerate due diligence and contract analysis.

## 🚀 Features

- **AI-Powered Extraction**: Automatically extract key clauses, dates, amounts, and entities from PDFs using OpenAI-compatible API (supports GPT, Claude, Gemini, Mistral models).
- **High-Fidelity Conversion**: Uses **Docling** (running locally) to convert PDFs and DOCX files to clean Markdown text, preserving formatting and structure without hallucination.
- **Dynamic Schema**: Define columns with natural language prompts (e.g., "What is the governing law?").
- **Verification & Citations**: Click any extracted cell to view the exact source quote highlighted in the original document.
- **Spreadsheet Interface**: A high-density, Excel-like grid for managing bulk document reviews.
- **Integrated Chat Analyst**: Ask questions across your entire dataset (e.g., "Which contract has the most favorable MFN clause?").

## 🎬 Demo

https://github.com/user-attachments/assets/b63026d8-3df6-48a8-bb4b-eb8f24d3a1ca

## 🛠 Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **AI Integration**: OpenAI-compatible API (supports GPT 4o, GPT 5, GPT o3, Claude, Gemini, Mistral models)

## 📦 Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/tabular-review.git
cd tabular-review
```

### 2. Setup Frontend
Install Node dependencies:
```bash
pnpm install
```

Create a `.env.local` file in the root directory for your OpenAI API Key:
```env
VITE_OPENAI_API_KEY=your_openai_api_key_here
VITE_OPENAI_API_BASE_URL=https://api.openai.com/v1
```

**Note**: If you're using a different API provider (like OpenRouter), set `VITE_OPENAI_API_BASE_URL` to their endpoint URL.

### 3. Setup Backend (Docling)
The backend is required for document conversion.

```bash
cd server
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 4. Run
Start the backend (in one terminal):
```bash
cd server
source venv/bin/activate
python main.py
```

Start the frontend (in another terminal):
```bash
pnpm dev
```

## 🐳 Docker Setup

### Voraussetzungen
- Docker und Docker Compose müssen installiert sein

### Mit Docker Compose starten

1. Erstelle eine `.env` Datei im Root-Verzeichnis mit deinem OpenAI API Key:
```env
VITE_OPENAI_API_KEY=your_openai_api_key_here
VITE_OPENAI_API_BASE_URL=https://api.openai.com/v1
```

**Hinweis**: Wenn Sie einen anderen API-Provider verwenden (z.B. OpenRouter), setzen Sie `VITE_OPENAI_API_BASE_URL` auf deren Endpoint-URL.

2. Starte beide Services mit Docker Compose:
```bash
docker-compose up --build
```

3. Die Anwendung ist verfügbar unter:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000

### Docker Compose Befehle

- Services im Hintergrund starten: `docker-compose up -d`
- Services stoppen: `docker-compose down`
- Logs anzeigen: `docker-compose logs -f`
- Services neu bauen: `docker-compose up --build`
- Nur Frontend neu bauen: `docker-compose build frontend`
- Nur Backend neu bauen: `docker-compose build backend`

### Entwicklung mit Docker

Für die Entwicklung können Sie auch Volumes nutzen, um Code-Änderungen ohne Neubau zu sehen. Die `docker-compose.yml` ist bereits so konfiguriert, dass das Backend-Verzeichnis als Volume gemountet ist.

## 🛡 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Disclaimer**: This tool is an AI assistant and should not be used as a substitute for professional legal advice. Always verify AI-generated results against the original documents.
