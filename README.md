# MindSpark

[在线体验](https://qishangc.github.io/mindspark) | [反馈问题](https://github.com/qishangc/mindspark/issues)

> **"你只负责想，剩下的交给偶遇。"**

## 📖 为什么做这个

市面上的笔记工具大多假设用户愿意整理、分类、打标签。但我不这样——我太懒了，想法很多，即使记录了也很少回顾，大量和LLM聊天后，就更多了，会突然想起“好像很久前我也有过类似的想法”，翻遍笔记却找不到。偶尔翻到很久以前的记录，连自己都震惊：“我以前咋想到的？”

所以我想做一个简单的想法收集器：

- 有想法就放进去，不用分类、不用整理。
- 如果新想法和旧想法有关联，它能提醒我。
- 随机排列，偶尔打开能看到很久以前的自己。

名字是 Gemini 起的——**MindSpark**

---

✨ 功能

- **零摩擦输入**：打开就写，没有标题、分类、文件夹。
- **随机排列**：每次打开都是不同的卡片顺序，让旧想法自己跳出来。
- **关联推荐**（可选）：配置 Embedding API 后，自动计算笔记间的语义相似度，在阅读时推荐相关想法。
- **数据存储**：纯前端 + localStorage，无需注册使用
- **深色/浅色主题**，一键切换。
- **导入/导出**：JSON 或 Markdown，随时备份。

---

## 🚀 快速开始

### 直接使用（在线版）

访问 [https://qishangc.github.io/mindspark](https://qishangc.github.io/mindspark)

### 克隆项目（完全没必要版）

```bash
git clone https://github.com/qishangc/mindspark.git
cd mindspark
```

## 🤖 AI 智能关联（可选）

1.点击工具栏右侧的 ⚙️ → AI 设置。
2.选择服务商（OpenAI / 硅基流动 / 自定义），填写 API Key 和模型名称。
3.点击测试连接，成功后保存。
4.之后新建的笔记会自动生成向量，查看笔记时底部会显示“相关想法”。
 ⚠️ API Key 仅存在你的浏览器里，不会上传到任何服务器。由于前端直接调用 API，请不要把 Key 分享给他人。

## 🛠 技术栈

HTML / CSS / JavaScript（纯原生，没有框架）

## 🤝 贡献

如果你也有共鸣，欢迎提 Issue 或 PR。
[点这里](https://github.com/qishangc/mindspark/issues) 反馈问题或建议。

## 📄 许可证

MIT © qishangc

---

*MindSpark — 让散落的思维碎片，自己找到彼此。*
