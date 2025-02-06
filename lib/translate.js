import { v2 } from "@google-cloud/translate";
import fse from "fs-extra";
import languageData from "./languageData.js";
import async from "async";
import { config } from "../config.js";
import path from "path";

const key = "AIzaSyAbhPvlSAAJnH_IIRbdwjXOX9c0plvlH_k";
const projectId = "3nm Game Site";
let translate = new v2.Translate({ projectId, key });

let orginLang = "us";

let args = process.argv.slice(2);
let filParms = [];
let filCountry = [];
args.forEach((item) => {
  const [key, value] = item.split("=");
  if (value) {
    if (key === "k") {
      filParms = value.split(",");
    }
    if (key === "c") {
      filCountry = value.split(",");
    }
  }
});

let targetLangList = filCountry.length > 0 ? filCountry : config.languageList;

//国家映射到语言
const countryLanguageMap = {
  xp: "en",
  us: "en",
  us2: "en",
  kr: "ko",
  jp: "ja",
  vn: "vi",
  tw: "zh-TW",
  gb: "en",
  br: "pt",
  in: "hi"
};

async function translateStr(str, targetLanguage) {
  let [result] = await translate.translate(str, targetLanguage);
  return result;
}

async function main() {
  let orginData = languageData[orginLang];
  console.log("开始翻译");
  let startTime = Date.now();
  await async.each(targetLangList, async (language) => {
    if (language === orginLang) return;
    console.log(language);
    languageData[language] = languageData[language] || {};
    // 创建一个栈来模拟递归
    let stack = [{ original: orginData, copy: languageData[language] }];
    while (stack.length) {
      let { original, copy } = stack.pop();
      for (let key in original) {
        if (Object.prototype.hasOwnProperty.call(original, key)) {
          //第一层的key过滤
          if (
            original === orginData &&
            filParms.length > 0 &&
            !filParms.includes(key)
          ) {
            continue;
          }
          let value = original[key];
          if (typeof value === "string") {
            // 如果属性是字符串类型，进行翻译
            copy[key] = await translateStr(
              value,
              countryLanguageMap[language] || language
            );
          } else if (typeof value === "object" && value !== null) {
            // 如果属性是对象类型，创建一个新对象并入栈
            copy[key] = Array.isArray(value) ? [] : {};
            stack.push({ original: value, copy: copy[key] });
          } else {
            // 其他类型的属性直接赋值
            copy[key] = value;
          }
        }
      }
    }
  });
  fse.writeFileSync(
    path.join(path.resolve(), "langConfig", "languageData.js"),
    "export default" + JSON.stringify(languageData)
  );
  console.log("翻译完成花费:", (Date.now() - startTime) / 1000 + "s");
}

main();
