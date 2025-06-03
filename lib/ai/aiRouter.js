/**
 * AI路由处理模块
 * 处理来自AI面板的对话请求
 */

import { paths } from "../paths.js";

const { config } = await import(paths.config);

/**
 * 设置AI相关的路由
 * @param {Express} app - Express应用实例
 */
export function setupAIRoutes(app) {
  // AI对话接口
  app.post("/api/ai-chat", async (req, res) => {
    try {
      const { message, history, timestamp, url } = req.body;
      
      console.log("📝 收到AI对话请求:", {
        message: message?.substring(0, 100) + (message?.length > 100 ? "..." : ""),
        historyLength: history?.length || 0,
        timestamp,
        url
      });

      // 验证请求数据
      if (!message || typeof message !== 'string' || message.trim() === '') {
        return res.status(400).json({
          success: false,
          message: "消息内容不能为空"
        });
      }

      // 调用AI接口获取回复
      const aiResponse = await callAIService({
        message: message.trim(),
        history: history || [],
        context: {
          url,
          timestamp,
          userAgent: req.get('user-agent'),
          ip: req.ip || req.connection.remoteAddress
        }
      });

      res.json({
        success: true,
        response: aiResponse,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error("❌ AI对话处理失败:", error);
      
      res.status(500).json({
        success: false,
        message: "AI服务暂时不可用，请稍后重试",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  // AI对话历史查询接口（可选）
  app.get("/api/ai-chat/history", async (req, res) => {
    try {
      // 这里可以实现对话历史的查询功能
      // 暂时返回空数组
      res.json({
        success: true,
        history: [],
        message: "对话历史功能待实现"
      });
    } catch (error) {
      console.error("❌ 获取对话历史失败:", error);
      res.status(500).json({
        success: false,
        message: "获取对话历史失败"
      });
    }
  });

  console.log("🤖 AI路由已设置完成");
}

/**
 * 调用AI服务
 * @param {Object} params - 请求参数
 * @param {string} params.message - 用户消息
 * @param {Array} params.history - 对话历史
 * @param {Object} params.context - 上下文信息
 * @returns {Promise<string>} AI回复
 */
async function callAIService({ message, history, context }) {
  try {
    // 这里可以集成不同的AI服务
    // 示例：OpenAI、Claude、本地模型等
    
    // 方案1: 使用OpenAI API
    if (process.env.OPENAI_API_KEY) {
      return await callOpenAI({ message, history, context });
    }
    
    // 方案2: 使用其他AI服务
    if (process.env.AI_SERVICE_URL) {
      return await callCustomAIService({ message, history, context });
    }
    
    // 方案3: 模拟回复（开发/测试用）
    return await generateMockResponse({ message, history, context });
    
  } catch (error) {
    console.error("🔥 AI服务调用失败:", error);
    throw new Error("AI服务响应异常");
  }
}

/**
 * 调用OpenAI API
 */
async function callOpenAI({ message, history, context }) {
  const { default: fetch } = await import('node-fetch');
  
  // 构建对话消息
  const messages = [
    {
      role: "system",
      content: `你是一个智能助手，正在帮助用户处理网页相关的问题。
当前页面URL: ${context.url}
请用简洁、友好的中文回复用户的问题。`
    }
  ];

  // 添加历史对话（最近5轮）
  const recentHistory = history.slice(-10);
  recentHistory.forEach(msg => {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    }
  });

  // 添加当前用户消息
  messages.push({
    role: "user",
    content: message
  });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
      messages: messages,
      max_tokens: 1000,
      temperature: 0.7,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`OpenAI API error: ${response.status} ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  
  if (!data.choices || !data.choices[0]?.message?.content) {
    throw new Error("OpenAI API返回格式异常");
  }

  return data.choices[0].message.content.trim();
}

/**
 * 调用自定义AI服务
 */
async function callCustomAIService({ message, history, context }) {
  const { default: fetch } = await import('node-fetch');
  
  const response = await fetch(process.env.AI_SERVICE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': process.env.AI_SERVICE_TOKEN ? `Bearer ${process.env.AI_SERVICE_TOKEN}` : undefined
    },
    body: JSON.stringify({
      message,
      history,
      context
    })
  });

  if (!response.ok) {
    throw new Error(`自定义AI服务错误: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.response || data.message || "抱歉，AI服务返回了空回复";
}

/**
 * 生成模拟回复（用于开发测试）
 */
async function generateMockResponse({ message, history, context }) {
  // 模拟网络延迟
  await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
  
  const responses = [
    `我理解你的问题："${message}"。这是一个很好的问题！`,
    `关于"${message}"，我来为你详细解答。`,
    `让我帮你分析一下"${message}"这个问题。`,
    `针对你提到的"${message}"，我有以下建议：`,
    `这是一个关于"${message}"的有趣问题，让我来回答你。`
  ];
  
  const baseResponse = responses[Math.floor(Math.random() * responses.length)];
  
  // 根据消息内容生成更具体的回复
  let specificResponse = "";
  
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('pug') || lowerMessage.includes('模板')) {
    specificResponse = `\n\n关于Pug模板的问题，这个项目使用了Pug作为模板引擎，支持组件化开发和多语言功能。你可以在 \`template/pages/\` 目录下找到页面模板文件。`;
  } else if (lowerMessage.includes('样式') || lowerMessage.includes('css')) {
    specificResponse = `\n\n关于样式的问题，这个项目支持作用域隔离的CSS处理，静态资源放在 \`template/static/\` 目录下。你可以使用调试工具来实时编辑元素样式。`;
  } else if (lowerMessage.includes('数据') || lowerMessage.includes('api')) {
    specificResponse = `\n\n关于数据的问题，项目通过 \`getData.js\` 文件管理数据获取逻辑，支持多语言数据和自动生成JSON缓存。`;
  } else if (lowerMessage.includes('调试') || lowerMessage.includes('debug')) {
    specificResponse = `\n\n关于调试功能，项目内置了Pug调试工具，可以点击页面元素查看模板信息和编辑样式。按ESC键可以退出调试模式。`;
  } else if (lowerMessage.includes('构建') || lowerMessage.includes('打包')) {
    specificResponse = `\n\n关于构建打包，项目支持静态网站生成、代码混淆、图片优化等功能。可以使用 \`npm run build\` 命令进行构建。`;
  } else {
    specificResponse = `\n\n这个问题很有价值，我建议你可以查看项目文档或者具体的代码实现来获得更详细的信息。`;
  }
  
  // 添加一些实用的提示
  const tips = [
    "\n\n💡 **小提示**: 你可以使用右下角的调试按钮来查看页面元素的详细信息。",
    "\n\n🔧 **建议**: 如果遇到问题，可以查看浏览器控制台的错误信息。",
    "\n\n📚 **提醒**: 项目的配置文件在 `config.js` 中，可以根据需要进行调整。",
    "\n\n🚀 **技巧**: 使用 `npm run dev` 可以启动开发服务器并开启热重载功能。"
  ];
  
  const randomTip = tips[Math.floor(Math.random() * tips.length)];
  
  return baseResponse + specificResponse + randomTip;
}

/**
 * 获取AI服务状态
 */
export function getAIServiceStatus() {
  const status = {
    available: false,
    service: "none",
    configured: false
  };

  if (process.env.OPENAI_API_KEY) {
    status.available = true;
    status.service = "openai";
    status.configured = true;
  } else if (process.env.AI_SERVICE_URL) {
    status.available = true;
    status.service = "custom";
    status.configured = true;
  } else {
    status.available = true;
    status.service = "mock";
    status.configured = false;
  }

  return status;
} 