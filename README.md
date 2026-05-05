# 羽毛球俱乐部财务统计工具

基于 Turso 数据库、Python Flask 后端与 React/Vite 前端构建。

- 后端主入口: `server.ts` / `app.py`
- 数据库: Turso (SQLite)
- 环境配置依赖于 `.env`

部署准备：使用 `build.sh` 脚本和 `Dockerfile` 进行容器化构建及 Cloud Run 部署。
