/**
 * script.js - Premium SaaS Freelance Planner
 * Modular, perfectly reactive, 0 dependencies.
 */

const MONTHS = ['July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March', 'April', 'May', 'June'];

// ==========================================
// 1. STATE MANAGEMENT
// ==========================================
const formatMoney = (num) => {
    if (num > 100000000) return '10Cr+';
    if (num >= 10000000) return (num / 10000000).toLocaleString('en-IN', {maximumFractionDigits: 2}) + ' Cr';
    if (num >= 100000) return (num / 100000).toLocaleString('en-IN', {maximumFractionDigits: 2}) + ' L';
    return num.toLocaleString('en-IN', {maximumFractionDigits: 0});
};

const State = {
    theme: 'dark',
    goals: { yearly: 90000, trip: 30000, phone: 60000, emergency: 15000 },
    guaranteed: 0,
    progType: 'equal', // equal, progressive, manual
    progCurve: 'medium',
    projects: [],
    manualValues: Array(12).fill(0),
    
    // Computed outputs
    monthlyData: [], // Array of 12 month objects
    isGenerated: false, // Track if the full report has been generated once
    isPrinting: false // Track if we are currently generating a print layout
};

// ==========================================
// 2. DOM ELEMENTS
// ==========================================
const DOM = {
    // Inputs
    inpGoal: document.getElementById('inpGoal'),
    inpTrip: document.getElementById('inpTrip'),
    inpPhone: document.getElementById('inpPhone'),
    inpEmergency: document.getElementById('inpEmergency'),
    inpGuaranteed: document.getElementById('inpGuaranteed'),
    inpCurveSpeed: document.getElementById('inpCurveSpeed'),
    radiosProg: document.getElementsByName('progType'),
    
    // Panes
    progPanes: {
        equal: document.getElementById('progEqual'),
        progressive: document.getElementById('progProgressive'),
        manual: document.getElementById('progManual')
    },
    autoEqualAmount: document.getElementById('autoEqualAmount'),
    
    // Projects
    projectList: document.getElementById('projectList'),
    btnAddProject: document.getElementById('btnAddProject'),
    
    // KPIs & Hero
    heroTotal: document.getElementById('heroTotal'),
    heroGoal: document.getElementById('heroGoal'),
    heroPct: document.getElementById('heroPct'),
    kpiGuaranteed: document.getElementById('kpiGuaranteed'),
    kpiExtra: document.getElementById('kpiExtra'),
    kpiOneTime: document.getElementById('kpiOneTime'),
    kpiRemaining: document.getElementById('kpiRemaining'),
    kpiAvgMonth: document.getElementById('kpiAvgMonth'),
    kpiAvgWeek: document.getElementById('kpiAvgWeek'),
    
    // Generate Button & Content
    btnGenerate: document.getElementById('btnGenerate'),
    generatedContent: document.getElementById('generatedContent'),
    
    // Scenarios & Progress
    scenBadge: document.getElementById('scenBadge'),
    scenDesc: document.getElementById('scenDesc'),
    progress: {
        goal: { txt: document.getElementById('progTxtGoal'), fill: document.getElementById('progFillGoal') },
        trip: { txt: document.getElementById('progTxtTrip'), fill: document.getElementById('progFillTrip') },
        phone: { txt: document.getElementById('progTxtPhone'), fill: document.getElementById('progFillPhone') },
        emerg: { txt: document.getElementById('progTxtEmergency'), fill: document.getElementById('progFillEmergency') }
    },
    
    // Report & Breakdown
    reportText: document.getElementById('reportText'),
    monthlyCardsGrid: document.getElementById('monthlyCardsGrid'),
    tableBody: document.getElementById('tableBody'),
    
    // Charts
    charts: {
        bar: document.getElementById('chartBar'),
        line: document.getElementById('chartLine'),
        pie: document.getElementById('chartPie')
    },

    // Extras
    themeToggle: document.getElementById('themeToggle'),
    btnCopyReport: document.getElementById('btnCopyReport'),
    btnCsv: document.getElementById('btnCsv'),
    btnJson: document.getElementById('btnJson')
};

// ==========================================
// 3. CALCULATOR ENGINE
// ==========================================
const Calculator = {
    run() {
        State.monthlyData = [];
        let runningTotal = 0;
        
        // 1. Sum up all one-time projects
        let oneTimeSums = Array(12).fill(0);
        State.projects.forEach(p => {
            if(p.month >= 0 && p.month < 12) oneTimeSums[p.month] += p.amount;
        });
        let totalOneTime = oneTimeSums.reduce((a,b)=>a+b, 0);
        
        // 2. Calculate remaining required for Goal
        let totalGuaranteed = State.guaranteed * 12;
        let remainingForGoal = Math.max(0, State.goals.yearly - totalGuaranteed - totalOneTime);
        
        // 3. Calculate Extra Income Distribution
        let extraDist = this.calculateDistribution(remainingForGoal);
        
        // Update the Equal UI helper
        if(State.progType === 'equal') {
            let eqAmt = Math.round(remainingForGoal/12);
            DOM.autoEqualAmount.innerText = eqAmt > 100000000 ? "ERROR: MATH.TOO_BIG()" : `₹${formatMoney(eqAmt)}`;
        }
        
        // 4. Build monthly data
        for(let i=0; i<12; i++) {
            let guaranteed = State.guaranteed;
            let extra = extraDist[i];
            let oneTime = oneTimeSums[i];
            let total = guaranteed + extra + oneTime;
            runningTotal += total;
            
            State.monthlyData.push({
                month: MONTHS[i],
                guaranteed,
                extra,
                oneTime,
                total,
                runningTotal,
                remaining: Math.max(0, State.goals.yearly - runningTotal)
            });
        }
    },

    calculateDistribution(remainingGoal) {
        let dist = Array(12).fill(0);
        
        if (State.progType === 'manual') {
            return [...State.manualValues];
        } 
        
        if (remainingGoal <= 0) return dist;

        if (State.progType === 'equal') {
            let equalAmt = Math.round(remainingGoal / 12);
            // Handle rounding
            dist.fill(equalAmt);
            let diff = remainingGoal - (equalAmt * 12);
            dist[11] += diff; 
            return dist;
        }

        if (State.progType === 'progressive') {
            // Generate a smooth curve based on speed
            let power = 1;
            switch(State.progCurve) {
                case 'very_slow': power = 0.5; break;
                case 'slow': power = 0.8; break;
                case 'medium': power = 1.3; break;
                case 'fast': power = 2.0; break;
                case 'aggressive': power = 3.5; break;
            }
            
            let weights = [];
            let weightSum = 0;
            // Add a small base weight so month 1 isn't 0
            const baseWeight = 0.2; 
            
            for(let i=0; i<12; i++) {
                let normalizedX = i / 11; // 0 to 1
                let w = Math.pow(normalizedX, power) + baseWeight;
                weights.push(w);
                weightSum += w;
            }
            
            let currentSum = 0;
            for(let i=0; i<12; i++) {
                if (i === 11) {
                    dist[i] = remainingGoal - currentSum; // sweep rounding
                } else {
                    let val = Math.round((weights[i] / weightSum) * remainingGoal);
                    dist[i] = val;
                    currentSum += val;
                }
            }
            
            // Force monotonicity (never decrease)
            for(let i=1; i<12; i++) {
                if(dist[i] < dist[i-1]) {
                    // Shift the difference forward
                    let diff = dist[i-1] - dist[i];
                    dist[i] = dist[i-1];
                    if(i < 11) dist[i+1] -= diff;
                }
            }
            return dist;
        }
    }
};

// ==========================================
// 4. UI RENDERER
// ==========================================
const UI = {
    updateAll() {
        Calculator.run();
        this.updateKPIs();
        this.renderProjects(false);
        this.renderMonthlyCards();
        
        // If generated, update the rest
        if(State.isGenerated) {
            this.renderTable();
            this.updateScenarios();
            this.updateProgressBars();
            this.generateReport();
            Charts.drawAll();
        }
    },

    updateKPIs() {
        const finalData = State.monthlyData[11];
        if(!finalData) return;

        let sumG = State.monthlyData.reduce((acc, d) => acc + d.guaranteed, 0);
        let sumE = State.monthlyData.reduce((acc, d) => acc + d.extra, 0);
        let sumO = State.monthlyData.reduce((acc, d) => acc + d.oneTime, 0);
        let total = finalData.runningTotal;
        let goal = State.goals.yearly;
        
        // Hero
        this.animateValue(DOM.heroTotal, total, "");
        DOM.heroGoal.innerText = `₹${formatMoney(goal)}`;
        
        let pct = goal > 0 ? (total / goal) * 100 : 0;
        DOM.heroPct.innerText = `${pct.toFixed(1)}%`;
        
        // Colors
        DOM.heroPct.className = pct >= 100 ? 'status-success' : (pct < 50 ? 'status-danger' : 'status-neutral');

        // Cards
        DOM.kpiGuaranteed.innerText = `₹${formatMoney(sumG)}`;
        DOM.kpiExtra.innerText = `₹${formatMoney(sumE)}`;
        DOM.kpiOneTime.innerText = `₹${formatMoney(sumO)}`;
        
        let rem = Math.max(0, goal - total);
        DOM.kpiRemaining.innerText = `₹${formatMoney(rem)}`;
        DOM.kpiAvgMonth.innerText = `₹${formatMoney(Math.ceil(rem / 12))}`;
        DOM.kpiAvgWeek.innerText = `₹${formatMoney(Math.ceil(rem / 52))}`;

        // Easter Egg for > 10 Cr
        const heroLabel = document.querySelector('.hero-label');
        if (goal > 100000000 || total > 100000000) {
            heroLabel.innerText = "ARE YOU ELON MUSK?";
            DOM.btnGenerate.disabled = true;
            DOM.btnGenerate.innerText = "Goal Too High (Seek Divine Blessing 🙏)";
            DOM.btnGenerate.style.opacity = "0.5";
            DOM.btnGenerate.style.cursor = "not-allowed";
        } else {
            heroLabel.innerText = "PROJECTED YEARLY INCOME";
            DOM.btnGenerate.disabled = false;
            DOM.btnGenerate.innerText = "Generate Financial Plan";
            DOM.btnGenerate.style.opacity = "1";
            DOM.btnGenerate.style.cursor = "pointer";
        }
    },

    renderProjects(forceRebuild = false) {
        if (!forceRebuild && DOM.projectList.children.length === State.projects.length) return;
        DOM.projectList.innerHTML = '';
        State.projects.forEach((p, idx) => {
            const div = document.createElement('div');
            div.className = 'proj-item';
            
            let mOpts = MONTHS.map((m, i) => `<option value="${i}" ${p.month === i ? 'selected' : ''}>${m}</option>`).join('');
            
            div.innerHTML = `
                <input type="text" value="${p.name}" class="p-name" data-idx="${idx}" placeholder="Project Name">
                <input type="number" value="${p.amount}" class="p-amount" data-idx="${idx}" min="0">
                <select class="p-month" data-idx="${idx}">${mOpts}</select>
                <button class="btn-icon text-danger p-del" data-idx="${idx}">
                    <svg width="18" height="18" viewBox="0 0 24 24" stroke="#ff453a" stroke-width="2" fill="none"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            `;
            DOM.projectList.appendChild(div);
        });

        // Bind inner project events
        document.querySelectorAll('.p-name').forEach(el => el.addEventListener('input', e => { State.projects[e.target.dataset.idx].name = e.target.value; }));
        document.querySelectorAll('.p-amount').forEach(el => el.addEventListener('input', e => { State.projects[e.target.dataset.idx].amount = parseFloat(e.target.value)||0; UI.updateAll(); }));
        document.querySelectorAll('.p-month').forEach(el => el.addEventListener('change', e => { State.projects[e.target.dataset.idx].month = parseInt(e.target.value); UI.updateAll(); }));
        document.querySelectorAll('.p-del').forEach(el => el.addEventListener('click', e => { State.projects.splice(e.currentTarget.dataset.idx, 1); UI.renderProjects(true); UI.updateAll(); }));
    },

    renderMonthlyCards() {
        const isManual = State.progType === 'manual';
        
        if (DOM.monthlyCardsGrid.children.length !== 12 || DOM.monthlyCardsGrid.dataset.mode !== State.progType) {
            DOM.monthlyCardsGrid.innerHTML = '';
            DOM.monthlyCardsGrid.dataset.mode = State.progType;
            
            State.monthlyData.forEach((d, i) => {
                const card = document.createElement('div');
                card.className = 'month-card';
                
                let extraHTML = isManual 
                    ? `<input type="number" class="mc-input m-manual" data-idx="${i}" value="${State.manualValues[i]}">`
                    : `<strong class="mc-value m-extra">₹${formatMoney(d.extra)}</strong>`;

                card.innerHTML = `
                    <div class="mc-header">${d.month}</div>
                    <div class="mc-row"><span class="mc-label">Guaranteed</span> <strong class="mc-value m-guaranteed">₹${formatMoney(d.guaranteed)}</strong></div>
                    <div class="mc-row"><span class="mc-label">Extra Target</span> ${extraHTML}</div>
                    <div class="mc-row"><span class="mc-label">One-Time</span> <strong class="mc-value m-onetime">₹${formatMoney(d.oneTime)}</strong></div>
                    <div class="mc-row total"><span class="mc-label">Month Total</span> <span class="m-total">₹${formatMoney(d.total)}</span></div>
                    <div class="mc-row"><span class="mc-label">Running</span> <span class="m-running">₹${formatMoney(d.runningTotal)}</span></div>
                `;
                DOM.monthlyCardsGrid.appendChild(card);
            });

            if(isManual) {
                document.querySelectorAll('.m-manual').forEach(el => {
                    el.addEventListener('input', e => {
                        State.manualValues[e.target.dataset.idx] = parseFloat(e.target.value) || 0;
                        UI.updateAll();
                    });
                });
            }
        } else {
            // Update without losing focus
            const cards = DOM.monthlyCardsGrid.children;
            State.monthlyData.forEach((d, i) => {
                const card = cards[i];
                card.querySelector('.m-guaranteed').innerText = `₹${formatMoney(d.guaranteed)}`;
                if (!isManual) card.querySelector('.m-extra').innerText = `₹${formatMoney(d.extra)}`;
                card.querySelector('.m-onetime').innerText = `₹${formatMoney(d.oneTime)}`;
                card.querySelector('.m-total').innerText = `₹${formatMoney(d.total)}`;
                card.querySelector('.m-running').innerText = `₹${formatMoney(d.runningTotal)}`;
            });
        }
    },

    renderTable() {
        DOM.tableBody.innerHTML = '';
        State.monthlyData.forEach(d => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${d.month}</strong></td>
                <td>₹${formatMoney(d.guaranteed)}</td>
                <td>₹${formatMoney(d.extra)}</td>
                <td>₹${formatMoney(d.oneTime)}</td>
                <td><strong>₹${formatMoney(d.total)}</strong></td>
                <td>₹${formatMoney(d.runningTotal)}</td>
                <td>₹${formatMoney(d.remaining)}</td>
            `;
            DOM.tableBody.appendChild(tr);
        });
    },

    updateScenarios() {
        let total = State.monthlyData[11].runningTotal;
        let goal = State.goals.yearly;
        let pct = goal > 0 ? total / goal : 0;
        
        let sClass = '', text = '', badge = '';

        if (goal > 100000000 || total > 100000000) {
            badge = "LUDICROUS"; sClass = "status-danger";
            text = "You either need a better software, an enterprise accounting firm, or a divine blessing from above to manage this much money. We cap at 10 Crores!";
        } else if(pct >= 1) {
            badge = "Excellent"; sClass = "status-success";
            text = `You have achieved your financial plan! You project a surplus of ₹${(total-goal).toLocaleString()}. No further income is strictly necessary to meet baseline goals.`;
        } else if (pct >= 0.8) {
            badge = "Good"; sClass = "text-primary";
            text = `Very solid plan. You are projecting to hit ${Math.round(pct*100)}% of your goal. You only need to find an extra ₹${Math.round((goal-total)/12).toLocaleString()}/month to close the gap.`;
        } else if (pct >= 0.5) {
            badge = "Average"; sClass = "status-neutral";
            text = `You are halfway there. You currently project ₹${total.toLocaleString()}, leaving a gap of ₹${(goal-total).toLocaleString()}. Consider aggressively increasing your extra monthly targets.`;
        } else {
            badge = "Bad"; sClass = "status-danger";
            text = `Warning: Your current plan only covers ${Math.round(pct*100)}% of your yearly goal. A significant strategy adjustment is required.`;
        }

        DOM.scenBadge.innerText = badge;
        DOM.scenBadge.className = `scenario-badge ${sClass}`;
        DOM.scenBadge.style.backgroundColor = 'rgba(255,255,255,0.1)'; // Keep glass look
        DOM.scenDesc.innerText = text;
    },

    updateProgressBars() {
        let total = State.monthlyData[11].runningTotal;
        
        const setBar = (obj, target) => {
            let pct = target > 0 ? Math.min(100, (total/target)*100) : 0;
            obj.txt.innerText = `${pct.toFixed(1)}%`;
            obj.fill.style.width = `${pct}%`;
            
            // Reset classes
            obj.fill.classList.remove('fill-primary', 'fill-secondary', 'fill-success');
            if(pct >= 100) obj.fill.classList.add('fill-success');
            else obj.fill.classList.add('fill-primary');
        };

        setBar(DOM.progress.goal, State.goals.yearly);
        setBar(DOM.progress.trip, State.goals.trip);
        setBar(DOM.progress.phone, State.goals.phone);
        setBar(DOM.progress.emerg, State.goals.emergency);
    },

    generateReport() {
        let sumG = State.monthlyData.reduce((a,b)=>a+b.guaranteed, 0);
        let sumE = State.monthlyData.reduce((a,b)=>a+b.extra, 0);
        let sumO = State.monthlyData.reduce((a,b)=>a+b.oneTime, 0);
        let total = State.monthlyData[11].runningTotal;
        let goal = State.goals.yearly;
        let diff = total - goal;

        let txt = `Executive Financial Summary
=============================================

Projected Income Breakdown:
- Guaranteed Base : ₹${State.guaranteed} × 12 = ₹${formatMoney(sumG)}
- Extra Target    : ₹${formatMoney(sumE)} (${State.progType} distribution)
- One-Time Inputs : ₹${formatMoney(sumO)}

Total Projected   : ₹${formatMoney(total)}
Yearly Goal       : ₹${formatMoney(goal)}
Difference        : ${diff >= 0 ? '+' : ''}₹${formatMoney(diff)}
Goal Achieved     : ${diff >= 0 ? 'YES' : 'NO'}

Allocations:
- Trip Budget     : ₹${formatMoney(State.goals.trip)}
- Phone Budget    : ₹${formatMoney(State.goals.phone)}
- Emergency Fund  : ₹${formatMoney(State.goals.emergency)}

Analysis:
${DOM.scenDesc.innerText}
`;
        DOM.reportText.innerText = txt;
    },

    animateValue(obj, end, prefix="") {
        // A simple number counter animation
        if(obj.animationFrameId) window.cancelAnimationFrame(obj.animationFrameId);
        let startTimestamp = null;
        const duration = 1000;
        const start = parseInt(obj.innerText.replace(/[^0-9]/g, '')) || 0;
        
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            // Ease out cubic
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            const current = Math.floor(easeProgress * (end - start) + start);
            obj.innerText = `${prefix}${formatMoney(current)}`;
            if (progress < 1) {
                obj.animationFrameId = window.requestAnimationFrame(step);
            } else {
                obj.innerText = `${prefix}${formatMoney(end)}`;
            }
        };
        obj.animationFrameId = window.requestAnimationFrame(step);
    }
};

// ==========================================
// 5. CANVAS CHARTS ENGINE
// ==========================================
const Charts = {
    drawAll() {
        if(!State.monthlyData.length) return;
        this.drawBar(DOM.charts.bar);
        this.drawLine(DOM.charts.line);
        this.drawPie(DOM.charts.pie);
    },
    
    getColors() {
        const isDark = State.theme === 'dark' && !State.isPrinting;
        return {
            text: isDark ? '#a1a1a6' : '#1d1d1f',
            grid: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.1)',
            primary: '#0a84ff',
            success: '#32d74b',
            warning: '#ffd60a',
            danger: '#ff453a'
        };
    },

    drawBar(canvas) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        const pad = {x: 40, y: 30};
        const colors = this.getColors();
        
        ctx.clearRect(0,0,w,h);
        
        let max = Math.max(...State.monthlyData.map(d => d.total));
        max = max <= 0 ? 100 : max * 1.1;

        const barW = (w - pad.x*2) / 12 - 10;
        
        State.monthlyData.forEach((d, i) => {
            let x = pad.x + i * (w - pad.x*2)/12 + 5;
            let barH = (d.total / max) * (h - pad.y*2);
            let y = h - pad.y - barH;
            
            // Draw Gradient Bar
            let grad = ctx.createLinearGradient(0, y, 0, h-pad.y);
            grad.addColorStop(0, colors.primary);
            grad.addColorStop(1, 'rgba(10, 132, 255, 0.2)');
            
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.roundRect(x, y, barW, barH, [4, 4, 0, 0]);
            ctx.fill();
            
            // Label
            ctx.fillStyle = colors.text;
            ctx.font = '12px Inter';
            ctx.textAlign = 'center';
            ctx.fillText(d.month.substring(0,3), x + barW/2, h - 10);
        });
    },

    drawLine(canvas) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        const pad = {x: 40, y: 30};
        const colors = this.getColors();
        
        ctx.clearRect(0,0,w,h);
        
        let max = Math.max(State.monthlyData[11].runningTotal, State.goals.yearly);
        max = max <= 0 ? 100 : max * 1.1;

        // Grid lines
        ctx.strokeStyle = colors.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for(let i=0; i<=4; i++) {
            let y = pad.y + i*((h-pad.y*2)/4);
            ctx.moveTo(pad.x, y); ctx.lineTo(w, y);
        }
        ctx.stroke();

        // Goal Line (Dashed)
        let goalY = h - pad.y - ((State.goals.yearly / max) * (h - pad.y*2));
        ctx.strokeStyle = colors.danger;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(pad.x, goalY); ctx.lineTo(w, goalY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Line
        ctx.strokeStyle = colors.success;
        ctx.lineWidth = 3;
        ctx.beginPath();
        
        State.monthlyData.forEach((d, i) => {
            let x = pad.x + i * ((w - pad.x) / 11);
            let y = h - pad.y - ((d.runningTotal / max) * (h - pad.y*2));
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            
            ctx.fillStyle = colors.text;
            ctx.font = '12px Inter';
            ctx.textAlign = 'center';
            ctx.fillText(d.month.substring(0,3), x, h - 10);
        });
        ctx.stroke();
    },

    drawPie(canvas) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        const colors = this.getColors();
        
        ctx.clearRect(0,0,w,h);
        
        let sumG = State.monthlyData.reduce((a,b)=>a+b.guaranteed, 0);
        let sumE = State.monthlyData.reduce((a,b)=>a+b.extra, 0);
        let sumO = State.monthlyData.reduce((a,b)=>a+b.oneTime, 0);
        let tot = sumG + sumE + sumO;
        if(tot === 0) return;

        let cx = w/2, cy = h/2, r = Math.min(cx, cy) - 20;
        let angles = [ (sumG/tot)*Math.PI*2, (sumE/tot)*Math.PI*2, (sumO/tot)*Math.PI*2 ];
        let sliceColors = [colors.primary, colors.success, colors.warning];
        
        let startAngle = -Math.PI/2;
        for(let i=0; i<3; i++) {
            ctx.fillStyle = sliceColors[i];
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r, startAngle, startAngle + angles[i]);
            ctx.fill();
            startAngle += angles[i];
        }
        
        // Donut hole
        ctx.fillStyle = State.theme === 'dark' ? '#000000' : '#f5f5f7';
        // Adjust for glassmorphism blending, we'll just clear out the center
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(cx, cy, r*0.65, 0, Math.PI*2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
    }
};

// ==========================================
// 6. EVENT BINDING & INIT
// ==========================================
function bindEvents() {
    // Top-level inputs trigger instant recalculation
    const inputs = [DOM.inpGoal, DOM.inpTrip, DOM.inpPhone, DOM.inpEmergency, DOM.inpGuaranteed, DOM.inpCurveSpeed];
    inputs.forEach(el => {
        el.addEventListener('input', e => {
            updateStateFromDOM();
            UI.updateAll();
        });
    });

    // Progression Type Radios
    DOM.radiosProg.forEach(r => {
        r.addEventListener('change', e => {
            State.progType = e.target.value;
            // UI Toggle Panes
            Object.values(DOM.progPanes).forEach(p => p.classList.remove('active'));
            if(State.progType === 'equal') DOM.progPanes.equal.classList.add('active');
            if(State.progType === 'progressive') DOM.progPanes.progressive.classList.add('active');
            if(State.progType === 'manual') DOM.progPanes.manual.classList.add('active');
            
            UI.updateAll();
        });
    });

    // Add Project
    DOM.btnAddProject.addEventListener('click', () => {
        State.projects.push({name: 'New Project', amount: 5000, month: 0});
        UI.renderProjects(true);
        UI.updateAll();
    });

    // Generate Button Action
    DOM.btnGenerate.addEventListener('click', () => {
        DOM.btnGenerate.classList.add('loading');
        
        // Simulate processing time for premium feel
        setTimeout(() => {
            DOM.btnGenerate.classList.remove('loading');
            State.isGenerated = true;
            
            // Show content
            DOM.generatedContent.style.display = 'block';
            setTimeout(() => DOM.generatedContent.style.opacity = '1', 50);
            
            UI.updateAll();
            
            // Smooth scroll down
            DOM.generatedContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
            
        }, 800);
    });

    // Theme
    DOM.themeToggle.addEventListener('click', () => {
        State.theme = State.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', State.theme);
        if(State.isGenerated) Charts.drawAll();
    });

    // Exports
    DOM.btnCopyReport.addEventListener('click', () => {
        navigator.clipboard.writeText(DOM.reportText.innerText).then(()=>alert("Copied!"));
    });
    
    DOM.btnCsv.addEventListener('click', () => {
        let csv = "Month,Guaranteed,Extra,OneTime,Total,RunningTotal,RemainingGoal\n";
        State.monthlyData.forEach(d => {
            csv += `${d.month},${d.guaranteed},${d.extra},${d.oneTime},${d.total},${d.runningTotal},${d.remaining}\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'plan.csv'; a.click();
    });
    
    DOM.btnJson.addEventListener('click', () => {
        const str = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(State, null, 2));
        const a = document.createElement('a');
        a.href = str; a.download = 'plan.json'; a.click();
    });

    // Handle Printing
    window.addEventListener('beforeprint', () => {
        State.isPrinting = true;
        if(State.isGenerated) Charts.drawAll();
    });
    window.addEventListener('afterprint', () => {
        State.isPrinting = false;
        if(State.isGenerated) Charts.drawAll();
    });
}

function updateStateFromDOM() {
    State.goals.yearly = parseFloat(DOM.inpGoal.value) || 0;
    State.goals.trip = parseFloat(DOM.inpTrip.value) || 0;
    State.goals.phone = parseFloat(DOM.inpPhone.value) || 0;
    State.goals.emergency = parseFloat(DOM.inpEmergency.value) || 0;
    State.guaranteed = parseFloat(DOM.inpGuaranteed.value) || 0;
    State.progCurve = DOM.inpCurveSpeed.value;
}

// Boot
document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    updateStateFromDOM();
    UI.updateAll(); // Run initial silent calculation for KPIs
});
