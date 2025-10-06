// --- START OF FILE js/utils.js ---

import { URL_DICTIONARY } from './constants.js';

/**
 * 递归重构被分段压缩的 URL。
 * @param {string|Array} data - 压缩的数据。
 * @returns {string} - 重构后的完整 URL。
 */
export function reconstructUrl(data) {
    if (typeof data === 'string') {
        return URL_DICTIONARY[data] || data;
    }
    if (Array.isArray(data)) {
        return data.map(part => reconstructUrl(part)).join('');
    }
    return '';
}

/**
 * 增强：加载图片并实现域名回退机制。
 * @param {Array} compressedUrl - 从 V12 payload 中获取的压缩版封面 URL 数组。
 * @returns {Promise<string>} - 返回第一个成功加载的完整图片 URL。
 */
export async function loadImageWithFallback(compressedUrl) {
    // 完整的 API 域名回退列表，按推荐顺序排列
    const FALLBACK_DOMAINS = ['d0', 'd1', 'd2', 'd3'];
    
    // 从压缩数据中解析出路径和首选域名
    // e.g., [['d2', 'p0'], 'path/to/image.jpg']
    const pathPart = compressedUrl[1];
    const primaryDomainKey = Array.isArray(compressedUrl[0]) ? compressedUrl[0][0] : compressedUrl[0];

    // 创建一个有序且无重复的回退队列，将首选域名置于首位
    const attemptOrder = [...new Set([primaryDomainKey, ...FALLBACK_DOMAINS])];

    for (const domainKey of attemptOrder) {
        try {
            // 为当前尝试的域名构建完整的图片URL
            const url = reconstructUrl([[domainKey, 'p0'], pathPart]);
            
            // 使用 Promise 包装 Image 对象的加载过程
            await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error(`Failed to load image from ${url}`));
                img.src = url;
            });

            console.log(`Image successfully loaded from: ${url}`);
            return url; // 一旦成功，立即返回此 URL

        } catch (error) {
            console.warn(error.message); // 加载失败，继续尝试下一个
        }
    }
    
    // 如果所有域名都失败了
    throw new Error('Failed to load cover image from all available domains.');
}


/**
 * 将秒数格式化为 HH:MM:SS 或 MM:SS 格式。
 * @param {number} seconds - 总秒数。
 * @returns {string} - 格式化后的时间字符串。
 */
export function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const date = new Date(null);
    date.setSeconds(seconds);
    const isoString = date.toISOString();
    return seconds >= 3600 ? isoString.substr(11, 8) : isoString.substr(14, 5);
}

// --- END OF FILE js/utils.js ---