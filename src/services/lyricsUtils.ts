import { GoogleGenAI } from "@google/genai";
import { API_BASE_URL } from '@/config/api';

// Local LLM (OpenAI Compatible) Client
export const callLocalLLM = async (messages: any[], temperature: number = 0.3): Promise<string | null> => {
    try {
        // Use backend proxy to avoid CORS issues
        const response = await fetch(`${API_BASE_URL}/acestep/llm-proxy`, {
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
    modelName: string = 'gemini-3.5-flash'
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
        const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
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
