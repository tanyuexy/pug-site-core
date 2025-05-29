/**
 * Pug 调试工具模块
 * 为页面注入调试功能，允许用户点击元素查看调试信息
 */

/**
 * 生成客户端调试脚本
 * @returns {string} 返回调试脚本的HTML字符串
 */
export function generateDebugScript() {
  return `
<script>
(function() {
  // 调试模式标识
  let debugMode = false;
  let currentHighlightedElement = null;
  let highlightOverlay = null; // 高亮覆盖层
  let debugOverlay = null;
  let debugInfo = null;

  // 创建调试信息显示面板
  function createDebugOverlay() {
    if (debugOverlay) return;
    
    debugOverlay = document.createElement('div');
    debugOverlay.id = 'pug-debug-overlay';
    debugOverlay.className = 'pug-debug-element';
    debugOverlay.style.cssText = \`
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 15px;
      border-radius: 8px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      z-index: 10000;
      min-width: 300px;
      max-width: 500px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      display: none;
    \`;
    
    debugOverlay.innerHTML = \`
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <span style="font-weight: bold; color: #4CAF50;">🐛 Pug Debug Info</span>
        <button id="close-debug" class="pug-debug-element" style="background: none; border: none; color: white; font-size: 16px; cursor: pointer;">&times;</button>
      </div>
      <div id="debug-content" class="pug-debug-element"></div>
    \`;
    
    document.body.appendChild(debugOverlay);
    
    // 关闭按钮事件
    document.getElementById('close-debug').addEventListener('click', hideDebugInfo);
  }

  // 创建调试模式切换按钮
  function createDebugToggle() {
    const toggle = document.createElement('div');
    toggle.id = 'pug-debug-toggle';
    toggle.className = 'pug-debug-element';
    toggle.style.cssText = \`
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 50px;
      height: 50px;
      background: #2196F3;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 9999;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
      transition: background-color 0.3s;
    \`;
    
    toggle.innerHTML = '🐛';
    toggle.title = '开启调试模式';
    
    toggle.addEventListener('click', toggleDebugMode);
    document.body.appendChild(toggle);
  }

  // 切换调试模式
  function toggleDebugMode() {
    debugMode = !debugMode;
    const toggle = document.getElementById('pug-debug-toggle');
    
    if (debugMode) {
      toggle.style.background = '#4CAF50';
      toggle.title = '关闭调试模式 (ESC)';
      document.body.style.cursor = 'crosshair';
      
      // 添加调试模式提示
      showToast('🐛 调试模式已开启，点击任意元素查看调试信息', 'success');
      console.log('🐛 Pug调试模式已开启，点击任意元素查看调试信息');
    } else {
      toggle.style.background = '#2196F3';
      toggle.title = '开启调试模式';
      document.body.style.cursor = '';
      clearHighlight();
      hideDebugInfo();
      
      showToast('🐛 调试模式已关闭', 'info');
      console.log('🐛 Pug调试模式已关闭');
    }
  }

  // 创建高亮覆盖层
  function createHighlightOverlay() {
    if (highlightOverlay) return;
    
    highlightOverlay = document.createElement('div');
    highlightOverlay.id = 'pug-debug-highlight';
    highlightOverlay.className = 'pug-debug-element';
    highlightOverlay.style.cssText = \`
      position: absolute;
      pointer-events: none;
      border: 2px solid #ff4444;
      background: rgba(255, 68, 68, 0.1);
      box-shadow: 0 0 10px rgba(255, 68, 68, 0.5);
      z-index: 9998;
      display: none;
      box-sizing: border-box;
    \`;
    
    document.body.appendChild(highlightOverlay);
  }

  // 高亮元素
  function highlightElement(element) {
    clearHighlight();
    currentHighlightedElement = element;
    
    createHighlightOverlay();
    
    // 获取元素的位置和尺寸
    const rect = element.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    // 设置高亮覆盖层的位置和尺寸
    highlightOverlay.style.display = 'block';
    highlightOverlay.style.left = (rect.left + scrollLeft) + 'px';
    highlightOverlay.style.top = (rect.top + scrollTop) + 'px';
    highlightOverlay.style.width = rect.width + 'px';
    highlightOverlay.style.height = rect.height + 'px';
  }

  // 清除高亮
  function clearHighlight() {
    if (highlightOverlay) {
      highlightOverlay.style.display = 'none';
    }
    currentHighlightedElement = null;
  }

  // 显示调试信息
  function showDebugInfo(element) {
    createDebugOverlay();
    
    const debugFile = element.getAttribute('data-debug-file');
    const debugLine = element.getAttribute('data-debug-line');
    const debugTag = element.tagName.toLowerCase();
    
    let content = '';
    
    if (debugFile || debugLine) {
      content = \`
        <div style="margin-bottom: 8px;">
          <span style="color: #FFD700;">📁 文件:</span> 
          <span style="color: #87CEEB;">\${debugFile || '未知'}</span>
        </div>
        <div style="margin-bottom: 8px;">
          <span style="color: #FFD700;">📍 行号:</span> 
          <span style="color: #87CEEB;">\${debugLine || '未知'}</span>
        </div>
        <div style="margin-bottom: 8px;">
          <span style="color: #FFD700;">🏷️ 标签:</span> 
          <span style="color: #87CEEB;">\${debugTag}</span>
        </div>
        <div style="margin-bottom: 8px;">
          <span style="color: #FFD700;">🆔 ID:</span> 
          <span style="color: #87CEEB;">\${element.id || '无'}</span>
        </div>
        <div style="margin-bottom: 8px;">
          <span style="color: #FFD700;">🎨 类名:</span> 
          <span style="color: #87CEEB;">\${element.className || '无'}</span>
        </div>
        <hr style="border: 1px solid #444; margin: 10px 0;">
        <div style="font-size: 11px; color: #AAA;">
          💡 点击其他元素查看调试信息，点击切换按钮关闭调试模式
        </div>
      \`;
      
      // 发送调试信息到服务端
      sendDebugInfoToServer({
        file: debugFile,
        line: debugLine,
        tag: debugTag,
        id: element.id,
        className: element.className,
        innerHTML: element.innerHTML.substring(0, 100) + (element.innerHTML.length > 100 ? '...' : '')
      });
    } else {
      content = \`
        <div style="color: #FFA500;">
          ⚠️ 此元素没有调试信息
        </div>
        <div style="margin-top: 8px;">
          <span style="color: #FFD700;">🏷️ 标签:</span> 
          <span style="color: #87CEEB;">\${debugTag}</span>
        </div>
        <div style="margin-top: 8px;">
          <span style="color: #FFD700;">🆔 ID:</span> 
          <span style="color: #87CEEB;">\${element.id || '无'}</span>
        </div>
        <div style="margin-top: 8px;">
          <span style="color: #FFD700;">🎨 类名:</span> 
          <span style="color: #87CEEB;">\${element.className || '无'}</span>
        </div>
        <hr style="border: 1px solid #444; margin: 10px 0;">
        <div style="margin-top: 8px; font-size: 11px; color: #AAA;">
          💡 可能是动态生成的元素或非调试模板中的元素
        </div>
      \`;
    }
    
    document.getElementById('debug-content').innerHTML = content;
    debugOverlay.style.display = 'block';
  }

  // 隐藏调试信息
  function hideDebugInfo() {
    if (debugOverlay) {
      debugOverlay.style.display = 'none';
    }
  }

  // 发送调试信息到服务端
  function sendDebugInfoToServer(debugData) {
    fetch('/api/pug-debug', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        url: window.location.href,
        ...debugData
      })
    }).catch(err => {
      console.warn('发送调试信息失败:', err);
    });
  }

  // 页面点击事件处理
  function handleClick(event) {
    if (!debugMode) return;
    
    const element = event.target;
    
    // 排除调试工具自身注入的元素
    if (isDebugElement(element)) {
      return; // 不处理调试元素的点击
    }
    
    event.preventDefault();
    event.stopPropagation();
    
    highlightElement(element);
    showDebugInfo(element);
  }

  // 检查元素是否为调试工具注入的元素
  function isDebugElement(element) {
    // 检查元素本身是否为调试元素
    if (element.id === 'pug-debug-toggle' || 
        element.id === 'pug-debug-overlay' ||
        element.id === 'pug-debug-highlight' ||
        element.id === 'close-debug' ||
        element.id === 'debug-content' ||
        element.id === 'pug-debug-toast') {
      return true;
    }
    
    // 检查是否包含调试相关的类名
    if (element.className && 
        (element.className.includes('pug-debug') || 
         element.className.includes('pug-debug-element') ||
         element.className.includes('pug-debug-toast'))) {
      return true;
    }
    
    // 检查元素是否在调试容器内
    let parent = element.parentElement;
    while (parent) {
      if (parent.id === 'pug-debug-toggle' || 
          parent.id === 'pug-debug-overlay' ||
          parent.id === 'pug-debug-highlight' ||
          parent.id === 'pug-debug-toast') {
        return true;
      }
      
      // 检查父元素是否包含调试相关的类名
      if (parent.className && 
          (parent.className.includes('pug-debug') || 
           parent.className.includes('pug-debug-element') ||
           parent.className.includes('pug-debug-toast'))) {
        return true;
      }
      
      parent = parent.parentElement;
    }
    
    return false;
  }

  // 添加提示信息显示函数
  function showToast(message, type = 'info') {
    // 移除现有的提示
    const existingToast = document.getElementById('pug-debug-toast');
    if (existingToast) {
      existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.id = 'pug-debug-toast';
    toast.className = 'pug-debug-toast'; // 添加调试相关类名便于排除
    
    const bgColor = type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3';
    
    toast.style.cssText = \`
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: \${bgColor};
      color: white;
      padding: 10px 20px;
      border-radius: 6px;
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 14px;
      z-index: 10001;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
      opacity: 0;
      transition: opacity 0.3s ease;
    \`;
    
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // 淡入效果
    setTimeout(() => {
      toast.style.opacity = '1';
    }, 100);
    
    // 3秒后自动消失
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 3000);
  }

  // 初始化调试工具
  function initDebugTool() {
    createDebugToggle();
    
    // 添加全局点击事件监听
    document.addEventListener('click', handleClick, true);
    
    // ESC键关闭调试模式
    document.addEventListener('keydown', function(event) {
      if (event.key === 'Escape' && debugMode) {
        toggleDebugMode();
      }
    });
    
    // 监听窗口滚动和大小改变，更新高亮框位置
    function updateHighlightPosition() {
      if (currentHighlightedElement && highlightOverlay && highlightOverlay.style.display === 'block') {
        const rect = currentHighlightedElement.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        
        highlightOverlay.style.left = (rect.left + scrollLeft) + 'px';
        highlightOverlay.style.top = (rect.top + scrollTop) + 'px';
        highlightOverlay.style.width = rect.width + 'px';
        highlightOverlay.style.height = rect.height + 'px';
      }
    }
    
    window.addEventListener('scroll', updateHighlightPosition);
    window.addEventListener('resize', updateHighlightPosition);
    
    console.log('🐛 Pug调试工具已加载，点击右下角按钮开启调试模式');
  }

  // DOM加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDebugTool);
  } else {
    initDebugTool();
  }
})();
</script>
  `;
}

/**
 * 为HTML内容注入调试脚本
 * @param {string} html - 原始HTML内容
 * @param {boolean} enableDebug - 是否启用调试功能，默认true
 * @returns {string} 注入调试脚本后的HTML内容
 */
export function injectDebugScript(html, enableDebug = true) {
  if (!enableDebug) {
    return html;
  }
  
  const debugScript = generateDebugScript();
  
  // 尝试在 </body> 标签前插入调试脚本
  if (html.includes('</body>')) {
    return html.replace('</body>', `${debugScript}\n</body>`);
  }
  
  // 如果没有 </body> 标签，尝试在 </html> 标签前插入
  if (html.includes('</html>')) {
    return html.replace('</html>', `${debugScript}\n</html>`);
  }
  
  // 如果都没有，直接在末尾添加
  return html + debugScript;
}

/**
 * 处理来自客户端的调试信息
 * @param {Object} debugData - 调试数据
 * @returns {Object} 处理结果
 */
export function handleDebugInfo(debugData) {
  console.log('收到调试信息:', {
    时间: debugData.timestamp,
    页面: debugData.url,
    文件: debugData.file,
    行号: debugData.line,
    标签: debugData.tag,
    ID: debugData.id,
    类名: debugData.className
  });
  
  // 这里可以添加更多的处理逻辑，比如：
  // 1. 记录到日志文件
  // 2. 发送到外部监控系统
  // 3. 触发 VS Code 等编辑器打开对应文件
  // 4. 存储到数据库等
  
  return {
    success: true,
    message: '调试信息已记录',
    data: debugData
  };
}

/**
 * 创建调试信息接收的Express路由处理器
 * @returns {Function} Express路由处理函数
 */
export function createDebugRoute() {
  return (req, res) => {
    try {
      const debugData = req.body;
      const result = handleDebugInfo(debugData);
      res.json(result);
    } catch (error) {
      console.error('处理调试信息时出错:', error);
      res.status(500).json({
        success: false,
        message: '处理调试信息失败',
        error: error.message
      });
    }
  };
}

