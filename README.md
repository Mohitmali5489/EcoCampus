# 🌿 EcoCampus

**EcoCampus** is the official digital platform for the **B.K. Birla Night College Green Club**. It is a gamified sustainability application designed to foster environmental consciousness among students through daily challenges, event participation, recycling tracking, and a rewards system.

## 🚀 Project Overview

* **Mission:** To transform the campus into a zero-waste zone by integrating technology with environmental action.
* **Target Audience:** Students of B.K. Birla Night College (Requires valid Student ID).
* **Core Concept:** Students earn **EcoPoints** for sustainable actions, which can be redeemed for real-world rewards.

## ✨ Key Features

### 🎮 Gamification & Engagement
* **Daily Check-ins & Streaks:** Users earn points for opening the app daily. Includes a "streak restore" feature (costs 50 points) if a day is missed.
* **Leaderboards:** Rankings for individual "Eco Warriors" and Department-wise competitions.
* **Eco-Challenges:** Photo-based verification for weekly tasks (e.g., "Plant a sapling") and daily eco-quizzes.
* **Seasonal Themes:** Includes dynamic "Eco-Romantic" themes for Valentine's week (Rose Day, Hug Day, etc.) with immersive particle effects.

### ♻️ Sustainability Tools
* **Plastic Log:** A digital log for plastic recycling. Generates a QR code for students to show at collection desks.
* **Green Lens:** An immersive, scroll-triggered gallery showcasing campus sustainability stories (Solar power, Zero Waste mission).
* **AQI Monitor:** Real-time Air Quality Index monitoring based on the user's location.

### 🛍️ EcoStore & Events
* **EcoStore:** A rewards marketplace where points can be redeemed for coupons or merchandise. Generates unique QR codes for order verification.
* **Event Management:** Listing of Green Club events with RSVP functionality. Supports both free and "paid" (using EcoPoints) events.

### 🤖 Smart Tech
* **EcoBuddy AI:** An integrated AI chatbot (powered by Supabase Edge Functions) that answers questions about the college, events, and sustainability.

## 🛠️ Tech Stack

* **Frontend:** Vanilla JavaScript (ES Modules), HTML5, CSS.
* **Styling:** Tailwind CSS (via CDN).
* **Backend & Auth:** Supabase (PostgreSQL, Auth, RPCs, Edge Functions).
* **Media Storage:** Cloudinary (for profile pictures and challenge uploads).
* **Icons:** Lucide Icons.
* **Fonts:** Inter, Plus Jakarta Sans, Dancing Script.

## ⚙️ Installation & Setup

Since this project uses **ES Modules** (`type="module"` in script tags), it cannot be run directly from the file system (`file://`). It requires a local server.

### Prerequisites
1.  **Node.js** (optional, but recommended for serving).
2.  **Supabase Account** with a new project.
3.  **Cloudinary Account** for image hosting.

