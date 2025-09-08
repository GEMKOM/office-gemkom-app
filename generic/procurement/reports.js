import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';


export async function getItemsReport(filters = {}, ordering = null) {
    try {
        // Build query parameters
        const params = new URLSearchParams();
        
        // Add filters
        if (filters['code']) {
            params.append('code__icontains', filters['code']);
        }
        if (filters['name']) {
            params.append('name__icontains', filters['name']);
        }
        
        // Add ordering
        if (ordering) {
            params.append('ordering', ordering);
        }
        
        const queryString = params.toString();
        const url = `${backendBase}/procurement/reports/items${queryString ? `?${queryString}` : ''}`;
        
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

export async function getSuppliersReport(filters = {}, ordering = '-total_spent_eur') {
    try {
        // Build query parameters
        const params = new URLSearchParams();
        
        // Add filters
        if (filters['name']) {
            params.append('name__icontains', filters['name']);
        }
        if (filters['code']) {
            params.append('code__icontains', filters['code']);
        }
        if (filters['has_dbs']) {
            params.append('has_dbs', filters['has_dbs']);
        }
        if (filters['created_gte']) {
            params.append('created_gte', filters['created_gte']);
        }
        if (filters['created_lte']) {
            params.append('created_lte', filters['created_lte']);
        }
        if (filters['status']) {
            params.append('status', filters['status']);
        }
        if (filters['min_total_spent_eur']) {
            params.append('min_total_spent_eur', filters['min_total_spent_eur']);
        }
        
        // Add ordering (default is -total_spent_eur)
        if (ordering) {
            params.append('ordering', ordering);
        }
        
        const queryString = params.toString();
        const url = `${backendBase}/procurement/reports/suppliers${queryString ? `?${queryString}` : ''}`;
        
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

export async function getStaffReport(filters = {}, ordering = '-total_spent_eur') {
    try {
        // Build query parameters
        const params = new URLSearchParams();
        
        // Add user filters
        if (filters['teams']) {
            params.append('teams', filters['teams']);
        }
        if (filters['username']) {
            params.append('username__icontains', filters['username']);
        }
        if (filters['name']) {
            params.append('name__icontains', filters['name']);
        }
        if (filters['email']) {
            params.append('email__icontains', filters['email']);
        }
        if (filters['is_active']) {
            params.append('is_active', filters['is_active']);
        }
        
        // Add date window filters
        if (filters['created_gte']) {
            params.append('created_gte', filters['created_gte']);
        }
        if (filters['created_lte']) {
            params.append('created_lte', filters['created_lte']);
        }
        
        // Add ordering (default is -total_spent_eur)
        if (ordering) {
            params.append('ordering', ordering);
        }
        
        const queryString = params.toString();
        const url = `${backendBase}/procurement/reports/staff${queryString ? `?${queryString}` : ''}`;
        
        const response = await authedFetch(url);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Personel raporu yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching staff report:', error);
        throw error;
    }
}

export async function getPriceVarianceReport(filters = {}, ordering = '-ppv_vs_avg_pct') {
    try {
        // Build query parameters
        const params = new URLSearchParams();
        
        // Add filters
        if (filters['code']) {
            params.append('code', filters['code']);
        }
        if (filters['name']) {
            params.append('name', filters['name']);
        }
        if (filters['created_gte']) {
            params.append('created_gte', filters['created_gte']);
        }
        if (filters['created_lte']) {
            params.append('created_lte', filters['created_lte']);
        }
        
        // Add ordering (default is -ppv_vs_avg_pct)
        if (ordering) {
            params.append('ordering', ordering);
        }
        
        const queryString = params.toString();
        const url = `${backendBase}/procurement/reports/price-variance${queryString ? `?${queryString}` : ''}`;
        
        const response = await authedFetch(url);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Fiyat varyans raporu yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching price variance report:', error);
        throw error;
    }
}

export async function getProjectsReport(filters = {}, ordering = '-forecast_eur') {
    try {
        // Build query parameters
        const params = new URLSearchParams();
        
        // Add filters
        if (filters['job_no']) {
            params.append('job_no', filters['job_no']);
        }
        if (filters['job_prefix']) {
            params.append('job_prefix', filters['job_prefix']);
        }
        if (filters['created_gte']) {
            params.append('created_gte', filters['created_gte']);
        }
        if (filters['created_lte']) {
            params.append('created_lte', filters['created_lte']);
        }
        if (filters['include_empty']) {
            params.append('include_empty', filters['include_empty']);
        }
        
        // Add ordering (default is -forecast_eur)
        if (ordering) {
            params.append('ordering', ordering);
        }
        
        const queryString = params.toString();
        const url = `${backendBase}/procurement/reports/projects${queryString ? `?${queryString}` : ''}`;
        
        const response = await authedFetch(url);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Proje raporu yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching projects report:', error);
        throw error;
    }
}

export async function getExecutiveReport(filters = {}) {
    try {
        // Build query parameters
        const params = new URLSearchParams();
        
        // Add filters
        if (filters['created_gte']) {
            params.append('created_gte', filters['created_gte']);
        }
        if (filters['created_lte']) {
            params.append('created_lte', filters['created_lte']);
        }
        
        // Note: No ordering parameter for executive report
        const queryString = params.toString();
        const url = `${backendBase}/procurement/reports/executive${queryString ? `?${queryString}` : ''}`;
        
        const response = await authedFetch(url);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Yönetici raporu yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching executive report:', error);
        throw error;
    }
}

export async function getConcentrationReport(filters = {}) {
    try {
        // Build query parameters
        const params = new URLSearchParams();
        
        // Add filters
        if (filters['created_gte']) {
            params.append('created_gte', filters['created_gte']);
        }
        if (filters['created_lte']) {
            params.append('created_lte', filters['created_lte']);
        }
        if (filters['top_n']) {
            params.append('top_n', filters['top_n']);
        }
        if (filters['tail_threshold_pct']) {
            params.append('tail_threshold_pct', filters['tail_threshold_pct']);
        }
        
        // Note: No ordering parameter for concentration report
        const queryString = params.toString();
        const url = `${backendBase}/procurement/reports/concentration${queryString ? `?${queryString}` : ''}`;
        
        const response = await authedFetch(url);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Konsantrasyon raporu yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching concentration report:', error);
        throw error;
    }
}

export async function getCashForecastReport(filters = {}) {
    try {
        // Build query parameters
        const params = new URLSearchParams();
        
        // Add filters
        if (filters['weeks']) {
            params.append('weeks', filters['weeks']);
        }
        if (filters['created_gte']) {
            params.append('created_gte', filters['created_gte']);
        }
        if (filters['created_lte']) {
            params.append('created_lte', filters['created_lte']);
        }
        
        // Note: No ordering parameter for cash forecast report
        const queryString = params.toString();
        const url = `${backendBase}/procurement/reports/cash-forecast${queryString ? `?${queryString}` : ''}`;
        
        const response = await authedFetch(url);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Nakit tahmin raporu yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching cash forecast report:', error);
        throw error;
    }
}

export async function getCycleTimeReport(filters = {}) {
    try {
        // Build query parameters
        const params = new URLSearchParams();
        
        // Add filters
        if (filters['created_gte']) {
            params.append('created_gte', filters['created_gte']);
        }
        if (filters['created_lte']) {
            params.append('created_lte', filters['created_lte']);
        }
        
        // Note: No ordering parameter for cycle time report
        const queryString = params.toString();
        const url = `${backendBase}/procurement/reports/cycle-time${queryString ? `?${queryString}` : ''}`;
        
        const response = await authedFetch(url);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Döngü süresi raporu yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching cycle time report:', error);
        throw error;
    }
}