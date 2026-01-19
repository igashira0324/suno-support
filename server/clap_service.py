"""
CLAP (Contrastive Language-Audio Pretraining) Service
Enables natural language search for audio segments
"""

import logging
import numpy as np
from pathlib import Path
from typing import List, Dict, Any, Optional
import librosa

logger = logging.getLogger("CLAPService")

# Global model instance (lazy loaded)
_clap_model = None
_model_loading = False

def get_clap_model():
    """Lazy load CLAP model to avoid startup delays"""
    global _clap_model, _model_loading
    
    if _clap_model is not None:
        return _clap_model
    
    if _model_loading:
        return None
    
    _model_loading = True
    try:
        import laion_clap
        logger.info("Loading CLAP model (this may take a moment on first run)...")
        _clap_model = laion_clap.CLAP_Module(enable_fusion=False)
        _clap_model.load_ckpt()  # Downloads model if not cached
        logger.info("CLAP model loaded successfully")
        return _clap_model
    except Exception as e:
        logger.error(f"Failed to load CLAP model: {e}")
        _model_loading = False
        return None


class CLAPService:
    def __init__(self):
        self.sr = 48000  # CLAP expects 48kHz audio
    
    def search_by_text(
        self, 
        audio_path: str, 
        query: str, 
        window_sec: float = 5.0,
        hop_sec: float = 2.5,
        top_k: int = 5
    ) -> Dict[str, Any]:
        """
        Search for audio segments matching a natural language query.
        
        Args:
            audio_path: Path to the audio file
            query: Natural language query (e.g., "盛り上がる歌声", "静かなパート")
            window_sec: Window size in seconds for each segment
            hop_sec: Hop size between windows
            top_k: Number of top results to return
            
        Returns:
            Dict with success status and matching segments
        """
        try:
            model = get_clap_model()
            if model is None:
                return {"success": False, "error": "CLAP model not available"}
            
            # Load audio
            y, sr = librosa.load(audio_path, sr=self.sr)
            duration = len(y) / sr
            
            # Segment the audio
            segments = []
            window_samples = int(window_sec * sr)
            hop_samples = int(hop_sec * sr)
            
            for start_sample in range(0, len(y) - window_samples, hop_samples):
                end_sample = start_sample + window_samples
                start_time = start_sample / sr
                end_time = end_sample / sr
                
                segment_audio = y[start_sample:end_sample]
                segments.append({
                    "start": start_time,
                    "end": end_time,
                    "audio": segment_audio
                })
            
            if not segments:
                return {"success": True, "results": [], "query": query}
            
            # Get text embedding
            text_embed = model.get_text_embedding([query], use_tensor=False)
            
            # Get audio embeddings and compute similarities
            results = []
            for seg in segments:
                # CLAP expects audio at 48kHz
                audio_embed = model.get_audio_embedding_from_data(
                    x=[seg["audio"]], 
                    use_tensor=False
                )
                
                # Cosine similarity
                similarity = float(np.dot(text_embed[0], audio_embed[0]) / 
                                  (np.linalg.norm(text_embed[0]) * np.linalg.norm(audio_embed[0])))
                
                results.append({
                    "start": round(seg["start"], 2),
                    "end": round(seg["end"], 2),
                    "score": round(similarity, 3)
                })
            
            # Sort by score and take top k
            results.sort(key=lambda x: x["score"], reverse=True)
            top_results = results[:top_k]
            
            # Add rank labels
            for i, r in enumerate(top_results):
                r["rank"] = i + 1
                r["label"] = self._score_to_label(r["score"])
            
            return {
                "success": True,
                "query": query,
                "duration": round(duration, 2),
                "results": top_results
            }
            
        except Exception as e:
            logger.error(f"CLAP search error: {e}")
            return {"success": False, "error": str(e)}
    
    def _score_to_label(self, score: float) -> str:
        """Convert similarity score to human-readable label"""
        if score >= 0.3:
            return "非常に高いマッチ"
        elif score >= 0.2:
            return "高いマッチ" 
        elif score >= 0.1:
            return "中程度のマッチ"
        else:
            return "低いマッチ"
    
    def get_preset_queries(self) -> List[Dict[str, str]]:
        """Return preset query options for UI"""
        return [
            {"id": "climax_vocal", "label": "盛り上がり (歌声)", "query": "exciting singing voice with high energy"},
            {"id": "quiet", "label": "静かなパート", "query": "quiet and calm music"},
            {"id": "chorus", "label": "サビ", "query": "chorus section with full energy"},
            {"id": "intro", "label": "イントロ", "query": "instrumental intro without vocals"},
            {"id": "emotional", "label": "感情的なパート", "query": "emotional and touching vocals"},
            {"id": "instrumental", "label": "間奏", "query": "instrumental break without singing"},
        ]


# Singleton instance
_service: Optional[CLAPService] = None

def get_clap_service() -> CLAPService:
    global _service
    if _service is None:
        _service = CLAPService()
    return _service
