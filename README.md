# Elementum · 3D 交互式元素周期表

纯前端的交互式元素周期表，点击任意元素即可查看其 **3D 原子结构**（Bohr 模型风格：原子核 + 电子层 + 绕核运动的电子）。

无后端、无外部 API，`npm run build` 后可直接静态部署。

---

## 快速开始

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 输出到 dist/，可直接静态托管
npm run preview    # 本地预览生产构建
```

其他脚本：

```bash
npm run typecheck  # TypeScript 严格模式检查
npm run lint       # oxlint
npm run build:data # 重新生成 src/data/elements.json
```

`vite.config.ts` 中设置了 `base: './'`，因此构建产物使用相对路径，可直接部署到
Vercel / Cloudflare Pages / GitHub Pages（包括子路径项目站点）。

---

## 功能

**周期表主界面**
- 完整 118 种元素，标准 18×10 布局，镧系/锕系单独成行（主表内保留 `57-71` / `89-103` 占位标记）
- 按 10 个类别着色，悬停高亮 + 信息浮层，点击打开详情面板
- 顶部搜索：元素符号、中文名、英文名、原子序数（带相关度排序，`/` 聚焦，回车打开最佳匹配）
- 类别图例可点击筛选，一键清除
- 属性热力图：相对原子质量、密度、熔点、沸点、电负性、第一电离能、电子亲和能、原子半径

**元素详情**
- 基本信息、电子排布式（完整式 + 惰性气体简写式）、分层电子数、质子/中子/电子数
- 物理化学性质、维基百科简介与链接
- 键盘：`←` `→` 切换相邻元素，`Esc` 关闭
- 复制信息到剪贴板；最多 3 个元素并排对比

**3D 原子结构**
- 电子层数量与每层电子数严格来自真实 `shells` 数据
- 每层一个轨道环，颜色区分，倾角按黄金角分布，保持"同心可数"的同时呈现立体感
- 内层电子转速更快（呼应 Bohr 模型 v ∝ 1/n），相邻层反向旋转
- 拖拽旋转 / 滚轮缩放 / 自动旋转 / 电子运动开关 / 电子云 / 重置视角 / 全屏

**其他**
- 中英文切换（元素名 + 全部界面文案），语言与 3D 偏好持久化到 localStorage
- 深色科技风主题，响应式（桌面优先，移动端详情页以 3D 视图开头）
- 尊重 `prefers-reduced-motion`

---

## 数据

`src/data/elements.json` 由 `scripts/build-data.mjs` 生成，上游数据源
[Bowserinator/Periodic-Table-JSON](https://github.com/Bowserinator/Periodic-Table-JSON)
已固化在 `scripts/source/` 中，因此构建完全离线且可复现。

构建脚本在原始数据基础上做了这些处理：

- **中文名**：补齐全部 118 个元素
- **类别归一化**：上游的 15 种自由文本类别（含 `unknown, probably transition metal`
  一类的推测值）归并为 10 个规范类别。族信息优先于文本描述，因此卤素能从
  `diatomic nonmetal` 中独立出来，超重元素也能落到化学界实际采用的分区
- **电子排布式**：数字转为上标；惰性气体简写式重新生成
  （上游 `electron_configuration_semantic` 存在 `*[Rn] …`、`[Xe] 5d16s2` 等格式不一致）
- **原子半径**：补充 Slater (1964) 经验半径。**97 号及以后元素为 `null`** —— 这些元素
  没有实测半径，编造数值会污染热力图
- **校验**：断言恰好 118 个元素，且每个元素的 `shells` 之和等于其原子序数。
  不满足则构建失败，避免渲染出错误的原子模型

---

## 结构

```
scripts/
  build-data.mjs          数据生成脚本
  source/                 固化的上游 JSON
src/
  components/
    PeriodicTable/        网格布局 + 悬停浮层
    ElementCell/          单个元素格（memo 化）
    ElementDetail/        详情面板
    AtomModel/
      AtomModel.tsx       Canvas 容器、控制条、全屏、WebGL 降级
      AtomScene.tsx       场景内容（原子核 / 电子层 / 电子云）
      geometry.ts         纯几何计算（层半径、相机距离、轨道朝向）
    SearchBar/  CategoryFilter/  ComparePanel/
  data/     elements.json + 类别定义 + 搜索与热力图工具
  stores/   Zustand 状态
  i18n/     中英文文案
  types/    TypeScript 类型
  lib/      颜色工具
```

---

## 实现要点

**3D 性能**
每个电子层是一个 `InstancedMesh`，实例矩阵只在电子数变化时写入一次；动画通过旋转父级
`group` 完成，而不是逐帧重写矩阵。最重的元素（Og，118 个电子、7 层）约 17 个 draw call、
约 1.9 万个三角形。

切换元素时 `<Canvas>` **不会**被重新挂载（组件未按元素 key），场景只更新自身内容，
因此不会在每次点击时丢失并重建 WebGL 上下文。已验证：走完全部 118 个元素后，
页面上始终只有 1 个 canvas，且无任何控制台报错。

**相机取景**
`fov` 是垂直视场角，竖长的画布水平可视范围更窄。相机距离按
`min(1, aspect)` 归一化，取两个轴中更紧的一个，否则窄面板会把最外层电子层裁掉。

**已知限制**
- 104–118 号元素的中文名使用 CJK 扩展 B/C 区罕见字，缺少相应字体的系统会显示为方框。
  已在 CSS 中优先声明 Noto / 思源黑体，英文名始终可用作后备。
- 中子数由标准原子量四舍五入得出，对应最常见同位素，并非同位素表。
- 主题为固定深色，未实现浅色主题切换。
- 60fps 指标未能在本机验证：容器内没有 GPU，SwiftShader 软件渲染下即使是单电子场景
  也只有约 19fps。上面的 draw call 与三角形数量是可核对的替代依据。
