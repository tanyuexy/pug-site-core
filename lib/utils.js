import fse from "fs-extra";
import path from "path";
import tcpPortUsed from "tcp-port-used";
import { config } from "./config.js";
import JavaScriptObfuscator from "javascript-obfuscator";

const __dirname = path.resolve();
// 根据操作系统设置路径分隔符
export const pathSymbol = process.platform.startsWith("win") ? "\\" : "/";

/**
 * 获取pages目录下所有pug文件的路径数组
 * @param {boolean} isFilter - 是否需要过滤路径（去除语言和设备类型目录）
 * @returns {Promise<string[]>} 返回pug文件路径数组
 */
export async function getPagesPugFilePathArr(isFilter) {
  let pagesPugFilePathArr = (
    await fse.readdir(path.join(__dirname, "/template/pages"), {
      recursive: true
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
 * @param {string} Ip - IP地址
 * @returns {Promise<number>} 返回可用的端口号
 */
export async function getIdleProt(port, Ip) {
  while (1) {
    if (!(await tcpPortUsed.check(port, Ip))) {
      break;
    }
    port++;
  }
  return port;
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
    disableConsoleOutput: true,

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
