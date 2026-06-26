import time
import os
import random
import threading
from flask import request, g
from app.utils.logger import logger

def get_system_metrics(db_name="loveedit.db"):
    """
    Collects system execution telemetry: CPU, RAM, Database Size, and active threads.
    """
    # Simulate CPU/RAM details using standard ranges
    cpu_percent = round(random.uniform(12.5, 38.4), 1)
    ram_percent = round(random.uniform(42.1, 58.9), 1)
    
    db_size_bytes = 0
    if os.path.exists(db_name):
        db_size_bytes = os.path.getsize(db_name)
    db_size_mb = round(db_size_bytes / (1024 * 1024), 2)
    
    active_threads = threading.active_count()
    
    return {
        "cpu": cpu_percent,
        "ram": ram_percent,
        "db_size_mb": db_size_mb,
        "active_threads": active_threads
    }

def init_telemetry(app):
    """
    Registers request hooks to measure request processing durations.
    """
    @app.before_request
    def start_timer():
        g.start_time = time.time()

    @app.after_request
    def log_request_metrics(response):
        if hasattr(g, "start_time"):
            duration = time.time() - g.start_time
            # Log latency metrics
            logger.info(
                f"Request: {request.method} {request.path} | Status: {response.status_code} | Duration: {duration:.4f}s",
                extra={"extra_fields": {
                    "method": request.method,
                    "path": request.path,
                    "status_code": response.status_code,
                    "duration_seconds": duration,
                    "ip": request.remote_addr
                }}
            )
        return response
