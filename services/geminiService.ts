
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { SunoResponse, GenerationMode, GroundingSource, SearchEngine } from "../types";
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
5. **動画情報の後に、どのような音楽なのか（ジャンル、雰囲気、特徴など）を簡潔な文章で追記してください。**
   例：「... / 投稿者：Airis。疾走感のあるピアノとエモーショナルなボーカルが特徴的な、切ないJ-Popロックナンバーです。」

## 音楽解析のポイント
- 特定した楽曲の「ジャンル（例：Dark EDM, Phonk, J-Pop）」「BPM/テンポ感」「使用されている特徴的な楽器」「ボーカルの雰囲気（中性的、ダウナー、力強い等）」を分析してください。
- Suno v4.5の特性（高音質、複雑な構成の理解）を活かしたプロンプトを作成してください。

## 構成ルール
- [Intro], [Verse], [Chorus], [Bridge], [Drop], [Outro] などのメタタグを効果的に使用。
- 歌詞は動画の世界観を踏襲し、かつSunoで生成した際に中毒性が出るように構成。

## 禁止事項とアレンジルール（最重要）
1. **「タイトル」および「歌詞」の完全コピーは厳禁です。** 元の楽曲や動画の要素をそのまま出力しないでください。
2. YouTube動画を解析する場合、動画の概要欄、コメント欄、背景情報、投稿者のマインドなどを深く読み取り、**必ず独自の解釈やアレンジを加えてください。**
3. 元の世界観やメッセージ性は尊重しつつ、Suno.aiで生成した際に「新しい魅力」が生まれるように、言葉選びや構成にオリジナリティを持たせてください。

## タイトル候補のルール（厳守）
- タイトル候補（titleCandidates）は必ず「日本語 / English」の形式で出力してください。
- 例: 「夜に駆ける / Racing Into The Night」「電脳都市 / Cybernetic City」
`;

const selectionSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "Bilingual format: 日本語タイトル / English Title" },
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
    analysis: { type: Type.STRING, description: "Must start with identified Video Title/Creator, followed by a brief musical description." },
    titleCandidates: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Exactly 5 bilingual titles in format: 日本語 / English",
    },
    styleCandidates: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Exactly 5 different style prompts (English tags only).",
    },
    bestSelection: { ...selectionSchema },
    alternativeSelection: { ...selectionSchema },
  },
  required: ["analysis", "titleCandidates", "styleCandidates", "bestSelection", "alternativeSelection"],
};

/**
 * Supported oEmbed providers and their patterns
 */
const OEMBED_PROVIDERS = [
  {
    name: 'YouTube',
    patterns: [/youtube\.com\/watch\?v=/, /youtu\.be\//, /youtube\.com\/embed\//, /youtube\.com\/v\//],
    endpoint: (url: string) => `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
  },
  {
    name: 'Spotify',
    patterns: [/open\.spotify\.com\/(track|album|playlist|artist)\//],
    endpoint: (url: string) => `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`
  },
  {
    name: 'SoundCloud',
    patterns: [/soundcloud\.com\//],
    endpoint: (url: string) => `https://soundcloud.com/oembed?url=${encodeURIComponent(url)}&format=json`
  },
  {
    name: 'TikTok',
    patterns: [/tiktok\.com\/.*\/video\//, /tiktok\.com\/t\//],
    endpoint: (url: string) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
  },
  {
    name: 'Vimeo',
    patterns: [/vimeo\.com\//],
    endpoint: (url: string) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`
  },
  {
    name: 'Twitter/X',
    patterns: [/twitter\.com\//, /x\.com\//],
    endpoint: (url: string) => `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`
  },
  {
    name: 'Instagram',
    patterns: [/instagram\.com\//],
    endpoint: (url: string) => `https://api.instagram.com/oembed?url=${encodeURIComponent(url)}`
  }
];

/**
 * Fetch metadata from various URLs using oEmbed
 */
const fetchUrlMetadata = async (url: string): Promise<{ title: string; author: string; provider: string } | null> => {
  if (!url) return null;

  const provider = OEMBED_PROVIDERS.find(p => p.patterns.some(pattern => pattern.test(url)));
  if (!provider) return null;

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
    console.error(`oEmbed fetch error for ${provider.name}:`, error);
    return null;
  }
};

/**
 * Search using Google Custom Search API
 */
const searchWithGoogleCustom = async (query: string): Promise<string> => {
  const apiKey = (process.env as any).GOOGLE_CUSTOM_SEARCH_API_KEY;
  const cx = (process.env as any).GOOGLE_CUSTOM_SEARCH_CX;

  if (!apiKey || !cx) {
    return "Google Custom Search API key or CX not configured. Please set GOOGLE_CUSTOM_SEARCH_API_KEY and GOOGLE_CUSTOM_SEARCH_CX in .env.local.";
  }

  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=5`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.items && data.items.length > 0) {
      return data.items.map((item: any) => `- ${item.title}: ${item.snippet}`).join('\n');
    }
    return "No results found.";
  } catch (error) {
    console.error("Google Custom Search error:", error);
    return "Search failed.";
  }
};

/**
 * Search using Tavily API
 */
const searchWithTavily = async (query: string): Promise<string> => {
  const apiKey = (process.env as any).TAVILY_API_KEY;

  if (!apiKey) {
    return "Tavily API key not configured. Please set TAVILY_API_KEY in .env.local.";
  }

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query: query,
        search_depth: 'basic',
        max_results: 5
      })
    });
    const data = await response.json();

    if (data.results && data.results.length > 0) {
      return data.results.map((r: any) => `- ${r.title}: ${r.content}`).join('\n');
    }
    return "No results found.";
  } catch (error) {
    console.error("Tavily search error:", error);
    return "Search failed.";
  }
};

export const generateSunoPrompt = async (
  text: string,
  youtubeUrl: string,
  file: File | null,
  mode: GenerationMode = GenerationMode.AUTO,
  options: { searchEngine: SearchEngine; modelName: string; enableVideoAnalysis?: boolean } = { searchEngine: 'google-grounding', modelName: 'gemini-3-flash-preview', enableVideoAnalysis: false }
): Promise<SunoResponse> => {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error("API Key is missing.");
    }

    const genAI = new GoogleGenAI({ apiKey: apiKey });
    const modelName = options.modelName;

    const parts: any[] = [];
    if (file) {
      const mediaPart = await fileToGenerativePart(file);
      parts.push(mediaPart);
    }

    let prompt = `Current Generation Mode: ${mode}. \n`;
    let externalSearchResults = '';

    // Check if we have a URL to analyze
    const urlMetadata = youtubeUrl ? await fetchUrlMetadata(youtubeUrl) : null;

    if (urlMetadata) {
      const isVideoAnalysisEnabled = options.enableVideoAnalysis;

      prompt += `=== CRITICAL: EXTERNAL MEDIA IDENTIFICATION ===\n`;
      prompt += `Source URL: ${youtubeUrl}\n`;
      prompt += `Platform: ${urlMetadata.provider}\n`;
      prompt += `✅ VERIFIED MEDIA INFORMATION:\n`;
      prompt += `  - Title: ${urlMetadata.title}\n`;
      prompt += `  - Author/Artist: ${urlMetadata.author}\n\n`;

      prompt += `INSTRUCTION: Analyze this ${urlMetadata.provider} content. Use the verified title and author above.\n`;
      prompt += `Do NOT guess the content. If you cannot analyze it, stay generic but professional.\n\n`;

      if (isVideoAnalysisEnabled && urlMetadata.provider === 'YouTube') {
        prompt += `VIDEO ANALYSIS MODE: Research and analyze the visual and auditory style of this video.\n\n`;
      }

      // Additional search for context (genre, style, etc.)
      const searchQuery = `"${urlMetadata.title}" ${urlMetadata.author} music genre style analysis`;

      switch (options.searchEngine) {
        case 'google-grounding':
          prompt += `OPTIONAL: Use Google Search to find more about the musical style of "${urlMetadata.title}".\n`;
          break;
        case 'google-custom':
          externalSearchResults = await searchWithGoogleCustom(searchQuery);
          prompt += `=== ADDITIONAL CONTEXT ===\n${externalSearchResults}\n`;
          break;
        case 'tavily':
          externalSearchResults = await searchWithTavily(searchQuery);
          prompt += `=== ADDITIONAL CONTEXT ===\n${externalSearchResults}\n`;
          break;
      }
    } else if (youtubeUrl) {
      // Fallback for non-oEmbed URLs (like Suno.ai)
      const isSuno = youtubeUrl.includes('suno.com') || youtubeUrl.includes('suno.ai');

      prompt += `=== MEDIA ANALYSIS (NON-OEMBED) ===\n`;
      prompt += `Target URL: ${youtubeUrl}\n`;

      if (isSuno) {
        prompt += `Platform: Suno.ai\n`;
        prompt += `INSTRUCTION: This is a Suno.ai song link. Please use your search capability (Google Search) to find the title, tags, and lyrics of this track if available.\n`;
      } else {
        prompt += `Note: Could not fetch automatic metadata via oEmbed.\n`;
      }

      prompt += `INSTRUCTION: Analyze the contents of this URL to provide a high-quality music prompt.\n\n`;

      // Trigger search if enabled
      if (options.searchEngine === 'google-grounding') {
        prompt += `SEARCH INSTRUCTION: Search for this specific URL: ${youtubeUrl} to extract track details.\n`;
      }
    }

    if (text) {
      prompt += `Theme/Concept: ${text}\n`;
    } else if (!file) {
      prompt += "Create a high-quality, modern music concept.";
    }

    parts.push({ text: prompt });

    const config: any = {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: responseSchema,
      temperature: 0.1,
      topP: 0.1,
    };

    // Only use built-in Google Search for google-grounding
    if (options.searchEngine === 'google-grounding') {
      config.tools = [{ googleSearch: {} }];
    }

    const result = await genAI.models.generateContent({
      model: modelName,
      contents: { parts: parts },
      config: config,
    });

    if (!result.text) {
      throw new Error("AI returned an empty response.");
    }

    const jsonResponse = JSON.parse(result.text) as SunoResponse;

    // Extract grounding sources (only available for google-grounding)
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
