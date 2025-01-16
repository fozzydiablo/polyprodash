from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import socketio
import asyncio

# Create the Socket.IO server
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins=['http://localhost:5173'])
app = FastAPI()

# Set up CORS for the FastAPI app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Specify the React app's URL
    allow_credentials=True,  # Allow credentials for compatibility
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create an ASGI application that combines FastAPI and Socket.IO
socket_app = socketio.ASGIApp(sio, app)

# Test endpoint to confirm server is working
@app.get("/")
async def get():
    return {"message": "Server is running"}

# Define a WebSocket endpoint using Socket.IO
@sio.event
async def connect(sid, environ):
    print(f"Client connected: {sid}")
    await sio.emit('connection_status', {'connected': True}, to=sid)

@sio.event
async def disconnect(sid):
    print(f"Client disconnected: {sid}")

# Emit a test message to the client every 5 seconds
async def background_task():
    while True:
        await sio.emit('message', {'data': 'Hello from server'})
        await asyncio.sleep(5)

# Run the background task when the server starts
sio.start_background_task(background_task)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(socket_app, host="0.0.0.0", port=8000)  # Run socket_app, not app
