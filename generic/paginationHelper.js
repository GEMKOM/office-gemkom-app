/**
 * Utility function to handle paginated API responses
 * @param {Object} responseData - The API response data
 * @returns {Array} - The results array from the response
 */
export function extractResultsFromResponse(responseData) {
    if (responseData.results && Array.isArray(responseData.results)) {
        return responseData.results;
    } else if (Array.isArray(responseData)) {
        return responseData;
    } else {
        console.warn('Unexpected response format:', responseData);
        return [];
    }
}

/**
 * Utility function to handle paginated API responses and return the first result
 * @param {Object} responseData - The API response data
 * @returns {Object|null} - The first result or null if no results
 */
export function extractFirstResultFromResponse(responseData) {
    const results = extractResultsFromResponse(responseData);
    return results.length > 0 ? results[0] : null;
} 