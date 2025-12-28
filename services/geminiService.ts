
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { SunoResponse, GenerationMode, GroundingSource } from "../types";
import { fileToGenerativePart } from "../utils";

const SYSTEM_INSTRUCTION = `
あなたはSuno.aiのエキスパートであり、最新のモデル（v4.5以降）を熟知した音楽プロデューサーです。
ユーザー入力を解析し、Suno.ai Custom Modeで最高の楽曲を生成するためのパラメータをJSON形式で出力してください。

## YouTube URLの処理（厳守事項）
1. 入力にYouTube URLがある場合、**Google Searchを使用して、その動画ID(v=...)に対応する正確な「動画タイトル」と「アーティスト/投稿者名」を特定してください。**
2. プレイリスト内の他の曲や、検索結果に出てくる「人気の関連動画（例：Vaundy, なとり等）」と混同しないでください。**動画IDに紐づく情報を100%優先してください。**
3. **「analysis」フィールドの冒頭に必ず以下の形式で記述してください：**
   「特定した動画：[動画タイトル] / 投稿者：[アーティスト名]」
4. もしタイトルが特定できない場合は、推測せず「動画の詳細を特定できませんでした」と記述してください。

## 音楽解析のポイント
- 特定した楽曲の「ジャンル（例：Dark EDM, Phonk, J-Pop）」「BPM/テンポ感」「使用されている特徴的な楽器」「ボーカルの雰囲気（中性的、ダウナー、力強い等）」を分析してください。
- Suno v4.5の特性（高音質、複雑な構成の理解）を活かしたプロンプトを作成してください。

## 構成ルール
- [Intro], [Verse], [Chorus], [Bridge], [Drop], [Outro] などのメタタグを効果的に使用。
- 歌詞は動画の世界観を踏襲し、かつSunoで生成した際に中毒性が出るように構成。
`;

const selectionSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    style: { type: Type.STRING },
    instrumental: { type: Type.BOOLEAN },
    content: { type: Type.STRING, description: "Full lyrics or structure using v4.5 metatags." },
    comment: { type: Type.STRING, description: "Brief explanation of the musical choices." },
  },
  required: ["title", "style", "instrumental", "content", "comment"],
};

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    analysis: { type: Type.STRING, description: "Must start with identified Video Title and Creator." },
    titleCandidates: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "5 thematic titles.",
    },
    styleCandidates: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "5 style prompts (English tags).",
    },
    bestSelection: { ...selectionSchema },
    alternativeSelection: { ...selectionSchema },
  },
  required: ["analysis", "titleCandidates", "styleCandidates", "bestSelection", "alternativeSelection"],
};

/**
 * Extracts YouTube Video ID from URL
 */
const extractYouTubeId = (url: string): string | null => {
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[7].length === 11) ? match[7] : null;
};

export const generateSunoPrompt = async (
  text: string,
  file: File | null,
  mode: GenerationMode = GenerationMode.AUTO
): Promise<SunoResponse> => {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error("API Key is missing.");
    }

    const genAI = new GoogleGenAI({ apiKey: apiKey });
    const modelName = 'gemini-3-flash-preview';
    
    const parts: any[] = [];
    if (file) {
      const mediaPart = await fileToGenerativePart(file);
      parts.push(mediaPart);
    }
    
    let prompt = `Current Generation Mode: ${mode}. \n`;
    
    if (text) {
      const videoId = extractYouTubeId(text);
      if (videoId) {
        prompt += `TARGET IDENTIFICATION: YouTube Video ID is "${videoId}".\n`;
        prompt += `1. Search for the EXACT title and artist of YouTube video ID: ${videoId}.\n`;
        prompt += `2. DO NOT confuse it with popular songs or playlist context. Focus ONLY on this video ID.\n`;
        prompt += `3. Verify if it is "VOID" by Refrain Girl (AIris) or whatever the actual content is.\n`;
        prompt += `4. Based on its "Dark EDM" or actual genre, create the prompts.\n`;
      } else {
        prompt += `Input: ${text}\n`;
      }
    } else if (!file) {
      prompt += "Create a high-quality, modern music concept.";
    }
    
    parts.push({ text: prompt });

    const result = await genAI.models.generateContent({
      model: modelName,
      contents: { parts: parts },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        tools: [{ googleSearch: {} }],
        temperature: 0.1, // Set even lower to be deterministic
        topP: 0.1,       // Reduce diversity to focus on search facts
      },
    });

    if (!result.text) {
      throw new Error("AI returned an empty response.");
    }

    const jsonResponse = JSON.parse(result.text) as SunoResponse;

    // Extract grounding sources
    const sources: GroundingSource[] = [];
    const chunks = result.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      chunks.forEach((chunk: any) => {
        if (chunk.web && chunk.web.uri) {
          sources.push({
            uri: chunk.web.uri,
            title: chunk.web.title || "Reference Source"
          });
        }
      });
    }

    const uniqueSources = Array.from(new Map(sources.map(s => [s.uri, s])).values());
    
    return {
      ...jsonResponse,
      sources: uniqueSources.length > 0 ? uniqueSources : undefined
    };
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};
