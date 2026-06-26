import os
from flask_caching import Cache

# Initialize Cache extension object
cache = Cache()

def init_cache(app):
    """
    Initializes Flask-Caching extension based on application configurations.
    Defaults to SimpleCache (local memory) and falls back to Redis if REDIS_URL is provided.
    """
    redis_url = app.config.get("REDIS_URL")
    
    if redis_url:
        app.config["CACHE_TYPE"] = "RedisCache"
        app.config["CACHE_REDIS_URL"] = redis_url
    else:
        app.config["CACHE_TYPE"] = "SimpleCache"
        
    cache.init_app(app)
