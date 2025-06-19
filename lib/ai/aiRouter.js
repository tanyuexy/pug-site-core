import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StructuredOutputParser } from "@langchain/core/output_parsers";
import { z } from "zod";
import { Document } from "@langchain/core/documents";
import { DirectoryLoader } from "langchain/document_loaders/fs/directory";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { FileManagementToolkit } from "@langchain/community/agent_toolkits";
import { VectorStore } from "@langchain/core/vectorstores";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RunnableSequence } from "@langchain/core/runnables";
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// DeepSeek API 配置
const llm = new ChatOpenAI({
  model: "deepseek-chat",
  temperature: 0.2, // 降低随机性，提高代码修改的准确性
  openAIApiKey: process.env.DEEPSEEK_API_KEY || "your-api-key-here",
  configuration: {
    baseURL: "https://api.deepseek.com/v1"
  }
});

// 定义结构化输出模式
const LocationSchema = z.object({
  startLine: z.number().describe("修改开始行号"),
  endLine: z.number().describe("修改结束行号"),
  reason: z.string().describe("选择这个位置的原因"),
  context: z.string().describe("相关的代码上下文")
});

const AnalysisResultSchema = z.object({
  locations: z.array(LocationSchema).describe("可能的修改位置列表"),
  analysis: z.string().describe("整体分析说明"),
  confidence: z.number().min(0).max(1).describe("分析结果的置信度")
});

const ModificationResultSchema = z.object({
  modifiedCode: z.string().describe("修改后的代码"),
  explanation: z.string().describe("修改说明"),
  changes: z.array(z.object({
    type: z.enum(["added", "modified", "deleted"]).describe("修改类型"),
    description: z.string().describe("具体的改动描述"),
    lineNumbers: z.array(z.number()).describe("涉及的行号")
  })).describe("修改详情列表"),
  riskLevel: z.enum(["low", "medium", "high"]).describe("修改风险等级")
});

/**
 * 使用LangChain优化的代码修改 Agent 类
 */
class EnhancedCodeModificationAgent {
  constructor(options = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
    this.fileManagementToolkit = new FileManagementToolkit({ 
      rootDir: this.projectRoot 
    });
    this.vectorStore = null;
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY
    });
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    
    // 设置结构化输出解析器
    this.analysisParser = StructuredOutputParser.fromZodSchema(AnalysisResultSchema);
    this.modificationParser = StructuredOutputParser.fromZodSchema(ModificationResultSchema);
  }

  /**
   * 初始化项目上下文向量存储
   */
  async initializeProjectContext() {
    try {
      const loader = new DirectoryLoader(this.projectRoot, {
        ".js": (path) => new TextLoader(path),
        ".ts": (path) => new TextLoader(path),
        ".jsx": (path) => new TextLoader(path),
        ".tsx": (path) => new TextLoader(path),
        ".vue": (path) => new TextLoader(path),
        ".py": (path) => new TextLoader(path),
        ".md": (path) => new TextLoader(path),
      });

      const docs = await loader.load();
      const splitDocs = await this.textSplitter.splitDocuments(docs);
      
      this.vectorStore = await MemoryVectorStore.fromDocuments(
        splitDocs,
        this.embeddings
      );
      
      console.log(`已加载 ${docs.length} 个文件，分割为 ${splitDocs.length} 个文档块`);
    } catch (error) {
      console.error('初始化项目上下文失败:', error);
      throw error;
    }
  }

  /**
   * 使用LangChain工具进行文件操作
   */
  async readFileWithLangChain(filePath) {
    try {
      const tools = this.fileManagementToolkit.getTools();
      const readTool = tools.find(tool => tool.name === 'read_file');
      
      if (!readTool) {
        throw new Error('Read file tool not found');
      }

      const result = await readTool.invoke({ file_path: filePath });
      const lines = result.split('\n');
      
      return { 
        success: true, 
        content: result, 
        lines,
        metadata: {
          lineCount: lines.length,
          filePath: path.resolve(this.projectRoot, filePath)
        }
      };
    } catch (error) {
      return { 
        success: false, 
        error: error.message,
        filePath 
      };
    }
  }

  /**
   * 使用LangChain工具写入文件
   */
  async writeFileWithLangChain(filePath, content) {
    try {
      const tools = this.fileManagementToolkit.getTools();
      const writeTool = tools.find(tool => tool.name === 'write_file');
      
      if (!writeTool) {
        throw new Error('Write file tool not found');
      }

      await writeTool.invoke({ 
        file_path: filePath, 
        text: content 
      });
      
      return { 
        success: true, 
        message: `文件 ${filePath} 写入成功`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return { 
        success: false, 
        error: error.message,
        filePath 
      };
    }
  }

  /**
   * 使用向量搜索获取相关上下文
   */
  async getRelevantContext(description, filePath = null) {
    if (!this.vectorStore) {
      await this.initializeProjectContext();
    }

    try {
      // 构建搜索查询
      let searchQuery = description;
      if (filePath) {
        searchQuery += ` file:${path.basename(filePath)}`;
      }

      const relevantDocs = await this.vectorStore.similaritySearch(searchQuery, 5);
      
      return {
        success: true,
        contexts: relevantDocs.map(doc => ({
          content: doc.pageContent,
          metadata: doc.metadata,
          relevanceScore: doc.score || 0
        }))
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        contexts: []
      };
    }
  }

  /**
   * 使用结构化输出分析代码位置
   */
  async analyzeCodeLocationStructured(filePath, description) {
    const fileResult = await this.readFileWithLangChain(filePath);
    if (!fileResult.success) {
      return { success: false, error: fileResult.error };
    }

    // 获取相关上下文
    const contextResult = await this.getRelevantContext(description, filePath);
    const relevantContext = contextResult.success ? 
      contextResult.contexts.map(ctx => ctx.content).join('\n\n') : '';

    const analysisPrompt = PromptTemplate.fromTemplate(`
你是一个专业的代码分析师。请分析以下代码文件，根据用户的描述找到需要修改的具体位置。

文件路径: {filePath}
文件内容:
\`\`\`
{fileContent}
\`\`\`

相关项目上下文:
{relevantContext}

用户描述: {description}

请仔细分析代码结构和用户需求，返回可能的修改位置。考虑以下因素：
1. 代码的逻辑结构和依赖关系
2. 函数/类的边界
3. 变量作用域
4. 最小侵入性原则

{format_instructions}
`);

    try {
      const chain = RunnableSequence.from([
        analysisPrompt,
        llm,
        this.analysisParser
      ]);

      const result = await chain.invoke({
        filePath,
        fileContent: fileResult.content,
        relevantContext,
        description,
        format_instructions: this.analysisParser.getFormatInstructions()
      });

      return { 
        success: true, 
        ...result,
        fileMetadata: fileResult.metadata
      };
    } catch (error) {
      return { 
        success: false, 
        error: `分析失败: ${error.message}`,
        fallbackLocations: this.fallbackLocationAnalysis(fileResult.lines, description)
      };
    }
  }

  /**
   * 降级位置分析（当结构化分析失败时）
   */
  fallbackLocationAnalysis(lines, description) {
    const keywords = description.toLowerCase().split(/\s+/);
    const locations = [];
    
    lines.forEach((line, index) => {
      const lineContent = line.toLowerCase();
      const matchCount = keywords.filter(keyword => lineContent.includes(keyword)).length;
      
      if (matchCount > 0) {
        locations.push({
          startLine: index + 1,
          endLine: index + 1,
          reason: `包含关键词: ${keywords.filter(k => lineContent.includes(k)).join(', ')}`,
          context: line.trim(),
          confidence: matchCount / keywords.length
        });
      }
    });

    return locations.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  }

  /**
   * 生成结构化代码修改
   */
  async generateCodeModificationStructured(filePath, startLine, endLine, description, context = '') {
    const fileResult = await this.readFileWithLangChain(filePath);
    if (!fileResult.success) {
      return { success: false, error: fileResult.error };
    }

    const lines = fileResult.lines;
    const beforeContext = lines.slice(Math.max(0, startLine - 6), startLine - 1).join('\n');
    const targetCode = lines.slice(startLine - 1, endLine).join('\n');
    const afterContext = lines.slice(endLine, Math.min(lines.length, endLine + 5)).join('\n');

    // 获取项目上下文
    const contextResult = await this.getRelevantContext(description, filePath);
    const projectContext = contextResult.success ? 
      contextResult.contexts.slice(0, 3).map(ctx => ctx.content).join('\n\n') : '';

    const modificationPrompt = PromptTemplate.fromTemplate(`
你是一个专业的代码修改专家。请根据用户的需求修改指定的代码片段。

文件路径: {filePath}
修改范围: 第{startLine}行 到 第{endLine}行

项目上下文信息:
{projectContext}

附加上下文:
{context}

修改前的代码上下文:
\`\`\`
{beforeContext}
--- 需要修改的代码开始 ---
{targetCode}
--- 需要修改的代码结束 ---
{afterContext}
\`\`\`

用户需求: {description}

请遵循以下原则：
1. 保持原有的代码风格和缩进
2. 确保修改后的代码语法正确
3. 考虑代码的完整性和逻辑性
4. 最小化对现有功能的影响
5. 添加必要的注释说明

{format_instructions}
`);

    try {
      const chain = RunnableSequence.from([
        modificationPrompt,
        llm,
        this.modificationParser
      ]);

      const result = await chain.invoke({
        filePath,
        startLine,
        endLine,
        beforeContext,
        targetCode,
        afterContext,
        description,
        context,
        projectContext,
        format_instructions: this.modificationParser.getFormatInstructions()
      });

      return { 
        success: true, 
        ...result,
        originalCode: targetCode,
        metadata: fileResult.metadata
      };
    } catch (error) {
      return { 
        success: false, 
        error: `生成修改失败: ${error.message}`,
        originalCode: targetCode
      };
    }
  }

  /**
   * 应用代码修改（使用LangChain工具）
   */
  async applyModification(filePath, startLine, endLine, newCode) {
    const fileResult = await this.readFileWithLangChain(filePath);
    if (!fileResult.success) {
      return { success: false, error: fileResult.error };
    }

    try {
      const lines = fileResult.lines;
      const newLines = [
        ...lines.slice(0, startLine - 1),
        ...newCode.split('\n'),
        ...lines.slice(endLine)
      ];

      const newContent = newLines.join('\n');
      const writeResult = await this.writeFileWithLangChain(filePath, newContent);
      
      if (writeResult.success) {
        return { 
          success: true, 
          message: `成功修改文件 ${filePath}`,
          changes: {
            linesAdded: newCode.split('\n').length,
            linesRemoved: endLine - startLine + 1,
            originalRange: { startLine, endLine },
            modifiedAt: writeResult.timestamp
          }
        };
      } else {
        return { success: false, error: writeResult.error };
      }
    } catch (error) {
      return { 
        success: false, 
        error: `应用修改失败: ${error.message}` 
      };
    }
  }

  /**
   * 智能代码修改 - 使用所有LangChain优化
   */
  async smartModifyWithEnhancements(filePath, description, autoApply = false) {
    console.log(`开始智能分析文件: ${filePath}`);
    
    try {
      // 1. 使用结构化输出分析代码位置
      const locationResult = await this.analyzeCodeLocationStructured(filePath, description);
      if (!locationResult.success) {
        return { success: false, error: locationResult.error };
      }

      console.log(`找到 ${locationResult.locations.length} 个可能的修改位置 (置信度: ${locationResult.confidence})`);
      
      const results = [];
      
      // 2. 对每个位置生成结构化修改
      for (const location of locationResult.locations) {
        console.log(`正在处理位置: 第${location.startLine}-${location.endLine}行`);
        
        const modificationResult = await this.generateCodeModificationStructured(
          filePath,
          location.startLine,
          location.endLine,
          description,
          location.context
        );
        
        if (modificationResult.success) {
          const result = {
            location,
            modification: modificationResult,
            applied: false,
            riskAssessment: {
              level: modificationResult.riskLevel,
              considerations: this.assessModificationRisk(modificationResult)
            }
          };

          // 如果启用自动应用且风险等级较低
          if (autoApply && modificationResult.riskLevel === 'low') {
            const applyResult = await this.applyModification(
              filePath,
              location.startLine,
              location.endLine,
              modificationResult.modifiedCode
            );
            result.applied = applyResult.success;
            result.applyResult = applyResult;
          }

          results.push(result);
        }
      }

      return {
        success: true,
        analysis: locationResult.analysis,
        confidence: locationResult.confidence,
        modifications: results,
        projectContextUsed: true
      };
    } catch (error) {
      return {
        success: false,
        error: `智能修改失败: ${error.message}`,
        fallbackAvailable: true
      };
    }
  }

  /**
   * 评估修改风险
   */
  assessModificationRisk(modificationResult) {
    const considerations = [];
    
    // 检查修改复杂度
    const changeCount = modificationResult.changes.length;
    if (changeCount > 5) {
      considerations.push("修改涉及多处变更，建议仔细审查");
    }

    // 检查是否涉及删除操作
    const hasDeletes = modificationResult.changes.some(change => change.type === 'deleted');
    if (hasDeletes) {
      considerations.push("包含代码删除操作，请确认不会影响现有功能");
    }

    // 检查修改说明的完整性
    if (!modificationResult.explanation || modificationResult.explanation.length < 20) {
      considerations.push("修改说明较简单，建议获取更详细的解释");
    }

    return considerations;
  }

  /**
   * 批量修改多个文件 - 增强版
   */
  async batchModifyEnhanced(modifications, options = {}) {
    const { autoApply = false, maxConcurrency = 3 } = options;
    const results = [];
    
    // 使用Promise控制并发数量
    const semaphore = new Array(maxConcurrency).fill(null);
    
    const processModification = async (mod) => {
      try {
        let result;
        
        if (mod.startLine && mod.endLine) {
          // 指定位置修改
          const modResult = await this.generateCodeModificationStructured(
            mod.filePath,
            mod.startLine,
            mod.endLine,
            mod.description
          );
          
          if (modResult.success && autoApply && modResult.riskLevel === 'low') {
            const applyResult = await this.applyModification(
              mod.filePath,
              mod.startLine,
              mod.endLine,
              modResult.modifiedCode
            );
            result = { ...modResult, applied: applyResult.success, applyResult };
          } else {
            result = { ...modResult, applied: false };
          }
        } else {
          // 智能修改
          result = await this.smartModifyWithEnhancements(
            mod.filePath,
            mod.description,
            autoApply
          );
        }
        
        return {
          filePath: mod.filePath,
          description: mod.description,
          result,
          processedAt: new Date().toISOString()
        };
        
      } catch (error) {
        return {
          filePath: mod.filePath,
          description: mod.description,
          result: { success: false, error: error.message },
          processedAt: new Date().toISOString()
        };
      }
    };

    // 并发处理修改请求
    const chunks = [];
    for (let i = 0; i < modifications.length; i += maxConcurrency) {
      chunks.push(modifications.slice(i, i + maxConcurrency));
    }

    for (const chunk of chunks) {
      const promises = chunk.map(processModification);
      const chunkResults = await Promise.all(promises);
      results.push(...chunkResults);
    }
    
    return { 
      success: true, 
      results,
      summary: {
        total: results.length,
        successful: results.filter(r => r.result.success).length,
        applied: results.filter(r => r.result.applied).length,
        failed: results.filter(r => !r.result.success).length
      }
    };
  }

  /**
   * 清理资源
   */
  async cleanup() {
    if (this.vectorStore) {
      // 清理向量存储资源
      this.vectorStore = null;
    }
    console.log('代码修改Agent资源已清理');
  }
}

// 创建增强的代码修改 Agent 实例
const enhancedCodeAgent = new EnhancedCodeModificationAgent();

// 导出功能
export { enhancedCodeAgent, EnhancedCodeModificationAgent };

// 默认导出
export default enhancedCodeAgent;
