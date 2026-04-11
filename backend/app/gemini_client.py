import google.generativeai as genai
import logging
from typing import List, Dict, Optional
import json

logger = logging.getLogger(__name__)

class GeminiClient:
    """Gemini LLM client for decision extraction and reasoning"""
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-pro')
        logger.info("✓ Gemini client initialized")
    
    def extract_decisions(self, text: str) -> List[Dict]:
        """Extract decisions from text using LLM"""
        try:
            prompt = f"""
            Analyze the following text and extract all decisions mentioned.
            For each decision, provide:
            1. Title (brief decision name)
            2. Status (approved, rejected, decided, pending)
            3. Description (reasoning or details)
            
            Format as JSON array:
            [
                {{
                    "title": "decision title",
                    "status": "approved/rejected/decided/pending",
                    "description": "reasoning"
                }}
            ]
            
            Text to analyze:
            {text}
            
            Return ONLY valid JSON, no other text.
            """
            
            response = self.model.generate_content(prompt)
            
            if not response.text:
                logger.warning("Empty response from Gemini")
                return []
            
            # Parse JSON response
            try:
                text_response = response.text.strip()
                if text_response.startswith('```json'):
                    text_response = text_response[7:-3]
                elif text_response.startswith('```'):
                    text_response = text_response[3:-3]
                
                decisions = json.loads(text_response)
                
                if not isinstance(decisions, list):
                    decisions = [decisions]
                
                logger.info(f"✓ Extracted {len(decisions)} decisions")
                return decisions
            
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse Gemini response: {str(e)}")
                return []
        
        except Exception as e:
            logger.error(f"❌ Decision extraction failed: {str(e)}")
            return []
    
    def generate_answer(self, question: str, context: str) -> str:
        """Generate an answer based on context"""
        try:
            prompt = f"""
            Based on the following context, answer the question.
            If the answer is not in the context, say "I don't have enough information to answer this question."
            
            Context:
            {context}
            
            Question:
            {question}
            
            Answer:
            """
            
            response = self.model.generate_content(prompt)
            
            if response.text:
                logger.info(f"✓ Generated answer for: {question[:50]}...")
                return response.text.strip()
            else:
                return "Unable to generate answer"
        
        except Exception as e:
            logger.error(f"❌ Answer generation failed: {str(e)}")
            return f"Error generating answer: {str(e)}"
    
    def detect_relationships(self, decisions: List[str]) -> List[Dict]:
        """Detect relationships between decisions"""
        try:
            decisions_text = "\n".join([f"{i+1}. {d}" for i, d in enumerate(decisions)])
            
            prompt = f"""
            Analyze the following decisions and identify any relationships between them.
            Return as JSON array with from, to, and relationship_type fields.
            
            Decisions:
            {decisions_text}
            
            Return JSON array:
            [
                {{
                    "from": "decision 1 index",
                    "to": "decision 2 index", 
                    "relationship_type": "DEPENDS_ON/BLOCKS/RELATED_TO",
                    "reason": "explanation"
                }}
            ]
            
            Return ONLY valid JSON.
            """
            
            response = self.model.generate_content(prompt)
            
            try:
                text_response = response.text.strip()
                if text_response.startswith('```json'):
                    text_response = text_response[7:-3]
                elif text_response.startswith('```'):
                    text_response = text_response[3:-3]
                
                relationships = json.loads(text_response)
                return relationships if isinstance(relationships, list) else []
            
            except json.JSONDecodeError:
                return []
        
        except Exception as e:
            logger.error(f"❌ Relationship detection failed: {str(e)}")
            return []

_gemini_client = None

def init_gemini(api_key: str):
    """Initialize Gemini client"""
    global _gemini_client
    try:
        _gemini_client = GeminiClient(api_key)
        logger.info("✓ Gemini client initialized")
    except Exception as e:
        logger.error(f"❌ Failed to initialize Gemini: {str(e)}")
        _gemini_client = None

def get_gemini_client() -> GeminiClient:
    """Get Gemini client instance"""
    if _gemini_client is None:
        logger.error("❌ Gemini client not initialized")
    return _gemini_client