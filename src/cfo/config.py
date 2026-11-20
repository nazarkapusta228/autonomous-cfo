from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: SecretStr | None = None
    llm_base_url: str = ""
    llm_model: str = "Qwen/Qwen2.5-7B-Instruct"
    llm_api_key: SecretStr = SecretStr("")
    llm_timeout_seconds: float = Field(default=60, gt=0, le=300)
