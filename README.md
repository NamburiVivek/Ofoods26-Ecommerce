# O Foods – Full Stack E-Commerce Platform

## 🌐 Live Website

**Website:** https://www.ofoods.co.in

O Foods is a production-ready full-stack e-commerce platform built for a real Andhra food business. The platform enables customers to browse products, place orders, choose between home delivery and store pickup, make online payments, manage accounts, and track orders through a modern shopping experience.

The application is actively deployed and supports real business operations.

---

## ✨ Features

### Customer Features

* User Registration & Login
* Secure JWT Authentication
* Product Browsing & Search
* Category-Based Navigation
* Product Detail Pages
* Shopping Cart Management
* Checkout System
* Home Delivery
* Store Pickup Scheduling
* Razorpay Online Payments
* Customer Profiles
* Multiple Saved Addresses
* Order History
* Product Reviews & Ratings
* Mobile Responsive Design

### Business Features

* Admin Authentication
* Order Management Dashboard
* Shipment Tracking Management
* Customer Notification System
* Email Notifications
* SMS Notifications
* Inventory & Product Management
* Customer Data Management

---

## 🛠️ Tech Stack

### Frontend

* HTML5
* CSS3
* JavaScript (Vanilla JS)
* Responsive Mobile Design

### Backend

* Node.js
* Express.js

### Database

* MySQL

### Authentication & Security

* JWT (JSON Web Tokens)
* bcryptjs Password Hashing

### Payments

* Razorpay

### Notifications

* Nodemailer

### Deployment

* Vercel

---

## 🏗️ System Architecture

Frontend (HTML/CSS/JavaScript)

↓

Express.js REST API

↓

Authentication Layer (JWT)

↓

Business Logic Layer

↓

MySQL Database

↓

External Services

* Razorpay
* Nodemailer


---

## 📦 Core Modules

### User Management

* Registration
* Login
* Authentication
* Profile Management
* Address Management

### Product Management

* Product Listings
* Categories
* Search Functionality
* Product Details

### Shopping Experience

* Cart Management
* Checkout Flow
* Order Placement
* Payment Processing

### Order Management

* Order Tracking
* Shipping Updates
* Delivery Status
* Pickup Scheduling

### Review System

* Customer Ratings
* Product Reviews

---

## 🚀 Installation

### Clone Repository

```bash
git clone https://github.com/NamburiVivek/Ofoods26-Ecommerce.git

cd Ofoods26-Ecommerce
```

### Install Dependencies

```bash
npm install
```

### Create Environment File

Create a `.env` file in the root directory:

```env
DB_HOST=
DB_PORT=
DB_USER=
DB_PASSWORD=
DB_NAME=

JWT_SECRET=

RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=

EMAIL_USER=
EMAIL_PASS=
```

### Run Development Server

```bash
npm run dev
```

### Run Production Server

```bash
npm start
```

---

## 📁 Project Structure

Ofoods26-Ecommerce/
│
├── backend/
│   ├── .env.example
│   ├── package.json
│   ├── package-lock.json
│   └── server.js
│
├── frontend/
│   ├── Admin login.html
│   ├── Admin.html
│   ├── all-items.html
│   ├── cart.html
│   ├── Checkout.html
│   ├── conformation.html
│   ├── date-utils.js
│   ├── delivery-mode.js
│   ├── index.html
│   ├── login.html
│   ├── menu.html
│   ├── mobile.css
│   ├── papad.html
│   ├── pickles.html
│   ├── price-sync.js
│   ├── product.html
│   ├── profile.html
│   ├── review.html
│   ├── snacks.html
│   ├── spices.html
│   └── images/
│       ├── logo2.png
│       ├── boneless.Webp
│       ├── chicken boneless.Webp
│       ├── tomato.Webp
│       └── ...other product images
│
├── products-seed.json
├── README.md
├── robots.txt
├── sitemap.xml
├── vercel.json
└── .gitignore

---

## 🔐 Security Features

* Password Hashing using bcryptjs
* JWT-Based Authentication
* Protected Admin Routes
* Secure Payment Verification
* Input Validation
* Environment Variable Protection

---

## 📱 Responsive Design

The platform is optimized for:

* Desktop
* Tablet
* Mobile Devices

Responsive layouts have been implemented across product listings, checkout, cart management, profile pages, and administrative modules.

---

## 🎯 Business Impact

This project was developed and deployed for a real food business operating in Amaravati, Andhra Pradesh.

Key outcomes:

* Established an online ordering system
* Enabled digital product discovery
* Improved customer convenience
* Supported home delivery and pickup workflows
* Automated order communication through email and SMS
* Streamlined business operations

---

## 👨‍💻 Developer

**Vivek Namburi**

* GitHub: https://github.com/NamburiVivek
* Website: https://www.ofoods.co.in

---

## 📄 License

This project is developed and maintained by the author for O Foods business operations.
All rights reserved.
