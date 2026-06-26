import os

class Config:
    # Core Flask
    SECRET_KEY = os.environ.get("SECRET_KEY", "loveedit_studio_premium_key_2026")
    
    # Session Security
    SESSION_COOKIE_SECURE = os.environ.get("SESSION_COOKIE_SECURE", "False").lower() in ("true", "1")
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    
    # Database Path
    # Using root of the project by default to avoid breaking existing DB files
    DB_NAME = os.environ.get("DB_NAME", "loveedit.db")
    
    # Caching Settings
    REDIS_URL = os.environ.get("REDIS_URL", "")
    CACHE_TYPE = "RedisCache" if REDIS_URL else "SimpleCache"
    CACHE_DEFAULT_TIMEOUT = int(os.environ.get("CACHE_DEFAULT_TIMEOUT", 300))
    
    # Rate Limiting Settings
    # Define max requests per minute for sensitive endpoints
    RATE_LIMIT_MAX_REQUESTS = int(os.environ.get("RATE_LIMIT_MAX_REQUESTS", 60))
    RATE_LIMIT_WINDOW_SECONDS = int(os.environ.get("RATE_LIMIT_WINDOW_SECONDS", 60))

class DevelopmentConfig(Config):
    DEBUG = True
    SESSION_COOKIE_SECURE = False

class ProductionConfig(Config):
    DEBUG = False
    SESSION_COOKIE_SECURE = True # Enforce HTTPS in production

class TestingConfig(Config):
    TESTING = True
    DEBUG = True
    SESSION_COOKIE_SECURE = False
    DB_NAME = "loveedit_test.db"

config_by_name = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig
}
