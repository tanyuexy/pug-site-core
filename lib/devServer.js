import express from "express";
import useragent from "express-useragent";
import ip from "ip";
import fse from "fs-extra";
import _ from "lodash";
import {
  getCompilePugFilter,
  getIdleProt,
  matchESI,
  pathSymbol,
  getJsonData,
} from "./utils.js";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";
import { Worker } from "worker_threads";
import { paths } from "./paths.js";

const { config } = await import(paths.config);
const pagsTemplatePath = paths.template.pages;
const localIp = process.env._localIp || ip.address();
const port =
  process.env._port || (await getIdleProt(config.devServer.port, localIp));
process.env._port = port;
process.env._localIp = localIp;

function createServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  setupWebSocket(wss);
  setupMiddleware(app);
  setupRoutes(app, wss);

  return server;
}

function setupWebSocket(wss) {
  wss.on("connection", function connection(ws) {
    console.log("刷新网页");
  });
}

function setupMiddleware(app) {
  app.use(useragent.express());
  app.set("views", config.templatePath);
  app.set("view engine", "pug");
  app.use("/static", express.static(paths.template.static));
  app.use(express.static(paths.public));
  app.locals.basedir = paths.template.root;
}

function setupRoutes(app, wss) {
  app.get("/_refresh", (req, res) => {
    wss.clients.forEach(function each(client) {
      if (client.readyState === WebSocket.OPEN) {
        client.send("refresh");
      }
    });
    res.send("刷新成功");
  });

  app.get("*", async (req, res) => {
    try {
      let useragent = req.useragent;
      let device;
      if (useragent.isDesktop) {
        device = "pc";
      } else if (useragent.isiPad) {
        //开发者工具中仅ipad mini会被认为是ipad
        device = "ipad";
      } else if (useragent.isMobile) {
        device = "mobile";
      }
      let language = config.languageList[0];
      let lastPath = req.path;
      let data;
      let jsonDataPath;
      let pugPath;

      // 构建完整的URL对象
      const protocol = req.protocol;
      const host = req.get("host");
      const fullUrl = `${protocol}://${host}${req.originalUrl}`;
      const urlObj = new URL(fullUrl);
      let pageInfoObj = await matchRouter(urlObj, language, device);
      if (!pageInfoObj) {
        if (lastPath.endsWith(".html")) {
          lastPath = lastPath.slice(0, -5);
        } else {
          lastPath = lastPath + "/index";
        }
        jsonDataPath = paths.resolveRoot("jsonData", language, lastPath) + ".json";
        if (fse.pathExistsSync(jsonDataPath)) {
          data = await fse.readJSON(jsonDataPath);
        } else {
          console.log(jsonDataPath, "不存在此json文件页面data数据将为null");
          jsonDataPath = null;
        }

        if (data) {
          lastPath = data._template.replace(".pug", "");
        }
        pugPath = paths.resolveRoot(pagsTemplatePath, lastPath) + ".pug";
      } else {
        pugPath = paths.resolveRoot(pagsTemplatePath, pageInfoObj.pugPath) + ".pug";
        data = pageInfoObj.data;
        jsonDataPath = "自定义路由数据";
      }
      if (fse.pathExistsSync(pugPath)) {
        console.log(
          `请求路径:${req.path}  模版路径:${pugPath}  数据JSON文件路径:${jsonDataPath}`
        );
        let commonData = {};
        if (config.changeUpdateCommon) {
          commonData = await (
            await import(paths.getData)
          )["get_common_data"](language);
          await fse.writeJSON(
            paths.resolveRoot("jsonData", language, "_common.json"),
            commonData
          );
        } else {
          commonData = await fse.readJSON(
            paths.resolveRoot("jsonData", language, "_common.json")
          );
        }
        let _refreshScript = `<script>const ws=new WebSocket('ws://${localIp}:${port}');ws.onmessage=function(event){if(event.data==='refresh'){console.log('Refreshing page...');location.reload()}}</script>`;
        res.render(
          pugPath,
          _.merge(
            {
              data,
              _pagePath: pugPath.split(pathSymbol + "pages")[1],
              common: _.merge(commonData, config.commonData),
            },
            { filters: getCompilePugFilter() }
          ),
          async function (err, html) {
            if (err) {
              console.log(err);
              res.send(_refreshScript + err);
            } else {
              if (config.isMatchEsi) {
                html = await matchESI(html, data);
              }
              res.send(_refreshScript + html);
            }
          }
        );
      } else {
        let html = `<h1>${pugPath}的模版函数不存在!</h1>`;
        console.log(`${pugPath}的模版函数不存在!`);
        res.send(html);
      }
    } catch (error) {
      console.log(error);
    }
  });
}

async function matchRouter(url, language, device) {
  let router = (await import(paths.router)).router;
  let getR2Data = async (jsonPath) => {
    jsonPath = paths.join(language, jsonPath);
    let data = await getJsonData(jsonPath);
    return data;
  };
  let params = { url, language, device, getR2Data };

  for (let index = 0; index < router.length; index++) {
    const obj = router[index];
    if (obj.matchFn.call(params)) {
      let data = obj.getData.call(params);
      let pugPath = obj.getPagesFnName.call(params);
      pugPath = pugPath.split("_").join(pathSymbol);
      return {
        pugPath,
        data,
      };
    }
  }
}

export async function startDevServer() {
  const server = createServer();

  console.log(
    "Listening:",
    `http://${localIp}:${port}`,
    "语言为:",
    config.languageList[0]
  );

  server.listen(port);

  new Worker(paths.lib + "/watchFile.js");
}
