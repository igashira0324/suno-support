<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# 🎵 Suno Architect v4.5

**AIパワードの音楽プロンプトジェネレーター for Suno.ai**

[![Gemini API](https://img.shields.io/badge/Powered%20by-Google%20Gemini-4285F4?logo=google&logoColor=white)](https://ai.google.dev/)
[![Suno.ai](https://img.shields.io/badge/For-Suno.ai-FF6B6B)](https://suno.ai)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)

</div>

---

## 📖 概要

Suno Architectは、YouTube動画やテキスト入力から**Suno.ai v4.5向けの最適なプロンプト**を自動生成するWebアプリケーションです。

Google Geminiの強力なAI機能を活用し、楽曲のスタイル、歌詞、構成を分析して、高品質な音楽生成パラメータを出力します。

### ✨ 主な特徴

- 🎯 **マルチプラットフォーム解析** - oEmbed APIを使用し、各種URLから詳細情報を取得
  - 対応: **YouTube, Spotify, SoundCloud, TikTok, Vimeo, X(Twitter), Instagram**
- 🎥 **動画コンテンツ解析** - Gemini APIで映像・音声を直接解析（オプション、YouTubeのみ）
- 🔍 **マルチ検索エンジン** - Google Grounding / Custom Search / Tavily AI対応
- 🎨 **スタイル候補生成** - 5つの異なるスタイルプロンプトを提案
- 📝 **歌詞自動生成** - メタタグ付きの完全な歌詞構成
- 🌐 **バイリンガル出力** - タイトル候補を日本語/英語で出力
- 🎭 **オリジナルアレンジ** - 元素材の完全コピーを禁止し、独自の解釈を加える
- 📊 **リアルタイム進捗表示** - 生成中のパーセンテージ表示

---

## 🏗️ システムアーキテクチャ

```mermaid
graph TB
    subgraph "Frontend (React + Vite)"
        UI[InputSection.tsx<br/>テーマ & URL入力]
        Result[ResultSection.tsx<br/>結果表示]
        App[App.tsx<br/>状態管理]
    end
    
    subgraph "Backend Service"
        GS[geminiService.ts<br/>Gemini API連携]
        oEmbed[oEmbed API<br/>YouTube直接照会]
        Search{検索エンジン選択}
    end
    
    subgraph "External APIs"
        Gemini[Google Gemini API<br/>2.5 / 3 Flash]
        GG[Google Grounding]
        GCS[Google Custom Search]
        Tavily[Tavily AI Search]
    end
    
    UI --> App
    App --> GS
    GS --> oEmbed
    GS --> Search
    Search -->|Grounding| GG
    Search -->|Custom| GCS
    Search -->|Tavily| Tavily
    GS --> Gemini
    Gemini --> GS
    GS --> App
    App --> Result
    
    style UI fill:#4F46E5,color:#fff
    style Result fill:#7C3AED,color:#fff
    style Gemini fill:#4285F4,color:#fff
```

---

## 🔄 処理フロー（シーケンス図）

```mermaid
sequenceDiagram
    participant User as 👤 ユーザー
    participant UI as 🖥️ InputSection
    participant App as ⚛️ App.tsx
    participant Service as 🔧 geminiService
    participant YT as 📺 YouTube oEmbed
    participant Search as 🔍 検索API
    participant Gemini as 🤖 Gemini API
    participant Result as 📊 ResultSection

    User->>UI: テーマ・コンセプト入力
    User->>UI: YouTube URL入力
    UI->>App: onSubmit()
    App->>Service: generateSunoPrompt()
    
    alt YouTube URLあり
        Service->>YT: 動画タイトル・投稿者取得
        YT-->>Service: 正確な動画情報
    end

    alt 検索エンジンON
        Service->>Search: 追加コンテキスト検索
        Search-->>Service: スタイル・ジャンル情報
    end
    
    alt 動画解析ON
        Service->>Gemini: fileData (動画URL)
    end
    
    Service->>Gemini: プロンプト生成リクエスト
    Gemini-->>Service: JSON応答
    Service-->>App: SunoResponse
    App->>Result: 結果表示
```

---

## 🚀 クイックスタート

### 必要条件

- Node.js 18+
- Google Gemini API キー

### インストール

```bash
# 依存関係をインストール
npm install

# 環境変数を設定 (.env.local)
GEMINI_API_KEY=your_api_key_here

# 起動用バッチファイル（Windows）
start.bat
# または
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。

---

## ⚙️ 設定オプション

### AIモデル選択

| モデル | 説明 |
|--------|------|
| **Gemini 2.5 Flash** | 最新・安定版。バランスの取れた性能 |
| **Gemini 3 Flash Preview** | 最先端のプレビュー版。高度な解析能力 |

### 検索エンジン

| エンジン | 説明 | 設定 |
|----------|------|------|
| **OFF** | 検索なし（API節約） | デフォルト |
| **Google Grounding** | Gemini内蔵の検索機能 | 追加設定不要 |
| **Google Custom Search** | カスタム検索エンジン | API Key + CX必要 |
| **Tavily AI** | AI特化型検索 | API Key必要 |

### 環境変数

```env
# 必須
GEMINI_API_KEY=your_gemini_api_key

# オプション（検索エンジン用）
GOOGLE_CUSTOM_SEARCH_API_KEY=your_google_cse_key
GOOGLE_CUSTOM_SEARCH_CX=your_search_engine_id
TAVILY_API_KEY=your_tavily_key
```

---

## 📁 プロジェクト構造

```
suno-ai/
├── App.tsx                 # メインアプリケーション（状態管理）
├── index.tsx               # エントリーポイント
├── types.ts                # 型定義
├── utils.ts                # ユーティリティ関数
├── components/
│   ├── InputSection.tsx    # 入力UI（テーマとURLを分離）
│   └── ResultSection.tsx   # 結果表示（コピーボタン・分析表示）
├── services/
│   └── geminiService.ts    # oEmbed連携・Gemini API連携
├── vite.config.ts          # Vite設定（環境変数）
└── .env.local              # 環境変数（Git除外）
```

---

## 🎨 UI機能

### 入力セクション
- **テーマ・コンセプト** - 生成したい曲の雰囲気や歌詞のテーマを入力
- **URL (YouTubeなど)** - 解析のベースにしたいYouTube動画のURLを入力
- **画像・動画アップロード** - メディアファイルを直接解析
- **生成モード** - 自動 / 歌あり(Vocal) / 歌なし(Instrumental)
- **AIモデル選択** - Gemini 2.5 Flash / 3 Flash Preview
- **検索エンジン切替** - ON/OFFトグル + エンジン選択
- **動画解析トグル** - YouTube映像・音声の直接解析

### 結果セクション
- **分析結果** - 楽曲の特徴解説
- **タイトル候補** - 5つのバイリンガルタイトル
- **スタイル候補** - 5つのスタイルプロンプト
- **ベストセレクト** - 推奨プロンプト（タイトル・スタイル・歌詞）
- **変化球プラン** - 代替アプローチ

### コピー機能
- すべての候補にコピーボタン付き
- クリックで即座にクリップボードにコピー
- 成功時に緑色のフィードバック表示

---

## 🔒 コンテンツポリシー

Suno Architectは以下のルールに従ってコンテンツを生成します：

> ⚠️ **完全コピー禁止**
> - 元の楽曲のタイトル・歌詞をそのままコピーすることは禁止されています
> - 動画の概要欄、コメント欄、背景情報を参考に独自のアレンジを加えます
> - 元の世界観を尊重しつつ、新しい魅力を持つプロンプトを生成します

---

## 📊 状態遷移図

```mermaid
stateDiagram-v2
    [*] --> Idle: アプリ起動
    
    Idle --> InputReady: URL/テキスト入力
    InputReady --> Idle: 入力クリア
    
    InputReady --> Loading: 生成ボタンクリック
    state Loading {
        [*] --> Analyzing: AI分析開始
        Analyzing --> ProgressUpdate: 進捗 0% → 95%
        ProgressUpdate --> ProgressUpdate: 解析継続
    }

    Loading --> Success: 生成成功
    Loading --> Error: エラー発生
    
    Error --> Idle: 再試行
    
    state Success {
        [*] --> ResultView: 結果表示
        ResultView --> Copying: コピーボタン実行
        Copying --> ResultView: クリップボード保存
    }
    
    ResultView --> Idle: 新規生成
    Success --> [*]: 終了
```

---

## 🛠️ 開発

### ビルド

```bash
# 本番ビルド
npm run build

# プレビュー
npm run preview
```

### 技術スタック

- **Frontend**: React 18 + TypeScript
- **Build Tool**: Vite 6
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **AI**: Google Gemini API (@google/genai)

---

## 📝 ライセンス

MIT License

---

## � 参考URL・備考・メモ

- [Google Gemini](https://ai.google.dev/) - AI/ML API
- [Suno.ai](https://suno.ai) - 音楽生成プラットフォーム
- [Vite](https://vitejs.dev/) - ビルドツール
- [Tailwind CSS](https://tailwindcss.com/) - スタイリング
- [Lucide React](https://lucide.dev/) - アイコンライブラリ
- [Mermaid](https://mermaid.js.org/) - 図解生成エンジン

---

<div align="center">

**Made with ❤️ for Music Creators**

Powered by Google Gemini & Suno Architect Logic

</div>
