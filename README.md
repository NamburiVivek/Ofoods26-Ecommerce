# O Foods Store

A full-stack e-commerce platform developed for **O Foods**, a family-owned traditional food business specializing in authentic Indian pickles, snacks, sweets, spice powders, papads, and regional specialty products.

This project was created to digitize and modernize the ordering process for my father's business while providing me with practical experience in full-stack web development, database design, authentication systems, and deployment workflows.

---

## Project Motivation

O Foods Store was developed as a real-world business solution rather than a demonstration project.

The goal was to provide customers with a seamless online shopping experience while helping a traditional family business expand its digital presence. Through this project, I gained hands-on experience in designing and developing a complete e-commerce application, from frontend user interfaces to backend APIs, database management, authentication, and deployment.

This project demonstrates my ability to apply software engineering principles to solve real business problems and deliver practical solutions.

---

## Features

### Customer Features

* User Registration and Authentication
* Secure Login System
* Product Search and Browsing
* Category-Based Product Navigation
* Product Detail Pages
* Shopping Cart Management
* Checkout and Order Placement
* Order Confirmation Workflow
* Customer Profile Management
* Product Reviews and Ratings
* Home Delivery Option
* Store Pickup Option
* Multi-Address Support

### Business Features

* Multi-Store Support
* Customer Data Management
* Order Processing System
* Delivery Preference Management
* Email Notification Integration
* SMS Notification Integration

### Technical Features

* RESTful API Architecture
* JWT Authentication
* Password Encryption with bcrypt
* MySQL Database Integration
* Environment-Based Configuration
* Automated Database Migration Support
* Responsive User Interface
* Cross-Page State Management

---

## Technology Stack

### Frontend

* HTML5
* CSS3
* JavaScript (Vanilla JS)

### Backend

* Node.js
* Express.js

### Database

* MySQL

### Authentication & Security

* JSON Web Tokens (JWT)
* bcryptjs

### Communication Services

* Nodemailer
* Twilio

### Development Tools

* Git
* GitHub
* dotenv
* Nodemon

---

## Project Structure

```text
Ofoods-store/
│
├── index.html
├── login.html
├── menu.html
├── all-items.html
├── product.html
├── cart.html
├── checkout.html
├── profile.html
├── review.html
├── pickles.html
├── snacks.html
├── spices.html
├── papad.html
├── confirmation.html
│
├── delivery-mode.js
├── server.js
│
├── package.json
├── package-lock.json
│
├── assets/
│   ├── images/
│   └── icons/
│
└── README.md
```

---

## System Architecture

```text
Frontend (HTML/CSS/JavaScript)
            │
            ▼
      Express.js API
            │
            ▼
       MySQL Database
            │
            ├── Users
            ├── Orders
            ├── Products
            ├── Addresses
            └── Reviews
```

---

## Installation

### Clone the Repository

```bash
git clone https://github.com/NamburiVivek/Ofoods-store.git
cd Ofoods-store
```

### Install Dependencies

```bash
npm install
```

---

## Environment Variables

Create a `.env` file in the root directory and configure the following variables:

```env
PORT=5000

DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=ofoods

JWT_SECRET=your_jwt_secret

EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_email_password

TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=your_phone
```

---

## Running the Application

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

The application will be available at:

```text
http://localhost:5000
```

---

## Database Setup

Create a MySQL database:

```sql
CREATE DATABASE ofoods;
```

Update the database credentials in the `.env` file.

The application automatically performs required database migrations during startup.

---

## Deployment

### Render

1. Push the project to GitHub.
2. Create a new Web Service on Render.
3. Connect the GitHub repository.
4. Configure environment variables.
5. Deploy the application.

### Railway

1. Create a new Railway project.
2. Connect the GitHub repository.
3. Configure environment variables.
4. Deploy the application.

---

## Screenshots

Add screenshots of the following pages:

* Home Page
* Login Page
* Product Listing Page
* Product Details Page
* Shopping Cart
* Checkout Page
* User Profile
* Reviews Section
* Order Confirmation Page

---

## Learning Outcomes

Through this project, I gained practical experience in:

* Full-Stack Web Development
* REST API Design
* Database Design and Management
* Authentication and Authorization
* Secure Password Handling
* Environment Configuration
* Responsive Web Design
* State Management
* Deployment and Hosting
* Real-World Software Development Practices

---

## Future Improvements

* Online Payment Gateway Integration
* Order Tracking System
* Admin Dashboard
* Inventory Management System
* Product Recommendation Engine
* Analytics Dashboard
* Mobile Application Development
* Cloud Storage Integration
* Push Notifications
* Advanced Search and Filtering

---

## Security

Sensitive information such as database credentials, JWT secrets, email passwords, and third-party API keys are managed through environment variables and excluded from version control using `.gitignore`.

---

## About the Developer

**Vivek Namburi**

Engineering Student | Full-Stack Developer

This project was independently designed and developed as both a real-world business solution for a family-owned food business and a practical learning experience in modern web application development.

GitHub: https://github.com/NamburiVivek

---

## License

This project is intended for educational, portfolio, and business use.

© 2025 O Foods Store. All Rights Reserved.
