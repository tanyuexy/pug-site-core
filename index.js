import { startDevServer } from "./lib/devServer.js";
import { translateLanguageData } from "./lib/translate.js";
import {
  generateGetDataFn,
  compilePagesPugToFn,
  fetchDataToJsonFile,
  buildFn,
  buildStatic
} from "./lib/generate.js";

export const pugSiteCore = {
  startDevServer,
  generateGetDataFn,
  compilePagesPugToFn,
  fetchDataToJsonFile,
  buildFn,
  buildStatic,
  translateLanguageData
};
