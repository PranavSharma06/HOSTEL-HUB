# HOSTEL-HUB

Full-stack hostel management web app with room booking and approval, fee ledger, complaints, gate pass QR, and PDF/Excel reports. Built with Node.js and Express.
## About

Hostel Management System is a full-stack web application that replaces paper
registers and spreadsheets in a student hostel. It has separate portals for
students and managers and enforces the hostel's rules on the server, so a room
can never hold more students than its capacity.

Students apply online, track their request with a reference ID, and after
approval sign in to see their room, roommates, fees and notices. Managers
approve or reject requests, allot rooms, and manage students and daily
operations. Approval and rejection emails are sent automatically through Gmail,
and browser notifications alert users to new activity.

## Features

- Booking requests with an approval and rejection workflow
- Room management with live bed availability and a room type filter
- Capacity guard that prevents double booking
- Automatic HTML emails with login credentials (Nodemailer)
- Maintenance tickets with photos, staff assignment and ratings
- Weekly mess menu with meal skipping and kitchen headcount
- Gate passes with time-limited signed QR codes and parent email alerts
- Emergency SOS button, notice board, lost and found, incident log
- Fee ledger, installments, Razorpay payments, receipts and invoices
- Room assets, checkout clearance and deposit refund
- Electricity meter readings split among roommates
- Reports with beds by room type, six-month forecast, PDF and Excel export

## Tech Stack

Node.js, Express, JavaScript, Tailwind CSS, Nodemailer, ExcelJS, PDFKit,
Razorpay Orders API, JSON file storage.

## Data Structures Used

Arrays of records, hash map (Map) for sessions, Set, a queue-like request list,
and the Singleton pattern for the shared data store.

## Run locally
1. Install Node.js 24 LTS
2. npm install
3. Copy .env.example to .env and fill in your details
4. npm start
5. Open http://localhost:3000
