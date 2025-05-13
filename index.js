import { startDevServer } from "./lib/devServer.js";
import { translateLanguageData } from "./lib/translate.js";
import { processImagemin } from "./lib/imagemin.js";
import {
  generateGetDataFn,
  compilePagesPugToFn,
  fetchDataToJsonFile,
  buildFn,
  buildStatic,
} from "./lib/generate.js";

export const pugSiteCore = {
  startDevServer,
  generateGetDataFn,
  compilePagesPugToFn,
  fetchDataToJsonFile,
  buildFn,
  buildStatic,
  translateLanguageData,
  processImagemin,
};

let curCmd = process.env.npm_lifecycle_event;
const args = process.argv.slice(2);

// 检查是否包含 dev 参数
if (args.includes("dev")) {
  try {
    switch (curCmd) {
      case "getFun":
        await generateGetDataFn();
        break;
      case "getData":
        await generateGetDataFn();
        // 移除 dev 参数后传递其他参数
        const dataArgs = args.filter((arg) => arg !== "dev");
        await fetchDataToJsonFile(dataArgs);
        break;
      case "dev":
        startDevServer();
        break;
      case "compileFn":
        await compilePagesPugToFn();
        break;
      case "buildFn":
        await buildFn();
        break;
      case "buildStatic":
        await buildStatic();
        break;
      case "lang":
        await translateLanguageData();
        break;
      case "imagemin":
        // 移除 dev 参数后传递其他参数
        const imageminArgs = args.filter((arg) => arg !== "dev");
        await processImagemin(imageminArgs);
        break;
      default:
        console.log(`未知的命令: ${curCmd}`);
    }
  } catch (error) {
    console.error(`执行命令 ${curCmd} 时发生错误:`, error);
    process.exit(1);
  }
} else {
  // console.log(`请添加 dev 参数以执行命令，例如: npm run getData dev`);
}
