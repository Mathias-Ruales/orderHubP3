# OrderHub UI Walkthrough

I have created a modern, premium-styled React application for your OrderHub platform.

## 🚀 Getting Started

Since I couldn't access `npm` in your environment, you will need to install the dependencies manually.

1.  Open your terminal or command prompt.
2.  Navigate to the new frontend directory:
    ```bash
    cd frontend
    ```
3.  Install dependencies:
    ```bash
    npm install
    ```
4.  Start the development server:
    ```bash
    npm run dev
    ```
5.  Open your browser to the URL shown (usually `http://localhost:5173`).

## 🎨 Features & Design

*   **Technology**: React + Vite (Fast & Lightweight)
*   **Design**: Custom "Glassmorphism" aesthetic using semi-transparent layers and vibrant gradients.
*   **Navigation**: Sidebar navigation to access all major modules.

### Modules Implemented

1.  **Inventory Management**:
    *   Form to create new products.
    *   Connects to `POST /inventory/products`.

2.  **Order Processing**:
    *   Dynamic form to add multiple items to an order.
    *   Connects to `POST /orders`.

3.  **Billing & Payments**:
    *   **Payment Simulator**: Manually trigger payment webhooks (`POST /payments/webhook`).
    *   **Invoice Generation**: Trigger PDF generation for orders (`POST /billing/generate/:id`).

## 🔧 Configuration

The project is pre-configured to proxy API requests to your local backend:
*   **Frontend**: http://localhost:5173
*   **API Gateway**: http://localhost:8000 (Proxied via `/api`)

Check `vite.config.js` if you need to change the backend URL.
