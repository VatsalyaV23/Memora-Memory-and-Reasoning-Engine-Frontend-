import asyncio
import logging
import uuid
import io
import threading
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel
import sounddevice as sd
import soundfile as sf
import speech_recognition as sr
from app.gemini_client import get_gemini_client
from app.postgres_client import get_postgres_client

logger = logging.getLogger(__name__)

class MeetingSession(BaseModel):
    """Meeting session model"""
    meeting_id: str
    title: str
    participants: List[str]
    start_time: datetime
    end_time: Optional[datetime] = None
    recording_enabled: bool = True
    agent_active: bool = False
    transcript: str = ""
    decisions_extracted: List[dict] = []
    audio_file: Optional[str] = None

class MeetingAgentManager:
    """Manages AI agent participation in meetings"""
    
    def __init__(self):
        self.active_meetings = {}
        self.recognizer = sr.Recognizer()
        self.recognizer.energy_threshold = 4000
        self.gemini = get_gemini_client()
        self.db = get_postgres_client()
        self.sample_rate = 16000  # 16kHz for speech recognition
        self.recording_threads = {}
    
    def start_meeting(self, title: str, participants: List[str], 
                     enable_recording: bool = True) -> MeetingSession:
        """Start a new meeting session"""
        try:
            meeting_id = str(uuid.uuid4())[:12]
            meeting = MeetingSession(
                meeting_id=meeting_id,
                title=title,
                participants=participants,
                start_time=datetime.now(),
                recording_enabled=enable_recording,
                agent_active=False
            )
            
            self.active_meetings[meeting_id] = meeting
            logger.info(f"✓ Meeting started: {meeting_id} - {title}")
            
            return meeting
        except Exception as e:
            logger.error(f"❌ Failed to start meeting: {str(e)}")
            raise
    
    async def deploy_agent(self, meeting_id: str):
        """Deploy AI agent to join and monitor meeting"""
        try:
            if meeting_id not in self.active_meetings:
                raise ValueError(f"Meeting {meeting_id} not found")
            
            meeting = self.active_meetings[meeting_id]
            meeting.agent_active = True
            
            logger.info(f"🤖 Agent deployed to meeting {meeting_id}")
            
            if meeting.recording_enabled:
                # Start audio recording and transcription in background thread
                thread = threading.Thread(
                    target=self._record_and_transcribe_sync,
                    args=(meeting_id,),
                    daemon=True
                )
                thread.start()
                self.recording_threads[meeting_id] = thread
            
            return {"status": "deployed", "meeting_id": meeting_id}
        
        except Exception as e:
            logger.error(f"❌ Failed to deploy agent: {str(e)}")
            raise
    
    def _record_and_transcribe_sync(self, meeting_id: str):
        """Record audio and transcribe in real-time (synchronous version)"""
        try:
            meeting = self.active_meetings[meeting_id]
            audio_frames = []
            
            logger.info(f"🎙️ Recording started for {meeting_id}")
            
            # Start recording
            def audio_callback(indata, frames, time, status):
                if status:
                    logger.warning(f"Recording status: {status}")
                audio_frames.append(indata.copy())
            
            # Record audio stream
            with sd.InputStream(
                samplerate=self.sample_rate,
                channels=1,
                callback=audio_callback,
                blocksize=8000
            ):
                # Record for the duration of the meeting
                while meeting.agent_active:
                    asyncio.sleep(0.1)
            
            # Process audio chunks
            if audio_frames:
                audio_data = b''.join([frame.tobytes() for frame in audio_frames])
                self._process_audio_for_transcription(meeting_id, audio_data)
            
            logger.info(f"🎙️ Recording ended for {meeting_id}")
        
        except Exception as e:
            logger.error(f"❌ Recording failed: {str(e)}")
            meeting = self.active_meetings.get(meeting_id)
            if meeting:
                meeting.agent_active = False
    
    def _process_audio_for_transcription(self, meeting_id: str, audio_bytes: bytes):
        """Process audio data and transcribe"""
        try:
            meeting = self.active_meetings[meeting_id]
            
            # Convert audio bytes to recognizable format
            try:
                text = self.recognizer.recognize_google(
                    sr.AudioData(audio_bytes, self.sample_rate, 2)
                )
                
                timestamp = datetime.now().strftime('%H:%M:%S')
                meeting.transcript += f"\n[{timestamp}] {text}"
                
                logger.info(f"[{meeting_id}] Transcribed: {text}")
                
                # Extract decisions from transcribed text
                self._extract_decisions_sync(meeting_id, text)
                
            except sr.UnknownValueError:
                logger.debug(f"[{meeting_id}] Could not understand audio")
            except sr.RequestError as e:
                logger.error(f"[{meeting_id}] Speech recognition error: {e}")
        
        except Exception as e:
            logger.error(f"❌ Transcription processing failed: {str(e)}")
    
    def _extract_decisions_sync(self, meeting_id: str, text: str):
        """Extract decisions from transcribed text (synchronous)"""
        try:
            if not self.gemini:
                return
            
            meeting = self.active_meetings[meeting_id]
            
            # Ask Gemini to identify decisions in the text
            prompt = f"""
            Analyze this meeting transcript and identify any decisions made or actions decided.
            Be concise. If a decision is found, respond with:
            DECISION_FOUND: true
            TITLE: [decision title]
            DETAILS: [brief details]
            
            If no decision, respond: DECISION_FOUND: false
            
            Text: "{text}"
            """
            
            try:
                response = self.gemini.model.generate_content(prompt)
                response_text = response.text.strip()
                
                if "DECISION_FOUND: true" in response_text:
                    logger.info(f"✓ Decision detected in meeting {meeting_id}")
                    meeting.decisions_extracted.append({
                        "timestamp": datetime.now().isoformat(),
                        "text": text,
                        "extracted": response_text
                    })
            except Exception as api_error:
                logger.warning(f"Gemini API error: {str(api_error)}")
        
        except Exception as e:
            logger.error(f"❌ Decision extraction failed: {str(e)}")
    
    async def end_meeting(self, meeting_id: str) -> dict:
        """End meeting and process results"""
        try:
            if meeting_id not in self.active_meetings:
                raise ValueError(f"Meeting {meeting_id} not found")
            
            meeting = self.active_meetings[meeting_id]
            meeting.agent_active = False
            meeting.end_time = datetime.now()
            
            # Wait for recording thread to finish
            if meeting_id in self.recording_threads:
                self.recording_threads[meeting_id].join(timeout=5)
                del self.recording_threads[meeting_id]
            
            # Generate summary
            summary = self._generate_summary_sync(meeting_id)
            
            # Store in database
            if self.db:
                self._store_meeting(meeting, summary)
            
            logger.info(f"✓ Meeting ended: {meeting_id}")
            
            # Prepare result
            result = {
                "meeting_id": meeting_id,
                "duration": str(meeting.end_time - meeting.start_time),
                "transcript": meeting.transcript,
                "decisions": meeting.decisions_extracted,
                "summary": summary
            }
            
            # Remove from active meetings after storing
            del self.active_meetings[meeting_id]
            
            return result
        
        except Exception as e:
            logger.error(f"❌ Failed to end meeting: {str(e)}")
            raise
    
    def _generate_summary_sync(self, meeting_id: str) -> str:
        """Generate AI summary of meeting (synchronous)"""
        try:
            if not self.gemini:
                return "No summary available"
            
            meeting = self.active_meetings[meeting_id]
            
            prompt = f"""
            Summarize this meeting in 2-3 sentences. Focus on key decisions and action items.
            
            Title: {meeting.title}
            Participants: {', '.join(meeting.participants)}
            
            Transcript:
            {meeting.transcript}
            """
            
            try:
                response = self.gemini.model.generate_content(prompt)
                return response.text.strip()
            except Exception as api_error:
                logger.warning(f"Gemini summary generation failed: {str(api_error)}")
                return "Summary generation failed"
        
        except Exception as e:
            logger.error(f"Failed to generate summary: {str(e)}")
            return "Summary generation failed"
    
    def _store_meeting(self, meeting: MeetingSession, summary: str):
        """Store meeting data in database"""
        try:
            if not self.db:
                return
            
            with self.db.conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO meetings (
                        id, title, participants, transcript, summary, 
                        decisions_count, started_at, ended_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    meeting.meeting_id,
                    meeting.title,
                    ','.join(meeting.participants),
                    meeting.transcript,
                    summary,
                    len(meeting.decisions_extracted),
                    meeting.start_time,
                    meeting.end_time
                ))
                self.db.conn.commit()
            
            logger.info(f"✓ Meeting stored: {meeting.meeting_id}")
        
        except Exception as e:
            logger.error(f"❌ Failed to store meeting: {str(e)}")
            if self.db:
                self.db.conn.rollback()
    
    def get_meeting(self, meeting_id: str) -> Optional[MeetingSession]:
        """Get active meeting session"""
        return self.active_meetings.get(meeting_id)
    
    def get_all_active_meetings(self) -> List[MeetingSession]:
        """Get all active meetings"""
        return list(self.active_meetings.values())

# Global instance
_meeting_agent = None

def init_meeting_agent():
    """Initialize meeting agent"""
    global _meeting_agent
    try:
        _meeting_agent = MeetingAgentManager()
        logger.info("✓ Meeting Agent initialized")
    except Exception as e:
        logger.error(f"❌ Failed to initialize Meeting Agent: {str(e)}")
        _meeting_agent = None

def get_meeting_agent() -> MeetingAgentManager:
    """Get meeting agent instance"""
    if _meeting_agent is None:
        logger.error("❌ Meeting Agent not initialized")
    return _meeting_agent