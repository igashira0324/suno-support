import logging
import torch
from typing import Optional, Dict, List

logger = logging.getLogger("SunoArchitect.WhisperService")

class WhisperService:
    _instance = None

    def __init__(self):
        self.model = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _load_model(self):
        if self.model is None:
            try:
                import whisper
                logger.info(f"Loading Whisper model on {self.device}...")
                self.model = whisper.load_model("base", device=self.device)
            except ImportError:
                logger.error("openai-whisper not installed. Please run: pip install openai-whisper")
                raise Exception("Whisper model not available")

    def transcribe(self, audio_path: str, language: Optional[str] = None) -> Dict:
        self._load_model()
        try:
            logger.info(f"Transcribing {audio_path}...")
            result = self.model.transcribe(audio_path, language=language)
            return result
        except Exception as e:
            logger.error(f"Transcription failed: {e}")
            raise e

def get_whisper_service():
    return WhisperService.get_instance()
