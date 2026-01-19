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

## 音楽解析のポイント
- 特定した楽曲の「ジャンル（例：Dark EDM, Phonk, J-Pop）」「BPM/テンポ感」「使用されている特徴的な楽器」「ボーカルの雰囲気」をメタデータから推測・分析してください。
- Suno v4.5の特性を活かしたプロンプトを作成してください。

## 構成ルール
- [Intro], [Verse], [Chorus], [Bridge], [Drop], [Outro] などのメタタグを使用。
- 歌詞は元の世界観を尊重しつつ、独自のアレンジを加えてください（完全コピー禁止）。

## タイトル候補
- 「日本語 / English」の形式で出力。
`;

const selectionSchema = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING, description: "日本語タイトル / English Title のバイリンガル形式" },
        style: { type: Type.STRING },
        instrumental: { type: Type.BOOLEAN },
        content: { type: Type.STRING, description: "v4.5メタタグを使用した完全な歌詞または構成" },
        comment: { type: Type.STRING, description: "音楽的な選択についての簡潔な説明。**必ず日本語で記述すること。**" },
    },
    required: ["title", "style", "instrumental", "content", "comment"],
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
            description: "Exactly 5 different style prompts.",
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
            const response = await fetch('http://localhost:8000/suno/analyze', {
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
    options: { searchEngine: SearchEngine; modelName: string; enableVideoAnalysis?: boolean } = { searchEngine: 'google-grounding', modelName: 'gemini-2.5-flash', enableVideoAnalysis: false }
): Promise<SunoResponse> => {
    try {
        const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("API Key is missing.");

        const genAI = new GoogleGenAI({ apiKey: apiKey });

        // Use the model selected by user, default to gemini-2.5-flash
        const modelName = options.modelName || "gemini-2.5-flash";


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

        if (text) prompt += `User Theme: ${text}\n`;

        parts.push({ text: prompt });

        const config: any = {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: "application/json",
            responseSchema: responseSchema,
            temperature: 0.2, // Low temp for consistent JSON
        };

        // Only use Google Search if EXPLICITLY requested (to save tokens/quota)
        if (options.searchEngine === 'google-grounding') {
            config.tools = [{ googleSearch: {} }];
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

                const jsonResponse = JSON.parse(result.text) as SunoResponse;

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
    options: { modelName: string } = { modelName: 'gemini-2.5-flash' }
): Promise<{ bestSelection: any; alternativeSelection: any; tokenUsage?: any }> => {
    try {
        const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("API Key is missing.");

        const genAI = new GoogleGenAI({ apiKey: apiKey });
        const modelName = options.modelName || "gemini-2.5-flash";

        const prompt = `
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
`;

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
