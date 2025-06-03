/**
 * AI面板工具模块
 * 为页面注入AI对话功能，允许用户与AI进行实时对话
 */

/**
 * AI面板核心JavaScript代码
 */
function createAIPanelScript() {
  /**
   * 公共样式配置
   */
  const AI_STYLES = {
    // 通用按钮样式
    button: {
      base: `
        border: none;
        cursor: pointer;
        border-radius: 6px;
        font-size: 12px;
        padding: 8px 16px;
        transition: all 0.2s;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `,
      primary: 'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;',
      secondary: 'background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white;',
      success: 'background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white;',
      danger: 'background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); color: white;'
    },
    
    // 输入框样式
    input: `
      width: 100%;
      background: rgba(255, 255, 255, 0.1) !important;
      color: white !important;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      padding: 12px;
      font-size: 14px;
      box-sizing: border-box;
      transition: all 0.2s;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `,
    
    // 文本域样式
    textarea: `
      width: 100%;
      background: rgba(255, 255, 255, 0.1) !important;
      color: white !important;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      padding: 12px;
      font-size: 14px;
      box-sizing: border-box;
      resize: vertical;
      min-height: 100px;
      transition: all 0.2s;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `,
    
    // 消息样式
    message: {
      user: `
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 12px 16px;
        border-radius: 18px 18px 4px 18px;
        margin: 8px 0;
        margin-left: 20%;
        word-wrap: break-word;
        box-shadow: 0 2px 10px rgba(102, 126, 234, 0.3);
      `,
      assistant: `
        background: rgba(255, 255, 255, 0.1);
        color: white;
        padding: 12px 16px;
        border-radius: 18px 18px 18px 4px;
        margin: 8px 0;
        margin-right: 20%;
        word-wrap: break-word;
        border: 1px solid rgba(255, 255, 255, 0.2);
        backdrop-filter: blur(10px);
      `,
      system: `
        background: rgba(255, 193, 7, 0.2);
        color: #ffc107;
        padding: 8px 12px;
        border-radius: 12px;
        margin: 8px 0;
        text-align: center;
        font-size: 12px;
        border: 1px solid rgba(255, 193, 7, 0.3);
      `
    }
  };

  /**
   * UI工具类
   */
  class AIUIHelper {
    /**
     * 创建带样式的元素
     */
    static createElement(tag, id = '', className = '', styles = '', innerHTML = '') {
      const element = document.createElement(tag);
      if (id) element.id = id;
      if (className) element.className = className;
      if (styles) element.style.cssText = styles;
      if (innerHTML) element.innerHTML = innerHTML;
      return element;
    }

    /**
     * 创建按钮
     */
    static createButton(id, text, type = 'primary', onClick = null) {
      const button = this.createElement(
        'button',
        id,
        'ai-panel-element',
        AI_STYLES.button.base + AI_STYLES.button[type],
        text
      );
      if (onClick) button.addEventListener('click', onClick);
      return button;
    }

    /**
     * 显示提示消息
     */
    static showToast(message, type = 'info') {
      const existing = document.getElementById('ai-panel-toast');
      if (existing) existing.remove();

      const colors = {
        success: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        error: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
        info: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      };

      const toast = this.createElement('div', 'ai-panel-toast', 'ai-panel-toast', `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${colors[type]};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        z-index: 10001;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        opacity: 0;
        transition: all 0.3s ease;
        backdrop-filter: blur(10px);
      `, message);

      document.body.appendChild(toast);
      
      setTimeout(() => toast.style.opacity = '1', 100);
      setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }

    /**
     * 格式化消息内容（支持Markdown基本语法）
     */
    static formatMessage(content) {
      return content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code style="background: rgba(255,255,255,0.1); padding: 2px 4px; border-radius: 3px;">$1</code>')
        .replace(/\n/g, '<br>');
    }
  }

  /**
   * 拖拽功能类
   */
  class AIDragHandler {
    constructor(element, handle = null) {
      this.element = element;
      this.handle = handle || element;
      this.isDragging = false;
      this.offset = { x: 0, y: 0 };
      
      this.boundMouseDown = this.handleMouseDown.bind(this);
      this.boundMouseMove = this.handleMouseMove.bind(this);
      this.boundMouseUp = this.handleMouseUp.bind(this);
      
      this.setupDrag();
    }

    setupDrag() {
      this.handle.addEventListener('mousedown', this.boundMouseDown);
    }

    handleMouseDown(e) {
      this.isDragging = true;
      const rect = this.element.getBoundingClientRect();
      this.offset.x = e.clientX - rect.left;
      this.offset.y = e.clientY - rect.top;

      this.handle.style.cursor = 'grabbing';
      document.addEventListener('mousemove', this.boundMouseMove);
      document.addEventListener('mouseup', this.boundMouseUp);
      e.preventDefault();
    }

    handleMouseMove(e) {
      if (!this.isDragging) return;

      const x = e.clientX - this.offset.x;
      const y = e.clientY - this.offset.y;
      const maxX = window.innerWidth - this.element.offsetWidth;
      const maxY = window.innerHeight - this.element.offsetHeight;

      this.element.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
      this.element.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
      this.element.style.right = 'auto';
      this.element.style.bottom = 'auto';
      this.element.style.transform = 'none';
    }

    handleMouseUp() {
      this.isDragging = false;
      this.handle.style.cursor = 'move';
      document.removeEventListener('mousemove', this.boundMouseMove);
      document.removeEventListener('mouseup', this.boundMouseUp);
    }
    
    destroy() {
      this.handle.removeEventListener('mousedown', this.boundMouseDown);
      document.removeEventListener('mousemove', this.boundMouseMove);
      document.removeEventListener('mouseup', this.boundMouseUp);
    }
  }

  // 状态变量
  let aiPanelOpen = false;
  let aiPanel = null;
  let conversationHistory = [];
  let isWaitingResponse = false;

  // 创建AI面板切换按钮
  function createAIToggleButton() {
    // 读取配置
    const config = window.AI_PANEL_CONFIG || { position: 'left', autoOpen: false };
    const position = config.position === 'right' ? 'right' : 'left';
    
    const positionStyle = position === 'right' ? 'right: 20px;' : 'left: 20px;';
    
    const toggle = AIUIHelper.createElement('div', 'ai-panel-toggle', 'ai-panel-element', `
      position: fixed;
      bottom: 20px;
      ${positionStyle}
      width: 60px;
      height: 60px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 9999;
      box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
      transition: all 0.3s ease;
      backdrop-filter: blur(10px);
    `, '🤖');

    toggle.style.fontSize = '24px';
    toggle.title = '打开AI助手';
    
    toggle.addEventListener('click', toggleAIPanel);
    toggle.addEventListener('mouseenter', () => {
      toggle.style.transform = 'scale(1.1)';
      toggle.style.boxShadow = '0 6px 25px rgba(102, 126, 234, 0.6)';
    });
    toggle.addEventListener('mouseleave', () => {
      toggle.style.transform = 'scale(1)';
      toggle.style.boxShadow = '0 4px 20px rgba(102, 126, 234, 0.4)';
    });
    
    document.body.appendChild(toggle);
    
    // 如果配置为自动打开，则自动打开面板
    if (config.autoOpen) {
      setTimeout(() => {
        toggleAIPanel();
      }, 1000); // 延迟1秒自动打开
    }
  }

  // 切换AI面板
  function toggleAIPanel() {
    aiPanelOpen = !aiPanelOpen;
    const toggle = document.getElementById('ai-panel-toggle');

    if (aiPanelOpen) {
      createAIPanel();
      toggle.innerHTML = '✕';
      toggle.title = '关闭AI助手';
      toggle.style.background = 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)';
    } else {
      closeAIPanel();
      toggle.innerHTML = '🤖';
      toggle.title = '打开AI助手';
      toggle.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    }
  }

  // 创建AI面板
  function createAIPanel() {
    if (aiPanel) return;

    aiPanel = AIUIHelper.createElement('div', 'ai-panel', 'ai-panel-element', `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 450px;
      max-width: 90vw;
      height: 600px;
      max-height: 90vh;
      background: linear-gradient(135deg, rgba(0, 0, 0, 0.9) 0%, rgba(30, 30, 60, 0.9) 100%);
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      z-index: 10000;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `);

    // 创建头部
    const header = AIUIHelper.createElement('div', 'ai-panel-header', 'ai-panel-element', `
      padding: 16px 20px;
      background: rgba(255, 255, 255, 0.05);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: move;
    `);

    const titleSection = AIUIHelper.createElement('div', '', '', `
      display: flex;
      align-items: center;
      gap: 12px;
    `, `
      <span style="font-size: 20px;">🤖</span>
      <div>
        <div style="font-weight: 600; color: white; font-size: 16px;">AI助手</div>
        <div style="color: rgba(255, 255, 255, 0.7); font-size: 12px;">智能对话助手</div>
      </div>
    `);

    const headerButtons = AIUIHelper.createElement('div', '', '', `
      display: flex;
      gap: 8px;
    `);

    const clearBtn = AIUIHelper.createButton('ai-clear-chat', '清空', 'secondary', clearConversation);
    const closeBtn = AIUIHelper.createButton('ai-close-panel', '✕', 'danger', toggleAIPanel);
    
    clearBtn.style.fontSize = '11px';
    clearBtn.style.padding = '6px 12px';
    closeBtn.style.fontSize = '14px';
    closeBtn.style.padding = '6px 12px';
    closeBtn.style.borderRadius = '50%';
    closeBtn.style.width = '32px';
    closeBtn.style.height = '32px';
    closeBtn.style.display = 'flex';
    closeBtn.style.alignItems = 'center';
    closeBtn.style.justifyContent = 'center';

    headerButtons.appendChild(clearBtn);
    headerButtons.appendChild(closeBtn);
    header.appendChild(titleSection);
    header.appendChild(headerButtons);

    // 创建消息区域
    const messagesContainer = AIUIHelper.createElement('div', 'ai-messages', 'ai-panel-element', `
      flex: 1;
      padding: 20px;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
    `);

    // 自定义滚动条样式
    const scrollbarStyle = AIUIHelper.createElement('style', '', '', '', `
      #ai-messages::-webkit-scrollbar {
        width: 6px;
      }
      #ai-messages::-webkit-scrollbar-track {
        background: transparent;
      }
      #ai-messages::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.3);
        border-radius: 3px;
      }
      #ai-messages::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.5);
      }
    `);
    document.head.appendChild(scrollbarStyle);

    // 添加欢迎消息
    if (conversationHistory.length === 0) {
      addMessage('assistant', '👋 你好！我是AI助手，有什么可以帮助你的吗？');
    } else {
      // 恢复对话历史
      conversationHistory.forEach(msg => {
        appendMessageToUI(msg.role, msg.content);
      });
    }

    // 创建输入区域
    const inputContainer = AIUIHelper.createElement('div', 'ai-input-container', 'ai-panel-element', `
      padding: 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(255, 255, 255, 0.02);
    `);

    const inputGroup = AIUIHelper.createElement('div', '', '', `
      display: flex;
      gap: 12px;
    `);

    const messageInput = AIUIHelper.createElement('textarea', 'ai-message-input', 'ai-panel-element', `
      ${AI_STYLES.textarea}
      min-height: 50px;
      max-height: 150px;
      resize: none;
    `);
    messageInput.placeholder = '输入你的问题...';

    const sendBtn = AIUIHelper.createButton('ai-send-btn', '发送', 'primary', sendMessage);
    sendBtn.style.height = '50px';
    sendBtn.style.minWidth = '80px';
    sendBtn.style.alignSelf = 'flex-end';

    // 输入框事件
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    messageInput.addEventListener('input', () => {
      // 自动调整高度
      messageInput.style.height = 'auto';
      messageInput.style.height = Math.min(messageInput.scrollHeight, 150) + 'px';
    });

    inputGroup.appendChild(messageInput);
    inputGroup.appendChild(sendBtn);
    inputContainer.appendChild(inputGroup);

    // 组装面板
    aiPanel.appendChild(header);
    aiPanel.appendChild(messagesContainer);
    aiPanel.appendChild(inputContainer);

    // 设置拖拽
    new AIDragHandler(aiPanel, header);

    document.body.appendChild(aiPanel);

    // 聚焦输入框
    setTimeout(() => messageInput.focus(), 100);
  }

  // 关闭AI面板
  function closeAIPanel() {
    if (aiPanel) {
      aiPanel.remove();
      aiPanel = null;
    }
  }

  // 添加消息到对话历史和UI
  function addMessage(role, content) {
    conversationHistory.push({ role, content, timestamp: new Date().toISOString() });
    appendMessageToUI(role, content);
  }

  // 在UI中添加消息
  function appendMessageToUI(role, content) {
    const messagesContainer = document.getElementById('ai-messages');
    if (!messagesContainer) return;

    const messageDiv = AIUIHelper.createElement('div', '', 'ai-panel-element', `
      ${AI_STYLES.message[role]}
      animation: fadeInUp 0.3s ease;
    `);

    // 添加头像和时间
    const timestamp = new Date().toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    const messageContent = `
      <div style="display: flex; align-items: flex-start; gap: 8px;">
        <div style="flex: 1;">
          ${AIUIHelper.formatMessage(content)}
          <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">
            ${role === 'user' ? '你' : 'AI'} · ${timestamp}
          </div>
        </div>
      </div>
    `;

    messageDiv.innerHTML = messageContent;
    messagesContainer.appendChild(messageDiv);
    
    // 滚动到底部
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // 发送消息
  async function sendMessage() {
    const input = document.getElementById('ai-message-input');
    const sendBtn = document.getElementById('ai-send-btn');
    
    if (!input || !sendBtn || isWaitingResponse) return;

    const message = input.value.trim();
    if (!message) return;

    // 添加用户消息
    addMessage('user', message);
    input.value = '';
    input.style.height = '50px';

    // 设置加载状态
    isWaitingResponse = true;
    sendBtn.disabled = true;
    sendBtn.textContent = '发送中...';
    sendBtn.style.opacity = '0.6';

    // 添加加载提示
    const loadingDiv = AIUIHelper.createElement('div', 'ai-loading', 'ai-panel-element', `
      ${AI_STYLES.message.system}
      animation: pulse 1.5s infinite;
    `, '🤖 AI正在思考...');
    
    const messagesContainer = document.getElementById('ai-messages');
    messagesContainer.appendChild(loadingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    try {
      // 发送到服务器
      const response = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message,
          history: conversationHistory.slice(-10), // 只发送最近10条消息作为上下文
          timestamp: new Date().toISOString(),
          url: window.location.href
        }),
      });

      const data = await response.json();

      // 移除加载提示
      loadingDiv.remove();

      if (data.success) {
        // 添加AI回复
        addMessage('assistant', data.response);
      } else {
        addMessage('system', `❌ 错误: ${data.message || '服务器响应异常'}`);
        AIUIHelper.showToast('AI响应失败，请重试', 'error');
      }
    } catch (error) {
      console.error('AI请求失败:', error);
      loadingDiv.remove();
      addMessage('system', '❌ 网络错误，请检查连接后重试');
      AIUIHelper.showToast('网络连接失败', 'error');
    } finally {
      // 恢复发送按钮状态
      isWaitingResponse = false;
      sendBtn.disabled = false;
      sendBtn.textContent = '发送';
      sendBtn.style.opacity = '1';
      
      // 重新聚焦输入框
      input.focus();
    }
  }

  // 清空对话
  function clearConversation() {
    if (confirm('确定要清空所有对话记录吗？')) {
      conversationHistory = [];
      const messagesContainer = document.getElementById('ai-messages');
      if (messagesContainer) {
        messagesContainer.innerHTML = '';
        addMessage('assistant', '👋 对话已清空，有什么可以帮助你的吗？');
      }
      AIUIHelper.showToast('对话记录已清空', 'info');
    }
  }

  // 初始化AI面板
  function initAIPanel() {
    console.log('🤖 AI面板初始化中...');
    
    // 添加CSS动画
    const animations = AIUIHelper.createElement('style', '', '', '', `
      @keyframes fadeInUp {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      @keyframes pulse {
        0%, 100% {
          opacity: 1;
        }
        50% {
          opacity: 0.6;
        }
      }
      
      .ai-panel-element {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
    `);
    document.head.appendChild(animations);

    createAIToggleButton();

    // ESC键关闭面板
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && aiPanelOpen) {
        toggleAIPanel();
      }
    });

    console.log('🤖 AI助手已就绪，点击左下角按钮开始对话');
  }

  // DOM加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAIPanel);
  } else {
    initAIPanel();
  }
}

/**
 * 生成客户端AI面板脚本
 * @returns {string} 返回AI面板脚本的HTML字符串
 */
export function generateAIPanelScript() {
  return `
<script>
(${createAIPanelScript.toString()})();
</script>
  `;
}

/**
 * 为HTML内容注入AI面板脚本
 * @param {string} html - 原始HTML内容
 * @param {boolean} enableAI - 是否启用AI功能，默认true
 * @param {Object} options - 配置选项
 * @returns {string} 注入AI面板脚本后的HTML内容
 */
export function injectAIPanelScript(html, enableAI = true, options = {}) {
  if (!enableAI) {
    return html;
  }

  // 获取配置（可以从全局配置或选项中获取）
  const position = options.position || 'left'; // 默认左侧
  const autoOpen = options.autoOpen || false;

  // 将配置注入到脚本中
  const configScript = `
    <script>
      window.AI_PANEL_CONFIG = {
        position: '${position}',
        autoOpen: ${autoOpen}
      };
    </script>
  `;

  const aiScript = generateAIPanelScript();

  const fullScript = configScript + aiScript;

  // 尝试在 </body> 标签前插入AI脚本
  if (html.includes('</body>')) {
    return html.replace('</body>', `${fullScript}\n</body>`);
  }

  // 如果没有 </body> 标签，尝试在 </html> 标签前插入
  if (html.includes('</html>')) {
    return html.replace('</html>', `${fullScript}\n</html>`);
  }

  // 如果都没有，直接在末尾添加
  return html + fullScript;
} 