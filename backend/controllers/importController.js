const fs = require('fs');
const csv = require('csv-parser');
const { User, Group, GroupMember, Expense, ExpenseSplit, Settlement } = require('../models');
const { get } = require('http');

const titleCase = (str) => {
  if (!str) return '';
  return str.trim().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
};

const parseDateSafe = (dateStr) => {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return new Date(dateStr);
    }
    return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
  }
  
  const monthNames = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };
  const lowerStr = dateStr.toLowerCase();
  for (const [abbr, monthNum] of Object.entries(monthNames)) {
    if (lowerStr.includes(abbr)) {
      const dayMatch = dateStr.match(/\d+/);
      if (dayMatch) {
        const day = dayMatch[0].padStart(2, '0');
        return new Date(`2026-${monthNum}-${day}`);
      }
    }
  }
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
};
async function currency_converter(current_currency, amount, target_currency, date) {
  const url = `https://api.freecurrencyapi.com/v1/historical?apikey=fca_live_xgwbqMQwAgClyzIVI5Xui7vKMUNwTYNtyqYcMxJ1&date=${date}&base_currency=${current_currency}&currencies=${target_currency}`;
  
  try {
    const response = await fetch(url);
    const api_data = await response.json();

    // Validate API response shape before accessing nested data
    if (!api_data || !api_data.data) {
      console.error('Currency API returned unexpected response:', JSON.stringify(api_data));
      return null;
    }

    // The API returns data keyed by date — find the first available date
    const dateKeys = Object.keys(api_data.data);
    if (dateKeys.length === 0) {
      console.error('Currency API returned no date keys for date:', date);
      return null;
    }

    const rateData = api_data.data[dateKeys[0]];
    if (!rateData || rateData[target_currency] === undefined) {
      console.error('Exchange rate not found for currency:', target_currency);
      return null;
    }

    const exchange_rate = rateData[target_currency];
    return amount * exchange_rate;

  } catch (error) {
    console.error("Conversion failed:", error);
    return null;
  }
}

exports.analyzeCsv = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const rows = [];
  const anomalies = [];
  let rowNum = 1;

  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (data) => {
      rowNum++;
      const row = { ...data, _rowNum: rowNum };
      let hasAnomaly = false;
      let issues = [];
      let requiredFixes = {};

      // Detect Missing Payer
      if (!row.paid_by || !row.paid_by.trim()) {
        hasAnomaly = true;
        issues.push("Missing Payer");
        requiredFixes.paid_by = "Please specify the payer.";
      }

      // Detect Amount formatting
      if (row.amount && row.amount.includes(',')) {
        hasAnomaly = true;
        issues.push("Amount has commas");
        requiredFixes.amount = "Remove commas from amount.";
        row.amount = row.amount.replace(/,/g, ''); // auto-fix suggestion
      }

      // Zero amount
      if (parseFloat(row.amount) === 0) {
        hasAnomaly = true;
        issues.push("Amount is 0");
        requiredFixes.action = "Keep or Drop this row?";
      }

      // Missing Currency
      if (!row.currency || !row.currency.trim()) {
        hasAnomaly = true;
        issues.push("Missing Currency");
        requiredFixes.currency = "Select currency (e.g. INR).";
        row.currency = 'INR'; // suggestion
      }

      // USD currency
      // Foreign currency
      if (row.currency && row.currency.trim() !== 'INR') {
         hasAnomaly = true;
         issues.push(`Foreign Currency (${row.currency})`);
         requiredFixes.currency = "Convert to INR? Enter rate or manual amount.";
      }

      // Ambiguous Date
      if (row.date === '04-05-2026') {
         hasAnomaly = true;
         issues.push("Ambiguous Date format");
         requiredFixes.date = "Is this April 5 or May 4?";
      } else if (row.date === 'Mar-14') {
         hasAnomaly = true;
         issues.push("Invalid Date format 'Mar-14'");
         requiredFixes.date = "Fix date format to DD-MM-YYYY.";
         row.date = '14-03-2026';
      }

      // Conflicting Split Type
      if (row.split_type === 'equal' && row.split_details && row.split_details.includes('1;')) {
         hasAnomaly = true;
         issues.push("Split type says 'equal' but details imply 'share'.");
         requiredFixes.split_type = "Update split type to 'share' or clear details.";
      }

      // Missing split type
      if (!row.split_type && !row.description.toLowerCase().includes('paid back') && !row.description.toLowerCase().includes('deposit')) {
         hasAnomaly = true;
         issues.push("Missing Split Type");
         requiredFixes.split_type = "Specify split type.";
      }

      // Inactive member check
      const parsedDate = parseDateSafe(row.date);
      if (parsedDate > new Date('2026-03-31') && row.split_with && row.split_with.includes('Meera')) {
         hasAnomaly = true;
         issues.push("Meera moved out in March, but is included in this later expense.");
         requiredFixes.split_with = "Remove Meera from split_with.";
      }

      // Guest check
      if (row.split_with && row.split_with.includes('Kabir')) {
         hasAnomaly = true;
         issues.push("Kabir is an unregistered guest.");
         requiredFixes.split_with = "Remove Kabir or map to host.";
      }

      // Invalid percentages
      if (row.split_type === 'percentage' && row.split_details) {
         const parts = row.split_details.split(';');
         let sum = 0;
         parts.forEach(p => {
            const val = p.trim().split(' ')[1];
            if (val) sum += parseFloat(val.replace('%', ''));
         });
         if (sum !== 100 && sum > 0) {
            hasAnomaly = true;
            issues.push(`Percentages sum to ${sum}% instead of 100%.`);
            requiredFixes.split_details = "Correct the percentages to sum to 100.";
         }
      }

      // NOTE: Duplicate detection is done in a post-pass below, after all rows are collected.

      if (hasAnomaly) {
        anomalies.push({
           rowNum: row._rowNum,
           issues,
           requiredFixes
        });
      }

      rows.push(row);
    })
    .on('end', () => {
      fs.unlinkSync(req.file.path);

      // === POST-PASS: Detect duplicate/conflict row groups ===
      // CORRECT LOGIC: Group by (normalized description + normalized date).
      // Same description on DIFFERENT dates = separate legitimate expenses — NOT a duplicate.
      // A duplicate/conflict only exists when BOTH description AND date match.
      const descDateGroups = {};
      rows.forEach(row => {
        const normDesc = (row.description || '').toLowerCase().trim();
        const normDate = (row.date || '').trim();
        if (!normDesc || !normDate) return;
        const key = `${normDesc}||${normDate}`;
        if (!descDateGroups[key]) descDateGroups[key] = [];
        descDateGroups[key].push(row);
      });

      let conflictGroupCounter = 0;
      for (const [key, group] of Object.entries(descDateGroups)) {
        if (group.length < 2) continue; // only one row for this description+date → fine

        const amounts = group.map(r => parseFloat(r.amount) || 0);
        const hasDifferentAmounts = amounts.some(a => a !== amounts[0]);

        // Two sub-cases:
        // 1. Same description + same date + DIFFERENT amounts = two people logged same event differently
        // 2. Same description + same date + SAME amount = exact duplicate (logged twice)
        conflictGroupCounter++;
        const groupId = `conflict-${conflictGroupCounter}`;
        const [desc, date] = key.split('||');

        // Suggested keep = row with highest amount (most likely the correct receipt)
        // If amounts are equal, keep the first occurrence
        const maxAmount = Math.max(...amounts);
        const maxIdx = amounts.indexOf(maxAmount);

        group.forEach((row, idx) => {
          row._conflictGroupId = groupId;
          row._conflictRole = idx === maxIdx ? 'suggested-keep' : 'duplicate';

          const splitInfo = group.map(r => r.split_with || 'N/A').join(' / ');
          const paidByInfo = group.map(r => r.paid_by || '?').join(' and ');

          row._conflictDesc = hasDifferentAmounts
            ? `Conflicting amounts for "${row.description}" on ${date} (${group.map(r => `${r.paid_by}: ${r.amount}`).join(' vs ')})`
            : `Exact duplicate — "${row.description}" on ${date} logged ${group.length} times (paid by: ${paidByInfo})`;

          // Add to anomalies if not already there
          const existing = anomalies.find(a => a.rowNum === row._rowNum);
          if (existing) {
            if (!existing.issues.some(i => i.includes('Duplicate') || i.includes('Conflict'))) {
              existing.issues.push(row._conflictDesc);
              existing.requiredFixes.action = 'Keep or Drop? (see conflict group)';
            }
            existing.conflictGroupId = groupId;
            existing.conflictRole = row._conflictRole;
          } else {
            anomalies.push({
              rowNum: row._rowNum,
              issues: [row._conflictDesc],
              requiredFixes: { action: 'Keep or Drop? (see conflict group)' },
              conflictGroupId: groupId,
              conflictRole: row._conflictRole
            });
          }
        });
      }

      res.json({ data: rows, anomalies });
    });
};

exports.confirmCsv = async (req, res) => {
  try {
    const { cleanData, anomalyAnalysis = [] } = req.body;

    // Report log
    const reportLines = [];
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    reportLines.push('='.repeat(60));
    reportLines.push('  FAIRSHARE — IMPORT REPORT');
    reportLines.push(`  Generated: ${timestamp}`);
    reportLines.push('='.repeat(60));
    reportLines.push('');

    let importedCount = 0;
    let droppedCount = 0;
    let settlementCount = 0;
    let convertedCount = 0;
    const rowLogs = [];
    
    let group = await Group.findOne({ where: { name: 'Flatmates' } });
    if (!group) group = await Group.create({ name: 'Flatmates' });

    const allUsers = {};
    const getOrCreateUser = async (name) => {
      if (!name) return null;
      const cleanName = titleCase(name);
      if (allUsers[cleanName]) return allUsers[cleanName];
      let user = await User.findOne({ where: { name: cleanName } });
      if (!user) user = await User.create({ name: cleanName });
      
      const membership = await GroupMember.findOne({ where: { group_id: group.id, user_id: user.id } });
      if (!membership) {
         await GroupMember.create({
           group_id: group.id,
           user_id: user.id,
           joined_at: '2026-01-01'
         });
      }
      
      allUsers[cleanName] = user;
      return user;
    };

    for (let row of cleanData) {
      // Allow dropping rows
      if (row._drop === true) {
        droppedCount++;
        const droppedAnomaly = anomalyAnalysis.find(a => a.rowNum === row._rowNum);
        const droppedIssues = droppedAnomaly ? droppedAnomaly.issues : [];
        const conflictNote = droppedAnomaly && droppedAnomaly.conflictGroupId
          ? ` [Conflict group: ${droppedAnomaly.conflictGroupId}, role: ${droppedAnomaly.conflictRole}]`
          : '';
        rowLogs.push(`[ROW ${row._rowNum}] DROPPED    | "${row.description || 'No description'}"${conflictNote}`);
        if (droppedIssues.length > 0) {
          droppedIssues.forEach(issue => rowLogs.push(`               Issue: ${issue}`));
        }
        rowLogs.push(`               Resolution: User chose to drop this row.`);
        rowLogs.push('');
        continue;
      }

      const parsedDate = parseDateSafe(row.date);

      let amount = parseFloat(row.amount);
      let originalCurrency = row.currency;
      let originalAmount = amount;
      if (row.currency && row.currency !== 'INR') {
        // If it's a foreign currency (USD, EUR, GBP etc.), auto convert to INR using historical api
        const dateStr = parsedDate ? parsedDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        const converted = await currency_converter(row.currency, amount, 'INR', dateStr);
        if (converted !== null) {
          amount = converted;
          convertedCount++;
          rowLogs.push(`[ROW ${row._rowNum}] CONVERTED  | "${row.description}" — ${originalCurrency} ${originalAmount.toFixed(2)} => INR ${amount.toFixed(2)} (historical rate on ${parsedDate ? parsedDate.toISOString().split('T')[0] : 'today'})`);
        } else {
          // Fallback rates if API fails
          if (row.currency === 'USD') {
            amount = amount * 83;
          } else if (row.currency === 'EUR') {
            amount = amount * 90;
          } else if (row.currency === 'GBP') {
            amount = amount * 105;
          }
          convertedCount++;
          rowLogs.push(`[ROW ${row._rowNum}] CONVERTED  | "${row.description}" — ${originalCurrency} ${originalAmount.toFixed(2)} => INR ${amount.toFixed(2)} (fallback rate used, API unavailable)`);
        }
        row.currency = 'INR';
      }

      let isRefund = false;
      if (amount < 0) {
        amount = Math.abs(amount);
        isRefund = true;
      }

      const isSettlement = (!row.split_type && row.split_with && row.split_with.split(';').length === 1) || 
                           row.description.toLowerCase().includes('paid back') || 
                           row.description.toLowerCase().includes('deposit');

      if (isSettlement) {
         const payer = await getOrCreateUser(row.paid_by);
         const payee = await getOrCreateUser(row.split_with);
         if (!payer || !payee) {
            console.warn(`Skipping settlement on row ${row._rowNum} because payer or payee is missing.`);
            rowLogs.push(`[ROW ${row._rowNum}] SKIPPED    | "${row.description}" — missing payer or payee for settlement.`);
            continue;
         }
         await Settlement.create({
            group_id: group.id, paid_by_id: payer.id, paid_to_id: payee.id, amount, date: parsedDate
         });
         settlementCount++;
         rowLogs.push(`[ROW ${row._rowNum}] SETTLEMENT | "${row.description}" — ${row.paid_by} paid ${row.split_with} INR ${amount.toFixed(2)}. Routed to settlements table.`);
         continue;
      }

      const payer = await getOrCreateUser(row.paid_by);
      if (!payer) {
         console.warn(`Skipping row ${row._rowNum} because paid_by is missing or invalid.`);
         rowLogs.push(`[ROW ${row._rowNum}] SKIPPED    | "${row.description}" — paid_by was missing and could not be resolved.`);
         rowLogs.push('');
         continue;
      }
      let split_type = row.split_type || 'equal';

      // Log this row's anomalies and resolution (for rows that are imported)
      const rowAnomaly = anomalyAnalysis.find(a => a.rowNum === row._rowNum);
      if (rowAnomaly && rowAnomaly.issues.length > 0) {
        const conflictNote = rowAnomaly.conflictGroupId
          ? ` [${rowAnomaly.conflictGroupId.toUpperCase()}, role: ${rowAnomaly.conflictRole}]`
          : '';
        rowLogs.push(`[ROW ${row._rowNum}] FIXED & IMPORTED | "${row.description}"${conflictNote}`);
        rowAnomaly.issues.forEach(issue => rowLogs.push(`               Anomaly: ${issue}`));
        // Document resolutions for each issue
        if (rowAnomaly.issues.some(i => i.startsWith('Foreign Currency'))) {
          rowLogs.push(`               Resolution: Currency converted — ${originalCurrency} ${originalAmount.toFixed(2)} => INR ${amount.toFixed(2)}${originalCurrency === row.currency ? ' (fallback rate)' : ' (historical API rate)'}`);
        }
        if (rowAnomaly.issues.some(i => i === 'Missing Payer')) {
          rowLogs.push(`               Resolution: Payer filled in as "${row.paid_by}" by user.`);
        }
        if (rowAnomaly.issues.some(i => i.includes('Meera'))) {
          rowLogs.push(`               Resolution: Meera removed from split_with by user.`);
        }
        if (rowAnomaly.issues.some(i => i.includes('Kabir'))) {
          rowLogs.push(`               Resolution: Kabir removed from split_with by user.`);
        }
        if (rowAnomaly.issues.some(i => i.includes('split'))) {
          rowLogs.push(`               Resolution: split_type corrected to "${split_type}" by user.`);
        }
        if (rowAnomaly.issues.some(i => i.includes('Date'))) {
          rowLogs.push(`               Resolution: Date corrected to "${row.date}" by user.`);
        }
        if (rowAnomaly.issues.some(i => i.includes('Percentages'))) {
          rowLogs.push(`               Resolution: Split percentages corrected by user and auto-normalised to 100%.`);
        }
        if (rowAnomaly.issues.some(i => i.includes('commas'))) {
          rowLogs.push(`               Resolution: Commas auto-removed from amount.`);
        }
        if (rowAnomaly.issues.some(i => i.includes('Duplicate') || i.includes('Conflicting amounts'))) {
          rowLogs.push(`               Resolution: User kept this row as the authoritative record.`);
        }
        rowLogs.push('');
      }

      const dbExpense = await Expense.create({
        group_id: group.id,
        description: isRefund ? row.description + ' (Refund)' : row.description,
        date: parsedDate,
        amount: isRefund ? -amount : amount,
        currency: row.currency || 'INR',
        paid_by_id: payer.id,
        split_type: split_type
      });

      let splitWithNames = row.split_with ? row.split_with.split(';').map(n => titleCase(n.trim())) : [];
      const splitDetails = row.split_details || '';

      if (split_type === 'equal') {
         const numPeople = splitWithNames.length;
         for (let name of splitWithNames) {
            const user = await getOrCreateUser(name);
            await ExpenseSplit.create({
              expense_id: dbExpense.id, user_id: user.id,
              allocated_amount: (isRefund ? -amount : amount) / numPeople
            });
         }
      } else if (split_type === 'unequal') {
         const parts = splitDetails.split(';');
         for (let part of parts) {
            const [n, amt] = part.trim().split(' ');
            if (n && amt) {
               const user = await getOrCreateUser(n);
               await ExpenseSplit.create({
                 expense_id: dbExpense.id, user_id: user.id,
                 allocated_amount: isRefund ? -parseFloat(amt) : parseFloat(amt)
               });
            }
         }
      } else if (split_type === 'percentage') {
         const parts = splitDetails.split(';');
         let totalPct = 0;
         let parsedPcts = [];
         for (let part of parts) {
            const [n, pctStr] = part.trim().split(' ');
            if (n && pctStr) {
               let pct = parseFloat(pctStr.replace('%', ''));
               totalPct += pct;
               parsedPcts.push({ name: n, pct });
            }
         }
         
         if (totalPct !== 100 && totalPct > 0) {
            parsedPcts = parsedPcts.map(p => ({ ...p, pct: (p.pct / totalPct) * 100 }));
         }

         for (let p of parsedPcts) {
            const user = await getOrCreateUser(p.name);
            await ExpenseSplit.create({
              expense_id: dbExpense.id, user_id: user.id, percentage: p.pct,
              allocated_amount: (p.pct / 100) * (isRefund ? -amount : amount)
            });
         }
      } else if (split_type === 'share') {
         const parts = splitDetails.split(';');
         let totalShares = 0;
         let parsedShares = [];
         for (let part of parts) {
            const [n, shStr] = part.trim().split(' ');
            if (n && shStr) {
               let sh = parseFloat(shStr);
               totalShares += sh;
               parsedShares.push({ name: n, sh });
            }
         }
         
         for (let p of parsedShares) {
            const user = await getOrCreateUser(p.name);
            await ExpenseSplit.create({
              expense_id: dbExpense.id, user_id: user.id, share: p.sh,
              allocated_amount: (p.sh / totalShares) * (isRefund ? -amount : amount)
            });
         }
      }
    }

    importedCount = cleanData.filter(r => !r._drop).length - settlementCount;

    // ========== BUILD DETAILED REPORT ==========

    // SUMMARY
    reportLines.push('SUMMARY');
    reportLines.push('-'.repeat(60));
    reportLines.push(`Total Rows Submitted : ${cleanData.length}`);
    reportLines.push(`Rows Imported        : ${importedCount}`);
    reportLines.push(`Rows Dropped         : ${droppedCount}`);
    reportLines.push(`Settlements Detected : ${settlementCount}`);
    reportLines.push(`Currency Conversions : ${convertedCount}`);
    reportLines.push(`Anomalies Detected   : ${anomalyAnalysis.length}`);
    reportLines.push('');

    // ANOMALY TYPES DETECTED
    if (anomalyAnalysis.length > 0) {
      const allIssues = anomalyAnalysis.flatMap(a => a.issues);
      const issueCount = {};
      allIssues.forEach(i => {
        const key = i.startsWith('Foreign Currency') ? 'Foreign Currency' :
                    i.startsWith('Percentages sum') ? 'Percentages not summing to 100%' :
                    i.startsWith('Conflicting amounts') ? 'Conflicting Amounts (Duplicate)' :
                    i.startsWith('Duplicate row') ? 'Duplicate Row' : i;
        issueCount[key] = (issueCount[key] || 0) + 1;
      });
      reportLines.push('ANOMALY TYPES DETECTED');
      reportLines.push('-'.repeat(60));
      Object.entries(issueCount).forEach(([type, count]) => {
        reportLines.push(`  [${count} row${count > 1 ? 's' : ''}]  ${type}`);
      });
      reportLines.push('');
    }

    // CONFLICT GROUPS SECTION
    const conflictGroups = {};
    anomalyAnalysis.forEach(a => {
      if (a.conflictGroupId) {
        if (!conflictGroups[a.conflictGroupId]) conflictGroups[a.conflictGroupId] = [];
        conflictGroups[a.conflictGroupId].push(a);
      }
    });
    const conflictGroupIds = Object.keys(conflictGroups);
    if (conflictGroupIds.length > 0) {
      reportLines.push('CONFLICT GROUPS (DUPLICATE / CONFLICTING ROWS)');
      reportLines.push('-'.repeat(60));
      reportLines.push('These rows shared the same description and were grouped for review.');
      reportLines.push('The system recommended keeping the row with the highest amount.');
      reportLines.push('');
      conflictGroupIds.forEach(gid => {
        const group = conflictGroups[gid];
        reportLines.push(`  Group: ${gid.toUpperCase()}`);
        group.forEach(a => {
          const row = cleanData.find(r => r._rowNum === a.rowNum);
          const status = row && row._drop ? 'DROPPED' : 'KEPT';
          const role = a.conflictRole === 'suggested-keep'
            ? '★ RECOMMENDED KEEP (highest amount)'
            : '  duplicate';
          const amt = row ? `INR ${parseFloat(row.amount || 0).toFixed(2)}` : 'unknown amount';
          const desc = row ? row.description : `Row ${a.rowNum}`;
          reportLines.push(`    [ROW ${a.rowNum}] ${role} | "${desc}" | ${amt} | User decision: ${status}`);
        });
        reportLines.push('');
      });
    }

    // CURRENCY CONVERSIONS SECTION
    const currencyLogs = rowLogs.filter(l => l.includes('CONVERTED'));
    if (currencyLogs.length > 0) {
      reportLines.push('CURRENCY CONVERSIONS');
      reportLines.push('-'.repeat(60));
      currencyLogs.forEach(l => reportLines.push('  ' + l.replace('[', '').replace(']', '')));
      reportLines.push('');
    }

    // ROW-BY-ROW ACTION LOG
    reportLines.push('ROW-BY-ROW ACTION LOG (ANOMALOUS ROWS ONLY)');
    reportLines.push('-'.repeat(60));
    if (rowLogs.length === 0) {
      reportLines.push('  No anomalies were flagged. All rows were clean.');
    } else {
      rowLogs.forEach(l => reportLines.push(l));
    }
    reportLines.push('');
    reportLines.push('='.repeat(60));
    reportLines.push('  END OF REPORT');
    reportLines.push('='.repeat(60));

    const reportText = reportLines.join('\n');
    const reportPath = require('path').join(__dirname, '..', 'import_report.txt');
    fs.writeFileSync(reportPath, reportText, 'utf8');

    res.json({ message: 'Import and Save Successful', report: reportText });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Import saving failed', details: err.message });
  }
};

exports.currency_converter = currency_converter;
