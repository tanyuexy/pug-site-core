import path from "path";
import { pathToFileURL, fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = process.cwd();

// 定义基础路径
const templateRoot = path.join(projectRoot, "template");
const debugTemplateRoot = path.join(projectRoot, "template-debug");

// 辅助函数，用于生成文件URL
const fileUrl = (filePath) =>
  pathToFileURL(path.resolve(projectRoot, filePath)).href;

export const paths = {
  // 项目根目录相关
  projectRoot,
  lib: __dirname,
  config: fileUrl("config.js"),
  getData: fileUrl("getData.js"),
  pagesPugFn: fileUrl("pagesPugFn/index.js"),
  router: fileUrl("router.js"),

  // 模板相关路径
  template: {
    root: templateRoot,
    debug: debugTemplateRoot,
    pages: path.join(templateRoot, "pages"),
    static: path.join(templateRoot, "static"),
  },

  // 公共资源
  public: path.join(projectRoot, "public"),

  // 运行时相关
  pugRuntime: path.join(__dirname, "pugRuntime.js"),

  // 工具函数
  join: (...args) => path.join(...args.map(String)),

  resolveRoot: (...args) =>
    args[0].startsWith(projectRoot)
      ? path.join(...args)
      : path.join(projectRoot, ...args),
};

export default paths;
