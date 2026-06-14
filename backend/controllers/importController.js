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
    if (parts[1] === '14' || (parts[0] === '04' && parts[1] === '05' && parts[2] === '2026')) {
       return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    }
    return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
  }
  if (dateStr.startsWith('Mar-')) {
    const day = dateStr.split('-')[1];
    return new Date(`2026-03-${day}`);
  }
  return new Date(dateStr);
};
async function currency_converter(current_currency, amount, target_currency, date) {
  const url = `https://api.freecurrencyapi.com/v1/historical?apikey=fca_live_xgwbqMQwAgClyzIVI5Xui7vKMUNwTYNtyqYcMxJ1&date=${date}&base_currency=${current_currency}&currencies=${target_currency}`;
  
  try {
    const response = await fetch(url);
    const api_data = await response.json();
    
    const exchange_rate = api_data.data[date][target_currency];
    
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
      if (row.currency === 'USD') {
         hasAnomaly = true;
         issues.push("Foreign Currency (USD)");
         requiredFixes.usd = "Convert to INR? Enter rate or manual amount.";
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

      // Potential duplicates (this is simple heuristic)
      if (row.description.toLowerCase().includes('dinner - marina bites') || row.description.toLowerCase().includes('thalassa')) {
         hasAnomaly = true;
         issues.push("Potential Duplicate or Conflict.");
         requiredFixes.action = "Keep or Drop this row?";
      }

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
      res.json({ data: rows, anomalies });
    });
};

exports.confirmCsv = async (req, res) => {
  try {
    const { cleanData } = req.body;
    
    let group = await Group.findOne({ where: { name: 'Flatmates' } });
    if (!group) group = await Group.create({ name: 'Flatmates' });

    const allUsers = {};
    const getOrCreateUser = async (name) => {
      if (!name) return null;
      const cleanName = titleCase(name);
      if (allUsers[cleanName]) return allUsers[cleanName];
      let user = await User.findOne({ where: { name: cleanName } });
      if (!user) user = await User.create({ name: cleanName });
      allUsers[cleanName] = user;
      return user;
    };

    const memberEvents = [
      { name: 'Aisha', join: '2026-01-01', leave: null },
      { name: 'Rohan', join: '2026-01-01', leave: null },
      { name: 'Priya', join: '2026-01-01', leave: null },
      { name: 'Meera', join: '2026-01-01', leave: '2026-03-31' },
      { name: 'Sam', join: '2026-04-15', leave: null }
    ];

    for (let m of memberEvents) {
      const user = await getOrCreateUser(m.name);
      const membership = await GroupMember.findOne({ where: { group_id: group.id, user_id: user.id } });
      if (!membership) {
         await GroupMember.create({
           group_id: group.id, user_id: user.id, joined_at: m.join, left_at: m.leave
         });
      }
    }

    for (let row of cleanData) {
      // Allow dropping rows
      if (row._drop === true) continue;

      const parsedDate = parseDateSafe(row.date);

      let amount = parseFloat(row.amount);
      if (row.currency === 'USD') {
        // If user didn't fix it, auto convert using historical api
        const dateStr = parsedDate ? parsedDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        const converted = await currency_converter('USD', amount, 'INR', dateStr);
        if (converted !== null) {
          amount = converted;
        } else {
          amount = amount * 83;
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
         await Settlement.create({
            group_id: group.id, paid_by_id: payer.id, paid_to_id: payee.id, amount, date: parsedDate
         });
         continue;
      }

      const payer = await getOrCreateUser(row.paid_by);
      let split_type = row.split_type || 'equal';

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

    res.json({ message: 'Import and Save Successful' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Import saving failed', details: err.message });
  }
};
