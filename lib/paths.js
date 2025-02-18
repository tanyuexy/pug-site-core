import path from "path";
import { pathToFileURL, fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = process.cwd();

export const paths = {
  // 项目根目录相关
  projectRoot,
  lib: __dirname,
  config: pathToFileURL(path.resolve(projectRoot, "config.js")).href,
  getData: pathToFileURL(path.resolve(projectRoot, "getData.js")).href,
  pagesPugFn: pathToFileURL(path.resolve(projectRoot, "pagesPugFn/index.js"))
    .href,
  // 模板相关路径
  template: {
    root: path.join(projectRoot, "template"),
    pages: path.join(projectRoot, "template/pages"),
    static: path.join(projectRoot, "template/static")
  },

  // 公共资源
  public: path.join(projectRoot, "public"),

  // 运行时相关
  pugRuntime: path.join(__dirname, "pugRuntime.js"),

  // 工具函数
  resolveRoot: (...args) => {
    if (args[0].startsWith(projectRoot)) {
      return path.join(...args);
    }
    return path.join(projectRoot, ...args);
  }
};

export default paths;
