import { GoogleGenAI, Type, Schema } from "@google/genai";
import { SunoResponse, GenerationMode, GroundingSource, SearchEngine } from "../types";
import { fileToGenerativePart } from "../utils";

const SYSTEM_INSTRUCTION = `
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
`;

const continuityNotesSchema = {
    type: Type.OBJECT,
    properties: {
        character: { type: Type.STRING, description: "キャラクターの外見・衣装の連続性" },
        color_shift: { type: Type.STRING, description: "前のシーンからの色調変化" },
        key_object_carry: { type: Type.STRING, description: "シーン間で引き継ぐ重要なオブジェクト" },
    },
    required: ["character", "color_shift", "key_object_carry"],
};

const sceneSchema = {
    type: Type.OBJECT,
    properties: {
        scene_number: { type: Type.INTEGER },
        scene_name: { type: Type.STRING },
        timestamp: { type: Type.STRING, description: "e.g. 0s - 10s" },
        section: { type: Type.STRING, description: "e.g. Intro, Verse 1, Chorus" },
        lyrics_excerpt: { type: Type.STRING },
        prompt_en: { type: Type.STRING, description: "English visual prompt for i2v generation" },
        camera: { type: Type.STRING, description: "e.g. slow zoom, tracking shot, pan" },
        effect: { type: Type.STRING, description: "e.g. lens flare, particle effects" },
        color_palette: { type: Type.STRING, description: "e.g. deep purple, neon cyan" },
        genspark_prompt: { type: Type.STRING, description: "Rich static image prompt (3+ sentences) integrating prompt_en + color_palette + static effects + '16:9 cinematic composition.' No camera movement terms." },
        continuity_notes: continuityNotesSchema,
        mood: { type: Type.STRING, description: "Scene mood/atmosphere in English only (e.g. 'Melancholic, mysterious', 'Energetic, triumphant'). Never use Japanese." },
    },
    required: ["scene_number", "scene_name", "timestamp", "section", "lyrics_excerpt", "prompt_en", "camera", "effect", "color_palette", "genspark_prompt", "continuity_notes", "mood"],
};

const timelineSchema = {
    type: Type.OBJECT,
    properties: {
        scenes: { type: Type.ARRAY, items: sceneSchema },
        evaluation_criteria: {
            type: Type.OBJECT,
            properties: {
                must_include: { type: Type.STRING, description: "全体を通して必須のビジュアル要素" },
                style_consistency: { type: Type.STRING, description: "e.g. Dark cyberpunk aesthetic throughout" },
                color_evolution: { type: Type.ARRAY, items: { type: Type.STRING }, description: "色調の変遷 e.g. [dark blue, neon purple, warm gold]" },
                aspect_ratio: { type: Type.STRING, description: "e.g. 16:9" },
                negative_prompt: { type: Type.STRING, description: "生成を避けるべき要素" },
                quality_threshold: { type: Type.INTEGER },
                max_retries: { type: Type.INTEGER },
            },
            required: ["must_include", "style_consistency", "color_evolution", "aspect_ratio", "negative_prompt", "quality_threshold", "max_retries"],
        },
    },
    required: ["scenes", "evaluation_criteria"],
};

const selectionSchema = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING, description: "日本語タイトル / English Title のバイリンガル形式" },
        style: { type: Type.STRING },
        instrumental: { type: Type.BOOLEAN },
        content: { type: Type.STRING, description: "v4.5メタタグを使用した完全な歌詞または構成" },
        comment: { type: Type.STRING, description: "音楽的な選択についての簡潔な説明。**必ず日本語で記述すること。**" },
        timeline: timelineSchema,
    },
    required: ["title", "style", "instrumental", "content", "comment", "timeline"],
};

const responseSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        analysis: { type: Type.STRING, description: "楽曲分析。**必ず日本語で記述すること。**タイトル/アーティストの特定から始める" },
        titleCandidates: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Exactly 5 bilingual titles.",
        },
        styleCandidates: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Exactly 5 different style prompts. 少なくとも2つはSuno向けの「カンマ区切りのタグ形式」、残りの3つはACE-Step v1.5向けの「完全な英語の文章（2〜3文）による詳細な楽曲描写（テンポ、楽器、ボーカル、ムードの文脈的説明）」を含めてください。",
        },
        bestSelection: { ...selectionSchema },
        alternativeSelection: { ...selectionSchema },
    },
    required: ["analysis", "titleCandidates", "styleCandidates", "bestSelection", "alternativeSelection"],
};

// ... (OEMBED_PROVIDERS definitions remain the same, kept brief for update) ...
const OEMBED_PROVIDERS = [
    { name: 'YouTube', patterns: [/youtube\.com/, /youtu\.be/], endpoint: (url: string) => `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json` },
    { name: 'Spotify', patterns: [/spotify\.com/], endpoint: (url: string) => `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}` },
    { name: 'SoundCloud', patterns: [/soundcloud\.com/], endpoint: (url: string) => `https://soundcloud.com/oembed?url=${encodeURIComponent(url)}&format=json` },
    // Suno logic handled specially
];

const fetchUrlMetadata = async (url: string): Promise<{ title: string; author: string; provider: string; description?: string } | null> => {
    if (!url) return null;

    if (url.includes("suno.com") || url.includes("suno.ai")) {
        try {
            const response = await fetch('http://localhost:8100/suno/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url })
            });
            if (response.ok) {
                const data = await response.json();
                return {
                    title: data.title,
                    author: "Suno User",
                    provider: data.provider,
                    description: data.description
                };
            }
        } catch (e) {
            console.error("Suno backend analysis failed", e);
        }
    }

    const provider = OEMBED_PROVIDERS.find(p => p.patterns.some(pattern => pattern.test(url)));

    // Fallback for non-oembed URLs or if provider fails, assuming generic scraping isn't available on frontend easily without CORS
    // Ideally we would move ALL URL fetching to backend to avoid CORS, but for now we try oembed where supported.
    if (!provider) return { title: 'Unknown URL', author: 'Unknown', provider: 'Web Link', description: url };

    try {
        const response = await fetch(provider.endpoint(url));
        if (!response.ok) return null;
        const data = await response.json();
        return {
            title: data.title || '',
            author: data.author_name || data.author || '',
            provider: provider.name
        };
    } catch (error) {
        return null;
    }
};

export const generateSunoPrompt = async (
    text: string,
    youtubeUrl: string,
    file: File | null,
    mode: GenerationMode = GenerationMode.AUTO,
    options: { searchEngine: SearchEngine; modelName: string; enableVideoAnalysis?: boolean; lyricsLanguage?: string } = { searchEngine: 'google-grounding', modelName: 'gemini-3-flash-preview', enableVideoAnalysis: false, lyricsLanguage: 'Japanese' },
    theme: string = ""
): Promise<SunoResponse> => {
    try {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : '');
        if (!apiKey) throw new Error("API Key is missing. Please set VITE_GEMINI_API_KEY in .env");

        const genAI = new GoogleGenAI({ apiKey: apiKey });

        // Use the model selected by user, default to gemini-3-flash
        const modelName = options.modelName || "gemini-3-flash-preview";


        const parts: any[] = [];
        if (file) {
            parts.push(await fileToGenerativePart(file));
        }

        let prompt = `Current Generation Mode: ${mode}. \n`;
        const urlMetadata = youtubeUrl ? await fetchUrlMetadata(youtubeUrl) : null;

        if (urlMetadata) {
            prompt += `=== MEDIA INFO ===\nTitle: ${urlMetadata.title}\nArtist: ${urlMetadata.author}\nSource: ${urlMetadata.provider}\n`;
            if (urlMetadata.description) prompt += `Context: ${urlMetadata.description}\n`;
            prompt += `\nINSTRUCTION: Analyze this media information to determine the musical style, genre, and lyrical themes. \n`;
        }

        if (file) {
            prompt += `\nINSTRUCTION: Analyze the uploaded image. Focus on the **visual mood, atmosphere, and lighting** to determine the musical style. 
             If the image is dark/cyberpunk, suggest industrial/electronic styles. If it's bright/nature, suggest acoustic/ambient styles.
             Reflect the visual "vibe" in the Song Description and Lyrics.\n`;
        }

        if (theme) {
            prompt += `\nUser Provided Theme/Concept: "${theme}"\nIMPORTANT: Incorporate this theme into the lyrics and style analysis. Combine it with the visual information if an image is provided.\n`;
        }

        if (text) prompt += `\nCurrent Prompt Context: ${text}\n`;

        if (options.lyricsLanguage === 'English') {
            prompt += `\n[言語指定] 歌詞はすべて「英語（English）」で記述してください。日本語は使用しないでください。\n`;
        } else {
            prompt += `\n[言語指定] 歌詞のベースは「日本語」としてください。ただし、サビやフレーズの一部に自然な英語が混ざるのは問題ありません（むしろ推奨されます）。\n`;
        }

        parts.push({ text: prompt });

        const config: any = {
            systemInstruction: SYSTEM_INSTRUCTION,
            // Custom Config Logic: validation fails if responseMimeType is set with tools
            responseSchema: responseSchema,
            temperature: 0.2,
        };

        // Only use Google Search if EXPLICITLY requested
        if (options.searchEngine === 'google-grounding') {
            config.tools = [{ googleSearch: {} }];
            // JSON mode is incompatible with tools in some versions, so we rely on text output
            delete config.responseMimeType;
        } else {
            config.responseMimeType = "application/json";
        }

        // Retry logic for 503 Overloaded
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount <= maxRetries) {
            try {
                const result = await genAI.models.generateContent({
                    model: modelName,
                    contents: { parts: parts },
                    config: config,
                });

                if (!result.text) throw new Error("AI returned empty response.");

                let textResponse = result.text;
                // If tools were used, the response might be wrapped in markdown json blocks
                if (options.searchEngine === 'google-grounding') {
                    textResponse = textResponse.replace(/^```json\s*/, "").replace(/\s*```$/, "");
                }

                const jsonResponse = JSON.parse(textResponse) as SunoResponse;

                // Extract token usage if available
                if (result.usageMetadata) {
                    jsonResponse.tokenUsage = {
                        promptTokenCount: result.usageMetadata.promptTokenCount || 0,
                        candidatesTokenCount: result.usageMetadata.candidatesTokenCount || 0,
                        totalTokenCount: result.usageMetadata.totalTokenCount || 0,
                    };
                }

                return jsonResponse;

            } catch (error: any) {
                // Check if error is 503 or related to overload
                const isOverloaded = error.message?.includes('503') || error.message?.includes('overloaded') || error.status === 503;

                if (isOverloaded && retryCount < maxRetries) {
                    retryCount++;
                    const waitTime = Math.pow(2, retryCount) * 1000; // Exponential backoff: 2s, 4s, 8s
                    console.log(`Model overloaded. Retrying in ${waitTime}ms... (Attempt ${retryCount}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    continue;
                }

                throw error;
            }
        }

        throw new Error("Failed after max retries due to model overload.");
    } catch (error: any) {
        console.error("Gemini API Error:", error);
        throw error;
    }
};

// Phase 2: Generate content based on selected title
const phase2Schema: Schema = {
    type: Type.OBJECT,
    properties: {
        bestSelection: { ...selectionSchema },
        alternativeSelection: { ...selectionSchema },
    },
    required: ["bestSelection", "alternativeSelection"],
};

export const generateFromSelectedTitle = async (
    selectedTitle: string,
    originalAnalysis: string,
    styleCandidates: string[],
    options: { modelName: string; lyricsLanguage?: string } = { modelName: 'gemini-3-flash-preview', lyricsLanguage: 'Japanese' }
): Promise<{ bestSelection: any; alternativeSelection: any; tokenUsage?: any }> => {
    try {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : '');
        if (!apiKey) throw new Error("API Key is missing. Please set VITE_GEMINI_API_KEY in .env");

        const genAI = new GoogleGenAI({ apiKey: apiKey });
        const modelName = options.modelName || "gemini-3-flash-preview";

        let prompt = `
// ... (omitted)

export const generateTitle = async (
    lyrics: string,
    theme: string,
    prompt: string,
    modelName: string = 'gemini-3-flash-preview'
): Promise<string> => {
## タスク
以下の分析結果と選択されたタイトルに基づいて、Suno v4.5用の楽曲プロンプトを2パターン生成してください。

## 分析結果
${originalAnalysis}

## 選択されたタイトル
${selectedTitle}

## スタイル候補（参考）
${styleCandidates.join('\n')}

## 出力ルール
- bestSelection: 選択されたタイトルに最も適したスタイルと歌詞を生成
- alternativeSelection: 同じタイトルで異なるアプローチ（変化球）を提案
- commentは必ず日本語で記述すること

## MV Scene Prompts (Timeline) 生成ルール（必須）
各selectionに必ず "timeline" オブジェクトを含めてください。

### タイムライン構成:
- 楽曲の構成（Intro/Verse/Chorus/Bridge/Outro等）に合わせて**8〜15シーン**を生成
- 各シーンのtimestampは短い文字列（e.g. "0s - 10s"）で、Intro は短く（3-10秒）、Verse/Chorus は長く（15-30秒）に設定すること

### 各シーンの必須フィールド:
- **prompt_en**: 英語のビジュアルプロンプト（i2v生成エンジン用）。映画的で具体的な描写（e.g. "A silhouette walks through neon-lit rain, dramatic lighting, cold blue glow"）を含むこと
- **camera**: カメラワーク（e.g. slow zoom, tracking shot, close-up）。これはi2v動画生成エンジンで使用されるため最重要
- **genspark_prompt**: 簡潔なGenspark用プロンプト。Continuity Notesは絶対に含めないこと
- **continuity_notes**: 映像間の一貫性を保証する際の基準となるため、前のシーンからの引き継ぎ情報を記述

### Genspark Promptの生成ルール（最重要・厳守）:
genspark_prompt は画像生成AIに渡す最終プロンプトです。以下の4要素を統合した、高品質な静止画プロンプトを生成してください。

**統合する情報源（必須）:**
1. prompt_en の描写内容（メインの情報源として完全に流用）
2. color_palette の色情報（明示的に色調を記述）
3. effect のうち静的な視覚効果のみ（rain, glow, particles, lens flare 等はOK）
4. 末尾に必ず "16:9 cinematic composition." を付加する

**構図の表現（必須）:**
- camera フィールドの動的表現を静止画の画角に変換すること
  - wide shot, close-up, medium shot, low angle, high angle, over-the-shoulder 等で表現
  - "slow zoom", "tracking", "pan", "dolly" 等の動きそのものは記述しない

**最低品質基準（3文以上）:**
- 第1文：被写体の外見的特徴と姿勢・表情の詳細描写
- 第2文：背景/環境の詳細描写（場所、照明、雰囲気）
- 第3文：色調・ライティング・静的エフェクトの指示 + 構図

**良い例（3文構成）:**
"A lone young woman with long dark hair and a flowing coat stands silhouetted against a vast, rain-slicked cyberpunk city at night. Neon signs reflect in puddles, casting deep blue and neon purple hues across the wet streets with subtle lens flare from distant signs. Deep blue, neon purple color grading with gentle rain particles throughout the scene. Wide shot, 16:9 cinematic composition."

**絶対に含めてはいけない表現:**
- カメラ移動: zoom, pan, tracking, dolly, crane, rotation, tilt, pull back
- 編集手法: montage, quick cuts, rapid cuts, crossfade, transitions
- 動的演出: slow motion, speed lines, animated

**動画的シーン（モンタージュ等）の変換:**
- prompt_en に "montage" や "quick cuts" が含まれていても、genspark_prompt では「その瞬間の最も印象的な1枚」に変換すること
- 例: "Montage of quick cuts: crumbling city, resolute face" → "A resolute young woman stands amid a crumbling cityscape..."

- Continuity Notes や Mood は絶対に含めないこと

### evaluation_criteria:
- must_include: 全体で必須のビジュアル要素（e.g. 「ネオンライト」「雨」）
- style_consistency: 全体の統一スタイル（e.g. Dark cyberpunk aesthetic throughout）
- color_evolution: 色調遷移を配列で記述（e.g. ["deep blue", "neon purple", "warm gold"]）
- aspect_ratio: "16:9"
- negative_prompt: 生成を避けるべき要素を記述。末尾にピリオドを含めないでください
- quality_threshold: 7
- max_retries: 2

## mood フィールドの言語ルール（厳守）
- mood は必ず**英語のみ**で記述すること（e.g. "Melancholic, mysterious", "Energetic, triumphant"）
- 日本語（e.g. "孤独、絶望"）は使用禁止。後段のGemini評価パイプラインとの整合性のため、英語に統一する
`;

        if (options.lyricsLanguage === 'English') {
            prompt += `\n[言語指定] 歌詞はすべて「英語（English）」で記述してください。日本語は使用しないでください。\n`;
        } else {
            prompt += `\n[言語指定] 歌詞のベースは「日本語」としてください。ただし、サビやフレーズの一部に自然な英語が混ざるのは問題ありません（むしろ推奨されます）。\n`;
        }

        const config: any = {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: "application/json",
            responseSchema: phase2Schema,
            temperature: 0.3,
        };

        const result = await genAI.models.generateContent({
            model: modelName,
            contents: { parts: [{ text: prompt }] },
            config: config,
        });

        if (!result.text) throw new Error("AI returned empty response.");

        const jsonResponse = JSON.parse(result.text);

        // Ensure the selected title is used
        jsonResponse.bestSelection.title = selectedTitle;
        jsonResponse.alternativeSelection.title = selectedTitle;

        if (result.usageMetadata) {
            jsonResponse.tokenUsage = {
                promptTokenCount: result.usageMetadata.promptTokenCount || 0,
                candidatesTokenCount: result.usageMetadata.candidatesTokenCount || 0,
                totalTokenCount: result.usageMetadata.totalTokenCount || 0,
            };
        }

        return jsonResponse;
    } catch (error: any) {
        console.error("Gemini API Error (Phase 2):", error);
        throw error;
    }
};

export const generateTitle = async (
    lyrics: string,
    theme: string,
    prompt: string,
    modelName: string = 'gemini-3-flash-preview'
): Promise<string> => {
    try {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : '');
        if (!apiKey) throw new Error("API Key is missing. Please set VITE_GEMINI_API_KEY in .env");

        const genAI = new GoogleGenAI({ apiKey: apiKey });

        const instruction = `
            You are a visionary music producer and poet.
            Your task is to create a compelling, bilingual title for a song based on its lyrics, theme, and musical style.
            
            ## Input Analysis
            - **Theme**: The core subject or feeling.
            - **Style/Prompt**: The musical genre and atmosphere.
            - **Lyrics**: The actual words of the song (or structure).

            ## Generation Rules
            1. **Bilingual Output**: You MUST output the title in "Japanese Title / English Title" format.
            2. **Creative & Evocative**: Avoid generic titles (like "Cyberpunk Song"). Create something that captures the *emotion* and *imagery* of the track.
               - Bad: "Sad Song / 悲しい歌"
               - Good: "Tears in the Rain / 雨の中の涙"
               - Good: "Neon Heartbeat / ネオンの鼓動"
            3. **Context Aware**: If the lyrics contain a strong hook or recurring phrase, consider using it.
            4. **No Fluff**: Return ONLY the title string. No "Here is the title:", no quotes.

            ## Output Format
            [Japanese Title] / [English Title]
        `;

        const userContent = `
            Please generate a title for this track:
            
            Theme: ${theme}
            Style/Prompt: ${prompt}
            Lyrics (excerpt):
            ---
            ${lyrics.substring(0, 800)}
            ---
        `;

        const result = await genAI.models.generateContent({
            model: modelName,
            contents: {
                parts: [
                    { text: instruction },
                    { text: userContent }
                ]
            },
            config: {
                temperature: 0.8, // Slightly higher creativity
                maxOutputTokens: 60,
            }
        });

        const title = result.text ? result.text.trim() : "Untitled Song / 無題";

        // Final cleanup to ensure format
        if (!title.includes("/")) {
            // If AI failed to provide separator, return as is (or could try to detect lang)
            return title;
        }
        return title;

    } catch (e) {
        console.error("Title generation failed:", e);
        return "Generated Song / 生成された楽曲";
    }
};

// Local LLM (OpenAI Compatible) Client
const callLocalLLM = async (messages: any[], temperature: number = 0.3): Promise<string | null> => {
    try {
        // Use backend proxy to avoid CORS issues
        const response = await fetch('/api/acestep/llm-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: messages,
                model: "local-model",
                temperature: temperature,
                max_tokens: 2048,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`Local LLM responded with ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        console.warn("Local LLM call failed:", error);
        return null;
    }
};

/**
 * Use Local LLM or Gemini AI to add structural tags to lyrics.
 * Priorities: Local LLM > Gemini API > Raw Lyrics
 */
export const structureLyrics = async (
    rawLyrics: string,
    songDescription: string,
    theme: string,
    language: string = 'ja',
    modelName: string = 'gemini-3-flash-preview'
): Promise<string> => {

    // === Pre-processing: Clean raw lyrics BEFORE sending to LLM ===
    const preProcessLyrics = (text: string): string => {
        // --- Phase 1: ASR Error Correction Dictionary ---
        // Common automatic speech recognition mistakes in Japanese lyrics
        const asrFixes: [RegExp, string][] = [
            [/支えしく/g, '寂しく'],
            [/導めく/g, '導く'],
            [/落ちてくり/g, '落ちていく'],
            [/落ちてちて/g, '落ちて'],
            [/身を委れ/g, '身を委ね'],
            [/身を豊/g, '身を委ね'],
            [/聞こえがさく/g, '聞こえなくなる'],
            [/遠ざかて/g, '遠ざかって'],
            [/求めずた/g, '求めず、ただ'],
            [/夢甘くしく/g, '夢は甘く苦しく'],
            [/夢甘く苦しく/g, '夢は甘く苦しく'],
            [/沈んでいくじ/g, '沈んでいく'],
            [/進んでいく。/g, '沈んでいく'],
            [/新年のこと/g, '全てのこと'],
            [/Voice/g, '声'],
        ];

        let fixed = text;
        for (const [pattern, replacement] of asrFixes) {
            fixed = fixed.replace(pattern, replacement);
        }

        // --- Phase 2: Line-by-line cleaning ---
        const lines = fixed.split('\n');
        const cleaned: string[] = [];
        let prevLine = '';

        for (const rawLine of lines) {
            let line = rawLine.trim();

            // Skip empty lines
            if (!line) continue;

            // Remove lines that are only punctuation/noise
            if (/^[。、．.…！？!?、\s]+$/.test(line)) continue;

            // Remove very short noise lines (1-3 chars)
            if (line.length <= 3) {
                // Remove if it contains ONLY hiragana (e.g. "て", "せ", "をゆ")
                if (/^[\u3041-\u309f]+$/.test(line)) continue;

                // Keep if it contains Kanji or Katakana (meaningful words like "闇", "未来", "アイ")
                if (/[\u30a1-\u30f6\u4e00-\u9faf\u3005]/.test(line)) {
                    // OK
                } else {
                    continue;
                }
            }

            // Remove leading noise keywords commonly found in auto-captions
            line = line.replace(/^(う|あ|え|お|っ|ん|ー)?[、。]?\s*/, '');

            // Remove lines starting with a particle (broken sentence fragment)
            if (/^\s*[のをてにへとがはも][\u3041-\u309f]/.test(line)) continue;

            // Compress excessive in-line repetition: "落ちて落ちて落ちて落ちて" -> "落ちて落ちて"
            line = line.replace(/([\u3041-\u309f\u30a1-\u30f6\u4e00-\u9faf]{2,5})\1{2,}/g, '$1$1');

            // Remove ALL punctuation (。、！？.!?) - unnatural in Suno AI lyrics
            line = line.replace(/[。、．.…！？!?]+/g, '');

            // Remove lines that are clearly broken fragments (end with a single kanji/particle that doesn't make sense)
            // e.g., "この闇を選" (ends mid-word)
            if (/[\u3041-\u309f]$/.test(line) === false && line.length > 5 && /[をにへとがはも]$/.test(line)) {
                // Likely a broken line ending with a particle - keep but note
            }

            if (!line) continue;

            // Skip if this line is identical to the previous (consecutive duplicate)
            if (line === prevLine) continue;

            cleaned.push(line);
            prevLine = line;
        }

        return cleaned.join('\n');
    };

    const processedLyrics = preProcessLyrics(rawLyrics);
    console.log('[structureLyrics] Pre-processed lyrics:', processedLyrics.length, 'chars (original:', rawLyrics.length, ')');

    const instruction = `You are a lyrics formatter specialized for Suno AI.
Your task is to structure raw lyrics into a format optimized for music generation.

## 1. Structure Tags (Mandatory)
Organize the lyrics using these standard Suno AI tags:
- [Intro], [Verse 1], [Verse 2], [Chorus], [Bridge], [Outro]
- [Pre-Chorus], [Hook], [Refrain]

## 2. Performance & Instrumental Tags (Optional)
Add these tags ONLY if explicitly indicated in text (e.g., "guitar solo", "drop"):
- [Instrumental Interlude], [Guitar Solo], [Drop], [Build], [Bass Drop]
- [Percussion Break], [Melodic Interlude]
- Convert long instrumental gaps or text like "(instrumental)" into [Instrumental Interlude].

## 3. Formatting Rules (STRICT)
- **Output ONLY the tagged lyrics.** No explanations.
- **Fix obvious ASR (Automatic Speech Recognition) errors.** (e.g., "支えしく" -> "寂しく", "導めく" -> "導く", "音に身を豊" -> "音に身を委ね")
- Do NOT add new lyrics or change the meaning. Only fix broken Japanese.
- Remove any remaining nonsense characters or broken lines.
- Ensure structure tags are on their own lines.
- Add one empty line between sections.

## Example Output:
[Intro]
[Instrumental Interlude]

[Verse 1]
The city lights are fading out
I'm driving through the dark alone

[Chorus]
Take me back to where we started
I can't let this memory go
`;

    const userContent = `Format the following lyrics for Suno AI:

${processedLyrics}

Output ONLY the structured lyrics text.`;

    // 1. Try Local LLM first
    console.log("[structureLyrics] Attempting to use Local LLM...");
    const localResult = await callLocalLLM([
        { role: "system", content: instruction },
        { role: "user", content: userContent }
    ], 0.3); // Slightly increased temp to prevent loops

    if (localResult) {
        console.log("[structureLyrics] Local LLM succeeded. Raw response length:", localResult.length);
        console.log("[structureLyrics] First 200 chars:", localResult.substring(0, 200));
        let cleaned = localResult
            .replace(/^```[a-z]*\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

        // If the model added explanation text before the actual lyrics,
        // try to extract just the tagged lyrics portion
        const firstTagIndex = cleaned.search(/\[(Intro|Verse|Pre-Chorus|Chorus|Bridge|Outro|Interlude)/i);
        if (firstTagIndex > 0) {
            // There's text before the first tag - likely explanation text
            console.log("[structureLyrics] Trimming explanation text before first tag at index:", firstTagIndex);
            cleaned = cleaned.substring(firstTagIndex).trim();
        }

        return cleaned;
    }

    console.log("[structureLyrics] Local LLM failed or not running. Fallback to Gemini.");

    // 2. Fallback to Gemini API
    try {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : '');
        if (!apiKey) {
            console.warn("API Key not set, returning cleaned lyrics without AI structuring.");
            return processedLyrics; // Return CLEANED lyrics instead of RAW
        }

        const genAI = new GoogleGenAI({ apiKey: apiKey });

        // Retry logic for 429 Too Many Requests or 503 Overloaded
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount <= maxRetries) {
            try {
                const result = await genAI.models.generateContent({
                    model: modelName,
                    contents: {
                        parts: [
                            { text: instruction },
                            { text: userContent }
                        ]
                    },
                    config: {
                        temperature: 0.2, // Low temperature for faithful reproduction
                        maxOutputTokens: 2048,
                    }
                });

                const structured = result.text ? result.text.trim() : processedLyrics; // Fallback to cleaned

                // Remove markdown code blocks if AI wrapped the output
                let cleaned = structured
                    .replace(/^```[a-z]*\s*/i, '')
                    .replace(/\s*```$/i, '')
                    .trim();

                // If the model added explanation text before the actual lyrics,
                // try to extract just the tagged lyrics portion
                const firstTagIndex = cleaned.search(/\[(Intro|Verse|Pre-Chorus|Chorus|Bridge|Outro|Interlude)/i);
                if (firstTagIndex > 0) {
                    // There's text before the first tag - likely explanation text
                    console.log("[structureLyrics] Trimming explanation text before first tag at index:", firstTagIndex);
                    cleaned = cleaned.substring(firstTagIndex).trim();
                }

                return cleaned;

            } catch (error: any) {
                console.warn(`[structureLyrics] Attempt ${retryCount + 1} failed:`, error.message);

                if (error.status === 429 || error.status === 503) {
                    retryCount++;
                    await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
                    continue;
                }

                // Other errors
                break;
            }
        }

        console.error("[structureLyrics] All retry attempts failed. Returning cleaned lyrics.");
        return processedLyrics; // Final fallback to CLEANED lyrics

    } catch (e) {
        console.error("[structureLyrics] Unexpected error:", e);
        return processedLyrics; // Fallback to CLEANED lyrics
    }
};


export const generateStyleFromLyrics = async (
    lyrics: string,
    url: string = '',
    theme: string = '',
    language: string = 'ja',
    modelName: string = 'gemini-3-flash-preview'
): Promise<string> => {
    try {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : '');
        if (!apiKey) throw new Error('API Key is missing. Please set VITE_GEMINI_API_KEY in .env');
        
        // Dynamically import to avoid top-level await issues if any
        const { GoogleGenAI } = await import('@google/genai');
        const genAI = new GoogleGenAI({ apiKey: apiKey });

        let userContent = 'Generate a Suno style prompt for this track.\n';
        if (theme) userContent += 'Theme: ' + theme + '\n';
        if (url) userContent += 'Reference URL: ' + url + '\n';
        if (language === 'en') userContent += 'Language Focus: English\n';
        else userContent += 'Language Focus: Japanese\n';
        
        if (lyrics) {
            userContent += '\nLyrics (excerpt):\n---\n' + lyrics.substring(0, 800) + '\n---';
        }

        const result = await genAI.models.generateContent({
            model: modelName,
            contents: { parts: [{ text: userContent }] },
            config: {
                systemInstruction: 'Your task is to generate a highly effective "Style Prompt" (Song Description) for AI music generation. ACE-Step v1.5 strongly prefers detailed, natural language sentences over comma-separated tags. Output 2-3 sentences in English describing the genre, tempo, instrumentation, vocal style, and overall mood based on the inputs. No explanations or meta-text. e.g. "An energetic J-pop track driven by rapid piano arpeggios and punchy electronic drums. A clear female vocal delivers an uplifting melody..."',
                temperature: 0.6,
                maxOutputTokens: 100
            }
        });

        return result.text || 'ERROR: Empty response';
    } catch (e: any) {
        console.error('Style generation failed:', e);
        return 'ERROR: ' + (e.message || 'Unknown Error');
    }
};
