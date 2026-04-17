/* ==========================================================================
   EUCHARISTEO TRADING — Main JavaScript
   ========================================================================== */

(function() {
  'use strict';

  // ---------- NAVIGATION ----------
  const nav = document.querySelector('.nav');
  const navToggle = document.querySelector('.nav-toggle');
  const navMenu = document.querySelector('.nav-menu');

  const handleScroll = () => {
    if (!nav) return;
    if (window.scrollY > 40) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();

  if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
      navToggle.classList.toggle('active');
      navMenu.classList.toggle('active');
      document.body.style.overflow = navMenu.classList.contains('active') ? 'hidden' : '';
    });

    navMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navToggle.classList.remove('active');
        navMenu.classList.remove('active');
        document.body.style.overflow = '';
      });
    });
  }

  // ---------- REVEAL ON SCROLL ----------
  const revealElements = document.querySelectorAll('.reveal, .stagger');

  if ('IntersectionObserver' in window && revealElements.length) {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -60px 0px' }
    );

    revealElements.forEach(el => observer.observe(el));
  } else {
    revealElements.forEach(el => el.classList.add('in-view'));
  }

  // ---------- ANIMATED COUNTERS ----------
  const counters = document.querySelectorAll('[data-counter]');
  let countersAnimated = false;

  const animateCounters = () => {
    if (countersAnimated) return;
    counters.forEach(counter => {
      const target = parseInt(counter.getAttribute('data-counter'), 10);
      const suffix = counter.getAttribute('data-suffix') || '';
      const duration = 2000;
      const start = performance.now();

      const tick = now => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.floor(eased * target);
        counter.textContent = current + suffix;
        if (progress < 1) requestAnimationFrame(tick);
        else counter.textContent = target + suffix;
      };
      requestAnimationFrame(tick);
    });
    countersAnimated = true;
  };

  if (counters.length && 'IntersectionObserver' in window) {
    const counterObserver = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            animateCounters();
            counterObserver.disconnect();
          }
        });
      },
      { threshold: 0.3 }
    );
    counterObserver.observe(counters[0]);
  }

  // ---------- SMOOTH ANCHOR LINKS ----------
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      const href = link.getAttribute('href');
      if (href === '#' || href.length < 2) return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        const offset = nav ? nav.offsetHeight : 0;
        const targetPos = target.getBoundingClientRect().top + window.scrollY - offset - 20;
        window.scrollTo({ top: targetPos, behavior: 'smooth' });
      }
    });
  });

  // ---------- CONTACT FORM ----------
  const form = document.querySelector('#contact-form');
  const formStatus = document.querySelector('#form-status');

  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const data = new FormData(form);
      const name = data.get('name');

      const subject = encodeURIComponent(
        '[Eucharisteo Website] New enquiry — ' + (data.get('service') || 'General')
      );
      const body = encodeURIComponent(
        `Name: ${name}\n` +
        `Company: ${data.get('company') || 'N/A'}\n` +
        `Email: ${data.get('email')}\n` +
        `Phone: ${data.get('phone') || 'N/A'}\n` +
        `Service Interest: ${data.get('service') || 'General enquiry'}\n\n` +
        `Message:\n${data.get('message')}`
      );

      window.location.href = `mailto:leon.dauth@eucharisteotrading.co.za?subject=${subject}&body=${body}`;

      if (formStatus) {
        formStatus.className = 'form-status success';
        formStatus.textContent = `Thank you, ${name}. Your email client should now be open. We'll respond within one business day.`;
      }

      form.reset();
    });
  }

  // ---------- DYNAMIC YEAR ----------
  const yearEl = document.querySelector('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ---------- PARALLAX HERO GLOW ----------
  const heroGlow = document.querySelector('.hero-glow');
  if (heroGlow && window.matchMedia('(min-width: 900px)').matches) {
    document.addEventListener('mousemove', e => {
      const x = (e.clientX / window.innerWidth - 0.5) * 40;
      const y = (e.clientY / window.innerHeight - 0.5) * 40;
      heroGlow.style.transform = `translate(${x}px, ${y}px)`;
    });
  }

})();
