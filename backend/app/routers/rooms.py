from fastapi import APIRouter
import uuid

router = APIRouter(prefix="/rooms", tags=["rooms"])

@router.post("/create")
async def create_room():
    room_id = str(uuid.uuid4())[:8].upper()
    return {"room_id": room_id}

@router.get("/{room_id}/exists")
async def room_exists(room_id: str):
    return {"exists": True}