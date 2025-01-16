from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
from py_clob_client.constants import POLYGON
from py_clob_client.client import ClobClient
from py_clob_client.clob_types import OrderArgs
from py_clob_client.order_builder.constants import BUY, SELL
from dotenv import load_dotenv
from pathlib import Path
import socketio
import asyncio
import websockets
import json
import httpx

# Load environment variables
load_dotenv()

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

# Store state and client instance
class AppState:
    credentials = None
    ws_connection = None
    connected = False

app_state = AppState()
client = None

class CancelOrderRequest(BaseModel):
    order_id: str

# Update the order request model to include side
class OrderRequest(BaseModel):
    token_id: str
    price: float
    size: float
    side: str  # 'BUY' or 'SELL'

def generate_and_save_credentials(client_instance):
    try:
        print("Generating new API credentials...")
        delete_resp = client_instance.delete_api_key()
        api_creds_response = client_instance.create_api_key()
        
        creds = {
            'key': api_creds_response.api_key,
            'secret': api_creds_response.api_secret,
            'passphrase': api_creds_response.api_passphrase
        }
        
        # Read existing .env file
        env_path = Path('.') / '.env'
        existing_vars = {}
        
        if env_path.exists():
            with open(env_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#'):
                        try:
                            key, value = line.split('=', 1)
                            if not key.startswith('POLY_'):  # Keep non-POLY variables
                                existing_vars[key] = value
                        except ValueError:
                            continue

        # Write back all variables including new credentials
        with open(env_path, 'w') as f:
            # First write existing non-POLY variables
            for key, value in existing_vars.items():
                f.write(f"{key}={value}\n")
            
            # Then write new POLY credentials
            f.write(f"POLY_API_KEY={creds['key']}\n")
            f.write(f"POLY_SECRET={creds['secret']}\n")
            f.write(f"POLY_PASSPHRASE={creds['passphrase']}\n")
        
        # Store in app state
        app_state.credentials = creds
        client_instance.set_api_creds(api_creds_response)
        print("Credentials generated and stored successfully")
        return creds
    except Exception as e:
        print(f"Error generating credentials: {str(e)}")
        return None

# Socket.IO event handlers
@sio.event
async def connect(sid, environ):
    print(f"Client connected: {sid}")
    await sio.emit('connection_status', {'connected': app_state.connected}, to=sid)

@sio.event
async def disconnect(sid):
    print(f"Client disconnected: {sid}")

# WebSocket connection handler to Polymarket
async def connect_to_polymarket_ws():
    while True:
        try:
            if not app_state.credentials:
                print("No credentials available, waiting...")
                await asyncio.sleep(5)
                continue

            async with websockets.connect('wss://ws-subscriptions-clob.polymarket.com/ws/user') as websocket:
                app_state.ws_connection = websocket
                app_state.connected = True
                print("Connected to Polymarket WebSocket")

                # Send authentication
                auth_message = {
                    "type": "subscribe",
                    "channel": "user",
                    "auth": {
                        "apiKey": app_state.credentials['key'],
                        "secret": app_state.credentials['secret'],
                        "passphrase": app_state.credentials['passphrase']
                    }
                }
                await websocket.send(json.dumps(auth_message))
                print("Authentication sent to Polymarket")

                while True:
                    try:
                        message = await websocket.recv()
                        data = json.loads(message)
                        print(f"Received from Polymarket: {data}")
                        await sio.emit('user_update', data)
                    except websockets.ConnectionClosed:
                        print("Polymarket WebSocket connection closed")
                        break
                    except Exception as e:
                        print(f"Error handling message: {e}")

        except Exception as e:
            print(f"WebSocket connection error: {e}")
            app_state.connected = False
            app_state.ws_connection = None
        
        await asyncio.sleep(5)

# API endpoints
@app.get("/")
async def root():
    return {"status": "API is running"}

@app.get("/test")
async def test():
    return {"status": "working", "message": "test endpoint reached"}

@app.get("/test_socket")
async def test_socket():
    await sio.emit('user_update', {'test': 'WebSocket connection is working'})
    return {"status": "WebSocket test message sent"}

@app.get("/api/credentials")
async def get_credentials():
    if not app_state.credentials:
        raise HTTPException(status_code=500, detail="Credentials not generated yet")
    return {
        "apiKey": app_state.credentials['key'],
        "secret": app_state.credentials['secret'],
        "passphrase": app_state.credentials['passphrase']
    }

@app.get("/api/markets")
async def get_markets(
    limit: int = 400,
    offset: int = 0,
    active: bool = True,
    archived: bool = False,
    closed: bool = False
):
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://gamma-api.polymarket.com/events",
                params={
                    "limit": limit,
                    "active": active,
                    "archived": archived,
                    "closed": closed,
                    "order": "volume24hr",
                    "ascending": False,
                    "offset": offset
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Failed to fetch markets: {response.text}"
                )
            
            return response.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Add new endpoint
@app.get("/api/positions")
async def get_positions():
    try:
        FUNDER = os.getenv("FUNDER")
        if not FUNDER:
            raise HTTPException(status_code=500, detail="FUNDER address not configured")

        # Construct the positions URL
        positions_url = (
            f"https://data-api.polymarket.com/positions"
            f"?user={FUNDER}"
            f"&sortBy=CURRENT"
            f"&sortDirection=DESC"
            f"&sizeThreshold=.1"
            f"&limit=50"
            f"&offset=0"
        )

        async with httpx.AsyncClient() as client:
            response = await client.get(positions_url)
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Failed to fetch positions: {response.text}"
                )
            
            positions = response.json()
            print(f"Fetched positions for {FUNDER}: {positions}")
            return positions

    except Exception as e:
        print(f"Error fetching positions: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    
# Add a unified order endpoint
@app.post("/api/order")
async def create_order(order: OrderRequest):        
    try:
        # Determine the order side
        order_side = BUY if order.side == 'BUY' else SELL
        
        order_args = OrderArgs(
            price=order.price,
            size=order.size,
            side=order_side,
            token_id=order.token_id
        )
        
        response = client.create_and_post_order(order_args)
        return {
            "status": "success",
            "data": response
        }
    except Exception as e:
        print(f"Error creating {order.side} order: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    
@app.post("/api/cancel")
async def cancel_order(order: CancelOrderRequest):
    try:
        response = client.cancel(order_id=order.order_id)
        return {
            "status": "success",
            "data": response
        }
    except Exception as e:
        print(f"Error cancelling order: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Startup event for setting up the ClobClient and WebSocket connection
@app.on_event("startup")
async def startup_event():
    global client
    HOST = "https://clob.polymarket.com"
    API_KEY = os.getenv("PK")
    FUNDER = os.getenv("FUNDER")
    CHAIN_ID = POLYGON

    if not API_KEY or not FUNDER:
        print("Missing environment variables for API_KEY or FUNDER")
        return

    try:
        client = ClobClient(HOST, key=API_KEY, chain_id=CHAIN_ID, funder=FUNDER, signature_type=2)
        client.set_api_creds(client.create_or_derive_api_creds())
        
        # Generate and save credentials
        generate_and_save_credentials(client)
        
        # Start WebSocket connection
        asyncio.create_task(connect_to_polymarket_ws())
        
    except Exception as e:
        print(f"Error in startup: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        socket_app,  # Use combined socket_app instead of app
        host="0.0.0.0",
        port=8000,
        log_level="debug"
    )
