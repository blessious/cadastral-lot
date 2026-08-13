import os
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent
CONFIG_FILES = (PROJECT_ROOT / "server_config.env", PROJECT_ROOT / ".env")


def load_server_config() -> dict[str, str]:
    config: dict[str, str] = {}
    for config_file in CONFIG_FILES:
        if not config_file.exists():
            continue
        with open(config_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                config.setdefault(key.strip(), value.strip())

    for key in list(config):
        if os.environ.get(key):
            config[key] = os.environ[key]
    return config


def db_config() -> dict[str, str]:
    config = load_server_config()
    required = ("DB_SERVER", "DB_DATABASE", "DB_USERNAME", "DB_PASSWORD")
    missing = [key for key in required if not config.get(key)]
    if missing:
        raise RuntimeError(
            "Missing database config values: "
            + ", ".join(missing)
            + ". Create server_config.env from server_config.example.env."
        )

    return {
        "server": config["DB_SERVER"],
        "database": config["DB_DATABASE"],
        "username": config["DB_USERNAME"],
        "password": config["DB_PASSWORD"],
    }
