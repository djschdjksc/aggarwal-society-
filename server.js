require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const Member = require('./models/Member');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const MONGODB_URI = process.env.MONGODB_URI || '';

// Fallback JSON DB path for when MongoDB is not connected yet
const DATA_DIR = path.join(__dirname, 'data');
const LOCAL_DB_FILE = path.join(DATA_DIR, 'members.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LOCAL_DB_FILE)) fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify([]), 'utf8');

let isMongoConnected = false;

// Connect to MongoDB if URI is provided
if (MONGODB_URI && MONGODB_URI.trim().startsWith('mongodb')) {
  mongoose.connect(MONGODB_URI)
    .then(() => {
      isMongoConnected = true;
      console.log('✅ Connected to MongoDB successfully!');
    })
    .catch((err) => {
      console.error('⚠️ MongoDB connection error:', err.message);
      console.log('🔄 Falling back to local JSON storage for seamless operation.');
    });
} else {
  console.log('ℹ️ MONGODB_URI not configured in .env. Running on local JSON storage mode.');
}

// Local JSON Storage Helpers (fallback)
function getLocalMembers() {
  try {
    const raw = fs.readFileSync(LOCAL_DB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function saveLocalMembers(members) {
  fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(members, null, 2), 'utf8');
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static frontend assets
app.use(express.static(path.join(__dirname, 'public')));

// Simple Auth Middleware for Admin Routes
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (token === ADMIN_PASSWORD) {
    return next();
  }
  return res.status(401).json({ success: false, message: 'Unauthorized. Admin password required.' });
}

// --- API ROUTES ---

// 1. Admin Login Endpoint
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    return res.json({ success: true, token: ADMIN_PASSWORD, message: 'Login successful' });
  }
  return res.status(401).json({ success: false, message: 'Invalid Admin Password' });
});

// 2. Register New Member
app.post('/api/members', async (req, res) => {
  try {
    const data = req.body;
    if (!data.fullName || !data.mobileNo) {
      return res.status(400).json({ success: false, message: 'Full Name and Mobile No. are required.' });
    }

    const cleanMobile = data.mobileNo.replace(/\D/g, '');
    const currentYear = new Date().getFullYear();
    const joiningDate = data.joiningDate || new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
    const validityUpto = data.validityUpto || `31-12-${currentYear}`;

    let nextIdNumber = 1001;

    if (isMongoConnected) {
      const lastMember = await Member.findOne().sort({ createdAt: -1 });
      if (lastMember && lastMember.memberId) {
        const num = parseInt(lastMember.memberId.replace(/\D/g, ''), 10);
        if (!isNaN(num)) nextIdNumber = num + 1;
      }
    } else {
      const members = getLocalMembers();
      if (members.length > 0) {
        const last = members[members.length - 1];
        const num = parseInt((last.memberId || '').replace(/\D/g, ''), 10);
        if (!isNaN(num)) nextIdNumber = num + 1;
      }
    }

    const memberId = nextIdNumber.toString();
    const receiptNo = `NAWS-REC-${memberId}`;

    const newRecord = {
      ...data,
      memberId,
      receiptNo,
      mobileNo: cleanMobile,
      joiningDate,
      validityUpto,
      designation: data.designation || 'Executive Member',
      amountPaid: Number(data.amountPaid) || 1100,
      paymentStatus: data.paymentStatus || 'Completed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (isMongoConnected) {
      const doc = new Member(newRecord);
      await doc.save();
    } else {
      const members = getLocalMembers();
      members.push(newRecord);
      saveLocalMembers(members);
    }

    return res.json({
      success: true,
      member: newRecord,
      memberId,
      receiptNo,
      message: 'Member registered successfully!'
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
  }
});

// 3. Search Member (Public: for Card Download & Payment Verification Lookup)
app.get('/api/members/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.status(400).json({ success: false, message: 'Search query required.' });
    }

    const cleanQ = q.replace(/\D/g, '');
    let member = null;

    if (isMongoConnected) {
      member = await Member.findOne({
        $or: [
          { memberId: q },
          { memberId: cleanQ },
          { mobileNo: cleanQ },
          { fullName: { $regex: new RegExp('^' + q + '$', 'i') } }
        ]
      });
    } else {
      const members = getLocalMembers();
      member = members.find(m => 
        (m.memberId && m.memberId.toString() === q) ||
        (cleanQ && m.memberId && m.memberId.toString().replace(/\D/g, '') === cleanQ) ||
        (cleanQ && m.mobileNo && m.mobileNo.replace(/\D/g, '') === cleanQ) ||
        (m.fullName && m.fullName.toLowerCase() === q.toLowerCase())
      );
    }

    if (!member) {
      return res.status(404).json({ success: false, message: `No record found matching "${q}".` });
    }

    return res.json({ success: true, member });
  } catch (err) {
    console.error('Search error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Update Payment Status (for verifying pending payments)
app.put('/api/members/:id/payment', async (req, res) => {
  try {
    const { id } = req.params;
    const { transactionRef, amountPaid, paymentMethod, paymentStatus } = req.body;

    const updates = {
      paymentStatus: paymentStatus || 'Completed',
      transactionRef: transactionRef || '',
      amountPaid: Number(amountPaid) || 1100,
      paymentMethod: paymentMethod || 'UPI',
      updatedAt: new Date().toISOString()
    };

    let updatedMember = null;

    if (isMongoConnected) {
      updatedMember = await Member.findOneAndUpdate(
        { $or: [{ memberId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }] },
        { $set: updates },
        { new: true }
      );
    } else {
      const members = getLocalMembers();
      const idx = members.findIndex(m => m.memberId === id || m._id === id);
      if (idx !== -1) {
        members[idx] = { ...members[idx], ...updates };
        saveLocalMembers(members);
        updatedMember = members[idx];
      }
    }

    if (!updatedMember) {
      return res.status(404).json({ success: false, message: 'Member not found.' });
    }

    return res.json({ success: true, member: updatedMember, message: 'Payment updated successfully!' });
  } catch (err) {
    console.error('Update payment error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Admin: Paginated & Filtered Members List (Optimized for Lakhs of Records)
app.get('/api/admin/members', requireAdmin, async (req, res) => {
  try {
    const { status, search, constituency } = req.query;
    const isExport = req.query.all === 'true';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = isExport ? 100000 : Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    let totalCount = 0;
    let list = [];

    if (isMongoConnected) {
      let filter = {};
      if (status && status !== 'All') filter.paymentStatus = status;
      if (constituency && constituency !== 'All') filter.constituency = constituency;
      if (search) {
        const cleanS = search.replace(/\D/g, '');
        const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [
          { fullName: searchRegex },
          { memberId: searchRegex },
          { fatherHusbandName: searchRegex },
          { transactionRef: searchRegex }
        ];
        if (cleanS) {
          filter.$or.push({ mobileNo: new RegExp(cleanS, 'i') });
        }
      }

      totalCount = await Member.countDocuments(filter);

      let query = Member.find(filter)
        .sort({ createdAt: -1 });

      if (!isExport) {
        query = query.skip(skip).limit(limit);
      }

      list = await query.lean();
    } else {
      let all = getLocalMembers();
      if (status && status !== 'All') {
        all = all.filter(m => m.paymentStatus === status);
      }
      if (constituency && constituency !== 'All') {
        all = all.filter(m => m.constituency === constituency);
      }
      if (search) {
        const s = search.toLowerCase();
        all = all.filter(m => 
          (m.fullName && m.fullName.toLowerCase().includes(s)) ||
          (m.memberId && m.memberId.toString().includes(s)) ||
          (m.mobileNo && m.mobileNo.includes(s)) ||
          (m.fatherHusbandName && m.fatherHusbandName.toLowerCase().includes(s)) ||
          (m.transactionRef && m.transactionRef.toLowerCase().includes(s))
        );
      }
      all.reverse();
      totalCount = all.length;
      list = isExport ? all : all.slice(skip, skip + limit);
    }

    const totalPages = Math.ceil(totalCount / limit) || 1;

    return res.json({
      success: true,
      count: list.length,
      totalCount,
      page,
      limit,
      totalPages,
      members: list
    });
  } catch (err) {
    console.error('Admin members error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Admin: Analytics & Reports Stats
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    let all = [];
    if (isMongoConnected) {
      all = await Member.find({});
    } else {
      all = getLocalMembers();
    }

    const totalMembers = all.length;
    let completedPayments = 0;
    let pendingPayments = 0;
    let totalFundsCollected = 0;
    const constituencyStats = {};

    all.forEach(m => {
      if (m.paymentStatus === 'Completed') {
        completedPayments++;
        totalFundsCollected += (Number(m.amountPaid) || 0);
      } else {
        pendingPayments++;
      }
      const c = m.constituency || 'Other / Not Specified';
      constituencyStats[c] = (constituencyStats[c] || 0) + 1;
    });

    return res.json({
      success: true,
      stats: {
        totalMembers,
        completedPayments,
        pendingPayments,
        totalFundsCollected,
        constituencyStats,
        storageMode: isMongoConnected ? 'MongoDB Database' : 'Local JSON Storage'
      }
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 7. Admin: Delete Member
app.delete('/api/admin/members/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (isMongoConnected) {
      await Member.findOneAndDelete({ memberId: id });
    } else {
      let members = getLocalMembers();
      members = members.filter(m => m.memberId !== id);
      saveLocalMembers(members);
    }
    return res.json({ success: true, message: 'Member deleted successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Route for Admin Dashboard
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Naujwan Aggarwal Welfare Society Portal is live!`);
  console.log(`🌐 Public Registration Portal: http://localhost:${PORT}`);
  console.log(`🔐 Owner Admin Dashboard:      http://localhost:${PORT}/admin`);
  console.log(`📦 Storage Engine:             ${isMongoConnected ? 'MongoDB' : 'Local File (data/members.json)'}`);
  console.log(`====================================================`);
});

