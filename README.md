# PolyMarket Pro Dashboard

A custom dashboard for monitoring and interacting with Polymarket positions.

<img src="https://github.com/user-attachments/assets/5d093963-3e5f-4fdf-ac64-410740ccccd7" width="50%" alt="PolyMarket Pro Dashboard">


## 🌟 Features
- Real-time order book monitoring
- Multi-market position tracking
- Automated order management
- Custom order sizes and controls
- Real-time WebSocket integration

## 🚀 Quick Start

### 1. Python 3+ Environment Setup (Backend)

Create and activate a virtual environment:
```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
.\venv\Scripts\activate

# Install required Python packages
pip install -r requirements.txt
```

### 2. Environment Variables

Create a `.env` file in `/src/server` with the following variables:
```env
PK=your_polymarket_signer_private_key
FUNDER=your_polymarket_proxy_wallet_address

```
- only supports sig type 2 currently (link to polymarket docs https://docs.polymarket.com/#signature-types)

### 3. Frontend Setup

Install Node.js dependencies in the root directory:
```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### 4. Server Setup (Launch Order)

1. First, ensure your virtual environment is activated and start the FastAPI server:
```bash
cd src/server
uvicorn polyserver:socket_app --host 0.0.0.0 --port 8000 --reload
```

2. Then, in a new terminal window, start the frontend:
```bash
npm run dev
```

## 🌐 Access Points

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- WebSocket: `ws://localhost:8000/ws`

## 🛠️ Tech Stack

- Frontend: React + TypeScript + Vite
- Backend: FastAPI + Python
- Real-time Updates: WebSocket Integration
- State Management: React Hooks

## 📦 Dependencies

### Backend
- FastAPI
- Uvicorn
- python-socketio
- python-dotenv
- httpx
- websockets

### Frontend
- React
- TypeScript
- Vite
- Socket.io-client
- Tailwind CSS

## 🔑 Important Notes

- Both backend and frontend servers must be running simultaneously
- Keep private keys and environment variables secure
- Never commit sensitive information to version control

## 📄 License

MIT License

