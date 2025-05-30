/**
 * Pug 调试工具模块
 * 为页面注入调试功能，允许用户点击元素查看调试信息
 */

/**
 * 调试工具核心JavaScript代码
 * 提取到独立函数以便于维护和获得语法提示
 */
function createDebugToolScript() {
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
    debugOverlay.style.cssText = `
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
      max-height: 95vh;
      overflow-y: auto;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      display: none;
    `;
    
    debugOverlay.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <span style="font-weight: bold; color: #4CAF50;">🐛 Pug Debug Info</span>
        <button id="close-debug" class="pug-debug-element" style="background: none; border: none; color: white; font-size: 16px; cursor: pointer;">&times;</button>
      </div>
      <div id="debug-content" class="pug-debug-element"></div>
    `;
    
    document.body.appendChild(debugOverlay);
    
    // 关闭按钮事件
    document.getElementById('close-debug').addEventListener('click', hideDebugInfo);
  }

  // 创建调试模式切换按钮
  function createDebugToggle() {
    const toggle = document.createElement('div');
    toggle.id = 'pug-debug-toggle';
    toggle.className = 'pug-debug-element';
    toggle.style.cssText = `
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
    `;
    
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
    highlightOverlay.style.cssText = `
      position: absolute;
      pointer-events: none;
      border: 2px solid #ff4444;
      background: rgba(255, 68, 68, 0.1);
      box-shadow: 0 0 10px rgba(255, 68, 68, 0.5);
      z-index: 9998;
      display: none;
      box-sizing: border-box;
    `;
    
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

  // 获取元素自身的纯文本内容（不包括子元素）
  function getElementOwnText(element) {
    return Array.from(element.childNodes)
      .filter(node => node.nodeType === 3)
      .map(node => node.textContent.trim())
      .join('') || '无';
  }

  // 显示调试信息
  function showDebugInfo(element) {
    createDebugOverlay();
    
    const debugFile = element.getAttribute('data-debug-file');
    const debugLine = element.getAttribute('data-debug-line');
    const debugTag = element.tagName.toLowerCase();
    const ownText = getElementOwnText(element);
    const debugEditable = element.getAttribute('data-debug-editable');
    
    let content = '';
    
    if (debugFile || debugLine) {
      // 判断文本内容是否可编辑
      const isEditable = debugEditable !== null;
      const textContentHtml = isEditable 
        ? `<span id="editable-text" style="color: #87CEEB; cursor: pointer; text-decoration: underline;" title="单击编辑">${ownText}</span> <span style="color: #4CAF50; font-size: 10px;">✏️可编辑</span>`
        : `<span style="color: #87CEEB;">${ownText}</span>`;
      
      content = `
        <div style="margin-bottom: 8px;">
          <span style="color: #FFD700;">文件:</span> 
          <span style="color: #87CEEB;">${debugFile || '未知'}</span>
        </div>
        <div style="margin-bottom: 8px;">
          <span style="color: #FFD700;">行号:</span> 
          <span style="color: #87CEEB;">${debugLine || '未知'}</span>
        </div>
        <div style="margin-bottom: 8px;">
          <span style="color: #FFD700;">标签:</span> 
          <span style="color: #87CEEB;">${debugTag}</span>
        </div>
        <div style="margin-bottom: 8px;">
          <span style="color: #FFD700;">ID:</span> 
          <span style="color: #87CEEB;">${element.id || '无'}</span>
        </div>
        <div style="margin-bottom: 8px;">
          <span style="color: #FFD700;">类名:</span> 
          <span style="color: #87CEEB;">${element.className || '无'}</span>
        </div>
        <div style="margin-bottom: 8px;">
          <span style="color: #FFD700;">文本内容:</span> 
          ${textContentHtml}
        </div>
        <hr style="border: 1px solid #444; margin: 10px 0;">
        <div style="font-size: 11px; color: #AAA;">
          💡 点击其他元素查看调试信息，点击切换按钮关闭调试模式
          ${isEditable ? '<br/>✏️ 单击文本内容可进行编辑' : ''}
        </div>
      `;
      
      // 发送调试信息到服务端
      sendDebugInfoToServer({
        file: debugFile,
        line: debugLine,
        tag: debugTag,
        id: element.id,
        className: element.className,
        textContent: getElementOwnText(element),
        editableKey: debugEditable
      });
    } else {
      content = `
        <div style="color: #FFA500;">
          ⚠️ 此元素没有调试信息
        </div>
        <div style="margin-top: 8px;">
          <span style="color: #FFD700;">标签:</span> 
          <span style="color: #87CEEB;">${debugTag}</span>
        </div>
        <div style="margin-top: 8px;">
          <span style="color: #FFD700;">ID:</span> 
          <span style="color: #87CEEB;">${element.id || '无'}</span>
        </div>
        <div style="margin-top: 8px;">
          <span style="color: #FFD700;">类名:</span> 
          <span style="color: #87CEEB;">${element.className || '无'}</span>
        </div>
        <div style="margin-top: 8px;">
          <span style="color: #FFD700;">文本内容:</span> 
          <span style="color: #87CEEB;">${ownText}</span>
        </div>
        <hr style="border: 1px solid #444; margin: 10px 0;">
        <div style="margin-top: 8px; font-size: 11px; color: #AAA;">
          💡 可能是动态生成的元素或非调试模板中的元素
        </div>
      `;
    }
    
    document.getElementById('debug-content').innerHTML = content;
    debugOverlay.style.display = 'block';
    
    // 如果有可编辑文本，添加单击事件
    const editableText = document.getElementById('editable-text');
    if (editableText) {
      editableText.addEventListener('click', function(e) {
        e.stopPropagation();
        startTextEdit(element, editableText, ownText, debugEditable, debugFile, debugLine);
      });
    }
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

  // 开始文本编辑
  function startTextEdit(element, textElement, originalText, editableKey, debugFile, debugLine) {
    // 创建输入框
    const input = document.createElement('input');
    input.type = 'text';
    input.value = originalText;
    input.style.cssText = `
      background: #333;
      color: #87CEEB;
      border: 1px solid #4CAF50;
      border-radius: 3px;
      padding: 2px 5px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      width: 200px;
    `;
    
    // 保存按钮
    const saveBtn = document.createElement('button');
    saveBtn.textContent = '保存';
    saveBtn.className = 'pug-debug-element';
    saveBtn.style.cssText = `
      background: #4CAF50;
      color: white;
      border: none;
      border-radius: 3px;
      padding: 2px 8px;
      margin-left: 5px;
      cursor: pointer;
      font-size: 11px;
    `;
    
    // 取消按钮
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.className = 'pug-debug-element';
    cancelBtn.style.cssText = `
      background: #f44336;
      color: white;
      border: none;
      border-radius: 3px;
      padding: 2px 8px;
      margin-left: 5px;
      cursor: pointer;
      font-size: 11px;
    `;
    
    // 创建编辑容器
    const editContainer = document.createElement('div');
    editContainer.className = 'pug-debug-element';
    editContainer.style.cssText = `
      display: flex;
      align-items: center;
      margin-top: 5px;
    `;
    
    editContainer.appendChild(input);
    editContainer.appendChild(saveBtn);
    editContainer.appendChild(cancelBtn);
    
    // 替换原始文本元素
    const parentDiv = textElement.parentElement;
    const originalContent = parentDiv.innerHTML;
    
    // 隐藏原始文本，显示编辑界面
    textElement.style.display = 'none';
    parentDiv.appendChild(editContainer);
    
    // 聚焦输入框并选中文本
    input.focus();
    input.select();
    
    // 保存功能
    function saveEdit() {
      const newText = input.value.trim();
      if (newText !== originalText) {
        // 发送编辑信息到服务端
        sendTextEditToServer({
          file: debugFile,
          line: debugLine,
          editableKey: editableKey,
          originalText: originalText,
          newText: newText,
          element: {
            tag: element.tagName.toLowerCase(),
            id: element.id,
            className: element.className
          }
        });
        
        // 更新页面上的文本
        element.childNodes.forEach(node => {
          if (node.nodeType === 3 && node.textContent.trim() === originalText) {
            node.textContent = newText;
          }
        });
        
        showToast(`文本已更新: "${originalText}" → "${newText}"`, 'success');
      }
      
      // 恢复原始显示
      editContainer.remove();
      textElement.style.display = '';
      textElement.textContent = newText;
    }
    
    // 取消功能
    function cancelEdit() {
      editContainer.remove();
      textElement.style.display = '';
    }
    
    // 绑定事件
    saveBtn.addEventListener('click', saveEdit);
    cancelBtn.addEventListener('click', cancelEdit);
    
    // 回车保存，ESC取消
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    });
    
    // 点击其他地方取消编辑
    document.addEventListener('click', function outsideClick(e) {
      if (!editContainer.contains(e.target)) {
        document.removeEventListener('click', outsideClick);
        cancelEdit();
      }
    });
  }

  // 发送文本编辑信息到服务端
  function sendTextEditToServer(editData) {
    fetch('/api/pug-debug/edit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        url: window.location.href,
        ...editData
      })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        showToast(data.message || '文件已成功更新', 'success');
        console.log('文本编辑成功:', data);
      } else {
        showToast(data.message || '文件更新失败', 'error');
        console.error('文本编辑失败:', data);
      }
    })
    .catch(err => {
      showToast('发送编辑请求失败', 'error');
      console.error('发送文本编辑失败:', err);
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
    
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: ${bgColor};
      color: white;
      padding: 10px 20px;
      border-radius: 6px;
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 14px;
      z-index: 10001;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
      opacity: 0;
      transition: opacity 0.3s ease;
    `;
    
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
}

/**
 * 生成客户端调试脚本
 * @returns {string} 返回调试脚本的HTML字符串
 */
export function generateDebugScript() {
  return `
<script>
(${createDebugToolScript.toString()})();
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