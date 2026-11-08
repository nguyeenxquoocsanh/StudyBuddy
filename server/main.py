import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from pydantic import BaseModel

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise RuntimeError("GEMINI_API_KEY is missing from the environment")

app = FastAPI(title="StudyBuddy API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

client = genai.Client(api_key=api_key, http_options={"timeout": 60000})


class ChatRequest(BaseModel):
    message: str


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/chat")
def chat(request: ChatRequest) -> dict[str, str]:
    message = request.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message is required.")

    try:
        result = client.models.generate_content(
            model="gemini-3.5-flash",
            contents=(
                "You are StudyBuddy, a concise and warm study companion. "
                "Help the student take one practical next step. Keep replies "
                f"under 80 words.\n\nStudent message: {message}"
            ),
        )
    except Exception as error:
        print(f"Gemini request failed: {error}")
        raise HTTPException(
            status_code=502,
            detail="The AI service is temporarily unavailable.",
        ) from error

    return {"reply": result.text or "I’m here with you. What is your next small step?"}