import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';

const OrdersPage = () => {
    const [products, setProducts] = useState([]);
    const [showCreate, setShowCreate] = useState(false);
    const [formData, setFormData] = useState({
        customer_email: '',
        currency: 'USD',
        items: [{ product_id: '', quantity: 1 }]
    });
    const [loading, setLoading] = useState(false);

    React.useEffect(() => {
        const fetchProducts = async () => {
            try {
                const res = await axios.get('/api/inventory/products');
                setProducts(res.data.items);
            } catch (err) {
                console.error(err);
                toast.error('Failed to load products');
            }
        };
        fetchProducts();
    }, []);

    const addItem = () => {
        setFormData({
            ...formData,
            items: [...formData.items, { product_id: '', quantity: 1 }]
        });
    };

    const removeItem = (index) => {
        const newItems = formData.items.filter((_, i) => i !== index);
        setFormData({ ...formData, items: newItems });
    };

    const updateItem = (index, field, value) => {
        const newItems = [...formData.items];
        newItems[index][field] = value;
        setFormData({ ...formData, items: newItems });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const payload = {
                ...formData,
                items: formData.items.map(item => {
                    const product = products.find(p => p.id === parseInt(item.product_id));
                    if (!product) throw new Error(`Product with ID ${item.product_id} not found`);

                    return {
                        product_id: parseInt(item.product_id),
                        quantity: parseInt(item.quantity),
                        sku: product.sku,
                        name: product.name,
                        unit_price_cents: product.price_cents
                    };
                })
            };

            const res = await axios.post('/api/orders', payload);
            toast.success('Order created successfully!');
            setFormData({
                customer_email: '',
                currency: 'USD',
                items: [{ product_id: '', quantity: 1 }]
            });
            setShowCreate(false);
        } catch (err) {
            console.error('Full error object:', err);
            const errorMessage = err.response?.data?.message || err.response?.data?.error || err.message || 'Failed to create order.';
            toast.error(`Error: ${errorMessage}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <div className="mb-8 flex justify-between items-end">
                <div>
                    <h1>Order Processing</h1>
                    <p className="text-[hsl(var(--text-muted))]">Create and manage customer orders.</p>
                </div>
                <button
                    className="btn-primary"
                    onClick={() => setShowCreate(!showCreate)}
                >
                    {showCreate ? 'Cancel' : 'Create New Order'}
                </button>
            </div>

            {showCreate && (
                <div className="glass-card max-w-2xl mb-8 animate-fade-in-up">
                    <h2 className="mb-6">Create New Order</h2>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-4">
                            <div>
                                <label>Customer Email</label>
                                <input
                                    type="email"
                                    required
                                    value={formData.customer_email}
                                    onChange={e => setFormData({ ...formData, customer_email: e.target.value })}
                                    placeholder="customer@example.com"
                                />
                            </div>
                            <div>
                                <label>Currency</label>
                                <select
                                    value={formData.currency}
                                    onChange={e => setFormData({ ...formData, currency: e.target.value })}
                                >
                                    <option value="USD">USD</option>
                                    <option value="EUR">EUR</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label>Order Items</label>
                                <button type="button" onClick={addItem} className="btn-secondary btn-sm flex items-center gap-1">
                                    <Plus size={14} /> Add Item
                                </button>
                            </div>

                            <div className="space-y-3">
                                {formData.items.map((item, index) => (
                                    <div key={index} className="flex gap-4 items-end bg-white/5 p-3 rounded-lg border border-white/5">
                                        <div className="flex-1">
                                            <label className="text-xs mb-1">Product</label>
                                            <select
                                                required
                                                value={item.product_id}
                                                onChange={e => updateItem(index, 'product_id', e.target.value)}
                                                className="py-1"
                                            >
                                                <option value="">Select Product...</option>
                                                {products.map(p => (
                                                    <option key={p.id} value={p.id}>
                                                        {p.sku} - {p.name} (${(p.price_cents / 100).toFixed(2)})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="w-16">
                                            <label className="text-xs mb-1">Qty</label>
                                            <input
                                                type="number"
                                                min="1"
                                                required
                                                value={item.quantity}
                                                onChange={e => updateItem(index, 'quantity', e.target.value)}
                                                className="py-1"
                                            />
                                        </div>
                                        {formData.items.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removeItem(index)}
                                                className="btn-danger p-2"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="pt-4 border-t border-white/10">
                            <button type="submit" className="btn-primary w-full" disabled={loading}>
                                {loading ? 'Processing...' : 'Submit Order'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="glass-card">
                <h2 className="mb-6">Recent Orders</h2>
                <OrderList />
            </div>
        </div>
    );
};

const OrderList = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchOrders = async () => {
        try {
            const res = await axios.get('/api/orders');
            setOrders(res.data.items);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        fetchOrders();
        // Poll every 5 seconds to keep list fresh
        const interval = setInterval(fetchOrders, 5000);
        return () => clearInterval(interval);
    }, []);

    const copyId = (id) => {
        navigator.clipboard.writeText(id);
        toast.success('Order ID copied!');
    };

    if (loading) return <div className="p-4 text-center text-[hsl(var(--text-muted))]">Loading orders...</div>;

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="text-[hsl(var(--text-muted))] border-b border-white/10 text-xs uppercase tracking-wider">
                        <th className="py-3 px-4">Order ID</th>
                        <th className="py-3 px-4">Customer</th>
                        <th className="py-3 px-4">Total</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Date</th>
                    </tr>
                </thead>
                <tbody className="text-sm">
                    {orders.map(order => (
                        <tr key={order.id} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                            <td className="py-3 px-4 font-mono text-xs">
                                <button
                                    onClick={() => copyId(order.id)}
                                    className="hover:text-[hsl(var(--accent))] hover:underline flex items-center gap-2"
                                    title="Click to copy"
                                >
                                    {order.id.substring(0, 8)}...
                                </button>
                            </td>
                            <td className="py-3 px-4">{order.customer_email}</td>
                            <td className="py-3 px-4">
                                {(order.total_cents / 100).toLocaleString('en-US', { style: 'currency', currency: order.currency })}
                            </td>
                            <td className="py-3 px-4">
                                <span className={`px-2 py-1 rounded text-xs ${order.status === 'PAID' ? 'bg-green-500/10 text-green-400' :
                                    order.status === 'CANCELLED' ? 'bg-red-500/10 text-red-400' :
                                        'bg-blue-500/10 text-blue-400'
                                    }`}>
                                    {order.status}
                                </span>
                            </td>
                            <td className="py-3 px-4 text-[hsl(var(--text-muted))]">
                                {new Date(order.created_at).toLocaleDateString()}
                            </td>
                        </tr>
                    ))}
                    {orders.length === 0 && (
                        <tr>
                            <td colSpan="5" className="py-8 text-center text-[hsl(var(--text-muted))]">
                                No orders found.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default OrdersPage;
