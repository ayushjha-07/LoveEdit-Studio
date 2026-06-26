// Start the preloader simulation as early as possible
startPreloaderTimeline();

document.addEventListener('DOMContentLoaded', () => {
    // 1. Scroll Navbar Effect
    const navbar = document.querySelector('.navbar');
    if (navbar) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 50) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
        });
    }

    // 2. Mobile Responsive Navbar
    initMobileNavbar();

    // 3. Global Lazy Image Loaders & Skeletons
    initLazyImageLoaders();

    // 4. Magnetic Buttons
    initMagneticButtons();

    // 5. Global Keyboard Accessibility Handler for custom elements
    initGlobalKeyboardAccess();
});

// Premium Splash Preloader Simulation
function startPreloaderTimeline() {
    const preloader = document.getElementById('preloader');
    const preloaderBar = document.getElementById('preloader-bar');
    const preloaderStatus = document.getElementById('preloader-status');
    const entranceWrapper = document.getElementById('main-content-wrapper');
    
    if (!preloader || !preloaderBar) return;

    let progress = 0;
    const duration = 800; // Simulated time to reach 80% (fast loading feel)
    const intervalTime = 20;
    const step = (80 / (duration / intervalTime));

    const progressInterval = setInterval(() => {
        if (progress < 80) {
            progress += step;
            preloaderBar.style.width = `${Math.min(progress, 80)}%`;
        } else {
            clearInterval(progressInterval);
        }
    }, intervalTime);

    function completePreloader() {
        clearInterval(progressInterval);
        preloaderBar.style.width = '100%';
        if (preloaderStatus) preloaderStatus.textContent = 'Art Studio Ready!';
        
        setTimeout(() => {
            preloader.classList.add('fade-out');
            document.body.classList.remove('loading');
            
            setTimeout(() => {
                if (entranceWrapper) {
                    entranceWrapper.classList.add('entrance-active');
                }
            }, 150);
        }, 300);
    }

    if (document.readyState === 'complete') {
        completePreloader();
    } else {
        window.addEventListener('load', completePreloader);
        // Safety timeout to prevent infinite preloader in case of resource loading hang
        setTimeout(() => {
            if (!preloader.classList.contains('fade-out')) {
                completePreloader();
            }
        }, 4000);
    }
}

// Mobile Responsive Navbar Toggle
function initMobileNavbar() {
    const toggleBtn = document.getElementById('navbar-menu-toggle');
    const menuWrapper = document.getElementById('nav-menu-wrapper');
    const navbar = document.getElementById('main-navbar');
    
    if (!toggleBtn || !menuWrapper) return;

    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleBtn.classList.toggle('active');
        menuWrapper.classList.toggle('active');
    });

    const navLinks = menuWrapper.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            toggleBtn.classList.remove('active');
            menuWrapper.classList.remove('active');
        });
    });

    document.addEventListener('click', (e) => {
        if (navbar && !navbar.contains(e.target)) {
            toggleBtn.classList.remove('active');
            menuWrapper.classList.remove('active');
        }
    });
}

// Global Image Lazy-load & Skeleton Pulse Animations
function initLazyImageLoaders() {
    const images = document.querySelectorAll('.gallery-img, .style-card-img, .slider-img, .author-avatar');
    
    images.forEach(img => {
        const parent = img.parentElement;
        if (!parent) return;

        if (img.complete) {
            img.classList.add('lazy-loaded');
        } else {
            img.classList.add('lazy-loading');
            parent.classList.add('skeleton-loader');

            img.addEventListener('load', () => {
                img.classList.remove('lazy-loading');
                img.classList.add('lazy-loaded');
                parent.classList.remove('skeleton-loader');
            });

            img.addEventListener('error', () => {
                img.classList.remove('lazy-loading');
                parent.classList.remove('skeleton-loader');
            });
        }
    });
}

// Button Magnetic Pull Interaction
function initMagneticButtons() {
    const magneticBtns = document.querySelectorAll('.btn-premium, .btn-outline, .btn-text, .btn-icon, .btn-newsletter, .btn-chat-premium');
    
    magneticBtns.forEach(btn => {
        btn.addEventListener('mousemove', (e) => {
            const rect = btn.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            
            const pullX = (x / rect.width) * 10;
            const pullY = (y / rect.height) * 10;
            
            btn.style.transform = `translate(${pullX}px, ${pullY}px) scale(1.02)`;
            btn.style.boxShadow = '0 8px 25px rgba(212, 175, 55, 0.2)';
            btn.style.transition = 'transform 0.08s ease-out, box-shadow 0.2s';
        });
        
        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'translate(0px, 0px)';
            btn.style.boxShadow = '';
            btn.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.4s';
        });
    });
}

// Global Keyboard Accessibility Handler for custom elements carrying tabindex="0"
function initGlobalKeyboardAccess() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            const target = e.target.closest('[tabindex="0"]');
            if (target) {
                const tag = target.tagName.toLowerCase();
                // If it is a native interactive control, let the browser handle it natively
                if (tag === 'button' || tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'a') {
                    return;
                }
                
                // Prevent space from scrolling down the page when custom element is active
                if (e.key === ' ') {
                    e.preventDefault();
                }
                
                target.click();
            }
        }
    });
}

// Global Glassmorphic Toast Notification Engine
window.showToast = function(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Choose icon based on type
    let iconClass = 'fa-info-circle';
    if (type === 'success') iconClass = 'fa-check-circle';
    else if (type === 'error') iconClass = 'fa-exclamation-circle';
    else if (type === 'warning') iconClass = 'fa-exclamation-triangle';

    toast.innerHTML = `
        <div class="toast-icon"><i class="fas ${iconClass}"></i></div>
        <div class="toast-message">${message}</div>
        <button class="toast-close" aria-label="Close Notification" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>
    `;

    container.appendChild(toast);

    // Smooth animation trigger
    setTimeout(() => {
        toast.classList.add('visible');
    }, 10);

    // Auto-remove after 4 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.classList.remove('visible');
            setTimeout(() => {
                if (toast.parentElement) {
                    toast.remove();
                }
            }, 300);
        }
    }, 4000);
};

// Global CSRF fetch interceptor
const originalFetch = window.fetch;
window.fetch = function(url, options = {}) {
    const csrfMeta = document.querySelector('meta[name="csrf-token"]');
    if (csrfMeta) {
        const csrfToken = csrfMeta.getAttribute('content');
        if (csrfToken) {
            options.headers = options.headers || {};
            const method = (options.method || 'GET').toUpperCase();
            if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
                options.headers['X-CSRF-Token'] = csrfToken;
            }
        }
    }
    return originalFetch(url, options);
};

