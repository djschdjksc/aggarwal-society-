# Naujwan Aggarwal Welfare Society (Regd.) - Membership Portal

Official web-based membership registration portal, digital ID card issuance system, and owner/admin dashboard for **Naujwan Aggarwal Welfare Society (Regd.), Jalandhar**.

---

## ✨ Features

- **Public Membership Registration Portal** (`/`):
  - Step 1: Member Personal Details, Address (House, Street, Road, Landmark, Constituency, Pincode), Profession & Work Details.
  - Automatic Phone Number Formatting: `7528847355` -> `752-8847-355` (`000-0000-000`).
  - Dropdown DOB Selectors: Day (`01`-`31`), Month (`01`-`12`), Year (`1940`-`2026`) with two-way sync to text box and dynamic age calculation.
  - Marital Status & Family:
    - Married status reveals Spouse Name, Spouse DOB (dropdowns), Spouse Profession.
    - Children details (1 to 5 children dynamic forms).
    - If child age >= 20, dynamically requires Child Profession/Occupation.
  - Multilingual Support: Instant switching between **English**, **Hindi (हिंदी)**, and **Punjabi (ਪੰਜਾਬੀ)**.
  - Step 2: Annual membership contribution (₹1,100), official PNB UPI QR code, Transaction/UTR submission, or skip payment.
  - Instant Member ID generation upon submission (e.g. `1002`) and registration receipt slip preview & printing.
  - Official Member ID Card Canvas Generator: High-resolution PNG download and print without contact number.

- **Owner & Admin Management Dashboard** (`/admin`):
  - Password protected authentication.
  - Real-time statistics: Total Members, Completed Payments, Pending Payments, Total Collection.
  - Filterable member search by Name, Mobile, Member ID, or Constituency.
  - Verify and update pending UPI payments.
  - Export all records to CSV/Excel.
  - Direct print member list and individual ID cards.

- **Storage & Database**:
  - Connected to MongoDB Atlas with automatic offline fallback to local JSON storage.

---

## 🚀 Quick Setup & Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/djschdjksc/aggarwal-society-.git
   cd aggarwal-society-
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file from `.env.example`:
   ```bash
   cp .env.example .env
   ```
   Add your MongoDB Atlas URI:
   ```env
   PORT=3000
   MONGODB_URI=your_mongodb_connection_string
   ADMIN_PASSWORD=admin123
   ```

4. **Start the application**:
   ```bash
   npm start
   ```

5. **Access the portal**:
   - **Public Portal**: `http://localhost:3000`
   - **Admin Dashboard**: `http://localhost:3000/admin`
