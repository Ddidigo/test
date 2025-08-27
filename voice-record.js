// == Zaptos Voice Record – FINAL (all-hosts, float+shadow) ==
(() => {
  const VERSION = '1.3-shadow-float-allhosts';
  try { window.__VOICE_RECORD_VERSION = VERSION; } catch {}
  const LOG_TAG = '[voice-record]';
  const BTN_ID = 'zaptos-voice-btn';
  const WRAP_ID = 'zaptos-voice-wrap';
  let shadowHost = null, shadowRoot = null;

  const log = (...a) => console.log(LOG_TAG, ...a);
  const once = (fn) => { let done=false; return (...a)=>{ if(!done){done=true; fn(...a);} }; };

  // 1) Cria host + Shadow DOM (isola CSS do site)
  function ensureShadow() {
    if (shadowHost && document.body.contains(shadowHost)) return shadowRoot;
    shadowHost = document.getElementById(WRAP_ID);
    if (!shadowHost) {
      shadowHost = document.createElement('div');
      shadowHost.id = WRAP_ID;
      // posição do host
      shadowHost.style.position = 'fixed';
      shadowHost.style.right = '16px';
      shadowHost.style.bottom = '16px';
      shadowHost.style.zIndex = '2147483647';
      shadowHost.style.all = 'initial'; // minimiza influência de CSS global
      document.documentElement.appendChild(shadowHost);
    }
    shadowRoot = shadowHost.shadowRoot || shadowHost.attachShadow({ mode: 'open' });
    return shadowRoot;
  }

  // 2) Renderiza botão no Shadow
  function renderButton() {
    const root = ensureShadow();
    if (!root) return;

    if (root.getElementById(BTN_ID)) return; // já existe

    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .btn {
        all: initial;
        display: inline-flex; align-items: center; gap: 8px;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        font-size: 14px; padding: 10px 14px; border-radius: 999px;
        box-shadow: 0 6px 20px rgba(0,0,0,.15);
        cursor: pointer; user-select: none; border: 1px solid rgba(0,0,0,.08);
        background: #ffffff; color: #111; transition: transform .05s ease;
      }
      .btn:hover { transform: translateY(-1px); }
      .dot { width: 8px; height: 8px; border-radius: 50%; background:#888; }
      .rec { background: #e11900 !important; box-shadow: 0 0 0 3px rgba(225,25,0,.2); }
      .tag  { font-size: 11px; opacity: .7; }
      .badge{ margin-left:8px; font-size:11px; opacity:.6; }
    `;

    const wrap = document.createElement('div');
    wrap.setAttribute('part', 'wrap');

    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.className = 'btn';
    btn.innerHTML = `<span class="dot" id="dot"></span><span>Gravar</span><span class="badge">${VERSION}</span>`;
    btn.onclick = toggleRecording;

    wrap.appendChild(style);
    wrap.appendChild(btn);
    root.appendChild(wrap);
  }

  // 3) Gravação (mínimo viável) — só para feedback visual por enquanto
  let media = { stream: null, recorder: null, chunks: [], recording: false };
  async function startRecording() {
    try {
      media.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      media.recorder = new MediaRecorder(media.stream);
      media.chunks = [];
      media.recorder.ondataavailable = e => { if (e.data && e.data.size) media.chunks.push(e.data); };
      media.recorder.onstop = () => {
        const blob = new Blob(media.chunks, { type: 'audio/webm' });
        log('gravacao pronta (blob):', blob);
        // TODO: aqui conectamos na sua UI: anexar/enviar (quando você me passar os seletores reais)
      };
      media.recorder.start();
      media.recording = true;
      setButtonState(true);
      log('gravando…');
    } catch (e) {
      log('falha ao iniciar microfone:', e);
      alert('Não foi possível acessar o microfone. Verifique permissões do navegador.');
    }
  }
  function stopRecording() {
    try {
      media.recorder && media.recorder.state !== 'inactive' && media.recorder.stop();
      media.stream && media.stream.getTracks().forEach(t => t.stop());
    } catch {}
    media.recording = false;
    setButtonState(false);
    log('parou a gravação.');
  }
  function toggleRecording() {
    media.recording ? stopRecording() : startRecording();
  }
  function setButtonState(isRec) {
    const root = shadowRoot || ensureShadow();
    const dot = root && root.getElementById('dot');
    const btn = root && root.getElementById(BTN_ID);
    if (!dot || !btn) return;
    dot.className = 'dot' + (isRec ? ' rec' : '');
    btn.querySelector('span:nth-child(2)').textContent = isRec ? 'Gravando…' : 'Gravar';
  }

  // 4) Observadores para garantir que o botão exista SEMPRE
  const reRender = once(() => renderButton());
  function mountForever() {
    renderButton();

    // se o app remover o host, recoloca
    const obs = new MutationObserver(() => {
      if (!shadowHost || !document.documentElement.contains(shadowHost)) {
        ensureShadow(); renderButton();
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });

    // watchdog simples (ex.: frameworks trocam <body>)
    setInterval(() => {
      if (!shadowHost || !shadowRoot || !shadowRoot.getElementById(BTN_ID)) {
        ensureShadow(); renderButton();
      }
    }, 1500);
  }

  // 5) Espera o DOM ficar pronto (ou vai direto se já estiver)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { mountForever(); });
  } else {
    mountForever();
  }

  log(`carregado ✅ versão ${VERSION}`);
})();
