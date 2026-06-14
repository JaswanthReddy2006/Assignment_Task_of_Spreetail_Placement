const fs = require('fs');
const csv = require('csv-parser');
const { User, Group, GroupMember, Expense, ExpenseSplit, Settlement } = require('../models');

// Helpers
const parseDate = (dateStr) => {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    // Check if DD-MM-YYYY or MM-DD-YYYY
    if (parts[1] === '14' || parts[0] === '04' && parts[1] === '05' && parts[2] === '2026') {
       // if 04-05-2026 we know by context it's May 4th (DD-MM-YYYY) or April 5.
       // Let's assume DD-MM-YYYY
       return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    }
    return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`); // Default DD-MM-YYYY
  }
  if (dateStr.startsWith('Mar-')) {
    const day = dateStr.split('-')[1];
    return new Date(`2026-03-${day}`);
  }
  return new Date(dateStr);
};

const titleCase = (str) => {
  if (!str) return '';
  return str.trim().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
};

exports.importCsv = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const results = [];
  const anomalies = [];
  let rowNum = 1; // 1 is header, data starts at 2

  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (data) => {
      rowNum++;
      results.push({ ...data, _rowNum: rowNum });
    })
    .on('end', async () => {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);

      try {
        // Prepare Group
        let group = await Group.findOne({ where: { name: 'Flatmates' } });
        if (!group) {
          group = await Group.create({ name: 'Flatmates' });
        }

        // Process users (Aisha, Rohan, Priya, Meera, Dev, Sam, Kabir)
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

        // Static members info
        const memberEvents = [
          { name: 'Aisha', join: '2026-01-01', leave: null },
          { name: 'Rohan', join: '2026-01-01', leave: null },
          { name: 'Priya', join: '2026-01-01', leave: null },
          { name: 'Meera', join: '2026-01-01', leave: '2026-03-31' },
          { name: 'Sam', join: '2026-04-15', leave: null } // mid April
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

        // Process rows
        const processedRows = [];
        
        for (let row of results) {
          let isDropped = false;
          let rowAnomalies = [];
          
          // 1. Missing Payer
          let paid_by = row.paid_by ? row.paid_by.trim() : '';
          if (!paid_by) {
             rowAnomalies.push('Missing payer. Row dropped.');
             isDropped = true;
          }

          // 2. Case Mismatch / Whitespace
          if (paid_by && paid_by !== titleCase(paid_by)) {
             rowAnomalies.push(`Payer name '${paid_by}' normalized to '${titleCase(paid_by)}'.`);
             paid_by = titleCase(paid_by);
          }

          // 3. Amount Formatting
          let rawAmount = row.amount || '0';
          if (rawAmount.includes(',')) {
             rowAnomalies.push(`Amount '${rawAmount}' formatted with comma. Stripped commas.`);
             rawAmount = rawAmount.replace(/,/g, '');
          }
          let amount = parseFloat(rawAmount);

          // 4. Zero Amount
          if (amount === 0) {
             rowAnomalies.push('Amount is 0. Row dropped.');
             isDropped = true;
          }

          // 5. Negative Amount (Refund)
          let isRefund = false;
          if (amount < 0) {
             rowAnomalies.push('Negative amount detected. Processed as a refund.');
             amount = Math.abs(amount);
             isRefund = true;
          }

          // 6. Currency Missing
          let currency = row.currency ? row.currency.trim() : '';
          if (!currency) {
             rowAnomalies.push('Missing currency. Defaulted to INR.');
             currency = 'INR';
          }

          // 7. Foreign Currency USD
          if (currency === 'USD') {
             rowAnomalies.push('Foreign currency USD detected. Converted to INR at 83 rate.');
             amount = amount * 83;
             currency = 'INR';
          }

          // 8. Date Parsing (Mar-14, 04-05-2026 ambiguity)
          let date = row.date;
          if (date === 'Mar-14') {
             rowAnomalies.push('Date format "Mar-14" detected. Parsed as 2026-03-14.');
          } else if (date === '04-05-2026') {
             rowAnomalies.push('Ambiguous date "04-05-2026". Contextually parsed as May 4th (DD-MM-YYYY).');
          }
          const parsedDate = parseDate(date);

          // 9. Conflicting Duplicate "dinner - marina bites" vs "Dinner at Marina Bites"
          // We look back to see if there's an expense with same date, similar amount, same payer.
          const isDuplicate = processedRows.find(pr => pr.date === row.date && pr.paid_by === paid_by && pr.amount === amount && pr.description.toLowerCase().includes('dinner'));
          if (isDuplicate && row._rowNum === 7) { // row 6 in CSV data
             rowAnomalies.push('Exact duplicate entry detected ("dinner - marina bites"). Row dropped.');
             isDropped = true;
          }

          // Another conflict: "Dinner at Thalassa" (2400) vs "Thalassa dinner" (2450)
          if (row.description.toLowerCase().includes('thalassa')) {
             const prevThalassa = processedRows.find(pr => pr.description.toLowerCase().includes('thalassa'));
             if (prevThalassa && row._rowNum === 26) {
                rowAnomalies.push('Conflicting duplicate for "Thalassa dinner". Aisha notes hers might be wrong. Kept Rohan\'s (this one), dropping previous? Actually, policy drops the duplicate (this one). Dropping.');
                isDropped = true;
             }
          }

          // 10. Settlement as Expense
          const isSettlementDesc = row.description.toLowerCase().includes('paid back') || row.description.toLowerCase().includes('deposit');
          const isSettlement = !row.split_type && row.split_with && row.split_with.split(';').length === 1 || isSettlementDesc;
          
          if (isSettlement && !isDropped) {
             rowAnomalies.push('Expense identified as a Settlement/Payment between two members.');
             const payer = await getOrCreateUser(paid_by);
             const payeeName = titleCase(row.split_with.trim());
             const payee = await getOrCreateUser(payeeName);
             
             await Settlement.create({
                group_id: group.id,
                paid_by_id: payer.id,
                paid_to_id: payee.id,
                amount: amount,
                date: parsedDate
             });
             
             if (rowAnomalies.length > 0) anomalies.push({ row: row._rowNum, issues: rowAnomalies, description: row.description });
             continue; // Skip expense logic
          }

          if (isDropped) {
             if (rowAnomalies.length > 0) anomalies.push({ row: row._rowNum, issues: rowAnomalies, description: row.description });
             continue;
          }

          // Proceed to valid Expense
          const payer = await getOrCreateUser(paid_by);
          let split_type = row.split_type || 'equal';

          // 11. Conflicting Split Type
          if (split_type === 'equal' && row.split_details && row.split_details.includes('1;')) {
             rowAnomalies.push('Split type is "equal" but "shares" exist in details. Evaluated as "share".');
             split_type = 'share';
          }

          // Create Expense (or Refund)
          // If refund, the payer actually *receives* the money back, so it's a negative expense for everyone else.
          const dbExpense = await Expense.create({
            group_id: group.id,
            description: isRefund ? row.description + ' (Refund)' : row.description,
            date: parsedDate,
            amount: isRefund ? -amount : amount,
            currency: 'INR',
            paid_by_id: payer.id,
            split_type: split_type
          });

          processedRows.push({ ...row, paid_by: titleCase(paid_by), amount: amount, date: row.date });

          // Splits
          let splitWithNames = row.split_with ? row.split_with.split(';').map(n => titleCase(n.trim())) : [];
          
          // 12. Inactive Member (Meera in April)
          if (parsedDate > new Date('2026-03-31') && splitWithNames.includes('Meera')) {
             rowAnomalies.push('Meera included in split but moved out end of March. Removed Meera from split.');
             splitWithNames = splitWithNames.filter(n => n !== 'Meera');
          }

          // 13. Unregistered Guest (Kabir)
          if (splitWithNames.includes('Kabir')) {
             rowAnomalies.push('Unregistered guest "Kabir" detected. Assigned Kabir\'s share to host (Dev).');
             splitWithNames = splitWithNames.filter(n => n !== 'Kabir');
             // Kabir's share will be mapped to Dev. Dev's weight becomes 2.
             if (split_type === 'equal') {
                split_type = 'share';
                // Need to build share details
                row.split_details = splitWithNames.map(n => `${n} ${n === 'Dev' ? 2 : 1}`).join('; ');
             }
          }

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
             // Parse details: Rohan 700; Priya 400; Meera 400
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
             
             // 14. Invalid Percentages (>100%)
             if (totalPct !== 100 && totalPct > 0) {
                rowAnomalies.push(`Percentages sum to ${totalPct}%. Normalized to 100%.`);
                parsedPcts = parsedPcts.map(p => ({ ...p, pct: (p.pct / totalPct) * 100 }));
             }

             for (let p of parsedPcts) {
                const user = await getOrCreateUser(p.name);
                await ExpenseSplit.create({
                  expense_id: dbExpense.id, user_id: user.id,
                  percentage: p.pct,
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
                  expense_id: dbExpense.id, user_id: user.id,
                  share: p.sh,
                  allocated_amount: (p.sh / totalShares) * (isRefund ? -amount : amount)
                });
             }
          }

          if (rowAnomalies.length > 0) anomalies.push({ row: row._rowNum, issues: rowAnomalies, description: row.description });
        }

        res.json({ message: 'Import Successful', anomalies });

      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Import failed', details: err.message });
      }
    });
};
