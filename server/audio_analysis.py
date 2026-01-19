"""
Audio Analysis Service using librosa
Provides intensity curves, BPM/Key detection, and peak segment detection
"""

import librosa
import numpy as np
from pathlib import Path
from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger("AudioAnalysis")

class AudioAnalyzer:
    def __init__(self, sr: int = 22050):
        self.sr = sr
    
    def analyze(self, audio_path: str, hop_length: int = 512) -> Dict[str, Any]:
        """
        Comprehensive audio analysis
        
        Returns:
            - intensity_curve: RMS energy over time (normalized 0-1)
            - bpm: Estimated tempo
            - key: Estimated musical key
            - segments: Detected peak/climax regions
            - duration: Total duration in seconds
        """
        try:
            # Load audio
            y, sr = librosa.load(audio_path, sr=self.sr)
            duration = librosa.get_duration(y=y, sr=sr)
            
            # RMS Energy (Intensity Curve)
            rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
            rms_normalized = (rms - rms.min()) / (rms.max() - rms.min() + 1e-6)
            
            # Convert frame indices to time
            times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop_length)
            
            # Downsample for frontend (max ~500 points)
            max_points = 500
            if len(times) > max_points:
                indices = np.linspace(0, len(times) - 1, max_points, dtype=int)
                times = times[indices]
                rms_normalized = rms_normalized[indices]
            
            intensity_curve = [
                {"time": float(t), "value": float(v)} 
                for t, v in zip(times, rms_normalized)
            ]
            
            # BPM Detection
            tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
            bpm = float(tempo) if isinstance(tempo, (int, float, np.number)) else float(tempo[0])
            
            # Key Detection (Chroma-based)
            key = self._detect_key(y, sr)
            
            # Peak Segment Detection
            segments = self._detect_peak_segments(rms, sr, hop_length, duration)
            
            return {
                "success": True,
                "duration": duration,
                "bpm": round(bpm, 1),
                "key": key,
                "intensity_curve": intensity_curve,
                "segments": segments
            }
            
        except Exception as e:
            logger.error(f"Audio analysis failed: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def _detect_key(self, y: np.ndarray, sr: int) -> str:
        """Detect musical key using chroma features"""
        try:
            # Compute chroma features
            chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
            chroma_mean = np.mean(chroma, axis=1)
            
            # Key names
            key_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
            
            # Major and minor profiles (Krumhansl-Schmuckler)
            major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
            minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
            
            # Correlate with each possible key
            max_corr = -1
            best_key = "C major"
            
            for i in range(12):
                # Rotate chroma to match key
                rotated = np.roll(chroma_mean, -i)
                
                major_corr = np.corrcoef(rotated, major_profile)[0, 1]
                minor_corr = np.corrcoef(rotated, minor_profile)[0, 1]
                
                if major_corr > max_corr:
                    max_corr = major_corr
                    best_key = f"{key_names[i]} major"
                if minor_corr > max_corr:
                    max_corr = minor_corr
                    best_key = f"{key_names[i]} minor"
            
            return best_key
        except Exception as e:
            logger.warning(f"Key detection failed: {e}")
            return "Unknown"
    
    def _detect_peak_segments(
        self, 
        rms: np.ndarray, 
        sr: int, 
        hop_length: int,
        duration: float,
        threshold_percentile: float = 75,
        min_duration: float = 5.0,
        max_segments: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Detect peak/climax segments in the audio
        
        Returns list of segments with:
        - start: Start time in seconds
        - end: End time in seconds
        - intensity: Average intensity (0-1)
        - label: Human-readable label
        """
        try:
            # Normalize RMS
            rms_norm = (rms - rms.min()) / (rms.max() - rms.min() + 1e-6)
            
            # Find threshold
            threshold = np.percentile(rms_norm, threshold_percentile)
            
            # Find regions above threshold
            above_threshold = rms_norm >= threshold
            
            # Convert to time
            times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop_length)
            
            # Find contiguous regions
            segments = []
            in_segment = False
            start_idx = 0
            
            for i, above in enumerate(above_threshold):
                if above and not in_segment:
                    in_segment = True
                    start_idx = i
                elif not above and in_segment:
                    in_segment = False
                    end_idx = i
                    
                    start_time = times[start_idx]
                    end_time = times[end_idx]
                    seg_duration = end_time - start_time
                    
                    if seg_duration >= min_duration:
                        avg_intensity = float(np.mean(rms_norm[start_idx:end_idx]))
                        segments.append({
                            "start": round(start_time, 2),
                            "end": round(end_time, 2),
                            "intensity": round(avg_intensity, 2),
                            "label": self._get_intensity_label(avg_intensity)
                        })
            
            # Handle segment at end
            if in_segment:
                end_time = times[-1]
                start_time = times[start_idx]
                if end_time - start_time >= min_duration:
                    avg_intensity = float(np.mean(rms_norm[start_idx:]))
                    segments.append({
                        "start": round(start_time, 2),
                        "end": round(end_time, 2),
                        "intensity": round(avg_intensity, 2),
                        "label": self._get_intensity_label(avg_intensity)
                    })
            
            # Sort by intensity and take top N
            segments.sort(key=lambda x: x["intensity"], reverse=True)
            return segments[:max_segments]
            
        except Exception as e:
            logger.warning(f"Peak detection failed: {e}")
            return []
    
    def _get_intensity_label(self, intensity: float) -> str:
        """Convert intensity value to human-readable label"""
        if intensity >= 0.9:
            return "クライマックス"
        elif intensity >= 0.75:
            return "盛り上がり (高)"
        elif intensity >= 0.6:
            return "盛り上がり (中)"
        else:
            return "やや盛り上がり"


# Singleton instance
_analyzer: Optional[AudioAnalyzer] = None

def get_analyzer() -> AudioAnalyzer:
    global _analyzer
    if _analyzer is None:
        _analyzer = AudioAnalyzer()
    return _analyzer
