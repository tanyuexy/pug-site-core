import imagemin from 'imagemin';
import imageminMozjpeg from 'imagemin-mozjpeg';
import imageminPngquant from 'imagemin-pngquant';
import imageminGifsicle from 'imagemin-gifsicle';
import imageminSvgo from 'imagemin-svgo';
import { glob } from 'glob';
import path from 'path';
import fse from 'fs-extra';
import { paths } from './paths.js';

/**
 * 压缩图片
 * @param {string} inputPath - 输入路径，可以是单个文件或目录，相对于项目根目录
 * @param {number} quality - 压缩质量 (0-1)
 * @returns {Promise<void>}
 */
export async function compressImages(inputPath, quality = 0.7) {
  try {
    console.log('开始压缩图片...');
    const startTime = Date.now();

    // 默认路径为静态资源目录下的所有图片
    const defaultPath = paths.template.static;
    const targetPath = inputPath ? paths.resolveRoot(inputPath) : paths.resolveRoot(defaultPath);
    if (!fse.existsSync(targetPath)) {
      throw new Error(`路径不存在: ${targetPath}`);
    }
    
    // 将质量值限制在0-1之间
    quality = Math.max(0, Math.min(1, quality));
    console.log(`压缩质量: ${quality}`);
    
    // 检查输入路径是文件还是目录
    const stats = await fse.stat(targetPath);
    let imageFiles = [];
    
    if (stats.isFile()) {
      // 如果是单个文件，检查是否为支持的图片格式
      const ext = path.extname(targetPath).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.gif', '.svg'].includes(ext)) {
        imageFiles = [targetPath];
      } else {
        console.log('不支持的文件格式，仅支持jpg、jpeg、png、gif、svg格式');
        return;
      }
    } else {
      // 如果是目录，获取所有图片文件
      const imagePatterns = [
        '**/*.jpg', 
        '**/*.jpeg', 
        '**/*.png', 
        '**/*.gif', 
        '**/*.svg'
      ];
      
      for (const pattern of imagePatterns) {
        const files = await glob(pattern, { cwd: targetPath, absolute: true });
        imageFiles = [...imageFiles, ...files];
      }
    }
    
    if (imageFiles.length === 0) {
      console.log('未找到图片文件');
      return;
    }
    
    console.log(`找到 ${imageFiles.length} 个图片文件`);
    
    // 按目录分组处理图片
    const filesByDir = imageFiles.reduce((acc, file) => {
      const dir = path.dirname(file);
      if (!acc[dir]) acc[dir] = [];
      acc[dir].push(file);
      return acc;
    }, {});
    
    // 处理每个目录中的图片
    for (const [dir, files] of Object.entries(filesByDir)) {
      const relativeDir = path.relative(stats.isFile() ? path.dirname(targetPath) : targetPath, dir);
      // 记录原始文件大小
      const originalSizes = {};
      let validFiles = [];
      
      for (const file of files) {
        const stats = await fse.stat(file);
        if (stats.size > 0) {
          originalSizes[file] = stats.size;
          validFiles.push(file);
        }
      }
      
      // 如果没有有效文件，跳过此目录
      if (validFiles.length === 0) {
        continue;
      }
      
      console.log(`处理目录: ${relativeDir || '.'}`);
      
      // 压缩图片
      await imagemin(validFiles, {
        destination: dir,
        plugins: [
          imageminMozjpeg({ quality: quality * 100 }),
          imageminPngquant({ 
            quality: [Math.max(0.3, quality - 0.2), Math.min(0.9, quality + 0.1)]
          }),
          imageminGifsicle({ optimizationLevel: 3 }),
          imageminSvgo({
            plugins: [
              {
                name: 'preset-default',
                params: {
                  overrides: {
                    removeViewBox: false
                  }
                }
              }
            ]
          })
        ]
      });
      
      // 计算压缩结果
      let totalOriginalSize = 0;
      let totalCompressedSize = 0;
      let processedFiles = 0;
      
      for (const file of validFiles) {
        const originalSize = originalSizes[file];
        const stats = await fse.stat(file);
        const compressedSize = stats.size;
        
        if (originalSize > 0 && compressedSize > 0) {
          totalOriginalSize += originalSize;
          totalCompressedSize += compressedSize;
          processedFiles++;
          
          const savingPercent = ((originalSize - compressedSize) / originalSize * 100).toFixed(2);
          console.log(`  ${path.basename(file)}: ${formatBytes(originalSize)} → ${formatBytes(compressedSize)} (节省 ${savingPercent}%)`);
        }
      }
      
      // 只有当有处理过的文件时才打印总结
      if (processedFiles > 0) {
        const totalSavingPercent = ((totalOriginalSize - totalCompressedSize) / totalOriginalSize * 100).toFixed(2);
        console.log(`  目录总计: ${formatBytes(totalOriginalSize)} → ${formatBytes(totalCompressedSize)} (节省 ${totalSavingPercent}%)`);
      }
    }
    
    const endTime = Date.now();
    console.log(`图片压缩完成，共处理 ${imageFiles.length} 个文件，耗时 ${(endTime - startTime) / 1000} 秒`);
  } catch (error) {
    console.error('图片压缩失败:', error);
    throw error;
  }
}

/**
 * 格式化字节大小
 * @param {number} bytes - 字节数
 * @returns {string} 格式化后的大小
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * 解析命令行参数并执行图片压缩
 * @param {string[]} args - 命令行参数
 * @returns {Promise<void>}
 */
export async function processImagemin(args) {
  try {
    // 解析图片压缩参数
    let inputPath = null;
    let quality = 0.7; // 默认压缩比例
    
    for (const arg of args) {
      if (arg.startsWith('p=')) {
        inputPath = arg.substring(2);
      } else if (arg.startsWith('q=')) {
        quality = parseFloat(arg.substring(2));
      }
    }
    
    await compressImages(inputPath, quality);
  } catch (error) {
    console.error('执行失败:', error);
    throw error;
  }
} 