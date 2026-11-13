# NetPath-Lens Pro (在线网络卡顿与链路根因分析仪) 🌐⚡

<div align="center">
  <img src="app-icon.png" width="112" height="112" alt="NetPath-Lens Pro Icon" />
  <h3>专为网络工程师、极客与远程办公者打造的端到端网络卡顿与链路根因诊断工作台</h3>
  <p>全链路五层遥测 • 哨兵黑匣子异常快照 • 本地 AI 智能根因诊断 • Web & macOS/Windows 原生双模</p>

  <p>
    <a href="https://github.com/rrobin0sky/online-ai-nettest"><img src="https://img.shields.io/badge/Platform-Web%20%7C%20macOS%20%7C%20Windows-blue" alt="Platform"></a>
    <a href="https://tauri.app"><img src="https://img.shields.io/badge/Tauri-2.0%2B-24C8D8?logo=tauri&logoColor=white" alt="Tauri 2.0"></a>
    <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19.1-61DAFB?logo=react&logoColor=black" alt="React 19"></a>
    <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT"></a>
    <a href="https://nettest.bin0sky.tech"><img src="https://img.shields.io/badge/Web-nettest.bin0sky.tech-purple" alt="Website"></a>
  </p>
</div>

---

## 🌟 核心特性 (Key Features)

- **⚡ 全链路 5 阶段深度诊断流水线 (5-Stage Diagnostic Pipeline)**：
  - **L1 本地 Wi-Fi 与物理链路遥测**：实时采集 SSID、BSSID、信道频宽、物理层协商速率 (MCS / PHY Mode)、信噪比 (SNR)、底噪与网关 RTT/抖动，内置 TUN/VPN 虚拟网卡旁路探测。
  - **L2 系统代理拓扑与多解算器 DNS 基准**：秒级探测 HTTP/HTTPS/SOCKS5 系统代理与 PAC 规则；横向多路比对系统 DHCP DNS、阿里 AliDNS、腾讯 DNSPod、Cloudflare 与 Google Public DNS 响应时延与抗污染状态。
  - **L3 广域网骨干多跳 MTR 追踪**：支持 ICMP / UDP 协议探测，逐跳展现路由节点 IP、时延直方图与丢包率，迅速定位骨干网拥塞瓶颈。
  - **L4 缓冲区膨胀 (Bufferbloat) 压力评估**：模拟全载荷吞吐压力下的延迟劣化比率，评定 A+ 至 F 级防卡顿等级。
  - **L5 端到端应用层与 TLS 传输质量**：精准测量 TCP 握手时长、TLS 1.3 会话复用协商开销与首字节到达时间 (TTFB)。

- **🛰️ 哨兵黑匣子 (Sentinel Blackbox)**：
  - 高频环形缓冲区 (Ring Buffer) 静默监测，毫秒级捕获网络尖峰卡顿。
  - 支持异常自动触发与手动一键快照 (Freeze Snapshot)，精准回溯卡顿前 60 秒的丢包与时延震荡。

- **🤖 AI 智能根因分析 (RCA Engine)**：
  - 自动汇总 5 层遥测数据，输出结构化卡片：定位根因、精准修复建议与受影响层级。
  - 原生无缝集成 **本地 Ollama 离线大模型**（支持 DeepSeek、Qwen、Llama 等），所有网络排障隐私数据绝不上云。

- **🎨 极客视觉与双模架构 (Web + Desktop)**：
  - **Web 纯前端版**：基于现代浏览器 Fetch / WebSocket / WebRTC 探针，零安装秒级在线轻测与拓扑预览。
  - **Tauri 原生桌面端**：基于底层 Rust 原生系统套接字与特权驱动，提供军工级精确度。
  - 完整的暗色玻璃态 UI 与中英文 (zh/en) 国际化无缝热切换。

---

## 🚀 快速上手 (Getting Started)

### 1. Web 浏览器版本 (纯前端)

```bash
# 安装依赖
pnpm install

# 启动开发调试预览 (运行在 http://localhost:5173)
pnpm dev

# 构建生产环境高压缩静态产物
pnpm build
```

构建生成的 `dist/` 目录可直接部署于 Cloudflare Pages、Vercel 或任意静态托管服务。

### 2. 桌面端 (Tauri 原生应用)

确保已安装 [Rust 开发环境](https://rustup.rs/)：

```bash
# 启动桌面端热重载开发环境
pnpm tauri dev

# 打包构建原生安装包 (.dmg / .app / .msi)
pnpm tauri build
```

---

## 🏛️ 项目工程架构

```
online-ai-nettest/
├── src/                      # 前端交互与诊断视图 (React 19 + TailwindCSS 4)
│   ├── components/           # 遥测仪表盘、MTR 拓扑图、哨兵图表组件
│   ├── services/             # 诊断管线执行器与 Tauri IPC 桥接 (带 Web Fallback)
│   ├── types/                # 全链路 TypeScript 强类型定义
│   ├── locales/              # 中英文双语 i18n 资源
│   └── App.tsx               # 主工作台容器与路由
├── src-core/                 # 核心分析逻辑与哨兵状态机 (TypeScript 核心层)
│   ├── analyzer/             # 启发式 RCA 根因决策引擎与规则库
│   ├── probes/               # 多解算器 DNS 与网络探针调度
│   └── sentinel/             # 环形缓冲区与快照管理器
├── src-tauri/                # 桌面端底座 (Rust + Tauri 2.0)
│   ├── src/                  # 系统底层网络套接字、IOKit Wi-Fi 与 MTR 原生驱动
│   └── Cargo.toml            # Rust 依赖清单
└── tests/                    # 诊断核心逻辑单元测试
```

---

## 📄 开源许可证 (License)

本项目基于 [MIT 许可证](LICENSE) 开源。
