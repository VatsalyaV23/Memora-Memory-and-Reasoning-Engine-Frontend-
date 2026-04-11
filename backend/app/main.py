from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import logging
import os
from datetime import datetime
from typing import List, Optional
from dotenv import load_dotenv

# Import clients
from app.config import config
from app.postgres_client import get_postgres_client, init_postgres
from app.chromadb_client import get_chromadb_client, init_chromadb
from app.gemini_client import get_gemini_client, init_gemini
from app.rag_engine import get_rag_engine, init_rag_engine
from app.decision_extractor import get_decision_extractor

load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Org Memory Engine",
    description="Capture & reason about organizational decisions",
    version="0.9.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        config.EXTENSION_ORIGIN,
        "http://localhost:3000",
        "http://localhost:8000",
        "http://localhost:8080",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================
# PYDANTIC MODELS
# ============================================

class HealthResponse(BaseModel):
    status: str
    message: str
    postgres: str = "unknown"
    chromadb: str = "unknown"

class CaptureRequest(BaseModel):
    text: str
    source: str = "unknown"
    url: str = ""

class CaptureResponse(BaseModel):
    id: str
    message: str

class ExtractDecisionsRequest(BaseModel):
    text: str
    source: str = "unknown"
    url: str = ""
    auto_store: bool = True

class Decision(BaseModel):
    decision_id: str
    title: str
    status: str
    description: str
    confidence: float = 0.8

class ExtractDecisionsResponse(BaseModel):
    decisions: List[Decision]
    count: int

class AskRequest(BaseModel):
    question: str

class Citation(BaseModel):
    source: str
    text_preview: str
    relevance: float

class AskResponse(BaseModel):
    answer: str
    citations: List[Citation] = []
    has_evidence: bool = True

class DecisionRequest(BaseModel):
    decision_id: str
    title: str
    status: str
    description: str = ""
    source: str = "unknown"
    url: str = ""

class DecisionResponse(BaseModel):
    success: bool
    decision_id: str
    message: str

class RelationshipRequest(BaseModel):
    from_decision_id: str
    to_decision_id: str
    relationship_type: str = "DEPENDS_ON"
    reason: str = ""

# ============================================
# INITIALIZATION
# ============================================

@app.on_event("startup")
async def startup_event():
    """Initialize all services on startup"""
    logger.info("🚀 Starting Org Memory Engine...")
    
    try:
        # Initialize PostgreSQL
        logger.info("Initializing PostgreSQL...")
        init_postgres(config.DATABASE_URL)
        logger.info("✓ PostgreSQL initialized")
    except Exception as e:
        logger.error(f"❌ Failed to initialize PostgreSQL: {str(e)}")
        raise
    
    try:
        # Initialize ChromaDB
        logger.info("Initializing ChromaDB...")
        init_chromadb(config.CHROMA_DB_PATH)
        logger.info("✓ ChromaDB initialized")
    except Exception as e:
        logger.error(f"❌ Failed to initialize ChromaDB: {str(e)}")
        raise
    
    try:
        # Initialize Gemini
        logger.info("Initializing Gemini API...")
        init_gemini(config.GEMINI_API_KEY)
        logger.info("✓ Gemini initialized")
    except Exception as e:
        logger.error(f"❌ Failed to initialize Gemini: {str(e)}")
        raise
    
    try:
        # Initialize RAG Engine
        logger.info("Initializing RAG Engine...")
        init_rag_engine()
        logger.info("✓ RAG Engine initialized")
    except Exception as e:
        logger.error(f"❌ Failed to initialize RAG Engine: {str(e)}")
        raise
    
    logger.info("✅ All services initialized successfully!")

# ============================================
# HEALTH CHECK ENDPOINTS
# ============================================

@app.get("/", response_model=HealthResponse)
async def root():
    """Root endpoint - health check"""
    db = get_postgres_client()
    chroma = get_chromadb_client()
    
    postgres_status = "ok" if db and db.health_check() else "error"
    chromadb_status = "ok" if chroma else "error"
    
    return {
        "status": "ok",
        "message": "Org Memory Engine is running",
        "postgres": postgres_status,
        "chromadb": chromadb_status
    }

@app.get("/health", response_model=HealthResponse)
async def health():
    """Detailed health check endpoint"""
    db = get_postgres_client()
    chroma = get_chromadb_client()
    
    postgres_status = "ok" if db and db.health_check() else "error"
    chromadb_status = "ok" if chroma else "error"
    
    return {
        "status": "ok",
        "message": "All systems nominal",
        "postgres": postgres_status,
        "chromadb": chromadb_status
    }

# ============================================
# CAPTURE ENDPOINTS
# ============================================

@app.post("/capture", response_model=CaptureResponse)
async def capture(request: CaptureRequest):
    """
    Capture text from Slack/Gmail and store in ChromaDB.
    Stores both original text and vector embedding.
    """
    try:
        chroma = get_chromadb_client()
        if not chroma:
            raise HTTPException(status_code=500, detail="ChromaDB not available")
        
        # Generate unique ID
        import hashlib
        import time
        doc_id = hashlib.md5(f"{request.text[:20]}_{time.time()}".encode()).hexdigest()[:12]
        
        # Store in ChromaDB
        success = chroma.add_document(
            doc_id=doc_id,
            text=request.text,
            source=request.source,
            url=request.url
        )
        
        if success:
            logger.info(f"✓ Captured {len(request.text)} characters from {request.source}")
            return {
                "id": doc_id,
                "message": f"✅ Captured {len(request.text)} characters from {request.source}"
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to store in ChromaDB")
    
    except Exception as e:
        logger.error(f"❌ Capture failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Capture failed: {str(e)}")

@app.get("/list")
async def list_documents(limit: int = 10):
    """List captured documents"""
    try:
        chroma = get_chromadb_client()
        if not chroma:
            raise HTTPException(status_code=500, detail="ChromaDB not available")
        
        docs = chroma.get_all_documents(limit=limit)
        return {
            "documents": docs,
            "count": len(docs)
        }
    except Exception as e:
        logger.error(f"❌ List failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"List failed: {str(e)}")

@app.post("/search")
async def search(query: str, limit: int = 5):
    """Search documents using semantic search"""
    try:
        chroma = get_chromadb_client()
        if not chroma:
            raise HTTPException(status_code=500, detail="ChromaDB not available")
        
        results = chroma.search(query=query, n_results=limit)
        return {
            "query": query,
            "results": results,
            "count": len(results)
        }
    except Exception as e:
        logger.error(f"❌ Search failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

# ============================================
# DECISION EXTRACTION ENDPOINTS
# ============================================

@app.post("/extract-decisions", response_model=ExtractDecisionsResponse)
async def extract_decisions(request: ExtractDecisionsRequest):
    """
    Extract decisions from text using Gemini LLM.
    Automatically stores in PostgreSQL and creates relationships.
    """
    try:
        extractor = get_decision_extractor()
        if not extractor:
            raise HTTPException(status_code=500, detail="Decision extractor not available")
        
        # Extract decisions using LLM
        decisions = extractor.extract_decisions(request.text)
        
        if not decisions:
            logger.info("No decisions found in text")
            return {
                "decisions": [],
                "count": 0
            }
        
        # Auto-store if requested
        if request.auto_store:
            db = get_postgres_client()
            if not db:
                raise HTTPException(status_code=500, detail="Database not available")
            
            for decision in decisions:
                db.create_decision_node(
                    decision_id=decision.decision_id,
                    title=decision.title,
                    status=decision.status,
                    description=decision.description,
                    source=request.source,
                    source_doc_id=request.url,
                    url=request.url
                )
        
        logger.info(f"✓ Extracted {len(decisions)} decisions")
        
        return {
            "decisions": [
                Decision(
                    decision_id=d.decision_id,
                    title=d.title,
                    status=d.status,
                    description=d.description,
                    confidence=d.confidence
                )
                for d in decisions
            ],
            "count": len(decisions)
        }
    
    except Exception as e:
        logger.error(f"❌ Extraction failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")

# ============================================
# RAG & QUESTIONING ENDPOINTS
# ============================================

@app.post("/ask", response_model=AskResponse)
async def ask(request: AskRequest):
    """
    Answer questions using RAG (Retrieval-Augmented Generation).
    Retrieves relevant documents from ChromaDB and uses Gemini for context-aware answering.
    """
    try:
        rag = get_rag_engine()
        if not rag:
            raise HTTPException(status_code=500, detail="RAG engine not available")
        
        # Generate answer using RAG
        answer, citations = rag.answer_question(request.question)
        
        logger.info(f"✓ Answered question: {request.question[:50]}...")
        
        return {
            "answer": answer,
            "citations": [
                Citation(
                    source=c.get("source", "unknown"),
                    text_preview=c.get("text_preview", "")[:200],
                    relevance=c.get("relevance", 0.0)
                )
                for c in citations
            ],
            "has_evidence": len(citations) > 0
        }
    
    except Exception as e:
        logger.error(f"❌ Question answering failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Question answering failed: {str(e)}")

# ============================================
# DECISION GRAPH ENDPOINTS (PostgreSQL)
# ============================================

@app.post("/graph/decision", response_model=DecisionResponse)
async def create_decision(request: DecisionRequest):
    """
    Create a decision node in PostgreSQL graph.
    Stores decision with metadata for later querying.
    """
    try:
        db = get_postgres_client()
        if not db:
            raise HTTPException(status_code=500, detail="Database not available")
        
        success = db.create_decision_node(
            decision_id=request.decision_id,
            title=request.title,
            status=request.status,
            description=request.description,
            source=request.source,
            source_doc_id="",
            url=request.url
        )
        
        if success:
            logger.info(f"✓ Decision created: {request.decision_id}")
            return {
                "success": True,
                "decision_id": request.decision_id,
                "message": f"✅ Decision '{request.title}' stored in graph database"
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to create decision")
    
    except Exception as e:
        logger.error(f"❌ Decision creation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Decision creation failed: {str(e)}")

@app.post("/graph/relationship")
async def create_relationship(request: RelationshipRequest):
    """
    Create a relationship between two decisions.
    Defines dependency chains (A depends on B, etc.)
    """
    try:
        db = get_postgres_client()
        if not db:
            raise HTTPException(status_code=500, detail="Database not available")
        
        success = db.create_relationship(
            from_decision_id=request.from_decision_id,
            to_decision_id=request.to_decision_id,
            relationship_type=request.relationship_type,
            reason=request.reason
        )
        
        if success:
            logger.info(f"✓ Relationship created: {request.from_decision_id} -> {request.to_decision_id}")
            return {
                "success": True,
                "message": f"✅ Relationship created"
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to create relationship")
    
    except Exception as e:
        logger.error(f"❌ Relationship creation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Relationship creation failed: {str(e)}")

@app.get("/graph/decision/{decision_id}")
async def get_decision(decision_id: str):
    """
    Get a specific decision and its relationships.
    Shows what it depends on and what depends on it.
    """
    try:
        db = get_postgres_client()
        if not db:
            raise HTTPException(status_code=500, detail="Database not available")
        
        decision = db.get_decision(decision_id)
        
        if not decision:
            raise HTTPException(status_code=404, detail=f"Decision {decision_id} not found")
        
        dependencies = db.get_decision_dependencies(decision_id)
        impacted = db.get_decision_impacted(decision_id)
        
        return {
            "decision": decision,
            "dependencies": dependencies,
            "impacted": impacted
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Get decision failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Get decision failed: {str(e)}")

@app.get("/graph/decisions")
async def get_all_decisions(limit: int = 50):
    """Get all decisions"""
    try:
        db = get_postgres_client()
        if not db:
            raise HTTPException(status_code=500, detail="Database not available")
        
        decisions = db.get_all_decisions(limit=limit)
        
        return {
            "decisions": decisions,
            "count": len(decisions)
        }
    
    except Exception as e:
        logger.error(f"❌ Get decisions failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Get decisions failed: {str(e)}")

@app.get("/graph/export")
async def export_graph():
    """Export entire decision graph as JSON"""
    try:
        db = get_postgres_client()
        if not db:
            raise HTTPException(status_code=500, detail="Database not available")
        
        graph_data = db.export_graph_json()
        
        return graph_data
    
    except Exception as e:
        logger.error(f"❌ Export failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")

# ============================================
# ERROR HANDLERS
# ============================================

@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    """Handle HTTP exceptions"""
    logger.error(f"HTTPException: {exc.detail}")
    return {
        "error": exc.detail,
        "status_code": exc.status_code
    }

@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    """Handle general exceptions"""
    logger.error(f"Unhandled exception: {str(exc)}")
    return {
        "error": "Internal server error",
        "detail": str(exc)
    }

# ============================================
# MAIN
# ============================================

if __name__ == "__main__":
    import uvicorn
    
    logger.info("Starting Org Memory Engine...")
    uvicorn.run(
        "app.main:app",
        host=config.BACKEND_HOST,
        port=config.BACKEND_PORT,
        reload=True
    )
    
# Add these imports
from app.meeting_agent import init_meeting_agent, get_meeting_agent, MeetingSession

# Add to startup
@app.on_event("startup")
async def startup_event():
    # ... existing code ...
    try:
        logger.info("Initializing Meeting Agent...")
        init_meeting_agent()
        logger.info("✓ Meeting Agent initialized")
    except Exception as e:
        logger.error(f"❌ Failed to initialize Meeting Agent: {str(e)}")
        raise

# ============================================
# MEETING ENDPOINTS
# ============================================

class MeetingStartRequest(BaseModel):
    title: str
    participants: List[str] = []
    enableRecording: bool = True
    deployAgent: bool = False

class MeetingResponse(BaseModel):
    meeting_id: str
    title: str
    status: str
    message: str

@app.post("/meetings/start", response_model=MeetingResponse)
async def start_meeting(request: MeetingStartRequest):
    """Start a new meeting session"""
    try:
        agent = get_meeting_agent()
        if not agent:
            raise HTTPException(status_code=500, detail="Meeting agent not available")
        
        meeting = agent.start_meeting(
            title=request.title,
            participants=request.participants,
            enable_recording=request.enableRecording
        )
        
        return {
            "meeting_id": meeting.meeting_id,
            "title": meeting.title,
            "status": "started",
            "message": f"✅ Meeting '{request.title}' started successfully"
        }
    
    except Exception as e:
        logger.error(f"❌ Failed to start meeting: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/agent/deploy")
async def deploy_agent(meeting_id_data: dict):
    """Deploy AI agent to meeting"""
    try:
        agent = get_meeting_agent()
        if not agent:
            raise HTTPException(status_code=500, detail="Meeting agent not available")
        
        meeting_id = meeting_id_data.get("meeting_id")
        result = await agent.deploy_agent(meeting_id)
        
        return {
            "status": "deployed",
            "message": "🤖 AI Agent deployed successfully",
            "meeting_id": meeting_id
        }
    
    except Exception as e:
        logger.error(f"❌ Failed to deploy agent: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/meetings/{meeting_id}/end")
async def end_meeting(meeting_id: str):
    """End meeting and generate transcript"""
    try:
        agent = get_meeting_agent()
        if not agent:
            raise HTTPException(status_code=500, detail="Meeting agent not available")
        
        result = await agent.end_meeting(meeting_id)
        
        return {
            "status": "ended",
            "meeting_id": meeting_id,
            "transcript": result["transcript"],
            "decisions": result["decisions"],
            "summary": result["summary"],
            "duration": result["duration"]
        }
    
    except Exception as e:
        logger.error(f"❌ Failed to end meeting: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/meetings/{meeting_id}")
async def get_meeting(meeting_id: str):
    """Get meeting details"""
    try:
        agent = get_meeting_agent()
        if not agent:
            raise HTTPException(status_code=500, detail="Meeting agent not available")
        
        meeting = agent.get_meeting(meeting_id)
        
        if not meeting:
            raise HTTPException(status_code=404, detail=f"Meeting {meeting_id} not found")
        
        return {
            "meeting_id": meeting.meeting_id,
            "title": meeting.title,
            "participants": meeting.participants,
            "start_time": meeting.start_time,
            "agent_active": meeting.agent_active,
            "transcript_length": len(meeting.transcript),
            "decisions_found": len(meeting.decisions_extracted)
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Failed to get meeting: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/meetings")
async def list_meetings():
    """List all active meetings"""
    try:
        agent = get_meeting_agent()
        if not agent:
            raise HTTPException(status_code=500, detail="Meeting agent not available")
        
        meetings = agent.get_all_active_meetings()
        
        return {
            "active_meetings": len(meetings),
            "meetings": [
                {
                    "meeting_id": m.meeting_id,
                    "title": m.title,
                    "participants": m.participants,
                    "agent_active": m.agent_active
                }
                for m in meetings
            ]
        }
    
    except Exception as e:
        logger.error(f"❌ Failed to list meetings: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================
# DECISION CONSENSUS ENDPOINTS
# ============================================

class VoteRequest(BaseModel):
    vote: str  # approved, rejected, pending
    votedBy: str

@app.post("/graph/decision/{decision_id}/vote")
async def vote_on_decision(decision_id: str, request: VoteRequest):
    """Record a vote on a decision"""
    try:
        db = get_postgres_client()
        if not db:
            raise HTTPException(status_code=500, detail="Database not available")
        
        with db.conn.cursor() as cur:
            cur.execute("""
                INSERT INTO decision_votes (decision_id, vote, voted_by, voted_at)
                VALUES (%s, %s, %s, NOW())
            """, (decision_id, request.vote, request.votedBy))
            db.conn.commit()
        
        return {"status": "success", "message": "Vote recorded"}
    
    except Exception as e:
        logger.error(f"❌ Failed to vote: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/graph/decision/{decision_id}/consensus")
async def get_decision_consensus(decision_id: str):
    """Get consensus data for a decision"""
    try:
        db = get_postgres_client()
        if not db:
            raise HTTPException(status_code=500, detail="Database not available")
        
        with db.conn.cursor() as cur:
            cur.execute("""
                SELECT vote, COUNT(*) as count
                FROM decision_votes
                WHERE decision_id = %s
                GROUP BY vote
            """, (decision_id,))
            votes = cur.fetchall()
        
        total_votes = sum(v[1] for v in votes)
        
        if total_votes == 0:
            return {
                "type": "unknown",
                "votes": 0,
                "percentage": 0,
                "breakdown": {}
            }
        
        # Calculate consensus type
        vote_dict = {v[0]: v[1] for v in votes}
        approved_pct = (vote_dict.get('approved', 0) / total_votes) * 100
        
        if approved_pct >= 80:
            consensus_type = "unanimous"
        elif approved_pct >= 50:
            consensus_type = "majority"
        else:
            consensus_type = "split"
        
        return {
            "type": consensus_type,
            "votes": total_votes,
            "percentage": int(approved_pct),
            "breakdown": vote_dict
        }
    
    except Exception as e:
        logger.error(f"❌ Failed to get consensus: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))