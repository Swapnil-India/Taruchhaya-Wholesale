/**
 * Taruchhaya Wholesale - Main Logic
 * Focused on efficient stock management and premium UI interaction.
 */

import { supabase } from './supabase.js';

// --- State Management ---
let inventory = JSON.parse(localStorage.getItem('tw_inventory')) || [];
let history = JSON.parse(localStorage.getItem('tw_history')) || [];
let finalizedReports = JSON.parse(localStorage.getItem('tw_reports')) || {};
let currentProductForAdjustment = null;
let html5QrCode = null;
let currentViewingReportDate = null;
let reportsAuthCallback = null;

// --- Initialize UI ---
document.addEventListener('DOMContentLoaded', () => {
    initLucide();
    
    // Always require login before entering the main page
    setupLogin();
});

function setupLogin() {
    document.getElementById('btn-login').addEventListener('click', handleLogin);
    document.getElementById('login-password').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleLogin();
    });
}

function handleLogin() {
    const user = document.getElementById('login-username').value;
    const pass = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');

    if (user === 'Simi' && pass === '1364') {
        localStorage.setItem('tw_session', 'active');
        showApp();
        showToast('Welcome back, Simi!', 'success');
    } else {
        errorEl.style.display = 'block';
        setTimeout(() => {
            errorEl.style.display = 'none';
        }, 3000);
    }
}

async function showApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.querySelector('.app-container').style.display = 'flex';
    
    setupEventListeners();
    setupGlobalBarcodeListener();
    
    await loadDataFromSupabase();
    
    updateDashboardStats();
    renderInventoryTable();
    renderLowStockAlerts();
}

function updateCloudStatus(online) {
    const dot = document.getElementById('cloud-status-dot');
    if (dot) {
        if (online) {
            dot.className = 'status-dot online';
            dot.title = 'Connected to Supabase';
        } else {
            dot.className = 'status-dot offline';
            dot.title = 'Disconnected from Supabase';
        }
    }
}

async function loadDataFromSupabase() {
    showToast('Syncing with Supabase...', 'info');
    try {
        // 1. Fetch products
        const { data: dbProducts, error: prodError } = await supabase
            .from('products')
            .select('*')
            .order('name', { ascending: true });
            
        if (prodError) {
            showToast('Error loading products: ' + prodError.message, 'danger');
            updateCloudStatus(false);
            return;
        }
        
        inventory = dbProducts.map(p => ({
            name: p.name,
            sku: p.sku,
            category: p.category,
            price: p.price,
            stock: p.stock
        }));

        // 2. Fetch history
        const { data: dbHistory, error: histError } = await supabase
            .from('history')
            .select('*')
            .order('timestamp', { ascending: true });

        if (histError) {
            showToast('Error loading history: ' + histError.message, 'danger');
            updateCloudStatus(false);
            return;
        }

        // Active history is where finalized = false
        history = dbHistory
            .filter(h => !h.finalized)
            .map(h => ({
                timestamp: h.timestamp,
                productSku: h.product_sku,
                productName: h.product_name,
                type: h.type,
                quantity: h.quantity,
                oldBalance: h.old_balance,
                newBalance: h.new_balance,
                note: h.note
            }));

        // Finalized reports is reconstructed from finalized = true
        finalizedReports = {};
        dbHistory
            .filter(h => h.finalized)
            .forEach(h => {
                const dateStr = new Date(h.timestamp).toISOString().split('T')[0];
                if (!finalizedReports[dateStr]) {
                    finalizedReports[dateStr] = [];
                }
                finalizedReports[dateStr].push({
                    timestamp: h.timestamp,
                    productSku: h.product_sku,
                    productName: h.product_name,
                    type: h.type,
                    quantity: h.quantity,
                    oldBalance: h.old_balance,
                    newBalance: h.new_balance,
                    note: h.note
                });
            });

        showToast('Cloud database synchronized!', 'success');
        updateCloudStatus(true);
    } catch (err) {
        console.error(err);
        showToast('Unexpected synchronization error', 'danger');
        updateCloudStatus(false);
    }
}

function initLucide() {
    lucide.createIcons();
    updateCurrentDate();
}

function updateCurrentDate() {
    const dateEl = document.getElementById('current-date');
    if (dateEl) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateEl.textContent = new Date().toLocaleDateString('en-IN', options);
    }
}

// --- Persistence ---
function saveData() {
    localStorage.setItem('tw_inventory', JSON.stringify(inventory));
    localStorage.setItem('tw_history', JSON.stringify(history));
    localStorage.setItem('tw_reports', JSON.stringify(finalizedReports));
    updateDashboardStats();
}

// --- Dashboard Stats ---
function updateDashboardStats() {
    const totalStock = inventory.reduce((sum, item) => sum + parseInt(item.stock), 0);
    const lowStockCount = inventory.filter(item => parseInt(item.stock) < 10).length;
    const totalProducts = inventory.length;

    document.getElementById('stat-total-stock').textContent = totalStock;
    document.getElementById('stat-low-stock').textContent = lowStockCount;
    document.getElementById('stat-total-products').textContent = totalProducts;
}

// --- Rendering ---
function renderInventoryTable(filter = '') {
    const tbody = document.getElementById('inventory-body');
    tbody.innerHTML = '';

    const filtered = inventory.filter(item => 
        item.name.toLowerCase().includes(filter.toLowerCase()) || 
        item.sku.toLowerCase().includes(filter.toLowerCase())
    );

    filtered.forEach(item => {
        const tr = document.createElement('tr');
        const statusClass = item.stock < 10 ? (item.stock == 0 ? 'stock-out' : 'stock-low') : 'stock-in';
        const statusText = item.stock < 10 ? (item.stock == 0 ? 'Out of Stock' : 'Low Stock') : 'In Stock';

        tr.innerHTML = `
            <td><div class="item-name">${item.name}</div></td>
            <td><div class="item-sku">${item.sku}</div></td>
            <td>${item.category}</td>
            <td style="font-weight: 600;">${item.stock} units</td>
            <td><span class="stock-badge ${statusClass}">${statusText}</span></td>
            <td>
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-ghost btn-sm btn-adjust" data-sku="${item.sku}"><i data-lucide="refresh-cw" style="width: 14px;"></i></button>
                    <button class="btn btn-ghost btn-sm btn-edit" data-sku="${item.sku}"><i data-lucide="edit-2" style="width: 14px;"></i></button>
                    <button class="btn btn-ghost btn-sm btn-delete" data-sku="${item.sku}" style="color: var(--danger);"><i data-lucide="trash-2" style="width: 14px;"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    initLucide();
}

function renderLowStockAlerts() {
    const tbody = document.getElementById('low-stock-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const lowStock = inventory.filter(item => parseInt(item.stock) < 5);

    if (lowStock.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">All products are sufficiently stocked</td></tr>';
        return;
    }

    lowStock.forEach(item => {
        const tr = document.createElement('tr');
        const statusClass = item.stock == 0 ? 'stock-out' : 'stock-low';
        const statusText = item.stock == 0 ? 'Out of Stock' : 'Critical Low';
        
        tr.innerHTML = `
            <td><div class="item-name">${item.name}</div></td>
            <td><div class="item-sku">${item.sku}</div></td>
            <td>${item.category}</td>
            <td style="font-weight: 700; color: var(--danger);">${item.stock} units</td>
            <td><span class="stock-badge ${statusClass}">${statusText}</span></td>
            <td>
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-ghost btn-sm btn-adjust" data-sku="${item.sku}"><i data-lucide="refresh-cw" style="width: 14px;"></i></button>
                    <button class="btn btn-ghost btn-sm btn-edit" data-sku="${item.sku}"><i data-lucide="edit-2" style="width: 14px;"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    initLucide();
}

function renderFullHistory(filter = '') {
    const tbody = document.getElementById('full-history-body');
    tbody.innerHTML = '';

    const filtered = history.filter(log => 
        log.productName.toLowerCase().includes(filter.toLowerCase()) || 
        log.productSku.toLowerCase().includes(filter.toLowerCase())
    );

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">No movement history found</td></tr>';
        return;
    }

    [...filtered].reverse().forEach(log => {
        const tr = document.createElement('tr');
        const typeClass = log.type === 'inward' ? 'stock-in' : 'stock-out';
        const typeIcon = log.type === 'inward' ? 'arrow-down-left' : 'arrow-up-right';
        
        tr.innerHTML = `
            <td style="font-size: 0.8rem; color: var(--text-muted);">${new Date(log.timestamp).toLocaleString()}</td>
            <td><div class="item-name">${log.productName}</div></td>
            <td><div class="item-sku">${log.productSku}</div></td>
            <td><span class="stock-badge ${typeClass}"><i data-lucide="${typeIcon}" style="width: 12px; margin-right: 4px;"></i>${log.type.toUpperCase()}</span></td>
            <td style="font-weight: 600;">${log.type === 'inward' ? '+' : '-'}${log.quantity}</td>
            <td>${log.oldBalance}</td>
            <td>${log.newBalance}</td>
            <td style="font-style: italic; font-size: 0.8rem;">${log.note || '-'}</td>
        `;
        tbody.appendChild(tr);
    });
    initLucide();
}

// --- Event Listeners ---
function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.getAttribute('data-page');
            showPage(page);
            
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            item.classList.add('active');
        });
    });

    // Reports Access
    document.getElementById('nav-reports').addEventListener('click', (e) => {
        e.preventDefault();
        handleReportsAccess();
    });

    // Generate Report
    document.getElementById('btn-generate-report').addEventListener('click', (e) => {
        e.preventDefault();
        handleGenerateReport();
    });

    // Mobile Toggle
    document.getElementById('menu-toggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });

    // Global Search
    document.getElementById('global-search').addEventListener('input', (e) => {
        const val = e.target.value;
        const activePage = document.querySelector('.page:not([style*="display: none"])');
        
        if (activePage.id === 'page-inventory') renderInventoryTable(val);
        if (activePage.id === 'page-history') renderFullHistory(val);
    });

    // Dashboard View All
    document.getElementById('view-inventory-from-dash').addEventListener('click', () => {
        showPage('inventory');
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelector('[data-page="inventory"]').classList.add('active');
    });

    // CSV Export Listeners
    document.getElementById('btn-export-csv').addEventListener('click', exportInventoryToCSV);
    document.getElementById('btn-export-history').addEventListener('click', exportHistoryToCSV);

    // History Actions
    document.getElementById('btn-clear-history').addEventListener('click', async () => {
        if (confirm('Are you sure you want to clear all movement history? Inventory levels will NOT be affected.')) {
            const { error } = await supabase
                .from('history')
                .delete()
                .eq('finalized', false);
                
            if (error) {
                showToast('Database error: ' + error.message, 'danger');
                return;
            }
            
            history = [];
            saveData();
            renderFullHistory();
            renderLowStockAlerts();
            showToast('History cleared', 'info');
        }
    });

    // Product Modal
    document.getElementById('btn-add-product').addEventListener('click', () => {
        document.getElementById('product-modal-title').textContent = 'Add New Product';
        document.getElementById('product-form').reset();
        document.getElementById('prod-price').value = '';
        document.getElementById('prod-sku').readOnly = false;
        showModal('modal-product');
    });

    document.getElementById('save-product').addEventListener('click', handleSaveProduct);
    document.getElementById('close-product-modal').addEventListener('click', () => hideModal('modal-product'));
    document.getElementById('cancel-product').addEventListener('click', () => hideModal('modal-product'));

    // Adjustment Modal
    document.getElementById('close-adjustment').addEventListener('click', () => hideModal('modal-adjustment'));
    document.getElementById('cancel-adjustment').addEventListener('click', () => hideModal('modal-adjustment'));
    document.getElementById('save-adjustment').addEventListener('click', handleSaveAdjustment);

    document.querySelectorAll('.type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Actions in table
    const tableBodies = ['inventory-body', 'low-stock-body'];
    tableBodies.forEach(bodyId => {
        const body = document.getElementById(bodyId);
        if (body) {
            body.addEventListener('click', async (e) => {
                const btn = e.target.closest('button');
                if (!btn) return;

                const sku = btn.getAttribute('data-sku');
                const product = inventory.find(p => p.sku === sku);

                if (btn.classList.contains('btn-adjust')) {
                    openAdjustmentModal(product);
                } else if (btn.classList.contains('btn-edit')) {
                    openEditProductModal(product);
                } else if (btn.classList.contains('btn-delete')) {
                    if (confirm(`Are you sure you want to delete ${product.name}?`)) {
                        const { error } = await supabase
                            .from('products')
                            .delete()
                            .eq('sku', sku);
                            
                        if (error) {
                            showToast('Database error: ' + error.message, 'danger');
                            return;
                        }
                        
                        inventory = inventory.filter(p => p.sku !== sku);
                        saveData();
                        renderInventoryTable();
                        renderLowStockAlerts();
                        showToast(`Product ${product.name} deleted`, 'info');
                    }
                }
            });
        }
    });

    // Scan Barcode Button
    document.getElementById('btn-scan').addEventListener('click', () => {
        openQuickScan();
    });

    document.getElementById('btn-scan-sku').addEventListener('click', () => {
        startCameraScanner('prod-sku');
    });

    // Reports Auth Modal
    document.getElementById('btn-submit-reports-auth').addEventListener('click', submitReportsAuth);
    document.getElementById('reports-pass-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitReportsAuth();
    });
    document.getElementById('close-reports-auth').addEventListener('click', () => hideModal('modal-reports-auth'));
    document.getElementById('cancel-reports-auth').addEventListener('click', () => hideModal('modal-reports-auth'));

    // Clear Data
    document.getElementById('btn-clear-data').addEventListener('click', async () => {
        if (confirm('CRITICAL: This will delete ALL products and history. Proceed?')) {
            const { error: histError } = await supabase
                .from('history')
                .delete()
                .neq('product_name', '');
                
            const { error: prodError } = await supabase
                .from('products')
                .delete()
                .neq('sku', '');
                
            if (histError || prodError) {
                showToast('Database error: ' + (histError?.message || prodError?.message), 'danger');
                return;
            }

            inventory = [];
            history = [];
            saveData();
            renderInventoryTable();
            renderFullHistory();
            renderLowStockAlerts();
            showToast('All data cleared', 'warning');
        }
    });

    // Logout
    const logoutBtn = document.createElement('a');
    logoutBtn.href = '#';
    logoutBtn.className = 'nav-item';
    logoutBtn.style.marginTop = 'auto';
    logoutBtn.innerHTML = '<i data-lucide="log-out"></i> Logout';
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm('Are you sure you want to logout?')) {
            localStorage.removeItem('tw_session');
            window.location.reload();
        }
    });
    document.querySelector('.nav-links').appendChild(logoutBtn);

    // Print Report
    document.getElementById('btn-print-report').addEventListener('click', () => {
        const title = document.getElementById('report-view-title').textContent;
        const content = document.getElementById('report-content').innerHTML;
        const printWindow = window.open('', '', 'height=600,width=800');
        printWindow.document.write('<html><head><title>Taruchhaya Report</title>');
        printWindow.document.write('<style>body{font-family:sans-serif;padding:20px;}.report-section-title{font-weight:700;text-transform:uppercase;margin:20px 0 10px;border-bottom:1px solid #ccc;}.report-row{display:grid;grid-template-columns:1fr 100px 100px;padding:5px 0;border-bottom:1px solid #eee;}.header{font-weight:700;}.card{margin-top:30px;padding:15px;background:#f9f9f9;}</style>');
        printWindow.document.write('</head><body>');
        printWindow.document.write('<h1>Taruchhaya Wholesale</h1>');
        printWindow.document.write('<h2>' + title + '</h2>');
        printWindow.document.write(content);
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        printWindow.print();
    });

    // Delete Report
    document.getElementById('btn-delete-report').addEventListener('click', () => {
        handleDeleteReport();
    });

    initLucide();
}

// --- Page Handling ---
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
    document.getElementById(`page-${pageId}`).style.display = 'block';
    document.getElementById('page-title').textContent = pageId.charAt(0).toUpperCase() + pageId.slice(1);
    
    if (pageId === 'inventory') renderInventoryTable();
    if (pageId === 'history') renderFullHistory();
    if (pageId === 'dashboard') {
        updateDashboardStats();
        renderLowStockAlerts();
    }
    if (pageId === 'reports') {
        renderReportsList();
    }
}

// --- Reports Logic ---
function handleReportsAccess() {
    document.getElementById('reports-pass-input').value = '';
    document.getElementById('reports-auth-error').style.display = 'none';
    
    reportsAuthCallback = () => {
        showPage('reports');
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.getElementById('nav-reports').classList.add('active');
    };
    
    showModal('modal-reports-auth');
    setTimeout(() => document.getElementById('reports-pass-input').focus(), 100);
}

function handleDeleteReport() {
    if (!currentViewingReportDate) return;
    
    document.getElementById('reports-pass-input').value = '';
    document.getElementById('reports-auth-error').style.display = 'none';
    
    reportsAuthCallback = async () => {
        if (confirm(`Are you sure you want to PERMANENTLY delete the report for ${currentViewingReportDate}?`)) {
            // Check if it's archived
            if (finalizedReports[currentViewingReportDate]) {
                const startDate = `${currentViewingReportDate}T00:00:00.000Z`;
                const endDate = `${currentViewingReportDate}T23:59:59.999Z`;
                
                const { error } = await supabase
                    .from('history')
                    .delete()
                    .eq('finalized', true)
                    .gte('timestamp', startDate)
                    .lte('timestamp', endDate);
                    
                if (error) {
                    showToast('Database error: ' + error.message, 'danger');
                    return;
                }

                delete finalizedReports[currentViewingReportDate];
                saveData();
                showToast(`Report for ${currentViewingReportDate} deleted`, 'success');
                renderReportsList();
                
                // Clear view
                document.getElementById('report-content').innerHTML = `
                    <div class="empty-state" style="text-align: center; padding: 40px;">
                        <i data-lucide="file-text" style="width: 48px; height: 48px; color: var(--text-muted); opacity: 0.5; margin-bottom: 12px;"></i>
                        <p style="color: var(--text-muted);">Choose a date from the left to view detailed stock movements.</p>
                    </div>
                `;
                document.getElementById('report-view-title').textContent = 'Select a report';
                document.getElementById('btn-print-report').style.display = 'none';
                document.getElementById('btn-delete-report').style.display = 'none';
                initLucide();
            } else {
                showToast('Cannot delete active business day report. Generate report first.', 'warning');
            }
        }
    };
    
    showModal('modal-reports-auth');
    setTimeout(() => document.getElementById('reports-pass-input').focus(), 100);
}

function submitReportsAuth() {
    const pass = document.getElementById('reports-pass-input').value;
    const errorEl = document.getElementById('reports-auth-error');
    
    if (pass === '1364') {
        hideModal('modal-reports-auth');
        if (reportsAuthCallback) reportsAuthCallback();
        reportsAuthCallback = null;
    } else {
        errorEl.style.display = 'block';
        document.getElementById('reports-pass-input').focus();
    }
}

async function handleGenerateReport() {
    if (history.length === 0) {
        showToast('No active history to generate report', 'info');
        return;
    }

    if (confirm('GENERATE REPORT: This will finalize all current stock movements into the Report Folder and RESET the Business Day history. Proceed?')) {
        const { error } = await supabase
            .from('history')
            .update({ finalized: true })
            .eq('finalized', false);
            
        if (error) {
            showToast('Database error: ' + error.message, 'danger');
            return;
        }

        // Group current history by date
        history.forEach(log => {
            const d = new Date(log.timestamp);
            const dateStr = d.toISOString().split('T')[0];
            
            if (!finalizedReports[dateStr]) {
                finalizedReports[dateStr] = [];
            }
            finalizedReports[dateStr].push(log);
        });

        // Reset history
        history = [];
        saveData();
        
        renderFullHistory();
        updateDashboardStats();
        renderLowStockAlerts();
        
        showToast('Report generated and business day reset!', 'success');
        
        // Success message is enough
    }
}

function renderReportsList() {
    const list = document.getElementById('report-date-list');
    list.innerHTML = '';

    // Get dates from both active history and finalized reports
    const historyDates = [...new Set(history.map(log => {
        const d = new Date(log.timestamp);
        return d.toISOString().split('T')[0];
    }))];
    
    const archivedDates = Object.keys(finalizedReports);
    const allDates = [...new Set([...historyDates, ...archivedDates])].sort().reverse();

    if (allDates.length === 0) {
        list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No report data available</div>';
        return;
    }

    allDates.forEach(date => {
        const item = document.createElement('div');
        item.className = 'report-date-item';
        const isArchive = archivedDates.includes(date) && !historyDates.includes(date);
        
        item.innerHTML = `
            <i data-lucide="${isArchive ? 'file-check' : 'file-text'}" style="color: ${isArchive ? 'var(--success)' : 'var(--text-muted)'}"></i>
            <span>${date} ${isArchive ? '(Finalized)' : '(Active)'}</span>
        `;
        item.addEventListener('click', () => {
            document.querySelectorAll('.report-date-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            renderReport(date);
        });
        list.appendChild(item);
    });
    initLucide();
}

function renderReport(date) {
    currentViewingReportDate = date;
    const content = document.getElementById('report-content');
    const title = document.getElementById('report-view-title');
    
    title.textContent = `Report: ${date}`;
    document.getElementById('btn-print-report').style.display = 'block';
    
    // Only show delete for finalized reports
    if (finalizedReports[date]) {
        document.getElementById('btn-delete-report').style.display = 'block';
    } else {
        document.getElementById('btn-delete-report').style.display = 'none';
    }

    // Combine active and archived data for this date
    const activeDayLogs = history.filter(log => {
        const d = new Date(log.timestamp);
        return d.toISOString().split('T')[0] === date;
    });
    
    const archivedDayLogs = finalizedReports[date] || [];
    const dayLogs = [...archivedDayLogs, ...activeDayLogs];

    const inward = dayLogs.filter(l => l.type === 'inward');
    const outward = dayLogs.filter(l => l.type === 'outward');

    let html = `
        <div class="report-section">
            <div class="report-section-title">Stock Inward (+)</div>
            <div class="report-row header">
                <div>Product</div>
                <div style="text-align: right;">Qty</div>
                <div style="text-align: right;">Time</div>
            </div>
    `;

    if (inward.length === 0) {
        html += '<p style="padding: 12px; color: var(--text-muted); font-size: 0.875rem;">No inward movements</p>';
    } else {
        inward.forEach(log => {
            html += `
                <div class="report-row">
                    <div><strong>${log.productName}</strong><br><span style="font-size: 0.7rem; color: var(--text-muted);">${log.productSku}</span></div>
                    <div style="text-align: right; color: var(--success); font-weight: 600;">+${log.quantity}</div>
                    <div style="text-align: right; font-size: 0.75rem; color: var(--text-muted);">${new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                </div>
            `;
        });
    }

    html += `
        </div>
        <div class="report-section" style="margin-top: 40px;">
            <div class="report-section-title">Stock Outward (-)</div>
            <div class="report-row header">
                <div>Product</div>
                <div style="text-align: right;">Qty</div>
                <div style="text-align: right;">Time</div>
            </div>
    `;

    if (outward.length === 0) {
        html += '<p style="padding: 12px; color: var(--text-muted); font-size: 0.875rem;">No outward movements</p>';
    } else {
        outward.forEach(log => {
            html += `
                <div class="report-row">
                    <div><strong>${log.productName}</strong><br><span style="font-size: 0.7rem; color: var(--text-muted);">${log.productSku}</span></div>
                    <div style="text-align: right; color: var(--danger); font-weight: 600;">-${log.quantity}</div>
                    <div style="text-align: right; font-size: 0.75rem; color: var(--text-muted);">${new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                </div>
            `;
        });
    }

    html += '</div>';
    
    // Summary
    const totalIn = inward.reduce((sum, l) => sum + parseInt(l.quantity), 0);
    const totalOut = outward.reduce((sum, l) => sum + parseInt(l.quantity), 0);

    html += `
        <div class="card" style="margin-top: 40px; background: var(--bg-main); border: none;">
            <div style="display: flex; justify-content: space-between; padding: 10px 0;">
                <span>Total Items In:</span>
                <span style="color: var(--success); font-weight: 700;">${totalIn}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 10px 0;">
                <span>Total Items Out:</span>
                <span style="color: var(--danger); font-weight: 700;">${totalOut}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 10px 0; border-top: 1px solid var(--border-color); margin-top: 8px; font-weight: 700;">
                <span>Net Movement:</span>
                <span>${totalIn - totalOut}</span>
            </div>
        </div>
    `;

    content.innerHTML = html;
}

// --- Modal Handling ---
function showModal(id) {
    document.getElementById(id).style.display = 'flex';
}

function hideModal(id) {
    document.getElementById(id).style.display = 'none';
    if (html5QrCode) {
        html5QrCode.stop();
        document.getElementById('scanner-container').style.display = 'none';
    }
}

// --- Product Logic ---
async function handleSaveProduct() {
    const name = document.getElementById('prod-name').value;
    const sku = document.getElementById('prod-sku').value;
    const category = document.getElementById('prod-category').value;
    const price = document.getElementById('prod-price').value || '0';
    const stock = parseInt(document.getElementById('prod-stock').value) || 0;

    if (!name || !sku) {
        showToast('Name and SKU are required', 'danger');
        return;
    }

    const existingIndex = inventory.findIndex(p => p.sku === sku);
    const productData = { sku, name, category, price, stock };
    
    let dbError;
    if (existingIndex > -1) {
        // Update in Supabase
        const { error } = await supabase
            .from('products')
            .update({ name, category, price, stock })
            .eq('sku', sku);
        dbError = error;
    } else {
        // Insert in Supabase
        const { error } = await supabase
            .from('products')
            .insert(productData);
        dbError = error;
    }
    
    if (dbError) {
        showToast('Database error: ' + dbError.message, 'danger');
        return;
    }

    if (existingIndex > -1) {
        inventory[existingIndex] = productData;
        showToast('Product updated successfully', 'success');
    } else {
        inventory.push(productData);
        showToast('New product added', 'success');
    }

    saveData();
    renderInventoryTable();
    renderLowStockAlerts();
    hideModal('modal-product');
}

function openEditProductModal(product) {
    document.getElementById('product-modal-title').textContent = 'Edit Product';
    document.getElementById('prod-name').value = product.name;
    document.getElementById('prod-sku').value = product.sku;
    document.getElementById('prod-sku').readOnly = true;
    document.getElementById('prod-category').value = product.category;
    document.getElementById('prod-price').value = product.price || '';
    document.getElementById('prod-stock').value = product.stock;
    showModal('modal-product');
}

// --- Stock Adjustment ---
function openAdjustmentModal(product) {
    currentProductForAdjustment = product;
    document.getElementById('adjustment-product-name').textContent = product.name;
    document.getElementById('adjustment-product-sku').textContent = `SKU: ${product.sku}`;
    document.getElementById('adjustment-qty').value = 1;
    document.getElementById('adjustment-note').value = '';
    showModal('modal-adjustment');
}

async function handleSaveAdjustment() {
    if (!currentProductForAdjustment) return;

    const qty = parseInt(document.getElementById('adjustment-qty').value);
    const type = document.querySelector('.type-btn.active').getAttribute('data-type');
    const note = document.getElementById('adjustment-note').value;

    if (isNaN(qty) || qty <= 0) {
        showToast('Invalid quantity', 'danger');
        return;
    }

    const product = inventory.find(p => p.sku === currentProductForAdjustment.sku);
    const oldStock = parseInt(product.stock);
    let newStock = oldStock;

    if (type === 'inward') {
        newStock += qty;
    } else {
        if (oldStock < qty) {
            showToast('Insufficient stock for outward adjustment', 'warning');
            return;
        }
        newStock -= qty;
    }

    // 1. Update product stock in Supabase
    const { error: prodError } = await supabase
        .from('products')
        .update({ stock: newStock })
        .eq('sku', product.sku);
        
    if (prodError) {
        showToast('Database error (stock update): ' + prodError.message, 'danger');
        return;
    }
    
    // 2. Insert history log in Supabase
    const historyLog = {
        timestamp: new Date().toISOString(),
        product_sku: product.sku,
        product_name: product.name,
        type: type,
        quantity: qty,
        old_balance: oldStock,
        new_balance: newStock,
        note: note,
        finalized: false
    };
    
    const { error: histError } = await supabase
        .from('history')
        .insert(historyLog);
        
    if (histError) {
        showToast('Database error (history log): ' + histError.message, 'danger');
    }

    product.stock = newStock;

    // Log to history locally
    history.push({
        timestamp: historyLog.timestamp,
        productSku: product.sku,
        productName: product.name,
        type: type,
        quantity: qty,
        oldBalance: oldStock,
        newBalance: newStock,
        note: note
    });

    saveData();
    renderInventoryTable();
    renderFullHistory();
    renderLowStockAlerts();
    hideModal('modal-adjustment');
    showToast(`Stock updated for ${product.name}`, 'success');
}

// --- Barcode Scanning ---
function setupGlobalBarcodeListener() {
    let barcode = '';
    let lastTime = 0;

    document.addEventListener('keydown', (e) => {
        // Most hardware scanners act like keyboards and end with 'Enter'
        const currentTime = new Date().getTime();
        
        if (currentTime - lastTime > 100) {
            barcode = '';
        }
        
        if (e.key === 'Enter') {
            if (barcode.length > 2) {
                handleBarcodeInput(barcode);
                barcode = '';
            }
        } else if (e.key.length === 1) {
            barcode += e.key;
        }
        
        lastTime = currentTime;
    });
}

function handleBarcodeInput(sku) {
    const product = inventory.find(p => p.sku === sku);
    if (product) {
        openAdjustmentModal(product);
        showToast(`Product identified: ${product.name}`, 'info');
    } else {
        showToast(`Unknown Barcode: ${sku}. Add it as a new product?`, 'warning');
        // Optionally auto-open add product modal with this SKU
        document.getElementById('product-modal-title').textContent = 'Add New Product';
        document.getElementById('product-form').reset();
        document.getElementById('prod-sku').value = sku;
        showModal('modal-product');
    }
}

function openQuickScan() {
    const sku = prompt('Please scan or enter Barcode/SKU:');
    if (sku) handleBarcodeInput(sku);
}

function startCameraScanner(targetId) {
    document.getElementById('scanner-container').style.display = 'block';
    html5QrCode = new Html5Qrcode("scanner-container");
    
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    html5QrCode.start(
        { facingMode: "environment" }, 
        config,
        (decodedText) => {
            document.getElementById(targetId).value = decodedText;
            html5QrCode.stop();
            document.getElementById('scanner-container').style.display = 'none';
            showToast('Barcode scanned successfully', 'success');
        },
        (errorMessage) => {
            // silent fail for frame capture
        }
    ).catch(err => {
        console.error(err);
        showToast('Camera access denied', 'danger');
    });
}

// --- Toasts ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'info';
    if (type === 'success') icon = 'check-circle';
    if (type === 'danger') icon = 'alert-circle';
    if (type === 'warning') icon = 'alert-triangle';

    toast.innerHTML = `
        <i data-lucide="${icon}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    initLucide();

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- CSV Export Abstractions ---
function exportInventoryToCSV() {
    if (inventory.length === 0) {
        showToast('No inventory data to export', 'warning');
        return;
    }
    
    const headers = ["sku", "name", "category", "price", "stock"];
    const rows = inventory.map(item => [
        item.sku,
        item.name,
        item.category,
        item.price || 0,
        item.stock || 0
    ]);
    
    const csvContent = [
        headers.join(","),
        ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `taruchhaya_inventory_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Inventory exported successfully', 'success');
}

function exportHistoryToCSV() {
    if (history.length === 0) {
        showToast('No movement history to export', 'warning');
        return;
    }
    
    const headers = ["Timestamp", "Product SKU", "Product Name", "Type", "Quantity", "Old Balance", "New Balance", "Note"];
    const rows = history.map(log => [
        new Date(log.timestamp).toLocaleString('en-IN'),
        log.productSku,
        log.productName,
        log.type,
        log.quantity,
        log.oldBalance,
        log.newBalance,
        log.note || ''
    ]);
    
    const csvContent = [
        headers.join(","),
        ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `taruchhaya_history_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Stock history exported successfully', 'success');
}
