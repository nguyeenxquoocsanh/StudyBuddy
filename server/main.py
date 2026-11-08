import logging
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import errors
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise RuntimeError("GEMINI_API_KEY is missing from the environment")

app = FastAPI(title="StudyBuddy API")
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(chrome-extension://[a-p]{32}|http://tauri\.localhost)$",
    allow_credentials=False,
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)

client = genai.Client(api_key=api_key, http_options={"timeout": 60_000})


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


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
    except errors.APIError as error:
        logger.exception("Gemini request failed")
        raise HTTPException(
            status_code=502,
            detail="The AI service is temporarily unavailable.",
        ) from error

    return {"reply": result.text or "I’m here with you. What is your next small step?"}
