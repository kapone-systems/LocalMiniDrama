# 正式路径：本仓库直连 ComfyUI（`api_protocol: comfyui`）

从 2026-09-20 起，产品主路径是 **Node 后端直连本机 `http://127.0.0.1:8188`**（`/prompt` + `/history` + `/view`），在 AI 配置里选「本地 ComfyUI」。  
工作流必须是 **Save (API Format)**；模型名 = JSON 文件名。详见 `docs/configuration.md` 的「本地 ComfyUI」和 `docs/plans/2026-09-20-local-comfyui-protocol.md`。

下文 Rust `comfyui-openai-api` **仅供对照标题约定、验证工作流**，不是产品依赖，不要写进 AI 配置一键包。  
视频不要走 OpenAI 兼容去打这个代理（轮询路径与本项目默认视频协议不一致）。

---

# 使用系统自带的PowerShell执行
# 1.将ComfyUI包装成标准的OpenAI API接口
CD C:\ComfyUI
git clone https://github.com/pnyxai/comfyui-openai-api.git
# 2.进入目录
CD C:\ComfyUI\comfyui-openai-api\apps\rust\comfyui-openai-api
# 3.安装ComFyUI OpenAI API代理环境支持-Rust 
https://rust-lang.org/zh-CN/tools/install/
#4.编译ComFyUI OpenAI API代理程序代码-Rust
cargo clean
cargo build --release
# 5.启动组件 终端显示 Proxy server listening on 0.0.0.0:8080为成功。
./target/release/comfyui-openai-api

# 生成的OpenAI API接口地址http://127.0.0.1:8080/v1/images/generations 

感谢群友 欧先生@全力以赴  整理的教程