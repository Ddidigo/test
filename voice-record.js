/* voice-record.js — Modo simples (sem licença), host liberado para todos */
(() => {
  // ===== Config mínima =====
  const CFG = {
    debug: false,
    // host liberado: não usamos mais allowedHosts
    isConversationsPath: (p) => /conversations|messages/i.test(p || location.pathname),

    // Seletores resilientes (ajuste se seu WL usar outros)
    sel: {
      composer: [
        'div[contenteditable="true"][data-placeholder]',
        '[contenteditable="true"]',
        'textarea',
      ],
      toolbar: [
        '[data-testid="conversation-composer"]',
        '[data-testid="conversations-composer"]',
        '[class*="composer"]',
      ],
      attachButton: [
        'button[aria-label*="attach" i]',
        'button[aria-label*="anexar" i]',
        'button[aria-label*="upload" i]',
        '[data-icon*="paperclip"]',
        'svg[aria-label*="attach" i]',
      ],
      fileInput: [
        'input[type="file"][accept*="audio"]',
        'input[type="file"]'
      ],
      sendButton: [
        'button[aria-label*="send" i]',
        'button[aria-label*="enviar" i]',
        'button[type="submit"]',
        '[data-testid*="send" i]',
      ],
      messageList: [
        '[data-testid*="messages-list"]',
        '[class*="messages"]',
        '[class*="conversation"]'
      ]
    },

    // Gravação/anexo
    filePrefix: 'audio_',
    mime: 'audio/webm',
    mediaExtensions: ['.mp3','.wav','.ogg','.m4a','.webm','.mp4'],
  };

  // ===== Estado =====
  const ST = {
    recording: false,
    mediaStream: null,
    recorder: null,
    chunks: [],
    hookingEnter: false,
  };

  // ===== Utils =====
  const log = (...a) => CFG.debug && console.log('[voice-record]', ...a);
  const delay = (ms) => new Promise(r => setTimeout(r, ms));
  const on = (t,e,f,o)=>t.addEventListener(e,f,o);
  const isAllowedHost = () => true; // <<< host liberado
  const qsAny = (arr, root=document) => { for (const s of arr) { const el = root.querySelector(s); if (el) return el; } return null; };
  const makeFilename = (ext='webm') => `${CFG.filePrefix}${Date.now()}.${ext}`;

  // Diagnóstico de carregamento
  try { console.log('[voice-record] carregado ✅', location.href); } catch(e){}

  function createStyle() {
    if (document.getElementById('zaptos-voice-style')) return;
    const css = `
      .zaptos-voice-btn {
        display:inline-flex;align-items:center;gap:6px;
        padding:6px 10px;border:1px solid rgba(0,0,0,.15);
        border-radius:8px;cursor:pointer;background:#fff;font-size:12px;
      }
      .zaptos-voice-btn.is-recording { background:#ffe8e8;border-color:#f33; }
      .zaptos-voice-dot{width:8px;height:8px;border-radius:50%;background:#f33;animation:zblink 1s infinite;}
      @keyframes zblink{0%{opacity:.2}50%{opacity:1}100%{opacity:.2}}
      .zaptos-voice-inline-player{display:block;margin:6px 0;}
    `;
    const s = document.createElement('style');
    s.id = 'zaptos-voice-style';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ===== Recorder =====
  async function startRecording(btn) {
    if (ST.recording) return;
    try {
      ST.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      alert('Não foi possível acessar o microfone.');
      return;
    }
    ST.chunks = [];
    ST.recorder = new MediaRecorder(ST.mediaStream, { mimeType: CFG.mime });
    ST.recorder.ondataavailable = e => e.data && ST.chunks.push(e.data);
    ST.recorder.onstop = async () => {
      const blob = new Blob(ST.chunks, { type: CFG.mime });
      await handleRecordedBlob(blob);
      stopCleanup();
      btn.classList.remove('is-recording');
      btn.textContent = '🎤 Gravar';
    };
    ST.recorder.start();
    ST.recording = true;
    btn.classList.add('is-recording');
    btn.innerHTML = '<span class="zaptos-voice-dot"></span> Gravando…';
  }
  function stopRecording() { if (ST.recording && ST.recorder) { try { ST.recorder.stop(); } catch {} } }
  function stopCleanup() {
    ST.recording = false;
    try { ST.mediaStream?.getTracks().forEach(t => t.stop()); } catch {}
    ST.mediaStream = null; ST.recorder = null; ST.chunks = [];
  }

  // ===== Composer / envio =====
  const findComposer = () => qsAny(CFG.sel.composer);
  const findToolbar = () => qsAny(CFG.sel.toolbar);
  const findSendButton = () => qsAny(CFG.sel.sendButton);
  const findAttachButton = () => qsAny(CFG.sel.attachButton);
  const findFileInput = () => qsAny(CFG.sel.fileInput);

  async function openAttachIfNeeded() {
    let input = findFileInput();
    if (input) return input;
    const clip = findAttachButton();
    if (clip) {
      clip.dispatchEvent(new MouseEvent('click', { bubbles:true }));
      await delay(200);
      input = findFileInput();
    }
    return input;
  }

  function pasteText(editable, text) {
    if (!editable) return;
    if (editable.tagName === 'TEXTAREA' || editable.tagName === 'INPUT') {
      editable.value += text;
      editable.dispatchEvent(new Event('input', { bubbles:true }));
    } else {
      editable.focus();
      document.execCommand('insertText', false, text);
    }
  }

  function injectInlinePlayerAfter(el, url, type='audio/webm') {
    const isVideo = /video|\.mp4|\.webm/i.test(type);
    const player = document.createElement(isVideo ? 'video' : 'audio');
    player.controls = true;
    player.src = url;
    player.className = 'zaptos-voice-inline-player';
    el.insertAdjacentElement('afterend', player);
  }

  async function attachFileToComposer(blob, filename) {
    const input = await openAttachIfNeeded();
    if (input) {
      const file = new File([blob], filename, { type: blob.type || CFG.mime });
      const dt = new DataTransfer(); dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles:true }));
      await delay(150);
      return true;
    }
    return false;
  }

  async function handleRecordedBlob(blob) {
    // 1) tentar anexo nativo
    const ok = await attachFileToComposer(blob, makeFilename('webm'));
    if (ok) {
      const send = findSendButton();
      if (send) send.click();
      return;
    }
    // 2) fallback: colar URL blob no editor + player inline
    const url = URL.createObjectURL(blob);
    const comp = findComposer();
    if (comp) {
      pasteText(comp, `\nÁudio: ${url}\n`);
      injectInlinePlayerAfter(comp, url, blob.type);
    } else {
      alert('Não encontrei o campo de mensagem para anexar o áudio.');
    }
  }

  // ===== UI =====
  function ensureRecordButton() {
    const toolbar = findToolbar();
    if (!toolbar || document.getElementById('zaptos-voice-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'zaptos-voice-btn';
    btn.type = 'button';
    btn.className = 'zaptos-voice-btn';
    btn.textContent = '🎤 Gravar';
    btn.addEventListener('click', () => {
      if (!ST.recording) startRecording(btn); else stopRecording();
    });
    toolbar.appendChild(btn);
  }

  function enhanceMediaLinks(root=document) {
    const anchors = root.querySelectorAll('a[href]');
    anchors.forEach(a => {
      const href = String(a.getAttribute('href')||'');
      const lower = href.toLowerCase();
      if (!href) return;
      if (!CFG.mediaExtensions.some(ext => lower.includes(ext))) return;
      if (a.nextElementSibling && a.nextElementSibling.classList?.contains('zaptos-voice-inline-player')) return;

      const isVideo = lower.endsWith('.mp4') || lower.endsWith('.webm');
      const el = document.createElement(isVideo ? 'video' : 'audio');
      el.controls = true; el.src = a.href; el.className = 'zaptos-voice-inline-player';
      a.insertAdjacentElement('afterend', el);
    });
  }

  // ===== Enter vs Shift+Enter =====
  function hookEnterBehavior() {
    if (ST.hookingEnter) return;
    const comp = findComposer();
    if (!comp) return;
    ST.hookingEnter = true;

    comp.addEventListener('keydown', (e) => {
      // Enter envia; Shift+Enter nova linha
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const send = findSendButton();
        if (send) send.click();
      }
    });
  }

  // ===== Montagem =====
  function onTargetPage() { return isAllowedHost() && CFG.isConversationsPath(location.pathname); }

  async function mount() {
    if (!onTargetPage()) { log('fora da página de conversas'); return; }
    createStyle();
    ensureRecordButton();
    hookEnterBehavior();
    enhanceMediaLinks(document);
  }

  // Re-montagem em SPA e mudanças de DOM
  let mountTimer;
  const scheduleMount = () => { clearTimeout(mountTimer); mountTimer = setTimeout(mount, 200); };

  // Hook SPA leve
  const origPush = history.pushState;
  history.pushState = function () {
    const ret = origPush.apply(this, arguments);
    window.dispatchEvent(new Event('zaptos:navigate'));
    return ret;
  };
  on(window, 'zaptos:navigate', scheduleMount);
  on(window, 'popstate', scheduleMount);

  // Observer para renders do app
  const mo = new MutationObserver(() => scheduleMount());
  mo.observe(document.documentElement, { childList:true, subtree:true });

  // Eventos comuns
  on(document, 'click', () => setTimeout(() => { scheduleMount(); enhanceMediaLinks(document); }, 250));
  on(document, 'keydown', (e) => { if (e.key === 'Enter') setTimeout(scheduleMount, 250); });

  // Primeira execução
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleMount);
  } else {
    scheduleMount();
  }
})();
