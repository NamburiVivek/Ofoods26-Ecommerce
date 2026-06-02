// ─────────────────────────────────────────────────────────────
//  O FOODS — Date Utilities (date-utils.js)
//  Works in both Node.js (server.js) and Browser (HTML files)
// ─────────────────────────────────────────────────────────────

function getNextWorkingPickupDate(fromDate = new Date()) {
  const date = new Date(fromDate);
  date.setHours(0, 0, 0, 0);
  const weekday = date.getDay(); // 0=Sun, 1=Mon...6=Sat

  if (weekday === 6) {
    // Saturday → Monday (skip Sunday)
    date.setDate(date.getDate() + 2);
  } else if (weekday === 0) {
    // Sunday → Monday
    date.setDate(date.getDate() + 1);
  } else {
    // Mon–Fri → next day
    date.setDate(date.getDate() + 1);
  }

  return date;
}

function formatINDate(date, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return new Date(date).toLocaleDateString('en-IN', options);
}

function formatUPIPaymentLink({ pa, pn, am, cu = 'INR', tn = '' }) {
  const params = new URLSearchParams();
  params.set('pa', pa);
  params.set('pn', pn);
  if (am != null) params.set('am', am.toString());
  params.set('cu', cu);
  if (tn) params.set('tn', tn);
  return `upi://pay?${params.toString()}`;
}

function validateUpiId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9._\-]{2,}@[a-zA-Z]{2,}$/.test(value.trim());
}

// Node.js export
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = { getNextWorkingPickupDate, formatINDate, formatUPIPaymentLink, validateUpiId };
}

// Browser global
if (typeof window !== 'undefined') {
  window.getNextWorkingPickupDate = getNextWorkingPickupDate;
  window.formatINDate = formatINDate;
  window.formatUPIPaymentLink = formatUPIPaymentLink;
  window.validateUpiId = validateUpiId;
}