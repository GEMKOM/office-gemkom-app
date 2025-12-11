import { guardRoute } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { initRouteProtection } from '../../apis/routeProtection.js';
import { StatisticsCards } from '../../components/statistics-cards/statistics-cards.js';
import { getProductionPlanOverview } from '../../apis/machining/capacityPlanning.js';
import { getPurchaseRequests } from '../../apis/procurement.js';
import { getPurchaseOrders } from '../../apis/purchaseOrders.js';
import { getDepartmentRequests } from '../../apis/planning/departmentRequests.js';

// Initialize dashboard
document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    // Initialize route protection
    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();

    // Initialize statistics cards for each module
    const manufacturingStats = new StatisticsCards('manufacturing-statistics', {
        cards: [
            {
                title: 'Toplam Makine',
                value: '-',
                icon: 'fas fa-cogs',
                color: 'primary'
            },
            {
                title: 'Toplam Görev',
                value: '-',
                icon: 'fas fa-tasks',
                color: 'success'
            },
            {
                title: 'Toplam Tahmini Saat',
                value: '-',
                icon: 'fas fa-clock',
                color: 'info'
            },
            {
                title: 'En Yoğun Makine',
                value: '-',
                icon: 'fas fa-industry',
                color: 'warning'
            }
        ]
    });

    const procurementStats = new StatisticsCards('procurement-statistics', {
        cards: [
            {
                title: 'Toplam Talep',
                value: '-',
                icon: 'fas fa-file-alt',
                color: 'primary'
            },
            {
                title: 'Bekleyen Onay',
                value: '-',
                icon: 'fas fa-clock',
                color: 'warning'
            },
            {
                title: 'Onaylanan',
                value: '-',
                icon: 'fas fa-check-circle',
                color: 'success'
            },
            {
                title: 'İptal Edilen',
                value: '-',
                icon: 'fas fa-times-circle',
                color: 'danger'
            }
        ]
    });

    const financeStats = new StatisticsCards('finance-statistics', {
        cards: [
            {
                title: 'Toplam Sipariş',
                value: '-',
                icon: 'fas fa-shopping-cart',
                color: 'primary'
            },
            {
                title: 'Toplam Tutar',
                value: '-',
                icon: 'fas fa-lira-sign',
                color: 'success'
            },
            {
                title: 'Ödeme Bekleyen',
                value: '-',
                icon: 'fas fa-clock',
                color: 'warning'
            },
            {
                title: 'Ödenen',
                value: '-',
                icon: 'fas fa-check-circle',
                color: 'info'
            }
        ]
    });

    const planningStats = new StatisticsCards('planning-statistics', {
        cards: [
            {
                title: 'Toplam Talep',
                value: '-',
                icon: 'fas fa-clipboard-list',
                color: 'primary'
            },
            {
                title: 'Bekleyen',
                value: '-',
                icon: 'fas fa-hourglass-half',
                color: 'warning'
            },
            {
                title: 'Onaylanan',
                value: '-',
                icon: 'fas fa-check-circle',
                color: 'success'
            },
            {
                title: 'Reddedilen',
                value: '-',
                icon: 'fas fa-times-circle',
                color: 'danger'
            }
        ]
    });

    // Load all dashboard data
    await loadDashboardData(manufacturingStats, procurementStats, financeStats, planningStats);
});

/**
 * Load all dashboard data from different modules
 */
async function loadDashboardData(manufacturingStats, procurementStats, financeStats, planningStats) {
    try {
        // Load all data in parallel
        const [manufacturingData, procurementData, financeData, planningData] = await Promise.allSettled([
            loadManufacturingData(),
            loadProcurementData(),
            loadFinanceData(),
            loadPlanningData()
        ]);

        // Update manufacturing statistics
        if (manufacturingData.status === 'fulfilled') {
            updateManufacturingStats(manufacturingStats, manufacturingData.value);
        } else {
            console.error('Error loading manufacturing data:', manufacturingData.reason);
            manufacturingStats.showEmpty('Veri yüklenemedi');
        }

        // Update procurement statistics
        if (procurementData.status === 'fulfilled') {
            updateProcurementStats(procurementStats, procurementData.value);
        } else {
            console.error('Error loading procurement data:', procurementData.reason);
            procurementStats.showEmpty('Veri yüklenemedi');
        }

        // Update finance statistics
        if (financeData.status === 'fulfilled') {
            updateFinanceStats(financeStats, financeData.value);
        } else {
            console.error('Error loading finance data:', financeData.reason);
            financeStats.showEmpty('Veri yüklenemedi');
        }

        // Update planning statistics
        if (planningData.status === 'fulfilled') {
            updatePlanningStats(planningStats, planningData.value);
        } else {
            console.error('Error loading planning data:', planningData.reason);
            planningStats.showEmpty('Veri yüklenemedi');
        }
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

/**
 * Load manufacturing data
 */
async function loadManufacturingData() {
    try {
        const data = await getProductionPlanOverview();
        return data;
    } catch (error) {
        console.error('Error loading manufacturing data:', error);
        throw error;
    }
}

/**
 * Update manufacturing statistics
 */
function updateManufacturingStats(statsComponent, data) {
    if (!data || !statsComponent) return;

    const { machines = [], overall_totals = {} } = data;

    // Find the busiest machine
    const busiestMachine = machines.length > 0
        ? machines.reduce((max, machine) => 
            (machine.totals?.total_estimated_hours || 0) > (max.totals?.total_estimated_hours || 0) 
                ? machine 
                : max, 
            machines[0]
        )
        : null;

    const totalHours = overall_totals?.total_estimated_hours || 0;
    const taskCount = overall_totals?.task_count || 0;
    const machineCount = machines?.length || 0;
    const busiestMachineName = busiestMachine?.machine_name || '-';

    statsComponent.updateValues({
        0: machineCount.toString(),
        1: taskCount.toString(),
        2: totalHours > 0 ? `${totalHours.toFixed(1)} saat` : '-',
        3: busiestMachineName
    });
}

/**
 * Load procurement data
 */
async function loadProcurementData() {
    try {
        // Fetch all purchase requests to calculate statistics
        const data = await getPurchaseRequests({ page_size: 1000 });
        
        // Handle paginated response
        const requests = data.results || data;
        
        return {
            requests: Array.isArray(requests) ? requests : [],
            total: data.count || (Array.isArray(requests) ? requests.length : 0)
        };
    } catch (error) {
        console.error('Error loading procurement data:', error);
        throw error;
    }
}

/**
 * Update procurement statistics
 */
function updateProcurementStats(statsComponent, data) {
    if (!data || !statsComponent) return;

    const requests = data.requests || [];
    
    const total = requests.length;
    const pending = requests.filter(r => r.status === 'pending_approval' || r.status === 'draft').length;
    const approved = requests.filter(r => r.status === 'approved' || r.status === 'converted').length;
    const cancelled = requests.filter(r => r.status === 'cancelled').length;

    statsComponent.updateValues({
        0: total.toString(),
        1: pending.toString(),
        2: approved.toString(),
        3: cancelled.toString()
    });
}

/**
 * Load finance data
 */
async function loadFinanceData() {
    try {
        // Fetch all purchase orders to calculate statistics
        const data = await getPurchaseOrders({ page_size: 1000 });
        
        // Handle paginated response
        const orders = data.results || data;
        
        return {
            orders: Array.isArray(orders) ? orders : [],
            total: data.count || (Array.isArray(orders) ? orders.length : 0)
        };
    } catch (error) {
        console.error('Error loading finance data:', error);
        throw error;
    }
}

/**
 * Update finance statistics
 */
function updateFinanceStats(statsComponent, data) {
    if (!data || !statsComponent) return;

    const orders = data.orders || [];
    
    const total = orders.length;
    const totalAmount = orders.reduce((sum, order) => {
        const amount = parseFloat(order.total_amount || 0);
        return sum + (isNaN(amount) ? 0 : amount);
    }, 0);
    const awaitingPayment = orders.filter(o => o.status === 'awaiting_payment' || o.status === 'pending').length;
    const paid = orders.filter(o => o.status === 'paid' || o.status === 'completed').length;

    // Format currency
    const formatCurrency = (amount) => {
        if (amount === 0) return '₺0,00';
        return new Intl.NumberFormat('tr-TR', {
            style: 'currency',
            currency: 'TRY',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    };

    statsComponent.updateValues({
        0: total.toString(),
        1: formatCurrency(totalAmount),
        2: awaitingPayment.toString(),
        3: paid.toString()
    });
}

/**
 * Load planning data
 */
async function loadPlanningData() {
    try {
        // Fetch all department requests to calculate statistics
        const data = await getDepartmentRequests({ page_size: 1000 });
        
        // Handle paginated response
        const requests = data.results || data;
        
        return {
            requests: Array.isArray(requests) ? requests : [],
            total: data.count || (Array.isArray(requests) ? requests.length : 0)
        };
    } catch (error) {
        console.error('Error loading planning data:', error);
        throw error;
    }
}

/**
 * Update planning statistics
 */
function updatePlanningStats(statsComponent, data) {
    if (!data || !statsComponent) return;

    const requests = data.requests || [];
    
    const total = requests.length;
    const pending = requests.filter(r => r.status === 'pending' || r.status === 'draft').length;
    const approved = requests.filter(r => r.status === 'approved').length;
    const rejected = requests.filter(r => r.status === 'rejected').length;

    statsComponent.updateValues({
        0: total.toString(),
        1: pending.toString(),
        2: approved.toString(),
        3: rejected.toString()
    });
}

