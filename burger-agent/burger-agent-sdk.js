/**
 * Stand Up Burger - AI Order Assistant SDK
 * Embeddable floating agent widget for any website.
 *
 * Usage:
 *   <script src="burger-agent-sdk.js"></script>
 *   <script>
 *     BurgerAgent.init({
 *       livekitUrl: 'wss://test141-smeqvx92.livekit.cloud',
 *       tokenEndpoint: 'https://your-backend.com/api/connection-details',
 *       agentName: 'burger-agent',
 *       primaryColor: '#e63946',
 *       position: 'bottom-right'
 *     });
 *   </script>
 */
(function() {
  'use strict';

  const DEFAULTS = {
    livekitUrl: '',
    tokenEndpoint: '',
    agentName: 'burger-agent',
    primaryColor: '#e63946',
    position: 'bottom-right',
    buttonText: '🍔',
    welcomeMessage: 'Hello! Welcome to Stand Up Burger. How can I help you order today?',
  };

  let config = {};
  let room = null;
  let agentConnected = false;
  let panelOpen = false;

  // Inject styles
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #burger-agent-widget { position: fixed; bottom: 20px; right: 20px; z-index: 99999; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      #burger-agent-bubble { width: 64px; height: 64px; border-radius: 50%; background: ${config.primaryColor}; color: white; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,0.3); font-size: 28px; transition: transform 0.2s, background 0.3s; border: none; }
      #burger-agent-bubble:hover { transform: scale(1.1); }
      #burger-agent-bubble.listening { background: #28a745; animation: ba-pulse 1.5s infinite; }
      #burger-agent-bubble.speaking { background: #007bff; }
      #burger-agent-bubble.connecting { background: #ffc107; }
      @keyframes ba-pulse { 0%,100% { box-shadow: 0 4px 16px rgba(0,0,0,0.3); } 50% { box-shadow: 0 4px 24px rgba(40,167,69,0.6); } }
      #burger-agent-panel { display: none; position: fixed; bottom: 96px; right: 20px; width: 380px; max-height: 520px; background: white; border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); overflow: hidden; flex-direction: column; }
      #burger-agent-panel.open { display: flex; }
      #burger-agent-header { background: ${config.primaryColor}; color: white; padding: 14px 16px; font-weight: bold; display: flex; justify-content: space-between; align-items: center; font-size: 16px; }
      #burger-agent-header button { background: none; border: none; color: white; font-size: 22px; cursor: pointer; padding: 0 4px; }
      #burger-agent-status { font-size: 12px; color: #666; padding: 6px 16px; background: #f8f9fa; border-bottom: 1px solid #eee; }
      #burger-agent-messages { flex: 1; overflow-y: auto; padding: 16px; max-height: 320px; min-height: 120px; }
      .ba-msg { margin-bottom: 10px; padding: 10px 14px; border-radius: 12px; max-width: 85%; font-size: 14px; line-height: 1.4; }
      .ba-msg.agent { background: #f0f0f0; margin-right: auto; color: #333; }
      .ba-msg.user { background: ${config.primaryColor}; color: white; margin-left: auto; }
      .ba-msg.system { background: #fff3cd; color: #856404; margin: 0 auto; text-align: center; font-size: 12px; }
      #burger-agent-input { display: flex; padding: 12px; border-top: 1px solid #eee; }
      #burger-agent-input input { flex: 1; padding: 10px 14px; border: 1px solid #ddd; border-radius: 8px; margin-right: 8px; font-size: 14px; }
      #burger-agent-input button { background: ${config.primaryColor}; color: white; border: none; padding: 10px 16px; border-radius: 8px; cursor: pointer; font-size: 14px; }
      .ba-toast { position: fixed; top: 20px; right: 20px; padding: 14px 20px; border-radius: 8px; color: white; z-index: 100000; font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); animation: ba-slideIn 0.3s ease-out; }
      .ba-toast.green { background: #28a745; }
      .ba-toast.blue { background: #007bff; }
      @keyframes ba-slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      #burger-agent-cart { display: none; position: fixed; top: 20px; left: 20px; width: 320px; max-height: 400px; background: white; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.2); overflow: hidden; z-index: 99998; }
      #burger-agent-cart.open { display: block; }
      #burger-agent-cart h3 { background: ${config.primaryColor}; color: white; padding: 12px 16px; font-size: 16px; }
      #burger-agent-cart .cart-body { padding: 16px; max-height: 300px; overflow-y: auto; }
      #burger-agent-cart .cart-item { padding: 6px 0; border-bottom: 1px solid #eee; font-size: 14px; }
      #burger-agent-cart .cart-total { font-weight: bold; margin-top: 10px; font-size: 16px; }
      #burger-agent-cart .cart-checkout { display: block; width: calc(100% - 32px); margin: 12px 16px; padding: 10px; background: ${config.primaryColor}; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; }
    `;
    document.head.appendChild(style);
  }

  function createWidget() {
    const widget = document.createElement('div');
    widget.id = 'burger-agent-widget';
    widget.innerHTML = `
      <button id="burger-agent-bubble" onclick="BurgerAgent.togglePanel()">${config.buttonText}</button>
      <div id="burger-agent-panel">
        <div id="burger-agent-header">
          <span>AI Order Assistant</span>
          <button onclick="BurgerAgent.togglePanel()">✕</button>
        </div>
        <div id="burger-agent-status">Click to start ordering</div>
        <div id="burger-agent-messages"></div>
        <div id="burger-agent-input">
          <input type="text" id="burger-agent-text" placeholder="Type a message..." onkeypress="if(event.key==='Enter')BurgerAgent.sendText()" />
          <button onclick="BurgerAgent.sendText()">Send</button>
        </div>
      </div>
      <div id="burger-agent-cart">
        <h3>Your Cart</h3>
        <div class="cart-body" id="burger-cart-body"><p style="color:#666;font-size:14px;">No items yet</p></div>
        <button class="cart-checkout" onclick="window.open('https://order.qoodz.app/menu/2260?table=7549&pickupType=pickup&branch=2545','_blank')">Go to Checkout</button>
      </div>
    `;
    document.body.appendChild(widget);
  }

  function addMessage(text, isAgent) {
    const msgs = document.getElementById('burger-agent-messages');
    const div = document.createElement('div');
    div.className = 'ba-msg ' + (isAgent ? 'agent' : 'user');
    div.textContent = text;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function showToast(text, color) {
    const toast = document.createElement('div');
    toast.className = 'ba-toast ' + (color || 'green');
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  }

  function updateCart(cart) {
    const body = document.getElementById('burger-cart-body');
    if (!cart || cart.length === 0) {
      body.innerHTML = '<p style="color:#666;font-size:14px;">No items yet</p>';
      return;
    }
    let html = '';
    let total = 0;
    cart.forEach(item => {
      const extras = item.extras && item.extras.length ? ' (' + item.extras.join(', ') + ')' : '';
      html += '<div class="cart-item">' + item.quantity + 'x ' + item.name + extras + ' - ' + item.line_total.toFixed(2) + ' SAR</div>';
      total += item.line_total;
    });
    html += '<div class="cart-total">Total: ' + total.toFixed(2) + ' SAR</div>';
    body.innerHTML = html;
    document.getElementById('burger-agent-cart').classList.add('open');
  }

  async function connectToAgent() {
    const status = document.getElementById('burger-agent-status');
    const bubble = document.getElementById('burger-agent-bubble');
    status.textContent = 'Connecting...';
    bubble.classList.add('connecting');

    try {
      const resp = await fetch(config.tokenEndpoint);
      const data = await resp.json();

      room = new LivekitClient.Room();
      await room.connect(data.serverUrl, data.participantToken);

      await room.localParticipant.setMicrophoneEnabled(true);

      // RPC handlers
      room.localParticipant.registerRpcMethod('client.showNotification', async (rpcData) => {
        const payload = JSON.parse(rpcData.payload);
        if (payload.type === 'item_added') {
          showToast(payload.item + ' added to cart!', 'green');
          if (payload.cart) updateCart(payload.cart);
        } else if (payload.type === 'cart_updated') {
          if (payload.cart) updateCart(payload.cart);
        } else if (payload.type === 'checkout_ready') {
          showToast('Order ready! Opening checkout...', 'blue');
          if (payload.url) window.open(payload.url, '_blank');
          if (payload.cart) updateCart(payload.cart);
        }
        return 'OK';
      });

      // Subscribe to agent audio
      room.on('trackSubscribed', (track, publication, participant) => {
        if (participant.identity.startsWith('agent-') || participant.identity === 'bey-avatar-agent') {
          if (track.kind === 'audio') {
            const audioEl = document.createElement('audio');
            audioEl.autoplay = true;
            track.attach(audioEl);
            document.body.appendChild(audioEl);
          }
        }
      });

      room.on('participantConnected', (participant) => {
        if (participant.identity.startsWith('agent-')) {
          agentConnected = true;
          status.textContent = 'Connected - speak now!';
          bubble.classList.remove('connecting');
          bubble.classList.add('listening');
          addMessage(config.welcomeMessage, true);
        }
      });

      status.textContent = 'Connected - speak now!';
      bubble.classList.remove('connecting');
      bubble.classList.add('listening');

    } catch (err) {
      console.error('Connection error:', err);
      status.textContent = 'Connection failed: ' + err.message;
      bubble.classList.remove('connecting');
    }
  }

  function togglePanel() {
    const panel = document.getElementById('burger-agent-panel');
    panel.classList.toggle('open');
    if (panel.classList.contains('open') && !room) {
      connectToAgent();
    }
  }

  function sendText() {
    const input = document.getElementById('burger-agent-text');
    const text = input.value.trim();
    if (!text || !room) return;
    addMessage(text, false);
    input.value = '';
    const encoder = new TextEncoder();
    room.localParticipant.publishData(encoder.encode(JSON.stringify({ type: 'text', text })), { reliable: true });
  }

  // Public API
  window.BurgerAgent = {
    init: function(opts) {
      config = Object.assign({}, DEFAULTS, opts || {});
      // Load LiveKit SDK
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/livekit-client@2/dist/livekit-client.umd.min.js';
      script.onload = function() {
        window.LivekitClient = window.LivekitClient || window.LiveKit;
        injectStyles();
        createWidget();
      };
      document.head.appendChild(script);
    },
    togglePanel: togglePanel,
    sendText: sendText,
    connect: connectToAgent,
  };
})();
EOF
echo "SDK created"