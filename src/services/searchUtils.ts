import { GenerationMode, GroundingSource } from "../types";
import { API_BASE_URL } from '@/config/api';

export const OEMBED_PROVIDERS = [
    { name: 'YouTube', patterns: [/youtube\.com/, /youtu\.be/], endpoint: (url: string) => `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json` },
    { name: 'Spotify', patterns: [/spotify\.com/], endpoint: (url: string) => `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}` },
    { name: 'SoundCloud', patterns: [/soundcloud\.com/], endpoint: (url: string) => `https://soundcloud.com/oembed?url=${encodeURIComponent(url)}&format=json` },
];

export type FirecrawlResultItem = {
    title?: string;
    description?: string;
    url?: string;
    markdown?: string;
    metadata?: {
        title?: string;
        description?: string;
        sourceURL?: string;
        url?: string;
    };
};

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const truncateForPrompt = (value: string, maxLength: number): string => {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength - 1).trimEnd()}…`;
};

const getFirecrawlBaseUrl = (): string => {
    const configured = process.env.FIRECRAWL_API_URL || 'http://localhost:3002';
    return configured.replace(/\/+$/, '');
};

const buildFirecrawlHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
    }

    return headers;
};

const extractFirecrawlResults = (payload: any): FirecrawlResultItem[] => {
    if (Array.isArray(payload?.data?.web)) return payload.data.web;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.web)) return payload.web;
    if (Array.isArray(payload)) return payload;
    return [];
};

const postFirecrawlSearch = async (endpoint: string, body: any): Promise<FirecrawlResultItem[]> => {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: buildFirecrawlHeaders(),
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${endpoint} failed (${response.status}): ${errorText || 'Unknown error'}`);
    }

    const payload = await response.json();
    return extractFirecrawlResults(payload);
};

export const buildFirecrawlQuery = (params: {
    text: string;
    youtubeUrl: string;
    theme: string;
    mode: GenerationMode;
    urlMetadata: { title: string; author: string; provider: string; description?: string } | null;
}): string => {
    const parts = [
        params.urlMetadata?.title,
        params.urlMetadata?.author,
        params.theme,
        params.text,
        params.youtubeUrl,
        params.mode !== GenerationMode.AUTO ? `${params.mode} music arrangement` : 'music style lyrics references',
    ]
        .filter(Boolean)
        .map((part) => normalizeWhitespace(String(part)));

    const query = parts.join(' ').trim();
    return truncateForPrompt(query || 'music style lyrics references', 320);
};

export const searchWithFirecrawl = async (query: string): Promise<{ context: string; sources: GroundingSource[] }> => {
    const baseUrl = getFirecrawlBaseUrl();
    let results: FirecrawlResultItem[] = [];
    let lastError: unknown = null;

    try {
        results = await postFirecrawlSearch(`${baseUrl}/v2/search`, {
            query,
            limit: 5,
            sources: ['web'],
            scrapeOptions: {
                formats: ['markdown'],
                onlyMainContent: true,
            },
        });
    } catch (error) {
        lastError = error;
        results = await postFirecrawlSearch(`${baseUrl}/v1/search`, {
            query,
            limit: 5,
            scrapeOptions: {
                formats: ['markdown'],
                onlyMainContent: true,
            },
        }).catch((fallbackError) => {
            const message = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
            const previous = lastError instanceof Error ? lastError.message : String(lastError);
            throw new Error(`FireCrawl search failed. v2: ${previous}. v1: ${message}`);
        });
    }

    if (results.length === 0) {
        return { context: '', sources: [] };
    }

    const sources: GroundingSource[] = [];
    const lines: string[] = [];

    results.slice(0, 5).forEach((item, index) => {
        const title = normalizeWhitespace(item.title || item.metadata?.title || 'Untitled');
        const description = normalizeWhitespace(item.description || item.metadata?.description || '');
        const url = item.url || item.metadata?.sourceURL || item.metadata?.url || '';
        const markdown = normalizeWhitespace(item.markdown || '');
        const contentSnippet = truncateForPrompt(markdown, 800);

        if (url) {
            sources.push({ title, uri: url });
        }

        lines.push(`Result ${index + 1}:`);
        lines.push(`Title: ${title}`);
        if (url) lines.push(`URL: ${url}`);
        if (description) lines.push(`Description: ${description}`);
        if (contentSnippet) lines.push(`Excerpt: ${contentSnippet}`);
        lines.push('');
    });

    return {
        context: lines.join('\n').trim(),
        sources,
    };
};

export const fetchUrlMetadata = async (url: string): Promise<{ title: string; author: string; provider: string; description?: string } | null> => {
    if (!url) return null;

    if (url.includes("suno.com") || url.includes("suno.ai")) {
        try {
            const response = await fetch(`${API_BASE_URL}/suno/analyze`, {
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
