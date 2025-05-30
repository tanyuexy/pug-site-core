/**
 * Pug 调试工具模块
 * 为页面注入调试功能，允许用户点击元素查看调试信息
 */

/**
 * 调试工具核心JavaScript代码
 * 提取到独立函数以便于维护和获得语法提示
 */
function createDebugToolScript() {
  /**
   * 公共样式配置
   */
  const DEBUG_STYLES = {
    // 通用按钮样式
    button: {
      base: `
        border: none;
        cursor: pointer;
        border-radius: 4px;
        font-size: 12px;
        padding: 6px 12px;
        transition: background-color 0.2s;
      `,
      primary: 'background: #4CAF50; color: white;',
      secondary: 'background: #FF9800; color: white;',
      danger: 'background: #f44336; color: white;',
      neutral: 'background: #757575; color: white;'
    },
    
    // 输入框样式
    input: `
      width: 100%;
      background: #333 !important;
      color: white !important;
      border: 1px solid #555;
      border-radius: 3px;
      padding: 5px;
      font-size: 11px;
      box-sizing: border-box;
      -webkit-appearance: none;
      -webkit-box-shadow: inset 0 0 0 1000px #333 !important;
      -webkit-text-fill-color: white !important;
    `,
    
    // 标签样式
    label: `
      color: #FFD700;
      font-size: 11px;
      display: block;
      margin-bottom: 3px;
    `,
    
    // 弹窗头部样式
    headerStyle: `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 15px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 8px 8px 0 0;
      cursor: move;
      border-bottom: 1px solid rgba(255, 255, 255, 0.2);
    `,
    
    // 弹窗内容样式
    contentStyle: `
      padding: 15px;
      overflow-y: auto;
      max-height: calc(95vh - 50px);
    `
  };

  /**
   * UI工具类
   */
  class UIHelper {
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
        'pug-debug-element',
        DEBUG_STYLES.button.base + DEBUG_STYLES.button[type],
        text
      );
      if (onClick) button.addEventListener('click', onClick);
      return button;
    }

    /**
     * 创建输入框组
     */
    static createInputGroup(label, id, value = '', placeholder = '', type = 'text') {
      const container = this.createElement('div');
      
      const labelEl = this.createElement('label', '', '', DEBUG_STYLES.label, label);
      labelEl.setAttribute('for', id);
      
      const input = this.createElement('input', id, '', DEBUG_STYLES.input);
      input.type = type;
      input.value = value;
      input.placeholder = placeholder;
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('spellcheck', 'false');
      
      container.appendChild(labelEl);
      container.appendChild(input);
      return { container, input };
    }

    /**
     * 创建选择框组
     */
    static createSelectGroup(label, id, options, currentValue = '') {
      const container = this.createElement('div');
      
      const labelEl = this.createElement('label', '', '', DEBUG_STYLES.label, label);
      labelEl.setAttribute('for', id);
      
      const select = this.createElement('select', id, '', `
        width: 100%;
        background: #333;
        color: white;
        border: 1px solid #555;
        border-radius: 3px;
        padding: 5px;
        font-size: 11px;
        box-sizing: border-box;
      `);
      
      options.forEach(({ value, text, selected }) => {
        const option = this.createElement('option', '', '', '', text);
        option.value = value;
        if (selected || value === currentValue) option.selected = true;
      });
      
      container.appendChild(labelEl);
      container.appendChild(select);
      return { container, select };
    }

    /**
     * 显示提示消息
     */
    static showToast(message, type = 'info') {
      // 移除现有提示
      const existing = document.getElementById('pug-debug-toast');
      if (existing) existing.remove();

      const colors = {
        success: '#4CAF50',
        error: '#f44336',
        info: '#2196F3'
      };

      const toast = this.createElement('div', 'pug-debug-toast', 'pug-debug-toast', `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${colors[type]};
        color: white;
        padding: 10px 20px;
        border-radius: 6px;
        font-family: 'Segoe UI', Arial, sans-serif;
        font-size: 14px;
        z-index: 10001;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
        opacity: 0;
        transition: opacity 0.3s ease;
      `, message);

      document.body.appendChild(toast);
      
      // 淡入淡出效果
      setTimeout(() => toast.style.opacity = '1', 100);
      setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }
  }

  /**
   * 拖拽功能混入
   */
  class DragHandler {
    constructor(element, handle = null) {
      this.element = element;
      this.handle = handle || element;
      this.isDragging = false;
      this.offset = { x: 0, y: 0 };
      this.setupDrag();
    }

    setupDrag() {
      this.handle.addEventListener('mousedown', this.handleMouseDown.bind(this));
    }

    handleMouseDown(e) {
      this.isDragging = true;
      const rect = this.element.getBoundingClientRect();
      this.offset.x = e.clientX - rect.left;
      this.offset.y = e.clientY - rect.top;

      this.handle.style.cursor = 'grabbing';
      document.addEventListener('mousemove', this.handleMouseMove.bind(this));
      document.addEventListener('mouseup', this.handleMouseUp.bind(this));
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
      document.removeEventListener('mousemove', this.handleMouseMove.bind(this));
      document.removeEventListener('mouseup', this.handleMouseUp.bind(this));
    }
  }

  /**
   * 样式工具类
   */
  class StyleUtils {
    /**
     * 为需要单位的值自动添加px
     */
    static addUnitIfNeeded(value, property) {
      if (!value || value.trim() === '') return '';
      
      const trimmedValue = value.trim();
      const pixelProperties = [
        'width', 'height', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
        'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontSize'
      ];

      // lineHeight特殊处理
      if (property === 'lineHeight') {
        if (/^[\d.]+$/.test(trimmedValue)) return trimmedValue;
        if (/^[\d.-]+(?:px|em|rem|%|vh|vw|vmin|vmax|cm|mm|in|pt|pc|ex|ch)$/i.test(trimmedValue)) {
          return trimmedValue;
        }
        return trimmedValue;
      }

      if (!pixelProperties.includes(property)) return trimmedValue;
      if (/^[\d.-]+(?:px|em|rem|%|vh|vw|vmin|vmax|cm|mm|in|pt|pc|ex|ch)$/i.test(trimmedValue)) {
        return trimmedValue;
      }
      if (/^-?[\d.]+$/.test(trimmedValue)) return trimmedValue + 'px';
      
      const specialValues = ['auto', 'inherit', 'initial', 'unset', 'none', 'normal'];
      return specialValues.includes(trimmedValue.toLowerCase()) ? trimmedValue : trimmedValue;
    }

    /**
     * RGB转十六进制
     */
    static rgbToHex(rgb) {
      if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return '#000000';
      if (rgb.startsWith('#')) return rgb;
      
      const result = rgb.match(/\d+/g);
      if (result && result.length >= 3) {
        const r = parseInt(result[0]);
        const g = parseInt(result[1]);
        const b = parseInt(result[2]);
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
      }
      return '#000000';
    }

    /**
     * 格式化样式值
     */
    static formatValue(value) {
      if (!value || value === 'auto' || value === '0px') return '';
      return value;
    }

    /**
     * 获取样式值（优先内联样式）
     */
    static getStyleValue(element, property, computedValue) {
      const inlineValue = element.style[property];
      return inlineValue || computedValue || '';
    }
  }

  // 状态变量
  let debugMode = false;
  let currentHighlightedElement = null;
  let highlightOverlay = null;
  let debugOverlay = null;
  let currentStyleEditorElement = null;

  /**
   * 创建可折叠面板的通用方法
   */
  function createCollapsiblePanel(id, title, content, options = {}) {
    const {
      width = '300px',
      maxWidth = '500px',
      position = { top: '10px', right: '10px' },
      zIndex = 10000
    } = options;

    const panel = UIHelper.createElement('div', id, 'pug-debug-element', `
      position: fixed;
      top: ${position.top};
      right: ${position.right};
      background: rgba(0, 0, 0, 0.9);
      color: white;
      border-radius: 8px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      z-index: ${zIndex};
      min-width: ${width};
      max-width: ${maxWidth};
      max-height: 95vh;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      display: none;
      user-select: none;
    `);

    const header = UIHelper.createElement('div', `${id}-header`, 'pug-debug-element', 
      DEBUG_STYLES.headerStyle);
    
    const titleSection = UIHelper.createElement('div', '', '', `
      display: flex;
      align-items: center;
      gap: 8px;
    `, `
      <span style="font-weight: bold; color: #4CAF50;">${title}</span>
      <span style="color: #888; font-size: 10px;margin-right: 10px;">拖拽移动</span>
    `);

    const buttonSection = UIHelper.createElement('div', '', '', `
      display: flex;
      align-items: center;
      gap: 5px;
    `);

    const collapseBtn = UIHelper.createButton(`${id}-collapse`, '−', 'neutral');
    const closeBtn = UIHelper.createButton(`${id}-close`, '×', 'danger');
    
    buttonSection.appendChild(collapseBtn);
    buttonSection.appendChild(closeBtn);
    header.appendChild(titleSection);
    header.appendChild(buttonSection);

    const contentDiv = UIHelper.createElement('div', `${id}-content`, 'pug-debug-element', 
      DEBUG_STYLES.contentStyle, content);

    panel.appendChild(header);
    panel.appendChild(contentDiv);

    // 设置拖拽
    new DragHandler(panel, header);

    // 折叠功能
    let isCollapsed = false;
    collapseBtn.addEventListener('click', () => {
      isCollapsed = !isCollapsed;
      contentDiv.style.display = isCollapsed ? 'none' : 'block';
      collapseBtn.textContent = isCollapsed ? '+' : '−';
      panel.style.minWidth = isCollapsed ? 'auto' : width;
    });

    return { panel, contentDiv, closeBtn };
  }

  // 创建调试信息显示面板
  function createDebugOverlay() {
    console.log("🐛 createDebugOverlay 被调用，已存在的 debugOverlay:", !!debugOverlay);
    if (debugOverlay) return;

    const { panel, contentDiv, closeBtn } = createCollapsiblePanel(
      'pug-debug-overlay',
      '🐛 Pug Debug Info',
      ''
    );

    debugOverlay = panel;
    closeBtn.addEventListener('click', hideDebugInfo);
    document.body.appendChild(debugOverlay);
  }

  // 创建调试模式切换按钮
  function createDebugToggle() {
    const toggle = UIHelper.createElement('div', 'pug-debug-toggle', 'pug-debug-element', `
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
    `, '🐛');

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
      UIHelper.showToast('🐛 调试模式已开启，点击任意元素查看调试信息', 'success');
    } else {
      toggle.style.background = '#2196F3';
      toggle.title = '开启调试模式';
      document.body.style.cursor = '';
      clearHighlight();
      hideDebugInfo();
      UIHelper.showToast('🐛 调试模式已关闭', 'info');
    }
  }

  // 创建高亮覆盖层
  function createHighlightOverlay() {
    if (highlightOverlay) return;

    highlightOverlay = UIHelper.createElement('div', 'pug-debug-highlight', 'pug-debug-element', `
      position: absolute;
      pointer-events: none;
      border: 2px solid #ff4444;
      background: rgba(255, 68, 68, 0.1);
      box-shadow: 0 0 10px rgba(255, 68, 68, 0.5);
      z-index: 9998;
      display: none;
      box-sizing: border-box;
    `);

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
    highlightOverlay.style.display = "block";
    highlightOverlay.style.left = rect.left + scrollLeft + "px";
    highlightOverlay.style.top = rect.top + scrollTop + "px";
    highlightOverlay.style.width = rect.width + "px";
    highlightOverlay.style.height = rect.height + "px";
  }

  // 清除高亮
  function clearHighlight() {
    if (highlightOverlay) {
      highlightOverlay.style.display = "none";
    }
    currentHighlightedElement = null;
  }

  // 获取元素自身的纯文本内容（不包括子元素）
  function getElementOwnText(element) {
    return (
      Array.from(element.childNodes)
        .filter((node) => node.nodeType === 3)
        .map((node) => node.textContent.trim())
        .join("") || "无"
    );
  }

  // 显示调试信息
  function showDebugInfo(element) {
    console.log("🐛 showDebugInfo 被调用，element:", element);
    createDebugOverlay();

    const debugFile = element.getAttribute("data-debug-file");
    const debugLine = element.getAttribute("data-debug-line");
    const debugTag = element.tagName.toLowerCase();
    const ownText = getElementOwnText(element);
    const debugEditable = element.getAttribute("data-debug-editable");

    console.log("🐛 调试信息:", { debugFile, debugLine, debugTag, ownText, debugEditable });

    let content = "";

    if (debugFile || debugLine) {
      // 判断文本内容是否可编辑
      const isEditable = debugEditable !== null;
      const textContentHtml = isEditable
        ? `<span id="editable-text" style="color: #87CEEB; cursor: pointer; text-decoration: underline;" title="单击编辑">${ownText}</span> <span style="color: #4CAF50; font-size: 10px;">✏️可编辑</span>`
        : `<span style="color: #87CEEB;">${ownText}</span>`;

      content = `
        <div style="margin-bottom: 8px;">
          <span style="color: #FFD700;">文件:</span> 
          <span style="color: #87CEEB;">${debugFile || "未知"}</span>
        </div>
        <div style="margin-bottom: 8px;">
          <span style="color: #FFD700;">行号:</span> 
          <span style="color: #87CEEB;">${debugLine || "未知"}</span>
        </div>
        <div style="margin-bottom: 8px;">
          <span style="color: #FFD700;">标签:</span> 
          <span style="color: #87CEEB;">${debugTag}</span>
        </div>
        <div style="margin-bottom: 8px;">
          <span style="color: #FFD700;">ID:</span> 
          <span style="color: #87CEEB;">${element.id || "无"}</span>
        </div>
        <div style="margin-bottom: 8px;">
          <span style="color: #FFD700;">类名:</span> 
          <span style="color: #87CEEB;">${element.className || "无"}</span>
        </div>
        <div style="margin-bottom: 8px;">
          <span style="color: #FFD700;">文本内容:</span> 
          ${textContentHtml}
        </div>
        <div style="margin-bottom: 10px;">
          <button id="edit-style-btn" class="pug-debug-element" style="
            background: #FF9800;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 6px 12px;
            cursor: pointer;
            font-size: 12px;
            margin-right: 8px;
          ">🎨 编辑样式</button>
        </div>
        <hr style="border: 1px solid #444; margin: 10px 0;">
        <div style="font-size: 11px; color: #AAA;">
          💡 点击其他元素查看调试信息，点击切换按钮关闭调试模式
          ${isEditable ? "<br/>✏️ 单击文本内容可进行编辑" : ""}
          <br/>🎨 点击"编辑样式"按钮可修改元素样式
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
        editableKey: debugEditable,
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
          <span style="color: #87CEEB;">${element.id || "无"}</span>
        </div>
        <div style="margin-top: 8px;">
          <span style="color: #FFD700;">类名:</span> 
          <span style="color: #87CEEB;">${element.className || "无"}</span>
        </div>
        <div style="margin-top: 8px;">
          <span style="color: #FFD700;">文本内容:</span> 
          <span style="color: #87CEEB;">${ownText}</span>
        </div>
        <div style="margin: 10px 0;">
          <button id="edit-style-btn" class="pug-debug-element" style="
            background: #FF9800;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 6px 12px;
            cursor: pointer;
            font-size: 12px;
          ">🎨 编辑样式</button>
        </div>
        <hr style="border: 1px solid #444; margin: 10px 0;">
        <div style="margin-top: 8px; font-size: 11px; color: #AAA;">
          💡 可能是动态生成的元素或非调试模板中的元素
          <br/>🎨 点击"编辑样式"按钮可修改元素样式
        </div>
      `;
    }

    document.getElementById("pug-debug-overlay-content").innerHTML = content;
    debugOverlay.style.display = "block";
    console.log("🐛 调试面板已显示，debugOverlay:", debugOverlay);

    // 如果有可编辑文本，添加单击事件
    const editableText = document.getElementById("editable-text");
    if (editableText) {
      editableText.addEventListener("click", function (e) {
        e.stopPropagation();
        startTextEdit(
          element,
          editableText,
          ownText,
          debugEditable,
          debugFile,
          debugLine
        );
      });
    }

    // 添加样式编辑按钮事件
    const editStyleBtn = document.getElementById("edit-style-btn");
    if (editStyleBtn) {
      editStyleBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        openStyleEditor(element);
      });
    }

    // 如果样式编辑器已经打开，自动更新其内容
    if (document.getElementById("pug-style-editor")) {
      updateStyleEditor(element);
    }
  }

  // 隐藏调试信息
  function hideDebugInfo() {
    if (debugOverlay) {
      debugOverlay.style.display = "none";
    }
  }

  // 开始文本编辑
  function startTextEdit(
    element,
    textElement,
    originalText,
    editableKey,
    debugFile,
    debugLine
  ) {
    // 创建输入框
    const input = UIHelper.createElement('input', '', '', `
      background: #333;
      color: #87CEEB;
      border: 1px solid #4CAF50;
      border-radius: 3px;
      padding: 2px 5px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      width: 200px;
    `);
    input.type = 'text';
    input.value = originalText;

    // 创建按钮
    const saveBtn = UIHelper.createButton('', '保存', 'primary');
    saveBtn.style.marginLeft = '5px';
    saveBtn.style.fontSize = '11px';
    saveBtn.style.padding = '2px 8px';

    const cancelBtn = UIHelper.createButton('', '取消', 'danger');
    cancelBtn.style.marginLeft = '5px';
    cancelBtn.style.fontSize = '11px';
    cancelBtn.style.padding = '2px 8px';

    // 创建编辑容器
    const editContainer = UIHelper.createElement('div', '', 'pug-debug-element', `
      display: flex;
      align-items: center;
      margin-top: 5px;
    `);

    editContainer.appendChild(input);
    editContainer.appendChild(saveBtn);
    editContainer.appendChild(cancelBtn);

    // 替换原始文本元素
    const parentDiv = textElement.parentElement;

    // 隐藏原始文本，显示编辑界面
    textElement.style.display = "none";
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
            className: element.className,
          },
        });

        // 更新页面上的文本
        element.childNodes.forEach((node) => {
          if (node.nodeType === 3 && node.textContent.trim() === originalText) {
            node.textContent = newText;
          }
        });

        UIHelper.showToast(`文本已更新: "${originalText}" → "${newText}"`, "success");
      }

      // 恢复原始显示
      editContainer.remove();
      textElement.style.display = "";
      textElement.textContent = newText;
    }

    // 取消功能
    function cancelEdit() {
      editContainer.remove();
      textElement.style.display = "";
    }

    // 绑定事件
    saveBtn.addEventListener("click", saveEdit);
    cancelBtn.addEventListener("click", cancelEdit);

    // 回车保存，ESC取消
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        saveEdit();
      }
    });

    // 点击其他地方取消编辑
    document.addEventListener("click", function outsideClick(e) {
      if (!editContainer.contains(e.target)) {
        document.removeEventListener("click", outsideClick);
        cancelEdit();
      }
    });
  }

  // 打开样式编辑器
  function openStyleEditor(element) {
    // 如果样式编辑器已经打开并且是同一个元素，直接返回
    if (
      currentStyleEditorElement === element &&
      document.getElementById("pug-style-editor")
    ) {
      return;
    }

    // 设置当前编辑的元素
    currentStyleEditorElement = element;

    // 移除现有的样式编辑器
    const existingEditor = document.getElementById("pug-style-editor");
    if (existingEditor) {
      existingEditor.remove();
    }

    createStyleEditor(element);
  }

  // 创建样式编辑器
  function createStyleEditor(element) {
    // 获取元素当前的计算样式
    const computedStyle = window.getComputedStyle(element);

    // 获取元素的实际样式值（优先使用内联样式，然后是计算样式）
    function getStyleValue(property, computedValue) {
      return StyleUtils.getStyleValue(element, property, computedValue);
    }

    // 创建样式编辑器内容
    const content = createStyleEditorContent(element, computedStyle, getStyleValue);

    const { panel, contentDiv, closeBtn } = createCollapsiblePanel(
      'pug-style-editor',
      '🎨 样式编辑器',
      content,
      {
        width: '450px',
        position: { top: '50%', left: '50%' },
        zIndex: 10002
      }
    );

    // 设置居中定位
    panel.style.transform = 'translate(-50%, -50%)';
    panel.style.right = 'auto';
    panel.style.top = '50%';
    panel.style.left = '50%';

    closeBtn.addEventListener('click', () => {
      currentStyleEditorElement = null;
      panel.remove();
    });

    document.body.appendChild(panel);
    panel.style.display = 'block';

    // 设置事件处理
    setupStyleEditorEvents(element, panel);
  }

  // 创建样式编辑器内容
  function createStyleEditorContent(element, computedStyle, getStyleValue) {
    // 创建输入框的辅助函数
    function createInputHTML(id, label, value, placeholder) {
      return `
        <div>
          <label style="${DEBUG_STYLES.label}">${label}:</label>
          <input type="text" id="${id}" 
            value="${StyleUtils.formatValue(value)}" 
            placeholder="${placeholder}"
            autocomplete="off" spellcheck="false"
            style="${DEBUG_STYLES.input}" />
        </div>
      `;
    }

    // 创建选择框的辅助函数
    function createSelectHTML(id, label, options, currentValue) {
      const optionsHTML = options.map(({ value, text, selected }) => 
        `<option value="${value}" ${selected || value === currentValue ? 'selected' : ''}>${text}</option>`
      ).join('');
      
      return `
        <div>
          <label style="${DEBUG_STYLES.label}">${label}:</label>
          <select id="${id}" style="
            width: 100%;
            background: #333;
            color: white;
            border: 1px solid #555;
            border-radius: 3px;
            padding: 5px;
            font-size: 11px;
            box-sizing: border-box;
          ">
            ${optionsHTML}
          </select>
        </div>
      `;
    }

    return `
      <style>
        #pug-style-editor input[type="text"] {
          background: #333 !important;
          color: white !important;
          -webkit-appearance: none !important;
          -webkit-box-shadow: inset 0 0 0 1000px #333 !important;
          -webkit-text-fill-color: white !important;
        }
        #pug-style-editor input[type="text"]:focus,
        #pug-style-editor input[type="text"]:hover {
          background: #333 !important;
          color: white !important;
          -webkit-box-shadow: inset 0 0 0 1000px #333 !important;
          -webkit-text-fill-color: white !important;
        }
        #pug-style-editor input[type="text"]::-webkit-input-placeholder {
          color: #888 !important;
        }
      </style>
      
      <div style="margin-bottom: 12px;">
        <h4 style="color: #4CAF50; margin: 0 0 6px 0; font-size: 13px;">📐 尺寸</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          ${createInputHTML('style-width', '宽度', getStyleValue('width', computedStyle.width), computedStyle.width)}
          ${createInputHTML('style-height', '高度', getStyleValue('height', computedStyle.height), computedStyle.height)}
        </div>
      </div>

      <div style="margin-bottom: 12px;">
        <h4 style="color: #4CAF50; margin: 0 0 6px 0; font-size: 13px;">📏 外边距</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 6px;">
          ${createInputHTML('margin-top', '上', getStyleValue('marginTop', computedStyle.marginTop), computedStyle.marginTop)}
          ${createInputHTML('margin-right', '右', getStyleValue('marginRight', computedStyle.marginRight), computedStyle.marginRight)}
          ${createInputHTML('margin-bottom', '下', getStyleValue('marginBottom', computedStyle.marginBottom), computedStyle.marginBottom)}
          ${createInputHTML('margin-left', '左', getStyleValue('marginLeft', computedStyle.marginLeft), computedStyle.marginLeft)}
        </div>
      </div>

      <div style="margin-bottom: 12px;">
        <h4 style="color: #4CAF50; margin: 0 0 6px 0; font-size: 13px;">📦 内边距</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 6px;">
          ${createInputHTML('padding-top', '上', getStyleValue('paddingTop', computedStyle.paddingTop), computedStyle.paddingTop)}
          ${createInputHTML('padding-right', '右', getStyleValue('paddingRight', computedStyle.paddingRight), computedStyle.paddingRight)}
          ${createInputHTML('padding-bottom', '下', getStyleValue('paddingBottom', computedStyle.paddingBottom), computedStyle.paddingBottom)}
          ${createInputHTML('padding-left', '左', getStyleValue('paddingLeft', computedStyle.paddingLeft), computedStyle.paddingLeft)}
        </div>
      </div>

      <div style="margin-bottom: 12px;">
        <h4 style="color: #4CAF50; margin: 0 0 6px 0; font-size: 13px;">🔤 字体</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 8px;">
          ${createInputHTML('font-size', '大小', getStyleValue('fontSize', computedStyle.fontSize), computedStyle.fontSize)}
          ${createInputHTML('line-height', '行高', getStyleValue('lineHeight', computedStyle.lineHeight), computedStyle.lineHeight)}
          ${createSelectHTML('font-weight', '粗细', [
            { value: '', text: `默认 (${computedStyle.fontWeight})` },
            { value: 'normal', text: 'normal (400)' },
            { value: 'bold', text: 'bold (700)' },
            { value: '100', text: '100' },
            { value: '200', text: '200' },
            { value: '300', text: '300' },
            { value: '500', text: '500' },
            { value: '600', text: '600' },
            { value: '800', text: '800' },
            { value: '900', text: '900' }
          ], getStyleValue('fontWeight', computedStyle.fontWeight))}
        </div>
        <div style="display: grid; grid-template-columns: 1fr; gap: 8px;">
          ${createSelectHTML('text-align', '对齐', [
            { value: '', text: `默认 (${computedStyle.textAlign})` },
            { value: 'left', text: '← 左对齐' },
            { value: 'center', text: '⊙ 居中对齐' },
            { value: 'right', text: '→ 右对齐' },
            { value: 'justify', text: '⊞ 两端对齐' },
            { value: 'start', text: 'start' },
            { value: 'end', text: 'end' }
          ], getStyleValue('textAlign', computedStyle.textAlign))}
        </div>
      </div>

      <div style="margin-bottom: 15px;">
        <h4 style="color: #4CAF50; margin: 0 0 6px 0; font-size: 13px;">🎨 颜色</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div>
            <label style="${DEBUG_STYLES.label}">文字颜色:</label>
            <div style="display: flex; gap: 6px;">
              <input type="color" id="color-picker" value="${StyleUtils.rgbToHex(getStyleValue('color', computedStyle.color))}" 
                style="width: 32px; height: 28px; border: none; background: none; cursor: pointer; padding: 0;" />
              <input type="text" id="color-text" 
                value="${StyleUtils.formatValue(getStyleValue('color', computedStyle.color))}" 
                placeholder="${computedStyle.color}"
                autocomplete="off" spellcheck="false"
                style="flex: 1; ${DEBUG_STYLES.input}" />
            </div>
          </div>
          <div>
            <label style="${DEBUG_STYLES.label}">背景颜色:</label>
            <div style="display: flex; gap: 6px;">
              <input type="color" id="bg-color-picker" value="${StyleUtils.rgbToHex(getStyleValue('backgroundColor', computedStyle.backgroundColor))}" 
                style="width: 32px; height: 28px; border: none; background: none; cursor: pointer; padding: 0;" />
              <input type="text" id="bg-color-text" 
                value="${StyleUtils.formatValue(getStyleValue('backgroundColor', computedStyle.backgroundColor))}" 
                placeholder="${computedStyle.backgroundColor}"
                autocomplete="off" spellcheck="false"
                style="flex: 1; ${DEBUG_STYLES.input}" />
            </div>
          </div>
        </div>
      </div>

      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button id="apply-styles" class="pug-debug-element" style="${DEBUG_STYLES.button.base}${DEBUG_STYLES.button.primary}">✅ 应用样式</button>
        <button id="reset-styles" class="pug-debug-element" style="${DEBUG_STYLES.button.base}background: #FF5722; color: white;">🔄 重置样式</button>
        <button id="cancel-styles" class="pug-debug-element" style="${DEBUG_STYLES.button.base}${DEBUG_STYLES.button.neutral}">❌ 取消</button>
      </div>
    `;
  }

  // 设置样式编辑器事件
  function setupStyleEditorEvents(element, styleEditor) {
    // 为需要px单位的输入框添加失焦事件
    const pixelInputIds = [
      "style-width", "style-height", "margin-top", "margin-right", 
      "margin-bottom", "margin-left", "padding-top", "padding-right", 
      "padding-bottom", "padding-left", "font-size"
    ];

    pixelInputIds.forEach((inputId) => {
      const input = document.getElementById(inputId);
      if (input) {
        input.addEventListener("blur", function () {
          const value = this.value.trim();
          if (value) {
            const property = inputId === "style-width" ? "width"
              : inputId === "style-height" ? "height"
              : inputId === "font-size" ? "fontSize"
              : inputId.replace(/-([a-z])/g, (g) => g[1].toUpperCase());

            const processedValue = StyleUtils.addUnitIfNeeded(value, property);
            if (processedValue !== value) {
              this.value = processedValue;
            }
          }
        });
      }
    });

    // 颜色选择器同步
    setupColorSyncEvents();

    // 应用样式 - 添加空值检查
    const applyBtn = document.getElementById("apply-styles");
    if (applyBtn) {
      applyBtn.addEventListener("click", () => {
        applyStylesToElement(currentStyleEditorElement || element);
        UIHelper.showToast("样式已应用到元素", "success");
      });
    }

    // 重置样式 - 添加空值检查
    const resetBtn = document.getElementById("reset-styles");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        const targetElement = currentStyleEditorElement || element;
        targetElement.style.cssText = "";
        UIHelper.showToast("元素样式已重置", "info");
        updateStyleEditor(targetElement);
      });
    }

    // 取消 - 添加空值检查
    const cancelBtn = document.getElementById("cancel-styles");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        currentStyleEditorElement = null;
        styleEditor.remove();
      });
    }

    // ESC键关闭
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        currentStyleEditorElement = null;
        styleEditor.remove();
        document.removeEventListener("keydown", handleEscape);
      }
    };
    document.addEventListener("keydown", handleEscape);
  }

  // 设置颜色选择器同步事件
  function setupColorSyncEvents() {
    const colorPicker = document.getElementById("color-picker");
    const colorText = document.getElementById("color-text");
    const bgColorPicker = document.getElementById("bg-color-picker");
    const bgColorText = document.getElementById("bg-color-text");

    if (colorPicker && colorText) {
      colorPicker.addEventListener("input", (e) => {
        colorText.value = e.target.value;
      });

      colorText.addEventListener("input", (e) => {
        try {
          const hexValue = StyleUtils.rgbToHex(e.target.value);
          if (hexValue !== "#000000" || e.target.value.includes("#")) {
            colorPicker.value = hexValue;
          }
        } catch (err) {
          console.warn("颜色转换错误:", err);
        }
      });
    } else {
      console.warn("文字颜色选择器元素未找到");
    }

    if (bgColorPicker && bgColorText) {
      bgColorPicker.addEventListener("input", (e) => {
        bgColorText.value = e.target.value;
      });

      bgColorText.addEventListener("input", (e) => {
        try {
          const hexValue = StyleUtils.rgbToHex(e.target.value);
          if (hexValue !== "#000000" || e.target.value.includes("#")) {
            bgColorPicker.value = hexValue;
          }
        } catch (err) {
          console.warn("背景颜色转换错误:", err);
        }
      });
    } else {
      console.warn("背景颜色选择器元素未找到");
    }
  }

  // 应用样式到元素
  function applyStylesToElement(element) {
    const styleInputs = {
      width: document.getElementById("style-width"),
      height: document.getElementById("style-height"),
      marginTop: document.getElementById("margin-top"),
      marginRight: document.getElementById("margin-right"),
      marginBottom: document.getElementById("margin-bottom"),
      marginLeft: document.getElementById("margin-left"),
      paddingTop: document.getElementById("padding-top"),
      paddingRight: document.getElementById("padding-right"),
      paddingBottom: document.getElementById("padding-bottom"),
      paddingLeft: document.getElementById("padding-left"),
      fontSize: document.getElementById("font-size"),
      lineHeight: document.getElementById("line-height"),
      fontWeight: document.getElementById("font-weight"),
      textAlign: document.getElementById("text-align"),
      color: document.getElementById("color-text"),
      backgroundColor: document.getElementById("bg-color-text"),
    };

    // 应用样式
    Object.keys(styleInputs).forEach((property) => {
      const input = styleInputs[property];
      
      // 添加空值检查
      if (!input) {
        console.warn(`样式输入元素不存在: ${property}`);
        return;
      }
      
      const value = input.value.trim();

      if (value) {
        const processedValue = StyleUtils.addUnitIfNeeded(value, property);
        element.style[property] = processedValue;
        if (processedValue !== value && processedValue.endsWith("px")) {
          input.value = processedValue;
        }
      } else if (element.style[property]) {
        element.style[property] = "";
      }
    });

    console.log("已应用样式到元素:", element);
  }

  // 页面点击事件处理
  function handleClick(event) {
    console.log("🐛 handleClick 被调用，debugMode:", debugMode);
    
    if (!debugMode) {
      console.log("🐛 调试模式未开启，跳过处理");
      return;
    }

    const element = event.target;
    console.log("🐛 点击的元素:", element);

    // 排除调试工具自身注入的元素
    if (isDebugElement(element)) {
      console.log("🐛 点击的是调试元素，跳过处理");
      return;
    }

    console.log("🐛 开始处理元素点击，准备显示调试信息");
    event.preventDefault();
    event.stopPropagation();

    highlightElement(element);
    showDebugInfo(element);
  }

  // 检查元素是否为调试工具注入的元素
  function isDebugElement(element) {
    // 调试元素ID列表
    const debugIds = [
      "pug-debug-toggle", "pug-debug-overlay", "pug-debug-highlight", 
      "pug-style-editor", "pug-debug-toast"
    ];

    // 检查元素本身是否为调试元素
    if (debugIds.includes(element.id) || element.className?.includes("pug-debug")) {
      return true;
    }

    // 检查元素是否在调试容器内
    let parent = element.parentElement;
    while (parent) {
      if (debugIds.includes(parent.id) || parent.className?.includes("pug-debug")) {
        return true;
      }
      parent = parent.parentElement;
    }

    return false;
  }

  // 初始化调试工具
  function initDebugTool() {
    console.log("🐛 initDebugTool 开始初始化");
    createDebugToggle();

    // 添加全局点击事件监听
    document.addEventListener("click", handleClick, true);
    console.log("🐛 已添加全局点击事件监听");

    // ESC键关闭调试模式
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && debugMode) {
        toggleDebugMode();
      }
    });

    window.addEventListener("scroll", updateHighlightPosition);
    window.addEventListener("resize", updateHighlightPosition);

    console.log("🐛 Pug调试工具已加载，点击右下角按钮开启调试模式");
  }

  // DOM加载完成后初始化
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDebugTool);
  } else {
    initDebugTool();
  }

  // 更新样式编辑器内容
  function updateStyleEditor(element) {
    const styleEditor = document.getElementById("pug-style-editor");
    if (!styleEditor || !currentStyleEditorElement) {
      return;
    }

    currentStyleEditorElement = element;
    const computedStyle = window.getComputedStyle(element);

    // 获取元素的实际样式值
    function getStyleValue(property, computedValue) {
      return StyleUtils.getStyleValue(element, property, computedValue);
    }

    // 更新各个输入框的值
    const inputUpdates = {
      "style-width": StyleUtils.formatValue(getStyleValue("width", computedStyle.width)),
      "style-height": StyleUtils.formatValue(getStyleValue("height", computedStyle.height)),
      "margin-top": StyleUtils.formatValue(getStyleValue("marginTop", computedStyle.marginTop)),
      "margin-right": StyleUtils.formatValue(getStyleValue("marginRight", computedStyle.marginRight)),
      "margin-bottom": StyleUtils.formatValue(getStyleValue("marginBottom", computedStyle.marginBottom)),
      "margin-left": StyleUtils.formatValue(getStyleValue("marginLeft", computedStyle.marginLeft)),
      "padding-top": StyleUtils.formatValue(getStyleValue("paddingTop", computedStyle.paddingTop)),
      "padding-right": StyleUtils.formatValue(getStyleValue("paddingRight", computedStyle.paddingRight)),
      "padding-bottom": StyleUtils.formatValue(getStyleValue("paddingBottom", computedStyle.paddingBottom)),
      "padding-left": StyleUtils.formatValue(getStyleValue("paddingLeft", computedStyle.paddingLeft)),
      "font-size": StyleUtils.formatValue(getStyleValue("fontSize", computedStyle.fontSize)),
      "line-height": StyleUtils.formatValue(getStyleValue("lineHeight", computedStyle.lineHeight)),
      "color-text": StyleUtils.formatValue(getStyleValue("color", computedStyle.color)),
      "bg-color-text": StyleUtils.formatValue(getStyleValue("backgroundColor", computedStyle.backgroundColor)),
    };

    // 更新输入框的值和占位符
    Object.keys(inputUpdates).forEach((id) => {
      const input = document.getElementById(id);
      if (input) {
        input.value = inputUpdates[id];
        // 根据ID获取对应的计算样式属性
        const property = id.includes('width') ? 'width' :
                        id.includes('height') ? 'height' :
                        id.includes('margin') ? id.replace('margin-', 'margin').replace(/-([a-z])/g, (g) => g[1].toUpperCase()) :
                        id.includes('padding') ? id.replace('padding-', 'padding').replace(/-([a-z])/g, (g) => g[1].toUpperCase()) :
                        id.includes('font-size') ? 'fontSize' :
                        id.includes('line-height') ? 'lineHeight' :
                        id.includes('color-text') ? 'color' :
                        id.includes('bg-color-text') ? 'backgroundColor' : null;
        
        if (property && computedStyle[property]) {
          input.placeholder = computedStyle[property];
        }
      }
    });

    // 更新颜色选择器
    const colorPicker = document.getElementById("color-picker");
    const bgColorPicker = document.getElementById("bg-color-picker");
    if (colorPicker) {
      colorPicker.value = StyleUtils.rgbToHex(getStyleValue("color", computedStyle.color));
    }
    if (bgColorPicker) {
      bgColorPicker.value = StyleUtils.rgbToHex(getStyleValue("backgroundColor", computedStyle.backgroundColor));
    }

    // 更新选择器
    updateSelectValue("font-weight", getStyleValue("fontWeight", computedStyle.fontWeight));
    updateSelectValue("text-align", getStyleValue("textAlign", computedStyle.textAlign));

    UIHelper.showToast(`样式编辑器已更新为新元素 <${element.tagName.toLowerCase()}>`, "info");
  }

  // 更新选择器的值
  function updateSelectValue(selectId, value) {
    const select = document.getElementById(selectId);
    if (select) {
      // 重置所有选项
      Array.from(select.options).forEach(option => option.selected = false);
      
      // 选择匹配的选项
      Array.from(select.options).forEach(option => {
        if (option.value === value ||
            (selectId === 'font-weight' && 
             ((value === "normal" && option.value === "400") ||
              (value === "bold" && option.value === "700") ||
              (value === "400" && option.value === "normal") ||
              (value === "700" && option.value === "bold")))) {
          option.selected = true;
        }
      });
    }
  }

  // 发送调试信息到服务端
  function sendDebugInfoToServer(debugData) {
    fetch("/api/pug-debug", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        url: window.location.href,
        ...debugData,
      }),
    }).catch((err) => {
      console.warn("发送调试信息失败:", err);
    });
  }

  // 发送文本编辑信息到服务端
  function sendTextEditToServer(editData) {
    fetch("/api/pug-debug/edit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        url: window.location.href,
        ...editData,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          UIHelper.showToast(data.message || "文件已成功更新", "success");
          console.log("文本编辑成功:", data);
        } else {
          UIHelper.showToast(data.message || "文件更新失败", "error");
          console.error("文本编辑失败:", data);
        }
      })
      .catch((err) => {
        UIHelper.showToast("发送编辑请求失败", "error");
        console.error("发送文本编辑失败:", err);
      });
  }

  // 监听窗口滚动和大小改变，更新高亮框位置
  function updateHighlightPosition() {
    if (
      currentHighlightedElement &&
      highlightOverlay &&
      highlightOverlay.style.display === "block"
    ) {
      const rect = currentHighlightedElement.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

      highlightOverlay.style.left = rect.left + scrollLeft + "px";
      highlightOverlay.style.top = rect.top + scrollTop + "px";
      highlightOverlay.style.width = rect.width + "px";
      highlightOverlay.style.height = rect.height + "px";
    }
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
  if (html.includes("</body>")) {
    return html.replace("</body>", `${debugScript}\n</body>`);
  }

  // 如果没有 </body> 标签，尝试在 </html> 标签前插入
  if (html.includes("</html>")) {
    return html.replace("</html>", `${debugScript}\n</html>`);
  }

  // 如果都没有，直接在末尾添加
  return html + debugScript;
}
