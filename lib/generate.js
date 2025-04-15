import fse from "fs-extra";
import pug from "pug";
import {
  getPagesPugFilePathArr,
  getCompilePugFilter,
  pathIsSame,
  sleep,
  pathSymbol,
  obfuscateJavaScript,
} from "./utils.js";
import _ from "lodash";
import async from "async";
import UglifyJS from "uglify-js";
import { paths } from "./paths.js";

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

    // 使用async库并发编译pug文件
    await async.eachLimit(
      // 过滤出需要编译的文件
      pagesPugFilePathArr.filter(
        (fileName) => !pugPath || pathIsSame(pugPath, fileName)
      ),
      10, // 限制并发数为10
      async (fileName) => {
        const filePath = paths.resolveRoot(paths.template.pages, fileName);
        const funName = fileName.split(pathSymbol).join("_").slice(0, -4);

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
        const functionBody = fnStr.slice(functionStart, functionEnd);
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
    const pagesPugFilePathArr = await getPagesPugFilePathArr(true);

    // 注入公共数据获取函数
    if (!getDataFile.includes("get_common_data")) {
      const commonDataFn = `export async function get_common_data(language) {
        return {}
      }\n`;
      await fse.appendFile(getDataPath, commonDataFn);
    }

    // 为每个页面注入数据获取函数
    await async.each(pagesPugFilePathArr, async (fileName) => {
      const funName =
        "get_" + fileName.split(pathSymbol).join("_").slice(0, -4) + "_data";

      if (!getDataFile.includes(funName)) {
        const template = config.getDataFnTemplate
          .toString()
          .replace("template", funName);
        const dataFn = `\nexport async ${template}`;
        await fse.appendFile(getDataPath, dataFn);
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
    const pugFilePathList = await getPagesPugFilePathArr();

    const { languageList, customBuildData, fetchDataConcurrencyLimit } = config;

    // 创建一个全局任务队列控制整体并发数
    const queue = async.queue(async (task) => {
      await task();
    }, fetchDataConcurrencyLimit || 10);

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
          const commonData = await getData[commonFuncName](language);
          console.log(language, commonFuncName, "开始写入json文件");
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

          if (filterFun.length && !filterFun.includes(obj.getDataFn)) {
            continue;
          }

          allTasks.push(async () => {
            let data = await dataFn(language);
            await checkData(data, language, obj.getDataFn);
            console.log(language, obj.getDataFn, "开始写入json文件");
            let outPutPath = obj.outPutPath.split("/").join(pathSymbol);
            if (Array.isArray(data)) {
              let name = outPutPath.split(pathSymbol).pop().replace(/\..*$/, "");
              const regex = /^\[.+\]$/;
              if (regex.test(name)) {
                let property = name.slice(1, -1);
                for (let index = 0; index < data.length; index++) {
                  const dataItem = data[index];
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
                }
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
          "get_" + fileName.split(pathSymbol).join("_").slice(0, -4) + "_data";

        let jsonFilePath = fileName.slice(0, -4).split(pathSymbol);
        if (!getData[funName] || typeof getData[funName] !== "function") {
          return Promise.reject(new Error(`${funName} 获取数据函数不存在`));
        }

        if (filterFun.length && !filterFun.includes(funName)) {
          continue;
        }

        allTasks.push(async () => {
          let data = await getData[funName](language);
          await checkData(data, language, funName);
          console.log(language, funName, "开始写入json文件");
          if (Array.isArray(data)) {
            for (let index = 0; index < data.length; index++) {
              const item = data[index];
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
            }
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
  const jsonDataPath = paths.resolveRoot("jsonData");
  if (!fse.pathExistsSync(jsonDataPath)) {
    return Promise.reject(
      new Error(jsonDataPath + "目录不存在请先执行npm run getData生成数据!")
    );
  }
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
    let commonData = await fse.readJSON(
      paths.resolveRoot("jsonData", lang, "_common.json")
    );
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
