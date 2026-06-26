document.addEventListener('DOMContentLoaded', () => {
    // Initialize landing page modules
    initFAQSearchAccordion();
    initBeforeAfterSliders();
    initScrollReveals();
    initParallaxBackgrounds();
    initTestimonialsCarousel();
    initShowcaseTabs();
    initStatCounters();
    initPremiumContact();
});

// Initialize all before/after sliders on page
function initBeforeAfterSliders() {
    const sliders = document.querySelectorAll('.slider-wrapper');
    
    sliders.forEach(slider => {
        const afterImg = slider.querySelector('.slider-after');
        const bar = slider.querySelector('.slider-bar');
        
        if (!afterImg || !bar) return;

        let isDragging = false;

        function updateSlider(percent) {
            percent = Math.max(0, Math.min(100, percent));
            bar.style.left = `${percent}%`;
            afterImg.style.clipPath = `polygon(0 0, ${percent}% 0, ${percent}% 100%, 0% 100%)`;
        }

        // Mouse Events
        bar.addEventListener('mousedown', (e) => {
            isDragging = true;
            e.preventDefault();
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const rect = slider.getBoundingClientRect();
            const posX = e.clientX - rect.left;
            const percent = (posX / rect.width) * 100;
            updateSlider(percent);
        });

        // Touch Events for Mobile
        bar.addEventListener('touchstart', (e) => {
            isDragging = true;
        }, { passive: true });

        window.addEventListener('touchend', () => {
            isDragging = false;
        });

        window.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            const rect = slider.getBoundingClientRect();
            const touch = e.touches[0];
            const posX = touch.clientX - rect.left;
            const percent = (posX / rect.width) * 100;
            updateSlider(percent);
        });

        // Click to move directly
        slider.addEventListener('click', (e) => {
            if (e.target.closest('.slider-bar') || e.target.closest('.slider-handle')) return;
            const rect = slider.getBoundingClientRect();
            const posX = e.clientX - rect.left;
            const percent = (posX / rect.width) * 100;
            updateSlider(percent);
        });
    });
}

// Scroll Reveals using IntersectionObserver
function initScrollReveals() {
    const revealElements = document.querySelectorAll('.reveal-fade-up, .reveal-stagger-container > *');
    
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -40px 0px'
    };

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                obs.unobserve(entry.target);
            }
        });
    }, observerOptions);

    revealElements.forEach((el) => {
        el.classList.add('reveal-init');
        
        // Handle staggered delays dynamically
        const parent = el.parentElement;
        if (parent && parent.classList.contains('reveal-stagger-container')) {
            const index = Array.from(parent.children).indexOf(el);
            el.style.transitionDelay = `${index * 0.12}s`;
        }
        
        observer.observe(el);
    });
}

// Parallax scroll effect for Hero banner
function initParallaxBackgrounds() {
    const hero = document.querySelector('.hero');
    if (!hero) return;
    
    window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        const heroContent = hero.querySelector('.hero-container');
        if (heroContent) {
            heroContent.style.transform = `translateY(${scrolled * 0.15}px)`;
            heroContent.style.opacity = `${1 - scrolled / 900}`;
        }
    }, { passive: true });
}

// Testimonials Carousel Implementation
function initTestimonialsCarousel() {
    const track = document.getElementById('testimonial-carousel');
    const container = document.querySelector('.carousel-container');
    if (!track || !container) return;

    const slides = Array.from(track.children);
    const nextBtn = document.getElementById('carousel-next');
    const prevBtn = document.getElementById('carousel-prev');
    const dots = Array.from(document.querySelectorAll('.carousel-dot'));

    let currentIndex = 0;
    let autoplayTimer = null;
    const autoplayInterval = 6000; // 6 seconds

    function updateCarousel() {
        track.style.transform = `translateX(-${currentIndex * 100}%)`;

        dots.forEach((dot, index) => {
            if (index === currentIndex) {
                dot.classList.add('active');
                dot.setAttribute('aria-current', 'true');
            } else {
                dot.classList.remove('active');
                dot.setAttribute('aria-current', 'false');
            }
        });
    }

    function showNext() {
        currentIndex = (currentIndex + 1) % slides.length;
        updateCarousel();
    }

    function showPrev() {
        currentIndex = (currentIndex - 1 + slides.length) % slides.length;
        updateCarousel();
    }

    function jumpToSlide(index) {
        currentIndex = index;
        updateCarousel();
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            showNext();
            resetAutoplay();
        });
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            showPrev();
            resetAutoplay();
        });
    }

    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            jumpToSlide(index);
            resetAutoplay();
        });
    });

    function startAutoplay() {
        if (autoplayTimer) clearInterval(autoplayTimer);
        autoplayTimer = setInterval(showNext, autoplayInterval);
    }

    function stopAutoplay() {
        if (autoplayTimer) {
            clearInterval(autoplayTimer);
            autoplayTimer = null;
        }
    }

    function resetAutoplay() {
        stopAutoplay();
        startAutoplay();
    }

    // Pause autoplay on hover
    container.addEventListener('mouseenter', () => {
        if (window.matchMedia('(hover: hover)').matches) {
            stopAutoplay();
        }
    });

    container.addEventListener('mouseleave', () => {
        if (window.matchMedia('(hover: hover)').matches) {
            startAutoplay();
        }
    });

    // Touch events for mobile swiping
    let startX = 0;
    let endX = 0;
    const swipeThreshold = 50;

    track.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        stopAutoplay();
    }, { passive: true });

    track.addEventListener('touchend', (e) => {
        endX = e.changedTouches[0].clientX;
        const diffX = startX - endX;

        if (Math.abs(diffX) > swipeThreshold) {
            if (diffX > 0) {
                showNext();
            } else {
                showPrev();
            }
        }
        startAutoplay();
    }, { passive: true });

    startAutoplay();
}

// Showcase Tabs
function initShowcaseTabs() {
    const tabs = document.querySelectorAll('.showcase-tab');
    const sliders = document.querySelectorAll('.showcase-slider-wrapper');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetStyle = tab.dataset.style;
            
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            sliders.forEach(slider => {
                if (slider.id === `slider-${targetStyle}`) {
                    slider.classList.add('active');
                    const wrapper = slider.querySelector('.slider-wrapper');
                    const afterImg = slider.querySelector('.slider-after');
                    const bar = slider.querySelector('.slider-bar');
                    if (wrapper && afterImg && bar) {
                        bar.style.left = '50%';
                        afterImg.style.clipPath = 'polygon(0 0, 50% 0, 50% 100%, 0% 100%)';
                    }
                } else {
                    slider.classList.remove('active');
                }
            });
        });
    });
}

// Statistics Count-up Animation
function initStatCounters() {
    const statsGrids = document.querySelectorAll('.stats-grid');
    if (!statsGrids.length) return;

    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateCounters(entry.target);
                obs.unobserve(entry.target);
            }
        });
    }, observerOptions);

    statsGrids.forEach(grid => observer.observe(grid));

    function animateCounters(grid) {
        const numbers = grid.querySelectorAll('.stat-number, .stat-decimal');
        
        numbers.forEach(num => {
            const target = parseFloat(num.dataset.target);
            const suffix = num.dataset.suffix || '';
            const prefix = num.dataset.prefix || '';
            const decimals = parseInt(num.dataset.decimals) || 0;
            const duration = 2000; // 2 seconds
            const startTime = performance.now();
            const isDecimal = num.classList.contains('stat-decimal');

            function update(currentTime) {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                
                const easeProgress = progress * (2 - progress);
                const currentVal = easeProgress * target;

                if (isDecimal) {
                    num.textContent = prefix + Math.floor(currentVal) + suffix;
                } else {
                    if (decimals > 0) {
                        num.textContent = prefix + currentVal.toFixed(decimals) + suffix;
                    } else {
                        if (target >= 1000 && !suffix) {
                            num.textContent = prefix + Math.floor(currentVal).toLocaleString() + '+' + suffix;
                        } else {
                            num.textContent = prefix + Math.floor(currentVal) + suffix;
                        }
                    }
                }

                if (progress < 1) {
                    requestAnimationFrame(update);
                } else {
                    if (isDecimal) {
                        num.textContent = prefix + target + suffix;
                    } else {
                        if (decimals > 0) {
                            num.textContent = prefix + target.toFixed(decimals) + suffix;
                        } else {
                            num.textContent = prefix + (target >= 1000 && !suffix ? target.toLocaleString() + '+' : target) + suffix;
                        }
                    }
                }
            }

            requestAnimationFrame(update);
        });
    }
}

// FAQ Search & Dynamic Accordion Heights (with ARIA Accessibility)
function initFAQSearchAccordion() {
    const faqItems = document.querySelectorAll('.faq-item');
    const searchInput = document.getElementById('faq-search-input');
    const clearBtn = document.getElementById('faq-search-clear');
    const emptyState = document.getElementById('faq-empty-state');
    const faqContainer = document.querySelector('.faq-container');
    
    if (!faqItems.length) return;

    // Accordion Toggle
    faqItems.forEach(item => {
        const header = item.querySelector('.faq-header');
        const content = item.querySelector('.faq-content');
        
        header.addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            
            // Close other items
            faqItems.forEach(otherItem => {
                if (otherItem !== item && otherItem.classList.contains('active')) {
                    otherItem.classList.remove('active');
                    otherItem.querySelector('.faq-content').style.maxHeight = '0px';
                    otherItem.querySelector('.faq-header').setAttribute('aria-expanded', 'false');
                }
            });
            
            // Toggle current
            if (isActive) {
                item.classList.remove('active');
                content.style.maxHeight = '0px';
                header.setAttribute('aria-expanded', 'false');
            } else {
                item.classList.add('active');
                content.style.maxHeight = content.scrollHeight + 'px';
                header.setAttribute('aria-expanded', 'true');
            }
        });
    });

    // Client-side Search Filtering
    if (searchInput && faqContainer) {
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.trim().toLowerCase();
            
            if (clearBtn) {
                clearBtn.style.display = query.length > 0 ? 'flex' : 'none';
            }
            
            let visibleCount = 0;
            
            faqItems.forEach(item => {
                const title = item.querySelector('.faq-header span').textContent.toLowerCase();
                const desc = item.querySelector('.faq-content p').textContent.toLowerCase();
                
                if (title.includes(query) || desc.includes(query)) {
                    item.style.display = 'block';
                    visibleCount++;
                    
                    if (item.classList.contains('active')) {
                        const content = item.querySelector('.faq-content');
                        content.style.maxHeight = content.scrollHeight + 'px';
                    }
                } else {
                    item.style.display = 'none';
                    const content = item.querySelector('.faq-content');
                    content.style.maxHeight = '0px';
                }
            });
            
            if (emptyState) {
                if (visibleCount === 0) {
                    emptyState.style.display = 'flex';
                    faqContainer.style.display = 'none';
                } else {
                    emptyState.style.display = 'none';
                    faqContainer.style.display = 'flex';
                }
            }
        });

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                searchInput.value = '';
                clearBtn.style.display = 'none';
                searchInput.dispatchEvent(new Event('input'));
                searchInput.focus();
            });
        }
    }
}

// Premium Contact Section Interactivity & Live Chat
function initPremiumContact() {
    // 1. Premium Contact Form Validator
    const contactForm = document.getElementById('premium-contact-form');
    const formContainer = document.getElementById('contact-form-container');
    const successContainer = document.getElementById('contact-success-container');
    const resetBtn = document.getElementById('btn-reset-contact');
    
    if (contactForm && formContainer && successContainer) {
        const nameInput = document.getElementById('contact-name');
        const emailInput = document.getElementById('contact-email');
        const subjectInput = document.getElementById('contact-subject');
        const messageInput = document.getElementById('contact-message');
        const emailHolder = document.getElementById('success-email-holder');
        
        const inputs = [nameInput, emailInput, subjectInput, messageInput];
        
        // Setup focusout dynamic validators
        inputs.forEach(input => {
            if (!input) return;
            input.addEventListener('focusout', () => validateField(input));
            input.addEventListener('input', () => {
                if (input.classList.contains('invalid')) {
                    validateField(input);
                }
            });
        });
        
        function validateField(input) {
            const errorMsg = document.getElementById(`error-${input.name || input.id.replace('contact-', '')}`);
            let isValid = true;
            
            if (input.required && !input.value.trim()) {
                isValid = false;
            } else if (input.type === 'email' && input.value.trim()) {
                const emailReg = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailReg.test(input.value.trim())) {
                    isValid = false;
                }
            }
            
            if (!isValid) {
                input.classList.add('invalid');
                if (errorMsg) errorMsg.classList.add('active');
            } else {
                input.classList.remove('invalid');
                if (errorMsg) errorMsg.classList.remove('active');
            }
            
            return isValid;
        }
        
        // Form Submit Connection
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            let formValid = true;
            inputs.forEach(input => {
                const fieldValid = validateField(input);
                if (!fieldValid) formValid = false;
            });
            
            if (!formValid) return;
            
            const submitBtn = contactForm.querySelector('button[type="submit"]');
            const originalBtnHTML = submitBtn.innerHTML;
            
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Sending...`;
            
            const formData = new FormData(contactForm);
            
            fetch(contactForm.action, {
                method: 'POST',
                body: formData
            })
            .then(res => {
                if (res.ok) return res.json();
                throw new Error("Bad network response");
            })
            .then(() => {
                setTimeout(() => {
                    if (emailHolder) emailHolder.textContent = emailInput.value.trim();
                    
                    contactForm.style.display = 'none';
                    successContainer.style.display = 'flex';
                    
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnHTML;
                }, 800);
            })
            .catch(err => {
                console.error("Contact Submission Error:", err);
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnHTML;
                alert("There was an error sending your message. Please try again or contact us directly via email.");
            });
        });
        
        // Form Reset Handler
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                contactForm.reset();
                successContainer.style.display = 'none';
                contactForm.style.display = 'block';
            });
        }
    }
    
    // 2. FAQ Shortcut Scroll & Trigger Connections
    const faqShortcutBtns = document.querySelectorAll('.faq-shortcut-btn');
    faqShortcutBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.faqIndex);
            const faqSection = document.getElementById('faq');
            
            if (faqSection) {
                faqSection.scrollIntoView({ behavior: 'smooth' });
                
                setTimeout(() => {
                    const faqItems = document.querySelectorAll('.faq-item');
                    const targetFAQ = faqItems[index];
                    if (targetFAQ) {
                        const header = targetFAQ.querySelector('.faq-header');
                        if (header && !targetFAQ.classList.contains('active')) {
                            header.click();
                        }
                    }
                }, 500);
            }
        });
    });
    
    // 3. Floating Live Chat Widget Handler
    const chatBtn = document.getElementById('btn-live-chat');
    const chatPanel = document.getElementById('live-chat-panel');
    const closeChatBtn = document.getElementById('btn-close-chat');
    const chatForm = document.getElementById('chat-input-form');
    const chatInputField = document.getElementById('chat-input-field');
    const chatHistoryBox = document.getElementById('chat-history-box');
    
    if (chatBtn && chatPanel && closeChatBtn) {
        chatBtn.addEventListener('click', () => {
            chatPanel.classList.add('active');
            if (chatInputField) chatInputField.focus();
        });
        
        closeChatBtn.addEventListener('click', () => {
            chatPanel.classList.remove('active');
        });
        
        if (chatForm && chatInputField && chatHistoryBox) {
            chatForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const text = chatInputField.value.trim();
                if (!text) return;
                
                chatInputField.value = '';
                
                const now = new Date();
                const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                
                const userBubble = document.createElement('div');
                userBubble.className = 'chat-msg user';
                userBubble.innerHTML = `<p>${escapeHTML(text)}</p><span class="msg-time">${timeString}</span>`;
                chatHistoryBox.appendChild(userBubble);
                
                chatHistoryBox.scrollTop = chatHistoryBox.scrollHeight;
                
                setTimeout(() => {
                    const typingBubble = document.createElement('div');
                    typingBubble.className = 'chat-msg system typing-indicator-bubble';
                    typingBubble.innerHTML = `<p style="font-style: italic; opacity: 0.7;">Assistant is typing...</p>`;
                    chatHistoryBox.appendChild(typingBubble);
                    chatHistoryBox.scrollTop = chatHistoryBox.scrollHeight;
                    
                    setTimeout(() => {
                        typingBubble.remove();
                        
                        const lowerText = text.toLowerCase();
                        let reply = "Thank you for asking! I'm the LoveEdit AI Assistant. You can upload couples photos in the Love Studio to generate portraits, or contact our developer Ayush Jha at jhaayushkumar18@gmail.com for enquiries.";
                        
                        if (lowerText.includes('style') || lowerText.includes('filter')) {
                            reply = "We offer 15 premium creative styles like Sunset Romance, Wedding Photoshoot, Charcoal Sketch, and Neon Cyberpunk. You can select and preview them inside the creative Love Studio!";
                        } else if (lowerText.includes('face') || lowerText.includes('blend') || lowerText.includes('landmark')) {
                            reply = "Our AI face-blending coordinates landmarks from both uploaded photos and matches lighting shadows dynamically. Make sure both subjects are facing forward for best results.";
                        } else if (lowerText.includes('4k') || lowerText.includes('resolution') || lowerText.includes('print') || lowerText.includes('download')) {
                            reply = "HD exports are great for social sharing, while 4K renders are optimized for canvas printing and large UHD displays. You can download either resolution from your User Vault page!";
                        } else if (lowerText.includes('price') || lowerText.includes('cost') || lowerText.includes('free') || lowerText.includes('subscribe')) {
                            reply = "We offer 3 pricing packages: Starter, Golden Romance (conic rotating glowing borders!), and Studio Master. You can view the details under our Pricing Options table.";
                        }
                        
                        const sysBubble = document.createElement('div');
                        sysBubble.className = 'chat-msg system';
                        sysBubble.innerHTML = `<p>${reply}</p><span class="msg-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;
                        chatHistoryBox.appendChild(sysBubble);
                        chatHistoryBox.scrollTop = chatHistoryBox.scrollHeight;
                    }, 1200);
                }, 400);
            });
        }
    }
    
    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g, 
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag] || tag)
        );
    }
}
