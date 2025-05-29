import fse from "fs-extra";
import pug from "pug";
import pugLexer from "pug-lexer";
import {
  getPagesPugFilePathArr,
  getCompilePugFilter,
  pathIsSame,
  sleep,
  pathSymbol,
  obfuscateJavaScript,
  addTemplateScopeIsolation,
} from "./utils.js";
import _ from "lodash";
import async from "async";
import UglifyJS from "uglify-js";
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
        const funName = fileName.split(pathSymbol).join("_").slice(0, -4).replace(/[-]/g, "_");

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
        "get_" + fileName.split(pathSymbol).join("_").slice(0, -4).replace(/[-]/g, "_") + "_data";

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
    }, fetchDataConcurrencyLimit || 12);

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
              let name = outPutPath.split(pathSymbol).pop().replace(/\..*$/, "");
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
          "get_" + fileName.split(pathSymbol).join("_").slice(0, -4).replace(/[-]/g, "_") + "_data";

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
  await async.each(config.languageList, async (lang) => {
    let commonData = await (await import(paths.getData))["get_common_data"](lang);
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

//html文件打包 不维护了
export async function buildStatic() {
  let jsonDataPath = paths.resolveRoot("jsonData");

  if (!fse.pathExistsSync(jsonDataPath)) {
    return Promise.reject(
      new Error(jsonDataPath + "目录不存在请先执行npm run getData生成数据!")
    );
  }
  console.log("开始打包...");
  let starTime = Date.now();
  let distOutputPath = paths.resolveRoot(config.staticOutput);
  await fse.remove(distOutputPath);
  await sleep(0);
  await fse.copy(paths.public, distOutputPath);

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

  await compilePagesPugToFn();
  let PagesPugToFn = await import(paths.pagesPugFn);
  const getData = await import(paths.getData);

  const fileMapTable = config.fileMapTable;
  await async.each(config.languageList, async (lang) => {
    let langDataPath = paths.resolveRoot(jsonDataPath, lang);
    if (!fse.pathExistsSync(langDataPath)) {
      console.log(
        `注意配置了${lang}语言但${langDataPath}中没有生成${lang}语言的数据!`
      );
      return;
    }
    let commonData = await fse.readJSON(
      paths.resolveRoot("jsonData", lang, "_common.json")
    );
    commonData = _.merge(commonData, config.commonData);

    if (fileMapTable && Array.isArray(fileMapTable)) {
      await async.each(fileMapTable, async (obj) => {
        if (
          obj.pugPath &&
          obj.getDataFn &&
          obj.outPutPath &&
          obj.outPutPath.endsWith(".html")
        ) {
          if (
            obj.languageList &&
            obj.languageList.length > 0 &&
            !obj.languageList.includes(lang)
          ) {
            return;
          }
          let langPrefix =
            obj.languageList && obj.languageList.length > 0 ? lang : "";
          let pugPathPreArr = [""];
          if (obj.deviceList && obj.deviceList.length > 0) {
            pugPathPreArr = obj.deviceList;
          }
          await async.each(pugPathPreArr, async (devicePrefix) => {
            let pugPath = paths.resolveRoot(
              paths.template.pages,
              langPrefix,
              devicePrefix,
              obj.pugPath.split("/").join(pathSymbol)
            );
            if (!fse.pathExistsSync(pugPath)) {
              return Promise.reject(new Error(pugPath + "模版路径不存在"));
            }
            let dataFn = getData[obj.getDataFn];
            if (!dataFn || typeof dataFn !== "function") {
              return Promise.reject(new Error(obj.getDataFn + "获取数据函数不存在"));
            }
            let data = await dataFn(lang);
            if (!data) {
              return Promise.reject(new Error(dataFn + "获取的数据为null!"));
            }
            let outPutPath = obj.outPutPath.split("/").join(pathSymbol);
            let htmlPath;
            let html;
            if (Array.isArray(data)) {
              let name = outPutPath.split(pathSymbol).pop().replace(/\..*$/, "");
              const regex = /^\[.+\]$/;
              if (regex.test(name)) {
                let property = name.slice(1, -1);
                for (let index = 0; index < data.length; index++) {
                  const dataItem = data[index];
                  let fileName = dataItem[property];
                  if (
                    fileName === null ||
                    fileName === undefined ||
                    fileName === ""
                  ) {
                    return Promise.reject(
                      new Error(
                        dataFn +
                          "获取的数据中期望以" +
                          property +
                          `命名但是${index}下标中对象${property}属性为:${fileName}`
                      )
                    );
                  }
                  htmlPath = paths.resolveRoot.join(
                    distOutputPath,
                    lang,
                    devicePrefix,
                    outPutPath.replace(name, fileName)
                  );
                  html = pug.compileFile(pugPath, {
                    basedir: paths.template.root,
                    compileDebug: true,
                    filters: getCompilePugFilter(),
                  })({
                    data: dataItem,
                    _pagePath: obj.pugPath,
                    common: commonData,
                  });
                  fse.ensureFileSync(htmlPath);
                  await fse.writeFile(htmlPath, html);
                }
              } else {
                htmlPath = paths.resolveRoot(
                  paths.template.root,
                  lang,
                  devicePrefix,
                  outPutPath
                );
                html = pug.compileFile(pugPath, {
                  basedir: paths.template.root,
                  compileDebug: true,
                  filters: getCompilePugFilter(),
                })({
                  data,
                  _pagePath: obj.pugPath,
                  common: commonData,
                });
                fse.ensureFileSync(htmlPath);
                await fse.writeFile(htmlPath, html);
              }
            } else if (typeof data === "object") {
              htmlPath = paths.resolveRoot(
                distOutputPath,
                lang,
                devicePrefix,
                outPutPath
              );
              html = pug.compileFile(pugPath, {
                basedir: paths.template.root,
                compileDebug: true,
                filters: getCompilePugFilter(),
              })({
                data,
                _pagePath: obj.pugPath,
                common: commonData,
              });
              fse.ensureFileSync(htmlPath);
              await fse.writeFile(htmlPath, html);
            }
          });
        }
      });
    }

    let pagesAllJsonFileName = (
      await fse.readdir(langDataPath, {
        recursive: true,
      })
    ).filter((fileName) => fileName.endsWith(".json"));
    await async.eachLimit(pagesAllJsonFileName, 64, async (jsonFileName) => {
      let data = await fse.readJSON(paths.resolveRoot(langDataPath, jsonFileName));
      let pugTemplateArr = data._template;
      if (!pugTemplateArr) {
        return;
      }
      let flag = false;

      let curLangPugTem = data._template.find((item) => {
        let lang2 = item.split(pathSymbol)[0];
        if (config.languageList.includes(lang2) && lang === lang2) {
          return true;
        }
      });
      if (curLangPugTem) {
        flag = true;
        pugTemplateArr = [curLangPugTem];
      } else {
        //没有特殊模版的语言排除其他语言的特殊模版
        pugTemplateArr = data._template.filter((item) => {
          let lang2 = item.split(pathSymbol)[0];
          if (config.languageList.includes(lang2)) {
            return false;
          }
          return true;
        });
      }

      await async.each(pugTemplateArr, (pugTemplate, callback) => {
        let funName = pugTemplate.split(pathSymbol).join("_").slice(0, -4);
        if (flag) {
          pugTemplate = pugTemplate.split(pathSymbol).slice(1).join(pathSymbol);
        }
        let html = PagesPugToFn[funName]({
          data,
          _pagePath: pugTemplate,
          common: commonData,
        });
        if (data.page_name) {
          pugTemplate =
            pugTemplate.split(pathSymbol).slice(0, -1).join(pathSymbol) +
            pathSymbol +
            data.page_name;
        }
        let htmlPath = paths.resolveRoot(
          distOutputPath,
          lang,
          pugTemplate.replace(/\..*$/, ".html")
        );
        fse.ensureFileSync(htmlPath);
        const writeStream = fse.createWriteStream(htmlPath);
        writeStream.write(html);
        writeStream.end(callback);
      });
    });
  });
  console.log("打包完成花费:", (Date.now() - starTime) / 1000, "s");
}

/**
 * 创建调试模板目录
 * 复制template目录到template-debug并为所有pug文件添加调试属性
 * @returns {Promise<void>}
 */
export async function createDebugTemplate() {
  try {
    console.log('开始创建调试模板目录...');
    
    const sourceDir = paths.template.root;
    const targetDir = paths.template.debug;
    
    // 删除已存在的调试目录
    if (await fse.pathExists(targetDir)) {
      await fse.remove(targetDir);
      console.log('已删除现有的调试目录');
    }
    
    // 复制整个 template 目录到 template-debug
    await fse.copy(sourceDir, targetDir);
    console.log(`已复制 ${sourceDir} 到 ${targetDir}`);
    
    /**
     * 使用 pug-lexer 解析 pug 文件中的所有 HTML 标签
     * @param {string} pugContent - pug 文件内容
     * @param {string} filename - 文件名（用于错误提示）
     * @returns {Array} 返回标签信息数组
     */
    function extractHtmlTagsFromPug(pugContent, filename) {
      try {
        const tokens = pugLexer(pugContent, { filename });
        const tags = [];
        
        tokens.forEach((token, index) => {
          if (token.type === 'tag') {
            const tagInfo = {
              tagName: token.val,
              line: token.line || token.loc?.start?.line || null,
              selfClosing: token.selfClosing || false,
              attributes: [],
              isImplicitDiv: false
            };
            
            // 查找紧随其后的属性 token
            const nextTokenIndex = index + 1;
            if (nextTokenIndex < tokens.length && tokens[nextTokenIndex].type === 'attrs') {
              tagInfo.attributes = tokens[nextTokenIndex].attrs.map(attr => ({
                name: attr.name,
                value: attr.val,
                escaped: attr.escaped
              }));
            }
            
            tags.push(tagInfo);
          }
          // 处理隐式 div 语法：.class 或 #id
          else if (token.type === 'class' || token.type === 'id') {
            // 检查前一个 token，如果不是标签名，则这是隐式 div
            const prevToken = index > 0 ? tokens[index - 1] : null;
            
            // 如果前一个token不是tag类型，或者是换行/缩进，则这是隐式div
            if (!prevToken || 
                prevToken.type === 'newline' || 
                prevToken.type === 'indent' || 
                prevToken.type === 'outdent' ||
                prevToken.type === 'eos') {
              
              const tagInfo = {
                tagName: 'div', // 隐式 div
                line: token.line || token.loc?.start?.line || null,
                selfClosing: false,
                attributes: [],
                isImplicitDiv: true // 标记为隐式 div
              };
              
              tags.push(tagInfo);
            }
          }
        });
        
        return tags;
      } catch (error) {
        console.error(`解析 pug 文件 ${filename} 时出错:`, error);
        return [];
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
        const lines = pugContent.split('\n');
        const tags = extractHtmlTagsFromPug(pugContent, filename);
        
        // 定义不需要添加调试属性的标签（不在页面中显示的标签）
        const excludeTags = new Set([
          'head', 'title', 'meta', 'link', 'html' ,'style', 'script', 
          'base', 'noscript', 'template'
        ]);
        
        // 过滤掉不需要处理的标签
        const visibleTags = tags.filter(tag => !excludeTags.has(tag.tagName.toLowerCase()));
        
        // 创建一个映射，记录每行的标签信息
        const lineTagMap = new Map();
        visibleTags.forEach(tag => {
          if (!lineTagMap.has(tag.line)) {
            lineTagMap.set(tag.line, []);
          }
          lineTagMap.get(tag.line).push(tag);
        });
        
        // 处理每一行
        const processedLines = lines.map((line, index) => {
          const lineNumber = index + 1;
          const tagsInLine = lineTagMap.get(lineNumber);
          
          if (!tagsInLine || tagsInLine.length === 0) {
            return line;
          }
          
          // 对于每个标签，添加调试属性
          let processedLine = line;
          
          tagsInLine.forEach(tag => {
            // 构建调试属性
            const debugAttrs = [
              `data-debug-file="${relativePath}"`,
              `data-debug-line="${lineNumber}"`
            ].join(', ');
            
            // 简化的标签处理逻辑
            const trimmedLine = line.trim();
            let matched = false;
            
            // 处理隐式 div（.class 或 #id 语法）
            if (tag.isImplicitDiv && (trimmedLine.startsWith('.') || trimmedLine.startsWith('#'))) {
              const indent = line.match(/^\s*/)[0]; // 获取缩进
              
              // 找到类名或ID结束的位置
              let selectorEndIndex = 1; // 跳过 . 或 #
              while (selectorEndIndex < trimmedLine.length && /[\w-]/.test(trimmedLine[selectorEndIndex])) {
                selectorEndIndex++;
              }
              
              // 检查是否已经有属性括号
              const afterSelector = trimmedLine.substring(selectorEndIndex);
              const parenIndex = afterSelector.indexOf('(');
              
              if (parenIndex !== -1) {
                // 已经有属性括号
                const beforeParen = trimmedLine.substring(0, selectorEndIndex + parenIndex + 1);
                const afterFirstParen = trimmedLine.substring(selectorEndIndex + parenIndex + 1);
                const lastParenIndex = afterFirstParen.lastIndexOf(')');
                
                if (lastParenIndex !== -1) {
                  const existingAttrs = afterFirstParen.substring(0, lastParenIndex);
                  const afterLastParen = afterFirstParen.substring(lastParenIndex);
                  
                  const separator = existingAttrs.trim() ? ', ' : '';
                  processedLine = `${indent}${beforeParen}${existingAttrs}${separator}${debugAttrs}${afterLastParen}`;
                  matched = true;
                }
              } else {
                // 没有属性括号，在选择器后添加
                const selector = trimmedLine.substring(0, selectorEndIndex);
                const afterAttrs = trimmedLine.substring(selectorEndIndex);
                
                processedLine = `${indent}${selector}(${debugAttrs})${afterAttrs}`;
                matched = true;
              }
            }
            // 处理普通标签
            else if (!tag.isImplicitDiv && trimmedLine.startsWith(tag.tagName)) {
              const indent = line.match(/^\s*/)[0]; // 获取缩进
              const tagPart = trimmedLine;
              
              // 检查是否已经有属性括号
              const parenIndex = tagPart.indexOf('(');
              
              if (parenIndex !== -1) {
                // 已经有属性括号，在最后一个右括号前添加调试属性
                const beforeParen = tagPart.substring(0, parenIndex + 1);
                const afterFirstParen = tagPart.substring(parenIndex + 1);
                const lastParenIndex = afterFirstParen.lastIndexOf(')');
                
                if (lastParenIndex !== -1) {
                  const existingAttrs = afterFirstParen.substring(0, lastParenIndex);
                  const afterLastParen = afterFirstParen.substring(lastParenIndex);
                  
                  // 添加调试属性
                  const separator = existingAttrs.trim() ? ', ' : '';
                  processedLine = `${indent}${beforeParen}${existingAttrs}${separator}${debugAttrs}${afterLastParen}`;
                  matched = true;
                }
              } else {
                // 没有属性括号，找到标签名结束的位置并添加属性
                let tagEndIndex = tag.tagName.length;
                
                // 寻找类名、ID等修饰符的结束位置
                while (tagEndIndex < tagPart.length) {
                  const char = tagPart[tagEndIndex];
                  if (char === '.' || char === '#') {
                    // 跳过类名或ID
                    tagEndIndex++;
                    while (tagEndIndex < tagPart.length && /[\w-]/.test(tagPart[tagEndIndex])) {
                      tagEndIndex++;
                    }
                  } else {
                    break;
                  }
                }
                
                const beforeAttrs = tagPart.substring(0, tagEndIndex);
                const afterAttrs = tagPart.substring(tagEndIndex);
                
                processedLine = `${indent}${beforeAttrs}(${debugAttrs})${afterAttrs}`;
                matched = true;
              }
            }
          });
          
          return processedLine;
        });
        
        return processedLines.join('\n');
      } catch (error) {
        console.error(`处理 pug 文件 ${filename} 时出错:`, error);
        return pugContent;
      }
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
          } else if (file.endsWith('.pug')) {
            // 处理 pug 文件
            try {
              const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
              const pugContent = await fse.readFile(fullPath, 'utf8');
              
              console.log(`正在处理: ${relativePath}`);
              
              const processedContent = addDebugAttributesToPug(pugContent, relativePath, file);
              
              // 写回处理后的内容
              await fse.writeFile(fullPath, processedContent, 'utf8');
              
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
    console.log('开始为 pug 文件添加调试属性...');
    await processPugFilesInDirectory(targetDir, targetDir);
    
    console.log('调试模板目录创建完成！');
    console.log(`调试模板位置: ${targetDir}`);
    
  } catch (error) {
    console.error('创建调试模板时出错:', error);
    throw error;
  }
}