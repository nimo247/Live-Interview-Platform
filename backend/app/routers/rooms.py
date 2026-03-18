from fastapi import APIRouter
from pydantic import BaseModel
import os
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/rooms")

class FeedbackRequest(BaseModel):
    code: str
    language: str

@router.post("/create")
async def create_room():
    import random
    import string
    room_id = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
    return {"room_id": room_id}

@router.get("/{room_id}/exists")
async def room_exists(room_id: str):
    return {"exists": True}

@router.post("/ai-feedback")
async def get_ai_feedback(req: FeedbackRequest):
    from groq import Groq
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return {"feedback": "❌ GROQ_API_KEY not set in environment."}
    client = Groq(api_key=api_key)
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        max_tokens=1024,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an expert code reviewer for technical interviews. "
                    "Analyze the given code and provide structured feedback covering: "
                    "1) Correctness, 2) Time & Space Complexity, 3) Code Quality, "
                    "4) Edge Cases, 5) Improvements. Be concise and constructive."
                )
            },
            {
                "role": "user",
                "content": f"Language: {req.language}\n\nCode:\n{req.code}"
            }
        ]
    )
    return {"feedback": response.choices[0].message.content}