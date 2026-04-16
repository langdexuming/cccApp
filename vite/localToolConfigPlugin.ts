/**
 * 在 Vite dev / preview 中提供本机工具配置读取接口
 * @author make java
 * @since 2026-04-16
 */
import type {ServerResponse} from 'node:http';
import type {Plugin} from 'vite';
import type {LocalToolConfigResponse} from '../localToolConfig.types';
import {readLocalToolConfigs} from './readLocalToolConfigs';

const PATH = '/__ccc/local-provider-config';

function sendJson(res: ServerResponse, status: number, body: LocalToolConfigResponse) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

/**
 * 注册开发服务器与 preview 服务器的本机配置中间件
 * @returns Vite 插件
 */
export function localToolConfigPlugin(): Plugin {
  return {
    name: 'ccc-local-tool-config',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET' || req.url?.split('?')[0] !== PATH) {
          next();
          return;
        }
        try {
          const cwd = server.config.root || process.cwd();
          const data = readLocalToolConfigs(cwd);
          sendJson(res, 200, data);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          sendJson(res, 500, {
            ok: false,
            error: message,
            providers: {},
            sources: [],
          });
        }
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET' || req.url?.split('?')[0] !== PATH) {
          next();
          return;
        }
        try {
          const cwd = server.config.root || process.cwd();
          const data = readLocalToolConfigs(cwd);
          sendJson(res, 200, data);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          sendJson(res, 500, {
            ok: false,
            error: message,
            providers: {},
            sources: [],
          });
        }
      });
    },
  };
}
