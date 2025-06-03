import express from "express";
import fse from "fs-extra";
import path from "path";
import paths from "./paths.js";

/**
 * 调试路由处理模块
 * 专门处理调试相关的API路由和业务逻辑
 */

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
    类名: debugData.className,
    文本内容: debugData.textContent,
    编辑标识: debugData.editableKey
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
 * 处理来自客户端的文本编辑请求
 * @param {Object} editData - 编辑数据
 * @returns {Object} 处理结果
 */
export async function handleTextEdit(editData) {
  console.log('收到文本编辑请求:', {
    时间: editData.timestamp,
    页面: editData.url,
    文件: editData.file,
    行号: editData.line,
    编辑标识: editData.editableKey,
    原始文本: editData.originalText,
    新文本: editData.newText,
  });
  
  try {
    if (editData.editableKey) {
      if (editData.editableKey === 'true') {
        // 普通pug模板文件处理
        return updateTemplateFile(editData);
      } else {
        return await updateLanguageFile(editData.editableKey, editData.newText, editData.originalText);
      }
    }
    
    return {
      success: false,
      message: '无法解析编辑标识，无法更新文件',
      data: editData
    };
    
  } catch (error) {
    console.error('处理文本编辑时出错:', error);
    return {
      success: false,
      message: '文件更新失败: ' + error.message,
      error: error.message
    };
  }
}

/**
 * 更新pug模板文件
 * @param {Object} editData - 编辑数据
 * @returns {Object} 处理结果
 */
function updateTemplateFile(editData) {
  try {
    // 构建文件路径，基于template-debug
    const filePath = path.join(paths.template.debug, editData.file);
    
    if (!fse.existsSync(filePath)) {
      return {
        success: false,
        message: `文件不存在: ${filePath}`
      };
    }
    
    // 读取文件内容
    const fileContent = fse.readFileSync(filePath, 'utf8');
    const lines = fileContent.split('\n');
    
    // 检查行号是否有效
    const lineIndex = parseInt(editData.line) - 1; // 转换为0基索引
    if (lineIndex < 0 || lineIndex >= lines.length) {
      return {
        success: false,
        message: `行号无效: ${editData.line}，文件共有 ${lines.length} 行`
      };
    }
    
    // 替换指定行中的文本
    const originalLine = lines[lineIndex];
    const newLine = originalLine.replace(editData.originalText, editData.newText);
    
    if (originalLine === newLine) {
      return {
        success: false,
        message: `在第 ${editData.line} 行未找到要替换的文本: "${editData.originalText}"`
      };
    }
    
    lines[lineIndex] = newLine;
    
    // 写回文件
    const newContent = lines.join('\n');
    fse.writeFileSync(filePath, newContent, 'utf8');
    
    console.log(`成功更新模板文件: ${filePath}`);
    console.log(`第 ${editData.line} 行: "${originalLine.trimStart()}" -> "${newLine.trimStart()}"`);
    
    return {
      success: true,
      message: `模板文件已更新: "${editData.originalText}" → "${editData.newText}"`,
      data: {
        filePath,
        line: editData.line,
        oldLine: originalLine,
        newLine: newLine
      }
    };
    
  } catch (error) {
    console.error('更新模板文件时出错:', error);
    return {
      success: false,
      message: '更新模板文件失败: ' + error.message,
      error: error.message
    };
  }
}

/**
 * 更新语言数据文件
 * @param {string} editableKey - 键路径，如 'us,video,recommendTitle'
 * @param {string} newText - 新文本
 * @param {string} originalText - 原始文本
 * @returns {Object} 处理结果
 */
async function updateLanguageFile(editableKey, newText, originalText) {
  try {
    const keyArray = editableKey.split(',');
    // 直接从languageData.js导入语言数据对象
    let languageData = (await import(paths.languageData)).default;
    let data = languageData[keyArray.shift()];
    while(keyArray.length > 0) {
      data = data[keyArray.shift()];
      if (data === 'undefined') {
        throw new Error(`键"${editableKey}"的内容不存在`);
      }
    }
    // 验证原始文本是否匹配
    if (data !== originalText) {
       throw new Error(`键"${editableKey}"的内容不匹配。期望: "${originalText}"，实际: "${data}"`);
    }
    // 重新导航并修改值
    const originalKeyArray = editableKey.split(',');
    let current = languageData;
    for (let i = 0; i < originalKeyArray.length - 1; i++) {
      current = current[originalKeyArray[i]];
    }
    const lastKey = originalKeyArray[originalKeyArray.length - 1];
    current[lastKey] = newText;
    
    // 生成新的文件内容
    const newFileContent = generateLanguageFileContent(languageData);
    
    // 构建languageData.js文件路径
    const languageFilePath = paths.resolveRoot("languageData.js");
    
    // 写回文件
    fse.writeFileSync(languageFilePath, newFileContent, 'utf8');
    
    console.log(`成功更新语言文件: ${languageFilePath}`);
    console.log(`键路径 ${editableKey}: "${originalText}" -> "${newText}"`);
    
    return {
      success: true,
      message: `语言文件已更新: "${originalText}" → "${newText}"`,
      data: {
        filePath: languageFilePath,
        keyPath: editableKey,
        oldValue: originalText,
        newValue: newText
      }
    };
    
  } catch (error) {
    console.error('更新语言文件时出错:', error);
    return {
      success: false,
      message: '更新语言文件失败: ' + error.message,
      error: error.message
    };
  }
}

/**
 * 生成语言文件内容
 * @param {Object} data - 完整的语言数据对象，包含所有语言
 * @returns {string} 文件内容
 */
function generateLanguageFileContent(data) {
  const jsonString = JSON.stringify(data, null, 2);
  return `export default ${jsonString};\n`;
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

/**
 * 创建文本编辑接收的Express路由处理器
 * @returns {Function} Express路由处理函数
 */
export function createDebugEditRoute() {
  return async (req, res) => {
    try {
      const editData = req.body;
      const result = await handleTextEdit(editData);
      res.json(result);
    } catch (error) {
      console.error('处理文本编辑时出错:', error);
      res.status(500).json({
        success: false,
        message: '处理文本编辑失败',
        error: error.message
      });
    }
  };
}

/**
 * 处理来自客户端的样式修改请求
 * @param {Object} styleData - 样式修改数据
 * @returns {Object} 处理结果
 */
export async function handleStyleEdit(styleData) {
  console.log('收到样式修改请求:', {
    时间: styleData.timestamp,
    页面: styleData.url,
    文件: styleData.file,
    行号: styleData.line,
    元素标签: styleData.element?.tag,
    元素ID: styleData.element?.id,
    元素类名: styleData.element?.className,
    修改的样式: styleData.styles,
    样式数量: Object.keys(styleData.styles || {}).length
  });
  
  try {
    // 如果有文件和行号信息，尝试写入行内样式
    if (styleData.file && styleData.line && styleData.styles) {
      return await updateTemplateWithInlineStyles(styleData);
    }
    
    // 如果没有足够信息，只记录样式修改
    return {
      success: true,
      message: '样式修改信息已记录',
    };
    
  } catch (error) {
    console.error('处理样式修改时出错:', error);
    return {
      success: false,
      message: '样式修改处理失败: ' + error.message,
      error: error.message
    };
  }
}

/**
 * 更新模板文件的行内样式
 * @param {Object} styleData - 样式修改数据
 * @returns {Object} 处理结果
 */
async function updateTemplateWithInlineStyles(styleData) {
  try {
    // 构建文件路径，基于template-debug
    const filePath = path.join(paths.template.debug, styleData.file);
    
    if (!fse.existsSync(filePath)) {
      return {
        success: false,
        message: `文件不存在: ${filePath}`
      };
    }
    
    // 读取文件内容
    const fileContent = fse.readFileSync(filePath, 'utf8');
    const lines = fileContent.split('\n');
    
    // 检查行号是否有效
    const lineIndex = parseInt(styleData.line) - 1; // 转换为0基索引
    if (lineIndex < 0 || lineIndex >= lines.length) {
      return {
        success: false,
        message: `行号无效: ${styleData.line}，文件共有 ${lines.length} 行`
      };
    }
    
    const originalLine = lines[lineIndex];
    
    // 验证输入的样式数据
    if (!styleData.styles || typeof styleData.styles !== 'object') {
      return {
        success: false,
        message: '样式数据格式无效'
      };
    }
    
    // 将样式对象转换为CSS字符串，并处理特殊字符
    const newStylesCSS = Object.entries(styleData.styles)
      .map(([property, value]) => {
        // 将驼峰命名转换为短横线命名
        const cssProperty = property.replace(/([A-Z])/g, '-$1').toLowerCase();
        // 确保值是字符串并转义可能的问题字符
        const cleanValue = String(value).replace(/"/g, '\\"');
        return `${cssProperty}: ${cleanValue}`;
      })
      .join('; ');
    
    // 解析并更新style属性的内部函数
    const parseAndUpdateStyleAttribute = (line, stylesCSS, styles) => {
      // 更精确的style属性匹配正则，支持各种引号格式
      const styleRegex = /\bstyle\s*=\s*(['"`])([^\1]*?)\1/i;
      const styleMatch = line.match(styleRegex);
      
      if (styleMatch) {
        // 已有style属性，合并新样式
        const quote = styleMatch[1]; // 保持原有的引号类型
        const existingStyles = styleMatch[2];
        
        // 解析现有样式的内部函数
        const parseExistingStyles = (stylesStr) => {
          const stylesObj = {};
          
          if (!stylesStr || typeof stylesStr !== 'string') {
            return stylesObj;
          }
          
          // 分割样式声明，处理可能包含分号的值
          const declarations = stylesStr.split(';').filter(decl => decl.trim());
          
          declarations.forEach(declaration => {
            const colonIndex = declaration.indexOf(':');
            if (colonIndex > 0) {
              const property = declaration.substring(0, colonIndex).trim();
              const value = declaration.substring(colonIndex + 1).trim();
              
              if (property && value) {
                stylesObj[property] = value;
              }
            }
          });
          
          return stylesObj;
        };
        
        // 解析现有样式，更安全的处理方式
        const existingStylesObj = parseExistingStyles(existingStyles);
        
        // 合并新样式（新样式会覆盖现有的同名样式）
        Object.entries(styles).forEach(([property, value]) => {
          const cssProperty = property.replace(/([A-Z])/g, '-$1').toLowerCase();
          existingStylesObj[cssProperty] = String(value);
        });
        
        // 重新生成样式字符串
        const mergedStyles = Object.entries(existingStylesObj)
          .filter(([property, value]) => property && value) // 过滤空值
          .map(([property, value]) => `${property}: ${value}`)
          .join('; ');
        
        // 保持原有引号类型，但转义内容中的相同引号
        const escapedStyles = mergedStyles.replace(new RegExp(quote, 'g'), `\\${quote}`);
        const newLine = line.replace(styleRegex, `style=${quote}${escapedStyles}${quote}`);
        
        return { success: true, newLine };
      } else {
        // 没有style属性，需要添加 - 添加style属性的内部函数
        const addStyleAttributeToLine = (line, stylesCSS) => {
          // 查找pug标签的属性括号，直接对原始行进行匹配以保持缩进
          const attributeRegex = /^(\s*)([a-zA-Z0-9\-_.#]+)(\([^)]*\))?(.*)$/;
          const match = line.match(attributeRegex);
          
          if (!match) {
            return {
              success: false,
              message: '无法解析标签结构，可能不是有效的pug标签行'
            };
          }
          
          const [, indent, tagName, attributes, rest] = match;
          
          if (attributes) {
            // 已有属性括号，在括号内添加style属性
            const attributesContent = attributes.slice(1, -1); // 去掉括号
            
            // 检查是否需要添加分隔符
            const separator = attributesContent.trim() ? ', ' : '';
            const newAttributes = `(${attributesContent}${separator}style="${stylesCSS}")`;
            
            return {
              success: true,
              newLine: `${indent}${tagName}${newAttributes}${rest}`
            };
          } else {
            // 没有属性括号，添加新的括号和style属性
            return {
              success: true,
              newLine: `${indent}${tagName}(style="${stylesCSS}")${rest}`
            };
          }
        };
        
        return addStyleAttributeToLine(line, stylesCSS);
      }
    };
    
    // 更安全的style属性检测和解析
    const result = parseAndUpdateStyleAttribute(originalLine, newStylesCSS, styleData.styles);
    
    if (!result.success) {
      return {
        success: false,
        message: result.message
      };
    }
    
    const newLine = result.newLine;
    
    // 如果没有变化，不需要更新
    if (originalLine === newLine) {
      return {
        success: true,
        message: '样式没有变化，无需更新文件'
      };
    }
    
    lines[lineIndex] = newLine;
    
    // 写回文件
    const newContent = lines.join('\n');
    fse.writeFileSync(filePath, newContent, 'utf8');
    
    console.log(`成功更新模板文件样式: ${filePath}`);
    console.log(`第 ${styleData.line} 行:`);
    console.log(`  原始: ${originalLine.trim()}`);
    console.log(`  更新: ${newLine.trim()}`);
    
    return {
      success: true,
      message: `已将样式写入文件第 ${styleData.line} 行`,
      data: {
        filePath,
        line: styleData.line,
        oldLine: originalLine.trim(),
        newLine: newLine.trim(),
        addedStyles: styleData.styles
      }
    };
    
  } catch (error) {
    console.error('更新模板文件样式时出错:', error);
    return {
      success: false,
      message: '更新模板文件样式失败: ' + error.message,
      error: error.message
    };
  }
}

/**
 * 创建样式编辑接收的Express路由处理器
 * @returns {Function} Express路由处理函数
 */
export function createDebugStyleRoute() {
  return async (req, res) => {
    try {
      const styleData = req.body;
      const result = await handleStyleEdit(styleData);
      res.json(result);
    } catch (error) {
      console.error('处理样式修改时出错:', error);
      res.status(500).json({
        success: false,
        message: '处理样式修改失败',
        error: error.message
      });
    }
  };
}

/**
 * 设置调试相关的路由
 * @param {express.Application} app - Express应用实例
 */
export function setupDebugRoutes(app) {
  // 添加调试信息接收API路由
  app.post('/api/pug-debug', express.json(), createDebugRoute());
  
  // 添加文本编辑接收API路由
  app.post('/api/pug-debug/edit', express.json(), createDebugEditRoute());
  
  // 添加样式修改接收API路由
  app.post('/api/pug-debug/style', express.json(), createDebugStyleRoute());
} 