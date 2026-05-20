# Suno Architect Suite — Requirements & Model Setup

Suno Architect Suite をローカルおよびハイブリッド環境で実行するための動作要件、必要な外部APIキー、モデルファイルのダウンロード、およびトラブルシューティングの解説です。

---

## 🖥️ ハードウェア要件 (Hardware Requirements)

本システムはローカル推論モデル（ACE-Step, YuE, Seed-VC 等）を使用するため、GPU性能および VRAM 容量が極めて重要です。

| コンポーネント | 最小要件 | 推奨要件 (DGX SPARK 等) | 備考 |
|---|---|---|---|
| **GPU** | NVIDIA CUDA 対応 GPU | NVIDIA 24GB VRAM (RTX 3090/4090, A10G等) | CUDA 11.8+ / 12.1+ 必須 |
| **VRAM** | 16GB 以上 | 24GB 〜 128GB (DGX環境) | 低VRAMでは一部モデルの切り替えが必要 |
| **ストレージ** | SSD 50GB 以上の空き | SSD 150GB 以上の空き | モデルチェックポイントの保存用 |
| **CPU / メモリ** | 8 Cores / 16GB RAM | 16 Cores+ / 32GB+ RAM | 音源解析およびバッチ処理用 |

### モデル別 VRAM 目安
*   **Gemini / MiniMax (Cloud)**: **0 GB** (API経由のためVRAM不要)
*   **ACE-Step v1.5 (xl-sft / xl-base)**: **約 12GB - 16GB VRAM** (推論ステップ数やバッチサイズにより変動)
*   **Seed-VC (Voice Conversion)**: **約 6GB - 8GB VRAM**
*   **YuE (Music Generation)**:
    *   `Fast` / `Balanced` プロファイル: **約 16GB VRAM**
    *   `Best` (8.0bpw) プロファイル: **24GB+ VRAM** (DGX SPARK等での利用を想定)
*   **Audio Separation (BS-RoFormer / Demucs)**: **約 6GB - 10GB VRAM**

---

## 🔑 外部APIキーの設定 (API Key Setup)

ルートディレクトリの `.env` ファイルに以下の設定を行います。詳細は `.env.example` を参照してください。

1.  **GEMINI_API_KEY** [必須]
    *   **用途**: Gemini 3.5 Flash / 3.1 Pro等を用いた楽曲プロンプト設計、歌詞生成、画像からの雰囲気読み取り等。
    *   **取得先**: [Google AI Studio](https://aistudio.google.com/app/apikey)
2.  **GOOGLE_CUSTOM_SEARCH_API_KEY & GOOGLE_CUSTOM_SEARCH_CX** [任意]
    *   **用途**: 最新の音楽トレンドやアーティスト情報をGoogle検索で取得し、プロンプトへ組み込む（Search Grounding機能）。
    *   **取得先**: Google Cloud Console (Custom Search API) & Custom Search Engine設定
3.  **TAVILY_API_KEY** [任意]
    *   **用途**: Google CSEの代わりにTavily APIを用いてリアルタイム検索グラウンディングを行います。
4.  **FIRECRAWL_API_URL & FIRECRAWL_API_KEY** [任意]
    *   **用途**: 検索されたWebサイトの内容をスクレイピングしてプロンプトのコンテキストを豊かにします（ポート3002でローカル起動も可能）。

---

## 📦 外部モデルの準備 (Model Cache & Setup)

本プロジェクト内のツールで使用する推論モデルは、初回起動時に自動ダウンロードされるものと、手動での配置が必要なものがあります。

### 1. 自動ダウンロードされるモデル
以下のモデルは、初めて機能（分離、音声認識など）を実行した際に、ライブラリによって `~/.cache/` 配下に自動ダウンロードされます。インターネット接続（プロキシ設定）が必要です。

*   **Audio Separation**: `UVR_MDXNET_KARA_2` / `htdemucs`
*   **Whisper ASR**: `whisper-small` (音声書き起こし用)
*   **CLAP (Semantic Search)**: `laion/clap-htdemucs-itspro` (音源内のセマンティック検索用)

### 2. 手動ダウンロード / ローカル配置が必要なモデル
ローカル推論エンジンを実行する場合、それぞれのディレクトリ配下にチェックポイントやモデルファイルを配置する必要があります。

*   **ACE-Step Engine (Port 8101)**
    *   ACE-Step 起動スクリプトが参照するチェックポイント（`acestep-v15-xl-sft` 等）を `ace-step/checkpoints/` もしくは所定のディレクトリに配置してください。
*   **Seed-VC Studio**
    *   音声変換用のチェックポイントおよび `f0` 抽出モデルを `seed-vc/checkpoints/` に配置する必要があります。

---

## 🛠️ トラブルシューティング (Troubleshooting)

### Q1. Gemini API呼び出しでエラーになる
*   **原因**: `.env` に `GEMINI_API_KEY` が設定されていないか、キーが無効です。
*   **対策**: `.env` を開き、有効な Gemini API キーが設定されていることを確認してください。また、バックエンドサーバーを再起動してください。

### Q2. 起動時に `OutOfMemoryError` (OOM) が発生する
*   **原因**: GPUの VRAM が不足しています。複数の推論機能（ACE-Step + YuE + Separation）を同時に実行すると、VRAMがオーバーフローしやすくなります。
*   **対策**:
    *   `run_local.sh` ではなく個別起動スクリプトを使用し、不要なエンジンを停止してください。
    *   YuE 生成時は、プロファイルを `Best` から `Balanced` または `Fast` に変更してください。
    *   ACE-Step 生成時のバッチサイズを `1` に下げてください。

### Q3. ポート衝突でサーバーが起動しない
*   **原因**: ポート `3300` (Frontend), `8100` (Backend), `8101` (ACE-Step Engine) が既に他のプロセスによって占有されています。
*   **対策**:
    *   `./stop_local.sh` を実行して、バックグラウンドのプロセスをクリーンアップしてください。
    *   ポートを占有しているプロセスを手動で特定して終了します：
        ```bash
        sudo lsof -i :8100
        sudo lsof -i :8101
        ```

### Q4. インターネット接続エラーでモデルの自動ダウンロードに失敗する
*   **原因**: 社内プロキシなどのネットワーク制限により、Hugging FaceやGitHub等への接続が遮断されています。
*   **対策**:
    *   `./switch_proxy_mode.sh corporate` を実行して社内プロキシを適用してください。
    *   Wi-Fi直結の場合は `./switch_proxy_mode.sh wifi` に切り替えてください。
    *   `./check_network.sh current` でインターネット接続を確認してください。
