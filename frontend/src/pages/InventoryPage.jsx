import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';

const InventoryPage = () => {
    const [products, setProducts] = useState([]);
    const [showCreate, setShowCreate] = useState(false);
    const [formData, setFormData] = useState({
        sku: '',
        name: '',
        price_dollars: '',
        initial_qty: ''
    });
    const [loading, setLoading] = useState(false);

    const fetchProducts = async () => {
        try {
            const res = await axios.get('/api/inventory/products');
            setProducts(res.data.items);
        } catch (err) {
            console.error(err);
            toast.error('Failed to load products');
        }
    };

    React.useEffect(() => {
        fetchProducts();
    }, []);

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this product?')) return;
        try {
            await axios.delete(`/api/inventory/products/${id}`);
            toast.success('Product deleted');
            fetchProducts();
        } catch (err) {
            console.error(err);
            toast.error('Failed to delete product');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const payload = {
                sku: formData.sku,
                name: formData.name,
                price_cents: Math.round(parseFloat(formData.price_dollars) * 100),
                initial_qty: parseInt(formData.initial_qty)
            };

            await axios.post('/api/inventory/products', payload);
            toast.success('Product created successfully!');
            setFormData({ sku: '', name: '', price_dollars: '', initial_qty: '' });
            setShowCreate(false);
            fetchProducts();
        } catch (err) {
            console.error('Full error object:', err);
            const errorMessage = err.response?.data?.message || err.message || 'Failed to create product';
            toast.error(`Error: ${errorMessage}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <div className="mb-8 flex justify-between items-end">
                <div>
                    <h1>Inventory Management</h1>
                    <p className="text-[hsl(var(--text-muted))]">Manage your product catalog and stock levels.</p>
                </div>
                <button
                    className="btn-primary"
                    onClick={() => setShowCreate(!showCreate)}
                >
                    {showCreate ? 'Cancel' : 'Create New Product'}
                </button>
            </div>

            {showCreate && (
                <div className="glass-card max-w-2xl mb-8">
                    <h2 className="mb-6">Create New Product</h2>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label>SKU</label>
                                <input
                                    required
                                    value={formData.sku}
                                    onChange={e => setFormData({ ...formData, sku: e.target.value })}
                                    placeholder="PROD-001"
                                />
                            </div>
                            <div>
                                <label>Product Name</label>
                                <input
                                    required
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Wireless Headphones"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label>Price (USD)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    required
                                    value={formData.price_dollars}
                                    onChange={e => setFormData({ ...formData, price_dollars: e.target.value })}
                                    placeholder="19.99"
                                />
                            </div>
                            <div>
                                <label>Initial Quantity</label>
                                <input
                                    type="number"
                                    required
                                    value={formData.initial_qty}
                                    onChange={e => setFormData({ ...formData, initial_qty: e.target.value })}
                                    placeholder="100"
                                />
                            </div>
                        </div>

                        <div className="pt-4">
                            <button type="submit" className="btn-primary w-full" disabled={loading}>
                                {loading ? 'Creating...' : 'Create Product'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="glass-card">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="text-[hsl(var(--text-muted))] border-b border-white/10">
                            <th className="py-3 px-4">SKU</th>
                            <th className="py-3 px-4">Name</th>
                            <th className="py-3 px-4">Price</th>
                            <th className="py-3 px-4">Stock</th>
                            <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {products.map(product => (
                            <tr key={product.id} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                                <td className="py-3 px-4 font-mono text-sm">{product.sku}</td>
                                <td className="py-3 px-4">{product.name}</td>
                                <td className="py-3 px-4">${(product.price_cents / 100).toFixed(2)}</td>
                                <td className="py-3 px-4">{product.available_qty}</td>
                                <td className="py-3 px-4 text-right">
                                    <button
                                        onClick={() => handleDelete(product.id)}
                                        className="btn-danger btn-sm"
                                    >
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {products.length === 0 && (
                            <tr>
                                <td colSpan="5" className="py-8 text-center text-[hsl(var(--text-muted))]">
                                    No products found. Create one to get started.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default InventoryPage;
