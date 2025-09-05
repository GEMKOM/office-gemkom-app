import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';


export async function getItemsReport(filters = {}, ordering = null) {
    try {
        // Build query parameters
        const params = new URLSearchParams();
        
        // Add filters
        if (filters['item-code']) {
            params.append('code__icontains', filters['item-code']);
        }
        if (filters['item-name']) {
            params.append('name__icontains', filters['item-name']);
        }
        
        // Add ordering
        if (ordering) {
            params.append('ordering', ordering);
        }
        
        const queryString = params.toString();
        const url = `${backendBase}/procurement/items/report${queryString ? `?${queryString}` : ''}`;
        
        const response = await authedFetch(url);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Ürün raporu yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching items report:', error);
        throw error;
    }
}

export async function getSuppliersReport(filters = {}, ordering = null) {
    try {
        // Build query parameters
        const params = new URLSearchParams();
        
        // Add filters
        if (filters['supplier-name']) {
            params.append('name__icontains', filters['supplier-name']);
        }
        if (filters['supplier-code']) {
            params.append('code__icontains', filters['supplier-code']);
        }
        if (filters['has_dbs']) {
            params.append('has_dbs', filters['has_dbs']);
        }
        if (filters['created_gte']) {
            params.append('created__gte', filters['created_gte']);
        }
        if (filters['created_lte']) {
            params.append('created__lte', filters['created_lte']);
        }
        if (filters['min_total_spent_eur']) {
            params.append('total_spent_eur__gte', filters['min_total_spent_eur']);
        }
        
        // Add ordering
        if (ordering) {
            params.append('ordering', ordering);
        }
        
        const queryString = params.toString();
        const url = `${backendBase}/procurement/suppliers/report${queryString ? `?${queryString}` : ''}`;
        
        const response = await authedFetch(url);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Tedarikçi raporu yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching suppliers report:', error);
        throw error;
    }
}