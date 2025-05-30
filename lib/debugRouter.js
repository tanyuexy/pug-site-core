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
 * 设置调试相关的路由
 * @param {express.Application} app - Express应用实例
 */
export function setupDebugRoutes(app) {
  // 添加调试信息接收API路由
  app.post('/api/pug-debug', express.json(), createDebugRoute());
  
  // 添加文本编辑接收API路由
  app.post('/api/pug-debug/edit', express.json(), createDebugEditRoute());
} 