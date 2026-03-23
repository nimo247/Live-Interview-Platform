from fastapi import APIRouter
from pydantic import BaseModel
import os
import httpx
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/rooms")

class FeedbackRequest(BaseModel):
    code: str
    language: str

class ExecuteRequest(BaseModel):
    code: str
    language: str
    stdin: str = ""

# Judge0 CE public instance — no API key required
JUDGE0_URL = "https://ce.judge0.com"

JUDGE0_LANGUAGE_IDS = {
    "javascript": 63,   # Node.js 12.14.0
    "typescript": 74,   # TypeScript 3.7.4
    "python":     71,   # Python 3.8.1
    "java":       62,   # Java OpenJDK 13.0.1
    "cpp":        54,   # C++ GCC 9.2.0
    "go":         60,   # Go 1.13.5
}

@router.post("/create")
async def create_room():
    import random, string
    room_id = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
    return {"room_id": room_id}

@router.get("/{room_id}/exists")
async def room_exists(room_id: str):
    return {"exists": True}

@router.post("/execute")
async def execute_code(req: ExecuteRequest):
    language_id = JUDGE0_LANGUAGE_IDS.get(req.language)
    if not language_id:
        return {
            "stdout": "", "stderr": "", "compile_output": "",
            "status": "Error", "error": f"Language '{req.language}' not supported",
            "time": None, "memory": None
        }

    import base64
    encoded_code  = base64.b64encode(req.code.encode()).decode()
    encoded_stdin = base64.b64encode(req.stdin.encode()).decode() if req.stdin else ""

    payload = {
        "language_id":    language_id,
        "source_code":    encoded_code,
        "stdin":          encoded_stdin,
        "base64_encoded": True,
    }

    headers = {
        "Content-Type": "application/json",
        "Accept":        "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            # Step 1: Submit
            submit_resp = await client.post(
                f"{JUDGE0_URL}/submissions?base64_encoded=true&wait=false",
                json=payload,
                headers=headers
            )
            submission = submit_resp.json()
            token = submission.get("token")
            if not token:
                return {
                    "stdout": "", "stderr": "", "compile_output": "",
                    "status": "Error", "error": f"No token returned: {submission}",
                    "time": None, "memory": None
                }

            # Step 2: Poll until done (max ~10s)
            import asyncio
            result = None
            for _ in range(20):
                await asyncio.sleep(0.5)
                poll_resp = await client.get(
                    f"{JUDGE0_URL}/submissions/{token}?base64_encoded=true",
                    headers=headers
                )
                result = poll_resp.json()
                status_id = result.get("status", {}).get("id", 0)
                # status_id 1 = In Queue, 2 = Processing, 3+ = done
                if status_id >= 3:
                    break

        if not result:
            return {
                "stdout": "", "stderr": "", "compile_output": "",
                "status": "Error", "error": "Execution timed out",
                "time": None, "memory": None
            }

        def decode_b64(val):
            if not val: return ""
            try: return base64.b64decode(val).decode()
            except: return str(val)

        return {
            "stdout":         decode_b64(result.get("stdout")),
            "stderr":         decode_b64(result.get("stderr")),
            "compile_output": decode_b64(result.get("compile_output")),
            "status":         result.get("status", {}).get("description", "Unknown"),
            "time":           result.get("time"),
            "memory":         result.get("memory"),
            "error":          "",
        }

    except Exception as e:
        return {
            "stdout": "", "stderr": "", "compile_output": "",
            "status": "Error", "error": str(e),
            "time": None, "memory": None
        }


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