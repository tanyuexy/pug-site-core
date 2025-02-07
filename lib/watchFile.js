import chokidar from "chokidar";
import path from "path";
import { exec } from "child_process";
import { debounce } from "./utils.js";

const projectRoot = process.cwd();

/**
 * 更改/template刷新网页
 */
function watchTemplate() {
  const refreshPagFn = debounce(() => {
    exec(`curl http://${process.env._localIp}:${process.env._port}/_refresh`);
  }, 300);

  // 使用 path.join 来确保跨平台兼容性
  let watch = chokidar.watch(path.join(projectRoot, "template"), {
    persistent: true
    // ignored: [/node_modules/, /\.git/]
  });
  watch
    .on("error", (error) => {
      console.error(`Watcher error: ${error}`);
    })
    .on("add", refreshPagFn)
    .on("change", refreshPagFn)
    .on("unlink", refreshPagFn)
    .on("unlinkDir", refreshPagFn);
}

(() => {
  watchTemplate();
})();
