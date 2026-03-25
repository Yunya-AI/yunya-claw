# 桌宠智能感知系统开发计划

## 项目目标

让化身（桌宠）能够感知 OpenClaw 的流式输出内容，通过中心处理器分析后调度动作执行器进行响应。

## 架构概览

```
流式内容感知器 (PetSensor) → 动作决策中心 (PetBrain) → 动作执行器 (PetExecutor)
```

---

## 开发阶段

### Phase 1: 基础架构 (Day 1)

#### 1.1 创建核心模块文件
- [ ] 创建 `electron/pet-sensor.ts` - 流式内容感知器
- [ ] 创建 `electron/pet-brain.ts` - 动作决策中心
- [ ] 创建 `electron/pet-executor.ts` - 动作执行器
- [ ] 创建 `electron/pet-intelligence.ts` - 统一入口和类型定义

#### 1.2 定义 TypeScript 接口
- [ ] SensorEvent - 感知事件类型
- [ ] ActionDecision - 动作决策类型
- [ ] DecisionRule - 决策规则类型
- [ ] PetIntelligenceConfig - 配置类型

---

### Phase 2: 流式内容感知器 (Day 1-2)

#### 2.1 PetSensor 实现
- [ ] 内容缓冲区（滑动窗口）
- [ ] 关键词匹配引擎
- [ ] 正则表达式匹配
- [ ] 意图识别（基于规则）
- [ ] 事件发射器（EventEmitter）

#### 2.2 集成到 main.ts
- [ ] 在 WebSocket 事件处理中注入感知器
- [ ] 监听 `agent` 流的 `assistant` 内容
- [ ] 监听 `chat` 流的 `delta` 内容

---

### Phase 3: 动作决策中心 (Day 2-3)

#### 3.1 规则引擎
- [ ] 规则加载和管理
- [ ] 规则匹配算法
- [ ] 优先级排序
- [ ] 冷却时间控制
- [ ] 默认规则集

#### 3.2 LLM 决策（可选）
- [ ] LLM 调用接口
- [ ] Prompt 模板设计
- [ ] 响应解析
- [ ] 超时和错误处理

---

### Phase 4: 动作执行器 (Day 3-4)

#### 4.1 PetExecutor 实现
- [ ] 动作队列管理
- [ ] 优先级队列
- [ ] 可打断性检测
- [ ] 执行状态追踪

#### 4.2 与现有系统集成
- [ ] 通过 IPC 通知桌宠窗口
- [ ] 复用 `desktopPet:playAction`
- [ ] 添加新 IPC: `pet:executeAction`

---

### Phase 5: 配置系统 (Day 4-5)

#### 5.1 配置文件
- [ ] 创建配置文件 `pet-intelligence.json`
- [ ] 配置读写 IPC handler
- [ ] 默认配置

#### 5.2 前端配置界面
- [ ] 在 `DesktopPetConfigPage.tsx` 添加智能感知配置
- [ ] 开关控制
- [ ] 规则编辑器
- [ ] LLM 配置选项

---

### Phase 6: 测试和优化 (Day 5)

#### 6.1 功能测试
- [ ] 测试流式内容感知
- [ ] 测试规则匹配
- [ ] 测试动作执行
- [ ] 测试配置持久化

#### 6.2 优化
- [ ] 性能优化（防抖、节流）
- [ ] 内存管理
- [ ] 错误边界处理

---

## 文件清单

### 新增文件
| 文件路径 | 说明 |
|---------|------|
| `electron/pet-intelligence.ts` | 统一入口，导出类型和模块 |
| `electron/pet-sensor.ts` | 流式内容感知器 |
| `electron/pet-brain.ts` | 动作决策中心 |
| `electron/pet-executor.ts` | 动作执行器 |
| `src/components/PetIntelligenceConfig.tsx` | 智能感知配置组件 |

### 修改文件
| 文件路径 | 修改内容 |
|---------|---------|
| `electron/main.ts` | 集成智能感知系统 |
| `electron/preload.ts` | 添加新的 IPC API |
| `src/pages/DesktopPetConfigPage.tsx` | 集成配置组件 |
| `src/global.d.ts` | 添加新的类型定义 |

---

## 默认规则集

| 规则ID | 触发条件 | 动作 | 优先级 |
|--------|---------|------|--------|
| greeting | 你好/hello/hi | wave | high |
| thinking | 问题/命令意图 | think | normal |
| success | 完成/成功 | celebrate | high |
| error | 错误/失败/抱歉 | sad | high |
| coding | 代码块 ``` | typing | normal |
| explaining | 解释/说明 | explain | low |

---

## 配置示例

```json
{
  "enabled": true,
  "sensor": {
    "bufferSize": 10,
    "debounceMs": 200
  },
  "brain": {
    "useLLM": false,
    "rules": []
  },
  "executor": {
    "maxQueueSize": 5
  }
}
```

---

## 开发顺序

1. **Phase 1.1-1.2** → 创建基础架构和类型
2. **Phase 2.1-2.2** → 实现感知器并集成
3. **Phase 3.1** → 实现规则引擎
4. **Phase 4.1-4.2** → 实现执行器并集成
5. **Phase 5.1-5.2** → 配置系统和 UI
6. **Phase 6** → 测试和优化

---

## 当前进度

- [x] 方案设计
- [x] Phase 1: 基础架构
  - [x] electron/pet-intelligence.ts - 类型定义和默认配置
  - [x] electron/pet-sensor.ts - 流式内容感知器
  - [x] electron/pet-brain.ts - 动作决策中心
  - [x] electron/pet-executor.ts - 动作执行器
- [x] Phase 2: 集成到 main.ts
  - [x] 添加智能感知系统初始化
  - [x] 修改 handleGatewayEvent 捕获流式内容
  - [x] 添加配置 IPC handlers
  - [x] 更新 preload.ts API
  - [x] 更新 global.d.ts 类型定义
  - [x] 窗口变化事件监听
- [x] Phase 3: 前端配置界面
  - [x] 创建 PetIntelligenceConfig.tsx 组件
  - [x] 集成到 DesktopPetConfigPage.tsx
- [x] Phase 4: 测试和优化
  - [x] 构建测试通过

## 完成状态

**智能感知系统已开发完成！**

### 新增文件
- `electron/pet-intelligence.ts` - 类型定义和模块入口
- `electron/pet-sensor.ts` - 流式内容感知器
- `electron/pet-brain.ts` - 动作决策中心（规则引擎）
- `electron/pet-executor.ts` - 动作执行器
- `src/components/PetIntelligenceConfig.tsx` - 前端配置组件

### 修改文件
- `electron/main.ts` - 集成智能感知系统
- `electron/preload.ts` - 添加 IPC API
- `electron/desktop-pet.ts` - 导出窗口获取函数
- `src/global.d.ts` - 添加类型定义
- `src/pages/DesktopPetConfigPage.tsx` - 集成配置组件
