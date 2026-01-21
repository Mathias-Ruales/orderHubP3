import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';

const BillingPage = () => {
    const [webhookData, setWebhookData] = useState({
        orderId: '',
        paymentStatus: 'CONFIRMED',
        signature: 'dev_secret'
    });

    const [invoiceOrderId, setInvoiceOrderId] = useState('');
    const [generatedInvoice, setGeneratedInvoice] = useState(null);
    const [existingInvoices, setExistingInvoices] = useState([]);

    const handleWebhook = async (status) => {
        try {
            await axios.post('/api/payments/webhook', { ...webhookData, paymentStatus: status });
            toast.success(status === 'CONFIRMED' ? 'Payment confirmed!' : 'Order cancelled!');
        } catch (err) {
            toast.error('Webhook failed.');
        }
    };

    const fetchInvoices = async (orderId) => {
        if (!orderId) return;
        try {
            const res = await axios.get(`/api/billing/invoices/${orderId}`);
            setExistingInvoices(res.data.invoices || []);
        } catch (err) {
            console.error(err);
        }
    };

    const generateInvoice = async (e) => {
        e.preventDefault();
        try {
            const res = await axios.post(`/api/billing/generate/${invoiceOrderId}`);
            const { pdfUrl, invoiceId } = res.data;
            setGeneratedInvoice({ url: pdfUrl, id: invoiceId });
            toast.success('Invoice generated!');
            fetchInvoices(invoiceOrderId);
        } catch (err) {
            console.error(err);
            toast.error('Failed to trigger invoice generation.');
        }
    };

    // Auto-fetch invoices when order ID allows (optional, maybe better on button click or blur)
    // For now, we'll just verify manually or add a "Load Invoices" button if needed.
    // Let's add a small effect to load if valid UUID length? 
    // Or just simple button to "Check Invoices"

    return (
        <div className="space-y-8">
            <div>
                <h1>Billing & Payments</h1>
                <p className="text-[hsl(var(--text-muted))]">Simulate payments and manage invoices.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Payment Webhook Simulator */}
                <div className="glass-card">
                    <h2 className="mb-4 text-lg">Pay order</h2>
                    <div className="space-y-6">
                        <div>
                            <label>Order ID</label>
                            <input
                                required
                                value={webhookData.orderId}
                                onChange={e => setWebhookData({ ...webhookData, orderId: e.target.value })}
                                placeholder="UUID"
                            />
                        </div>

                        <div className="flex gap-2 mt-2">
                            <button
                                type="button"
                                onClick={() => handleWebhook('CONFIRMED')}
                                className="btn-primary flex-1"
                            >
                                Pay
                            </button>
                            <button
                                type="button"
                                onClick={() => handleWebhook('FAILED')}
                                className="btn-secondary flex-1"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>

                {/* Invoice Generator */}
                <div className="glass-card">
                    <h2 className="mb-4 text-lg">Generate Invoice</h2>
                    <form onSubmit={generateInvoice} className="space-y-6">
                        <div>
                            <label>Order ID</label>
                            <div className="flex gap-4">
                                <input
                                    required
                                    value={invoiceOrderId}
                                    onChange={e => setInvoiceOrderId(e.target.value)}
                                    placeholder="UUID"
                                    className="flex-1"
                                />
                            </div>
                        </div>
                        <button type="submit" className="btn-primary w-full mt-2">
                            Generate Invoice
                        </button>

                        {generatedInvoice && (
                            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-sm text-green-400">
                                <p className="mb-2">Invoice Generated Successfully!</p>
                                <a
                                    href={generatedInvoice.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn-link"
                                >
                                    Download Invoice ({generatedInvoice.id.substring(0, 8)}...)
                                </a>
                            </div>
                        )}

                        {existingInvoices.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-white/10">
                                <h3 className="text-sm font-medium mb-2 text-[hsl(var(--text-muted))]">Existing Invoices</h3>
                                <ul className="space-y-2">
                                    {existingInvoices.map(inv => (
                                        <li key={inv.id} className="text-xs flex justify-between items-center bg-white/5 p-2 rounded">
                                            <span>{new Date(inv.created_at).toLocaleString()}</span>
                                            {inv.pdf_object_key && (
                                                <a
                                                    href={`http://localhost:9000/invoices/${inv.pdf_object_key}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="btn-link"
                                                >
                                                    Download
                                                </a>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}


                    </form>
                </div>
            </div>
        </div>
    );
};

export default BillingPage;
