from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers.rooms import router as rooms_router
import socketio

sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins=["http://localhost:3000", "http://192.168.1.35:3000"]
)

app = FastAPI(title="Live Interview Platform")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://192.168.1.35:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

rooms = {}

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
    if room_id in rooms:
        rooms[room_id]['code'] = data['code']
        await sio.emit('code_updated', {'code': data['code']}, room=room_id, skip_sid=sid)

@sio.event
async def language_change(sid, data):
    room_id = data['room_id']
    if room_id in rooms:
        rooms[room_id]['language'] = data['language']
        await sio.emit('language_updated', {'language': data['language']}, room=room_id, skip_sid=sid)

@sio.event
async def whiteboard_draw(sid, data):
    if data['room_id'] in rooms:
        await sio.emit('whiteboard_updated', data, room=data['room_id'], skip_sid=sid)

@sio.event
async def video_stopped(sid, data):
    room_id = data.get('room_id')
    if room_id:
        await sio.emit('remote_video_stopped', {}, room=room_id, skip_sid=sid)

@sio.event
async def chat_message(sid, data):
    room_id = data.get('room_id')
    if room_id:
        await sio.emit('chat_message', data, room=room_id, skip_sid=sid)

# ── Timer sync ────────────────────────────────────────────────
@sio.event
async def timer_start(sid, data):
    room_id = data.get('room_id')
    if room_id:
        await sio.emit('timer_start', data, room=room_id, skip_sid=sid)

@sio.event
async def timer_resume(sid, data):
    room_id = data.get('room_id')
    if room_id:
        await sio.emit('timer_resume', data, room=room_id, skip_sid=sid)

@sio.event
async def timer_stop(sid, data):
    room_id = data.get('room_id')
    if room_id:
        await sio.emit('timer_stop', {}, room=room_id, skip_sid=sid)

@sio.event
async def timer_reset(sid, data):
    room_id = data.get('room_id')
    if room_id:
        await sio.emit('timer_reset', {}, room=room_id, skip_sid=sid)

# ── WebRTC ────────────────────────────────────────────────────
@sio.event
async def webrtc_offer(sid, data):
    if data.get('room_id'):
        await sio.emit('webrtc_offer', data, room=data['room_id'], skip_sid=sid)

@sio.event
async def webrtc_answer(sid, data):
    if data.get('room_id'):
        await sio.emit('webrtc_answer', data, room=data['room_id'], skip_sid=sid)

@sio.event
async def webrtc_ice_candidate(sid, data):
    if data.get('room_id'):
        await sio.emit('webrtc_ice_candidate', data, room=data['room_id'], skip_sid=sid)

@sio.event
async def video_ready(sid, data):
    if data.get('room_id'):
        await sio.emit('peer_ready', {}, room=data['room_id'], skip_sid=sid)

socket_app = socketio.ASGIApp(sio, app)
app.include_router(rooms_router)