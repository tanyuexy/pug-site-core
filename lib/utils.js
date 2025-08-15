import fse from "fs-extra";
import path from "path";
import JavaScriptObfuscator from "javascript-obfuscator";
import { paths } from "./paths.js";
import detectPort from "detect-port";
import axios from "axios";

const { config } = await import(paths.config);

// 根据操作系统设置路径分隔符
export const pathSymbol = process.platform.startsWith("win") ? "\\" : "/";

/**
 * 判断当前环境是否为Linux系统
 * @returns {boolean} 如果是Linux系统返回true，否则返回false
 */
export function isLinux() {
  return process.platform === "linux";
}

/**
 * 获取pages目录下所有pug文件的路径数组
 * @returns {Promise<string[]>} 返回pug文件路径数组
 */
export async function getPagesPugFilePathArr() {
  let pagesPugFilePathArr = (
    await fse.readdir(paths.template.pages, {
      recursive: true
    })
  ).filter((fileName) => fileName.endsWith(".pug"));

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
      drop_console: true
    }
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
 * 为HTML字符串中的template标签添加作用域隔离（优化版本）
 * @param {string} htmlString - HTML字符串
 * @param {string} scopePrefix - 作用域前缀，默认为"xy"
 * @param {Object} options - 配置选项
 * @param {number} options.maxDepth - 最大递归深度，默认为10
 * @param {boolean} options.preserveComments - 是否保留注释，默认为true
 * @returns {string} 处理后的HTML字符串
 */
export function addTemplateScopeIsolation(
  htmlString,
  scopePrefix = "xy",
  options = {}
) {
  // 参数验证
  if (!htmlString || typeof htmlString !== "string") {
    return htmlString;
  }

  // 快速检查，避免不必要的处理
  if (
    !htmlString.includes("<template>") ||
    !htmlString.includes("</template>")
  ) {
    return htmlString;
  }

  // 配置选项
  const config = {
    maxDepth: options.maxDepth || 10,
    preserveComments: options.preserveComments !== false,
    _currentDepth: 0
  };

  // 生成唯一的作用域ID（使用更稳定的方法）
  function generateScopeId(prefix) {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}-${timestamp}-${random}`;
  }

  // 为简单选择器添加作用域（移到外部作用域）
  function addScopeToSimpleSelector(selector, scopeId) {
    // 处理空选择器
    if (!selector || !selector.trim()) {
      return selector;
    }

    selector = selector.trim();

    // 处理伪类和伪元素（更完善的正则）
    const pseudoMatch = selector.match(/^([^:]+?)(::?[^[]+)?$/);
    if (pseudoMatch) {
      const [, base, pseudo = ""] = pseudoMatch;
      // 处理属性选择器
      if (base.includes("[")) {
        const attrMatch = base.match(/^([^[]+)(\[.+\])$/);
        if (attrMatch) {
          return `${attrMatch[1]}[data-${scopeId}]${attrMatch[2]}${pseudo}`;
        }
      }
      return `${base}[data-${scopeId}]${pseudo}`;
    }

    return `${selector}[data-${scopeId}]`;
  }

  // 处理template标签
  function parseHTML(html, depth = 0) {
    // 检查递归深度
    if (depth >= config.maxDepth) {
      console.warn(
        `Maximum recursion depth (${config.maxDepth}) reached in template processing`
      );
      return html;
    }

    // 使用更精确的模板匹配（避免贪婪匹配问题）
    const templates = [];
    let tempHtml = html;
    let placeholder = 0;

    // 先收集所有template标签的位置和内容
    const templateRegex = /<template([^>]*)>([\s\S]*?)<\/template>/gi;
    let match;

    while ((match = templateRegex.exec(html)) !== null) {
      templates.push({
        full: match[0],
        attributes: match[1] || "",
        content: match[2] || "",
        start: match.index,
        placeholder: `__TEMPLATE_PLACEHOLDER_${placeholder++}__`
      });
    }

    // 从后往前替换，避免索引偏移问题
    for (let i = templates.length - 1; i >= 0; i--) {
      const template = templates[i];
      const scopeId = generateScopeId(scopePrefix);

      // 处理内容
      const processedContent = addScopeToHTML(template.content, scopeId);

      // 创建新的div标签，保留原有属性
      const attributesStr = template.attributes
        ? ` ${template.attributes.trim()}`
        : "";
      const newDiv = `<div data-${scopeId}=""${attributesStr}>${processedContent}</div>`;

      // 替换原始template
      tempHtml =
        tempHtml.substring(0, template.start) +
        newDiv +
        tempHtml.substring(template.start + template.full.length);
    }

    // 检查是否还有嵌套的template需要处理
    if (tempHtml.includes("<template>") && depth < config.maxDepth - 1) {
      return parseHTML(tempHtml, depth + 1);
    }

    return tempHtml;
  }

  // 为HTML内容添加作用域属性
  function addScopeToHTML(html, scopeId) {
    // 处理HTML标签（改进的正则，支持自闭合标签）
    let processedHtml = html.replace(
      /<(\w+)([^>]*?)(\/?)>/g,
      (match, tagName, attributes, selfClosing) => {
        // 跳过已经有作用域属性的标签
        if (
          attributes.includes("data-v-") ||
          attributes.includes(`data-${scopeId}`) ||
          attributes.includes(`data-${scopePrefix}-`)
        ) {
          return match;
        }

        // 处理特殊标签（不需要作用域的）
        const skipTags = ["script", "style", "template"];
        if (skipTags.includes(tagName.toLowerCase())) {
          return match;
        }

        // 为标签添加作用域属性
        return `<${tagName} data-${scopeId}=""${attributes}${selfClosing}>`;
      }
    );

    // 处理style标签中的CSS
    processedHtml = processedHtml.replace(
      /<style([^>]*?)>([\s\S]*?)<\/style>/gi,
      (match, styleAttrs, cssContent) => {
        // 跳过已处理的CSS
        if (
          cssContent.includes(`[data-${scopeId}]`) ||
          cssContent.includes(`[data-${scopePrefix}-`)
        ) {
          return match;
        }

        const scopedCSS = addScopeToCSS(cssContent, scopeId);
        return `<style${styleAttrs}>${scopedCSS}</style>`;
      }
    );

    return processedHtml;
  }

  // 为CSS添加作用域（改进版本）
  function addScopeToCSS(cssContent, scopeId) {
    // 保存注释
    const comments = [];
    let commentIndex = 0;

    if (config.preserveComments) {
      cssContent = cssContent.replace(/\/\*[\s\S]*?\*\//g, (match) => {
        const placeholder = `__CSS_COMMENT_${commentIndex++}__`;
        comments.push({ placeholder, content: match });
        return placeholder;
      });
    }

    // 改进的CSS规则处理
    function processCSS(css, level = 0) {
      if (level > 5) return css; // 防止过深的嵌套

      // 匹配CSS规则块
      const ruleRegex = /([^{}]+)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;

      return css.replace(ruleRegex, (match, selectors, content) => {
        const trimmedSelectors = selectors.trim();

        // 处理@规则
        if (trimmedSelectors.startsWith("@")) {
          // @keyframes不需要作用域
          if (trimmedSelectors.startsWith("@keyframes")) {
            return match;
          }

          // @media, @supports等需要递归处理内部规则
          if (content.includes("{")) {
            const processedContent = processCSS(content, level + 1);
            return `${selectors} {${processedContent}}`;
          }

          return match;
        }

        // 处理普通选择器
        const processedSelectors = trimmedSelectors
          .split(",")
          .map((selector) => {
            selector = selector.trim();

            // 跳过特殊情况
            if (
              !selector ||
              selector.startsWith("@") ||
              /^(from|to|\d+%)$/.test(selector) ||
              selector.includes(`[data-${scopeId}]`)
            ) {
              return selector;
            }

            // 清理现有的作用域属性
            selector = selector.replace(/\[data-[a-z0-9-]+\]/gi, "").trim();

            // 处理复杂选择器
            const selectorParts = selector.split(/\s+/);

            // 处理第一个选择器部分
            if (selectorParts.length > 0) {
              // 处理组合选择器（如 .class1.class2）
              const firstPart = selectorParts[0];
              const combinedSelectors = firstPart.split(/(?=[.#[])/);

              if (combinedSelectors.length > 1) {
                // 在第一个实际选择器后添加作用域
                combinedSelectors[0] = addScopeToSimpleSelector(
                  combinedSelectors[0],
                  scopeId
                );
                selectorParts[0] = combinedSelectors.join("");
              } else {
                selectorParts[0] = addScopeToSimpleSelector(firstPart, scopeId);
              }
            }

            return selectorParts.join(" ");
          })
          .join(", ");

        return `${processedSelectors} {${content}}`;
      });
    }

    // 处理CSS
    let processedCSS = processCSS(cssContent);

    // 恢复注释
    if (config.preserveComments) {
      comments.forEach(({ placeholder, content }) => {
        processedCSS = processedCSS.replace(placeholder, content);
      });
    }

    return processedCSS;
  }

  // 开始处理
  try {
    return parseHTML(htmlString);
  } catch (error) {
    console.error("Error in addTemplateScopeIsolation:", error);
    return htmlString; // 出错时返回原始内容
  }
}

/**
 * 根据函数名查找对应的pug文件路径
 * @param {string} functionName - 函数名（可以是模板函数名或数据获取函数名）
 * @returns {Promise<string|null>} 返回对应的pug文件路径，如果未找到则返回null
 */
export async function getFilePathByFunctionName(functionName) {
  try {
    // 获取所有pug文件路径
    const pagesPugFilePathArr = await getPagesPugFilePathArr();

    // 清理函数名，移除get_前缀和_data后缀（如果存在）
    let cleanFunctionName = functionName;
    if (functionName.startsWith("get_") && functionName.endsWith("_data")) {
      // 数据获取函数名格式：get_xxx_data
      cleanFunctionName = functionName.slice(4, -5); // 移除 "get_" 和 "_data"
    }

    // 遍历所有pug文件，找到匹配的文件
    for (const fileName of pagesPugFilePathArr) {
      // 根据fileName生成函数名（与generate.js中的逻辑保持一致）
      const generatedFunctionName = fileName
        .split(pathSymbol)
        .join("_")
        .slice(0, -4) // 移除.pug扩展名
        .replaceAll(/[-]/g, "_");

      // 检查是否匹配
      if (
        generatedFunctionName === cleanFunctionName ||
        generatedFunctionName === functionName
      ) {
        return fileName;
      }
    }

    return null;
  } catch (error) {
    console.error("根据函数名查找文件路径失败:", error);
    return null;
  }
}

/**
 * 获取 AB 测试信息
 * @param {string} siteAbbr - 站点简称（如 config.siteConfig.siteAbbr）
 * @returns {Promise<object|null>} 返回 ABTestInfo 对象或 null
 */
export async function fetchABTestInfo(siteAbbr) {
  try {
    const res = await axios.get("http://new.sp.com/open-api/abtest-info", {
      params: { site: siteAbbr }
    });
    return res && res.data && res.data.result ? res.data.result : null;
  } catch (error) {
    console.error("获取ABTestInfo失败:", error);
    return null;
  }
}

/**
 * 从接口获取语言列表
 * @returns {Promise<string[]>} 返回语言列表
 */
export async function getLanguageListFromApi() {
  try {
    console.log("正在从接口获取语言列表...");
    const response = await axios.get(
      `http://new.sp.com/open-api/get_site_online_languages?site=${config.siteConfig.siteName}`
    );

    if (
      response.data &&
      response.data.success &&
      response.data.result?.length
    ) {
      const languageList = response.data.result;
      console.log("成功获取语言列表:", languageList);
      return languageList;
    } else {
      console.warn(
        "接口返回数据格式不正确:",
        response.data,
        "将使用config中的语言列表"
      );
      return config.languageList;
    }
  } catch (error) {
    throw new Error("从接口获取语言列表失败:" + error);
  }
}
