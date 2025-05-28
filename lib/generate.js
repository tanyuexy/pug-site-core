import fse from "fs-extra";
import pug from "pug";
import pugLexer from "pug-lexer";
import {
  getPagesPugFilePathArr,
  getCompilePugFilter,
  pathIsSame,
  sleep,
  pathSymbol,
  obfuscateJavaScript,
  addTemplateScopeIsolation,
} from "./utils.js";
import _ from "lodash";
import async from "async";
import UglifyJS from "uglify-js";
import { paths } from "./paths.js";
import path from "path";

const { config } = await import(paths.config);

/**
 * 创建调试模板目录
 * 复制template目录到template-debug并为所有pug文件添加调试属性
 * @returns {Promise<void>}
 */
export async function createDebugTemplate() {
  try {
    console.log('开始创建调试模板目录...');
    
    const sourceDir = paths.template.root;
    const targetDir = paths.template.debug;
    
    // 删除已存在的调试目录
    if (await fse.pathExists(targetDir)) {
      await fse.remove(targetDir);
      console.log('已删除现有的调试目录');
    }
    
    // 复制整个 template 目录到 template-debug
    await fse.copy(sourceDir, targetDir);
    console.log(`已复制 ${sourceDir} 到 ${targetDir}`);
    
    /**
     * 使用 pug-lexer 解析 pug 文件中的所有 HTML 标签
     * @param {string} pugContent - pug 文件内容
     * @param {string} filename - 文件名（用于错误提示）
     * @returns {Array} 返回标签信息数组
     */
    function extractHtmlTagsFromPug(pugContent, filename) {
      try {
        const tokens = pugLexer(pugContent, { filename });
        const tags = [];
        
        tokens.forEach((token, index) => {
          if (token.type === 'tag') {
            const tagInfo = {
              tagName: token.val,
              line: token.line || token.loc?.start?.line || null,
              selfClosing: token.selfClosing || false,
              attributes: [],
              isImplicitDiv: false
            };
            
            // 查找紧随其后的属性 token
            const nextTokenIndex = index + 1;
            if (nextTokenIndex < tokens.length && tokens[nextTokenIndex].type === 'attrs') {
              tagInfo.attributes = tokens[nextTokenIndex].attrs.map(attr => ({
                name: attr.name,
                value: attr.val,
                escaped: attr.escaped
              }));
            }
            
            tags.push(tagInfo);
          }
          // 处理隐式 div 语法：.class 或 #id
          else if (token.type === 'class' || token.type === 'id') {
            // 检查前一个 token，如果不是标签名，则这是隐式 div
            const prevToken = index > 0 ? tokens[index - 1] : null;
            
            // 如果前一个token不是tag类型，或者是换行/缩进，则这是隐式div
            if (!prevToken || 
                prevToken.type === 'newline' || 
                prevToken.type === 'indent' || 
                prevToken.type === 'outdent' ||
                prevToken.type === 'eos') {
              
              const tagInfo = {
                tagName: 'div', // 隐式 div
                line: token.line || token.loc?.start?.line || null,
                selfClosing: false,
                attributes: [],
                isImplicitDiv: true // 标记为隐式 div
              };
              
              tags.push(tagInfo);
            }
          }
        });
        
        return tags;
      } catch (error) {
        console.error(`解析 pug 文件 ${filename} 时出错:`, error);
        return [];
      }
    }
    
    /**
     * 为 pug 文件内容添加调试属性
     * @param {string} pugContent - pug 文件内容
     * @param {string} relativePath - 文件相对路径
     * @param {string} filename - 文件名
     * @returns {string} 处理后的 pug 内容
     */
    function addDebugAttributesToPug(pugContent, relativePath, filename) {
      try {
        const lines = pugContent.split('\n');
        const tags = extractHtmlTagsFromPug(pugContent, filename);
        
        // 定义不需要添加调试属性的标签（不在页面中显示的标签）
        const excludeTags = new Set([
          'html', 'head', 'title', 'meta', 'link', 'style', 'script', 
          'base', 'noscript', 'template'
        ]);
        
        // 过滤掉不需要处理的标签
        const visibleTags = tags.filter(tag => !excludeTags.has(tag.tagName.toLowerCase()));
        
        // 创建一个映射，记录每行的标签信息
        const lineTagMap = new Map();
        visibleTags.forEach(tag => {
          if (!lineTagMap.has(tag.line)) {
            lineTagMap.set(tag.line, []);
          }
          lineTagMap.get(tag.line).push(tag);
        });
        
        // 处理每一行
        const processedLines = lines.map((line, index) => {
          const lineNumber = index + 1;
          const tagsInLine = lineTagMap.get(lineNumber);
          
          if (!tagsInLine || tagsInLine.length === 0) {
            return line;
          }
          
          // 对于每个标签，添加调试属性
          let processedLine = line;
          
          tagsInLine.forEach(tag => {
            // 构建调试属性
            const debugAttrs = [
              `data-debug-file="${relativePath}"`,
              `data-debug-line="${lineNumber}"`,
              `data-debug-tag="${tag.tagName}"`
            ].join(', ');
            
            // 简化的标签处理逻辑
            const trimmedLine = line.trim();
            let matched = false;
            
            // 处理隐式 div（.class 或 #id 语法）
            if (tag.isImplicitDiv && (trimmedLine.startsWith('.') || trimmedLine.startsWith('#'))) {
              const indent = line.match(/^\s*/)[0]; // 获取缩进
              
              // 找到类名或ID结束的位置
              let selectorEndIndex = 1; // 跳过 . 或 #
              while (selectorEndIndex < trimmedLine.length && /[\w-]/.test(trimmedLine[selectorEndIndex])) {
                selectorEndIndex++;
              }
              
              // 检查是否已经有属性括号
              const afterSelector = trimmedLine.substring(selectorEndIndex);
              const parenIndex = afterSelector.indexOf('(');
              
              if (parenIndex !== -1) {
                // 已经有属性括号
                const beforeParen = trimmedLine.substring(0, selectorEndIndex + parenIndex + 1);
                const afterFirstParen = trimmedLine.substring(selectorEndIndex + parenIndex + 1);
                const lastParenIndex = afterFirstParen.lastIndexOf(')');
                
                if (lastParenIndex !== -1) {
                  const existingAttrs = afterFirstParen.substring(0, lastParenIndex);
                  const afterLastParen = afterFirstParen.substring(lastParenIndex);
                  
                  const separator = existingAttrs.trim() ? ', ' : '';
                  processedLine = `${indent}${beforeParen}${existingAttrs}${separator}${debugAttrs}${afterLastParen}`;
                  matched = true;
                }
              } else {
                // 没有属性括号，在选择器后添加
                const selector = trimmedLine.substring(0, selectorEndIndex);
                const afterAttrs = trimmedLine.substring(selectorEndIndex);
                
                processedLine = `${indent}${selector}(${debugAttrs})${afterAttrs}`;
                matched = true;
              }
            }
            // 处理普通标签
            else if (!tag.isImplicitDiv && trimmedLine.startsWith(tag.tagName)) {
              const indent = line.match(/^\s*/)[0]; // 获取缩进
              const tagPart = trimmedLine;
              
              // 检查是否已经有属性括号
              const parenIndex = tagPart.indexOf('(');
              
              if (parenIndex !== -1) {
                // 已经有属性括号，在最后一个右括号前添加调试属性
                const beforeParen = tagPart.substring(0, parenIndex + 1);
                const afterFirstParen = tagPart.substring(parenIndex + 1);
                const lastParenIndex = afterFirstParen.lastIndexOf(')');
                
                if (lastParenIndex !== -1) {
                  const existingAttrs = afterFirstParen.substring(0, lastParenIndex);
                  const afterLastParen = afterFirstParen.substring(lastParenIndex);
                  
                  // 添加调试属性
                  const separator = existingAttrs.trim() ? ', ' : '';
                  processedLine = `${indent}${beforeParen}${existingAttrs}${separator}${debugAttrs}${afterLastParen}`;
                  matched = true;
                }
              } else {
                // 没有属性括号，找到标签名结束的位置并添加属性
                let tagEndIndex = tag.tagName.length;
                
                // 寻找类名、ID等修饰符的结束位置
                while (tagEndIndex < tagPart.length) {
                  const char = tagPart[tagEndIndex];
                  if (char === '.' || char === '#') {
                    // 跳过类名或ID
                    tagEndIndex++;
                    while (tagEndIndex < tagPart.length && /[\w-]/.test(tagPart[tagEndIndex])) {
                      tagEndIndex++;
                    }
                  } else {
                    break;
                  }
                }
                
                const beforeAttrs = tagPart.substring(0, tagEndIndex);
                const afterAttrs = tagPart.substring(tagEndIndex);
                
                processedLine = `${indent}${beforeAttrs}(${debugAttrs})${afterAttrs}`;
                matched = true;
              }
            }
          });
          
          return processedLine;
        });
        
        return processedLines.join('\n');
      } catch (error) {
        console.error(`处理 pug 文件 ${filename} 时出错:`, error);
        return pugContent;
      }
    }
    
    /**
     * 递归处理目录中的所有 pug 文件
     * @param {string} dir - 目录路径
     * @param {string} baseDir - 基础目录路径（用于计算相对路径）
     */
    async function processPugFilesInDirectory(dir, baseDir) {
      try {
        const files = await fse.readdir(dir);
        
        for (const file of files) {
          const fullPath = path.join(dir, file);
          const stats = await fse.stat(fullPath);
          
          if (stats.isDirectory()) {
            // 递归处理子目录
            await processPugFilesInDirectory(fullPath, baseDir);
          } else if (file.endsWith('.pug')) {
            // 处理 pug 文件
            try {
              const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
              const pugContent = await fse.readFile(fullPath, 'utf8');
              
              console.log(`正在处理: ${relativePath}`);
              
              const processedContent = addDebugAttributesToPug(pugContent, relativePath, file);
              
              // 写回处理后的内容
              await fse.writeFile(fullPath, processedContent, 'utf8');
              
              console.log(`已处理: ${relativePath}`);
            } catch (error) {
              console.error(`处理文件 ${fullPath} 时出错:`, error);
            }
          }
        }
      } catch (error) {
        console.error(`处理目录 ${dir} 时出错:`, error);
      }
    }
    
    // 开始处理调试目录中的所有 pug 文件
    console.log('开始为 pug 文件添加调试属性...');
    await processPugFilesInDirectory(targetDir, targetDir);
    
    console.log('调试模板目录创建完成！');
    console.log(`调试模板位置: ${targetDir}`);
    
  } catch (error) {
    console.error('创建调试模板时出错:', error);
    throw error;
  }
}