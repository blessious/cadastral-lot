import os
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent
CONFIG_FILE = PROJECT_ROOT / "server_config.env"


def load_server_config() -> dict[str, str]:
    config: dict[str, str] = {}
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                config[key.strip()] = value.strip()

    for key in list(config):
        if os.environ.get(key):
            config[key] = os.environ[key]
    return config


def db_config() -> dict[str, str]:
    config = load_server_config()
    return {
        "server": config.get("DB_SERVER", "192.168.1.93,1433"),
        "database": config.get("DB_DATABASE", "etracs_boac"),
        "username": config.get("DB_USERNAME", "etracs_user"),
        "password": config.get("DB_PASSWORD", "Etracs@2025!"),
    }
