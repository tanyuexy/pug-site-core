import express from 'express';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

// 获取template-debug目录的绝对路径
const templateDebugPath = path.join(process.cwd(), 'template-debug');

// 检查是否设置了OpenAI API密钥
const hasOpenAIKey = !!process.env.OPENAI_API_KEY;

let model = null;
let agentExecutor = null;

// 动态导入langchain模块并初始化
async function initializeAI() {
    if (!hasOpenAIKey) {
        console.warn('警告: 未设置OPENAI_API_KEY环境变量，AI功能将不可用');
        return false;
    }

    try {
        const { ChatOpenAI } = await import('@langchain/openai');
        const { AgentExecutor, createOpenAIFunctionsAgent } = await import('langchain/agents');
        const { ChatPromptTemplate, MessagesPlaceholder } = await import('@langchain/core/prompts');
        const { HumanMessage, AIMessage } = await import('@langchain/core/messages');
        const { DynamicTool } = await import('@langchain/core/tools');

        // 初始化OpenAI模型
        model = new ChatOpenAI({
            modelName: "gpt-3.5-turbo",
            temperature: 0.1,
        });

        // 定义工具函数
        const tools = [
            new DynamicTool({
                name: "read_file",
                description: "读取template-debug目录下的文件内容。参数: filepath - 相对于template-debug的文件路径",
                func: async (filepath) => {
                    try {
                        const fullPath = path.join(templateDebugPath, filepath);
                        
                        // 安全检查：确保文件在template-debug目录内
                        if (!fullPath.startsWith(templateDebugPath)) {
                            return "错误：只能访问template-debug目录下的文件";
                        }
                        
                        if (!await fs.pathExists(fullPath)) {
                            return `文件不存在: ${filepath}`;
                        }
                        
                        const content = await fs.readFile(fullPath, 'utf-8');
                        return `文件内容 (${filepath}):\n${content}`;
                    } catch (error) {
                        return `读取文件失败: ${error.message}`;
                    }
                }
            }),

            new DynamicTool({
                name: "write_file",
                description: "写入或修改template-debug目录下的文件。参数格式: filepath|content (用|分隔文件路径和内容)",
                func: async (input) => {
                    try {
                        const [filepath, ...contentParts] = input.split('|');
                        const content = contentParts.join('|');
                        
                        if (!filepath || content === undefined) {
                            return "错误：请提供文件路径和内容，格式: filepath|content";
                        }
                        
                        const fullPath = path.join(templateDebugPath, filepath);
                        
                        // 安全检查：确保文件在template-debug目录内
                        if (!fullPath.startsWith(templateDebugPath)) {
                            return "错误：只能修改template-debug目录下的文件";
                        }
                        
                        // 确保目录存在
                        await fs.ensureDir(path.dirname(fullPath));
                        
                        // 写入文件
                        await fs.writeFile(fullPath, content, 'utf-8');
                        
                        return `文件已成功保存: ${filepath}`;
                    } catch (error) {
                        return `写入文件失败: ${error.message}`;
                    }
                }
            }),

            new DynamicTool({
                name: "list_files",
                description: "列出template-debug目录下的文件和文件夹。参数: dirpath - 相对于template-debug的目录路径（可选，默认为根目录）",
                func: async (dirpath = '') => {
                    try {
                        const fullPath = path.join(templateDebugPath, dirpath);
                        
                        // 安全检查
                        if (!fullPath.startsWith(templateDebugPath)) {
                            return "错误：只能访问template-debug目录下的内容";
                        }
                        
                        if (!await fs.pathExists(fullPath)) {
                            return `目录不存在: ${dirpath || '/'}`;
                        }
                        
                        const items = await fs.readdir(fullPath, { withFileTypes: true });
                        const result = items.map(item => {
                            const type = item.isDirectory() ? '[目录]' : '[文件]';
                            return `${type} ${item.name}`;
                        }).join('\n');
                        
                        return `目录内容 (${dirpath || '/'}):\n${result}`;
                    } catch (error) {
                        return `列出文件失败: ${error.message}`;
                    }
                }
            }),

            new DynamicTool({
                name: "delete_file",
                description: "删除template-debug目录下的文件。参数: filepath - 相对于template-debug的文件路径",
                func: async (filepath) => {
                    try {
                        const fullPath = path.join(templateDebugPath, filepath);
                        
                        // 安全检查
                        if (!fullPath.startsWith(templateDebugPath)) {
                            return "错误：只能删除template-debug目录下的文件";
                        }
                        
                        if (!await fs.pathExists(fullPath)) {
                            return `文件不存在: ${filepath}`;
                        }
                        
                        await fs.remove(fullPath);
                        return `文件已删除: ${filepath}`;
                    } catch (error) {
                        return `删除文件失败: ${error.message}`;
                    }
                }
            })
        ];

        // 创建prompt模板
        const prompt = ChatPromptTemplate.fromMessages([
            ["system", `你是一个专业的代码修改助手。你可以帮助用户修改template-debug目录下的代码文件。

你有以下工具可以使用：
1. read_file - 读取文件内容
2. write_file - 写入或修改文件内容
3. list_files - 列出目录内容
4. delete_file - 删除文件

请根据用户的需求，使用这些工具来完成代码修改任务。在修改代码时，请：
- 仔细理解用户的需求
- 先读取相关文件了解现有代码结构
- 进行必要的修改
- 确保代码语法正确
- 提供清晰的修改说明

始终用中文回复用户。`],
            new MessagesPlaceholder("chat_history"),
            ["human", "{input}"],
            new MessagesPlaceholder("agent_scratchpad")
        ]);

        // 创建agent
        const agent = await createOpenAIFunctionsAgent({
            llm: model,
            tools,
            prompt
        });

        // 创建agent执行器
        agentExecutor = new AgentExecutor({
            agent,
            tools,
            verbose: true,
            maxIterations: 10
        });

        console.log('AI代码修改助手初始化成功');
        return true;
    } catch (error) {
        console.error('初始化AI失败:', error);
        return false;
    }
}

// 存储对话历史
const chatHistories = new Map();

// API路由
router.post('/chat', async (req, res) => {
    try {
        const { message, sessionId = 'default' } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: '请提供消息内容' });
        }

        // 如果AI未初始化，尝试初始化
        if (!agentExecutor) {
            const initialized = await initializeAI();
            if (!initialized) {
                return res.status(500).json({
                    success: false,
                    error: 'AI服务不可用，请检查OPENAI_API_KEY环境变量是否设置'
                });
            }
        }

        // 获取或初始化对话历史
        if (!chatHistories.has(sessionId)) {
            chatHistories.set(sessionId, []);
        }
        const chatHistory = chatHistories.get(sessionId);

        // 执行agent
        const result = await agentExecutor.invoke({
            input: message,
            chat_history: chatHistory
        });

        // 更新对话历史
        chatHistory.push(new HumanMessage(message));
        chatHistory.push(new AIMessage(result.output));

        // 限制历史记录长度
        if (chatHistory.length > 20) {
            chatHistory.splice(0, chatHistory.length - 20);
        }

        res.json({
            success: true,
            response: result.output,
            sessionId
        });

    } catch (error) {
        console.error('AI Agent错误:', error);
        res.status(500).json({
            success: false,
            error: '处理请求时发生错误',
            details: error.message
        });
    }
});

// 获取文件列表
router.get('/files', async (req, res) => {
    try {
        const { path: dirPath = '' } = req.query;
        const fullPath = path.join(templateDebugPath, dirPath);
        
        if (!fullPath.startsWith(templateDebugPath)) {
            return res.status(400).json({ error: '无效的路径' });
        }
        
        if (!await fs.pathExists(fullPath)) {
            return res.status(404).json({ error: '目录不存在' });
        }
        
        const items = await fs.readdir(fullPath, { withFileTypes: true });
        const files = items.map(item => ({
            name: item.name,
            type: item.isDirectory() ? 'directory' : 'file',
            path: path.join(dirPath, item.name).replace(/\\/g, '/')
        }));
        
        res.json({ success: true, files });
    } catch (error) {
        res.status(500).json({ error: '获取文件列表失败', details: error.message });
    }
});

// 清除对话历史
router.delete('/chat/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    chatHistories.delete(sessionId);
    res.json({ success: true, message: '对话历史已清除' });
});

// 健康检查
router.get('/health', (req, res) => {
    res.json({
        success: true,
        aiAvailable: !!agentExecutor,
        hasOpenAIKey: hasOpenAIKey
    });
});

export default router;
