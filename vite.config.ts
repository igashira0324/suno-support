import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
        server: {
            port: 3300,
            host: '0.0.0.0',
            watch: {
                ignored: [
                    '**/server/venv/**',
                    '**/ace-step/.venv/**',
                    '**/ace-step/checkpoints/**',
                    '**/seed-vc/**',
                    '**/outputs/**',
                    '**/scratch/**',
                    '**/node_modules/**',
                ],
            },
        },
        plugins: [react(), basicSsl()],
        define: {
            'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
            'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
            'process.env.GOOGLE_CUSTOM_SEARCH_API_KEY': JSON.stringify(env.GOOGLE_CUSTOM_SEARCH_API_KEY),
            'process.env.GOOGLE_CUSTOM_SEARCH_CX': JSON.stringify(env.GOOGLE_CUSTOM_SEARCH_CX),
            'process.env.TAVILY_API_KEY': JSON.stringify(env.TAVILY_API_KEY),
            'process.env.FIRECRAWL_API_URL': JSON.stringify(env.FIRECRAWL_API_URL),
            'process.env.FIRECRAWL_API_KEY': JSON.stringify(env.FIRECRAWL_API_KEY),
        },
        resolve: {
            alias: {
                '@': path.resolve(__dirname, 'src'),
            }
        }
    };
});
