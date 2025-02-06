import chokidar from "chokidar";
import fse from "fs-extra";
import path from "path";
import { exec } from "child_process";
import { debounce } from "./utils.js";
import { config } from "./config.js";
const __dirname = path.resolve();

/**
 * 更改/template刷新网页
 */
function watchTemplate() {
  const refreshPagFn = debounce(() => {
    exec(`curl http://${process.env._localIp}:${process.env._port}/_refresh`);
  }, 300);
  let watch = chokidar.watch("./template", {
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
