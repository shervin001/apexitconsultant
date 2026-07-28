/* ============================================================
   Apex IT Consultant — main.js
   Navbar, mobile menu, scroll reveals, counters, card tilt,
   role → form prefill, and contact form handling.
   ============================================================ */
(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Sticky navbar ---------- */
  var navbar = document.getElementById('navbar');
  function onScroll() {
    navbar.classList.toggle('scrolled', window.scrollY > 24);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile menu ---------- */
  var navToggle = document.getElementById('nav-toggle');
  var navLinks = document.getElementById('nav-links');

  navToggle.addEventListener('click', function () {
    var open = navLinks.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(open));
  });

  navLinks.addEventListener('click', function (e) {
    if (e.target.closest('a')) {
      navLinks.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && navLinks.classList.contains('open')) {
      navLinks.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.focus();
    }
  });

  /* ---------- Reveal on scroll ---------- */
  var revealEls = document.querySelectorAll('.reveal');

  // Drop the .reveal class once the entrance finishes: its transition
  // (0.7s on transform/opacity) would otherwise permanently override the
  // cards' own 0.3s hover transitions and fight the JS tilt effect.
  function revealDone(el) {
    el.classList.add('visible');
    window.setTimeout(function () {
      el.classList.remove('reveal', 'visible');
    }, 750);
  }

  if ('IntersectionObserver' in window && !prefersReducedMotion) {
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            revealDone(entry.target);
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    revealEls.forEach(function (el) { revealObserver.observe(el); });
  } else {
    revealEls.forEach(function (el) {
      el.classList.remove('reveal', 'visible');
    });
  }

  /* ---------- Animated counters ---------- */
  var counters = document.querySelectorAll('.stat-number');

  function animateCounter(el) {
    var target = parseInt(el.getAttribute('data-count'), 10);
    var suffix = el.getAttribute('data-suffix') || '';
    if (prefersReducedMotion) {
      el.textContent = target + suffix;
      return;
    }
    var duration = 1600;
    var start = null;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      el.textContent = Math.round(eased * target) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  if ('IntersectionObserver' in window) {
    var counterObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            counterObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.6 }
    );
    counters.forEach(function (el) { counterObserver.observe(el); });
  } else {
    counters.forEach(animateCounter);
  }

  /* ---------- 3D tilt on expertise cards ---------- */
  var supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (supportsHover && !prefersReducedMotion) {
    document.querySelectorAll('.tilt-card').forEach(function (card) {
      var rafPending = false;
      var lastEvent = null;

      function applyTilt() {
        rafPending = false;
        var rect = card.getBoundingClientRect();
        var px = (lastEvent.clientX - rect.left) / rect.width - 0.5;
        var py = (lastEvent.clientY - rect.top) / rect.height - 0.5;
        card.style.transform =
          'perspective(700px) rotateX(' + (-py * 8).toFixed(2) + 'deg)' +
          ' rotateY(' + (px * 8).toFixed(2) + 'deg) translateY(-4px)';
      }

      card.addEventListener('pointermove', function (e) {
        lastEvent = e;
        if (!rafPending) {
          rafPending = true;
          requestAnimationFrame(applyTilt);
        }
      });
      card.addEventListener('pointerleave', function () {
        card.style.transform = '';
      });
    });
  }

  /* ---------- Role "Apply" links → prefill form ----------
     The links are plain anchors to #contact, so navigation works
     without JS; this handler adds the role prefill and focus. */
  var roleSelect = document.getElementById('f-role');
  document.querySelectorAll('.apply-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var role = btn.getAttribute('data-role');
      if (roleSelect) {
        roleSelect.value = role;
      }
      var nameField = document.getElementById('f-name');
      if (nameField) {
        window.setTimeout(function () {
          nameField.focus({ preventScroll: true });
        }, prefersReducedMotion ? 0 : 650);
      }
    });
  });

  /* ---------- CV upload: show file name ---------- */
  var cvInput = document.getElementById('f-cv');
  var fileName = document.getElementById('file-name');
  if (cvInput && fileName) {
    var defaultFileText = fileName.textContent;
    cvInput.addEventListener('change', function () {
      fileName.textContent = cvInput.files.length
        ? cvInput.files[0].name
        : defaultFileText;
    });
  }

  /* ---------- Contact form (front-end only) ---------- */
  var form = document.getElementById('contact-form');
  var formError = document.getElementById('form-error');
  var formSuccess = document.getElementById('form-success');

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      formError.hidden = true;
      formSuccess.hidden = true;

      if (!form.checkValidity()) {
        formError.hidden = false;
        var firstInvalid = form.querySelector(':invalid');
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      // No backend is wired up yet: hook this to your form endpoint
      // (e.g. Formspree, Netlify Forms, or a CAP service) when ready.
      form.reset();
      if (fileName) fileName.textContent = defaultFileText;
      formSuccess.hidden = false;
      formSuccess.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'nearest',
      });
    });
  }

  /* ---------- NOVA — ElevenLabs voice agent ----------
     The widget stays hidden (and its third-party script unloaded)
     until the user reaches the landing section at the end of the
     journey; then the bubble rises in bottom-right. */
  var agentWrap = document.getElementById('agent-widget');
  var landingSection = document.getElementById('landing');
  var agentScriptLoaded = false;

  function loadAgentScript() {
    if (agentScriptLoaded) return;
    agentScriptLoaded = true;
    var s = document.createElement('script');
    s.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed';
    s.async = true;
    s.type = 'text/javascript';
    document.body.appendChild(s);
  }

  function showAgent() {
    if (!agentWrap) return;
    loadAgentScript();
    agentWrap.classList.add('visible');
  }

  if (agentWrap && landingSection && 'IntersectionObserver' in window) {
    var agentObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            showAgent();
            agentObserver.disconnect();
          }
        });
      },
      // The landing section is 200vh tall, so a fully covered viewport
      // yields a ratio of ~0.5 — 0.35 fires once the user is well inside.
      { threshold: 0.35 }
    );
    agentObserver.observe(landingSection);
  } else {
    showAgent();
  }

  var novaBtn = document.getElementById('talk-nova');
  if (novaBtn) {
    novaBtn.addEventListener('click', function () {
      showAgent();
      // Best effort: open the conversation directly by clicking the
      // widget's own button inside its shadow root. If the widget
      // hasn't upgraded yet (script still loading) or the shadow root
      // is closed, fall back to pulsing the bubble so the user spots it.
      var opened = false;
      var el = agentWrap && agentWrap.querySelector('elevenlabs-convai');
      if (el && el.shadowRoot) {
        try {
          var widgetBtn = el.shadowRoot.querySelector('button');
          if (widgetBtn) {
            widgetBtn.click();
            opened = true;
          }
        } catch (err) {
          /* closed shadow root — fall through to the pulse */
        }
      }
      if (!opened && agentWrap) {
        agentWrap.classList.add('attention');
        window.setTimeout(function () {
          agentWrap.classList.remove('attention');
        }, 2600);
      }
    });
  }

  /* ---------- Footer year ---------- */
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();
