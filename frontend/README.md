# Alarm Diagnosis Frontend

Unified Gemini-style workbench frontend for the alarm diagnosis training and inference comparison platform.

## Stack

- Vue 3
- Vite
- Element Plus
- SCSS

## Install

```powershell
cd <本仓库根目录>\frontend
$env:npm_config_cache='E:\.env_trains\cache\npm'
npm install
```

## Run

```powershell
cd <本仓库根目录>\frontend
$env:npm_config_cache='E:\.env_trains\cache\npm'
npm run dev
```

Default addresses:

- Frontend: `http://127.0.0.1:15173`
- Backend API proxy: `http://127.0.0.1:18080/api`

`npm run dev` now builds and starts the stable preview server so the page is directly usable in the browser.

If you need hot reload during frontend development:

```powershell
cd <本仓库根目录>\frontend
$env:npm_config_cache='E:\.env_trains\cache\npm'
npm run dev:hot
```

## Build

```powershell
cd <本仓库根目录>\frontend
$env:npm_config_cache='E:\.env_trains\cache\npm'
npm run build
```

## Routes

- `/` overview dashboard
- `/experiments` experiment registry
- `/experiments/create` create experiment
- `/runs` run registry
- `/runs/:id` run detail
- `/runs/compare` run compare bench
