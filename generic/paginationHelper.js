/**
 * Utility function to handle paginated API responses
 * @param {Object} responseData - The API response data
 * @returns {Array} - The results array from the response
 */
export function extractResultsFromResponse(responseData) {
    let res = [];
    
    // Handle null or undefined
    if (!responseData) {
        console.warn('Response data is null or undefined');
        return res;
    }
    
    // Handle direct array response
    if (Array.isArray(responseData)) {
        res = responseData;
    }
    // Handle paginated response with results property
    else if (responseData.results && Array.isArray(responseData.results)) {
        res = responseData.results;
    }
    // Handle response with data property
    else if (responseData.data && Array.isArray(responseData.data)) {
        res = responseData.data;
    }
    // Handle response with items property
    else if (responseData.items && Array.isArray(responseData.items)) {
        res = responseData.items;
    }
    // Handle response with list property
    else if (responseData.list && Array.isArray(responseData.list)) {
        res = responseData.list;
    }
    // If it's an object but none of the above, try to find any array property
    else if (typeof responseData === 'object') {
        const arrayKeys = Object.keys(responseData).filter(key => Array.isArray(responseData[key]));
        if (arrayKeys.length > 0) {
            // Use the first array found
            res = responseData[arrayKeys[0]];
            console.warn(`Using first array property found: ${arrayKeys[0]}`, responseData);
        } else {
            console.warn('No array property found in response:', responseData);
        }
    }
    // If it's not an object or array, return empty array
    else {
        console.warn('Unexpected response format:', responseData);
        res = [];
    }
    
    console.log('Extracted results:', res);
    return res;
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