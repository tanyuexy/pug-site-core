import express from "express";
import useragent from "express-useragent";
import ip from "ip";
import fse from "fs-extra";
import _ from "lodash";
import {
  getCompilePugFilter,
  pagesPathFilter,
  getIdleProt,
  matchESI,
  pathSymbol,
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
      let lastPath = pagesPathFilter(req.path);
      let data;
      let jsonDataPath;
      let pugPath;
      let findPageInfoObj = await matchFileMapTable(lastPath, language, device);

      let otherPath = [language + "/" + device, language, device, ""];
      if (!findPageInfoObj) {
        if (lastPath.endsWith(".html")) {
          lastPath = lastPath.slice(0, -5);
        } else {
          lastPath = lastPath + "/index";
        }
        jsonDataPath =
          paths.resolveRoot("jsonData", language, lastPath) + ".json";
        if (fse.pathExistsSync(jsonDataPath)) {
          data = await fse.readJSON(jsonDataPath);
        } else {
          console.log(jsonDataPath, "不存在此json文件页面data数据将为null");
          jsonDataPath = null;
        }
        for (let index = 0; index < otherPath.length; index++) {
          const element = otherPath[index];
          if (data) {
            lastPath = pagesPathFilter(data._template[0]).replace(".pug", "");
          }
          pugPath =
            paths.resolveRoot(pagsTemplatePath, element, lastPath) + ".pug";
          if (fse.pathExistsSync(pugPath)) {
            break;
          }
        }
      } else {
        for (let index = 0; index < otherPath.length; index++) {
          const element = otherPath[index];
          pugPath = paths.resolveRoot(
            pagsTemplatePath,
            element,
            findPageInfoObj.pugPath
          );
          if (fse.pathExistsSync(pugPath)) {
            break;
          }
        }
        data = findPageInfoObj.data;
        jsonDataPath = findPageInfoObj.getDataFn;
      }
      if (fse.pathExistsSync(pugPath)) {
        console.log(
          `请求路径:${req.path}  模版路径:${pugPath}  数据JSON文件路径或getData中的函数名:${jsonDataPath}`
        );
        let commonData = {};
        if (config.langChangeUpdateCommon) {
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

async function matchFileMapTable(reqPath, language, device) {
  let fileMapTable = config.fileMapTable.filter((obj) => {
    let flag = obj.devMatchFn && obj.pugPath && obj.outPutPath && obj.getDataFn;
    if (obj.languageList && !obj.languageList.includes(language)) {
      flag = false;
    }
    if (obj.deviceList && !obj.deviceList.includes(device)) {
      flag = false;
    }
    return flag;
  });
  for (let index = 0; index < fileMapTable.length; index++) {
    const obj = fileMapTable[index];
    if (obj.devMatchFn(reqPath, device)) {
      const getData = await import(paths.getData);
      let data = await getData[obj.getDataFn](language);
      if (Array.isArray(data)) {
        let name = obj.outPutPath.split("/").pop().replace(/\..*$/, "");
        const regex = /^\[.+\]$/;
        if (regex.test(name)) {
          let property = name.slice(1, -1);
          data = data.find((item) => {
            let str = String(item[property]);
            return reqPath.includes(str);
          });
        }
      }
      return {
        pugPath: obj.pugPath,
        data,
        getDataFn: obj.getDataFn,
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
