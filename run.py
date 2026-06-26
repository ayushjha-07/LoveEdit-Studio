import os
from app import create_app

# Resolve config name from environment
config_name = os.environ.get("FLASK_ENV", "development").lower()
app = create_app(config_name)

if __name__ == "__main__":
    # Launch local server
    port = int(os.environ.get("PORT", 9000))
    app.run(host="0.0.0.0", port=port)
