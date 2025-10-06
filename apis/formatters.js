import { getSyncedNow } from './timeService.js';
import { authedFetch } from '../authService.js';
import { backendBase } from '../base.js';

export function mapJiraIssueToTask(jiraIssue) {
    const fields = jiraIssue.fields || {};

    return {
        key: jiraIssue.key,                                 // Primary key
        name: fields.summary || '',                         // Task name
        job_no: fields.customfield_10117 || null,           // RM260-01-12
        image_no: fields.customfield_10184 || null,         // 8.7211.0005
        position_no: fields.customfield_10185 || null,      // 107
        quantity: fields.customfield_10187 || null,         // 6
        machine: fields.customfield_11411?.value || null,   // COLLET (optional)
    };
}

export function formatTime(secs) {
    const hrs = Math.floor(secs / 3600).toString().padStart(2, '0');
    const mins = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
    const sec = (secs % 60).toString().padStart(2, '0');
    return `${hrs}:${mins}:${sec}`;
}

export function formatJiraDate(ms) {
    const d = new Date(ms);
    const pad = n => (n < 10 ? '0' + n : n);
    const yyyy = d.getFullYear();
    const MM = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    const msms = (d.getMilliseconds() + '').padStart(3, '0');
    const offset = -d.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const offsetHours = pad(Math.floor(Math.abs(offset) / 60));
    const offsetMinutes = pad(Math.abs(offset) % 60);
    return `${yyyy}-${MM}-${dd}T${hh}:${mm}:${ss}.${msms}${sign}${offsetHours}${offsetMinutes}`;
}

export function formatDuration(startTime) {
    const elapsed = Math.floor((getSyncedNow() - startTime) / 1000);
    const h = Math.floor(elapsed / 3600).toString().padStart(2, '0');
    const m = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

export async function fetchCurrencyRates() {
    try {
        const response = await authedFetch(`${backendBase}/currency-rates/`);
        if (response.ok) {
            const data = await response.json();
            return data.rates;
        } else {
            console.warn('Failed to fetch currency rates, using fallback values');
        }
    } catch (error) {
        console.error('Error fetching currency rates:', error);
        return null;
    }
}

// ===== Overtime Formatters =====

/**
 * Format date and time for display in Turkish locale
 * @param {string|Date} dateTimeString - ISO date string or Date object
 * @param {boolean} showTime - Whether to show time (default: true)
 * @returns {string} Formatted date string or '-' if invalid
 */
export function formatDateTime(dateTimeString, showTime = true) {
    if (!dateTimeString) return '-';
    
    try {
        const date = new Date(dateTimeString);
        if (isNaN(date.getTime())) return '-';
        
        if (showTime) {
            return date.toLocaleString('tr-TR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        } else {
            return date.toLocaleDateString('tr-TR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
        }
    } catch (error) {
        console.error('Error formatting date:', error);
        return '-';
    }
}

/**
 * Format date only (without time) for display in Turkish locale
 * @param {string|Date} dateString - ISO date string or Date object
 * @returns {string} Formatted date string or '-' if invalid
 */
export function formatDate(dateString) {
    return formatDateTime(dateString, false);
}

/**
 * Format time only (without date) for display in Turkish locale
 * @param {string|Date} timeString - ISO time string or Date object
 * @returns {string} Formatted time string or '-' if invalid
 */
export function formatTimeOnly(timeString) {
    if (!timeString) return '-';
    
    try {
        const date = new Date(timeString);
        if (isNaN(date.getTime())) return '-';
        
        return date.toLocaleTimeString('tr-TR', {
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        console.error('Error formatting time:', error);
        return '-';
    }
}

/**
 * Format duration in hours and minutes
 * @param {number|string} hours - Duration in hours (can be decimal)
 * @returns {string} Formatted duration string
 */
export function formatDurationHours(hours) {
    if (!hours || hours === 0) return '-';
    
    // Convert to number if it's a string
    const numHours = typeof hours === 'string' ? parseFloat(hours) : hours;
    
    // Check if it's a valid number
    if (isNaN(numHours) || numHours === 0) return '-';
    
    const wholeHours = Math.floor(numHours);
    const minutes = Math.round((numHours - wholeHours) * 60);
    
    if (minutes === 0) {
        return `${wholeHours} saat`;
    } else {
        return `${wholeHours} saat ${minutes} dakika`;
    }
}

/**
 * Format duration in hours with decimal precision
 * @param {number|string} hours - Duration in hours (can be decimal)
 * @param {number} precision - Decimal precision (default: 1)
 * @returns {string} Formatted duration string
 */
export function formatDurationHoursDecimal(hours, precision = 1) {
    if (!hours || hours === 0) return '-';
    
    // Convert to number if it's a string
    const numHours = typeof hours === 'string' ? parseFloat(hours) : hours;
    
    // Check if it's a valid number
    if (isNaN(numHours) || numHours === 0) return '-';
    
    return `${numHours.toFixed(precision)} saat`;
}

/**
 * Format user count with badge styling
 * @param {number|string} count - Number of users
 * @returns {string} Formatted user count with badge
 */
export function formatUserCount(count) {
    if (!count || count === 0) return '-';
    
    // Convert to number if it's a string
    const numCount = typeof count === 'string' ? parseInt(count) : count;
    
    // Check if it's a valid number
    if (isNaN(numCount) || numCount === 0) return '-';
    
    return `<span class="badge bg-secondary">${numCount}</span>`;
}

/**
 * Format job number with code styling
 * @param {string} jobNo - Job number
 * @returns {string} Formatted job number
 */
export function formatJobNumber(jobNo) {
    if (!jobNo || jobNo.trim() === '') return '-';
    
    return `<code class="job-number">${jobNo.trim()}</code>`;
}

/**
 * Format description with truncation if too long
 * @param {string} description - Description text
 * @param {number} maxLength - Maximum length before truncation (default: 50)
 * @returns {string} Formatted description
 */
export function formatDescription(description, maxLength = 50) {
    if (!description || description.trim() === '') return '-';
    
    const trimmed = description.trim();
    if (trimmed.length <= maxLength) {
        return trimmed;
    }
    
    return `<span title="${trimmed}">${trimmed.substring(0, maxLength)}...</span>`;
}

/**
 * Format team name with proper styling
 * @param {string} team - Team name
 * @returns {string} Formatted team name
 */
export function formatTeam(team) {
    if (!team || team.trim() === '') return '-';
    
    return `<span class="team-name">${team.trim()}</span>`;
}

/**
 * Format requester username with proper styling
 * @param {string} username - Username
 * @returns {string} Formatted username
 */
export function formatUsername(username) {
    if (!username || username.trim() === '') return '-';
    
    return `<strong class="username">${username.trim()}</strong>`;
}

// ===== Dashboard Formatters =====

/**
 * Format duration from milliseconds to HH:MM:SS format
 * @param {number} milliseconds - Duration in milliseconds
 * @returns {string} Formatted duration string
 */
export function formatDurationFromMs(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Format total estimated hours to weeks (45 hours = 1 week)
 * @param {number} totalEstimatedHours - Total estimated hours
 * @returns {string} Formatted weeks string
 */
export function formatWeeksFromHours(totalEstimatedHours) {
    if (!totalEstimatedHours || totalEstimatedHours === 0) {
        return '-';
    }
    
    const weeks = (totalEstimatedHours / 45).toFixed(1);
    return `${weeks} hafta`;
}

/**
 * Format hours spent with current timer
 * @param {number|string} baseHours - Base hours already spent
 * @param {Date|string} currentTimerStartTime - Current timer start time
 * @returns {string} Formatted hours spent string
 */
export function formatHoursSpent(baseHours, currentTimerStartTime) {
    let totalHours = parseFloat(baseHours) || 0;
    
    if (currentTimerStartTime) {
        const now = new Date();
        const currentDuration = (now - currentTimerStartTime) / (1000 * 60 * 60); // Convert to hours
        totalHours += currentDuration;
    }
    
    return `${totalHours.toFixed(2)} saat`;
}

/**
 * Format remaining hours
 * @param {number|string} estimatedHours - Estimated total hours
 * @param {number|string} baseHours - Base hours already spent
 * @param {Date|string} currentTimerStartTime - Current timer start time
 * @returns {string} Formatted remaining hours string
 */
export function formatRemainingHours(estimatedHours, baseHours, currentTimerStartTime) {
    const estimated = parseFloat(estimatedHours) || 0;
    let spent = parseFloat(baseHours) || 0;
    
    if (currentTimerStartTime) {
        const now = new Date();
        const currentDuration = (now - currentTimerStartTime) / (1000 * 60 * 60); // Convert to hours
        spent += currentDuration;
    }
    
    const remaining = Math.max(0, estimated - spent);
    return `${remaining.toFixed(2)} saat`;
}