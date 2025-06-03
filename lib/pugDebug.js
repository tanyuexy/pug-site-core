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
      
      // 绑定事件处理函数，避免内存泄漏
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
    
    // 添加销毁方法，用于清理资源
    destroy() {
      this.handle.removeEventListener('mousedown', this.boundMouseDown);
      document.removeEventListener('mousemove', this.boundMouseMove);
      document.removeEventListener('mouseup', this.boundMouseUp);
    }
  }

  /**
   * 样式工具类
   */
  class StyleUtils {
    // 默认样式值缓存
    static defaultStyleCache = new Map();
    
    /**
     * 获取元素默认样式值（带缓存）
     */
    static getDefaultStyleValue(tagName, property) {
      const cacheKey = `${tagName}-${property}`;
      if (this.defaultStyleCache.has(cacheKey)) {
        return this.defaultStyleCache.get(cacheKey);
      }
      
      try {
        const testElement = document.createElement(tagName);
        testElement.style.visibility = 'hidden';
        testElement.style.position = 'absolute';
        testElement.style.top = '-9999px';
        document.body.appendChild(testElement);
        
        const defaultComputedStyle = window.getComputedStyle(testElement);
        const defaultValue = defaultComputedStyle[property];
        
        document.body.removeChild(testElement);
        
        // 缓存结果
        this.defaultStyleCache.set(cacheKey, defaultValue);
        return defaultValue;
      } catch (e) {
        console.warn('获取默认样式值失败:', e);
        return null;
      }
    }

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
     * 格式化样式值
     */
    static formatValue(value) {
      if (!value || value === '0px') return '';
      // 保留auto等有意义的值
      if (value === 'auto' || value === 'inherit' || value === 'initial' || value === 'unset') {
        return value;
      }
      return value;
    }

    /**
     * 格式化背景颜色值 - 专门处理背景颜色的显示
     */
    static formatBackgroundColor(value) {
      if (!value || value === 'transparent' || value === 'rgba(0, 0, 0, 0)' || value === 'initial' || value === 'inherit') {
        return ''; // 返回空字符串，在输入框中显示为空
      }
      return value;
    }

    /**
     * 获取背景颜色的显示文本
     */
    static getBackgroundColorDisplayText(value) {
      if (!value || value === 'transparent' || value === 'rgba(0, 0, 0, 0)' || value === 'initial' || value === 'inherit') {
        return '无'; // 在界面上显示"无"
      }
      return value;
    }

    /**
     * 检查是否有有效的背景颜色
     */
    static hasValidBackgroundColor(value) {
      return value && value !== 'transparent' && value !== 'rgba(0, 0, 0, 0)' && value !== 'initial' && value !== 'inherit';
    }

    /**
     * RGB转十六进制 - 优化背景颜色处理
     */
    static rgbToHex(rgb) {
      // 如果没有有效的背景颜色，返回白色作为默认值供颜色选择器使用
      if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)' || rgb === 'initial' || rgb === 'inherit') {
        return '#ffffff';
      }
      if (rgb.startsWith('#')) return rgb;
      
      const result = rgb.match(/\d+/g);
      if (result && result.length >= 3) {
        const r = parseInt(result[0]);
        const g = parseInt(result[1]);
        const b = parseInt(result[2]);
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
      }
      return '#ffffff'; // 默认白色
    }

    /**
     * 获取样式值（优先内联样式）
     */
    static getStyleValue(element, property, computedValue) {
      const inlineValue = element.style[property];
      return inlineValue || computedValue || '';
    }

    /**
     * 获取显式设置的尺寸值（用于样式编辑器显示）
     * 如果元素明确设置为auto，则返回"auto"而不是计算值
     */
    static getExplicitSizeValue(element, property, computedValue) {
      // 1. 首先检查内联样式
      const inlineValue = element.style[property];
      if (inlineValue) {
        return inlineValue; // 直接返回内联样式值，包括"auto"
      }

      // 2. 使用浏览器API检查元素的样式规则
      // 创建一个临时元素来对比，看看是否有显式设置
      const tagName = element.tagName.toLowerCase();
      
      // 对于特殊元素类型，直接返回计算值
      const mediaElements = ['img', 'video', 'audio', 'canvas', 'svg', 'iframe', 'embed', 'object'];
      const inputElements = ['input', 'button', 'textarea', 'select'];
      
      if (mediaElements.includes(tagName) || inputElements.includes(tagName)) {
        return computedValue || '';
      }

      // 3. 检查getComputedStyle的各个来源
      // 使用getComputedStyle获取样式，然后检查是否有显式设置
      try {
        // 遍历所有样式表，查找匹配的规则
        const sheets = Array.from(document.styleSheets);
        let foundExplicitValue = null;
        
        for (let sheet of sheets) {
          try {
            const rules = Array.from(sheet.cssRules || sheet.rules || []);
            for (let rule of rules) {
              if (rule.style && rule.selectorText) {
                // 检查元素是否匹配这个CSS规则
                try {
                  if (element.matches && element.matches(rule.selectorText)) {
                    const ruleValue = rule.style[property];
                    if (ruleValue) {
                      foundExplicitValue = ruleValue;
                      // 不立即返回，继续查找可能的更具体的规则
                    }
                  }
                } catch (selectorError) {
                  // 无效的选择器语法，跳过
                  continue;
                }
              }
            }
          } catch (e) {
            // 跨域样式表或其他错误，跳过
            continue;
          }
        }
        
        if (foundExplicitValue) {
          return foundExplicitValue;
        }
      } catch (e) {
        console.warn('CSS规则检测失败:', e);
      }

      // 4. 如果没有找到显式设置，但计算值不是默认值，可能通过其他方式设置
      // 检查计算值是否明显是被设置的
      const computedStyle = window.getComputedStyle(element);
      const actualComputedValue = computedStyle[property];
      
      if (actualComputedValue && actualComputedValue !== 'auto') {
        // 使用缓存的方法获取默认值
        const defaultValue = this.getDefaultStyleValue(tagName, property);
        
        if (defaultValue !== null && actualComputedValue !== defaultValue) {
          return actualComputedValue;
        }
      }

      // 5. 如果都没有找到，返回空字符串表示未设置
      return '';
    }

    /**
     * 检查元素是否明确设置了某个尺寸属性（通过内联样式或CSS类）
     */
    static hasExplicitSizeProperty(element, property) {
      // 只检查宽度和高度属性
      if (property !== 'width' && property !== 'height') {
        return true; // 其他属性默认允许编辑
      }

      // 1. 检查内联样式（包括auto）
      if (element.style[property]) {
        return true; // 无论是什么值，只要设置了就允许编辑
      }

      // 2. 特殊元素类型处理
      const tagName = element.tagName.toLowerCase();
      const mediaElements = ['img', 'video', 'audio', 'canvas', 'svg', 'iframe', 'embed', 'object'];
      const inputElements = ['input', 'button', 'textarea', 'select'];
      
      // 媒体元素和表单元素通常有默认尺寸，允许修改
      if (mediaElements.includes(tagName) || inputElements.includes(tagName)) {
        return true;
      }
      
      // 3. 检查CSS规则是否设置了该属性
      try {
        const sheets = Array.from(document.styleSheets);
        for (let sheet of sheets) {
          try {
            const rules = Array.from(sheet.cssRules || sheet.rules || []);
            for (let rule of rules) {
              if (rule.style && rule.selectorText) {
                // 检查元素是否匹配这个CSS规则
                if (element.matches && element.matches(rule.selectorText)) {
                  const ruleValue = rule.style[property];
                  if (ruleValue) { // 任何值都算是显式设置，包括auto
                    return true;
                  }
                }
              }
            }
          } catch (e) {
            // 跨域样式表或其他错误，跳过
            continue;
          }
        }
      } catch (e) {
        console.warn('CSS规则检测失败:', e);
      }
      
      // 4. 最后检查计算值是否与默认值不同
      const computedStyle = window.getComputedStyle(element);
      const computedValue = computedStyle[property];
      
      if (computedValue && computedValue !== 'auto') {
        // 使用缓存的方法获取默认值
        const defaultValue = this.getDefaultStyleValue(tagName, property);
        
        if (defaultValue !== null && computedValue !== defaultValue) {
          return true;
        }
      }
      
      return false;
    }

    /**
     * 获取尺寸属性的状态文本
     */
    static getSizePropertyStatus(element, property) {
      if (this.hasExplicitSizeProperty(element, property)) {
        return '可编辑';
      } else {
        return '未设置';
      }
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
    // 元素类型分类系统
    const tagName = element.tagName.toLowerCase();
    
    // 定义元素类型和对应的样式组
    const elementTypes = {
      // 媒体元素 - 不支持文字样式
      media: ['img', 'video', 'audio', 'canvas', 'svg', 'iframe', 'embed', 'object'],
      // 表单元素 - 部分文字样式
      form: ['input', 'button', 'textarea', 'select', 'option', 'label'],
      // 表格元素
      table: ['table', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot'],
      // 列表元素
      list: ['ul', 'ol', 'li'],
      // 文本元素 - 支持所有文字样式
      text: ['p', 'span', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'b', 'i', 'u', 'small', 'mark', 'del', 'ins', 'sub', 'sup'],
      // 容器元素 - 根据内容决定
      container: ['div', 'section', 'article', 'aside', 'nav', 'header', 'footer', 'main']
    };

    // 判断元素类型
    function getElementType(tag) {
      for (const [type, tags] of Object.entries(elementTypes)) {
        if (tags.includes(tag)) return type;
      }
      return 'container'; // 默认为容器类型
    }

    // 检查元素是否支持文字样式
    function supportsTextStyles(tag) {
      const type = getElementType(tag);
      // 媒体元素不支持文字样式
      if (type === 'media') return false;
      // 表单元素中的input根据type决定
      if (tag === 'input') {
        const inputType = element.type?.toLowerCase() || 'text';
        // 这些input类型不支持文字样式
        const noTextTypes = ['checkbox', 'radio', 'range', 'file', 'color', 'date', 'datetime-local', 'month', 'time', 'week'];
        return !noTextTypes.includes(inputType);
      }
      return true;
    }

    // 检查元素是否支持内边距（某些元素默认不支持）
    function supportsPadding(tag) {
      const type = getElementType(tag);
      // img等替换元素通常不建议使用padding
      const noPaddingTags = ['img', 'br', 'hr'];
      return !noPaddingTags.includes(tag);
    }

    // 检查元素是否为自闭合标签或不包含文本内容的元素
    function isVoidElement(tag) {
      const voidElements = ['img', 'br', 'hr', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr'];
      return voidElements.includes(tag);
    }

    const elementType = getElementType(tagName);
    const hasTextSupport = supportsTextStyles(tagName);
    const hasPaddingSupport = supportsPadding(tagName);
    const isVoid = isVoidElement(tagName);

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

    // 创建尺寸输入框的辅助函数（支持禁用状态）
    function createSizeInputHTML(id, label, value, placeholder, element, property) {
      const hasExplicitSize = StyleUtils.hasExplicitSizeProperty(element, property);
      const status = StyleUtils.getSizePropertyStatus(element, property);
      const isDisabled = !hasExplicitSize;
      
      // 使用新的方法获取显式设置的值（保留auto等特殊值）
      const explicitValue = StyleUtils.getExplicitSizeValue(element, property, value);
      const displayValue = hasExplicitSize ? StyleUtils.formatValue(explicitValue) : '';
      
      return `
        <div style="position: relative;">
          <label style="${DEBUG_STYLES.label}">${label}:</label>
          <div style="display: flex; align-items: center; gap: 4px;">
            <input type="text" id="${id}" 
              value="${displayValue}" 
              placeholder="${hasExplicitSize ? (explicitValue || placeholder) : '元素未设置此属性'}"
              autocomplete="off" spellcheck="false"
              ${isDisabled ? 'disabled' : ''}
              style="${DEBUG_STYLES.input}${isDisabled ? '; opacity: 0.5; cursor: not-allowed;' : ''}" />
            <span style="
              color: ${hasExplicitSize ? '#4CAF50' : '#FFA500'}; 
              font-size: 9px; 
              min-width: 36px; 
              text-align: center;
              background: ${hasExplicitSize ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255, 165, 0, 0.1)'};
              border-radius: 3px;
              padding: 2px 3px;
            ">${status}</span>
          </div>
          ${isDisabled ? `<div style="color: #888; font-size: 9px; margin-top: 2px;">💡 在CSS中设置${label.toLowerCase()}后可编辑</div>` : ''}
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

    // 基础样式部分
    let content = `
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
      
      <!-- 元素信息 -->
      <div style="margin-bottom: 12px; padding: 8px; background: rgba(76, 175, 80, 0.1); border-radius: 4px;">
        <div style="color: #4CAF50; font-size: 11px; margin-bottom: 4px;">
          📋 元素信息: &lt;${tagName}&gt; (${elementType === 'media' ? '媒体元素' : 
                                                    elementType === 'form' ? '表单元素' : 
                                                    elementType === 'text' ? '文本元素' : 
                                                    elementType === 'table' ? '表格元素' : 
                                                    elementType === 'list' ? '列表元素' : '容器元素'})
        </div>
        ${!hasTextSupport ? '<div style="color: #FFA500; font-size: 10px;">⚠️ 此元素类型不支持文字样式</div>' : ''}
        ${isVoid ? '<div style="color: #87CEEB; font-size: 10px;">ℹ️ 自闭合标签，无文本内容</div>' : ''}
      </div>

      <!-- 尺寸样式 -->
      <div style="margin-bottom: 12px;">
        <h4 style="color: #4CAF50; margin: 0 0 6px 0; font-size: 13px;">📐 尺寸</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          ${createSizeInputHTML('style-width', '宽度', getStyleValue('width', computedStyle.width), computedStyle.width, element, 'width')}
          ${createSizeInputHTML('style-height', '高度', getStyleValue('height', computedStyle.height), computedStyle.height, element, 'height')}
        </div>
      </div>

      <!-- 外边距样式 -->
      <div style="margin-bottom: 12px;">
        <h4 style="color: #4CAF50; margin: 0 0 6px 0; font-size: 13px;">📏 外边距</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 6px;">
          ${createInputHTML('margin-top', '上', getStyleValue('marginTop', computedStyle.marginTop), computedStyle.marginTop)}
          ${createInputHTML('margin-right', '右', getStyleValue('marginRight', computedStyle.marginRight), computedStyle.marginRight)}
          ${createInputHTML('margin-bottom', '下', getStyleValue('marginBottom', computedStyle.marginBottom), computedStyle.marginBottom)}
          ${createInputHTML('margin-left', '左', getStyleValue('marginLeft', computedStyle.marginLeft), computedStyle.marginLeft)}
        </div>
      </div>`;

    // 内边距样式 - 根据元素类型决定是否显示
    if (hasPaddingSupport) {
      content += `
      <div style="margin-bottom: 12px;">
        <h4 style="color: #4CAF50; margin: 0 0 6px 0; font-size: 13px;">📦 内边距</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 6px;">
          ${createInputHTML('padding-top', '上', getStyleValue('paddingTop', computedStyle.paddingTop), computedStyle.paddingTop)}
          ${createInputHTML('padding-right', '右', getStyleValue('paddingRight', computedStyle.paddingRight), computedStyle.paddingRight)}
          ${createInputHTML('padding-bottom', '下', getStyleValue('paddingBottom', computedStyle.paddingBottom), computedStyle.paddingBottom)}
          ${createInputHTML('padding-left', '左', getStyleValue('paddingLeft', computedStyle.paddingLeft), computedStyle.paddingLeft)}
        </div>
      </div>`;
    }

    // 字体样式 - 只有支持文字样式的元素才显示
    if (hasTextSupport) {
      content += `
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
      </div>`;
    }

    // 颜色样式 - 所有元素都支持背景色，但文字颜色只对支持文字的元素显示
    content += `
      <div style="margin-bottom: 15px;">
        <h4 style="color: #4CAF50; margin: 0 0 6px 0; font-size: 13px;">🎨 颜色</h4>
        <div style="display: grid; grid-template-columns: ${hasTextSupport ? '1fr 1fr' : '1fr'}; gap: 10px;">`;
    
    if (hasTextSupport) {
      content += `
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
          </div>`;
    }
    
    content += `
          <div>
            <label style="${DEBUG_STYLES.label}">背景颜色:</label>
            <div style="display: flex; gap: 6px; align-items: center;">
              <input type="color" id="bg-color-picker" value="${StyleUtils.rgbToHex(getStyleValue('backgroundColor', computedStyle.backgroundColor))}" 
                style="width: 32px; height: 28px; border: none; background: none; cursor: pointer; padding: 0;" />
              <input type="text" id="bg-color-text" 
                value="${StyleUtils.formatBackgroundColor(getStyleValue('backgroundColor', computedStyle.backgroundColor))}" 
                placeholder="输入颜色值 (如: #ff0000, red)"
                autocomplete="off" spellcheck="false"
                style="flex: 1; ${DEBUG_STYLES.input}" />
              <span id="bg-color-status" style="
                color: #87CEEB; 
                font-size: 10px; 
                min-width: 24px; 
                text-align: center;
                background: rgba(135, 206, 235, 0.1);
                border-radius: 3px;
                padding: 2px 4px;
              ">${StyleUtils.getBackgroundColorDisplayText(getStyleValue('backgroundColor', computedStyle.backgroundColor))}</span>
            </div>
          </div>
        </div>
      </div>

      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button id="apply-styles" class="pug-debug-element" style="${DEBUG_STYLES.button.base}${DEBUG_STYLES.button.primary}">保存到文件</button>
        <button id="reset-styles" class="pug-debug-element" style="${DEBUG_STYLES.button.base}background: #FF5722; color: white;">重置样式</button>
        <button id="cancel-styles" class="pug-debug-element" style="${DEBUG_STYLES.button.base}${DEBUG_STYLES.button.neutral}">取消</button>
      </div>
    `;

    return content;
  }

  /**
   * 样式编辑跟踪器
   */
  class StyleEditTracker {
    constructor() {
      this.originalValues = new Map(); // 存储原始值
      this.editedProperties = new Set(); // 跟踪被编辑的属性
      this.isInitialized = false;
    }

    /**
     * 初始化跟踪器，记录所有输入框的初始值
     */
    initialize(element, allStyleInputs) {
      this.originalValues.clear();
      this.editedProperties.clear();
      
      Object.keys(allStyleInputs).forEach((property) => {
        const elementId = allStyleInputs[property];
        const inputElement = document.getElementById(elementId);
        if (inputElement && !inputElement.disabled) {
          this.originalValues.set(property, inputElement.value.trim());
        }
      });
      
      this.isInitialized = true;
      console.log('🎨 样式跟踪器已初始化，原始值:', Object.fromEntries(this.originalValues));
    }

    /**
     * 标记属性为已编辑
     */
    markAsEdited(property) {
      if (this.isInitialized) {
        this.editedProperties.add(property);
        console.log('🎨 标记属性为已编辑:', property, '当前已编辑属性:', Array.from(this.editedProperties));
      }
    }

    /**
     * 检查属性是否被编辑
     */
    isEdited(property) {
      return this.editedProperties.has(property);
    }

    /**
     * 获取属性的原始值
     */
    getOriginalValue(property) {
      return this.originalValues.get(property) || '';
    }

    /**
     * 检查值是否真正发生了变化
     */
    hasValueChanged(property, currentValue) {
      const originalValue = this.getOriginalValue(property);
      const trimmedCurrentValue = (currentValue || '').trim();
      const trimmedOriginalValue = (originalValue || '').trim();
      
      // 标准化比较：去除空格，处理空字符串
      const normalizedCurrent = trimmedCurrentValue === '' ? '' : trimmedCurrentValue;
      const normalizedOriginal = trimmedOriginalValue === '' ? '' : trimmedOriginalValue;
      
      return normalizedCurrent !== normalizedOriginal;
    }

    /**
     * 获取所有被编辑且值发生变化的属性
     */
    getEditedStyles(allStyleInputs) {
      const editedStyles = {};
      
      this.editedProperties.forEach((property) => {
        const elementId = allStyleInputs[property];
        const inputElement = document.getElementById(elementId);
        
        if (inputElement && !inputElement.disabled) {
          const currentValue = inputElement.value.trim();
          
          // 只有当值真正发生变化时才包含在结果中
          if (this.hasValueChanged(property, currentValue)) {
            editedStyles[property] = currentValue;
          }
        }
      });
      
      console.log('🎨 获取编辑后的样式:', editedStyles);
      return editedStyles;
    }

    /**
     * 重置跟踪器
     */
    reset() {
      this.originalValues.clear();
      this.editedProperties.clear();
      this.isInitialized = false;
    }
  }

  // 创建全局样式跟踪器实例
  const styleEditTracker = new StyleEditTracker();

  // 设置样式编辑器事件
  function setupStyleEditorEvents(element, styleEditor) {
    // 定义所有可能的样式输入元素映射
    const allStyleInputs = {
      width: "style-width",
      height: "style-height",
      marginTop: "margin-top",
      marginRight: "margin-right",
      marginBottom: "margin-bottom",
      marginLeft: "margin-left",
      paddingTop: "padding-top",
      paddingRight: "padding-right",
      paddingBottom: "padding-bottom",
      paddingLeft: "padding-left",
      fontSize: "font-size",
      lineHeight: "line-height",
      fontWeight: "font-weight",
      textAlign: "text-align",
      color: "color-text",
      backgroundColor: "bg-color-text",
    };

    // 初始化样式跟踪器
    styleEditTracker.initialize(element, allStyleInputs);

    // 获取所有存在的像素相关输入框
    const allPixelInputIds = [
      "style-width", "style-height", "margin-top", "margin-right", 
      "margin-bottom", "margin-left", "padding-top", "padding-right", 
      "padding-bottom", "padding-left", "font-size"
    ];

    // 只为实际存在的输入框添加事件
    const existingPixelInputIds = allPixelInputIds.filter(id => document.getElementById(id));

    // 实时预览函数
    function applyStyleRealtime(property, value, inputElement) {
      try {
        if (inputElement.disabled) return; // 禁用的输入框不应用样式
        
        const trimmedValue = (value || '').trim();
        
        if (trimmedValue) {
          // 处理值并添加单位
          const processedValue = StyleUtils.addUnitIfNeeded(trimmedValue, property);
          element.style[property] = processedValue;
          
          // 如果值被自动添加了单位，更新输入框显示（在失焦时处理）
          if (processedValue !== trimmedValue && processedValue.endsWith("px")) {
            // 不立即更新输入框，避免干扰用户输入
          }
        } else {
          // 清空样式
          element.style[property] = "";
        }
        
        // 特殊处理背景颜色状态显示
        if (property === 'backgroundColor') {
          const bgColorStatus = document.getElementById("bg-color-status");
          if (bgColorStatus) {
            bgColorStatus.textContent = StyleUtils.getBackgroundColorDisplayText(trimmedValue);
          }
        }
      } catch (error) {
        console.warn('实时样式应用失败:', property, value, error);
      }
    }

    // 为像素相关输入框添加实时预览和编辑跟踪
    existingPixelInputIds.forEach((inputId) => {
      const input = document.getElementById(inputId);
      if (input) {
        // 添加实时预览功能
        input.addEventListener("input", function () {
          const property = getPropertyFromInputId(inputId);
          styleEditTracker.markAsEdited(property);
          
          // 实时应用样式
          applyStyleRealtime(property, this.value, this);
        });

        // 失焦时处理单位添加和输入框值更新
        input.addEventListener("blur", function () {
          const value = this.value.trim();
          if (value) {
            const property = getPropertyFromInputId(inputId);
            const processedValue = StyleUtils.addUnitIfNeeded(value, property);
            
            // 更新输入框显示处理后的值
            if (processedValue !== value) {
              this.value = processedValue;
            }
            
            // 确保样式已正确应用
            element.style[property] = processedValue;
          }
        });
      }
    });

    // 为其他输入框添加实时预览和编辑跟踪
    ['line-height', 'font-weight', 'text-align', 'color-text', 'bg-color-text'].forEach(inputId => {
      const input = document.getElementById(inputId);
      if (input) {
        input.addEventListener("input", function () {
          const property = getPropertyFromInputId(inputId);
          styleEditTracker.markAsEdited(property);
          
          // 实时应用样式
          applyStyleRealtime(property, this.value, this);
        });
        
        // 为select元素添加change事件（针对font-weight和text-align）
        if (input.tagName.toLowerCase() === 'select') {
          input.addEventListener("change", function () {
            const property = getPropertyFromInputId(inputId);
            styleEditTracker.markAsEdited(property);
            
            // 实时应用样式
            applyStyleRealtime(property, this.value, this);
          });
        }
      }
    });

    // 设置颜色选择器同步事件（带编辑跟踪和实时预览）
    setupColorSyncEventsWithRealtimePreview(element);

    // 应用样式 - 发送到服务器保存
    const applyBtn = document.getElementById("apply-styles");
    if (applyBtn) {
      applyBtn.addEventListener("click", () => {
        saveEditedStylesToServer(currentStyleEditorElement || element, allStyleInputs);
      });
    }

    // 重置样式
    const resetBtn = document.getElementById("reset-styles");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        const targetElement = currentStyleEditorElement || element;
        targetElement.style.cssText = "";
        UIHelper.showToast("元素样式已重置", "info");
        updateStyleEditor(targetElement);
      });
    }

    // 取消
    const cancelBtn = document.getElementById("cancel-styles");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        // 恢复原始样式（如果需要的话）
        currentStyleEditorElement = null;
        styleEditTracker.reset();
        styleEditor.remove();
      });
    }

    // ESC键关闭
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        currentStyleEditorElement = null;
        styleEditTracker.reset();
        styleEditor.remove();
        document.removeEventListener("keydown", handleEscape);
      }
    };
    document.addEventListener("keydown", handleEscape);
  }

  /**
   * 从输入框ID获取对应的CSS属性名
   */
  function getPropertyFromInputId(inputId) {
    const mapping = {
      "style-width": "width",
      "style-height": "height",
      "margin-top": "marginTop",
      "margin-right": "marginRight",
      "margin-bottom": "marginBottom",
      "margin-left": "marginLeft",
      "padding-top": "paddingTop",
      "padding-right": "paddingRight",
      "padding-bottom": "paddingBottom",
      "padding-left": "paddingLeft",
      "font-size": "fontSize",
      "line-height": "lineHeight",
      "font-weight": "fontWeight",
      "text-align": "textAlign",
      "color-text": "color",
      "bg-color-text": "backgroundColor"
    };
    
    return mapping[inputId] || inputId.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
  }

  // 设置颜色选择器同步事件（带编辑跟踪和实时预览）
  function setupColorSyncEventsWithRealtimePreview(element) {
    const colorPicker = document.getElementById("color-picker");
    const colorText = document.getElementById("color-text");
    const bgColorPicker = document.getElementById("bg-color-picker");
    const bgColorText = document.getElementById("bg-color-text");
    const bgColorStatus = document.getElementById("bg-color-status");

    // 更新背景颜色状态显示
    function updateBackgroundColorStatus(value) {
      if (bgColorStatus) {
        bgColorStatus.textContent = StyleUtils.getBackgroundColorDisplayText(value);
      }
    }

    // 实时应用颜色样式
    function applyColorRealtime(property, value) {
      try {
        const trimmedValue = (value || '').trim();
        if (trimmedValue) {
          element.style[property] = trimmedValue;
        } else {
          element.style[property] = "";
        }
      } catch (error) {
        console.warn('实时颜色应用失败:', property, value, error);
      }
    }

    // 文字颜色选择器 - 只有支持文字样式的元素才会有这些元素
    if (colorPicker && colorText) {
      colorPicker.addEventListener("input", (e) => {
        const colorValue = e.target.value;
        colorText.value = colorValue;
        styleEditTracker.markAsEdited("color");
        
        // 实时应用文字颜色
        applyColorRealtime("color", colorValue);
      });

      colorText.addEventListener("input", (e) => {
        const inputValue = e.target.value.trim();
        try {
          const hexValue = StyleUtils.rgbToHex(inputValue);
          if (hexValue !== "#ffffff" || inputValue.includes("#")) {
            colorPicker.value = hexValue;
          }
        } catch (err) {
          console.warn("颜色转换错误:", err);
        }
        styleEditTracker.markAsEdited("color");
        
        // 实时应用文字颜色
        applyColorRealtime("color", inputValue);
      });
    }

    // 背景颜色选择器 - 所有元素都有
    if (bgColorPicker && bgColorText) {
      bgColorPicker.addEventListener("input", (e) => {
        const colorValue = e.target.value;
        bgColorText.value = colorValue;
        updateBackgroundColorStatus(colorValue);
        styleEditTracker.markAsEdited("backgroundColor");
        
        // 实时应用背景颜色
        applyColorRealtime("backgroundColor", colorValue);
      });

      bgColorText.addEventListener("input", (e) => {
        const inputValue = e.target.value.trim();
        try {
          if (inputValue) {
            const hexValue = StyleUtils.rgbToHex(inputValue);
            if (hexValue !== "#ffffff" || inputValue.includes("#")) {
              bgColorPicker.value = hexValue;
            }
            updateBackgroundColorStatus(inputValue);
          } else {
            // 如果输入为空，显示"无"
            updateBackgroundColorStatus('');
          }
        } catch (err) {
          console.warn("背景颜色转换错误:", err);
          updateBackgroundColorStatus(inputValue);
        }
        styleEditTracker.markAsEdited("backgroundColor");
        
        // 实时应用背景颜色
        applyColorRealtime("backgroundColor", inputValue);
      });

      // 监听失焦事件，处理清空输入的情况
      bgColorText.addEventListener("blur", (e) => {
        const inputValue = e.target.value.trim();
        updateBackgroundColorStatus(inputValue);
        
        // 确保样式已正确应用
        applyColorRealtime("backgroundColor", inputValue);
      });
    }
  }

  // 保存编辑过的样式到服务器（原来的applyEditedStylesToElement函数重命名）
  function saveEditedStylesToServer(element, allStyleInputs) {
    // 获取只有用户编辑过的样式
    const editedStyles = styleEditTracker.getEditedStyles(allStyleInputs);
    
    // 如果没有编辑过的样式，显示提示并返回
    if (Object.keys(editedStyles).length === 0) {
      UIHelper.showToast("没有检测到样式修改", "info");
      return;
    }

    const debugFile = element.getAttribute("data-debug-file");
    const debugLine = element.getAttribute("data-debug-line");
    const appliedStyles = {};

    // 只处理被编辑过的样式，收集当前应用的样式值
    Object.keys(editedStyles).forEach((property) => {
      const elementId = allStyleInputs[property];
      const input = document.getElementById(elementId);
      
      if (input && !input.disabled) {
        const value = input.value.trim();
        
        if (value) {
          const processedValue = StyleUtils.addUnitIfNeeded(value, property);
          appliedStyles[property] = processedValue;
          
          // 更新输入框显示（如果需要）
          if (processedValue !== value && processedValue.endsWith("px")) {
            input.value = processedValue;
          }
        } else {
          // 记录清除操作
          appliedStyles[property] = "";
        }
      }
    });

    // 发送样式修改信息到服务端
    if (Object.keys(appliedStyles).length > 0) {
      // 创建详细的编辑信息
      const editInfo = {
        totalEditedProperties: styleEditTracker.editedProperties.size,
        appliedProperties: Object.keys(appliedStyles),
        editedProperties: Array.from(styleEditTracker.editedProperties)
      };

      sendStyleEditToServer({
        file: debugFile,
        line: debugLine,
        element: {
          tag: element.tagName.toLowerCase(),
          id: element.id,
          className: element.className,
        },
        styles: appliedStyles,
        editInfo: editInfo // 添加编辑统计信息
      });
      
      // 显示详细的保存结果
      const appliedCount = Object.keys(appliedStyles).length;
      UIHelper.showToast(`已保存 ${appliedCount} 个样式修改到文件`, "success");
    } else {
      UIHelper.showToast("没有有效的样式修改需要保存", "info");
    }
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

    // 重新为新元素生成完整的样式编辑器
    currentStyleEditorElement = element;
    const computedStyle = window.getComputedStyle(element);

    // 获取元素的实际样式值
    function getStyleValue(property, computedValue) {
      return StyleUtils.getStyleValue(element, property, computedValue);
    }

    // 重新生成内容
    const contentDiv = document.getElementById("pug-style-editor-content");
    if (contentDiv) {
      const newContent = createStyleEditorContent(element, computedStyle, getStyleValue);
      contentDiv.innerHTML = newContent;
      
      // 重新设置事件监听器
      setupStyleEditorEvents(element, styleEditor);
      
      UIHelper.showToast(`样式编辑器已更新为新元素 <${element.tagName.toLowerCase()}>`, "info");
    }
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

  // 发送样式编辑信息到服务端
  function sendStyleEditToServer(styleData) {
    fetch("/api/pug-debug/style", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        url: window.location.href,
        ...styleData,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          console.log("样式修改成功:", data);
          // 可以选择显示成功提示，但为了避免过多提示，这里只记录日志
        } else {
          console.error("样式修改失败:", data);
          UIHelper.showToast(data.message || "样式修改处理失败", "error");
        }
      })
      .catch((err) => {
        console.error("发送样式修改失败:", err);
        UIHelper.showToast("发送样式修改请求失败", "error");
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
