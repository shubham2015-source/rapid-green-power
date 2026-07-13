let orders = [];
let dispatches = [];
let dyeingLots = [];
let productionLots = [];

const API_BASE = window.location.protocol === 'file:' || window.location.port === '3001'
  ? 'http://localhost:3001/api' 
  : '/api';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pending = o => Math.max(0, o.quantity - o.production - o.dispatched);
const status = o => pending(o) === 0 ? 'Complete' : 'Pending';

async function apiCall(endpoint, method = 'GET', body = null) {
  let isPhp = API_BASE.endsWith('.php');
  let url = '';
  
  if (isPhp) {
    if (endpoint === '/orders' && method === 'GET') {
      url = `${API_BASE}?action=list`;
    }
    else if (endpoint === '/orders' && method === 'POST') {
      url = `${API_BASE}?action=order`;
    }
    else if (endpoint === '/lots' && method === 'POST') {
      url = `${API_BASE}?action=lot`;
      body = {
        order_id: body.order_number, // frontend sends o.id (which is integer) as order_number
        lot_type: body.lot_type,
        lot_number: body.lot_number,
        entry_date: body.entry_date,
        quantity: body.quantity
      };
    }
    else if (endpoint === '/dispatches' && method === 'POST') {
      url = `${API_BASE}?action=dispatch`;
      body = {
        order_id: body.order_number, // frontend sends o.id as order_number
        dispatch_date: body.dispatch_date,
        quantity: body.quantity,
        reference_no: body.reference_no
      };
    }
    else if (endpoint.startsWith('/orders/') && method === 'DELETE') {
      let id = endpoint.split('/').pop();
      url = `${API_BASE}?action=delete`;
      method = 'POST';
      body = { id: +id };
    }
    else if (endpoint === '/orders/import' && method === 'POST') {
      url = `${API_BASE}?action=import`;
    }
  } else {
    url = `${API_BASE}${endpoint}`;
  }

  let options = { method };
  if (body) {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(body);
  }

  let res = await fetch(url, options);
  if (!res.ok) throw new Error('API Error');
  return res.json();
}

async function fetchData() {
    try {
        let isPhp = API_BASE.endsWith('.php');
        let ordersData = [], lotsData = [], dispatchesData = [];

        if (isPhp) {
            let data = await apiCall('/orders', 'GET');
            ordersData = data.orders || [];
            lotsData = data.lots || [];
            dispatchesData = data.dispatches || [];
        } else {
            const [ordersRes, lotsRes, dispatchesRes] = await Promise.all([
                fetch(`${API_BASE}/orders`),
                fetch(`${API_BASE}/lots`),
                fetch(`${API_BASE}/dispatches`)
            ]);
            ordersData = await ordersRes.json();
            lotsData = await lotsRes.json();
            dispatchesData = await dispatchesRes.json();
        }

        orders = ordersData;
        
        dyeingLots = lotsData.filter(l => l.lot_type === 'dyeing').map(l => ({ orderId: l.order_number, party: l.party, date: (l.entry_date||'').slice(0,10), lot: l.lot_number, quantity: l.quantity }));
        productionLots = lotsData.filter(l => l.lot_type === 'production').map(l => ({ orderId: l.order_number, party: l.party, date: (l.entry_date||'').slice(0,10), lot: l.lot_number, quantity: l.quantity }));
        dispatches = dispatchesData.map(d => ({ orderId: d.order_number || d.orderId, party: d.party, date: (d.dispatch_date||'').slice(0,10), quantity: d.quantity, reference: d.reference_no }));

        orders = orders.map(o => ({
            id: o.id,
            order_number: o.order_number,
            party: o.party,
            count: o.count_label || o.count || '',
            quality: o.quality,
            yarn: o.yarn,
            shade: o.shade,
            quantity: o.quantity,
            orderDate: (o.order_date || o.orderDate || '').slice(0,10),
            dueDate: (o.due_date || o.dueDate || '').slice(0,10),
            production: o.production || 0,
            dispatched: o.dispatched || 0
        }));

        renderUI();
    } catch (e) {
        console.error(e);
        toast('Error loading data from server');
    }
}

function today() { return new Date().toISOString().slice(0, 10); }
function dueText(o) {
    if (o.dueDate) {
        let days = Math.round((new Date(o.dueDate) - new Date(today())) / 86400000);
        return days < 0 ? `Overdue (${-days} days)` : days === 0 ? 'Due today' : `Due in ${days} days`;
    }
    let d = Math.round((new Date(today()) - new Date(o.orderDate)) / 86400000);
    return `${d} days passed`;
}
function parties() { return [...new Set(orders.map(o => o.party))].sort(); }

function fillSelects() {
    let options = '<option value="">All parties</option>' + parties().map(p => `<option>${esc(p)}</option>`).join('');
    $('#order-party').innerHTML = options;
    $('#report-party').innerHTML = options;
    let orderOptions = '<option value="">Choose an order</option>' + orders.filter(o => pending(o) > 0).map(o => `<option value="${o.id}">${o.order_number} · ${esc(o.party)} (${pending(o)} pending)</option>`).join('');
    $('#dispatch-order').innerHTML = orderOptions;
    $('#dyeing-order').innerHTML = orderOptions;
    $('#production-order').innerHTML = orderOptions;
}

function renderDashboard() {
    let total = orders.reduce((a, o) => a + o.quantity, 0), 
        prod = orders.reduce((a, o) => a + o.production, 0), 
        pend = orders.reduce((a, o) => a + Math.max(0, o.production - o.dispatched), 0);
        
    let overdueList = orders.filter(o => pending(o) && Math.round((new Date(today()) - new Date(o.orderDate)) / 86400000) > 30);
    
    $('#m-ordered').textContent = total.toLocaleString(); 
    $('#m-production').textContent = prod.toLocaleString(); 
    $('#m-pending').textContent = pend.toLocaleString(); 
    $('#m-overdue').textContent = overdueList.length;
    
    let rows = orders.filter(o => pending(o)).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')).slice(0, 5);
    $('#priority').innerHTML = rows.map(o => `<div class="dispatch-row"><div><b>${esc(o.party)}</b><br><small>${o.order_number} · ${esc(o.quality)} · ${esc(o.shade)}</small></div><div><b>${pending(o)} pending</b><br><small>${dueText(o)}</small></div></div>`).join('') || '<p>All orders are complete.</p>';
    
    if ($('#overdue-list')) {
        $('#overdue-list').innerHTML = overdueList.sort((a, b) => new Date(a.orderDate) - new Date(b.orderDate)).map(o => {
            let text = `Alert: Order ${o.order_number} for client *${o.party}* is pending for more than 30 days!\n\n*Order Details:*\nQuality: ${o.quality}\nShade: ${o.shade}\nOrdered: ${o.quantity}\nPending: ${pending(o)}\nOrder Date: ${o.orderDate}\nAge: ${Math.round((new Date(today()) - new Date(o.orderDate)) / 86400000)} days.\n\nPlease take immediate action.`;
            let waLink = `https://wa.me/917014146029?text=${encodeURIComponent(text)}`;
            return `<div class="dispatch-row" style="background:#fff5f2; border:1px solid #fddcd2; border-radius:6px; padding:12px; margin-bottom:10px;"><div><b>${esc(o.party)}</b><br><small>${o.order_number} · ${esc(o.quality)} · ${esc(o.shade)}</small></div><div style="text-align:right"><b>${pending(o)} pending</b><br><small style="color:#ae502f">${dueText(o)}</small><br><a href="${waLink}" target="_blank" style="display:inline-block; margin-top:8px; padding:6px 12px; background:#25D366; color:white; text-decoration:none; border-radius:4px; font-weight:bold; font-size:12px;">Send WhatsApp</a></div></div>`;
        }).join('') || '<p>No overdue orders > 30 days.</p>';
    }
}

function renderOrders() {
    let party = $('#order-party').value, stat = $('#order-status').value, date = $('#order-date').value;
    let list = orders.filter(o => (!party || o.party === party) && (!stat || status(o) === stat) && (!date || o.orderDate === date));
    $('#orders-body').innerHTML = list.map(o => `<tr><td><b>${o.order_number}</b><br><small>${o.orderDate} &middot; ${dueText(o)}</small></td><td>${esc(o.party)}</td><td>${esc(o.quality)}<br><small>${esc(o.shade)} · ${o.yarn} kg</small></td><td>${o.quantity}</td><td>${o.production}</td><td>${o.dispatched}</td><td><b>${pending(o)}</b></td><td><span class="pill ${status(o).toLowerCase()}">${status(o)}</span></td><td><button class="quiet" style="color:#ae502f;padding:6px" data-order-id="${o.id}">Delete</button></td></tr>`).join('') || '<tr><td colspan="9">No orders match these filters.</td></tr>';
    document.querySelectorAll('[data-order-id]').forEach(b => b.onclick = () => deleteOrder(b.dataset.orderId));
}

function renderDispatches() {
    let list = [...dispatches].reverse();
    $('#dispatch-list').innerHTML = list.map(d => `<div class="dispatch-row"><div><b>${esc(d.party)}</b><br><small>${d.orderId} · ${d.date}${d.reference ? ' · ' + esc(d.reference) : ''}</small></div><b>${d.quantity} pcs</b></div>`).join('') || '<p>No dispatches recorded yet.</p>';
}

function renderLots(list, id, label) {
    $('#' + id).innerHTML = [...list].reverse().map(x => `<div class="dispatch-row"><div><b>${esc(x.party)}</b><br><small>${x.orderId} · Lot ${x.lot} · ${x.date}</small></div><b>${x.quantity} pcs</b></div>`).join('') || `<p>No ${label} entries recorded yet.</p>`;
}

function renderUI() {
    fillSelects(); renderDashboard(); renderOrders(); renderDispatches(); renderLots(dyeingLots, 'dyeing-list', 'dyeing'); renderLots(productionLots, 'production-list', 'production');
}

function toast(t) { let n = $('#toast'); n.textContent = t; n.classList.add('show'); setTimeout(() => n.classList.remove('show'), 2400); }

async function deleteOrder(id) {
    if (!confirm(`Delete order ${id}? This will also delete its related entries.`)) return;
    try {
        await apiCall(`/orders/${id}`, 'DELETE');
        toast('Order deleted');
        await fetchData();
    } catch(e) { toast('Error deleting'); }
}

document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
    let v = b.dataset.view; document.querySelectorAll('.view').forEach(x => x.classList.add('hidden')); $('#' + v).classList.remove('hidden'); document.querySelectorAll('.nav').forEach(x => x.classList.toggle('active', x.dataset.view === v)); $('#page-title').textContent = ({ dashboard: 'Order overview', orders: 'Order register', 'new-order': 'Create a new order', dyeing: 'Dyeing lots', production: 'Production lots', dispatch: 'Dispatch goods', reports: 'Reports & PDFs' })[v]; window.scrollTo({ top: 0, behavior: 'smooth' });
}));

['#order-party', '#order-status', '#order-date'].forEach(s => $(s).addEventListener('change', renderOrders)); $('#clear-orders').onclick = () => { $('#order-party').value = ''; $('#order-status').value = ''; $('#order-date').value = ''; renderOrders(); };

$('#order-form').addEventListener('submit', async e => {
    e.preventDefault();
    let d = Object.fromEntries(new FormData(e.target));
    let o = { party: d.party.trim(), count_label: d.count, quality: d.quality.trim(), yarn: +d.yarn, shade: d.shade.trim(), quantity: +d.quantity, order_date: d.orderDate, due_date: d.dueDate };
    try {
        await apiCall('/orders', 'POST', o);
        e.target.reset(); $('#order-form [name=orderDate]').value = today(); toast('New order saved');
        await fetchData();
    } catch(err) { toast('Error saving order'); }
});

$('#dispatch-form').addEventListener('submit', async e => {
    e.preventDefault();
    let d = Object.fromEntries(new FormData(e.target));
    let payload = { order_number: d.orderId, dispatch_date: d.dispatchDate, quantity: +d.quantity, reference_no: d.reference };
    try {
        await apiCall('/dispatches', 'POST', payload);
        e.target.reset(); $('#dispatch-form [name=dispatchDate]').value = today(); toast('Dispatch recorded');
        await fetchData();
    } catch(err) { toast(err.message || 'Error saving dispatch'); }
});

function lotEntry(formId, lotType, label) {
    $(formId).addEventListener('submit', async e => {
        e.preventDefault();
        let d = Object.fromEntries(new FormData(e.target));
        let payload = { order_number: d.orderId, lot_type: lotType, lot_number: +d.lot, entry_date: d.entryDate, quantity: +d.quantity };
        try {
            await apiCall('/lots', 'POST', payload);
            e.target.reset(); $(formId + ' [name=entryDate]').value = today(); toast(label + ' recorded');
            await fetchData();
        } catch(err) { toast(err.message || 'Error saving lot'); }
    });
}
lotEntry('#dyeing-form', 'dyeing', 'Dyeing lot');
lotEntry('#production-form', 'production', 'Production lot');

function filtered() {
    let party = $('#report-party').value, from = $('#report-from').value, to = $('#report-to').value;
    return orders.filter(o => (!party || o.party === party) && (!from || o.orderDate >= from) && (!to || o.orderDate <= to));
}

function printReport(type) {
    let list = filtered(), title = type + ' report', rows;
    if (type === 'Dispatch') {
        let party = $('#report-party').value, from = $('#report-from').value, to = $('#report-to').value;
        rows = dispatches.filter(d => (!party || d.party === party) && (!from || d.date >= from) && (!to || d.date <= to)).map(d => `<tr><td>${d.date}</td><td>${esc(d.orderId)}</td><td>${esc(d.party)}</td><td>${d.quantity}</td><td>${esc(d.reference || '—')}</td></tr>`);
        var head = '<th>Date</th><th>Order</th><th>Party</th><th>Quantity</th><th>Reference</th>';
    } else {
        let subset = type === 'Pending' ? list.filter(o => pending(o) > 0) : type === 'Complete' ? list.filter(o => !pending(o)) : list;
        rows = subset.map(o => `<tr><td>${esc(o.order_number)}</td><td>${esc(o.orderDate)}</td><td>${dueText(o)}</td><td>${esc(o.party)}</td><td>${esc(o.quality)} / ${esc(o.shade)}</td><td>${o.yarn}</td><td>${o.quantity}</td><td>${o.production}</td><td>${o.dispatched}</td><td>${pending(o)}</td></tr>`);
        var head = '<th>Order</th><th>Date</th><th>Due Date / Age</th><th>Party</th><th>Quality / shade</th><th>Yarn (kg)</th><th>Ordered</th><th>Production</th><th>Dispatched</th><th>Pending</th>';
    }
    let w = window.open('', '_blank'); w.document.write(`<!doctype html><title>${title}</title><style>body{font:13px Arial;color:#192927;margin:40px}h1{font:28px Georgia;margin:0}p{color:#567}table{border-collapse:collapse;width:100%;margin-top:28px}th{background:#173d3a;color:#fff;text-align:left}th,td{padding:10px;border:1px solid #ccd8d4}footer{margin-top:22px;color:#567;font-size:11px}</style><h1>Rapid Green Power Pvt. Ltd.</h1><p>${title} · Generated ${new Date().toLocaleString()}</p><table><thead><tr>${head}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${type === 'Dispatch' ? 5 : 10}">No records found.</td></tr>`}</tbody></table><footer>Filter: ${esc($('#report-party').value || 'All parties')} · ${esc($('#report-from').value || 'All dates')} to ${esc($('#report-to').value || 'Today')}</footer><script>window.onload=()=>window.print()<\/script>`); w.document.close();
}

$('#pending-pdf').onclick = () => printReport('Pending'); $('#complete-pdf').onclick = () => printReport('Complete'); $('#dispatch-pdf').onclick = () => printReport('Dispatch'); $('#all-pdf').onclick = () => printReport('All orders');

$('#import-excel').onclick = () => $('#excel-file').click();
$('#excel-file').onchange = async e => {
    let f = e.target.files[0];
    if(!f || !window.XLSX) return toast('Excel import needs internet on first use');
    try {
        let wb = XLSX.read(await f.arrayBuffer(), {type: 'array', cellDates: true});
        let r = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1, defval: ''});
        let i = r.findIndex(x => x.some(v => String(v).trim().toUpperCase() === 'PARTY NAME' || String(v).trim().toUpperCase() === 'PARTY'));
        if(i < 0) throw Error('PARTY NAME or PARTY header not found');
        
        let h = r[i].map(x => String(x).trim().toUpperCase());
        
        // Helper to find header with synonyms
        let findHeader = (synonyms) => {
            for (let syn of synonyms) {
                let idx = h.indexOf(syn.toUpperCase());
                if (idx >= 0) return idx;
            }
            return -1;
        };

        let partyIdx = findHeader(['PARTY NAME', 'PARTY', 'CLIENT']);
        let quantityIdx = findHeader(['ORDER QUANTITY', 'ORDER QTY', 'QUANTITY', 'QTY', 'PCS']);
        let dateIdx = findHeader(['ORDER DATE', 'DATE']);
        let shadeIdx = findHeader(['SHADE NO', 'SHADE', 'SHADE NO.']);
        let yarnIdx = findHeader(['YARN USED (KG)', 'YARN']);
        let countIdx = findHeader(['COUNT']);
        let qualityIdx = findHeader(['QUALITY']);
        let productionIdx = findHeader(['TOTAL QUANTITY', 'PRODUCTION']);
        
        let d = v => v instanceof Date ? v.toISOString().slice(0, 10) : String(v || today()).slice(0, 10);
        
        let rows = r.slice(i + 1).map(x => {
            let partyVal = partyIdx >= 0 ? String(x[partyIdx] ?? '').trim() : '';
            let qtyVal = quantityIdx >= 0 ? +x[quantityIdx] || 0 : 0;
            return {
                party: partyVal,
                count_label: countIdx >= 0 ? x[countIdx] : '',
                quality: qualityIdx >= 0 ? x[qualityIdx] : '',
                yarn: yarnIdx >= 0 ? +x[yarnIdx] || 0 : 0,
                shade: shadeIdx >= 0 ? x[shadeIdx] : '',
                quantity: qtyVal,
                order_date: dateIdx >= 0 ? d(x[dateIdx]) : today(),
                production: productionIdx >= 0 ? +x[productionIdx] || 0 : 0,
                dispatched: +x[19] || 0 // Keep default behavior for column T
            };
        }).filter(x => x.party && x.quantity);
        
        await apiCall('/orders/import', 'POST', { rows });
        toast('Orders imported. Existing data kept.');
        await fetchData();
    } catch(x) { toast(x.message); } finally { e.target.value = ''; }
};

$('#export-excel').onclick = () => {
    if(!window.XLSX) return toast('Excel export needs internet on first use');
    let wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(orders), 'Orders');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dispatches), 'Dispatches');
    XLSX.writeFile(wb, 'ThreadFlow_Export_' + today() + '.xlsx');
};
$('#today').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
if ($('#current-month-year')) $('#current-month-year').textContent = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
$('#order-form [name=orderDate]').value = today(); $('#dispatch-form [name=dispatchDate]').value = today(); $('#dyeing-form [name=entryDate]').value = today(); $('#production-form [name=entryDate]').value = today();

fetchData();
