import logging
import sys
import json
import os
from datetime import datetime

class JSONFormatter(logging.Formatter):
    """
    JSON log formatter for production monitoring platforms (ELK, Datadog, CloudWatch).
    """
    def format(self, record):
        log_data = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
            "file": record.filename,
            "line": record.lineno,
        }
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        
        # Merge extra fields if present
        if hasattr(record, "extra_fields"):
            log_data.update(record.extra_fields)
            
        return json.dumps(log_data)

def setup_logger(name="loveedit", log_level=None):
    if log_level is None:
        log_level = os.environ.get("LOG_LEVEL", "INFO").upper()

    logger = logging.getLogger(name)
    logger.setLevel(log_level)
    
    # Avoid duplicate handlers if setup_logger is called multiple times
    if logger.handlers:
        return logger

    handler = logging.StreamHandler(sys.stdout)
    
    # Use JSON formatter in production, clean text in dev
    flask_env = os.environ.get("FLASK_ENV", "development").lower()
    if flask_env == "production":
        formatter = JSONFormatter()
    else:
        formatter = logging.Formatter(
            '[%(asctime)s] %(levelname)s in %(filename)s:%(lineno)d: %(message)s'
        )
        
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    
    # Configure Flask default logger to output through this handler as well
    logging.getLogger("wsgi").addHandler(handler)
    
    return logger

# Preconfigure a default application logger
logger = setup_logger()
