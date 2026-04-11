import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    """Configuration from environment variables"""
    
    # Backend settings
    BACKEND_HOST = os.getenv("BACKEND_HOST", "0.0.0.0")
    BACKEND_PORT = int(os.getenv("BACKEND_PORT", "8000"))
    
    # API Keys
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("OPENAI_API_KEY")
    # Database settings (PostgreSQL)
    DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://orgmemory:postgres_password_docker@postgres:5432/org_memory")
    
    # ChromaDB settings
    CHROMA_DB_PATH = os.getenv("CHROMA_DB_PATH", "./chroma_data")
    
    # Extension settings
    EXTENSION_ORIGIN = os.getenv("EXTENSION_ORIGIN", "chrome-extension://*")
    
    # Validation
    if not GEMINI_API_KEY:
        raise ValueError("❌ GEMINI_API_KEY not set in .env file")
    
    if not DATABASE_URL:
        raise ValueError("❌ DATABASE_URL not set in .env file")

config = Config()