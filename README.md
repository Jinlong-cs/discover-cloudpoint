# Discover PointCloud

面向 DiscoverStereo `GT vs Prediction` 的点云对比工具。目标使用方式是：
从 GitHub clone 仓库后，在仓库目录执行 `pip install -e .`，然后直接运行
`discover-pointcloud`。

## 功能

- 上下显示两组点云，保留同步视角交互
- Plotly 3D 交互，双视图相机同步
- 固定视差桶着色：
  - `0-16`
  - `16-32`
  - `32-48`
  - `48-64`
  - `64-96`
- 点大小、透明度、背景切换
- 桶开关、`>96 / missing` 可选显示
- PNG 截图导出
- 支持拖拽或文件选择

## 安装与启动

要求：

- Python `>=3.10`
- 一个现代浏览器，例如 Chrome、Safari、Edge、Firefox
- 默认安装没有 PySide6 等重量级 GUI 依赖，适配性更强

从 GitHub clone 后安装：

```bash
git clone git@github.com:Jinlong-cs/discover-cloudpoint.git
cd discover-cloudpoint
python -m pip install --upgrade pip
python -m pip install -e .
discover-pointcloud
```

本地已有源码目录时：

```bash
cd pointcloud_compare_tool
python -m pip install --upgrade pip
python -m pip install -e .
discover-pointcloud
```

默认启动方式会：

- 启动一个本地静态资源 server
- 自动打开系统默认浏览器
- 在终端保持运行，按 `Ctrl+C` 停止

如果你想指定地址或端口：

```bash
discover-pointcloud --host 127.0.0.1 --port 8000
```

可选 Qt 内嵌窗口模式：

```bash
python -m pip install -e ".[qt]"
discover-pointcloud --qt
```

Python 包入口：

- CLI：`discover-pointcloud`
- 模块：`discover_pointcloud`

## 支持输入

- `.ply`
  - 支持 `ascii`
  - 支持 `binary_little_endian`
  - 必需字段：`x y z`
  - 可选字段：`disp` 或 `disparity`
  - 可选像素字段：`u/v`、`pixel_x/pixel_y`、`col/row`
- `.json`
  - `{"points": [[x, y, z, disp], ...]}`
  - `{"points": [[x, y, z, disp, u, v], ...]}`
  - `{"points": [{"x": ..., "y": ..., "z": ..., "disp": ...}, ...]}`

如果文件不带视差字段，工具会使用：

`disp = fx * baseline / z`

所以要保证 `z` 是前向深度，单位是米。

默认参数来自 DiscoverStereo 数据集标定文件：

- `StereoEstimation/DiscoverStereo/day_office/calib.txt`
- `StereoEstimation/DiscoverStereo/day_testbuild/calib.txt`
- `StereoEstimation/DiscoverStereo/night_office/calib.txt`
- `StereoEstimation/DiscoverStereo/night_testbuild/calib.txt`
- `StereoEstimation/DiscoverStereo/park/calib.txt`

当前 DiscoverStereo 各子集一致：

- `fx = fy = 372.429241685`
- `cx = 640.0`
- `cy = 544.0`
- `baseline = 0.054885186954 m`

## 像素对比

点选像素对比功能当前暂时关闭，避免大点云点击后触发浏览器卡死。
当前版本不会创建透明点击层，也不会响应 Plotly 点击事件。

如果文件没有显式像素字段，工具会用当前相机参数从 `x/y/z` 反投影：

```text
u = fx * x / z + cx
v = fy * y / z + cy
```

## 内置样例

页面里的内置样例来自 DiscoverStereo representative 5：

- 源 HTML：`../bucket_pointcloud_compare_representative5_lite/val_*/pointcloud_bucket_compare.html`
- 抽取后的 JSON：`discover_samples/`
- 包内静态资源镜像：`discover_pointcloud/frontend/discover_samples/`
- 清单：`discover_samples/manifest.json`

每个代表样例提供两种内置对比：

- `GT vs 640x352 best -> fullres`
- `GT vs 1280x1088 best`

如需重新生成这些内置样例：

```bash
cd ..
python3 pointcloud_compare_tool/scripts/generate_discover_samples.py
```

## 前端资产同步

canonical 前端源码保留在工具根目录：

- `index.html`
- `app.js`
- `styles.css`
- `discover_samples/`

Python 包内的 `discover_pointcloud/frontend/` 是发布用静态资源镜像。修改根目录前端或重新生成样例后，运行：

```bash
python3 scripts/sync_python_frontend_assets.py
```

Plotly 与 html2canvas 已放在 `vendor/` 并随 Python 包发布，桌面版不依赖 CDN 联网加载。

## 浏览器开发模式

如果要直接调试根目录前端，可以在仓库父目录启动静态服务：

```bash
cd ..
python3 -m http.server 8000
```

然后打开：

`http://localhost:8000/<repo-dir>/`

## 验证

语法检查：

```bash
python -m py_compile \
  discover_pointcloud/__init__.py \
  discover_pointcloud/__main__.py \
  discover_pointcloud/app.py \
  discover_pointcloud/server.py \
  scripts/generate_discover_samples.py \
  scripts/sync_python_frontend_assets.py \
  scripts/smoke_check.py
```

CLI 与资源 smoke check：

```bash
discover-pointcloud --help
python3 scripts/smoke_check.py
```
