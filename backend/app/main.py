from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers.rooms import router as rooms_router
import socketio

# ── Socket.IO setup ───────────────────────────────────────────
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins=["http://localhost:3000", "http://192.168.1.36:3000"]
)

# ── FastAPI setup ─────────────────────────────────────────────
app = FastAPI(title="Live Interview Platform")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://192.168.1.36:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Rooms storage (in memory) ─────────────────────────────────
rooms = {}

# ── Socket.IO events ──────────────────────────────────────────
@sio.event
async def connect(sid, environ):
    print(f"Client connected: {sid}")

@sio.event
async def disconnect(sid):
    print(f"Client disconnected: {sid}")
    for room_id, room in list(rooms.items()):
        if sid in room['participants']:
            room['participants'].remove(sid)
            await sio.emit('user_left', {'sid': sid}, room=room_id)
            if len(room['participants']) == 0:
                del rooms[room_id]

@sio.event
async def join_room(sid, data):
    room_id = data['room_id']
    username = data['username']

    if room_id not in rooms:
        rooms[room_id] = {
            'participants': [],
            'code': '// Start coding here\n',
            'language': 'javascript',
            'whiteboard': []
        }

    if len(rooms[room_id]['participants']) >= 2:
        await sio.emit('room_full', {
            'message': 'This interview room is full. Only 2 participants allowed.'
        }, to=sid)
        return

    rooms[room_id]['participants'].append(sid)
    await sio.enter_room(sid, room_id)

    await sio.emit('room_joined', {
        'room_id': room_id,
        'code': rooms[room_id]['code'],
        'language': rooms[room_id]['language'],
        'participants': len(rooms[room_id]['participants'])
    }, to=sid)

    await sio.emit('user_joined', {
        'username': username,
        'participants': len(rooms[room_id]['participants'])
    }, room=room_id, skip_sid=sid)

@sio.event
async def code_change(sid, data):
    room_id = data['room_id']
    code = data['code']
    if room_id in rooms:
        rooms[room_id]['code'] = code
        await sio.emit('code_updated', {'code': code}, room=room_id, skip_sid=sid)

@sio.event
async def language_change(sid, data):
    room_id = data['room_id']
    language = data['language']
    if room_id in rooms:
        rooms[room_id]['language'] = language
        await sio.emit('language_updated', {'language': language}, room=room_id, skip_sid=sid)

@sio.event
async def whiteboard_draw(sid, data):
    room_id = data['room_id']
    if room_id in rooms:
        await sio.emit('whiteboard_updated', data, room=room_id, skip_sid=sid)

@sio.event
async def video_stopped(sid, data):
    room_id = data.get('room_id')
    if room_id:
        await sio.emit('remote_video_stopped', {}, room=room_id, skip_sid=sid)

# ── WebRTC — relay signals to everyone else in the room ───────
@sio.event
async def webrtc_offer(sid, data):
    room_id = data.get('room_id')
    if room_id:
        await sio.emit('webrtc_offer', data, room=room_id, skip_sid=sid)

@sio.event
async def webrtc_answer(sid, data):
    room_id = data.get('room_id')
    if room_id:
        await sio.emit('webrtc_answer', data, room=room_id, skip_sid=sid)

@sio.event
async def webrtc_ice_candidate(sid, data):
    room_id = data.get('room_id')
    if room_id:
        await sio.emit('webrtc_ice_candidate', data, room=room_id, skip_sid=sid)

@sio.event
async def video_ready(sid, data):
    room_id = data.get('room_id')
    if room_id:
        await sio.emit('peer_ready', {}, room=room_id, skip_sid=sid)

# ── Combine FastAPI + Socket.IO ───────────────────────────────
socket_app = socketio.ASGIApp(sio, app)
app.include_router(rooms_router)