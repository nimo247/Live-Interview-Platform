# 💻 Live Interview Platform

A real-time technical interview platform built with **Next.js**, **FastAPI**, **WebRTC**, and **Socket.IO**. Supports live video calls, synchronized code editing, collaborative whiteboard, and AI-powered code feedback.

---

## ✨ Features

- 🎥 **Real-time Video Call** — Peer-to-peer video using WebRTC (SimplePeer)
- 💻 **Synchronized Code Editor** — Monaco Editor with live sync across both participants
- 🎨 **Collaborative Whiteboard** — Draw together in real-time with color & brush controls
- 🤖 **AI Code Feedback** — Instant code review powered by Llama 3.3 via Groq API
- 🔒 **1-on-1 Rooms** — Private interview rooms with a 2-person capacity limit
- 🌐 **Multi-language Support** — JavaScript, TypeScript, Python, Java, C++, Go

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TailwindCSS, Monaco Editor, SimplePeer |
| Backend | FastAPI, Python-SocketIO, Uvicorn |
| Real-time | Socket.IO (code sync, whiteboard, signaling) |
| Video | WebRTC via SimplePeer |
| AI | Groq API — Llama 3.3 70B Versatile |

---

## 📁 Project Structure

```
LiveInterviewPlatform/
├── frontend/                  # Next.js app
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx       # Home — create/join room
│   │   │   └── room/[roomId]/
│   │   │       └── page.tsx   # Room — all features
│   │   └── lib/
│   │       └── socket.ts      # Socket.IO client singleton
│   └── package.json
└── backend/                   # FastAPI server
    ├── app/
    │   ├── main.py            # Socket.IO events + FastAPI app
    │   └── routers/
    │       └── rooms.py       # REST endpoints + AI feedback
    ├── .env                   # API keys (never commit this)
    └── requirements.txt
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js v18+
- Python 3.10+
- A [Groq API key](https://console.groq.com)

---

### Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Create .env file
echo GROQ_API_KEY=your_key_here > .env

# Start server
uvicorn app.main:socket_app --reload --port 8000 --host 0.0.0.0
```

---

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

