import React from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { Package, ShoppingCart, CreditCard, Activity } from 'lucide-react';
import { Toaster } from 'sonner';

import InventoryPage from './pages/InventoryPage';
import OrdersPage from './pages/OrdersPage';
import BillingPage from './pages/BillingPage';

function App() {
    const location = useLocation();

    const NavItem = ({ to, icon: Icon, label }) => {
        const isActive = location.pathname === to;
        return (
            <Link
                to={to}
                className={`flex items-center gap-3 px-4 py-4 rounded-xl transition-all w-full ${isActive
                    ? 'bg-white/10 text-white font-medium shadow-lg border border-white/5'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
            >
                <Icon size={20} className={isActive ? 'text-[hsl(var(--accent))]' : ''} />
                <span>{label}</span>
            </Link>
        );
    };

    return (
        <div className="flex min-h-screen bg-[hsl(var(--bg-app))]">
            <Toaster position="top-right" theme="dark" />

            {/* Sidebar - Static Flex Item */}
            <aside className="w-72 flex-shrink-0 glass-panel border-r border-white/5 flex flex-col h-screen sticky top-0">
                <div className="p-8 flex flex-col items-center w-full">
                    <div className="flex flex-col items-center justify-center gap-4 mb-10 w-full">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[hsl(var(--primary))] to-[hsl(var(--accent))] flex items-center justify-center shadow-lg shadow-indigo-500/20">
                            <Activity size={24} className="text-white" />
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight m-0 text-center">OrderHub</h1>
                    </div>

                    <nav className="flex flex-col gap-3 w-full">
                        <NavItem to="/inventory" icon={Package} label="Inventory" />
                        <NavItem to="/orders" icon={ShoppingCart} label="Orders" />
                        <NavItem to="/billing" icon={CreditCard} label="Billing" />
                    </nav>
                </div>
            </aside>

            {/* Main Content - Flex Grow */}
            <main className="flex-1 p-10 min-w-0 flex justify-center">
                <div className="w-full max-w-5xl space-y-8">
                    <Routes>
                        <Route path="/" element={<Navigate to="/orders" replace />} />
                        <Route path="/inventory" element={<InventoryPage />} />
                        <Route path="/orders" element={<OrdersPage />} />
                        <Route path="/billing" element={<BillingPage />} />
                    </Routes>
                </div>
            </main>
        </div>
    );
}

export default App;
