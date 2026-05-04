import os
import logging
import uuid
from pathlib import Path
from typing import Dict, Any, Optional

try:
    from basic_pitch.inference import predict
    HAS_BASIC_PITCH = True
except ImportError as e:
    HAS_BASIC_PITCH = False
    print(f"Warning: basic-pitch not installed or failed to load: {e}")

try:
    import pretty_midi
    HAS_PRETTY_MIDI = True
except ImportError:
    HAS_PRETTY_MIDI = False

try:
    from pydub import AudioSegment
    HAS_PYDUB = True
except ImportError:
    HAS_PYDUB = False

try:
    from audio_separator.separator import Separator
    HAS_SEPARATOR = True
except ImportError:
    HAS_SEPARATOR = False

logger = logging.getLogger(__name__)

class SVSService:
    def __init__(self, upload_dir: str, output_dir: str):
        self.upload_dir = Path(upload_dir)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        # Store running tasks for status API
        self.tasks: Dict[str, Any] = {}

    def extract_midi_sync(self, task_id: str, file_path: str, instrument: str, lyrics: str):
        """
        Runs the extraction pipeline synchronously (should be called in a background thread).
        Phase 2 PoC:
        1. Demucs separation to get the target instrument stem.
        2. basic-pitch Audio-to-MIDI export.
        """
        logger.info(f"[{task_id}] Starting SVS extraction for instrument: {instrument}")
        
        try:
            self.tasks[task_id] = {"status": "separating", "progress": 10, "result": {}}
            
            task_output_dir = self.output_dir / task_id
            task_output_dir.mkdir(parents=True, exist_ok=True)
            
            # Step 1: Instrument Separation using Demucs 6-stem model
            if self.tasks.get(task_id, {}).get("status") == "cancelled":
                return {}

            if not HAS_SEPARATOR:
                raise ImportError("audio-separator not installed.")

            separator = Separator(
                output_dir=str(task_output_dir),
                output_format="wav"
            )
            # htdemucs_6s separates into: vocals, drums, bass, other, piano, guitar
            separator.load_model(model_filename='htdemucs_6s.yaml')
            
            logger.info(f"[{task_id}] Running separation with htdemucs_6s...")
            output_files = separator.separate(file_path)
            
            # Find the requested stem
            target_stem_path = None
            
            # Map frontend dropdown values to demucs stem identifiers
            stem_keyword_map = {
                'piano': 'piano',
                'guitar': 'guitar',
                'vocals': 'vocals',
                'other': 'other'
            }
            target_keyword = stem_keyword_map.get(instrument.lower(), 'other')
            
            logger.info(f"[{task_id}] Looking for stem containing '{target_keyword}'...")
            
            # [FUTURE: Pattern 2 - Automatic Stem Detection]
            # If target_keyword == 'auto', we can iterate through 'piano', 'guitar', 'other' stems
            # and analyze their RMS energy or frequency content using librosa or pydub.
            # The stem with the highest sustained mid-frequency energy could be selected as the melody.
            
            for fname in output_files:
                if target_keyword in fname.lower():
                    target_stem_path = task_output_dir / fname
            
            if not target_stem_path or not target_stem_path.exists():
                logger.error(f"[{task_id}] Target stem {target_keyword} not found in outputs: {output_files}")
                raise Exception(f"Stem '{target_keyword}' could not be extracted.")
                
            logger.info(f"[{task_id}] Target stem found: {target_stem_path}")
            self.tasks[task_id]["progress"] = 50
            self.tasks[task_id]["status"] = "midi_conversion"
            
            if self.tasks.get(task_id, {}).get("status") == "cancelled":
                return {}

            # Step 2: Audio-to-MIDI via basic-pitch
            midi_url = None
            midi_filepath = None
            if HAS_BASIC_PITCH:
                logger.info(f"[{task_id}] Running basic-pitch Audio-to-MIDI conversion...")
                model_output, midi_data, note_events = predict(str(target_stem_path))
                
                midi_filename = f"{task_id}_{target_keyword}_extracted.mid"
                midi_filepath = task_output_dir / midi_filename
                midi_data.write(str(midi_filepath))
                
                logger.info(f"[{task_id}] MIDI saved successfully: {midi_filepath}")
                midi_url = f"/outputs/{task_id}/{midi_filename}"
            else:
                logger.warning(f"[{task_id}] basic-pitch missing. Skipping MIDI generation.")
                
            self.tasks[task_id]["progress"] = 70
            self.tasks[task_id]["status"] = "vocal_synthesis"
            
            if self.tasks.get(task_id, {}).get("status") == "cancelled":
                return {}

            # Step 3: Vocal Synthesis (Phase 3 Implementation)
            vocal_url = None
            mix_url = None
            
            if midi_filepath and midi_filepath.exists() and lyrics:
                try:
                    vocal_path = self.synthesize_vocals(task_id, midi_filepath, lyrics, task_output_dir)
                    if vocal_path and vocal_path.exists():
                        vocal_url = f"/outputs/{task_id}/{vocal_path.name}"
                        
                        # Step 4: Final Mix
                        self.tasks[task_id]["status"] = "mixing"
                        self.tasks[task_id]["progress"] = 90
                        mix_path = self.create_final_mix(task_id, vocal_path, file_path, task_output_dir)
                        if mix_path:
                            mix_url = f"/outputs/{task_id}/{mix_path.name}"
                except Exception as e:
                    logger.error(f"[{task_id}] Synthesis or Mixing failed: {e}")
            
            # Fallback if synthesis failed or was skipped
            if not mix_url:
                mix_url = f"/outputs/{task_id}/{target_stem_path.name}"
            
            result_data = {
                "midi_url": midi_url,
                "vocal_url": vocal_url, 
                "mix_url": mix_url
            }
            
            self.tasks[task_id]["progress"] = 100
            self.tasks[task_id]["status"] = "completed"
            self.tasks[task_id]["result"] = result_data
            
            return result_data
            
        except Exception as e:
            logger.exception(f"[{task_id}] Error in SVS extraction pipeline: {e}")
            self.tasks[task_id]["status"] = "error"
            self.tasks[task_id]["error"] = str(e)
            raise e

    def synthesize_vocals(self, task_id: str, midi_path: Path, lyrics: str, output_dir: Path) -> Optional[Path]:
        """
        Main entry point for SVS synthesis.
        1. Parse MIDI notes.
        2. Assign lyrics to notes.
        3. Run SVS engine.
        """
        if not HAS_PRETTY_MIDI:
            logger.error(f"[{task_id}] pretty_midi missing. Cannot synthesize.")
            return None
            
        logger.info(f"[{task_id}] Synthesizing vocals for lyrics: {lyrics[:30]}...")
        
        # 1. Phonetic Splitting (Simple Hiranaga/Katakana/English syllable splitter)
        def split_into_syllables(text: str) -> list:
            # For now, just split by whitespace or character for Japanese
            # A more robust version would use a morphological analyzer like MeCab
            text = text.replace('\n', ' ').strip()
            # If user used spaces (like "あ い し て る"), use that
            if ' ' in text:
                return [s for s in text.split(' ') if s.strip()]
            # Otherwise, just break into individual characters (common for J-SVS PoC)
            return list(text.replace(' ', ''))

        syllables = split_into_syllables(lyrics)
        logger.info(f"[{task_id}] Split lyrics into {len(syllables)} syllables.")

        # 2. Parse MIDI
        pm = pretty_midi.PrettyMIDI(str(midi_path))
        all_notes = []
        for inst in pm.instruments:
            all_notes.extend(inst.notes)
        
        # Sort notes by start time
        all_notes.sort(key=lambda x: x.start)
        
        if not all_notes:
            logger.warning(f"[{task_id}] No MIDI notes found for synthesis.")
            return None

        # 3. Align Notes and Syllables (1 note = 1 syllable)
        aligned_data = []
        for i, note in enumerate(all_notes):
            if i < len(syllables):
                aligned_data.append({
                    "start": note.start,
                    "end": note.end,
                    "pitch": note.pitch,
                    "syllable": syllables[i]
                })
        
        # 4. Run SVS Engine (Placeholder for DiffSinger/SoulX-Singer CLI)
        # In a real implementation, we would write a project file (.ds, .ust, .json)
        # and then call the inference script.
        # For PoC, we return the synthesis output path if it was generated.
        
        vocal_out = output_dir / f"vocal_synth_{task_id}.wav"
        
        # --- SVS INFERENCE (DIFFSINGER/SOULX-SINGER) ---
        # TODO: Configure your SVS engine path here
        svs_engine_available = False # Set to True if engine script is found
        
        if svs_engine_available:
            try:
                # 1. Export MIDI/Lyric data to engine format (e.g. .ds)
                # 2. subprocess.run(["python", "infer.py", ...])
                logger.info(f"[{task_id}] Running SVS Engine inference...")
                pass
            except Exception as e:
                logger.error(f"SVS Engine failed: {e}")

        # --- FALLBACK: Sine-wave Synthesis (for PoC testing) ---
        if not vocal_out.exists():
            logger.info(f"[{task_id}] SVS Engine missing. Generating sine-wave melody fallback...")
            try:
                # Create a silent track
                sample_rate = 44100
                total_duration_ms = int(max([n.end for n in all_notes]) * 1000) + 1000
                vocal_synth = AudioSegment.silent(duration=total_duration_ms)
                
                # Simple beep synthesis for each note
                import numpy as np
                import soundfile as sf
                import io

                for note in aligned_data:
                    start_ms = int(note["start"] * 1000)
                    dur_ms = int((note["end"] - note["start"]) * 1000)
                    
                    # Generate a simple sine wave for the pitch
                    freq = 440.0 * (2.0 ** ((note["pitch"] - 69.0) / 12.0))
                    t = np.linspace(0, dur_ms / 1000.0, int(sample_rate * (dur_ms / 1000.0)), False)
                    wave = np.sin(freq * t * 2 * np.pi)
                    
                    # Fade in/out to avoid clicks
                    fade_len = int(len(wave) * 0.1)
                    wave[:fade_len] *= np.linspace(0, 1, fade_len)
                    wave[-fade_len:] *= np.linspace(1, 0, fade_len)
                    
                    # Convert to AudioSegment
                    with io.BytesIO() as wav_io:
                        sf.write(wav_io, wave, sample_rate, format='WAV')
                        wav_io.seek(0)
                        beep = AudioSegment.from_wav(wav_io)
                        vocal_synth = vocal_synth.overlay(beep, position=start_ms)
                
                vocal_synth.export(vocal_out, format="wav")
                logger.info(f"[{task_id}] Fallback sine-vocal created: {vocal_out}")
            except Exception as e:
                logger.error(f"Fallback synthesis failed: {e}")
                return None
        
        return vocal_out

    def create_final_mix(self, task_id: str, vocal_path: Path, instrumental_path: str, output_dir: Path) -> Optional[Path]:
        """
        Overlays the synthesized vocal onto the original instrumental.
        """
        if not HAS_PYDUB:
            logger.error("pydub not installed.")
            return None
            
        try:
            logger.info(f"[{task_id}] Creating final mix...")
            vocal = AudioSegment.from_file(vocal_path)
            instrumental = AudioSegment.from_file(instrumental_path)
            
            # Normalize and Mix
            # vocal = vocal + 2 # Slight boost
            combined = instrumental.overlay(vocal, position=0)
            
            mix_path = output_dir / f"final_mix_{task_id}.wav"
            combined.export(mix_path, format="wav")
            logger.info(f"[{task_id}] Final mix created: {mix_path}")
            return mix_path
        except Exception as e:
            logger.error(f"Error mixing audio: {e}")
            return None

    async def start_extraction_task(self, file_path: str, instrument: str, lyrics: str) -> str:
        """
        Starts the workflow in a background thread and returns the task ID.
        """
        task_id = f"svs_{uuid.uuid4().hex[:8]}"
        self.tasks[task_id] = {"status": "queued", "progress": 0}
        
        import asyncio
        asyncio.create_task(
            asyncio.to_thread(self.extract_midi_sync, task_id, file_path, instrument, lyrics)
        )
        return task_id

    def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """
        Returns the status and progress of a background task.
        """
        return self.tasks.get(task_id)

    def cancel_task(self, task_id: str) -> bool:
        """
        Marks a task as cancelled.
        """
        if task_id in self.tasks:
            self.tasks[task_id]["status"] = "cancelled"
            logger.info(f"[{task_id}] Task marked as cancelled.")
            return True
        return False
