import fse from "fs-extra";
import pug from "pug";
import pugLexer from "pug-lexer";
import pugParser from "pug-parser";
import pugWalk from "pug-walk";
import {
  getPagesPugFilePathArr,
  getCompilePugFilter,
  pathIsSame,
  sleep,
  pathSymbol,
  obfuscateJavaScript,
  addTemplateScopeIsolation,
  getJsonData,
} from "./utils.js";
import _ from "lodash";
import async from "async";
import UglifyJS from "uglify-js";
import { minify as htmlMinify } from "html-minifier-terser";
import { paths } from "./paths.js";
import path from "path";

const { config } = await import(paths.config);

/**
 * 将pages目录下的pug模板编译为JS函数
 * @param {string} pugPath - 指定编译的pug文件路径(相对于/template/pages)
 * @throws {Error} 当路径不存在或编译失败时抛出错误
 * @returns {Promise<void>}
 */
export async function compilePagesPugToFn(pugPath) {
  try {
    // 获取所有需要编译的pug文件路径
    const pagesPugFilePathArr = await getPagesPugFilePathArr();

    // 读取pug运行时代码作为基础代码
    const lastPugFnStr = await fse.readFile(paths.pugRuntime, "utf8");

    // 验证指定路径是否存在
    if (
      pugPath &&
      !fse.pathExistsSync(paths.resolveRoot(paths.template.pages, pugPath))
    ) {
      throw new Error("路径不存在! 注意路径前面会自动拼接/template/pages");
    }
    let compiledCode = lastPugFnStr;
    if (config.isScopeIsolation) {
      // 添加作用域处理函数到编译后的代码中
      const scopeIsolationFn = `${addTemplateScopeIsolation.toString()}`;
      compiledCode = compiledCode + scopeIsolationFn;
    }
    // 使用async库并发编译pug文件
    await async.eachLimit(
      // 过滤出需要编译的文件
      pagesPugFilePathArr.filter(
        (fileName) => !pugPath || pathIsSame(pugPath, fileName)
      ),
      10, // 限制并发数为10
      async (fileName) => {
        const filePath = paths.resolveRoot(paths.template.pages, fileName);
        const funName = fileName
          .split(pathSymbol)
          .join("_")
          .slice(0, -4)
          .replaceAll(/[-]/g, "_");

        // 读取并编译pug文件
        const pugValue = await fse.readFile(filePath, "utf8");

        const fnStr = pug.compileClient(pugValue, {
          filename: filePath,
          basedir: paths.template.root,
          compileDebug: true,
          name: funName,
          filters: getCompilePugFilter(),
        });

        // 提取函数定义部分
        const functionStart = fnStr.indexOf(`function ${funName}(locals)`);
        const functionEnd = fnStr.lastIndexOf("}") + 1;

        if (functionStart === -1) {
          throw new Error(`无法在编译结果中找到函数 ${funName}`);
        }

        // 只提取函数定义部分并转换为ES模块格式
        let functionBody = fnStr.slice(functionStart, functionEnd);

        if (config.isScopeIsolation) {
          // 修改函数体，在返回HTML之前添加作用域处理
          functionBody = functionBody.replace(
            /return\s+(.*?);?\s*}$/,
            `const html = $1;return addTemplateScopeIsolation(html);}`
          );
        }

        const exportFn = functionBody.replace(
          `function ${funName}(locals)`,
          `export function ${funName}(locals)`
        );

        compiledCode += exportFn;
      }
    );

    // 压缩代码
    const result = UglifyJS.minify(compiledCode);
    if (result.error) {
      throw new Error(`代码压缩失败: ${result.error}`);
    }

    // 写入最终文件
    const outputPath = paths.resolveRoot("pagesPugFn", "index.js");
    await fse.ensureFile(outputPath);
    await fse.writeFile(outputPath, result.code);
  } catch (error) {
    console.error("编译PUG模板失败:", error);
    throw error;
  }
}

/**
 * 向getData.js中注入数据获取函数
 * 为每个pug模板自动生成对应的数据获取函数
 * @returns {Promise<void>}
 */
export async function generateGetDataFn() {
  try {
    const getDataPath = paths.resolveRoot("getData.js");
    const getDataFile = await fse.readFile(getDataPath, "utf8");
    const pagesPugFilePathArr = await getPagesPugFilePathArr();

    // 使用正则表达式检查init函数是否存在
    const initFunctionRegex = /export\s+async\s+function\s+init\s*\(\s*\)/;
    if (!initFunctionRegex.test(getDataFile)) {
      const initFn = `export async function init() {
  //初始化操作,在获取页面数据前执行
}`;
      await fse.appendFile(getDataPath, initFn + "\n");
    }

    // 使用正则表达式检查公共数据获取函数是否存在
    const commonDataFnRegex =
      /export\s+async\s+function\s+get_common_data\s*\(\s*language\s*\)/;
    if (!commonDataFnRegex.test(getDataFile)) {
      const commonDataFn = `export async function get_common_data(language) {
  return {}
}`;
      await fse.appendFile(getDataPath, commonDataFn + "\n");
    }

    // 为每个页面注入数据获取函数
    await async.each(pagesPugFilePathArr, async (fileName) => {
      const funName =
        "get_" +
        fileName.split(pathSymbol).join("_").slice(0, -4).replaceAll(/[-]/g, "_") +
        "_data";

      // 使用正则表达式检查特定的数据获取函数是否存在
      const dataFnRegex = new RegExp(
        `export\\s+async\\s+function\\s+${funName}\\s*\\(\\s*language\\s*\\)`
      );
      if (!dataFnRegex.test(getDataFile)) {
        const templateFn = config.getDataFnTemplate.toString();
        const dataFn = `export async ${templateFn.replace("template", funName)}`;
        await fse.appendFile(getDataPath, dataFn + "\n");
      }
    });
  } catch (error) {
    console.error("生成数据函数失败:", error);
    throw error;
  }
}

/**
 * 将数据获取并写入JSON文件
 * @param {Object[]} args - 过滤参数数组 f=func1,func2 c=jp,en
 * @returns {Promise<void>}
 */
export async function fetchDataToJsonFile(args) {
  try {
    console.log("开始获取数据...");
    let starTime = Date.now();

    // 解析过滤参数，使用对象解构使代码更清晰
    const { filterFun, filterLang } = args.reduce(
      (acc, item) => {
        const [key, value] = item.split("=");
        if (value) {
          if (key === "f") acc.filterFun = value.split(",");
          if (key === "c") acc.filterLang = value.split(",");
        }
        return acc;
      },
      { filterFun: [], filterLang: [] }
    );

    let isFillFun = (funName) => {
      if (filterFun.length) {
        return filterFun.includes(funName);
      }
      return true;
    };

    let saveJsonData = async (filePath, data) => {
      let finalPath = paths.resolveRoot("jsonData", filePath);
      await fse.remove(finalPath);
      await fse.outputJson(finalPath, data);
    };

    let checkData = (data, language, funName) => {
      if (data === null || typeof data !== "object") {
        return Promise.reject(
          new Error(`${language} ${funName} 期望返回数组、对象类型返回: ${data}`)
        );
      }
      if (Array.isArray(data)) {
        if (data.length === 0) {
          return Promise.reject(new Error(`${language} ${funName} 数据为空数组`));
        }
        data.forEach((item, index) => {
          if (item === null || typeof item !== "object" || Array.isArray(item)) {
            return Promise.reject(
              new Error(
                `${language} ${funName} 返回的数据不为对象数组类型返回: ${item} 下标为${index}`
              )
            );
          }
        });
      }
      return Promise.resolve();
    };

    // 如果没有过滤条件，清空输出目录
    if (!filterFun.length && !filterLang.length) {
      await fse.remove(paths.resolveRoot("jsonData"));
    }

    const getData = await import(paths.getData);

    // 执行初始化函数
    if (getData.init && typeof getData.init === "function") {
      console.log("开始执行init初始化函数...");
      const initStartTime = Date.now();
      await getData.init();
      const initCostTime = (Date.now() - initStartTime) / 1000;
      console.log("初始化函数执行完成,耗时:", initCostTime, "s");
    }

    const pugFilePathList = await getPagesPugFilePathArr();

    const { languageList, customBuildData, fetchDataConcurrencyLimit } = config;

    // 创建一个全局任务队列控制整体并发数
    const queue = async.queue(async (task) => {
      await task();
    }, fetchDataConcurrencyLimit || 3);

    // 收集所有需要执行的任务
    const allTasks = [];

    // 过滤出需要处理的语言
    const languagesToProcess = filterLang.length
      ? languageList.filter((lang) => filterLang.includes(lang))
      : languageList;

    for (const language of languagesToProcess) {
      // 清空指定语言的数据目录
      if (filterLang.includes(language) && !filterFun.length) {
        await fse.remove(paths.resolveRoot("jsonData", language));
      }

      // 处理公共数据
      const commonFuncName = "get_common_data";
      if (isFillFun(commonFuncName)) {
        allTasks.push(async () => {
          console.log(language, commonFuncName, "开始写入json文件");
          const commonData = await getData[commonFuncName](language);
          let languageData = (await import(paths.languageData)).default[language];
          commonData.lang = _.merge(commonData.lang, languageData);
          await fse.outputJSON(
            paths.resolveRoot("jsonData", language, "_common.json"),
            commonData
          );
        });
      }

      // 处理自定义数据
      if (customBuildData?.length) {
        for (const obj of customBuildData) {
          if (
            obj.includeLang &&
            obj.includeLang.length > 0 &&
            !obj.includeLang.includes(language)
          ) {
            continue;
          }

          let dataFn = getData[obj.getDataFn];
          if (!dataFn || typeof dataFn !== "function") {
            return Promise.reject(new Error(obj.getDataFn + "获取数据函数不存在"));
          }

          if (!isFillFun(obj.getDataFn)) {
            continue;
          }

          allTasks.push(async () => {
            console.log(language, obj.getDataFn, "开始写入json文件");
            let data = await dataFn(language);
            await checkData(data, language, obj.getDataFn);
            let outPutPath = obj.outPutPath.split("/").join(pathSymbol);
            if (Array.isArray(data)) {
              let name = outPutPath
                .split(pathSymbol)
                .pop()
                .replace(/\.[^.]*$/, "");
              const regex = /^\[.+\]$/;
              if (regex.test(name)) {
                let property = name.slice(1, -1);
                // 使用async.eachLimit替换for循环，并发写入
                await async.eachLimit(data, 12, async (dataItem, index) => {
                  let fileName = dataItem[property];
                  if (!fileName) {
                    return Promise.reject(
                      new Error(
                        `${language} ${obj.getDataFn} 获取的数据中期望以${property}属性命名文件但是${index}下标中对象属性不存在或者为空字符串`
                      )
                    );
                  }
                  await saveJsonData(
                    paths.join(language, outPutPath.replace(name, fileName)),
                    dataItem
                  );
                });
              } else {
                await saveJsonData(paths.join(language, outPutPath), data);
              }
            } else if (typeof data === "object") {
              await saveJsonData(paths.join(language, outPutPath), data);
            }
          });
        }
      }
      // 处理模板页面数据
      for (const fileName of pugFilePathList) {
        let funName =
          "get_" +
          fileName.split(pathSymbol).join("_").slice(0, -4).replaceAll(/[-]/g, "_") +
          "_data";

        let jsonFilePath = fileName.slice(0, -4).split(pathSymbol);
        if (!getData[funName] || typeof getData[funName] !== "function") {
          return Promise.reject(new Error(`${funName} 获取数据函数不存在`));
        }

        if (!isFillFun(funName)) {
          continue;
        }

        allTasks.push(async () => {
          console.log(language, funName, "开始写入json文件");
          let data = await getData[funName](language);
          await checkData(data, language, funName);
          if (Array.isArray(data)) {
            await async.eachLimit(data, 12, async (item, index) => {
              let lastJsonFilePath;
              if (item.page_name) {
                lastJsonFilePath = paths.join(
                  language,
                  ...jsonFilePath.slice(0, -1),
                  item.page_name
                );
              } else {
                console.warn("下标:", index, "无page_name属性,使用index作为文件名");
                lastJsonFilePath =
                  paths.join(language, ...jsonFilePath) +
                  "_" +
                  (index + 1) +
                  ".json";
              }
              item._template = fileName;
              await saveJsonData(lastJsonFilePath, item);
            });
          } else {
            if (data.page_name) {
              jsonFilePath = paths.join(
                language,
                ...jsonFilePath.slice(0, -1),
                data.page_name
              );
            } else {
              jsonFilePath = paths.join(language, ...jsonFilePath) + ".json";
            }
            data._template = fileName;
            await saveJsonData(jsonFilePath, data);
          }
        });
      }
    }

    // 将所有任务添加到队列
    allTasks.forEach((task) => queue.push(task));

    // 等待所有任务完成
    return new Promise((resolve, reject) => {
      queue.drain(() => {
        console.log("获取数据并写入完成花费:", (Date.now() - starTime) / 1000, "s");
        resolve();
      });

      queue.error((err) => {
        reject(err);
      });
    });
  } catch (error) {
    console.error("获取数据失败:", error);
    throw error;
  }
}

export async function buildFn() {
  // const jsonDataPath = paths.resolveRoot("jsonData");
  // if (!fse.pathExistsSync(jsonDataPath)) {
  //   return Promise.reject(
  //     new Error(jsonDataPath + "目录不存在请先执行npm run getData生成数据!")
  //   );
  // }
  console.log("开始打包...");
  let starTime = Date.now();
  let outputPath = paths.resolveRoot(config.fnOutput);
  await fse.remove(outputPath);
  await sleep(0);
  await compilePagesPugToFn();
  await fse.copy(
    paths.resolveRoot("pagesPugFn/index.js"),
    paths.resolveRoot(outputPath, "page/pages.js")
  );

  const routerPath = paths.resolveRoot("router.js");
  if (!fse.pathExistsSync(routerPath)) {
    return Promise.reject(new Error("router.js文件不存在"));
  }

  await fse.copy(routerPath, paths.resolveRoot(outputPath, "page/router.js"));
  await fse.copy(paths.public, paths.resolveRoot(outputPath, "page"));

  let totalCommonData = {};
  totalCommonData.langCommon = config.commonData;
  let languageData = (await import(paths.languageData)).default
  await async.each(config.languageList, async (lang) => {
    let commonData = await (await import(paths.getData))["get_common_data"](lang);
    commonData.lang = _.merge(commonData.lang, languageData[lang]);
    totalCommonData[lang] = commonData;
  });

  // await fse.copy(jsonDataPath, paths.resolveRoot(outputPath, "data"), {
  //   filter: (src, dest) => {
  //     // 排除_common.json 文件
  //     return !src.endsWith("_common.json");
  //   },
  // });

  await fse.copy(
    paths.template.static,
    paths.resolveRoot(outputPath, "page/static"),
    {
      filter: (src, dest) => {
        //根目录必须要返回true
        if (src.endsWith("static")) {
          return true;
        }
        if (config.buildStaticDirArr && config.buildStaticDirArr.length > 0) {
          return !!config.buildStaticDirArr.find((item) => {
            return src.startsWith(paths.resolveRoot(paths.template.static, item));
          });
        }
        return true;
      },
    }
  );

  await fse.writeJSON(
    paths.resolveRoot(outputPath, "page", "common") + ".json",
    totalCommonData
  );

  if (config.obfuscateJavaScript) {
    console.log("开始混淆js文件...");
    const startTime = Date.now();
    await obfuscateJavaScript(paths.resolveRoot(outputPath, "page", "static"));
    const costTime = (Date.now() - startTime) / 1000;
    console.log("混淆js文件耗时:", costTime, "s");
  }

  console.log("打包完成花费:", (Date.now() - starTime) / 1000, "s");
}

//html文件打包
export async function buildStatic() {
  let jsonDataPath = paths.resolveRoot("jsonData");

  console.log("开始打包...");
  let starTime = Date.now();
  let distOutputPath = paths.resolveRoot(config.staticOutput);

  // HTML压缩配置
  const htmlMinifyOptions = {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    minifyCSS: true,
    minifyJS: true,
    useShortDoctype: true,
    removeEmptyAttributes: true,
    removeOptionalTags: true,
    caseSensitive: false,
  };

  /**
   * 压缩HTML内容
   * @param {string} html - 原始HTML内容
   * @param {string} filePath - 文件路径（用于错误报告）
   * @returns {string} 压缩后的HTML内容
   */
  async function compressHtml(html, filePath = "") {
    // 检查是否启用HTML压缩
    if (!config.minifyHtml) {
      return html; // 如果禁用压缩，直接返回原始HTML
    }

    try {
      return await htmlMinify(html, htmlMinifyOptions);
    } catch (error) {
      console.warn(`HTML压缩失败 [${filePath}]`);
      return html; // 如果压缩失败，返回原始HTML
    }
  }

  /**
   * 构建HTML文件路径
   * @param {string} lang - 语言代码
   * @param {string} outputPath - 输出路径
   * @param {string} fileName - 文件名（可选）
   * @returns {string} 完整的HTML文件路径
   */
  function buildHtmlPath(lang, outputPath, fileName = null) {
    if (fileName) {
      const htmlPath = paths.resolveRoot(
        distOutputPath,
        lang,
        outputPath.replace(
          outputPath
            .split("/")
            .pop()
            .replace(/\.[^.]*$/, ""),
          fileName.replace(/\.[^.]*$/, "")
        )
      );
      console.log(htmlPath);
      return htmlPath;
    } else {
      const htmlPath = paths.resolveRoot(distOutputPath, lang, outputPath);
      console.log(htmlPath);
      return htmlPath;
    }
  }

  /**
   * 生成HTML内容
   */
  function generateHtml(pagesPugToFn, funName, data, pagePath, commonData) {
    if (!pagesPugToFn[funName]) {
      throw new Error(`模板函数 ${funName} 不存在`);
    }

    return pagesPugToFn[funName]({
      data,
      _pagePath: pagePath,
      common: commonData,
    });
  }

  /**
   * 处理数组数据的HTML输出
   */
  async function processArrayData(
    pagesPugToFn,
    data,
    obj,
    funName,
    pagePath,
    commonData,
    lang
  ) {
    try {
      const name = obj.outPutHtmlPath
        .split("/")
        .pop()
        .replace(/\.[^.]*$/, "");
      const regex = /^\[.+\]$/;

      if (regex.test(name)) {
        const property = name.slice(1, -1);

        await async.eachLimit(data, 128, async (dataItem, index) => {
          const fileName = dataItem[property];
          if (!fileName) {
            throw new Error(`数据项索引 ${index} 中缺少属性 ${property} 或值为空`);
          }

          const htmlPath = buildHtmlPath(lang, obj.outPutHtmlPath, fileName);
          const html = generateHtml(
            pagesPugToFn,
            funName,
            dataItem,
            pagePath,
            commonData
          );
          const compressedHtml = await compressHtml(html, htmlPath);
          await fse.outputFile(htmlPath, compressedHtml);
        });
      } else {
        const htmlPath = buildHtmlPath(lang, obj.outPutHtmlPath);
        const html = generateHtml(pagesPugToFn, funName, data, pagePath, commonData);
        const compressedHtml = await compressHtml(html, htmlPath);
        await fse.outputFile(htmlPath, compressedHtml);
      }
    } catch (error) {
      console.error(
        `处理数组数据失败 [lang: ${lang}, getDataFn: ${obj.getDataFn}]:`,
        error
      );
      throw error;
    }
  }

  /**
   * 处理对象数据的HTML输出
   */
  async function processObjectData(
    pagesPugToFn,
    data,
    obj,
    funName,
    pagePath,
    commonData,
    lang
  ) {
    try {
      const htmlPath = buildHtmlPath(lang, obj.outPutHtmlPath);
      const html = generateHtml(pagesPugToFn, funName, data, pagePath, commonData);
      const compressedHtml = await compressHtml(html, htmlPath);
      await fse.outputFile(htmlPath, compressedHtml);
    } catch (error) {
      throw new Error(
        `处理对象数据失败 [lang: ${lang}, getDataFn: ${obj.getDataFn}]: ${error}`
      );
    }
  }

  /**
   * 处理自定义HTML构建
   */
  async function processCustomBuildHtml(
    pagesPugToFn,
    lang,
    getData,
    commonData,
    dealWithEndFunName
  ) {
    if (!config.customBuildHtml?.length) return;

    await async.eachLimit(config.customBuildHtml, 3, async (obj) => {
      try {
        // 检查语言过滤
        if (obj.includeLang?.length > 0 && !obj.includeLang.includes(lang)) {
          return;
        }

        // 获取数据
        if (
          !getData[obj.getDataFn] ||
          typeof getData[obj.getDataFn] !== "function"
        ) {
          throw new Error(`数据获取函数 ${obj.getDataFn} 不存在或不是函数`);
        }
        let getDataFn = getData[obj.getDataFn].bind({
          getR2Data: async (jsonPath) => {
            jsonPath = paths.join(lang, jsonPath);
            let data = await getJsonData(jsonPath);
            return data;
          },
        });
        const data = await getDataFn(lang);

        // 处理路径和函数名
        obj.inputPugPath = obj.inputPugPath.replace(/^\//, "");
        const funName = obj.inputPugPath.split("/").join("_").slice(0, -4);
        dealWithEndFunName.set(funName, 1);
        const pagePath = obj.inputPugPath.replaceAll("/", pathSymbol);

        // 根据数据类型处理
        if (Array.isArray(data)) {
          await processArrayData(
            pagesPugToFn,
            data,
            obj,
            funName,
            pagePath,
            commonData,
            lang
          );
        } else if (typeof data === "object" && data !== null) {
          await processObjectData(
            pagesPugToFn,
            data,
            obj,
            funName,
            pagePath,
            commonData,
            lang
          );
        } else {
          throw new Error(`数据类型不支持: ${typeof data}`);
        }
      } catch (error) {
        console.error(
          `处理自定义HTML构建失败 [lang: ${lang}, config: ${JSON.stringify(obj)}]:`,
          error
        );
        throw error;
      }
    });
  }

  /**
   * 处理页面JSON文件
   */
  async function processPageJsonFiles(
    pagesPugToFn,
    lang,
    langDataPath,
    commonData,
    dealWithEndFunName
  ) {
    try {
      const pagesAllJsonFileName = (
        await fse.readdir(langDataPath, { recursive: true })
      ).filter((fileName) => fileName.endsWith(".json"));

      await async.eachLimit(pagesAllJsonFileName, 128, async (jsonFileName) => {
        const data = await fse.readJSON(
          paths.resolveRoot(langDataPath, jsonFileName)
        );
        const pugTemplate = data._template;

        if (!pugTemplate) {
          return;
        }

        const funName = pugTemplate.split(pathSymbol).join("_").slice(0, -4);

        if (dealWithEndFunName.has(funName)) {
          return;
        }

        // 构建输出路径
        let finalPugTemplate = pugTemplate;
        if (data.page_name) {
          finalPugTemplate =
            pugTemplate.split(pathSymbol).slice(0, -1).join(pathSymbol) +
            pathSymbol +
            data.page_name;
        }

        const htmlPath = paths.resolveRoot(
          distOutputPath,
          lang,
          finalPugTemplate.replace(/\.[^.]*$/, ".html")
        );
        console.log(htmlPath);

        const html = generateHtml(
          pagesPugToFn,
          funName,
          data,
          pugTemplate,
          commonData
        );

        const compressedHtml = await compressHtml(html, htmlPath);
        await fse.outputFile(htmlPath, compressedHtml);
      });
    } catch (error) {
      console.error(`处理页面JSON文件失败 [lang: ${lang}]:`, error);
      throw error;
    }
  }

  try {
    const getData = await import(paths.getData);

    // 清理并准备输出目录
    await fse.remove(distOutputPath);
    await sleep(0);
    await fse.copy(paths.public, distOutputPath);

    // 复制静态资源
    await fse.copy(
      paths.template.static,
      paths.resolveRoot(distOutputPath, "static"),
      {
        filter: (src, dest) => {
          //根目录必须要返回true
          if (src.endsWith("static")) {
            return true;
          }
          if (config.buildStaticDirArr && config.buildStaticDirArr.length > 0) {
            return !!config.buildStaticDirArr.find((item) => {
              return src.startsWith(paths.resolveRoot(paths.template.static, item));
            });
          }
          return true;
        },
      }
    );

    // 编译PUG模板
    await compilePagesPugToFn();
    const PagesPugToFn = await import(paths.pagesPugFn);

    // 显示HTML压缩状态
    if (config.minifyHtml) {
      console.log("HTML压缩功能已启用");
    } else {
      console.log("HTML压缩功能已禁用");
    }

    // 执行初始化函数
    if (getData.init && typeof getData.init === "function") {
      console.log("开始执行init初始化函数...");
      const initStartTime = Date.now();
      await getData.init();
      const initCostTime = (Date.now() - initStartTime) / 1000;
      console.log("初始化函数执行完成,耗时:", initCostTime, "s");
    }

    // 处理每种语言
    await async.eachSeries(config.languageList, async (lang) => {
      try {
        console.log("开始处理语言:", lang);
        const langDataPath = paths.resolveRoot(jsonDataPath, lang);

        // 读取公共数据
        let commonData;
        try {
          commonData = await fse.readJSON(
            paths.resolveRoot("jsonData", lang, "_common.json")
          );
          commonData = _.merge(commonData, config.commonData);
        } catch (error) {
          throw new Error(`读取公共数据失败: ${error.message}`);
        }

        const dealWithEndFunName = new Map();

        // 处理自定义HTML构建
        await processCustomBuildHtml(
          PagesPugToFn,
          lang,
          getData,
          commonData,
          dealWithEndFunName
        );

        // 处理页面JSON文件
        await processPageJsonFiles(
          PagesPugToFn,
          lang,
          langDataPath,
          commonData,
          dealWithEndFunName
        );

        console.log("处理语言:", lang, "完成");
      } catch (error) {
        console.error(`处理语言 ${lang} 失败:`, error);
        throw error;
      }
    });

    // 混淆JavaScript文件（如果配置了）
    if (config.obfuscateJavaScript) {
      console.log("开始混淆js文件...");
      const startTime = Date.now();
      try {
        await obfuscateJavaScript(paths.resolveRoot(distOutputPath, "static"));
        const costTime = (Date.now() - startTime) / 1000;
        console.log("混淆js文件耗时:", costTime, "s");
      } catch (error) {
        console.error(`混淆JavaScript文件失败:`, error);
        throw error;
      }
    }

    console.log("打包完成花费:", (Date.now() - starTime) / 1000, "s");
  } catch (error) {
    console.error("HTML文件打包失败:", error);
    throw error;
  }
}

/**
 * 创建调试模板目录
 * 复制template目录到template-debug并为所有pug文件添加调试属性
 * @returns {Promise<void>}
 */
export async function createDebugTemplate() {
  try {
    console.log("开始创建调试模板目录...");

    const sourceDir = paths.template.root;
    const targetDir = paths.template.debug;

    // 删除已存在的调试目录
    if (await fse.pathExists(targetDir)) {
      await fse.remove(targetDir);
      console.log("已删除现有的调试目录");
    }

    // 复制整个 template 目录到 template-debug
    await fse.copy(sourceDir, targetDir);
    console.log(`已复制 ${sourceDir} 到 ${targetDir}`);

    let languageData = (await import(paths.languageData)).default.us;

    // 缓存语言路径检查结果，避免重复计算
    const langPathCache = new Map();

    /**
     * 检查属性路径是否在languageData的us对象中存在
     * @param {string} langPath - 属性路径，例如 "Store.about"
     * @returns {boolean} 是否存在该属性
     */
    function checkLangPathExists(langPath) {
      // 使用缓存提升性能
      if (langPathCache.has(langPath)) {
        return langPathCache.get(langPath);
      }

      try {
        const keys = langPath.split(".");
        let current = languageData;

        for (const key of keys) {
          if (current && typeof current === "object" && key in current) {
            current = current[key];
          } else {
            langPathCache.set(langPath, false);
            return false;
          }
        }

        const isValid = typeof current === "string";
        langPathCache.set(langPath, isValid);
        return isValid;
      } catch (error) {
        langPathCache.set(langPath, false);
        return false;
      }
    }

    /**
     * 检查是否是动态内容
     * @param {string} code - 代码内容
     * @returns {boolean} 是否包含动态数据
     */
    function isDynamicContent(code) {
      // 更精确的动态内容检测
      const dynamicPatterns = [
        /\b(Math|Date|JSON|parseInt|parseFloat|Number|String|Array|Object)\b/,
        /\b(data|item|index|info|common\.siteConfig)\b/,
        /[+\-*/%]/,
        /\brandom\b|\bfloor\b|\bceil\b|\bround\b/,
        /\.\w+\(/, // 方法调用
        /\$\{[^}]*[+\-*/%.][^}]*\}/, // 模板字符串中的计算
      ];

      return dynamicPatterns.some((pattern) => pattern.test(code));
    }

    /**
     * 提取Pug节点中的common.lang引用
     * @param {string} code - 代码内容
     * @returns {string|null} 语言路径，如果不是common.lang引用则返回null
     */
    function extractLangPath(code) {
      // 匹配 common.lang.xxx
      const langMatch = code.match(/common\.lang\.(.+)/);
      if (langMatch) {
        return langMatch[1];
      }

      // 匹配 ${common.lang.xxx}
      const templateLangMatch = code.match(/\$\{common\.lang\.([^}]+)\}/);
      if (templateLangMatch) {
        return templateLangMatch[1];
      }

      // 匹配带反引号的模板字符串 `${common.lang.xxx}`
      const backquoteLangMatch = code.match(/`.*\$\{common\.lang\.([^}]+)\}.*`/);
      if (backquoteLangMatch) {
        return backquoteLangMatch[1];
      }

      return null;
    }

    /**
     * 使用 pug-parser 和 pug-walk 分析 pug 文件中的标签
     * @param {string} pugContent - pug 文件内容
     * @param {string} filename - 文件名
     * @returns {Map} 行号到标签信息的映射
     */
    function analyzeTagsFromPug(pugContent, filename) {
      try {
        const tokens = pugLexer(pugContent, { filename });
        const ast = pugParser(tokens, { filename, src: pugContent });

        const lineTagMap = new Map();

        pugWalk(ast, function before(node) {
          if (node.type === "Tag" && node.line) {
            const tagInfo = {
              tagName: node.name,
              line: node.line,
              isEditable: false,
              editableValue: "true",
              textContent: "",
              langPath: "",
              hasStaticText: false,
              hasLangText: false,
            };

            // 分析标签的子节点来确定文本内容
            if (node.block && node.block.nodes) {
              for (const child of node.block.nodes) {
                // 处理Text节点（静态文本）
                if (child.type === "Text" && child.val && child.val.trim()) {
                  // 检查是否在同一行还有其他动态内容
                  const hasOtherDynamicNodes = node.block.nodes.some(
                    (sibling) =>
                      sibling !== child &&
                      sibling.line === child.line &&
                      (sibling.type === "Code" ||
                        sibling.type === "InterpolatedTag") &&
                      sibling.val &&
                      isDynamicContent(sibling.val)
                  );

                  if (!hasOtherDynamicNodes) {
                    tagInfo.hasStaticText = true;
                    tagInfo.textContent = child.val.trim();
                    tagInfo.isEditable = true;
                  }
                }

                // 处理Code节点（插值表达式和代码块）
                if (child.type === "Code" && child.val) {
                  const langPath = extractLangPath(child.val);
                  if (langPath && !isDynamicContent(child.val)) {
                    if (checkLangPathExists(langPath)) {
                      tagInfo.hasLangText = true;
                      tagInfo.langPath = langPath;
                      tagInfo.isEditable = true;
                      // 转换为 [us][key1][key2] 格式
                      const pathParts = langPath.split(".");
                      tagInfo.editableValue = `us,${pathParts.join(",")}`;
                    }
                  }
                }
              }
            }

            // 检查节点本身是否有代码内容（对于!=语法）
            if (node.code && node.code.val) {
              const langPath = extractLangPath(node.code.val);
              if (langPath && !isDynamicContent(node.code.val)) {
                if (checkLangPathExists(langPath)) {
                  tagInfo.hasLangText = true;
                  tagInfo.langPath = langPath;
                  tagInfo.isEditable = true;
                  // 转换为 us,key1,key2 格式
                  const pathParts = langPath.split(".");
                  tagInfo.editableValue = `us,${pathParts.join(",")}`;
                }
              }
            }

            // 将标签信息添加到行映射中
            if (!lineTagMap.has(node.line)) {
              lineTagMap.set(node.line, []);
            }
            lineTagMap.get(node.line).push(tagInfo);
          }
        });

        return lineTagMap;
      } catch (error) {
        console.error(`分析 pug 文件 ${filename} 时出错:`, error);
        return new Map();
      }
    }

    /**
     * 为 pug 文件内容添加调试属性
     * @param {string} pugContent - pug 文件内容
     * @param {string} relativePath - 文件相对路径
     * @param {string} filename - 文件名
     * @returns {string} 处理后的 pug 内容
     */
    function addDebugAttributesToPug(pugContent, relativePath, filename) {
      try {
        const lines = pugContent.split("\n");
        const lineTagMap = analyzeTagsFromPug(pugContent, filename);

        // 定义不需要添加调试属性的标签
        const excludeTags = new Set([
          "head",
          "title",
          "meta",
          "link",
          "html",
          "style",
          "script",
          "base",
          "noscript",
          "template",
        ]);

        // 处理每一行
        const processedLines = lines.map((line, index) => {
          const lineNumber = index + 1;
          const tagsInLine = lineTagMap.get(lineNumber);

          if (!tagsInLine || tagsInLine.length === 0) {
            return line;
          }

          // 过滤掉不需要处理的标签
          const visibleTags = tagsInLine.filter(
            (tag) => !excludeTags.has(tag.tagName.toLowerCase())
          );

          if (visibleTags.length === 0) {
            return line;
          }

          // 对于每个标签，添加调试属性
          let processedLine = line;

          // 只处理第一个标签，避免处理插值表达式中的内容
          const mainTag = visibleTags[0];

          if (mainTag) {
            // 构建调试属性
            const debugAttrs = [
              `data-debug-file="${relativePath}"`,
              `data-debug-line="${lineNumber}"`,
            ];

            // 只有可编辑的元素才添加 data-debug-editable 属性
            if (mainTag.isEditable) {
              debugAttrs.push(`data-debug-editable="${mainTag.editableValue}"`);
            }

            const debugAttrsString = debugAttrs.join(", ");

            // 简化的标签处理逻辑
            const trimmedLine = line.trim();

            // 处理隐式 div（.class 或 #id 语法）
            if (trimmedLine.startsWith(".") || trimmedLine.startsWith("#")) {
              const indent = line.match(/^\s*/)[0];

              // 找到选择器结束的位置
              let selectorEndIndex = 1;
              while (
                selectorEndIndex < trimmedLine.length &&
                /[\w-]/.test(trimmedLine[selectorEndIndex])
              ) {
                selectorEndIndex++;
              }

              // 检查是否已经有属性括号
              const afterSelector = trimmedLine.substring(selectorEndIndex);
              const parenIndex = afterSelector.indexOf("(");

              if (parenIndex !== -1) {
                // 已经有属性括号
                const beforeParen = trimmedLine.substring(
                  0,
                  selectorEndIndex + parenIndex + 1
                );
                const afterFirstParen = trimmedLine.substring(
                  selectorEndIndex + parenIndex + 1
                );
                const lastParenIndex = afterFirstParen.lastIndexOf(")");

                if (lastParenIndex !== -1) {
                  const existingAttrs = afterFirstParen.substring(0, lastParenIndex);
                  const afterLastParen = afterFirstParen.substring(lastParenIndex);

                  const separator = existingAttrs.trim() ? ", " : "";
                  processedLine = `${indent}${beforeParen}${existingAttrs}${separator}${debugAttrsString}${afterLastParen}`;
                }
              } else {
                // 没有属性括号，在选择器后添加
                const selector = trimmedLine.substring(0, selectorEndIndex);
                const afterAttrs = trimmedLine.substring(selectorEndIndex);

                processedLine = `${indent}${selector}(${debugAttrsString})${afterAttrs}`;
              }
            }
            // 处理普通标签
            else if (trimmedLine.startsWith(mainTag.tagName)) {
              const indent = line.match(/^\s*/)[0];

              // 找到标签名和修饰符的结束位置
              const tagEndIndex = findTagEnd(mainTag.tagName, trimmedLine);
              const afterTag = trimmedLine.substring(tagEndIndex);

              if (afterTag.startsWith("(")) {
                // 已经有属性括号，需要找到正确的结束位置
                const parenEnd = findMatchingParen(trimmedLine, tagEndIndex);

                if (parenEnd !== -1) {
                  const tagWithModifiers = trimmedLine.substring(0, tagEndIndex);
                  const existingAttrs = trimmedLine.substring(
                    tagEndIndex + 1,
                    parenEnd
                  );
                  const remaining = trimmedLine.substring(parenEnd + 1);

                  const separator = existingAttrs.trim() ? ", " : "";
                  processedLine = `${indent}${tagWithModifiers}(${existingAttrs}${separator}${debugAttrsString})${remaining}`;
                }
              } else {
                // 没有属性括号，添加新的属性括号
                const tagWithModifiers = trimmedLine.substring(0, tagEndIndex);
                const remaining = trimmedLine.substring(tagEndIndex);

                processedLine = `${indent}${tagWithModifiers}(${debugAttrsString})${remaining}`;
              }
            }
          }

          return processedLine;
        });

        return processedLines.join("\n");
      } catch (error) {
        console.error(`处理 pug 文件 ${filename} 时出错:`, error);
        return pugContent;
      }
    }

    /**
     * 找到标签名和修饰符的结束位置
     * @param {string} tagName - 标签名
     * @param {string} line - 行内容
     * @returns {number} 结束位置索引
     */
    function findTagEnd(tagName, line) {
      let index = tagName.length;

      // 跳过类名和ID修饰符
      while (index < line.length) {
        const char = line[index];
        if (char === "." || char === "#") {
          index++;
          while (index < line.length && /[\w-]/.test(line[index])) {
            index++;
          }
        } else {
          break;
        }
      }

      return index;
    }

    /**
     * 找到匹配的右括号
     * @param {string} str - 字符串
     * @param {number} start - 开始位置
     * @returns {number} 匹配括号的位置，-1表示未找到
     */
    function findMatchingParen(str, start) {
      let depth = 0;
      let i = start;
      let inString = false;
      let stringChar = "";

      while (i < str.length) {
        const char = str[i];

        // 处理字符串内容，避免字符串中的括号影响匹配
        if (!inString && (char === '"' || char === "'" || char === "`")) {
          inString = true;
          stringChar = char;
        } else if (inString && char === stringChar && str[i - 1] !== "\\") {
          inString = false;
          stringChar = "";
        } else if (!inString) {
          if (char === "(") {
            depth++;
          } else if (char === ")") {
            depth--;
            if (depth === 0) {
              return i;
            }
          }
        }
        i++;
      }

      return -1; // 没有找到匹配的括号
    }

    /**
     * 递归处理目录中的所有 pug 文件
     * @param {string} dir - 目录路径
     * @param {string} baseDir - 基础目录路径（用于计算相对路径）
     */
    async function processPugFilesInDirectory(dir, baseDir) {
      try {
        const files = await fse.readdir(dir);

        for (const file of files) {
          const fullPath = path.join(dir, file);
          const stats = await fse.stat(fullPath);

          if (stats.isDirectory()) {
            // 递归处理子目录
            await processPugFilesInDirectory(fullPath, baseDir);
          } else if (file.endsWith(".pug")) {
            // 处理 pug 文件
            try {
              const relativePath = path
                .relative(baseDir, fullPath)
                .replace(/\\/g, "/");
              const pugContent = await fse.readFile(fullPath, "utf8");

              console.log(`正在处理: ${relativePath}`);

              const processedContent = addDebugAttributesToPug(
                pugContent,
                relativePath,
                file
              );

              // 写回处理后的内容
              await fse.writeFile(fullPath, processedContent, "utf8");

              console.log(`已处理: ${relativePath}`);
            } catch (error) {
              console.error(`处理文件 ${fullPath} 时出错:`, error);
            }
          }
        }
      } catch (error) {
        console.error(`处理目录 ${dir} 时出错:`, error);
      }
    }

    // 开始处理调试目录中的所有 pug 文件
    console.log("开始为 pug 文件添加调试属性...");
    await processPugFilesInDirectory(targetDir, targetDir);

    console.log("调试模板目录创建完成！");
    console.log(`调试模板位置: ${targetDir}`);
  } catch (error) {
    console.error("创建调试模板时出错:", error);
    throw error;
  }
}
