/**
 * Stand Up Burger - AI Order Assistant SDK
 * Embeddable floating avatar agent for any website.
 *
 * Usage:
 *   <script src="burger-agent-sdk.js"></script>
 *   <script>
 *     BurgerAgent.init({
 *       tokenEndpoint: 'https://your-server.com/api/connection-details',
 *       agentName: 'burger-agent',
 *       primaryColor: '#e63946'
 *     });
 *   </script>
 */
(function() {
  'use strict';

  const DEFAULTS = {
    tokenEndpoint: '',
    agentName: 'burger-agent',
    primaryColor: '#e63946',
    position: 'bottom-right',
    welcomeMessage: 'Hello! Welcome to Stand Up Burger. How can I help you order today?',
  };

  let config = {};
  let room = null;
  let agentConnected = false;

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #ba-widget { position: fixed; bottom: 20px; right: 20px; z-index: 99999; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      #ba-avatar-container { width: 120px; height: 120px; border-radius: 50%; overflow: hidden; cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,0.3); border: 3px solid ${config.primaryColor}; transition: transform 0.2s, border-color 0.3s; background: #1a1a2e; }
      #ba-avatar-container:hover { transform: scale(1.05); }
      #ba-avatar-container.listening { border-color: #28a745; animation: ba-pulse 1.5s infinite; }
      #ba-avatar-container.speaking { border-color: #007bff; }
      #ba-avatar-container.connecting { border-color: #ffc107; }
      #ba-avatar-video { width: 100%; height: 100%; object-fit: cover; display: none; }
      #ba-avatar-fallback { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 40px; color: white; }
      @keyframes ba-pulse { 0%,100% { box-shadow: 0 4px 16px rgba(0,0,0,0.3); } 50% { box-shadow: 0 4px 24px rgba(40,167,69,0.6); } }
      #ba-panel { display: none; position: fixed; bottom: 150px; right: 20px; width: 380px; max-height: 480px; background: white; border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); overflow: hidden; flex-direction: column; }
      #ba-panel.open { display: flex; }
      #ba-header { background: ${config.primaryColor}; color: white; padding: 12px 16px; font-weight: bold; display: flex; justify-content: space-between; align-items: center; font-size: 15px; }
      #ba-header button { background: none; border: none; color: white; font-size: 20px; cursor: pointer; }
      #ba-status { font-size: 12px; color: #666; padding: 6px 16px; background: #f8f9fa; border-bottom: 1px solid #eee; }
      #ba-messages { flex: 1; overflow-y: auto; padding: 12px; max-height: 260px; min-height: 80px; }
      .ba-msg { margin-bottom: 8px; padding: 8px 12px; border-radius: 10px; max-width: 85%; font-size: 14px; line-height: 1.4; }
      .ba-msg.agent { background: #f0f0f0; margin-right: auto; color: #333; }
      .ba-msg.user { background: ${config.primaryColor}; color: white; margin-left: auto; }
      .ba-msg.system { background: #fff3cd; color: #856404; margin: 0 auto; text-align: center; font-size: 12px; }
      #ba-input { display: flex; padding: 10px; border-top: 1px solid #eee; }
      #ba-input input { flex: 1; padding: 8px 12px; border: 1px solid #ddd; border-radius: 8px; margin-right: 8px; font-size: 14px; }
      #ba-input button { background: ${config.primaryColor}; color: white; border: none; padding: 8px 14px; border-radius: 8px; cursor: pointer; font-size: 14px; }
      #ba-cart { display: none; position: fixed; top: 20px; right: 20px; width: 300px; max-height: 380px; background: white; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.2); overflow: hidden; z-index: 99998; }
      #ba-cart.open { display: block; }
      #ba-cart h3 { background: ${config.primaryColor}; color: white; padding: 10px 14px; font-size: 15px; }
      #ba-cart .cart-body { padding: 12px; max-height: 260px; overflow-y: auto; font-size: 13px; }
      #ba-cart .cart-item { padding: 4px 0; border-bottom: 1px solid #eee; }
      #ba-cart .cart-total { font-weight: bold; margin-top: 8px; font-size: 15px; }
      #ba-cart .cart-checkout { display: block; width: calc(100% - 24px); margin: 10px 12px; padding: 8px; background: ${config.primaryColor}; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; }
      .ba-toast { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); padding: 12px 20px; border-radius: 8px; color: white; z-index: 100000; font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); animation: ba-slideIn 0.3s ease-out; }
      .ba-toast.green { background: #28a745; }
      .ba-toast.blue { background: #007bff; }
      @keyframes ba-slideIn { from { transform: translateX(-50%) translateY(-20px); opacity: 0; } to { transform: translateX(-50%) translateY(0); opacity: 1; } }
    `;
    document.head.appendChild(style);
  }

  function createWidget() {
    const widget = document.createElement('div');
    widget.id = 'ba-widget';
    widget.innerHTML = `
      <div id="ba-avatar-container" onclick="BurgerAgent.togglePanel()">
        <video id="ba-avatar-video" autoplay playsinline muted></video>
        <div id="ba-avatar-fallback">🍔</div>
      </div>
      <div id="ba-panel">
        <div id="ba-header">
          <span>AI Order Assistant</span>
          <button onclick="BurgerAgent.togglePanel()">✕</button>
        </div>
        <div id="ba-status">Click avatar to start</div>
        <div id="ba-messages"></div>
        <div id="ba-input">
          <input type="text" id="ba-text" placeholder="Type a message..." onkeypress="if(event.key==='Enter')BurgerAgent.sendText()" />
          <button onclick="BurgerAgent.sendText()">Send</button>
        </div>
      </div>
      <div id="ba-cart">
        <h3>Your Cart</h3>
        <div class="cart-body" id="ba-cart-body"><p style="color:#666;font-size:13px;">No items yet</p></div>
        <button class="cart-checkout" onclick="window.open('https://order.qoodz.app/menu/2260?table=7549&pickupType=pickup&branch=2545','_blank')">Go to Checkout</button>
      </div>
    `;
    document.body.appendChild(widget);
  }

  function addMessage(text, isAgent) {
    const msgs = document.getElementById('ba-messages');
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
    const body = document.getElementById('ba-cart-body');
    if (!cart || cart.length === 0) {
      body.innerHTML = '<p style="color:#666;font-size:13px;">No items yet</p>';
      document.getElementById('ba-cart').classList.remove('open');
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
    document.getElementById('ba-cart').classList.add('open');
  }

  async function connectToAgent() {
    const status = document.getElementById('ba-status');
    const container = document.getElementById('ba-avatar-container');
    const videoEl = document.getElementById('ba-avatar-video');
    const fallback = document.getElementById('ba-avatar-fallback');
    status.textContent = 'Connecting...';
    container.classList.add('connecting');

    try {
      const resp = await fetch(config.tokenEndpoint);
      const data = await resp.json();

      room = new LivekitClient.Room();

      try {
          await room.connect(data.serverUrl, data.participantToken, { autoSubscribe: false });
        } catch (connErr) {
        throw connErr;
      }


      status.textContent = 'Connected - speak now!';
      container.classList.remove('connecting');
      container.classList.add('listening');

    } catch (err) {
      console.error('Connection error:', err);
      status.textContent = 'Connection failed: ' + err.message;
      container.classList.remove('connecting');
    }
  }

  function togglePanel() {
    const panel = document.getElementById('ba-panel');
    panel.classList.toggle('open');
    if (panel.classList.contains('open') && !room) {
      connectToAgent();
    }
  }

  function sendText() {
    const input = document.getElementById('ba-text');
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
