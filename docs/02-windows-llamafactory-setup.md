# 一期 Windows 安装清单与目录初始化方案

## 目标

本步骤只解决一期：

- Windows 主机环境初始化
- 所有环境尽量放到 `E:\.env_trains`
- 安装 `LLaMA-Factory`
- 为后续平台脚手架提供稳定目录和 Python 解释器

不包含：

- 平台后端代码
- 前端 H5 页面
- 训练数据制作
- Ollama 模型转换脚本

## 官方约束与实现判断

### Python

Python 官方文档说明：

- Windows 开发者更适合使用 **full installer**
- 如果选 `Install Now`，Python 会默认装到用户目录
- 选 `Customize installation` 可以指定安装路径

因此本项目不建议用 Microsoft Store 版 Python，也不建议使用默认安装位置。  
建议使用官方完整安装包，并将安装目录指定为：

- `E:\.env_trains\python311`

参考：

- [Python on Windows](https://docs.python.org/3.10/using/windows.html)
- [venv](https://docs.python.org/3/library/venv.html)

### LLaMA-Factory

`LLaMA-Factory` 官方 README 明确给出 Windows 路线：

- Windows 需要手动安装 GPU 版 PyTorch
- 如果在 Windows 上做 QLoRA，需要安装预编译 `bitsandbytes`
- 如果出现 `Can't pickle local object`，建议设置 `dataloader_num_workers: 0`

同时官方给出了标准 CLI：

- `llamafactory-cli train`
- `llamafactory-cli chat`
- `llamafactory-cli export`

参考：

- [LLaMA-Factory README](https://github.com/hiyouga/LLaMA-Factory)

### Hugging Face 缓存

官方文档支持通过 `HF_HOME` 和 `HF_HUB_CACHE` 控制缓存目录，因此缓存不需要落在用户目录。

参考：

- [Hugging Face environment variables](https://huggingface.co/docs/huggingface_hub/en/package_reference/environment_variables)

### Ollama

Ollama 官方 FAQ 说明：

- Windows 默认模型目录在 `C:\Users\%username%\.ollama\models`
- 可以通过 `OLLAMA_MODELS` 改到其他目录

因此平台一期建议将 Ollama 模型目录也固定到：

- `E:\.env_trains\cache\ollama`

参考：

- [Ollama FAQ](https://docs.ollama.com/faq)

## 一期推荐安装结果

### 基础目录

- `E:\.env_trains\python311`
- `E:\.env_trains\venvs\lf-py311`
- `E:\.env_trains\src\LLaMA-Factory`
- `E:\.env_trains\cache\pip`
- `E:\.env_trains\cache\huggingface`
- `E:\.env_trains\cache\torch`
- `E:\.env_trains\cache\npm`
- `E:\.env_trains\cache\ollama`
- `E:\.env_trains\tmp`

### 平台运行目录

- `E:\ai\ai_trains\runtime\sqlite`
- `E:\ai\ai_trains\runtime\datasets`
- `E:\ai\ai_trains\runtime\templates`
- `E:\ai\ai_trains\runtime\runs`
- `E:\ai\ai_trains\runtime\artifacts`
- `E:\ai\ai_trains\runtime\logs`
- `E:\ai\ai_trains\runtime\reports`

## 安装顺序

### 第 1 步：执行目录初始化脚本

脚本：

- [01-init-layout.ps1](E:\ai\ai_trains\scripts\windows\01-init-layout.ps1)

执行：

```powershell
powershell -ExecutionPolicy Bypass -File E:\ai\ai_trains\scripts\windows\01-init-layout.ps1
```

这个脚本会：

- 创建 `E:\.env_trains` 下的环境目录
- 创建项目 `runtime` 目录
- 写入用户级环境变量

### 第 2 步：安装 Python 到 E 盘

建议使用官方完整安装包，并在安装界面选择：

- `Customize installation`
- 安装路径：`E:\.env_trains\python311`

不要用：

- Microsoft Store Python
- 默认 `Install Now`

原因：

- Store 版对本地数据和临时目录有重定向
- 默认安装会优先写入用户目录
- 都不符合你“尽量不写到 C 盘”的目标

### 第 3 步：创建虚拟环境

脚本：

- [02-create-lf-venv.ps1](E:\ai\ai_trains\scripts\windows\02-create-lf-venv.ps1)

执行：

```powershell
powershell -ExecutionPolicy Bypass -File E:\ai\ai_trains\scripts\windows\02-create-lf-venv.ps1
```

默认使用：

- Python：`E:\.env_trains\python311\python.exe`
- 虚拟环境：`E:\.env_trains\venvs\lf-py311`

### 第 4 步：安装 LLaMA-Factory

脚本：

- [03-install-llamafactory.ps1](E:\ai\ai_trains\scripts\windows\03-install-llamafactory.ps1)

执行：

```powershell
powershell -ExecutionPolicy Bypass -File E:\ai\ai_trains\scripts\windows\03-install-llamafactory.ps1
```

默认行为：

- 克隆或更新 `LLaMA-Factory` 到 `E:\.env_trains\src\LLaMA-Factory`
- 在虚拟环境中安装 GPU 版 PyTorch
- 安装 `LLaMA-Factory`
- 安装 `requirements/metrics.txt`

### 第 5 步：可选安装 QLoRA 依赖

只有当你显存不足，必须使用 Windows 上的 QLoRA 时，再加这个步骤。  
一期建议先用普通 LoRA 跑通，不要一上来引入 `bitsandbytes`。

如果后面要装，可以执行：

```powershell
powershell -ExecutionPolicy Bypass -File E:\ai\ai_trains\scripts\windows\03-install-llamafactory.ps1 -InstallBitsAndBytes
```

### 第 6 步：验证环境

脚本：

- [04-verify-lf.ps1](E:\ai\ai_trains\scripts\windows\04-verify-lf.ps1)

执行：

```powershell
powershell -ExecutionPolicy Bypass -File E:\ai\ai_trains\scripts\windows\04-verify-lf.ps1
```

验证项：

- Python 路径
- venv 路径
- `torch.cuda.is_available()`
- `pip show llamafactory`
- `llamafactory-cli help`

## 一期默认安装建议

### 推荐 Python 版本

- `Python 3.11`

原因：

- 足够新
- 兼容主流 PyTorch 和训练工具链
- 适合作为一期统一环境版本

### 推荐 PyTorch 安装策略

按 `LLaMA-Factory` README 的 Windows 建议，手动安装 GPU 版 PyTorch。  
一期默认脚本使用：

- `https://download.pytorch.org/whl/cu126`

如果你机器驱动或 CUDA 兼容性不适配，再改成与本机驱动匹配的官方索引。

### 推荐训练方式

一期优先：

- `LoRA-SFT`

一期暂不默认启用：

- `QLoRA`
- `FlashAttention-2`
- `DeepSpeed`

原因：

- 先保证安装成功率
- 先保证平台能闭环
- 高级优化留到稳定后再加

## Windows 常见注意点

### PowerShell 执行策略

Python 官方文档说明，Windows 上若 `Activate.ps1` 无法运行，可能需要设置：

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### 不建议依赖手工 activate

`venv` 官方文档也说明，虚拟环境并不一定要先 activate，直接调用虚拟环境里的 Python 也可以。  
所以本项目脚本统一使用：

- `E:\.env_trains\venvs\lf-py311\Scripts\python.exe`

避免因 shell 状态不一致导致失败。

### 下载模型失败时

如果从 Hugging Face 拉模型不稳定，可以尝试 `LLaMA-Factory` README 里给出的 Windows 方式：

```powershell
set USE_MODELSCOPE_HUB=1
```

这个开关只建议在模型下载受阻时再开。

### DataLoader 报错时

如果训练报：

- `Can't pickle local object`

优先把训练配置中的 `dataloader_num_workers` 设为 `0`。

## 一期完成标准

执行完本步骤后，至少应满足：

1. Python 在 `E:\.env_trains\python311`
2. venv 在 `E:\.env_trains\venvs\lf-py311`
3. `LLaMA-Factory` 源码在 `E:\.env_trains\src\LLaMA-Factory`
4. 运行缓存不写入默认用户目录
5. `torch.cuda.is_available()` 返回 `True`
6. `llamafactory-cli help` 可以正常运行

## 下一步

完成本步骤后，下一步建议进入：

- 平台脚手架目录初始化
- SQLite 表结构
- FastAPI 基础接口
- Worker 轮询任务机制
