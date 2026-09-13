/* ==========================================================================
   Grace Community Fellowship – script.js (მკაცრი ერთ-ქარდიანი სლაიდერის ფიქსი)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

    // ──────────────────────────────────────────────
    // 1. STICKY HEADER - სქროლის ეფექტი (ხელუხლებელი)
    // ──────────────────────────────────────────────
    const header = document.querySelector('.main-header');
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');

    if (header) {
        let lastScrollY = window.scrollY;

        const onScroll = () => {
            const currentScrollY = window.scrollY;

            // 1. Toggle standard scroll class
            header.classList.toggle('scrolled', currentScrollY > 60);

            // 2. Mobile smart header logic (hide on scroll down, show on scroll up)
            if (hamburger) {
                const isMobile = window.getComputedStyle(hamburger).display !== 'none';
                const isMenuOpen = navMenu && navMenu.classList.contains('open');

                if (isMobile && !isMenuOpen) {
                    if (currentScrollY > 100 && currentScrollY > lastScrollY) {
                        // Scrolling down - hide header
                        header.classList.add('header-hidden');
                    } else {
                        // Scrolling up or at the top - show header
                        header.classList.remove('header-hidden');
                    }
                } else {
                    // Always show on desktop or when mobile menu is open
                    header.classList.remove('header-hidden');
                }
            }

            lastScrollY = currentScrollY;
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }


    // ──────────────────────────────────────────────
    // 2. WELCOME BANNER - გლუვი გამოჩენა სქროლისას (ხელუხლებელი)
    // ──────────────────────────────────────────────
    const welcomeBanner = document.querySelector('.welcome-banner.floating-banner');

    if (welcomeBanner) {
        const revealBanner = () => {
            if (window.scrollY > 1) {
                welcomeBanner.classList.add('banner-visible');
                window.removeEventListener('scroll', revealBanner);
            }
        };
        window.addEventListener('scroll', revealBanner, { passive: true });
    }


    // ──────────────────────────────────────────────
    // 3. MOBILE NAVIGATION (ჰამბურგერი & Dropdowns) (ხელუხლებელი)
    // ──────────────────────────────────────────────
    if (hamburger && navMenu) {
        hamburger.addEventListener('click', () => {
            const isOpen = navMenu.classList.toggle('open');
            hamburger.classList.toggle('active');
            hamburger.setAttribute('aria-expanded', isOpen);
            document.body.style.overflow = isOpen ? 'hidden' : '';
        });

        // კლავიატურის "Escape" ღილაკით დახურვა
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && navMenu.classList.contains('open')) {
                navMenu.classList.remove('open');
                hamburger.classList.remove('active');
                hamburger.setAttribute('aria-expanded', 'false');
                document.body.style.overflow = '';
            }
        });

        // მობილურზე Dropdown მენიუების მართვის ლოგიკა (აკორდეონი)
        const dropdownLinks = navMenu.querySelectorAll('.has-dropdown > a');
        dropdownLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                // "#" ლინკები არასდროს უნდა გადახტნენ გვერდის თავში (დესკტოპზეც)
                if ((link.getAttribute('href') || '').trim() === '#') {
                    e.preventDefault();
                }

                if (window.innerWidth <= 1307) {
                    const parentLi = link.parentElement;

                    // სხვა გახსნილი dropdown-ების დაკეტვა
                    navMenu.querySelectorAll('.has-dropdown').forEach(item => {
                        if (item !== parentLi) {
                            item.classList.remove('dropdown-open');
                            const otherLink = item.querySelector(':scope > a');
                            if (otherLink) otherLink.setAttribute('aria-expanded', 'false');
                        }
                    });

                    // მიმდინარე მენიუს გადართვა
                    const isDropdownOpen = parentLi.classList.toggle('dropdown-open');
                    link.setAttribute('aria-expanded', isDropdownOpen);
                }
            });
        });

        // ჩვეულებრივ ლინკზე კლიკისას მენიუს ავტომატური დაკეტვა
        const menuLinks = navMenu.querySelectorAll('.nav-list > li:not(.has-dropdown) a, .dropdown-menu a');
        menuLinks.forEach(link => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('open');
                hamburger.classList.remove('active');
                hamburger.setAttribute('aria-expanded', 'false');
                document.body.style.overflow = '';
            });
        });

        // მენიუს დაკეტვა გარედან კლიკისას
        document.addEventListener('click', (e) => {
            if (navMenu.classList.contains('open') &&
                !navMenu.contains(e.target) &&
                !hamburger.contains(e.target)) {
                navMenu.classList.remove('open');
                hamburger.classList.remove('active');
                hamburger.setAttribute('aria-expanded', 'false');
                document.body.style.overflow = '';
            }
        });
    }


    // ──────────────────────────────────────────────
    // 4. CARD SLIDER (მკაცრი დაცვა: ერთი დრაგი = მაქსიმუმ ერთი ქარდი)
    // ──────────────────────────────────────────────
    // ──────────────────────────────────────────────
    // 4. CARD SLIDER (მკაცრი დაცვა: ერთი დრაგი = მაქსიმუმ ერთი ქარდი)
    // ──────────────────────────────────────────────
    const track = document.querySelector('.slider-track');
    const container = document.querySelector('.slider-container');
    const arrowLeft = document.querySelector('.arrow-left');
    const arrowRight = document.querySelector('.arrow-right');

    if (track && container) {
        const originalItems = Array.from(track.children);
        const originalCount = originalItems.length;

        // ელემენტების კლონირება უსასრულო სქროლისთვის
        for (let i = 0; i < 3; i++) {
            originalItems.forEach(item => track.appendChild(item.cloneNode(true)));
        }

        let currentX = 0;
        let targetX = 0;
        let isDragging = false;
        let startX = 0;
        let storedX = 0;
        const EASE = 0.075;
        const DRAG_THRESHOLD = 50; // მინიმალური პიქსელები დრაგის დასაფიქსირებლად
        let lastTouchTime = 0;

        let lastWidth = window.innerWidth;
        let lastItemWidth = 0;
        let lastPad = 0;

        function getItemMetrics() {
            const item = track.querySelector('.card-item');
            if (!item) return { itemWidth: 380, totalWidth: 380 * originalCount };
            const rect = item.getBoundingClientRect();
            const style = window.getComputedStyle(item);
            const ml = parseFloat(style.marginLeft) || 0;
            const mr = parseFloat(style.marginRight) || 0;
            const itemWidth = rect.width + ml + mr;
            const totalWidth = itemWidth * originalCount;
            return { itemWidth, totalWidth };
        }

        function getContainerPadding() {
            return parseFloat(window.getComputedStyle(container).paddingLeft) || 0;
        }

        function init() {
            // თუ ეკრანის სიგანე არ შეცვლილა (მაგ. ვერტიკალური სქროლი მობილურზე), ვინარჩუნებთ პოზიციას
            if (window.innerWidth === lastWidth && currentX !== 0) {
                return;
            }

            const { itemWidth, totalWidth } = getItemMetrics();
            const pad = getContainerPadding();

            if (currentX !== 0 && lastItemWidth > 0) {
                // რეზოლუციის სიგანის შეცვლისას (მაგ. ეკრანის როტაცია), ინარჩუნებს მიმდინარე აქტიურ სლაიდს
                const index = Math.round((targetX - lastPad) / lastItemWidth);
                targetX = (index * itemWidth) + pad;
                currentX = targetX;
            } else {
                // საწყისი ჩატვირთვა
                targetX = -totalWidth + pad;
                currentX = -totalWidth + pad;
            }

            lastWidth = window.innerWidth;
            lastItemWidth = itemWidth;
            lastPad = pad;

            track.style.transform = `translate3d(${currentX}px, 0, 0)`;
        }

        window.addEventListener('load', init);
        window.addEventListener('resize', init);
        init();

        function snapToNearest() {
            const { itemWidth } = getItemMetrics();
            const pad = getContainerPadding();
            let rel = targetX - pad;
            rel = Math.round(rel / itemWidth) * itemWidth;
            targetX = rel + pad;
        }

        // მაუსის დაჭერა
        container.addEventListener('mousedown', (e) => {
            if (Date.now() - lastTouchTime < 500) return;
            if (e.target.closest('.slider-arrow')) return;
            if (!e.target.closest('.slider-track')) return; // სქროლვა მხოლოდ სლაიდერის შიგთავსზე
            e.preventDefault();
            isDragging = true;
            startX = e.clientX;
            storedX = targetX;
        });

        // მაუსის მოძრაობა მკაცრი ჩამკეტით
        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const { itemWidth } = getItemMetrics();
            const diff = e.clientX - startX;

            if (diff > DRAG_THRESHOLD) {
                targetX = storedX + itemWidth;
                isDragging = false;
                snapToNearest();
            } else if (diff < -DRAG_THRESHOLD) {
                targetX = storedX - itemWidth;
                isDragging = false;
                snapToNearest();
            } else {
                targetX = storedX + diff;
            }
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
            snapToNearest();
        });

        container.addEventListener('mouseleave', () => {
            if (isDragging) { isDragging = false; snapToNearest(); }
        });

        // 🌟 თაჩ დრაგი მობილურისთვის ოპტიმიზებული სქროლის ბლოკით (ახალი კოდი სწორ ადგილას)
        let touchStartX = 0, touchStartY = 0, touchStoredX = 0;
        let isTouchDragging = false;

        container.addEventListener('touchstart', (e) => {
            lastTouchTime = Date.now();
            if (e.target.closest('.slider-arrow')) return;
            if (!e.target.closest('.slider-track')) return; // სქროლვა მხოლოდ სლაიდერის შიგთავსზე
            isTouchDragging = true;
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchStoredX = targetX;
        }, { passive: true });

        container.addEventListener('touchmove', (e) => {
            lastTouchTime = Date.now();
            if (!isTouchDragging) return;

            const diffX = e.touches[0].clientX - touchStartX;
            const diffY = e.touches[0].clientY - touchStartY;

            // თუ მომხმარებელი უფრო მეტად გვერდზე სქროლავს, ვიდრე ზემოთ/ქვემოთ
            if (Math.abs(diffX) > Math.abs(diffY)) {
                if (e.cancelable) e.preventDefault(); // ვბლოკავთ გვერდის ზემოთ/ქვემოთ გაქცევას
            }

            const { itemWidth } = getItemMetrics();
            const diff = diffX;

            if (diff > DRAG_THRESHOLD) {
                targetX = touchStoredX + itemWidth;
                isTouchDragging = false;
                snapToNearest();
            } else if (diff < -DRAG_THRESHOLD) {
                targetX = touchStoredX - itemWidth;
                isTouchDragging = false;
                snapToNearest();
            } else {
                targetX = touchStoredX + diff;
            }
        }, { passive: false }); // აუცილებელია false, რომ ბრაუზერმა სქროლის ბლოკირება მოგვცეს

        container.addEventListener('touchend', () => {
            lastTouchTime = Date.now();
            isTouchDragging = false;
            snapToNearest();
        });

        // ისრების ფუნქციონალი
        if (arrowLeft) {
            arrowLeft.addEventListener('click', () => {
                targetX += getItemMetrics().itemWidth;
                snapToNearest();
            });
        }
        if (arrowRight) {
            arrowRight.addEventListener('click', () => {
                targetX -= getItemMetrics().itemWidth;
                snapToNearest();
            });
        }

        // ანიმაციის ციკლი
        function animate() {
            currentX += (targetX - currentX) * EASE;
            const { totalWidth } = getItemMetrics();
            const pad = getContainerPadding();
            if (currentX > pad) {
                targetX -= totalWidth;
                currentX -= totalWidth;
                storedX -= totalWidth;
                touchStoredX -= totalWidth;
            }
            if (currentX < -(totalWidth * 2) + pad) {
                targetX += totalWidth;
                currentX += totalWidth;
                storedX += totalWidth;
                touchStoredX += totalWidth;
            }
            track.style.transform = `translate3d(${currentX}px, 0, 0)`;
            requestAnimationFrame(animate);
        }
        animate();
    } // <─── აი აქ იხურება სლაიდერის მთავარი ბლოკი იდეალურად!


    // ──────────────────────────────────────────────
    // 5. BACK TO TOP ღილაკის მუშაობის ლოგიკა (ხელუხლებელი)
    // ──────────────────────────────────────────────
    const backToTopBtn = document.querySelector('.back-to-top');

    if (backToTopBtn) {
        window.addEventListener('scroll', () => {
            backToTopBtn.classList.toggle('visible', window.scrollY > 300);
        }, { passive: true });

        backToTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }


    // ──────────────────────────────────────────────
    // 6. VIDEO PLACEHOLDERS - ინტერაქტიული YouTube ფლეიერი და Thumbnail-ები
    // ──────────────────────────────────────────────
    const setupVideoClick = (el) => {
        // ჩაწერილი id დეპლოის დროინდელი სურათია — მას მხოლოდ მაშინ ვხედავთ,
        // როცა YouTube-ის feed-იც და Sanity-ის სარეზერვო ველიც მიუწვდომელია.
        // ახალი ქადაგების ატვირთვისას განახლება არ არის სავალდებულო, მაგრამ
        // სასურველია: ის განსაზღვრავს, რას ხედავს ინკოგნიტო ვიზიტორი feed-ის ჩავარდნისას.
        const videoId = el.getAttribute('data-video-id') || 'qj7EVIvEEhI';
        const platform = el.getAttribute('data-video-platform') || (videoId.match(/^\d+$/) ? 'vimeo' : 'youtube');

        if (platform === 'vimeo') {
            el.style.backgroundSize = 'cover';
            el.style.backgroundPosition = 'center';
            el.style.position = 'relative';

            // Try to fetch Vimeo thumbnail
            fetch(`https://vimeo.com/api/v2/video/${videoId}.json`)
                .then(res => res.json())
                .then(data => {
                    if (data && data[0] && data[0].thumbnail_large) {
                        el.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.1), rgba(0,0,0,0.2)), url('${data[0].thumbnail_large}')`;
                    }
                })
                .catch(err => {
                    console.error('Error fetching Vimeo thumbnail:', err);
                    el.style.backgroundColor = '#1e1e1e';
                });
        } else {
            /* Set high quality YouTube thumbnail dynamically */
            if (typeof setYouTubeThumbnailBackground === 'function') {
                setYouTubeThumbnailBackground(el, videoId, 'linear-gradient(rgba(0,0,0,0.1), rgba(0,0,0,0.2))');
            } else {
                el.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.1), rgba(0,0,0,0.2)), url('https://img.youtube.com/vi/${videoId}/hqdefault.jpg')`;
            }
            el.style.backgroundSize = 'cover';
            el.style.backgroundPosition = 'center';
            el.style.position = 'relative';
        }

        el.addEventListener('click', () => {
            const iframe = document.createElement('iframe');

            if (platform === 'vimeo') {
                iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share');
                iframe.setAttribute('allowfullscreen', 'true');
                iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
                iframe.setAttribute('frameborder', '0');
            } else {
                iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
                iframe.setAttribute('allowfullscreen', 'true');
                iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
            }

            // შეფუთვა video-container კლასში სითხისთვის
            const videoContainer = document.createElement('div');
            videoContainer.className = 'video-container';
            videoContainer.appendChild(iframe);

            // Hide all existing children of the placeholder to preserve the user gesture target in DOM
            Array.from(el.children).forEach(child => {
                if (child !== videoContainer) {
                    child.style.setProperty('display', 'none', 'important');
                }
            });

            // Append container to the DOM first so the navigation is linked to the active user gesture
            el.appendChild(videoContainer);

            const activeVideoId = el.getAttribute('data-video-id') || videoId;
            const activePlatform = el.getAttribute('data-video-platform') || platform;
            if (window.efcTrack) {
                // მთავარი გვერდის „ბოლო ქადაგება“ ცალკე ითვლება, რომ
                // ქადაგებების გვერდის მთვლელს შეუერთდეს.
                const isSermon = el.id === 'sanity-latest-sermon';
                efcTrack(isSermon ? 'sermon_play' : 'video_play', {
                    video_id: activeVideoId,
                    platform: activePlatform,
                    placement: el.className.split(' ')[0]
                });
            }

            if (activePlatform === 'vimeo') {
                iframe.setAttribute('src', `https://player.vimeo.com/video/${activeVideoId}?autoplay=1&badge=0&autopause=0&player_id=0&app_id=58479`);
            } else {
                iframe.setAttribute('src', `https://www.youtube-nocookie.com/embed/${activeVideoId}?autoplay=1&vq=hd1080&rel=0&modestbranding=1`);
            }

            // Focus the iframe immediately to transfer user activation
            iframe.focus();

            el.style.display = 'block';
            el.style.background = '#000';
            el.removeAttribute('role');
            el.removeAttribute('tabindex');
        }, { once: true });
    };

    document.querySelectorAll('.video-placeholder, .main-video-placeholder, .camp-video-placeholder').forEach(el => {
        setupVideoClick(el);
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                el.click();
            }
        });
    });


    // ──────────────────────────────────────────────
    // 7. რუკის სქროლის დამცავი ფენა (Map Overlay) (ხელუხლებელი)
    // ──────────────────────────────────────────────
    document.querySelectorAll('.map-wrapper').forEach(wrapper => {
        const overlay = wrapper.querySelector('.map-overlay');
        const hint = wrapper.closest('.contact-map-col')?.querySelector('.map-hint');
        const hintText = hint?.querySelector('.hint-text');
        if (!overlay) return;

        overlay.addEventListener('click', () => {
            overlay.classList.add('map-unlocked');
            if (hint) hint.classList.add('hint-active');
            if (hintText) hintText.textContent = 'რუკის დასაბლოკად მაუსი გაწიეთ გარეთ';
        });

        wrapper.addEventListener('mouseleave', () => {
            overlay.classList.remove('map-unlocked');
            if (hint) hint.classList.remove('hint-active');
            if (hintText) hintText.textContent = 'დააკლიკეთ რუკაზე ინტერაქტივისთვის';
        });

        overlay.addEventListener('touchstart', () => {
            overlay.classList.add('map-unlocked');
        }, { passive: true });
    });

    // ──────────────────────────────────────────────
    // 8. OPTIMIZE VIDEO PLAYBACK (Intersection Observer)
    // ──────────────────────────────────────────────
    const setupIntersectionObserverForVideo = (videoEl) => {
        if (!videoEl || videoEl.dataset.observed === 'true') return;

        const observerOptions = {
            root: null,
            rootMargin: '0px',
            threshold: 0
        };

        const observerCallback = (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    videoEl.play().catch(err => {
                        console.warn('Video play interrupted or blocked:', err);
                    });
                } else {
                    videoEl.pause();
                }
            });
        };

        const observer = new IntersectionObserver(observerCallback, observerOptions);
        observer.observe(videoEl);
        videoEl.dataset.observed = 'true';
    };

    // Watch for current and future video elements in the building container
    const watchVideoContainer = document.getElementById('building-video-container');
    if (watchVideoContainer) {
        const initialVideo = watchVideoContainer.querySelector('video');
        if (initialVideo) {
            setupIntersectionObserverForVideo(initialVideo);
        }
        const mutObserver = new MutationObserver(() => {
            const currentVideo = watchVideoContainer.querySelector('video');
            if (currentVideo) {
                setupIntersectionObserverForVideo(currentVideo);
            }
        });
        mutObserver.observe(watchVideoContainer, { childList: true });
    }

    // Also support direct fallback selections
    const directVideo = document.getElementById('churchVideo') || document.getElementById('sanity-video-element');
    if (directVideo) {
        setupIntersectionObserverForVideo(directVideo);
    }

});

// Global Body Scroll Lock/Unlock helpers
let isScrollLocked = false;

function preventDefault(e) {
    const activeOverlay = document.querySelector('.creed-modal-overlay.open, .camp-modal.modal-active, .reg-modal.modal-active, .group-modal.modal-active, .modal.modal-active');
    if (activeOverlay) {
        const scrollableContent = activeOverlay.querySelector('.creed-modal, .modal-content-box, .modal-body, #campRegisterForm, #groupRegisterForm');
        if (scrollableContent) {
            if (scrollableContent.contains(e.target)) {
                return;
            }
        }
        e.preventDefault();
    }
}

window.lockBodyScroll = function() {
    document.documentElement.classList.add('no-scroll');
    document.body.classList.add('no-scroll');
    if (!isScrollLocked) {
        window.addEventListener('wheel', preventDefault, { passive: false });
        window.addEventListener('touchmove', preventDefault, { passive: false });
        isScrollLocked = true;
    }
};

window.unlockBodyScroll = function() {
    document.documentElement.classList.remove('no-scroll');
    document.body.classList.remove('no-scroll');
    window.removeEventListener('wheel', preventDefault, { passive: false });
    window.removeEventListener('touchmove', preventDefault, { passive: false });
    isScrollLocked = false;
};



// ──────────────────────────────────────────────
// 9. მომდევნო მსახურების ამთვლელი (მისასალმებელი ბანერის გვერდით)
// ──────────────────────────────────────────────
(function () {
    const panel = document.getElementById('nextService');
    if (!panel) return;

    // საქართველოში ზაფხულის დროზე გადასვლა არ ხდება, ამიტომ მუდმივი +4.
    // ასე ამთვლელი სწორია სხვა დროის სარტყელიდან ნახვისასაც.
    const TZ = 4;

    const DAYS = ['კვირა', 'ორშაბათი', 'სამშაბათი', 'ოთხშაბათი', 'ხუთშაბათი', 'პარასკევი', 'შაბათი'];

    const SERVICES = [
        { day: 0, hour: 11, minute: 0, duration: 120, title: 'საკვირაო ღვთისმსახურება', href: 'pages/new-here.html' },
        { day: 6, hour: 16, minute: 0, duration: 90,  title: 'ახალგაზრდული მსახურება', href: 'pages/youth.html' },
        { day: 3, hour: 19, minute: 0, duration: 90,  title: 'საოჯახო ჯგუფები', href: 'pages/family-groups.html' }
    ];

    const eyebrow = panel.querySelector('.ns-eyebrow');
    const titleLink = panel.querySelector('.ns-title-link');
    const titleText = panel.querySelector('.ns-title-text');
    const when = panel.querySelector('.ns-when');
    const unit = key => panel.querySelector('[data-u="' + key + '"]');
    const pad = n => String(n).padStart(2, '0');

    // მოცემული მსახურების უახლოესი ჩატარების მომენტი (UTC მილიწამებში).
    function occurrence(svc, from) {
        // "shifted" დრო: UTC ველები ტოლია ქუთაისის ლოკალური დროისა.
        const shifted = new Date(from + TZ * 3600e3);
        const delta = (svc.day - shifted.getUTCDay() + 7) % 7;
        return Date.UTC(
            shifted.getUTCFullYear(),
            shifted.getUTCMonth(),
            shifted.getUTCDate() + delta,
            svc.hour, svc.minute, 0
        ) - TZ * 3600e3;
    }

    function stateOf(svc, now) {
        const span = svc.duration * 60e3;
        let start = occurrence(svc, now);
        if (now >= start && now < start + span) {
            return { start: start, live: true, endsAt: start + span };
        }
        if (start <= now) start += 7 * 24 * 3600e3;
        return { start: start, live: false, endsAt: start + span };
    }

    function nextService(now) {
        let best = null;
        SERVICES.forEach(svc => {
            const state = stateOf(svc, now);
            const rank = state.live ? -1 : state.start;
            if (!best || rank < best.rank) best = { svc: svc, state: state, rank: rank };
        });
        return best;
    }

    function paint() {
        const now = Date.now();
        const best = nextService(now);
        if (!best) return;

        titleText.textContent = best.svc.title;
        if (best.svc.href) titleLink.setAttribute('href', best.svc.href);

        if (best.state.live) {
            panel.classList.add('is-live');
            eyebrow.innerHTML = '<span class="ns-live-dot" aria-hidden="true"></span>ახლა მიმდინარეობს';
            when.textContent = 'დასრულდება ' +
                new Date(best.state.endsAt + TZ * 3600e3).toISOString().substr(11, 5) + '-ზე';
            return;
        }

        panel.classList.remove('is-live');
        eyebrow.textContent = 'მომდევნო მსახურება';
        when.textContent = DAYS[best.svc.day] + ' ' + pad(best.svc.hour) + ':' + pad(best.svc.minute);

        let left = Math.max(0, best.state.start - now);
        const d = Math.floor(left / 86400e3); left -= d * 86400e3;
        const h = Math.floor(left / 3600e3);  left -= h * 3600e3;
        const m = Math.floor(left / 60e3);    left -= m * 60e3;

        unit('d').textContent = d;
        unit('h').textContent = pad(h);
        unit('m').textContent = pad(m);
        unit('s').textContent = pad(Math.floor(left / 1000));
    }

    paint();
    setInterval(paint, 1000);

    // პანელი ბანერთან ერთად ჩნდება — ბანერის კლასს ვადევნებთ თვალს,
    // რომ გამოჩენის ლოგიკა ერთ ადგილას დარჩეს.
    const banner = document.querySelector('.welcome-banner.floating-banner');
    if (!banner) {
        panel.classList.add('is-revealed');
        return;
    }

    // მობილურზე ორივე ბარათი ერთდება და გამოცემას რიგი ატარებს,
    // ამიტომ კლასს ორივეს ვაძლევთ — CSS აირჩევს, რომელი გამოიყენოს.
    const row = panel.closest('.welcome-row');
    const sync = () => {
        const on = banner.classList.contains('banner-visible');
        panel.classList.toggle('is-revealed', on);
        if (row) row.classList.toggle('is-revealed', on);
    };
    sync();
    new MutationObserver(sync).observe(banner, { attributes: true, attributeFilter: ['class'] });
})();


// ──────────────────────────────────────────────
// 10. ლოცვითი საჭიროების ფორმა
// ──────────────────────────────────────────────
(function () {
    const form = document.getElementById('prayerForm');
    if (!form) return;

    // Google Form „ლოცვითი საჭიროება“ — entry იდენტიფიკატორები ფორმიდანაა აღებული.
    // action  — ფორმის .../formResponse მისამართი
    // fields  — თითოეული კითხვის entry.XXXXXXXXX იდენტიფიკატორი
    // თუ action ოდესმე დაცარიელდება, ღილაკი ელ-ფოსტაზე გადავა, რომ თხოვნა მაინც მივიდეს
    // და მომხმარებელს ცრუ დადასტურება არ დავანახოთ.
    const PRAYER_FORM = {
        action: 'https://docs.google.com/forms/d/e/1FAIpQLSe9oD4E70ISx6NoVYD9D_xWgWnOoTg-TcS3yNyGyZmwMH9eyg/formResponse',
        fields: {
            message: 'entry.575442378',   // ლოცვითი საჭიროება (სავალდებულო)
            name: 'entry.1565967549',     // სახელი და გვარი
            contact: 'entry.340373505'    // ტელეფონის ნომერი ან ელფოსტა
        }
    };

    const FALLBACK_EMAIL = 'info@efckutaisi.ge';

    const text = document.getElementById('prayerText');
    const name = document.getElementById('prayerName');
    const contact = document.getElementById('prayerContact');
    const anon = document.getElementById('prayerAnon');
    const error = form.querySelector('.prayer-error');
    const submit = form.querySelector('.prayer-submit');
    const submitIcon = form.querySelector('.prayer-submit-icon');
    const submitLabel = form.querySelector('.prayer-submit-label');
    const done = form.parentElement.querySelector('.prayer-done');

    // ანონიმურ რეჟიმში სახელი და კონტაქტი ითიშება, რომ აშკარა იყოს,
    // რას აგზავნის მომხმარებელი.
    anon.addEventListener('change', () => {
        const on = anon.checked;
        name.disabled = on;
        contact.disabled = on;
        if (on) {
            name.value = '';
            contact.value = '';
        }
    });

    // გაგზავნის მდგომარეობა: ღილაკი იბლოკება, ხატი ბრუნავს და
    // წარწერა იცვლება — ასე ორჯერ დაჭერა აღარ ხდება.
    const setSending = on => {
        submit.disabled = on;
        submit.classList.toggle('is-sending', on);
        submitIcon.className = on
            ? 'fa-solid fa-circle-notch prayer-submit-icon'
            : 'fa-solid fa-paper-plane prayer-submit-icon';
        submitLabel.textContent = on ? 'იგზავნება…' : 'გაგზავნა';
    };

    const fail = message => {
        setSending(false);
        error.textContent = message;
        error.hidden = false;
    };

    form.addEventListener('submit', event => {
        event.preventDefault();
        error.hidden = true;

        const body = text.value.trim();
        if (body.length < 5) {
            fail('გთხოვთ, დაწეროთ თქვენი ლოცვითი საჭიროება.');
            text.focus();
            return;
        }

        const who = anon.checked ? 'ანონიმური' : (name.value.trim() || 'არ მიუთითა');
        const how = anon.checked ? '—' : (contact.value.trim() || '—');

        if (!PRAYER_FORM.action || !PRAYER_FORM.fields.message) {
            const subject = encodeURIComponent('ლოცვითი საჭიროება');
            const mailBody = encodeURIComponent(
                body + '\n\n— ' + who + (how !== '—' ? '\nკონტაქტი: ' + how : '')
            );
            window.location.href = 'mailto:' + FALLBACK_EMAIL + '?subject=' + subject + '&body=' + mailBody;
            return;
        }

        setSending(true);

        const data = new FormData();
        data.append(PRAYER_FORM.fields.message, body);
        if (PRAYER_FORM.fields.name) data.append(PRAYER_FORM.fields.name, who);
        if (PRAYER_FORM.fields.contact) data.append(PRAYER_FORM.fields.contact, how);

        fetch(PRAYER_FORM.action, { method: 'POST', body: data, mode: 'no-cors' })
            .then(() => {
                form.style.display = 'none';
                done.hidden = false;
                if (window.efcTrack) efcTrack('prayer_request', { anonymous: anon.checked ? 'yes' : 'no' });
            })
            .catch(err => {
                console.error('ლოცვითი საჭიროების გაგზავნა ვერ მოხერხდა:', err);
                fail('დაფიქსირდა ხარვეზი. სცადეთ მოგვიანებით ან მოგვწერეთ ' + FALLBACK_EMAIL);
            });
    });
})();


// ══ ფუტერის გამოწერა ═══════════════════════════════════════════════
// მისამართები ელფოსტის სერვისში ინახება (Brevo ან MailerLite), არა
// საიტზე — გამოწერის გაუქმებას, ორმაგ დადასტურებას და დაგზავნას იქაური
// ინსტრუმენტები აკეთებს. აქ მხოლოდ ფორმის გაგზავნაა.
(function () {
    const box = document.getElementById('footerSubscribe');
    const form = document.getElementById('newsletterForm');
    if (!box || !form) return;

    // Brevo → Marketing → Forms → „საიტის ფუტერის გამოწერა“ → Share.
    // კონტაქტები სიაში „ეკლესიის სიახლეები“ ჩადის.
    //
    // ველები თავად ფორმის გვერდიდანაა აღებული:
    //   EMAIL                — ელფოსტა, ერთადერთი სავალდებულო
    //   email_address_check  — ბოტების ხაფანგი: ცარიელი უნდა დარჩეს,
    //                          შევსებული თხოვნა უარყოფილი იქნება
    //   locale               — ფორმის ენა Brevo-ს მხარეს
    //
    // სანამ action ცარიელია, ბლოკი გვერდზე საერთოდ არ ჩანს — ასე
    // ვიზიტორი ცრუ დადასტურებას ვერ მიიღებს.
    const NEWSLETTER = {
        action: 'https://ae3f7be6.sibforms.com/serve/MUIFAE3PBaVV10yVlxle1Cx4JMICIzxyHfVXXKtsDDtzQtbmh34K18dS2iq_fS6qo9cVDO_ox0zoUCBCDO_PUXw6Sce0WwZcN3zhtGjrHZ4jI_slLCo1XTv8Ri2plZ8foyOqi95uBLZ2B4uLaud1NTkJppbAvMqiT0A_UKAucozTT2Zfz6B8dKL0Zlw366X4gO9sA1l__aXYFRQCGg==',
        emailField: 'EMAIL',
        honeypotField: 'email_address_check',
        locale: 'en'
    };

    if (!NEWSLETTER.action) {
        console.info('გამოწერის ფორმა გამორთულია: script.js-ში NEWSLETTER.action ცარიელია.');
        return;
    }

    box.hidden = false;

    const email = document.getElementById('newsletterEmail');
    const consent = document.getElementById('newsletterConsent');
    const submit = form.querySelector('.subscribe-btn');
    const icon = form.querySelector('.subscribe-icon');
    const msg = form.querySelector('.subscribe-msg');

    const setSending = on => {
        submit.disabled = on;
        submit.classList.toggle('is-sending', on);
        icon.className = on
            ? 'fa-solid fa-circle-notch subscribe-icon'
            : 'fa-solid fa-arrow-right subscribe-icon';
    };

    const say = (text, ok) => {
        msg.textContent = text;
        msg.classList.toggle('is-ok', !!ok);
        msg.classList.toggle('is-error', !ok);
        msg.hidden = false;
    };

    form.addEventListener('submit', event => {
        event.preventDefault();
        msg.hidden = true;

        const value = email.value.trim();
        // ბრაუზერის type="email" შემოწმებას ვენდობით, აქ მხოლოდ
        // ცარიელი ველი და აშკარა შეცდომა გვაინტერესებს.
        if (!value || !email.checkValidity()) {
            say('გთხოვთ, მიუთითოთ სწორი ელფოსტა.');
            email.focus();
            return;
        }
        if (!consent.checked) {
            say('გამოწერისთვის საჭიროა თანხმობის მონიშვნა.');
            consent.focus();
            return;
        }

        setSending(true);

        const data = new FormData();
        data.append(NEWSLETTER.emailField, value);
        // ხაფანგი ცარიელი უნდა წავიდეს — Brevo სწორედ ამით არჩევს
        // ცოცხალ ადამიანს ბოტისგან.
        if (NEWSLETTER.honeypotField) data.append(NEWSLETTER.honeypotField, '');
        if (NEWSLETTER.locale) data.append('locale', NEWSLETTER.locale);

        // no-cors — პასუხს ვერ წავიკითხავთ, მაგრამ მოთხოვნა მიდის.
        // იგივე ხერხია, რითაც დანარჩენი ფორმები მუშაობს.
        fetch(NEWSLETTER.action, { method: 'POST', body: data, mode: 'no-cors' })
            .then(() => {
                form.reset();
                setSending(false);
                if (window.efcTrack) efcTrack('newsletter_subscribe');
                // Brevo-ში ორმაგი დადასტურებაა ჩართული: კონტაქტი სიაში
                // მხოლოდ მას შემდეგ ჩადის, რაც წერილში ბმულს დააჭერს.
                say('გმადლობთ! ელფოსტაზე მოგივათ წერილი — გამოწერის დასადასტურებლად დააჭირეთ მასში მოცემულ ბმულს.', true);
            })
            .catch(err => {
                console.error('გამოწერა ვერ მოხერხდა:', err);
                setSending(false);
                say('დაფიქსირდა ხარვეზი. სცადეთ მოგვიანებით.');
            });
    });
})();


// ══ Service worker ═════════════════════════════════════════════════
// ოფლაინ წვდომას და მთავარ ეკრანზე დაინსტალირებას ემსახურება.
// მისამართს თავად ამ სკრიპტის მისამართიდან ვიღებთ: გვერდები
// სხვადასხვა დონეზე დევს, sw.js კი საიტის ძირშია და მთელ საიტს
// უნდა აკონტროლებდეს.
(function () {
    if (!('serviceWorker' in navigator)) return;

    // document.currentScript მხოლოდ ფაილის შესრულებისას მუშაობს —
    // ამიტომ მისამართს აქვე ვიმახსოვრებთ, load-ს არ ველოდებით.
    const src = (document.currentScript && document.currentScript.src) || '';
    if (!src) return;

    const swUrl = new URL('sw.js', src).href;

    // მთავარ ეკრანზე დაინსტალირებულ აპს iOS მეხსიერებაში აჩერებს:
    // ხატულაზე დაჭერა იმავე ძველ გვერდს აბრუნებს და განახლება
    // შეიძლება დღეებით არ დაინახოს. ქვემოთ სამივე გამოსავალია —
    // sw.js ქეშიდან აღარ იკითხება, ყოველ დაბრუნებაზე ვამოწმებთ
    // ახალ ვერსიას და დიდი პაუზის შემდეგ გვერდს თავიდან ვტვირთავთ.
    const RECHECK_MS = 60 * 1000;
    const STALE_MS = 30 * 60 * 1000;

    // ფორმის შევსების ან გახსნილი მოდალის დროს გადატვირთვა
    // ნაშრომს გააქრობდა — ასეთ დროს ხელს არ ვახლებთ.
    // სხვა სკრიპტები (podcast.js, sanity-fetch.js) აქ საკუთარ შემოწმებას
    // ამატებენ — მიმდინარე დაკვრა გადატვირთვას არ უნდა შეეწიროს.
    window.efcBusyChecks = window.efcBusyChecks || [];
    const isBusy = () => {
        if (document.querySelector('.modal-active, .creed-modal-overlay.open')) return true;
        // დაჭერით გახსნილი ვიდეო (YouTube/Vimeo iframe ადგილმჭერში)
        if (document.querySelector('.video-placeholder iframe, .main-video-placeholder iframe, .camp-video-placeholder iframe')) return true;
        if (window.efcBusyChecks.some(check => { try { return !!check(); } catch (e) { return false; } })) return true;
        return [...document.querySelectorAll('input, textarea')].some(field => {
            if (field.type === 'hidden' || field.type === 'checkbox' || field.type === 'radio') return false;
            // წინასწარ ჩაწერილი მნიშვნელობა შევსება არ არის.
            return field.value !== '' && field.value !== field.defaultValue;
        });
    };

    // რეგისტრაციას გვერდის ჩატვირთვის შემდეგ ვაკეთებთ, რომ პირველი
    // ჩვენებისთვის საჭირო ფაილებს არხი არ წაართვას.
    window.addEventListener('load', () => {
        // updateViaCache: 'none' — თავად sw.js ყოველთვის ქსელიდან.
        navigator.serviceWorker.register(swUrl, { updateViaCache: 'none' })
            .then(registration => {
                let hiddenAt = 0;
                let checkedAt = Date.now();

                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'hidden') {
                        hiddenAt = Date.now();
                        return;
                    }

                    const away = hiddenAt ? Date.now() - hiddenAt : 0;

                    // დიდხანს დახურული აპი უბრალოდ მოძველებულია.
                    if (away > STALE_MS && !isBusy()) {
                        window.location.reload();
                        return;
                    }

                    if (Date.now() - checkedAt < RECHECK_MS) return;
                    checkedAt = Date.now();
                    registration.update().catch(() => {});
                });
            })
            .catch(err => {
                console.warn('Service worker რეგისტრაცია ვერ მოხერხდა:', err);
            });
    });
})();


// ══ მთავარ ეკრანზე დამატება ════════════════════════════════════════
// ორი შესასვლელი აქვს:
//   1. ავტომატური ზოლი — მობილურზე, მეორე ვიზიტიდან, 15 წამის შემდეგ.
//      უარის თქმის შემდეგ სამი თვე ჩუმდება.
//   2. ფუტერის ღილაკი — ყოველთვის ხელმისაწვდომი. ვინც ზოლი დახურა და
//      მერე გადაიფიქრა, სამ თვეს არ უნდა ელოდოს.
(function () {
    const KEY = 'efck:install:v1';
    const QUIET_DAYS = 90;
    const MIN_VISITS = 2;
    const DELAY_MS = 15000;

    const src = (document.currentScript && document.currentScript.src) || '';
    if (!src) return;
    const iconUrl = new URL('icons/icon-192.png', src).href;

    // უკვე დაინსტალირებულია — არც ზოლი გვჭირდება, არც ღილაკი.
    const installed = window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
    if (installed) return;

    const ua = navigator.userAgent;
    // iPadOS 13-იდან iPad თავს Mac-ად წარადგენს — მის user agent-ში
    // სიტყვა „iPad“ აღარ წერია. ერთადერთი საიმედო განსხვავება
    // შეხების წერტილებია: ნამდვილ Mac-ს ნული აქვს.
    const isIPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    const isIOS = (/iPad|iPhone|iPod/.test(ua) || isIPadOS) && !window.MSStream;
    // Facebook-ისა და Instagram-ის შიდა ბრაუზერს „Add to Home Screen“
    // საერთოდ არ აქვს — იქ ინსტრუქცია მხოლოდ დააბნევდა.
    const inApp = /FBAN|FBAV|FB_IAB|Instagram|MicroMessenger/i.test(ua);
    // iOS-ზე ყველა ბრაუზერი WebKit-ზეა, მაგრამ გაზიარების ღილაკი
    // სხვადასხვა ადგილას უდევთ: Safari-ს ქვემოთ, Chrome-ს — მენიუში.
    const iosOtherBrowser = isIOS && /CriOS|FxiOS|EdgiOS|OPT\//i.test(ua);

    let state;
    try {
        state = JSON.parse(localStorage.getItem(KEY)) || {};
    } catch (e) {
        state = {};
    }
    if (typeof state.visits !== 'number') state.visits = 0;
    state.visits += 1;

    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
    }
    save();

    // Android/Chrome ამ მოვლენას თავად აგზავნის; iOS-ზე ის არ არსებობს.
    let deferred = null;
    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferred = e;
        showFooterLink();
    });

    // ── ზოლი ────────────────────────────────────────────────────────
    function openBar() {
        if (!deferred && !isIOS && !inApp) return;
        // ქუქიების ზოლი ჯერ პასუხს ელოდება — ორი ზოლი ერთად ბევრია.
        if (document.querySelector('.install-bar')) return;

        const bar = document.createElement('div');
        bar.className = 'install-bar';
        bar.setAttribute('role', 'dialog');
        bar.setAttribute('aria-label', 'აპლიკაციის დამატება');

        const shareIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
            + '<path d="M12 3v12M12 3l-4 4M12 3l4 4M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6"'
            + ' fill="none" stroke="currentColor" stroke-width="2"'
            + ' stroke-linecap="round" stroke-linejoin="round"/></svg>';

        let action;
        if (inApp) {
            action = '<p class="install-hint">ჯერ გახსენი Safari-ში: დააჭირე „•••“ და აირჩიე „Open in Safari“.</p>';
        } else if (isIOS) {
            // iPhone-ზე ბმული ხშირად Chrome-ში იხსნება და არა Safari-ში.
            // ღილაკი სხვაგან დევს, ამიტომ ნაბიჯებიც სხვაა — თორემ
            // ინსტრუქცია იმას აღწერს, რასაც ვიზიტორი ეკრანზე ვერ ხედავს.
            // ღილაკს სახელითაც ვასახელებთ: თუ ხატულა არ დაიხატა,
            // წინადადება მაინც სრული რჩება.
            action = iosOtherBrowser
                ? '<ol class="install-steps">'
                    + '<li>ზემოთ მარჯვნივ დააჭირე „•••“ და აირჩიე „Share“ ' + shareIcon + '</li>'
                    + '<li>ჩამონათვალში აირჩიე „Add to Home Screen“</li>'
                    + '<li class="install-note">თუ ვერ იპოვე — გახსენი იგივე გვერდი Safari-ში</li>'
                    + '</ol>'
                : '<ol class="install-steps">'
                    + '<li>ეკრანის ბოლოში დააჭირე გაზიარების ღილაკს ' + shareIcon + ' — კვადრატი ისრით</li>'
                    + '<li>ჩამონათვალი ჩამოქაჩე და აირჩიე „Add to Home Screen“</li>'
                    + '</ol>';
        } else {
            action = '<button type="button" class="install-go">'
                + '<i class="fa-solid fa-download" aria-hidden="true"></i>'
                + 'დამატება</button>';
        }

        bar.innerHTML = `
            <span class="install-icon" style="background-image:url('${iconUrl}')" aria-hidden="true"></span>
            <div class="install-body">
                <span class="install-eyebrow">აპლიკაცია</span>
                <strong>დაამატე მთავარ ეკრანზე</strong>
                <span class="install-lead">დღის მუხლი და ქადაგებები ერთი შეხებით.</span>
                ${action}
            </div>
            <button type="button" class="install-close" aria-label="დახურვა">
                <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>`;

        document.body.appendChild(bar);
        // rAF დამალულ ტაბში ჩერდება — ტაიმერი დაზღვევაა.
        const open = () => bar.classList.add('is-open');
        requestAnimationFrame(open);
        setTimeout(open, 50);

        const close = () => {
            bar.classList.remove('is-open');
            setTimeout(() => bar.remove(), 300);
        };

        bar.querySelector('.install-close').addEventListener('click', () => {
            state.dismissedAt = Date.now();
            save();
            close();
        });

        const go = bar.querySelector('.install-go');
        if (go) {
            go.addEventListener('click', () => {
                close();
                if (!deferred) return;
                deferred.prompt();
                deferred.userChoice
                    .then(res => {
                        if (res && res.outcome === 'accepted' && window.efcTrack) {
                            efcTrack('app_installed', { platform: 'android' });
                        }
                        // უარიც პასუხია — ავტომატურად აღარ შევაწუხებთ.
                        if (res && res.outcome !== 'accepted') {
                            state.dismissedAt = Date.now();
                            save();
                        }
                        deferred = null;
                        showFooterLink();
                    })
                    .catch(() => { deferred = null; });
            });
        }
    }

    // ── ფუტერის ღილაკი ──────────────────────────────────────────────
    function mountFooterLink() {
        const strip = document.querySelector('.footer-bottom');
        if (!strip || strip.querySelector('.footer-install')) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'footer-install';
        btn.hidden = true;
        btn.innerHTML = '<i class="fa-solid fa-mobile-screen-button" aria-hidden="true"></i>'
            + '<span>აპლიკაციის დაყენება</span>';

        // ჯვრით დახურვა ზოლს ჩუმდება, ღილაკს კი არა — აქედან
        // ნებისმიერ დროს შეიძლება ხელახლა გახსნა.
        btn.addEventListener('click', () => {
            const bar = document.querySelector('.install-bar');
            if (bar) bar.remove();
            openBar();
        });

        strip.insertBefore(btn, strip.querySelector('.footer-social'));
        showFooterLink();
    }

    function showFooterLink() {
        const btn = document.querySelector('.footer-install');
        // Firefox-ს და სხვა ბრაუზერებს დაინსტალირება არ შეუძლიათ —
        // მათთვის ღილაკი დამალული რჩება.
        if (btn) btn.hidden = !(deferred || isIOS || inApp);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountFooterLink);
    } else {
        mountFooterLink();
    }

    // ავტომატური ზოლი მხოლოდ მობილურზე და მხოლოდ დათქმულ პირობებში.
    const isMobile = window.matchMedia('(max-width: 991px)').matches;
    const quiet = state.dismissedAt && Date.now() - state.dismissedAt < QUIET_DAYS * 864e5;
    if (isMobile && state.visits >= MIN_VISITS && !quiet) {
        setTimeout(openBar, DELAY_MS);
    }
})();


/* ==========================================================================
   Push შეტყობინებები — OneSignal
   --------------------------------------------------------------------------
   ვინც ჩართავს, ახალ ქადაგებაზე შეტყობინებას მიიღებს (ორშაბათობით,
   GitHub-ის სამუშაოდან) და ხანდახან ღონისძიებაზეც (OneSignal-ის პანელიდან
   ხელით). ეს ფოსტისგან დამოუკიდებელი არხია — მისამართი არ სჭირდება,
   იწერება მოწყობილობა.

   ბრაუზერის ორი წესი, რომელიც აქ ყველაფერს განსაზღვრავს:
   1. ნებართვას მხოლოდ დაჭერით ვთხოვთ. ავტომატურად მკითხავ საიტებს
      Chrome აჩუმებს და მერე ნებართვის თხოვნაც აღარ ჩანს.
   2. iPhone-ზე push მხოლოდ დაინსტალირებულ აპლიკაციაში მუშაობს —
      ბრაუზერიდან PushManager არ არსებობს, ამიტომ იქ ღილაკიც არ ჩანს.
   ========================================================================== */
(function () {
    const APP_ID = 'b657bdbe-ade7-4269-b8d0-63fcf7c4f698';
    const KEY = 'efck-push';
    const QUIET_DAYS = 60;
    const DELAY_MS = 8000;

    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
    // ნებართვა ერთხელ უკვე უარყოფილია — ბრაუზერი მეორედ არ იკითხავს,
    // ღილაკი მხოლოდ იმედს გაუცრუებდა.
    if (Notification.permission === 'denied') return;

    const src = (document.currentScript && document.currentScript.src) || '';
    if (!src) return;
    const iconUrl = new URL('icons/icon-192.png', src).href;
    const installed = window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;

    let state;
    try {
        state = JSON.parse(localStorage.getItem(KEY)) || {};
    } catch (e) {
        state = {};
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
    }

    // ── SDK ─────────────────────────────────────────────────────────
    // ერთ ადგილას, ყველა გვერდისთვის — რომ 14 HTML-ში script-ტეგი არ
    // გვეწეროს. სერვის-ვორკერი ჩვენივე sw.js-ია (იხ. importScripts იქ).
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    const ready = new Promise(resolve => {
        window.OneSignalDeferred.push(async function (OneSignal) {
            await OneSignal.init({
                appId: APP_ID,
                serviceWorkerPath: 'sw.js',
                serviceWorkerParam: { scope: '/' },
                // OneSignal-ის საკუთარი ზარი და ფანჯრები გამორთულია —
                // ინტერფეისი ჩვენია, ქართულად.
                notifyButton: { enable: false },
                promptOptions: { slidedown: { prompts: [] } }
            });
            OneSignal.Notifications.addEventListener('permissionChange', refresh);
            resolve(OneSignal);
        });
    });
    const sdk = document.createElement('script');
    sdk.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
    sdk.defer = true;
    document.head.appendChild(sdk);

    let sdkReady = false;
    ready.then(() => { sdkReady = true; refresh(); });

    const granted = () => Notification.permission === 'granted';

    // ნებართვის თხოვნა დაჭერის შიგნით უნდა მოხდეს — ამიტომ ღილაკები
    // მხოლოდ მაშინ ჩნდება, როცა SDK უკვე ჩატვირთულია და await-ს
    // დაჭერასა და კითხვას შორის დრო აღარ სჭირდება.
    function subscribe() {
        return ready.then(OneSignal => OneSignal.Notifications.requestPermission())
            .catch(() => {})
            .then(() => {
                if (granted() && window.efcTrack) efcTrack('push_enabled');
                refresh();
            });
    }

    // ── ფუტერის ღილაკი ──────────────────────────────────────────────
    function mountFooterLink() {
        const strip = document.querySelector('.footer-bottom');
        if (!strip || strip.querySelector('.footer-push')) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'footer-push';
        btn.hidden = true;
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            btn.disabled = true;
            subscribe().then(() => { btn.disabled = false; });
        });
        strip.insertBefore(btn, strip.querySelector('.footer-social'));
        refresh();
    }

    function refresh() {
        const btn = document.querySelector('.footer-push');
        if (!btn) return;
        if (!sdkReady || Notification.permission === 'denied') {
            btn.hidden = true;
            return;
        }
        if (granted()) {
            btn.innerHTML = '<i class="fa-solid fa-bell" aria-hidden="true"></i>'
                + '<span>შეტყობინებები ჩართულია</span>';
            btn.classList.add('is-on');
            btn.setAttribute('aria-disabled', 'true');
        } else {
            btn.innerHTML = '<i class="fa-regular fa-bell" aria-hidden="true"></i>'
                + '<span>შეტყობინებების ჩართვა</span>';
            btn.classList.remove('is-on');
            btn.removeAttribute('aria-disabled');
        }
        btn.hidden = false;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountFooterLink);
    } else {
        mountFooterLink();
    }

    // ── ზოლი დაინსტალირებულ აპლიკაციაში ─────────────────────────────
    // ერთადერთი მომენტი, როცა თავად ვთავაზობთ: ადამიანმა აპლიკაცია
    // უკვე დაამატა, ანუ ინტერესი აქვს. ბრაუზერში არ ვაწუხებთ — იქ
    // ინსტალაციის ზოლი ისედაც არის და მეორე ზოლი ბევრი იქნებოდა.
    function openBar() {
        if (granted() || document.querySelector('.install-bar')) return;

        const bar = document.createElement('div');
        bar.className = 'install-bar push-bar';
        bar.setAttribute('role', 'dialog');
        bar.setAttribute('aria-label', 'შეტყობინებების ჩართვა');
        bar.innerHTML = `
            <span class="install-icon" style="background-image:url('${iconUrl}')" aria-hidden="true"></span>
            <div class="install-body">
                <span class="install-eyebrow">შეტყობინებები</span>
                <strong>გაიგე ახალი ქადაგების შესახებ</strong>
                <span class="install-lead">ორშაბათობით ერთი შეტყობინება — მეტი არაფერი.</span>
                <button type="button" class="install-go">
                    <i class="fa-regular fa-bell" aria-hidden="true"></i>ჩართვა</button>
            </div>
            <button type="button" class="install-close" aria-label="დახურვა">
                <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>`;

        document.body.appendChild(bar);
        const open = () => bar.classList.add('is-open');
        requestAnimationFrame(open);
        setTimeout(open, 50);

        const close = () => {
            bar.classList.remove('is-open');
            setTimeout(() => bar.remove(), 300);
        };
        bar.querySelector('.install-close').addEventListener('click', () => {
            state.dismissedAt = Date.now();
            save();
            close();
        });
        bar.querySelector('.install-go').addEventListener('click', () => {
            close();
            subscribe().then(() => {
                // უარიც პასუხია — ავტომატურად აღარ შევაწუხებთ.
                if (!granted()) {
                    state.dismissedAt = Date.now();
                    save();
                }
            });
        });
    }

    const quiet = state.dismissedAt && Date.now() - state.dismissedAt < QUIET_DAYS * 864e5;
    if (installed && !granted() && !quiet) {
        ready.then(() => setTimeout(openBar, DELAY_MS));
    }
})();


/* ==========================================================================
   MOBILE BOTTOM NAV — ტელეფონზე ჰედერის ნაცვლად ქვედა ხატულების ზოლი
   მარკაპი აქ იქმნება, რომ ყველა გვერდზე ერთი და იგივე იყოს.
   მენიუს ღილაკი იმავე ჰამბურგერს აჭერს, ამიტომ არსებული ლოგიკა
   (აკორდეონი, ლინკზე დაკეტვა, Escape) უცვლელად მუშაობს.
   ========================================================================== */
(function () {
    const build = () => {
        if (document.querySelector('.mobile-tabbar')) return;

        const header = document.querySelector('.main-header');
        if (!header) return;

        const inPages = /\/pages\//.test(window.location.pathname);
        const root = inPages ? '../' : '';
        const sub = inPages ? '' : 'pages/';

        const items = [
            { href: root + 'index.html', icon: 'fa-house', label: 'მთავარი' },
            { href: sub + 'sermons.html', icon: 'fa-play', label: 'ქადაგებები' },
            { href: sub + 'bible.html', icon: 'fa-book-bible', label: 'ბიბლია' },
            { href: sub + 'contact.html', icon: 'fa-envelope', label: 'კონტაქტი' }
        ];

        // მიმდინარე გვერდი: ცარიელი გზა ("/" ან "/pages/") მთავარ გვერდს ნიშნავს
        const here = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();

        const bar = document.createElement('nav');
        bar.className = 'mobile-tabbar';
        bar.setAttribute('aria-label', 'მობილური ნავიგაცია');

        items.forEach(item => {
            const link = document.createElement('a');
            link.className = 'mobile-tabbar__item';
            link.href = item.href;
            if (item.href.split('/').pop().toLowerCase() === here) {
                link.classList.add('is-active');
                link.setAttribute('aria-current', 'page');
            }
            link.innerHTML = '<i class="fa-solid ' + item.icon + '" aria-hidden="true"></i>'
                + '<span>' + item.label + '</span>';
            bar.appendChild(link);
        });

        const moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.className = 'mobile-tabbar__item mobile-tabbar__item--more';
        moreBtn.setAttribute('aria-expanded', 'false');
        moreBtn.setAttribute('aria-controls', 'main-nav');
        moreBtn.innerHTML = '<i class="fa-solid fa-bars" aria-hidden="true"></i><span>მენიუ</span>';
        bar.appendChild(moreBtn);

        document.body.appendChild(bar);

        const scrim = document.createElement('div');
        scrim.className = 'mobile-nav-scrim';
        document.body.appendChild(scrim);

        const hamburger = document.querySelector('.hamburger');
        const navMenu = document.querySelector('.nav-menu');
        if (!hamburger || !navMenu) return;

        // ჰამბურგერი დამალულია, მაგრამ სწორედ ის ინახავს მენიუს ლოგიკას —
        // ღილაკიდან მას ვაჭერთ და მოვლენას აღარ ვუშვებთ document-ამდე,
        // თორემ "გარეთ დაჭერის" მსმენელი მაშინვე დახურავდა ფურცელს.
        moreBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            hamburger.click();
        });

        scrim.addEventListener('click', (e) => {
            e.stopPropagation();
            if (navMenu.classList.contains('open')) hamburger.click();
        });

        // მენიუს მდგომარეობა რამდენიმე ადგილას იცვლება (Escape, ლინკი,
        // გარეთ დაჭერა), ამიტომ კლასს ვადევნებთ თვალს და არა ცალკე ღილაკს.
        const sync = () => {
            const open = navMenu.classList.contains('open');
            scrim.classList.toggle('is-visible', open);
            moreBtn.classList.toggle('is-active', open);
            moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
            const icon = moreBtn.querySelector('i');
            if (icon) {
                icon.classList.toggle('fa-bars', !open);
                icon.classList.toggle('fa-xmark', open);
            }
        };
        new MutationObserver(sync).observe(navMenu, {
            attributes: true,
            attributeFilter: ['class']
        });
        sync();
    };

    // ზოლი გვერდის პირველივე დახატვაში უნდა იდგეს. DOMContentLoaded-ს
    // რომ ველოდოთ, გადასვლის ანიმაცია ახალ გვერდს ზოლის გარეშე
    // გადაიღებდა — ძველი ქრებოდა და ახალი მერე ჩნდებოდა. ეს ფაილი
    // body-ის ბოლოშია ჩართული, ამიტომ მარკაპი უკვე გაპარსულია.
    if (document.body) {
        build();
    } else {
        document.addEventListener('DOMContentLoaded', build);
    }
})();
