from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # API Keys
    gemini_api_key: str | None = None
    openai_api_key: str | None = None
    acestep_api_key: str | None = None
    minimax_api_key: str | None = None
    google_custom_search_api_key: str | None = None
    google_custom_search_cx: str | None = None
    tavily_api_key: str | None = None

    # Server Settings
    backend_port: int = 8100
    frontend_origin: str = "http://localhost:3300"

    # Paths
    server_dir: Path = Path(__file__).resolve().parents[1]
    project_dir: Path = server_dir.parent

    upload_dir: Path = project_dir / "uploads"
    output_dir: Path = project_dir / "outputs"
    
    # Specific Output Dirs
    yue_output_dir: Path = output_dir / "yue_generations"
    separation_dir: Path = output_dir / "separated"
    minimax_output_dir: Path = output_dir / "minimax"

    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).resolve().parents[2] / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    def create_directories(self):
        """Ensure all required directories exist."""
        for path in [self.upload_dir, self.output_dir, self.yue_output_dir, self.separation_dir, self.minimax_output_dir]:
            path.mkdir(parents=True, exist_ok=True)

settings = Settings()
# Initialize directories on import
settings.create_directories()
