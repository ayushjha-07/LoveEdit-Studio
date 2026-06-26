import os
from flask import Flask, render_template
from app.config import config_by_name
from app.models import init_db, generate_placeholder_images
from app.routes.main import register_routes as register_main_routes
from app.routes.auth import register_routes as register_auth_routes
from app.routes.studio import register_routes as register_studio_routes
from app.routes.admin import register_routes as register_admin_routes
from app.services.cache import init_cache
from app.services.security import register_security_hooks
from app.utils.logger import logger, setup_logger
from app.utils.telemetry import init_telemetry

def create_app(config_name=None):
    if config_name is None:
        config_name = os.environ.get("FLASK_ENV", "development").lower()
        
    app = Flask(__name__)
    app.config.from_object(config_by_name.get(config_name, config_by_name["development"]))
    
    # Configure upload and images folders relative to the package root
    app.config['UPLOAD_FOLDER'] = os.path.join(app.root_path, 'static', 'uploads')
    app.config['IMAGES_FOLDER'] = os.path.join(app.root_path, 'static', 'images')
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    os.makedirs(app.config['IMAGES_FOLDER'], exist_ok=True)
    
    # Initialize logging, caching, and telemetry
    setup_logger(log_level=app.config.get("LOG_LEVEL"))
    init_cache(app)
    init_telemetry(app)
    register_security_hooks(app)
    
    # Register routes
    register_main_routes(app)
    register_auth_routes(app)
    register_studio_routes(app)
    register_admin_routes(app)
    
    # Register custom error templates handlers
    @app.errorhandler(403)
    def forbidden(e):
        return render_template('403.html', error_description=e.description), 403

    @app.errorhandler(404)
    def page_not_found(e):
        return render_template('404.html'), 404

    @app.errorhandler(500)
    def internal_server_error(e):
        return render_template('500.html'), 500
        
    @app.errorhandler(429)
    def too_many_requests(e):
        return render_template('403.html', error_description=e.description or "Too many requests. Please slow down."), 429
        
    # Database Initialization & Seeding on Startup
    with app.app_context():
        init_db(app)
        # Recover pending queue jobs
        from app.services.image_processor import recover_pending_jobs
        recover_pending_jobs()
        # Generate placeholder images
        generate_placeholder_images(app.config['IMAGES_FOLDER'])
        
    return app

# Expose default application instance for backward compatibility
app = create_app()
