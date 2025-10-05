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