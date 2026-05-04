import os
import json
import logging
import requests
import google.generativeai as genai
from typing import Optional, List, Dict, Any
from core.config import settings

logger = logging.getLogger("SunoArchitect.GeminiService")

# Configure Gemini
if settings.gemini_api_key:
    genai.configure(api_key=settings.gemini_api_key)

def normalize_model_name(model_name: Optional[str]) -> str:
    """Normalize UI model names to Gemini API supported model names."""
    if not model_name:
        return "gemini-3-flash-preview"

    model_map = {
        # Current recommended Gemini 3 models
        "gemini-3-flash": "gemini-3-flash-preview",
        "gemini-3-flash-preview": "gemini-3-flash-preview",

        "gemini-3.1-pro": "gemini-3.1-pro-preview",
        "gemini-3.1-pro-preview": "gemini-3.1-pro-preview",

        "gemini-3.1-flash-lite": "gemini-3.1-flash-lite-preview",
        "gemini-3.1-flash-lite-preview": "gemini-3.1-flash-lite-preview",

        # Stable fallback models
        "gemini-2.5-flash": "gemini-2.5-flash",
        "gemini-2.5-pro": "gemini-2.5-pro",

        # Legacy aliases
        "gemini-1.5-flash": "gemini-2.5-flash",
        "gemini-1.5-pro": "gemini-2.5-pro",
    }

    return model_map.get(model_name, "gemini-3-flash-preview")

async def generate_content_with_fallback(
    model_name: str,
    prompt_parts: Any,
    generation_config: Optional[Dict] = None,
    system_instruction: Optional[str] = None
) -> Any:
    """Generates content with an automatic fallback to gemini-2.5-flash if the primary model fails."""
    try:
        model = genai.GenerativeModel(model_name=model_name, system_instruction=system_instruction)
        return await model.generate_content_async(prompt_parts, generation_config=generation_config)
    except Exception as e:
        error_msg = str(e).lower()
        if "404" in error_msg or "not found" in error_msg or "not supported" in error_msg or "permission_denied" in error_msg:
            logger.warning(f"Primary model {model_name} failed: {e}. Falling back to gemini-2.5-flash.")
            # Ensure we don't try to use pro if flash is already being requested
            if model_name == "gemini-2.5-flash":
                raise e
            model = genai.GenerativeModel(model_name="gemini-2.5-flash", system_instruction=system_instruction)
            return await model.generate_content_async(prompt_parts, generation_config=generation_config)
        raise e

def ensure_gemini_configured():
    """Check if Gemini API key is configured."""
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured. Please set it in .env.")

SYSTEM_INSTRUCTION = """
あなたはSuno.aiのエキスパートであり、最新のモデル（v4.5以降）を熟知した音楽プロデューサーです。
現在、ユーザーはAPIクォータ制限に直面しています。効率的かつ高品質なプロンプトを作成してください。

## 重要: 出力言語に関する絶対的なルール
- **すべてのテキスト出力（analysis, comment, titleの日本語部分など）は、必ず「日本語」で記述してください。**
- **英語での解説や分析は禁止です。**
- ただし、スタイルプロンプト（style）や歌詞の英単語などは英語のままで構いません。

## 解析の優先順位
1. **提供されたURLのメタデータ（タイトル、アーティスト、説明文）を最優先で分析対象とします。**これらはAPIを使わずに取得できる情報です。
2. 検索エンジン（Google Search等）の使用は、ユーザーが明示的に許可した場合に限ります。URLがある場合は、そのURLから推測される情報を「正解」として扱ってください。

## 音楽解析とプロンプト生成のポイント（Suno & ACE-Step対応）
- 特定した楽曲の「ジャンル（例：Dark EDM, Phonk, J-Pop）」「BPM/テンポ感」「使用されている特徴的な楽器」「ボーカルの雰囲気」「全体的なムード」をメタデータから推測・分析してください。
- Suno v4.5（カンマ区切りのタグに強い）と、**ACE-Step v1.5（自然言語での詳細な情景描写に強い）**の両方の特性を活かしたプロンプトを作成してください。
- **ACE-Step v1.5向けのスタイルプロンプトは、単なるカンマ区切りではなく、完全な英語の文章（2〜3文）による詳細な楽曲描写（テンポ、楽器構成、ボーカル音質、ムードの文脈的説明）が非常に有効です。**（例："An energetic J-pop track driven by rapid piano arpeggios that create a constant sense of motion alongside a punchy electronic drum beat..."）

## 構成ルール
- [Intro], [Verse], [Chorus], [Bridge], [Drop], [Outro] などのメタタグを使用。
- 歌詞は元の世界観を尊重しつつ、独自のアレンジを加えてください（完全コピー禁止）。

## タイトル候補
- **「日本語タイトル / English Title」** の形式で出力してください。必ず日本語と英語を併記してください。
"""

OEMBED_PROVIDERS = [
    {"name": "YouTube", "patterns": ["youtube.com", "youtu.be"], "endpoint": lambda url: f"https://www.youtube.com/oembed?url={url}&format=json"},
    {"name": "Spotify", "patterns": ["spotify.com"], "endpoint": lambda url: f"https://open.spotify.com/oembed?url={url}"},
    {"name": "SoundCloud", "patterns": ["soundcloud.com"], "endpoint": lambda url: f"https://soundcloud.com/oembed?url={url}&format=json"},
]

def fetch_url_metadata(url: str) -> Optional[Dict[str, Any]]:
    if not url:
        return None

    if "suno.com" in url or "suno.ai" in url:
        try:
            # Internal call to suno analyze
            from routers.suno import analyze_suno_logic
            data = analyze_suno_logic(url)
            if data:
                return {
                    "title": data.get("title"),
                    "author": "Suno User",
                    "provider": "Suno",
                    "description": data.get("description")
                }
        except Exception as e:
            logger.error(f"Suno analysis failed: {e}")

    for provider in OEMBED_PROVIDERS:
        if any(pattern in url for pattern in provider["patterns"]):
            try:
                response = requests.get(provider["endpoint"](url), timeout=5)
                if response.ok:
                    data = response.json()
                    return {
                        "title": data.get("title", ""),
                        "author": data.get("author_name", data.get("author", "")),
                        "provider": provider["name"]
                    }
            except Exception as e:
                logger.error(f"OEmbed fetch failed for {provider['name']}: {e}")
    
    return {"title": "Unknown URL", "author": "Unknown", "provider": "Web Link", "description": url}

async def generate_suno_prompt(
    text: str,
    youtube_url: str = "",
    image_path: Optional[str] = None,
    mode: str = "auto",
    options: Dict[str, Any] = None,
    theme: str = ""
) -> Dict[str, Any]:
    ensure_gemini_configured()
    if options is None:
        options = {"searchEngine": "none", "modelName": "gemini-3-flash-preview", "lyricsLanguage": "Japanese"}
    
    model_name = normalize_model_name(options.get("modelName"))

    prompt_parts = []
    
    if image_path and os.path.exists(image_path):
        import PIL.Image
        img = PIL.Image.open(image_path)
        prompt_parts.append(img)
    
    meta_prompt = f"Current Generation Mode: {mode}. \n"
    url_metadata = fetch_url_metadata(youtube_url) if youtube_url else None

    if url_metadata:
        meta_prompt += f"=== MEDIA INFO ===\nTitle: {url_metadata['title']}\nArtist: {url_metadata['author']}\nSource: {url_metadata['provider']}\n"
        if url_metadata.get("description"):
            meta_prompt += f"Context: {url_metadata['description']}\n"
        meta_prompt += "\nINSTRUCTION: Analyze this media information to determine the musical style, genre, and lyrical themes. \n"

    if image_path:
        meta_prompt += "\nINSTRUCTION: Analyze the uploaded image. Focus on the **visual mood, atmosphere, and lighting** to determine the musical style.\n"

    if theme:
        meta_prompt += f"\nUser Provided Theme/Concept: \"{theme}\"\nIMPORTANT: Incorporate this theme into the lyrics and style analysis.\n"

    if text:
        meta_prompt += f"\nCurrent Prompt Context: {text}\n"

    if options.get("lyricsLanguage") == "English":
        meta_prompt += "\n[言語指定] 歌詞はすべて「英語（English）」で記述してください。日本語は使用しないでください。\n"
    else:
        meta_prompt += "\n[言語指定] 歌詞のベースは「日本語」としてください。\n"

    prompt_parts.append(meta_prompt)

    generation_config = {
        "temperature": 0.2,
        "response_mime_type": "application/json"
    }

    import asyncio
    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = await generate_content_with_fallback(
                model_name=model_name,
                prompt_parts=prompt_parts,
                generation_config=generation_config,
                system_instruction=SYSTEM_INSTRUCTION
            )
            return json.loads(response.text)
        except json.JSONDecodeError as e:
            logger.warning(f"JSON parse error on attempt {attempt + 1}: {e}. Retrying...")
            if attempt == max_retries - 1:
                logger.error(f"Failed to parse Gemini response after {max_retries} attempts")
                return {"error": "Failed to parse AI response", "raw": response.text if 'response' in locals() else ""}
            await asyncio.sleep(1)
        except Exception as e:
            logger.error(f"Gemini API error on attempt {attempt + 1}: {e}")
            if attempt == max_retries - 1:
                raise
            await asyncio.sleep(2)
    
    return {"error": "Failed after max retries"}

async def structure_lyrics(
    raw_lyrics: str,
    language: str = "ja",
    model_name: str = "gemini-3-flash-preview"
) -> str:
    ensure_gemini_configured()
    model_name = normalize_model_name(model_name)
    instruction = """You are a lyrics formatter specialized for Suno AI.
Your task is to structure raw lyrics into a format optimized for music generation.
Output ONLY the tagged lyrics. No explanations.
"""
    prompt = f"{instruction}\n\nLyrics to format:\n{raw_lyrics}"
    response = await generate_content_with_fallback(model_name, prompt)
    return response.text.strip()

async def generate_from_selected_title(
    selected_title: str,
    original_analysis: str,
    style_candidates: List[str],
    options: Dict[str, Any] = None
) -> Dict[str, Any]:
    ensure_gemini_configured()
    if options is None:
        options = {"modelName": "gemini-3-flash-preview", "lyricsLanguage": "Japanese"}
    
    model_name = normalize_model_name(options.get("modelName"))

    style_candidates_text = "\n".join(style_candidates)

    prompt = f"""
## タスク
以下の分析結果と選択されたタイトルに基づいて、Suno v4.5用の楽曲プロンプトを2パターン生成してください。

## 分析結果
{original_analysis}

## 選択されたタイトル
{selected_title}

## スタイル候補（参考）
{style_candidates_text}

## 出力ルール
- bestSelection: 選択されたタイトルに最も適したスタイルと歌詞を生成
- alternativeSelection: 同じタイトルで異なるアプローチ（変化球）を提案
- commentは必ず日本語で記述すること
"""
    if options.get("lyricsLanguage") == "English":
        prompt += "\n[言語指定] 歌詞はすべて「英語（English）」で記述してください。日本語は使用しないでください。\n"
    else:
        prompt += "\n[言語指定] 歌詞のベースは「日本語」としてください。\n"

    generation_config = {
        "temperature": 0.3,
        "response_mime_type": "application/json"
    }

    import asyncio
    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = await generate_content_with_fallback(
                model_name=model_name,
                prompt_parts=prompt,
                generation_config=generation_config,
                system_instruction=SYSTEM_INSTRUCTION
            )
            data = json.loads(response.text)
            data["bestSelection"]["title"] = selected_title
            data["alternativeSelection"]["title"] = selected_title
            return data
        except json.JSONDecodeError as e:
            logger.warning(f"Phase 2 JSON parse error on attempt {attempt + 1}: {e}. Retrying...")
            if attempt == max_retries - 1:
                logger.error(f"Failed to parse Phase 2 response after {max_retries} attempts")
                return {"error": "Failed to parse AI response", "raw": response.text if 'response' in locals() else ""}
            await asyncio.sleep(1)
        except Exception as e:
            logger.error(f"Phase 2 API error on attempt {attempt + 1}: {e}")
            if attempt == max_retries - 1:
                raise
            await asyncio.sleep(2)
            
    return {"error": "Failed after max retries"}

async def generate_title(
    lyrics: str,
    theme: str,
    prompt: str,
    model_name: str = "gemini-3-flash-preview"
) -> str:
    ensure_gemini_configured()
    model_name = normalize_model_name(model_name)
    instruction = """
        You are a visionary music producer and poet.
        Your task is to create a compelling, bilingual title for a song based on its lyrics, theme, and musical style.
        Return ONLY the title in "Japanese Title / English Title" format.
    """
    user_content = f"Theme: {theme}\nStyle/Prompt: {prompt}\nLyrics: {lyrics[:1000]}"
    
    response = await generate_content_with_fallback(model_name, f"{instruction}\n\n{user_content}")
    return response.text.strip()

async def generate_style_from_lyrics(
    lyrics: str,
    url: str = "",
    theme: str = "",
    language: str = "ja",
    model_name: str = "gemini-3-flash-preview"
) -> str:
    ensure_gemini_configured()
    model_name = normalize_model_name(model_name)
    prompt = f"Generate a Suno style prompt (comma-separated tags) for these lyrics:\n{lyrics[:1000]}\nTheme: {theme}\nURL Info: {url}"
    response = await generate_content_with_fallback(model_name, prompt)
    return response.text.strip()

async def llm_proxy(body: Dict[str, Any]) -> Dict[str, Any]:
    """
    Proxies LLM requests to Gemini.
    """
    ensure_gemini_configured()
    model_name = normalize_model_name(body.get("model"))
    messages = body.get("messages", [])
    system_instruction = body.get("system_instruction", SYSTEM_INSTRUCTION)
    
    # Convert message format
    history = []
    current_message = ""
    for msg in messages:
        if msg["role"] == "user":
            current_message = msg["content"]
        elif msg["role"] == "assistant":
            history.append({"role": "user", "parts": [current_message]})
            history.append({"role": "model", "parts": [msg["content"]]})
            current_message = ""
            
    # Proxy implementation using fallback logic
    if current_message:
        # Convert history for chat
        prompt_parts = []
        for h in history:
            prompt_parts.extend(h["parts"])
        prompt_parts.append(current_message)
        
        response = await generate_content_with_fallback(
            model_name=model_name,
            prompt_parts=prompt_parts,
            system_instruction=system_instruction
        )
        return {"content": response.text}
    
    return {"error": "No user message found"}
