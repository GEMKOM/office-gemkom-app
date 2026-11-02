import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

/**
 * Tartışmalarım API — the signed-in user's own topics and comments.
 * Base URL: /projects/my-discussions/
 *
 * Every call takes the same filters:
 *   search, job_no (whole subtree), topic_type (comma list),
 *   created_at__date__gte, created_at__date__lte,
 *   replied ('true' | 'false'), ordering ('activity' | 'created'),
 *   page, page_size
 */

const BASE = `${backendBase}/projects/my-discussions`;

async function get(path, filters, errorMessage) {
    const query = new URLSearchParams();
    Object.entries(filters || {}).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
            query.append(key, value);
        }
    });
    const url = `${BASE}/${path}/${query.toString() ? `?${query}` : ''}`;
    const response = await authedFetch(url);
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || data.error || errorMessage);
    }
    return response.json();
}

/** Topics I opened — paginated `{count, results}`. */
export function listMyTopics(filters = {}) {
    return get('topics', filters, 'Konular yüklenirken hata oluştu');
}

/** Comments I wrote — paginated `{count, results}`. */
export function listMyComments(filters = {}) {
    return get('comments', filters, 'Yorumlar yüklenirken hata oluştu');
}

/**
 * Tab counts under the current filters, unfiltered totals, and the topic-type
 * facet for `tab` ('topics' | 'comments').
 */
export function getMyDiscussionSummary(filters = {}) {
    return get('summary', filters, 'Özet yüklenirken hata oluştu');
}
