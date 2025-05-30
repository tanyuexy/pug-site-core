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
  let currentStyleEditorElement = null; // 当前正在编辑样式的元素

  // 创建调试信息显示面板
  function createDebugOverlay() {
    console.log("🐛 createDebugOverlay 被调用，已存在的 debugOverlay:", !!debugOverlay);
    if (debugOverlay) return;

    debugOverlay = document.createElement("div");
    debugOverlay.id = "pug-debug-overlay";
    debugOverlay.className = "pug-debug-element";
    debugOverlay.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 0;
      border-radius: 8px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      z-index: 10000;
      min-width: 300px;
      max-width: 500px;
      max-height: 95vh;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      display: none;
      user-select: none;
    `;

    debugOverlay.innerHTML = `
      <div id="debug-header" class="pug-debug-element" style="
        display: flex; 
        justify-content: space-between; 
        align-items: center; 
        padding: 10px 15px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 8px 8px 0 0;
        cursor: move;
        border-bottom: 1px solid rgba(255, 255, 255, 0.2);
      ">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-weight: bold; color: #4CAF50;">🐛 Pug Debug Info</span>
          <span style="color: #888; font-size: 10px;">拖拽移动</span>
        </div>
        <div style="display: flex; align-items: center; gap: 5px;">
          <button id="collapse-debug" class="pug-debug-element" style="
            background: none; 
            border: none; 
            color: #FFD700; 
            font-size: 14px; 
            cursor: pointer; 
            padding: 2px 6px;
            border-radius: 3px;
            transition: background-color 0.2s;
          " title="折叠/展开">−</button>
          <button id="close-debug" class="pug-debug-element" style="
            background: none; 
            border: none; 
            color: #ff6b6b; 
            font-size: 16px; 
            cursor: pointer;
            padding: 2px 6px;
            border-radius: 3px;
            transition: background-color 0.2s;
          " title="关闭">&times;</button>
        </div>
      </div>
      <div id="debug-content" class="pug-debug-element" style="padding: 15px; overflow-y: auto; max-height: calc(95vh - 50px);"></div>
    `;

    document.body.appendChild(debugOverlay);

    // 绑定事件
    setupDebugOverlayEvents();
  }

  // 设置调试面板事件
  function setupDebugOverlayEvents() {
    const overlay = document.getElementById("pug-debug-overlay");
    const header = document.getElementById("debug-header");
    const collapseBtn = document.getElementById("collapse-debug");
    const closeBtn = document.getElementById("close-debug");
    const content = document.getElementById("debug-content");

    let isCollapsed = false;
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };

    // 关闭按钮事件
    closeBtn.addEventListener("click", hideDebugInfo);

    // 折叠按钮事件
    collapseBtn.addEventListener("click", function () {
      isCollapsed = !isCollapsed;
      if (isCollapsed) {
        content.style.display = "none";
        collapseBtn.textContent = "+";
        collapseBtn.title = "展开";
        overlay.style.minWidth = "auto";
      } else {
        content.style.display = "block";
        collapseBtn.textContent = "−";
        collapseBtn.title = "折叠";
        overlay.style.minWidth = "300px";
      }
    });

    // 拖拽功能
    header.addEventListener("mousedown", function (e) {
      isDragging = true;
      const rect = overlay.getBoundingClientRect();
      dragOffset.x = e.clientX - rect.left;
      dragOffset.y = e.clientY - rect.top;

      header.style.cursor = "grabbing";
      document.addEventListener("mousemove", handleDrag);
      document.addEventListener("mouseup", handleDragEnd);
      e.preventDefault();
    });

    function handleDrag(e) {
      if (!isDragging) return;

      const x = e.clientX - dragOffset.x;
      const y = e.clientY - dragOffset.y;

      // 限制在视窗内
      const maxX = window.innerWidth - overlay.offsetWidth;
      const maxY = window.innerHeight - overlay.offsetHeight;

      const constrainedX = Math.max(0, Math.min(x, maxX));
      const constrainedY = Math.max(0, Math.min(y, maxY));

      overlay.style.left = constrainedX + "px";
      overlay.style.top = constrainedY + "px";
      overlay.style.right = "auto";
      overlay.style.bottom = "auto";
    }

    function handleDragEnd() {
      isDragging = false;
      header.style.cursor = "move";
      document.removeEventListener("mousemove", handleDrag);
      document.removeEventListener("mouseup", handleDragEnd);
    }

    // 按钮悬停效果
    collapseBtn.addEventListener("mouseenter", function () {
      this.style.backgroundColor = "rgba(255, 215, 0, 0.2)";
    });
    collapseBtn.addEventListener("mouseleave", function () {
      this.style.backgroundColor = "transparent";
    });

    closeBtn.addEventListener("mouseenter", function () {
      this.style.backgroundColor = "rgba(255, 107, 107, 0.2)";
    });
    closeBtn.addEventListener("mouseleave", function () {
      this.style.backgroundColor = "transparent";
    });
  }

  // 创建调试模式切换按钮
  function createDebugToggle() {
    const toggle = document.createElement("div");
    toggle.id = "pug-debug-toggle";
    toggle.className = "pug-debug-element";
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

    toggle.innerHTML = "🐛";
    toggle.title = "开启调试模式";

    toggle.addEventListener("click", toggleDebugMode);
    document.body.appendChild(toggle);
  }

  // 切换调试模式
  function toggleDebugMode() {
    debugMode = !debugMode;
    console.log("🐛 toggleDebugMode 被调用，新的 debugMode:", debugMode);
    const toggle = document.getElementById("pug-debug-toggle");

    if (debugMode) {
      toggle.style.background = "#4CAF50";
      toggle.title = "关闭调试模式 (ESC)";
      document.body.style.cursor = "crosshair";

      // 添加调试模式提示
      showToast("🐛 调试模式已开启，点击任意元素查看调试信息", "success");
      console.log("🐛 Pug调试模式已开启，点击任意元素查看调试信息");
    } else {
      toggle.style.background = "#2196F3";
      toggle.title = "开启调试模式";
      document.body.style.cursor = "";
      clearHighlight();
      hideDebugInfo();

      showToast("🐛 调试模式已关闭", "info");
      console.log("🐛 Pug调试模式已关闭");
    }
  }

  // 创建高亮覆盖层
  function createHighlightOverlay() {
    if (highlightOverlay) return;

    highlightOverlay = document.createElement("div");
    highlightOverlay.id = "pug-debug-highlight";
    highlightOverlay.className = "pug-debug-element";
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

    document.getElementById("debug-content").innerHTML = content;
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
    const input = document.createElement("input");
    input.type = "text";
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
    const saveBtn = document.createElement("button");
    saveBtn.textContent = "保存";
    saveBtn.className = "pug-debug-element";
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
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "取消";
    cancelBtn.className = "pug-debug-element";
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
    const editContainer = document.createElement("div");
    editContainer.className = "pug-debug-element";
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

        showToast(`文本已更新: "${originalText}" → "${newText}"`, "success");
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
    const styleEditor = document.createElement("div");
    styleEditor.id = "pug-style-editor";
    styleEditor.className = "pug-debug-element";
    styleEditor.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.95);
      color: white;
      padding: 0;
      border-radius: 8px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      z-index: 10002;
      width: 450px;
      max-height: 85vh;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      border: 1px solid #333;
      box-sizing: border-box;
      user-select: none;
    `;

    // 获取元素当前的计算样式和内联样式
    const computedStyle = window.getComputedStyle(element);

    // 获取元素的实际样式值（优先使用内联样式，然后是计算样式）
    function getStyleValue(property, computedValue) {
      const inlineValue = element.style[property];
      return inlineValue || computedValue || "";
    }

    // 格式化样式值，去除不必要的auto和0px
    function formatValue(value) {
      if (!value || value === "auto" || value === "0px") return "";
      return value;
    }

    styleEditor.innerHTML = `
      <style>
        #pug-style-editor input[type="text"] {
          background: #333 !important;
          color: white !important;
          -webkit-appearance: none !important;
          -webkit-box-shadow: inset 0 0 0 1000px #333 !important;
          -webkit-text-fill-color: white !important;
        }
        #pug-style-editor input[type="text"]:focus {
          background: #333 !important;
          color: white !important;
          -webkit-box-shadow: inset 0 0 0 1000px #333 !important;
          -webkit-text-fill-color: white !important;
        }
        #pug-style-editor input[type="text"]:hover {
          background: #333 !important;
          color: white !important;
        }
        #pug-style-editor input[type="text"]::-webkit-input-placeholder {
          color: #888 !important;
        }
        #pug-style-editor input[type="text"]:-moz-placeholder {
          color: #888 !important;
        }
        #pug-style-editor input[type="text"]::-moz-placeholder {
          color: #888 !important;
        }
        #pug-style-editor input[type="text"]:-ms-input-placeholder {
          color: #888 !important;
        }
      </style>
      <div id="style-editor-header" class="pug-debug-element" style="
        display: flex; 
        justify-content: space-between; 
        align-items: center; 
        padding: 12px 18px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 8px 8px 0 0;
        cursor: move;
        border-bottom: 1px solid rgba(255, 255, 255, 0.2);
      ">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-weight: bold; color: #FF9800; font-size: 15px;">🎨 样式编辑器</span>
          <span style="color: #888; font-size: 10px;">拖拽移动</span>
        </div>
        <div style="display: flex; align-items: center; gap: 5px;">
          <button id="collapse-style-editor" class="pug-debug-element" style="
            background: none; 
            border: none; 
            color: #FFD700; 
            font-size: 14px; 
            cursor: pointer; 
            padding: 2px 6px;
            border-radius: 3px;
            transition: background-color 0.2s;
          " title="折叠/展开">−</button>
          <button id="close-style-editor" class="pug-debug-element" style="
            background: none; 
            border: none; 
            color: #ff6b6b; 
            font-size: 18px; 
            cursor: pointer;
            padding: 2px 6px;
            border-radius: 3px;
            transition: background-color 0.2s;
          " title="关闭">&times;</button>
        </div>
      </div>
      
      <div id="style-editor-content" class="pug-debug-element" style="padding: 18px; overflow-y: auto; max-height: calc(85vh - 60px);">
      <div style="margin-bottom: 12px;">
        <h4 style="color: #4CAF50; margin: 0 0 6px 0; font-size: 13px;">📐 尺寸</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div>
            <label style="color: #FFD700; font-size: 11px; display: block; margin-bottom: 3px;">宽度:</label>
            <input type="text" id="style-width" value="${formatValue(
              getStyleValue("width", computedStyle.width)
            )}" 
              placeholder="${computedStyle.width}"
              autocomplete="off" spellcheck="false"
              style="width: 100%; background: #333 !important; color: white !important; border: 1px solid #555; border-radius: 3px; padding: 5px; font-size: 11px; box-sizing: border-box; -webkit-appearance: none; -webkit-box-shadow: inset 0 0 0 1000px #333 !important;" />
          </div>
          <div>
            <label style="color: #FFD700; font-size: 11px; display: block; margin-bottom: 3px;">高度:</label>
            <input type="text" id="style-height" value="${formatValue(
              getStyleValue("height", computedStyle.height)
            )}" 
              placeholder="${computedStyle.height}"
              autocomplete="off" spellcheck="false"
              style="width: 100%; background: #333 !important; color: white !important; border: 1px solid #555; border-radius: 3px; padding: 5px; font-size: 11px; box-sizing: border-box; -webkit-appearance: none; -webkit-box-shadow: inset 0 0 0 1000px #333 !important;" />
          </div>
        </div>
      </div>

      <div style="margin-bottom: 12px;">
        <h4 style="color: #4CAF50; margin: 0 0 6px 0; font-size: 13px;">📏 外边距</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 6px;">
          <div>
            <label style="color: #FFD700; font-size: 11px; display: block; margin-bottom: 3px;">上:</label>
            <input type="text" id="margin-top" value="${formatValue(
              getStyleValue("marginTop", computedStyle.marginTop)
            )}" 
              placeholder="${computedStyle.marginTop}"
              autocomplete="off" spellcheck="false"
              style="width: 100%; background: #333 !important; color: white !important; border: 1px solid #555; border-radius: 3px; padding: 5px; font-size: 11px; box-sizing: border-box; -webkit-appearance: none; -webkit-box-shadow: inset 0 0 0 1000px #333 !important;" />
          </div>
          <div>
            <label style="color: #FFD700; font-size: 11px; display: block; margin-bottom: 3px;">右:</label>
            <input type="text" id="margin-right" value="${formatValue(
              getStyleValue("marginRight", computedStyle.marginRight)
            )}" 
              placeholder="${computedStyle.marginRight}"
              autocomplete="off" spellcheck="false"
              style="width: 100%; background: #333 !important; color: white !important; border: 1px solid #555; border-radius: 3px; padding: 5px; font-size: 11px; box-sizing: border-box; -webkit-appearance: none; -webkit-box-shadow: inset 0 0 0 1000px #333 !important;" />
          </div>
          <div>
            <label style="color: #FFD700; font-size: 11px; display: block; margin-bottom: 3px;">下:</label>
            <input type="text" id="margin-bottom" value="${formatValue(
              getStyleValue("marginBottom", computedStyle.marginBottom)
            )}" 
              placeholder="${computedStyle.marginBottom}"
              autocomplete="off" spellcheck="false"
              style="width: 100%; background: #333 !important; color: white !important; border: 1px solid #555; border-radius: 3px; padding: 5px; font-size: 11px; box-sizing: border-box; -webkit-appearance: none; -webkit-box-shadow: inset 0 0 0 1000px #333 !important;" />
          </div>
          <div>
            <label style="color: #FFD700; font-size: 11px; display: block; margin-bottom: 3px;">左:</label>
            <input type="text" id="margin-left" value="${formatValue(
              getStyleValue("marginLeft", computedStyle.marginLeft)
            )}" 
              placeholder="${computedStyle.marginLeft}"
              autocomplete="off" spellcheck="false"
              style="width: 100%; background: #333 !important; color: white !important; border: 1px solid #555; border-radius: 3px; padding: 5px; font-size: 11px; box-sizing: border-box; -webkit-appearance: none; -webkit-box-shadow: inset 0 0 0 1000px #333 !important;" />
          </div>
        </div>
      </div>

      <div style="margin-bottom: 12px;">
        <h4 style="color: #4CAF50; margin: 0 0 6px 0; font-size: 13px;">📦 内边距</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 6px;">
          <div>
            <label style="color: #FFD700; font-size: 11px; display: block; margin-bottom: 3px;">上:</label>
            <input type="text" id="padding-top" value="${formatValue(
              getStyleValue("paddingTop", computedStyle.paddingTop)
            )}" 
              placeholder="${computedStyle.paddingTop}"
              autocomplete="off" spellcheck="false"
              style="width: 100%; background: #333 !important; color: white !important; border: 1px solid #555; border-radius: 3px; padding: 5px; font-size: 11px; box-sizing: border-box; -webkit-appearance: none; -webkit-box-shadow: inset 0 0 0 1000px #333 !important;" />
          </div>
          <div>
            <label style="color: #FFD700; font-size: 11px; display: block; margin-bottom: 3px;">右:</label>
            <input type="text" id="padding-right" value="${formatValue(
              getStyleValue("paddingRight", computedStyle.paddingRight)
            )}" 
              placeholder="${computedStyle.paddingRight}"
              autocomplete="off" spellcheck="false"
              style="width: 100%; background: #333 !important; color: white !important; border: 1px solid #555; border-radius: 3px; padding: 5px; font-size: 11px; box-sizing: border-box; -webkit-appearance: none; -webkit-box-shadow: inset 0 0 0 1000px #333 !important;" />
          </div>
          <div>
            <label style="color: #FFD700; font-size: 11px; display: block; margin-bottom: 3px;">下:</label>
            <input type="text" id="padding-bottom" value="${formatValue(
              getStyleValue("paddingBottom", computedStyle.paddingBottom)
            )}" 
              placeholder="${computedStyle.paddingBottom}"
              autocomplete="off" spellcheck="false"
              style="width: 100%; background: #333 !important; color: white !important; border: 1px solid #555; border-radius: 3px; padding: 5px; font-size: 11px; box-sizing: border-box; -webkit-appearance: none; -webkit-box-shadow: inset 0 0 0 1000px #333 !important;" />
          </div>
          <div>
            <label style="color: #FFD700; font-size: 11px; display: block; margin-bottom: 3px;">左:</label>
            <input type="text" id="padding-left" value="${formatValue(
              getStyleValue("paddingLeft", computedStyle.paddingLeft)
            )}" 
              placeholder="${computedStyle.paddingLeft}"
              autocomplete="off" spellcheck="false"
              style="width: 100%; background: #333 !important; color: white !important; border: 1px solid #555; border-radius: 3px; padding: 5px; font-size: 11px; box-sizing: border-box; -webkit-appearance: none; -webkit-box-shadow: inset 0 0 0 1000px #333 !important;" />
          </div>
        </div>
      </div>

      <div style="margin-bottom: 12px;">
        <h4 style="color: #4CAF50; margin: 0 0 6px 0; font-size: 13px;">🔤 字体</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 8px;">
          <div>
            <label style="color: #FFD700; font-size: 11px; display: block; margin-bottom: 3px;">大小:</label>
            <input type="text" id="font-size" value="${formatValue(
              getStyleValue("fontSize", computedStyle.fontSize)
            )}" 
              placeholder="${computedStyle.fontSize}"
              autocomplete="off" spellcheck="false"
              style="width: 100%; background: #333 !important; color: white !important; border: 1px solid #555; border-radius: 3px; padding: 5px; font-size: 11px; box-sizing: border-box; -webkit-appearance: none; -webkit-box-shadow: inset 0 0 0 1000px #333 !important;" />
          </div>
          <div>
            <label style="color: #FFD700; font-size: 11px; display: block; margin-bottom: 3px;">行高:</label>
            <input type="text" id="line-height" value="${formatValue(
              getStyleValue("lineHeight", computedStyle.lineHeight)
            )}" 
              placeholder="${computedStyle.lineHeight}"
              autocomplete="off" spellcheck="false"
              style="width: 100%; background: #333 !important; color: white !important; border: 1px solid #555; border-radius: 3px; padding: 5px; font-size: 11px; box-sizing: border-box; -webkit-appearance: none; -webkit-box-shadow: inset 0 0 0 1000px #333 !important;" />
          </div>
          <div>
            <label style="color: #FFD700; font-size: 11px; display: block; margin-bottom: 3px;">粗细:</label>
            <select id="font-weight" style="width: 100%; background: #333; color: white; border: 1px solid #555; border-radius: 3px; padding: 5px; font-size: 11px; box-sizing: border-box;">
              <option value="" ${
                !getStyleValue("fontWeight", computedStyle.fontWeight)
                  ? "selected"
                  : ""
              }>默认 (${computedStyle.fontWeight})</option>
              <option value="normal" ${
                getStyleValue("fontWeight", computedStyle.fontWeight) === "normal" ||
                getStyleValue("fontWeight", computedStyle.fontWeight) === "400"
                  ? "selected"
                  : ""
              }>normal (400)</option>
              <option value="bold" ${
                getStyleValue("fontWeight", computedStyle.fontWeight) === "bold" ||
                getStyleValue("fontWeight", computedStyle.fontWeight) === "700"
                  ? "selected"
                  : ""
              }>bold (700)</option>
              <option value="100" ${
                getStyleValue("fontWeight", computedStyle.fontWeight) === "100"
                  ? "selected"
                  : ""
              }>100</option>
              <option value="200" ${
                getStyleValue("fontWeight", computedStyle.fontWeight) === "200"
                  ? "selected"
                  : ""
              }>200</option>
              <option value="300" ${
                getStyleValue("fontWeight", computedStyle.fontWeight) === "300"
                  ? "selected"
                  : ""
              }>300</option>
              <option value="500" ${
                getStyleValue("fontWeight", computedStyle.fontWeight) === "500"
                  ? "selected"
                  : ""
              }>500</option>
              <option value="600" ${
                getStyleValue("fontWeight", computedStyle.fontWeight) === "600"
                  ? "selected"
                  : ""
              }>600</option>
              <option value="800" ${
                getStyleValue("fontWeight", computedStyle.fontWeight) === "800"
                  ? "selected"
                  : ""
              }>800</option>
              <option value="900" ${
                getStyleValue("fontWeight", computedStyle.fontWeight) === "900"
                  ? "selected"
                  : ""
              }>900</option>
            </select>
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr; gap: 8px;">
          <div>
            <label style="color: #FFD700; font-size: 11px; display: block; margin-bottom: 3px;">对齐:</label>
            <select id="text-align" style="width: 100%; background: #333; color: white; border: 1px solid #555; border-radius: 3px; padding: 5px; font-size: 11px; box-sizing: border-box;">
              <option value="" ${
                !getStyleValue("textAlign", computedStyle.textAlign)
                  ? "selected"
                  : ""
              }>默认 (${computedStyle.textAlign})</option>
              <option value="left" ${
                getStyleValue("textAlign", computedStyle.textAlign) === "left"
                  ? "selected"
                  : ""
              }>← 左对齐</option>
              <option value="center" ${
                getStyleValue("textAlign", computedStyle.textAlign) === "center"
                  ? "selected"
                  : ""
              }>⊙ 居中对齐</option>
              <option value="right" ${
                getStyleValue("textAlign", computedStyle.textAlign) === "right"
                  ? "selected"
                  : ""
              }>→ 右对齐</option>
              <option value="justify" ${
                getStyleValue("textAlign", computedStyle.textAlign) === "justify"
                  ? "selected"
                  : ""
              }>⊞ 两端对齐</option>
              <option value="start" ${
                getStyleValue("textAlign", computedStyle.textAlign) === "start"
                  ? "selected"
                  : ""
              }>start</option>
              <option value="end" ${
                getStyleValue("textAlign", computedStyle.textAlign) === "end"
                  ? "selected"
                  : ""
              }>end</option>
            </select>
          </div>
        </div>
      </div>

      <div style="margin-bottom: 15px;">
        <h4 style="color: #4CAF50; margin: 0 0 6px 0; font-size: 13px;">🎨 颜色</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div>
            <label style="color: #FFD700; font-size: 11px; display: block; margin-bottom: 3px;">文字颜色:</label>
            <div style="display: flex; gap: 6px;">
              <input type="color" id="color-picker" value="${rgbToHex(
                getStyleValue("color", computedStyle.color)
              )}" 
                style="width: 32px; height: 28px; border: none; background: none; cursor: pointer; padding: 0;" />
              <input type="text" id="color-text" value="${formatValue(
                getStyleValue("color", computedStyle.color)
              )}" 
                placeholder="${computedStyle.color}"
                autocomplete="off" spellcheck="false"
                style="flex: 1; background: #333 !important; color: white !important; border: 1px solid #555; border-radius: 3px; padding: 5px; font-size: 11px; box-sizing: border-box; -webkit-appearance: none; -webkit-box-shadow: inset 0 0 0 1000px #333 !important;" />
            </div>
          </div>
          <div>
            <label style="color: #FFD700; font-size: 11px; display: block; margin-bottom: 3px;">背景颜色:</label>
            <div style="display: flex; gap: 6px;">
              <input type="color" id="bg-color-picker" value="${rgbToHex(
                getStyleValue("backgroundColor", computedStyle.backgroundColor)
              )}" 
                style="width: 32px; height: 28px; border: none; background: none; cursor: pointer; padding: 0;" />
              <input type="text" id="bg-color-text" value="${formatValue(
                getStyleValue("backgroundColor", computedStyle.backgroundColor)
              )}" 
                placeholder="${computedStyle.backgroundColor}"
                autocomplete="off" spellcheck="false"
                style="flex: 1; background: #333 !important; color: white !important; border: 1px solid #555; border-radius: 3px; padding: 5px; font-size: 11px; box-sizing: border-box; -webkit-appearance: none; -webkit-box-shadow: inset 0 0 0 1000px #333 !important;" />
            </div>
          </div>
        </div>
      </div>

      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button id="apply-styles" class="pug-debug-element" style="
          background: #4CAF50;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 6px 12px;
          cursor: pointer;
          font-size: 11px;
        ">✅ 应用样式</button>
        <button id="reset-styles" class="pug-debug-element" style="
          background: #FF5722;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 6px 12px;
          cursor: pointer;
          font-size: 11px;
        ">🔄 重置样式</button>
        <button id="cancel-styles" class="pug-debug-element" style="
          background: #757575;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 6px 12px;
          cursor: pointer;
          font-size: 11px;
        ">❌ 取消</button>
      </div>
    </div>
    `;

    document.body.appendChild(styleEditor);

    // 绑定事件
    setupStyleEditorEvents(element, styleEditor);
  }

  // 设置样式编辑器事件
  function setupStyleEditorEvents(element, styleEditor) {
    const header = document.getElementById("style-editor-header");
    const collapseBtn = document.getElementById("collapse-style-editor");
    const closeBtn = document.getElementById("close-style-editor");
    const content = document.getElementById("style-editor-content");

    let isCollapsed = false;
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };

    // 关闭按钮
    closeBtn.addEventListener("click", () => {
      currentStyleEditorElement = null;
      styleEditor.remove();
    });

    // 折叠按钮事件
    collapseBtn.addEventListener("click", function () {
      isCollapsed = !isCollapsed;
      if (isCollapsed) {
        content.style.display = "none";
        collapseBtn.textContent = "+";
        collapseBtn.title = "展开";
        styleEditor.style.width = "auto";
        styleEditor.style.minWidth = "200px";
      } else {
        content.style.display = "block";
        collapseBtn.textContent = "−";
        collapseBtn.title = "折叠";
        styleEditor.style.width = "450px";
        styleEditor.style.minWidth = "auto";
      }
    });

    // 拖拽功能
    header.addEventListener("mousedown", function (e) {
      isDragging = true;
      const rect = styleEditor.getBoundingClientRect();
      dragOffset.x = e.clientX - rect.left;
      dragOffset.y = e.clientY - rect.top;

      header.style.cursor = "grabbing";
      document.addEventListener("mousemove", handleDrag);
      document.addEventListener("mouseup", handleDragEnd);
      e.preventDefault();
    });

    function handleDrag(e) {
      if (!isDragging) return;

      const x = e.clientX - dragOffset.x;
      const y = e.clientY - dragOffset.y;

      // 限制在视窗内
      const maxX = window.innerWidth - styleEditor.offsetWidth;
      const maxY = window.innerHeight - styleEditor.offsetHeight;

      const constrainedX = Math.max(0, Math.min(x, maxX));
      const constrainedY = Math.max(0, Math.min(y, maxY));

      styleEditor.style.left = constrainedX + "px";
      styleEditor.style.top = constrainedY + "px";
      styleEditor.style.transform = "none";
    }

    function handleDragEnd() {
      isDragging = false;
      header.style.cursor = "move";
      document.removeEventListener("mousemove", handleDrag);
      document.removeEventListener("mouseup", handleDragEnd);
    }

    // 按钮悬停效果
    collapseBtn.addEventListener("mouseenter", function () {
      this.style.backgroundColor = "rgba(255, 215, 0, 0.2)";
    });
    collapseBtn.addEventListener("mouseleave", function () {
      this.style.backgroundColor = "transparent";
    });

    closeBtn.addEventListener("mouseenter", function () {
      this.style.backgroundColor = "rgba(255, 107, 107, 0.2)";
    });
    closeBtn.addEventListener("mouseleave", function () {
      this.style.backgroundColor = "transparent";
    });

    // 为需要px单位的输入框添加失焦事件
    const pixelInputIds = [
      "style-width",
      "style-height",
      "margin-top",
      "margin-right",
      "margin-bottom",
      "margin-left",
      "padding-top",
      "padding-right",
      "padding-bottom",
      "padding-left",
      "font-size",
    ];

    pixelInputIds.forEach((inputId) => {
      const input = document.getElementById(inputId);
      if (input) {
        input.addEventListener("blur", function () {
          const value = this.value.trim();
          if (value) {
            // 将输入框ID转换为对应的CSS属性名
            const property =
              inputId === "style-width"
                ? "width"
                : inputId === "style-height"
                ? "height"
                : inputId === "font-size"
                ? "fontSize"
                : inputId.replace(/-([a-z])/g, (g) => g[1].toUpperCase());

            const processedValue = addUnitIfNeeded(value, property);
            if (processedValue !== value) {
              this.value = processedValue;
            }
          }
        });
      }
    });

    // 颜色选择器同步
    const colorPicker = document.getElementById("color-picker");
    const colorText = document.getElementById("color-text");
    const bgColorPicker = document.getElementById("bg-color-picker");
    const bgColorText = document.getElementById("bg-color-text");

    colorPicker.addEventListener("input", (e) => {
      colorText.value = e.target.value;
    });

    colorText.addEventListener("input", (e) => {
      try {
        const hexValue = rgbToHex(e.target.value);
        if (hexValue !== "#000000" || e.target.value.includes("#")) {
          colorPicker.value = hexValue;
        }
      } catch (err) {
        // 无效颜色值，忽略
      }
    });

    bgColorPicker.addEventListener("input", (e) => {
      bgColorText.value = e.target.value;
    });

    bgColorText.addEventListener("input", (e) => {
      try {
        const hexValue = rgbToHex(e.target.value);
        if (hexValue !== "#000000" || e.target.value.includes("#")) {
          bgColorPicker.value = hexValue;
        }
      } catch (err) {
        // 无效颜色值，忽略
      }
    });

    // 应用样式
    document.getElementById("apply-styles").addEventListener("click", () => {
      applyStylesToElement(currentStyleEditorElement || element);
      showToast("样式已应用到元素", "success");
    });

    // 重置样式
    document.getElementById("reset-styles").addEventListener("click", () => {
      const targetElement = currentStyleEditorElement || element;
      targetElement.style.cssText = "";
      showToast("元素样式已重置", "info");

      // 重置样式后，更新样式编辑器显示内容
      updateStyleEditor(targetElement);
    });

    // 取消
    document.getElementById("cancel-styles").addEventListener("click", () => {
      currentStyleEditorElement = null;
      styleEditor.remove();
    });

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

  // 自动添加单位的辅助函数
  function addUnitIfNeeded(value, property) {
    if (!value || value.trim() === "") {
      return "";
    }

    const trimmedValue = value.trim();

    // 定义需要默认添加px单位的CSS属性
    const pixelProperties = [
      "width",
      "height",
      "marginTop",
      "marginRight",
      "marginBottom",
      "marginLeft",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "fontSize",
    ];

    // lineHeight特殊处理：可以是无单位数值
    if (property === "lineHeight") {
      // 如果是纯数字（包括小数），lineHeight可以无单位
      if (/^[\d.]+$/.test(trimmedValue)) {
        return trimmedValue;
      }
      // 如果已经有单位或是特殊值，直接返回
      if (
        /^[\d.-]+(?:px|em|rem|%|vh|vw|vmin|vmax|cm|mm|in|pt|pc|ex|ch)$/i.test(
          trimmedValue
        ) ||
        ["normal", "inherit", "initial", "unset"].includes(
          trimmedValue.toLowerCase()
        )
      ) {
        return trimmedValue;
      }
      return trimmedValue;
    }

    // 如果不是需要px单位的属性，直接返回原值
    if (!pixelProperties.includes(property)) {
      return trimmedValue;
    }

    // 如果已经包含单位，直接返回
    if (
      /^[\d.-]+(?:px|em|rem|%|vh|vw|vmin|vmax|cm|mm|in|pt|pc|ex|ch)$/i.test(
        trimmedValue
      )
    ) {
      return trimmedValue;
    }

    // 如果是纯数字（包括小数和负数），添加px单位
    if (/^-?[\d.]+$/.test(trimmedValue)) {
      return trimmedValue + "px";
    }

    // 特殊值（如auto、inherit、initial等）直接返回
    const specialValues = ["auto", "inherit", "initial", "unset", "none", "normal"];
    if (specialValues.includes(trimmedValue.toLowerCase())) {
      return trimmedValue;
    }

    // 其他情况直接返回原值
    return trimmedValue;
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
      const value = input.value.trim();

      if (value) {
        // 自动添加单位
        const processedValue = addUnitIfNeeded(value, property);
        element.style[property] = processedValue;
        // 更新输入框显示处理后的值
        if (processedValue !== value && processedValue.endsWith("px")) {
          input.value = processedValue;
        }
      } else if (element.style[property]) {
        // 如果输入为空但元素有该样式，则移除该样式
        element.style[property] = "";
      }
    });

    console.log("已应用样式到元素:", element);
  }

  // RGB转十六进制
  function rgbToHex(rgb) {
    if (!rgb || rgb === "transparent" || rgb === "rgba(0, 0, 0, 0)") {
      return "#000000";
    }

    if (rgb.startsWith("#")) {
      return rgb;
    }

    const result = rgb.match(/\d+/g);
    if (result && result.length >= 3) {
      const r = parseInt(result[0]);
      const g = parseInt(result[1]);
      const b = parseInt(result[2]);
      return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    return "#000000";
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
      return; // 不处理调试元素的点击
    }

    console.log("🐛 开始处理元素点击，准备显示调试信息");
    event.preventDefault();
    event.stopPropagation();

    highlightElement(element);
    showDebugInfo(element);
  }

  // 检查元素是否为调试工具注入的元素
  function isDebugElement(element) {
    // 检查元素本身是否为调试元素
    if (
      element.id === "pug-debug-toggle" ||
      element.id === "pug-debug-overlay" ||
      element.id === "pug-debug-highlight" ||
      element.id === "pug-style-editor" ||
      element.id === "close-debug" ||
      element.id === "debug-content" ||
      element.id === "debug-header" ||
      element.id === "collapse-debug" ||
      element.id === "style-editor-header" ||
      element.id === "style-editor-content" ||
      element.id === "collapse-style-editor" ||
      element.id === "close-style-editor" ||
      element.id === "pug-debug-toast"
    ) {
      return true;
    }

    // 检查是否包含调试相关的类名
    if (
      element.className &&
      (element.className.includes("pug-debug") ||
        element.className.includes("pug-debug-element") ||
        element.className.includes("pug-debug-toast"))
    ) {
      return true;
    }

    // 检查元素是否在调试容器内
    let parent = element.parentElement;
    while (parent) {
      if (
        parent.id === "pug-debug-toggle" ||
        parent.id === "pug-debug-overlay" ||
        parent.id === "pug-debug-highlight" ||
        parent.id === "pug-style-editor" ||
        parent.id === "pug-debug-toast"
      ) {
        return true;
      }

      // 检查父元素是否包含调试相关的类名
      if (
        parent.className &&
        (parent.className.includes("pug-debug") ||
          parent.className.includes("pug-debug-element") ||
          parent.className.includes("pug-debug-toast"))
      ) {
        return true;
      }

      parent = parent.parentElement;
    }

    return false;
  }

  // 添加提示信息显示函数
  function showToast(message, type = "info") {
    // 移除现有的提示
    const existingToast = document.getElementById("pug-debug-toast");
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement("div");
    toast.id = "pug-debug-toast";
    toast.className = "pug-debug-toast"; // 添加调试相关类名便于排除

    const bgColor =
      type === "success" ? "#4CAF50" : type === "error" ? "#f44336" : "#2196F3";

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
      toast.style.opacity = "1";
    }, 100);

    // 3秒后自动消失
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 3000);
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

    // 更新当前编辑的元素
    currentStyleEditorElement = element;

    // 获取元素当前的计算样式和内联样式
    const computedStyle = window.getComputedStyle(element);

    // 获取元素的实际样式值（优先使用内联样式，然后是计算样式）
    function getStyleValue(property, computedValue) {
      const inlineValue = element.style[property];
      return inlineValue || computedValue || "";
    }

    // 格式化样式值，去除不必要的auto和0px
    function formatValue(value) {
      if (!value || value === "auto" || value === "0px") return "";
      return value;
    }

    // 更新各个输入框的值
    const inputs = {
      "style-width": formatValue(getStyleValue("width", computedStyle.width)),
      "style-height": formatValue(getStyleValue("height", computedStyle.height)),
      "margin-top": formatValue(getStyleValue("marginTop", computedStyle.marginTop)),
      "margin-right": formatValue(
        getStyleValue("marginRight", computedStyle.marginRight)
      ),
      "margin-bottom": formatValue(
        getStyleValue("marginBottom", computedStyle.marginBottom)
      ),
      "margin-left": formatValue(
        getStyleValue("marginLeft", computedStyle.marginLeft)
      ),
      "padding-top": formatValue(
        getStyleValue("paddingTop", computedStyle.paddingTop)
      ),
      "padding-right": formatValue(
        getStyleValue("paddingRight", computedStyle.paddingRight)
      ),
      "padding-bottom": formatValue(
        getStyleValue("paddingBottom", computedStyle.paddingBottom)
      ),
      "padding-left": formatValue(
        getStyleValue("paddingLeft", computedStyle.paddingLeft)
      ),
      "font-size": formatValue(getStyleValue("fontSize", computedStyle.fontSize)),
      "line-height": formatValue(
        getStyleValue("lineHeight", computedStyle.lineHeight)
      ),
      "color-text": formatValue(getStyleValue("color", computedStyle.color)),
      "bg-color-text": formatValue(
        getStyleValue("backgroundColor", computedStyle.backgroundColor)
      ),
    };

    // 更新输入框的值和占位符
    Object.keys(inputs).forEach((id) => {
      const input = document.getElementById(id);
      if (input) {
        input.value = inputs[id];
        // 更新占位符以显示计算样式值
        const property = id
          .replace("-", "")
          .replace("style", "")
          .replace("text", "");
        const camelCaseProperty = property.replace(/-([a-z])/g, (g) =>
          g[1].toUpperCase()
        );
        if (computedStyle[camelCaseProperty] !== undefined) {
          input.placeholder = computedStyle[camelCaseProperty];
        }
      }
    });

    // 更新颜色选择器
    const colorPicker = document.getElementById("color-picker");
    const bgColorPicker = document.getElementById("bg-color-picker");
    if (colorPicker) {
      colorPicker.value = rgbToHex(getStyleValue("color", computedStyle.color));
    }
    if (bgColorPicker) {
      bgColorPicker.value = rgbToHex(
        getStyleValue("backgroundColor", computedStyle.backgroundColor)
      );
    }

    // 更新字体粗细选择器
    const fontWeightSelect = document.getElementById("font-weight");
    if (fontWeightSelect) {
      const fontWeight = getStyleValue("fontWeight", computedStyle.fontWeight);
      fontWeightSelect.value = fontWeight || "";

      // 重新选择正确的选项
      Array.from(fontWeightSelect.options).forEach((option) => {
        option.selected = false;
        if (
          option.value === fontWeight ||
          (fontWeight === "normal" && option.value === "400") ||
          (fontWeight === "bold" && option.value === "700") ||
          (fontWeight === "400" && option.value === "normal") ||
          (fontWeight === "700" && option.value === "bold")
        ) {
          option.selected = true;
        }
      });
    }

    // 更新文字对齐选择器
    const textAlignSelect = document.getElementById("text-align");
    if (textAlignSelect) {
      const textAlign = getStyleValue("textAlign", computedStyle.textAlign);
      textAlignSelect.value = textAlign || "";

      // 重新选择正确的选项
      Array.from(textAlignSelect.options).forEach((option) => {
        option.selected = option.value === textAlign;
      });
    }

    // 显示提示信息
    showToast(`样式编辑器已更新为新元素 <${element.tagName.toLowerCase()}>`, "info");
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
          showToast(data.message || "文件已成功更新", "success");
          console.log("文本编辑成功:", data);
        } else {
          showToast(data.message || "文件更新失败", "error");
          console.error("文本编辑失败:", data);
        }
      })
      .catch((err) => {
        showToast("发送编辑请求失败", "error");
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
