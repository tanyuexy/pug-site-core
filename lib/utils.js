import fse from "fs-extra";
import path from "path";
import JavaScriptObfuscator from "javascript-obfuscator";
import { paths } from "./paths.js";
import detectPort from "detect-port";


const { config } = await import(paths.config);

// 根据操作系统设置路径分隔符
export const pathSymbol = process.platform.startsWith("win") ? "\\" : "/";

/**
 * 获取pages目录下所有pug文件的路径数组
 * @param {boolean} isFilter - 是否需要过滤路径（去除语言和设备类型目录）
 * @returns {Promise<string[]>} 返回pug文件路径数组
 */
export async function getPagesPugFilePathArr(isFilter) {
  let pagesPugFilePathArr = (
    await fse.readdir(paths.template.pages, {
      recursive: true,
    })
  ).filter((fileName) => fileName.endsWith(".pug"));

  if (isFilter) {
    pagesPugFilePathArr = pagesPugFilePathArr.map((fileName) => {
      return pagesPathFilter(fileName);
    });
  }
  pagesPugFilePathArr = Array.from(new Set(pagesPugFilePathArr));
  return pagesPugFilePathArr;
}

/**
 * 过滤pug文件路径，移除语言和设备类型目录
 * @param {string} pugPath - pug文件路径
 * @returns {string} 过滤后的路径
 */
export function pagesPathFilter(pugPath) {
  pugPath = pugPath
    .split(pathSymbol)
    .filter((item) => !config.languageList.includes(item))
    .join(pathSymbol);
  pugPath = pugPath
    .split(pathSymbol)
    .filter((item) => !["pc", "mobile", "ipad"].includes(item))
    .join(pathSymbol);
  return pugPath;
}

/**
 * 获取pug编译过滤器
 * @returns {Object} 返回过滤器对象
 */
export function getCompilePugFilter() {
  return {};
}

/**
 * 比较两个路径是否相同（忽略斜杠方向）
 * @param {string} path1 - 第一个路径
 * @param {string} path2 - 第二个路径
 * @returns {boolean} 如果路径相同返回true，否则返回false
 */
export function pathIsSame(path1, path2) {
  return (
    path1.replaceAll("/", "").replaceAll("\\", "") ===
    path2.replaceAll("/", "").replaceAll("\\", "")
  );
}

/**
 * 延迟执行
 * @param {number} ms - 延迟毫秒数
 * @returns {Promise<void>}
 */
export async function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * 获取可用的端口号
 * @param {number} port - 起始端口号
 * @returns {Promise<number>} 返回可用的端口号
 */
export async function getIdleProt(port) {
  while (true) {
    try {
      // 使用detect-port检查端口是否可用
      const availablePort = await detectPort(port);
      if (Number(availablePort) === Number(port)) {
        return port;
      }
    } catch (error) {
      console.error(`端口检查出错: ${error.message}`);
    }
    port++;
  }
}

/**
 * 函数防抖
 * @param {Function} func - 需要防抖的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function} 返回防抖后的函数
 */
export function debounce(func, delay) {
  let timeoutId;

  return function () {
    const context = this;
    const args = arguments;

    clearTimeout(timeoutId);

    timeoutId = setTimeout(() => {
      func.apply(context, args);
    }, delay);
  };
}

/**
 * 匹配并处理ESI标签
 * @param {string} body - 页面内容
 * @param {Object} data - 数据对象
 * @returns {Promise<string>} 返回处理后的内容
 */
export async function matchESI(body, data) {
  /**
   * 处理单个 ESI
   * @param {*} content 需要替换的文本
   * @param {*} data 数据
   * @returns
   */
  async function setVar(content, data) {
    return await content.replace(/\^\^esi:(.*?)\^\^/g, (match, key) => {
      // 填充 adsense channel id 和 gam key-value
      // if(PLACEMENT_KEY.includes(key)){
      //     return placement[key]
      // }
      // 填充主体内容
      let res = data[key.trim()];
      return typeof res == "object"
        ? JSON.stringify(res).replace(/\"/g, "&quot;")
        : res;
    });
  }
  try {
    let newBody = "";
    let current = 0;
    let esiReg = /<esi:for(.*?)>([\s\S]*?)<\/esi:for>/gm;
    var res = esiReg.exec(body);

    for (; res != null; res = esiReg.exec(body)) {
      // for 循环
      let regStr = res[0]; // 完整的for str
      // 获取开始标签
      var kvReg = /(\w+)="(\w+|\-?\d+)"/gm;
      var kv = {};
      var temKv;
      while ((temKv = kvReg.exec(res[1]))) {
        kv[temKv[1]] = temKv[2];
      }
      const { key, start, end, index_floor } = kv;
      let dom = res[2];
      let data_;
      data_ = data[key].slice(start, end);
      newBody += body.slice(current, res.index);
      for (var i = 0; i < data_.length; i++) {
        let tmpData = data_[i];
        tmpData.index = index_floor ? i + parseInt(index_floor) : i;
        newBody += await setVar(dom, tmpData);
      }
      current = res.index + regStr.length;
    }
    newBody += body.slice(current, body.length);
    return await setVar(newBody, data);
  } catch (error) {
    console.log(error);
  }
}

/**
 * 混淆 JavaScript 代码（优化后的混淆配置）
 * @param {string} filePath - JS文件路径或目录路径
 * @param {Object} options - 混淆选项，可选
 * @param {string[]} excludePaths - 要排除的文件或目录路径数组
 * @returns {Promise<void>}
 */
export async function obfuscateJavaScript(
  filePath,
  options = {},
  excludePaths = []
) {
  // 优化后的混淆配置
  const defaultOptions = {
    // 基础设置
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.5, // 降低到0.5，减少代码膨胀

    // 移除死代码注入，因为会显著增加文件大小
    deadCodeInjection: false,

    // 保留调试保护但降低频率
    debugProtection: true,
    debugProtectionInterval: 2000, // 降低检查频率

    // 禁用控制台
    disableConsoleOutput: false,

    // 标识符混淆
    identifierNamesGenerator: "hexadecimal",
    identifiersPrefix: "_", // 使用更短的前缀

    // 字符串保护
    stringArray: true,
    stringArrayEncoding: ["base64"], // 改用base64，比rc4更轻量
    stringArrayThreshold: 0.75, // 降低阈值，减少处理的字符串数量

    // 禁用字符串分割，因为会显著增加大小
    splitStrings: false,

    // 保留关键的混淆选项
    transformObjectKeys: true,
    numbersToExpressions: true,
    simplify: true,

    // 随机种子
    seed: Math.random(),

    // 移除自我防护，因为会增加代码大小
    selfDefending: false,

    // 基础设置
    renameGlobals: false,
    sourceMap: false,

    // 字符串数组处理
    rotateStringArray: true,
    shuffleStringArray: true,

    // 禁用Unicode转义，因为会增加文件大小
    unicodeEscapeSequence: false,

    // 移除注释
    removeComments: true,

    // 禁用正则表达式混淆，因为会增加大小
    regexesObfuscation: false,

    // 新增：目标环境优化
    target: "browser",

    // 新增：优化选项
    reservedStrings: [], // 不混淆的字符串
    reservedNames: [], // 不混淆的标识符

    // 新增：代码压缩选项
    compress: {
      sequences: true,
      dead_code: true,
      conditionals: true,
      booleans: true,
      unused: true,
      if_return: true,
      join_vars: true,
      drop_console: true,
    },
  };

  // 合并配置选项
  const obfuscatorOptions = { ...defaultOptions, ...options };

  /**
   * 检查路径是否应该被排除
   * @param {string} targetPath - 要检查的路径
   * @returns {boolean} 是否应该被排除
   */
  function shouldExclude(targetPath) {
    // 获取相对于基础路径的相对路径
    const relativePath = path.relative(filePath, targetPath);

    return excludePaths.some((excludePath) => {
      // 将排除路径标准化（处理不同操作系统的路径分隔符）
      const normalizedExcludePath = excludePath.split("/").join(pathSymbol);
      const normalizedRelativePath = relativePath.split("/").join(pathSymbol);

      // 检查是否匹配排除路径
      return (
        normalizedRelativePath.startsWith(normalizedExcludePath) ||
        normalizedRelativePath === normalizedExcludePath
      );
    });
  }

  /**
   * 混淆单个JS文件
   * @param {string} jsFilePath - JS文件路径
   */
  async function obfuscateFile(jsFilePath) {
    try {
      // 检查是否应该排除此文件
      if (shouldExclude(jsFilePath)) {
        console.log(`Skipped (excluded): ${jsFilePath}`);
        return;
      }

      // 读取文件内容
      const code = await fse.readFile(jsFilePath, "utf-8");

      // 混淆代码
      const obfuscationResult = JavaScriptObfuscator.obfuscate(
        code,
        obfuscatorOptions
      );
      const obfuscatedCode = obfuscationResult.getObfuscatedCode();

      // 写回原文件
      await fse.writeFile(jsFilePath, obfuscatedCode, "utf-8");
      console.log(`Obfuscated: ${jsFilePath}`);
    } catch (error) {
      console.error(`Error obfuscating ${jsFilePath}:`, error);
    }
  }

  /**
   * 递归处理目录
   * @param {string} dirPath - 目录路径
   */
  async function processDirectory(dirPath) {
    try {
      // 检查是否应该排除此目录
      if (shouldExclude(dirPath)) {
        console.log(`Skipped directory (excluded): ${dirPath}`);
        return;
      }

      const files = await fse.readdir(dirPath);

      for (const file of files) {
        const fullPath = path.join(dirPath, file);
        const stats = await fse.stat(fullPath);

        if (stats.isDirectory()) {
          // 递归处理子目录
          await processDirectory(fullPath);
        } else if (file.endsWith(".js")) {
          // 处理JS文件
          await obfuscateFile(fullPath);
        }
      }
    } catch (error) {
      console.error(`Error processing directory ${dirPath}:`, error);
    }
  }

  try {
    const stats = await fse.stat(filePath);

    if (stats.isDirectory()) {
      // 如果是目录，递归处理
      await processDirectory(filePath);
    } else if (filePath.endsWith(".js")) {
      // 如果是JS文件，直接处理
      await obfuscateFile(filePath);
    } else {
      console.warn("Not a JavaScript file or directory:", filePath);
    }
  } catch (error) {
    console.error("Error processing path:", error);
    throw error;
  }
}

/**
 * 获取JSON数据
 * @param {string} jsonDataPath - 基于jsonData目录的JSON数据路径
 * @returns {Promise<any>} 返回JSON数据
 */
export async function getJsonData(jsonDataPath) {
  let filePath = paths.resolveRoot("jsonData", jsonDataPath);
  if (!fse.pathExistsSync(filePath)) {
    return Promise.reject(new Error(`${filePath}的json数据不存在`));
  }
  let jsonData = await fse.readJSON(filePath);
  return jsonData;
}


/**
 * 为HTML字符串中的template标签添加作用域隔离（纯JavaScript实现，无外部依赖）
 * @param {string} htmlString - HTML字符串
 * @param {string} scopePrefix - 作用域前缀，默认为"xy"
 * @returns {string} 处理后的HTML字符串
 */
export function addTemplateScopeIsolation(htmlString, scopePrefix = "xy") {
  if (!htmlString || typeof htmlString !== "string") {
    return htmlString;
  }

  // 如果字符串中没有template标签，直接返回原字符串，避免不必要的处理
  if (!htmlString.includes("<template>") || !htmlString.includes("</template>")) {
    return htmlString;
  }

  // 生成Vue风格的作用域ID
  function generateScopeId(prefix) {
    const hash = Math.random().toString(16).substring(2, 10);
    return `${prefix}-${hash}`;
  }

  // 简单的HTML解析器，用于处理template标签
  function parseHTML(html) {
    let result = html;
    
    // 使用递归方式处理嵌套的template标签
    function processTemplates(str) {
      // 找到最内层的template（不包含其他template的）
      const templateRegex = /<template([^>]*)>((?:(?!<template|<\/template>)[\s\S])*?)<\/template>/gi;
      let match;
      let hasReplacement = false;
      
      while ((match = templateRegex.exec(str)) !== null) {
        const fullMatch = match[0];
        const attributes = match[1] || '';
        const content = match[2] || '';
        
        // 生成作用域ID
        const scopeId = generateScopeId(scopePrefix);
        
        // 处理内容
        const processedContent = addScopeToHTML(content, scopeId);
        
        // 创建新的div标签替换template
        const newDiv = `<div data-${scopeId}=""${attributes}>${processedContent}</div>`;
        
        // 替换原始template
        str = str.replace(fullMatch, newDiv);
        hasReplacement = true;
        
        // 重置正则表达式索引
        templateRegex.lastIndex = 0;
      }
      
      // 如果有替换，继续递归处理
      if (hasReplacement && str.includes('<template>')) {
        return processTemplates(str);
      }
      
      return str;
    }
    
    return processTemplates(result);
  }

  // 为HTML内容添加作用域属性
  function addScopeToHTML(html, scopeId) {
    // 处理HTML标签，为每个标签添加作用域属性
    return html.replace(/<(\w+)([^>]*?)>/g, (match, tagName, attributes) => {
      // 跳过已经有作用域属性的标签
      if (attributes.includes('data-v-') || attributes.includes(`data-${scopeId}`)) {
        return match;
      }
      
      // 为标签添加作用域属性
      return `<${tagName} data-${scopeId}=""${attributes}>`;
    }).replace(/<style([^>]*?)>([\s\S]*?)<\/style>/gi, (match, styleAttrs, cssContent) => {
      // 处理style标签中的CSS
      if (!cssContent.includes('[data-')) {
        const scopedCSS = addScopeToCSS(cssContent, scopeId);
        return `<style${styleAttrs}>${scopedCSS}</style>`;
      }
      return match;
    });
  }

    // 为CSS添加作用域（简化版本，处理常见的CSS选择器）
  function addScopeToCSS(cssContent, scopeId) {
    // 处理嵌套的CSS规则，支持@media、@supports等
    return cssContent.replace(/([^{}]+)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, (match, selectors, content) => {
      // 检查是否是@keyframes规则
      if (selectors.trim().startsWith('@keyframes')) {
        // @keyframes规则不需要作用域处理，直接返回
        return match;
      }
      
      // 检查是否是@media、@supports等包含嵌套规则的@规则
      if (selectors.trim().startsWith('@') && content.includes('{')) {
        // 递归处理嵌套的CSS规则
        const processedContent = addScopeToCSS(content, scopeId);
        return `${selectors} {${processedContent}}`;
      }
      
      // 处理普通的CSS选择器
      const processedSelectors = selectors
        .split(',')
        .map(selector => {
          selector = selector.trim();
          
          // 跳过@规则（如@import、@charset等）
          if (selector.startsWith('@')) {
            return selector;
          }
          
          // 跳过关键帧动画的关键字（from、to、百分比）
          if (/^(from|to|\d+%)$/.test(selector)) {
            return selector;
          }
          
          // 跳过伪元素和特殊选择器
          if (selector.includes('::') || selector.includes(':root') || selector.includes(':host')) {
            return `[data-${scopeId}] ${selector}`;
          }
          
          // 如果已经有这个作用域，跳过
          if (selector.includes(`[data-${scopeId}]`)) {
            return selector;
          }
          
          // 移除其他作用域属性
          let cleanSelector = selector.replace(/\[data-v-[a-f0-9]+\]/g, '').trim();
          
          // 处理复合选择器
          if (cleanSelector.includes(' ')) {
            const parts = cleanSelector.split(' ');
            parts[0] = addScopeToSimpleSelector(parts[0], scopeId);
            return parts.join(' ');
          } else {
            // 简单选择器
            return addScopeToSimpleSelector(cleanSelector, scopeId);
          }
          
          // 为简单选择器添加作用域（处理伪类、伪元素等）
          function addScopeToSimpleSelector(selector, scopeId) {
            // 处理伪类和伪元素
            const pseudoMatch = selector.match(/^([^:]+)(:.*)$/);
            if (pseudoMatch) {
              return `${pseudoMatch[1]}[data-${scopeId}]${pseudoMatch[2]}`;
            }
            return `${selector}[data-${scopeId}]`;
          }
        })
        .join(', ');
      
      return `${processedSelectors} {${content}}`;
    });
  }

  // 开始处理
  return parseHTML(htmlString);
}
